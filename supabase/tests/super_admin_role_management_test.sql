\set ON_ERROR_STOP on
-- Runs only in the disposable local validation cluster as the database owner.
do $$
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    ('11111111-1111-4111-8111-111111111111', 'bootstrap-fixture@example.test', '{}'::jsonb),
    ('22222222-2222-4222-8222-222222222222', 'target-fixture@example.test', '{}'::jsonb)
  on conflict (id) do nothing;
  update public.profiles set role='admin', is_super_admin=true
   where id='11111111-1111-4111-8111-111111111111';
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
begin
  if not public.is_current_user_admin() or not public.is_current_user_super_admin() then
    raise exception 'FAIL: active Super Admin database predicates did not resolve';
  end if;
  if has_table_privilege('authenticated', 'public.user_access_audit_events', 'SELECT') then
    raise exception 'FAIL: authenticated clients can read private user-access audit rows';
  end if;
  raise notice 'PASS: current database admin scopes resolve and direct audit reads remain revoked';
end $$;
do $$
declare result_role text;
begin
  select role into result_role from public.manage_user_access(
    '22222222-2222-4222-8222-222222222222', 'promote', 'approved by security review'
  );
  if result_role <> 'admin' then raise exception 'FAIL: expected target admin role'; end if;
  raise notice 'PASS: verified Super Admin can promote another user';
end $$;
do $$
begin
  perform * from public.manage_user_access(
    '11111111-1111-4111-8111-111111111111', 'promote', 'self promotion attempt'
  );
  raise exception 'FAIL: self-promotion was accepted';
exception when insufficient_privilege then
  raise notice 'PASS: self-promotion is rejected';
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
begin
  perform * from public.manage_user_access(
    '11111111-1111-4111-8111-111111111111', 'demote', 'customer privilege attack'
  );
  raise exception 'FAIL: ordinary Admin/customer was accepted';
exception when insufficient_privilege then
  raise notice 'PASS: ordinary account cannot manage roles';
end $$;
rollback;

do $$
declare role_after text; audit_rows integer;
begin
  select role into role_after from public.profiles where id='22222222-2222-4222-8222-222222222222';
  select count(*) into audit_rows from public.user_access_audit_events
   where actor_user_id='11111111-1111-4111-8111-111111111111'
     and target_user_id='22222222-2222-4222-8222-222222222222'
     and action='promote'
     and previous_role='customer' and new_role='admin'
     and previous_account_status='active' and new_account_status='active'
     and previous_verified=true and new_verified=true
     and reason='approved by security review' and created_at <= now();
  if role_after <> 'admin' or audit_rows <> 1 then raise exception 'FAIL: role/audit transaction mismatch'; end if;
  raise notice 'PASS: role and actor/target/reason/timestamp audit committed together';
end $$;
