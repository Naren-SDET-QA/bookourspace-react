#!/usr/bin/env bash
# =============================================================================
# Local database validation for BookOurSpace migrations and stay inventory.
#
# Creates a unique THROWAWAY PostgreSQL cluster in a private temporary
# directory. It never reuses or removes a caller-supplied data path, database,
# output directory, port, or barrier file. It applies the existing baseline
# schema followed by every migration, then
# runs:
#   1. supabase/tests/stay_inventory_test.sql   (functional + invariant suite)
#   2. a genuine two-session concurrency test   (no double booking possible)
#
# It never contacts Supabase, never reads credentials and never touches the
# production project.
#
# The cluster only stubs what Supabase supplies: the `auth` schema, auth.users,
# auth.uid() and auth.role(). handle_new_user() reads raw_user_meta_data, so the
# stub table carries that column too.
#
# Usage:  bash supabase/tests/run_local_validation.sh
# Exit:   0 = everything passed, 1 = a check failed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-local-validation.XXXXXX")" || exit 1
MARKER="$TMP_ROOT/.bos-local-validation-owned"
printf '%s\n' "BookOurSpace local validation scratch directory" > "$MARKER"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
BARRIER="$TMP_ROOT/concurrency-barrier"
export BOS_LOCAL_VALIDATION_BARRIER="$BARRIER"
DB=bos_dev
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

cleanup() {
  if [ "${BOS_KEEP_LOCAL_VALIDATION:-0}" = "1" ]; then
    echo "    preserved isolated test files at $TMP_ROOT"
    return
  fi
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  # Remove only the directory created by this invocation, after checking both
  # its parent and ownership marker. No fixed /tmp path is ever deleted.
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-local-validation-owned'
if root.parent != base or not root.name.startswith('bos-local-validation.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace local validation scratch directory':
    raise SystemExit('Refusing cleanup: scratch ownership marker did not match')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

echo "=== 1. throwaway cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 \
  || fail "initdb (see $OUT/initdb.log)"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1 -c wal_level=logical" \
       -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  pq -tAc "select 1" >/dev/null 2>&1 && break
  sleep 0.5
done
SERVER_VERSION=$(pq -tAc "select version()" 2>/dev/null) || fail "server did not start (see $OUT/postgres.log)"
echo "    $SERVER_VERSION"

echo "=== 2. database + Supabase-compatible stubs ==="
hope -q -c "drop database if exists $DB;" || fail "drop database"
hope -q -c "create database $DB;"          || fail "create database"
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL' || fail "stubs"
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
-- raw_user_meta_data is required by the baseline's handle_new_user() trigger.
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated') $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
create extension if not exists pgcrypto;
create publication supabase_realtime;
SQL

echo "=== 3. baseline schema ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" \
   > "$OUT/baseline.out" 2> "$OUT/baseline.err" || fail "baseline schema (see $OUT/baseline.err)"
echo "    applied: $(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'") tables"

echo "=== 4. migrations (filename order) ==="
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  MIG_NAME=$(basename "$MIG_FILE")
  pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" \
     > "$OUT/migration.out" 2> "$OUT/migration.err" || {
       grep -E "ERROR|DETAIL" "$OUT/migration.err" | head -10 >&2
       fail "migration $MIG_NAME"
     }
  echo "    applied $MIG_NAME"
done
echo "    tables: $(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'")"

echo "=== 4b. module flags Realtime publication ==="
REALTIME_FLAG_ROWS=$(pq -d "$DB" -tAc "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='platform_module_flags'")
[ "$REALTIME_FLAG_ROWS" = "1" ] || fail "platform_module_flags is not in supabase_realtime"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/migrations/20261101000004_platform_module_realtime.sql" \
  > "$OUT/migration-004-repeat.out" 2> "$OUT/migration-004-repeat.err" \
  || fail "migration 004 is not idempotent on reapply"
REALTIME_FLAG_ROWS=$(pq -d "$DB" -tAc "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='platform_module_flags'")
[ "$REALTIME_FLAG_ROWS" = "1" ] || fail "reapplying migration 004 duplicated/removed the publication entry"
echo "    platform_module_flags is published once; migration 004 reapply passed"

