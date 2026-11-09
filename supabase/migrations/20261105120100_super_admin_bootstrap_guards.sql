-- Guards for the owner-only Super Admin bootstrap from 20261105114000.
--
-- Two failure modes are closed here:
--   1. bootstrap_super_admin() had no already-Super-Admin check, so re-running
--      it appended duplicate bootstrap_grant audit rows.
--   2. revoke_super_admin() could remove the last active Super Admin and lock
--      the owner out of every Super-Admin-only operation.
--
-- Signatures, return shapes, owner-session check and audit writes are unchanged.
-- Forward-only; local candidate pending separate Mumbai approval.
begin;

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
  remaining integer;
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

  select count(*) into remaining
    from public.profiles profile
   where profile.is_super_admin is true
     and profile.account_status = 'active'
     and profile.id <> p_target_user_id;
  if remaining = 0 then
    raise exception 'LAST_SUPER_ADMIN_CANNOT_BE_REVOKED' using errcode = '42501';
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

commit;
