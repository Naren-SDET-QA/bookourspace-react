\set ON_ERROR_STOP 0
\set QUIET on
set client_min_messages to notice;

-- Live page configuration + 17 admin module settings persistence.
--
-- Run against a cluster that already has the baseline, every migration and the
-- Supabase-compatible auth stubs (auth.uid() reading test.uid). Proves schema,
-- grants, RLS, actor verification, versioning, rollback and audit immutability.

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
  if position(want in sqlerrm) > 0 then raise notice 'PASS  %', label;
  else raise notice 'FAIL  % (expected "%", got: %)', label, want, sqlerrm; end if;
end $$;

-- Super Admin, plain Admin and an ordinary customer.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'settings-super@example.test', '{}'::jsonb),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'settings-admin@example.test', '{}'::jsonb),
  ('cccccccc-3333-4333-8333-333333333333', 'settings-customer@example.test', '{}'::jsonb)
on conflict (id) do nothing;

update public.profiles set role = 'admin', is_super_admin = false, account_status = 'active'
 where id = 'bbbbbbbb-2222-4222-8222-222222222222';
update public.profiles set role = 'admin', is_super_admin = true, account_status = 'active'
 where id = 'aaaaaaaa-1111-4111-8111-111111111111';
update public.profiles set role = 'customer', is_super_admin = false, account_status = 'active'
 where id = 'cccccccc-3333-4333-8333-333333333333';

\echo '=== A. schema and privileges ==='
select pg_temp.ok('the admin module registry carries exactly the 17 console modules',
  (select count(*) = 17 from public.platform_admin_module_registry));
select pg_temp.ok('every console module key the server expects is registered',
  (select count(*) = 17 from public.platform_admin_module_registry
    where module_key in ('user_management','payment_management','ad_management',
      'analytics_performance','reports_analytics','theme_management','integrations',
      'data_management','announcements_status','dashboard','content_management',
      'listings_venues','bookings_events','feature_management','audit_logs',
      'notifications_mgmt','app_settings')));
select pg_temp.ok('module settings are not readable by anon',
  not has_table_privilege('anon', 'public.platform_admin_module_settings', 'select'));
select pg_temp.ok('module settings cannot be written directly by authenticated',
  not has_table_privilege('authenticated', 'public.platform_admin_module_settings', 'insert'));
select pg_temp.ok('browser roles cannot execute the settings RPC',
  not has_function_privilege('anon', 'public.platform_admin_save_module_settings(uuid,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_admin_save_module_settings(uuid,text,jsonb)', 'execute'));
select pg_temp.ok('browser roles cannot execute the live page RPCs',
  not has_function_privilege('anon', 'public.platform_live_page_save_draft(uuid,jsonb,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_live_page_publish(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_live_page_rollback(uuid,uuid)', 'execute'));

\echo '=== B. admin module settings ==='
select pg_temp.ok_raises('a customer cannot write module settings',
  $$select public.platform_admin_save_module_settings(
      'cccccccc-3333-4333-8333-333333333333'::uuid, 'feature_management', '{"a":1}'::jsonb)$$,
  'BUILDER_ADMIN_REQUIRED');

with saved as (
  select public.platform_admin_save_module_settings(
    'bbbbbbbb-2222-4222-8222-222222222222'::uuid, 'feature_management',
    '{"flags":{"movies":false}}'::jsonb) as row
)
select pg_temp.ok('an admin writes module settings (revision 1)',
  (select (row ->> 'revision')::int = 1 from saved));

with saved as (
  select public.platform_admin_save_module_settings(
    'bbbbbbbb-2222-4222-8222-222222222222'::uuid, 'feature_management',
    '{"flags":{"movies":false,"stayHolds":true}}'::jsonb) as row
)
select pg_temp.ok('a second write bumps the revision to 2',
  (select (row ->> 'revision')::int = 2 from saved));

select pg_temp.ok('the stored payload is the latest one',
  (select payload -> 'flags' ->> 'stayHolds' = 'true'
     from public.platform_admin_module_settings where module_key = 'feature_management'));

select pg_temp.ok_raises('an unregistered module key is refused',
  $$select public.platform_admin_save_module_settings(
      'bbbbbbbb-2222-4222-8222-222222222222'::uuid, 'not_a_module', '{}'::jsonb)$$,
  'ADMIN_MODULE_UNKNOWN');
select pg_temp.ok_raises('an oversized payload is refused',
  $$select public.platform_admin_save_module_settings(
      'bbbbbbbb-2222-4222-8222-222222222222'::uuid, 'feature_management',
      jsonb_build_object('blob', repeat('x', 300000)))$$,
  'ADMIN_MODULE_PAYLOAD_INVALID');

select pg_temp.ok('each module write is audited with the derived role',
  (select count(*) = 2 from public.platform_builder_audit
    where target_kind = 'settings' and target_key = 'feature_management' and actor_role = 'admin'));

\echo '=== C. live page configuration ==='
select pg_temp.ok_raises('a customer cannot save a live page draft',
  $$select public.platform_live_page_save_draft(
      'cccccccc-3333-4333-8333-333333333333'::uuid, '{"globalBrandName":"x"}'::jsonb, 'nope')$$,
  'BUILDER_ADMIN_REQUIRED');

select (public.platform_live_page_save_draft(
  'bbbbbbbb-2222-4222-8222-222222222222'::uuid,
  '{"globalBrandName":"BookOurSpace","globalTagline":"One"}'::jsonb, 'draft one') ->> 'version_number')::int as draft_one \gset
select pg_temp.ok('an admin saves draft version 1', :draft_one = 1);

