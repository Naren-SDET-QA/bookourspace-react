#!/usr/bin/env bash
# =============================================================================
# End-to-end PG & Hostels payment lifecycle validation.
#
# Creates a THROWAWAY PostgreSQL cluster in a private temporary directory,
# applies the baseline schema and every migration, seeds a PG owner, three
# customers, a second provider and an admin, then drives the real Express API
# with signed sessions and the signed sandbox provider callback:
#
#   1. owner creates real bed inventory (rent, deposit, sharing type)
#   2. customer reserves a bed; the amount is computed by PostgreSQL
#   3. UPI intent, pay-at-property obligation, price tampering
#   4. unsigned / wrong-amount / replayed provider callbacks
#   5. signed settlement -> verified paid
#   6. cancelling a paid reservation requires a reconciled refund
#   7. provider failure -> the reservation becomes cancellable again
#   8. concurrency: two customers race for the last bed
#   9. cross-customer and wrong-owner access refused
#  10. owner check-in / check-out and admin adjustments
#  11. server restart, then persistence and isolation re-checked
#
# It never contacts Supabase, never reads cloud credentials, never moves real
# money and never touches an existing database.
#
# Usage: bash supabase/tests/run_pg_payment_e2e.sh
# Exit:  0 = every HTTP and SQL assertion passed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-pg-payment.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace PG payment scratch directory" > "$TMP_ROOT/.bos-pg-payment-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
APIPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
HMRPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_pg_payment
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION_SECRET="pg-payment-e2e-session-secret"
SANDBOX_SECRET="pg-payment-e2e-sandbox-secret-do-not-use-in-production"
STORE="$TMP_ROOT/authoritative-store.json"
SERVER_PID=""
mkdir -p "$OUT"

UUID_PROVIDER="11111111-bbbb-4bbb-8bbb-111111111111"
UUID_OTHER="22222222-bbbb-4bbb-8bbb-222222222222"
UUID_ADMIN="33333333-bbbb-4bbb-8bbb-333333333333"
UUID_A="44444444-bbbb-4bbb-8bbb-444444444444"
UUID_B="55555555-bbbb-4bbb-8bbb-555555555555"
UUID_C="66666666-bbbb-4bbb-8bbb-666666666666"
LISTING="lst-pg-pay-e2e"
BROWSER_LISTING="lst-pg-browser-e2e"
BROWSER_PROPERTY="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
BROWSER_ROOM="bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"

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
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-pg-payment-owned'
if root.parent != base or not root.name.startswith('bos-pg-payment.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace PG payment scratch directory':
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
  NODE_ENV=test \
  RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET= \
  DISABLE_HMR=true \
  BOS_VITE_HMR_PORT="$HMRPORT" \
  VITE_ENABLE_DEMO_DATA=false \
  PORT="$APIPORT" \
  VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PROJECT_ID="local" VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
  VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" \
  BOS_TEST_AUTHORITATIVE_STORE_PATH="$STORE" \
  npx tsx server.ts > "$OUT/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 200); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/auth/me" 2>/dev/null || true)
    [ "$CODE" = "401" ] && return 0
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.2
  done
  tail -40 "$OUT/server.log" >&2
  return 1
}

echo "=== 1. throwaway cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || fail "initdb"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1 -c timezone=UTC" \
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
       grep -E "ERROR|DETAIL|HINT|CONTEXT" "$OUT/migration.err" | head -10 >&2
       exit 1
     }
  echo "    applied $(basename "$MIG_FILE")"
done
pq -d "$DB" -tAc "select count(*) from public.payment_intents" >/dev/null || fail "payment_intents missing"

echo "=== 4. seed identities, listing and module flag ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL || fail "seed"
insert into auth.users (id, email, raw_user_meta_data) values
  ('$UUID_PROVIDER', 'provider.pg@example.test', '{}'),
  ('$UUID_OTHER', 'provider.other@example.test', '{}'),
  ('$UUID_ADMIN', 'admin.pg@example.test', '{}'),
  ('$UUID_A', 'customer.a@example.test', '{}'),
  ('$UUID_B', 'customer.b@example.test', '{}'),
  ('$UUID_C', 'customer.c@example.test', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role, account_status, is_super_admin) values
  ('$UUID_PROVIDER', 'provider.pg@example.test', 'PG Owner', 'provider', 'active', false),
  ('$UUID_OTHER', 'provider.other@example.test', 'Other Owner', 'provider', 'active', false),
  ('$UUID_ADMIN', 'admin.pg@example.test', 'Admin', 'admin', 'active', true),
  ('$UUID_A', 'customer.a@example.test', 'Customer A', 'customer', 'active', false),
  ('$UUID_B', 'customer.b@example.test', 'Customer B', 'customer', 'active', false),
  ('$UUID_C', 'customer.c@example.test', 'Customer C', 'customer', 'active', false)
