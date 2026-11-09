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

-- Production stay_hold_units is service-role-only. This helper exists only in
-- the disposable test database to model the trusted checkout invocation.
create or replace function pg_temp.bos_test_service_hold_units(
  p_room_type_id uuid, p_from date, p_to date, p_units integer, p_hold_minutes integer default 10
)
returns table(allocation_id uuid, unit_id uuid, hold_token uuid, expires_at timestamptz)
language sql security definer set search_path = '' as $$
  select * from public.stay_hold_units($1, $2, $3, $4, $5)
$$;

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

create or replace function pg_temp.ok_rowcount(label text, stmt text, expected integer)
returns void language plpgsql as $$
declare affected integer;
begin
  execute stmt;
  get diagnostics affected = row_count;
  if affected = expected then raise notice 'PASS  %', label;
  else raise notice 'FAIL  % (expected % affected row(s), got %)', label, expected, affected; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures (development data only)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'guest@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'other@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'admin@bookourspace.in');
update public.profiles set role = 'provider'
 where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set verified = true
 where id = '11111111-1111-1111-1111-111111111111';
-- Test fixture authority is provisioned explicitly by the local database
-- owner. Never infer an Admin role from this account's email address.
update public.profiles set role = 'admin', is_super_admin = true
 where id = '44444444-4444-4444-4444-444444444444';

-- Test-only owner-controlled lifecycle transition so the customer availability
-- fixture is genuinely public under the current host approval gate.
select set_config('bos.stay_lifecycle_transition', 'on', false);
insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, is_verified, verified_by, payload)
values ('listing-fixture-001',
        '11111111-1111-1111-1111-111111111111',
        'Fixture Boutique Stay', 'hotels', 'hotel', 'stay', 450000, 'night', 'active', true,
        '44444444-4444-4444-4444-444444444444', '{"stayLifecycle":"approved"}'::jsonb);

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

-- An unpublished host draft remains available to its active owner, but not to
-- anonymous discovery callers.
insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values ('listing-private-stay-001', '11111111-1111-1111-1111-111111111111',
        'Private Draft Stay', 'hotels', 'hotel', 'stay', 250000, 'night', 'pending_approval',
        '{"stayLifecycle":"draft"}'::jsonb);
insert into public.stay_properties
  (id, listing_id, owner_user_id, name, property_type, city, base_price_paise, tax_percent)
values ('11111111-0000-0000-0000-000000000010', 'listing-private-stay-001',
        '11111111-1111-1111-1111-111111111111', 'Private Draft Stay', 'hotel', 'Bengaluru', 250000, 12);
insert into public.stay_room_types (id, property_id, name, max_adults, base_price_paise)
values ('11111111-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000010', 'Draft Room', 2, 250000);
insert into public.stay_units (id, room_type_id, label)
values ('11111111-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000011', 'D-101');

set role anon;
select pg_temp.ok('anonymous callers cannot enumerate unpublished stay inventory',
  (select count(*) = 0 from public.stay_availability('11111111-0000-0000-0000-000000000011','2026-12-10','2026-12-12')));
reset role;
set test.uid = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select pg_temp.ok('the active owner can inspect private draft stay availability',
  (select count(*) = 1 from public.stay_availability('11111111-0000-0000-0000-000000000011','2026-12-10','2026-12-12')));
