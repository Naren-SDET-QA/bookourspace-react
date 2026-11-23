#!/usr/bin/env bash
# =============================================================================
# End-to-end PostgreSQL provider listing slice validation.
#
# Creates a THROWAWAY PostgreSQL cluster, applies the baseline schema and every
# migration, seeds two providers plus an admin, then drives the real Express API
# with signed session tokens. The server is restarted mid-run to prove that data
# lives in PostgreSQL rather than process memory.
#
# It never contacts Supabase, never reads cloud credentials and never touches
# any existing database. The temporary directory is removed on exit.
#
# Usage: bash supabase/tests/run_pg_integration.sh
# Exit:  0 = every HTTP and SQL assertion passed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-pg-integration.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace PostgreSQL integration scratch directory" > "$TMP_ROOT/.bos-pg-integration-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
HMRPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
APIPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_pg_it
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECRET="integration-only-hmac-secret"
STORE="$TMP_ROOT/authoritative-store.json"
SERVER_PID=""
mkdir -p "$OUT"

UUID_A="11111111-1111-4111-8111-111111111111"
UUID_B="22222222-2222-4222-8222-222222222222"
UUID_ADMIN="33333333-3333-4333-8333-333333333333"
UUID_CUSTOMER="44444444-4444-4444-8444-444444444444"
UUID_CUSTOMER_B="55555555-5555-4555-8555-555555555555"
# One approved business per provider, matching the provider business gate in
# server.ts: an admin-approved, enabled business whose module is approved and
# whose owner holds an active membership. A single active membership is derived
# server-side, so the tests exercise the derivation path and never send
# x-business-id for A or B.
BIZ_A="a1a1a1a1-1111-4111-8111-aaaaaaaaaaa1"
BIZ_A_CLASSES="c3c3c3c3-3333-4333-8333-ccccccccccc3"
BIZ_B="b2b2b2b2-2222-4222-8222-bbbbbbbbbbb2"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    for _ in $(seq 1 50); do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 0.2
    done
    kill -9 "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
}

cleanup() {
  stop_server
  # Diagnostic escape hatch: keep the scratch directory (and its server.log)
  # so a failed run can be inspected. Off by default; never used in CI.
  if [ "${BOS_KEEP_PG_INTEGRATION:-0}" = "1" ]; then
    echo "    preserved integration scratch at $TMP_ROOT"
    return 0
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
marker = root / '.bos-pg-integration-owned'
if root.parent != base or not root.name.startswith('bos-pg-integration.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace PostgreSQL integration scratch directory':
    raise SystemExit('Refusing cleanup: scratch ownership marker did not match')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

start_server() {
  BOS_PG_URL="" \
  BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
  BOS_SERVER_HMAC_SECRET="$SECRET" \
  NODE_ENV=test \
  DISABLE_HMR=false \
  BOS_VITE_HMR_PORT="$HMRPORT" \
  VITE_ENABLE_DEMO_DATA=false \
  PORT="$APIPORT" \
  VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PROJECT_ID="local" VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
  VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" \
  BOS_TEST_AUTHORITATIVE_STORE_PATH="$STORE" \
  npx tsx server.ts > "$OUT/server.log" 2>&1 &
  SERVER_PID=$!
  # The disposable browser build invalidates Vite's dependency cache, so the
  # first boot after it can spend a while re-optimising dependencies. Allow a
  # generous window before declaring the API dead.
  for _ in $(seq 1 500); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/auth/me" 2>/dev/null || true)
    [ "$CODE" = "401" ] && return 0
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.2
  done
  tail -30 "$OUT/server.log" >&2
  return 1
}

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
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade
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
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" \
   > "$OUT/baseline.out" 2> "$OUT/baseline.err" || fail "baseline schema (see $OUT/baseline.err)"
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" \
     > "$OUT/migration.out" 2> "$OUT/migration.err" || {
       echo "migration failed: $(basename "$MIG_FILE")" >&2
       grep -E "ERROR|DETAIL" "$OUT/migration.err" | head -5 >&2
       exit 1
     }
done
echo "    tables=$(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'") indexes=$(pq -d "$DB" -tAc "select count(*) from pg_indexes where schemaname='public'")"

echo "=== 3b. disposable browser build (demo fixtures disabled) ==="
VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PROJECT_ID="local" VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" VITE_ENABLE_DEMO_DATA=false \
  npx vite build --outDir "$TMP_ROOT/dist" --emptyOutDir \
  > "$OUT/pg-ui-build.out" 2>&1 || { tail -35 "$OUT/pg-ui-build.out" >&2; fail "PG browser test build"; }
