-- Institute Owner workspace: branch-scoped operations for training institutes.
--
-- This migration deliberately keeps the existing marketplace and PG schemas
-- intact. Institute roles live in an institute membership table rather than
-- changing profiles.role, so a Google customer account cannot self-promote.

CREATE TABLE IF NOT EXISTS public.institutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  email TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 254),
  phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 32),
  website TEXT NOT NULL DEFAULT '' CHECK (length(website) <= 240),
  city TEXT NOT NULL DEFAULT '' CHECK (length(city) <= 120),
  logo_url TEXT NOT NULL DEFAULT '' CHECK (length(logo_url) <= 2000),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institute_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  address TEXT NOT NULL DEFAULT '' CHECK (length(address) <= 500),
  city TEXT NOT NULL DEFAULT '' CHECK (length(city) <= 120),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata' CHECK (length(timezone) BETWEEN 3 AND 64),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institute_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.institute_branches(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('institute_owner', 'branch_admin', 'faculty', 'staff')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institute_id, user_id),
  CHECK (role = 'institute_owner' OR branch_id IS NOT NULL OR role = 'staff')
);

CREATE TABLE IF NOT EXISTS public.institute_faculty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.institute_branches(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  email TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 254),
  phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 32),
  qualification TEXT NOT NULL DEFAULT '' CHECK (length(qualification) <= 240),
  experience TEXT NOT NULL DEFAULT '' CHECK (length(experience) <= 240),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institute_admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.institute_branches(id) ON DELETE SET NULL,
  course_listing_id TEXT REFERENCES public.listings(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES public.class_batches(id) ON DELETE SET NULL,
  student_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 32),
  email TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 254),
  source TEXT NOT NULL DEFAULT 'direct' CHECK (length(source) <= 80),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'assessment', 'accepted', 'rejected', 'enrolled')),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institute_attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.institute_branches(id) ON DELETE SET NULL,
  batch_id UUID NOT NULL REFERENCES public.class_batches(id) ON DELETE RESTRICT,
  session_date DATE NOT NULL,
  topic TEXT NOT NULL DEFAULT '' CHECK (length(topic) <= 240),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),
  marked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, session_date)
);

CREATE TABLE IF NOT EXISTS public.institute_attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.institute_attendance_sessions(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.class_enrollments(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  marked_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.institute_fee_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.institute_branches(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES public.class_enrollments(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 240),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'due'
    CHECK (status IN ('due', 'paid', 'waived', 'refunded')),
  payment_method TEXT CHECK (payment_method IS NULL OR length(payment_method) <= 80),
  payment_reference TEXT CHECK (payment_reference IS NULL OR length(payment_reference) <= 160),
  paid_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL;
ALTER TABLE public.class_batches ADD COLUMN IF NOT EXISTS institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL;
ALTER TABLE public.class_batches ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.institute_branches(id) ON DELETE SET NULL;
ALTER TABLE public.class_batches ADD COLUMN IF NOT EXISTS faculty_id UUID REFERENCES public.institute_faculty(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_institutes_owner ON public.institutes (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_institute_branches_institute ON public.institute_branches (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_institute_members_user ON public.institute_members (user_id, status);
CREATE INDEX IF NOT EXISTS idx_institute_faculty_institute ON public.institute_faculty (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_institute_admissions_institute ON public.institute_admissions (institute_id, status, follow_up_at);
CREATE INDEX IF NOT EXISTS idx_institute_attendance_sessions_batch ON public.institute_attendance_sessions (batch_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_institute_fee_ledger_institute ON public.institute_fee_ledger (institute_id, status, due_date);

-- Membership is the source of truth for institute authorization. The helper
-- is SECURITY DEFINER only to avoid recursive RLS on institute_members; it
-- still requires a real auth.uid(), active membership, branch scope and the
-- requested permission on every call.
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
         OR m.role IN ('institute_owner', 'branch_admin')
         OR m.permissions ? p_permission
       )
  )
  OR EXISTS (
    SELECT 1 FROM public.institutes i
     WHERE i.id = p_institute_id
       AND i.owner_id = auth.uid()
       AND (p_permission IS NULL OR p_permission = 'manage_profile' OR p_permission = 'manage_branches'
            OR p_permission = 'manage_members' OR p_permission = 'manage_faculty'
            OR p_permission = 'manage_admissions' OR p_permission = 'manage_attendance'
            OR p_permission = 'manage_fees' OR p_permission = 'manage_courses'
            OR p_permission = 'manage_enquiries')
  );
$$;

REVOKE ALL ON FUNCTION public.institute_can_access(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_can_access(UUID, UUID, TEXT) TO authenticated;

ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_fee_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.institutes, public.institute_branches, public.institute_members,
  public.institute_faculty, public.institute_admissions,
  public.institute_attendance_sessions, public.institute_attendance_records,
  public.institute_fee_ledger FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.institutes, public.institute_branches,
  public.institute_members, public.institute_faculty, public.institute_admissions,
  public.institute_attendance_sessions, public.institute_attendance_records,
  public.institute_fee_ledger TO authenticated;

DROP POLICY IF EXISTS institute_select ON public.institutes;
CREATE POLICY institute_select ON public.institutes FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.institute_can_access(id));
DROP POLICY IF EXISTS institute_insert ON public.institutes;
CREATE POLICY institute_insert ON public.institutes FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS institute_update ON public.institutes;
CREATE POLICY institute_update ON public.institutes FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.institute_can_access(id, NULL, 'manage_profile'))
  WITH CHECK (owner_id = auth.uid() OR public.institute_can_access(id, NULL, 'manage_profile'));

DROP POLICY IF EXISTS institute_branches_access ON public.institute_branches;
CREATE POLICY institute_branches_access ON public.institute_branches FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, id, 'manage_branches'))
  WITH CHECK (public.institute_can_access(institute_id, id, 'manage_branches'));
DROP POLICY IF EXISTS institute_members_access ON public.institute_members;
CREATE POLICY institute_members_access ON public.institute_members FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.institute_can_access(institute_id, branch_id, 'manage_members'))
  WITH CHECK (public.institute_can_access(institute_id, branch_id, 'manage_members'));
DROP POLICY IF EXISTS institute_faculty_access ON public.institute_faculty;
CREATE POLICY institute_faculty_access ON public.institute_faculty FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, branch_id, 'manage_faculty'))
  WITH CHECK (public.institute_can_access(institute_id, branch_id, 'manage_faculty'));
