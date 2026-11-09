\set ON_ERROR_STOP on
-- Classes & Training SQL suite: batches, transactional seat inventory,
-- duplicate/waitlist rules, server-derived fees, cancellation policy and RLS.
--
-- Run by supabase/tests/run_local_validation.sh against a disposable local
-- PostgreSQL cluster. Nothing here contacts Supabase.

BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c1a1c1a1-1111-4111-8111-aaaaaaaaaaa1', 'class-provider@example.test', '{}'::jsonb),
  ('c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2', 'class-student-a@example.test', '{}'::jsonb),
  ('c1a1c1a1-1111-4111-8111-aaaaaaaaaaa3', 'class-student-b@example.test', '{}'::jsonb),
  ('c1a1c1a1-1111-4111-8111-aaaaaaaaaaa4', 'class-admin@example.test', '{}'::jsonb),
  ('c1a1c1a1-1111-4111-8111-aaaaaaaaaaa5', 'class-student-c@example.test', '{}'::jsonb),
  ('c1a1c1a1-1111-4111-8111-aaaaaaaaaaa6', 'class-closed-student@example.test', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

RESET ROLE;
UPDATE public.profiles SET role = 'provider', account_status = 'active'
 WHERE id = 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa1';
UPDATE public.profiles SET role = 'admin', account_status = 'active'
 WHERE id = 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa4';
UPDATE public.profiles SET role = 'customer', account_status = 'active'
 WHERE id IN (
   'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2',
   'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa3',
   'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa5',
   'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa6'
 );

DELETE FROM public.class_enrollments;
DELETE FROM public.class_batches;
DELETE FROM public.listings WHERE id IN ('class-sql-course', 'class-sql-other');

INSERT INTO public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
VALUES
  ('class-sql-course', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa1', 'SQL Test Algebra Course',
   'class-academic', 'Academic', 'course', 5000, 'per course', 'active', '{}'::jsonb),
  ('class-sql-other', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa1', 'SQL Test Other Course',
   'class-software', 'Software & IT', 'course', 3000, 'per course', 'active', '{}'::jsonb);

INSERT INTO public.class_batches
  (id, listing_id, title, delivery_mode, fee_unit, online_fee, offline_fee, capacity,
   waitlist_capacity, start_date, days_of_week, start_time, end_time, area, faculty_name, status)
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'class-sql-course', 'Evening Batch',
   'hybrid', 'month', 4000, 5000, 2, 0, current_date + 30, 'Mon-Fri', '18:00', '20:00',
   'Test Area', 'Test Faculty', 'active'),
  ('b1000000-0000-4000-8000-000000000002', 'class-sql-other', 'Waitlist Batch',
   'offline', 'month', 0, 2500, 1, 1, current_date + 30, 'Sat-Sun', '10:00', '12:00',
   'Test Area', 'Second Faculty', 'active'),
  ('b1000000-0000-4000-8000-000000000003', 'class-sql-course', 'Pending Batch',
   'offline', 'month', 0, 1500, 10, 0, current_date + 45, 'Mon', '07:00', '08:00',
   'Test Area', 'Third Faculty', 'pending_approval'),
  ('b1000000-0000-4000-8000-000000000004', 'class-sql-other', 'Free Batch',
   'offline', 'course', 0, 0, 5, 0, current_date + 20, 'Sun', '09:00', '11:00',
   'Test Area', 'Free Faculty', 'active');

-- Anonymous discovery must hide the pending batch without calling is_admin().
-- 20261104190000 revokes EXECUTE on that function from anon. A policy that ORs
-- is_admin() for every role fails this query with
-- "permission denied for function is_admin".
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute is_admin';
  END IF;
  RAISE NOTICE 'PASS anon cannot execute is_admin';
END;
$$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
DECLARE
  v_active integer;
  v_pending integer;
BEGIN
  SELECT count(*) FILTER (WHERE b.id = 'b1000000-0000-4000-8000-000000000001'),
         count(*) FILTER (WHERE b.id = 'b1000000-0000-4000-8000-000000000003')
    INTO v_active, v_pending
    FROM public.class_batches b
    CROSS JOIN LATERAL public.class_batch_availability(b.id) a
   WHERE b.listing_id = 'class-sql-course';

  IF v_active = 1 AND v_pending = 0 THEN
    RAISE NOTICE 'PASS anonymous discovery returns only the approved batch';
  ELSE
    RAISE NOTICE 'FAIL anonymous discovery active=% pending=%', v_active, v_pending;
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa1","role":"authenticated"}', true);

