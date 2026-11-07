-- PG/hostel payment lifecycle.
--
-- Additive only. It reuses the existing public.payment_intents and
-- public.payment_provider_events tables and the existing trusted provider
-- settlement/refund RPCs (settle_stay_payment / refund_stay_payment).
--
-- Money rules enforced here:
--   * the payable amount is ALWAYS read from public.bookings.total_paise,
--     which was computed inside the database at booking time. A client can
--     never supply an amount.
--   * a booking becomes `verified` only when the trusted provider settlement
--     path (settle_stay_payment) runs. There is no client-callable "mark paid"
--     function, and no UTR / screenshot / client callback path.
--   * `unpaid`, `pending`, `verified paid` and `pay-at-property` are four
--     distinct, explicitly stored states:
--       payment_mode = 'pay_later'         + payment_status = 'pay_later'
--           -> pay at property obligation, nothing collected online
--       payment_mode = 'pay_after_service' + payment_status = 'pay_later'
--           -> pay at property obligation (explicit choice), nothing collected
--       payment_mode = 'upi'               + payment_status = 'pending_verification'
--           -> money may still arrive; the bed must NOT be released yet
--       payment_mode = 'upi'               + payment_status = 'verified'
--           -> money was reconciled by the provider
--       payment_mode = 'upi'               + payment_status = 'failed'
--           -> provider reported failure / the intent expired
--       payment_status = 'refunded'
--           -> provider confirmed the refund

-- -----------------------------------------------------------------------------
-- 1. Expiring unresolved UPI intents
-- -----------------------------------------------------------------------------
-- Without this a booking whose customer walked away after opening a UPI
-- intent would stay `pending_verification` forever and could never be
-- cancelled, leaking the bed. The sweep only touches intents that are still
-- `created`/`pending` and whose expiry has passed.
create or replace function public.sweep_expired_payment_intents()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    update public.payment_intents
       set status = 'expired', updated_at = now()
     where status in ('created', 'pending')
       and expires_at < now()
     returning 1
  )
  select count(*)::int into v_count from expired;
  return v_count;
end;
$$;

revoke all on function public.sweep_expired_payment_intents() from public, anon, authenticated;
grant execute on function public.sweep_expired_payment_intents() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Keep the booking's payment state in step with the provider intent
-- -----------------------------------------------------------------------------
-- The provider callback path updates public.payment_intents. This trigger is
-- the single place where the booking follows the intent, so a failed or
-- expired intent can never leave a booking stuck as "pending" forever, and a
-- verified intent can never leave the booking unpaid.
create or replace function public.pg_sync_booking_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_id is null then
    return new;
  end if;

  if new.status = 'verified' then
    update public.bookings
       set payment_status = 'verified',
           payment_utr = coalesce(new.provider_payment_id, payment_utr),
           updated_at = now()
     where id = new.booking_id
       and payment_status <> 'verified';
  elsif new.status in ('failed', 'expired') then
    update public.bookings
       set payment_status = 'failed', updated_at = now()
     where id = new.booking_id
       and payment_status = 'pending_verification';
  elsif new.status = 'refunded' then
    update public.bookings
       set payment_status = 'refunded',
           refund_paise = coalesce(new.refund_paise, refund_paise),
           updated_at = now()
     where id = new.booking_id
       and payment_status = 'verified';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pg_sync_booking_payment_status on public.payment_intents;
create trigger trg_pg_sync_booking_payment_status
  after update of status on public.payment_intents
  for each row execute function public.pg_sync_booking_payment_status();

