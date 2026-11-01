-- ============================================================================
-- 002: Marketplace module flags + stay/hotel date-range inventory
--
-- Additive only. Creates no changes to existing tables (profiles, listings,
-- bookings, enquiries, transactions, reviews) and deletes no records.
-- Safe to run against a fresh development project.
--
-- Design notes
--  * Module enablement lives in the database, not localStorage, so the server
--    can enforce it. `user_module_configs` (existing) stays untouched: it is a
--    per-user UI preference, not an authorization source.
--  * Movie ticket checkout is OFF by default and additionally requires an
--    explicit approval timestamp. Discovery (listing + showtimes) needs no
--    approval.
--  * Room allocation uses ONE table for holds and confirmed stays, with a
--    PostgreSQL exclusion constraint. The database, not application code, is
--    what makes double allocation impossible under concurrency.
-- ============================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Platform module flags (admin controlled)
-- ---------------------------------------------------------------------------

create table if not exists public.platform_module_flags (
  module_key            text primary key,
  is_enabled            boolean not null default true,
  allow_contact_owner    boolean not null default true,
  allow_online_booking   boolean not null default false,
  requires_owner_approval boolean not null default true,
  -- Movies: bookings stay blocked until a human records approval.
  booking_approved_at   timestamptz,
  booking_approved_by   uuid references auth.users(id) on delete set null,
  notes                 text,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id) on delete set null,
  constraint platform_module_flags_key_chk
    check (module_key in ('services','hotels','pg','function_hall','classes','movies','ecommerce'))
);

alter table public.platform_module_flags enable row level security;

-- Everyone may read the flags: the client must be able to hide disabled
-- modules, and hiding is a UX nicety, never the security boundary.
drop policy if exists "Module flags are publicly readable" on public.platform_module_flags;
create policy "Module flags are publicly readable"
  on public.platform_module_flags for select
  to anon, authenticated
  using (true);

drop policy if exists "Only admins may write module flags" on public.platform_module_flags;
create policy "Only admins may write module flags"
  on public.platform_module_flags for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Baselined rows. Movies: discovery on, ticket checkout off, unapproved.
insert into public.platform_module_flags
  (module_key, is_enabled, allow_contact_owner, allow_online_booking, requires_owner_approval, notes)
values
  ('services',      true,  true,  true,  true,  'Existing local-services marketplace'),
  ('hotels',        true,  true,  true,  true,  'Airbnb-inspired stays'),
  ('pg',            true,  true,  true,  true,  'Paying-guest accommodation'),
  ('function_hall', true,  true,  true,  true,  'Halls and venues'),
  ('classes',       true,  true,  false, false, 'Enquiries are not paid enrolments'),
  ('movies',        true,  true,  false, true,  'Discovery only: checkout requires explicit approval'),
  ('ecommerce',     false, true,  false, true,  'Not launched')
on conflict (module_key) do nothing;

-- Guard: a module can never expose online booking for movies without approval.
create or replace function public.enforce_movie_booking_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.module_key = 'movies' and new.allow_online_booking and new.booking_approved_at is null then
    raise exception 'MOVIE_BOOKING_NOT_APPROVED: set booking_approved_at before enabling movie checkout'
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_movie_booking_approval on public.platform_module_flags;
create trigger trg_enforce_movie_booking_approval
  before insert or update on public.platform_module_flags
  for each row execute function public.enforce_movie_booking_approval();

-- ---------------------------------------------------------------------------
-- 2. Owner contact consent + click tracking (Option 1: Contact Owner)
-- ---------------------------------------------------------------------------

create table if not exists public.provider_contact_settings (
  listing_id            uuid primary key references public.listings(id) on delete cascade,
  -- Which module this listing belongs to. Kept here because public.listings
  -- has no module column of its own (only category_id/entity_type).
  module_key            text not null default 'services'
                        check (module_key in ('services','hotels','pg','function_hall','classes','movies')),
  owner_user_id         uuid not null references auth.users(id) on delete cascade,
  business_phone        text,
  business_phone_verified_at timestamptz,
  whatsapp_number       text,
  whatsapp_verified_at  timestamptz,
  -- Default false: a number is never published until the owner opts in.
  publish_phone         boolean not null default false,
  publish_whatsapp      boolean not null default false,
  consent_recorded_at   timestamptz,
  updated_at            timestamptz not null default now()
);

