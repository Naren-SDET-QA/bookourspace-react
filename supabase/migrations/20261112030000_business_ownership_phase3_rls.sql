-- Phase 3: business-scoped RLS and authorization boundary.
-- Legacy owner_id/provider_id policies that bypassed business membership are
-- removed for the protected domain tables. Public active listings and customer
-- self-access remain unchanged.

create or replace function public.can_access_business_module(p_business_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_business(p_business_id, p_roles)
     and exists (
       select 1
         from public.businesses b
         join public.business_module_access a on a.business_id = b.id and a.module_type = b.module_type
        where b.id = p_business_id
          and a.enabled = true
          and a.approval_status = 'approved'
     )
$$;

create or replace function public.business_publicly_available(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.businesses b
      join public.business_module_access a on a.business_id = b.id and a.module_type = b.module_type
     where b.id = p_business_id
       and b.is_enabled = true
       and b.approval_status = 'approved'
       and a.enabled = true
       and a.approval_status = 'approved'
  )
$$;

-- Listings
drop policy if exists "Active listings are viewable by everyone, owners view own" on public.listings;
drop policy if exists "Authenticated users can create their own listings" on public.listings;
drop policy if exists "Owners can update their own listings" on public.listings;
drop policy if exists "Owners can delete their own listings" on public.listings;
drop policy if exists "Business listings are publicly readable or business-scoped" on public.listings;
create policy "Business listings are publicly readable or business-scoped" on public.listings for select
using (
  status = 'active'
  or public.can_access_business_module(business_id, array['owner','manager','staff'])
  or public.is_admin()
);
drop policy if exists "Business owners and managers create listings" on public.listings;
create policy "Business owners and managers create listings" on public.listings for insert to authenticated
with check (public.can_access_business_module(business_id, array['owner','manager']) and public.is_active_user());
drop policy if exists "Business owners and managers update listings" on public.listings;
create policy "Business owners and managers update listings" on public.listings for update to authenticated
using (public.can_access_business_module(business_id, array['owner','manager']) or public.is_admin())
with check (public.can_access_business_module(business_id, array['owner','manager']) or public.is_admin());
drop policy if exists "Business owners and managers delete listings" on public.listings;
create policy "Business owners and managers delete listings" on public.listings for delete to authenticated
using (public.can_access_business_module(business_id, array['owner','manager']) or public.is_admin());

-- Service bookings: customer self-access remains; provider access is membership based.
drop policy if exists "Booking parties and admins read service bookings" on public.service_bookings;
drop policy if exists "Booking parties and admins update service bookings" on public.service_bookings;
drop policy if exists "Business members read service bookings" on public.service_bookings;
create policy "Business members read service bookings" on public.service_bookings for select to authenticated
using (
  customer_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','staff','accountant'])
  or public.is_admin()
);
drop policy if exists "Business members update service bookings" on public.service_bookings;
create policy "Business members update service bookings" on public.service_bookings for update to authenticated
using (customer_id = (select auth.uid()) or public.can_access_business_module(business_id, array['owner','manager','staff']) or public.is_admin())
with check (customer_id = (select auth.uid()) or public.can_access_business_module(business_id, array['owner','manager','staff']) or public.is_admin());

-- PG / stay bookings. Customers keep their own rows; providers are business members.
drop policy if exists "PG booking parties read bookings" on public.bookings;
drop policy if exists "Providers can view bookings for their listings" on public.bookings;
drop policy if exists "Providers and admins can update booking status" on public.bookings;
drop policy if exists "Authenticated users can view their own bookings" on public.bookings;
drop policy if exists "Authenticated users can update their own bookings" on public.bookings;
drop policy if exists "Customer or business members read bookings" on public.bookings;
create policy "Customer or business members read bookings" on public.bookings for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','staff','accountant'])
  or public.is_admin()
);
drop policy if exists "Customer or business members update bookings" on public.bookings;
create policy "Customer or business members update bookings" on public.bookings for update to authenticated
using (user_id = (select auth.uid()) or public.can_access_business_module(business_id, array['owner','manager','staff']) or public.is_admin())
with check (user_id = (select auth.uid()) or public.can_access_business_module(business_id, array['owner','manager','staff']) or public.is_admin());

-- Stay properties
drop policy if exists "Active properties are publicly readable" on public.stay_properties;
create policy "Active properties are publicly readable" on public.stay_properties for select
using (is_active and (business_id is null or public.business_publicly_available(business_id)));

drop policy if exists "Owners and active admins read all stay properties" on public.stay_properties;
drop policy if exists "Active owners/admins insert stay properties" on public.stay_properties;
drop policy if exists "Active owners/admins update stay properties" on public.stay_properties;
drop policy if exists "Business members read stay properties" on public.stay_properties;
create policy "Business members read stay properties" on public.stay_properties for select to authenticated
using (public.can_access_business_module(business_id, array['owner','manager','staff','accountant']) or public.is_admin());
drop policy if exists "Business owners/managers write stay properties" on public.stay_properties;
create policy "Business owners/managers write stay properties" on public.stay_properties for insert to authenticated
with check (public.can_access_business_module(business_id, array['owner','manager']) and public.is_active_user());
drop policy if exists "Business owners/managers update stay properties" on public.stay_properties;
create policy "Business owners/managers update stay properties" on public.stay_properties for update to authenticated
using (public.can_access_business_module(business_id, array['owner','manager']) or public.is_admin())
with check (public.can_access_business_module(business_id, array['owner','manager']) or public.is_admin());

-- Venue bookings
drop policy if exists "Venue booking parties read bookings" on public.venue_bookings;
drop policy if exists "Business members read venue bookings" on public.venue_bookings;
create policy "Business members read venue bookings" on public.venue_bookings for select to authenticated
using (
  customer_user_id = (select auth.uid())
  or public.can_access_business_module(business_id, array['owner','manager','staff','accountant'])
  or public.is_admin()
);

-- Payment visibility: customer self-access and business finance/admin roles.
drop policy if exists "Owners and admins read payment intents" on public.payment_intents;
drop policy if exists "Customers and business finance read payment intents" on public.payment_intents;
create policy "Customers and business finance read payment intents" on public.payment_intents for select to authenticated
using (user_id = (select auth.uid()) or public.can_access_business_module(business_id, array['owner','manager','accountant']) or public.is_admin());

drop policy if exists "Booking parties read service payment intents" on public.service_payment_intents;
drop policy if exists "Customers and business finance read service payment intents" on public.service_payment_intents;
create policy "Customers and business finance read service payment intents" on public.service_payment_intents for select to authenticated
using (customer_id = (select auth.uid()) or public.can_access_business_module(business_id, array['owner','manager','accountant']) or public.is_admin());

drop policy if exists "Venue booking parties read payment intents" on public.venue_payment_intents;
drop policy if exists "Customers and business finance read venue payment intents" on public.venue_payment_intents;
create policy "Customers and business finance read venue payment intents" on public.venue_payment_intents for select to authenticated
using (customer_user_id = (select auth.uid()) or public.can_access_business_module(business_id, array['owner','manager','accountant']) or public.is_admin());

drop policy if exists "Business listings are publicly readable or business-scoped" on public.listings;
create policy "Business listings are publicly readable or business-scoped" on public.listings for select
using (
  (status = 'active' and (business_id is null or public.business_publicly_available(business_id)))
  or public.can_access_business_module(business_id, array['owner','manager','staff'])
  or public.is_admin()
);
