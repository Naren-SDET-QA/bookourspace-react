-- DEV privilege hardening applied to Supabase DEV project
-- obkfgxjzlscungkhbyvq. This migration changes TRUNCATE only.
begin;

-- All 92 current public tables were owned by postgres at preflight.
revoke truncate on all tables in schema public from anon, authenticated;

-- Prevent postgres-created future tables in these schemas from inheriting
-- API-role TRUNCATE. Other default privileges are untouched.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
alter default privileges for role postgres in schema storage
  revoke truncate on tables from anon, authenticated;

commit;
