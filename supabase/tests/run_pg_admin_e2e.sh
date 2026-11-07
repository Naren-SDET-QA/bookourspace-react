#!/usr/bin/env bash
# =============================================================================
# PG & Hostels administrator operations, disputes, claims and invoices.
#
# Creates a THROWAWAY PostgreSQL cluster, applies the baseline schema and every
# migration, seeds a PG owner, two customers, a second provider and an
# administrator, then drives the real Express API:
#
#   1. invoices that never claim an unpaid reservation is paid
#   2. fee waivers that only a super-administrator session can perform
#   3. disputes with evidence, isolation and a resolution history
#   4. owner-declared cash collection approved by an administrator
#   5. Razorpay reservations that only a Razorpay event can settle
#   6. refund approval followed by provider reconciliation
#   7. an append-only administrator audit trail
#   8. a server restart, then persistence re-checked
#
# It never contacts Supabase, never reads cloud credentials, never moves real
# money and never touches an existing database.
#
# Usage: bash supabase/tests/run_pg_admin_e2e.sh
# Exit:  0 = every HTTP and SQL assertion passed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-pg-admin.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace PG admin scratch directory" > "$TMP_ROOT/.bos-pg-admin-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
APIPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
HMRPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_pg_admin
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION_SECRET="pg-admin-e2e-session-secret"
SANDBOX_SECRET="pg-admin-e2e-sandbox-secret-do-not-use-in-production"
STORE="$TMP_ROOT/authoritative-store.json"
SERVER_PID=""
mkdir -p "$OUT"

UUID_PROVIDER="11111111-cccc-4ccc-8ccc-111111111111"
UUID_OTHER="22222222-cccc-4ccc-8ccc-222222222222"
UUID_ADMIN="33333333-cccc-4ccc-8ccc-333333333333"
UUID_A="44444444-cccc-4ccc-8ccc-444444444444"
UUID_B="55555555-cccc-4ccc-8ccc-555555555555"
LISTING="lst-pg-admin-e2e"
RAZORPAY_LISTING="lst-pg-razorpay-e2e"
BROWSER_LISTING="lst-pg-browser-e2e"
BROWSER_PROPERTY="aaaaaaaa-dddd-4eee-8fff-000000000001"
BROWSER_ROOM="bbbbbbbb-dddd-4eee-8fff-000000000002"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    # The runner spawns the server through a wrapper; take the children down
    # as well so that the port is really released before the next start.
    pkill -P "$SERVER_PID" 2>/dev/null || true
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
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import os
import shutil
import sys

root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-pg-admin-owned'
if root.parent != base or not root.name.startswith('bos-pg-admin.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace PG admin scratch directory':
    raise SystemExit('Refusing cleanup: scratch ownership marker did not match')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

start_server() {
  BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
  BOS_SERVER_HMAC_SECRET="$SESSION_SECRET" \
  BOS_PAYMENT_SANDBOX=1 \
  BOS_PAYMENT_SANDBOX_SECRET="$SANDBOX_SECRET" \
  BOS_UPI_MERCHANT_VPA="bookourspace@okhdfcbank" \
  BOS_UPI_MERCHANT_NAME="BookOurSpace" \
  RAZORPAY_KEY_ID="rzp_test_local_only" \
  RAZORPAY_KEY_SECRET="rzp_test_local_only_secret" \
  RAZORPAY_WEBHOOK_SECRET="rzp_test_local_only_webhook_secret" \
  NODE_ENV=test \
  DISABLE_HMR=true \
  BOS_VITE_HMR_PORT="$HMRPORT" \
  VITE_ENABLE_DEMO_DATA=false \
  PORT="$APIPORT" \
  VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PROJECT_ID="local" VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
  VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" \
  BOS_TEST_AUTHORITATIVE_STORE_PATH="$STORE" \
  node_modules/.bin/tsx server.ts > "$OUT/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 400); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/auth/me" 2>/dev/null || true)
    [ "$CODE" = "401" ] && return 0
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.2
  done
  tail -40 "$OUT/server.log" >&2
  return 1
}

