-- BookOurSpace — Home & Local Services booking lifecycle.
-- Additive only. Existing listings, profiles and RLS helpers are reused.
-- Money is never marked settled by a customer or provider claim; only an
-- active admin can approve a settlement, and the booking keeps an audit trail.

-- ---------------------------------------------------------------------------
-- 1. Provider registration detail requested by the Services module.
--    Nullable so the existing registration rows keep working.
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_registration_requests
  ADD COLUMN IF NOT EXISTS provider_kind TEXT,
  ADD COLUMN IF NOT EXISTS service_categories TEXT[],
  ADD COLUMN IF NOT EXISTS skills TEXT[],
  ADD COLUMN IF NOT EXISTS experience_years INTEGER,
  ADD COLUMN IF NOT EXISTS service_area TEXT,
  ADD COLUMN IF NOT EXISTS pricing_note TEXT,
  ADD COLUMN IF NOT EXISTS availability JSONB;

UPDATE public.provider_registration_requests
   SET provider_kind = COALESCE(provider_kind, 'individual')
 WHERE provider_kind IS NULL;

UPDATE public.provider_registration_requests
   SET availability = COALESCE(availability, '{}'::jsonb)
 WHERE availability IS NULL;

ALTER TABLE public.provider_registration_requests
  DROP CONSTRAINT IF EXISTS provider_registration_kind_check;
ALTER TABLE public.provider_registration_requests
  ADD CONSTRAINT provider_registration_kind_check
  CHECK (provider_kind IS NULL OR provider_kind IN ('individual', 'business'));

ALTER TABLE public.provider_registration_requests
  DROP CONSTRAINT IF EXISTS provider_registration_experience_check;
ALTER TABLE public.provider_registration_requests
  ADD CONSTRAINT provider_registration_experience_check
  CHECK (experience_years IS NULL OR (experience_years >= 0 AND experience_years <= 70));

