#!/usr/bin/env bash
# =============================================================================
# Staging migration DRY RUN — read-only, throwaway cluster.
#
# Proves what would happen if the migrations were applied to an isolated
# staging database. It NEVER connects to Supabase, staging or production.
#
#  1. creates a private throwaway PostgreSQL cluster
#  2. applies supabase/schema_and_rls.sql (the baseline the hosted project has)
#  3. applies every supabase/migrations/*.sql in filename order, recording
#     PASS/FAIL per file
#  4. re-applies every migration a second time to prove idempotency
#  5. inventories tables, RLS enablement and policies
#  6. destroys the cluster
#
# Usage: bash supabase/tests/run_staging_migration_dry_run.sh
# Exit:  0 = every migration applied and re-applied cleanly
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-staging-dryrun.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace staging dry-run scratch directory" > "$TMP_ROOT/.bos-staging-dryrun-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_staging_dryrun
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$OUT"

FAILURES=0
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

cleanup() {
  pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

pq() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }

echo "=== 1. throwaway cluster on 127.0.0.1:$PGPORT ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.out" 2>&1 || { fail "initdb"; exit 1; }
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $TMP_ROOT" -l "$OUT/pg.log" start >/dev/null 2>&1 || { fail "pg start"; exit 1; }
pq -d postgres -q -c "create database $DB;" >/dev/null 2>&1 || { fail "create database"; exit 1; }
pass "cluster ready (local, disposable)"

echo "=== 2. Supabase-compatible stub (roles, auth schema, realtime) ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || { fail "stub schema"; exit 1; }
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists auth.identities (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  provider text not null,
  identity_data jsonb not null default '{}'::jsonb,
  last_sign_in timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid,
    nullif(current_setting('test.uid', true), '')::uuid
  ) $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'role', ''),
    nullif(current_setting('test.role', true), ''),
    'authenticated'
  ) $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
create extension if not exists pgcrypto;
create publication supabase_realtime;
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
SQL
pass "stub schema ready"

echo "=== 2b. seed a Google Auth user before the profile schema exists ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || { fail "seed pre-schema Auth user"; exit 1; }
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','pre-schema-google@example.test',
        '{"full_name":"Pre-schema Google User"}', '{"provider":"google"}', now());
insert into auth.identities(id,user_id,provider,identity_data,last_sign_in)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'google','{"sub":"google-sub-pre-schema"}',now());
SQL
pass "pre-schema Google Auth user seeded (no profile trigger exists yet)"

echo "=== 3. baseline supabase/schema_and_rls.sql ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" \
  > "$OUT/baseline.out" 2> "$OUT/baseline.err" || { fail "baseline schema"; tail -5 "$OUT/baseline.err"; exit 1; }
BASELINE_TABLES=$(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'")
pass "baseline applied ($BASELINE_TABLES public tables)"

echo "=== 4. migrations (filename order) ==="
APPLIED=0
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  MIG_NAME=$(basename "$MIG_FILE")
  if pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" > "$OUT/migration.out" 2> "$OUT/migration.err"; then
    pass "apply $MIG_NAME"
    APPLIED=$((APPLIED + 1))
  else
    fail "apply $MIG_NAME"
    grep -E "ERROR|DETAIL" "$OUT/migration.err" | head -3
  fi
done
pass "migrations applied: $APPLIED"

echo "=== 4b. backfill Google Auth users created before schema installation ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/backfill_existing_google_profiles.sql" \
  > "$OUT/profile-backfill.out" 2> "$OUT/profile-backfill.err" \
  || { fail "profile backfill"; tail -5 "$OUT/profile-backfill.err"; exit 1; }
BACKFILLED_PROFILE="$(pq -d "$DB" -tAc "select count(*) from public.profiles where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='customer' and account_status='active' and verified and not is_super_admin")"
AUTH_USER_REMAINS="$(pq -d "$DB" -tAc "select count(*) from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")"
[ "$BACKFILLED_PROFILE" = "1" ] && [ "$AUTH_USER_REMAINS" = "1" ] \
  && pass "pre-existing Google Auth user retained and receives a customer profile" \
  || { fail "pre-existing Google Auth user/profile invariants"; exit 1; }
pq -d "$DB" -q -c "update public.profiles set role='provider', account_status='suspended' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'" \
  >/dev/null || { fail "seed existing profile role for backfill idempotency"; exit 1; }
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/backfill_existing_google_profiles.sql" \
  > "$OUT/profile-backfill-reapply.out" 2> "$OUT/profile-backfill-reapply.err" \
  || { fail "profile backfill re-apply"; tail -5 "$OUT/profile-backfill-reapply.err"; exit 1; }
PRESERVED_PROFILE="$(pq -d "$DB" -tAc "select count(*) from public.profiles where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='provider' and account_status='suspended'")"
[ "$PRESERVED_PROFILE" = "1" ] && pass "backfill re-run preserves an existing role and account status" \
  || { fail "backfill changed an existing profile"; exit 1; }

echo "=== 5. idempotency: re-apply every migration ==="
REAPPLIED=0
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  MIG_NAME=$(basename "$MIG_FILE")
  if pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" > "$OUT/reapply.out" 2> "$OUT/reapply.err"; then
    REAPPLIED=$((REAPPLIED + 1))
  else
    fail "re-apply $MIG_NAME"
    grep -E "ERROR|DETAIL" "$OUT/reapply.err" | head -3
  fi
done
[ "$REAPPLIED" = "$APPLIED" ] && pass "all migrations re-applied cleanly ($REAPPLIED)" || fail "re-apply count $REAPPLIED != $APPLIED"

echo "=== 6. inventory ==="
TABLES=$(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'")
RLS_TABLES=$(pq -d "$DB" -tAc "select count(*) from pg_tables t join pg_class c on c.relname=t.tablename where t.schemaname='public' and c.relrowsecurity")
POLICIES=$(pq -d "$DB" -tAc "select count(*) from pg_policies where schemaname='public'")
FUNCS=$(pq -d "$DB" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
printf '    public tables=%s  rls_enabled=%s  policies=%s  functions=%s\n' "$TABLES" "$RLS_TABLES" "$POLICIES" "$FUNCS"

UNPROTECTED=$(pq -d "$DB" -tAc "select string_agg(t.tablename, ',') from pg_tables t join pg_class c on c.relname=t.tablename where t.schemaname='public' and not c.relrowsecurity")
if [ -n "${UNPROTECTED:-}" ]; then
  printf '    tables without RLS: %s\n' "$UNPROTECTED"
else
  pass "every public table has RLS enabled"
fi

echo "=== 7. proposed-change summary ==="
pq -d "$DB" -tAc "select 'NEW TABLE ' || tablename from pg_tables where schemaname='public' and tablename not in (select tablename from pg_tables where schemaname='public') order by 1" >/dev/null 2>&1 || true
pq -d "$DB" -tAc "select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1" | sed 's/^/    function /' | head -40

echo "=== 8. verdict ==="
if [ "$FAILURES" -eq 0 ]; then
  echo "    DRY RUN PASSED — $APPLIED migrations apply and re-apply cleanly on an isolated baseline"
  exit 0
fi
echo "    DRY RUN FAILED — $FAILURES problem(s)"
echo "    logs: $OUT"
exit 1
