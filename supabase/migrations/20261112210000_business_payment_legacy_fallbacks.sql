-- Legacy payment intents created before business scoping retain only the
-- narrow original booking-party path when business_id is NULL.
drop policy if exists "Customers and business finance read venue payment intents" on public.venue_payment_intents;
create policy "Customers and business finance read venue payment intents" on public.venue_payment_intents for select to authenticated
using (
  customer_user_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','accountant'])
  or (business_id is null and exists (select 1 from public.venue_bookings b where b.id=venue_payment_intents.booking_id and b.owner_user_id=(select auth.uid())))
  or public.is_admin()
);