-- ---------------------------------------------------------------------------
-- 2. Service bookings.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref TEXT NOT NULL UNIQUE DEFAULT ('BOS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  idempotency_key UUID NOT NULL,
  listing_id TEXT NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category_id TEXT NOT NULL,
  subcategory TEXT NOT NULL DEFAULT '',
  scheduled_date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  service_address TEXT NOT NULL,
  address_notes TEXT,
  customer_phone TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected')),
  payment_mode TEXT NOT NULL
    CHECK (payment_mode IN ('pay_after_service', 'upi_qr', 'upi_intent', 'razorpay')),
  payment_status TEXT NOT NULL DEFAULT 'due'
    CHECK (payment_status IN ('due', 'declared', 'settled', 'refunded', 'failed', 'waived')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  amount_basis TEXT NOT NULL DEFAULT 'listing_price',
  cancellation_reason TEXT,
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_bookings_customer_idempotency UNIQUE (customer_id, idempotency_key),
  CONSTRAINT service_bookings_slot_fields CHECK (length(trim(time_slot)) BETWEEN 1 AND 60),
  CONSTRAINT service_bookings_address_length CHECK (length(trim(service_address)) BETWEEN 5 AND 500),
  CONSTRAINT service_bookings_phone_length CHECK (length(trim(customer_phone)) BETWEEN 7 AND 24),
  CONSTRAINT service_bookings_notes_length CHECK (notes IS NULL OR length(notes) <= 2000)
);

-- One provider cannot be booked twice for the same date and slot while a
-- booking is still live. Terminal rows free the slot again.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_booking_active_slot
  ON public.service_bookings (provider_id, scheduled_date, time_slot)
  WHERE status IN ('requested', 'accepted', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_service_bookings_customer
  ON public.service_bookings (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_bookings_provider
  ON public.service_bookings (provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_bookings_status_queue
  ON public.service_bookings (status, scheduled_date, id);
CREATE INDEX IF NOT EXISTS idx_service_bookings_listing
  ON public.service_bookings (listing_id);

ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_bookings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.service_bookings TO authenticated;

DROP POLICY IF EXISTS "Booking parties and admins read service bookings" ON public.service_bookings;
CREATE POLICY "Booking parties and admins read service bookings"
  ON public.service_bookings FOR SELECT TO authenticated
  USING (
    customer_id = (SELECT auth.uid())
    OR provider_id = (SELECT auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Customers request a service booking" ON public.service_bookings;
CREATE POLICY "Customers request a service booking"
  ON public.service_bookings FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = (SELECT auth.uid())
    AND status = 'requested'
    AND payment_status = 'due'
    AND public.is_active_user()
    AND EXISTS (
      SELECT 1
        FROM public.listings l
       WHERE l.id = service_bookings.listing_id
         AND l.owner_id = service_bookings.provider_id
         AND l.status = 'active'
         AND lower(l.entity_type) = 'service'
    )
  );

DROP POLICY IF EXISTS "Booking parties and admins update service bookings" ON public.service_bookings;
CREATE POLICY "Booking parties and admins update service bookings"
  ON public.service_bookings FOR UPDATE TO authenticated
  USING (
    (customer_id = (SELECT auth.uid()) OR provider_id = (SELECT auth.uid()) OR public.is_admin())
    AND public.is_active_user()
  )
  WITH CHECK (
    (customer_id = (SELECT auth.uid()) OR provider_id = (SELECT auth.uid()) OR public.is_admin())
    AND public.is_active_user()
  );

-- ---------------------------------------------------------------------------
-- 3. Transition and immutability guard.
--    Superuser/test seeding (auth.uid() is null) is left to the harness; real
--    authenticated traffic is constrained to the declared state graph.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_service_booking_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  actor_role TEXT;
  allowed BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.role INTO actor_role FROM public.profiles p WHERE p.id = auth.uid();

  IF NEW.booking_ref <> OLD.booking_ref
     OR NEW.listing_id <> OLD.listing_id
     OR NEW.customer_id <> OLD.customer_id
     OR NEW.provider_id <> OLD.provider_id
     OR NEW.category_id <> OLD.category_id
     OR NEW.amount <> OLD.amount
     OR NEW.currency <> OLD.currency
     OR NEW.payment_mode <> OLD.payment_mode
     OR NEW.idempotency_key <> OLD.idempotency_key THEN
    RAISE EXCEPTION 'SERVICE_BOOKING_IMMUTABLE_FIELDS' USING ERRCODE = '42501';
  END IF;

  IF NEW.scheduled_date <> OLD.scheduled_date OR NEW.time_slot <> OLD.time_slot THEN
    IF OLD.status NOT IN ('requested', 'accepted') THEN
      RAISE EXCEPTION 'SERVICE_BOOKING_RESCHEDULE_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    IF actor_role NOT IN ('provider', 'admin') THEN
      RAISE EXCEPTION 'SERVICE_BOOKING_RESCHEDULE_PROVIDER_ONLY' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status <> OLD.status THEN
    allowed := CASE OLD.status
      WHEN 'requested' THEN NEW.status IN ('accepted', 'rejected', 'cancelled')
      WHEN 'accepted' THEN NEW.status IN ('in_progress', 'cancelled')
      WHEN 'in_progress' THEN NEW.status IN ('completed', 'cancelled')
      ELSE FALSE
    END;
    IF NOT allowed THEN
      RAISE EXCEPTION 'SERVICE_BOOKING_INVALID_TRANSITION' USING ERRCODE = '42501';
    END IF;

    IF actor_role = 'customer' AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'SERVICE_BOOKING_CUSTOMER_TRANSITION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF actor_role = 'provider' AND NEW.status NOT IN ('accepted', 'rejected', 'in_progress', 'completed', 'cancelled') THEN
      RAISE EXCEPTION 'SERVICE_BOOKING_PROVIDER_TRANSITION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF actor_role = 'provider' AND NEW.status = 'cancelled' AND OLD.status = 'in_progress' THEN
      RAISE EXCEPTION 'SERVICE_BOOKING_PROVIDER_CANNOT_CANCEL_STARTED_JOB' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.payment_status = 'settled' AND OLD.payment_status <> 'settled' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_SETTLEMENT_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_bookings_guard ON public.service_bookings;
CREATE TRIGGER service_bookings_guard
  BEFORE UPDATE ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_service_booking_guard();

-- ---------------------------------------------------------------------------
-- 4. Append-only booking event trail.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('customer', 'provider', 'admin', 'system')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_booking_events_booking
  ON public.service_booking_events (booking_id, created_at, id);

ALTER TABLE public.service_booking_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_booking_events FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.service_booking_events TO authenticated;

DROP POLICY IF EXISTS "Booking parties read service booking events" ON public.service_booking_events;
CREATE POLICY "Booking parties read service booking events"
  ON public.service_booking_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_bookings b
       WHERE b.id = service_booking_events.booking_id
         AND (b.customer_id = (SELECT auth.uid()) OR b.provider_id = (SELECT auth.uid()) OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "Booking parties append service booking events" ON public.service_booking_events;
CREATE POLICY "Booking parties append service booking events"
  ON public.service_booking_events FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.service_bookings b
       WHERE b.id = service_booking_events.booking_id
         AND (b.customer_id = (SELECT auth.uid()) OR b.provider_id = (SELECT auth.uid()) OR public.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Payment claims. Cash/UPI collection is recorded as a claim, then settled
--    only by an active Admin with a written audit reason.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_payment_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  claimed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'razorpay')),
  reference TEXT,
  evidence_note TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_payment_claim_evidence CHECK (length(trim(evidence_note)) BETWEEN 5 AND 1000),
  CONSTRAINT service_payment_claim_reference CHECK (reference IS NULL OR length(trim(reference)) BETWEEN 3 AND 120),
  CONSTRAINT service_payment_claim_review CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_service_payment_claim_pending
  ON public.service_payment_claims (booking_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_service_payment_claims_queue
  ON public.service_payment_claims (status, created_at, id);

ALTER TABLE public.service_payment_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_payment_claims FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.service_payment_claims TO authenticated;

DROP POLICY IF EXISTS "Booking parties and admins read payment claims" ON public.service_payment_claims;
CREATE POLICY "Booking parties and admins read payment claims"
  ON public.service_payment_claims FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR claimed_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.service_bookings b
       WHERE b.id = service_payment_claims.booking_id AND b.customer_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Providers claim payment for their completed booking" ON public.service_payment_claims;
CREATE POLICY "Providers claim payment for their completed booking"
  ON public.service_payment_claims FOR INSERT TO authenticated
  WITH CHECK (
    claimed_by = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.service_bookings b
       WHERE b.id = service_payment_claims.booking_id
         AND b.provider_id = (SELECT auth.uid())
         AND b.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "Admins review payment claims" ON public.service_payment_claims;
CREATE POLICY "Admins review payment claims"
  ON public.service_payment_claims FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Reviews tied to a completed booking. One review per booking.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_review_comment_length CHECK (comment IS NULL OR length(comment) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_service_reviews_listing
  ON public.service_reviews (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_reviews_provider
  ON public.service_reviews (provider_id, created_at DESC);

ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_reviews FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.service_reviews TO authenticated;
GRANT SELECT ON public.service_reviews TO anon;

DROP POLICY IF EXISTS "Published service reviews are public" ON public.service_reviews;
CREATE POLICY "Published service reviews are public"
  ON public.service_reviews FOR SELECT TO anon, authenticated
  USING (is_published OR customer_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Customers review their completed booking once" ON public.service_reviews;
CREATE POLICY "Customers review their completed booking once"
  ON public.service_reviews FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = (SELECT auth.uid())
    AND is_published = TRUE
    AND public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.service_bookings b
       WHERE b.id = service_reviews.booking_id
         AND b.customer_id = (SELECT auth.uid())
         AND b.provider_id = service_reviews.provider_id
         AND b.listing_id = service_reviews.listing_id
         AND b.status = 'completed'
    )
  );
