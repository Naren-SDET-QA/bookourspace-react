-- Owner-controlled Super Admin bootstrap checks. Runs only inside the
-- disposable local validation cluster as the database owner.
\set ON_ERROR_STOP on

alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;
alter table auth.users add column if not exists email_confirmed_at timestamptz;

insert into auth.users (
  id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at
) values
  ('b1000000-0000-4000-8000-000000000001', 'bootstrap-owner@example.test',
   '{"full_name":"Bootstrap Owner"}'::jsonb, '{"provider":"google"}'::jsonb, now()),
  ('b1000000-0000-4000-8000-000000000002', 'bootstrap-email@example.test',
   '{"full_name":"Email User"}'::jsonb, '{"provider":"email"}'::jsonb, now()),
  ('b1000000-0000-4000-8000-000000000003', 'bootstrap-unconfirmed@example.test',
   '{"full_name":"Unconfirmed User"}'::jsonb, '{"provider":"google"}'::jsonb, null)
on conflict (id) do update
  set raw_app_meta_data = excluded.raw_app_meta_data,
      email_confirmed_at = excluded.email_confirmed_at;

update public.profiles
   set role = 'customer', is_super_admin = false, account_status = 'active',
       verified = true, full_name = 'Bootstrap Owner'
 where id = 'b1000000-0000-4000-8000-000000000001';
update public.profiles
   set role = 'customer', is_super_admin = false, account_status = 'active',
       verified = true, full_name = 'Email User'
 where id = 'b1000000-0000-4000-8000-000000000002';
update public.profiles
   set role = 'customer', is_super_admin = false, account_status = 'active',
       verified = true, full_name = 'Unconfirmed User'
 where id = 'b1000000-0000-4000-8000-000000000003';

do $$
begin
  if has_function_privilege('anon', 'private.bootstrap_super_admin(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.bootstrap_super_admin(uuid,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'private.bootstrap_super_admin(uuid,text)', 'EXECUTE') then
    raise exception 'FAIL bootstrap_super_admin is executable by an application role';
  end if;
  raise notice 'PASS bootstrap is not executable by application roles';
end $$;

do $$
declare
  promoted record;
  audit_rows integer;
begin
  select * into promoted
    from private.bootstrap_super_admin(
      'b1000000-0000-4000-8000-000000000001',
      'Owner approval: BOOTSTRAP-TEST-001'
    );

  if promoted.role <> 'admin' or promoted.is_super_admin is not true then
    raise exception 'FAIL bootstrap did not grant Super Admin';
  end if;

  select count(*) into audit_rows
    from public.user_access_audit_events
   where target_user_id = 'b1000000-0000-4000-8000-000000000001'
     and action = 'bootstrap_grant'
     and actor_user_id is null
     and actor_type = 'database_owner'
     and actor_database_role = session_user::text
     and previous_role = 'customer'
     and new_role = 'admin'
     and previous_is_super_admin is false
     and new_is_super_admin is true
     and reason = 'Owner approval: BOOTSTRAP-TEST-001';
  if audit_rows <> 1 then
    raise exception 'FAIL bootstrap audit row was not written exactly once';
  end if;
  raise notice 'PASS owner bootstrap grants Super Admin and writes one audit row';
end $$;

do $$
begin
  begin
    perform * from private.bootstrap_super_admin(
      'b1000000-0000-4000-8000-000000000001',
      'Second bootstrap attempt'
    );
    raise exception 'FAIL a second bootstrap overwrote an existing Super Admin';
  exception when data_exception then
    if sqlerrm <> 'TARGET_ALREADY_SUPER_ADMIN' then raise; end if;
  end;

  if (select count(*) from public.user_access_audit_events
       where target_user_id = 'b1000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FAIL repeat bootstrap appended another audit row';
  end if;
  raise notice 'PASS an existing Super Admin cannot be bootstrapped again';
end $$;

do $$
begin
  begin
    perform * from private.bootstrap_super_admin(
      'b1000000-0000-4000-8000-000000000002',
      'Non-Google bootstrap attempt'
    );
    raise exception 'FAIL non-Google account was promoted';
  exception when insufficient_privilege then
    if sqlerrm <> 'TARGET_MUST_BE_VERIFIED_GOOGLE_AUTH_USER' then raise; end if;
    raise notice 'PASS non-Google account is refused';
  end;

  begin
    perform * from private.bootstrap_super_admin(
      'b1000000-0000-4000-8000-000000000003',
      'Unconfirmed Google bootstrap attempt'
    );
    raise exception 'FAIL email-unconfirmed Google account was promoted';
  exception when insufficient_privilege then
    if sqlerrm <> 'TARGET_MUST_BE_VERIFIED_GOOGLE_AUTH_USER' then raise; end if;
    raise notice 'PASS email-unconfirmed Google account is refused';
  end;
end $$;

do $$
begin
  begin
    update public.user_access_audit_events
       set reason = 'tampered'
     where target_user_id = 'b1000000-0000-4000-8000-000000000001';
    raise exception 'FAIL user-access audit accepted an update';
  exception when insufficient_privilege then
    if sqlerrm <> 'USER_ACCESS_AUDIT_APPEND_ONLY' then raise; end if;
  end;

  begin
    delete from public.user_access_audit_events
     where target_user_id = 'b1000000-0000-4000-8000-000000000001';
    raise exception 'FAIL user-access audit accepted a delete';
  exception when insufficient_privilege then
    if sqlerrm <> 'USER_ACCESS_AUDIT_APPEND_ONLY' then raise; end if;
  end;
  raise notice 'PASS user-access audit is append-only';
end $$;
