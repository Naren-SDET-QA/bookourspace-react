-- Hotels & Stays: Razorpay Checkout + verified UPI QR/intent settlement.
--
-- Additive and forward-only. Instant checkout already holds inventory and
-- prices in PostgreSQL; this migration lets the same booking accept a
-- Razorpay order or a Razorpay-issued UPI QR, then settles only from a
-- signed provider event. Pay-at-property is unchanged. No money is moved
-- by this file.
--
-- PREPARED LOCALLY ONLY: do not apply to Mumbai without separate approval.

begin;

alter table public.payment_intents
  add column if not exists qr_image_url text;

alter table public.payment_intents
  drop constraint if exists payment_intents_upi_fields_chk;
alter table public.payment_intents
  add constraint payment_intents_upi_fields_chk
  check (
    payment_mode <> 'upi'
    or (merchant_vpa is not null and upi_uri is not null)
    or (provider = 'razorpay' and provider_order_id is not null)
  );

-- -----------------------------------------------------------------------------
-- Instant checkout: UPI, Razorpay Checkout, or pay at the property.
-- -----------------------------------------------------------------------------
drop function if exists public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb);
-- Re-applying this still-pending migration must also remove the signature it
-- creates below. The installer normally skips ledgered versions; this keeps
-- the migration itself recoverable if SQL completed before its ledger insert.
drop function if exists public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb, text, text, text);

