-- Repair the provider-portal membership self-grant introduced by
-- 20261112100000_provider_portal_operations.sql.
--
-- That migration granted `for all` writes to any authenticated user whose row
-- carried `invited_by = auth.uid()`. Because `invited_by` is a client-supplied
-- column and `status` defaults to 'active', a user could insert themselves as an
-- active owner of any property or listing and then pass
-- provider_portal_can_access() for inventory, bookings, workers and finance.
--
-- Direct writes become administrator-only. Invitations are created by a
-- scope-checked SECURITY DEFINER function and accepted by the invited user
-- alone through a second function that can only perform invited -> active.

begin;

drop policy if exists provider_portal_memberships_write on public.provider_portal_memberships;
drop policy if exists provider_portal_memberships_admin_write on public.provider_portal_memberships;

create policy provider_portal_memberships_admin_write
  on public.provider_portal_memberships
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Invite a member to a scope the caller already administers.
create or replace function public.provider_portal_invite_member(
  p_user_id uuid,
  p_portal_role text,
  p_property_id uuid default null,
  p_listing_id text default null,
  p_permissions jsonb default '{"read":true}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_portal_role not in ('owner', 'manager', 'staff', 'accountant') then
    raise exception 'INVALID_PORTAL_ROLE' using errcode = '22023';
  end if;
  if p_property_id is null and p_listing_id is null then
    raise exception 'PROVIDER_PORTAL_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if not (
    public.is_admin()
    or public.provider_portal_can_access(p_property_id, p_listing_id, 'manage_workers')
  ) then
    raise exception 'PROVIDER_PORTAL_INVITE_FORBIDDEN' using errcode = '42501';
  end if;

  select m.id into v_id
    from public.provider_portal_memberships m
   where m.user_id = p_user_id
     and m.property_id is not distinct from p_property_id
     and m.listing_id is not distinct from p_listing_id
   limit 1;

  if v_id is null then
    insert into public.provider_portal_memberships
      (user_id, property_id, listing_id, portal_role, permissions, status, invited_by)
    values
      (p_user_id, p_property_id, p_listing_id, p_portal_role,
       coalesce(p_permissions, '{"read":true}'::jsonb), 'invited', auth.uid())
    returning id into v_id;
  else
    update public.provider_portal_memberships
       set portal_role = p_portal_role,
           permissions = coalesce(p_permissions, '{"read":true}'::jsonb),
           status = 'invited',
           invited_by = auth.uid(),
           updated_at = now()
     where id = v_id;
  end if;

  return v_id;
end $$;

revoke all on function public.provider_portal_invite_member(uuid, text, uuid, text, jsonb) from public, anon;
grant execute on function public.provider_portal_invite_member(uuid, text, uuid, text, jsonb) to authenticated;

-- Accept an invitation. Only the invited user may activate their own row and
-- no scope, role or permission column can change through this path.
create or replace function public.provider_portal_accept_invitation(p_membership_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.provider_portal_memberships
     set status = 'active',
         updated_at = now()
   where id = p_membership_id
     and user_id = auth.uid()
     and status = 'invited';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end $$;

revoke all on function public.provider_portal_accept_invitation(uuid) from public, anon;
grant execute on function public.provider_portal_accept_invitation(uuid) to authenticated;

commit;
