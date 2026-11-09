#!/usr/bin/env bash
# =============================================================================
# End-to-end stay checkout / UPI settlement / refund validation.
#
# Creates a THROWAWAY PostgreSQL cluster in a private temporary directory,
# applies the baseline schema and every migration, seeds one stay with two
# physical rooms, then drives the real Express API with signed sessions:
#
#   1. public quote (price computed by PostgreSQL)
#   2. UPI checkout + idempotent replay + inventory exhaustion
#   3. cross-customer intent isolation (RLS)
#   4. unsigned / wrong-amount / replayed provider callbacks
#   5. pay-after-service reservation recorded as unpaid
#   6. admin refund, refund replay refusal, inventory release
#   7. three concurrent checkouts for two rooms (no double booking)
#   8. server restart, then persistence + isolation re-checked
#
# It never contacts Supabase, never reads cloud credentials, never moves real
# money and never touches an existing database.
#
# Usage: bash supabase/tests/run_stay_payment_e2e.sh
# Exit:  0 = every HTTP and SQL assertion passed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-stay-payment.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace stay payment scratch directory" > "$TMP_ROOT/.bos-stay-payment-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
APIPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_stay_payment
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION_SECRET="stay-e2e-session-secret"
SANDBOX_SECRET="stay-e2e-sandbox-secret-do-not-use-in-production"
STORE="$TMP_ROOT/authoritative-store.json"
SERVER_PID=""
mkdir -p "$OUT"

UUID_PROVIDER="11111111-aaaa-4aaa-8aaa-111111111111"
UUID_A="22222222-aaaa-4aaa-8aaa-222222222222"
UUID_B="33333333-aaaa-4aaa-8aaa-333333333333"
UUID_ADMIN="44444444-aaaa-4aaa-8aaa-444444444444"
LISTING="lst-stay-1"
PROPERTY="55555555-aaaa-4aaa-8aaa-555555555555"
ROOM="11111111-0000-4000-8000-000000000001"

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
marker = root / '.bos-stay-payment-owned'
if root.parent != base or not root.name.startswith('bos-stay-payment.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace stay payment scratch directory':
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
  RAZORPAY_KEY_ID="rzp_test_stay_e2e" \
  RAZORPAY_KEY_SECRET="rzp_test_stay_e2e_secret" \
  RAZORPAY_WEBHOOK_SECRET="rzp_test_stay_e2e_webhook" \
  NODE_ENV=test \
  PORT="$APIPORT" \
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
pq -d "$DB" -tAc "select count(*) from public.payment_intents" >/dev/null || fail "payment_intents missing"

echo "=== 4. seed stay inventory ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL || fail "seed"
insert into auth.users (id, email, raw_user_meta_data) values
  ('$UUID_PROVIDER', 'provider.stay@example.test', '{}'),
  ('$UUID_A', 'customer.a@example.test', '{}'),
  ('$UUID_B', 'customer.b@example.test', '{}'),
  ('$UUID_ADMIN', 'admin@example.test', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role, account_status, verified, is_super_admin) values
  ('$UUID_PROVIDER', 'provider.stay@example.test', 'Stay Provider', 'provider', 'active', true, false),
  ('$UUID_A', 'customer.a@example.test', 'Customer A', 'customer', 'active', false, false),
  ('$UUID_B', 'customer.b@example.test', 'Customer B', 'customer', 'active', false, false),
  ('$UUID_ADMIN', 'admin@example.test', 'Admin', 'admin', 'active', true, true)
on conflict (id) do update set role = excluded.role, account_status = 'active',
  verified = excluded.verified, is_super_admin = excluded.is_super_admin;

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, is_verified, verified_by, verified_at)
values ('$LISTING', '$UUID_PROVIDER', 'Deccan Test Suites', 'hotels', 'hotels_budget', 'hotel', 2500, 'per night', 'active',
        '{"stayLifecycle":"draft","demo":false}', true, '$UUID_ADMIN', now())
on conflict (id) do nothing;

-- Fixtures model a real approval path: only the isolated Super Admin test
-- identity can publish the listing lifecycle. This is a disposable local DB.
select set_config('request.jwt.claim.sub', '$UUID_ADMIN', false);
update public.listings
   set payload = payload || '{"stayLifecycle":"approved"}'::jsonb
 where id = '$LISTING';
select set_config('request.jwt.claim.sub', '', false);

insert into public.stay_properties (id, listing_id, owner_user_id, name, property_type, city, base_price_paise, is_active)
values ('$PROPERTY', '$LISTING', '$UUID_PROVIDER', 'Deccan Test Suites', 'hotel', 'Hyderabad', 250000, true)
on conflict (id) do nothing;

insert into public.stay_room_types (id, property_id, name, max_adults, base_price_paise, is_active)
values ('$ROOM', '$PROPERTY', 'Deluxe Room', 2, 250000, true)
on conflict (id) do nothing;

insert into public.stay_units (room_type_id, label, is_active) values
  ('$ROOM', '101', true),
  ('$ROOM', '102', true)
on conflict do nothing;

update public.platform_module_flags
   set is_enabled = true, allow_online_booking = true
 where module_key = 'hotels';
SQL
echo "    property=1 roomType=1 units=$(pq -d "$DB" -tAc "select count(*) from public.stay_units") hotels_booking=$(pq -d "$DB" -tAc "select allow_online_booking from public.platform_module_flags where module_key='hotels'")"
echo "    approved_bookability=$(pq -d "$DB" -tAc "select jsonb_build_object('bookable',public.stay_listing_is_publicly_bookable('$LISTING'),'status',l.status,'verified',l.is_verified,'verified_by',l.verified_by is not null,'lifecycle',l.payload->>'stayLifecycle','property_active',p.is_active,'owner_role',owner.role,'owner_active',owner.account_status,'owner_verified',owner.verified)::text from public.listings l join public.stay_properties p on p.listing_id=l.id join public.profiles owner on owner.id=p.owner_user_id where l.id='$LISTING'")"

