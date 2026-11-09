\set ON_ERROR_STOP on
-- ============================================================================
-- Local Security Advisor audit for the BookOurSpace schema.
--
-- Runs against a disposable local cluster that has the baseline schema plus
-- every migration applied. It never connects to Supabase and never reads a
-- credential.
--
-- Supabase's hosted advisor reports a superset of these checks (it also flags
-- dashboard-only settings such as leaked-password protection, which SQL cannot
-- see). This file covers every class that can be fixed by migration:
--
--   ERROR  rls_disabled                 table in public without RLS
--   ERROR  definer_mutable_search_path  SECURITY DEFINER without pinned path
--   WARN   security_definer_view        client-readable view runs as owner
--   WARN   anon_definer_execute         anon may execute a definer routine
--   WARN   extension_in_public          extension installed in public
--   WARN   always_true_policy           anon/authenticated policy is `true`
--
-- ERROR findings fail the run. WARN findings are printed for review so each one
-- is either accepted deliberately or fixed in a later migration.
-- ============================================================================

create temp table advisor_findings (
  severity text not null,
  code text not null,
  object text not null,
  detail text not null
) on commit preserve rows;

-- A. RLS enabled on every application table.
insert into advisor_findings
select 'ERROR', 'rls_disabled', format('%I.%I', n.nspname, c.relname),
       'row level security is not enabled'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind in ('r', 'p')
   and not c.relrowsecurity;

-- B. SECURITY DEFINER routines must not inherit a caller-controlled search_path.
insert into advisor_findings
select 'ERROR', 'definer_mutable_search_path', p.oid::regprocedure::text,
       'SECURITY DEFINER without a pinned search_path'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'private')
   and p.prosecdef
   and not exists (
     select 1
       from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
      where cfg like 'search_path=%'
   );

-- C. Views reachable by a client role should run with the caller's rights.
insert into advisor_findings
select 'WARN', 'security_definer_view', format('%I.%I', n.nspname, c.relname),
       'client-readable view does not set security_invoker=true'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
   and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%'
   and (has_table_privilege('anon', c.oid, 'SELECT')
        or has_table_privilege('authenticated', c.oid, 'SELECT'));

-- D. Anonymous callers on SECURITY DEFINER routines (intentional RPCs are
--    expected here; the list is reviewed rather than bulk-revoked).
insert into advisor_findings
select 'WARN', 'anon_definer_execute', p.oid::regprocedure::text,
       'anon can execute a SECURITY DEFINER routine'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and has_function_privilege('anon', p.oid, 'EXECUTE');

-- E. Extensions belong in a dedicated schema on hosted Supabase.
insert into advisor_findings
select 'WARN', 'extension_in_public', e.extname,
       format('extension installed in schema %I', n.nspname)
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
 where n.nspname = 'public';

-- F. Always-true policies on client-readable tables.
insert into advisor_findings
select 'WARN', 'always_true_policy',
       format('%I.%I.%I', pol.schemaname, pol.tablename, pol.policyname),
       'policy is always true for a client role'
  from pg_policies pol
 where pol.schemaname = 'public'
   and (pol.qual = 'true' or pol.with_check = 'true')
   and pol.roles && array['anon', 'authenticated', 'public']::name[];

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== security advisor classes ==='
select code, count(*) as findings
  from advisor_findings
 group by code
 order by code;

\echo ''
\echo '=== findings ==='
select severity, code, object, detail
  from advisor_findings
 order by severity, code, object;

\echo ''
do $$
declare
  errors integer;
  warnings integer;
begin
  select count(*) into errors from advisor_findings where severity = 'ERROR';
  select count(*) into warnings from advisor_findings where severity = 'WARN';
  raise notice 'security advisor audit: % blocking, % review', errors, warnings;
  if errors > 0 then
    raise exception 'SECURITY_ADVISOR_AUDIT_FAILED: % blocking finding(s)', errors;
  end if;
end $$;
\echo 'PASS security advisor audit: no blocking findings'