[ -f "$TMP_ROOT/dist/index.html" ] || fail "PG browser test bundle missing"
echo "    fresh static UI bundle ready; external app requests are blocked by the Playwright test"
IDEMPOTENCY_INDEX=$(pq -d "$DB" -tAc "select count(*) from pg_indexes where schemaname='public' and indexname='uniq_listings_owner_request_id'")
[ "$IDEMPOTENCY_INDEX" = "1" ] || fail "idempotency index missing"
echo "    idempotency index present"

echo "=== 4. seed identities and provider business context ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL || fail "seed identities"
insert into auth.users (id, email, raw_user_meta_data) values
  ('$UUID_A', 'provider.a@example.test', '{}'),
  ('$UUID_B', 'provider.b@example.test', '{}'),
  ('$UUID_ADMIN', 'admin@example.test', '{}'),
  ('$UUID_CUSTOMER', 'customer.c@example.test', '{}'),
  ('$UUID_CUSTOMER_B', 'customer.b@example.test', '{}')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role, account_status) values
  ('$UUID_A', 'provider.a@example.test', 'Provider A', 'provider', 'active'),
  ('$UUID_B', 'provider.b@example.test', 'Provider B', 'provider', 'active'),
  ('$UUID_ADMIN', 'admin@example.test', 'Admin', 'admin', 'active'),
  ('$UUID_CUSTOMER', 'customer.c@example.test', 'Customer', 'customer', 'active'),
  ('$UUID_CUSTOMER_B', 'customer.b@example.test', 'Customer B', 'customer', 'active')
on conflict (id) do update set role = excluded.role, email = excluded.email, account_status = 'active';

-- Listing visibility for a non-owning administrator is assignment-scoped by
-- the Live Edit security layer; only a Super Admin is platform-wide. This
-- fixture is the platform Super Admin used by the "sees every listing" check.
update public.profiles set is_super_admin = true where id = '$UUID_ADMIN';

-- Provider business context. The gate in server.ts requires an approved, enabled
-- business, an approved module access row and an active membership before any
-- provider route runs; without these every provider call answers
-- 403 BUSINESS_CONTEXT_REQUIRED.
--
-- A business is approved for exactly ONE module, and a listing must live in a
-- business of its own module (providerListingRepository asserts that). Provider
-- A therefore owns both a pg_hostels and a classes business, which also makes A a
-- multi-business owner: A's requests send an explicit x-business-id selection,
-- while provider B's single membership exercises the server-side derivation.
insert into public.businesses
  (id, business_ref, name, module_type, owner_user_id, approval_status, is_enabled, backfill_source, created_by, approved_at)
values
  ('$BIZ_A', 'it-provider-a-pg', 'Provider A PG', 'pg_hostels', '$UUID_A', 'approved', true, 'integration_test', '$UUID_A', now()),
  ('$BIZ_A_CLASSES', 'it-provider-a-classes', 'Provider A Classes', 'classes', '$UUID_A', 'approved', true, 'integration_test', '$UUID_A', now()),
  ('$BIZ_B', 'it-provider-b-pg', 'Provider B PG', 'pg_hostels', '$UUID_B', 'approved', true, 'integration_test', '$UUID_B', now())
on conflict (business_ref) do update
  set approval_status = 'approved', is_enabled = true, owner_user_id = excluded.owner_user_id;

insert into public.business_module_access (business_id, module_type, enabled, approval_status, approved_at)
values
  ('$BIZ_A', 'pg_hostels', true, 'approved', now()),
  ('$BIZ_A_CLASSES', 'classes', true, 'approved', now()),
  ('$BIZ_B', 'pg_hostels', true, 'approved', now())
on conflict (business_id, module_type) do update
  set enabled = true, approval_status = 'approved', approved_at = now();

insert into public.business_members (business_id, user_id, role, status, accepted_at)
values
  ('$BIZ_A', '$UUID_A', 'owner', 'active', now()),
  ('$BIZ_A_CLASSES', '$UUID_A', 'owner', 'active', now()),
  ('$BIZ_B', '$UUID_B', 'owner', 'active', now())
on conflict (business_id, user_id) do update
  set role = 'owner', status = 'active', accepted_at = now();

-- Signup defaults grant a new customer VIEW only. The PG booking journey
-- exercises the booking actions an administrator would grant explicitly, so the
-- two customer fixtures carry that grant instead of failing at the gate.
insert into public.customer_module_access (user_id, module_key, allowed_actions, grant_source)
values
  ('$UUID_CUSTOMER', 'pg', '["view","create","edit","delete"]'::jsonb, 'manual'),
  ('$UUID_CUSTOMER_B', 'pg', '["view","create","edit","delete"]'::jsonb, 'manual')
on conflict (user_id, module_key) do update
  set allowed_actions = excluded.allowed_actions, grant_source = 'manual';
