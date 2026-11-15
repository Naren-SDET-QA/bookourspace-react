-- =============================================================================
-- Home & Local Services: provider schedules, service areas, real slot
-- availability and server-verified UPI settlement.
--
-- Why this migration exists:
--   * service_bookings.time_slot was free text, so '9 AM', '09:00' and
--     '9:00 AM' were three different slots for the same provider hour. The
--     unique index could not stop that double-booking.
--   * payment_mode accepted 'upi_qr'/'upi_intent', but no server route could
--     ever prove settlement; only a provider claim + admin approval existed.
--
-- Additive only. Existing rows keep working (slot_key is nullable).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Canonical slot key on bookings
-- -----------------------------------------------------------------------------
alter table public.service_bookings add column if not exists slot_key text;

create unique index if not exists uniq_service_booking_canonical_slot
  on public.service_bookings (provider_id, scheduled_date, slot_key)
  where slot_key is not null
    and status in ('requested', 'accepted', 'in_progress');

create index if not exists idx_service_bookings_slot_key
  on public.service_bookings (provider_id, scheduled_date, slot_key);

-- -----------------------------------------------------------------------------
-- 2. Provider schedule + service area
-- -----------------------------------------------------------------------------
create table if not exists public.service_provider_schedules (
  provider_id      uuid primary key references public.profiles(id) on delete cascade,
  timezone         text not null default 'Asia/Kolkata',
  -- 0 = Sunday … 6 = Saturday
  working_days     smallint[] not null default '{1,2,3,4,5,6}',
  day_start        time not null default '09:00',
  day_end          time not null default '19:00',
  slot_minutes     int not null default 60 check (slot_minutes between 30 and 480),
  service_areas    text[] not null default '{}',
  travel_radius_km int check (travel_radius_km is null or (travel_radius_km between 0 and 100)),
  updated_at       timestamptz not null default now(),
  constraint service_provider_schedule_window check (day_start < day_end)
);

alter table public.service_provider_schedules enable row level security;

drop policy if exists "Published schedules are readable" on public.service_provider_schedules;
create policy "Published schedules are readable"
  on public.service_provider_schedules for select to anon, authenticated
  using (true);

drop policy if exists "Providers manage their own schedule" on public.service_provider_schedules;
create policy "Providers manage their own schedule"
  on public.service_provider_schedules for all to authenticated
  using (provider_id = (select auth.uid()) or public.is_admin())
  with check (provider_id = (select auth.uid()) or public.is_admin());

revoke all on public.service_provider_schedules from public, anon;
grant select on public.service_provider_schedules to anon, authenticated;
grant insert, update on public.service_provider_schedules to authenticated;

create table if not exists public.service_provider_blackouts (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references public.profiles(id) on delete cascade,
  blackout_date date not null,
  reason       text,
  created_at   timestamptz not null default now(),
  unique (provider_id, blackout_date)
);

alter table public.service_provider_blackouts enable row level security;

drop policy if exists "Providers manage their blackout dates" on public.service_provider_blackouts;
create policy "Providers manage their blackout dates"
  on public.service_provider_blackouts for all to authenticated
  using (provider_id = (select auth.uid()) or public.is_admin())
  with check (provider_id = (select auth.uid()) or public.is_admin());

