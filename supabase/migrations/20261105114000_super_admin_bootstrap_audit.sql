-- Owner-controlled Super Admin bootstrap with a durable audit row.
--
-- The application never assigns Super Admin. This routine is callable only by
-- the database owner (SQL Editor / postgres). Client roles have no EXECUTE.
-- Identity is the Auth UUID; Google provider and verified email are required.
-- Local-only candidate; do not apply to Mumbai without separate approval.
begin;

alter table public.user_access_audit_events
  add column if not exists previous_is_super_admin boolean not null default false;
alter table public.user_access_audit_events
  add column if not exists new_is_super_admin boolean not null default false;
-- A database-owner bootstrap has no authenticated app user as its actor. Keep
-- the actor identity truthful: record the SQL login role, and leave the Auth
-- actor UUID NULL instead of incorrectly recording the target as the actor.
alter table public.user_access_audit_events
  alter column actor_user_id drop not null;
alter table public.user_access_audit_events
  add column if not exists actor_type text not null default 'user';
alter table public.user_access_audit_events
  add column if not exists actor_database_role text;
alter table public.user_access_audit_events
  drop constraint if exists user_access_audit_events_actor_identity_check;
alter table public.user_access_audit_events
  add constraint user_access_audit_events_actor_identity_check
  check (
    (actor_type = 'user' and actor_user_id is not null and actor_database_role is null)
    or
    (actor_type = 'database_owner' and actor_user_id is null and actor_database_role is not null)
  );

alter table public.user_access_audit_events
  drop constraint if exists user_access_audit_events_action_check;
alter table public.user_access_audit_events
  add constraint user_access_audit_events_action_check
  check (action in (
    'promote', 'demote', 'set_provider', 'suspend', 'activate', 'block',
    'require_verification', 'verify', 'unverify',
    'bootstrap_grant', 'bootstrap_revoke'
  ));

create or replace function private.assert_owner_bootstrap_session()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER runs as the function owner, so current_user is not the
  -- caller. session_user is the login role. PostgREST uses authenticator;
  -- the SQL Editor uses postgres / supabase_admin.
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'BOOTSTRAP_OWNER_SQL_REQUIRED' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_owner_bootstrap_session() from public, anon, authenticated, service_role;

