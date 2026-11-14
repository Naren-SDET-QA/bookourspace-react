\set ON_ERROR_STOP on
-- Deny-by-default backfill SQL suite.
--
-- Proves 20261114110000_strict_permission_backfill.sql materialises exactly the
-- access that was implicit before the strict flags exist, and nothing more:
--   * every active non-owner member without a row receives that business's own
--     module with no section/action limit;
--   * owners and non-active members are left alone;
--   * repeated runs create nothing and record no duplicate audit events;
--   * after the backfill no active non-owner member is left without a row, so
--     BOS_STRICT_PERMISSION_DEFAULTS cannot lock anyone out;
--   * customers are untouched unless the operator opts in, because for them the
--     "no rows" state already denies every module.
--
-- Run by supabase/tests/run_local_validation.sh against a disposable local
-- PostgreSQL cluster. Nothing here contacts Supabase.

BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb1', 'backfill-owner@example.test', '{}'::jsonb),
  ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb2', 'backfill-manager@example.test', '{}'::jsonb),
  ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb3', 'backfill-staff@example.test', '{}'::jsonb),
  ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb4', 'backfill-suspended@example.test', '{}'::jsonb),
  ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb5', 'backfill-customer-new@example.test', '{}'::jsonb),
  ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb6', 'backfill-customer-existing@example.test', '{}'::jsonb),
  ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb7', 'backfill-invited@example.test', '{}'::jsonb),
  ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb8', 'backfill-revoked@example.test', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

RESET ROLE;

UPDATE public.profiles
   SET role = 'provider', account_status = 'active'
 WHERE id IN (
   'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb1',
   'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb2',
   'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb3',
   'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb4',
   'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb7',
   'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb8'
 );
UPDATE public.profiles
   SET role = 'customer', account_status = 'active'
 WHERE id IN (
   'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb5',
   'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb6'
 );

INSERT INTO public.platform_module_flags (module_key, is_enabled)
VALUES ('pg', true), ('classes', true)
ON CONFLICT (module_key) DO UPDATE SET is_enabled = true;

