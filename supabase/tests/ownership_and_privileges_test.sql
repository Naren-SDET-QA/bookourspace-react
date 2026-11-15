-- Ownership, idempotency and privilege assertions for the 2026-11-04 hardening
-- set. Runs only inside the disposable cluster created by
-- supabase/tests/run_guardrails_audit.sh.
--
-- Every check raises with a 'FAIL' message on violation; a PASS notice is
-- emitted only after the assertion holds. The harness counts notices.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Fixtures: two customers, a provider that owns one listing, a suspended admin.
-- auth.users inserts fire public.handle_new_user(), proving the trigger still
-- works after EXECUTE was revoked from PUBLIC/anon.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001', 'own-customer-a@example.test', '{"full_name":"Customer A"}'),
  ('a1000000-0000-4000-8000-000000000002', 'own-customer-b@example.test', '{"full_name":"Customer B"}'),
  ('a1000000-0000-4000-8000-000000000003', 'own-provider@example.test', '{"full_name":"Provider"}'),
  ('a1000000-0000-4000-8000-000000000004', 'own-admin@example.test', '{"full_name":"Admin"}'),
  ('a1000000-0000-4000-8000-000000000005', 'own-suspended-admin@example.test', '{"full_name":"Suspended Admin"}')
on conflict (id) do nothing;

update public.profiles set role = 'provider', account_status = 'active', verified = true
 where id = 'a1000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin', account_status = 'active', verified = true
 where id = 'a1000000-0000-4000-8000-000000000004';
update public.profiles set role = 'admin', account_status = 'suspended', verified = true
 where id = 'a1000000-0000-4000-8000-000000000005';

do $$
begin
  if (select count(*) from public.profiles
       where id::text like 'a1000000-0000-4000-8000-00000000000%') <> 5 then
    raise exception 'FAIL handle_new_user() no longer provisions profiles after privilege revocation';
  end if;
  raise notice 'PASS handle_new_user() still provisions Google-style profiles after EXECUTE revocation';
end $$;

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, status)
values ('own-listing-1', 'a1000000-0000-4000-8000-000000000003', 'Ownership listing',
        'services', 'test', 'service', 100, 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Provider-ownership guard: spoofing a real provider is rejected.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);

do $$
begin
  begin
    insert into public.bookings (
      id, user_id, listing_id, listing_title, provider_id, customer_name,
      customer_phone, scheduled_date, scheduled_time, amount, status
    ) values (
      'own-booking-spoof', auth.uid(), 'own-listing-1', 'Ownership listing',
      -- Customer B is a real profile that does NOT own own-listing-1.
      'a1000000-0000-4000-8000-000000000002', 'Customer A', '555-0100',
      '2027-08-01', '10:00', 100, 'confirmed'
    );
    raise exception 'FAIL booking spoofed another provider''s UUID was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'BOOKING_PROVIDER_LISTING_MISMATCH' then raise; end if;
    raise notice 'PASS booking with a provider UUID that does not own the listing is rejected';
  end;

  -- The listing owner may book their own listing using their own UUID.
  insert into public.bookings (
    id, user_id, listing_id, listing_title, provider_id, customer_name,
    customer_phone, scheduled_date, scheduled_time, amount, status
  ) values (
    'own-booking-owner', auth.uid(), 'own-listing-1', 'Ownership listing',
    'a1000000-0000-4000-8000-000000000003', 'Customer A', '555-0100',
    '2027-08-02', '10:00', 100, 'confirmed'
  );
  raise notice 'PASS booking with the real listing owner UUID is accepted';

  -- Catalogue-era slug (not a profile) remains valid, so seeded catalogue
  -- bookings keep working.
  insert into public.bookings (
    id, user_id, listing_id, listing_title, provider_id, customer_name,
    customer_phone, scheduled_date, scheduled_time, amount, status
  ) values (
    'own-booking-catalogue', auth.uid(), 'catalogue-listing-xyz', 'Catalogue listing',
    'prov-103', 'Customer A', '555-0100', '2027-08-03', '10:00', 100, 'confirmed'
  );
  raise notice 'PASS catalogue slug provider id is still accepted';

  begin
    insert into public.enquiries (
      id, user_id, listing_id, listing_title, provider_id, customer_name,
      customer_phone, message, status
    ) values (
      'own-enquiry-spoof', auth.uid(), 'own-listing-1', 'Ownership listing',
      'a1000000-0000-4000-8000-000000000002', 'Customer A', '555-0100', 'hello', 'new'
    );
    raise exception 'FAIL enquiry spoofed another provider''s UUID was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'ENQUIRY_PROVIDER_LISTING_MISMATCH' then raise; end if;
    raise notice 'PASS enquiry with a provider UUID that does not own the listing is rejected';
  end;
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 2. Per-user idempotency: same key, two users, two independent bookings.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
do $$
declare replay jsonb;
begin
  replay := public.create_booking_atomic(
    'own-idem-booking-a', 'shared-key-2026', 'catalogue-listing-xyz', 'Catalogue listing',
    'prov-103', 'Customer A', '555-0100', 'addr', '2027-09-01', '10:00', 100
  );
  if (replay->>'ok')::boolean is not true or (replay->>'idempotentReplay')::boolean is not false then
    raise exception 'FAIL first idempotent create failed: %', replay;
  end if;

  replay := public.create_booking_atomic(
    'own-idem-booking-a2', 'shared-key-2026', 'catalogue-listing-xyz', 'Catalogue listing',
    'prov-103', 'Customer A', '555-0100', 'addr', '2027-09-01', '10:00', 100
  );
  if (replay->>'bookingId') <> 'own-idem-booking-a' then
    raise exception 'FAIL owner replay did not return the original booking: %', replay;
  end if;
  raise notice 'PASS a user replaying their own idempotency key gets their original booking';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
