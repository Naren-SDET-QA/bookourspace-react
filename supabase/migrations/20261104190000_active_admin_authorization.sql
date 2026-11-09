-- public.is_admin() is the authorization predicate behind 35 RLS policies.
-- The baseline definition checks role = 'admin' only, so an administrator whose
-- account_status was set to 'suspended' or 'blocked' keeps full admin access.
-- public.is_active_user() exists for exactly this purpose but is_admin() never
-- consults it.
--
-- This redefinition aligns the public predicate with the private authority
-- (private.is_current_user_admin(), which already requires
-- account_status = 'active'), so suspension takes effect everywhere at once.
--
-- Behaviour for active administrators is unchanged. The signature is unchanged,
-- so no policy, view or RPC has to be rewritten.
--
-- Idempotent: create or replace on the same signature.

begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'admin'
      and profile.account_status = 'active'
  );
$$;

-- A function is executable by PUBLIC by default. RLS predicates only need the
-- authenticated role, so remove the anonymous/public surface entirely.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- is_active_user() is the same class of predicate: keep it off anon/PUBLIC but
-- available to the roles whose policies call it.
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated, service_role;

comment on function public.is_admin() is
  'True only for an authenticated profile with role=admin and account_status=active.';

commit;
