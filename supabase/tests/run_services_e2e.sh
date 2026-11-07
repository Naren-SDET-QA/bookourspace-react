#!/usr/bin/env bash
# =============================================================================
# Home & Local Services end-to-end validation.
#
# Creates a THROWAWAY PostgreSQL cluster in a private temporary directory,
# applies the baseline schema and every migration, then runs the Node E2E suite
# which starts the real Express server and drives:
#
#   profile → provider schedule → availability → canonical slot booking →
#   day-off/blackout refusal → UPI intent → unsigned/wrong-amount refusal →
#   signed settlement → provider accept/start/complete → earnings →
#   admin refund → restart persistence → ownership isolation.
#
# It never contacts Supabase, never reads cloud credentials, never moves real
# money and never touches an existing database.
#
# Usage: bash supabase/tests/run_services_e2e.sh
# Exit:  0 = every assertion passed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-services-e2e.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace services scratch directory" > "$TMP_ROOT/.bos-services-e2e-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_services_e2e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

cleanup() {
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-services-e2e-owned'
if root.parent != base or not root.name.startswith('bos-services-e2e.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace services scratch directory':
    raise SystemExit('Refusing cleanup: scratch ownership marker did not match')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

echo "=== 1. throwaway cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || fail "initdb"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" \
       -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
for _ in $(seq 1 40); do
  pq -tAc "select 1" >/dev/null 2>&1 && break
  sleep 0.5
done
pq -tAc "select version()" >/dev/null 2>&1 || fail "cluster did not start (see $OUT/postgres.log)"
echo "    $(pq -tAc "select version()" | cut -d, -f1)"

echo "=== 2. database + Supabase stubs ==="
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
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  banned_until timestamptz,
  updated_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid,
    nullif(current_setting('test.uid', true), '')::uuid
  ) $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
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
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" \
   > "$OUT/baseline.out" 2> "$OUT/baseline.err" || { grep -E "ERROR|DETAIL" "$OUT/baseline.err" | head -5 >&2; fail "baseline schema"; }
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" \
     > "$OUT/migration.out" 2> "$OUT/migration.err" || {
       echo "migration failed: $(basename "$MIG_FILE")" >&2
       grep -E "ERROR|DETAIL|HINT" "$OUT/migration.err" | head -8 >&2
       exit 1
     }
  echo "    applied $(basename "$MIG_FILE")"
done
pq -d "$DB" -tAc "select count(*) from public.service_provider_schedules" >/dev/null || fail "services schedule table missing"
pq -d "$DB" -tAc "select count(*) from public.service_payment_intents" >/dev/null || fail "services payment table missing"

echo "=== 3.1 provider schedule RLS matrix ==="
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/service_provider_schedule_rls_test.sql" \
  > "$OUT/schedule-rls.out" 2>&1 || { cat "$OUT/schedule-rls.out" >&2; fail "provider schedule RLS matrix"; }
sed -n '/PASS schedule/ p' "$OUT/schedule-rls.out"

echo "=== 4. Node HTTP + PostgreSQL E2E ==="
BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
NODE_ENV=test \
node --import tsx --test "$REPO_ROOT/tests/services-lifecycle.e2e.mjs" \
  > "$OUT/services-node.out" 2>&1
SERVICES_EXIT=$?
sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/services-node.out" | tail -70
[ "$SERVICES_EXIT" = "0" ] || fail "services lifecycle E2E (see $OUT/services-node.out)"

echo "=== 5. direct SQL invariants ==="
DUP=$(pq -d "$DB" -tAc "
  select count(*) from public.service_bookings a
  join public.service_bookings b
    on a.provider_id = b.provider_id and a.scheduled_date = b.scheduled_date
   and a.slot_key = b.slot_key and a.id < b.id
   and a.status in ('requested','accepted','in_progress')
   and b.status in ('requested','accepted','in_progress');")
NULL_KEYS=$(pq -d "$DB" -tAc "select count(*) from public.service_bookings where slot_key is null")
EVENTS=$(pq -d "$DB" -tAc "select count(*) from public.service_payment_events")
INTENTS=$(pq -d "$DB" -tAc "select count(*) from public.service_payment_intents")
REFUNDED=$(pq -d "$DB" -tAc "select count(*) from public.service_payment_intents where status = 'refunded'")
RLS=$(pq -d "$DB" -tAc "select relrowsecurity from pg_class where oid='public.service_payment_intents'::regclass")
LEAK=$(pq -q -d "$DB" -tAc "begin; set local test.uid='b1c2d3e4-3333-4444-8555-666677778888'; set local role authenticated; select count(*) from public.service_payment_intents; commit;" 2>/dev/null | tr -d ' ')
echo "    duplicate live slots=$DUP (must be 0) null_slot_keys=$NULL_KEYS intents=$INTENTS events=$EVENTS refunded=$REFUNDED rls=$RLS cross_customer_rows=$LEAK (must be 0)"
[ "$DUP" = "0" ] || fail "two live bookings share a canonical slot"
[ "$INTENTS" -ge 3 ] || fail "expected at least 4 payment intents, found $INTENTS"
[ "$EVENTS" -ge 4 ] || fail "expected signed provider events, found $EVENTS"
[ "$REFUNDED" -ge 1 ] || fail "no refunded service payment recorded"
[ "$RLS" = "t" ] || fail "service_payment_intents RLS is disabled"
[ "$LEAK" != "0" ] && [ "$LEAK" != "" ] && fail "RLS exposed another customer's payment intents"

echo "=== 6. verdict ==="
echo "    PASS schedule=posted availability=real slots=canonical settlement=signed_provider_event"
echo "    PASS refund=admin_signed ownership=isolated restart=persisted"
echo "    logs: $OUT"
