-- Classes & Training: batches, calendar metadata, transactional seat inventory,
-- enrollment, waitlist, cancellation/refund policy and RLS.
--
-- Money rules enforced here, not in the browser:
--   * the enrollment fee is always derived from the batch row for the chosen
--     delivery mode; a client-supplied amount is never read;
--   * a paid enrollment can never be created by this migration — an 'online'
--     payment mode is rejected until a server-verified provider settlement
--     exists, so no paid status can be fabricated;
--   * 'pay_at_institute' records an explicit obligation, not a payment.
--
-- Seat counting is serialized by a row lock on the batch, so two concurrent
-- students cannot take the last seat.

CREATE TABLE IF NOT EXISTS public.class_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id TEXT NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('online', 'offline', 'hybrid', 'recorded')),
  fee_unit TEXT NOT NULL DEFAULT 'course'
    CHECK (fee_unit IN ('hour', 'session', 'month', 'subject', 'batch', 'course', 'installment')),
  online_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (online_fee >= 0),
  offline_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (offline_fee >= 0),
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 100000),
  waitlist_capacity INTEGER NOT NULL DEFAULT 0 CHECK (waitlist_capacity BETWEEN 0 AND 100000),
  start_date DATE,
  end_date DATE,
  days_of_week TEXT NOT NULL DEFAULT '' CHECK (length(days_of_week) <= 120),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata' CHECK (length(timezone) BETWEEN 3 AND 64),
  duration_label TEXT NOT NULL DEFAULT '' CHECK (length(duration_label) <= 120),
  area TEXT NOT NULL DEFAULT '' CHECK (length(area) <= 120),
  faculty_name TEXT NOT NULL DEFAULT '' CHECK (length(faculty_name) <= 120),
  faculty_experience TEXT NOT NULL DEFAULT '' CHECK (length(faculty_experience) <= 160),
  holidays JSONB NOT NULL DEFAULT '[]'::jsonb,
  exams JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'active', 'paused', 'rejected', 'archived')),
  review_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CHECK (jsonb_typeof(holidays) = 'array'),
  CHECK (jsonb_typeof(exams) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_class_batches_listing
  ON public.class_batches (listing_id, status, start_date);
CREATE INDEX IF NOT EXISTS idx_class_batches_review_queue
  ON public.class_batches (status, created_at DESC, id);

CREATE TABLE IF NOT EXISTS public.class_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  batch_id UUID NOT NULL REFERENCES public.class_batches(id) ON DELETE RESTRICT,
  listing_id TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('online', 'offline')),
  fee_unit TEXT NOT NULL,
  fee_amount NUMERIC(12, 2) NOT NULL CHECK (fee_amount >= 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('online', 'pay_at_institute', 'free')),
  payment_status TEXT NOT NULL
    CHECK (payment_status IN ('not_required', 'obligation_recorded', 'pending_verification', 'verified')),
  payment_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),
  seat_sequence INTEGER,
  waitlist_position INTEGER,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  refund_percent INTEGER NOT NULL DEFAULT 0 CHECK (refund_percent BETWEEN 0 AND 100),
  refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  refund_policy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, request_id),
  CHECK (
    (status = 'confirmed' AND seat_sequence IS NOT NULL AND waitlist_position IS NULL)
    OR (status = 'waitlisted' AND waitlist_position IS NOT NULL AND seat_sequence IS NULL)
    OR (status = 'cancelled')
  ),
  CHECK (payment_mode <> 'free' OR fee_amount = 0),
  CHECK (payment_mode <> 'free' OR payment_status = 'not_required'),
  CHECK (payment_status <> 'verified' OR payment_reference IS NOT NULL)
);

