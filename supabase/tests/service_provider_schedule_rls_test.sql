\set ON_ERROR_STOP on

-- Executed only against the disposable PostgreSQL cluster in
-- run_services_e2e.sh. All fixtures and role changes roll back at the end.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d1000000-0000-4000-8000-000000000001', 'schedule-owner@example.test', '{"full_name":"Schedule Owner"}'),
  ('d1000000-0000-4000-8000-000000000002', 'schedule-other@example.test', '{"full_name":"Other Provider"}'),
  ('d1000000-0000-4000-8000-000000000003', 'schedule-customer@example.test', '{"full_name":"Unrelated Customer"}'),
  ('d1000000-0000-4000-8000-000000000004', 'schedule-admin@example.test', '{"full_name":"Authorized Admin"}'),
  ('d1000000-0000-4000-8000-000000000005', 'schedule-inactive@example.test', '{"full_name":"Inactive Provider"}')
on conflict (id) do nothing;

update public.profiles set role = 'provider', account_status = 'active'
 where id in ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002');
update public.profiles set role = 'customer', account_status = 'active'
 where id = 'd1000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin', account_status = 'active'
 where id = 'd1000000-0000-4000-8000-000000000004';
update public.profiles set role = 'provider', account_status = 'suspended'
 where id = 'd1000000-0000-4000-8000-000000000005';

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, status)
values
  ('schedule-rls-active-a', 'd1000000-0000-4000-8000-000000000001', 'Public Service A', 'services', 'test', 'service', 100, 'active'),
  ('schedule-rls-active-b', 'd1000000-0000-4000-8000-000000000002', 'Public Service B', 'services', 'test', 'service', 100, 'active'),
  ('schedule-rls-pending', 'd1000000-0000-4000-8000-000000000001', 'Pending Service', 'services', 'test', 'service', 100, 'pending_approval')
on conflict (id) do nothing;

insert into public.service_provider_schedules
  (provider_id, timezone, working_days, day_start, day_end, slot_minutes, service_areas, travel_radius_km)
values
  ('d1000000-0000-4000-8000-000000000001', 'Asia/Kolkata', '{0,1,2,3,4,5,6}', '09:00', '12:00', 60, '{Mumbai}', 15),
  ('d1000000-0000-4000-8000-000000000002', 'Asia/Kolkata', '{0,1,2,3,4,5,6}', '10:00', '12:00', 60, '{PrivateAreaB}', 25),
  ('d1000000-0000-4000-8000-000000000005', 'Asia/Kolkata', '{0,1,2,3,4,5,6}', '11:00', '12:00', 60, '{SuspendedArea}', 5)
on conflict (provider_id) do update set
  timezone = excluded.timezone,
  working_days = excluded.working_days,
  day_start = excluded.day_start,
  day_end = excluded.day_end,
  slot_minutes = excluded.slot_minutes,
  service_areas = excluded.service_areas,
  travel_radius_km = excluded.travel_radius_km;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.service_provider_schedules'::regclass) then
    raise exception 'FAIL schedules RLS is disabled';
  end if;
  if has_table_privilege('anon', 'public.service_provider_schedules', 'SELECT') then
    raise exception 'FAIL anon retains direct SELECT privilege on schedules';
  end if;
  if not has_table_privilege('authenticated', 'public.service_provider_schedules', 'SELECT')
     or not has_table_privilege('authenticated', 'public.service_provider_schedules', 'INSERT')
     or not has_table_privilege('authenticated', 'public.service_provider_schedules', 'UPDATE') then
    raise exception 'FAIL authenticated provider schedule grants are incomplete';
  end if;
  if has_table_privilege('authenticated', 'public.service_provider_schedules', 'DELETE') then
    raise exception 'FAIL direct schedule DELETE privilege was added';
  end if;
  if has_table_privilege('authenticated', 'public.service_provider_schedules', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.service_provider_schedules', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.service_provider_schedules', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.service_provider_schedules', 'MAINTAIN') then
    raise exception 'FAIL authenticated role has a non-CRUD schedule table privilege';
  end if;
  raise notice 'PASS schedule RLS and least-privilege table grants';
end $$;

-- Anonymous users cannot query the base table, but retain the approved active
-- listing projection and date-specific public availability RPCs.
set local role anon;
do $$
declare
  v_profile jsonb;
  v_slots integer;
begin
  begin
    perform count(*) from public.service_provider_schedules;
    raise exception 'FAIL anon queried raw provider schedules';
  exception when insufficient_privilege then
    raise notice 'PASS anon is denied direct schedule table access';
  end;

  v_profile := public.service_listing_profile('schedule-rls-active-a');
  if v_profile is null
     or v_profile->'serviceAreas' <> '["Mumbai"]'::jsonb
     or v_profile->>'travelRadiusKm' <> '15'
     or v_profile->>'dayStart' <> '09:00'
     or v_profile->>'dayEnd' <> '12:00'
     or v_profile->>'slotMinutes' <> '60'
     or v_profile->>'scheduleConfigured' <> 'true'
     or not (v_profile ? 'workingDays')
     or (v_profile ?| array['provider_id', 'providerId', 'timezone', 'updated_at', 'updatedAt']) then
    raise exception 'FAIL public active-listing projection is missing approved fields or includes private table fields: %', v_profile;
  end if;

  if public.service_listing_profile('schedule-rls-pending') is not null then
    raise exception 'FAIL anon can read the schedule projection for an unpublished service listing';
  end if;
  begin
    perform * from public.service_listing_slots('schedule-rls-pending', current_date + 1, current_date + 1);
    raise exception 'FAIL anon can read slots for an unpublished service listing';
  exception when no_data_found then
    null;
  end;

  select count(*) into v_slots
    from public.service_listing_slots('schedule-rls-active-a', current_date + 1, current_date + 1);
  if v_slots < 1 then
    raise exception 'FAIL anon cannot discover date-specific service availability';
  end if;
  raise notice 'PASS anon receives only approved active-listing schedule projection and slots';
end $$;
reset role;

-- An unrelated authenticated customer sees no provider rows and cannot edit
-- another provider's schedule or create a schedule using their customer role.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000003', true);
do $$
declare
  v_rows integer;
  v_updated integer;
