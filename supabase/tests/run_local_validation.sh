#!/usr/bin/env bash
# =============================================================================
# Local database validation for BookOurSpace migration 002.
#
# Creates a THROWAWAY PostgreSQL 17 cluster under /tmp, applies the existing
# baseline schema (supabase/schema_and_rls.sql) followed by migration 002, then
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

PGPORT="${PGPORT:-55432}"
PGDATA="${PGDATA:-/tmp/bos_pg17_dev}"
DB=bos_dev
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT=/tmp/bos_validation
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

echo "=== 1. throwaway cluster ==="
if [ -d "$PGDATA" ]; then
  pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
fi
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 \
  || fail "initdb (see $OUT/initdb.log)"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" \
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
create extension if not exists pgcrypto;
SQL

echo "=== 3. baseline schema ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" \
   > "$OUT/baseline.out" 2> "$OUT/baseline.err" || fail "baseline schema (see $OUT/baseline.err)"
echo "    applied: $(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'") tables"

echo "=== 4. migration 002 ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 \
   -f "$REPO_ROOT/supabase/migrations/20261101000002_marketplace_modules_and_stay_inventory.sql" \
   > "$OUT/migration.out" 2> "$OUT/migration.err" || {
     grep -E "ERROR|DETAIL" "$OUT/migration.err" | head -10 >&2
     fail "migration 002"
   }
echo "    applied: $(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'") tables total"

echo "=== 5. functional suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/stay_inventory_test.sql" > "$OUT/functional.out" 2>&1
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/functional.out" \
  | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
PASS_COUNT=$(grep -c "NOTICE:  PASS" "$OUT/functional.out" || true)
FAIL_COUNT=$(grep -c "NOTICE:  FAIL" "$OUT/functional.out" || true)
echo "    PASS=$PASS_COUNT FAIL=$FAIL_COUNT"

echo "=== 6. concurrency: two guests, two units, identical dates ==="
pq -d "$DB" -q -c "update platform_module_flags set allow_online_booking = true where module_key='hotels';" >/dev/null
rm -f /tmp/bos_barrier
(
  pq -d "$DB" > "$OUT/session_a.out" 2>&1 <<'SQLA'
\set ON_ERROR_STOP 1
begin;
set local test.uid = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
select count(*) as units_held_by_a
  from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2027-06-01','2027-06-03',2);
\! touch /tmp/bos_barrier
select pg_sleep(4);
commit;
SQLA
) &
A_PID=$!
for _ in $(seq 1 100); do [ -f /tmp/bos_barrier ] && break; sleep 0.1; done
[ -f /tmp/bos_barrier ] || { kill "$A_PID" 2>/dev/null; fail "session A never reached the barrier"; }

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
[ "$A_EXIT" = "0" ]            || fail "session A should have succeeded"
[ "${A_HELD:-0}" = "2" ]       || fail "session A should have held exactly 2 units"
[ "$B_EXIT" != "0" ]           || fail "session B should have been refused"
[ "$DUPES" = "0" ]             || fail "double booking detected"
[ "$BLOCKING" = "2" ]          || fail "expected exactly 2 blocking allocations"

echo "    ALL CHECKS PASSED (functional=$PASS_COUNT, concurrency=1, no double booking)"
echo "    logs: $OUT"
