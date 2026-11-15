-- BookOurSpace booking and payment authority migration.
-- Apply only after taking a snapshot and reviewing the duplicate preflight below.
-- This migration is intentionally additive; it does not delete or rewrite rows.

ALTER TABLE public.bookings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_user_id_fkey;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS time_slot TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS show_time TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cinema_screen_id TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS check_in_date DATE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS check_out_date DATE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS total_amount NUMERIC;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pass_code TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refund_amount NUMERIC;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none';

UPDATE public.bookings
SET total_amount = amount
WHERE total_amount IS NULL;

ALTER TABLE public.bookings ALTER COLUMN total_amount SET DEFAULT 0;
ALTER TABLE public.bookings ALTER COLUMN total_amount SET NOT NULL;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('pay_later', 'pending_verification', 'verified', 'failed', 'refund_pending', 'refunded'));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_refund_status_check
  CHECK (refund_status IN ('none', 'pending_manual', 'provider_pending', 'processed', 'failed'));

ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'upi';
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'booking';
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS listing_id TEXT;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS booking_id TEXT;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS provider_order_id TEXT;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS reference_label TEXT;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS manual_approved_by TEXT;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS manual_approved_at TIMESTAMPTZ;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS manual_approval_reason TEXT;
ALTER TABLE public.payment_verifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.payment_verifications DROP CONSTRAINT IF EXISTS payment_verifications_status_check;
UPDATE public.payment_verifications SET status = 'pending_reconciliation'
WHERE status = 'pending_provider_reconciliation';
ALTER TABLE public.payment_verifications ADD CONSTRAINT payment_verifications_status_check
  CHECK (status IN ('created', 'pending_reconciliation', 'verified', 'rejected', 'failed', 'refund_pending', 'refunded'));

CREATE UNIQUE INDEX IF NOT EXISTS payment_verifications_actor_idempotency_uidx
  ON public.payment_verifications(actor_id, idempotency_key)
  WHERE actor_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_verifications_pending_created_idx
  ON public.payment_verifications(created_at)
  WHERE status = 'pending_reconciliation';