-- One live enrollment per student per batch. Cancelled rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_class_enrollment_active
  ON public.class_enrollments (batch_id, student_id)
  WHERE status IN ('confirmed', 'waitlisted');
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student
  ON public.class_enrollments (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_listing
  ON public.class_enrollments (listing_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_batch_status
  ON public.class_enrollments (batch_id, status)
  WHERE status IN ('confirmed', 'waitlisted');

ALTER TABLE public.class_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.class_batches FROM PUBLIC, anon;
REVOKE ALL ON public.class_enrollments FROM PUBLIC, anon;
GRANT SELECT ON public.class_batches TO anon, authenticated;
GRANT INSERT, UPDATE ON public.class_batches TO authenticated;
GRANT SELECT ON public.class_enrollments TO authenticated;

DROP POLICY IF EXISTS "Active batches of approved courses are public" ON public.class_batches;
CREATE POLICY "Active batches of approved courses are public"
  ON public.class_batches FOR SELECT
  USING (
    (
      status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.listings l
         WHERE l.id = class_batches.listing_id AND l.status = 'active'
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.listings l
       WHERE l.id = class_batches.listing_id AND l.owner_id = (SELECT auth.uid())
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Providers create pending batches for their own course" ON public.class_batches;
CREATE POLICY "Providers create pending batches for their own course"
  ON public.class_batches FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending_approval'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.listings l
       WHERE l.id = class_batches.listing_id
         AND l.owner_id = (SELECT auth.uid())
         AND l.status IN ('active', 'pending_approval')
         AND l.entity_type = 'course'
    )
  );

-- A provider may edit or pause their own batch, but never publish it: the
-- WITH CHECK keeps status inside the non-public set. Admin publication runs
-- through the SECURITY DEFINER review function below.
DROP POLICY IF EXISTS "Providers maintain their own unpublished batches" ON public.class_batches;
CREATE POLICY "Providers maintain their own unpublished batches"
  ON public.class_batches FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
       WHERE l.id = class_batches.listing_id AND l.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    status IN ('pending_approval', 'paused', 'archived')
    AND (status <> 'pending_approval' OR reviewed_by IS NULL)
    AND EXISTS (
      SELECT 1 FROM public.listings l
       WHERE l.id = class_batches.listing_id AND l.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Students see their own enrollments and trainers theirs" ON public.class_enrollments;
CREATE POLICY "Students see their own enrollments and trainers theirs"
  ON public.class_enrollments FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.listings l
       WHERE l.id = class_enrollments.listing_id AND l.owner_id = (SELECT auth.uid())
    )
    OR public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Availability (public read; used by discovery and the enrollment screen)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.class_batch_availability(p_batch_id UUID)
RETURNS TABLE (
  capacity INTEGER,
  confirmed_count INTEGER,
  waitlist_count INTEGER,
  seats_left INTEGER,
  waitlist_left INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT b.capacity,
         coalesce(c.confirmed_count, 0)::integer,
         coalesce(w.waitlist_count, 0)::integer,
         greatest(b.capacity - coalesce(c.confirmed_count, 0), 0)::integer,
         greatest(b.waitlist_capacity - coalesce(w.waitlist_count, 0), 0)::integer
    FROM public.class_batches b
    LEFT JOIN (
      SELECT batch_id, count(*)::integer AS confirmed_count
        FROM public.class_enrollments WHERE status = 'confirmed' GROUP BY batch_id
    ) c ON c.batch_id = b.id
    LEFT JOIN (
      SELECT batch_id, count(*)::integer AS waitlist_count
        FROM public.class_enrollments WHERE status = 'waitlisted' GROUP BY batch_id
    ) w ON w.batch_id = b.id
   WHERE b.id = p_batch_id;
$$;

-- ---------------------------------------------------------------------------
-- Enrollment. Fee comes from the batch row; capacity is decided under a row
-- lock so the last seat can only go to one student.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.class_enroll(
  p_batch_id UUID,
  p_delivery_mode TEXT,
  p_payment_mode TEXT,
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student UUID := auth.uid();
  v_batch public.class_batches%ROWTYPE;
  v_listing_status TEXT;
  v_availability RECORD;
  v_fee NUMERIC(12, 2);
  v_payment_status TEXT;
  v_existing public.class_enrollments%ROWTYPE;
  v_status TEXT;
  v_seat INTEGER;
  v_waitlist INTEGER;
  v_row public.class_enrollments%ROWTYPE;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'ACTIVE_PROFILE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_delivery_mode NOT IN ('online', 'offline') THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_MODE' USING ERRCODE = 'P0001';
  END IF;
  IF p_payment_mode NOT IN ('online', 'pay_at_institute', 'free') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_MODE' USING ERRCODE = 'P0001';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_REQUEST_ID' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent replay of the same request.
  SELECT * INTO v_existing
    FROM public.class_enrollments
   WHERE student_id = v_student AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.batch_id <> p_batch_id
       OR v_existing.delivery_mode <> p_delivery_mode
       OR v_existing.payment_mode <> p_payment_mode THEN
      RAISE EXCEPTION 'ENROLLMENT_REQUEST_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'enrollment', to_jsonb(v_existing),
      'idempotent', true
    );
  END IF;

  SELECT * INTO v_batch FROM public.class_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_listing_status FROM public.listings WHERE id = v_batch.listing_id;
  IF v_batch.status <> 'active' OR v_listing_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'BATCH_NOT_AVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.class_enrollments
     WHERE batch_id = p_batch_id AND student_id = v_student
       AND status IN ('confirmed', 'waitlisted')
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ENROLLMENT' USING ERRCODE = 'P0001';
  END IF;

  v_fee := CASE p_delivery_mode WHEN 'online' THEN v_batch.online_fee ELSE v_batch.offline_fee END;

  IF p_payment_mode = 'free' AND v_fee > 0 THEN
    RAISE EXCEPTION 'PAYMENT_MODE_PRICE_MISMATCH' USING ERRCODE = 'P0001';
  END IF;
  IF p_payment_mode <> 'free' AND v_fee = 0 THEN
    RAISE EXCEPTION 'FREE_BATCH_REQUIRES_FREE_PAYMENT_MODE' USING ERRCODE = 'P0001';
  END IF;
  -- No paid status is ever minted here. Only a server-verified provider
  -- settlement may later confirm an online payment.
  IF p_payment_mode = 'online' THEN
    RAISE EXCEPTION 'ONLINE_PAYMENT_PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  v_payment_status := CASE p_payment_mode
    WHEN 'pay_at_institute' THEN 'obligation_recorded'
    ELSE 'not_required'
  END;

  SELECT * INTO v_availability FROM public.class_batch_availability(p_batch_id);

  IF v_availability.seats_left > 0 THEN
    v_status := 'confirmed';
    v_seat := v_availability.confirmed_count + 1;
    v_waitlist := NULL;
  ELSIF v_availability.waitlist_left > 0 THEN
    v_status := 'waitlisted';
    v_seat := NULL;
    v_waitlist := v_availability.waitlist_count + 1;
  ELSE
    RAISE EXCEPTION 'BATCH_FULL' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.class_enrollments (
    request_id, batch_id, listing_id, student_id, delivery_mode, fee_unit,
    fee_amount, payment_mode, payment_status, status, seat_sequence, waitlist_position
  ) VALUES (
    p_request_id, p_batch_id, v_batch.listing_id, v_student, p_delivery_mode, v_batch.fee_unit,
    v_fee, p_payment_mode, v_payment_status, v_status, v_seat, v_waitlist
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'enrollment', to_jsonb(v_row),
    'availability', to_jsonb(v_availability),
    'idempotent', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Cancellation. Releases the seat and returns a policy quote. No refund is
-- executed here; a pay-at-institute enrollment has no captured money.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.class_cancel_enrollment(
  p_enrollment_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row public.class_enrollments%ROWTYPE;
  v_batch public.class_batches%ROWTYPE;
  v_owner UUID;
  v_start TIMESTAMPTZ;
  v_hours NUMERIC;
  v_percent INTEGER;
  v_policy TEXT;
  v_refund NUMERIC(12, 2);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.class_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.owner_id INTO v_owner FROM public.listings l WHERE l.id = v_row.listing_id;
  IF v_row.student_id <> v_actor AND v_owner IS DISTINCT FROM v_actor AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'ENROLLMENT_NOT_OWNED_BY_SESSION' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'enrollment', to_jsonb(v_row),
      'alreadyCancelled', true,
      'refundPercent', v_row.refund_percent,
      'refundAmount', v_row.refund_amount,
      'refundPolicy', v_row.refund_policy
    );
  END IF;

  SELECT * INTO v_batch FROM public.class_batches WHERE id = v_row.batch_id;
  v_start := CASE
    WHEN v_batch.start_date IS NULL THEN NULL
    ELSE ((v_batch.start_date + v_batch.start_time) AT TIME ZONE coalesce(v_batch.timezone, 'Asia/Kolkata'))
  END;

  IF v_start IS NULL THEN
    v_hours := NULL;
    v_percent := 100;
    v_policy := 'NO_SCHEDULED_START_FULL_RELEASE';
  ELSE
    v_hours := round((extract(epoch FROM (v_start - now())) / 3600)::numeric, 2);
    IF v_hours >= 48 THEN
      v_percent := 100;
      v_policy := 'FREE_CANCELLATION_48H';
    ELSIF v_hours >= 24 THEN
      v_percent := 75;
      v_policy := 'STANDARD_CANCELLATION_24H';
    ELSIF v_hours > 0 THEN
      v_percent := 50;
      v_policy := 'LATE_CANCELLATION_UNDER_24H';
    ELSE
      v_percent := 0;
      v_policy := 'CANCELLATION_WINDOW_CLOSED';
    END IF;
  END IF;

  -- Only a verified payment can produce a refund amount. A recorded
  -- pay-at-institute obligation releases without money moving.
  IF v_row.payment_status = 'verified' THEN
    v_refund := round(v_row.fee_amount * v_percent / 100, 2);
  ELSE
    v_refund := 0;
  END IF;

  UPDATE public.class_enrollments
     SET status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         refund_percent = v_percent,
         refund_amount = v_refund,
         refund_policy = v_policy,
         seat_sequence = NULL,
         waitlist_position = NULL,
         updated_at = now()
   WHERE id = p_enrollment_id
   RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'enrollment', to_jsonb(v_row),
    'alreadyCancelled', false,
    'hoursUntilStart', v_hours,
    'refundPercent', v_percent,
    'refundAmount', v_refund,
    'refundPolicy', v_policy,
    'paymentSettled', v_row.payment_status = 'verified',
    'note', CASE WHEN v_row.payment_status = 'verified'
      THEN 'Refund quote only. Settlement must be confirmed by the payment provider.'
      ELSE 'No money was captured for this enrollment; the obligation is released.' END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin batch review. Publication is admin-only and requires an active course.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.class_review_batch(
  p_batch_id UUID,
  p_decision TEXT,
  p_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.class_batches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision NOT IN ('active', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_REVIEW_DECISION' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.class_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status = p_decision THEN
    RETURN jsonb_build_object('batch', to_jsonb(v_row), 'idempotent', true);
  END IF;
  IF v_row.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'BATCH_REVIEW_STATE_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision = 'active' AND NOT EXISTS (
    SELECT 1 FROM public.listings l WHERE l.id = v_row.listing_id AND l.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COURSE_NOT_APPROVED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.class_batches
     SET status = p_decision,
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_batch_id
   RETURNING * INTO v_row;

  RETURN jsonb_build_object('batch', to_jsonb(v_row), 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.class_batch_availability(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.class_enroll(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.class_cancel_enrollment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.class_review_batch(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.class_batch_availability(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_enroll(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_cancel_enrollment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_review_batch(UUID, TEXT, TEXT) TO authenticated;
