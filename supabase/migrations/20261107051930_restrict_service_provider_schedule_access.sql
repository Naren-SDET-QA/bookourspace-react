-- Restrict raw provider schedules to the active provider who owns them and
-- active administrators. Customer discovery remains available through the
-- existing service_listing_profile() and service_listing_slots() projections,
-- which expose approved availability only for active service listings.
--
-- Public-safe discovery fields are deliberately limited to the established
-- projection: service areas, travel radius, working weekdays, opening/closing
-- times, slot length, configured status, and date-specific public slots.
-- provider_id, timezone, and updated_at stay private to direct table readers.

begin;

alter table public.service_provider_schedules enable row level security;

-- The prior policy returned every row to anon and authenticated users.
drop policy if exists "Published schedules are readable"
  on public.service_provider_schedules;
drop policy if exists "Providers manage their own schedule"
  on public.service_provider_schedules;
drop policy if exists "Active providers and admins read schedules"
  on public.service_provider_schedules;
drop policy if exists "Active providers and admins insert schedules"
  on public.service_provider_schedules;
drop policy if exists "Active providers and admins update schedules"
  on public.service_provider_schedules;

create policy "Active providers and admins read schedules"
  on public.service_provider_schedules
  for select to authenticated
  using (
    (
      provider_id = (select auth.uid())
      and exists (
        select 1
        from public.profiles as own_profile
        where own_profile.id = (select auth.uid())
          and own_profile.role = 'provider'
          and own_profile.account_status = 'active'
      )
    )
    or (select public.is_admin())
  );

create policy "Active providers and admins insert schedules"
  on public.service_provider_schedules
  for insert to authenticated
  with check (
    (
      provider_id = (select auth.uid())
      and exists (
        select 1
        from public.profiles as own_profile
        where own_profile.id = (select auth.uid())
          and own_profile.role = 'provider'
          and own_profile.account_status = 'active'
      )
    )
    or (select public.is_admin())
  );

create policy "Active providers and admins update schedules"
  on public.service_provider_schedules
  for update to authenticated
  using (
    (
      provider_id = (select auth.uid())
      and exists (
        select 1
        from public.profiles as own_profile
        where own_profile.id = (select auth.uid())
          and own_profile.role = 'provider'
          and own_profile.account_status = 'active'
      )
    )
    or (select public.is_admin())
  )
  with check (
    (
      provider_id = (select auth.uid())
      and exists (
        select 1
        from public.profiles as own_profile
        where own_profile.id = (select auth.uid())
          and own_profile.role = 'provider'
          and own_profile.account_status = 'active'
      )
    )
    or (select public.is_admin())
  );

-- The direct Data API table surface is authenticated-only. Existing owners
-- retain read/insert/update access; deletes remain unavailable to all clients.
revoke all on table public.service_provider_schedules from public, anon, authenticated;
grant select, insert, update on table public.service_provider_schedules to authenticated;

commit;