DO $$
DECLARE v_pending integer;
BEGIN
  SELECT count(*) INTO v_pending
    FROM public.class_batches
   WHERE id = 'b1000000-0000-4000-8000-000000000003';
  IF v_pending = 1 THEN
    RAISE NOTICE 'PASS the course owner can still read their pending batch';
  ELSE
    RAISE NOTICE 'FAIL the course owner could not read their pending batch';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa4', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa4","role":"authenticated"}', true);

DO $$
DECLARE v_pending integer;
BEGIN
  SELECT count(*) INTO v_pending
    FROM public.class_batches
   WHERE id = 'b1000000-0000-4000-8000-000000000003';
  IF v_pending = 1 THEN
    RAISE NOTICE 'PASS an active admin can still read a pending batch';
  ELSE
    RAISE NOTICE 'FAIL an active admin could not read the pending batch';
  END IF;
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Student A: enrollment, idempotency, duplicate rejection, fee authority
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2","role":"authenticated"}', true);

DO $$
DECLARE
  v_left integer;
  v_result jsonb;
BEGIN
  SELECT seats_left INTO v_left
    FROM public.class_batch_availability('b1000000-0000-4000-8000-000000000001');
  IF v_left = 2 THEN
    RAISE NOTICE 'PASS availability reports the configured capacity';
  ELSE
    RAISE NOTICE 'FAIL availability was %, expected 2', v_left;
  END IF;

  v_result := public.class_enroll(
    'b1000000-0000-4000-8000-000000000001', 'offline', 'pay_at_institute',
    'a1000000-0000-4000-8000-000000000001');

  IF (v_result->'enrollment'->>'status') = 'confirmed'
     AND (v_result->'enrollment'->>'seat_sequence')::int = 1
     AND (v_result->'enrollment'->>'fee_amount')::numeric = 5000
     AND (v_result->'enrollment'->>'payment_status') = 'obligation_recorded'
     AND (v_result->'enrollment'->>'payment_mode') = 'pay_at_institute' THEN
    RAISE NOTICE 'PASS enrollment confirms a seat with the batch offline fee and a recorded obligation';
  ELSE
    RAISE NOTICE 'FAIL unexpected enrollment payload: %', v_result;
  END IF;

  v_result := public.class_enroll(
    'b1000000-0000-4000-8000-000000000001', 'offline', 'pay_at_institute',
    'a1000000-0000-4000-8000-000000000001');
  IF (v_result->>'idempotent')::boolean THEN
    RAISE NOTICE 'PASS replayed request returns the original enrollment';
  ELSE
    RAISE NOTICE 'FAIL replay was not idempotent: %', v_result;
  END IF;

  BEGIN
    PERFORM public.class_enroll(
      'b1000000-0000-4000-8000-000000000001', 'offline', 'pay_at_institute',
      'a1000000-0000-4000-8000-000000000002');
    RAISE NOTICE 'FAIL a duplicate enrollment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DUPLICATE_ENROLLMENT%' THEN
      RAISE NOTICE 'PASS duplicate enrollment is rejected';
    ELSE
      RAISE NOTICE 'FAIL unexpected duplicate error: %', SQLERRM;
    END IF;
  END;
END;
$$;

-- A client cannot write enrollment rows directly (no grant/policy), so a
-- forged amount or a self-declared paid status is impossible.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.class_enrollments
      (request_id, batch_id, listing_id, student_id, delivery_mode, fee_unit,
       fee_amount, payment_mode, payment_status, status, seat_sequence)
    VALUES ('a1000000-0000-4000-8000-0000000000ff', 'b1000000-0000-4000-8000-000000000004',
            'class-sql-other', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2', 'offline', 'course',
            1, 'pay_at_institute', 'verified', 'confirmed', 99);
    RAISE NOTICE 'FAIL a client wrote a forged enrollment row directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS clients cannot insert enrollment rows or forge amounts/paid status';
  END;
END;
$$;

-- Free batch: payment mode must match the derived fee.
DO $$
BEGIN
  BEGIN
    PERFORM public.class_enroll(
      'b1000000-0000-4000-8000-000000000004', 'offline', 'pay_at_institute',
      'a1000000-0000-4000-8000-000000000004');
    RAISE NOTICE 'FAIL a zero-price batch accepted a pay-at-institute mode';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FREE_BATCH_REQUIRES_FREE_PAYMENT_MODE%' THEN
      RAISE NOTICE 'PASS a free batch requires the free payment mode';
    ELSE
      RAISE NOTICE 'FAIL unexpected free batch error: %', SQLERRM;
    END IF;
  END;
