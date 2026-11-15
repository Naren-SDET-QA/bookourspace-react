-- Razorpay (Test Mode) settlement for PG reservations.
--
-- The browser never decides that a payment succeeded. A Razorpay webhook
-- arrives, its signature is verified over the RAW request body, and the
-- money state is moved by PostgreSQL alone:
--
--   * the intent is resolved from the Razorpay order reference that the
--     database stored when the intent was created — never from the payload;
--   * the amount that is booked is the amount PostgreSQL computed for the
--     reservation. The amount in the payload is only used to refuse a
--     mismatching event, never to set the money state;
--   * the event id is recorded once, so a replayed callback changes nothing;
--   * a Razorpay event can only settle a Razorpay intent, and a refund can
--     only settle a refund that an administrator already approved.
--
-- This migration never moves real money and never marks a payment as paid
-- without a provider-signed event.

alter table public.payment_intents
  add column if not exists provider_order_id text;
alter table public.payment_intents
  add column if not exists provider_payment_reference text;

create index if not exists idx_payment_intents_provider_order
  on public.payment_intents (provider_order_id) where provider_order_id is not null;
create index if not exists idx_payment_intents_provider_payment_reference
  on public.payment_intents (provider_payment_reference) where provider_payment_reference is not null;

-- The intent now records the Razorpay order reference explicitly.
create or replace function public.pg_create_payment_intent(
  p_booking_id text,
  p_payment_mode text,
  p_idempotency_key text,
  p_merchant_vpa text,
  p_merchant_name text,
  p_provider_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_booking public.bookings;
  v_existing public.payment_intents;
  v_intent_id text;
  v_key text;
  v_amount bigint;
  v_upi_uri text;
  v_expires timestamptz;
  v_provider text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for share;
  if v_profile.id is null or v_profile.account_status <> 'active' then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if v_profile.role <> 'customer' then
    raise exception 'ACTIVE_CUSTOMER_REQUIRED' using errcode = '42501';
  end if;

  if p_payment_mode is null or p_payment_mode not in ('upi', 'pay_after_service', 'razorpay') then
    raise exception 'INVALID_PAYMENT_MODE' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 128 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if p_payment_mode = 'razorpay' and coalesce(trim(p_provider_reference), '') = '' then
    raise exception 'RAZORPAY_NOT_CONFIGURED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.payload ->> 'source' <> 'pg_booking' then
    raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.user_id <> v_uid then
    raise exception 'PG_BOOKING_NOT_OWNED' using errcode = '42501';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'PG_BOOKING_NOT_PAYABLE' using errcode = '22023';
  end if;
  if v_booking.payment_status in ('verified', 'collected_offline') then
    raise exception 'PG_BOOKING_ALREADY_PAID' using errcode = '22023';
  end if;

  -- Server-side amount. The booking total was computed by the database.
  v_amount := v_booking.total_paise;
  if v_amount is null or v_amount <= 0 then
    raise exception 'PG_AMOUNT_NOT_CONFIGURED' using errcode = '22023';
  end if;

  v_key := 'pg:' || v_uid::text || ':' || trim(p_idempotency_key);
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select * into v_existing
    from public.payment_intents
   where user_id = v_uid and idempotency_key = v_key;
  if v_existing.id is not null then
    if v_existing.booking_id <> p_booking_id
       or v_existing.amount_paise <> v_amount
       or v_existing.payment_mode <> p_payment_mode then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'bookingId', v_existing.booking_id,
      'intentId', v_existing.id,
      'paymentMode', v_existing.payment_mode,
      'status', v_existing.status,
      'amountPaise', v_existing.amount_paise,
      'upiUri', v_existing.upi_uri,
      'expiresAt', v_existing.expires_at,
      'bookingPaymentStatus', v_booking.payment_status
    );
  end if;

  if p_payment_mode = 'pay_after_service' then
    update public.bookings
       set payment_mode = 'pay_after_service', payment_status = 'pay_later', updated_at = now()
     where id = v_booking.id;

    update public.bookings
       set payload = payload || jsonb_build_object(
             'paymentObligation', jsonb_build_object(
               'mode', 'pay_after_service', 'amountPaise', v_amount,
               'recordedAt', now(), 'collectedOnline', false))
     where id = v_booking.id;

    perform public.pg_log_audit('pg_pay_at_property_selected', v_booking.id,
      jsonb_build_object('amountPaise', v_amount, 'actor', v_uid::text));

    return jsonb_build_object(
      'ok', true, 'replayed', false, 'bookingId', v_booking.id, 'intentId', null,
      'paymentMode', 'pay_after_service', 'status', 'pay_later', 'amountPaise', v_amount,
      'upiUri', null, 'bookingPaymentStatus', 'pay_later');
  end if;

  if p_payment_mode = 'upi' and coalesce(trim(p_merchant_vpa), '') = '' then
    raise exception 'MERCHANT_VPA_NOT_CONFIGURED' using errcode = '42501';
  end if;

  v_intent_id := 'pi_pg_' || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + interval '30 minutes';

  if p_payment_mode = 'razorpay' then
    v_provider := 'razorpay';
    v_upi_uri := 'razorpay://order/' || trim(p_provider_reference);
  else
    v_provider := 'upi_sandbox';
    v_upi_uri := format(
      'upi://pay?pa=%s&pn=%s&am=%s&cu=INR&tn=%s&tr=%s',
      p_merchant_vpa,
      replace(coalesce(nullif(trim(p_merchant_name), ''), 'BookOurSpace'), ' ', '%20'),
      to_char(v_amount / 100.0, 'FM999999990.00'),
      replace('BookOurSpace PG ' || left(v_booking.id, 12), ' ', '%20'),
      v_intent_id
    );
  end if;

  insert into public.payment_intents (
    id, user_id, purpose, listing_id, room_type_id, booking_id,
    amount_paise, merchant_vpa, upi_uri, payment_mode, provider, status,
    idempotency_key, expires_at, provider_order_id
  ) values (
    v_intent_id, v_uid, 'stay_booking', v_booking.listing_id, v_booking.room_type_id,
    v_booking.id, v_amount, coalesce(nullif(trim(p_merchant_vpa), ''), ''), v_upi_uri,
    p_payment_mode, v_provider, 'pending', v_key, v_expires,
    case when p_payment_mode = 'razorpay' then trim(p_provider_reference) else null end
  );

  update public.bookings
     set payment_mode = p_payment_mode, payment_status = 'pending_verification', updated_at = now()
   where id = v_booking.id;

  perform public.pg_log_audit('pg_payment_intent_created', v_booking.id,
    jsonb_build_object('intentId', v_intent_id, 'amountPaise', v_amount,
                        'paymentMode', p_payment_mode, 'provider', v_provider,
                        'expiresAt', v_expires));

  return jsonb_build_object(
    'ok', true, 'replayed', false, 'bookingId', v_booking.id, 'intentId', v_intent_id,
    'paymentMode', p_payment_mode, 'provider', v_provider, 'status', 'pending_verification',
    'amountPaise', v_amount, 'upiUri', v_upi_uri, 'expiresAt', v_expires,
    'bookingPaymentStatus', 'pending_verification');
