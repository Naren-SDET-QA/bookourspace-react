-- =============================================================================
-- Rollback for the 2026-11-04 database hardening set.
--
-- Reverses, in reverse order:
--   20261104170000_provider_listing_ownership_guards.sql
--   20261104180000_booking_idempotency_per_user.sql
--   20261104190000_active_admin_authorization.sql
--   20261104200000_complete_foreign_key_indexes.sql
--   20261104210000_restrict_definer_execution.sql
--
-- This is a forward-compatible *compensating* script, not a snapshot restore.
-- It restores the prior catalog shape, policies, grants and function bodies.
--
-- CONDITIONAL STEP — read before running in a live database:
--   Restoring `idempotency_key TEXT UNIQUE` fails if, after the migration, two
--   different users stored the same key. Check first:
--
--     select idempotency_key, count(distinct user_id)
--       from public.bookings
--      where idempotency_key is not null
--      group by idempotency_key having count(distinct user_id) > 1;
--
--   If that returns rows, decide whether to keep per-user idempotency (roll
--   forward) instead of rolling back.
--
-- Restoring function grants to PUBLIC/anon re-opens the anon-executable
-- SECURITY DEFINER surface this set closed. Roll back only with that understood.
--
-- create_booking_atomic is restored byte-for-byte to its pre-migration body,
-- including the four nonexistent column references (customer_address,
-- time_slot, total_amount, notes) that made the RPC raise at runtime. That is
-- the previous state; rolling back reintroduces the defect deliberately.
--
-- Run inside a single transaction; requires the migration set to be applied.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 20261104210000 — payment verification FK + restricted execution permissions
-- ---------------------------------------------------------------------------
alter table public.payment_verifications
  drop constraint if exists payment_verifications_intent_id_fkey;

do $$
declare
  restored_function text;
begin
  foreach restored_function in array array[
    'create_booking_atomic',
    'hold_movie_seats_atomic',
    'handle_new_user',
    'log_stay_allocation_change',
    'enforce_movie_booking_approval',
    'pg_sync_booking_payment_status',
    'pg_admin_audit_immutable',
    'venue_is_active_admin',
    'is_admin',
    'is_active_user'
  ]
  loop
    execute format(
      'grant execute on function %s to public',
      (select p.oid::regprocedure
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = restored_function
        order by p.oid
        limit 1)
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 20261104200000 — foreign-key indexes
-- ---------------------------------------------------------------------------
drop index if exists public.idx_provider_registration_reviewed_by;
drop index if exists public.idx_venue_seasonal_rates_owner;
drop index if exists public.idx_venue_blocks_owner;
drop index if exists public.idx_venue_booking_events_actor;
drop index if exists public.idx_venue_payment_intents_customer;
drop index if exists public.idx_venue_payment_events_booking;
drop index if exists public.idx_venue_payment_events_intent;
drop index if exists public.idx_venue_categories_updated_by;
drop index if exists public.idx_venue_category_events_actor;
drop index if exists public.idx_service_booking_events_actor;
drop index if exists public.idx_service_payment_claims_claimed_by;
drop index if exists public.idx_service_payment_claims_reviewed_by;
drop index if exists public.idx_service_reviews_customer;
drop index if exists public.idx_payment_intents_room_type;
drop index if exists public.idx_payment_provider_events_intent;
drop index if exists public.idx_class_batches_reviewed_by;
drop index if exists public.idx_service_payment_intents_customer;
drop index if exists public.idx_service_payment_events_intent;
drop index if exists public.idx_venue_booking_disputes_opened_by;
drop index if exists public.idx_venue_booking_disputes_resolved_by;
drop index if exists public.idx_pg_admin_audit_actor;
drop index if exists public.idx_pg_booking_disputes_opened_by;
drop index if exists public.idx_pg_booking_disputes_resolved_by;
drop index if exists public.idx_pg_payment_claims_claimed_by;
drop index if exists public.idx_pg_payment_claims_decided_by;
drop index if exists public.idx_pg_invoices_user_id;
drop index if exists public.idx_app_builder_audit_events_actor;
drop index if exists public.idx_app_builder_audit_events_source_version;
drop index if exists public.idx_user_access_audit_events_actor;
drop index if exists public.idx_user_access_audit_events_target;

-- ---------------------------------------------------------------------------
-- 20261104190000 — active-admin authorization
-- Restores the original role-only predicate and its PUBLIC grant.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

grant execute on function public.is_admin() to public;
grant execute on function public.is_active_user() to public;

-- ---------------------------------------------------------------------------
-- 20261104180000 — per-user booking idempotency
-- Restores the global unique constraint and the original replay semantics.
-- ---------------------------------------------------------------------------
drop index if exists public.uniq_bookings_user_idempotency_key;

alter table public.bookings
  drop constraint if exists bookings_idempotency_key_key;
alter table public.bookings
  add constraint bookings_idempotency_key_key unique (idempotency_key);

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
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_seat TEXT;
  v_conflict_seats TEXT[] := '{}';
BEGIN
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing
    FROM public.bookings
    WHERE idempotency_key = p_idempotency_key
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

  INSERT INTO public.bookings (
    id,
    user_id,
    idempotency_key,
    listing_id,
    listing_title,
    provider_id,
    customer_name,
    customer_phone,
    customer_address,
    scheduled_date,
    time_slot,
    total_amount,
    status,
    payment_status,
    payment_utr,
    qr_signature,
    qr_pass_token,
    notes
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
    p_customer_address,
    p_scheduled_date,
    p_time_slot,
    p_total_amount,
    'confirmed',
    COALESCE(p_payment_status, 'pay_later'),
    p_payment_utr,
    p_qr_signature,
    p_qr_pass_token,
    p_notes
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

-- ---------------------------------------------------------------------------
-- 20261104170000 — provider ownership guards
-- ---------------------------------------------------------------------------
drop trigger if exists trg_enforce_booking_provider_ownership on public.bookings;
drop trigger if exists trg_enforce_enquiry_provider_ownership on public.enquiries;
drop function if exists public.enforce_booking_provider_ownership();
drop function if exists public.enforce_enquiry_provider_ownership();
drop index if exists public.idx_bookings_listing_id;
drop index if exists public.idx_bookings_provider_id;
drop index if exists public.idx_enquiries_listing_id;
drop index if exists public.idx_enquiries_provider_id;

commit;