echo "=== 4c. active-admin listing policy idempotency ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/supabase/migrations/20261101072320_active_admin_marketplace_listing_rls.sql" \
  > "$OUT/admin-listing-policy-reapply.out" 2>&1 \
  || fail "reapplying active-admin listing policy migration"
ACTIVE_ADMIN_POLICIES=$(pq -d "$DB" -tAc "select count(*) from pg_policies where schemaname='public' and tablename='listings' and policyname='Active admins manage all listings'")
[ "$ACTIVE_ADMIN_POLICIES" = "1" ] || fail "reapplying active-admin listing migration changed policy count"
echo "    active-admin listing policy is present once after reapply"

echo "=== 4d. admin stay inventory migration idempotency ==="
STAY_MIGRATION="$REPO_ROOT/supabase/migrations/20261101073937_admin_stay_inventory_safety.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$STAY_MIGRATION" \
  > "$OUT/admin-stay-migration-reapply.out" 2> "$OUT/admin-stay-migration-reapply.err" \
  || fail "reapplying admin stay inventory migration"
STAY_ADMIN_RPC=$(pq -d "$DB" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_upsert_stay_inventory'")
[ "$STAY_ADMIN_RPC" = "1" ] || fail "admin stay inventory RPC missing or duplicated after reapply"
STAY_DELETE_POLICIES=$(pq -d "$DB" -tAc "select count(*) from pg_policies where schemaname='public' and tablename in ('stay_properties','stay_room_types','stay_units','stay_blocks') and cmd in ('DELETE','ALL')")
[ "$STAY_DELETE_POLICIES" = "0" ] || fail "stay inventory still has a broad/delete RLS policy"
echo "    atomic stay RPC present once; authenticated delete policies remain absent"

echo "=== 4e. App Builder migration idempotency + Realtime ==="
APP_CONFIG_MIGRATION="$REPO_ROOT/supabase/migrations/20261101075829_app_builder_config_versions.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$APP_CONFIG_MIGRATION" \
  > "$OUT/app-config-migration-reapply.out" 2> "$OUT/app-config-migration-reapply.err" \
  || fail "reapplying App Builder config migration"
APP_CONFIG_TABLE=$(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public' and tablename='platform_config_versions'")
APP_CONFIG_REALTIME=$(pq -d "$DB" -tAc "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='platform_config_versions'")
[ "$APP_CONFIG_TABLE" = "1" ] || fail "App Builder config table is missing/duplicated"
[ "$APP_CONFIG_REALTIME" = "1" ] || fail "App Builder config table is not published for Realtime"
echo "    App Builder table and Realtime membership survive migration reapply"

echo "=== 4f. App Builder authorization, versioning, validation ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/app_builder_config_test.sql" > "$OUT/app-config.out" 2>&1 \
  || fail "App Builder configuration tests (see $OUT/app-config.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/app-config.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
grep -E '^psql:.*(ERROR|WARNING):' "$OUT/app-config.out" | sed 's/^/    /' || true
APP_CONFIG_PASS=$(grep -c "NOTICE:  PASS" "$OUT/app-config.out" || true)
APP_CONFIG_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/app-config.out" || true)
APP_CONFIG_SQL_ERRORS=$(grep -Ec '^psql:.*ERROR:' "$OUT/app-config.out" || true)
echo "    PASS=$APP_CONFIG_PASS FAIL=$APP_CONFIG_FAIL"

echo "=== 5. functional suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/stay_inventory_test.sql" > "$OUT/functional.out" 2>&1
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/functional.out" \
  | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
grep -E '^psql:.*(ERROR|WARNING):' "$OUT/functional.out" | sed 's/^/    /' || true
PASS_COUNT=$(grep -c "NOTICE:  PASS" "$OUT/functional.out" || true)
FAIL_COUNT=$(grep -c "NOTICE:  FAIL" "$OUT/functional.out" || true)
echo "    PASS=$PASS_COUNT FAIL=$FAIL_COUNT"

echo "=== 5b. provider contact suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/provider_contact_test.sql" > "$OUT/contact.out" 2>&1
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/contact.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
CONTACT_PASS=$(grep -c "NOTICE:  PASS" "$OUT/contact.out" || true)
CONTACT_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/contact.out" || true)
echo "    PASS=$CONTACT_PASS FAIL=$CONTACT_FAIL"

echo "=== 6. concurrency: two guests, two units, identical dates ==="
pq -d "$DB" -q -c "update platform_module_flags set allow_online_booking = true where module_key='hotels';" >/dev/null
(
  pq -d "$DB" > "$OUT/session_a.out" 2>&1 <<'SQLA'
\set ON_ERROR_STOP 1
begin;
set local test.uid = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
select count(*) as units_held_by_a
  from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2027-06-01','2027-06-03',2);
\! touch "$BOS_LOCAL_VALIDATION_BARRIER"
select pg_sleep(4);
commit;
SQLA
) &
A_PID=$!
for _ in $(seq 1 100); do [ -f "$BARRIER" ] && break; sleep 0.1; done
[ -f "$BARRIER" ] || { kill "$A_PID" 2>/dev/null; fail "session A never reached the barrier"; }

pq -d "$DB" > "$OUT/session_b.out" 2>&1 <<'SQLB'
\set ON_ERROR_STOP 1
set test.uid = '33333333-3333-3333-3333-333333333333';
set role authenticated;
select count(*) as units_held_by_b
  from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2027-06-01','2027-06-03',2);
SQLB
B_EXIT=$?
wait "$A_PID"; A_EXIT=$?

A_HELD=$(grep -Eo '^ +[0-9]+$' "$OUT/session_a.out" | head -1 | tr -d ' ')
echo "    session A: exit=$A_EXIT units_held=${A_HELD:-<none>}"
echo "    session B: exit=$B_EXIT $(grep -Eo 'INSUFFICIENT_AVAILABILITY|SEAT_TAKEN_BY_ANOTHER_GUEST' "$OUT/session_b.out" | head -1)"
DUPES=$(pq -d "$DB" -tAc "
  select count(*) from (
    select unit_id from public.stay_allocations
     where status in ('held','confirmed')
       and stay_dates && daterange('2027-06-01','2027-06-03','[)')
     group by unit_id having count(*) > 1
  ) d;")
BLOCKING=$(pq -d "$DB" -tAc "
  select count(*) from public.stay_allocations
   where stay_dates && daterange('2027-06-01','2027-06-03','[)')
     and status in ('held','confirmed');")
echo "    units holding two blocking allocations: $DUPES (must be 0)"
echo "    blocking allocations for those dates:   $BLOCKING (must be 2)"

echo "=== 7. verdict ==="
[ "$FAIL_COUNT" = "0" ]        || fail "$FAIL_COUNT functional assertion(s) failed"
[ "$CONTACT_FAIL" = "0" ]      || fail "$CONTACT_FAIL provider contact assertion(s) failed"
[ "$APP_CONFIG_FAIL" = "0" ]  || fail "$APP_CONFIG_FAIL App Builder assertion(s) failed"
[ "$APP_CONFIG_SQL_ERRORS" = "0" ] || fail "$APP_CONFIG_SQL_ERRORS App Builder SQL error(s) occurred"
[ "$A_EXIT" = "0" ]            || fail "session A should have succeeded"
[ "${A_HELD:-0}" = "2" ]       || fail "session A should have held exactly 2 units"
[ "$B_EXIT" != "0" ]           || fail "session B should have been refused"
[ "$DUPES" = "0" ]             || fail "double booking detected"
[ "$BLOCKING" = "2" ]          || fail "expected exactly 2 blocking allocations"

echo "    ALL CHECKS PASSED (functional=$PASS_COUNT, contact=$CONTACT_PASS, app_config=$APP_CONFIG_PASS, concurrency=1, no double booking)"
echo "    logs: $OUT"
