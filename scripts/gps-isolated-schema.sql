-- Isolated GPS load-test replica. Not a production migration. Loopback only.
begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists public.gps_load_bookings (
  id uuid primary key,
  customer_id uuid not null,
  provider_id uuid not null,
  status text not null default 'accepted',
  booking_ref text not null
);

create table if not exists public.service_tracking_locations (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.gps_load_bookings(id) on delete cascade,
  actor_id uuid not null,
  actor_role text not null default 'helper',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision,
  heading_degrees double precision,
  speed_mps double precision,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  source text not null default 'device_gps'
);

create index if not exists idx_service_tracking_locations_booking_time
  on public.service_tracking_locations (booking_id, captured_at desc);
create index if not exists idx_service_tracking_locations_received_at
  on public.service_tracking_locations (received_at desc);

create or replace function public.service_tracking_rate_guard()
returns trigger
language plpgsql
as $$
declare
  v_last timestamptz;
begin
  select max(captured_at) into v_last
    from public.service_tracking_locations
   where booking_id = new.booking_id;
  if v_last is not null and new.captured_at < v_last + interval '5 seconds' then
    raise exception 'TRACKING_UPDATE_TOO_FREQUENT' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_tracking_rate_guard on public.service_tracking_locations;
create trigger trg_service_tracking_rate_guard
  before insert on public.service_tracking_locations
  for each row execute function public.service_tracking_rate_guard();

alter table public.service_tracking_locations enable row level security;
alter table public.service_tracking_locations force row level security;
drop policy if exists "Assigned helper publishes live location" on public.service_tracking_locations;
create policy "Assigned helper publishes live location"
  on public.service_tracking_locations for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.gps_load_bookings b
       where b.id = booking_id
         and b.provider_id = auth.uid()
         and b.status not in ('completed', 'cancelled', 'rejected')
    )
  );
drop policy if exists "Booking parties read live location" on public.service_tracking_locations;
create policy "Booking parties read live location"
  on public.service_tracking_locations for select to authenticated
  using (
    exists (
      select 1 from public.gps_load_bookings b
       where b.id = booking_id
         and (b.provider_id = auth.uid() or b.customer_id = auth.uid())
    )
  );

revoke all on public.gps_load_bookings from public, anon;
grant select on public.gps_load_bookings to authenticated;
grant all on public.gps_load_bookings to service_role;
revoke all on public.service_tracking_locations from public, anon;
grant select, insert on public.service_tracking_locations to authenticated;
grant all on public.service_tracking_locations to service_role;
grant usage, select on sequence public.service_tracking_locations_id_seq to authenticated, service_role;

create table if not exists public.service_tracking_links (
  booking_id uuid primary key references public.gps_load_bookings(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create or replace function public.purge_old_service_tracking_locations(p_retain interval default interval '24 hours')
returns integer
language plpgsql
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.service_tracking_locations
   where received_at < now() - p_retain
     and id not in (
       select distinct on (booking_id) id
         from public.service_tracking_locations
        order by booking_id, captured_at desc
     );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

commit;