echo "=== 1. throwaway cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || { tail -20 "$OUT/initdb.log" >&2; fail "initdb"; }
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
   > "$OUT/baseline.out" 2> "$OUT/baseline.err" || { grep -E "ERROR|DETAIL" "$OUT/baseline.err" | head -5 >&2; fail "baseline schema"; }
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" \
     > "$OUT/migration.out" 2> "$OUT/migration.err" || {
       echo "migration failed: $(basename "$MIG_FILE")" >&2
       grep -E "ERROR|DETAIL|HINT|CONTEXT" "$OUT/migration.err" | head -10 >&2
       exit 1
     }
  echo "    applied $(basename "$MIG_FILE")"
done

echo "=== 4. seed identities and listing ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL || fail "seed"
insert into auth.users (id, email, raw_user_meta_data) values
  ('$UUID_PROVIDER', 'provider.pg@example.test', '{}'),
  ('$UUID_OTHER', 'provider.other@example.test', '{}'),
  ('$UUID_ADMIN', 'admin.pg@example.test', '{}'),
  ('$UUID_A', 'customer.a@example.test', '{}'),
  ('$UUID_B', 'customer.b@example.test', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role, account_status, is_super_admin) values
  ('$UUID_PROVIDER', 'provider.pg@example.test', 'PG Owner', 'provider', 'active', false),
  ('$UUID_OTHER', 'provider.other@example.test', 'Other Owner', 'provider', 'active', false),
  ('$UUID_ADMIN', 'admin.pg@example.test', 'Admin', 'admin', 'active', true),
  ('$UUID_A', 'customer.a@example.test', 'Customer A', 'customer', 'active', false),
  ('$UUID_B', 'customer.b@example.test', 'Customer B', 'customer', 'active', false)
on conflict (id) do update set role = excluded.role, account_status = 'active',
  is_super_admin = excluded.is_super_admin;

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status)
values ('$LISTING', '$UUID_PROVIDER', 'Admin Journey PG', 'pg-boys', 'Triple Sharing', 'pg', 8000, 'per month', 'active')
on conflict (id) do nothing;

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status)
values ('$RAZORPAY_LISTING', '$UUID_PROVIDER', 'Razorpay Journey PG', 'pg-boys', 'Single Sharing', 'pg', 8000, 'per month', 'active')
on conflict (id) do nothing;

update public.platform_module_flags
   set is_enabled = true, allow_online_booking = true
 where module_key = 'pg';
SQL

# Each browser engine gets its own listing with its own beds, so the engines
# cannot consume each other\'s inventory and the HTTP assertions above keep
# their exact counts.
# One listing per browser matrix entry, so an entry can never consume another
# entry's inventory.
MATRIX_ENTRIES=("chromium mobile" "chromium desktop" "firefox mobile" "webkit mobile")
ENGINE_INDEX=1
for MATRIX_ENTRY in "${MATRIX_ENTRIES[@]}"; do
  ENGINE_NAME="${MATRIX_ENTRY%% *}"
  MATRIX_SLUG="$ENGINE_NAME-${MATRIX_ENTRY##* }"
  BROWSER_LISTING="lst-pg-browser-$MATRIX_SLUG"
  BROWSER_PROPERTY="aaaaaaaa-dddd-4eee-8fff-00000000000$ENGINE_INDEX"
  BROWSER_ROOM="bbbbbbbb-dddd-4eee-8fff-00000000000$(( ENGINE_INDEX + 1 ))"
  ENGINE_INDEX=$(( ENGINE_INDEX + 1 ))
  pq -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL || fail "seed browser listing $MATRIX_SLUG"
insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status)
values ('$BROWSER_LISTING', '$UUID_PROVIDER', 'Browser Journey PG $MATRIX_SLUG', 'pg-boys', 'Double Sharing', 'pg', 7500, 'per month', 'active')
on conflict (id) do nothing;
insert into public.stay_properties (id, listing_id, owner_user_id, name, property_type, city, base_price_paise, is_active)
values ('$BROWSER_PROPERTY', '$BROWSER_LISTING', '$UUID_PROVIDER', 'Browser Journey PG $MATRIX_SLUG', 'pg_hostel', 'Test City', 0, true)
on conflict (id) do nothing;
insert into public.stay_room_types (id, property_id, name, max_adults, max_children, base_price_paise, monthly_rent_paise, security_deposit_paise, is_active)
values ('$BROWSER_ROOM', '$BROWSER_PROPERTY', 'Double sharing bed', 2, 0, 0, 750000, 1500000, true)
on conflict (id) do nothing;
insert into public.stay_units (room_type_id, label, is_active) values
  ('$BROWSER_ROOM', 'B1', true),
  ('$BROWSER_ROOM', 'B2', true),
  ('$BROWSER_ROOM', 'B3', true)
on conflict do nothing;
SQL
done

printf '%s' '{"seatLocks":{},"bookings":[],"enquiries":[],"paymentIntents":{},"usedUtrs":{},"checkedInPasses":{},"users":[],"notifications":[],"notificationCampaigns":[],"providerListings":{},"adminModules":{},"revokedTokens":{}}' > "$STORE"
STORE_HASH_BEFORE=$(shasum -a 256 "$STORE" | awk '{print $1}')

echo "=== 5. start API (PostgreSQL + sandbox provider) ==="
start_server || fail "API did not become ready (see $OUT/server.log)"
echo "    listening on 127.0.0.1:$APIPORT"

echo "=== 6. phase 1: admin operations, disputes, claims, invoices ==="
node "$REPO_ROOT/tests/pg-admin-dispute-invoice.e2e.mjs" phase1 \
  "http://127.0.0.1:$APIPORT" "$SESSION_SECRET" "$SANDBOX_SECRET" \
  "$UUID_PROVIDER" "$UUID_OTHER" "$UUID_ADMIN" "$UUID_A" "$UUID_B" \
  | tee "$OUT/phase1.out"
PHASE1_EXIT=${PIPESTATUS[0]}
if [ "$PHASE1_EXIT" != "0" ]; then
  tail -50 "$OUT/server.log" >&2
  fail "phase 1 HTTP assertions failed"
fi