END;
$$;

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.class_enroll(
    'b1000000-0000-4000-8000-000000000004', 'offline', 'free',
    'a1000000-0000-4000-8000-000000000005');
  IF (v_result->'enrollment'->>'status') = 'confirmed'
     AND (v_result->'enrollment'->>'payment_status') = 'not_required' THEN
    RAISE NOTICE 'PASS free enrollment needs no payment';
  ELSE
    RAISE NOTICE 'FAIL unexpected free enrollment: %', v_result;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Student B: capacity, waitlist and RLS isolation
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa3', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa3","role":"authenticated"}', true);

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.class_enroll(
    'b1000000-0000-4000-8000-000000000001', 'online', 'pay_at_institute',
    'b1000000-0000-4000-8000-000000000011');
  IF (v_result->'enrollment'->>'seat_sequence')::int = 2
     AND (v_result->'enrollment'->>'fee_amount')::numeric = 4000 THEN
    RAISE NOTICE 'PASS second student takes seat 2 and the online fee is derived separately';
  ELSE
    RAISE NOTICE 'FAIL unexpected second enrollment: %', v_result;
  END IF;

  v_result := public.class_enroll(
    'b1000000-0000-4000-8000-000000000002', 'offline', 'pay_at_institute',
    'b1000000-0000-4000-8000-000000000012');
  IF (v_result->'enrollment'->>'status') = 'confirmed' THEN
    RAISE NOTICE 'PASS waitlist batch confirms while a seat remains';
  ELSE
    RAISE NOTICE 'FAIL waitlist batch did not confirm: %', v_result;
  END IF;
END;
$$;

DO $$
DECLARE v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible FROM public.class_enrollments
   WHERE student_id = 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2';
  IF v_visible = 0 THEN
    RAISE NOTICE 'PASS RLS hides another student''s enrollments';
  ELSE
    RAISE NOTICE 'FAIL student B saw % enrollment(s) of student A', v_visible;
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.class_cancel_enrollment(
      (SELECT id FROM public.class_enrollments
        WHERE student_id = 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2'
        LIMIT 1), 'not mine');
    RAISE NOTICE 'FAIL student B cancelled student A''s enrollment';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ENROLLMENT_NOT_OWNED_BY_SESSION%' OR SQLERRM LIKE '%ENROLLMENT_NOT_FOUND%' THEN
      RAISE NOTICE 'PASS cancellation is owner-scoped and RLS hides the other student''s row';
    ELSE
      RAISE NOTICE 'FAIL unexpected cancellation error: %', SQLERRM;
    END IF;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Student C: full batch and full waitlist
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa5', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa5","role":"authenticated"}', true);

-- No paid enrollment can be minted: an online payment needs provider evidence.
DO $$
BEGIN
  BEGIN
    PERFORM public.class_enroll(
      'b1000000-0000-4000-8000-000000000001', 'online', 'online',
      'c1000000-0000-4000-8000-000000000009');
    RAISE NOTICE 'FAIL an online payment enrollment was created without provider evidence';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ONLINE_PAYMENT_PROVIDER_NOT_CONFIGURED%' THEN
      RAISE NOTICE 'PASS online payment is refused without a verified provider settlement';
    ELSE
      RAISE NOTICE 'FAIL unexpected online payment error: %', SQLERRM;
    END IF;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.class_enroll(
      'b1000000-0000-4000-8000-000000000001', 'offline', 'pay_at_institute',
      'c1000000-0000-4000-8000-000000000001');
    RAISE NOTICE 'FAIL a third student enrolled into a two-seat batch';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%BATCH_FULL%' THEN
      RAISE NOTICE 'PASS capacity is enforced without a waitlist';
    ELSE
      RAISE NOTICE 'FAIL unexpected capacity error: %', SQLERRM;
    END IF;
  END;
END;
$$;

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.class_enroll(
    'b1000000-0000-4000-8000-000000000002', 'offline', 'pay_at_institute',
    'c1000000-0000-4000-8000-000000000002');
  IF (v_result->'enrollment'->>'status') = 'waitlisted'
     AND (v_result->'enrollment'->>'waitlist_position')::int = 1 THEN
    RAISE NOTICE 'PASS a full batch places the student on the waitlist';
  ELSE
    RAISE NOTICE 'FAIL unexpected waitlist result: %', v_result;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trainer: sees own rosters, cannot publish a batch
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa1","role":"authenticated"}', true);

