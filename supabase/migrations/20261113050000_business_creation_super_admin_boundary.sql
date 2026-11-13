-- Close the direct-RLS business creation boundary.
--
-- Creating a business automatically creates an owner membership and a module
-- access row through public.ensure_business_owner_membership(). That trigger is
-- SECURITY DEFINER and bypasses the business_members policies, so the business
-- INSERT policy is the real authorization boundary.
--
-- Before this migration:
--   * any ordinary admin could insert a business with approval_status
--     'approved' and is_enabled true;
--   * any active authenticated user could self-create an approved business;
--   * an ordinary admin could insert or promote an owner membership directly
--     through business_members policies.
--
-- After this migration:
--   * only a provider account may use the self-service owner creation path,
--     and it must create a pending, unapproved business;
--   * only a Super Admin may create an already-approved business;
--   * ordinary admins may manage non-owner members, but cannot add, modify,
--     promote or demote an owner;
--   * owners keep their existing non-owner member workflow.
--
-- Rollback: restore the four policies from
-- 20261112010000_business_ownership_phase1.sql and
-- 20261112180000_business_admin_insert_policy.sql. Do not delete audit rows.

begin;

drop policy if exists "Business owners create their own business" on public.businesses;
create policy "Business owners create their own business" on public.businesses for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'provider'
       and p.account_status = 'active'
  )
  and approval_status = 'pending'
  and approved_by is null
  and approved_at is null
  and suspended_at is null
  and revoked_at is null
);

drop policy if exists "Business owners read their own business" on public.businesses;
create policy "Business owners read their own business" on public.businesses for select to authenticated
using (owner_user_id = (select auth.uid()));

drop policy if exists "Super admins create businesses" on public.businesses;
create policy "Super admins create businesses" on public.businesses for insert to authenticated
with check (public.is_super_admin());

drop policy if exists "Owners and admins add non-owner members" on public.business_members;
create policy "Owners and admins add non-owner members" on public.business_members for insert to authenticated
with check (
  public.is_super_admin()
  or (public.is_admin() and role <> 'owner')
  or (public.is_business_member(business_id, array['owner']) and role <> 'owner')
);

drop policy if exists "Owners and admins update non-owner members" on public.business_members;
create policy "Owners and admins update non-owner members" on public.business_members for update to authenticated
using (
  public.is_super_admin()
  or (
    (public.is_admin() or public.is_business_member(business_id, array['owner']))
    and role <> 'owner'
  )
)
with check (
  public.is_super_admin()
  or (
    (public.is_admin() or public.is_business_member(business_id, array['owner']))
    and role <> 'owner'
  )
);

commit;
