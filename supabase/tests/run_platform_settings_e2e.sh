#!/usr/bin/env bash
# =============================================================================
# Live page configuration + 17 admin module settings persistence suite.
#
# Creates a THROWAWAY PostgreSQL cluster in a private temporary directory,
# applies the baseline schema and every migration, then runs
# supabase/tests/platform_settings_test.sql against it.
#
# It never contacts Supabase, never reads credentials and never touches a
# caller-supplied data path. Only the cluster it created is removed.
#
# Usage: bash supabase/tests/run_platform_settings_e2e.sh
# Exit:  0 = the suite produced no FAIL lines
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-platform-settings.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace platform settings scratch directory" > "$TMP_ROOT/.bos-settings-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_platform_settings
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DB" "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

cleanup() {
  if [ "${BOS_KEEP_SETTINGS_CLUSTER:-0}" = "1" ]; then
    echo "    preserved isolated test files at $TMP_ROOT"
    return
  fi
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-settings-owned'
if root.parent != base or not root.name.startswith('bos-platform-settings.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace platform settings scratch directory':
    raise SystemExit('Refusing cleanup: scratch ownership marker did not match')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

echo "=== 1. throwaway cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 \
  || fail "initdb (see $OUT/initdb.log)"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" \
       -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  [ "$(hope -tAc 'select 1' 2>/dev/null)" = "1" ] && break
  sleep 0.5
done
hope -tAc "select version()" >/dev/null 2>&1 || fail "server did not start (see $OUT/postgres.log)"

echo "=== 2. database + Supabase-compatible stubs ==="
hope -q -c "drop database if exists $DB;" || fail "drop database"
hope -q -c "create database $DB;"          || fail "create database"
pq -q -v ON_ERROR_STOP=1 <<'SQL' || fail "stubs"
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
  raw_user_meta_data jsonb not null default '{}'::jsonb
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

echo "=== 3. baseline + migrations ==="
pq -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" \
   > "$OUT/baseline.out" 2> "$OUT/baseline.err" || fail "baseline schema (see $OUT/baseline.err)"
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  pq -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" \
     > "$OUT/migration.out" 2> "$OUT/migration.err" || {
       grep -E "ERROR|DETAIL" "$OUT/migration.err" | head -10 >&2
       fail "migration $(basename "$MIG_FILE")"
     }
done
echo "    applied $(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations"

echo "=== 4. persistence, RLS and audit suite ==="
pq -f "$REPO_ROOT/supabase/tests/platform_settings_test.sql" > "$OUT/suite.log" 2>&1
PASSES=$(grep -c "PASS  " "$OUT/suite.log" || true)
FAILS=$(grep -c "FAIL  " "$OUT/suite.log" || true)
# A SQL error stops the remaining assertions without printing FAIL, so an error
# and a short run are failures in their own right. EXPECTED_PASSES is pinned so
# a silently skipped assertion cannot be reported as a pass.
ERRORS=$(grep -cE "ERROR:" "$OUT/suite.log" || true)
EXPECTED_PASSES=27
grep -E "PASS  |FAIL  |=== " "$OUT/suite.log" | sed 's/^NOTICE:  //'
echo "    PASS=$PASSES FAIL=$FAILS ERRORS=$ERRORS EXPECTED=$EXPECTED_PASSES"

if [ "${FAILS:-0}" -ne 0 ] || [ "${ERRORS:-0}" -ne 0 ] || [ "${PASSES:-0}" -ne "$EXPECTED_PASSES" ]; then
  grep -E "ERROR:" "$OUT/suite.log" | head -5 >&2
  echo "FAILED: platform settings suite ran PASS=$PASSES FAIL=$FAILS ERRORS=$ERRORS (expected $EXPECTED_PASSES passes, 0 failures, 0 errors)" >&2
  exit 1
fi
echo "ALL PLATFORM SETTINGS CHECKS PASSED (PASS=$PASSES)"
