-- BookOurSpace DEV read-only verification pack
-- Target: ezrxykyocgbolpaebnqx  (single DEV project, no staging)
--
-- Run as a read-only principal, e.g.:
--   psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dev_readonly_catalog_checks.sql
-- Every statement is a bounded SELECT. Nothing here writes, and nothing here
-- assumes the tables already exist: the result of each check is evidence either way.
--
-- Current status: BLOCKED. The connected Supabase account gets HTTP 403 for this
-- project (project_admin_read / project_admin_write missing), so none of these
-- queries has been executed against DEV yet. They are prepared, not run.

\echo '=== 0. connection / identity ==='
select current_database() as database,
       current_user as connected_as,
       version() as server_version,
       now() as checked_at;

\echo '=== 1. application schema inventory (expect 47 tables after migration) ==='
select n.nspname as schema_name, count(*)::int as relations
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'v', 'm')
  and n.nspname not in ('pg_catalog', 'information_schema')
  and n.nspname not like 'pg\_%'
group by 1
order by 1;

\echo '=== 2. public tables (names only, bounded) ==='
select tablename
from pg_tables
where schemaname = 'public'
order by tablename
limit 200;

\echo '=== 3. the nine tables the app reported as 404 (expect present after migration) ==='
select c.relname as relation, c.relkind, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'listings', 'bookings', 'enquiries', 'transactions',
    'reviews', 'payments', 'refunds', 'audit_logs'
  )
order by c.relname;

\echo '=== 4. RLS posture: public tables without row level security (must be empty) ==='
select tablename
from pg_tables
where schemaname = 'public'
  and not rowsecurity
order by tablename;

\echo '=== 5. policy inventory (expect 103 policies after migration) ==='
select tablename, count(*)::int as policies
from pg_policies
where schemaname = 'public'
group by 1
order by 1;

\echo '=== 6. policies that are effectively open (no role and no predicate) ==='
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and coalesce(qual, 'true') = 'true'
  and coalesce(with_check, 'true') = 'true'
order by tablename, policyname
limit 100;

\echo '=== 7. table grants held by the browser roles (anon / authenticated) ==='
select table_schema, table_name, grantee, string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by 1, 2, 3
order by 2, 3
limit 300;

\echo '=== 8. write grants to anon (should be none on booking/payment tables) ==='
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
order by table_name, privilege_type;

\echo '=== 9. applied migration history (expect the 21 tracked files once approved) ==='
select version, name
from supabase_migrations.schema_migrations
order by version
limit 200;

\echo '=== 10. public functions and their volatility / definer posture ==='
select p.proname as function_name,
       p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname
limit 200;

\echo '=== 11. Data API exposed schemas (PostgREST setting, may be null) ==='
select current_setting('pgrst.db_schemas', true) as pgrst_db_schemas;

\echo '=== 12. storage buckets (expect 0 today) ==='
select id, name, public, created_at
from storage.buckets
order by created_at
limit 50;

\echo '=== 13. auth users present (production-user proof; needs service role) ==='
-- Uncomment only with a service-role connection. Never run this with a
-- publishable/anon connection and never export the result.
-- select count(*)::int as auth_users from auth.users;

\echo '=== 14. cross-tenant leak probe template (fill two real uuids) ==='
-- Run after migration with two seeded users A and B:
--   set local role authenticated;
--   set local request.jwt.claim.sub = '<uuid-A>';
--   select count(*) from public.bookings where owner_user_id = '<uuid-B>';  -- expect 0
