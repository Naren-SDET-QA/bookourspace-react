-- Phase 4: close remaining business leakage on invoices, enquiries, contact
-- settings and payment claims. Public reviews remain public by design; their
-- business_id is used for reporting, not to hide public reviews.

drop policy if exists "PG booking parties read invoices" on public.pg_invoices;
drop policy if exists "Customers and business finance read invoices" on public.pg_invoices;
create policy "Customers and business finance read invoices" on public.pg_invoices for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','accountant'])
  or public.is_admin()
);

drop policy if exists "Providers and admins can view enquiries for their listings" on public.enquiries;
drop policy if exists "Customers and business members read enquiries" on public.enquiries;
create policy "Customers and business members read enquiries" on public.enquiries for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','staff'])
  or public.is_admin()
);
drop policy if exists "Business members update enquiries" on public.enquiries;
create policy "Business members update enquiries" on public.enquiries for update to authenticated
using (public.can_access_business_module(business_id, array['owner','manager','staff']) or public.is_admin())
with check (public.can_access_business_module(business_id, array['owner','manager','staff']) or public.is_admin());

drop policy if exists "Owners manage their contact settings" on public.provider_contact_settings;
drop policy if exists "Business members read contact settings" on public.provider_contact_settings;
create policy "Business members read contact settings" on public.provider_contact_settings for select to authenticated
using (public.can_access_business_module(business_id, array['owner','manager','staff','accountant']) or public.is_admin());
drop policy if exists "Business owners manage contact settings" on public.provider_contact_settings;
create policy "Business owners manage contact settings" on public.provider_contact_settings for all to authenticated
using (public.can_access_business_module(business_id, array['owner','manager']) or public.is_admin())
with check (public.can_access_business_module(business_id, array['owner','manager']) or public.is_admin());

drop policy if exists "PG booking parties read payment claims" on public.pg_payment_claims;
drop policy if exists "Customers and business finance read payment claims" on public.pg_payment_claims;
create policy "Customers and business finance read payment claims" on public.pg_payment_claims for select to authenticated
using (
  exists (
    select 1 from public.bookings b
     where b.id = pg_payment_claims.booking_id
       and b.user_id = (select auth.uid())
  )
  or public.can_access_business_module(business_id, array['owner','manager','accountant'])
  or public.is_admin()
);

drop policy if exists "Booking parties and admins read payment claims" on public.service_payment_claims;
drop policy if exists "Customers and business finance read service payment claims" on public.service_payment_claims;
create policy "Customers and business finance read service payment claims" on public.service_payment_claims for select to authenticated
using (
  exists (
    select 1 from public.service_bookings b
     where b.id = service_payment_claims.booking_id
       and b.customer_id = (select auth.uid())
  )
  or public.can_access_business_module(business_id, array['owner','manager','accountant'])
  or public.is_admin()
);

grant select, insert, update on public.enquiries to authenticated;
grant select, insert, update on public.provider_contact_settings to authenticated;
