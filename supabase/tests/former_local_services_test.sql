-- Local-only regression suite for Farm & Village listing publication,
-- provider-reported availability and admin-controlled verification.
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

insert into auth.users (id, email) values
  ('66666666-6666-4666-8666-666666666666', 'rural-owner@example.test'),
  ('77777777-7777-4777-8777-777777777777', 'rural-admin@example.test'),
  ('88888888-8888-4888-8888-888888888888', 'rural-customer@example.test')
on conflict (id) do nothing;

update public.profiles set role = 'provider', account_status = 'active'
where id = '66666666-6666-4666-8666-666666666666';
update public.profiles set role = 'admin', account_status = 'active', is_super_admin = true
where id = '77777777-7777-4777-8777-777777777777';
update public.profiles set role = 'customer', account_status = 'active'
where id = '88888888-8888-4888-8888-888888888888';

delete from public.listings where id = 'rural-services-test-001';
insert into public.listings
  (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values
  ('rural-services-test-001', '66666666-6666-4666-8666-666666666666',
   'Provider supplied rural service', 'rural-dairy', 'Fresh milk', 'service', 0,
   'Quote on request', 'pending_approval', '{"isVerified": true, "location": {"city": "Example Village"}}'::jsonb);

set test.uid = '66666666-6666-4666-8666-666666666666';
set role authenticated;

select pg_temp.ok_raises('provider cannot self-verify listing column',
  $q$update public.listings set is_verified = true where id = 'rural-services-test-001'$q$,
  'LISTING_VERIFICATION_ADMIN_ONLY');
select pg_temp.ok_raises('provider cannot create a verified listing',
  $q$insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, is_verified) values ('rural-self-verify-001', auth.uid(), 'Not allowed', 'rural-dairy', 'Milk', 'service', true)$q$,
  'LISTING_VERIFICATION_ADMIN_ONLY');
select pg_temp.ok_raises('provider cannot self-publish a pending listing',
  $q$update public.listings set status = 'active' where id = 'rural-services-test-001'$q$,
  'LISTING_PUBLICATION_ADMIN_ONLY');
update public.listings set provider_availability_status = 'available'
where id = 'rural-services-test-001';
update public.listings set payload = jsonb_set(payload, '{isVerified}', 'true'::jsonb)
where id = 'rural-services-test-001';
reset role;

select pg_temp.ok('owner may save provider-reported availability',
  (select provider_availability_status = 'available' from public.listings where id = 'rural-services-test-001'));
select pg_temp.ok('legacy editable JSON cannot represent trusted verification',
  (select is_verified = false and payload ->> 'isVerified' = 'true' from public.listings where id = 'rural-services-test-001'));

set test.uid = '77777777-7777-4777-8777-777777777777';
set role authenticated;
update public.listings set status = 'active', is_verified = true
where id = 'rural-services-test-001';
reset role;

select pg_temp.ok('active admin can publish and verify listing',
  (select status = 'active' and is_verified from public.listings where id = 'rural-services-test-001'));
select pg_temp.ok('verification audit fields are server-stamped',
  (select verified_at is not null and verified_by = '77777777-7777-4777-8777-777777777777'::uuid
     from public.listings where id = 'rural-services-test-001'));

set test.uid = '88888888-8888-4888-8888-888888888888';
set role authenticated;
select pg_temp.ok('customer can read published rural listing',
  (select count(*) = 1 from public.listings where id = 'rural-services-test-001'));
reset role;

set test.uid = '66666666-6666-4666-8666-666666666666';
set role authenticated;
select pg_temp.ok_raises('provider cannot remove admin verification',
  $q$update public.listings set is_verified = false where id = 'rural-services-test-001'$q$,
  'LISTING_VERIFICATION_ADMIN_ONLY');
reset role;

select pg_temp.ok_raises('availability check constraint rejects unknown states',
  $q$update public.listings set provider_availability_status = 'maybe' where id = 'rural-services-test-001'$q$,
  'listings_provider_availability_status_check');
