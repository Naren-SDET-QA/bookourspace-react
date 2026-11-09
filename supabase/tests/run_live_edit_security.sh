#!/usr/bin/env bash
# =============================================================================
# Live Edit backend security verification on a disposable PostgreSQL cluster.
#
# Creates a throwaway cluster, applies the baseline schema plus every migration
# (including 20261104220000_live_edit_backend_security.sql), then runs the HTTP +
# database integration suite. The cluster and its data directory are deleted on
# exit. No hosted database, migration or deployment is touched.
#
# Covers: forged/stale roles, cross-provider edits, unassigned admins,
# suspended accounts, assignment changes, Super Admin freshness, protected
# publication/verification/featured/moderation fields, server-side validation,
# append-only/attributable audit, audit-failure rollback, concurrency and
# read-after-write, RLS denial, and cinema screen ownership/authorization.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-live-edit-security.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace live edit security scratch" > "$TMP_ROOT/.bos-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_live_edit_security
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

cleanup() {
  if [ -f "$PGDATA/PG_VERSION" ]; then pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true; fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil, sys
root = Path(sys.argv[1]).resolve(); base = Path(sys.argv[2]).resolve()
marker = root / '.bos-owned'
if root.parent != base or not root.name.startswith('bos-live-edit-security.'):
    raise SystemExit('refusing cleanup: scratch path outside the scoped temp directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace live edit security scratch':
    raise SystemExit('refusing cleanup: ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

start_cluster() {
  pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1 -c shared_memory_type=mmap" \
      -l "$OUT/postgres.log" start >/dev/null 2>&1 \
    || pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" \
      -l "$OUT/postgres.log" start >/dev/null 2>&1 \
    || { tail -20 "$OUT/postgres.log" >&2; fail "cluster did not start"; }
  for _ in $(seq 1 40); do pq -tAc "select 1" >/dev/null 2>&1 && return 0; sleep 0.5; done
  tail -20 "$OUT/postgres.log" >&2; fail "cluster did not become ready"
}

echo "=== 1. throwaway PostgreSQL cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || fail "initdb (see $OUT/initdb.log)"
start_cluster
pq -tAc "select version()" | sed 's/^/    /'

echo "=== 2. database, auth stubs, baseline and all migrations ==="
hope -q -c "create database $DB;" || fail "create database"
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL' || fail "auth stubs"
do $$
begin
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
  banned_until timestamptz,
  updated_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
                  nullif(current_setting('test.uid', true), '')::uuid) $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated') $$;
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
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" > "$OUT/baseline.log" 2>&1 \
  || { tail -30 "$OUT/baseline.log" >&2; fail "baseline schema"; }
MIGRATIONS=$(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ')
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" > "$OUT/migration.log" 2>&1 \
    || { grep -E "ERROR|DETAIL|LINE" "$OUT/migration.log" | head -10 >&2; fail "migration $(basename "$MIG_FILE")"; }
done
echo "    applied baseline + $MIGRATIONS migrations"

echo "=== 3. Live Edit HTTP + database security suite ==="
export BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB"
export BOS_LIVE_EDIT_TEST_DB_URL="$BOS_LISTINGS_DATABASE_URL"
export NODE_ENV=test
if ! npx tsx --test tests/live-edit-backend-security.integration.test.mjs; then
  fail "Live Edit backend security integration suite"
fi

echo
echo "ALL LIVE EDIT BACKEND SECURITY CHECKS PASSED"