revoke all on public.service_provider_blackouts from public, anon;
grant select, insert, delete on public.service_provider_blackouts to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Real availability for a listing
--
-- Defaults are deliberately permissive until a provider publishes a schedule
-- (06:00–23:00, hourly). A configured schedule always wins.
-- -----------------------------------------------------------------------------
create or replace function public.service_listing_slots(
  p_listing_id text,
  p_from date,
  p_to date
)
returns table (
  slot_date  date,
  slot_start time,
  slot_end   time,
  slot_label text,
  slot_key   text,
  is_booked  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider uuid;
  v_days smallint[];
  v_start time;
  v_end time;
  v_step int;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_AVAILABILITY_RANGE' using errcode = '22023';
  end if;
  if p_to - p_from > 61 then
    raise exception 'AVAILABILITY_RANGE_TOO_WIDE' using errcode = '22023';
  end if;

  select l.owner_id into v_provider
    from public.listings l
   where l.id = p_listing_id
     and l.status = 'active'
     and lower(l.entity_type) = 'service';
  if v_provider is null then
    raise exception 'SERVICE_LISTING_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  select s.working_days, s.day_start, s.day_end, s.slot_minutes
    into v_days, v_start, v_end, v_step
    from public.service_provider_schedules s
   where s.provider_id = v_provider;

  v_days := coalesce(v_days, '{0,1,2,3,4,5,6}'::smallint[]);
  v_start := coalesce(v_start, '06:00'::time);
  v_end := coalesce(v_end, '23:00'::time);
  v_step := coalesce(v_step, 60);

  return query
    with days as (
      select d::date as day
        from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
       where extract(dow from d)::smallint = any (v_days)
         and not exists (
           select 1 from public.service_provider_blackouts b
            where b.provider_id = v_provider and b.blackout_date = d::date
         )
    ), slots as (
      select days.day,
             gs::time as starts,
             (gs + make_interval(mins => v_step))::time as ends
        from days
        cross join lateral generate_series(
          days.day::timestamp + v_start,
          days.day::timestamp + v_end - make_interval(mins => v_step),
          make_interval(mins => v_step)
        ) gs
    )
    select slots.day,
           slots.starts,
           slots.ends,
           to_char(slots.starts, 'HH24:MI') || '–' || to_char(slots.ends, 'HH24:MI') as label,
           to_char(slots.starts, 'HH24:MI') as key,
           exists (
             select 1 from public.service_bookings b
              where b.provider_id = v_provider
                and b.scheduled_date = slots.day
                and b.slot_key = to_char(slots.starts, 'HH24:MI')
                and b.status in ('requested', 'accepted', 'in_progress')
           ) as booked
      from slots
     order by slots.day, slots.starts;
end;
$$;

create or replace function public.service_listing_profile(p_listing_id text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'listingId', l.id,
    'title', l.title,
    'providerName', coalesce(p.full_name, ''),
    'categoryId', l.category_id,
    'subcategory', l.subcategory,
    'price', l.price,
    'priceUnit', l.price_unit,
    'serviceAreas', coalesce(s.service_areas, '{}'::text[]),
    'travelRadiusKm', s.travel_radius_km,
    'workingDays', coalesce(s.working_days, '{0,1,2,3,4,5,6}'::smallint[]),
    'dayStart', coalesce(to_char(s.day_start, 'HH24:MI'), '06:00'),
    'dayEnd', coalesce(to_char(s.day_end, 'HH24:MI'), '23:00'),
    'slotMinutes', coalesce(s.slot_minutes, 60),
    'scheduleConfigured', s.provider_id is not null
  )
  from public.listings l
  left join public.profiles p on p.id = l.owner_id
  left join public.service_provider_schedules s on s.provider_id = l.owner_id
  where l.id = p_listing_id
    and l.status = 'active'
    and lower(l.entity_type) = 'service';
$$;

-- -----------------------------------------------------------------------------
-- 4. Service payment intents (server-priced, server-verified)
-- -----------------------------------------------------------------------------
create table if not exists public.service_payment_intents (
  id                  text primary key,
  booking_id          uuid not null references public.service_bookings(id) on delete cascade,
  customer_id         uuid not null references public.profiles(id) on delete restrict,
  amount              numeric(12, 2) not null check (amount > 0),
  currency            text not null default 'INR' check (currency = 'INR'),
  merchant_vpa        text not null,
  upi_uri             text not null,
  provider            text not null default 'upi_sandbox',
  provider_payment_id text,
  status              text not null default 'created'
                      check (status in ('created','pending','verified','failed','expired','refunded')),
  idempotency_key     text not null,
  expires_at          timestamptz not null,
  verified_at         timestamptz,
  refunded_at         timestamptz,
  refund_amount       numeric(12, 2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (booking_id, idempotency_key)
);

create index if not exists idx_service_payment_intents_booking
  on public.service_payment_intents (booking_id, created_at desc);

create table if not exists public.service_payment_events (
  event_id       text primary key,
  intent_id      text not null references public.service_payment_intents(id) on delete cascade,
  event_type     text not null check (event_type in ('payment.captured','payment.failed','refund.succeeded')),
  amount_paise   bigint not null check (amount_paise > 0),
  payload_sha256 text not null,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz
);

alter table public.service_payment_intents enable row level security;
alter table public.service_payment_events enable row level security;

drop policy if exists "Booking parties read service payment intents" on public.service_payment_intents;
create policy "Booking parties read service payment intents"
  on public.service_payment_intents for select to authenticated
  using (
    customer_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.service_bookings b
       where b.id = service_payment_intents.booking_id and b.provider_id = (select auth.uid())
    )
  );

revoke all on public.service_payment_intents from public, anon, authenticated;
grant select on public.service_payment_intents to authenticated;

drop policy if exists "Admins read service payment events" on public.service_payment_events;
create policy "Admins read service payment events"
  on public.service_payment_events for select to authenticated
  using (public.is_admin());

revoke all on public.service_payment_events from public, anon, authenticated;
grant select on public.service_payment_events to authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPCs
-- -----------------------------------------------------------------------------
create or replace function public.create_service_payment_intent(
  p_booking_id uuid,
  p_merchant_vpa text,
  p_merchant_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.service_bookings;
  v_existing public.service_payment_intents;
  v_id text;
  v_uri text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_merchant_vpa is null or position('@' in p_merchant_vpa) = 0 then
    raise exception 'MERCHANT_VPA_NOT_CONFIGURED' using errcode = '42501';
  end if;

  select * into v_booking from public.service_bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.customer_id <> auth.uid() then
    raise exception 'BOOKING_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_existing
    from public.service_payment_intents
   where booking_id = p_booking_id and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', true, 'replayed', true, 'intentId', v_existing.id,
      'bookingId', v_existing.booking_id, 'amount', v_existing.amount,
      'status', v_existing.status, 'upiUri', v_existing.upi_uri,
      'expiresAt', v_existing.expires_at
    );
  end if;

  if v_booking.status not in ('requested', 'accepted') then
    raise exception 'BOOKING_NOT_PAYABLE: status %', v_booking.status using errcode = '42501';
  end if;
  if v_booking.payment_status = 'settled' then
    raise exception 'PAYMENT_ALREADY_SETTLED' using errcode = '42501';
  end if;
  if v_booking.payment_status = 'declared' then
    raise exception 'PAYMENT_CLAIM_PENDING_REVIEW' using errcode = '42501';
  end if;
  if v_booking.amount <= 0 then
    raise exception 'PRICE_NOT_CONFIGURED' using errcode = '22023';
  end if;

  v_id := 'spi_' || replace(gen_random_uuid()::text, '-', '');
  v_uri := format(
    'upi://pay?pa=%s&pn=%s&am=%s&cu=INR&tn=%s&tr=%s',
    p_merchant_vpa,
    replace(coalesce(nullif(trim(p_merchant_name), ''), 'BookOurSpace'), ' ', '%20'),
    to_char(v_booking.amount, 'FM999999990.00'),
    replace('Service ' || v_booking.booking_ref, ' ', '%20'),
    v_id
  );

  insert into public.service_payment_intents
    (id, booking_id, customer_id, amount, merchant_vpa, upi_uri, status, idempotency_key, expires_at)
  values
    (v_id, p_booking_id, auth.uid(), v_booking.amount, p_merchant_vpa, v_uri, 'pending', p_idempotency_key, now() + interval '30 minutes');

  -- payment_mode itself stays immutable (the existing booking guard owns that
  -- rule); settlement is proven by the intent row and payment_status.
  return jsonb_build_object(
    'ok', true, 'replayed', false, 'intentId', v_id, 'bookingId', p_booking_id,
    'amount', v_booking.amount, 'status', 'pending', 'upiUri', v_uri,
    'expiresAt', now() + interval '30 minutes'
  );
end;
$$;

create or replace function public.settle_service_payment(
  p_event_id text,
  p_intent_id text,
  p_provider_payment_id text,
  p_amount_paise bigint,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.service_payment_intents;
  v_inserted int;
  v_booking public.service_bookings;
begin
  if p_event_id is null or p_intent_id is null or p_provider_payment_id is null then
    raise exception 'INVALID_PROVIDER_EVENT' using errcode = '22023';
  end if;

  insert into public.service_payment_events (event_id, intent_id, event_type, amount_paise, payload_sha256)
  values (p_event_id, p_intent_id, 'payment.captured', greatest(p_amount_paise, 1), coalesce(p_payload_sha256, ''))
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_intent from public.service_payment_intents where id = p_intent_id for update;
  if v_intent.id is null then
    raise exception 'PAYMENT_INTENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_inserted = 0 or v_intent.status = 'verified' then
    update public.service_payment_events set processed_at = now() where event_id = p_event_id;
    return jsonb_build_object('ok', true, 'replayed', true, 'intentId', v_intent.id,
      'status', v_intent.status, 'bookingId', v_intent.booking_id);
  end if;
  if v_intent.status not in ('created', 'pending') then
    raise exception 'PAYMENT_INTENT_NOT_SETTLEABLE: status %', v_intent.status using errcode = '42501';
  end if;
  if p_amount_paise is null or p_amount_paise <> round(v_intent.amount * 100)::bigint then
    raise exception 'PAYMENT_AMOUNT_MISMATCH: expected % paise, received %',
      round(v_intent.amount * 100)::bigint, p_amount_paise using errcode = '22023';
  end if;

  update public.service_payment_intents
     set status = 'verified', provider_payment_id = p_provider_payment_id,
         verified_at = now(), updated_at = now()
   where id = p_intent_id;

  update public.service_bookings
     set payment_status = 'settled'
   where id = v_intent.booking_id;

  update public.service_payment_events set processed_at = now() where event_id = p_event_id;

  select * into v_booking from public.service_bookings where id = v_intent.booking_id;
  return jsonb_build_object(
    'ok', true, 'replayed', false, 'intentId', p_intent_id, 'status', 'verified',
    'bookingId', v_intent.booking_id, 'bookingPaymentStatus', v_booking.payment_status
  );
end;
$$;

create or replace function public.refund_service_payment(
  p_event_id text,
  p_intent_id text,
  p_refund_paise bigint,
  p_provider_refund_id text,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.service_payment_intents;
  v_inserted int;
begin
  if p_refund_paise is null or p_refund_paise <= 0 then
    raise exception 'INVALID_REFUND_AMOUNT' using errcode = '22023';
  end if;

  insert into public.service_payment_events (event_id, intent_id, event_type, amount_paise, payload_sha256)
  values (p_event_id, p_intent_id, 'refund.succeeded', p_refund_paise, coalesce(p_payload_sha256, ''))
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_intent from public.service_payment_intents where id = p_intent_id for update;
  if v_intent.id is null then
    raise exception 'PAYMENT_INTENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'replayed', true, 'intentId', v_intent.id,
      'status', v_intent.status, 'refundAmount', v_intent.refund_amount);
  end if;
  if v_intent.status <> 'verified' then
    raise exception 'PAYMENT_NOT_VERIFIED: cannot refund status %', v_intent.status using errcode = '42501';
  end if;
  if p_refund_paise > round(v_intent.amount * 100)::bigint then
    raise exception 'REFUND_EXCEEDS_PAYMENT' using errcode = '22023';
  end if;

  update public.service_payment_intents
     set status = 'refunded', refund_amount = p_refund_paise / 100.0,
         refunded_at = now(), updated_at = now()
   where id = p_intent_id;

  update public.service_bookings
     set payment_status = 'refunded',
         status = case when status in ('requested', 'accepted') then 'cancelled' else status end,
         cancelled_at = case when status in ('requested', 'accepted') then now() else cancelled_at end,
         cancellation_reason = coalesce(cancellation_reason, 'Refunded by provider')
   where id = v_intent.booking_id;

  update public.service_payment_events set processed_at = now() where event_id = p_event_id;

  return jsonb_build_object('ok', true, 'replayed', false, 'intentId', p_intent_id,
    'status', 'refunded', 'refundAmount', p_refund_paise / 100.0, 'bookingId', v_intent.booking_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.service_listing_slots(text, date, date) from public;
grant execute on function public.service_listing_slots(text, date, date) to anon, authenticated, service_role;
revoke all on function public.service_listing_profile(text) from public;
grant execute on function public.service_listing_profile(text) to anon, authenticated, service_role;

revoke all on function public.create_service_payment_intent(uuid, text, text, text) from public, anon;
grant execute on function public.create_service_payment_intent(uuid, text, text, text) to authenticated, service_role;
revoke all on function public.settle_service_payment(text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.settle_service_payment(text, text, text, bigint, text) to service_role;
revoke all on function public.refund_service_payment(text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.refund_service_payment(text, text, bigint, text, text) to service_role;

-- A booking with a verified online payment cannot be silently marked settled
-- twice, and a customer cannot flip payment state directly.
create or replace function public.enforce_service_booking_payment_guard()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.payment_status is distinct from old.payment_status
     and auth.uid() is not null
     and not public.is_admin() then
    -- 'declared' is the provider claim path; it is already RLS/trigger guarded.
    if new.payment_status = 'settled' or new.payment_status = 'refunded' then
      raise exception 'SERVICE_PAYMENT_SETTLEMENT_ADMIN_OR_PROVIDER_ONLY' using errcode = '42501';
    end if;
    if old.payment_status = 'settled' then
      raise exception 'SERVICE_PAYMENT_IMMUTABLE' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists service_bookings_payment_guard on public.service_bookings;
create trigger service_bookings_payment_guard
  before update on public.service_bookings
  for each row execute function public.enforce_service_booking_payment_guard();
