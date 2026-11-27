-- Run only against a disposable local database after the server-only
-- candidate migration is approved/applied. This test changes no rows.
begin;

do $$
declare
  role_name text;
begin
  if not (select relrowsecurity from pg_class where oid='public.business_backfill_review'::regclass) then
    raise exception 'FAIL business_backfill_review RLS must remain enabled';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='business_backfill_review') then
    raise exception 'FAIL unexpected direct-access policy on migration-only table';
  end if;

  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,'public.business_backfill_review','SELECT')
       or has_table_privilege(role_name,'public.business_backfill_review','INSERT')
       or has_table_privilege(role_name,'public.business_backfill_review','UPDATE')
       or has_table_privilege(role_name,'public.business_backfill_review','DELETE')
       or has_table_privilege(role_name,'public.business_backfill_review','TRUNCATE')
       or has_table_privilege(role_name,'public.business_backfill_review','REFERENCES')
       or has_table_privilege(role_name,'public.business_backfill_review','TRIGGER')
       or has_table_privilege(role_name,'public.business_backfill_review','MAINTAIN') then
      raise exception 'FAIL API role % retains a direct table privilege', role_name;
    end if;
  end loop;

  if not has_table_privilege('postgres','public.business_backfill_review','SELECT')
     or not has_table_privilege('postgres','public.business_backfill_review','INSERT') then
    raise exception 'FAIL migration owner lost required backfill access';
  end if;
  insert into public.business_backfill_review (table_name, record_id, reason)
  values ('__security_contract_test__', gen_random_uuid()::text, 'owner_insert_contract_test');
  if not exists (
    select 1 from public.business_backfill_review
    where table_name='__security_contract_test__' and reason='owner_insert_contract_test'
  ) then
    raise exception 'FAIL migration owner cannot write the review queue';
  end if;
  raise notice 'PASS anon/authenticated/service_role have no direct table access';
  raise notice 'PASS table owner retains required migration read/append access';
  raise notice 'PASS RLS remains enabled with no client policy';
end $$;

rollback;
