-- Bind a verified payment event to the channel the customer actually selected.
--
-- Razorpay bookings can only settle through a razorpay intent, UPI bookings
-- through an upi_webhook intent, and the explicitly enabled local sandbox may
-- settle either channel. This closes a mismatch where an intent created for
-- one provider could settle a booking created for another.
--
-- The function body is otherwise identical to 20261103173631 and remains
-- service_role-only, called after HMAC verification of the raw webhook body.

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
  if v_intent.provider<>'sandbox' and v_intent.provider<>(case v_booking.payment_mode
      when 'razorpay' then 'razorpay'
      when 'upi' then 'upi_webhook'
      else '__unsupported__' end) then
    raise exception 'PAYMENT_PROVIDER_MISMATCH' using errcode='42501';
  end if;
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

revoke all on function public.venue_settle_verified_payment(text,uuid,uuid,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.venue_settle_verified_payment(text,uuid,uuid,text,text,bigint,text) to service_role;