-- Two businesses with different modules, so a member of both must end up with
-- one grant per business carrying that business's own module.
INSERT INTO public.businesses (id, business_ref, name, module_type, owner_user_id, approval_status)
VALUES
  ('c7c1c1c1-1111-4111-8111-ccccccccccc1', 'BACKFILL-0001', 'Backfill SQL Business',
   'pg_hostels', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb1', 'approved'),
  ('c7c1c1c1-1111-4111-8111-ccccccccccc2', 'BACKFILL-0002', 'Backfill SQL Stays',
   'hotel_stay', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb1', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_members (business_id, user_id, role, status, accepted_at) VALUES
  ('c7c1c1c1-1111-4111-8111-ccccccccccc1', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb1', 'owner', 'active', now()),
  ('c7c1c1c1-1111-4111-8111-ccccccccccc1', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb2', 'manager', 'active', now()),
  ('c7c1c1c1-1111-4111-8111-ccccccccccc1', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb3', 'staff', 'active', now()),
  ('c7c1c1c1-1111-4111-8111-ccccccccccc1', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb4', 'staff', 'suspended', now()),
  ('c7c1c1c1-1111-4111-8111-ccccccccccc1', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb7', 'staff', 'invited', null),
  ('c7c1c1c1-1111-4111-8111-ccccccccccc1', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb8', 'staff', 'revoked', now()),
  ('c7c1c1c1-1111-4111-8111-ccccccccccc2', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb1', 'owner', 'active', now()),
  ('c7c1c1c1-1111-4111-8111-ccccccccccc2', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb3', 'staff', 'active', now())
ON CONFLICT (business_id, user_id) DO UPDATE SET role = excluded.role, status = excluded.status;

-- One customer already holds a grant; the other holds none.
DELETE FROM public.customer_module_access
 WHERE user_id IN ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb5', 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb6');
INSERT INTO public.customer_module_access (user_id, module_key)
VALUES ('b7b1b1b1-1111-4111-8111-bbbbbbbbbbb6', 'pg');

DELETE FROM public.business_member_access
 WHERE business_id IN ('c7c1c1c1-1111-4111-8111-ccccccccccc1',
                       'c7c1c1c1-1111-4111-8111-ccccccccccc2');
DELETE FROM public.business_audit_events
 WHERE business_id IN ('c7c1c1c1-1111-4111-8111-ccccccccccc1',
                       'c7c1c1c1-1111-4111-8111-ccccccccccc2')
   AND event_type = 'business.member_access_backfilled';

-- ===========================================================================
-- 1. The backfill materialises only the implicit access
-- ===========================================================================
DO $$
DECLARE
  summary jsonb;
  manager_row record;
  staff_row record;
  stays_row record;
  multi_business_rows integer;
  owner_rows integer;
  suspended_rows integer;
  invited_rows integer;
  revoked_rows integer;
  audit_rows integer;
  stays_audit_rows integer;
BEGIN
  summary := public.backfill_strict_permission_grants(false);

  -- manager C1 + staff C1 + staff C2 = 3 rows
  IF (summary ->> 'membersCreated')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL expected 3 member grants, created %', summary ->> 'membersCreated';
  END IF;
  IF (summary ->> 'businessesAudited')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL expected 2 audited businesses, saw %', summary ->> 'businessesAudited';
  END IF;
  IF (summary ->> 'customersCreated')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL customers were granted without opting in';
  END IF;
  RAISE NOTICE 'PASS the backfill created one explicit grant per active non-owner member';

  SELECT allowed_modules, allowed_sections, allowed_actions INTO manager_row
    FROM public.business_member_access
   WHERE business_id = 'c7c1c1c1-1111-4111-8111-ccccccccccc1'
     AND user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb2';
  IF manager_row IS NULL THEN
    RAISE EXCEPTION 'FAIL the manager received no grant';
  END IF;
  IF manager_row.allowed_modules <> ARRAY['pg_hostels'] THEN
    RAISE EXCEPTION 'FAIL the manager grant is not the business module: %', manager_row.allowed_modules;
  END IF;
  IF manager_row.allowed_sections <> '{}'::jsonb OR manager_row.allowed_actions <> '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL the manager grant narrows a section or action';
  END IF;
  RAISE NOTICE 'PASS the grant carries the business module with no section or action limit';

  SELECT allowed_modules INTO staff_row
    FROM public.business_member_access
   WHERE business_id = 'c7c1c1c1-1111-4111-8111-ccccccccccc1'
     AND user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb3';
  IF staff_row IS NULL OR staff_row.allowed_modules <> ARRAY['pg_hostels'] THEN
    RAISE EXCEPTION 'FAIL the staff member grant is missing or wrong';
  END IF;
  RAISE NOTICE 'PASS staff, not only managers, keep their access';

  -- A member of two businesses receives one independent grant per business,
  -- each scoped to that business's own module.
  SELECT count(*) INTO multi_business_rows
    FROM public.business_member_access
   WHERE user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb3';
  IF multi_business_rows <> 2 THEN
    RAISE EXCEPTION 'FAIL a multi-business member has % grant row(s), expected 2', multi_business_rows;
  END IF;

  SELECT allowed_modules INTO stays_row
    FROM public.business_member_access
   WHERE business_id = 'c7c1c1c1-1111-4111-8111-ccccccccccc2'
     AND user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb3';
  IF stays_row IS NULL OR stays_row.allowed_modules <> ARRAY['hotel_stay'] THEN
    RAISE EXCEPTION 'FAIL the stays grant does not carry the stays module';
  END IF;
  RAISE NOTICE 'PASS a multi-business member gets one grant per business and module';

  SELECT count(*) INTO invited_rows
    FROM public.business_member_access
   WHERE user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb7';
  IF invited_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL an invited member received a grant';
  END IF;
  RAISE NOTICE 'PASS invited members are left alone';

  SELECT count(*) INTO revoked_rows
    FROM public.business_member_access
   WHERE user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb8';
  IF revoked_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL a revoked member received a grant';
  END IF;
  RAISE NOTICE 'PASS revoked members are left alone';

  SELECT count(*) INTO owner_rows
    FROM public.business_member_access
   WHERE user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb1';
  IF owner_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL the owner received a restriction row';
  END IF;
  RAISE NOTICE 'PASS owners are left alone';

  SELECT count(*) INTO suspended_rows
    FROM public.business_member_access
   WHERE user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb4';
  IF suspended_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL a suspended member received a grant';
  END IF;
  RAISE NOTICE 'PASS non-active members are left alone';

  SELECT count(*) INTO audit_rows
    FROM public.business_audit_events
   WHERE business_id = 'c7c1c1c1-1111-4111-8111-ccccccccccc1'
     AND event_type = 'business.member_access_backfilled'
     AND (after_state ->> 'rowsCreated')::int = 2;
  IF audit_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL expected one audit event with rowsCreated=2, saw %', audit_rows;
  END IF;

  SELECT count(*) INTO stays_audit_rows
    FROM public.business_audit_events
   WHERE business_id = 'c7c1c1c1-1111-4111-8111-ccccccccccc2'
     AND event_type = 'business.member_access_backfilled'
     AND (after_state ->> 'rowsCreated')::int = 1;
  IF stays_audit_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL expected one audit event with rowsCreated=1 for the second business, saw %', stays_audit_rows;
  END IF;
  RAISE NOTICE 'PASS the change is audited per business with its own count';
END
$$;

-- ===========================================================================
-- 2. Re-running is a no-op and leaves no duplicate audit trail
-- ===========================================================================
DO $$
DECLARE
  before_rows integer;
  before_audit integer;
  summary jsonb;
  after_rows integer;
  after_audit integer;
BEGIN
  SELECT count(*) INTO before_rows FROM public.business_member_access;
  SELECT count(*) INTO before_audit FROM public.business_audit_events;

  summary := public.backfill_strict_permission_grants(false);

  SELECT count(*) INTO after_rows FROM public.business_member_access;
  SELECT count(*) INTO after_audit FROM public.business_audit_events;

  IF (summary ->> 'membersCreated')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL a second run created % member grant(s)', summary ->> 'membersCreated';
  END IF;
  IF after_rows <> before_rows THEN
    RAISE EXCEPTION 'FAIL row count changed on a second run: % -> %', before_rows, after_rows;
  END IF;
  IF after_audit <> before_audit THEN
    RAISE EXCEPTION 'FAIL a second run appended audit rows';
  END IF;
  RAISE NOTICE 'PASS a second run is a true no-op';
END
$$;

-- ===========================================================================
-- 3. Strict mode can now be enabled without locking anyone out
-- ===========================================================================
DO $$
DECLARE
  unprovisioned integer;
BEGIN
  SELECT count(*) INTO unprovisioned
    FROM public.business_members member
   WHERE member.status = 'active'
     AND member.role <> 'owner'
     AND NOT EXISTS (
       SELECT 1 FROM public.business_member_access access
        WHERE access.business_id = member.business_id
          AND access.user_id = member.user_id
     );
  IF unprovisioned <> 0 THEN
    RAISE EXCEPTION 'FAIL % active member(s) still have no explicit grant', unprovisioned;
  END IF;
  RAISE NOTICE 'PASS no active non-owner member is left without a row';
END
$$;

-- ===========================================================================
-- 4. Customers are only touched when the operator opts in
-- ===========================================================================
DO $$
DECLARE
  summary jsonb;
  new_customer_grants integer;
  existing_customer_grants integer;
  enabled_modules integer;
  unprovisioned_customers integer;
  summary_again jsonb;
  grants_before integer;
  grants_after integer;
BEGIN
  -- The baseline seeds several modules as enabled, so derive the expectation
  -- instead of assuming the two this suite touches.
  SELECT count(*) INTO enabled_modules FROM public.platform_module_flags WHERE is_enabled;
  -- The opt-in applies to every active customer without a grant, including any
  -- created outside this suite, so the expected total is derived the same way.
  SELECT count(*) INTO unprovisioned_customers
    FROM public.profiles profile
   WHERE profile.role = 'customer'
     AND profile.account_status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM public.customer_module_access access WHERE access.user_id = profile.id
     );
  SELECT count(*) INTO new_customer_grants
    FROM public.customer_module_access
   WHERE user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb5';
  IF new_customer_grants <> 0 THEN
    RAISE EXCEPTION 'FAIL a customer without grants received % row(s)', new_customer_grants;
  END IF;
  RAISE NOTICE 'PASS the default run leaves unprovisioned customers denied';

  summary := public.backfill_strict_permission_grants(true);

  SELECT count(*) INTO new_customer_grants
    FROM public.customer_module_access
   WHERE user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb5';
  IF new_customer_grants <> enabled_modules THEN
    RAISE EXCEPTION 'FAIL the opt-in grant should cover all % enabled modules, saw %',
      enabled_modules, new_customer_grants;
  END IF;
  IF (summary ->> 'customersCreated')::int <> enabled_modules * unprovisioned_customers THEN
    RAISE EXCEPTION 'FAIL the opt-in summary reported %, expected % (modules x customers)',
      summary ->> 'customersCreated', enabled_modules * unprovisioned_customers;
  END IF;

  SELECT count(*) INTO existing_customer_grants
    FROM public.customer_module_access
   WHERE user_id = 'b7b1b1b1-1111-4111-8111-bbbbbbbbbbb6';
  IF existing_customer_grants <> 1 THEN
    RAISE EXCEPTION 'FAIL an existing customer grant was duplicated (% rows)', existing_customer_grants;
  END IF;
  RAISE NOTICE 'PASS the opt-in covers only modules an admin enabled and never duplicates';

  -- Repeating the opt-in must not add a second row for anyone.
  SELECT count(*) INTO grants_before FROM public.customer_module_access;
  summary_again := public.backfill_strict_permission_grants(true);
  SELECT count(*) INTO grants_after FROM public.customer_module_access;
  IF (summary_again ->> 'customersCreated')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL a repeated opt-in reported % new grant(s)', summary_again ->> 'customersCreated';
  END IF;
  IF grants_after <> grants_before THEN
    RAISE EXCEPTION 'FAIL a repeated opt-in changed the grant count: % -> %', grants_before, grants_after;
  END IF;
  RAISE NOTICE 'PASS a repeated opt-in run is a no-op';
END
$$;

-- ===========================================================================
-- 5. The function is an ops entry point, not a customer one
-- ===========================================================================
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.backfill_strict_permission_grants(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated can run the backfill';
  END IF;
  IF has_function_privilege('anon', 'public.backfill_strict_permission_grants(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can run the backfill';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.backfill_strict_permission_grants(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service_role cannot run the backfill';
  END IF;
  RAISE NOTICE 'PASS only the service role can run the backfill';
END
$$;

-- Every fixture above is rolled back; the cluster is disposable either way.
ROLLBACK;
