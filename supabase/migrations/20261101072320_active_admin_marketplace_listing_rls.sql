-- Restrict cross-provider listing administration to active Supabase admins.
-- Owner policies remain available to active owners and are unchanged.
-- Table grants expose the existing RLS-protected listing API to the Supabase
-- Data API; row policies below remain the authorization boundary.
GRANT SELECT ON public.listings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Admins can manage all listings" ON public.listings;
DROP POLICY IF EXISTS "Active admins manage all listings" ON public.listings;
CREATE POLICY "Active admins manage all listings"
  ON public.listings FOR ALL
  TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  )
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.account_status = 'active'
    )
  );

-- The baseline owner policies also included an unconditional admin OR branch.
-- Replace those branches so a suspended admin cannot regain access through
-- the owner policies after the broad admin policy above has been removed.
DROP POLICY IF EXISTS "Owners can update their own listings" ON public.listings;
CREATE POLICY "Owners can update their own listings"
  ON public.listings FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = owner_id AND public.is_active_user())
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
          AND p.account_status = 'active'
      )
    )
  )
  WITH CHECK (
    (auth.uid() = owner_id AND public.is_active_user())
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
          AND p.account_status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Owners can delete their own listings" ON public.listings;
CREATE POLICY "Owners can delete their own listings"
  ON public.listings FOR DELETE
  TO authenticated
  USING (
    (auth.uid() = owner_id AND public.is_active_user())
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
          AND p.account_status = 'active'
      )
    )
  );
