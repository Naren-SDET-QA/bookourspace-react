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

insert into auth.users (id,email) values
 ('55555555-5555-5555-5555-555555555555','builder-admin@example.test'),
 ('66666666-6666-6666-6666-666666666666','builder-guest@example.test')
on conflict (id) do nothing;
update public.profiles set role='admin', account_status='active'
 where id='55555555-5555-5555-5555-555555555555';
update public.profiles set role='customer', account_status='active'
 where id='66666666-6666-6666-6666-666666666666';

select pg_temp.ok('allowlisted App Builder config validates', public.is_valid_app_builder_config(pg_temp.valid_config()));
select pg_temp.ok('unrecognized executable/action field is rejected', not public.is_valid_app_builder_config(
  pg_temp.valid_config() || jsonb_build_object('arbitraryAction','javascript:alert(1)')));

set test.uid='66666666-6666-6666-6666-666666666666';
set role authenticated;
select pg_temp.ok_raises('non-admin cannot save App Builder draft',
  $q$select public.save_app_builder_config_draft(pg_temp.valid_config(),'guest draft')$q$,
  'APP_CONFIG_ADMIN_REQUIRED');
select pg_temp.ok('guest cannot read private drafts',
  (select count(*) from public.platform_config_versions where status='draft')=0);
reset role;

set test.uid='55555555-5555-5555-5555-555555555555';
set role authenticated;
create temporary table app_builder_test_versions (kind text, id uuid, version_number bigint);
select pg_temp.ok_raises('database rejects invalid config inserted outside the RPC',
  $q$insert into public.platform_config_versions(config_key,version_number,status,config,summary,created_by)
     values ('global',999,'draft',pg_temp.valid_config()||jsonb_build_object('arbitraryAction','javascript:alert(1)'),
       'invalid direct insert',auth.uid())$q$,
  'APP_CONFIG_VERSION_INVALID');
insert into app_builder_test_versions
select 'first', (r->>'id')::uuid, (r->>'version_number')::bigint
from (select public.save_app_builder_config_draft(pg_temp.valid_config(),'first draft') r) saved;
select pg_temp.ok('active admin creates an isolated draft',
  (select status='draft' and created_by=auth.uid() from public.platform_config_versions where id=(select id from app_builder_test_versions where kind='first')));
insert into app_builder_test_versions
select 'first_published', (r->>'id')::uuid, (r->>'version_number')::bigint
from (select public.publish_app_builder_config_draft((select id from app_builder_test_versions where kind='first')) r) published;
reset role;
set role anon;
select pg_temp.ok('customer session can read published configuration',
  (select count(*)=1 from public.platform_config_versions where status='published'));
reset role;
set test.uid='55555555-5555-5555-5555-555555555555';
set role authenticated;
select pg_temp.ok('active admin publishes the saved version',
  (select status='published' and published_at is not null from public.platform_config_versions where id=(select id from app_builder_test_versions where kind='first_published')));
insert into app_builder_test_versions
select 'second_draft', (r->>'id')::uuid, (r->>'version_number')::bigint
from (select public.save_app_builder_config_draft(pg_temp.valid_config(),'second draft') r) saved;
reset role;
set role anon;
select pg_temp.ok('customer sees only published config while a newer draft exists',
  (select count(*) = 1 from public.platform_config_versions)
  and (select bool_and(status = 'published') from public.platform_config_versions));
reset role;
set test.uid='55555555-5555-5555-5555-555555555555';
set role authenticated;
insert into app_builder_test_versions
select 'rollback', (r->>'id')::uuid, (r->>'version_number')::bigint
from (select public.rollback_app_builder_config((select id from app_builder_test_versions where kind='first_published'),'rollback') r) restored;
select pg_temp.ok('rollback creates a new published history version',
  (select status='published' and source_version_id=(select id from app_builder_test_versions where kind='first_published')
    and version_number > (select version_number from app_builder_test_versions where kind='first_published')
   from public.platform_config_versions where id=(select id from app_builder_test_versions where kind='rollback')));
select pg_temp.ok('rollback keeps the old version and supersedes the draft',
  (select count(*)=2 from public.platform_config_versions where status='published')
  and (select status='superseded_draft' from public.platform_config_versions where id=(select id from app_builder_test_versions where kind='second_draft')));
select pg_temp.ok('active admin reads persisted version history',
  (select count(*)=3 from public.platform_config_versions));
update public.platform_config_versions set summary='tampered'
 where id=(select id from app_builder_test_versions where kind='first_published');
select pg_temp.ok('published version contents are immutable',
  (select summary='first draft' from public.platform_config_versions where id=(select id from app_builder_test_versions where kind='first_published')));

reset role;
update public.profiles set account_status='suspended'
 where id='55555555-5555-5555-5555-555555555555';
set test.uid='55555555-5555-5555-5555-555555555555';
set role authenticated;
select pg_temp.ok_raises('suspended admin cannot publish configuration',
  $q$select public.publish_app_builder_config_draft((select id from public.platform_config_versions where status='draft'))$q$,
  'APP_CONFIG_ADMIN_REQUIRED');
reset role;