create or replace function private.assert_verified_google_auth_user(p_target_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_found boolean := false;
  v_email_confirmed boolean := false;
  v_google boolean := false;
  v_identity boolean := false;
begin
  if p_target_user_id is null
     or p_target_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'INVALID_AUTH_UUID' using errcode = '22023';
  end if;

  begin
    execute
      $q$
      select true,
             u.email_confirmed_at is not null,
             coalesce(u.raw_app_meta_data->>'provider', '') = 'google'
             or coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google'
        from auth.users u
       where u.id = $1
      $q$
      into v_found, v_email_confirmed, v_google
      using p_target_user_id;
  exception
    when undefined_column then
      raise exception 'AUTH_USERS_GOOGLE_COLUMNS_MISSING' using errcode = '42883';
  end;

  if coalesce(v_found, false) is not true
     or v_email_confirmed is not true
     or v_google is not true then
    if pg_catalog.to_regclass('auth.identities') is not null then
      execute
        $q$
        select exists (
          select 1 from auth.identities i
           where i.user_id = $1 and i.provider = 'google'
        )
        $q$
        into v_identity
        using p_target_user_id;
      v_google := coalesce(v_google, false) or coalesce(v_identity, false);
    end if;
  end if;

  if coalesce(v_found, false) is not true
     or v_email_confirmed is not true
     or v_google is not true then
    raise exception 'TARGET_MUST_BE_VERIFIED_GOOGLE_AUTH_USER' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_verified_google_auth_user(uuid) from public, anon, authenticated, service_role;

create or replace function private.bootstrap_super_admin(
  p_target_user_id uuid,
  p_reason text
)
returns table (
  id uuid,
  role text,
  account_status text,
  is_super_admin boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  old_role text;
  old_status text;
  old_verified boolean;
  old_super boolean;
begin
  perform private.assert_owner_bootstrap_session();
  perform private.assert_verified_google_auth_user(p_target_user_id);
  if p_reason is null or length(btrim(p_reason)) < 5 or length(p_reason) > 1000 then
    raise exception 'AUDIT_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into target from public.profiles where profiles.id = p_target_user_id for update;
  if not found then
    raise exception 'TARGET_PROFILE_MISSING_OR_INACTIVE' using errcode = 'P0002';
  end if;
  if target.account_status is distinct from 'active' then
    raise exception 'TARGET_PROFILE_MISSING_OR_INACTIVE' using errcode = 'P0002';
  end if;
  if coalesce(target.is_super_admin, false) then
    raise exception 'TARGET_ALREADY_SUPER_ADMIN' using errcode = '22023';
  end if;

  old_role := target.role;
  old_status := target.account_status;
  old_verified := target.verified;
  old_super := coalesce(target.is_super_admin, false);

  update public.profiles profile
     set role = 'admin',
         is_super_admin = true,
         updated_at = now()
   where profile.id = p_target_user_id
     and profile.account_status = 'active'
  returning profile.* into target;
  if not found then
    raise exception 'TARGET_PROFILE_MISSING_OR_INACTIVE' using errcode = 'P0002';
  end if;

  insert into public.user_access_audit_events (
    actor_user_id, actor_type, actor_database_role,
    target_user_id, action, previous_role, new_role,
    previous_account_status, new_account_status, previous_verified,
    new_verified, reason, previous_is_super_admin, new_is_super_admin
  ) values (
    null, 'database_owner', session_user::text,
    p_target_user_id, 'bootstrap_grant', old_role, target.role,
    old_status, target.account_status, old_verified, target.verified,
    btrim(p_reason), old_super, true
  );

  return query select target.id, target.role, target.account_status, target.is_super_admin;
end;
$$;
revoke all on function private.bootstrap_super_admin(uuid, text) from public, anon, authenticated, service_role;

create or replace function private.revoke_super_admin(
  p_target_user_id uuid,
  p_reason text
)
returns table (
  id uuid,
  role text,
  account_status text,
  is_super_admin boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  old_role text;
  old_status text;
  old_verified boolean;
  old_super boolean;
begin
  perform private.assert_owner_bootstrap_session();
  perform private.assert_verified_google_auth_user(p_target_user_id);
  if p_reason is null or length(btrim(p_reason)) < 5 or length(p_reason) > 1000 then
    raise exception 'AUDIT_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into target from public.profiles where profiles.id = p_target_user_id for update;
  if not found then
    raise exception 'TARGET_PROFILE_MISSING_OR_INACTIVE' using errcode = 'P0002';
  end if;
  if target.is_super_admin is not true then
    raise exception 'TARGET_IS_NOT_SUPER_ADMIN' using errcode = 'P0002';
  end if;

  old_role := target.role;
  old_status := target.account_status;
  old_verified := target.verified;
  old_super := true;

  update public.profiles profile
     set is_super_admin = false,
         updated_at = now()
   where profile.id = p_target_user_id
  returning profile.* into target;

  insert into public.user_access_audit_events (
    actor_user_id, actor_type, actor_database_role,
    target_user_id, action, previous_role, new_role,
    previous_account_status, new_account_status, previous_verified,
    new_verified, reason, previous_is_super_admin, new_is_super_admin
  ) values (
    null, 'database_owner', session_user::text,
    p_target_user_id, 'bootstrap_revoke', old_role, target.role,
    old_status, target.account_status, old_verified, target.verified,
    btrim(p_reason), old_super, false
  );

  return query select target.id, target.role, target.account_status, target.is_super_admin;
end;
$$;
revoke all on function private.revoke_super_admin(uuid, text) from public, anon, authenticated, service_role;

-- Role and bootstrap audit rows are evidence. Even the owner connection must
-- not rewrite or remove them; append a corrective event instead.
create or replace function private.guard_user_access_audit_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'USER_ACCESS_AUDIT_APPEND_ONLY' using errcode = '42501';
end;
$$;
revoke all on function private.guard_user_access_audit_immutable()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_user_access_audit_immutable
  on public.user_access_audit_events;
create trigger guard_user_access_audit_immutable
  before update or delete on public.user_access_audit_events
  for each row execute function private.guard_user_access_audit_immutable();

commit;
