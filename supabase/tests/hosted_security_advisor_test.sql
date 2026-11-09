\set ON_ERROR_STOP on
-- Assertions for the four pending advisor/builder migrations plus Super Admin
-- bootstrap audit and remaining SECURITY DEFINER hardening. Runs only inside a
-- disposable local cluster.

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'platform_component_registry'
       and policyname = 'Public reads builder component registry'
       and 'anon' = any(roles)
  ) then
    raise exception 'FAIL builder component registry has no anon SELECT policy';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'platform_field_types'
       and policyname = 'Public reads builder field types'
  ) then
    raise exception 'FAIL builder field types have no public SELECT policy';
  end if;
  if not exists (
    select 1 from pg_class
     where oid = 'public.platform_component_registry'::regclass and relrowsecurity
  ) or not exists (
    select 1 from pg_class
     where oid = 'public.platform_field_types'::regclass and relrowsecurity
  ) then
    raise exception 'FAIL builder registry tables do not have RLS enabled';
  end if;
  raise notice 'PASS Live Builder registry read policies exist for anon/authenticated';
end $$;

do $$
declare
  missing_path text;
begin
  select string_agg(p.proname, ',') into missing_path
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'enforce_service_booking_guard',
       'enforce_service_booking_payment_guard',
       'pg_invoice_json',
       'pg_dispute_json',
       'pg_claim_json',
       'handle_new_user',
       'is_admin',
       'is_active_user'
     )
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg(value)
        where cfg.value like 'search_path=%'
     );
  if missing_path is not null then
    raise exception 'FAIL functions missing pinned search_path: %', missing_path;
  end if;
  raise notice 'PASS advisor-corrected routines have a pinned search_path';
end $$;

do $$
begin
  if has_function_privilege('anon', 'public.hold_movie_seats_atomic(text,text,text,text[],text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.hold_movie_seats_atomic(text,text,text,text[],text,integer)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.hold_movie_seats_atomic(text,text,text,text[],text,integer)', 'EXECUTE') then
    raise exception 'FAIL Movies V1 seat-hold mutation remains callable';
  end if;
  if has_function_privilege('anon', 'public.sweep_expired_stay_holds()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sweep_expired_stay_holds()', 'EXECUTE')
     or has_function_privilege('anon', 'public.sweep_expired_payment_intents()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sweep_expired_payment_intents()', 'EXECUTE') then
    raise exception 'FAIL expiry sweepers remain client-callable';
  end if;
  if not has_function_privilege('service_role', 'public.sweep_expired_stay_holds()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.sweep_expired_payment_intents()', 'EXECUTE') then
    raise exception 'FAIL service_role lost sweeper execute';
  end if;
  raise notice 'PASS Movies seat-hold is denied and sweepers are service_role only';
end $$;

do $$
declare
  ext_schema text;
begin
  select n.nspname into ext_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'btree_gist';
  if ext_schema is distinct from 'extensions' then
    raise exception 'FAIL btree_gist remains in schema %', ext_schema;
  end if;
  raise notice 'PASS btree_gist lives in the extensions schema';
end $$;

do $$
declare
  invoker boolean;
begin
  select coalesce(reloptions::text like '%security_invoker=true%', false)
    into invoker
    from pg_class
   where oid = 'public.public_provider_profiles'::regclass;
  if invoker is not true then
    raise exception 'FAIL public_provider_profiles is not security_invoker';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception 'FAIL anon can read private profiles';
  end if;
  if not has_table_privilege('anon', 'public.public_provider_profile_projection', 'SELECT') then
    raise exception 'FAIL anon cannot read the public provider projection';
  end if;
  if has_table_privilege('anon', 'public.public_provider_profile_projection', 'INSERT')
     or has_table_privilege('authenticated', 'public.public_provider_profile_projection', 'UPDATE') then
    raise exception 'FAIL clients can write the public provider projection';
  end if;
  raise notice 'PASS public provider projection is invoker-security and read-only';
end $$;

do $$
declare
  uncovered integer;
begin
  select count(*) into uncovered
    from pg_constraint c
   where c.contype = 'f'
     and c.conrelid in (
       'public.platform_admin_module_settings'::regclass,
       'public.platform_entities'::regclass,
       'public.platform_entity_records'::regclass,
       'public.platform_entity_versions'::regclass,
       'public.platform_live_page_config'::regclass,
       'public.platform_page_versions'::regclass
     )
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indisvalid
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
     );
  if uncovered <> 0 then
    raise exception 'FAIL % Live Builder foreign keys still lack a leading index', uncovered;
  end if;
  raise notice 'PASS Live Builder foreign keys have leading indexes';
end $$;

do $$
declare
  leaked text;
begin
  select string_agg(n.nspname || '.' || p.proname, ',') into leaked
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosecdef
     and p.proname <> 'rls_auto_enable'
     and exists (
       select 1
         from aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
        where a.grantee = 0
          and a.privilege_type = 'EXECUTE'
     );
  if leaked is not null then
    raise exception 'FAIL PUBLIC still has EXECUTE on SECURITY DEFINER functions: %', leaked;
  end if;
  raise notice 'PASS PUBLIC cannot execute SECURITY DEFINER functions';
end $$;

do $$
begin
  if has_function_privilege('anon', 'private.bootstrap_super_admin(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.bootstrap_super_admin(uuid,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'private.bootstrap_super_admin(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'private.revoke_super_admin(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.revoke_super_admin(uuid,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'private.revoke_super_admin(uuid,text)', 'EXECUTE') then
    raise exception 'FAIL client or service_role can execute Super Admin bootstrap';
  end if;
  raise notice 'PASS Super Admin bootstrap EXECUTE is owner-only';
end $$;
