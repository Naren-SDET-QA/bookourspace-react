\set ON_ERROR_STOP on
-- Permission grant SQL suite.
--
-- Proves the shipped guarantees of 20261114090000 + 20261114100000:
--   * a customer with no grant rows sees nothing (deny by default);
--   * a granted module is visible, and empty section/action arrays mean
--     "everything", matching the TypeScript catalog;
--   * section and action predicates refuse what was not granted, and
--     `manage` implies the rest while any action implies `view`;
--   * expired grants disappear without a sweep;
--   * a non-administrator cannot read another account's permissions;
--   * writes are server-mediated: `authenticated` holds no INSERT/UPDATE/DELETE
--     on either grant table, and RLS exposes only the rows a reader may see;
--   * malformed JSON (non-text arrays) is refused by the new CHECK constraints.
--
-- Run by supabase/tests/run_local_validation.sh against a disposable local
-- PostgreSQL cluster. Nothing here contacts Supabase.

BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1', 'perm-customer-a@example.test', '{}'::jsonb),
  ('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa2', 'perm-customer-b@example.test', '{}'::jsonb),
  ('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa4', 'perm-admin@example.test', '{}'::jsonb),
  ('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa5', 'perm-provider@example.test', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

RESET ROLE;
UPDATE public.profiles SET role = 'customer', account_status = 'active'
 WHERE id IN (
   'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1',
   'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa2'
 );
UPDATE public.profiles SET role = 'admin', account_status = 'active', is_super_admin = true
 WHERE id = 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa4';
UPDATE public.profiles SET role = 'provider', account_status = 'active'
 WHERE id = 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa5';

DELETE FROM public.customer_module_access
 WHERE user_id IN (
   'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1',
   'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa2'
 );

INSERT INTO public.platform_module_flags (module_key, is_enabled)
VALUES ('pg', true), ('hotels', true), ('services', true), ('movies', true),
       ('classes', true), ('function_hall', true), ('ecommerce', true)
ON CONFLICT (module_key) DO UPDATE SET is_enabled = true;

-- ===========================================================================
-- 1. Deny by default: an account with no grant rows has no permissions
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  module_count integer;
BEGIN
  SELECT count(*) INTO module_count FROM public.effective_customer_permissions();
  IF module_count <> 0 THEN
    RAISE EXCEPTION 'FAIL a customer without grants saw % module(s)', module_count;
  END IF;
  RAISE NOTICE 'PASS a customer without grants sees no modules';

  IF public.has_customer_permission('pg', 'view') THEN
    RAISE EXCEPTION 'FAIL has_customer_permission allowed an ungranted module';
  END IF;
  RAISE NOTICE 'PASS has_customer_permission refuses an ungranted module';

  IF public.has_customer_section_access('pg', 'pg_hostels') THEN
    RAISE EXCEPTION 'FAIL has_customer_section_access allowed an ungranted module';
  END IF;
  RAISE NOTICE 'PASS has_customer_section_access refuses an ungranted module';
END
$$;
RESET ROLE;

-- ===========================================================================
-- 2. A grant with empty arrays means every section and every action
-- ===========================================================================
INSERT INTO public.customer_module_access (user_id, module_key, granted_by)
VALUES ('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1', 'pg', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa4');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  row_count integer;
  sections_empty boolean;
  actions_empty boolean;
BEGIN
  SELECT count(*),
         coalesce(bool_and(allowed_sections = '[]'::jsonb), true),
         coalesce(bool_and(allowed_actions = '[]'::jsonb), true)
    INTO row_count, sections_empty, actions_empty
    FROM public.effective_customer_permissions();
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FAIL a granted module should be the only visible row, saw %', row_count;
  END IF;
  IF NOT sections_empty OR NOT actions_empty THEN
    RAISE EXCEPTION 'FAIL default grant should carry empty arrays';
  END IF;
  RAISE NOTICE 'PASS a grant with empty arrays reports no section or action limit';

  -- Regression: asking the RPC about your own id must behave like asking about
  -- yourself. The Phase 2 body treated any non-null argument as somebody else.
  IF (SELECT count(*) FROM public.effective_customer_permissions(auth.uid())) <> 1 THEN
    RAISE EXCEPTION 'FAIL effective_customer_permissions(auth.uid()) did not resolve to self';
  END IF;
  RAISE NOTICE 'PASS a customer can ask the RPC about its own id';

  IF NOT public.has_customer_permission('pg', 'delete') THEN
    RAISE EXCEPTION 'FAIL empty action array should allow every action';
  END IF;
  IF NOT public.has_customer_section_access('pg', 'anything_at_all') THEN
    RAISE EXCEPTION 'FAIL empty section array should allow every section';
  END IF;
  RAISE NOTICE 'PASS empty arrays allow every section and every action';

  -- Another customer's permissions are not readable, even by id.
  IF EXISTS (
    SELECT 1 FROM public.effective_customer_permissions('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa2')
  ) THEN
    RAISE EXCEPTION 'FAIL a customer read another account''s permissions';
  END IF;
  RAISE NOTICE 'PASS a customer cannot read another account''s permissions';
END
$$;
RESET ROLE;

-- ===========================================================================
-- 3. Section and action limits
-- ===========================================================================
UPDATE public.customer_module_access
   SET allowed_sections = '["pg_hostels"]'::jsonb,
       allowed_actions = '["view"]'::jsonb
 WHERE user_id = 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  IF NOT public.has_customer_permission('pg', 'view') THEN
    RAISE EXCEPTION 'FAIL a view grant should allow view';
  END IF;
  IF public.has_customer_permission('pg', 'delete') THEN
    RAISE EXCEPTION 'FAIL a view-only grant allowed delete';
  END IF;
  IF public.has_customer_permission('pg', 'manage') THEN
    RAISE EXCEPTION 'FAIL a view-only grant allowed manage';
  END IF;
  RAISE NOTICE 'PASS an action-limited grant refuses everything it does not name';

  IF NOT public.has_customer_section_access('pg', 'pg_hostels') THEN
    RAISE EXCEPTION 'FAIL a granted section was refused';
  END IF;
  IF public.has_customer_section_access('pg', 'properties') THEN
    RAISE EXCEPTION 'FAIL an ungranted section was allowed';
  END IF;
  RAISE NOTICE 'PASS a section-limited grant refuses the section it does not name';
END
$$;
RESET ROLE;

-- ===========================================================================
-- 4. Implication: manage covers everything, any action covers view
-- ===========================================================================
UPDATE public.customer_module_access
   SET allowed_actions = '["manage"]'::jsonb
 WHERE user_id = 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  IF NOT (public.has_customer_permission('pg', 'create')
          AND public.has_customer_permission('pg', 'edit')
          AND public.has_customer_permission('pg', 'delete')
          AND public.has_customer_permission('pg', 'approve')) THEN
    RAISE EXCEPTION 'FAIL manage did not imply every action';
  END IF;
  RAISE NOTICE 'PASS manage implies view, create, edit, delete and approve';
END
$$;
RESET ROLE;

UPDATE public.customer_module_access
   SET allowed_actions = '["create"]'::jsonb
 WHERE user_id = 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  IF NOT public.has_customer_permission('pg', 'view') THEN
    RAISE EXCEPTION 'FAIL a granted action should imply view';
  END IF;
  IF public.has_customer_permission('pg', 'delete') THEN
    RAISE EXCEPTION 'FAIL create implied delete';
  END IF;
  RAISE NOTICE 'PASS any granted action implies view but nothing else';
END
$$;
RESET ROLE;

-- ===========================================================================
-- 5. Expiry removes access without a sweep
-- ===========================================================================
UPDATE public.customer_module_access
   SET expires_at = now() - interval '1 minute',
       allowed_sections = '[]'::jsonb,
       allowed_actions = '[]'::jsonb
 WHERE user_id = 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  module_count integer;
BEGIN
  SELECT count(*) INTO module_count FROM public.effective_customer_permissions();
  IF module_count <> 0 THEN
    RAISE EXCEPTION 'FAIL an expired grant still reported % module(s)', module_count;
  END IF;
  IF public.has_customer_permission('pg', 'view') THEN
    RAISE EXCEPTION 'FAIL an expired grant still allowed view';
  END IF;
  RAISE NOTICE 'PASS an expired grant grants nothing';
END
$$;
RESET ROLE;

-- The staff member of a business is never limited by customer grants.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa5', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
DO $$
DECLARE
  module_count integer;
BEGIN
  SELECT count(*) INTO module_count FROM public.effective_customer_permissions();
  IF module_count < 1 THEN
    RAISE EXCEPTION 'FAIL a provider should keep every enabled module, saw %', module_count;
  END IF;
  RAISE NOTICE 'PASS a provider is not constrained by customer grants';
END
$$;
RESET ROLE;

-- ===========================================================================
-- 6. Server-mediated writes and reader scoping
-- ===========================================================================
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.customer_module_access', 'INSERT')
     OR has_table_privilege('authenticated', 'public.customer_module_access', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customer_module_access', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL authenticated still holds write privileges on customer_module_access';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.customer_module_access', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated lost the read privilege it needs';
  END IF;
  RAISE NOTICE 'PASS customer_module_access is read-only for authenticated';

  IF has_table_privilege('authenticated', 'public.business_member_access', 'INSERT')
     OR has_table_privilege('authenticated', 'public.business_member_access', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.business_member_access', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL authenticated still holds write privileges on business_member_access';
  END IF;
  RAISE NOTICE 'PASS business_member_access is read-only for authenticated';

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'customer_module_access'
       AND cmd = 'ALL'
  ) THEN
    RAISE EXCEPTION 'FAIL a permissive ALL policy is still attached to customer_module_access';
  END IF;
  RAISE NOTICE 'PASS no ALL policy advertises a client write path';

  IF NOT has_function_privilege('authenticated', 'public.is_text_array(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot evaluate the text-array CHECK';
  END IF;
  IF has_function_privilege('anon', 'public.is_text_array(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute the text-array helper';
  END IF;
  RAISE NOTICE 'PASS the structure helpers are available to authenticated only';
END
$$;

-- A signed-in session cannot write its own grant row directly.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.customer_module_access (user_id, module_key)
    VALUES ('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa2', 'pg');
    RAISE EXCEPTION 'FAIL a customer inserted its own grant row';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a customer cannot grant itself a module';
  END;
END
$$;

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*) INTO visible FROM public.customer_module_access;
  IF visible <> 0 THEN
    RAISE EXCEPTION 'FAIL a customer saw % grant row(s) that are not theirs', visible;
  END IF;
  RAISE NOTICE 'PASS a customer reads only its own grant rows';
END
$$;
RESET ROLE;

-- An administrator may read grants, but the read policy is the only path.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa4', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  visible integer;
  modules integer;
BEGIN
  SELECT count(*) INTO visible FROM public.customer_module_access;
  IF visible < 1 THEN
    RAISE EXCEPTION 'FAIL an administrator could not read grant rows';
  END IF;
  SELECT count(*) INTO modules
    FROM public.effective_customer_permissions('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa1');
  IF modules <> 0 THEN
    RAISE EXCEPTION 'FAIL the expired grant was still reported to an administrator';
  END IF;
  RAISE NOTICE 'PASS an administrator reads grants and the same rules apply';
END
$$;
RESET ROLE;

-- ===========================================================================
-- 7. Structural checks reject malformed payloads
-- ===========================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.customer_module_access (user_id, module_key, allowed_actions)
    VALUES ('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa2', 'pg', '[1, 2]'::jsonb);
    RAISE EXCEPTION 'FAIL a numeric action array was stored';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS a non-text action array is refused';
  END;

  BEGIN
    INSERT INTO public.customer_module_access (user_id, module_key, allowed_sections)
    VALUES ('a9a1a1a1-1111-4111-8111-aaaaaaaaaaa2', 'pg', '{"pg_hostels": true}'::jsonb);
    RAISE EXCEPTION 'FAIL a non-array section value was stored';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS a non-array section value is refused';
  END;
END
$$;

INSERT INTO public.businesses (id, business_ref, name, module_type, owner_user_id)
VALUES ('b9b1b1b1-1111-4111-8111-bbbbbbbbbbb1', 'PERM-SQL-0001', 'Permission SQL Business', 'pg_hostels',
        'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa5')
ON CONFLICT (id) DO NOTHING;

-- An owner is never restrictable, whatever a caller writes.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.business_member_access (business_id, user_id, allowed_modules)
    VALUES ('b9b1b1b1-1111-4111-8111-bbbbbbbbbbb1', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa5',
            array['pg_hostels']);
    RAISE EXCEPTION 'FAIL an owner was given a restriction row';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS an owner can never be restricted by a grant row';
  END;
END
$$;

-- The same structure rule applies to a business member's action map.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.business_member_access (business_id, user_id, allowed_modules, allowed_actions)
    VALUES ('b9b1b1b1-1111-4111-8111-bbbbbbbbbbb1', 'a9a1a1a1-1111-4111-8111-aaaaaaaaaaa2',
            array['pg_hostels'], '{"pg_hostels": "view"}'::jsonb);
    RAISE EXCEPTION 'FAIL a non-array member action map was stored';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS a non-array member action map is refused';
  END;
END
$$;

-- Every fixture above is rolled back; the cluster is disposable either way.
ROLLBACK;
