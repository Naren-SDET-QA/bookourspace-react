-- Disposable PostgreSQL coverage for the 2026-11-06 forward security fixes.
-- This file is invoked against the isolated cluster created by
-- run_local_validation.sh and rolls back every test fixture.

\set ON_ERROR_STOP on
\set QUIET on
begin;
set client_min_messages to notice;

create or replace function pg_temp.ok(label text, condition boolean)
returns void language plpgsql as $$
begin
  if condition then raise notice 'PASS  %', label;
  else raise notice 'FAIL  %', label; end if;
end $$;

create or replace function pg_temp.ok_raises(label text, statement text, expected text)
returns void language plpgsql as $$
begin
  execute statement;
  raise notice 'FAIL  % (statement unexpectedly succeeded)', label;
exception when others then
  if position(expected in sqlerrm) > 0 then
    raise notice 'PASS  %', label;
  else
    raise notice 'FAIL  % (expected %, got %)', label, expected, sqlerrm;
  end if;
end $$;

do $$
declare
  rpc record;
  expected_service boolean;
begin
  for rpc in
    select p.oid, p.proname, p.proconfig,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_execute,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
           exists (
             select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
              where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
           ) as public_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'class_batch_availability', 'provider_contact_details',
         'service_listing_profile', 'service_listing_slots', 'stay_availability',
         'venue_public_calendar', 'venue_quote'
       )
     order by p.proname
  loop
    expected_service := rpc.proname in ('service_listing_profile','service_listing_slots','stay_availability');
    perform pg_temp.ok(rpc.proname || ' is SECURITY DEFINER with empty search_path',
      (select p.prosecdef and p.proconfig @> array['search_path=""']
         from pg_proc p where p.oid = rpc.oid));
    perform pg_temp.ok(rpc.proname || ' has explicit intended EXECUTE grants only',
      rpc.anon_execute and rpc.auth_execute and (rpc.service_execute = expected_service)
      and not rpc.public_execute);
  end loop;

  perform pg_temp.ok('all seven intentionally public discovery RPCs are present',
    (select count(*) = 7 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'class_batch_availability','provider_contact_details','service_listing_profile',
        'service_listing_slots','stay_availability','venue_public_calendar','venue_quote')));

  perform pg_temp.ok('service profile RPC reads only the approved public provider projection',
    (select position('public.public_provider_profiles' in lower(pg_get_functiondef(p.oid))) > 0
            and position('public.profiles' in lower(pg_get_functiondef(p.oid))) = 0
       from pg_proc p where p.oid='public.service_listing_profile(text)'::regprocedure));

  perform pg_temp.ok('all 56 direct auth.uid RLS initplan expressions are normalized',
    (select count(*) = 0 from pg_policies
      where schemaname='public'
        and position('auth.uid()' in coalesce(qual,'') || ' ' || coalesce(with_check,'')) > 0
        and position('auth.uid()' in regexp_replace(
          coalesce(qual,'') || ' ' || coalesce(with_check,''),
          '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\s*\)', '', 'gi')) > 0));

  perform pg_temp.ok('audit and venue payment event tables remain RLS-enabled and deny-all by policy',
    (select count(*) = 2 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('user_access_audit_events','venue_payment_events')
        and c.relrowsecurity)
    and (select count(*) = 0 from pg_policies where schemaname='public'
      and tablename in ('user_access_audit_events','venue_payment_events')));

  perform pg_temp.ok('anonymous and authenticated roles have no direct audit/payment-event table privileges',
    not has_table_privilege('anon','public.user_access_audit_events','SELECT')
    and not has_table_privilege('authenticated','public.user_access_audit_events','SELECT')
    and not has_table_privilege('anon','public.venue_payment_events','SELECT')
    and not has_table_privilege('authenticated','public.venue_payment_events','SELECT')
    and not has_table_privilege('anon','public.venue_payment_events','INSERT')
    and not has_table_privilege('authenticated','public.venue_payment_events','INSERT'));

  perform pg_temp.ok('service role can read/append venue provider events but cannot rewrite or truncate them',
    has_table_privilege('service_role','public.venue_payment_events','SELECT')
    and has_table_privilege('service_role','public.venue_payment_events','INSERT')
    and not has_table_privilege('service_role','public.venue_payment_events','UPDATE')
    and not has_table_privilege('service_role','public.venue_payment_events','DELETE')
    and not has_table_privilege('service_role','public.venue_payment_events','TRUNCATE'));

  perform pg_temp.ok('venue payment ledger has row and TRUNCATE immutability triggers',
    (select count(*) = 2 from pg_trigger t
       join pg_class c on c.oid=t.tgrelid
       join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='venue_payment_events'
        and not t.tgisinternal and t.tgenabled='O'
        and t.tgname in ('venue_payment_events_append_only_row','venue_payment_events_append_only_truncate')));
end;
$$;

