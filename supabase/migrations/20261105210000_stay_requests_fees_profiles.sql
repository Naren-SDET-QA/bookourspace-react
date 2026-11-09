-- ============================================================================
-- Request-to-book, configurable fees and customer self check-in.
--
-- Additive, transactional and idempotent. Requests hold real inventory until
-- the host responds or the request expires; UPI payment is created only after
-- the host approves. No money is collected by this migration.
-- ============================================================================

begin;

alter table public.stay_properties
  add column if not exists cleaning_fee_paise int not null default 0,
  add column if not exists service_fee_bps int not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.stay_properties'::regclass and conname='stay_properties_fees_chk') then
    alter table public.stay_properties
      add constraint stay_properties_fees_chk
      check (cleaning_fee_paise >= 0 and cleaning_fee_paise <= 100000000
             and service_fee_bps >= 0 and service_fee_bps <= 3000);
  end if;
end $$;

alter table public.bookings
  add column if not exists request_expires_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists request_note text;

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in (
    'pay_later', 'pending_verification', 'verified', 'failed',
    'refunded', 'collected_offline', 'refund_pending', 'not_due'
  ));

create index if not exists idx_bookings_request_expiry
  on public.bookings (status, request_expires_at)
  where status in ('pending_approval', 'approved');

-- One server-side formula for every price component. Guests, hosts and the
-- checkout all read this function, so no client can add or omit a fee.
create or replace function public.stay_price_quote(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_units int
)
returns table (
  nights int, units int, base_price_paise int,
  subtotal_paise bigint, cleaning_fee_paise bigint, service_fee_paise bigint,
  tax_percent numeric, taxes_paise bigint, total_paise bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select greatest(1, (p_check_out - p_check_in))::int as nights,
           greatest(1, least(coalesce(p_units, 1), 5))::int as units,
           rt.base_price_paise,
           coalesce(p.cleaning_fee_paise, 0)::bigint as cleaning_fee_paise,
           coalesce(p.service_fee_bps, 0)::numeric as service_fee_bps,
           coalesce(p.tax_percent, 0)::numeric as tax_percent
      from public.stay_room_types rt
      join public.stay_properties p on p.id = rt.property_id
     where rt.id = p_room_type_id
  ), calc as (
    select nights, units, base_price_paise,
           nights::bigint * base_price_paise * units as subtotal_paise,
           cleaning_fee_paise,
           round((nights::bigint * base_price_paise * units) * service_fee_bps / 10000.0)::bigint as service_fee_paise,
           tax_percent
      from base
  ), taxed as (
    select *, round((subtotal_paise + cleaning_fee_paise + service_fee_paise) * tax_percent / 100.0)::bigint as taxes_paise
      from calc
  )
  select nights, units, base_price_paise, subtotal_paise, cleaning_fee_paise,
         service_fee_paise, tax_percent, taxes_paise,
         subtotal_paise + cleaning_fee_paise + service_fee_paise + taxes_paise as total_paise
    from taxed;
$$;

revoke all on function public.stay_price_quote(uuid, date, date, int) from public;
grant execute on function public.stay_price_quote(uuid, date, date, int) to anon, authenticated, service_role;