create function public.create_stay_checkout(
  p_listing_id text,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_units int,
  p_payment_mode text,
  p_idempotency_key text,
  p_merchant_vpa text,
  p_merchant_name text,
  p_guest jsonb default '{}'::jsonb,
  p_provider_order_id text default null,
  p_upi_uri_override text default null,
  p_qr_image_url text default null
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
  v_provider text;
  v_order_id text := nullif(btrim(coalesce(p_provider_order_id, '')), '');
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_check_in is null or p_check_out is null or p_check_in >= p_check_out then
    raise exception 'INVALID_STAY_RANGE' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if v_mode not in ('upi', 'pay_after_service', 'razorpay') then
    raise exception 'INVALID_PAYMENT_MODE' using errcode = '22023';
  end if;
  if v_mode = 'upi' and v_order_id is null
     and (p_merchant_vpa is null or position('@' in p_merchant_vpa) = 0) then
    raise exception 'MERCHANT_VPA_NOT_CONFIGURED' using errcode = '42501';
  end if;
  if v_mode = 'razorpay' and v_order_id is null then
    raise exception 'RAZORPAY_ORDER_REQUIRED' using errcode = '22023';
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
      'provider', v_existing.provider,
      'status', v_existing.status,
      'amountPaise', v_existing.amount_paise,
      'upiUri', case when v_existing.payment_mode = 'upi' and v_existing.status <> 'verified'
                     then v_existing.upi_uri else null end,
      'razorpayOrderId', v_existing.provider_order_id,
      'qrImageUrl', v_existing.qr_image_url,
      'expiresAt', v_existing.expires_at,
      'checkIn', p_check_in, 'checkOut', p_check_out
    );
  end if;

  select h.hold_token, h.expires_at
    into v_hold_token, v_expires
    from public.stay_hold_units(p_room_type_id, p_check_in, p_check_out, v_units, 30) h
   limit 1;

  v_booking_id := 'stay-' || replace(gen_random_uuid()::text, '-', '');
  v_intent_id := 'pi_' || replace(gen_random_uuid()::text, '-', '');

  if v_mode = 'upi' then
    v_upi_uri := nullif(btrim(coalesce(p_upi_uri_override, '')), '');
    if v_upi_uri is null and p_merchant_vpa is not null then
      v_upi_uri := format(
        'upi://pay?pa=%s&pn=%s&am=%s&cu=INR&tn=%s&tr=%s',
        p_merchant_vpa,
        replace(coalesce(nullif(btrim(p_merchant_name), ''), 'BookOurSpace'), ' ', '%20'),
        to_char(v_amount / 100.0, 'FM999999990.00'),
        replace('BookOurSpace stay ' || left(v_booking_id, 14), ' ', '%20'),
        v_intent_id
      );
    end if;
    v_provider := case when v_order_id is not null then 'razorpay' else 'upi_sandbox' end;
  elsif v_mode = 'razorpay' then
    v_upi_uri := null;
    v_provider := 'razorpay';
  else
    v_upi_uri := null;
    v_provider := 'offline';
    v_order_id := null;
  end if;

  insert into public.bookings (
    id, user_id, listing_id, listing_title, provider_id,
    customer_name, customer_phone, scheduled_date, scheduled_time,
    amount, status, payment_status, payment_mode, idempotency_key,
    room_type_id, units, total_paise, check_in, check_out, payload
  ) values (
    v_booking_id, v_uid, p_listing_id, coalesce(v_property.name, 'Stay'), v_property.owner_user_id::text,
    coalesce(nullif(btrim(p_guest->>'name'), ''), 'Guest'),
    coalesce(nullif(btrim(p_guest->>'phone'), ''), 'Not provided'),
    p_check_in::text, 'nightly',
    v_amount / 100.0, 'confirmed',
    case when v_mode = 'pay_after_service' then 'pay_later' else 'pending_verification' end,
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
    amount_paise, merchant_vpa, upi_uri, payment_mode, provider, status,
    idempotency_key, expires_at, provider_order_id, qr_image_url
  ) values (
    v_intent_id, v_uid, 'stay_booking', p_listing_id, p_room_type_id, v_booking_id,
    v_amount,
    case when v_mode = 'upi' then nullif(btrim(coalesce(p_merchant_vpa, '')), '') else null end,
    v_upi_uri, v_mode, v_provider,
    case when v_mode = 'pay_after_service' then 'created' else 'pending' end,
    p_idempotency_key, coalesce(v_expires, now() + interval '30 minutes'),
    v_order_id,
    nullif(btrim(coalesce(p_qr_image_url, '')), '')
  );

  select * into v_booking from public.bookings where id = v_booking_id;

  return jsonb_build_object(
    'ok', true, 'replayed', false,
    'bookingId', v_booking_id,
    'intentId', v_intent_id,
    'paymentMode', v_mode,
    'provider', v_provider,
    'status', v_booking.payment_status,
    'amountPaise', v_amount,
    'upiUri', v_upi_uri,
    'razorpayOrderId', v_order_id,
    'qrImageUrl', nullif(btrim(coalesce(p_qr_image_url, '')), ''),
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
      'paymentMode', v_existing.payment_mode, 'provider', v_existing.provider,
      'status', v_existing.status,
      'amountPaise', v_existing.amount_paise, 'upiUri', v_existing.upi_uri,
      'razorpayOrderId', v_existing.provider_order_id,
      'qrImageUrl', v_existing.qr_image_url,
      'expiresAt', v_existing.expires_at,
      'checkIn', p_check_in, 'checkOut', p_check_out
    );
end;
$$;

revoke all on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb, text, text, text)
  to authenticated, service_role;

-- Request-to-book may now record a Razorpay preference; money is still
-- collected only after host approval via a later intent.
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
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if v_mode not in ('upi', 'pay_after_service', 'razorpay') then
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
      'paymentMode', v_existing.payment_mode,
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
    coalesce(nullif(btrim(p_guest->>'name'), ''), 'Guest'),
    coalesce(nullif(btrim(p_guest->>'phone'), ''), 'Not provided'),
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
      'paymentMode', v_existing.payment_mode,
      'totalPaise', v_existing.total_paise, 'expiresAt', v_existing.request_expires_at);
end;
$$;