select (public.platform_live_page_save_draft(
  'bbbbbbbb-2222-4222-8222-222222222222'::uuid,
  '{"globalBrandName":"BookOurSpace","globalTagline":"Two"}'::jsonb, 'draft two') ->> 'version_number')::int as draft_two \gset
-- Saving a new draft deletes the previous draft, so exactly one version exists.
select pg_temp.ok('a second draft replaces the first (exactly one draft remains)',
  :draft_two = 2
  and (select count(*) = 1 from public.platform_live_page_config where state = 'draft')
  and (select count(*) = 1 from public.platform_live_page_config));

select pg_temp.ok_raises('a plain admin cannot publish',
  $$select public.platform_live_page_publish('bbbbbbbb-2222-4222-8222-222222222222'::uuid, null)$$,
  'BUILDER_SUPER_ADMIN_REQUIRED');

select public.platform_live_page_publish(
  'aaaaaaaa-1111-4111-8111-111111111111'::uuid, null) ->> 'state' as published_state \gset
select pg_temp.ok('a Super Admin publishes the current draft',
  :'published_state' = 'published'
  and (select count(*) = 1 from public.platform_live_page_config where state = 'published'));

select id as published_v2 from public.platform_live_page_config where version_number = 2 \gset
select (public.platform_live_page_rollback(
  'aaaaaaaa-1111-4111-8111-111111111111'::uuid, :'published_v2') ->> 'version_number')::int as rolled_back \gset
-- Version 1 was replaced by the second draft, so the live history is v2 + the
-- rollback copy at v3.
select pg_temp.ok('rollback republishes the live version as version 3',
  :rolled_back = 3
  and (select count(*) = 2 from public.platform_live_page_config)
  and (select config ->> 'globalTagline' = 'Two' from public.platform_live_page_config
        where state = 'published' order by version_number desc limit 1));

select pg_temp.ok('rollback appends an audit row referencing the source version',
  (select count(*) = 1 from public.platform_builder_audit
    where action = 'live_page_rolled_back' and target_key = 'live_page_config'));

\echo '=== D. RLS and audit immutability ==='
-- The helper functions live in pg_temp, which the anon role cannot use, so the
-- probe records counts under the restricted role and asserts afterwards.
set role anon;
select count(*) as anon_rows,
       count(*) filter (where state = 'draft') as anon_drafts,
       count(*) filter (where state = 'published') as anon_published
  from public.platform_live_page_config \gset
reset role;

select pg_temp.ok('anonymous RLS sees published configuration only',
  :anon_published::int > 0 and :anon_drafts::int = 0);

select pg_temp.ok_raises('audit records cannot be updated',
  $$update public.platform_builder_audit set summary = 'tampered' where id = (select min(id) from public.platform_builder_audit)$$,
  'BUILDER_AUDIT_IMMUTABLE');
select pg_temp.ok_raises('audit records cannot be deleted',
  $$delete from public.platform_builder_audit where id = (select min(id) from public.platform_builder_audit)$$,
  'BUILDER_AUDIT_IMMUTABLE');

\echo '=== F. entity (module) rollback ==='
select (public.builder_save_entity_draft(
  'aaaaaaaa-1111-4111-8111-111111111111'::uuid, 'school_jobs',
  '{"key":"school_jobs","label":"School jobs","module":"jobs","permissions":{"read":"public","write":"admin"},"fields":[{"key":"title","type":"text"}]}'::jsonb,
  'module v1', null) ->> 'id') as entity_v1 \gset
select (public.builder_publish_entity(
  'aaaaaaaa-1111-4111-8111-111111111111'::uuid, 'school_jobs', :'entity_v1') ->> 'status') as entity_v1_status \gset
select pg_temp.ok('a module version publishes', :'entity_v1_status' = 'published');

select (public.builder_save_entity_draft(
  'aaaaaaaa-1111-4111-8111-111111111111'::uuid, 'school_jobs',
  '{"key":"school_jobs","label":"School jobs v2","module":"jobs","permissions":{"read":"public","write":"admin"},"fields":[{"key":"title","type":"text"},{"key":"salary","type":"number"}]}'::jsonb,
  'module v2', null) ->> 'id') as entity_v2 \gset
select public.builder_publish_entity(
  'aaaaaaaa-1111-4111-8111-111111111111'::uuid, 'school_jobs', :'entity_v2') \gset

select pg_temp.ok_raises('a plain admin cannot roll a module back',
  format('select public.builder_rollback_entity(%L::uuid, %L, %L::uuid)',
    'bbbbbbbb-2222-4222-8222-222222222222', 'school_jobs', :'entity_v1'),
  'BUILDER_SUPER_ADMIN_REQUIRED');

select (public.builder_rollback_entity(
  'aaaaaaaa-1111-4111-8111-111111111111'::uuid, 'school_jobs', :'entity_v1') ->> 'version_number')::int as entity_rb \gset
select pg_temp.ok('rollback publishes the restored schema as a new version',
  :entity_rb = 3
  and (select version.schema ->> 'label' = 'School jobs'
         from public.platform_entity_versions version
        where version.entity_key = 'school_jobs' and version.version_number = 3)
  and (select entity.current_version_id = (
           select version.id from public.platform_entity_versions version
            where version.entity_key = 'school_jobs' and version.version_number = 3)
         from public.platform_entities entity where entity.key = 'school_jobs'));
select pg_temp.ok('the module rollback is audited',
  (select count(*) = 1 from public.platform_builder_audit where action = 'entity_rolled_back'));

\echo '=== E. verdict ==='
