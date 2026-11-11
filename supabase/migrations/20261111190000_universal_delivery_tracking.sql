-- Universal, booking-scoped delivery tracking for Human Help, Medicine Delivery
-- and Water Bottle Delivery. Additive only: existing bookings/listings are not
-- rewritten, and no hosted project is modified by this repository change.

alter table public.service_bookings
  add column if not exists helper_assigned_at timestamptz,
  add column if not exists tracking_started_at timestamptz,
  add column if not exists tracking_stopped_at timestamptz;

create table if not exists public.service_delivery_profiles (
  booking_id uuid primary key references public.service_bookings(id) on delete cascade,
  service_kind text not null check (service_kind in ('human_help', 'medicine_delivery', 'water_delivery')),
  prescription_status text not null default 'not_required'
    check (prescription_status in ('not_required', 'pending', 'verified', 'rejected')),
  prescription_reference text,
  pharmacy_name text,
  pharmacy_license text,
  recurrence_rule text not null default 'none'
    check (recurrence_rule in ('none', 'daily', 'weekly', 'custom')),
  recurrence_consent_at timestamptz,
  tracking_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medicine_prescription_required check (
    service_kind <> 'medicine_delivery' or prescription_status in ('pending', 'verified', 'rejected')
  ),
  constraint water_recurrence_meta check (
    service_kind = 'water_delivery' or recurrence_rule = 'none'
  )
);

create table if not exists public.service_tracking_locations (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null check (actor_role in ('helper', 'provider')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or (accuracy_meters >= 0 and accuracy_meters <= 5000)),
  heading_degrees double precision check (heading_degrees is null or (heading_degrees >= 0 and heading_degrees < 360)),
  speed_mps double precision check (speed_mps is null or (speed_mps >= 0 and speed_mps <= 200)),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  source text not null default 'device_gps' check (source = 'device_gps')
);

create index if not exists idx_service_tracking_locations_booking_time
  on public.service_tracking_locations (booking_id, captured_at desc);

create table if not exists public.service_tracking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.service_bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'helper_assigned', 'tracking_started', 'tracking_stopped', 'status_changed',
    'otp_generated', 'otp_verified', 'prescription_verified', 'recurrence_updated'
  )),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_tracking_events_booking_time
  on public.service_tracking_events (booking_id, created_at desc);