end;
$$;

revoke all on function public.pg_create_payment_intent(text, text, text, text, text, text) from public, anon;
grant execute on function public.pg_create_payment_intent(text, text, text, text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- The Razorpay settlement entry point
-- -----------------------------------------------------------------------------
-- It resolves the intent from the order reference the database stored, refuses
-- a payload that does not match the server-side amount, and records the
-- provider event exactly once.
create or replace function public.pg_razorpay_settle_verified_payment(
  p_event_id text,
  p_order_id text,
  p_event_type text,
  p_provider_reference text,
  p_payload_amount_paise bigint,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_inserted int;
  v_amount bigint;
begin
  if p_event_id is null or p_order_id is null or p_provider_reference is null or p_payload_hash is null then
    raise exception 'INVALID_PROVIDER_EVENT' using errcode = '22023';
  end if;
  if p_event_type not in ('payment.captured', 'payment.failed', 'refund.succeeded') then
    raise exception 'INVALID_PROVIDER_EVENT_TYPE' using errcode = '22023';
  end if;

  insert into public.payment_provider_events
    (event_id, provider, intent_id, event_type, payload_sha256, amount_paise)
  values (p_event_id, 'razorpay', null, p_event_type, p_payload_hash, p_payload_amount_paise)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;

  -- A refund carries the payment reference, a capture carries the order.
  if p_event_type = 'refund.succeeded' then
    select * into v_intent
      from public.payment_intents
     where provider = 'razorpay'
       and provider_payment_reference = p_provider_reference
     order by created_at desc
     limit 1;
  else
    select * into v_intent
      from public.payment_intents
     where provider = 'razorpay'
       and provider_order_id = p_order_id
     order by created_at desc
     limit 1;
  end if;

  if v_intent.id is null then
    raise exception 'RAZORPAY_INTENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_booking from public.bookings where id = v_intent.booking_id for update;
  if v_booking.id is null or v_booking.payload ->> 'source' <> 'pg_booking' then
    raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A replayed event changes nothing.
  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'replayed', true, 'bookingId', v_booking.id,
                              'intentStatus', v_intent.status, 'bookingPaymentStatus', v_booking.payment_status);
  end if;

  if v_intent.provider <> 'razorpay' then
    raise exception 'PAYMENT_PROVIDER_MISMATCH' using errcode = '42501';
  end if;
  if v_booking.payment_mode <> 'razorpay' then
    raise exception 'PAYMENT_PROVIDER_MISMATCH' using errcode = '42501';
  end if;

  -- The authoritative amount is the one PostgreSQL computed for the
  -- reservation. The payload amount only has to agree with it.
  v_amount := v_intent.amount_paise;
  if p_payload_amount_paise is null or p_payload_amount_paise <> v_amount then
    raise exception 'PAYMENT_AMOUNT_MISMATCH' using errcode = '22023';
  end if;

  if p_event_type = 'payment.captured' then
    if v_intent.status not in ('created', 'pending') then
      raise exception 'PAYMENT_INTENT_NOT_SETTLEABLE' using errcode = '42501';
    end if;
    if v_intent.expires_at < now() then
      raise exception 'PAYMENT_INTENT_EXPIRED' using errcode = '22023';
    end if;
    update public.payment_intents
       set status = 'verified', provider_payment_id = p_provider_reference,
           provider_payment_reference = p_provider_reference,
           verified_at = now(), updated_at = now()
     where id = v_intent.id;
    update public.bookings
       set payment_status = 'verified', payment_utr = p_provider_reference, updated_at = now()
     where id = v_booking.id and payment_status <> 'verified';
  elsif p_event_type = 'payment.failed' then
    update public.payment_intents set status = 'failed', updated_at = now()
     where id = v_intent.id and status in ('created', 'pending');
    update public.bookings
       set payment_status = 'failed', updated_at = now()
     where id = v_booking.id and payment_status = 'pending_verification';
  else
    if v_intent.status <> 'verified' then
      raise exception 'PAYMENT_NOT_VERIFIED' using errcode = '42501';
    end if;
    if v_booking.payment_status <> 'refund_pending' then
      raise exception 'REFUND_NOT_EXPECTED' using errcode = '42501';
    end if;
    if coalesce(v_booking.refund_paise, 0) <> v_amount then
      raise exception 'REFUND_AMOUNT_MISMATCH' using errcode = '22023';
    end if;
    update public.payment_intents
       set status = 'refunded', refund_paise = v_amount, refunded_at = now(), updated_at = now()
     where id = v_intent.id;
    update public.bookings
       set payment_status = 'refunded', status = 'cancelled', cancelled_at = now(), updated_at = now()
     where id = v_booking.id;
    update public.stay_allocations
       set status = 'released', updated_at = now()
     where booking_id = v_booking.id and status in ('held', 'confirmed');
  end if;

  insert into public.pg_admin_audit (booking_id, actor, actor_role, action, reason, detail)
  values (v_booking.id, null, 'system', 'razorpay_' || p_event_type, 'razorpay webhook reconciliation',
          jsonb_build_object('intentId', v_intent.id, 'providerReference', p_provider_reference,
                              'amountPaise', v_amount, 'orderId', p_order_id));

  update public.payment_provider_events set processed_at = now() where event_id = p_event_id;

  select * into v_booking from public.bookings where id = v_intent.booking_id;
  return jsonb_build_object('ok', true, 'replayed', false, 'bookingId', v_booking.id,
                            'intentId', v_intent.id, 'intentStatus', v_intent.status,
                            'bookingPaymentStatus', v_booking.payment_status);
end;
$$;

revoke all on function public.pg_razorpay_settle_verified_payment(text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.pg_razorpay_settle_verified_payment(text, text, text, text, bigint, text) to service_role;
