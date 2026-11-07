\set ON_ERROR_STOP 0
\set QUIET on
set client_min_messages to notice;

-- Live Edit audit trail: server-verified actor, role, action, version, summary,
-- append-only enforcement, RLS and restart persistence.
--
-- Run against a cluster that has the baseline plus every migration applied and
-- the Supabase-compatible auth stubs (auth.uid() reading test.uid).

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

create or replace function pg_temp.valid_config()
returns jsonb language sql immutable as $$
with pages(page_id) as (
  values ('pg_hostels'),('classes'),('venues'),('services'),('hotel_stay'),('movies')
)
select jsonb_build_object(
  'globalBrandName','BookOurSpace','globalTagline','Marketplace','globalAnnouncementBarText','',
  'globalSupportLink','https://bookourspace.example/support', 'domOverrides','{}'::jsonb,
  'pages',(select jsonb_object_agg(page_id,jsonb_build_object(
    'pageId',page_id,'pageName',page_id,'icon','🏠',
    'heroBanner',jsonb_build_object('visible',false,'badgeText','','headline','','subheadline','',
      'imageUrl','','ctaButtonText','','ctaButtonLinkOrAction','#listings-feed','secondaryButtonText','',
      'bgColorFrom','#ffffff','bgColorTo','#ffffff','textColor','#111111'),
    'labelsAndButtons',jsonb_build_object('pageHeadingTitle',page_id,'pageSubheading','',
      'primaryBookButtonLabel','Book','secondaryEnquireButtonLabel','Ask','filterButtonLabel','Filter',
      'postFreeListingButtonLabel','Post','emptyStateTitle','No listings','emptyStateSubtitle','',
      'promoRibbonText','','promoRibbonLink',''),
    'sections','[]'::jsonb,
    'colors',jsonb_build_object('primaryColor','#4338CA','accentColor','#10B981',
      'cardBorderColor','#E2E8F0','badgeBgColor','#EEF2FF','buttonRadius','rounded-xl'),
    'categories','[]'::jsonb,'formOptions','[]'::jsonb
  )) from pages)
)
$$;

-- A (publisher) and B (drafter) are active admins with distinct identities;
-- C is an ordinary customer.
insert into auth.users (id,email,raw_user_meta_data) values
 ('77777777-7777-4777-8777-777777777777','audit-admin-a@example.test','{}'::jsonb),
 ('88888888-8888-4888-8888-888888888888','audit-admin-b@example.test','{}'::jsonb),
 ('99999999-9999-4999-8999-999999999999','audit-customer@example.test','{}'::jsonb)
on conflict (id) do nothing;
update public.profiles set role='admin', account_status='active'
 where id in ('77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888');
update public.profiles set role='customer', account_status='active'
 where id='99999999-9999-4999-8999-999999999999';

-- ---------------------------------------------------------------- draft by B
set test.uid='88888888-8888-4888-8888-888888888888';
set role authenticated;
create temporary table audit_ids (kind text, id uuid, version_number bigint);
insert into audit_ids
select 'draft', (r->>'id')::uuid, (r->>'version_number')::bigint
from (select public.save_app_builder_config_draft(pg_temp.valid_config(),'draft saved by B') r) saved;
reset role;

select pg_temp.ok('draft save writes exactly one audit event',
  (select count(*) = 1 from public.app_builder_audit_events where version_id = (select id from audit_ids where kind='draft')));
select pg_temp.ok('draft audit action is save_draft',
  (select action = 'save_draft' from public.app_builder_audit_events where version_id = (select id from audit_ids where kind='draft')));
select pg_temp.ok('draft audit actor is the verified session user (B), not the client payload',
  (select actor_user_id = '88888888-8888-4888-8888-888888888888'
      and actor_source = 'session'
      and actor_role = 'admin'
      and actor_email = 'audit-admin-b@example.test'
   from public.app_builder_audit_events where version_id = (select id from audit_ids where kind='draft')));
select pg_temp.ok('draft audit records version number, summary and timestamp',
  (select version_number = (select version_number from audit_ids where kind='draft')
      and summary = 'draft saved by B'
      and created_at is not null
   from public.app_builder_audit_events where version_id = (select id from audit_ids where kind='draft')));

-- ------------------------------------------------- publish by A (different actor)
set test.uid='77777777-7777-4777-8777-777777777777';
set role authenticated;
insert into audit_ids
select 'published', (r->>'id')::uuid, (r->>'version_number')::bigint
from (select public.publish_app_builder_config_draft((select id from audit_ids where kind='draft')) r) published;
reset role;

select pg_temp.ok('publish writes its own audit event for the same version',
  (select count(*) = 1 from public.app_builder_audit_events
    where version_id = (select id from audit_ids where kind='published') and action = 'publish'));