echo "=== 7. direct SQL invariants ==="
AUDIT_ROWS=$(pq -d "$DB" -tAc "select count(*) from public.pg_admin_audit")
AUDIT_IMMUTABLE=$(pq -d "$DB" -tAc "update public.pg_admin_audit set reason='tampered' where id = (select min(id) from public.pg_admin_audit)" 2>&1 | grep -c "PG_AUDIT_IMMUTABLE" || true)
DISPUTES=$(pq -d "$DB" -tAc "select count(*) from public.pg_booking_disputes")
RESOLVED_DISPUTES=$(pq -d "$DB" -tAc "select count(*) from public.pg_booking_disputes where status='resolved'")
CLAIMS=$(pq -d "$DB" -tAc "select count(*) from public.pg_payment_claims where status='approved'")
INVOICES=$(pq -d "$DB" -tAc "select count(*) from public.pg_invoices")
PAID_WITHOUT_PAYMENT=$(pq -d "$DB" -tAc "select count(*) from public.pg_invoices where status='paid' and provider_paid_paise = 0")
# A 'paid' invoice is legitimate while the booking is verified, and also
# after the provider has refunded it (the document is the history of a
# payment that really was reconciled).
PAID_FOR_UNPAID_BOOKING=$(pq -d "$DB" -tAc "
  select count(*) from public.pg_invoices i
   join public.bookings b on b.id = i.booking_id
   where i.status = 'paid' and b.payment_status not in ('verified','refunded')")
OFFLINE_MARKED_VERIFIED=$(pq -d "$DB" -tAc "select count(*) from public.bookings where payment_status='verified' and payload->>'paymentObligation' is not null")
RLS_ON=$(pq -d "$DB" -tAc "select relrowsecurity from pg_class where oid='public.pg_booking_disputes'::regclass")
DISPUTE_LEAK=$(pq -q -d "$DB" -tAc "begin; set local test.uid='$UUID_B'; set local role authenticated; select count(*) from public.pg_booking_disputes; commit;" 2>/dev/null | tr -d ' ')
INVOICE_LEAK=$(pq -q -d "$DB" -tAc "begin; set local test.uid='$UUID_B'; set local role authenticated; select count(*) from public.pg_invoices; commit;" 2>/dev/null | tr -d ' ')

echo "    audit_rows=$AUDIT_ROWS disputes=$DISPUTES resolved=$RESOLVED_DISPUTES approved_claims=$CLAIMS invoices=$INVOICES"
echo "    audit_update_blocked=$AUDIT_IMMUTABLE rls_enabled=$RLS_ON dispute_leak=$DISPUTE_LEAK invoice_leak=$INVOICE_LEAK (both must be 0)"
echo "    paid_invoices_without_money=$PAID_WITHOUT_PAYMENT paid_for_unpaid_booking=$PAID_FOR_UNPAID_BOOKING (both must be 0)"
[ "$AUDIT_IMMUTABLE" = "1" ] || fail "the administrator audit trail could be modified"
[ "$DISPUTES" -ge 1 ] || fail "no dispute was persisted"
[ "$RESOLVED_DISPUTES" -ge 1 ] || fail "no dispute was resolved"
[ "$CLAIMS" -ge 1 ] || fail "no collection claim was approved"
[ "$INVOICES" -ge 2 ] || fail "expected at least 2 invoices, found $INVOICES"
[ "$PAID_WITHOUT_PAYMENT" = "0" ] || fail "an invoice claims a payment without a provider amount"
[ "$PAID_FOR_UNPAID_BOOKING" = "0" ] || fail "a paid invoice exists for a booking that is not provider-verified"
[ "$OFFLINE_MARKED_VERIFIED" = "0" ] || fail "an offline collection was stored as a provider-verified payment"
[ "$RLS_ON" = "t" ] || fail "dispute RLS is disabled"
[ "$DISPUTE_LEAK" = "0" ] || fail "RLS leaked a dispute to a stranger"
[ "$INVOICE_LEAK" = "0" ] || fail "RLS leaked an invoice to a stranger"

echo "=== 8. restart API ==="
stop_server
start_server || fail "API did not restart (see $OUT/server.log)"
echo "    restarted on 127.0.0.1:$APIPORT"

echo "=== 9. phase 2: persistence after restart ==="
PG_ADMIN_E2E_B1=$(pq -d "$DB" -tAc "select id from public.bookings where listing_id='$LISTING' and payload->>'source'='pg_booking' order by created_at limit 1" | tr -d ' ')
PG_ADMIN_E2E_B3=$(pq -d "$DB" -tAc "select id from public.bookings where listing_id='$LISTING' and payment_status='refunded' limit 1" | tr -d ' ')
PG_ADMIN_E2E_B1="$PG_ADMIN_E2E_B1" PG_ADMIN_E2E_B3="$PG_ADMIN_E2E_B3" \
node "$REPO_ROOT/tests/pg-admin-dispute-invoice.e2e.mjs" phase2 \
  "http://127.0.0.1:$APIPORT" "$SESSION_SECRET" "$SANDBOX_SECRET" \
  "$UUID_PROVIDER" "$UUID_OTHER" "$UUID_ADMIN" "$UUID_A" "$UUID_B" \
  | tee "$OUT/phase2.out"
PHASE2_EXIT=${PIPESTATUS[0]}
if [ "$PHASE2_EXIT" != "0" ]; then
  tail -50 "$OUT/server.log" >&2
  fail "phase 2 HTTP assertions failed"
fi

STORE_HASH_AFTER=$(shasum -a 256 "$STORE" | awk '{print $1}')
[ "$STORE_HASH_BEFORE" = "$STORE_HASH_AFTER" ] || fail "JSON authoritative store was modified by the PG admin routes"
echo "    JSON store untouched (sha256 unchanged)"

echo "=== 9b. Razorpay raw-body settlement phase ==="
node "$REPO_ROOT/tests/pg-razorpay-webhook.e2e.mjs" \
  "http://127.0.0.1:$APIPORT" "$SESSION_SECRET" "rzp_test_local_only_webhook_secret" \
  "$UUID_PROVIDER" "$UUID_ADMIN" "$UUID_A" \
  | tee "$OUT/razorpay.out"
RAZORPAY_EXIT=${PIPESTATUS[0]}
if [ "$RAZORPAY_EXIT" != "0" ]; then
  tail -40 "$OUT/server.log" >&2
  fail "the PG Razorpay settlement phase failed"
fi

echo "=== 10. browser journey (Playwright, Chromium) ==="
VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PROJECT_ID="local" VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" VITE_ENABLE_DEMO_DATA=false \
  npx vite build --outDir "$TMP_ROOT/dist" --emptyOutDir \
  > "$OUT/browser-build.out" 2>&1 || { tail -25 "$OUT/browser-build.out" >&2; fail "browser build"; }
[ -f "$TMP_ROOT/dist/index.html" ] || fail "browser bundle missing"
# The full multi-transaction Admin workflow runs in Chromium, Firefox and
# WebKit where their binaries exist, on a mobile viewport, plus a desktop
# viewport on the reference engine. Every engine has its own listing with its
# own beds, so an engine can never consume another engine's inventory.
# BROWSER_MATRIX overrides the matrix with a single "<engine> <viewport>" entry.
if [ -n "${BROWSER_MATRIX:-}" ]; then
  MATRIX_LIST=("$BROWSER_MATRIX")
else
  MATRIX_LIST=("${MATRIX_ENTRIES[@]}")
fi
for MATRIX in "${MATRIX_LIST[@]}"; do
  BROWSER_ENGINE="${MATRIX%% *}"
  BROWSER_VIEWPORT="${MATRIX##* }"
  MATRIX_SLUG="$BROWSER_ENGINE-$BROWSER_VIEWPORT"
  if [ "$BROWSER_ENGINE" != "chromium" ]; then
    ENGINE_BIN=$(node -e "const b=require('playwright')['$BROWSER_ENGINE'];console.log(b.executablePath())" 2>/dev/null || true)
    if [ -z "$ENGINE_BIN" ] || [ ! -e "$ENGINE_BIN" ]; then
      echo "    $BROWSER_ENGINE is not installed here — skipped (documented as BLOCKED)"
      continue
    fi
  fi
  echo "    engine=$BROWSER_ENGINE viewport=$BROWSER_VIEWPORT"
  node "$REPO_ROOT/tests/pg-admin-browser-journey.e2e.mjs" \
    "http://127.0.0.1:$APIPORT" "$TMP_ROOT/dist" "Browser Journey PG $MATRIX_SLUG" \
    "$UUID_A" "$UUID_PROVIDER" "$UUID_ADMIN" "$SESSION_SECRET" \
    "$BROWSER_ENGINE" "$BROWSER_VIEWPORT" \
    | tee "$OUT/browser-$MATRIX_SLUG.out"
  BROWSER_EXIT=${PIPESTATUS[0]}
  if [ "$BROWSER_EXIT" != "0" ]; then
    tail -40 "$OUT/server.log" >&2
    fail "the PG administrator browser journey failed in $BROWSER_ENGINE/$BROWSER_VIEWPORT"
  fi
done

echo "=== 11. verdict ==="
echo "    PASS admin_scope=server_verified waivers=unpaid_only disputes=evidence_and_history claims=offline_not_verified"
echo "    PASS invoices=never_paid_when_unpaid razorpay=provider_bound refunds=approve_then_reconcile audit=append_only"
echo "    logs: $OUT"