create table if not exists public.service_delivery_otps (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.service_bookings(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.service_delivery_profiles enable row level security;
alter table public.service_tracking_locations enable row level security;
alter table public.service_tracking_events enable row level security;
alter table public.service_delivery_otps enable row level security;

revoke all on public.service_delivery_otps from public, anon, authenticated;
grant select, insert on public.service_tracking_locations to authenticated;
grant select, insert on public.service_tracking_events to authenticated;
grant select on public.service_delivery_profiles to authenticated;

drop policy if exists "Booking parties read delivery profile" on public.service_delivery_profiles;
create policy "Booking parties read delivery profile"
  on public.service_delivery_profiles for select to authenticated
  using (exists (
    select 1 from public.service_bookings b
    where b.id = service_delivery_profiles.booking_id
      and (b.customer_id = (select auth.uid()) or b.provider_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists "Booking parties read live helper location" on public.service_tracking_locations;
create policy "Booking parties read live helper location"
  on public.service_tracking_locations for select to authenticated
  using (exists (
    select 1 from public.service_bookings b
    where b.id = service_tracking_locations.booking_id
      and (b.customer_id = (select auth.uid()) or b.provider_id = (select auth.uid()) or public.is_admin())
  ));

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
        and b.status in ('accepted', 'in_progress')
        and p.tracking_enabled = true
    )
    and captured_at between now() - interval '5 minutes' and now() + interval '1 minute'
  );

drop policy if exists "Booking parties read tracking events" on public.service_tracking_events;
create policy "Booking parties read tracking events"
  on public.service_tracking_events for select to authenticated
  using (exists (
    select 1 from public.service_bookings b
    where b.id = service_tracking_events.booking_id
      and (b.customer_id = (select auth.uid()) or b.provider_id = (select auth.uid()) or public.is_admin())
  ));

drop policy if exists "Assigned helper writes tracking events" on public.service_tracking_events;
create policy "Assigned helper writes tracking events"
  on public.service_tracking_events for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and exists (
      select 1 from public.service_bookings b
      where b.id = service_tracking_events.booking_id
        and b.provider_id = (select auth.uid())
        and b.status in ('accepted', 'in_progress')
    )
  );

-- OTP generation is customer-only. The plaintext code is returned once to the
-- customer and is never stored; only a SHA-256 hash is kept.
create or replace function public.create_delivery_otp(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.service_bookings%rowtype;
  v_profile public.service_delivery_profiles%rowtype;
  v_code text;
  v_bytes bytea;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_booking from public.service_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.customer_id <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_booking.status not in ('accepted', 'in_progress') then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  select * into v_profile from public.service_delivery_profiles where booking_id = p_booking_id;
  if not found or v_profile.tracking_enabled is not true then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  if v_profile.service_kind = 'medicine_delivery' and v_profile.prescription_status <> 'verified' then
    raise exception 'PRESCRIPTION_NOT_VERIFIED';
  end if;

  v_bytes := gen_random_bytes(3);
  v_code := lpad((((get_byte(v_bytes, 0) * 65536) + (get_byte(v_bytes, 1) * 256) + get_byte(v_bytes, 2)) % 1000000)::text, 6, '0');

  insert into public.service_delivery_otps (booking_id, code_hash, expires_at, created_by)
  values (p_booking_id, encode(digest(v_code, 'sha256'), 'hex'), now() + interval '10 minutes', auth.uid())
  on conflict (booking_id) do update
    set code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        consumed_at = null,
        attempts = 0,
        created_by = excluded.created_by,
        created_at = now();

  insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
  values (p_booking_id, auth.uid(), 'otp_generated', 'Single-use in-app OTP generated');
  return v_code;
end;
$$;

-- The assigned provider/helper verifies the OTP. Correct use consumes it once;
-- wrong attempts are counted and capped.
create or replace function public.verify_delivery_otp(p_booking_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.service_bookings%rowtype;
  v_otp public.service_delivery_otps%rowtype;
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_booking from public.service_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.provider_id <> auth.uid() and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_booking.status not in ('accepted', 'in_progress') then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  select * into v_otp from public.service_delivery_otps where booking_id = p_booking_id for update;
  if not found then raise exception 'OTP_NOT_FOUND'; end if;
  if v_otp.consumed_at is not null then raise exception 'OTP_ALREADY_USED'; end if;
  if v_otp.expires_at <= now() then raise exception 'OTP_EXPIRED'; end if;
  if v_otp.attempts >= v_otp.max_attempts then raise exception 'OTP_ATTEMPTS_EXCEEDED'; end if;
  if length(v_code) <> 6 then raise exception 'OTP_INVALID'; end if;

  if encode(digest(v_code, 'sha256'), 'hex') <> v_otp.code_hash then
    update public.service_delivery_otps set attempts = attempts + 1 where booking_id = p_booking_id;
    return false;
  end if;

  update public.service_delivery_otps set consumed_at = now(), attempts = attempts + 1 where booking_id = p_booking_id;
  insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
  values (p_booking_id, auth.uid(), 'otp_verified', 'Single-use OTP verified');
  return true;
end;
$$;

revoke all on function public.create_delivery_otp(uuid) from public, anon;
revoke all on function public.verify_delivery_otp(uuid, text) from public, anon;
grant execute on function public.create_delivery_otp(uuid) to authenticated;
grant execute on function public.verify_delivery_otp(uuid, text) to authenticated;

-- Stop tracking automatically once the booking reaches a terminal state.
create or replace function public.stop_delivery_tracking_on_terminal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completed', 'cancelled', 'rejected') and old.status is distinct from new.status then
    update public.service_delivery_profiles
       set tracking_enabled = false, updated_at = now()
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

-- Realtime only where the Supabase publication exists (local/hosted Supabase).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_tracking_locations') then
      alter publication supabase_realtime add table public.service_tracking_locations;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_tracking_events') then
      alter publication supabase_realtime add table public.service_tracking_events;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_delivery_profiles') then
      alter publication supabase_realtime add table public.service_delivery_profiles;
    end if;
  end if;
end $$;

comment on table public.service_tracking_locations is
  'Device-GPS locations supplied by the assigned provider. Booking parties read via RLS; stale rows are rejected client-side.';
comment on table public.service_delivery_otps is
  'Server-only single-use delivery OTP hashes. Never exposed to clients directly.';

-- Every existing service booking gets a tracking profile. Medicine starts in
-- "pending" so a prescription must be reviewed before an OTP can be created.
insert into public.service_delivery_profiles (booking_id, service_kind, prescription_status, recurrence_rule)
select b.id,
       case
         when lower(b.category_id || ' ' || b.subcategory) ~ '(medicine|pharmacy|medical|prescription|tablet|drug)' then 'medicine_delivery'
         when lower(b.category_id || ' ' || b.subcategory) ~ '(water|bottle|can|tanker|mineral)' then 'water_delivery'
         else 'human_help'
       end,
       case
         when lower(b.category_id || ' ' || b.subcategory) ~ '(medicine|pharmacy|medical|prescription|tablet|drug)' then 'pending'
         else 'not_required'
       end,
       'none'
  from public.service_bookings b
 where not exists (select 1 from public.service_delivery_profiles p where p.booking_id = b.id);

create or replace function public.ensure_service_delivery_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := lower(coalesce(new.category_id, '') || ' ' || coalesce(new.subcategory, ''));
  v_kind text;
begin
  v_kind := case
    when v_text ~ '(medicine|pharmacy|medical|prescription|tablet|drug)' then 'medicine_delivery'
    when v_text ~ '(water|bottle|can|tanker|mineral)' then 'water_delivery'
    else 'human_help'
  end;
  insert into public.service_delivery_profiles (booking_id, service_kind, prescription_status, recurrence_rule)
  values (new.id, v_kind, case when v_kind = 'medicine_delivery' then 'pending' else 'not_required' end, 'none')
  on conflict (booking_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ensure_service_delivery_profile on public.service_bookings;
create trigger trg_ensure_service_delivery_profile
  after insert on public.service_bookings
  for each row execute function public.ensure_service_delivery_profile();

-- Only an administrator/pharmacy reviewer can change a medicine prescription
-- decision. The plaintext prescription is never stored here; the reference is
-- an opaque document/verification reference.
create or replace function public.review_delivery_prescription(
  p_booking_id uuid,
  p_status text,
  p_reference text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('verified', 'rejected', 'pending') then raise exception 'INVALID_PRESCRIPTION_STATUS'; end if;
  update public.service_delivery_profiles
     set prescription_status = p_status,
         prescription_reference = case when p_status = 'verified' then p_reference else prescription_reference end,
         updated_at = now()
   where booking_id = p_booking_id
     and service_kind = 'medicine_delivery';
  if not found then raise exception 'MEDICINE_PROFILE_NOT_FOUND'; end if;
  insert into public.service_tracking_events (booking_id, actor_id, event_type, note)
  values (p_booking_id, auth.uid(), 'prescription_verified', 'Prescription review: ' || p_status);
end;
$$;

revoke all on function public.review_delivery_prescription(uuid, text, text) from public, anon;
grant execute on function public.review_delivery_prescription(uuid, text, text) to authenticated;
