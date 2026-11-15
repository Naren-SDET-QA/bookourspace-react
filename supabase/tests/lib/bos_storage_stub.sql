-- ============================================================================
-- Supabase `storage` schema stub for disposable local clusters.
--
-- Supabase provisions storage.buckets / storage.objects and their RLS. A bare
-- PostgreSQL cluster has neither, so migrations that create bucket policies
-- fail with `relation "storage.objects" does not exist`. Every local harness
-- applies this after the auth stubs and before the baseline schema.
--
-- Only the columns the migrations reference are modelled. No storage API, file
-- upload or object bytes are emulated.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete restrict,
  name text not null,
  owner uuid,
  metadata jsonb,
  path_tokens text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;

-- Supabase's storage service manages buckets with elevated rights; the local
-- stub keeps that surface server-only.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'buckets' and policyname = 'Server manages buckets'
  ) then
    create policy "Server manages buckets" on storage.buckets for all to service_role using (true) with check (true);
  end if;
end;
$$;
