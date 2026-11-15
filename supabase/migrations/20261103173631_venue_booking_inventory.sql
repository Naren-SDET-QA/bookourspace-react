-- Transactional function hall and venue availability, pricing, and bookings.
-- A booking stores both the event interval and a buffered protected interval;
-- PostgreSQL exclusion is the final concurrency guard.

create extension if not exists btree_gist;

create table if not exists public.venue_booking_settings (
  listing_id text primary key references public.listings(id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  time_zone text not null default 'Asia/Kolkata',
  booking_enabled boolean not null default false,
  requires_owner_approval boolean not null default true,
  capacity integer not null check (capacity between 1 and 1000000),
  hourly_rate_paise bigint not null default 0 check (hourly_rate_paise >= 0),
  half_day_rate_paise bigint not null default 0 check (half_day_rate_paise >= 0),
  full_day_rate_paise bigint not null default 0 check (full_day_rate_paise >= 0),
  per_guest_rate_paise bigint not null default 0 check (per_guest_rate_paise >= 0),
  included_guests integer not null default 0 check (included_guests >= 0),
  deposit_paise bigint not null default 0 check (deposit_paise >= 0),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  setup_buffer_minutes integer not null default 0 check (setup_buffer_minutes between 0 and 1440),
  cleanup_buffer_minutes integer not null default 0 check (cleanup_buffer_minutes between 0 and 1440),
  advance_booking_days integer not null default 365 check (advance_booking_days between 1 and 1095),
  minimum_advance_minutes integer not null default 120 check (minimum_advance_minutes between 0 and 525600),
  addon_rates jsonb not null default '{}'::jsonb check (jsonb_typeof(addon_rates) = 'object'),
  cancellation_policy jsonb not null default '{"free_cancel_hours":48,"refund_percent":100}'::jsonb
    check (jsonb_typeof(cancellation_policy) = 'object'),
  updated_at timestamptz not null default now(),
  check (time_zone = any (array['Asia/Kolkata','Asia/Dubai','UTC','Europe/London','America/New_York','America/Los_Angeles']))
);

create table if not exists public.venue_seasonal_rates (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.venue_booking_settings(listing_id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  dates daterange not null check (not isempty(dates)),
  slot_type text not null check (slot_type in ('hourly','half_day','full_day','multi_day')),
  rate_paise bigint not null check (rate_paise >= 0),
  created_at timestamptz not null default now(),
  exclude using gist (listing_id with =, slot_type with =, dates with &&)
);

create table if not exists public.venue_blocks (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.venue_booking_settings(listing_id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  blocked_period tstzrange not null check (not isempty(blocked_period)),
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_venue_blocks_listing_period on public.venue_blocks using gist (listing_id, blocked_period);
create index if not exists idx_venue_settings_owner on public.venue_booking_settings(owner_user_id, listing_id);

create table if not exists public.venue_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_ref text not null unique default ('BOS-V-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  listing_id text not null references public.listings(id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  customer_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  request_fingerprint jsonb not null,
  slot_type text not null check (slot_type in ('hourly','half_day','full_day','multi_day')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  protected_period tstzrange not null,
  guest_count integer not null check (guest_count > 0),
  addon_ids text[] not null default '{}',
  price_breakdown jsonb not null,
  total_paise bigint not null check (total_paise >= 0),
  deposit_paise bigint not null check (deposit_paise >= 0),
  payment_mode text not null check (payment_mode in ('pay_at_venue','razorpay','upi')),
  payment_status text not null check (payment_status in ('obligation_recorded','awaiting_verification','verified','failed','refund_pending','refunded','not_due')),
  status text not null check (status in ('pending_owner','pending_payment','confirmed','rejected','cancelled','expired','completed')),
  hold_expires_at timestamptz,
  cancellation_policy jsonb not null,
  cancellation_reason text,
  refund_paise bigint not null default 0 check (refund_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_user_id, idempotency_key),
  check (ends_at > starts_at),
  exclude using gist (listing_id with =, protected_period with &&)
    where (status in ('pending_owner','pending_payment','confirmed'))
);

create index if not exists idx_venue_bookings_customer on public.venue_bookings(customer_user_id, created_at desc);
create index if not exists idx_venue_bookings_owner on public.venue_bookings(owner_user_id, starts_at);
create index if not exists idx_venue_bookings_listing on public.venue_bookings(listing_id, starts_at);

create table if not exists public.venue_booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.venue_bookings(id) on delete restrict,
  actor_user_id uuid references public.profiles(id) on delete restrict,
  actor_role text not null check (actor_role in ('customer','provider','admin','system')),
  action text not null,
  reason text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_venue_booking_events_booking on public.venue_booking_events(booking_id, created_at, id);

create table if not exists public.venue_payment_intents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.venue_bookings(id) on delete restrict,
  customer_user_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null check (provider in ('razorpay','upi_webhook','sandbox')),
  provider_order_id text,
  provider_payment_id text,
  amount_paise bigint not null check (amount_paise > 0),
  status text not null check (status in ('created','verified','failed','refund_pending','refunded')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, provider),
  unique (provider_order_id),
  unique (provider_payment_id)
);
create index if not exists idx_venue_payment_intents_booking on public.venue_payment_intents(booking_id, created_at desc);

create table if not exists public.venue_payment_events (
  provider_event_id text primary key,
  booking_id uuid not null references public.venue_bookings(id) on delete restrict,
  payment_intent_id uuid references public.venue_payment_intents(id) on delete restrict,
  event_type text not null check (event_type in ('payment.captured','payment.failed','refund.processed')),
  provider_reference text not null,
  amount_paise bigint not null check (amount_paise >= 0),
  payload_hash text not null,
  processed_at timestamptz not null default now()
);

alter table public.venue_booking_settings enable row level security;
alter table public.venue_seasonal_rates enable row level security;
alter table public.venue_blocks enable row level security;
alter table public.venue_bookings enable row level security;
alter table public.venue_booking_events enable row level security;
alter table public.venue_payment_intents enable row level security;
alter table public.venue_payment_events enable row level security;

create or replace function public.venue_is_active_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.account_status='active')
$$;
revoke all on function public.venue_is_active_admin() from public;
grant execute on function public.venue_is_active_admin() to anon,authenticated;

revoke all on public.venue_booking_settings, public.venue_seasonal_rates, public.venue_blocks,
  public.venue_bookings, public.venue_booking_events, public.venue_payment_intents, public.venue_payment_events from public, anon, authenticated;
grant select on public.venue_booking_settings to anon, authenticated;
grant select, insert, update, delete on public.venue_booking_settings, public.venue_seasonal_rates, public.venue_blocks to authenticated;
grant select on public.venue_bookings, public.venue_booking_events to authenticated;
grant select on public.venue_payment_intents to authenticated;
grant all on public.venue_payment_events to service_role;
grant usage, select on sequence public.venue_booking_events_id_seq to authenticated;

drop policy if exists "Enabled venue settings are public, owner manages their settings" on public.venue_booking_settings;
create policy "Enabled venue settings are public, owner manages their settings"
  on public.venue_booking_settings for select to anon, authenticated
  using (
    (booking_enabled and exists (select 1 from public.listings l where l.id=listing_id and l.status='active'))
    or owner_user_id=(select auth.uid()) or public.venue_is_active_admin()
  );
drop policy if exists "Owners manage venue settings" on public.venue_booking_settings;
create policy "Owners manage venue settings" on public.venue_booking_settings for all to authenticated
  using (owner_user_id=(select auth.uid()) or public.venue_is_active_admin())
  with check (owner_user_id=(select auth.uid()) or public.venue_is_active_admin());

drop policy if exists "Owners manage venue seasonal rates" on public.venue_seasonal_rates;
create policy "Owners manage venue seasonal rates" on public.venue_seasonal_rates for all to authenticated
  using (owner_user_id=(select auth.uid()) or public.venue_is_active_admin())
  with check (owner_user_id=(select auth.uid()) or public.venue_is_active_admin());
drop policy if exists "Owners manage venue blocks" on public.venue_blocks;
create policy "Owners manage venue blocks" on public.venue_blocks for all to authenticated
  using (owner_user_id=(select auth.uid()) or public.venue_is_active_admin())
  with check (owner_user_id=(select auth.uid()) or public.venue_is_active_admin());

drop policy if exists "Venue booking parties read bookings" on public.venue_bookings;
create policy "Venue booking parties read bookings" on public.venue_bookings for select to authenticated
  using (customer_user_id=(select auth.uid()) or owner_user_id=(select auth.uid()) or public.venue_is_active_admin());
drop policy if exists "Venue booking parties read events" on public.venue_booking_events;
create policy "Venue booking parties read events" on public.venue_booking_events for select to authenticated
  using (exists (select 1 from public.venue_bookings b where b.id=booking_id
    and (b.customer_user_id=(select auth.uid()) or b.owner_user_id=(select auth.uid()) or public.venue_is_active_admin())));
drop policy if exists "Venue booking parties read payment intents" on public.venue_payment_intents;
create policy "Venue booking parties read payment intents" on public.venue_payment_intents for select to authenticated
  using (customer_user_id=(select auth.uid()) or public.venue_is_active_admin() or exists(select 1 from public.venue_bookings b
    where b.id=booking_id and b.owner_user_id=(select auth.uid())));

create or replace function public.venue_public_calendar(p_listing_id text,p_from timestamptz,p_to timestamptz)
returns table(busy_period tstzrange,busy_type text) language sql stable security definer set search_path=public as $$
  select b.protected_period,'reserved'::text from public.venue_bookings b
    where b.listing_id=p_listing_id and b.status in ('pending_owner','pending_payment','confirmed')
      and (b.status<>'pending_payment' or b.hold_expires_at>now())
      and p_to>p_from and p_to<=p_from+interval '120 days'
      and exists(select 1 from public.listings l join public.venue_booking_settings s on s.listing_id=l.id
        where l.id=p_listing_id and l.entity_type='venue' and s.booking_enabled
          and (l.status='active' or l.owner_id=auth.uid() or public.venue_is_active_admin()))
      and b.protected_period && tstzrange(p_from,p_to,'[)')
  union all
  select x.blocked_period,'blocked'::text from public.venue_blocks x
    where x.listing_id=p_listing_id and p_to>p_from and p_to<=p_from+interval '120 days'
      and exists(select 1 from public.listings l join public.venue_booking_settings s on s.listing_id=l.id
        where l.id=p_listing_id and l.entity_type='venue' and s.booking_enabled
          and (l.status='active' or l.owner_id=auth.uid() or public.venue_is_active_admin()))
      and x.blocked_period && tstzrange(p_from,p_to,'[)')
$$;

create or replace function public.venue_owner_add_block(p_listing_id text,p_start timestamptz,p_end timestamptz,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_profile public.profiles; v_settings public.venue_booking_settings; v_block public.venue_blocks;
begin
  if v_uid is null or p_end<=p_start or length(coalesce(p_reason,''))>500 then raise exception 'INVALID_VENUE_BLOCK' using errcode='22023'; end if;
  select * into v_profile from public.profiles where id=v_uid and account_status='active' for share;
  if v_profile.id is null or v_profile.role not in ('provider','admin') then raise exception 'PROVIDER_ROLE_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_listing_id,0));
  select * into v_settings from public.venue_booking_settings where listing_id=p_listing_id for share;
  if v_settings.listing_id is null or (v_profile.role<>'admin' and v_settings.owner_user_id<>v_uid) then raise exception 'LISTING_NOT_OWNED' using errcode='42501'; end if;
  if exists(select 1 from public.venue_bookings b where b.listing_id=p_listing_id and b.status in ('pending_owner','pending_payment','confirmed')
    and b.protected_period && tstzrange(p_start,p_end,'[)')) then raise exception 'VENUE_BLOCK_OVERLAPS_BOOKING' using errcode='23P01'; end if;
  insert into public.venue_blocks(listing_id,owner_user_id,blocked_period,reason)
  values(p_listing_id,v_settings.owner_user_id,tstzrange(p_start,p_end,'[)'),trim(coalesce(p_reason,''))) returning * into v_block;
  return to_jsonb(v_block);
end $$;

create or replace function public.venue_settle_verified_payment(
  p_event_id text,p_intent_id uuid,p_booking_id uuid,p_event_type text,p_provider_reference text,p_amount_paise bigint,p_payload_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_intent public.venue_payment_intents; v_booking public.venue_bookings; v_existing public.venue_payment_events;
begin
  if p_event_id='' or p_provider_reference='' or p_payload_hash='' or p_event_type not in ('payment.captured','payment.failed','refund.processed') then raise exception 'INVALID_PAYMENT_EVENT' using errcode='22023'; end if;
  select * into v_existing from public.venue_payment_events where provider_event_id=p_event_id;
  if v_existing.provider_event_id is not null then
    if v_existing.payload_hash<>p_payload_hash then raise exception 'PAYMENT_EVENT_REPLAY_CONFLICT' using errcode='23505'; end if;
    return jsonb_build_object('idempotent',true,'bookingId',v_existing.booking_id);
  end if;
  select * into v_intent from public.venue_payment_intents where id=p_intent_id and booking_id=p_booking_id for update;
  select * into v_booking from public.venue_bookings where id=p_booking_id for update;
  if v_intent.id is null or v_booking.id is null or v_intent.amount_paise<>p_amount_paise then raise exception 'PAYMENT_BINDING_MISMATCH' using errcode='42501'; end if;
  if p_event_type='payment.captured' then
    if v_booking.status<>'pending_payment' or v_booking.hold_expires_at<=now() then raise exception 'VENUE_BOOKING_HOLD_EXPIRED' using errcode='P0001'; end if;
    update public.venue_payment_intents set status='verified',provider_payment_id=p_provider_reference,verified_at=now() where id=v_intent.id;
    update public.venue_bookings set status=case when (select requires_owner_approval from public.venue_booking_settings where listing_id=v_booking.listing_id) then 'pending_owner' else 'confirmed' end,
      payment_status='verified',hold_expires_at=null,updated_at=now() where id=v_booking.id;
  elsif p_event_type='payment.failed' then
    update public.venue_payment_intents set status='failed' where id=v_intent.id;
    update public.venue_bookings set status='expired',payment_status='failed',updated_at=now() where id=v_booking.id and status='pending_payment';
  else
    if v_booking.payment_status<>'refund_pending' or p_amount_paise<>v_booking.refund_paise then raise exception 'REFUND_BINDING_MISMATCH' using errcode='42501'; end if;
    update public.venue_payment_intents set status='refunded' where id=v_intent.id;
    update public.venue_bookings set payment_status='refunded',updated_at=now() where id=v_booking.id;
  end if;
  insert into public.venue_payment_events(provider_event_id,booking_id,payment_intent_id,event_type,provider_reference,amount_paise,payload_hash)
  values(p_event_id,p_booking_id,p_intent_id,p_event_type,p_provider_reference,p_amount_paise,p_payload_hash);
  insert into public.venue_booking_events(booking_id,actor_user_id,actor_role,action,details)
  values(p_booking_id,null,'system',p_event_type,jsonb_build_object('providerReference',p_provider_reference,'amountPaise',p_amount_paise));
  return jsonb_build_object('idempotent',false,'bookingId',p_booking_id,'eventType',p_event_type);
end $$;

create or replace function public.venue_owner_manage_seasonal_rate(p_listing_id text,p_id uuid,p_dates daterange,p_slot text,p_rate bigint,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_profile public.profiles; v_settings public.venue_booking_settings; v_row public.venue_seasonal_rates;
begin
  select * into v_profile from public.profiles where id=v_uid and account_status='active';
  select * into v_settings from public.venue_booking_settings where listing_id=p_listing_id;
  if v_profile.id is null or v_profile.role not in ('provider','admin') or v_settings.listing_id is null
    or (v_profile.role<>'admin' and v_settings.owner_user_id<>v_uid) then raise exception 'LISTING_NOT_OWNED' using errcode='42501'; end if;
  if p_delete then delete from public.venue_seasonal_rates where id=p_id and listing_id=p_listing_id returning * into v_row;
  else
    if p_dates is null or isempty(p_dates) or p_slot not in ('hourly','half_day','full_day','multi_day') or p_rate<0 then raise exception 'INVALID_SEASONAL_RATE' using errcode='22023'; end if;
    insert into public.venue_seasonal_rates(id,listing_id,owner_user_id,dates,slot_type,rate_paise)
      values(coalesce(p_id,gen_random_uuid()),p_listing_id,v_settings.owner_user_id,p_dates,p_slot,p_rate)
      on conflict(id) do update set dates=excluded.dates,slot_type=excluded.slot_type,rate_paise=excluded.rate_paise returning * into v_row;
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function public.venue_quote(
  p_listing_id text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_slot_type text, p_guests integer, p_addons text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_settings public.venue_booking_settings;
  v_listing public.listings;
  v_duration numeric;
  v_units integer;
  v_rate bigint;
  v_season bigint;
  v_base bigint;
  v_guest bigint;
  v_addon bigint := 0;
  v_tax bigint;
  v_total bigint;
  v_addon_json jsonb := '{}'::jsonb;
  v_key text;
  v_rate_item jsonb;
begin
  if p_slot_type not in ('hourly','half_day','full_day','multi_day') or p_starts_at is null or p_ends_at is null
     or p_ends_at <= p_starts_at or p_guests is null or p_guests < 1 or p_guests > 100000 then
    raise exception 'INVALID_VENUE_QUOTE' using errcode='22023';
  end if;
  select * into v_listing from public.listings where id=p_listing_id and status='active'
    and entity_type='venue';
  if v_listing.id is null then raise exception 'VENUE_NOT_AVAILABLE' using errcode='P0002'; end if;
  if not exists(select 1 from public.platform_module_flags where module_key='function_hall' and is_enabled and allow_online_booking) then
    raise exception 'VENUE_BOOKING_DISABLED' using errcode='42501';
  end if;
  select * into v_settings from public.venue_booking_settings where listing_id=p_listing_id and booking_enabled;
  if v_settings.listing_id is null then raise exception 'VENUE_INVENTORY_NOT_CONFIGURED' using errcode='P0002'; end if;
  if p_starts_at < now() + make_interval(mins=>v_settings.minimum_advance_minutes)
     or p_starts_at > now() + make_interval(days=>v_settings.advance_booking_days) then
    raise exception 'VENUE_OUTSIDE_BOOKING_WINDOW' using errcode='22023';
  end if;
  if p_guests > v_settings.capacity then raise exception 'VENUE_CAPACITY_EXCEEDED' using errcode='22023'; end if;
  v_duration := extract(epoch from (p_ends_at-p_starts_at))/3600;
  if p_slot_type='hourly' then
    v_units := ceil(v_duration)::integer; v_rate := v_settings.hourly_rate_paise;
  elsif p_slot_type='half_day' then
    if v_duration > 6 then raise exception 'INVALID_VENUE_SLOT_DURATION' using errcode='22023'; end if;
    v_units := 1; v_rate := v_settings.half_day_rate_paise;
  elsif p_slot_type='full_day' then
    if v_duration > 12 then raise exception 'INVALID_VENUE_SLOT_DURATION' using errcode='22023'; end if;
    v_units := 1; v_rate := v_settings.full_day_rate_paise;
  else
    -- Package day count follows venue-local wall time. A local calendar day can
    -- be 23 or 25 elapsed hours at DST boundaries; neither should change the
    -- number of venue days sold.
    v_duration := extract(epoch from ((p_ends_at at time zone v_settings.time_zone)
      - (p_starts_at at time zone v_settings.time_zone)))/3600;
    if v_duration < 24 then raise exception 'INVALID_VENUE_SLOT_DURATION' using errcode='22023'; end if;
    v_units := ceil(v_duration/24)::integer; v_rate := v_settings.full_day_rate_paise;
  end if;
  if v_rate <= 0 then raise exception 'VENUE_SLOT_NOT_OFFERED' using errcode='22023'; end if;
  select rate_paise into v_season from public.venue_seasonal_rates
   where listing_id=p_listing_id and slot_type=p_slot_type and dates @> ((p_starts_at at time zone v_settings.time_zone)::date)
   limit 1;
  if v_season is not null then v_rate := v_season; end if;
  v_base := v_rate * v_units;
  v_guest := greatest(0,p_guests-v_settings.included_guests)::bigint * v_settings.per_guest_rate_paise;
  foreach v_key in array coalesce(p_addons,'{}') loop
    v_rate_item := v_settings.addon_rates->v_key;
    if v_rate_item is null or not (v_settings.addon_rates ? v_key) then raise exception 'INVALID_VENUE_ADDON' using errcode='22023'; end if;
    v_addon := v_addon + coalesce((v_rate_item->>'pricePaise')::bigint,0);
    v_addon_json := v_addon_json || jsonb_build_object(v_key, jsonb_build_object('label',v_rate_item->>'label','pricePaise',(v_rate_item->>'pricePaise')::bigint));
  end loop;
  v_tax := round((v_base+v_guest+v_addon) * v_settings.tax_percent/100)::bigint;
  v_total := v_base+v_guest+v_addon+v_tax+v_settings.deposit_paise;
  return jsonb_build_object(
    'listingId',p_listing_id,'startsAt',p_starts_at,'endsAt',p_ends_at,'slotType',p_slot_type,'units',v_units,
    'guests',p_guests,'basePaise',v_base,'guestPaise',v_guest,'addonsPaise',v_addon,'addons',v_addon_json,
    'taxPercent',v_settings.tax_percent,'taxPaise',v_tax,'depositPaise',v_settings.deposit_paise,
    'totalPaise',v_total,'currency','INR','serverComputed',true
  );
end $$;

create or replace function public.venue_create_booking(
  p_listing_id text, p_starts_at timestamptz, p_ends_at timestamptz, p_slot_type text,
  p_guests integer, p_addons text[], p_payment_mode text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_listing public.listings;
  v_settings public.venue_booking_settings;
  v_quote jsonb;
  v_fingerprint jsonb;
  v_existing public.venue_bookings;
  v_booking public.venue_bookings;
  v_status text;
  v_payment_status text;
  v_period tstzrange;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=v_uid for share;
  if v_profile.id is null or v_profile.account_status<>'active' or v_profile.role<>'customer' then
    raise exception 'ACTIVE_CUSTOMER_REQUIRED' using errcode='42501';
  end if;
  if p_payment_mode not in ('pay_at_venue','razorpay','upi') then raise exception 'INVALID_PAYMENT_MODE' using errcode='22023'; end if;
  if p_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_listing_id,0));
  update public.venue_bookings set status='expired',payment_status=case when payment_status='awaiting_verification' then 'failed' else payment_status end,updated_at=now()
    where listing_id=p_listing_id and status='pending_payment' and hold_expires_at<=now();
  select * into v_listing from public.listings where id=p_listing_id and status='active' and entity_type='venue';
  if v_listing.id is null then raise exception 'VENUE_NOT_AVAILABLE' using errcode='P0002'; end if;
  select * into v_settings from public.venue_booking_settings where listing_id=p_listing_id and booking_enabled for share;
  if v_settings.listing_id is null then raise exception 'VENUE_INVENTORY_NOT_CONFIGURED' using errcode='P0002'; end if;
  v_fingerprint:=jsonb_build_object('listingId',p_listing_id,'startsAt',p_starts_at,'endsAt',p_ends_at,'slotType',p_slot_type,'guests',p_guests,'addons',to_jsonb(coalesce(p_addons,'{}')),'paymentMode',p_payment_mode);
  select * into v_existing from public.venue_bookings where customer_user_id=v_uid and idempotency_key=p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.request_fingerprint<>v_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    return to_jsonb(v_existing)||jsonb_build_object('idempotent',true);
  end if;
  v_quote:=public.venue_quote(p_listing_id,p_starts_at,p_ends_at,p_slot_type,p_guests,p_addons);
  if exists(select 1 from public.venue_blocks b where b.listing_id=p_listing_id and b.blocked_period && tstzrange(p_starts_at-v_settings.setup_buffer_minutes*interval '1 minute',p_ends_at+v_settings.cleanup_buffer_minutes*interval '1 minute','[)')) then
    raise exception 'VENUE_SLOT_BLOCKED' using errcode='23P01';
  end if;
  v_period:=tstzrange(p_starts_at-v_settings.setup_buffer_minutes*interval '1 minute',p_ends_at+v_settings.cleanup_buffer_minutes*interval '1 minute','[)');
  if p_payment_mode='pay_at_venue' then
    v_status:=case when v_settings.requires_owner_approval then 'pending_owner' else 'confirmed' end;
    v_payment_status:='obligation_recorded';
  else
    v_status:='pending_payment'; v_payment_status:='awaiting_verification';
  end if;
  insert into public.venue_bookings(listing_id,owner_user_id,customer_user_id,idempotency_key,request_fingerprint,
    slot_type,starts_at,ends_at,protected_period,guest_count,addon_ids,price_breakdown,total_paise,deposit_paise,
    payment_mode,payment_status,status,hold_expires_at,cancellation_policy)
  values(p_listing_id,v_listing.owner_id,v_uid,p_idempotency_key,v_fingerprint,p_slot_type,p_starts_at,p_ends_at,v_period,
    p_guests,coalesce(p_addons,'{}'),v_quote,(v_quote->>'totalPaise')::bigint,(v_quote->>'depositPaise')::bigint,
    p_payment_mode,v_payment_status,v_status,case when p_payment_mode='pay_at_venue' then null else now()+interval '15 minutes' end,
    v_settings.cancellation_policy)
  returning * into v_booking;
  insert into public.venue_booking_events(booking_id,actor_user_id,actor_role,action,details)
  values(v_booking.id,v_uid,'customer','created',jsonb_build_object('paymentMode',p_payment_mode,'totalPaise',v_booking.total_paise));
  return to_jsonb(v_booking)||jsonb_build_object('idempotent',false,'priceBreakdown',v_quote);
end $$;

create or replace function public.venue_booking_action(p_booking_id uuid,p_action text,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid(); v_profile public.profiles; v_booking public.venue_bookings; v_next text; v_refund bigint:=0; v_reason text:=trim(coalesce(p_reason,'')); v_prior text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=v_uid and account_status='active' for share;
  if v_profile.id is null then raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode='42501'; end if;
  select * into v_booking from public.venue_bookings where id=p_booking_id for update;
  if v_booking.id is null then raise exception 'VENUE_BOOKING_NOT_FOUND' using errcode='P0002'; end if;
  v_prior:=v_booking.status;
  if v_profile.role='customer' and v_booking.customer_user_id<>v_uid then raise exception 'VENUE_BOOKING_FORBIDDEN' using errcode='42501'; end if;
  if v_profile.role='provider' and v_booking.owner_user_id<>v_uid then raise exception 'VENUE_BOOKING_FORBIDDEN' using errcode='42501'; end if;
  if v_profile.role not in ('customer','provider','admin') then raise exception 'VENUE_BOOKING_FORBIDDEN' using errcode='42501'; end if;
  if p_action='accept' and v_profile.role in ('provider','admin') and v_booking.status='pending_owner' then v_next:='confirmed';
  elsif p_action='reject' and v_profile.role in ('provider','admin') and v_booking.status='pending_owner' then v_next:='rejected';
  elsif p_action='cancel' and v_booking.status in ('pending_owner','pending_payment','confirmed') then v_next:='cancelled';
  elsif p_action='complete' and v_profile.role in ('provider','admin') and v_booking.status='confirmed' then v_next:='completed';
  elsif p_action='admin_override' and v_profile.role='admin' and length(v_reason)>=7 and p_reason like 'cancel:%'
    and v_booking.status in ('pending_owner','pending_payment','confirmed') then v_next:='cancelled';
  elsif p_action='admin_override' and v_profile.role='admin' and length(v_reason)>=8 and p_reason like 'confirm:%'
    and v_booking.status='pending_owner' and v_booking.payment_status in ('obligation_recorded','verified') then v_next:='confirmed';
  else raise exception 'INVALID_VENUE_BOOKING_ACTION' using errcode='22023'; end if;
  if v_next='cancelled' and v_booking.payment_status='verified' then
    if v_booking.starts_at-now() >= coalesce((v_booking.cancellation_policy->>'free_cancel_hours')::int,48)*interval '1 hour' then
      v_refund:=round(v_booking.total_paise*coalesce((v_booking.cancellation_policy->>'refund_percent')::numeric,100)/100)::bigint;
    end if;
  end if;
  update public.venue_bookings set status=v_next,cancellation_reason=case when v_next in ('cancelled','rejected') then v_reason else cancellation_reason end,
    refund_paise=v_refund,payment_status=case when v_refund>0 then 'refund_pending' when v_next='cancelled' and payment_status<>'verified' then 'not_due' else payment_status end,
    hold_expires_at=null,updated_at=now() where id=v_booking.id returning * into v_booking;
  insert into public.venue_booking_events(booking_id,actor_user_id,actor_role,action,reason,details)
  values(v_booking.id,v_uid,v_profile.role,p_action,v_reason,jsonb_build_object('fromStatus',v_prior,'toStatus',v_booking.status,'refundPaise',v_refund));
  return to_jsonb(v_booking)||jsonb_build_object('refundPaise',v_refund,'refundState',case when v_refund>0 then 'pending' else 'not_applicable' end);
end $$;

create or replace function public.venue_owner_save_settings(
  p_listing_id text,p_capacity integer,p_hourly bigint,p_half bigint,p_full bigint,p_per_guest bigint,
  p_included_guests integer,p_deposit bigint,p_tax numeric,p_setup integer,p_cleanup integer,
  p_advance_days integer,p_min_advance integer,p_approval boolean,p_addons jsonb,p_cancellation jsonb,p_enabled boolean
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_profile public.profiles; v_listing public.listings; v_row public.venue_booking_settings;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_profile from public.profiles where id=v_uid and account_status='active' for share;
  if v_profile.id is null or v_profile.role not in ('provider','admin') then raise exception 'PROVIDER_ROLE_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_listing_id,0));
  select * into v_listing from public.listings where id=p_listing_id and entity_type='venue' for update;
  if v_listing.id is null then raise exception 'VENUE_LISTING_NOT_FOUND' using errcode='P0002'; end if;
  if v_profile.role<>'admin' and v_listing.owner_id<>v_uid then raise exception 'LISTING_NOT_OWNED' using errcode='42501'; end if;
  insert into public.venue_booking_settings(listing_id,owner_user_id,booking_enabled,capacity,hourly_rate_paise,half_day_rate_paise,full_day_rate_paise,
    per_guest_rate_paise,included_guests,deposit_paise,tax_percent,setup_buffer_minutes,cleanup_buffer_minutes,advance_booking_days,
    minimum_advance_minutes,requires_owner_approval,addon_rates,cancellation_policy)
  values(p_listing_id,v_listing.owner_id,p_enabled,p_capacity,p_hourly,p_half,p_full,p_per_guest,p_included_guests,p_deposit,p_tax,
    p_setup,p_cleanup,p_advance_days,p_min_advance,p_approval,coalesce(p_addons,'{}'),coalesce(p_cancellation,'{}'))
  on conflict(listing_id) do update set booking_enabled=excluded.booking_enabled,capacity=excluded.capacity,hourly_rate_paise=excluded.hourly_rate_paise,
    half_day_rate_paise=excluded.half_day_rate_paise,full_day_rate_paise=excluded.full_day_rate_paise,per_guest_rate_paise=excluded.per_guest_rate_paise,
    included_guests=excluded.included_guests,deposit_paise=excluded.deposit_paise,tax_percent=excluded.tax_percent,
    setup_buffer_minutes=excluded.setup_buffer_minutes,cleanup_buffer_minutes=excluded.cleanup_buffer_minutes,
    advance_booking_days=excluded.advance_booking_days,minimum_advance_minutes=excluded.minimum_advance_minutes,
    requires_owner_approval=excluded.requires_owner_approval,addon_rates=excluded.addon_rates,cancellation_policy=excluded.cancellation_policy,updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.venue_owner_reschedule_booking(
  p_booking_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_slot_type text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid:=auth.uid(); v_profile public.profiles; v_booking public.venue_bookings;
  v_settings public.venue_booking_settings; v_quote jsonb; v_period tstzrange;
begin
  select * into v_profile from public.profiles where id=v_uid and account_status='active' for share;
  if v_profile.id is null or v_profile.role not in ('provider','admin') then raise exception 'PROVIDER_ROLE_REQUIRED' using errcode='42501'; end if;
  select * into v_booking from public.venue_bookings where id=p_booking_id for update;
  if v_booking.id is null then raise exception 'VENUE_BOOKING_NOT_FOUND' using errcode='P0002'; end if;
  if v_profile.role<>'admin' and v_booking.owner_user_id<>v_uid then raise exception 'VENUE_BOOKING_FORBIDDEN' using errcode='42501'; end if;
  if v_booking.status not in ('pending_owner','confirmed') or v_booking.payment_status='verified' then raise exception 'VENUE_BOOKING_NOT_RESCHEDULABLE' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_booking.listing_id,0));
  select * into v_settings from public.venue_booking_settings where listing_id=v_booking.listing_id and booking_enabled;
  if v_settings.listing_id is null then raise exception 'VENUE_INVENTORY_NOT_CONFIGURED' using errcode='P0002'; end if;
  v_quote:=public.venue_quote(v_booking.listing_id,p_starts_at,p_ends_at,p_slot_type,v_booking.guest_count,v_booking.addon_ids);
  v_period:=tstzrange(p_starts_at-v_settings.setup_buffer_minutes*interval '1 minute',p_ends_at+v_settings.cleanup_buffer_minutes*interval '1 minute','[)');
  if exists(select 1 from public.venue_blocks x where x.listing_id=v_booking.listing_id and x.blocked_period && v_period) then raise exception 'VENUE_SLOT_BLOCKED' using errcode='23P01'; end if;
  update public.venue_bookings set starts_at=p_starts_at,ends_at=p_ends_at,slot_type=p_slot_type,protected_period=v_period,
    price_breakdown=v_quote,total_paise=(v_quote->>'totalPaise')::bigint,deposit_paise=(v_quote->>'depositPaise')::bigint,
    updated_at=now() where id=v_booking.id returning * into v_booking;
  insert into public.venue_booking_events(booking_id,actor_user_id,actor_role,action,details)
    values(v_booking.id,v_uid,v_profile.role,'rescheduled',jsonb_build_object('startsAt',p_starts_at,'endsAt',p_ends_at,'slotType',p_slot_type,'totalPaise',v_booking.total_paise));
  return to_jsonb(v_booking)||jsonb_build_object('priceBreakdown',v_quote);
end $$;

-- There is no client write path to bookings or event history. All mutation is
-- through actor-checking transactions, with append-only audit events.
revoke all on function public.venue_quote(text,timestamptz,timestamptz,text,integer,text[]) from public, anon;
grant execute on function public.venue_quote(text,timestamptz,timestamptz,text,integer,text[]) to anon, authenticated;
revoke all on function public.venue_public_calendar(text,timestamptz,timestamptz) from public, anon;
grant execute on function public.venue_public_calendar(text,timestamptz,timestamptz) to anon, authenticated;
revoke all on function public.venue_owner_add_block(text,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.venue_owner_add_block(text,timestamptz,timestamptz,text) to authenticated;
revoke all on function public.venue_create_booking(text,timestamptz,timestamptz,text,integer,text[],text,uuid) from public, anon;
grant execute on function public.venue_create_booking(text,timestamptz,timestamptz,text,integer,text[],text,uuid) to authenticated;
revoke all on function public.venue_booking_action(uuid,text,text) from public, anon;
grant execute on function public.venue_booking_action(uuid,text,text) to authenticated;
revoke all on function public.venue_owner_save_settings(text,integer,bigint,bigint,bigint,bigint,integer,bigint,numeric,integer,integer,integer,integer,boolean,jsonb,jsonb,boolean) from public, anon;
grant execute on function public.venue_owner_save_settings(text,integer,bigint,bigint,bigint,bigint,integer,bigint,numeric,integer,integer,integer,integer,boolean,jsonb,jsonb,boolean) to authenticated;
revoke all on function public.venue_owner_reschedule_booking(uuid,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.venue_owner_reschedule_booking(uuid,timestamptz,timestamptz,text) to authenticated;
revoke all on function public.venue_owner_manage_seasonal_rate(text,uuid,daterange,text,bigint,boolean) from public, anon;
grant execute on function public.venue_owner_manage_seasonal_rate(text,uuid,daterange,text,bigint,boolean) to authenticated;
revoke all on function public.venue_settle_verified_payment(text,uuid,uuid,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.venue_settle_verified_payment(text,uuid,uuid,text,text,bigint,text) to service_role;