-- -----------------------------------------------------------------------------
-- 3. Audit trail for sensitive PG actions
-- -----------------------------------------------------------------------------
create or replace function public.pg_log_audit(
  p_event text,
  p_booking_id text,
  p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation uuid;
begin
  select a.id into v_allocation
    from public.stay_allocations a
   where a.booking_id = p_booking_id
   order by a.created_at
   limit 1;

  insert into public.stay_audit_events (allocation_id, event, detail, actor)
  values (
    v_allocation,
    p_event,
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('bookingId', p_booking_id),
    auth.uid()
  );
end;
$$;

revoke all on function public.pg_log_audit(text, text, jsonb) from public, anon, authenticated;

drop policy if exists "PG booking parties read stay audit" on public.stay_audit_events;
create policy "PG booking parties read stay audit"
  on public.stay_audit_events for select to authenticated
  using (
    exists (
      select 1
        from public.bookings b
       where b.id::text = (public.stay_audit_events.detail ->> 'bookingId')
         and b.payload ->> 'source' = 'pg_booking'
         and (
           b.user_id = auth.uid()
           or exists (select 1 from public.listings l where l.id = b.listing_id and l.owner_id = auth.uid())
           or public.is_admin()
         )
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Creating the payment obligation / UPI intent for a PG reservation
-- -----------------------------------------------------------------------------
-- The amount is taken from the booking row and never from the request.
create or replace function public.pg_create_payment_intent(
  p_booking_id text,
  p_payment_mode text,
  p_idempotency_key text,
  p_merchant_vpa text,
  p_merchant_name text
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

  if p_payment_mode is null or p_payment_mode not in ('upi', 'pay_after_service') then
    raise exception 'INVALID_PAYMENT_MODE' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 128 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
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
  if v_booking.payment_status = 'verified' then
    raise exception 'PG_BOOKING_ALREADY_PAID' using errcode = '22023';
  end if;

  -- Server-side amount. The booking total was computed by the database.
  v_amount := v_booking.total_paise;
  if v_amount is null or v_amount <= 0 then
    raise exception 'PG_AMOUNT_NOT_CONFIGURED' using errcode = '22023';
  end if;

  v_key := 'pg:' || v_uid::text || ':' || trim(p_idempotency_key);
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  -- Idempotent replay: the same key returns the same intent, a different
  -- payload for the same key is a conflict.
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
    -- Pay at property: an explicit obligation, never an online payment.
    -- No payment_intents row is created, so there is nothing a provider
    -- event could ever settle.
    update public.bookings
       set payment_mode = 'pay_after_service',
           payment_status = 'pay_later',
           updated_at = now()
     where id = v_booking.id;

    update public.bookings
       set payload = payload || jsonb_build_object(
             'paymentObligation', jsonb_build_object(
               'mode', 'pay_after_service',
               'amountPaise', v_amount,
               'recordedAt', now(),
               'collectedOnline', false
             )
           )
     where id = v_booking.id;

    perform public.pg_log_audit('pg_pay_at_property_selected', v_booking.id,
      jsonb_build_object('amountPaise', v_amount, 'actor', v_uid::text));

    return jsonb_build_object(
      'ok', true, 'replayed', false,
      'bookingId', v_booking.id,
      'intentId', null,
      'paymentMode', 'pay_after_service',
      'status', 'pay_later',
      'amountPaise', v_amount,
      'upiUri', null,
      'bookingPaymentStatus', 'pay_later'
    );
  end if;

  if coalesce(trim(p_merchant_vpa), '') = '' then
    raise exception 'MERCHANT_VPA_NOT_CONFIGURED' using errcode = '42501';
  end if;

  v_intent_id := 'pi_pg_' || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + interval '30 minutes';
  v_upi_uri := format(
    'upi://pay?pa=%s&pn=%s&am=%s&cu=INR&tn=%s&tr=%s',
    p_merchant_vpa,
    replace(coalesce(nullif(trim(p_merchant_name), ''), 'BookOurSpace'), ' ', '%20'),
    to_char(v_amount / 100.0, 'FM999999990.00'),
    replace('BookOurSpace PG ' || left(v_booking.id, 12), ' ', '%20'),
    v_intent_id
  );

  insert into public.payment_intents (
    id, user_id, purpose, listing_id, room_type_id, booking_id,
    amount_paise, merchant_vpa, upi_uri, payment_mode, status,
    idempotency_key, expires_at
  ) values (
    v_intent_id, v_uid, 'stay_booking', v_booking.listing_id, v_booking.room_type_id,
    v_booking.id, v_amount, p_merchant_vpa, v_upi_uri, 'upi', 'pending',
    v_key, v_expires
  );

  update public.bookings
     set payment_mode = 'upi',
         payment_status = 'pending_verification',
         updated_at = now()
   where id = v_booking.id;

  perform public.pg_log_audit('pg_payment_intent_created', v_booking.id,
    jsonb_build_object('intentId', v_intent_id, 'amountPaise', v_amount,
                        'paymentMode', 'upi', 'expiresAt', v_expires));

  return jsonb_build_object(
    'ok', true, 'replayed', false,
    'bookingId', v_booking.id,
    'intentId', v_intent_id,
    'paymentMode', 'upi',
    'status', 'pending_verification',
    'amountPaise', v_amount,
    'upiUri', v_upi_uri,
    'expiresAt', v_expires,
    'bookingPaymentStatus', 'pending_verification'
  );
end;
$$;

revoke all on function public.pg_create_payment_intent(text, text, text, text, text) from public, anon;
grant execute on function public.pg_create_payment_intent(text, text, text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Cancellation with an explicit money state machine
-- -----------------------------------------------------------------------------
-- Rewritten from the original customer-only version. The guest, the listing
-- owner and an active admin may cancel. What happens to the inventory and to
-- the money depends on the stored payment state:
--   * pay_later / pay_after_service / failed  -> bed released, nothing to refund
--   * pending_verification                    -> refused; the provider may still
--                                                 confirm, so the bed is held
--   * verified                                -> refused; the refund has to be
--                                                 reconciled by the provider first
create or replace function public.pg_cancel_booking(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_booking public.bookings;
  v_owner uuid;
  v_total bigint;
  v_hours numeric;
  v_refund bigint;
  v_policy text;
  v_pending_intent boolean;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for share;
  if v_profile.id is null or v_profile.account_status <> 'active' then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.payload ->> 'source' <> 'pg_booking' then
    raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  select l.owner_id into v_owner
    from public.listings l
   where l.id = v_booking.listing_id;

  if v_booking.user_id <> v_uid
     and v_owner is distinct from v_uid
     and v_profile.role <> 'admin' then
    raise exception 'PG_BOOKING_NOT_OWNED' using errcode = '42501';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'PG_BOOKING_NOT_CANCELLABLE' using errcode = '22023';
  end if;
  if v_booking.check_in <= current_date then
    raise exception 'PG_CANCELLATION_CLOSED' using errcode = '22023';
  end if;

  -- An unresolved UPI intent may still turn into money. Do not hand the bed
  -- back while that is possible.
  select exists (
    select 1 from public.payment_intents i
     where i.booking_id = v_booking.id
       and i.status in ('created', 'pending')
       and i.expires_at >= now()
  ) into v_pending_intent;

  if v_pending_intent and v_booking.payment_status = 'pending_verification' then
    raise exception 'PG_PAYMENT_PENDING' using errcode = '22023';
  end if;

  v_total := coalesce(v_booking.total_paise, 0)::bigint;
  -- Refund policy is measured at 12:00 Asia/Kolkata on the move-in day.
  v_hours := greatest(0, extract(epoch from (
      ((v_booking.check_in::date + time '12:00') at time zone 'Asia/Kolkata') - now()
  )) / 3600.0);

  if v_booking.payment_status is distinct from 'verified' then
    v_refund := 0;
    v_policy := 'NO_ONLINE_PAYMENT_TO_REFUND';
  elsif v_hours >= 48 then
    v_refund := v_total; v_policy := 'FULL_REFUND_48H';
  elsif v_hours >= 24 then
    v_refund := round(v_total / 2.0)::bigint; v_policy := 'HALF_REFUND_24H';
  else
    v_refund := 0; v_policy := 'NO_REFUND_UNDER_24H';
  end if;

  if v_booking.payment_status = 'verified' then
    -- The money was collected. The bed stays reserved until the provider
    -- confirms the refund, otherwise the customer could take the bed back
    -- and keep the money.
    update public.bookings
       set status = 'cancellation_pending', updated_at = now()
     where id = v_booking.id;

    perform public.pg_log_audit('pg_cancellation_pending_refund', v_booking.id,
      jsonb_build_object('refundPaise', v_refund, 'refundPolicy', v_policy,
                          'totalPaise', v_total));

    return jsonb_build_object(
      'ok', false,
      'bookingId', v_booking.id,
      'status', 'cancellation_pending',
      'error', 'PG_REFUND_REQUIRED',
      'refundPaise', v_refund,
      'refundPolicy', v_policy,
      'paymentStatus', v_booking.payment_status,
      'inventoryReleased', false
    );
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where id = v_booking.id;

  update public.stay_allocations
     set status = 'released', updated_at = now()
   where booking_id = v_booking.id and status in ('held', 'confirmed');

  -- An abandoned UPI attempt can no longer settle against a dead booking.
  update public.payment_intents
     set status = 'failed', updated_at = now()
   where booking_id = v_booking.id and status in ('created', 'pending');

  perform public.pg_log_audit('pg_booking_cancelled', v_booking.id,
    jsonb_build_object('refundPaise', v_refund, 'refundPolicy', v_policy,
                        'totalPaise', v_total, 'actor', v_uid::text));

  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking.id,
    'status', 'cancelled',
    'refundPaise', v_refund,
    'refundPolicy', v_policy,
    'paymentStatus', v_booking.payment_status,
    'inventoryReleased', true
  );
end;
$$;

revoke all on function public.pg_cancel_booking(text) from public, anon;
grant execute on function public.pg_cancel_booking(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Owner / admin booking management
-- -----------------------------------------------------------------------------
-- check_in and check_out are operational state changes on a real reservation.
-- Only the listing owner (or an active admin) may perform them, and every
-- change is written to the audit trail.
create or replace function public.pg_owner_update_booking(
  p_booking_id text,
  p_action text
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
  v_owner uuid;
  v_action text := lower(coalesce(trim(p_action), ''));
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for share;
  if v_profile.id is null or v_profile.account_status <> 'active' then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  if v_action not in ('check_in', 'check_out') then
    raise exception 'INVALID_BOOKING_ACTION' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.payload ->> 'source' <> 'pg_booking' then
    raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  select l.owner_id into v_owner from public.listings l where l.id = v_booking.listing_id;
  if v_owner is distinct from v_uid and v_profile.role <> 'admin' then
    raise exception 'PG_BOOKING_NOT_OWNED' using errcode = '42501';
  end if;

  if v_action = 'check_in' then
    if v_booking.status <> 'confirmed' then
      raise exception 'PG_BOOKING_NOT_CHECKABLE_IN' using errcode = '22023';
    end if;
    if v_booking.check_in > current_date then
      raise exception 'PG_CHECK_IN_NOT_OPEN' using errcode = '22023';
    end if;
    update public.bookings
       set status = 'checked_in', updated_at = now()
     where id = v_booking.id;
  else
    if v_booking.status <> 'checked_in' then
      raise exception 'PG_BOOKING_NOT_CHECKED_IN' using errcode = '22023';
    end if;
    if v_booking.check_out > current_date then
      raise exception 'PG_CHECK_OUT_NOT_OPEN' using errcode = '22023';
    end if;
    update public.bookings
       set status = 'checked_out', updated_at = now()
     where id = v_booking.id;
  end if;

  perform public.pg_log_audit('pg_booking_' || v_action, v_booking.id,
    jsonb_build_object('actor', v_uid::text, 'status', v_action));

  select * into v_booking from public.bookings where id = p_booking_id;
  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking.id,
    'status', v_booking.status,
    'moveIn', v_booking.check_in,
    'moveOut', v_booking.check_out
  );
end;
$$;

revoke all on function public.pg_owner_update_booking(text, text) from public, anon;
grant execute on function public.pg_owner_update_booking(text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Admin adjustments (authorized, logged, inventory-safe)
-- -----------------------------------------------------------------------------
-- An admin may force-cancel a PG reservation. The money is never invented:
-- the refund still has to be reconciled by the provider, so the bed stays
-- reserved until that happens.
create or replace function public.pg_admin_adjust_booking(
  p_booking_id text,
  p_action text,
  p_reason text
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
  v_action text := lower(coalesce(trim(p_action), ''));
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for share;
  if v_profile.id is null or v_profile.account_status <> 'active' then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if v_profile.role <> 'admin' then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if v_action not in ('cancel', 'check_in', 'check_out') then
    raise exception 'INVALID_BOOKING_ACTION' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null or v_booking.payload ->> 'source' <> 'pg_booking' then
    raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_action = 'cancel' then
    if v_booking.payment_status = 'verified' then
      update public.bookings
         set status = 'cancellation_pending', updated_at = now()
       where id = v_booking.id;
      perform public.pg_log_audit('pg_admin_cancellation_pending_refund', v_booking.id,
        jsonb_build_object('reason', trim(p_reason), 'actor', v_uid::text));
      return jsonb_build_object(
        'ok', false, 'bookingId', v_booking.id, 'status', 'cancellation_pending',
        'error', 'PG_REFUND_REQUIRED', 'inventoryReleased', false
      );
    end if;

    update public.bookings
       set status = 'cancelled', cancelled_at = now(), updated_at = now()
     where id = v_booking.id;
    update public.stay_allocations
       set status = 'released', updated_at = now()
     where booking_id = v_booking.id and status in ('held', 'confirmed');
    update public.payment_intents
       set status = 'failed', updated_at = now()
     where booking_id = v_booking.id and status in ('created', 'pending');
  else
    v_action := 'check_in';
    if v_booking.status <> 'confirmed' then
      raise exception 'PG_BOOKING_NOT_CHECKABLE_IN' using errcode = '22023';
    end if;
    update public.bookings
       set status = 'checked_in', updated_at = now()
     where id = v_booking.id;
  end if;

  perform public.pg_log_audit('pg_admin_adjustment_' || v_action, v_booking.id,
    jsonb_build_object('reason', trim(p_reason), 'actor', v_uid::text));

  select * into v_booking from public.bookings where id = p_booking_id;
  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking.id,
    'status', v_booking.status,
    'paymentStatus', v_booking.payment_status,
    'inventoryReleased', v_action = 'cancel'
  );
end;
$$;

revoke all on function public.pg_admin_adjust_booking(text, text, text) from public, anon;
grant execute on function public.pg_admin_adjust_booking(text, text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. Reading the money state of a PG reservation
-- -----------------------------------------------------------------------------
-- One call that states exactly where the money stands. The booking party, the
-- listing owner and an active admin may read it; nobody else can.
create or replace function public.pg_booking_payment_state(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_booking public.bookings;
  v_owner uuid;
  v_intent public.payment_intents;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid for share;
  if v_profile.id is null or v_profile.account_status <> 'active' then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null or v_booking.payload ->> 'source' <> 'pg_booking' then
    raise exception 'PG_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  select l.owner_id into v_owner from public.listings l where l.id = v_booking.listing_id;
  if v_booking.user_id <> v_uid
     and v_owner is distinct from v_uid
     and v_profile.role <> 'admin' then
    raise exception 'PG_BOOKING_NOT_OWNED' using errcode = '42501';
  end if;

  select * into v_intent
    from public.payment_intents
   where booking_id = v_booking.id
   order by created_at desc
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'bookingId', v_booking.id,
    'bookingStatus', v_booking.status,
    'paymentMode', v_booking.payment_mode,
    'paymentStatus', v_booking.payment_status,
    'totalPaise', v_booking.total_paise,
    'rentPaise', coalesce((v_booking.payload ->> 'rentPaise')::bigint, 0),
    'depositPaise', coalesce((v_booking.payload ->> 'depositPaise')::bigint, 0),
    'paymentUtR', v_booking.payment_utr,
    'refundPaise', v_booking.refund_paise,
    'intentId', v_intent.id,
    'intentStatus', v_intent.status,
    'upiUri', v_intent.upi_uri,
    'expiresAt', v_intent.expires_at,
    'verifiedAt', v_intent.verified_at,
    'providerPaymentId', v_intent.provider_payment_id,
    'obligation', v_booking.payload -> 'paymentObligation'
  );
end;
$$;

revoke all on function public.pg_booking_payment_state(text) from public, anon;
grant execute on function public.pg_booking_payment_state(text) to authenticated, service_role;
