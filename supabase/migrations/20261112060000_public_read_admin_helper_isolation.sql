-- Forward repair: anonymous reads must not evaluate `public.is_admin()`.
--
-- 20261104190000 revoked EXECUTE on public.is_admin() from anon, and
-- 20261105010000 fixed service_reviews by splitting its SELECT policy by role.
-- Two public policies were missed:
--
--   * public.listings  — fixed in 20261112030000 (role-split policies), which is
--                        still pending and is applied before this file.
--   * public.venue_categories — created in 20261103175957 with
--                        `using (active or (is_admin() and is_active_user()))`
--                        for anon+authenticated. Every anonymous venue category
--                        request therefore fails with
--                        "permission denied for function is_admin".
--
-- This migration re-creates the venue_categories policy per role and changes no
-- data, grant or function. Idempotent: every object is dropped first.
--
-- Applied after the business-ownership phases (20261112010000-20261112050000).

drop policy if exists "Read active venue categories" on public.venue_categories;
drop policy if exists "Anon reads active venue categories" on public.venue_categories;
create policy "Anon reads active venue categories"
  on public.venue_categories for select to anon
  using (active);

drop policy if exists "Authenticated reads active venue categories" on public.venue_categories;
create policy "Authenticated reads active venue categories"
  on public.venue_categories for select to authenticated
  using (active or (public.is_admin() and public.is_active_user()));
