-- Institute management completion.
--
-- Extends the existing institute workspace without touching marketplace, PG,
-- stays, services, venues or movie schemas. Authorization stays membership
-- based: profiles.role is never rewritten, so a Google customer cannot
-- self-promote. Every write path re-checks institute + branch scope server side
-- and every financial or enrollment transition is transactional.

-- ---------------------------------------------------------------------------
-- 1. Institute profile: contact, operating hours, facilities, admin lifecycle.
-- ---------------------------------------------------------------------------
ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS contact_person TEXT NOT NULL DEFAULT '' CHECK (length(contact_person) <= 160),
  ADD COLUMN IF NOT EXISTS operating_hours JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(operating_hours) = 'object'),
  ADD COLUMN IF NOT EXISTS facilities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(facilities) = 'array'),
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT NOT NULL DEFAULT '' CHECK (length(suspension_reason) <= 500),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- The base table created its own status constraint; replace it (both names are
-- dropped so a re-run on a partially applied database converges).
ALTER TABLE public.institutes DROP CONSTRAINT IF EXISTS institutes_status_check;
ALTER TABLE public.institutes DROP CONSTRAINT IF EXISTS institutes_admin_status_check;
ALTER TABLE public.institutes
  ADD CONSTRAINT institutes_status_check
  CHECK (status IN ('draft', 'published', 'archived', 'suspended'));

-- ---------------------------------------------------------------------------
-- 2. Staff roles: Owner, Manager, Faculty, Accountant, Receptionist.
--    Role names in the database stay stable; the UI labels them.
-- ---------------------------------------------------------------------------
ALTER TABLE public.institute_members DROP CONSTRAINT IF EXISTS institute_members_role_check;
ALTER TABLE public.institute_members DROP CONSTRAINT IF EXISTS institute_members_check;
ALTER TABLE public.institute_members
  ADD CONSTRAINT institute_members_role_check
  CHECK (role IN ('institute_owner', 'manager', 'branch_admin', 'faculty', 'accountant', 'receptionist', 'staff'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.institute_members'::regclass
       AND conname = 'institute_members_branch_scope_check'
  ) THEN
    ALTER TABLE public.institute_members
      ADD CONSTRAINT institute_members_branch_scope_check
      CHECK (role = 'institute_owner' OR branch_id IS NOT NULL OR role IN ('accountant', 'staff'));
  END IF;
END $$;

ALTER TABLE public.institute_members
  ADD COLUMN IF NOT EXISTS invited_email TEXT NOT NULL DEFAULT '' CHECK (length(invited_email) <= 254),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 3. Authorization helper: role permissions + new permission names.
--    SECURITY DEFINER only to avoid recursive RLS on institute_members.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.institute_can_access(
  p_institute_id UUID,
  p_branch_id UUID DEFAULT NULL,
  p_permission TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1
      FROM public.institute_members m
     WHERE m.institute_id = p_institute_id
       AND m.user_id = auth.uid()
       AND m.status = 'active'
       AND (p_branch_id IS NULL OR m.branch_id IS NULL OR m.branch_id = p_branch_id)
       AND (
         p_permission IS NULL
         OR m.role IN ('institute_owner', 'manager', 'branch_admin')
         OR (m.role = 'accountant' AND p_permission IN ('manage_fees', 'read_fees'))
         OR (m.role = 'receptionist' AND p_permission IN ('manage_admissions', 'manage_enquiries', 'manage_students'))
         OR (m.role = 'faculty' AND p_permission IN ('manage_attendance', 'manage_exams'))
         OR m.permissions ? p_permission
       )
  )
  OR EXISTS (
    SELECT 1 FROM public.institutes i
     WHERE i.id = p_institute_id
       AND i.owner_id = auth.uid()
       AND (p_permission IS NULL OR p_permission <> 'admin_only')
  );
$$;

REVOKE ALL ON FUNCTION public.institute_can_access(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_can_access(UUID, UUID, TEXT) TO authenticated;

-- A student may read their own enrollment-derived records without being an
-- institute member. SECURITY DEFINER avoids recursive RLS on enrollments.
CREATE OR REPLACE FUNCTION public.institute_student_owns_enrollment(p_enrollment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments e
     WHERE e.id = p_enrollment_id AND e.student_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.institute_student_owns_enrollment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_student_owns_enrollment(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Branches: classrooms and facilities.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institute_classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.institute_branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 10000),
  facilities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(facilities) = 'array'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, name)
);
CREATE INDEX IF NOT EXISTS idx_institute_classrooms_branch ON public.institute_classrooms (branch_id, status);

ALTER TABLE public.class_batches
  ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.institute_classrooms(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 5. Faculty: subjects, photo and availability.
-- ---------------------------------------------------------------------------
ALTER TABLE public.institute_faculty
  ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '' CHECK (length(photo_url) <= 2000),
  ADD COLUMN IF NOT EXISTS subjects JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(subjects) = 'array'),
  ADD COLUMN IF NOT EXISTS availability JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(availability) = 'array');

-- ---------------------------------------------------------------------------
-- 6. Batches: holidays and a hard schedule-conflict guarantee.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institute_batch_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.class_batches(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 240),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, holiday_date)
);
CREATE INDEX IF NOT EXISTS idx_institute_holidays_batch ON public.institute_batch_holidays (batch_id, holiday_date);

