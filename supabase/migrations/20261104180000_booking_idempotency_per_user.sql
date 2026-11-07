-- Per-user idempotency for public.bookings.
--
-- The baseline declares `idempotency_key TEXT UNIQUE`, i.e. one key for the
-- whole table. Combined with create_booking_atomic(), which looks up the key
-- without filtering by user_id, this leaked data across tenants: if user B
-- submitted an idempotency key that user A had already used, B's call returned
-- A's bookingId, status, paymentStatus and qrPassToken with
-- 'idempotentReplay': true. B also could not create its own booking, because the
-- global unique constraint rejected the insert.
--
-- Fix: scope uniqueness to the owning user and scope the replay lookup to
-- auth.uid(). The new index is strictly weaker than the old constraint, so it
-- can always be created; dropping the old constraint cannot fail.
--
-- The body also had a latent runtime defect that made the replay path
-- unreachable in practice: it inserted into public.bookings columns that do not
-- exist (customer_address, time_slot, total_amount, notes) and omitted the
-- NOT NULL scheduled_time column, so every call raised instead of booking. The
-- rewritten body keeps the exact same signature and JSON contract but writes
-- only real columns: scheduled_time receives p_time_slot, amount receives
-- p_total_amount, and the free-form fields land in the existing payload JSONB.
--
-- Idempotent: the constraint is dropped by discovery, the index uses
-- if not exists, and the function is replaced on the same signature.

begin;

-- Drop whichever single-column unique constraint exists on idempotency_key.
do $$
declare
  existing_constraint text;
begin
  for existing_constraint in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'bookings'
       and con.contype = 'u'
       and con.conkey = array[
         (select att.attnum
            from pg_attribute att
           where att.attrelid = rel.oid and att.attname = 'idempotency_key')
       ]::int2[]
  loop
    execute format('alter table public.bookings drop constraint %I', existing_constraint);
  end loop;
end $$;

create unique index if not exists uniq_bookings_user_idempotency_key
  on public.bookings (user_id, idempotency_key)
  where idempotency_key is not null;

comment on index public.uniq_bookings_user_idempotency_key is
  'One booking per user per idempotency key. Replaces the cross-tenant global unique constraint.';

create or replace function public.create_booking_atomic(
  p_booking_id TEXT,
  p_idempotency_key TEXT,
  p_listing_id TEXT,
  p_listing_title TEXT,
  p_provider_id TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_address TEXT,
  p_scheduled_date TEXT,
  p_time_slot TEXT,
  p_total_amount NUMERIC,
  p_payment_status TEXT DEFAULT 'pay_later',
  p_payment_utr TEXT DEFAULT NULL,
  p_qr_signature TEXT DEFAULT NULL,
  p_qr_pass_token TEXT DEFAULT NULL,
  p_seats TEXT[] DEFAULT NULL,
  p_show_time TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing RECORD;
  v_seat TEXT;
  v_conflict_seats TEXT[] := '{}';
BEGIN
  -- 1. Idempotency replay, scoped to the caller. A key reused by a different
  -- user must never return another user's booking.
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing
    FROM public.bookings
    WHERE idempotency_key = p_idempotency_key
      AND user_id = auth.uid()
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotentReplay', true,
        'bookingId', v_existing.id,
        'status', v_existing.status,
        'paymentStatus', v_existing.payment_status,
        'qrPassToken', v_existing.qr_pass_token
      );
    END IF;
  END IF;

  -- 2. If movie seats are provided, atomically lock & transition them to 'booked'
  IF p_seats IS NOT NULL AND array_length(p_seats, 1) > 0 THEN
    DELETE FROM public.seat_locks
    WHERE listing_id = p_listing_id
      AND show_date = p_scheduled_date
      AND show_time = COALESCE(p_show_time, p_time_slot)
      AND status = 'held'
      AND expires_at <= NOW();

    SELECT array_agg(seat_id)
    INTO v_conflict_seats
    FROM public.seat_locks
    WHERE listing_id = p_listing_id
      AND show_date = p_scheduled_date
      AND show_time = COALESCE(p_show_time, p_time_slot)
      AND seat_id = ANY(p_seats)
      AND (
        status = 'booked'
        OR (status = 'held' AND session_id <> COALESCE(p_session_id, '') AND expires_at > NOW())
      );

    IF v_conflict_seats IS NOT NULL AND array_length(v_conflict_seats, 1) > 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'SEAT_ALREADY_BOOKED',
        'conflictingSeats', v_conflict_seats
      );
    END IF;

    FOREACH v_seat IN ARRAY p_seats LOOP
      INSERT INTO public.seat_locks (
        listing_id, show_date, show_time, seat_id, user_id, session_id, status, booking_id, expires_at
      )
      VALUES (
        p_listing_id,
        p_scheduled_date,
        COALESCE(p_show_time, p_time_slot),
        v_seat,
        auth.uid(),
        COALESCE(p_session_id, 'direct'),
        'booked',
        p_booking_id,
        NOW() + INTERVAL '365 days'
      )
      ON CONFLICT (listing_id, show_date, show_time, seat_id)
      DO UPDATE SET
        status = 'booked',
        booking_id = EXCLUDED.booking_id,
        expires_at = EXCLUDED.expires_at
      WHERE public.seat_locks.status = 'held'
        AND public.seat_locks.session_id = COALESCE(p_session_id, '');

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SEAT_ALREADY_BOOKED:%', v_seat;
      END IF;
    END LOOP;
  END IF;

  -- 3. Insert authoritative booking row. Only columns that exist on
  -- public.bookings are referenced; scheduled_time is NOT NULL, so the caller's
  -- p_time_slot is authoritative there and amount takes p_total_amount.
  INSERT INTO public.bookings (
    id,
    user_id,
    idempotency_key,
    listing_id,
    listing_title,
    provider_id,
    customer_name,
    customer_phone,
    scheduled_date,
    scheduled_time,
    amount,
    status,
    payment_status,
    payment_utr,
    qr_signature,
    qr_pass_token,
    payload
  )
  VALUES (
    p_booking_id,
    auth.uid(),
    NULLIF(trim(COALESCE(p_idempotency_key, '')), ''),
    p_listing_id,
    p_listing_title,
    p_provider_id,
    p_customer_name,
    p_customer_phone,
    p_scheduled_date,
    p_time_slot,
    p_total_amount,
    'confirmed',
    COALESCE(p_payment_status, 'pay_later'),
    p_payment_utr,
    p_qr_signature,
    p_qr_pass_token,
    jsonb_build_object(
      'source', 'booking_atomic',
      'customerAddress', COALESCE(p_customer_address, ''),
      'notes', COALESCE(p_notes, ''),
      'showTime', p_show_time,
      'sessionId', p_session_id,
      'seats', COALESCE(to_jsonb(p_seats), '[]'::jsonb)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotentReplay', false,
    'bookingId', p_booking_id,
    'status', 'confirmed',
    'paymentStatus', COALESCE(p_payment_status, 'pay_later'),
    'qrPassToken', p_qr_pass_token
  );
END;
$$;

revoke all on function public.create_booking_atomic(
  text, text, text, text, text, text, text, text, text, text, numeric,
  text, text, text, text, text[], text, text, text
) from public, anon;
grant execute on function public.create_booking_atomic(
  text, text, text, text, text, text, text, text, text, text, numeric,
  text, text, text, text, text[], text, text, text
) to authenticated, service_role;

commit;
