#!/usr/bin/env bash
# =============================================================================
# Live Edit audit trail verification.
#
# Throwaway cluster → baseline + every migration → the audit SQL suite →
# cluster restart → prove the trail (and append-only enforcement) survived.
#
# Verifies: server-derived actor identity (auth.uid, not client input), role,
# action, version number, timestamp and summary; admin-only RLS reads;
# no INSERT/UPDATE/DELETE/TRUNCATE for any client role; publish attributed to
# the publisher rather than the drafter; rollback source linkage; version
# persistence unchanged; trail persistence across a PostgreSQL restart.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-live-audit.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace live edit audit scratch" > "$TMP_ROOT/.bos-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_live_audit
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
if root.parent != base or not root.name.startswith('bos-live-audit.'):
    raise SystemExit('refusing cleanup: scratch path outside the scoped temp directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace live edit audit scratch':
    raise SystemExit('refusing cleanup: ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

start_cluster() {
  if ! pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1 -c shared_memory_type=mmap" \
      -l "$OUT/postgres.log" start >/dev/null 2>&1; then
    pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 40); do pq -tAc "select 1" >/dev/null 2>&1 && return 0; sleep 0.5; done
  tail -20 "$OUT/postgres.log" >&2; fail "cluster did not start"
}

echo "=== 1. throwaway cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || fail "initdb (see $OUT/initdb.log)"
start_cluster
pq -tAc "select version()" | sed 's/^/    /'

echo "=== 2. database, stubs, baseline and migrations ==="
hope -q -c "create database $DB;" || fail "create database"
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL' || fail "stubs"
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
  || fail "baseline schema (see $OUT/baseline.log)"
MIGRATIONS=$(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ')
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" > "$OUT/migration.log" 2>&1 \
    || { grep -E "ERROR|DETAIL" "$OUT/migration.log" | head -6 >&2; fail "migration $(basename "$MIG_FILE")"; }
done
echo "    applied baseline + $MIGRATIONS migrations"

echo "=== 3. audit trail assertions ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/live_edit_audit_test.sql" > "$OUT/audit.log" 2>&1
PASS=$(grep -c "NOTICE:  PASS" "$OUT/audit.log" || true)
FAILCOUNT=$(grep -c "NOTICE:  FAIL" "$OUT/audit.log" || true)
ERRORS=$(grep -c "ERROR:" "$OUT/audit.log" || true)
grep "NOTICE:  PASS" "$OUT/audit.log" | sed 's/NOTICE:  /    /'
[ "$FAILCOUNT" = "0" ] || { grep "NOTICE:  FAIL" "$OUT/audit.log" >&2; fail "audit assertions"; }
# ok_raises captures expected errors; any *other* ERROR line is a real problem.
[ "$ERRORS" = "0" ] || { grep -B2 -A2 "ERROR:" "$OUT/audit.log" | head -20 >&2; fail "unexpected SQL errors in audit suite"; }
echo "    PASS=$PASS FAIL=$FAILCOUNT SQL_ERRORS=$ERRORS"
[ "$PASS" -ge 14 ] || fail "expected at least 14 assertions, saw $PASS"

echo "=== 4. restart persistence ==="
BEFORE_EVENTS=$(pq -d "$DB" -tAc "select count(*) from public.app_builder_audit_events")
BEFORE_ACTIONS=$(pq -d "$DB" -tAc "select string_agg(action, ',' order by created_at) from public.app_builder_audit_events")
pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || fail "stop cluster"
start_cluster
AFTER_EVENTS=$(pq -d "$DB" -tAc "select count(*) from public.app_builder_audit_events")
AFTER_ACTIONS=$(pq -d "$DB" -tAc "select string_agg(action, ',' order by created_at) from public.app_builder_audit_events")
PROBE=$(pq -d "$DB" -tAc "select events from public.audit_restart_probe")
echo "    before=$BEFORE_EVENTS after=$AFTER_EVENTS probe=$PROBE actions=$AFTER_ACTIONS"
[ "$BEFORE_EVENTS" = "$AFTER_EVENTS" ] || fail "audit trail changed across restart"
[ "$BEFORE_ACTIONS" = "$AFTER_ACTIONS" ] || fail "audit actions changed across restart"
[ "$PROBE" = "$AFTER_EVENTS" ] || fail "restart probe disagrees with the trail"

echo "    append-only still enforced after restart:"
pq -d "$DB" -tAc "delete from public.app_builder_audit_events where true" > "$OUT/after-restart.log" 2>&1 || true
grep -q "APP_BUILDER_AUDIT_APPEND_ONLY" "$OUT/after-restart.log" || fail "delete was not rejected after restart"
echo "    PASS delete rejected after restart"

echo
echo "ALL LIVE EDIT AUDIT CHECKS PASSED (actor/role/action/version/summary, admin-only read, no client writes, immutable, restart-persistent)"