SQL
cat > "$STORE" <<JSON
{"seatLocks":{},"bookings":[],"enquiries":[],"paymentIntents":{},"usedUtrs":{},"checkedInPasses":{},"users":[
  {"id":"LEGACY-provider","supabaseUserId":"$UUID_A","name":"Local E2E Provider","email":"provider.a@example.test","phone":"","role":"provider","providerId":"provider-$UUID_A","googleSub":"local-test-provider","authProvider":"google","verified":true,"kycDocument":"","accountStatus":"active","city":"Test City","joinedAt":"2026-11-03T00:00:00.000Z","lastLoginAt":"2026-11-03T00:00:00.000Z","listingsCount":0,"bookingsCount":0,"totalSpentOrEarned":0,"permissions":[],"publishState":"published"},
  {"id":"LEGACY-customer","supabaseUserId":"$UUID_CUSTOMER","name":"Local E2E Customer","email":"customer.c@example.test","phone":"","role":"customer","googleSub":"local-test-customer","authProvider":"google","verified":true,"kycDocument":"","accountStatus":"active","city":"Test City","joinedAt":"2026-11-03T00:00:00.000Z","lastLoginAt":"2026-11-03T00:00:00.000Z","listingsCount":0,"bookingsCount":0,"totalSpentOrEarned":0,"permissions":[],"publishState":"published"}
],"notifications":[],"notificationCampaigns":[],"providerListings":{},"adminModules":{},"revokedTokens":{}}
JSON
STORE_HASH_BEFORE=$(shasum -a 256 "$STORE" | awk '{print $1}')

echo "=== 5. start API (PostgreSQL mode) ==="
start_server || fail "API did not become ready (see $OUT/server.log)"
echo "    listening on 127.0.0.1:$APIPORT"

echo "=== 6. phase 1: create / ownership / idempotency / conflict safety ==="
node "$REPO_ROOT/tests/pg-listings.integration.mjs" phase1 \
  "http://127.0.0.1:$APIPORT" "$SECRET" "$UUID_A" "$UUID_B" "$UUID_ADMIN" "$UUID_CUSTOMER" \
  "$BIZ_A" "$BIZ_A_CLASSES" "$BIZ_B" \
  | tee "$OUT/phase1.out"
PHASE1_EXIT=${PIPESTATUS[0]}
[ "$PHASE1_EXIT" = "0" ] || fail "phase 1 HTTP assertions failed"

ROWS_A=$(pq -d "$DB" -tAc "select count(*) from public.listings where owner_id='$UUID_A'")
DUPLICATE_ROWS=$(pq -d "$DB" -tAc "select count(*) from public.listings where id='lst-it-a-001'")
echo "    SQL: provider A rows=$ROWS_A (expected 2) duplicate-id rows=$DUPLICATE_ROWS (expected 1)"
[ "$ROWS_A" = "2" ] || fail "failed transaction left a partial row (A rows=$ROWS_A)"
[ "$DUPLICATE_ROWS" = "1" ] || fail "duplicate id produced $DUPLICATE_ROWS rows"

echo "=== 7. direct RLS check as each provider ==="
RlsCount() {
  pq -q -d "$DB" -tAc "begin; set local test.uid='$1'; set local role authenticated; select count(*) from public.listings where id='lst-it-a-001'; commit;" 2>/dev/null | tr -d ' '
}
A_SEES=$(RlsCount "$UUID_A")
B_SEES=$(RlsCount "$UUID_B")
echo "    RLS rows visible: A=$A_SEES B=$B_SEES (expected 1 and 0)"
[ "$A_SEES" = "1" ] || fail "owner cannot see own listing through RLS"
[ "$B_SEES" = "0" ] || fail "RLS leaked A's listing to B"

STORE_HASH_AFTER=$(shasum -a 256 "$STORE" | awk '{print $1}')
[ "$STORE_HASH_BEFORE" = "$STORE_HASH_AFTER" ] || fail "JSON authoritative store was modified by PostgreSQL routes"
echo "    JSON store untouched (sha256 unchanged)"

echo "=== 8. restart API ==="
stop_server
start_server || fail "API did not restart (see $OUT/server.log)"
echo "    restarted on 127.0.0.1:$APIPORT"

echo "=== 9. phase 2: persistence and isolation after restart ==="
node "$REPO_ROOT/tests/pg-listings.integration.mjs" phase2 \
  "http://127.0.0.1:$APIPORT" "$SECRET" "$UUID_A" "$UUID_B" "$UUID_ADMIN" "$UUID_CUSTOMER" \
  "$BIZ_A" "$BIZ_A_CLASSES" "$BIZ_B" \
  | tee "$OUT/phase2.out"
PHASE2_EXIT=${PIPESTATUS[0]}
[ "$PHASE2_EXIT" = "0" ] || fail "phase 2 HTTP assertions failed"

