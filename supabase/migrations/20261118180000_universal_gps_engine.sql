-- Universal GPS tracking engine (local DEV only until hosted apply is approved).
-- Reuses service_tracking_locations / events / delivery_profiles and booking
-- assignment. No new GPS table. No phone-number location. No public coordinates.

begin;

-- Destination, assignee/vehicle, journey metrics live on the existing
-- booking-scoped delivery profile. GPS stays optional via tracking_enabled.
alter table public.service_delivery_profiles
  add column if not exists destination_latitude double precision
    check (destination_latitude is null or destination_latitude between -90 and 90),
  add column if not exists destination_longitude double precision
    check (destination_longitude is null or destination_longitude between -180 and 180),
  add column if not exists assignee_kind text not null default 'provider'
    check (assignee_kind in ('provider', 'worker', 'driver')),
  add column if not exists assignee_id uuid,
  add column if not exists assignee_label text,
  add column if not exists vehicle_label text,
  add column if not exists journey_status text not null default 'idle'
    check (journey_status in ('idle', 'awaiting_permission', 'en_route', 'arriving', 'arrived', 'stopped')),
  add column if not exists distance_meters integer
    check (distance_meters is null or distance_meters >= 0),
  add column if not exists eta_seconds integer
    check (eta_seconds is null or eta_seconds >= 0),
  add column if not exists last_accuracy_meters double precision
    check (last_accuracy_meters is null or (last_accuracy_meters >= 0 and last_accuracy_meters <= 5000));

alter table public.service_delivery_profiles drop constraint if exists service_delivery_profiles_destination_pair;
alter table public.service_delivery_profiles
  add constraint service_delivery_profiles_destination_pair
  check (
    (destination_latitude is null and destination_longitude is null)
    or (destination_latitude is not null and destination_longitude is not null)
  );

alter table public.service_tracking_events drop constraint if exists service_tracking_events_event_type_check;
alter table public.service_tracking_events
  add constraint service_tracking_events_event_type_check
  check (event_type in (
    'helper_assigned', 'tracking_started', 'tracking_stopped', 'status_changed',
    'otp_generated', 'otp_verified', 'prescription_verified', 'recurrence_updated',
    'en_route', 'arriving', 'arrived', 'assignee_set', 'gps_inaccurate'
  ));

-- Live GPS is booking-status driven, not service-name driven.
drop policy if exists "Assigned helper publishes live location" on public.service_tracking_locations;
create policy "Assigned helper publishes live location"
  on public.service_tracking_locations for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and actor_role in ('helper', 'provider')
    and exists (
      select 1
      from public.service_bookings b
      join public.service_delivery_profiles p on p.booking_id = b.id
      where b.id = service_tracking_locations.booking_id
        and b.provider_id = (select auth.uid())
        and b.status in ('accepted', 'assigned', 'travelling', 'arrived', 'started', 'in_progress')
        and p.tracking_enabled = true
        and (
          b.tracking_stopped_at is null
          or (b.tracking_started_at is not null and b.tracking_started_at > b.tracking_stopped_at)
        )
    )
    and captured_at between now() - interval '5 minutes' and now() + interval '1 minute'
  );

create or replace function public.gps_haversine_meters(
  p_lat1 double precision,
  p_lon1 double precision,
  p_lat2 double precision,
  p_lon2 double precision
)
returns integer
language sql
immutable
as $$
  select case
    when p_lat1 is null or p_lon1 is null or p_lat2 is null or p_lon2 is null then null
    else round(
      6371000 * 2 * asin(sqrt(
        power(sind((p_lat2 - p_lat1) / 2), 2)
        + cosd(p_lat1) * cosd(p_lat2) * power(sind((p_lon2 - p_lon1) / 2), 2)
      ))
    )::integer
  end;
$$;