-- Fee-aware instant checkout. The only change from the previous function is
-- that the amount now comes from stay_price_quote (base + cleaning + service +
-- tax), and the breakdown is stored on the booking.
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
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_property public.stay_properties;
  v_room public.stay_room_types;
  v_nights int;
  v_units int := greatest(1, least(coalesce(p_units, 1), 5));
  v_amount bigint;
  v_subtotal bigint;
  v_cleaning bigint;
  v_service bigint;
  v_taxes bigint;
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
  if v_mode = 'upi' and (p_merchant_vpa is null or position('@' in p_merchant_vpa) = 0) then
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

  select q.subtotal_paise, q.cleaning_fee_paise, q.service_fee_paise, q.taxes_paise, q.total_paise
    into v_subtotal, v_cleaning, v_service, v_taxes, v_amount
    from public.stay_price_quote(p_room_type_id, p_check_in, p_check_out, v_units) q;
  if v_amount is null or v_amount <= 0 or v_subtotal <= 0 then
    raise exception 'PRICE_NOT_CONFIGURED' using errcode = '22023';
  end if;

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
      'upiUri', case when v_existing.payment_mode = 'upi' and v_existing.status <> 'verified'
                     then v_existing.upi_uri else null end,
      'expiresAt', v_existing.expires_at,
      'checkIn', p_check_in, 'checkOut', p_check_out
    );
  end if;

  select h.hold_token, h.expires_at
    into v_hold_token, v_expires
    from public.stay_hold_units(p_room_type_id, p_check_in, p_check_out, v_units, 15) h
   limit 1;

  v_booking_id := 'stay-' || replace(gen_random_uuid()::text, '-', '');
  v_intent_id := 'pi_' || replace(gen_random_uuid()::text, '-', '');

  -- Only the online path builds a UPI intent. The offline path stores NULL so
  -- the record honestly says "no online payment was requested".
  if v_mode = 'upi' then
    v_upi_uri := format(
      'upi://pay?pa=%s&pn=%s&am=%s&cu=INR&tn=%s&tr=%s',
      p_merchant_vpa,
      replace(coalesce(nullif(trim(p_merchant_name), ''), 'BookOurSpace'), ' ', '%20'),
      to_char(v_amount / 100.0, 'FM999999990.00'),
      replace('BookOurSpace stay ' || left(v_booking_id, 14), ' ', '%20'),
      v_intent_id
    );
  else
    v_upi_uri := null;
  end if;

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
      'subtotalPaise', v_subtotal,
      'cleaningFeePaise', v_cleaning,
      'serviceFeePaise', v_service,
      'taxesPaise', v_taxes,
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
    v_amount,
    case when v_mode = 'upi' then p_merchant_vpa else null end,
    v_upi_uri, v_mode,
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
    'subtotalPaise', v_subtotal,
    'cleaningFeePaise', v_cleaning,
    'serviceFeePaise', v_service,
    'taxesPaise', v_taxes,
    'roomType', v_room.name,
    'listingTitle', v_property.name
  );
exception
  when unique_violation then
    select * into v_existing from public.payment_intents
      where user_id = v_uid and idempotency_key = p_idempotency_key;
    if v_existing.id is null then raise; end if;
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'bookingId', v_existing.booking_id, 'intentId', v_existing.id,
      'paymentMode', v_existing.payment_mode, 'status', v_existing.status,
      'amountPaise', v_existing.amount_paise,
      'upiUri', case when v_existing.payment_mode = 'upi' then v_existing.upi_uri else null end,
      'expiresAt', v_existing.expires_at,
      'checkIn', p_check_in, 'checkOut', p_check_out
    );
end;
$$;

revoke all on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb)
  to authenticated, service_role;