on conflict (id) do update set role = excluded.role, account_status = 'active',
  is_super_admin = excluded.is_super_admin;

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status)
values ('$LISTING', '$UUID_PROVIDER', 'Sunrise PG for Women', 'pg-girls', 'Double Sharing', 'pg', 8000, 'per month', 'active')
on conflict (id) do nothing;

-- A separate listing with three beds is used by the browser journey, so the
-- HTTP payment assertions above keep their exact inventory counts.
insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status)
values ('$BROWSER_LISTING', '$UUID_PROVIDER', 'Browser Journey PG', 'pg-boys', 'Double Sharing', 'pg', 7500, 'per month', 'active')
on conflict (id) do nothing;

insert into public.stay_properties (id, listing_id, owner_user_id, name, property_type, city, base_price_paise, is_active)
values ('$BROWSER_PROPERTY', '$BROWSER_LISTING', '$UUID_PROVIDER', 'Browser Journey PG', 'pg_hostel', 'Test City', 0, true)
on conflict (id) do nothing;

insert into public.stay_room_types (id, property_id, name, max_adults, max_children, base_price_paise, monthly_rent_paise, security_deposit_paise, is_active)
values ('$BROWSER_ROOM', '$BROWSER_PROPERTY', 'Double sharing bed', 2, 0, 0, 750000, 1500000, true)
on conflict (id) do nothing;

insert into public.stay_units (room_type_id, label, is_active)
select '$BROWSER_ROOM', 'B' || unit_number, true
from generate_series(1, 6) as unit_number
on conflict do nothing;

update public.platform_module_flags
   set is_enabled = true, allow_online_booking = true
 where module_key = 'pg';
SQL
echo "    pg booking enabled=$(pq -d "$DB" -tAc "select allow_online_booking from public.platform_module_flags where module_key='pg'")"

printf '%s' "{\"seatLocks\":{},\"bookings\":[],\"enquiries\":[],\"paymentIntents\":{},\"usedUtrs\":{},\"checkedInPasses\":{},\"users\":[{\"id\":\"BROWSER-CUSTOMER\",\"name\":\"Browser Customer\",\"email\":\"customer.c@example.test\",\"phone\":\"\",\"role\":\"customer\",\"googleSub\":\"google-oauth2|customer.c@example.test\",\"authProvider\":\"google\",\"verified\":true,\"accountStatus\":\"active\",\"city\":\"Hyderabad\",\"joinedAt\":\"2026-11-01\",\"lastLoginAt\":\"2026-11-01T10:00:00.000Z\",\"listingsCount\":0,\"bookingsCount\":0,\"totalSpentOrEarned\":0,\"permissions\":[\"book_services\",\"post_reviews\",\"chat_provider\"],\"publishState\":\"published\"}],\"notifications\":[],\"notificationCampaigns\":[],\"providerListings\":{},\"adminModules\":{},\"revokedTokens\":{}}" > "$STORE"
STORE_HASH_BEFORE=$(shasum -a 256 "$STORE" | awk '{print $1}')

echo "=== 5. start API (PostgreSQL + sandbox provider) ==="
start_server || fail "API did not become ready (see $OUT/server.log)"
echo "    listening on 127.0.0.1:$APIPORT"

echo "=== 6. phase 1: inventory, obligations, settlement, refunds, isolation ==="
node "$REPO_ROOT/tests/pg-payment-lifecycle.e2e.mjs" phase1 \
  "http://127.0.0.1:$APIPORT" "$SESSION_SECRET" "$SANDBOX_SECRET" \
  "$UUID_PROVIDER" "$UUID_OTHER" "$UUID_ADMIN" "$UUID_A" "$UUID_B" "$UUID_C" \
  | tee "$OUT/phase1.out"
PHASE1_EXIT=${PIPESTATUS[0]}
[ "$PHASE1_EXIT" = "0" ] || fail "phase 1 HTTP assertions failed"

S1_BOOKING=$(pq -d "$DB" -tAc "select id from public.bookings where listing_id='$LISTING' and payment_status='refunded' order by created_at limit 1" | tr -d ' ')
[ -n "$S1_BOOKING" ] || fail "no refunded PG booking was persisted"