revoke all on function public.gps_haversine_meters(double precision, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.gps_haversine_meters(double precision, double precision, double precision, double precision)
  to authenticated;

-- Copy GPS/live-map from category config. Digital services default GPS off
-- unless the published config explicitly enables it.
create or replace function public.ensure_service_delivery_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := lower(coalesce(new.category_id, '') || ' ' || coalesce(new.subcategory, ''));
  v_kind text;
  v_config jsonb := case when jsonb_typeof(new.config_snapshot) = 'object' then new.config_snapshot else '{}'::jsonb end;
  v_recurrence text;
  v_gps boolean;
  v_map boolean;
begin
  v_kind := coalesce(nullif(v_config->>'deliveryKind', ''), '');
  if v_kind not in ('human_help', 'medicine_delivery', 'water_delivery') then
    v_kind := case
      when v_text ~ '(medicine|pharmacy|medical|prescription|tablet|drug)' then 'medicine_delivery'
      when v_text ~ '(water|bottle|can|tanker|mineral)' then 'water_delivery'
      else 'human_help'
    end;
  end if;
  if public.service_catalog_is_medicine(new.category_config_id, v_config) then
    v_kind := 'medicine_delivery';
  end if;

  v_recurrence := case new.recurrence_frequency
    when 'daily' then 'daily'
    when 'weekly' then 'weekly'
    when 'monthly' then 'custom'
    else 'none'
  end;
  if v_recurrence <> 'none' and v_kind <> 'water_delivery' and new.category_config_id is null then
    v_recurrence := 'none';
  end if;

  v_gps := coalesce(
    (v_config->'toggles'->>'gpsTracking')::boolean,
    case when new.delivery_mode = 'digital' then false else true end
  );
  v_map := coalesce((v_config->'toggles'->>'liveMap')::boolean, v_gps);

  insert into public.service_delivery_profiles (
    booking_id, service_kind, prescription_status, recurrence_rule, category_id,
    tracking_enabled, live_map_enabled, otp_enabled, delivery_confirmation_enabled, prescription_required,
    assignee_kind, assignee_id, journey_status
  )
  values (
    new.id,
    v_kind,
    case when v_kind = 'medicine_delivery' then 'pending' else 'not_required' end,
    v_recurrence,
    new.category_config_id,
    v_gps,
    v_map,
    coalesce((v_config->'toggles'->>'customerOtp')::boolean, true),
    coalesce((v_config->'toggles'->>'deliveryConfirmation')::boolean, false),
    v_kind = 'medicine_delivery',
    'provider',
    new.provider_id,
    'idle'
  )
  on conflict (booking_id) do nothing;
  return new;
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
  select * into v_profile from public.service_delivery_profiles where booking_id = new.booking_id;
  if not found or v_profile.tracking_enabled is not true then
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

drop trigger if exists trg_apply_service_gps_metrics on public.service_tracking_locations;
create trigger trg_apply_service_gps_metrics
  after insert on public.service_tracking_locations
  for each row execute function public.apply_service_gps_metrics();

revoke all on function public.apply_service_gps_metrics() from public, anon, authenticated;

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
  select * into v_profile from public.service_delivery_profiles where booking_id = p_booking_id for update;
  if not found or v_profile.tracking_enabled is not true then raise exception 'TRACKING_NOT_ACTIVE'; end if;
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

create or replace function public.stop_service_tracking(
  p_booking_id uuid,
  p_reason text default 'provider_stopped'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.service_bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_booking from public.service_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.provider_id <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  update public.service_bookings
     set tracking_stopped_at = now()
   where id = p_booking_id;

  update public.service_delivery_profiles
     set journey_status = 'stopped',
         updated_at = now()
   where booking_id = p_booking_id;

  insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
  values (p_booking_id, auth.uid(), 'tracking_stopped', left(coalesce(p_reason, 'provider_stopped'), 200));

  return jsonb_build_object('ok', true, 'bookingId', p_booking_id, 'stoppedAt', now());
end;
$$;

revoke all on function public.start_service_tracking(uuid, double precision, double precision, text, text) from public, anon;
revoke all on function public.stop_service_tracking(uuid, text) from public, anon;
grant execute on function public.start_service_tracking(uuid, double precision, double precision, text, text) to authenticated;
grant execute on function public.stop_service_tracking(uuid, text) to authenticated;

-- Assignment stamps the booking and profile. Unassigned people are never tracked.
create or replace function public.stamp_service_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  if new.status in ('accepted', 'assigned') and (old.status is distinct from new.status or new.worker_id is distinct from old.worker_id) then
    new.helper_assigned_at := coalesce(new.helper_assigned_at, now());
    select coalesce(w.full_name, p.full_name)
      into v_label
      from public.profiles p
      left join public.service_workers w on w.id = new.worker_id
     where p.id = new.provider_id;
    update public.service_delivery_profiles
       set assignee_id = coalesce(new.worker_id, new.provider_id),
           assignee_kind = case when new.worker_id is not null then 'worker' else 'provider' end,
           assignee_label = v_label,
           updated_at = now()
     where booking_id = new.id;
    if old.helper_assigned_at is null then
      insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
      values (new.id, auth.uid(), 'helper_assigned', 'Assigned person linked to this booking');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_service_assignment on public.service_bookings;
create trigger trg_stamp_service_assignment
  before update of status, worker_id on public.service_bookings
  for each row execute function public.stamp_service_assignment();

create or replace function public.stop_delivery_tracking_on_terminal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completed', 'cancelled', 'rejected') and old.status is distinct from new.status then
    update public.service_delivery_profiles
       set tracking_enabled = false,
           journey_status = 'stopped',
           updated_at = now()
     where booking_id = new.id;
    new.tracking_stopped_at := coalesce(new.tracking_stopped_at, now());
    insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
    values (new.id, auth.uid(), 'tracking_stopped', 'Tracking stopped after terminal booking status');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stop_delivery_tracking_on_terminal on public.service_bookings;
create trigger trg_stop_delivery_tracking_on_terminal
  before update of status on public.service_bookings
  for each row execute function public.stop_delivery_tracking_on_terminal();

comment on function public.start_service_tracking(uuid, double precision, double precision, text, text) is
  'Assigned provider starts live GPS for one booking. Requires explicit consent in the client.';
comment on function public.stop_service_tracking(uuid, text) is
  'Assigned provider stops live GPS. Terminal booking statuses also stop tracking.';

commit;
