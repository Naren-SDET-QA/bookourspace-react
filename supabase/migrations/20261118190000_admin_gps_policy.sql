-- Admin-controlled GPS policy (local DEV only until hosted apply is approved).
-- One global row plus per-category toggles already stored on published
-- service category configs. Existing booking GPS snapshots are overlaid at
-- read/start/insert time so an admin change takes effect without redeploy.

begin;

create table if not exists public.service_gps_policy (
  id text primary key check (id = 'global'),
  global_enabled boolean not null default true,
  category_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.service_gps_policy (id, global_enabled)
values ('global', true)
on conflict (id) do nothing;

alter table public.service_gps_policy enable row level security;
alter table public.service_gps_policy force row level security;

drop policy if exists "Authenticated read GPS policy" on public.service_gps_policy;
create policy "Authenticated read GPS policy"
  on public.service_gps_policy
  for select
  to authenticated
  using (true);

revoke all on table public.service_gps_policy from public, anon;
grant select on table public.service_gps_policy to authenticated;

create or replace function public.gps_global_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select global_enabled from public.service_gps_policy where id = 'global'), true);
$$;

create or replace function public.gps_category_enabled(p_category_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := nullif(btrim(coalesce(p_category_id, '')), '');
  v_toggle boolean;
  v_override boolean;
begin
  if v_key is null then
    return true;
  end if;

  select (category_overrides -> v_key ->> 'gpsTracking')::boolean
    into v_override
    from public.service_gps_policy
   where id = 'global';
  if v_override is not null then
    return v_override;
  end if;

  select (version.config->'toggles'->>'gpsTracking')::boolean
    into v_toggle
    from public.service_category_configs category
    join public.service_category_config_versions version
      on version.id = category.current_version_id
   where category.id = v_key
     and version.status = 'published'
   limit 1;
  if v_toggle is not null then
    return v_toggle;
  end if;

  return true;
end;
$$;

create or replace function public.gps_category_live_map_enabled(p_category_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := nullif(btrim(coalesce(p_category_id, '')), '');
  v_toggle boolean;
  v_override boolean;
begin
  if v_key is null then
    return true;
  end if;
  if public.gps_category_enabled(v_key) is not true then
    return false;
  end if;

  select (category_overrides -> v_key ->> 'liveMap')::boolean
    into v_override
    from public.service_gps_policy
   where id = 'global';
  if v_override is not null then
    return v_override;
  end if;

  select (version.config->'toggles'->>'liveMap')::boolean
    into v_toggle
    from public.service_category_configs category
    join public.service_category_config_versions version
      on version.id = category.current_version_id
   where category.id = v_key
     and version.status = 'published'
   limit 1;
  if v_toggle is not null then
    return v_toggle;
  end if;

  return true;
end;
$$;

create or replace function public.gps_effective_enabled(p_booking_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking public.service_bookings%rowtype;
begin
  if p_booking_id is null then
    return false;
  end if;
  if public.gps_global_enabled() is not true then
    return false;
  end if;
  select * into v_booking from public.service_bookings where id = p_booking_id;
  if not found then
    return false;
  end if;
  if v_booking.status not in ('accepted', 'assigned', 'travelling', 'arrived', 'started', 'in_progress') then
    return false;
  end if;
  if public.gps_category_enabled(v_booking.category_config_id) is not true then
    return false;
  end if;
  if public.gps_category_enabled(v_booking.category_id) is not true then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.gps_global_enabled() from public, anon;
revoke all on function public.gps_category_enabled(text) from public, anon;
revoke all on function public.gps_category_live_map_enabled(text) from public, anon;
revoke all on function public.gps_effective_enabled(uuid) from public, anon;
grant execute on function public.gps_global_enabled() to authenticated;
grant execute on function public.gps_category_enabled(text) to authenticated;
grant execute on function public.gps_category_live_map_enabled(text) to authenticated;
grant execute on function public.gps_effective_enabled(uuid) to authenticated;

create or replace function public.gps_stop_matching_sessions(p_category_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.service_bookings
     set tracking_stopped_at = coalesce(tracking_stopped_at, now())
   where status in ('accepted', 'assigned', 'travelling', 'arrived', 'started', 'in_progress')
     and (
       tracking_started_at is not null
       and (tracking_stopped_at is null or tracking_started_at > tracking_stopped_at)
     )
     and (
       p_category_id is null
       or category_id = p_category_id
       or category_config_id = p_category_id
     );

  update public.service_delivery_profiles p
     set journey_status = 'stopped',
         updated_at = now()
   where exists (
     select 1
       from public.service_bookings b
      where b.id = p.booking_id
        and b.status in ('accepted', 'assigned', 'travelling', 'arrived', 'started', 'in_progress')
        and (
          p_category_id is null
          or b.category_id = p_category_id
          or b.category_config_id = p_category_id
        )
   );
end;
$$;

revoke all on function public.gps_stop_matching_sessions(text) from public, anon, authenticated;

create or replace function public.admin_set_gps_global(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_enabled is null then raise exception 'INVALID_GPS_POLICY'; end if;

  insert into public.service_gps_policy (id, global_enabled, updated_at, updated_by)
  values ('global', p_enabled, now(), auth.uid())
  on conflict (id) do update
     set global_enabled = excluded.global_enabled,
         updated_at = now(),
         updated_by = auth.uid();

  if p_enabled is not true then
    perform public.gps_stop_matching_sessions(null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'globalEnabled', p_enabled,
    'updatedAt', now(),
    'updatedBy', auth.uid()
  );
end;
$$;

create or replace function public.admin_set_category_gps(
  p_category_id text,
  p_gps_tracking boolean,
  p_live_map boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := nullif(btrim(coalesce(p_category_id, '')), '');
  v_gps boolean := p_gps_tracking;
  v_map boolean := coalesce(p_live_map, p_gps_tracking);
  v_entry jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_key is null or v_key !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'INVALID_GPS_CATEGORY';
  end if;
  if v_gps is null then raise exception 'INVALID_GPS_POLICY'; end if;
  if v_gps is not true then v_map := false; end if;

  v_entry := jsonb_build_object('gpsTracking', v_gps, 'liveMap', v_map);

  insert into public.service_gps_policy (id, global_enabled, category_overrides, updated_at, updated_by)
  values ('global', true, jsonb_build_object(v_key, v_entry), now(), auth.uid())
  on conflict (id) do update
     set category_overrides = coalesce(public.service_gps_policy.category_overrides, '{}'::jsonb) || jsonb_build_object(v_key, v_entry),
         updated_at = now(),
         updated_by = auth.uid();

  update public.service_delivery_profiles p
     set tracking_enabled = v_gps,
         live_map_enabled = v_map,
         updated_at = now()
   where exists (
     select 1
       from public.service_bookings b
      where b.id = p.booking_id
        and b.status in ('accepted', 'assigned', 'travelling', 'arrived', 'started', 'in_progress')
        and (b.category_id = v_key or b.category_config_id = v_key)
   );

  if v_gps is not true then
    perform public.gps_stop_matching_sessions(v_key);
  end if;

  return jsonb_build_object(
    'ok', true,
    'categoryId', v_key,
    'gpsTracking', v_gps,
    'liveMap', v_map,
    'updatedAt', now(),
    'updatedBy', auth.uid()
  );
end;
$$;

revoke all on function public.admin_set_gps_global(boolean) from public, anon;
revoke all on function public.admin_set_category_gps(text, boolean, boolean) from public, anon;
grant execute on function public.admin_set_gps_global(boolean) to authenticated;
grant execute on function public.admin_set_category_gps(text, boolean, boolean) to authenticated;

drop policy if exists "Assigned helper publishes live location" on public.service_tracking_locations;
create policy "Assigned helper publishes live location"
  on public.service_tracking_locations for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and actor_role in ('helper', 'provider')
    and public.gps_effective_enabled(service_tracking_locations.booking_id)
    and exists (
      select 1
      from public.service_bookings b
      join public.service_delivery_profiles p on p.booking_id = b.id
      where b.id = service_tracking_locations.booking_id
        and b.provider_id = (select auth.uid())
        and b.status in ('accepted', 'assigned', 'travelling', 'arrived', 'started', 'in_progress')
        and (
          b.tracking_stopped_at is null
          or (b.tracking_started_at is not null and b.tracking_started_at > b.tracking_stopped_at)
        )
    )
    and captured_at between now() - interval '5 minutes' and now() + interval '1 minute'
  );

create or replace function public.start_service_tracking(
  p_booking_id uuid,
  p_destination_latitude double precision default null,
  p_destination_longitude double precision default null,
  p_vehicle_label text default null,
  p_assignee_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.service_bookings%rowtype;
  v_profile public.service_delivery_profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_booking from public.service_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.provider_id <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_booking.status not in ('accepted', 'assigned', 'travelling', 'arrived', 'started', 'in_progress') then
    raise exception 'TRACKING_NOT_ACTIVE';
  end if;
  if public.gps_effective_enabled(p_booking_id) is not true then
    raise exception 'TRACKING_NOT_ACTIVE';
  end if;
  select * into v_profile from public.service_delivery_profiles where booking_id = p_booking_id for update;
  if not found then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  if p_destination_latitude is not null and p_destination_longitude is not null then
    if p_destination_latitude < -90 or p_destination_latitude > 90
       or p_destination_longitude < -180 or p_destination_longitude > 180 then
      raise exception 'INVALID_LOCATION_COORDINATES';
    end if;
  elsif p_destination_latitude is not null or p_destination_longitude is not null then
    raise exception 'INVALID_LOCATION_COORDINATES';
  end if;

  update public.service_bookings
     set helper_assigned_at = coalesce(helper_assigned_at, now()),
         tracking_started_at = now(),
         tracking_stopped_at = null
   where id = p_booking_id;

  update public.service_delivery_profiles
     set journey_status = case when journey_status in ('arrived') then journey_status else 'en_route' end,
         tracking_enabled = true,
         live_map_enabled = public.gps_category_live_map_enabled(coalesce(v_booking.category_config_id, v_booking.category_id)),
         destination_latitude = coalesce(p_destination_latitude, destination_latitude),
         destination_longitude = coalesce(p_destination_longitude, destination_longitude),
         vehicle_label = coalesce(nullif(btrim(p_vehicle_label), ''), vehicle_label),
         assignee_label = coalesce(nullif(btrim(p_assignee_label), ''), assignee_label),
         assignee_id = coalesce(assignee_id, v_booking.worker_id, v_booking.provider_id),
         assignee_kind = case when v_booking.worker_id is not null then 'worker' else assignee_kind end,
         updated_at = now()
   where booking_id = p_booking_id;

  insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
  values (p_booking_id, auth.uid(), 'tracking_started', 'Assigned person started live GPS sharing');

  return jsonb_build_object('ok', true, 'bookingId', p_booking_id, 'startedAt', now());
end;
$$;

create or replace function public.apply_service_gps_metrics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.service_delivery_profiles%rowtype;
  v_distance integer;
  v_eta integer;
  v_status text;
  v_speed double precision;
begin
  if public.gps_effective_enabled(new.booking_id) is not true then
    return new;
  end if;
  select * into v_profile from public.service_delivery_profiles where booking_id = new.booking_id;
  if not found then
    return new;
  end if;

  v_distance := public.gps_haversine_meters(
    new.latitude, new.longitude,
    v_profile.destination_latitude, v_profile.destination_longitude
  );
  v_speed := coalesce(nullif(new.speed_mps, 0), 6.11);
  if v_speed < 1.5 then v_speed := 6.11; end if;
  if v_distance is not null then
    v_eta := ceil(v_distance / v_speed)::integer;
    if v_distance <= 80 then v_status := 'arrived';
    elsif v_distance <= 400 then v_status := 'arriving';
    else v_status := 'en_route';
    end if;
  else
    v_status := 'en_route';
  end if;

  update public.service_delivery_profiles
     set distance_meters = v_distance,
         eta_seconds = v_eta,
         last_accuracy_meters = new.accuracy_meters,
         journey_status = v_status,
         updated_at = now()
   where booking_id = new.booking_id;

  if v_status = 'arrived' and v_profile.journey_status is distinct from 'arrived' then
    insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
    values (new.booking_id, new.actor_id, 'arrived', 'Assigned person is within 80 metres of the destination');
  elsif v_status = 'arriving' and v_profile.journey_status not in ('arriving', 'arrived') then
    insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
    values (new.booking_id, new.actor_id, 'arriving', 'Assigned person is approaching the destination');
  elsif v_status = 'en_route' and v_profile.journey_status in ('idle', 'awaiting_permission', 'stopped') then
    insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
    values (new.booking_id, new.actor_id, 'en_route', 'Journey started');
  end if;

  return new;
end;
$$;

comment on table public.service_gps_policy is
  'Single-row admin GPS kill-switch and per-category overrides. Writes only via admin RPCs.';
comment on function public.gps_effective_enabled(uuid) is
  'Live GPS is on only when the global switch, category toggle and live booking status all allow it.';
comment on function public.admin_set_gps_global(boolean) is
  'Admin-only global GPS enable/disable. Takes effect immediately without redeploy.';
comment on function public.admin_set_category_gps(text, boolean, boolean) is
  'Admin-only per-category GPS/live-map toggle. Syncs live booking profiles immediately.';

commit;
