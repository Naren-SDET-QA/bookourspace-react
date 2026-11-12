-- Transitional legacy compatibility for unassigned listings. New records from
-- the provider API always carry business_id; NULL remains only for fixtures and
-- pre-migration rows that could not be mapped.
drop policy if exists "Business listings are publicly readable or business-scoped" on public.listings;
create policy "Business listings are publicly readable or business-scoped" on public.listings for select
using (
  (status = 'active' and (business_id is null or public.business_publicly_available(business_id)))
  or (business_id is null and owner_id = (select auth.uid()))
  or public.can_access_business_module(business_id, array['owner','manager','staff'])
  or public.is_admin()
);

drop policy if exists "Business owners and managers create listings" on public.listings;
create policy "Business owners and managers create listings" on public.listings for insert to authenticated
with check (
  (business_id is null and owner_id = (select auth.uid()) and public.is_active_user())
  or public.can_access_business_module(business_id, array['owner','manager'])
);

drop policy if exists "Business owners and managers update listings" on public.listings;
create policy "Business owners and managers update listings" on public.listings for update to authenticated
using (
  (business_id is null and owner_id = (select auth.uid()))
  or public.can_access_business_module(business_id, array['owner','manager'])
  or public.is_admin()
)
with check (
  (business_id is null and owner_id = (select auth.uid()))
  or public.can_access_business_module(business_id, array['owner','manager'])
  or public.is_admin()
);

drop policy if exists "Business owners and managers delete listings" on public.listings;
create policy "Business owners and managers delete listings" on public.listings for delete to authenticated
using (
  (business_id is null and owner_id = (select auth.uid()))
  or public.can_access_business_module(business_id, array['owner','manager'])
  or public.is_admin()
);