ARCHIVED_ROWS=$(pq -d "$DB" -tAc "select count(*) from public.listings where id='lst-it-a-001' and status='archived'")
echo "    SQL: deactivated row still present and archived=$ARCHIVED_ROWS (expected 1)"
[ "$ARCHIVED_ROWS" = "1" ] || fail "deactivation did not persist as a soft delete"

echo "=== 9a. leave provider A with one active business for downstream journeys ==="
# A's second (classes) business exists only to prove that a listing must live in
# a business of its own module; the listing assertions above ran with it active.
# Disabling it afterwards leaves A with exactly one active business, which is the
# shape the product UI can drive today: the browser client attaches x-business-id
# from a stored selection and there is no headless way to choose between two
# businesses. Every downstream journey therefore uses server-side derivation.
pq -d "$DB" -q -v ON_ERROR_STOP=1 \
   -c "update public.businesses set is_enabled = false where id = '$BIZ_A_CLASSES';" \
   || fail "could not deactivate the second business fixture"
DISABLED=$(pq -d "$DB" -tAc "select count(*) from public.businesses where id='$BIZ_A_CLASSES' and is_enabled=false")
[ "$DISABLED" = "1" ] || fail "second business fixture still enabled"
echo "    classes business fixture deactivated; A now has one active business"

echo "=== 9b. PG owner → inventory → reservation / cancellation HTTP integration ==="
BOS_TEST_PGPORT="$PGPORT" BOS_TEST_PGDB="$DB" node "$REPO_ROOT/tests/pg-bookings.integration.mjs" phase1 \
  "http://127.0.0.1:$APIPORT" "$SECRET" "$UUID_A" "$UUID_B" "$UUID_ADMIN" "$UUID_CUSTOMER" "$UUID_CUSTOMER_B" "$TMP_ROOT/dist" "$BIZ_A" \
  | tee "$OUT/pg-phase1.out"
PG_PHASE1_EXIT=${PIPESTATUS[0]}
if [ "$PG_PHASE1_EXIT" != "0" ]; then
  tail -50 "$OUT/server.log" >&2
  fail "PG booking phase 1 assertions failed"
fi

PG_BOOKING_ID=$(pq -d "$DB" -tAc "select id from public.bookings where listing_id='lst-pg-booking-e2e' and user_id='$UUID_CUSTOMER' and payload->>'source'='pg_booking' and status='confirmed' order by created_at limit 1" | tr -d ' ')
[ -n "$PG_BOOKING_ID" ] || fail "PG booking was not persisted"
CUSTOMER_B_CAN_SEE=$(pq -q -d "$DB" -tAc "begin; set local test.uid='$UUID_CUSTOMER_B'; set local role authenticated; select count(*) from public.bookings where id='$PG_BOOKING_ID'; commit;" 2>/dev/null | tr -d ' ')
[ "$CUSTOMER_B_CAN_SEE" = "0" ] || fail "booking RLS leaked customer A reservation to customer B"
echo "    RLS: second customer cannot read first customer's PG booking"

echo "=== 9c. restart API and prove PG reservation persistence ==="
stop_server
start_server || fail "API did not restart for PG persistence check"
BOS_TEST_PGPORT="$PGPORT" BOS_TEST_PGDB="$DB" node "$REPO_ROOT/tests/pg-bookings.integration.mjs" phase2 \
  "http://127.0.0.1:$APIPORT" "$SECRET" "$UUID_A" "$UUID_B" "$UUID_ADMIN" "$UUID_CUSTOMER" "$UUID_CUSTOMER_B" "$TMP_ROOT/dist" "$BIZ_A" \
  | tee "$OUT/pg-phase2.out"
PG_PHASE2_EXIT=${PIPESTATUS[0]}
if [ "$PG_PHASE2_EXIT" != "0" ]; then
  tail -50 "$OUT/server.log" >&2
  fail "PG booking phase 2 assertions failed"
fi

echo "=== 9d. provider application → Admin console → PG owner/customer browser journey ==="
BOS_TEST_PGPORT="$PGPORT" BOS_TEST_PGDB="$DB" node "$REPO_ROOT/tests/pg-admin-console-e2e.mjs" \
  "http://127.0.0.1:$APIPORT" "$SECRET" "$UUID_CUSTOMER" "$UUID_CUSTOMER_B" "$UUID_ADMIN" "$TMP_ROOT/dist" \
  | tee "$OUT/pg-admin-console-e2e.out"
ADMIN_CONSOLE_EXIT=${PIPESTATUS[0]}
[ "$ADMIN_CONSOLE_EXIT" = "0" ] || fail "PG provider/Admin console/customer browser E2E failed"

echo "=== 10. verdict ==="
echo "    PASS state=persisted rows=$ROWS_A rls_isolation=verified conflict_atomicity=verified pg_bookings=verified json_store=untouched"
echo "    logs: $OUT"
