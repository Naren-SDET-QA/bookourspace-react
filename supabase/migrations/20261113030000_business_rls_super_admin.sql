-- Business RLS hardening for super-admin separation and member-scope writes.
--
-- The provider API already distinguishes a Super Admin from an ordinary admin
-- (businessApi.ts checks profiles.is_super_admin before business/module access
-- changes), but the RLS policies only called public.is_admin(). Any ordinary
-- admin could therefore change approval, enabled flags, ownership or module
-- access by calling PostgREST directly. These policies now require the
-- super-admin flag while ordinary admins keep their read access.
--
-- Member access scopes are written only by the server service pool
-- (/api/businesses/:id/members/:userId/access). Direct authenticated DML is
-- revoked so a manager cannot lift an owner-imposed restriction on themselves
-- or another manager outside the API's ONLY_OWNER_CAN_RESTRICT_MANAGER rule.

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role = 'admin'
       and account_status = 'active'
       and is_super_admin is true
  )
$$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;

-- Owners keep updating safe business fields; privileged fields remain guarded
-- below. Only a Super Admin may use the policy as an administrator.
drop policy if exists "Business owners update safe fields" on public.businesses;
create policy "Business owners update safe fields" on public.businesses for update to authenticated
using (public.is_business_member(id, array['owner']) or public.is_super_admin())
with check (public.is_business_member(id, array['owner']) or public.is_super_admin());

-- Approval, enabled state and module access are Super Admin writes.
drop policy if exists "Only super admins write module access" on public.business_module_access;
create policy "Only super admins write module access" on public.business_module_access for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.guard_business_privileged_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    if new.owner_user_id is distinct from old.owner_user_id
       or new.approval_status is distinct from old.approval_status
       or new.is_enabled is distinct from old.is_enabled
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.suspended_at is distinct from old.suspended_at
       or new.revoked_at is distinct from old.revoked_at then
      raise exception 'BUSINESS_PRIVILEGED_FIELDS_ADMIN_ONLY';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_business_privileged_changes on public.businesses;
create trigger trg_guard_business_privileged_changes before update on public.businesses
for each row execute function public.guard_business_privileged_changes();

-- Server-mediated writes only. Reads (own scope, owners/managers, admins) stay.
revoke insert, update, delete on public.business_member_access from authenticated;
revoke insert, update, delete on public.business_member_access from anon;

drop policy if exists "Owners and managers grant access scopes" on public.business_member_access;
drop policy if exists "Owners and managers update access scopes" on public.business_member_access;
drop policy if exists "Owners and managers revoke access scopes" on public.business_member_access;