CREATE INDEX IF NOT EXISTS payment_verifications_booking_idx
  ON public.payment_verifications(booking_id)
  WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_actor_created_idx
  ON public.bookings(actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_provider_created_idx
  ON public.bookings(provider_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_pass_code_uidx
  ON public.bookings(pass_code) WHERE pass_code IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.booking_availability_locks (
  listing_id TEXT NOT NULL,
  slot_date DATE NOT NULL,
  slot_key TEXT NOT NULL,
  booking_id TEXT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (listing_id, slot_date, slot_key)
);
ALTER TABLE public.booking_availability_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_availability_locks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_availability_locks TO service_role;
CREATE INDEX IF NOT EXISTS booking_availability_locks_booking_idx
  ON public.booking_availability_locks(booking_id);

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES public.bookings(id),
  payment_intent_id TEXT NOT NULL REFERENCES public.payment_verifications(intent_id),
  actor_id TEXT NOT NULL,
  provider_refund_id TEXT UNIQUE,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending_manual'
    CHECK (status IN ('pending_manual', 'provider_pending', 'processed', 'failed')),
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_refunds FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_refunds TO service_role;
CREATE INDEX IF NOT EXISTS payment_refunds_booking_created_idx ON public.payment_refunds(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_reconciliation_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES public.payment_verifications(intent_id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.payment_reconciliation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_reconciliation_audit FROM anon, authenticated;
GRANT SELECT, INSERT ON public.payment_reconciliation_audit TO service_role;

CREATE TABLE IF NOT EXISTS public.payment_refund_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  refund_id TEXT NOT NULL REFERENCES public.payment_refunds(id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.payment_refund_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_refund_audit FROM anon, authenticated;
GRANT SELECT, INSERT ON public.payment_refund_audit TO service_role;

CREATE TABLE IF NOT EXISTS public.payment_provider_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);
ALTER TABLE public.payment_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_provider_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.payment_provider_events TO service_role;
REVOKE ALL ON public.bookings FROM anon, authenticated;
REVOKE ALL ON public.payment_verifications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.payment_verifications TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.bookings';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'seat_locks') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.seat_locks';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payment_verifications') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.payment_verifications';
  END IF;
END $$;

-- Seat ownership/session data is only exposed through authenticated server APIs.
DROP POLICY IF EXISTS "Anyone can view active seat locks" ON public.seat_locks;
DROP POLICY IF EXISTS "Authenticated users can hold own seats" ON public.seat_locks;
DROP POLICY IF EXISTS "Authenticated users can update own seat locks" ON public.seat_locks;
REVOKE ALL ON public.seat_locks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seat_locks TO service_role;

-- Align the existing legacy guard with manual bank reconciliation. A manual
-- approval audit or a signed provider event is the only accepted proof.
CREATE OR REPLACE FUNCTION public.guard_booking_payment_and_customer_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.payment_status NOT IN ('pay_later', 'verified') THEN
    RAISE EXCEPTION 'PAYMENT_VERIFICATION_REQUIRED';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.payment_status = 'verified' AND NOT EXISTS (
    SELECT 1 FROM public.payment_verifications pv
    WHERE pv.intent_id = NEW.payment_intent_id
      AND pv.amount = NEW.total_amount
      AND pv.status = 'verified'
      AND (pv.manual_approved_at IS NOT NULL OR
        (pv.verified_at IS NOT NULL AND pv.payment_provider = 'razorpay' AND pv.provider_payment_id IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'PAYMENT_LEDGER_VERIFICATION_REQUIRED';
  END IF;
  IF TG_OP = 'UPDATE' AND auth.uid() = OLD.user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'CUSTOMER_BOOKING_UPDATE_NOT_ALLOWED';
  END IF;
  RETURN NEW;
END;
$$;

-- Availability locks are the active uniqueness authority. The previous
-- booking-level slot index included movie showtimes and would reject every
-- second customer at the same screening.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    LEFT JOIN public.listings l ON l.id = b.listing_id
    WHERE b.status IN ('confirmed', 'pending_payment')
      AND lower(COALESCE(l.entity_type, '')) NOT LIKE '%movie%'
      AND b.listing_id NOT LIKE 'movie-%'
      AND b.listing_id NOT LIKE 'listing-movie-%'
    GROUP BY b.listing_id, b.scheduled_date, COALESCE(NULLIF(b.time_slot, ''), b.scheduled_time)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'BOOKING_DUPLICATE_SLOT_PREFLIGHT_FAILED';
  END IF;
END $$;

INSERT INTO public.booking_availability_locks(listing_id, slot_date, slot_key, booking_id, actor_id)
SELECT b.listing_id,
       d::date,
       COALESCE(NULLIF(b.time_slot, ''), b.scheduled_time),
       b.id,
       COALESCE(b.actor_id, b.user_id::text, 'legacy')
FROM public.bookings b
LEFT JOIN public.listings l ON l.id = b.listing_id
CROSS JOIN LATERAL generate_series(
  b.scheduled_date::date,
  GREATEST(b.scheduled_date::date + 1, COALESCE(b.check_out_date, b.scheduled_date::date + 1)) - 1,
  INTERVAL '1 day'
) AS d
WHERE b.status IN ('confirmed', 'pending_payment')
  AND lower(COALESCE(l.entity_type, '')) NOT LIKE '%movie%'
  AND b.listing_id NOT LIKE 'movie-%'
  AND b.listing_id NOT LIKE 'listing-movie-%';

CREATE OR REPLACE FUNCTION public.create_booking_transaction(
  p_actor_id TEXT,
  p_booking_id TEXT,
  p_idempotency_key TEXT,
  p_listing_id TEXT,
  p_listing_title TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_address TEXT,
  p_scheduled_date DATE,
  p_check_out_date DATE,
  p_time_slot TEXT,
  p_show_time TEXT,
  p_screen_id TEXT,
  p_total_amount NUMERIC,
  p_payment_intent_id TEXT,
  p_payment_mode TEXT,
  p_seats TEXT[],
  p_session_id TEXT,
  p_pass_code TEXT,
  p_qr_signature TEXT,
  p_qr_pass_token TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.bookings%ROWTYPE;
  v_listing public.listings%ROWTYPE;
  v_payment public.payment_verifications%ROWTYPE;
  v_status TEXT;
  v_seat TEXT;
  v_date DATE;
  v_checkout DATE;
  v_conflicts TEXT[];
BEGIN
  IF NULLIF(trim(p_actor_id), '') IS NULL
    OR NULLIF(trim(p_idempotency_key), '') IS NULL
    OR NULLIF(trim(p_listing_id), '') IS NULL
    OR p_total_amount IS NULL OR p_total_amount < 0
    OR p_scheduled_date IS NULL
    OR NULLIF(trim(p_time_slot), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_BOOKING_INPUT');
  END IF;

  SELECT * INTO v_existing
  FROM public.bookings
  WHERE actor_id = p_actor_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotentReplay', true, 'booking', to_jsonb(v_existing));
  END IF;

  SELECT * INTO v_listing FROM public.listings
  WHERE id = p_listing_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'LISTING_UNAVAILABLE');
  END IF;

  v_status := 'pay_later';
  IF p_payment_mode = 'pay_qr' THEN
    IF NULLIF(p_payment_intent_id, '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_NOT_VERIFIED');
    END IF;
    SELECT * INTO v_payment FROM public.payment_verifications
    WHERE intent_id = p_payment_intent_id
      AND actor_id = p_actor_id
      AND payment_provider IN ('upi', 'razorpay')
      AND purpose = 'booking'
      AND listing_id = p_listing_id
      AND status = 'verified'
      AND booking_id IS NULL
      AND amount = p_total_amount
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_NOT_VERIFIED');
    END IF;
    v_status := 'verified';
  ELSIF p_payment_mode IS DISTINCT FROM 'pay_later' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PAYMENT_MODE');
  END IF;

  IF p_check_out_date IS NOT NULL AND p_check_out_date < p_scheduled_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_DATE_RANGE');
  END IF;
  v_checkout := GREATEST(p_scheduled_date + 1, COALESCE(p_check_out_date, p_scheduled_date + 1));
  IF COALESCE(cardinality(p_seats), 0) > 0 AND v_status <> 'verified' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_NOT_VERIFIED');
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      id, user_id, actor_id, idempotency_key, listing_id, listing_title,
      provider_id, customer_name, customer_phone, customer_address,
      scheduled_date, scheduled_time, time_slot, show_time, check_in_date,
      check_out_date, cinema_screen_id, amount, total_amount, status, payment_status,
      payment_intent_id, payment_utr, qr_signature, qr_pass_token, pass_code, expires_at, notes, payload
    ) VALUES (
      p_booking_id, NULL, p_actor_id, p_idempotency_key, p_listing_id,
      p_listing_title, v_listing.owner_id::text, p_customer_name,
      p_customer_phone, p_customer_address, p_scheduled_date::text,
      p_time_slot, p_time_slot, p_show_time, p_scheduled_date,
      v_checkout, NULLIF(p_screen_id, ''), p_total_amount, p_total_amount, 'confirmed', v_status,
      p_payment_intent_id, CASE WHEN v_status = 'verified' THEN v_payment.utr_number ELSE NULL END,
      p_qr_signature, p_qr_pass_token, p_pass_code,
      CASE WHEN NULLIF(p_show_time, '') IS NOT NULL
        THEN p_scheduled_date + p_show_time::time
        ELSE (v_checkout::timestamp AT TIME ZONE 'UTC') END,
      NULLIF(p_notes, ''), '{}'::jsonb
    );

    IF COALESCE(cardinality(p_seats), 0) > 0 THEN
      SELECT array_agg(s.seat_id) INTO v_conflicts
      FROM unnest(p_seats) AS s(seat_id)
      JOIN public.seat_locks l
        ON l.listing_id = p_listing_id
       AND l.show_date = p_scheduled_date::text
       AND l.show_time = COALESCE(NULLIF(p_show_time, ''), p_time_slot)
       AND l.seat_id = upper(s.seat_id)
       AND (l.status = 'booked' OR (l.status = 'held' AND l.expires_at > NOW()
         AND l.session_id <> COALESCE(p_session_id, '')))
      ;
      IF COALESCE(cardinality(v_conflicts), 0) > 0 THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'SEAT_ALREADY_BOOKED';
      END IF;

      FOR v_seat IN
        SELECT DISTINCT upper(seat_id) FROM unnest(p_seats) AS requested(seat_id)
      LOOP
        INSERT INTO public.seat_locks(
          listing_id, show_date, show_time, seat_id, user_id, session_id,
          status, booking_id, expires_at
        ) VALUES (
          p_listing_id, p_scheduled_date::text,
          COALESCE(NULLIF(p_show_time, ''), p_time_slot), v_seat, NULL,
          COALESCE(p_session_id, p_actor_id), 'booked', p_booking_id,
          NOW() + INTERVAL '365 days'
        )
        ON CONFLICT (listing_id, show_date, show_time, seat_id)
        DO UPDATE SET status = 'booked', booking_id = EXCLUDED.booking_id,
          expires_at = EXCLUDED.expires_at
        WHERE public.seat_locks.status = 'held'
          AND public.seat_locks.session_id = COALESCE(p_session_id, p_actor_id);
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'SEAT_ALREADY_BOOKED';
        END IF;
      END LOOP;
    ELSE
      v_date := p_scheduled_date;
      WHILE v_date < v_checkout LOOP
        INSERT INTO public.booking_availability_locks(
          listing_id, slot_date, slot_key, booking_id, actor_id
        ) VALUES (p_listing_id, v_date, p_time_slot, p_booking_id, p_actor_id);
        v_date := v_date + 1;
      END LOOP;
    END IF;

    IF v_status = 'verified' THEN
      UPDATE public.payment_verifications
      SET booking_id = p_booking_id, updated_at = NOW()
      WHERE intent_id = p_payment_intent_id AND actor_id = p_actor_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.bookings
    WHERE actor_id = p_actor_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'idempotentReplay', true, 'booking', to_jsonb(v_existing));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'SLOT_OR_SEAT_UNAVAILABLE');
  END;

  SELECT * INTO v_existing FROM public.bookings WHERE id = p_booking_id;
  RETURN jsonb_build_object('ok', true, 'idempotentReplay', false, 'booking', to_jsonb(v_existing));
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_upi_reconciliation(
  p_intent_id TEXT, p_admin_actor_id TEXT, p_reason TEXT, p_approve BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payment_verifications%ROWTYPE;
BEGIN
  IF NULLIF(trim(p_admin_actor_id), '') IS NULL OR length(trim(COALESCE(p_reason, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ADMIN_REASON_REQUIRED');
  END IF;
  SELECT * INTO v_payment FROM public.payment_verifications
  WHERE intent_id = p_intent_id FOR UPDATE;
  IF NOT FOUND OR v_payment.status <> 'pending_reconciliation' OR v_payment.payment_provider <> 'upi' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RECONCILIATION_NOT_PENDING');
  END IF;

  INSERT INTO public.payment_reconciliation_audit(intent_id, actor_id, action, reason)
  VALUES (p_intent_id, p_admin_actor_id, CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, trim(p_reason));

  UPDATE public.payment_verifications
  SET status = CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END,
      manual_approved_by = CASE WHEN p_approve THEN p_admin_actor_id ELSE NULL END,
      manual_approved_at = CASE WHEN p_approve THEN NOW() ELSE NULL END,
      manual_approval_reason = trim(p_reason),
      verified_at = CASE WHEN p_approve THEN NOW() ELSE NULL END,
      updated_at = NOW()
  WHERE intent_id = p_intent_id;

  IF p_approve AND v_payment.booking_id IS NOT NULL THEN
    UPDATE public.bookings
    SET payment_status = 'verified', payment_utr = v_payment.utr_number
    WHERE id = v_payment.booking_id AND actor_id = v_payment.actor_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking_transaction(
  p_booking_id TEXT, p_actor_id TEXT, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_screen RECORD;
  v_refund NUMERIC := 0;
  v_refund_id TEXT;
  v_payment public.payment_verifications%ROWTYPE;
  v_has_seats BOOLEAN;
  v_payment_provider TEXT;
  v_provider_payment_id TEXT;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id AND actor_id = p_actor_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_CANCELLABLE');
  END IF;
  IF v_booking.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BOOKING_ALREADY_USED');
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.seat_locks WHERE booking_id = p_booking_id) INTO v_has_seats;
  IF v_has_seats THEN
    SELECT cancellation_allowed, cancellation_cutoff_minutes, refund_percent
    INTO v_screen FROM public.cinema_screens
    WHERE id = v_booking.cinema_screen_id OR cinema_listing_id = v_booking.listing_id
    ORDER BY CASE WHEN id = v_booking.cinema_screen_id THEN 0 ELSE 1 END LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CINEMA_POLICY_UNAVAILABLE');
    END IF;
    IF NOT v_screen.cancellation_allowed OR v_booking.show_time IS NULL
      OR (v_booking.scheduled_date::date + v_booking.show_time::time)
        <= NOW() + make_interval(mins => v_screen.cancellation_cutoff_minutes) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CANCELLATION_CUTOFF_PASSED');
    END IF;
    v_refund := round(v_booking.total_amount * v_screen.refund_percent / 100.0, 2);
  END IF;

  UPDATE public.bookings SET status = 'cancelled', cancelled_at = NOW(),
    cancellation_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Customer requested cancellation')
  WHERE id = p_booking_id;
  DELETE FROM public.booking_availability_locks WHERE booking_id = p_booking_id;
  DELETE FROM public.seat_locks WHERE booking_id = p_booking_id;

  IF v_booking.payment_status = 'verified' AND v_booking.payment_intent_id IS NOT NULL THEN
    SELECT * INTO v_payment FROM public.payment_verifications
    WHERE intent_id = v_booking.payment_intent_id FOR UPDATE;
    IF FOUND THEN
      v_payment_provider := v_payment.payment_provider;
      v_provider_payment_id := v_payment.provider_payment_id;
      v_refund_id := 'RFD-' || replace(gen_random_uuid()::text, '-', '');
      INSERT INTO public.payment_refunds(
        id, booking_id, payment_intent_id, actor_id, amount, status, reason, idempotency_key
      ) VALUES (
        v_refund_id, p_booking_id, v_booking.payment_intent_id, p_actor_id,
        v_refund, CASE WHEN v_payment.payment_provider = 'razorpay' THEN 'provider_pending' ELSE 'pending_manual' END,
        COALESCE(NULLIF(trim(p_reason), ''), 'Customer requested cancellation'), 'cancel:' || p_booking_id
      ) ON CONFLICT (idempotency_key) DO NOTHING;
      UPDATE public.bookings SET refund_amount = v_refund,
        refund_status = CASE WHEN v_payment.payment_provider = 'razorpay' THEN 'provider_pending' ELSE 'pending_manual' END,
        payment_status = 'refund_pending'
      WHERE id = p_booking_id;
      UPDATE public.payment_verifications SET status = 'refund_pending'
      WHERE intent_id = v_booking.payment_intent_id;
    END IF;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  RETURN jsonb_build_object(
    'ok', true, 'booking', to_jsonb(v_booking), 'refundAmount', v_refund,
    'refundId', v_refund_id, 'paymentProvider', v_payment_provider,
    'providerPaymentId', v_provider_payment_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_razorpay_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload_sha256 TEXT,
  p_order_id TEXT,
  p_amount_paise BIGINT,
  p_provider_payment_id TEXT,
  p_provider_refund_id TEXT,
  p_actor_hint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payment_verifications%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_count INTEGER;
BEGIN
  IF NULLIF(p_event_id, '') IS NULL OR NULLIF(p_event_type, '') IS NULL
    OR NULLIF(p_payload_sha256, '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PROVIDER_EVENT');
  END IF;

  INSERT INTO public.payment_provider_events(provider, event_id, event_type, payload_sha256)
  VALUES ('razorpay', p_event_id, p_event_type, p_payload_sha256)
  ON CONFLICT (provider, event_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  IF p_event_type = 'payment.captured' THEN
    SELECT * INTO v_payment FROM public.payment_verifications
    WHERE provider_order_id = p_order_id AND payment_provider = 'razorpay'
    FOR UPDATE;
    IF NOT FOUND OR round(v_payment.amount * 100)::BIGINT <> p_amount_paise THEN
      RAISE EXCEPTION 'RAZORPAY_ORDER_OR_AMOUNT_MISMATCH';
    END IF;
    IF v_payment.status NOT IN ('created', 'pending_reconciliation') THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'status', v_payment.status);
    END IF;
    UPDATE public.payment_verifications
    SET status = 'verified', provider_payment_id = p_provider_payment_id,
        verified_at = NOW(), updated_at = NOW()
    WHERE intent_id = v_payment.intent_id;
    UPDATE public.bookings
    SET payment_status = 'verified', payment_intent_id = v_payment.intent_id
    WHERE payment_intent_id = v_payment.intent_id AND actor_id = v_payment.actor_id;
    RETURN jsonb_build_object('ok', true, 'status', 'verified');
  ELSIF p_event_type = 'refund.processed' THEN
    SELECT r.* INTO v_refund
    FROM public.payment_refunds r
    JOIN public.payment_verifications p ON p.intent_id = r.payment_intent_id
    WHERE r.provider_refund_id = p_provider_refund_id
      AND p.provider_payment_id = p_provider_payment_id
    FOR UPDATE OF r;
    IF NOT FOUND OR round(v_refund.amount * 100)::BIGINT <> p_amount_paise THEN
      RAISE EXCEPTION 'RAZORPAY_REFUND_OR_AMOUNT_MISMATCH';
    END IF;
    UPDATE public.payment_refunds
    SET status = 'processed', updated_at = NOW(), processed_at = NOW()
    WHERE provider_refund_id = p_provider_refund_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RAZORPAY_REFUND_NOT_FOUND';
    END IF;
    UPDATE public.bookings b
    SET refund_status = 'processed', payment_status = 'refunded'
    FROM public.payment_refunds r WHERE r.provider_refund_id = p_provider_refund_id AND b.id = r.booking_id;
    UPDATE public.payment_verifications p
    SET status = 'refunded', updated_at = NOW()
    FROM public.payment_refunds r
    WHERE r.provider_refund_id = p_provider_refund_id AND p.intent_id = r.payment_intent_id;
    RETURN jsonb_build_object('ok', true, 'status', 'processed');
  ELSIF p_event_type = 'refund.failed' THEN
    SELECT r.* INTO v_refund
    FROM public.payment_refunds r
    JOIN public.payment_verifications p ON p.intent_id = r.payment_intent_id
    WHERE r.provider_refund_id = p_provider_refund_id
      AND p.provider_payment_id = p_provider_payment_id
    FOR UPDATE OF r;
    IF NOT FOUND OR round(v_refund.amount * 100)::BIGINT <> p_amount_paise THEN
      RAISE EXCEPTION 'RAZORPAY_REFUND_OR_AMOUNT_MISMATCH';
    END IF;
    UPDATE public.payment_refunds
    SET status = 'failed', updated_at = NOW()
    WHERE provider_refund_id = p_provider_refund_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RAZORPAY_REFUND_NOT_FOUND';
    END IF;
    UPDATE public.bookings b
    SET refund_status = 'failed', payment_status = 'verified'
    FROM public.payment_refunds r WHERE r.provider_refund_id = p_provider_refund_id AND b.id = r.booking_id;
    UPDATE public.payment_verifications p
    SET status = 'verified', updated_at = NOW()
    FROM public.payment_refunds r
    WHERE r.provider_refund_id = p_provider_refund_id AND p.intent_id = r.payment_intent_id;
    RETURN jsonb_build_object('ok', true, 'status', 'failed');
  END IF;

  RETURN jsonb_build_object('ok', true, 'ignored', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_manual_refund(
  p_refund_id TEXT, p_admin_actor_id TEXT, p_reason TEXT, p_approve BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
BEGIN
  IF NULLIF(trim(p_admin_actor_id), '') IS NULL OR length(trim(COALESCE(p_reason, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ADMIN_REASON_REQUIRED');
  END IF;
  SELECT * INTO v_refund FROM public.payment_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND OR v_refund.status <> 'pending_manual' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MANUAL_REFUND_NOT_PENDING');
  END IF;
  INSERT INTO public.payment_refund_audit(refund_id, actor_id, action, reason)
  VALUES (p_refund_id, p_admin_actor_id, CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, trim(p_reason));
  UPDATE public.payment_refunds SET status = CASE WHEN p_approve THEN 'processed' ELSE 'failed' END,
    processed_at = CASE WHEN p_approve THEN NOW() ELSE NULL END, updated_at = NOW()
  WHERE id = p_refund_id;
  UPDATE public.bookings SET refund_status = CASE WHEN p_approve THEN 'processed' ELSE 'failed' END,
    payment_status = CASE WHEN p_approve THEN 'refunded' ELSE 'failed' END
  WHERE id = v_refund.booking_id AND status = 'cancelled';
  UPDATE public.payment_verifications SET status = CASE WHEN p_approve THEN 'refunded' ELSE 'failed' END,
    updated_at = NOW() WHERE intent_id = v_refund.payment_intent_id;
  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_approve THEN 'processed' ELSE 'failed' END);
END;
$$;

-- Only the backend holding the service-role credential may invoke authority RPCs.
REVOKE ALL ON FUNCTION public.create_booking_transaction(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,DATE,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT[],TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_upi_reconciliation(TEXT,TEXT,TEXT,BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_booking_transaction(TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_razorpay_event(TEXT,TEXT,TEXT,TEXT,BIGINT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_manual_refund(TEXT,TEXT,TEXT,BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_movie_seats_atomic(TEXT,TEXT,TEXT,TEXT[],TEXT,INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_booking_atomic(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT[],TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_transaction(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,DATE,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT,TEXT[],TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_upi_reconciliation(TEXT,TEXT,TEXT,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_transaction(TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_razorpay_event(TEXT,TEXT,TEXT,TEXT,BIGINT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_manual_refund(TEXT,TEXT,TEXT,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.hold_movie_seats_atomic(TEXT,TEXT,TEXT,TEXT[],TEXT,INT) TO service_role;

-- No client-side insert/update may claim a booking is paid or rewrite payment data.
DROP POLICY IF EXISTS "Authenticated users can create their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Providers and admins can update booking status" ON public.bookings;
CREATE POLICY "Bookings are created only by the server transaction" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "Authenticated users can update their own bookings" ON public.bookings;
CREATE POLICY "Bookings are updated only by server transaction" ON public.bookings
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

