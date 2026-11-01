-- ============================================================================
-- Functional + invariant tests for migration 002 (stay inventory + module flags)
--
-- Run by supabase/tests/run_local_validation.sh against a throwaway local
-- PostgreSQL 17 database that has had supabase/schema_and_rls.sql applied,
-- then migration 002. No Supabase cloud project is involved.
--
-- Every assertion prints PASS or FAIL; the driver fails on any FAIL.
--
-- Schema facts this file relies on (verified against the real baseline):
--   public.listings.id  is TEXT      public.bookings.id is TEXT
--   public.bookings.payment_status in (pay_later, pending_verification,
--                                      verified, failed, refunded)
--   stay_confirm_booking is revoked from anon/authenticated by design.
-- ============================================================================

\set ON_ERROR_STOP 0
\set QUIET on
set client_min_messages to notice;

create or replace function pg_temp.ok(label text, condition boolean)
returns void language plpgsql as $$
begin
  if condition then raise notice 'PASS  %', label;
  else raise notice 'FAIL  %', label; end if;
end $$;

create or replace function pg_temp.ok_raises(label text, stmt text, want text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'FAIL  % (expected error containing "%", statement succeeded)', label, want;
exception when others then
  if position(want in sqlerrm) > 0 then
    raise notice 'PASS  %', label;
  else
    raise notice 'FAIL  % (expected "%", got: %)', label, want, sqlerrm;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures (development data only)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'guest@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'other@example.test');

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values ('listing-fixture-001',
        '11111111-1111-1111-1111-111111111111',
        'Fixture Boutique Stay', 'hotels', 'hotel', 'stay', 450000, 'night', 'active', '{}'::jsonb);

insert into public.stay_properties
  (id, listing_id, owner_user_id, name, property_type, city, base_price_paise, tax_percent)
values ('11111111-0000-0000-0000-000000000001',
        'listing-fixture-001',
        '11111111-1111-1111-1111-111111111111',
        'Fixture Boutique Stay', 'hotel', 'Bengaluru', 450000, 12);

insert into public.stay_room_types (id, property_id, name, max_adults, base_price_paise)
values ('11111111-0000-0000-0000-000000000002',
        '11111111-0000-0000-0000-000000000001',
        'Deluxe King', 2, 450000);

insert into public.stay_units (id, room_type_id, label) values
  ('11111111-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000002', 'A-101'),
  ('11111111-0000-0000-0000-00000000000b', '11111111-0000-0000-0000-000000000002', 'A-102');

insert into public.bookings
  (id, user_id, listing_id, listing_title, provider_id, customer_name, customer_phone,
   scheduled_date, scheduled_time, amount, status, payload, payment_status)
values
  ('booking-verified-001','22222222-2222-2222-2222-222222222222','listing-fixture-001',
   'Fixture Boutique Stay','11111111-1111-1111-1111-111111111111','Fixture Guest','9999999999',
   '2026-12-10','14:00',1008000,'confirmed','{}'::jsonb,'verified'),
  ('booking-pending-001','22222222-2222-2222-2222-222222222222','listing-fixture-001',
   'Fixture Boutique Stay','11111111-1111-1111-1111-111111111111','Fixture Guest','9999999999',
   '2026-12-10','14:00',1008000,'pending','{}'::jsonb,'pending_verification');

-- ---------------------------------------------------------------------------
-- Act as an authenticated guest
-- ---------------------------------------------------------------------------
set test.uid = '22222222-2222-2222-2222-222222222222';
set test.role = 'authenticated';
set role authenticated;

-- 1. Availability baseline -------------------------------------------------
select pg_temp.ok('two units available on a clean calendar',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12')) = 2);

-- 2. Hold, exhaustion ------------------------------------------------------
select pg_temp.ok('first hold succeeds for one unit',
  (select count(*) from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12',1)) = 1);

select pg_temp.ok('availability drops to one after a hold',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12')) = 1);

select pg_temp.ok('second hold takes the last unit',
  (select count(*) from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12',1)) = 1);

select pg_temp.ok('availability is zero when both units are held',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12')) = 0);

select pg_temp.ok_raises('third hold is refused when inventory is exhausted',
  $q$select * from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12',1)$q$,
  'INSUFFICIENT_AVAILABILITY');

-- 3. Release (staff action, so run as owner-of-data to isolate the RPC logic)
reset role;
update public.stay_allocations set status = 'released'
 where status = 'held' and unit_id = '11111111-0000-0000-0000-00000000000a';
set role authenticated;

select pg_temp.ok('released hold frees exactly one unit',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12')) = 1);

-- 4. Checkout-day reuse (half-open daterange) ------------------------------
select pg_temp.ok('back-to-back stay can start on the previous checkout day',
  (select count(*) from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2026-12-12','2026-12-14',1)) = 1);

select pg_temp.ok_raises('overlapping nights on a full calendar are refused',
  $q$select * from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2026-12-13','2026-12-15',2)$q$,
  'INSUFFICIENT_AVAILABILITY');

-- 5. Hold expiry -----------------------------------------------------------
reset role;
update public.stay_allocations set expires_at = now() - interval '1 minute'
 where status = 'held';
set role authenticated;

select pg_temp.ok('expired holds stop blocking availability',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12')) = 2);

select pg_temp.ok('expired holds are swept to status=expired',
  (select count(*) from public.stay_allocations where status = 'expired') >= 2);

-- Guests may never confirm inventory, even with a live hold.
select pg_temp.ok_raises('a guest cannot call stay_confirm_booking',
  $q$select * from public.stay_confirm_booking(gen_random_uuid(), 'booking-verified-001')$q$,
  'permission denied');

-- 6. Confirmation requires verified payment (service role) -----------------
reset role;
select pg_temp.ok_raises('an expired hold cannot be confirmed into a booking',
  $q$select * from public.stay_confirm_booking(
       (select hold_token from public.stay_allocations where status='expired' limit 1),
       'booking-verified-001')$q$,
  'HOLD_EXPIRED_OR_MISSING');

set role service_role;
set test.uid = '22222222-2222-2222-2222-222222222222';

select pg_temp.ok('verified booking confirms a live hold',
  (select count(*) from (
     select * from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2027-01-10','2027-01-12',1)
   ) h cross join lateral public.stay_confirm_booking(h.hold_token, 'booking-verified-001')) = 1);

select pg_temp.ok('confirmed allocation is linked to the booking',
  (select count(*) from public.stay_allocations
    where status='confirmed' and booking_id='booking-verified-001') = 1);

select pg_temp.ok_raises('pending_verification payment cannot consume inventory',
  $q$select * from public.stay_confirm_booking(
       (select h.hold_token
          from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2027-02-10','2027-02-12',1) h),
       'booking-pending-001')$q$,
  'BOOKING_NOT_PAID');

-- 7. Invalid requests ------------------------------------------------------
reset role;
set role authenticated;

select pg_temp.ok_raises('zero-night stay is rejected',
  $q$select * from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-10',1)$q$,
  'INVALID_STAY_RANGE');

select pg_temp.ok_raises('reversed dates are rejected',
  $q$select * from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2026-12-14','2026-12-10',1)$q$,
  'INVALID_STAY_RANGE');

select pg_temp.ok_raises('zero units requested is rejected',
  $q$select * from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2026-12-20','2026-12-22',0)$q$,
  'INVALID_UNIT_COUNT');

select pg_temp.ok_raises('unknown room type is rejected',
  $q$select * from public.stay_hold_units('99999999-0000-0000-0000-000000000099','2026-12-20','2026-12-22',1)$q$,
  'ROOM_TYPE_NOT_FOUND');

-- 8. Module flag enforcement in the database -------------------------------
reset role;

select pg_temp.ok_raises('movie checkout cannot be enabled without approval',
  $q$update public.platform_module_flags set allow_online_booking = true where module_key = 'movies'$q$,
  'MOVIE_BOOKING_NOT_APPROVED');

select pg_temp.ok('movie checkout can be enabled once approval is recorded',
  (with upd as (
     update public.platform_module_flags
        set allow_online_booking = true, booking_approved_at = now()
      where module_key = 'movies' returning 1
   ) select count(*) from upd) = 1);

update public.platform_module_flags
   set allow_online_booking = false, booking_approved_at = null
 where module_key = 'movies';

update public.platform_module_flags set allow_online_booking = false where module_key = 'hotels';
set test.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;

select pg_temp.ok_raises('holds are refused when the hotels module disables booking',
  $q$select * from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2026-12-25','2026-12-27',1)$q$,
  'MODULE_BOOKING_DISABLED');

reset role;
update public.platform_module_flags set allow_online_booking = true where module_key = 'hotels';
set role authenticated;

-- 9. RLS / privilege enforcement (not UI hiding) ---------------------------
-- Supabase grants table privileges to `authenticated` by default, so grant them
-- here to make the RLS policy (not a missing GRANT) the thing under test.
reset role;
grant select, insert, update, delete on public.platform_module_flags to authenticated;
set test.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select pg_temp.ok_raises('a guest cannot write module flags directly',
  $q$insert into public.platform_module_flags (module_key, allow_online_booking) values ('ecommerce', true)$q$,
  'row-level security');

select pg_temp.ok_raises('a guest cannot insert allocations directly',
  $q$insert into public.stay_allocations (unit_id, status, stay_dates, expires_at)
     values ('11111111-0000-0000-0000-00000000000a','held',
             daterange('2027-03-01','2027-03-03','[)'), now() + interval '10 minutes')$q$,
  'permission denied');

select pg_temp.ok('a guest sees no other guest''s allocations',
  (select count(*) from public.stay_allocations
    where guest_user_id is not null
      and guest_user_id <> '22222222-2222-2222-2222-222222222222') = 0);

-- 10. Audit trail ---------------------------------------------------------
reset role;
select pg_temp.ok('allocation changes were written to the audit trail',
  (select count(*) from public.stay_audit_events) >= 6);

select pg_temp.ok('audit captured a released allocation',
  (select count(*) from public.stay_audit_events where event = 'allocation_released') >= 1);

set client_min_messages to notice;
select 'done' as functional_run;
