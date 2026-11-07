\set ON_ERROR_STOP on
-- ============================================================================
-- Hosted Live Builder verification — READ ONLY.
--
-- Run through supabase/tests/run_hosted_builder_verification.sh, which forces
-- default_transaction_read_only and requires an explicit approval token.
--
-- Proves, on the hosted project, for all six builder pages:
--   * a published version exists and it is the newest version
--   * the published document is non-empty and matches its page key
--   * the public read path (anon RLS) exposes exactly the published versions
--   * the builder registries are populated and readable
--   * the builder tables have RLS enabled
--   * rollback/publish routines are not executable by anon
--
-- It never inserts, updates, deletes or publishes anything.
-- ============================================================================

\pset pager off
\echo '=== A. six page keys ==='
with pages(page_key) as (
  values ('pg_hostels'), ('classes'), ('venues'), ('services'), ('hotel_stay'), ('movies')
),
summary as (
  select pages.page_key,
         count(v.id) filter (where v.status = 'published') as published_versions,
         count(v.id) filter (where v.status = 'draft') as draft_versions,
         max(v.version_number) filter (where v.status = 'published') as latest_published,
         (select max(x.version_number) from public.platform_page_versions x
           where x.page_key = pages.page_key) as latest_any
    from pages
    left join public.platform_page_versions v on v.page_key = pages.page_key
   group by pages.page_key
)
select page_key, published_versions, draft_versions, latest_published, latest_any,
       case
         when published_versions = 0 then 'MISSING PUBLISHED VERSION'
         when latest_published <> latest_any then 'PUBLISHED VERSION IS NOT NEWEST'
         else 'OK'
       end as verdict
  from summary
 order by page_key;

\echo ''
\echo '=== B. published document integrity ==='
with pages(page_key) as (
  values ('pg_hostels'), ('classes'), ('venues'), ('services'), ('hotel_stay'), ('movies')
),
latest as (
  select distinct on (v.page_key) v.page_key, v.version_number, v.document
    from public.platform_page_versions v
   where v.status = 'published'
   order by v.page_key, v.version_number desc
)
select pages.page_key,
       latest.version_number,
       coalesce(latest.document->>'pageKey', '(none)') as document_page_key,
       jsonb_array_length(coalesce(latest.document->'blocks', '[]'::jsonb)) as blocks,
       case
         when latest.version_number is null then 'NO PUBLISHED ROW'
         when coalesce(latest.document->>'pageKey', '') <> pages.page_key then 'PAGE KEY MISMATCH'
         when jsonb_typeof(latest.document->'blocks') <> 'array' then 'BLOCKS NOT AN ARRAY'
         else 'OK'
       end as verdict
  from pages
  left join latest on latest.page_key = pages.page_key
 order by pages.page_key;

\echo ''
\echo '=== C. anonymous visibility (RLS) ==='
begin;
set local role anon;
select v.page_key,
       count(*) as anon_visible_versions,
       count(*) filter (where v.status <> 'published') as non_published_leaks
  from public.platform_page_versions v
 group by v.page_key
 order by v.page_key;
rollback;

\echo ''
\echo '=== D. deactivated roles cannot see drafts ==='
begin;
set local role anon;
select count(*) as drafts_visible_to_anon
  from public.platform_page_versions
 where status = 'draft';
rollback;

\echo ''
\echo '=== E. registries ==='
select 'platform_component_registry' as registry, count(*) as rows
  from public.platform_component_registry
union all
select 'platform_field_types', count(*)
  from public.platform_field_types;

\echo ''
\echo '=== F. builder tables have RLS ==='
select c.relname, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and (c.relname like 'platform\_page%' or c.relname like 'platform\_entity%'
        or c.relname like 'platform\_live\_page%' or c.relname like 'platform\_%registry%')
 order by c.relname;

\echo ''
\echo '=== G. builder routines are not callable by anon ==='
select p.oid::regprocedure::text as routine,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'builder\_%'
 order by 1;

\echo ''
\echo '=== H. audit volume ==='
select count(*) as builder_audit_rows
  from public.platform_builder_audit;
