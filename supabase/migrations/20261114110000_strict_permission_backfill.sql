-- Deny-by-default backfill.
--
-- The provider and customer gates treat a missing grant row as "unrestricted"
-- unless BOS_STRICT_PERMISSION_DEFAULTS / BOS_STRICT_CUSTOMER_DEFAULTS is set.
-- Turning either flag on without this backfill would lock out every account
-- that has no explicit row, so the grants that are implicit today are
-- materialised here first.
--
-- What is backfilled:
--   * business members: every ACTIVE non-owner member of a business that has no
--     `business_member_access` row receives an explicit full grant for that
--     business's own module (empty section/action maps = every section and
--     action). Owners are skipped because they bypass the gate entirely and a
--     row for an owner is refused by guard_business_member_access().
--   * customers: NOT changed by default. A customer with no rows already sees
--     no modules today (`/api/customer/modules` returns an empty list and the
--     marketplace fails closed), so strict mode only makes the API agree with
--     the UI. Granting every module to every existing customer would widen
--     access, which is the opposite of the intent, so it happens only when
--     p_include_customers is explicitly true.
--
-- The work lives in an idempotent SECURITY DEFINER function so it can be
-- re-run, audited and tested; the migration calls it once, and an operator can
-- call it again after restoring data.
--
-- Rollback: delete the rows this function created (they are identifiable by
-- `business_audit_events.event_type = 'business.member_access_backfilled'`
-- plus the row's `updated_by is null`), or leave them — with the flags off they
-- are indistinguishable from the implicit access they replaced. Drop the
-- function to remove the entry point.

begin;

create or replace function public.backfill_strict_permission_grants(
  p_include_customers boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  members_created integer := 0;
  businesses_audited integer := 0;
  customers_created integer := 0;
  result jsonb;
begin
  -- One statement so the grant rows and their audit events are atomic. A
  -- second run inserts nothing (the NOT EXISTS matches every member) and
  -- therefore records no audit event either.
  with inserted as (
    insert into public.business_member_access
      (business_id, user_id, allowed_modules, allowed_sections, updated_by)
    select member.business_id,
           member.user_id,
           array[business.module_type],
           '{}'::jsonb,
           null
      from public.business_members member
      join public.businesses business on business.id = member.business_id
     where member.status = 'active'
       and member.role <> 'owner'
       and not exists (
         select 1
           from public.business_member_access existing
          where existing.business_id = member.business_id
            and existing.user_id = member.user_id
       )
    returning business_id
  ),
  summary as (
    select business_id, count(*)::int as rows_created
      from inserted
     group by business_id
  ),
  audited as (
    insert into public.business_audit_events
      (business_id, actor_user_id, event_type, after_state, reason)
    select summary.business_id,
           null,
           'business.member_access_backfilled',
           jsonb_build_object(
             'rowsCreated', summary.rows_created,
             'allowedModules', jsonb_build_array(business.module_type),
             'allowedSections', '{}'::jsonb,
             'allowedActions', '{}'::jsonb
           ),
           'Explicit full-access grant materialised so deny-by-default can be enabled safely'
      from summary
      join public.businesses business on business.id = summary.business_id
    returning business_id
  )
  select (select count(*) from inserted),
         (select count(distinct business_id) from audited)
    into members_created, businesses_audited;

  -- Access-widening: opt-in only, see the header.
  if p_include_customers then
    with inserted as (
      insert into public.customer_module_access (user_id, module_key)
      select profile.id, flags.module_key
        from public.profiles profile
        cross join public.platform_module_flags flags
       where profile.role = 'customer'
         and profile.account_status = 'active'
         and flags.is_enabled
         and not exists (
           select 1
             from public.customer_module_access existing
            where existing.user_id = profile.id
         )
      returning user_id
    )
    select count(*) into customers_created from inserted;
  end if;

  result := jsonb_build_object(
    'membersCreated', members_created,
    'businessesAudited', businesses_audited,
    'customersCreated', customers_created,
    'includeCustomers', p_include_customers
  );
  return result;
end;
$$;

-- Ops entry point only: never executable by a browser session, because the
-- opt-in argument can grant a customer every enabled module.
revoke all on function public.backfill_strict_permission_grants(boolean) from public, anon, authenticated;
grant execute on function public.backfill_strict_permission_grants(boolean) to service_role;

do $$
declare
  summary jsonb;
begin
  summary := public.backfill_strict_permission_grants(false);
  raise notice 'strict permission backfill: %', summary;
end
$$;

commit;
