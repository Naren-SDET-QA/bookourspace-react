-- ============================================================================
-- Postcondition checks for the business-ownership and public-read migration set.
--
-- Run AFTER applying 20261111190000 … 20261112060000:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_pending_migrations.sql
--
-- Read-only catalog assertions. Raises (non-zero exit) on the first failure.
-- ============================================================================
\set ON_ERROR_STOP on

do $$
declare
  v_missing text := '';
  v_problem text := '';
begin
  -- 1. Tables created by phases 1 and 5, including the server-required
  --    member-scope table referenced by server.ts.
  select string_agg(name, ', ') into v_missing
    from unnest(array[
      'businesses','business_members','business_invitations','business_module_access',
      'business_member_access','business_audit_events','business_backfill_review',
      'business_ownership_transfers'
    ]) as name
   where to_regclass('public.' || name) is null;
  if v_missing <> '' then
    raise exception 'MISSING TABLES: %', v_missing;
  end if;
  raise notice 'PASS business tables exist (including business_member_access)';

  -- 2. business_id columns.
  select string_agg(want.t || '.' || want.c, ', ') into v_missing
    from (values
      ('listings','business_id'),('bookings','business_id'),('service_bookings','business_id'),
      ('stay_properties','business_id'),('venue_bookings','business_id'),('payment_intents','business_id'),
      ('pg_invoices','business_id'),('pg_payment_claims','business_id'),
      ('service_payment_intents','business_id'),('service_payment_claims','business_id'),
      ('venue_payment_intents','business_id'),('provider_contact_settings','business_id'),
      ('provider_registration_requests','business_id'),('enquiries','business_id'),
      ('reviews','business_id'),('media_assets','business_id'),
      ('service_provider_blackouts','business_id'),('service_provider_schedules','business_id'),
      ('service_provider_credentials','business_id')
    ) as want(t, c)
   where not exists (
     select 1 from information_schema.columns col
      where col.table_schema = 'public'
        and col.table_name = want.t
        and col.column_name = want.c
   );
  if v_missing <> '' then
    raise exception 'MISSING business_id COLUMNS: %', v_missing;
  end if;
  raise notice 'PASS all 19 business_id columns exist';

  -- 3. RLS on every business table.
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname like 'business%'
     and c.relkind = 'r'
     and not c.relrowsecurity;
  if v_missing <> '' then
    raise exception 'RLS DISABLED: %', v_missing;
  end if;
  raise notice 'PASS RLS is enabled on every business table';

  -- 4. Public read policies are role-split so anon never evaluates is_admin().
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'listings'
       and policyname = 'Anon reads publicly available listings'
       and 'anon' = any(roles)
  ) then
    raise exception 'MISSING anon listings policy';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'listings'
       and qual like '%is_admin%'
       and ('anon' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'listings policy applicable to anon still references is_admin()';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'venue_categories'
       and policyname = 'Anon reads active venue categories'
       and 'anon' = any(roles)
  ) then
    raise exception 'MISSING anon venue_categories policy';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'venue_categories'
       and policyname = 'Read active venue categories'
  ) then
    raise exception 'legacy venue_categories policy still present';
  end if;
  raise notice 'PASS public read policies are role-split';

  -- 5. Helper EXECUTE boundary.
  if has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') then
    raise exception 'anon can execute is_admin()';
  end if;
  if not has_function_privilege('anon', 'public.business_publicly_available(uuid)', 'EXECUTE') then
    raise exception 'anon cannot execute business_publicly_available()';
  end if;
  if not has_function_privilege('anon', 'public.can_access_business_module(uuid,text[])', 'EXECUTE') then
    raise exception 'anon cannot execute can_access_business_module()';
  end if;
  if has_function_privilege('authenticated', 'public.record_business_audit()', 'EXECUTE') then
    raise exception 'audit trigger helper is callable by authenticated';
  end if;
  if has_function_privilege('authenticated', 'public.record_business_transfer_audit()', 'EXECUTE') then
    raise exception 'transfer audit trigger helper is callable by authenticated';
  end if;
  raise notice 'PASS helper EXECUTE boundary is correct';

  -- 6. Storage upload policy.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and cmd = 'INSERT'
       and policyname = 'Booking parties upload private documents'
       and with_check like '%bos-private-documents%'
       and with_check like '%auth.uid%'
  ) then
    raise exception 'customer document upload policy missing or unscoped';
  end if;
  raise notice 'PASS storage upload policy is present and scoped';

  -- 7. Pinned search_path on every SECURITY DEFINER routine.
  select string_agg(p.oid::regprocedure::text, ', ') into v_problem
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg like 'search_path=%'
     );
  if v_problem <> '' then
    raise exception 'SECURITY DEFINER without pinned search_path: %', v_problem;
  end if;
  raise notice 'PASS every SECURITY DEFINER routine pins search_path';

  raise notice 'ALL PENDING-MIGRATION POSTCONDITIONS PASSED';
end $$;