alter table public.provider_contact_settings enable row level security;

drop policy if exists "Owners manage their contact settings" on public.provider_contact_settings;
create policy "Owners manage their contact settings"
  on public.provider_contact_settings for all
  to authenticated
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

create table if not exists public.provider_contact_events (
  id            bigserial primary key,
  listing_id    uuid not null references public.listings(id) on delete cascade,
  channel       text not null check (channel in ('call','whatsapp')),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_provider_contact_events_listing
  on public.provider_contact_events (listing_id, created_at desc);

alter table public.provider_contact_events enable row level security;

-- Owners and admins read the analytics; writes go through the RPC below only.
drop policy if exists "Owners read their contact analytics" on public.provider_contact_events;
create policy "Owners read their contact analytics"
  on public.provider_contact_events for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.listings l
      where l.id = provider_contact_events.listing_id and l.owner_id = auth.uid()
    )
  );

-- Returns the number ONLY when the owner has opted in and verified it.
create or replace function public.provider_contact_details(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.provider_contact_settings;
  v_module public.platform_module_flags;
  v_result jsonb := jsonb_build_object('available', false);
begin
  -- Consent is checked first: without an opted-in owner there is nothing to show,
  -- whatever the module flags say.
  select * into v_row from public.provider_contact_settings where listing_id = p_listing_id;
  if v_row is null or v_row.consent_recorded_at is null then
    return v_result;
  end if;

  select * into v_module from public.platform_module_flags where module_key = v_row.module_key;
  if v_module is null or not v_module.is_enabled or not v_module.allow_contact_owner then
    return v_result;
  end if;

  v_result := jsonb_build_object(
    'available', true,
    'phone', case when v_row.publish_phone and v_row.business_phone_verified_at is not null
                  then v_row.business_phone end,
    'whatsapp', case when v_row.publish_whatsapp and v_row.whatsapp_verified_at is not null
                     then v_row.whatsapp_number end,
    'disclaimer',
      'Bookings made outside BookOurSpace are not automatically confirmed by the platform.'
  );
  return v_result;
end;
$$;

create or replace function public.record_contact_click(p_listing_id uuid, p_channel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module public.platform_module_flags;
begin
  if p_channel not in ('call','whatsapp') then
    raise exception 'INVALID_CHANNEL' using errcode = '22023';
  end if;

  select * into v_module
    from public.platform_module_flags f
    join public.provider_contact_settings s on s.module_key = f.module_key
   where s.listing_id = p_listing_id;

  if v_module is null or not v_module.is_enabled or not v_module.allow_contact_owner then
    raise exception 'CONTACT_OWNER_DISABLED' using errcode = '42501';
  end if;

  insert into public.provider_contact_events (listing_id, channel, actor_user_id)
  values (p_listing_id, p_channel, auth.uid());
end;
$$;

grant execute on function public.provider_contact_details(uuid) to anon, authenticated;
grant execute on function public.record_contact_click(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Stay inventory: property -> room type -> physical room units
-- ---------------------------------------------------------------------------

create table if not exists public.stay_properties (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid unique references public.listings(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  property_type text not null default 'hotel'
                check (property_type in ('hotel','resort','homestay','apartment','villa','guesthouse')),
  city          text not null,
  area          text,
  address       text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  check_in_time  time not null default '14:00',
  check_out_time time not null default '11:00',
  base_price_paise int not null default 0 check (base_price_paise >= 0),
  tax_percent   numeric(5,2) not null default 12 check (tax_percent >= 0),
  description   text,
  amenities     text[] not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_stay_properties_city on public.stay_properties (city) where is_active;
create index if not exists idx_stay_properties_owner on public.stay_properties (owner_user_id);

create table if not exists public.stay_room_types (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.stay_properties(id) on delete cascade,
  name           text not null,
  max_adults     int not null default 2 check (max_adults > 0),
  max_children   int not null default 0 check (max_children >= 0),
  base_price_paise int not null check (base_price_paise >= 0),
  amenities      text[] not null default '{}',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists idx_stay_room_types_property on public.stay_room_types (property_id) where is_active;

-- One row per physical, individually bookable room.
create table if not exists public.stay_units (
  id           uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.stay_room_types(id) on delete cascade,
  label        text not null,
  floor        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (room_type_id, label)
);

create index if not exists idx_stay_units_room_type on public.stay_units (room_type_id) where is_active;

-- Owner-declared closures (maintenance, blocked dates). Kept separate from
-- allocations so a block never masquerades as a customer booking.
create table if not exists public.stay_blocks (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.stay_units(id) on delete cascade,
  stay_dates daterange not null,
  reason     text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stay_blocks_valid_range check (not isempty(stay_dates)),
  constraint stay_blocks_no_overlap exclude using gist (unit_id with =, stay_dates with &&)
);

-- Holds AND confirmed stays share this table. status='expired'/'released' rows
-- keep their audit trail but no longer block, which is why the exclusion
-- constraint is partial.
create table if not exists public.stay_allocations (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.stay_units(id) on delete cascade,
  booking_id    uuid references public.bookings(id) on delete set null,
  status        text not null default 'held'
                check (status in ('held','confirmed','released','expired')),
  stay_dates    daterange not null,
  guest_user_id uuid references auth.users(id) on delete set null,
  hold_token    uuid not null default gen_random_uuid(),
  expires_at    timestamptz,
  total_paise   int check (total_paise >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint stay_allocations_valid_range check (not isempty(stay_dates)),
  constraint stay_allocations_hold_expiry
    check (status <> 'held' or expires_at is not null)
);

-- THE double-booking guard. Two overlapping held/confirmed allocations on the
-- same physical unit cannot coexist, whatever the application does.
alter table public.stay_allocations
  drop constraint if exists stay_allocations_no_overlap;
alter table public.stay_allocations
  add constraint stay_allocations_no_overlap
  exclude using gist (unit_id with =, stay_dates with &&)
  where (status in ('held','confirmed'));

create index if not exists idx_stay_allocations_unit_status
  on public.stay_allocations (unit_id, status, expires_at);
create index if not exists idx_stay_allocations_booking on public.stay_allocations (booking_id);

alter table public.stay_properties  enable row level security;
alter table public.stay_room_types  enable row level security;
alter table public.stay_units       enable row level security;
alter table public.stay_blocks      enable row level security;
alter table public.stay_allocations enable row level security;

drop policy if exists "Active properties are publicly readable" on public.stay_properties;
create policy "Active properties are publicly readable"
  on public.stay_properties for select to anon, authenticated using (is_active);

drop policy if exists "Owners manage their properties" on public.stay_properties;
create policy "Owners manage their properties"
  on public.stay_properties for all to authenticated
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

drop policy if exists "Active room types are publicly readable" on public.stay_room_types;
create policy "Active room types are publicly readable"
  on public.stay_room_types for select to anon, authenticated using (is_active);

drop policy if exists "Owners manage their room types" on public.stay_room_types;
create policy "Owners manage their room types"
  on public.stay_room_types for all to authenticated
  using (exists (
    select 1 from public.stay_properties p
    where p.id = stay_room_types.property_id
      and (p.owner_user_id = auth.uid() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.stay_properties p
    where p.id = stay_room_types.property_id
      and (p.owner_user_id = auth.uid() or public.is_admin())
  ));

-- Unit rows are needed by the availability checker, so they are readable;
-- writes stay with the owner.
drop policy if exists "Units are publicly readable" on public.stay_units;
create policy "Units are publicly readable"
  on public.stay_units for select to anon, authenticated using (true);

drop policy if exists "Owners manage their units" on public.stay_units;
create policy "Owners manage their units"
  on public.stay_units for all to authenticated
  using (exists (
    select 1 from public.stay_room_types rt
    join public.stay_properties p on p.id = rt.property_id
    where rt.id = stay_units.room_type_id
      and (p.owner_user_id = auth.uid() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.stay_room_types rt
    join public.stay_properties p on p.id = rt.property_id
    where rt.id = stay_units.room_type_id
      and (p.owner_user_id = auth.uid() or public.is_admin())
  ));

drop policy if exists "Owners manage their blocks" on public.stay_blocks;
create policy "Owners manage their blocks"
  on public.stay_blocks for all to authenticated
  using (exists (
    select 1 from public.stay_units u
    join public.stay_room_types rt on rt.id = u.room_type_id
    join public.stay_properties p on p.id = rt.property_id
    where u.id = stay_blocks.unit_id
      and (p.owner_user_id = auth.uid() or public.is_admin())
  ))
  with check (exists (
    select 1 from public.stay_units u
    join public.stay_room_types rt on rt.id = u.room_type_id
    join public.stay_properties p on p.id = rt.property_id
    where u.id = stay_blocks.unit_id
      and (p.owner_user_id = auth.uid() or public.is_admin())
  ));

-- A guest sees their own allocation; the owner sees allocations on their
-- properties. Nobody else's dates are ever exposed. Writes via RPC only.
drop policy if exists "Guests and owners read relevant allocations" on public.stay_allocations;
create policy "Guests and owners read relevant allocations"
  on public.stay_allocations for select to authenticated
  using (
    guest_user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.stay_units u
      join public.stay_room_types rt on rt.id = u.room_type_id
      join public.stay_properties p on p.id = rt.property_id
      where u.id = stay_allocations.unit_id and p.owner_user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.stay_allocations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Availability + hold RPCs
-- ---------------------------------------------------------------------------

-- Expired holds are swept before every read/write so they never block a sale.
create or replace function public.sweep_expired_stay_holds()
returns int
language sql
security definer
set search_path = public
as $$
  with swept as (
    update public.stay_allocations
       set status = 'expired', updated_at = now()
     where status = 'held' and expires_at <= now()
    returning 1
  )
  select count(*)::int from swept;
$$;

-- Counts genuinely free units for [p_from, p_to). Half-open: a stay ending on
-- the 5th frees the 5th for the next guest.
create or replace function public.stay_availability(
  p_room_type_id uuid,
  p_from date,
  p_to date
)
returns table (unit_id uuid, unit_label text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_range daterange := daterange(p_from, p_to, '[)');
begin
  if p_from >= p_to then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;

  perform public.sweep_expired_stay_holds();

  return query
    select u.id, u.label
      from public.stay_units u
     where u.room_type_id = p_room_type_id
       and u.is_active
       and not exists (
         select 1 from public.stay_allocations a
          where a.unit_id = u.id
            and a.status in ('held','confirmed')
            and a.stay_dates && v_range
       )
       and not exists (
         select 1 from public.stay_blocks b
          where b.unit_id = u.id
            and b.stay_dates && v_range
       )
     order by u.label;
end;
$$;

-- Places holds. Either all requested units are held, or none: any overlap
-- raises and the whole transaction rolls back.
create or replace function public.stay_hold_units(
  p_room_type_id uuid,
  p_from date,
  p_to date,
  p_units int,
  p_hold_minutes int default 10
)
returns table (allocation_id uuid, unit_id uuid, hold_token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module public.platform_module_flags;
  v_property public.stay_properties;
  v_free uuid[];
  v_range daterange := daterange(p_from, p_to, '[)');
  v_expires timestamptz := now() + make_interval(mins => greatest(1, least(p_hold_minutes, 30)));
  v_token uuid := gen_random_uuid();
begin
  select * into v_module from public.platform_module_flags where module_key = 'hotels';
  if v_module is null or not v_module.is_enabled or not v_module.allow_online_booking then
    raise exception 'MODULE_BOOKING_DISABLED' using errcode = '42501';
  end if;

  if p_from >= p_to then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  if p_units is null or p_units < 1 then
    raise exception 'INVALID_UNIT_COUNT' using errcode = '22023';
  end if;

  select p.* into v_property
    from public.stay_room_types rt
    join public.stay_properties p on p.id = rt.property_id
   where rt.id = p_room_type_id and rt.is_active and p.is_active
     for share;

  if v_property is null then
    raise exception 'ROOM_TYPE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.sweep_expired_stay_holds();

  select array_agg(s.unit_id) into v_free
    from public.stay_availability(p_room_type_id, p_from, p_to) s;

  if v_free is null or cardinality(v_free) < p_units then
    raise exception 'INSUFFICIENT_AVAILABILITY: requested % unit(s), % free',
      p_units, coalesce(cardinality(v_free), 0)
      using errcode = 'P0001';
  end if;

  -- FOR UPDATE on the chosen units serialises two simultaneous holds; the
  -- exclusion constraint is the final backstop if they still interleave.
  perform 1 from public.stay_units where id = any (v_free[1:p_units]) for update;

  return query
    insert into public.stay_allocations
      (unit_id, status, stay_dates, guest_user_id, hold_token, expires_at, total_paise)
    select u, 'held', v_range, auth.uid(), v_token, v_expires,
           (p_to - p_from) * (
             select rt.base_price_paise from public.stay_room_types rt where rt.id = p_room_type_id
           )
      from unnest(v_free[1:p_units]) as u
    returning stay_allocations.id, stay_allocations.unit_id,
              stay_allocations.hold_token, stay_allocations.expires_at;
exception
  when exclusion_violation then
    raise exception 'SEAT_TAKEN_BY_ANOTHER_GUEST: inventory changed while holding'
      using errcode = '40001';
end;
$$;

-- Confirm after verified payment. Only the service role may call this, so a
-- browser cannot turn its own hold into a paid stay.
create or replace function public.stay_confirm_booking(
  p_hold_token uuid,
  p_booking_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- public.bookings.payment_status is constrained to
  -- pay_later|pending_verification|verified|failed|refunded. 'verified' is the
  -- only state that represents provider-confirmed money; 'pending_verification'
  -- is explicitly NOT sufficient to consume inventory.
  if not exists (
    select 1 from public.bookings b
     where b.id = p_booking_id
       and b.payment_status = 'verified'
  ) then
    raise exception 'BOOKING_NOT_PAID: refusing to confirm inventory for an unpaid booking'
      using errcode = '42501';
  end if;

  with updated as (
    update public.stay_allocations
       set status = 'confirmed', booking_id = p_booking_id, expires_at = null, updated_at = now()
     where hold_token = p_hold_token
       and status = 'held'
       and expires_at > now()
    returning 1
  )
  select count(*)::int into v_count from updated;

  if v_count = 0 then
    raise exception 'HOLD_EXPIRED_OR_MISSING' using errcode = 'P0002';
  end if;

  return v_count;
end;
$$;

create or replace function public.stay_release_hold(p_hold_token uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with released as (
    update public.stay_allocations
       set status = 'released', updated_at = now()
     where hold_token = p_hold_token
       and status = 'held'
       and (guest_user_id = auth.uid() or auth.role() = 'service_role')
    returning 1
  )
  select count(*)::int into v_count from released;
  return v_count;
end;
$$;

revoke all on function public.stay_confirm_booking(uuid, uuid) from anon, authenticated;
grant execute on function public.stay_availability(uuid, date, date) to anon, authenticated;
grant execute on function public.stay_hold_units(uuid, date, date, int, int) to authenticated;
grant execute on function public.stay_release_hold(uuid) to authenticated;
grant execute on function public.sweep_expired_stay_holds() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Audit trail for inventory changes
-- ---------------------------------------------------------------------------

create table if not exists public.stay_audit_events (
  id         bigserial primary key,
  allocation_id uuid references public.stay_allocations(id) on delete cascade,
  event      text not null,
  detail     jsonb not null default '{}',
  actor      uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.stay_audit_events enable row level security;

drop policy if exists "Admins read stay audit" on public.stay_audit_events;
create policy "Admins read stay audit"
  on public.stay_audit_events for select to authenticated using (public.is_admin());

create or replace function public.log_stay_allocation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stay_audit_events (allocation_id, event, detail, actor)
  values (
    new.id,
    case when tg_op = 'INSERT' then 'allocation_created' else 'allocation_' || new.status end,
    jsonb_build_object(
      'unit_id', new.unit_id,
      'status', new.status,
      'stay_dates', new.stay_dates::text,
      'booking_id', new.booking_id,
      'expires_at', new.expires_at
    ),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists trg_log_stay_allocation on public.stay_allocations;
create trigger trg_log_stay_allocation
  after insert or update of status on public.stay_allocations
  for each row execute function public.log_stay_allocation_change();
