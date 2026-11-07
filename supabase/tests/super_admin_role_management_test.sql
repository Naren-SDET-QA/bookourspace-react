\set ON_ERROR_STOP on
-- Runs only in the disposable local validation cluster as the database owner.
do $$
begin
  -- This runs only in the throwaway local database. Other security suites may
  -- have left additional Super Admin fixtures; isolate the last-admin guard.
  update public.profiles set is_super_admin = false
   where id <> '11111111-1111-4111-8111-111111111111'
     and is_super_admin is true;
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

-- Owner-controlled bootstrap: Google Auth UUID, owner session, durable audit.
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;

insert into auth.users(id, email, raw_user_meta_data, email_confirmed_at, raw_app_meta_data) values
  ('33333333-3333-4333-8333-333333333333', 'google-owner@example.test', '{}'::jsonb, now(), '{"provider":"google","providers":["google"]}'::jsonb),
  ('44444444-4444-4444-8444-444444444444', 'password-user@example.test', '{}'::jsonb, now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('55555555-5555-4555-8555-555555555555', 'unverified-google@example.test', '{}'::jsonb, null, '{"provider":"google","providers":["google"]}'::jsonb)
on conflict (id) do update
   set email_confirmed_at = excluded.email_confirmed_at,
       raw_app_meta_data = excluded.raw_app_meta_data;
update public.profiles
   set role = 'customer', account_status = 'active', is_super_admin = false
 where id in (
   '33333333-3333-4333-8333-333333333333',
   '44444444-4444-4444-8444-444444444444',
   '55555555-5555-4555-8555-555555555555'
 );

do $$
begin
  begin
    perform * from private.bootstrap_super_admin(
      '44444444-4444-4444-8444-444444444444',
      'Owner approval reference: non-google'
    );
    raise exception 'FAIL: non-Google Auth UUID was bootstrapped';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%TARGET_MUST_BE_VERIFIED_GOOGLE_AUTH_USER%' then raise; end if;
      raise notice 'PASS: bootstrap rejects a non-Google Auth UUID';
  end;

  begin
    perform * from private.bootstrap_super_admin(
      '55555555-5555-4555-8555-555555555555',
      'Owner approval reference: unverified'
    );
    raise exception 'FAIL: unverified Google Auth UUID was bootstrapped';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%TARGET_MUST_BE_VERIFIED_GOOGLE_AUTH_USER%' then raise; end if;
      raise notice 'PASS: bootstrap rejects an unverified Google Auth UUID';
  end;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
begin
  begin
    perform * from private.bootstrap_super_admin(
      '33333333-3333-4333-8333-333333333333',
      'Owner approval reference: client attack'
    );
    raise exception 'FAIL: authenticated session executed bootstrap';
  exception
    when insufficient_privilege then
      raise notice 'PASS: authenticated clients cannot execute Super Admin bootstrap';
  end;
end $$;
rollback;

do $$
declare
  granted boolean;
  audit_rows integer;
begin
  select is_super_admin into granted
    from private.bootstrap_super_admin(
      '33333333-3333-4333-8333-333333333333',
      'Owner approval reference: local-bootstrap-test'
    );
  if granted is not true then
    raise exception 'FAIL: verified Google Auth UUID was not granted Super Admin';
  end if;
  select count(*) into audit_rows
    from public.user_access_audit_events
   where target_user_id = '33333333-3333-4333-8333-333333333333'
     and action = 'bootstrap_grant'
     and actor_user_id is null
     and actor_type = 'database_owner'
     and actor_database_role = session_user::text
     and previous_is_super_admin is false
     and new_is_super_admin is true
     and new_role = 'admin'
     and reason = 'Owner approval reference: local-bootstrap-test';
  if audit_rows <> 1 then
    raise exception 'FAIL: bootstrap grant did not write a durable audit row';
  end if;
  raise notice 'PASS: owner bootstrap grants Super Admin and writes bootstrap_grant audit';

  begin
    perform * from private.bootstrap_super_admin(
      '33333333-3333-4333-8333-333333333333',
      'Owner approval reference: duplicate-grant'
    );
    raise exception 'FAIL: duplicate bootstrap grant was accepted';
  exception
    when others then
      if sqlerrm not like '%TARGET_ALREADY_SUPER_ADMIN%' then raise; end if;
      raise notice 'PASS: bootstrap refuses a duplicate Super Admin grant';
  end;

  update public.profiles set is_super_admin = false
   where id = '11111111-1111-4111-8111-111111111111';
  begin
    perform * from private.revoke_super_admin(
      '33333333-3333-4333-8333-333333333333',
      'Owner approval reference: last-admin'
    );
    raise exception 'FAIL: the last Super Admin was revoked';
  exception
    when others then
      if sqlerrm not like '%LAST_SUPER_ADMIN_CANNOT_BE_REVOKED%' then raise; end if;
      raise notice 'PASS: owner cannot revoke the last remaining Super Admin';
  end;
  update public.profiles set is_super_admin = true
   where id = '11111111-1111-4111-8111-111111111111';
end $$;

do $$
declare
  remaining boolean;
  audit_rows integer;
begin
  select is_super_admin into remaining
    from private.revoke_super_admin(
      '33333333-3333-4333-8333-333333333333',
      'Owner approval reference: local-revoke-test'
    );
  if remaining is not false then
    raise exception 'FAIL: Super Admin flag remained after owner revoke';
  end if;
  select count(*) into audit_rows
    from public.user_access_audit_events
   where target_user_id = '33333333-3333-4333-8333-333333333333'
     and action = 'bootstrap_revoke'
     and actor_user_id is null
     and actor_type = 'database_owner'
     and actor_database_role = session_user::text
     and previous_is_super_admin is true
     and new_is_super_admin is false
     and reason = 'Owner approval reference: local-revoke-test';
  if audit_rows <> 1 then
    raise exception 'FAIL: bootstrap revoke did not write a durable audit row';
  end if;
  raise notice 'PASS: owner revoke clears Super Admin and writes bootstrap_revoke audit';
end $$;
