-- Local-only regression checks for the November 2026 audit repairs.
-- Run through supabase/tests/run_local_validation.sh after every migration has
-- been applied to the disposable database. Never run against a hosted project.

\set ON_ERROR_STOP 1

begin;

do $$
declare
  v_self uuid := 'a1111111-1111-4111-8111-111111111111';
  v_admin uuid := 'a2222222-2222-4222-8222-222222222222';
  v_listing text := 'audit-repair-listing';
  v_cascade uuid := 'a3333333-3333-4333-8333-333333333333';
  v_membership uuid;
  v_policy text;
  v_accepted boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_self, 'self-grant@example.com', '{"full_name":"Self Grant"}'::jsonb),
    (v_admin, 'audit-admin@example.com', '{"full_name":"Audit Admin"}'::jsonb)
  on conflict (id) do nothing;

  update public.profiles set role = 'admin', account_status = 'active' where id = v_admin;

  insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status)
  values (v_listing, v_self, 'Audit repair listing', 'pg-hostel', 'PG', 'listing', 1000, 'per month', 'active')
  on conflict (id) do nothing;

  insert into public.bookings (id, user_id, listing_id, listing_title, provider_id, customer_name, customer_phone, scheduled_date, scheduled_time)
  values ('audit-repair-booking', v_self, v_listing, 'Audit repair listing', 'provider-audit', 'Customer', '9000000000', '2026-11-13', '10:00 AM')
  on conflict (id) do nothing;

  -- ensure_record_business(): pg_payment_claims has booking_id but no listing_id.
  -- Before the repair this raised 42703 whenever the booking business was NULL.
  insert into public.pg_payment_claims (booking_id, claimed_by, method, reference, amount_paise)
  values ('audit-repair-booking', v_self, 'cash', 'AUDIT-REPAIR-1', 1000);

  if not exists (select 1 from public.pg_payment_claims where booking_id = 'audit-repair-booking') then
    raise exception 'FAIL payment claim insert did not persist';
  end if;
  raise notice 'PASS pg_payment_claims insert no longer reads a missing listing_id';

  -- Provider portal: the legacy FOR ALL self-grant policy must be gone.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'provider_portal_memberships'
       and policyname = 'provider_portal_memberships_write'
  ) then
    raise exception 'FAIL legacy provider_portal_memberships_write policy still exists';
  end if;

  select coalesce(with_check, '') into v_policy
    from pg_policies
   where schemaname = 'public' and tablename = 'provider_portal_memberships'
     and policyname = 'provider_portal_memberships_admin_write';
  if v_policy = '' then
    raise exception 'FAIL administrator-only write policy is missing';
  end if;
  if v_policy like '%invited_by = auth.uid()%' then
    raise exception 'FAIL self-grant predicate survived in the write policy';
  end if;
  raise notice 'PASS provider portal direct writes are administrator-only';

  -- Invitation acceptance is restricted to the invited user and the invited -> active transition.
  insert into public.provider_portal_memberships (user_id, listing_id, portal_role, permissions, status, invited_by)
  values (v_self, v_listing, 'staff', '{"read":true}'::jsonb, 'invited', v_admin)
  returning id into v_membership;

  perform set_config('test.uid', v_self::text, true);
  v_accepted := public.provider_portal_accept_invitation(v_membership);
  if not v_accepted then
    raise exception 'FAIL the invited user could not accept the invitation';
  end if;
  if not exists (
    select 1 from public.provider_portal_memberships
     where id = v_membership and status = 'active' and portal_role = 'staff'
  ) then
    raise exception 'FAIL acceptance changed the invited scope';
  end if;

  perform set_config('test.uid', v_admin::text, true);
  if public.provider_portal_accept_invitation(v_membership) then
    raise exception 'FAIL another user accepted someone else''s invitation';
  end if;
  raise notice 'PASS invitation acceptance is limited to the invited user';

  -- Customer module access: RLS must be reachable by the authenticated role.
  if not has_table_privilege('authenticated', 'public.customer_module_access', 'SELECT') then
    raise exception 'FAIL authenticated cannot SELECT customer_module_access';
  end if;
  if not has_table_privilege('authenticated', 'public.customer_module_access_audit', 'SELECT') then
    raise exception 'FAIL authenticated cannot SELECT customer_module_access_audit';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'customer_module_access'
       and policyname not in ('Customers read their own module access', 'Admins read every customer module access')
  ) then
    raise exception 'FAIL unexpected customer_module_access policy';
  end if;
  -- Grants are server-mediated: the browser role may read, never write.
  if has_table_privilege('authenticated', 'public.customer_module_access', 'INSERT')
     or has_table_privilege('authenticated', 'public.customer_module_access', 'UPDATE')
     or has_table_privilege('authenticated', 'public.customer_module_access', 'DELETE') then
    raise exception 'FAIL authenticated still holds write privileges on customer_module_access';
  end if;
  raise notice 'PASS customer module access grants let RLS enforce reads';

  -- Deleting an account that holds module grants must complete. The delete
  -- cascades into customer_module_access, and before the repair the audit
  -- trigger then inserted a 'revoke' row for a profile that no longer existed,
  -- so the audit foreign key aborted the whole account deletion with 23503.
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_cascade, 'audit-cascade@example.com', '{"full_name":"Audit Cascade"}'::jsonb)
  on conflict (id) do nothing;
  update public.profiles set role = 'customer', account_status = 'active' where id = v_cascade;
  insert into public.platform_module_flags (module_key, is_enabled) values ('pg', true)
  on conflict (module_key) do update set is_enabled = true;
  insert into public.customer_module_access (user_id, module_key) values (v_cascade, 'pg')
  on conflict do nothing;

  if not exists (
    select 1 from public.customer_module_access_audit
     where user_id = v_cascade and action = 'grant'
  ) then
    raise exception 'FAIL a normal grant stopped being audited';
  end if;

  delete from auth.users where id = v_cascade;

  if exists (select 1 from public.profiles where id = v_cascade) then
    raise exception 'FAIL the account survived deletion';
  end if;
  if exists (select 1 from public.customer_module_access where user_id = v_cascade) then
    raise exception 'FAIL module grants survived the account deletion';
  end if;
  if exists (select 1 from public.customer_module_access_audit where user_id = v_cascade) then
    raise exception 'FAIL deleted-account history was left behind without its account';
  end if;
  raise notice 'PASS an account holding module grants can be deleted';

  raise notice 'PASS audit blocker SQL suite completed';
end $$;

-- A real authenticated session must not be able to insert itself as an owner.
set local role authenticated;
set local test.uid = 'a1111111-1111-4111-8111-111111111111';

do $$
begin
  begin
    insert into public.provider_portal_memberships
      (user_id, listing_id, portal_role, permissions, status, invited_by)
    values
      ('a1111111-1111-4111-8111-111111111111', 'audit-repair-listing', 'owner',
       '{"read":true}'::jsonb, 'active', 'a1111111-1111-4111-8111-111111111111');
    raise exception 'FAIL authenticated user granted themselves owner access';
  exception
    when insufficient_privilege then
      raise notice 'PASS authenticated self-grant is refused';
  end;
end $$;

reset role;

rollback;