echo "=== 7. direct SQL invariants ==="
DUP_ALLOC=$(pq -d "$DB" -tAc "
  select count(*) from public.stay_allocations a
  join public.stay_allocations b
    on a.unit_id = b.unit_id and a.id < b.id
   and a.status in ('held','confirmed') and b.status in ('held','confirmed')
   and a.stay_dates && b.stay_dates;")
INTENTS=$(pq -d "$DB" -tAc "select count(*) from public.payment_intents")
VERIFIED=$(pq -d "$DB" -tAc "select count(*) from public.payment_intents where status='verified'")
SETTLED=$(pq -d "$DB" -tAc "select count(*) from public.bookings where payment_utr is not null")
REFUNDED=$(pq -d "$DB" -tAc "select count(*) from public.payment_intents where status='refunded'")
FAILED_INTENTS=$(pq -d "$DB" -tAc "select count(*) from public.payment_intents where status='failed'")
EVENT_DUPES=$(pq -d "$DB" -tAc "select count(*) from (select event_id from public.payment_provider_events group by event_id having count(*) > 1) d;")
EVENTS=$(pq -d "$DB" -tAc "select count(*) from public.payment_provider_events")
BOOKINGS=$(pq -d "$DB" -tAc "select count(*) from public.bookings where payload->>'source'='pg_booking'")
REFUNDED_BOOKING=$(pq -d "$DB" -tAc "select count(*) from public.bookings where payment_status='refunded' and refund_paise > 0")
PAY_LATER=$(pq -d "$DB" -tAc "select count(*) from public.bookings where payment_mode='pay_after_service' and payment_status='pay_later'")
PENDING_BOOKINGS=$(pq -d "$DB" -tAc "select count(*) from public.bookings where payment_status='pending_verification'")
AUDIT_EVENTS=$(pq -d "$DB" -tAc "select count(*) from public.stay_audit_events where detail->>'bookingId' is not null")
RLS_ON=$(pq -d "$DB" -tAc "select relrowsecurity from pg_class where oid='public.payment_intents'::regclass")
LEAK=$(pq -q -d "$DB" -tAc "begin; set local test.uid='$UUID_B'; set local role authenticated; select count(*) from public.payment_intents where user_id='$UUID_A'; commit;" 2>/dev/null | tr -d ' ')
BOOKING_LEAK=$(pq -q -d "$DB" -tAc "begin; set local test.uid='$UUID_B'; set local role authenticated; select count(*) from public.bookings where user_id='$UUID_A' and payload->>'source'='pg_booking'; commit;" 2>/dev/null | tr -d ' ')

echo "    pg_bookings=$BOOKINGS intents=$INTENTS provider_settled=$SETTLED refunded=$REFUNDED failed=$FAILED_INTENTS pay_at_property=$PAY_LATER pending_left=$PENDING_BOOKINGS"
echo "    provider_events=$EVENTS duplicate_event_ids=$EVENT_DUPES audit_rows=$AUDIT_EVENTS"
echo "    overlapping blocking allocations=$DUP_ALLOC (must be 0) rls_enabled=$RLS_ON intent_leak=$LEAK (must be 0) booking_leak=$BOOKING_LEAK (must be 0)"
[ "$DUP_ALLOC" = "0" ] || fail "double booking detected in stay_allocations"
[ "$INTENTS" -ge 2 ] || fail "expected at least 2 PG payment intents, found $INTENTS"
[ "$VERIFIED" = "0" ] || fail "a settled intent should have moved on to refunded, found $VERIFIED still verified"
[ "$SETTLED" = "1" ] || fail "expected exactly 1 PG booking reconciled by the provider, found $SETTLED"
[ "$REFUNDED" = "1" ] || fail "expected exactly 1 refunded PG intent, found $REFUNDED"
[ "$FAILED_INTENTS" -ge 1 ] || fail "expected a failed PG intent after the provider failure event"
[ "$EVENT_DUPES" = "0" ] || fail "provider event ids were duplicated"
[ "$EVENTS" -ge 3 ] || fail "expected at least 3 provider events, found $EVENTS"
[ "$REFUNDED_BOOKING" = "1" ] || fail "the refund did not persist a refunded amount on the PG booking"
[ "$PAY_LATER" -ge 1 ] || fail "the pay-at-property obligation was not recorded"
[ "$PENDING_BOOKINGS" = "0" ] || fail "a booking is still pending after the provider resolved it"
[ "$AUDIT_EVENTS" -ge 4 ] || fail "the sensitive PG actions were not logged, found $AUDIT_EVENTS rows"
[ "$RLS_ON" = "t" ] || fail "payment_intents RLS is disabled"
[ "$LEAK" = "0" ] || fail "RLS leaked another customer's PG payment intent"
[ "$BOOKING_LEAK" = "0" ] || fail "RLS leaked another customer's PG booking"

echo "=== 8. restart API ==="
stop_server
start_server || fail "API did not restart (see $OUT/server.log)"
echo "    restarted on 127.0.0.1:$APIPORT"

echo "=== 9. phase 2: persistence after restart ==="
node "$REPO_ROOT/tests/pg-payment-lifecycle.e2e.mjs" phase2 \
  "http://127.0.0.1:$APIPORT" "$SESSION_SECRET" "$SANDBOX_SECRET" \
  "$UUID_PROVIDER" "$UUID_OTHER" "$UUID_ADMIN" "$UUID_A" "$UUID_B" "$UUID_C" "$S1_BOOKING" \
  | tee "$OUT/phase2.out"
PHASE2_EXIT=${PIPESTATUS[0]}
[ "$PHASE2_EXIT" = "0" ] || fail "phase 2 HTTP assertions failed"

STORE_HASH_AFTER=$(shasum -a 256 "$STORE" | awk '{print $1}')
[ "$STORE_HASH_BEFORE" = "$STORE_HASH_AFTER" ] || fail "JSON authoritative store was modified by the PG payment routes"
echo "    JSON store untouched (sha256 unchanged)"

echo "=== 10. browser journey (Playwright, Chromium) ==="
VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PROJECT_ID="local" VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" VITE_ENABLE_DEMO_DATA=false \
  npx vite build --outDir "$TMP_ROOT/dist" --emptyOutDir \
  > "$OUT/browser-build.out" 2>&1 || { tail -25 "$OUT/browser-build.out" >&2; fail "browser build"; }
[ -f "$TMP_ROOT/dist/index.html" ] || fail "browser bundle missing"
node "$REPO_ROOT/tests/pg-browser-journey.e2e.mjs" \
  "http://127.0.0.1:$APIPORT" "$TMP_ROOT/dist" 'Browser Journey PG' "$UUID_C" "$SESSION_SECRET" \
  | tee "$OUT/browser.out"
BROWSER_EXIT=${PIPESTATUS[0]}
if [ "$BROWSER_EXIT" != "0" ]; then
  echo "--- API server log (tail) ---" >&2
  tail -40 "$OUT/server.log" >&2
  fail "the PG browser journey failed"
fi

echo "=== 10b. cross-engine style and live-availability journey ==="
make_browser_session() {
  node --input-type=module - "$SESSION_SECRET" "$1" "$2" <<'NODE'
import { createHmac } from 'node:crypto';
const [secret, id, role] = process.argv.slice(-3);
const email = role === 'provider' ? 'provider.pg@example.test' : 'customer.c@example.test';
const claims = {
  userId: `USR-${role.toUpperCase()}-${id.slice(0, 4)}`,
  supabaseUserId: id,
  email,
  name: `${role} PG browser test`,
  role,
  authProvider: 'google',
  ...(role === 'provider' ? { providerId: `provider-${id}` } : {}),
  issuedAt: Date.now(),
  expiresAt: Date.now() + 60 * 60_000,
};
const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
const signature = createHmac('sha256', `${secret}:SESSION_TOKEN_V2`).update(payload).digest('hex');
process.stdout.write(`${payload}.${signature}`);
NODE
}
CUSTOMER_BROWSER_SESSION="$(make_browser_session "$UUID_C" customer)"
OWNER_BROWSER_SESSION="$(make_browser_session "$UUID_PROVIDER" provider)"
BOS_E2E_CUSTOMER_SESSION="$CUSTOMER_BROWSER_SESSION" \
BOS_E2E_OWNER_SESSION="$OWNER_BROWSER_SESSION" \
  node "$REPO_ROOT/tests/pg-browser-e2e.mjs" \
    "http://127.0.0.1:$APIPORT" 'Browser Journey PG' "$TMP_ROOT/dist" \
    | tee "$OUT/cross-engine-browser.out"
CROSS_BROWSER_EXIT=${PIPESTATUS[0]}
[ "$CROSS_BROWSER_EXIT" = "0" ] || fail "cross-engine style/availability browser journey failed"

# The browser journey must not have moved any PG state into the JSON store.
JSON_PG_BOOKINGS=$(python3 - "$STORE" <<'PY'
import json, sys
with open(sys.argv[1]) as handle:
    store = json.load(handle)
print(len(store.get('bookings') or []))
PY
)
[ "$JSON_PG_BOOKINGS" = "0" ] || fail "a PG reservation leaked into the JSON store ($JSON_PG_BOOKINGS rows)"
echo "    PG reservations live only in PostgreSQL (JSON store bookings=0)"

echo "=== 11. verdict ==="
echo "    PASS pg_inventory=postgres pg_price=server_computed settlement=signed_provider_event replay=idempotent"
echo "    PASS pay_at_property=unpaid pending=blocks_cancellation refund=requires_reconciliation restart=persisted rls=isolated"
echo "    logs: $OUT"
