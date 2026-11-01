-- ============================================================================
-- Regression tests for migration 003 (provider contact listing ids)
--
-- Runs against the same throwaway PostgreSQL 17 database as the stay suite,
-- after every migration in supabase/migrations has been applied.
--
-- The defect these tests lock down: listings.id is TEXT, so uuid-typed
-- parameters made every real listing id unusable.
--
-- Every assertion prints PASS or FAIL; the driver fails on any FAIL.
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
-- Fixtures: ids deliberately NOT uuid-shaped, matching production reality
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'stay-owner@example.test'),
  ('55555555-5555-5555-5555-555555555555', 'stay-guest@example.test')
on conflict (id) do nothing;

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values ('listing-contact-text-001',
        '44444444-4444-4444-4444-444444444444',
        'Text Id Boutique Stay', 'hotel-stay', 'hotel', 'stay', 350000, 'night', 'active', '{}'::jsonb)
on conflict (id) do nothing;

-- Owner has consented, published both channels, but nothing is verified yet.
insert into public.provider_contact_settings
  (listing_id, module_key, owner_user_id, business_phone, whatsapp_number,
   publish_phone, publish_whatsapp, consent_recorded_at)
values ('listing-contact-text-001', 'hotels', '44444444-4444-4444-4444-444444444444',
        '+91 98450 11111', '+91 98450 22222', true, true, now())
on conflict (listing_id) do update
  set business_phone_verified_at = null,
      whatsapp_verified_at = null,
      publish_phone = true,
      publish_whatsapp = true;

update public.platform_module_flags set allow_contact_owner = true where module_key = 'hotels';

-- ---------------------------------------------------------------------------
-- 1. The uuid overloads must be gone (otherwise calls are ambiguous)
-- ---------------------------------------------------------------------------

select pg_temp.ok('uuid overload of provider_contact_details no longer exists',
  to_regprocedure('public.provider_contact_details(uuid)') is null);

select pg_temp.ok('uuid overload of record_contact_click no longer exists',
  to_regprocedure('public.record_contact_click(uuid,text)') is null);

select pg_temp.ok('text overload of provider_contact_details exists',
  to_regprocedure('public.provider_contact_details(text)') is not null);

select pg_temp.ok('text overload of record_contact_click exists',
  to_regprocedure('public.record_contact_click(text,text)') is not null);

-- ---------------------------------------------------------------------------
-- 2. A real (non-uuid) listing id must not raise a uuid cast error
-- ---------------------------------------------------------------------------

select pg_temp.ok('non-uuid listing id resolves instead of failing the uuid cast',
  (select public.provider_contact_details('listing-contact-text-001')) is not null);

select pg_temp.ok('unknown id returns unavailable rather than erroring',
  (select public.provider_contact_details('listing-does-not-exist') ->> 'available') = 'false');

select pg_temp.ok('uuid-shaped but nonexistent id returns unavailable',
  (select public.provider_contact_details('c0a8012e-0000-4000-8000-000000000000') ->> 'available') = 'false');

select pg_temp.ok('empty id is rejected without error',
  (select public.provider_contact_details('') ->> 'available') = 'false');

-- ---------------------------------------------------------------------------
-- 3. Consent present but channels unverified => nothing is exposed
-- ---------------------------------------------------------------------------

select pg_temp.ok('contact block reports availability for a consented owner',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'available') = 'true');

select pg_temp.ok('unverified phone is not exposed',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'phone') is null);

select pg_temp.ok('unverified whatsapp is not exposed',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'whatsapp') is null);

select pg_temp.ok('disclaimer is present',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'disclaimer')
    like '%not automatically confirmed%');

-- ---------------------------------------------------------------------------
-- 4. Verification alone unlocks each channel
-- ---------------------------------------------------------------------------

update public.provider_contact_settings
   set business_phone_verified_at = now()
 where listing_id = 'listing-contact-text-001';

select pg_temp.ok('verified phone is returned',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'phone') = '+91 98450 11111');

select pg_temp.ok('whatsapp remains hidden until it is verified too',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'whatsapp') is null);

update public.provider_contact_settings
   set whatsapp_verified_at = now()
 where listing_id = 'listing-contact-text-001';

select pg_temp.ok('verified whatsapp is returned',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'whatsapp') = '+91 98450 22222');

-- Publishing must also be switched on.
update public.provider_contact_settings
   set publish_phone = false
 where listing_id = 'listing-contact-text-001';

select pg_temp.ok('unpublished phone is hidden even when verified',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'phone') is null);

update public.provider_contact_settings set publish_phone = true where listing_id = 'listing-contact-text-001';

-- Consent is the gate above everything else.
update public.provider_contact_settings set consent_recorded_at = null where listing_id = 'listing-contact-text-001';
select pg_temp.ok('missing consent hides everything',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'available') = 'false');
update public.provider_contact_settings set consent_recorded_at = now() where listing_id = 'listing-contact-text-001';

-- Module switch is authoritative.
update public.platform_module_flags set allow_contact_owner = false where module_key = 'hotels';
select pg_temp.ok('disabled module hides contact details',
  (select public.provider_contact_details('listing-contact-text-001') ->> 'available') = 'false');

-- ---------------------------------------------------------------------------
-- 5. Click recording is authenticated and module-gated
-- ---------------------------------------------------------------------------

set test.uid = '55555555-5555-5555-5555-555555555555';
set role authenticated;

select pg_temp.ok_raises('click recording is refused while the module disables contact',
  $q$select public.record_contact_click('listing-contact-text-001','call')$q$,
  'CONTACT_OWNER_DISABLED');

reset role;
update public.platform_module_flags set allow_contact_owner = true where module_key = 'hotels';
set role authenticated;

select pg_temp.ok_raises('invalid channel is rejected',
  $q$select public.record_contact_click('listing-contact-text-001','sms')$q$,
  'INVALID_CHANNEL');

select public.record_contact_click('listing-contact-text-001','call');

select pg_temp.ok('click was recorded for that listing',
  (select count(*) from public.provider_contact_events
    where listing_id = 'listing-contact-text-001' and channel = 'call'
      and actor_user_id = '55555555-5555-5555-5555-555555555555') = 1);

select public.record_contact_click('listing-contact-text-001','whatsapp');

select pg_temp.ok('both channels are tracked separately',
  (select count(*) from public.provider_contact_events where listing_id = 'listing-contact-text-001') = 2);

reset role;

-- Anon must not be able to record events at all.
set role anon;
select pg_temp.ok_raises('anon cannot record a contact click',
  $q$select public.record_contact_click('listing-contact-text-001','call')$q$,
  'permission denied');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Privacy: guests must not read another owner's raw contact settings
-- ---------------------------------------------------------------------------

set test.uid = '55555555-5555-5555-5555-555555555555';
set role authenticated;

select pg_temp.ok('guest cannot read provider_contact_settings rows directly',
  (select count(*) from public.provider_contact_settings
    where listing_id = 'listing-contact-text-001') = 0);

reset role;

-- ---------------------------------------------------------------------------
-- 7. Existing protections still hold after 003
-- ---------------------------------------------------------------------------

select pg_temp.ok('stay allocation exclusion constraint still present',
  exists (
    select 1 from pg_constraint
     where conname = 'stay_allocations_no_overlap' and contype = 'x'
  ));

select pg_temp.ok('movie approval trigger still present',
  exists (
    select 1 from pg_trigger
     where tgname = 'trg_enforce_movie_booking_approval' and not tgisinternal
  ));

select 'done' as provider_contact_run;
