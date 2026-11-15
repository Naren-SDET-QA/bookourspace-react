-- Provider onboarding and activation. This is an additive migration.
-- It stores submitted business details separately from public listing rows.

CREATE TABLE IF NOT EXISTS public.provider_registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN (
    'pg_hostels', 'classes', 'venues', 'services', 'hotel_stay'
  )),
  business_name TEXT NOT NULL CHECK (length(trim(business_name)) BETWEEN 2 AND 120),
  contact_phone TEXT NOT NULL CHECK (length(trim(contact_phone)) BETWEEN 7 AND 24),
  city TEXT NOT NULL CHECK (length(trim(city)) BETWEEN 2 AND 100),
  area TEXT NOT NULL CHECK (length(trim(area)) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id),
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_provider_registration_pending_type
  ON public.provider_registration_requests (user_id, provider_type)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_provider_registration_admin_queue
  ON public.provider_registration_requests (status, created_at DESC, id);

ALTER TABLE public.provider_registration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_registration_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.provider_registration_requests TO authenticated;

DROP POLICY IF EXISTS "Owners and admins read provider registrations" ON public.provider_registration_requests;
CREATE POLICY "Owners and admins read provider registrations"
  ON public.provider_registration_requests FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND public.is_active_user())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Customers submit own provider registration" ON public.provider_registration_requests;
CREATE POLICY "Customers submit own provider registration"
  ON public.provider_registration_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = (SELECT auth.uid())
         AND p.role = 'customer'
         AND p.account_status = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins review provider registrations" ON public.provider_registration_requests;
CREATE POLICY "Admins review provider registrations"
  ON public.provider_registration_requests FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- A missing profile can be repaired by the authenticated server session only
-- as a customer. Allowlisted Admin profiles are created by the Auth trigger;
-- self-insert can never grant provider or admin privileges.
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    id = (SELECT auth.uid())
    AND role = 'customer'
    AND account_status = 'active'
  );

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