DROP POLICY IF EXISTS institute_admissions_access ON public.institute_admissions;
CREATE POLICY institute_admissions_access ON public.institute_admissions FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, branch_id, 'manage_admissions'))
  WITH CHECK (public.institute_can_access(institute_id, branch_id, 'manage_admissions'));
DROP POLICY IF EXISTS institute_attendance_sessions_access ON public.institute_attendance_sessions;
CREATE POLICY institute_attendance_sessions_access ON public.institute_attendance_sessions FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, branch_id, 'manage_attendance'))
  WITH CHECK (public.institute_can_access(institute_id, branch_id, 'manage_attendance'));
DROP POLICY IF EXISTS institute_attendance_records_access ON public.institute_attendance_records;
CREATE POLICY institute_attendance_records_access ON public.institute_attendance_records FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.institute_attendance_sessions s
     WHERE s.id = session_id AND public.institute_can_access(s.institute_id, s.branch_id, 'manage_attendance')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.institute_attendance_sessions s
     WHERE s.id = session_id AND public.institute_can_access(s.institute_id, s.branch_id, 'manage_attendance')
  ));
DROP POLICY IF EXISTS institute_fee_ledger_access ON public.institute_fee_ledger;
CREATE POLICY institute_fee_ledger_access ON public.institute_fee_ledger FOR ALL TO authenticated
  USING (public.institute_can_access(institute_id, branch_id, 'manage_fees'))
  WITH CHECK (public.institute_can_access(institute_id, branch_id, 'manage_fees'));

-- Institute members can see the batches belonging to their institute. They
-- cannot publish a batch; the existing class_review_batch admin flow remains
-- the publication boundary.
DROP POLICY IF EXISTS "Institute members see their batches" ON public.class_batches;
CREATE POLICY "Institute members see their batches" ON public.class_batches FOR SELECT TO authenticated
  USING (institute_id IS NOT NULL AND public.institute_can_access(institute_id, branch_id));

DROP POLICY IF EXISTS "Institute members see their course listings" ON public.listings;
CREATE POLICY "Institute members see their course listings" ON public.listings FOR SELECT TO authenticated
  USING (institute_id IS NOT NULL AND public.institute_can_access(institute_id));
DROP POLICY IF EXISTS "Institute members manage course listings" ON public.listings;
CREATE POLICY "Institute members manage course listings" ON public.listings FOR UPDATE TO authenticated
  USING (institute_id IS NOT NULL AND public.institute_can_access(institute_id, NULL, 'manage_courses'))
  WITH CHECK (institute_id IS NOT NULL AND public.institute_can_access(institute_id, NULL, 'manage_courses'));
DROP POLICY IF EXISTS "Institute members create course listings" ON public.listings;
CREATE POLICY "Institute members create course listings" ON public.listings FOR INSERT TO authenticated
  WITH CHECK (entity_type = 'course' AND institute_id IS NOT NULL AND owner_id = auth.uid()
    AND public.institute_can_access(institute_id, NULL, 'manage_courses'));

DROP POLICY IF EXISTS "Institute members maintain their batches" ON public.class_batches;
CREATE POLICY "Institute members maintain their batches" ON public.class_batches FOR UPDATE TO authenticated
  USING (institute_id IS NOT NULL AND public.institute_can_access(institute_id, branch_id, 'manage_courses'))
  WITH CHECK (status IN ('pending_approval', 'paused', 'archived')
    AND institute_id IS NOT NULL AND public.institute_can_access(institute_id, branch_id, 'manage_courses'));
DROP POLICY IF EXISTS "Institute members create their batches" ON public.class_batches;
CREATE POLICY "Institute members create their batches" ON public.class_batches FOR INSERT TO authenticated
  WITH CHECK (status = 'pending_approval' AND institute_id IS NOT NULL
    AND public.institute_can_access(institute_id, branch_id, 'manage_courses')
    AND EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.institute_id = institute_id AND l.entity_type = 'course'));

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
BEGIN
  SELECT * INTO v_row FROM public.institute_fee_ledger WHERE id = p_ledger_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEE_LEDGER_ENTRY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.institute_can_access(v_row.institute_id, v_row.branch_id, 'manage_fees') THEN
    RAISE EXCEPTION 'FORBIDDEN_FEE_PERMISSION' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.status = 'paid' THEN RETURN v_row; END IF;
  IF length(btrim(coalesce(p_payment_method, ''))) < 2 THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.institute_fee_ledger
     SET status = 'paid', payment_method = left(btrim(p_payment_method), 80),
         payment_reference = nullif(left(btrim(coalesce(p_payment_reference, '')), 160), ''),
         paid_at = now(), verified_by = auth.uid(), updated_at = now()
   WHERE id = p_ledger_id
   RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.institute_record_fee_payment(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institute_record_fee_payment(UUID, TEXT, TEXT) TO authenticated;