CREATE OR REPLACE FUNCTION public.institute_day_indexes(p_days TEXT)
RETURNS INTEGER[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(DISTINCT day_index ORDER BY day_index), '{}'::integer[])
    FROM (
      SELECT CASE lower(token)
               WHEN 'mon' THEN 1 WHEN 'monday' THEN 1 WHEN '1' THEN 1
               WHEN 'tue' THEN 2 WHEN 'tues' THEN 2 WHEN 'tuesday' THEN 2 WHEN '2' THEN 2
               WHEN 'wed' THEN 3 WHEN 'wednesday' THEN 3 WHEN '3' THEN 3
               WHEN 'thu' THEN 4 WHEN 'thur' THEN 4 WHEN 'thurs' THEN 4 WHEN 'thursday' THEN 4 WHEN '4' THEN 4
               WHEN 'fri' THEN 5 WHEN 'friday' THEN 5 WHEN '5' THEN 5
               WHEN 'sat' THEN 6 WHEN 'saturday' THEN 6 WHEN '6' THEN 6
               WHEN 'sun' THEN 7 WHEN 'sunday' THEN 7 WHEN '7' THEN 7
             END AS day_index
        FROM regexp_split_to_table(coalesce(p_days, ''), '[^A-Za-z0-9]+') AS token
    ) parsed
   WHERE day_index IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.institute_day_indexes(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_day_indexes(TEXT) TO authenticated, anon;

-- Conservative overlap: an unparseable schedule is treated as overlapping so a
-- conflict is never silently allowed.
CREATE OR REPLACE FUNCTION public.institute_days_overlap(p_left TEXT, p_right TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_left INTEGER[] := public.institute_day_indexes(p_left);
  v_right INTEGER[] := public.institute_day_indexes(p_right);
BEGIN
  IF array_length(v_left, 1) IS NULL OR array_length(v_right, 1) IS NULL THEN
    RETURN true;
  END IF;
  RETURN v_left && v_right;
END;
$$;
REVOKE ALL ON FUNCTION public.institute_days_overlap(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_days_overlap(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_batch_conflict(
  p_institute_id UUID,
  p_batch_id UUID,
  p_branch_id UUID,
  p_faculty_id UUID,
  p_classroom_id UUID,
  p_days TEXT,
  p_start TIME,
  p_end TIME,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (batch_id UUID, batch_title TEXT, reason TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id,
         b.title,
         CASE
           WHEN p_classroom_id IS NOT NULL AND b.classroom_id = p_classroom_id THEN 'classroom'
           ELSE 'faculty'
         END AS reason
    FROM public.class_batches b
   WHERE b.institute_id = p_institute_id
     AND b.status IN ('pending_approval', 'active', 'paused')
     AND (p_batch_id IS NULL OR b.id <> p_batch_id)
     AND b.branch_id IS NOT NULL AND b.branch_id = p_branch_id
     AND (
       (p_classroom_id IS NOT NULL AND b.classroom_id = p_classroom_id)
       OR (p_faculty_id IS NOT NULL AND b.faculty_id = p_faculty_id)
     )
     AND b.start_time < p_end AND b.end_time > p_start
     AND public.institute_days_overlap(b.days_of_week, p_days)
     AND coalesce(b.start_date, DATE '1900-01-01') <= coalesce(p_end_date, DATE '9999-12-31')
     AND coalesce(p_start_date, DATE '1900-01-01') <= coalesce(b.end_date, DATE '9999-12-31');
$$;
REVOKE ALL ON FUNCTION public.institute_batch_conflict(UUID, UUID, UUID, UUID, UUID, TEXT, TIME, TIME, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_batch_conflict(UUID, UUID, UUID, UUID, UUID, TEXT, TIME, TIME, DATE, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Audit trail (append-only from definer helpers only).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institute_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT '' CHECK (length(actor_role) <= 40),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 2 AND 80),
  entity TEXT NOT NULL DEFAULT '' CHECK (length(entity) <= 80),
  entity_id TEXT NOT NULL DEFAULT '' CHECK (length(entity_id) <= 120),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_institute_audit_institute ON public.institute_audit_events (institute_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.institute_audit(
  p_institute_id UUID,
  p_action TEXT,
  p_entity TEXT DEFAULT '',
  p_entity_id TEXT DEFAULT '',
  p_detail JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := '';
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT coalesce(m.role, CASE WHEN public.is_admin() THEN 'admin' WHEN i.owner_id = auth.uid() THEN 'institute_owner' END)
    INTO v_role
    FROM public.institutes i
    LEFT JOIN public.institute_members m
      ON m.institute_id = i.id AND m.user_id = auth.uid() AND m.status = 'active'
   WHERE i.id = p_institute_id
   LIMIT 1;
  INSERT INTO public.institute_audit_events (institute_id, actor_id, actor_role, action, entity, entity_id, detail)
  VALUES (p_institute_id, auth.uid(), coalesce(v_role, ''), left(p_action, 80), left(coalesce(p_entity, ''), 80), left(coalesce(p_entity_id, ''), 120), coalesce(p_detail, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.institute_audit(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_audit(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Admissions -> enrollment approval (transactional, capacity safe).
-- ---------------------------------------------------------------------------
ALTER TABLE public.institute_admissions
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrollment_id UUID REFERENCES public.class_enrollments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'offline'
    CHECK (delivery_mode IN ('online', 'offline', 'hybrid'));

CREATE OR REPLACE FUNCTION public.institute_enroll_applicant(
  p_admission_id UUID,
  p_batch_id UUID,
  p_delivery_mode TEXT DEFAULT 'offline',
  p_payment_mode TEXT DEFAULT 'pay_at_institute'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admission public.institute_admissions%ROWTYPE;
  v_batch public.class_batches%ROWTYPE;
  v_availability RECORD;
  v_status TEXT;
  v_seat INTEGER;
  v_waitlist INTEGER;
  v_fee NUMERIC(12, 2);
  v_existing public.class_enrollments%ROWTYPE;
  v_row public.class_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO v_admission FROM public.institute_admissions WHERE id = p_admission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.institute_can_access(v_admission.institute_id, v_admission.branch_id, 'manage_admissions') THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMISSION_PERMISSION' USING ERRCODE = 'P0001';
  END IF;
  IF v_admission.status IN ('rejected') THEN
    RAISE EXCEPTION 'ADMISSION_REJECTED' USING ERRCODE = 'P0001';
  END IF;
  IF v_admission.enrollment_id IS NOT NULL THEN
    RAISE EXCEPTION 'ADMISSION_ALREADY_ENROLLED' USING ERRCODE = 'P0001';
  END IF;
  IF v_admission.student_profile_id IS NULL THEN
    RAISE EXCEPTION 'ADMISSION_STUDENT_PROFILE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_delivery_mode NOT IN ('online', 'offline', 'hybrid') THEN
    RAISE EXCEPTION 'INVALID_DELIVERY_MODE' USING ERRCODE = 'P0001';
  END IF;
  IF p_payment_mode NOT IN ('online', 'pay_at_institute') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_MODE' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize seat allocation per batch before reading availability.
  SELECT * INTO v_batch FROM public.class_batches
   WHERE id = p_batch_id AND institute_id = v_admission.institute_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_batch.status <> 'active' THEN RAISE EXCEPTION 'BATCH_NOT_ACTIVE' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_existing FROM public.class_enrollments
   WHERE batch_id = p_batch_id AND student_id = v_admission.student_profile_id AND status IN ('confirmed', 'waitlisted')
   LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'STUDENT_ALREADY_ENROLLED' USING ERRCODE = 'P0001'; END IF;

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

  -- Fee is derived from the batch row, never from the client.
  v_fee := CASE WHEN p_delivery_mode = 'online' THEN v_batch.online_fee ELSE v_batch.offline_fee END;

  INSERT INTO public.class_enrollments (
    request_id, batch_id, listing_id, student_id, delivery_mode, fee_unit,
    fee_amount, payment_mode, payment_status, status, seat_sequence, waitlist_position
  ) VALUES (
    gen_random_uuid(), p_batch_id, v_batch.listing_id, v_admission.student_profile_id,
    CASE WHEN p_delivery_mode = 'online' THEN 'online' ELSE 'offline' END,
    v_batch.fee_unit, v_fee, p_payment_mode,
    CASE WHEN p_payment_mode = 'online' THEN 'pending_verification' ELSE 'obligation_recorded' END,
    v_status, v_seat, v_waitlist
  ) RETURNING * INTO v_row;

  UPDATE public.institute_admissions
     SET status = 'enrolled', batch_id = p_batch_id, enrollment_id = v_row.id,
         delivery_mode = p_delivery_mode, reviewed_by = auth.uid(), reviewed_at = now(),
         decided_at = now(), updated_at = now()
   WHERE id = p_admission_id;

  PERFORM public.institute_audit(
    v_admission.institute_id, 'admission.enrolled', 'class_enrollment', v_row.id::text,
    jsonb_build_object('admissionId', p_admission_id, 'batchId', p_batch_id, 'status', v_status, 'feeAmount', v_fee)
  );

  RETURN jsonb_build_object('enrollment', to_jsonb(v_row), 'status', v_status, 'feeAmount', v_fee);
END;
$$;
REVOKE ALL ON FUNCTION public.institute_enroll_applicant(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_enroll_applicant(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Student records: batch transfers, leave requests, progress.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institute_batch_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.class_enrollments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_batch_id UUID NOT NULL REFERENCES public.class_batches(id) ON DELETE RESTRICT,
  to_batch_id UUID NOT NULL REFERENCES public.class_batches(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  moved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_institute_transfers_enrollment ON public.institute_batch_transfers (enrollment_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.institute_transfer_enrollment(
  p_enrollment_id UUID,
  p_to_batch_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment public.class_enrollments%ROWTYPE;
  v_from public.class_batches%ROWTYPE;
  v_to public.class_batches%ROWTYPE;
  v_availability RECORD;
  v_status TEXT;
  v_seat INTEGER;
  v_waitlist INTEGER;
  v_fee NUMERIC(12, 2);
BEGIN
  SELECT * INTO v_enrollment FROM public.class_enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_from FROM public.class_batches WHERE id = v_enrollment.batch_id;
  IF v_from.institute_id IS NULL THEN RAISE EXCEPTION 'NOT_AN_INSTITUTE_ENROLLMENT' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.institute_can_access(v_from.institute_id, v_from.branch_id, 'manage_students') THEN
    RAISE EXCEPTION 'FORBIDDEN_STUDENT_PERMISSION' USING ERRCODE = 'P0001';
  END IF;
  IF v_enrollment.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ONLY_CONFIRMED_ENROLLMENTS_CAN_TRANSFER' USING ERRCODE = 'P0001';
  END IF;
  IF p_to_batch_id = v_enrollment.batch_id THEN
    RAISE EXCEPTION 'TRANSFER_TARGET_IS_CURRENT_BATCH' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_to FROM public.class_batches
   WHERE id = p_to_batch_id AND institute_id = v_from.institute_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_to.status <> 'active' THEN RAISE EXCEPTION 'BATCH_NOT_ACTIVE' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_availability FROM public.class_batch_availability(p_to_batch_id);
  IF v_availability.seats_left <= 0 THEN
    RAISE EXCEPTION 'BATCH_FULL' USING ERRCODE = 'P0001';
  END IF;
  v_status := 'confirmed';
  v_seat := v_availability.confirmed_count + 1;
  v_waitlist := NULL;
  v_fee := CASE WHEN v_enrollment.delivery_mode = 'online' THEN v_to.online_fee ELSE v_to.offline_fee END;

  UPDATE public.class_enrollments
     SET batch_id = p_to_batch_id, listing_id = v_to.listing_id, fee_unit = v_to.fee_unit,
         fee_amount = v_fee, seat_sequence = v_seat, waitlist_position = NULL, updated_at = now()
   WHERE id = p_enrollment_id;

  INSERT INTO public.institute_batch_transfers (institute_id, enrollment_id, student_id, from_batch_id, to_batch_id, reason, moved_by)
  VALUES (v_from.institute_id, p_enrollment_id, v_enrollment.student_id, v_enrollment.batch_id, p_to_batch_id, left(coalesce(p_reason, ''), 500), auth.uid());

  PERFORM public.institute_audit(v_from.institute_id, 'student.transferred', 'class_enrollment', p_enrollment_id::text,
    jsonb_build_object('fromBatchId', v_enrollment.batch_id, 'toBatchId', p_to_batch_id, 'feeAmount', v_fee));

  RETURN jsonb_build_object('enrollmentId', p_enrollment_id, 'status', v_status, 'feeAmount', v_fee);
END;
$$;
REVOKE ALL ON FUNCTION public.institute_transfer_enrollment(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_transfer_enrollment(UUID, UUID, TEXT) TO authenticated;

CREATE TABLE IF NOT EXISTS public.institute_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.class_enrollments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT NOT NULL DEFAULT '' CHECK (length(review_note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS idx_institute_leave_institute ON public.institute_leave_requests (institute_id, status, from_date);

CREATE OR REPLACE FUNCTION public.institute_request_leave(
  p_enrollment_id UUID,
  p_from_date DATE,
  p_to_date DATE,
  p_reason TEXT DEFAULT ''
)
RETURNS public.institute_leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment public.class_enrollments%ROWTYPE;
  v_batch public.class_batches%ROWTYPE;
  v_row public.institute_leave_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_enrollment FROM public.class_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_batch FROM public.class_batches WHERE id = v_enrollment.batch_id;
  IF v_batch.institute_id IS NULL THEN RAISE EXCEPTION 'NOT_AN_INSTITUTE_ENROLLMENT' USING ERRCODE = 'P0001'; END IF;
  IF v_enrollment.student_id <> auth.uid() THEN
    RAISE EXCEPTION 'ONLY_THE_STUDENT_CAN_REQUEST_LEAVE' USING ERRCODE = 'P0001';
  END IF;
  IF p_to_date < p_from_date THEN RAISE EXCEPTION 'INVALID_LEAVE_RANGE' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.institute_leave_requests (institute_id, enrollment_id, student_id, from_date, to_date, reason)
  VALUES (v_batch.institute_id, p_enrollment_id, auth.uid(), p_from_date, p_to_date, left(coalesce(p_reason, ''), 1000))
  RETURNING * INTO v_row;

  PERFORM public.institute_audit(v_batch.institute_id, 'leave.requested', 'leave_request', v_row.id::text,
    jsonb_build_object('enrollmentId', p_enrollment_id, 'from', p_from_date, 'to', p_to_date));

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.institute_request_leave(UUID, DATE, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_request_leave(UUID, DATE, DATE, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_review_leave(p_leave_id UUID, p_decision TEXT, p_note TEXT DEFAULT '')
RETURNS public.institute_leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.institute_leave_requests%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_LEAVE_DECISION' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_row FROM public.institute_leave_requests WHERE id = p_leave_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEAVE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.institute_can_access(v_row.institute_id, NULL, 'manage_attendance') THEN
    RAISE EXCEPTION 'FORBIDDEN_LEAVE_PERMISSION' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'LEAVE_ALREADY_REVIEWED' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.institute_leave_requests
     SET status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = left(coalesce(p_note, ''), 500), updated_at = now()
   WHERE id = p_leave_id
   RETURNING * INTO v_row;
  PERFORM public.institute_audit(v_row.institute_id, 'leave.' || p_decision, 'leave_request', v_row.id::text, jsonb_build_object('note', p_note));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.institute_review_leave(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_review_leave(UUID, TEXT, TEXT) TO authenticated;

-- Read model: attendance %, exam average, fee outstanding, certificate state.
CREATE OR REPLACE FUNCTION public.institute_progress_report(p_enrollment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment public.class_enrollments%ROWTYPE;
  v_batch public.class_batches%ROWTYPE;
  v_marked INTEGER := 0;
  v_present INTEGER := 0;
  v_exam_avg NUMERIC;
  v_due NUMERIC := 0;
  v_paid NUMERIC := 0;
  v_certificate TEXT;
BEGIN
  SELECT * INTO v_enrollment FROM public.class_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENROLLMENT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_batch FROM public.class_batches WHERE id = v_enrollment.batch_id;
  IF NOT (v_enrollment.student_id = auth.uid() OR public.institute_can_access(v_batch.institute_id, v_batch.branch_id, 'manage_students')) THEN
    RAISE EXCEPTION 'FORBIDDEN_PROGRESS_ACCESS' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE r.status IN ('present', 'late'))
    INTO v_marked, v_present
    FROM public.institute_attendance_records r
   WHERE r.enrollment_id = p_enrollment_id;

  SELECT round(avg(res.marks / nullif(ex.max_marks, 0) * 100), 2)
    INTO v_exam_avg
    FROM public.institute_exam_results res
    JOIN public.institute_exams ex ON ex.id = res.exam_id
   WHERE res.enrollment_id = p_enrollment_id AND res.marks IS NOT NULL AND ex.max_marks > 0;

  SELECT coalesce(sum(amount) FILTER (WHERE status = 'due'), 0), coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0)
    INTO v_due, v_paid
    FROM public.institute_fee_ledger
   WHERE enrollment_id = p_enrollment_id AND status <> 'void';

  SELECT certificate_no INTO v_certificate FROM public.institute_certificates
   WHERE enrollment_id = p_enrollment_id AND status = 'issued' ORDER BY issued_on DESC LIMIT 1;

  RETURN jsonb_build_object(
    'enrollmentId', p_enrollment_id,
    'batchId', v_enrollment.batch_id,
    'studentId', v_enrollment.student_id,
    'attendancePercent', CASE WHEN v_marked > 0 THEN round(v_present::numeric / v_marked * 100, 2) ELSE NULL END,
    'sessionsMarked', v_marked,
    'examAveragePercent', v_exam_avg,
    'feeDue', v_due,
    'feePaid', v_paid,
    'certificateNo', v_certificate
  );
END;
$$;
REVOKE ALL ON FUNCTION public.institute_progress_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_progress_report(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Fees: installments, discounts, receipts, verification, refunds.
-- ---------------------------------------------------------------------------
ALTER TABLE public.institute_fee_ledger
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'tuition'
    CHECK (kind IN ('tuition', 'installment', 'admission', 'exam', 'material', 'discount', 'refund', 'adjustment')),
  ADD COLUMN IF NOT EXISTS installment_no INTEGER CHECK (installment_no IS NULL OR installment_no > 0),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS receipt_no TEXT CHECK (receipt_no IS NULL OR length(receipt_no) <= 60),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_of UUID REFERENCES public.institute_fee_ledger(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

ALTER TABLE public.institute_fee_ledger DROP CONSTRAINT IF EXISTS institute_fee_ledger_status_check;
ALTER TABLE public.institute_fee_ledger
  ADD CONSTRAINT institute_fee_ledger_status_check
  CHECK (status IN ('due', 'paid', 'waived', 'refunded', 'void'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_institute_fee_receipt
  ON public.institute_fee_ledger (institute_id, receipt_no) WHERE receipt_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.institute_receipt_counters (
  institute_id UUID PRIMARY KEY REFERENCES public.institutes(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

-- Receipt numbers are allocated inside the same transaction as the payment, so
-- a replayed request cannot mint a second number for the same ledger row.
CREATE OR REPLACE FUNCTION public.institute_record_fee_payment(
  p_ledger_id UUID,
  p_payment_method TEXT,
  p_payment_reference TEXT
)
RETURNS public.institute_fee_ledger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.institute_fee_ledger%ROWTYPE;
  v_number INTEGER;
  v_receipt TEXT;
BEGIN
  SELECT * INTO v_row FROM public.institute_fee_ledger WHERE id = p_ledger_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEE_LEDGER_ENTRY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.institute_can_access(v_row.institute_id, v_row.branch_id, 'manage_fees') THEN
    RAISE EXCEPTION 'FORBIDDEN_FEE_PERMISSION' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.status = 'paid' THEN RETURN v_row; END IF;
  IF v_row.status IN ('void', 'refunded') THEN
    RAISE EXCEPTION 'FEE_ENTRY_NOT_PAYABLE' USING ERRCODE = 'P0001';
  END IF;
  IF length(btrim(coalesce(p_payment_method, ''))) < 2 THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.institute_receipt_counters (institute_id, last_number)
  VALUES (v_row.institute_id, 1)
  ON CONFLICT (institute_id) DO UPDATE SET last_number = public.institute_receipt_counters.last_number + 1
  RETURNING last_number INTO v_number;
  v_receipt := 'BOS-INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_number::text, 6, '0');

  UPDATE public.institute_fee_ledger
     SET status = 'paid', payment_method = left(btrim(p_payment_method), 80),
         payment_reference = nullif(left(btrim(coalesce(p_payment_reference, '')), 160), ''),
         paid_at = now(), verified_by = auth.uid(), verified_at = now(),
         receipt_no = coalesce(receipt_no, v_receipt), updated_at = now()
   WHERE id = p_ledger_id
   RETURNING * INTO v_row;

  PERFORM public.institute_audit(v_row.institute_id, 'fee.payment_verified', 'fee_ledger', v_row.id::text,
    jsonb_build_object('amount', v_row.amount, 'receiptNo', v_row.receipt_no));

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.institute_record_fee_payment(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_record_fee_payment(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_refund_fee(
  p_ledger_id UUID,
  p_amount NUMERIC DEFAULT NULL,
  p_reason TEXT DEFAULT ''
)
RETURNS public.institute_fee_ledger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.institute_fee_ledger%ROWTYPE;
  v_refund NUMERIC(12, 2);
BEGIN
  SELECT * INTO v_row FROM public.institute_fee_ledger WHERE id = p_ledger_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEE_LEDGER_ENTRY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.institute_can_access(v_row.institute_id, v_row.branch_id, 'manage_fees') THEN
    RAISE EXCEPTION 'FORBIDDEN_FEE_PERMISSION' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.status <> 'paid' THEN RAISE EXCEPTION 'ONLY_PAID_FEES_CAN_BE_REFUNDED' USING ERRCODE = 'P0001'; END IF;

  v_refund := coalesce(p_amount, v_row.amount);
  IF v_refund <= 0 OR v_refund > v_row.amount THEN
    RAISE EXCEPTION 'INVALID_REFUND_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.institute_fee_ledger
     SET status = 'refunded', refund_of = null, voided_at = now(), updated_at = now(),
         notes = nullif(left(btrim(coalesce(notes, '') || ' | refund: ' || coalesce(p_reason, '')), 1000), '')
   WHERE id = p_ledger_id
   RETURNING * INTO v_row;

  INSERT INTO public.institute_fee_ledger (
    institute_id, branch_id, enrollment_id, student_id, description, amount, due_date,
    status, kind, refund_of, notes
  ) VALUES (
    v_row.institute_id, v_row.branch_id, v_row.enrollment_id, v_row.student_id,
    'Refund: ' || v_row.description, v_refund, current_date, 'refunded', 'refund', p_ledger_id,
    left(coalesce(p_reason, ''), 1000)
  );

  PERFORM public.institute_audit(v_row.institute_id, 'fee.refunded', 'fee_ledger', p_ledger_id::text,
    jsonb_build_object('amount', v_refund, 'reason', p_reason));

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.institute_refund_fee(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_refund_fee(UUID, NUMERIC, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Exams, assignments, results, certificates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institute_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.institute_branches(id) ON DELETE SET NULL,
  batch_id UUID NOT NULL REFERENCES public.class_batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  exam_date DATE,
  max_marks NUMERIC(8, 2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'published', 'cancelled')),
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_institute_exams_batch ON public.institute_exams (batch_id, exam_date DESC);

CREATE TABLE IF NOT EXISTS public.institute_exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.institute_exams(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.class_enrollments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  marks NUMERIC(8, 2) CHECK (marks IS NULL OR marks >= 0),
  grade TEXT NOT NULL DEFAULT '' CHECK (length(grade) <= 8),
  remarks TEXT NOT NULL DEFAULT '' CHECK (length(remarks) <= 1000),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, enrollment_id)
);
CREATE INDEX IF NOT EXISTS idx_institute_results_student ON public.institute_exam_results (student_id, exam_id);

CREATE TABLE IF NOT EXISTS public.institute_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.class_batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  instructions TEXT NOT NULL DEFAULT '' CHECK (length(instructions) <= 4000),
  due_date DATE,
  max_marks NUMERIC(8, 2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institute_assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.institute_assignments(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.class_enrollments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'graded', 'late')),
  marks NUMERIC(8, 2) CHECK (marks IS NULL OR marks >= 0),
  feedback TEXT NOT NULL DEFAULT '' CHECK (length(feedback) <= 2000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, enrollment_id)
);

CREATE TABLE IF NOT EXISTS public.institute_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.class_enrollments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  certificate_no TEXT NOT NULL CHECK (length(certificate_no) BETWEEN 3 AND 60),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  issued_on DATE NOT NULL DEFAULT current_date,
  issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institute_id, certificate_no)
);

-- ---------------------------------------------------------------------------
-- 12. Announcements and student/faculty communication.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institute_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.institute_branches(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES public.class_batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  message TEXT NOT NULL CHECK (length(btrim(message)) BETWEEN 2 AND 4000),
  audience TEXT NOT NULL DEFAULT 'students' CHECK (audience IN ('students', 'faculty', 'staff', 'all')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_institute_announcements_institute ON public.institute_announcements (institute_id, published_at DESC);

-- ---------------------------------------------------------------------------
-- 13. Admin controls: verification, suspension, module entitlements.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institute_module_entitlements (
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN ('admissions', 'attendance', 'fees', 'exams', 'assignments', 'announcements', 'analytics', 'faculty', 'transfer')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (institute_id, module_key)
);

CREATE OR REPLACE FUNCTION public.institute_admin_set_verification(
  p_institute_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT ''
)
RETURNS public.institutes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.institutes%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  IF p_status NOT IN ('unverified', 'pending', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_VERIFICATION_STATUS' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.institutes
     SET verification_status = p_status,
         approved_by = CASE WHEN p_status = 'verified' THEN auth.uid() ELSE approved_by END,
         approved_at = CASE WHEN p_status = 'verified' THEN now() ELSE approved_at END,
         updated_at = now()
   WHERE id = p_institute_id
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSTITUTE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.institute_audit(p_institute_id, 'admin.verification.' || p_status, 'institute', p_institute_id::text, jsonb_build_object('note', p_note));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.institute_admin_set_verification(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_set_verification(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_set_status(
  p_institute_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT ''
)
RETURNS public.institutes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.institutes%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  IF p_status NOT IN ('draft', 'published', 'archived', 'suspended') THEN
    RAISE EXCEPTION 'INVALID_INSTITUTE_STATUS' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.institutes
     SET status = p_status,
         suspension_reason = CASE WHEN p_status = 'suspended' THEN left(coalesce(p_reason, ''), 500) ELSE '' END,
         suspended_at = CASE WHEN p_status = 'suspended' THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = p_institute_id
   RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSTITUTE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.institute_audit(p_institute_id, 'admin.status.' || p_status, 'institute', p_institute_id::text, jsonb_build_object('reason', p_reason));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.institute_admin_set_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_set_status(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_admin_set_entitlement(
  p_institute_id UUID,
  p_module_key TEXT,
  p_enabled BOOLEAN
)
RETURNS public.institute_module_entitlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.institute_module_entitlements%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.institute_module_entitlements (institute_id, module_key, enabled, updated_by)
  VALUES (p_institute_id, p_module_key, coalesce(p_enabled, true), auth.uid())
  ON CONFLICT (institute_id, module_key) DO UPDATE
    SET enabled = excluded.enabled, updated_by = auth.uid(), updated_at = now()
  RETURNING * INTO v_row;
  PERFORM public.institute_audit(p_institute_id, 'admin.entitlement', 'module', p_module_key, jsonb_build_object('enabled', p_enabled));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.institute_admin_set_entitlement(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_admin_set_entitlement(UUID, TEXT, BOOLEAN) TO authenticated;

-- Module entitlements gate institute features. Missing rows mean "enabled" so an
-- existing workspace is not disabled by deploying this migration.
CREATE OR REPLACE FUNCTION public.institute_module_enabled(p_institute_id UUID, p_module_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT enabled FROM public.institute_module_entitlements
                    WHERE institute_id = p_institute_id AND module_key = p_module_key), true);
$$;
REVOKE ALL ON FUNCTION public.institute_module_enabled(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_module_enabled(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. RLS, grants and indexes for the new surfaces.
-- ---------------------------------------------------------------------------
ALTER TABLE public.institute_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_batch_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_batch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_module_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_receipt_counters ENABLE ROW LEVEL SECURITY;

-- The workspace read model aggregates marketplace enquiries and account
-- notifications. RLS stays the row boundary; the role still needs table
-- SELECT to run those queries.
GRANT SELECT ON public.enquiries, public.notifications TO authenticated;

REVOKE ALL ON public.institute_classrooms, public.institute_batch_holidays, public.institute_leave_requests,
  public.institute_batch_transfers, public.institute_exams, public.institute_exam_results,
  public.institute_assignments, public.institute_assignment_submissions, public.institute_certificates,
  public.institute_announcements, public.institute_audit_events, public.institute_module_entitlements,
  public.institute_receipt_counters FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.institute_classrooms, public.institute_batch_holidays,
  public.institute_exams, public.institute_assignments, public.institute_announcements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.institute_leave_requests, public.institute_exam_results,
  public.institute_assignment_submissions, public.institute_certificates, public.institute_batch_transfers TO authenticated;
GRANT SELECT ON public.institute_audit_events, public.institute_module_entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.institute_receipt_counters TO authenticated;

DROP POLICY IF EXISTS institute_classrooms_access ON public.institute_classrooms;
CREATE POLICY institute_classrooms_access ON public.institute_classrooms FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, branch_id, 'manage_branches'))
  WITH CHECK (public.institute_can_access(institute_id, branch_id, 'manage_branches'));

DROP POLICY IF EXISTS institute_holidays_access ON public.institute_batch_holidays;
CREATE POLICY institute_holidays_access ON public.institute_batch_holidays FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, NULL, 'manage_courses')
    OR public.institute_can_access(institute_id, NULL, 'manage_attendance'))
  WITH CHECK (public.institute_can_access(institute_id, NULL, 'manage_courses')
    OR public.institute_can_access(institute_id, NULL, 'manage_attendance'));

DROP POLICY IF EXISTS institute_leave_member ON public.institute_leave_requests;
CREATE POLICY institute_leave_member ON public.institute_leave_requests FOR SELECT TO authenticated
  USING (student_id = auth.uid()
    OR public.institute_student_owns_enrollment(enrollment_id)
    OR public.institute_can_access(institute_id, NULL, 'manage_attendance'));
DROP POLICY IF EXISTS institute_leave_student_insert ON public.institute_leave_requests;
CREATE POLICY institute_leave_student_insert ON public.institute_leave_requests FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND status = 'pending');
DROP POLICY IF EXISTS institute_leave_review ON public.institute_leave_requests;
CREATE POLICY institute_leave_review ON public.institute_leave_requests FOR UPDATE TO authenticated
  USING (public.institute_can_access(institute_id, NULL, 'manage_attendance'))
  WITH CHECK (public.institute_can_access(institute_id, NULL, 'manage_attendance'));

DROP POLICY IF EXISTS institute_transfers_read ON public.institute_batch_transfers;
CREATE POLICY institute_transfers_read ON public.institute_batch_transfers FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.institute_can_access(institute_id, NULL, 'manage_students'));
DROP POLICY IF EXISTS institute_transfers_insert ON public.institute_batch_transfers;
CREATE POLICY institute_transfers_insert ON public.institute_batch_transfers FOR INSERT TO authenticated
  WITH CHECK (public.institute_can_access(institute_id, NULL, 'manage_students'));

DROP POLICY IF EXISTS institute_exams_access ON public.institute_exams;
CREATE POLICY institute_exams_access ON public.institute_exams FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, branch_id, 'manage_exams'))
  WITH CHECK (public.institute_can_access(institute_id, branch_id, 'manage_exams'));
DROP POLICY IF EXISTS institute_exams_student_read ON public.institute_exams;
CREATE POLICY institute_exams_student_read ON public.institute_exams FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.class_enrollments e
     WHERE e.batch_id = institute_exams.batch_id AND e.student_id = auth.uid() AND e.status IN ('confirmed', 'waitlisted')
  ));

DROP POLICY IF EXISTS institute_results_access ON public.institute_exam_results;
CREATE POLICY institute_results_access ON public.institute_exam_results FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, NULL, 'manage_exams'))
  WITH CHECK (public.institute_can_access(institute_id, NULL, 'manage_exams'));
DROP POLICY IF EXISTS institute_results_student_read ON public.institute_exam_results;
CREATE POLICY institute_results_student_read ON public.institute_exam_results FOR SELECT TO authenticated
  USING (student_id = auth.uid() AND published_at IS NOT NULL);

DROP POLICY IF EXISTS institute_assignments_access ON public.institute_assignments;
CREATE POLICY institute_assignments_access ON public.institute_assignments FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, NULL, 'manage_exams'))
  WITH CHECK (public.institute_can_access(institute_id, NULL, 'manage_exams'));
DROP POLICY IF EXISTS institute_assignments_student_read ON public.institute_assignments;
CREATE POLICY institute_assignments_student_read ON public.institute_assignments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.class_enrollments e
     WHERE e.batch_id = institute_assignments.batch_id AND e.student_id = auth.uid() AND e.status = 'confirmed'
  ));

DROP POLICY IF EXISTS institute_submissions_access ON public.institute_assignment_submissions;
CREATE POLICY institute_submissions_access ON public.institute_assignment_submissions FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, NULL, 'manage_exams'))
  WITH CHECK (public.institute_can_access(institute_id, NULL, 'manage_exams'));
DROP POLICY IF EXISTS institute_submissions_student ON public.institute_assignment_submissions;
CREATE POLICY institute_submissions_student ON public.institute_assignment_submissions FOR SELECT TO authenticated
  USING (student_id = auth.uid());
DROP POLICY IF EXISTS institute_submissions_student_upsert ON public.institute_assignment_submissions;
CREATE POLICY institute_submissions_student_upsert ON public.institute_assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND status IN ('pending', 'submitted', 'late'));

DROP POLICY IF EXISTS institute_certificates_access ON public.institute_certificates;
CREATE POLICY institute_certificates_access ON public.institute_certificates FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, NULL, 'manage_students'))
  WITH CHECK (public.institute_can_access(institute_id, NULL, 'manage_students'));
DROP POLICY IF EXISTS institute_certificates_student_read ON public.institute_certificates;
CREATE POLICY institute_certificates_student_read ON public.institute_certificates FOR SELECT TO authenticated
  USING (student_id = auth.uid() AND status = 'issued');

DROP POLICY IF EXISTS institute_announcements_access ON public.institute_announcements;
CREATE POLICY institute_announcements_access ON public.institute_announcements FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, branch_id, 'manage_announcements'))
  WITH CHECK (public.institute_can_access(institute_id, branch_id, 'manage_announcements'));
DROP POLICY IF EXISTS institute_announcements_student_read ON public.institute_announcements;
CREATE POLICY institute_announcements_student_read ON public.institute_announcements FOR SELECT TO authenticated
  USING (audience IN ('students', 'all') AND (
    batch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.class_enrollments e
       WHERE e.batch_id = institute_announcements.batch_id AND e.student_id = auth.uid() AND e.status IN ('confirmed', 'waitlisted')
    )
  ));

DROP POLICY IF EXISTS institute_audit_read ON public.institute_audit_events;
CREATE POLICY institute_audit_read ON public.institute_audit_events FOR SELECT TO authenticated
  USING (public.institute_can_access(institute_id, NULL, 'manage_members'));

DROP POLICY IF EXISTS institute_entitlements_read ON public.institute_module_entitlements;
CREATE POLICY institute_entitlements_read ON public.institute_module_entitlements FOR SELECT TO authenticated
  USING (public.institute_can_access(institute_id));

DROP POLICY IF EXISTS institute_receipt_counters_access ON public.institute_receipt_counters;
CREATE POLICY institute_receipt_counters_access ON public.institute_receipt_counters FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, NULL, 'manage_fees'))
  WITH CHECK (public.institute_can_access(institute_id, NULL, 'manage_fees'));

CREATE INDEX IF NOT EXISTS idx_institute_exam_results_exam ON public.institute_exam_results (exam_id);
CREATE INDEX IF NOT EXISTS idx_institute_certificates_student ON public.institute_certificates (student_id, status);
CREATE INDEX IF NOT EXISTS idx_institute_leavereq_student ON public.institute_leave_requests (student_id, status);

-- ---------------------------------------------------------------------------
-- 15. Member lookup: resolve an existing account by email without exposing the
--     profiles table. The caller must hold manage_members on the institute.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.institute_member_lookup(p_institute_id UUID, p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.institute_can_access(p_institute_id, NULL, 'manage_members') THEN
    RAISE EXCEPTION 'FORBIDDEN_MEMBER_PERMISSION' USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO v_id FROM public.profiles WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.institute_member_lookup(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_member_lookup(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 16. Student-facing reads: an enrolled student must see the real batch timings
--     and the course title for their own enrollment, and nothing else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.institute_student_enrolled_in_batch(p_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments e
     WHERE e.batch_id = p_batch_id AND e.student_id = auth.uid() AND e.status IN ('confirmed', 'waitlisted')
  );
$$;
REVOKE ALL ON FUNCTION public.institute_student_enrolled_in_batch(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_student_enrolled_in_batch(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.institute_student_enrolled_in_listing(p_listing_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments e
     WHERE e.listing_id = p_listing_id AND e.student_id = auth.uid() AND e.status IN ('confirmed', 'waitlisted')
  );
$$;
REVOKE ALL ON FUNCTION public.institute_student_enrolled_in_listing(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_student_enrolled_in_listing(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Students see their enrolled batches" ON public.class_batches;
CREATE POLICY "Students see their enrolled batches" ON public.class_batches FOR SELECT TO authenticated
  USING (public.institute_student_enrolled_in_batch(id));

DROP POLICY IF EXISTS "Students see their enrolled course listing" ON public.listings;
CREATE POLICY "Students see their enrolled course listing" ON public.listings FOR SELECT TO authenticated
  USING (public.institute_student_enrolled_in_listing(id));