DO $$
DECLARE v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible FROM public.class_enrollments;
  IF v_visible >= 3 THEN
    RAISE NOTICE 'PASS the trainer can read enrollments for their own courses';
  ELSE
    RAISE NOTICE 'FAIL the trainer saw only % enrollment(s)', v_visible;
  END IF;
END;
$$;

DO $$
DECLARE v_updated integer;
BEGIN
  BEGIN
    UPDATE public.class_batches SET status = 'active'
     WHERE id = 'b1000000-0000-4000-8000-000000000003';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE NOTICE 'PASS a trainer cannot publish their own batch';
    ELSE
      RAISE NOTICE 'FAIL a trainer published their own batch';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a trainer cannot publish their own batch';
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.class_review_batch('b1000000-0000-4000-8000-000000000003', 'active', 'self publish');
    RAISE NOTICE 'FAIL a trainer called the admin review function';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%FORBIDDEN_ADMIN_REQUIRED%' THEN
      RAISE NOTICE 'PASS batch publication requires an admin';
    ELSE
      RAISE NOTICE 'FAIL unexpected review error: %', SQLERRM;
    END IF;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin: publication, then public visibility
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa4', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa4","role":"authenticated"}', true);

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.class_review_batch(
    'b1000000-0000-4000-8000-000000000003', 'active', 'calendar verified');
  IF (v_result->'batch'->>'status') = 'active' THEN
    RAISE NOTICE 'PASS an admin publishes a pending batch';
  ELSE
    RAISE NOTICE 'FAIL admin review returned %', v_result;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Student A: cancellation policy releases the seat
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2","role":"authenticated"}', true);

DO $$
DECLARE
  v_result jsonb;
  v_left integer;
BEGIN
  v_result := public.class_cancel_enrollment((
    SELECT id FROM public.class_enrollments
     WHERE student_id = 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2'
       AND batch_id = 'b1000000-0000-4000-8000-000000000001'
  ), 'schedule clash');

  IF (v_result->'enrollment'->>'status') = 'cancelled'
     AND (v_result->>'refundPercent')::int = 100
     AND (v_result->>'refundAmount')::numeric = 0
     AND (v_result->>'paymentSettled')::boolean IS FALSE THEN
    RAISE NOTICE 'PASS cancellation applies the 48h policy and no refund is invented';
  ELSE
    RAISE NOTICE 'FAIL unexpected cancellation: %', v_result;
  END IF;

  SELECT seats_left INTO v_left
    FROM public.class_batch_availability('b1000000-0000-4000-8000-000000000001');
  IF v_left = 1 THEN
    RAISE NOTICE 'PASS the cancelled seat returns to inventory';
  ELSE
    RAISE NOTICE 'FAIL seats_left was % after cancellation', v_left;
  END IF;

  v_result := public.class_cancel_enrollment((
    SELECT id FROM public.class_enrollments
     WHERE student_id = 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa2'
       AND batch_id = 'b1000000-0000-4000-8000-000000000001'
  ), 'repeat');
  IF (v_result->>'alreadyCancelled')::boolean THEN
    RAISE NOTICE 'PASS repeated cancellation is idempotent';
  ELSE
    RAISE NOTICE 'FAIL repeated cancellation was not idempotent: %', v_result;
  END IF;
END;
$$;

-- A stale authenticated token from a closed account must not cancel a row or
-- generate a refund quote. This uses only the disposable test profile.
SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa6', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa6","role":"authenticated"}', true);
DO $$
BEGIN
  PERFORM public.class_enroll(
    'b1000000-0000-4000-8000-000000000004', 'offline', 'free',
    'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa6');
END;
$$;
RESET ROLE;
UPDATE public.profiles SET account_status = 'closed'
 WHERE id = 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa6';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa6', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-1111-4111-8111-aaaaaaaaaaa6","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.class_cancel_enrollment(
      (SELECT id FROM public.class_enrollments
        WHERE student_id = 'c1a1c1a1-1111-4111-8111-aaaaaaaaaaa6'), 'closed account');
    RAISE EXCEPTION 'FAIL closed account cancelled an enrollment';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'ACTIVE_PROFILE_REQUIRED' THEN
      RAISE NOTICE 'PASS closed account cannot cancel enrollment or obtain a refund quote';
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;