printf '%s' '{"seatLocks":{},"bookings":[],"enquiries":[],"paymentIntents":{},"usedUtrs":{},"checkedInPasses":{},"users":[],"notifications":[],"notificationCampaigns":[],"providerListings":{},"adminModules":{},"revokedTokens":{}}' > "$STORE"
STORE_HASH_BEFORE=$(shasum -a 256 "$STORE" | awk '{print $1}')

echo "=== 5. start API (PostgreSQL + sandbox provider) ==="
start_server || fail "API did not become ready (see $OUT/server.log)"
echo "    listening on 127.0.0.1:$APIPORT"

echo "=== 6. phase 1: checkout, settlement, refunds, concurrency ==="
node "$REPO_ROOT/tests/stay-payment.e2e.mjs" phase1 \
  "http://127.0.0.1:$APIPORT" "$SESSION_SECRET" "$SANDBOX_SECRET" "$UUID_A" "$UUID_B" "$UUID_ADMIN" \
  | tee "$OUT/phase1.out"
PHASE1_EXIT=${PIPESTATUS[0]}
[ "$PHASE1_EXIT" = "0" ] || fail "phase 1 HTTP assertions failed"

echo "=== 7. direct SQL invariants ==="
DUP_ALLOC=$(pq -d "$DB" -tAc "
  select count(*) from public.stay_allocations a
  join public.stay_allocations b
    on a.unit_id = b.unit_id and a.id < b.id
   and a.status in ('held','confirmed') and b.status in ('held','confirmed')
   and a.stay_dates && b.stay_dates;")
INTENTS=$(pq -d "$DB" -tAc "select count(*) from public.payment_intents")
REFUNDED=$(pq -d "$DB" -tAc "select count(*) from public.payment_intents where status='refunded'")
UNPAID=$(pq -d "$DB" -tAc "select count(*) from public.bookings where payment_status='pay_later'")
VERIFIED_BOOKINGS=$(pq -d "$DB" -tAc "select count(*) from public.bookings where payment_status in ('verified','refunded')")
REFUNDED_BOOKING=$(pq -d "$DB" -tAc "select count(*) from public.bookings where payment_status='refunded' and refund_paise > 0")
EVENT_DUPES=$(pq -d "$DB" -tAc "select count(*) from (select event_id from public.payment_provider_events group by event_id having count(*) > 1) d;")
EVENTS=$(pq -d "$DB" -tAc "select count(*) from public.payment_provider_events")
RLS_ON=$(pq -d "$DB" -tAc "select relrowsecurity from pg_class where oid='public.payment_intents'::regclass")
LEAK=$(pq -q -d "$DB" -tAc "begin; set local test.uid='$UUID_B'; set local role authenticated; select count(*) from public.payment_intents where user_id='$UUID_A'; commit;" 2>/dev/null | tr -d ' ')

echo "    intents=$INTENTS refunded=$REFUNDED pay_later_bookings=$UNPAID settled_or_refunded_bookings=$VERIFIED_BOOKINGS provider_events=$EVENTS"
echo "    overlapping blocking allocations=$DUP_ALLOC (must be 0) rls_enabled=$RLS_ON rls_leak_rows=$LEAK (must be 0)"
[ "$DUP_ALLOC" = "0" ] || fail "double booking detected in stay_allocations"
[ "$INTENTS" -ge 4 ] || fail "expected at least 4 payment intents, found $INTENTS"
[ "$REFUNDED" = "1" ] || fail "expected exactly 1 refunded intent, found $REFUNDED"
[ "$UNPAID" -ge 1 ] || fail "pay-after-service booking was not recorded as unpaid"
[ "$VERIFIED_BOOKINGS" -ge 1 ] || fail "no booking reached a settled payment state"
[ "$REFUNDED_BOOKING" = "1" ] || fail "refund did not persist a refunded amount on the booking"
[ "$EVENT_DUPES" = "0" ] || fail "provider event ids were duplicated"
[ "$EVENTS" -ge 2 ] || fail "provider events were not recorded"
[ "$RLS_ON" = "t" ] || fail "payment_intents RLS is disabled"
[ "$LEAK" = "0" ] || fail "RLS leaked another customer's payment intent"

echo "=== 8. restart API ==="
stop_server
start_server || fail "API did not restart (see $OUT/server.log)"
echo "    restarted on 127.0.0.1:$APIPORT"

echo "=== 9. phase 2: persistence after restart ==="
node "$REPO_ROOT/tests/stay-payment.e2e.mjs" phase2 \
  "http://127.0.0.1:$APIPORT" "$SESSION_SECRET" "$SANDBOX_SECRET" "$UUID_A" "$UUID_B" "$UUID_ADMIN" \
  | tee "$OUT/phase2.out"
PHASE2_EXIT=${PIPESTATUS[0]}
[ "$PHASE2_EXIT" = "0" ] || fail "phase 2 HTTP assertions failed"

STORE_HASH_AFTER=$(shasum -a 256 "$STORE" | awk '{print $1}')
[ "$STORE_HASH_BEFORE" = "$STORE_HASH_AFTER" ] || fail "JSON authoritative store was modified by payment routes"
echo "    JSON store untouched (sha256 unchanged)"

echo "=== 10. verdict ==="
echo "    PASS checkout=server_priced settlement=signed_provider_event refund=sandbox_signed"
echo "    PASS pay_after_service=unpaid inventory=exclusion_guarded restart=persisted rls=isolated"
echo "    logs: $OUT"