-- Request-to-book: real inventory hold, no money, host decision required.
create or replace function public.create_stay_request(
  p_listing_id text,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_units int,
  p_payment_mode text,
  p_idempotency_key text,
  p_guest jsonb default '{}'::jsonb,
  p_expiry_hours int default 24
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_property public.stay_properties;
  v_room public.stay_room_types;
  v_quote record;
  v_units int := greatest(1, least(coalesce(p_units, 1), 5));
  v_hold_token uuid;
  v_expires timestamptz;
  v_booking_id text;
  v_existing public.bookings;
  v_mode text := coalesce(p_payment_mode, 'upi');
  v_minutes int := greatest(5, least(coalesce(p_expiry_hours, 24) * 60, 30));
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_check_in is null or p_check_out is null or p_check_in >= p_check_out then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  if p_check_in < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'CHECK_IN_IN_PAST' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if v_mode not in ('upi', 'pay_after_service') then
    raise exception 'INVALID_PAYMENT_MODE' using errcode = '22023';
  end if;

  select rt.* into v_room
    from public.stay_room_types rt
    join public.stay_properties p on p.id = rt.property_id
    join public.listings l on l.id = p.listing_id
   where rt.id = p_room_type_id
     and p.listing_id = p_listing_id
     and rt.is_active and p.is_active and l.status = 'active';
  if v_room is null then
    raise exception 'ROOM_TYPE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_property from public.stay_properties where id = v_room.property_id;
  if v_property.instant_book then
    raise exception 'INSTANT_BOOK_REQUIRED' using errcode = '22023';
  end if;

  select * into v_existing from public.bookings
   where user_id = v_uid and idempotency_key = p_idempotency_key
   limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', true, 'replayed', true, 'bookingId', v_existing.id,
      'status', v_existing.status, 'paymentStatus', v_existing.payment_status,
      'totalPaise', v_existing.total_paise, 'expiresAt', v_existing.request_expires_at,
      'checkIn', v_existing.check_in, 'checkOut', v_existing.check_out
    );
  end if;

  select * into v_quote from public.stay_price_quote(p_room_type_id, p_check_in, p_check_out, v_units);
  if v_quote.total_paise is null or v_quote.total_paise <= 0 then
    raise exception 'PRICE_NOT_CONFIGURED' using errcode = '22023';
  end if;

  select h.hold_token, h.expires_at into v_hold_token, v_expires
    from public.stay_hold_units(p_room_type_id, p_check_in, p_check_out, v_units, v_minutes) h
   limit 1;

  v_booking_id := 'stay-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.bookings (
    id, user_id, listing_id, listing_title, provider_id,
    customer_name, customer_phone, scheduled_date, scheduled_time,
    amount, status, payment_status, payment_mode, idempotency_key,
    room_type_id, units, total_paise, check_in, check_out,
    request_expires_at, payload
  ) values (
    v_booking_id, v_uid, p_listing_id, coalesce(v_property.name, 'Stay'),
    v_property.owner_user_id::text,
    coalesce(nullif(trim(p_guest->>'name'), ''), 'Guest'),
    coalesce(nullif(trim(p_guest->>'phone'), ''), 'Not provided'),
    p_check_in::text, 'nightly',
    v_quote.total_paise / 100.0, 'pending_approval', 'not_due', v_mode, p_idempotency_key,
    p_room_type_id, v_units, v_quote.total_paise, p_check_in, p_check_out,
    v_expires,
    jsonb_build_object(
      'source', 'stay_request', 'roomType', v_room.name, 'units', v_units,
      'nights', v_quote.nights, 'checkIn', p_check_in, 'checkOut', p_check_out,
      'subtotalPaise', v_quote.subtotal_paise, 'cleaningFeePaise', v_quote.cleaning_fee_paise,
      'serviceFeePaise', v_quote.service_fee_paise, 'taxesPaise', v_quote.taxes_paise,
      'totalPaise', v_quote.total_paise
    )
  );

  update public.stay_allocations
     set booking_id = v_booking_id, total_paise = v_quote.total_paise, updated_at = now()
   where hold_token = v_hold_token;

  insert into public.notifications (recipient_user_id, title, message, notif_type, link_id, created_by)
  values (
    v_property.owner_user_id,
    'New stay request',
    format('A guest requested %s (%s → %s). Respond before %s.',
      coalesce(v_property.name, 'your stay'), p_check_in, p_check_out,
      to_char(v_expires at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI')),
    'stay_request', v_booking_id, v_uid
  );

  return jsonb_build_object(
    'ok', true, 'replayed', false, 'bookingId', v_booking_id,
    'status', 'pending_approval', 'paymentStatus', 'not_due',
    'paymentMode', v_mode,
    'totalPaise', v_quote.total_paise,
    'subtotalPaise', v_quote.subtotal_paise,
    'cleaningFeePaise', v_quote.cleaning_fee_paise,
    'serviceFeePaise', v_quote.service_fee_paise,
    'taxesPaise', v_quote.taxes_paise,
    'expiresAt', v_expires, 'checkIn', p_check_in, 'checkOut', p_check_out,
    'nights', v_quote.nights, 'units', v_units, 'roomType', v_room.name
  );
exception
  when unique_violation then
    select * into v_existing from public.bookings where user_id = v_uid and idempotency_key = p_idempotency_key limit 1;
    if v_existing.id is null then raise; end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'bookingId', v_existing.id,
      'status', v_existing.status, 'paymentStatus', v_existing.payment_status,
      'totalPaise', v_existing.total_paise, 'expiresAt', v_existing.request_expires_at);
end;
$$;

revoke all on function public.create_stay_request(text, uuid, date, date, int, text, text, jsonb, int) from public, anon;
grant execute on function public.create_stay_request(text, uuid, date, date, int, text, text, jsonb, int) to authenticated, service_role;

-- A cancelled, rejected or expired booking must not leave a payable intent
-- behind. Closing the intent is what makes the cancellation final.
create or replace function public.stay_expire_intents_on_booking_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'rejected', 'expired')
     and new.status is distinct from old.status then
    update public.payment_intents
       set status = 'expired', updated_at = now()
     where booking_id = new.id and status in ('created', 'pending');
  end if;
  return null;
