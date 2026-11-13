-- Test harness ONLY. Not a Supabase migration and never used by demo:seed/replay.
-- Supplies the minimal Auth role/JWT SQL interface for native PostgreSQL RLS tests.
-- Does NOT emulate GoTrue, PostgREST, Storage, or Realtime delivery.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
 id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
 email_confirmed_at timestamptz, aud text, role text
);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema realtime;
create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$ select $$;