do $$
declare replay jsonb; other_user_id uuid;
begin
  replay := public.create_booking_atomic(
    'own-idem-booking-b', 'shared-key-2026', 'catalogue-listing-xyz', 'Catalogue listing',
    'prov-103', 'Customer B', '555-0101', 'addr', '2027-09-01', '10:00', 100
  );
  if (replay->>'idempotentReplay')::boolean is true then
    raise exception 'FAIL cross-tenant replay returned another user''s booking: %', replay;
  end if;
  if (replay->>'bookingId') <> 'own-idem-booking-b' then
    raise exception 'FAIL second user did not get its own booking: %', replay;
  end if;

  select user_id into other_user_id from public.bookings where id = 'own-idem-booking-b';
  if other_user_id <> 'a1000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'FAIL booking owner mismatch';
  end if;
  raise notice 'PASS the same idempotency key from a different user creates an independent booking';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 3. Active-admin authorization.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000005', true);
do $$
begin
  if public.is_admin() then
    raise exception 'FAIL suspended admin still satisfies public.is_admin()';
  end if;
  raise notice 'PASS suspended admin no longer satisfies public.is_admin()';
end $$;

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
do $$
begin
  if not public.is_admin() then
    raise exception 'FAIL active admin does not satisfy public.is_admin()';
  end if;
  raise notice 'PASS active admin still satisfies public.is_admin()';
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 4. Restricted execution permissions.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.hold_movie_seats_atomic(text,text,text,text[],text,integer)', 'EXECUTE') then
    raise exception 'FAIL anon can execute hold_movie_seats_atomic';
  end if;
  if has_function_privilege('anon', 'public.create_booking_atomic(text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,text[],text,text,text)', 'EXECUTE') then
    raise exception 'FAIL anon can execute create_booking_atomic';
  end if;
  if has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') then
    raise exception 'FAIL anon can execute is_admin';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
  ) then
    raise exception 'FAIL handle_new_user is still callable by a client role';
  end if;
  raise notice 'PASS anonymous and trigger-only SECURITY DEFINER execution is revoked';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Foreign keys covered by a leading index.
-- ---------------------------------------------------------------------------
do $$
declare uncovered integer;
begin
  select count(*) into uncovered
    from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indisvalid
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
     );
  if uncovered <> 0 then
    raise exception 'FAIL % public foreign key(s) still lack a leading index', uncovered;
  end if;
  raise notice 'PASS every public foreign key has a leading index';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Payment verification must not reference a nonexistent settlement intent.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.payment_verifications'::regclass
       and conname = 'payment_verifications_intent_id_fkey'
       and contype = 'f'
  ) then
    raise exception 'FAIL payment_verifications.intent_id foreign key is missing';
  end if;

  begin
    insert into public.payment_verifications (id, intent_id, amount, merchant_vpa)
    values ('own-pv-orphan', 'no-such-intent', 100, 'merchant@upi');
    raise exception 'FAIL orphan payment verification was accepted';
  exception when foreign_key_violation then
    raise notice 'PASS payment verification cannot reference a nonexistent payment intent';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Live Edit authorization still resolves through the redefined predicate.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
do $$
begin
  if not (select public.is_admin() and public.is_active_user()) then
    raise exception 'FAIL active admin loses Live Edit authorization';
  end if;
  raise notice 'PASS Live Edit admin predicates still resolve for an active admin';
end $$;
commit;