end;
$$;

drop trigger if exists trg_stay_expire_intents_on_booking_close on public.bookings;
create trigger trg_stay_expire_intents_on_booking_close
  after update of status on public.bookings
  for each row execute function public.stay_expire_intents_on_booking_close();

revoke all on function public.stay_expire_intents_on_booking_close() from public, anon, authenticated;

-- A request becomes a confirmed booking at the moment its payment is verified,
-- whether that comes from a signed provider callback or an authorized manual
-- settlement. Keeping this in one trigger avoids two divergent code paths.
create or replace function public.stay_confirm_request_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and new.payment_status = 'verified' then
    new.status := 'confirmed';
    new.request_expires_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stay_confirm_request_on_payment on public.bookings;
create trigger trg_stay_confirm_request_on_payment
  before update of payment_status on public.bookings
  for each row execute function public.stay_confirm_request_on_payment();

revoke all on function public.stay_confirm_request_on_payment() from public, anon, authenticated;

-- Expiry is enforced by the server on every booking read/action. Expired
-- requests release inventory, close the open intent and notify the guest.
create or replace function public.sweep_stay_requests()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with expired as (
    update public.bookings
       set status = 'expired'
     where status in ('pending_approval', 'approved')
       and request_expires_at is not null
       and request_expires_at <= now()
    returning id, user_id, listing_id, provider_id
  ), released as (
    update public.stay_allocations
       set status = 'released', updated_at = now()
     where booking_id in (select id from expired)
       and status in ('held', 'confirmed')
    returning 1
  ), intents as (
    update public.payment_intents
       set status = 'expired', updated_at = now()
     where booking_id in (select id from expired)
       and status in ('created', 'pending')
    returning 1
  ), guest_notes as (
    insert into public.notifications (recipient_user_id, title, message, notif_type, link_id)
    select user_id, 'Stay request expired',
           'Your stay request expired before the host responded. No money was collected.',
           'stay_request', id
      from expired
    returning 1
  ), host_notes as (
    insert into public.notifications (recipient_user_id, title, message, notif_type, link_id)
    select provider_id::uuid, 'Stay request expired',
           'A stay request expired without a response. No money was collected.',
           'stay_request', id
      from expired
     where provider_id is not null
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

revoke all on function public.sweep_stay_requests() from public, anon, authenticated;
grant execute on function public.sweep_stay_requests() to service_role;

grant select, insert, update on public.notifications to service_role;
grant select, insert, update on public.payment_intents to service_role;

commit;
