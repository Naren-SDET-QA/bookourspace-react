-- ============================================================================
-- Public service reviews must be readable by anonymous visitors.
--
-- The original SELECT policy was:
--   using (is_published or customer_id = auth.uid() or public.is_admin())
-- and applied to both anon and authenticated. An earlier hardening migration
-- revoked EXECUTE on public.is_admin() from anon, so evaluating that policy as
-- anon raised "permission denied for function is_admin" and the public reviews
-- endpoint returned 500 for everyone who was not signed in.
--
-- The policy is split by role instead of weakening the function grants:
--   * anon reads published reviews only;
--   * authenticated reads published reviews, their own reviews, or anything
--     when the caller is an active administrator.
--
-- Idempotent. Applied to disposable/local databases in this task only; the
-- hosted project needs separate approval before this migration is installed.
-- ============================================================================
begin;

drop policy if exists "Published service reviews are public" on public.service_reviews;

drop policy if exists "Anon reads published service reviews" on public.service_reviews;
create policy "Anon reads published service reviews"
  on public.service_reviews for select to anon
  using (is_published);

drop policy if exists "Authenticated reads published and own service reviews" on public.service_reviews;
create policy "Authenticated reads published and own service reviews"
  on public.service_reviews for select to authenticated
  using (
    is_published
    or customer_id = (select auth.uid())
    or public.is_admin()
  );

commit;
