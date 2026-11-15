\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('f74cf5bb-0df0-4c8d-9c0c-a2d07c0a2171', 'provider-registration-rls@example.test', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.profiles WHERE id = 'f74cf5bb-0df0-4c8d-9c0c-a2d07c0a2171';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f74cf5bb-0df0-4c8d-9c0c-a2d07c0a2171', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"f74cf5bb-0df0-4c8d-9c0c-a2d07c0a2171","role":"authenticated"}', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, role, account_status)
    VALUES ('f74cf5bb-0df0-4c8d-9c0c-a2d07c0a2171', 'provider-registration-rls@example.test', 'provider', 'active');
    RAISE EXCEPTION 'FAIL profile self-insert must not grant provider role';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS missing profile cannot self-insert a provider or admin role';
  END;
END;
$$;

RESET ROLE;
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('aebd5ffc-6bda-4f76-93ed-2d2ad4c99610', 'provider-registration-owner@example.test', '{}')
ON CONFLICT (id) DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'aebd5ffc-6bda-4f76-93ed-2d2ad4c99610', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub":"aebd5ffc-6bda-4f76-93ed-2d2ad4c99610","role":"authenticated"}', true);

INSERT INTO public.provider_registration_requests
  (user_id, request_id, provider_type, business_name, contact_phone, city, area)
VALUES
  ('aebd5ffc-6bda-4f76-93ed-2d2ad4c99610', '85093d1f-8501-4339-8533-38d525e780cf', 'services', 'Local RLS Test', '+91 90000 11111', 'Test City', 'Test Area');

DO $$
BEGIN
  UPDATE public.provider_registration_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE user_id = auth.uid();
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL provider must not self-approve registration';
  END IF;
  IF (SELECT status FROM public.provider_registration_requests WHERE user_id = auth.uid()) <> 'pending' THEN
    RAISE EXCEPTION 'FAIL provider registration state changed without Admin review';
  END IF;
  RAISE NOTICE 'PASS provider cannot self-approve provider registration';
END;
$$;

ROLLBACK;
