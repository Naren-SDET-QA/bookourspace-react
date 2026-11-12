-- Security-advisor contract: SECURITY DEFINER helpers must not be executable by
-- PUBLIC. Grant only the roles that RLS/server paths require.
revoke all on function public.can_access_business_module(uuid,text[]) from public;
revoke all on function public.business_publicly_available(uuid) from public;
revoke all on function public.record_business_transfer_audit() from public;
revoke all on function public.ensure_business_owner_membership() from public;
revoke all on function public.business_role(uuid) from public;
revoke all on function public.record_business_audit() from public;
revoke all on function public.guard_business_privileged_changes() from public;
revoke all on function public.is_business_member(uuid,text[]) from public;
revoke all on function public.can_access_business(uuid,text[]) from public;
revoke all on function public.business_module_enabled(uuid,text) from public;
do $$ begin
  if to_regprocedure('public.provider_portal_can_access(uuid,text,text)') is not null then
    execute 'revoke all on function public.provider_portal_can_access(uuid,text,text) from public';
  end if;
end $$;

grant execute on function public.business_publicly_available(uuid) to anon, authenticated, service_role;
grant execute on function public.can_access_business_module(uuid,text[]) to authenticated, service_role;
grant execute on function public.business_role(uuid) to authenticated, service_role;
grant execute on function public.is_business_member(uuid,text[]) to authenticated, service_role;
grant execute on function public.can_access_business(uuid,text[]) to authenticated, service_role;
grant execute on function public.business_module_enabled(uuid,text) to authenticated, service_role;
do $$ begin
  if to_regprocedure('public.provider_portal_can_access(uuid,text,text)') is not null then
    execute 'grant execute on function public.provider_portal_can_access(uuid,text,text) to authenticated, service_role';
  end if;
end $$;
grant execute on function public.record_business_transfer_audit() to service_role;
grant execute on function public.ensure_business_owner_membership() to service_role;
grant execute on function public.record_business_audit() to service_role;
grant execute on function public.guard_business_privileged_changes() to service_role;
