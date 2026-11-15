-- Super Admin access is an explicit database authority, provisioned only by
-- the documented owner-controlled bootstrap process. User changes and their
-- audit records are committed in one transaction.
begin;

alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

create or replace function private.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
      and profile.account_status = 'active'
  );
$$;
revoke all on function private.is_current_user_admin() from public, anon;
grant execute on function private.is_current_user_admin() to authenticated;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_current_user_admin(); $$;
revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

create table if not exists public.user_access_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  action text not null,
  previous_role text not null,
  new_role text not null,
  previous_account_status text not null,
  new_account_status text not null,
  previous_verified boolean not null,
  new_verified boolean not null,
  reason text not null check (length(btrim(reason)) >= 5),
  created_at timestamptz not null default now()
);

alter table public.user_access_audit_events
  drop constraint if exists user_access_audit_events_action_check;
alter table public.user_access_audit_events
  add constraint user_access_audit_events_action_check
  check (action in ('promote', 'demote', 'set_provider', 'suspend', 'activate', 'block', 'require_verification', 'verify', 'unverify'));

alter table public.user_access_audit_events enable row level security;
revoke all on public.user_access_audit_events from public, anon, authenticated;

create or replace function private.is_current_user_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
      and profile.account_status = 'active'
      and profile.is_super_admin is true
  );
$$;
revoke all on function private.is_current_user_super_admin() from public, anon;
grant execute on function private.is_current_user_super_admin() to authenticated;

create or replace function public.is_current_user_super_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_current_user_super_admin(); $$;
revoke all on function public.is_current_user_super_admin() from public, anon;
grant execute on function public.is_current_user_super_admin() to authenticated;

create or replace function private.manage_user_access(
  p_target_user_id uuid,
  p_action text,
  p_reason text
)
returns table (
  id uuid,
  email text,
  role text,
  account_status text,
  verified boolean,
  is_super_admin boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target public.profiles%rowtype;
  old_role text;
  old_status text;
  old_verified boolean;
begin
  if actor_id is null or not private.is_current_user_super_admin() then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = actor_id then
    raise exception 'SELF_ROLE_OR_ACCOUNT_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 or length(p_reason) > 1000 then
    raise exception 'AUDIT_REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_action not in ('promote', 'demote', 'set_provider', 'suspend', 'activate', 'block', 'require_verification', 'verify', 'unverify') then
    raise exception 'INVALID_USER_ACCESS_ACTION' using errcode = '22023';
  end if;

  select * into target from public.profiles where profiles.id = p_target_user_id for update;
  if not found then raise exception 'USER_PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  if target.is_super_admin then
    raise exception 'SUPER_ADMIN_TARGET_CHANGE_REQUIRES_SEPARATE_BOOTSTRAP' using errcode = '42501';
  end if;

  old_role := target.role;
  old_status := target.account_status;
  old_verified := target.verified;
  update public.profiles profile set
    role = case p_action when 'promote' then 'admin' when 'demote' then 'customer' when 'set_provider' then 'provider' else profile.role end,
    account_status = case p_action when 'suspend' then 'suspended' when 'activate' then 'active' when 'block' then 'blocked' when 'require_verification' then 'pending_verification' else profile.account_status end,
    verified = case p_action when 'verify' then true when 'unverify' then false else profile.verified end,
    updated_at = now()
  where profile.id = p_target_user_id
  returning profile.* into target;

  insert into public.user_access_audit_events (
    actor_user_id, target_user_id, action, previous_role, new_role,
    previous_account_status, new_account_status, previous_verified,
    new_verified, reason
  ) values (
    actor_id, p_target_user_id, p_action, old_role, target.role,
    old_status, target.account_status, old_verified, target.verified, btrim(p_reason)
  );

  return query select target.id, target.email, target.role, target.account_status,
    target.verified, target.is_super_admin;
end;
$$;
revoke all on function private.manage_user_access(uuid, text, text) from public, anon;
grant execute on function private.manage_user_access(uuid, text, text) to authenticated;

create or replace function public.manage_user_access(
  p_target_user_id uuid,
  p_action text,
  p_reason text
)
returns table (
  id uuid,
  email text,
  role text,
  account_status text,
  verified boolean,
  is_super_admin boolean
)
language sql
security invoker
set search_path = ''
as $$ select * from private.manage_user_access(p_target_user_id, p_action, p_reason); $$;
revoke all on function public.manage_user_access(uuid, text, text) from public, anon;
grant execute on function public.manage_user_access(uuid, text, text) to authenticated;

commit;
