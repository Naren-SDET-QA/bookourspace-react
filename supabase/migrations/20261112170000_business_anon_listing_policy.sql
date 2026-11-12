-- Keep anonymous catalogue reads free of is_admin() execution. Anonymous users
-- may only see active, business-available listings; authenticated/business
-- members retain scoped access through the second policy.
drop policy if exists "Business listings are publicly readable or business-scoped" on public.listings;
drop policy if exists "Public active listings" on public.listings;
create policy "Public active listings" on public.listings for select to anon
using (status = 'active' and (business_id is null or public.business_publicly_available(business_id)));

drop policy if exists "Business listings for authenticated users" on public.listings;
create policy "Business listings for authenticated users" on public.listings for select to authenticated
using (
  (status = 'active' and (business_id is null or public.business_publicly_available(business_id)))
  or (business_id is null and owner_id = (select auth.uid()))
  or public.can_access_business_module(business_id, array['owner','manager','staff'])
  or public.is_admin()
);
