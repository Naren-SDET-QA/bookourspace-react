-- Runs only in the disposable local PostgreSQL 17 validation cluster.
-- Confirms client roles cannot invoke server-trust RPCs and that every
-- authenticated SECURITY DEFINER path uses an explicit safe search_path.
\set ON_ERROR_STOP on

do $$
declare
  v_name text;
  v_path text;
  v_unsafe text[] := array[]::text[];
begin
  if has_function_privilege('anon', 'public.create_booking_atomic(text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,text[],text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.create_booking_atomic(text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,text[],text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.create_booking_atomic(text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,text[],text,text,text)', 'EXECUTE') then
    raise exception 'FAIL create_booking_atomic is not service-role-only';
  end if;
  if has_function_privilege('authenticated', 'public.stay_hold_units(uuid,date,date,integer,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.stay_hold_units(uuid,date,date,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL stay_hold_units is not service-role-only';
  end if;
  if has_function_privilege('authenticated', 'public.stay_cancel_allocation(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.stay_cancel_allocation(uuid)', 'EXECUTE') then
    raise exception 'FAIL stay_cancel_allocation is not service-role-only';
  end if;
  if has_function_privilege('authenticated', 'public.create_service_payment_intent(uuid,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.create_service_payment_intent(uuid,text,text,text)', 'EXECUTE') then
    raise exception 'FAIL create_service_payment_intent is not service-role-only';
  end if;
  if has_function_privilege('authenticated', 'public.create_stay_checkout(text,uuid,date,date,integer,text,text,text,text,jsonb,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.create_stay_checkout(text,uuid,date,date,integer,text,text,text,text,jsonb,text,text,text)', 'EXECUTE') then
    raise exception 'FAIL create_stay_checkout is not service-role-only';
  end if;
  if has_function_privilege('authenticated', 'public.pg_create_payment_intent(text,text,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.pg_create_payment_intent(text,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'FAIL pg_create_payment_intent is not service-role-only';
  end if;
  if has_function_privilege('authenticated', 'public.record_live_edit_cinema_audit(text,text,text,text[],jsonb,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.record_live_edit_cinema_audit(text,text,text,text[],jsonb,jsonb)', 'EXECUTE') then
    raise exception 'FAIL record_live_edit_cinema_audit is not service-role-only';
  end if;
  if has_function_privilege('authenticated', 'public.finalize_media_asset(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.finalize_media_asset(uuid)', 'EXECUTE') then
    raise exception 'FAIL finalize_media_asset is not service-role-only';
  end if;
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public' and c.relname='bookings'
      and t.tgname='enforce_stay_checkout_publicability'
  ) then
    raise exception 'FAIL stay checkout publication guard trigger is missing';
  end if;
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public' and c.relname='pg_invoices'
      and t.tgname='reject_unverified_pg_invoice_tax'
  ) then
    raise exception 'FAIL unverified GST invoice guard trigger is missing';
  end if;

  insert into auth.users (id,email,raw_user_meta_data)
  values ('f7000000-0000-4000-8000-000000000051','rpc-audit-admin@example.test','{}')
  on conflict (id) do nothing;
  update public.profiles set role='admin',account_status='active',is_super_admin=false
   where id='f7000000-0000-4000-8000-000000000051';
  begin
    insert into public.pg_admin_audit (actor,actor_role,action,reason,detail)
    values ('f7000000-0000-4000-8000-000000000051','admin','fee_waived','test direct audit guard',
            '{"waivedPaise":100}'::jsonb);
    raise exception 'FAIL ordinary Admin can persist a fee waiver audit action';
  exception when insufficient_privilege then
    if sqlerrm <> 'SUPER_ADMIN_REQUIRED' then raise; end if;
  end;
  begin
    insert into public.pg_admin_audit (actor,actor_role,action,reason,detail)
    values ('f7000000-0000-4000-8000-000000000051','admin','refund_approved','test direct audit guard',
            '{"refundApprovedPaise":100}'::jsonb);
    raise exception 'FAIL ordinary Admin can persist a refund approval audit action';
  exception when insufficient_privilege then
    if sqlerrm <> 'SUPER_ADMIN_REQUIRED' then raise; end if;
  end;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='pg_admin_audit'
      and t.tgname='enforce_pg_financial_action_super_admin'
  ) then
    raise exception 'FAIL Super Admin financial audit boundary is missing';
  end if;

  for v_name, v_path in
    select p.proname,
           coalesce((select split_part(setting, '=', 2) from unnest(p.proconfig) setting where setting like 'search_path=%' limit 1), '')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prosecdef
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    if v_path = '' or (v_path <> '""' and (v_path not like 'pg_catalog,%' or v_path not like '%pg_temp')) then
      v_unsafe := array_append(v_unsafe, v_name || ':' || v_path);
    end if;
  end loop;
  if cardinality(v_unsafe) > 0 then
    raise exception 'FAIL unsafe SECURITY DEFINER search_path: %', array_to_string(v_unsafe, '; ');
  end if;
  raise notice 'PASS client roles are denied trusted booking/payment/media/audit RPCs; authenticated SECURITY DEFINER search_path and stay publication trigger verified';
end $$;

-- Assert the full trusted-server boundary for both client roles, and retain
-- service_role execution for the verified HTTP server flows.
do $$
declare
  v_rpc regprocedure;
  v_rpc_name text;
  v_rpcs text[] := array[
    'public.create_booking_atomic(text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,text[],text,text,text)',
    'public.create_service_payment_intent(uuid,text,text,text)',
    'public.create_stay_checkout(text,uuid,date,date,integer,text,text,text,text,jsonb,text,text,text)',
    'public.pg_create_payment_intent(text,text,text,text,text,text)',
    'public.stay_hold_units(uuid,date,date,integer,integer)',
    'public.stay_cancel_allocation(uuid)',
    'public.record_live_edit_cinema_audit(text,text,text,text[],jsonb,jsonb)',
    'public.finalize_media_asset(uuid)'
  ];
begin
  foreach v_rpc_name in array v_rpcs loop
    v_rpc := v_rpc_name::regprocedure;
    if has_function_privilege('anon', v_rpc, 'EXECUTE')
       or has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
      raise exception 'FAIL client role can directly execute trusted RPC %', v_rpc;
    end if;
    if not has_function_privilege('service_role', v_rpc, 'EXECUTE') then
      raise exception 'FAIL service_role cannot execute trusted RPC %', v_rpc;
    end if;
  end loop;
  raise notice 'PASS anon/authenticated denied and service_role retained on all eight trusted RPCs';
end $$;
