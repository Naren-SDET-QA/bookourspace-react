-- Restrict private profile rows to their owner, active administrators, and
-- parties with an existing booking/enrollment relationship. Public provider
-- discovery uses a safe projection with no email or phone columns.
begin;

create or replace function public.can_read_private_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    target_profile_id = (select auth.uid())
    or exists (
      select 1 from public.profiles administrator
      where administrator.id = (select auth.uid())
        and administrator.role = 'admin'
        and administrator.account_status = 'active'
    )
    or (
      exists (
        select 1 from public.profiles actor
        where actor.id = (select auth.uid())
          and actor.account_status = 'active'
      )
      and (
        exists (
          select 1 from public.service_bookings booking
          where (booking.customer_id = (select auth.uid()) and booking.provider_id = target_profile_id)
             or (booking.provider_id = (select auth.uid()) and booking.customer_id = target_profile_id)
        )
        or exists (
          select 1 from public.venue_bookings booking
          where (booking.customer_user_id = (select auth.uid()) and booking.owner_user_id = target_profile_id)
             or (booking.owner_user_id = (select auth.uid()) and booking.customer_user_id = target_profile_id)
        )
        or exists (
          select 1
          from public.class_enrollments enrollment
          join public.class_batches batch on batch.id = enrollment.batch_id
          join public.listings listing on listing.id = batch.listing_id
          where (enrollment.student_id = target_profile_id and listing.owner_id = (select auth.uid()))
             or (enrollment.student_id = (select auth.uid()) and listing.owner_id = target_profile_id)
        )
        or exists (
          select 1
          from public.bookings booking
          join public.listings listing on listing.id = booking.listing_id
          where (booking.user_id = (select auth.uid()) and listing.owner_id = target_profile_id)
             or (booking.user_id = target_profile_id and listing.owner_id = (select auth.uid()))
        )
        or exists (
          select 1
          from public.stay_allocations allocation
          join public.stay_units unit on unit.id = allocation.unit_id
          join public.stay_room_types room_type on room_type.id = unit.room_type_id
          join public.stay_properties property on property.id = room_type.property_id
          where allocation.status in ('held', 'confirmed')
            and ((allocation.guest_user_id = (select auth.uid()) and property.owner_user_id = target_profile_id)
              or (allocation.guest_user_id = target_profile_id and property.owner_user_id = (select auth.uid())))
        )
      )
    ),
    false
  );
$$;

revoke all on function public.can_read_private_profile(uuid) from public, anon, authenticated;
grant execute on function public.can_read_private_profile(uuid) to authenticated;

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
drop policy if exists "Users read own or booking-related profiles" on public.profiles;
create policy "Users read own or booking-related profiles"
  on public.profiles for select to authenticated
  using (public.can_read_private_profile(id));

-- Remove table-wide client privileges, then grant only the profile columns and
-- writes used by the app. RLS above scopes email/phone reads to legitimate rows.
revoke all on table public.profiles from public, anon, authenticated;
grant select (id, email, full_name, phone, role, avatar_url, account_status, verified, city, created_at, updated_at)
  on table public.profiles to authenticated;
grant insert (id, email, full_name, phone, role)
  on table public.profiles to authenticated;
grant update (full_name, phone, updated_at)
  on table public.profiles to authenticated;

-- Public provider discovery can expose only these explicitly public fields.
-- This owner-security view intentionally bypasses profile RLS, so it contains
-- no email, phone, Google subject, or account status field and filters to active,
-- verified providers only.
create or replace view public.public_provider_profiles
with (security_barrier = true)
as
  select id, full_name, avatar_url, city, verified
  from public.profiles
  where role = 'provider'
    and account_status = 'active'
    and verified is true;

revoke all on table public.public_provider_profiles from public;
grant select on table public.public_provider_profiles to anon, authenticated;

commit;