reset role;

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
  (select count(*) from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12',1)) = 1);

select pg_temp.ok('availability drops to one after a hold',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12')) = 1);

select pg_temp.ok('second hold takes the last unit',
  (select count(*) from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12',1)) = 1);

select pg_temp.ok('availability is zero when both units are held',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12')) = 0);

select pg_temp.ok_raises('third hold is refused when inventory is exhausted',
  $q$select * from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12',1)$q$,
  'INSUFFICIENT_AVAILABILITY');

-- 3. Release (staff action, so run as owner-of-data to isolate the RPC logic)
reset role;
update public.stay_allocations set status = 'released'
 where status = 'held' and unit_id = '11111111-0000-0000-0000-00000000000a';
set role authenticated;

select pg_temp.ok_raises('null stay dates are rejected before availability lookup',
  $q$select * from public.stay_availability('11111111-0000-0000-0000-000000000002',null,'2026-12-12')$q$,
  'INVALID_STAY_RANGE');
select pg_temp.ok_raises('availability windows longer than 120 nights are rejected',
  $q$select * from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-01-01','2026-05-02')$q$,
  'STAY_RANGE_TOO_WIDE');

select pg_temp.ok('released hold frees exactly one unit',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12')) = 1);

-- 4. Checkout-day reuse (half-open daterange) ------------------------------
select pg_temp.ok('back-to-back stay can start on the previous checkout day',
  (select count(*) from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2026-12-12','2026-12-14',1)) = 1);

select pg_temp.ok_raises('overlapping nights on a full calendar are refused',
  $q$select * from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2026-12-13','2026-12-15',2)$q$,
  'INSUFFICIENT_AVAILABILITY');

-- 5. Hold expiry -----------------------------------------------------------
reset role;
update public.stay_allocations set expires_at = now() - interval '1 minute'
 where status = 'held';
set role authenticated;

select pg_temp.ok('expired holds stop blocking availability',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-12')) = 2);

select pg_temp.ok('public availability does not mutate expired hold state',
  (select count(*) from public.stay_allocations where status = 'held' and expires_at <= now()) >= 2);

reset role;
set test.role = 'service_role';
set role service_role;
select public.sweep_expired_stay_holds();
reset role;
set test.role = 'authenticated';
set role authenticated;

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
     select * from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2027-01-10','2027-01-12',1)
   ) h cross join lateral public.stay_confirm_booking(h.hold_token, 'booking-verified-001')) = 1);

select pg_temp.ok('confirmed allocation is linked to the booking',
  (select count(*) from public.stay_allocations
    where status='confirmed' and booking_id='booking-verified-001') = 1);

select pg_temp.ok_raises('pending_verification payment cannot consume inventory',
  $q$select * from public.stay_confirm_booking(
       (select h.hold_token
          from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2027-02-10','2027-02-12',1) h),
       'booking-pending-001')$q$,
  'BOOKING_NOT_PAID');

-- 7. Invalid requests ------------------------------------------------------
reset role;
set role authenticated;

select pg_temp.ok_raises('zero-night stay is rejected',
  $q$select * from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2026-12-10','2026-12-10',1)$q$,
  'INVALID_STAY_RANGE');

select pg_temp.ok_raises('reversed dates are rejected',
  $q$select * from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2026-12-14','2026-12-10',1)$q$,
  'INVALID_STAY_RANGE');

select pg_temp.ok_raises('zero units requested is rejected',
  $q$select * from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2026-12-20','2026-12-22',0)$q$,
  'INVALID_UNIT_COUNT');

select pg_temp.ok_raises('unknown room type is rejected',
  $q$select * from pg_temp.bos_test_service_hold_units('99999999-0000-0000-0000-000000000099','2026-12-20','2026-12-22',1)$q$,
  'ROOM_TYPE_NOT_FOUND');

-- 8. Module flag enforcement in the database -------------------------------
reset role;

select pg_temp.ok_raises('movie checkout cannot be enabled without approval',
  $q$update public.platform_module_flags set allow_online_booking = true where module_key = 'movies'$q$,
  'MOVIE_BOOKING_NOT_APPROVED');

update public.platform_module_flags
   set allow_online_booking = true, booking_approved_at = now()
 where module_key = 'movies';
select pg_temp.ok('movie checkout can be enabled once approval is recorded',
  (select allow_online_booking and booking_approved_at is not null
     from public.platform_module_flags where module_key = 'movies'));

update public.platform_module_flags
   set allow_online_booking = false, booking_approved_at = null
 where module_key = 'movies';

update public.platform_module_flags set allow_online_booking = false where module_key = 'hotels';
set test.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;

select pg_temp.ok_raises('holds are refused when the hotels module disables booking',
  $q$select * from pg_temp.bos_test_service_hold_units('11111111-0000-0000-0000-000000000002','2026-12-25','2026-12-27',1)$q$,
  'MODULE_BOOKING_DISABLED');

reset role;
update public.platform_module_flags set allow_online_booking = true where module_key = 'hotels';
set role authenticated;

-- 9. RLS / privilege enforcement (not UI hiding) ---------------------------
-- Supabase grants table privileges to `authenticated` by default, so grant them
-- here to make the RLS policy (not a missing GRANT) the thing under test.
reset role;
grant select, insert, update, delete on public.platform_module_flags to authenticated;
update public.platform_module_flags set is_enabled = true, allow_contact_owner = true where module_key = 'services';
set test.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select pg_temp.ok_raises('a guest cannot write module flags directly',
  $q$insert into public.platform_module_flags (module_key, allow_online_booking) values ('ecommerce', true)$q$,
  'row-level security');
select pg_temp.ok_raises('a guest cannot use the admin stay inventory transaction',
  $q$select public.admin_upsert_stay_inventory('invalid-listing', '11111111-1111-1111-1111-111111111111', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb)$q$,
  'ACTIVE_ADMIN_REQUIRED');
select pg_temp.ok_rowcount('a guest cannot directly update module flags',
  $q$update public.platform_module_flags set is_enabled = false where module_key = 'services'$q$, 0);
reset role;
select pg_temp.ok('a guest cannot update published module settings',
  (select is_enabled from public.platform_module_flags where module_key = 'services'));

set test.uid = '44444444-4444-4444-4444-444444444444';
set role authenticated;
select pg_temp.ok_rowcount('even a Super Admin must use the server API instead of direct public-client DML',
  $q$update public.platform_module_flags set is_enabled = false, allow_contact_owner = false where module_key = 'services'$q$, 0);
reset role;
select pg_temp.ok('server-only module visibility cannot be changed directly from Supabase clients',
  (select is_enabled and allow_contact_owner from public.platform_module_flags where module_key = 'services'));

set test.uid = '44444444-4444-4444-4444-444444444444';
set role authenticated;
select pg_temp.ok_rowcount('an active admin can persist marketplace listing edits',
  $q$update public.listings set title = 'Admin-updated fixture listing' where id = 'listing-fixture-001'$q$, 1);
select public.admin_upsert_stay_inventory(
  'admin-created-stay-001', '11111111-1111-1111-1111-111111111111',
  '{"title":"Admin-created stay","category_id":"hotels","subcategory":"hotel","price":7500,"price_unit":"per night","status":"pending_approval","payload":{}}'::jsonb,
  '{"name":"Admin-created stay","property_type":"hotel","city":"Bengaluru","base_price_paise":750000,"tax_percent":12,"is_active":true}'::jsonb,
  '[{"name":"Standard","max_adults":2,"max_children":1,"base_price_paise":750000,"is_active":true,"units":[{"label":"B-301","is_active":true},{"label":"B-302","is_active":true}]}]'::jsonb
);
select pg_temp.ok('an active admin can create a stay listing and property atomically',
  exists (select 1 from public.stay_properties where listing_id = 'admin-created-stay-001'));
select pg_temp.ok('the newly created stay room type was persisted',
  (select count(*) = 1 from public.stay_room_types rt join public.stay_properties p on p.id = rt.property_id where p.listing_id = 'admin-created-stay-001'));
select pg_temp.ok('the newly created physical stay units were persisted',
  (select count(*) = 2 from public.stay_units u join public.stay_room_types rt on rt.id = u.room_type_id join public.stay_properties p on p.id = rt.property_id where p.listing_id = 'admin-created-stay-001'));
select pg_temp.ok('an active admin can atomically edit property, room type and unit inventory',
  public.admin_upsert_stay_inventory(
    'listing-fixture-001', '11111111-1111-1111-1111-111111111111',
    '{"title":"Admin Stay Fixture","category_id":"hotels","subcategory":"hotel","price":4500,"price_unit":"per night","status":"active","payload":{}}'::jsonb,
    '{"name":"Admin Stay Fixture","property_type":"hotel","city":"Bengaluru","area":"Admin-reviewed area","base_price_paise":450000,"tax_percent":12,"is_active":true}'::jsonb,
    '[{"id":"11111111-0000-0000-0000-000000000002","name":"Admin-reviewed room","max_adults":2,"max_children":0,"base_price_paise":450000,"is_active":true,"units":[{"id":"11111111-0000-0000-0000-00000000000a","label":"A-101","is_active":true},{"id":"11111111-0000-0000-0000-00000000000b","label":"A-102","is_active":true}]}]'::jsonb
  )->>'listing_id' = 'listing-fixture-001'
);
select pg_temp.ok('stay inventory transaction records an immutable admin audit event',
  exists (select 1 from public.stay_audit_events
    where event = 'admin_inventory_saved'
      and actor = '44444444-4444-4444-4444-444444444444'
      and detail->>'listing_id' = 'listing-fixture-001'));
select pg_temp.ok_raises('failed stay inventory transaction rejects duplicate unit labels atomically',
  $q$select public.admin_upsert_stay_inventory(
    'listing-fixture-001', '11111111-1111-1111-1111-111111111111',
    '{"title":"Should Roll Back","category_id":"hotels","subcategory":"hotel","price":4500,"status":"active"}'::jsonb,
    '{"name":"Should Roll Back","property_type":"hotel","city":"Bengaluru","base_price_paise":450000}'::jsonb,
    '[{"id":"11111111-0000-0000-0000-000000000002","name":"Room","max_adults":2,"base_price_paise":450000,"units":[{"id":"11111111-0000-0000-0000-00000000000a","label":"duplicate","is_active":true},{"id":"11111111-0000-0000-0000-00000000000b","label":"duplicate","is_active":true}]}]'::jsonb
  )$q$,
  'stay_units_room_type_id_label_key');
select pg_temp.ok('failed stay edit left the prior listing and property values intact',
  (select title = 'Admin Stay Fixture' from public.listings where id = 'listing-fixture-001')
  and (select name = 'Admin Stay Fixture' from public.stay_properties where id = '11111111-0000-0000-0000-000000000001'));
select pg_temp.ok_rowcount('an active admin can update stay property fields',
  $q$update public.stay_properties set area = 'Admin-reviewed area' where id = '11111111-0000-0000-0000-000000000001'$q$, 1);
select pg_temp.ok_rowcount('an active admin can update room type fields',
  $q$update public.stay_room_types set name = 'Admin-reviewed room' where id = '11111111-0000-0000-0000-000000000002'$q$, 1);
select pg_temp.ok_rowcount('an active admin can safely deactivate a unit',
  $q$update public.stay_units set is_active = false where id = '11111111-0000-0000-0000-00000000000b'$q$, 1);
select pg_temp.ok_rowcount('an active admin cannot physically delete a property',
  $q$delete from public.stay_properties where id = '11111111-0000-0000-0000-000000000001'$q$, 0);
select pg_temp.ok('admin deactivation preserves the booking-linked stay inventory rows',
  (select count(*) = 1 from public.stay_properties where id = '11111111-0000-0000-0000-000000000001')
  and (select count(*) = 1 from public.stay_allocations where booking_id = 'booking-verified-001'));
reset role;
update public.stay_units set is_active = true
 where id = '11111111-0000-0000-0000-00000000000b';
update public.profiles set account_status = 'suspended'
 where id = '44444444-4444-4444-4444-444444444444';
set test.uid = '44444444-4444-4444-4444-444444444444';
set role authenticated;
update public.platform_module_flags set is_enabled = true where module_key = 'services';
select pg_temp.ok_raises('a suspended admin cannot call the stay inventory transaction',
  $q$select public.admin_upsert_stay_inventory('invalid-listing', '11111111-1111-1111-1111-111111111111', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb)$q$,
  'ACTIVE_ADMIN_REQUIRED');
select pg_temp.ok_rowcount('a suspended admin cannot update marketplace listings',
  $q$update public.listings set title = 'Should not persist' where id = 'listing-fixture-001'$q$, 0);
select pg_temp.ok_rowcount('a suspended admin cannot update stay properties',
  $q$update public.stay_properties set area = 'Should not persist' where id = '11111111-0000-0000-0000-000000000001'$q$, 0);
select pg_temp.ok_rowcount('a suspended admin cannot update stay inventory',
  $q$update public.stay_units set label = 'Should not persist' where id = '11111111-0000-0000-0000-00000000000a'$q$, 0);
reset role;
select pg_temp.ok('a suspended admin cannot update module settings',
  (select is_enabled and allow_contact_owner
     from public.platform_module_flags where module_key = 'services'));
select pg_temp.ok('the suspended admin listing edit did not persist',
  (select title = 'Admin Stay Fixture'
     from public.listings where id = 'listing-fixture-001'));
update public.profiles set account_status = 'active'
 where id = '44444444-4444-4444-4444-444444444444';
update public.platform_module_flags
   set is_enabled = true, allow_contact_owner = true, updated_by = null
 where module_key = 'services';
update public.profiles set account_status = 'pending_verification'
 where id = '44444444-4444-4444-4444-444444444444';
set test.uid = '44444444-4444-4444-4444-444444444444';
set role authenticated;
update public.platform_module_flags set is_enabled = false where module_key = 'services';
reset role;
select pg_temp.ok('a pending-verification admin cannot update module settings',
  (select is_enabled and allow_contact_owner
     from public.platform_module_flags where module_key = 'services'));
update public.profiles set account_status = 'active'
 where id = '44444444-4444-4444-4444-444444444444';
set test.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;

select pg_temp.ok_raises('a guest cannot insert allocations directly',
  $q$insert into public.stay_allocations (unit_id, status, stay_dates, expires_at)
     values ('11111111-0000-0000-0000-00000000000a','held',
             daterange('2027-03-01','2027-03-03','[)'), now() + interval '10 minutes')$q$,
  'permission denied');

select pg_temp.ok('a guest sees no other guest''s allocations',
  (select count(*) from public.stay_allocations
    where guest_user_id is not null
      and guest_user_id <> '22222222-2222-2222-2222-222222222222') = 0);

-- 9b. Owner calendar controls from the local-only 20261105180000 candidate.
reset role;
set test.uid = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.stay_blocks(unit_id, stay_dates, reason, created_by)
values ('11111111-0000-0000-0000-00000000000b', daterange('2028-01-10','2028-01-12','[)'), 'owner maintenance', '11111111-1111-1111-1111-111111111111');
select pg_temp.ok('owner blackout reduces available unit count',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2028-01-10','2028-01-12')) = 1);
update public.stay_blocks set is_active = false
 where unit_id = '11111111-0000-0000-0000-00000000000b' and reason = 'owner maintenance';
select pg_temp.ok('owner can restore calendar dates without deleting blackout history',
  (select count(*) from public.stay_availability('11111111-0000-0000-0000-000000000002','2028-01-10','2028-01-12')) = 2
  and exists (select 1 from public.stay_blocks where reason = 'owner maintenance' and not is_active));
reset role;
set test.uid = '33333333-3333-3333-3333-333333333333';
set role authenticated;
select pg_temp.ok_rowcount('a non-owner cannot restore another property calendar',
  $q$update public.stay_blocks set is_active = true where reason = 'owner maintenance'$q$, 0);
reset role;

-- Owner photo ordering remains a metadata-only update on finalized media.
-- Restore this disposable listing to an explicitly approved/public state after
-- the preceding admin inventory test exercised draft/pending transitions.
select set_config('test.uid', '44444444-4444-4444-4444-444444444444', false);
select set_config('bos.stay_lifecycle_transition', 'on', false);
update public.listings
   set status = 'active', is_verified = true,
       verified_by = '44444444-4444-4444-4444-444444444444',
       payload = coalesce(payload, '{}'::jsonb) || '{"stayLifecycle":"approved"}'::jsonb
 where id = 'listing-fixture-001';
insert into public.media_assets
  (id, owner_id, module_key, parent_type, parent_id, bucket_id, object_path,
   media_kind, media_format, privacy, file_size_bytes, width, height,
   checksum_sha256, processing_status, display_order)
values
  ('11111111-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111',
   'stays', 'provider_listing', 'listing-fixture-001', 'bos-public-media',
   '11111111-1111-1111-1111-111111111111/stays/provider_listing/e2e-original.jpg',
   'image', 'jpeg', 'public', 64, 1, 1, repeat('a', 64), 'ready', 0);
set test.uid = '11111111-1111-1111-1111-111111111111';
set role authenticated;
update public.listings set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
  'images', jsonb_build_array('storage://bos-public-media/11111111-1111-1111-1111-111111111111/stays/provider_listing/e2e-original.jpg')
) where id = 'listing-fixture-001';
select pg_temp.ok_rowcount('the active owner can reorder their own finalized stay photo',
  $q$update public.media_assets set display_order = 1 where id = '11111111-0000-0000-0000-0000000000aa'$q$, 1);
reset role;
set test.uid = '33333333-3333-3333-3333-333333333333';
set role authenticated;
select pg_temp.ok_rowcount('another account cannot reorder the owner''s photo',
  $q$update public.media_assets set display_order = 0 where id = '11111111-0000-0000-0000-0000000000aa'$q$, 0);
reset role;
set role anon;
select pg_temp.ok('anonymous catalog access sees only finalized media attached to the published listing',
  (select count(bucket_id) = 1 from public.media_assets where bucket_id = 'bos-public-media'
    and object_path = '11111111-1111-1111-1111-111111111111/stays/provider_listing/e2e-original.jpg'));
reset role;

-- 10. Audit trail ---------------------------------------------------------
reset role;
select pg_temp.ok('allocation changes were written to the audit trail',
  (select count(*) from public.stay_audit_events) >= 6);

select pg_temp.ok('audit captured a released allocation',
  (select count(*) from public.stay_audit_events where event = 'allocation_released') >= 1);

set client_min_messages to notice;
select 'done' as functional_run;