-- Create throwaway account/listing/booking/event fixtures to verify the
-- customer/provider/Super Admin visibility matrix and append-only behavior.
insert into auth.users (id, email, raw_user_meta_data) values
  ('e1000000-0000-4000-8000-000000000001','rpc-owner@example.test','{}'::jsonb),
  ('e1000000-0000-4000-8000-000000000002','rpc-customer@example.test','{}'::jsonb),
  ('e1000000-0000-4000-8000-000000000003','rpc-other@example.test','{}'::jsonb),
  ('e1000000-0000-4000-8000-000000000004','rpc-admin@example.test','{}'::jsonb)
on conflict (id) do nothing;

update public.profiles set role='provider', account_status='active', verified=true
 where id='e1000000-0000-4000-8000-000000000001';
update public.profiles set role='admin', account_status='active', verified=true, is_super_admin=true
 where id='e1000000-0000-4000-8000-000000000004';

insert into public.listings
  (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values ('rpc-security-venue','e1000000-0000-4000-8000-000000000001',
        'Disposable Venue Security Fixture','venue','hall','venue',1000,'per hour','active','{}'::jsonb);
insert into public.listings
  (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values ('rpc-security-service','e1000000-0000-4000-8000-000000000001',
        'Disposable Service Security Fixture','services','home','service',500,'visit','active','{}'::jsonb);

insert into public.venue_bookings
  (id, listing_id, owner_user_id, customer_user_id, idempotency_key, request_fingerprint,
   slot_type, starts_at, ends_at, protected_period, guest_count, addon_ids,
   price_breakdown, total_paise, deposit_paise, payment_mode, payment_status, status,
   cancellation_policy)
values ('e1000000-0000-4000-8000-000000000010','rpc-security-venue',
        'e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002',
        'e1000000-0000-4000-8000-000000000020','{}'::jsonb,'hourly',
        '2030-01-01 10:00:00+00','2030-01-01 11:00:00+00',
        tstzrange('2030-01-01 10:00:00+00','2030-01-01 11:00:00+00','[)'),1,'{}',
        '{}'::jsonb,1000,0,'razorpay','awaiting_verification','pending_payment','{}'::jsonb);

insert into public.venue_payment_intents
  (id, booking_id, customer_user_id, provider, amount_paise, status, expires_at)
values ('e1000000-0000-4000-8000-000000000030',
        'e1000000-0000-4000-8000-000000000010',
        'e1000000-0000-4000-8000-000000000002','sandbox',1000,'created','2030-01-02 00:00:00+00');

insert into public.venue_payment_events
  (provider_event_id, booking_id, payment_intent_id, event_type, provider_reference, amount_paise, payload_hash)
values ('rpc-security-event-001','e1000000-0000-4000-8000-000000000010',
        'e1000000-0000-4000-8000-000000000030','payment.captured','disposable-reference',1000,repeat('a',64));

set local role anon;
select set_config('test.uid','',true);
select pg_temp.ok('public service profile RPC resolves its approved projection with empty search_path',
  (public.service_listing_profile('rpc-security-service')->>'listingId') = 'rpc-security-service');
select pg_temp.ok_raises('anonymous lacks direct privileges on private venue payment intents',
  $q$select * from public.venue_payment_intents where id='e1000000-0000-4000-8000-000000000030'$q$,
  'permission denied');
reset role;

set local role authenticated;
select set_config('test.uid','e1000000-0000-4000-8000-000000000003',true);
select pg_temp.ok('cross-account customer cannot read a foreign venue payment intent',
  (select count(*)=0 from public.venue_payment_intents where id='e1000000-0000-4000-8000-000000000030'));

select set_config('test.uid','e1000000-0000-4000-8000-000000000002',true);
select pg_temp.ok('booking customer can read their own venue payment intent',
  (select count(*)=1 from public.venue_payment_intents where id='e1000000-0000-4000-8000-000000000030'));

select set_config('test.uid','e1000000-0000-4000-8000-000000000001',true);
select pg_temp.ok('venue owner can read the payment intent for their booking',
  (select count(*)=1 from public.venue_payment_intents where id='e1000000-0000-4000-8000-000000000030'));

select set_config('test.uid','e1000000-0000-4000-8000-000000000004',true);
select pg_temp.ok('active Super Admin can read the payment intent for moderation',
  (select count(*)=1 from public.venue_payment_intents where id='e1000000-0000-4000-8000-000000000030'));

-- The trigger is the final guard even when tested as the database owner;
-- service_role's ordinary table UPDATE/DELETE/TRUNCATE privileges are revoked.
reset role;
select pg_temp.ok_raises('payment event UPDATE is rejected by the immutable ledger trigger',
  $q$update public.venue_payment_events set amount_paise=1 where provider_event_id='rpc-security-event-001'$q$,
  'VENUE_PAYMENT_EVENTS_APPEND_ONLY');
select pg_temp.ok_raises('payment event DELETE is rejected by the immutable ledger trigger',
  $q$delete from public.venue_payment_events where provider_event_id='rpc-security-event-001'$q$,
  'VENUE_PAYMENT_EVENTS_APPEND_ONLY');
select pg_temp.ok_raises('payment event TRUNCATE is rejected by the immutable ledger trigger',
  $q$truncate table public.venue_payment_events$q$,
  'VENUE_PAYMENT_EVENTS_APPEND_ONLY');

reset role;
rollback;