select pg_temp.ok('publish audit actor is the publisher (A), not the drafter (B)',
  (select actor_user_id = '77777777-7777-4777-8777-777777777777'
      and actor_email = 'audit-admin-a@example.test'
   from public.app_builder_audit_events
   where version_id = (select id from audit_ids where kind='published') and action = 'publish'));

-- ------------------------------------------------------------------- rollback
set test.uid='77777777-7777-4777-8777-777777777777';
set role authenticated;
insert into audit_ids
select 'second_draft', (r->>'id')::uuid, (r->>'version_number')::bigint
from (select public.save_app_builder_config_draft(pg_temp.valid_config(),'second draft') r) saved;
insert into audit_ids
select 'rollback', (r->>'id')::uuid, (r->>'version_number')::bigint
from (select public.rollback_app_builder_config(
  (select id from audit_ids where kind='published'),'rolled back to first publication') r) restored;
reset role;

select pg_temp.ok('rollback writes a rollback audit event with its source version',
  (select action = 'rollback'
      and source_version_id = (select id from audit_ids where kind='published')
      and actor_user_id = '77777777-7777-4777-8777-777777777777'
      and summary = 'rolled back to first publication'
   from public.app_builder_audit_events where version_id = (select id from audit_ids where kind='rollback')));
select pg_temp.ok('version persistence is unchanged (3 versions, 2 published)',
  (select count(*) = 3 from public.platform_config_versions)
  and (select count(*) = 2 from public.platform_config_versions where status='published'));

-- ------------------------------------------------------- RBAC on reading audit
set test.uid='99999999-9999-4999-8999-999999999999';
set role authenticated;
select pg_temp.ok('customer cannot read any audit event',
  (select count(*) = 0 from public.app_builder_audit_events));
select pg_temp.ok_raises('customer cannot forge an audit event',
  $q$insert into public.app_builder_audit_events(config_key,version_id,version_number,action,
       actor_user_id,actor_role,actor_source,summary)
     values ('global','00000000-0000-4000-8000-000000000000',1,'publish',
       '99999999-9999-4999-8999-999999999999','admin','session','forged')$q$,
  'permission denied');
reset role;

set role anon;
select pg_temp.ok_raises('anon cannot read the audit trail', $q$select count(*) from public.app_builder_audit_events$q$, 'permission denied');
reset role;

-- ---------------------------------------------------- append-only enforcement
set test.uid='77777777-7777-4777-8777-777777777777';
set role authenticated;
select pg_temp.ok('active admin can read the full trail',
  (select count(*) = 4 from public.app_builder_audit_events));
-- No client write privilege exists at all, so an admin session is refused
-- before the guard trigger would even run.
select pg_temp.ok_raises('admin session cannot update an audit event',
  $q$update public.app_builder_audit_events set summary='rewritten' where true$q$,
  'permission denied');
select pg_temp.ok_raises('admin session cannot delete an audit event',
  $q$delete from public.app_builder_audit_events where true$q$,
  'permission denied');
reset role;
-- Defence in depth: even a privileged/table-owner statement is rejected by the
-- append-only guard trigger.
select pg_temp.ok_raises('privileged update is rejected by the append-only guard',
  $q$update public.app_builder_audit_events set summary='rewritten' where true$q$,
  'APP_BUILDER_AUDIT_APPEND_ONLY');
select pg_temp.ok_raises('privileged delete is rejected by the append-only guard',
  $q$delete from public.app_builder_audit_events where true$q$,
  'APP_BUILDER_AUDIT_APPEND_ONLY');

select pg_temp.ok('audit rows were not modified by the rejected statements',
  (select count(*) = 4 from public.app_builder_audit_events)
  and (select count(*) = 0 from public.app_builder_audit_events where summary = 'rewritten'));

select pg_temp.ok_raises('privileged truncate is rejected',
  $q$truncate public.app_builder_audit_events$q$,
  'APP_BUILDER_AUDIT_APPEND_ONLY');

-- ------------------------------------------------------- suspended admin loses read
reset role;
update public.profiles set account_status='suspended'
 where id='77777777-7777-4777-8777-777777777777';
set test.uid='77777777-7777-4777-8777-777777777777';
set role authenticated;
select pg_temp.ok('suspended admin cannot read the audit trail',
  (select count(*) = 0 from public.app_builder_audit_events));
reset role;
update public.profiles set account_status='active'
 where id='77777777-7777-4777-8777-777777777777';

-- ------------------------------------------------------------ restart snapshot
-- These rows must survive a cluster restart; the runner re-checks this count
-- after stopping and starting PostgreSQL.
create table if not exists public.audit_restart_probe (events bigint, actions text);
truncate public.audit_restart_probe;
insert into public.audit_restart_probe
select count(*), string_agg(action, ',' order by created_at)
from public.app_builder_audit_events;
select pg_temp.ok('restart probe captured the trail', (select events = 4 from public.audit_restart_probe));