revoke all on function public.create_stay_request(text, uuid, date, date, int, text, text, jsonb, int) from public, anon;
grant execute on function public.create_stay_request(text, uuid, date, date, int, text, text, jsonb, int) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Provider-signed stay settlement (Razorpay Checkout, UPI QR, sandbox UPI).
-- Resolves the intent from the order/QR the database stored, never from a
-- client-supplied intent id alone when an order reference is present.
-- -----------------------------------------------------------------------------
create or replace function public.settle_stay_provider_event(
  p_event_id text,
  p_event_type text,
  p_provider text,
  p_intent_id text,
  p_order_id text,
  p_provider_payment_id text,
  p_amount_paise bigint,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_token uuid;
  v_inserted int;
  v_provider text := coalesce(nullif(btrim(p_provider), ''), 'razorpay');
begin
  if p_event_id is null or p_provider_payment_id is null or p_payload_sha256 is null then
    raise exception 'INVALID_PROVIDER_EVENT' using errcode = '22023';
  end if;
  if p_event_type not in ('payment.captured', 'payment.failed', 'refund.succeeded') then
    raise exception 'INVALID_PROVIDER_EVENT_TYPE' using errcode = '22023';
  end if;

  insert into public.payment_provider_events
    (event_id, provider, intent_id, event_type, payload_sha256, amount_paise)
  values
    (p_event_id, v_provider, nullif(btrim(coalesce(p_intent_id, '')), ''), p_event_type,
     p_payload_sha256, p_amount_paise)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if p_event_type = 'refund.succeeded' and nullif(btrim(coalesce(p_intent_id, '')), '') is not null then
    select pi.* into v_intent
      from public.payment_intents pi
      join public.bookings b on b.id = pi.booking_id
     where pi.id = btrim(p_intent_id)
       and coalesce(b.payload->>'source', '') in ('stay_checkout', 'stay_request')
     for update of pi;
  elsif p_event_type = 'refund.succeeded' then
    select pi.* into v_intent
      from public.payment_intents pi
      join public.bookings b on b.id = pi.booking_id
     where (pi.provider_payment_id = p_provider_payment_id
            or pi.provider_payment_reference = p_provider_payment_id)
       and coalesce(b.payload->>'source', '') in ('stay_checkout', 'stay_request')
     order by pi.created_at desc
     limit 1;
  elsif nullif(btrim(coalesce(p_order_id, '')), '') is not null then
    select pi.* into v_intent
      from public.payment_intents pi
      join public.bookings b on b.id = pi.booking_id
     where pi.provider_order_id = btrim(p_order_id)
       and coalesce(b.payload->>'source', '') in ('stay_checkout', 'stay_request')
     order by pi.created_at desc
     limit 1;
  elsif nullif(btrim(coalesce(p_intent_id, '')), '') is not null then
    select pi.* into v_intent
      from public.payment_intents pi
      join public.bookings b on b.id = pi.booking_id
     where pi.id = btrim(p_intent_id)
       and coalesce(b.payload->>'source', '') in ('stay_checkout', 'stay_request')
     for update of pi;
  end if;

  if v_intent.id is null then
    raise exception 'PAYMENT_INTENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_booking from public.bookings where id = v_intent.booking_id for update;
  if v_booking.id is null then
    raise exception 'STAY_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_inserted = 0 then
    return jsonb_build_object(
      'ok', true, 'replayed', true, 'intentId', v_intent.id,
      'status', v_intent.status, 'bookingId', v_intent.booking_id,
      'bookingPaymentStatus', v_booking.payment_status
    );
  end if;

  if p_event_type = 'refund.succeeded' then
    if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > v_intent.amount_paise then
      raise exception 'REFUND_EXCEEDS_PAYMENT' using errcode = '22023';
    end if;
  elsif p_amount_paise is null or p_amount_paise <> v_intent.amount_paise then
    raise exception 'PAYMENT_AMOUNT_MISMATCH: expected %, received %',
      v_intent.amount_paise, p_amount_paise using errcode = '22023';
  end if;

  if p_event_type = 'payment.captured' then
    if v_intent.status = 'verified' then
      update public.payment_provider_events set processed_at = now() where event_id = p_event_id;
      return jsonb_build_object(
        'ok', true, 'replayed', true, 'intentId', v_intent.id,
        'status', v_intent.status, 'bookingId', v_intent.booking_id,
        'bookingPaymentStatus', v_booking.payment_status
      );
    end if;
    if v_intent.status not in ('created', 'pending') then
      raise exception 'PAYMENT_INTENT_NOT_SETTLEABLE: status %', v_intent.status using errcode = '42501';
    end if;
    if v_intent.expires_at < now() then
      raise exception 'PAYMENT_INTENT_EXPIRED' using errcode = '22023';
    end if;

    update public.payment_intents
       set status = 'verified',
           provider_payment_id = p_provider_payment_id,
           provider_payment_reference = p_provider_payment_id,
           verified_at = now(), updated_at = now()
     where id = v_intent.id;

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

  elsif p_event_type = 'payment.failed' then
    update public.payment_intents
       set status = 'failed', updated_at = now()
     where id = v_intent.id and status in ('created', 'pending');
    update public.stay_allocations
       set status = 'released', updated_at = now()
     where booking_id = v_intent.booking_id and status in ('held', 'confirmed');
    update public.bookings
       set payment_status = 'failed', status = 'cancelled', cancelled_at = now()
     where id = v_intent.booking_id and payment_status <> 'verified';

  else
    if v_intent.status <> 'verified' then
      raise exception 'PAYMENT_NOT_VERIFIED: cannot refund status %', v_intent.status using errcode = '42501';
    end if;
    update public.payment_intents
       set status = 'refunded', refund_paise = p_amount_paise,
           refunded_at = now(), updated_at = now()
     where id = v_intent.id;
    update public.bookings
       set payment_status = 'refunded', status = 'cancelled',
           cancelled_at = now(), refund_paise = p_amount_paise
     where id = v_intent.booking_id;
    update public.stay_allocations
       set status = 'released', updated_at = now()
     where booking_id = v_intent.booking_id and status in ('held', 'confirmed');
  end if;

  update public.payment_provider_events
     set intent_id = v_intent.id, processed_at = now()
   where event_id = p_event_id;

  select * into v_booking from public.bookings where id = v_intent.booking_id;
  select * into v_intent from public.payment_intents where id = v_intent.id;
  return jsonb_build_object(
    'ok', true, 'replayed', false, 'intentId', v_intent.id,
    'status', v_intent.status, 'bookingId', v_intent.booking_id,
    'bookingPaymentStatus', v_booking.payment_status,
    'verified', v_intent.status = 'verified',
    'refundPaise', v_intent.refund_paise
  );
end;
$$;

revoke all on function public.settle_stay_provider_event(text, text, text, text, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.settle_stay_provider_event(text, text, text, text, text, text, bigint, text)
  to service_role;

-- Keep the original sandbox signature working: it still settles UPI sandbox
-- events by intent id after the HMAC check in Express.
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
set search_path = ''
as $$
begin
  return public.settle_stay_provider_event(
    p_event_id, 'payment.captured', 'upi_sandbox',
    p_intent_id, null, p_provider_payment_id, p_amount_paise, p_payload_sha256
  );
end;
$$;

revoke all on function public.settle_stay_payment(text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.settle_stay_payment(text, text, text, bigint, text) to service_role;

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
set search_path = ''
as $$
declare
  v_intent public.payment_intents;
begin
  select * into v_intent from public.payment_intents where id = p_intent_id;
  if v_intent.id is null then
    raise exception 'PAYMENT_INTENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return public.settle_stay_provider_event(
    p_event_id, 'refund.succeeded', coalesce(v_intent.provider, 'upi_sandbox'),
    p_intent_id, v_intent.provider_order_id, coalesce(v_intent.provider_payment_id, p_provider_refund_id),
    p_refund_paise, p_payload_sha256
  );
end;
$$;

revoke all on function public.refund_stay_payment(text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.refund_stay_payment(text, text, bigint, text, text) to service_role;

commit;