begin
  select count(*) into v_rows from public.service_provider_schedules;
  if v_rows <> 0 then raise exception 'FAIL unrelated customer read % provider schedules', v_rows; end if;

  update public.service_provider_schedules
     set service_areas = '{CustomerTamper}'
   where provider_id = 'd1000000-0000-4000-8000-000000000001';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then raise exception 'FAIL unrelated customer updated another provider schedule'; end if;

  begin
    insert into public.service_provider_schedules (provider_id)
    values ('d1000000-0000-4000-8000-000000000003');
    raise exception 'FAIL customer created a provider schedule';
  exception when insufficient_privilege then
    raise notice 'PASS unrelated customer is denied schedule read/write';
  end;
end $$;
reset role;

-- A different active provider sees only their own row and cannot change the
-- first provider's service areas.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
do $$
declare
  v_rows integer;
  v_updated integer;
begin
  select count(*) into v_rows from public.service_provider_schedules;
  if v_rows <> 1 then raise exception 'FAIL unrelated provider sees % schedule rows instead of one', v_rows; end if;
  update public.service_provider_schedules
     set service_areas = '{OtherProviderTamper}'
   where provider_id = 'd1000000-0000-4000-8000-000000000001';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then raise exception 'FAIL unrelated provider changed owner schedule'; end if;
  raise notice 'PASS unrelated provider is limited to their own schedule';
end $$;
reset role;

-- The provider can read/update their own schedule, cannot see or mutate a
-- different provider, and cannot transfer ownership in an UPDATE.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
do $$
declare
  v_rows integer;
  v_updated integer;
begin
  select count(*) into v_rows from public.service_provider_schedules;
  if v_rows <> 1 then raise exception 'FAIL provider sees % schedule rows instead of one', v_rows; end if;
  update public.service_provider_schedules
     set service_areas = '{OwnerUpdated}'
   where provider_id = 'd1000000-0000-4000-8000-000000000001';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'FAIL provider cannot update own schedule'; end if;
  update public.service_provider_schedules
     set service_areas = '{CrossProviderTamper}'
   where provider_id = 'd1000000-0000-4000-8000-000000000002';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then raise exception 'FAIL provider updated a different provider schedule'; end if;
  begin
    update public.service_provider_schedules
       set provider_id = 'd1000000-0000-4000-8000-000000000002'
     where provider_id = 'd1000000-0000-4000-8000-000000000001';
    raise exception 'FAIL provider transferred their schedule to another owner';
  exception when insufficient_privilege then
    raise notice 'PASS provider can self-manage, with cross-provider and ownership transfer denied';
  end;
end $$;
reset role;

-- A suspended provider retains no direct schedule access even for their own
-- legacy row and cannot insert a replacement.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000005', true);
do $$
declare
  v_rows integer;
  v_updated integer;
begin
  select count(*) into v_rows from public.service_provider_schedules;
  if v_rows <> 0 then raise exception 'FAIL inactive provider sees % schedule rows', v_rows; end if;
  update public.service_provider_schedules
     set service_areas = '{SuspendedTamper}'
   where provider_id = 'd1000000-0000-4000-8000-000000000005';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then raise exception 'FAIL inactive provider updated own schedule'; end if;
  begin
    insert into public.service_provider_schedules (provider_id)
    values ('d1000000-0000-4000-8000-000000000005');
    raise exception 'FAIL inactive provider created a schedule';
  exception when insufficient_privilege then
    raise notice 'PASS inactive provider is denied schedule read/write';
  end;
end $$;
reset role;

-- An active administrator can inspect and administer all schedules.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000004', true);
do $$
declare
  v_rows integer;
  v_updated integer;
begin
  select count(*) into v_rows from public.service_provider_schedules;
  if v_rows <> 3 then raise exception 'FAIL active admin sees % schedules instead of three', v_rows; end if;
  update public.service_provider_schedules
     set travel_radius_km = 26
   where provider_id = 'd1000000-0000-4000-8000-000000000002';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'FAIL active admin cannot update authorized provider schedule'; end if;
  raise notice 'PASS active admin can inspect and administer schedules';
end $$;
reset role;

rollback;
