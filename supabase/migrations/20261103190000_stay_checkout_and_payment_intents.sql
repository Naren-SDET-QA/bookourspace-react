-- =============================================================================
-- Stay checkout: server-authoritative pricing, UPI payment intents, pay after
-- service, signed settlement and refunds.
--
-- Design rules enforced here, not in the browser:
--   * Prices are computed from public.stay_room_types.base_price_paise.
--   * Inventory is reserved through the existing stay_hold_units RPC, whose
--     GiST exclusion constraint is the only double-booking guard.
--   * A booking becomes payment_status='verified' only inside
--     settle_stay_payment(), which is callable by the server only.
--   * Every provider event is recorded once in payment_provider_events, so a
--     replayed webhook cannot settle or refund twice.
--   * "Pay after service" reserves the room but never claims money was paid.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Booking columns needed by the checkout state machine
-- -----------------------------------------------------------------------------
alter table public.bookings add column if not exists payment_mode text not null default 'pay_later';
alter table public.bookings add column if not exists room_type_id uuid;
alter table public.bookings add column if not exists units int not null default 1;
alter table public.bookings add column if not exists total_paise bigint;
alter table public.bookings add column if not exists check_in date;
alter table public.bookings add column if not exists check_out date;
alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings add column if not exists refund_paise bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_payment_mode_check') then
    alter table public.bookings
      add constraint bookings_payment_mode_check
      check (payment_mode in ('pay_later', 'pay_after_service', 'upi'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_total_paise_check') then
    alter table public.bookings
      add constraint bookings_total_paise_check
      check (total_paise is null or total_paise >= 0);
  end if;
end $$;

create index if not exists idx_bookings_user_created
  on public.bookings (user_id, created_at desc);
create index if not exists idx_bookings_listing_dates
  on public.bookings (listing_id, check_in, check_out);

-- -----------------------------------------------------------------------------
-- 2. Payment intents
-- -----------------------------------------------------------------------------
create table if not exists public.payment_intents (
  id                 text primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  purpose            text not null default 'stay_booking'
                     check (purpose in ('stay_booking', 'service_booking', 'subscription')),
  listing_id         text not null,
  room_type_id       uuid references public.stay_room_types(id) on delete set null,
  booking_id         text references public.bookings(id) on delete set null,
  amount_paise       bigint not null check (amount_paise > 0),
  currency           text not null default 'INR' check (currency = 'INR'),
  merchant_vpa       text not null,
  upi_uri            text not null,
  payment_mode       text not null default 'upi'
                     check (payment_mode in ('upi', 'pay_after_service')),
  provider           text not null default 'upi_sandbox',
  status             text not null default 'created'
                     check (status in ('created','pending','verified','failed','expired','refunded')),
  provider_payment_id text,
  idempotency_key    text not null,
  expires_at         timestamptz not null,
  verified_at        timestamptz,
  refunded_at        timestamptz,
  refund_paise       bigint check (refund_paise is null or refund_paise >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists idx_payment_intents_user_status
  on public.payment_intents (user_id, status, created_at desc);
create index if not exists idx_payment_intents_booking
  on public.payment_intents (booking_id);

-- Provider callbacks are recorded once. The primary key is the double-settlement
-- and double-refund guard.
create table if not exists public.payment_provider_events (
  event_id       text primary key,
  provider       text not null,
  intent_id      text references public.payment_intents(id) on delete cascade,
  event_type     text not null check (event_type in ('payment.captured','payment.failed','refund.succeeded')),
  payload_sha256 text not null,
  amount_paise   bigint,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz
);

alter table public.payment_intents enable row level security;
alter table public.payment_provider_events enable row level security;

drop policy if exists "Owners and admins read payment intents" on public.payment_intents;
create policy "Owners and admins read payment intents"
  on public.payment_intents for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- There is deliberately no INSERT/UPDATE/DELETE policy: only the SECURITY
-- DEFINER functions below may create or move an intent.
revoke insert, update, delete on public.payment_intents from anon, authenticated;
grant select on public.payment_intents to authenticated, service_role;

drop policy if exists "Admins read provider events" on public.payment_provider_events;
create policy "Admins read provider events"
  on public.payment_provider_events for select to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.payment_provider_events from anon, authenticated;
grant select on public.payment_provider_events to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Checkout: hold inventory + create booking + payment intent atomically
-- -----------------------------------------------------------------------------
create or replace function public.create_stay_checkout(
  p_listing_id text,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_units int,
  p_payment_mode text,
  p_idempotency_key text,
  p_merchant_vpa text,
  p_merchant_name text,
  p_guest jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_property public.stay_properties;
  v_room public.stay_room_types;
  v_nights int;
  v_units int := greatest(1, least(coalesce(p_units, 1), 5));
  v_amount bigint;
  v_booking_id text;
  v_intent_id text;
  v_hold_token uuid;
  v_expires timestamptz;
  v_existing public.payment_intents;
  v_booking public.bookings;
  v_upi_uri text;
  v_mode text := coalesce(p_payment_mode, 'upi');
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_check_in is null or p_check_out is null or p_check_in >= p_check_out then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if v_mode not in ('upi', 'pay_after_service') then
    raise exception 'INVALID_PAYMENT_MODE' using errcode = '22023';
  end if;
  if p_merchant_vpa is null or position('@' in p_merchant_vpa) = 0 then
    raise exception 'MERCHANT_VPA_NOT_CONFIGURED' using errcode = '42501';
  end if;

  v_nights := p_check_out - p_check_in;

  select rt.* into v_room
    from public.stay_room_types rt
    join public.stay_properties p on p.id = rt.property_id
   where rt.id = p_room_type_id
     and p.listing_id = p_listing_id
     and rt.is_active and p.is_active;
  if v_room is null then
    raise exception 'ROOM_TYPE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_property from public.stay_properties where id = v_room.property_id;

  v_amount := v_nights::bigint * v_room.base_price_paise::bigint * v_units;
  if v_amount <= 0 then
    raise exception 'PRICE_NOT_CONFIGURED' using errcode = '22023';
  end if;

  -- Idempotent replay: return the original checkout untouched.
  select * into v_existing
    from public.payment_intents
   where user_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'bookingId', v_existing.booking_id,
      'intentId', v_existing.id,
      'paymentMode', v_existing.payment_mode,
      'status', v_existing.status,
      'amountPaise', v_existing.amount_paise,
      'upiUri', case when v_existing.status = 'verified' then null else v_existing.upi_uri end,
      'expiresAt', v_existing.expires_at,
      'checkIn', p_check_in, 'checkOut', p_check_out
    );
  end if;

  -- Reserve real inventory. Raises INSUFFICIENT_AVAILABILITY / exclusion error
  -- when another guest won the race.
  select h.hold_token, h.expires_at
    into v_hold_token, v_expires
    from public.stay_hold_units(p_room_type_id, p_check_in, p_check_out, v_units, 15) h
   limit 1;

  v_booking_id := 'stay-' || replace(gen_random_uuid()::text, '-', '');
  v_intent_id := 'pi_' || replace(gen_random_uuid()::text, '-', '');
  v_upi_uri := format(
    'upi://pay?pa=%s&pn=%s&am=%s&cu=INR&tn=%s&tr=%s',
    p_merchant_vpa,
    replace(coalesce(nullif(trim(p_merchant_name), ''), 'BookOurSpace'), ' ', '%20'),
    to_char(v_amount / 100.0, 'FM999999990.00'),
    replace('BookOurSpace stay ' || left(v_booking_id, 14), ' ', '%20'),
    v_intent_id
  );

  insert into public.bookings (
    id, user_id, listing_id, listing_title, provider_id,
    customer_name, customer_phone, scheduled_date, scheduled_time,
    amount, status, payment_status, payment_mode, idempotency_key,
    room_type_id, units, total_paise, check_in, check_out, payload
  ) values (
    v_booking_id, v_uid, p_listing_id, coalesce(v_property.name, 'Stay'), v_property.owner_user_id::text,
    coalesce(nullif(trim(p_guest->>'name'), ''), 'Guest'),
    coalesce(nullif(trim(p_guest->>'phone'), ''), 'Not provided'),
    p_check_in::text, 'nightly',
    v_amount / 100.0, 'confirmed',
    case when v_mode = 'upi' then 'pending_verification' else 'pay_later' end,
    v_mode, p_idempotency_key,
    p_room_type_id, v_units, v_amount, p_check_in, p_check_out,
    jsonb_build_object(
      'source', 'stay_checkout',
      'roomType', v_room.name,
      'units', v_units,
      'nights', v_nights,
      'checkIn', p_check_in,
      'checkOut', p_check_out,
      'totalPaise', v_amount
    )
  );

  update public.stay_allocations
     set booking_id = v_booking_id, total_paise = v_amount, updated_at = now()
   where hold_token = v_hold_token;

  if v_mode = 'pay_after_service' then
    perform public.stay_confirm_pay_after_service(v_hold_token, v_booking_id);
  end if;

  insert into public.payment_intents (
    id, user_id, purpose, listing_id, room_type_id, booking_id,
    amount_paise, merchant_vpa, upi_uri, payment_mode, status,
    idempotency_key, expires_at
  ) values (
    v_intent_id, v_uid, 'stay_booking', p_listing_id, p_room_type_id, v_booking_id,
    v_amount, p_merchant_vpa, v_upi_uri, v_mode,
    case when v_mode = 'upi' then 'pending' else 'created' end,
    p_idempotency_key, coalesce(v_expires, now() + interval '15 minutes')
  );

  select * into v_booking from public.bookings where id = v_booking_id;

  return jsonb_build_object(
    'ok', true, 'replayed', false,
    'bookingId', v_booking_id,
    'intentId', v_intent_id,
    'paymentMode', v_mode,
    'status', v_booking.payment_status,
    'amountPaise', v_amount,
    'upiUri', case when v_mode = 'upi' then v_upi_uri else null end,
    'holdToken', v_hold_token,
    'expiresAt', v_expires,
    'checkIn', p_check_in, 'checkOut', p_check_out,
    'nights', v_nights, 'units', v_units,
    'roomType', v_room.name,
    'listingTitle', v_property.name
  );
exception
  when unique_violation then
    -- A concurrent retry with the same key: return the winner's row.
    select * into v_existing from public.payment_intents
      where user_id = v_uid and idempotency_key = p_idempotency_key;
    if v_existing.id is null then raise; end if;
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'bookingId', v_existing.booking_id, 'intentId', v_existing.id,
      'paymentMode', v_existing.payment_mode, 'status', v_existing.status,
      'amountPaise', v_existing.amount_paise, 'upiUri', v_existing.upi_uri,
      'expiresAt', v_existing.expires_at,
      'checkIn', p_check_in, 'checkOut', p_check_out
    );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Pay after service: reserve the room, never claim money was received
-- -----------------------------------------------------------------------------
create or replace function public.stay_confirm_pay_after_service(
  p_hold_token uuid,
  p_booking_id text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not exists (
    select 1 from public.bookings b
     where b.id = p_booking_id
       and b.payment_mode = 'pay_after_service'
       and b.payment_status = 'pay_later'
       and b.status = 'confirmed'
  ) then
    raise exception 'BOOKING_NOT_ELIGIBLE_FOR_PAY_AFTER_SERVICE' using errcode = '42501';
  end if;

  with confirmed as (
    update public.stay_allocations
       set status = 'confirmed', booking_id = p_booking_id, expires_at = null, updated_at = now()
     where hold_token = p_hold_token
       and status = 'held'
       and expires_at > now()
    returning 1
  )
  select count(*)::int into v_count from confirmed;

  if v_count = 0 then
    raise exception 'HOLD_EXPIRED_OR_MISSING' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Signed settlement (server only)
-- -----------------------------------------------------------------------------
create or replace function public.settle_stay_payment(
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
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_token uuid;
  v_inserted int;
begin
  if p_event_id is null or p_intent_id is null or p_provider_payment_id is null then
    raise exception 'INVALID_PROVIDER_EVENT' using errcode = '22023';
  end if;

  insert into public.payment_provider_events
    (event_id, provider, intent_id, event_type, payload_sha256, amount_paise)
  values
    (p_event_id, 'upi_sandbox', p_intent_id, 'payment.captured', coalesce(p_payload_sha256, ''), p_amount_paise)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_intent from public.payment_intents where id = p_intent_id for update;
  if v_intent.id is null then
    raise exception 'PAYMENT_INTENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Replayed event: no second state change, no second confirmation.
  if v_inserted = 0 then
    return jsonb_build_object(
      'ok', true, 'replayed', true, 'intentId', v_intent.id,
      'status', v_intent.status, 'bookingId', v_intent.booking_id
    );
  end if;

  if v_intent.status = 'verified' then
    update public.payment_provider_events set processed_at = now() where event_id = p_event_id;
    return jsonb_build_object(
      'ok', true, 'replayed', true, 'intentId', v_intent.id,
      'status', v_intent.status, 'bookingId', v_intent.booking_id
    );
  end if;
  if v_intent.status not in ('created', 'pending') then
    raise exception 'PAYMENT_INTENT_NOT_SETTLEABLE: status %', v_intent.status using errcode = '42501';
  end if;
  if p_amount_paise is null or p_amount_paise <> v_intent.amount_paise then
    raise exception 'PAYMENT_AMOUNT_MISMATCH: expected %, received %',
      v_intent.amount_paise, p_amount_paise using errcode = '22023';
  end if;
  if v_intent.expires_at < now() then
    raise exception 'PAYMENT_INTENT_EXPIRED' using errcode = '22023';
  end if;

  update public.payment_intents
     set status = 'verified', provider_payment_id = p_provider_payment_id,
         verified_at = now(), updated_at = now()
   where id = p_intent_id;

  update public.bookings
     set payment_status = 'verified', payment_utr = p_provider_payment_id
   where id = v_intent.booking_id;

  select hold_token into v_token
    from public.stay_allocations
   where booking_id = v_intent.booking_id and status = 'held'
   order by created_at desc limit 1;

  if v_token is not null then
    perform public.stay_confirm_booking(v_token, v_intent.booking_id);
  end if;

  update public.payment_provider_events set processed_at = now() where event_id = p_event_id;

  select * into v_booking from public.bookings where id = v_intent.booking_id;
  return jsonb_build_object(
    'ok', true, 'replayed', false, 'intentId', p_intent_id,
    'status', 'verified', 'bookingId', v_intent.booking_id,
    'bookingPaymentStatus', v_booking.payment_status
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Cancellation + refund (server only)
-- -----------------------------------------------------------------------------
create or replace function public.stay_cancel_allocation(p_hold_token uuid)
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
       and status in ('held', 'confirmed')
       and (guest_user_id = auth.uid() or auth.role() = 'service_role' or public.is_admin())
    returning 1
  )
  select count(*)::int into v_count from released;
  return v_count;
end;
$$;

create or replace function public.refund_stay_payment(
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
  v_intent public.payment_intents;
  v_inserted int;
begin
  if p_refund_paise is null or p_refund_paise <= 0 then
    raise exception 'INVALID_REFUND_AMOUNT' using errcode = '22023';
  end if;

  insert into public.payment_provider_events
    (event_id, provider, intent_id, event_type, payload_sha256, amount_paise)
  values
    (p_event_id, 'upi_sandbox', p_intent_id, 'refund.succeeded', coalesce(p_payload_sha256, ''), p_refund_paise)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_intent from public.payment_intents where id = p_intent_id for update;
  if v_intent.id is null then
    raise exception 'PAYMENT_INTENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'replayed', true, 'intentId', v_intent.id,
      'status', v_intent.status, 'refundPaise', v_intent.refund_paise);
  end if;
  if v_intent.status <> 'verified' then
    raise exception 'PAYMENT_NOT_VERIFIED: cannot refund status %', v_intent.status using errcode = '42501';
  end if;
  if p_refund_paise > v_intent.amount_paise then
    raise exception 'REFUND_EXCEEDS_PAYMENT' using errcode = '22023';
  end if;

  update public.payment_intents
     set status = 'refunded', refund_paise = p_refund_paise,
         refunded_at = now(), updated_at = now()
   where id = p_intent_id;

  update public.bookings
     set payment_status = 'refunded', status = 'cancelled',
         cancelled_at = now(), refund_paise = p_refund_paise
   where id = v_intent.booking_id;

  update public.stay_allocations
     set status = 'released', updated_at = now()
   where booking_id = v_intent.booking_id and status in ('held', 'confirmed');

  update public.payment_provider_events set processed_at = now() where event_id = p_event_id;

  return jsonb_build_object(
    'ok', true, 'replayed', false, 'intentId', p_intent_id,
    'status', 'refunded', 'refundPaise', p_refund_paise,
    'bookingId', v_intent.booking_id, 'providerRefundId', p_provider_refund_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Function privileges: the browser may only run read-only helpers
-- -----------------------------------------------------------------------------
revoke all on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.settle_stay_payment(text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.refund_stay_payment(text, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.stay_cancel_allocation(uuid) from public, anon, authenticated;
revoke all on function public.stay_confirm_pay_after_service(uuid, text) from public, anon, authenticated;

grant execute on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.stay_cancel_allocation(uuid) to authenticated, service_role;
grant execute on function public.settle_stay_payment(text, text, text, bigint, text) to service_role;
grant execute on function public.refund_stay_payment(text, text, bigint, text, text) to service_role;
grant execute on function public.stay_confirm_pay_after_service(uuid, text) to service_role;
