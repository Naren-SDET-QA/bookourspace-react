-- ============================================================================
-- Stay checkout: pay-after-service must not require a UPI merchant VPA.
--
-- create_stay_checkout previously raised MERCHANT_VPA_NOT_CONFIGURED for every
-- payment mode, so a property could not accept a "pay at property" reservation
-- unless online UPI was also configured. The VPA requirement now applies only
-- to the online (upi) path. Everything else is unchanged.
-- ============================================================================

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
  -- Pay-after-service takes no online payment, so it must not require a UPI
  -- receiver. Only the online (UPI) path needs a configured merchant VPA.
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

revoke all on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_stay_checkout(text, uuid, date, date, int, text, text, text, text, jsonb) to authenticated, service_role;
