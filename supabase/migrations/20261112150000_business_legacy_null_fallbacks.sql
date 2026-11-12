-- Transitional compatibility for records created before business scoping.
-- Rows with a business_id are strictly business-scoped. Only NULL business_id
-- legacy rows retain the narrow original owner/provider access path.
drop policy if exists "Business members read venue bookings" on public.venue_bookings;
create policy "Business members read venue bookings" on public.venue_bookings for select to authenticated
using (
  customer_user_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','staff','accountant'])
  or (business_id is null and owner_user_id = (select auth.uid()))
  or public.is_admin()
);

drop policy if exists "Business members read service bookings" on public.service_bookings;
create policy "Business members read service bookings" on public.service_bookings for select to authenticated
using (
  customer_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','staff','accountant'])
  or (business_id is null and provider_id = (select auth.uid()))
  or public.is_admin()
);

drop policy if exists "Business members update service bookings" on public.service_bookings;
create policy "Business members update service bookings" on public.service_bookings for update to authenticated
using (
  customer_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','staff'])
  or (business_id is null and provider_id = (select auth.uid()))
  or public.is_admin()
)
with check (
  customer_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','staff'])
  or (business_id is null and provider_id = (select auth.uid()))
  or public.is_admin()
);
