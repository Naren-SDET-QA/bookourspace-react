#!/usr/bin/env bash
# =============================================================================
# Classes & Training real-browser E2E.
#
# Creates a throwaway PostgreSQL cluster in a private temporary directory,
# applies the baseline schema and every migration, seeds test identities and
# approved course listings, boots the real Express server (Vite dev middleware
# serving the real React app), and drives:
#
#   trainer creates batch -> admin approves -> student discovers -> enrolls ->
#   duplicate refused -> My Classes -> cancellation -> restart persistence
#
# Venue mode (BOS_RUN_VENUE_ONLY=1) drives instead:
#   owner creates venue -> admin approves -> owner configures rates/calendar ->
#   customer books and cancels -> owner blocks/reschedules -> customer dispute ->
#   admin resolves -> signed Razorpay/UPI sandbox settlement and refund ->
#   cross-engine/mobile surface -> server-restart persistence.
#
# No cloud database, no live payment provider and no mocked booking API is used.
# The signed session is injected into the browser storage the Google flow uses
# because OAuth credentials are absent here; every request is still verified by
# the server (HMAC session + DB role + RLS). This is local test authentication,
# not a Google OAuth or hosted Supabase Auth session.
#
# Usage: bash supabase/tests/run_classes_ui_e2e.sh
#        BOS_RUN_VENUE_ONLY=1 bash supabase/tests/run_classes_ui_e2e.sh
# Exit:  0 = all checks passed, 1 = failure
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-classes-ui.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace classes UI e2e scratch directory" > "$TMP_ROOT/.bos-owned"
export BOS_VITE_CACHE_DIR="$TMP_ROOT/vite-cache"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_classes_ui
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STORE="$TMP_ROOT/authoritative-store.json"
SERVER_LOG="$OUT/server.log"
SERVER_PID=""
VENUE_TITLE="${E2E_VENUE_TITLE:-E2E Owner-Created Function Hall}"
VENUE_SANDBOX_SECRET="bos-venue-sandbox-ui-e2e-secret"
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

# A run may only ever stop processes it started. Foreign clusters are never
# touched by pattern. A stale cluster is reaped only when ownership is provable
# from all four of: the scratch ownership marker, the recorded postmaster pid,
# that pid's live command line naming this exact data directory, and an age
# above the threshold (so a concurrently running agent is never interrupted).
reap_owned_stale_clusters() {
  [ "${BOS_REAP_OWNED_CLUSTERS:-0}" = "1" ] || return 0
  local dir marker pid age reaped=0
  for dir in "$TMP_BASE"/bos-classes-ui.*/pgdata; do
    [ -d "$dir" ] || continue
    [ "$dir" = "$PGDATA" ] && continue
    marker="$(dirname "$dir")/.bos-owned"
    [ -f "$marker" ] || continue
    grep -qx 'BookOurSpace classes UI e2e scratch directory' "$marker" 2>/dev/null || continue
    [ -f "$dir/postmaster.pid" ] || continue
    pid="$(head -1 "$dir/postmaster.pid" 2>/dev/null | tr -dc '0-9')"
    [ -n "$pid" ] || continue
    kill -0 "$pid" 2>/dev/null || continue
    ps -o command= -p "$pid" 2>/dev/null | grep -Fq -- "-D $dir" || continue
    age=$(( $(date +%s) - $(stat -f %m "$dir/postmaster.pid" 2>/dev/null || stat -c %Y "$dir/postmaster.pid" 2>/dev/null || echo 0) ))
    [ "$age" -gt 1800 ] || continue
    pg_ctl -D "$dir" -m fast -w stop >/dev/null 2>&1 || kill "$pid" 2>/dev/null || true
    reaped=$((reaped + 1))
  done
  [ "$reaped" -gt 0 ] && echo "    reaped $reaped stale cluster(s) owned by earlier runs"
  return 0
}

cleanup() {
  # Only this run's own server (and its children) is ever signalled.
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    pkill -P "$SERVER_PID" 2>/dev/null || true
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ "${BOS_KEEP_CLASSES_UI:-0}" = "1" ]; then
    echo "    preserved isolated test files at $TMP_ROOT"
    return
  fi
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil, sys
root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-owned'
if root.parent != base or not root.name.startswith('bos-classes-ui.'):
    raise SystemExit('refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace classes UI e2e scratch directory':
    raise SystemExit('refusing cleanup: ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

reap_owned_stale_clusters

echo "=== 1. throwaway PostgreSQL cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || fail "initdb (see $OUT/initdb.log)"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
for _ in $(seq 1 40); do
  pq -tAc "select 1" >/dev/null 2>&1 && break
  sleep 0.5
done
pq -tAc "select version()" >/dev/null 2>&1 || fail "postgres did not start (see $OUT/postgres.log)"

echo "=== 2. database, Supabase stubs, schema and migrations ==="
hope -q -c "drop database if exists $DB;" >/dev/null 2>&1
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
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" > "$OUT/baseline.log" 2>&1 \
  || fail "baseline schema (see $OUT/baseline.log)"
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" > "$OUT/migration.log" 2>&1 \
    || { grep -E "ERROR|DETAIL" "$OUT/migration.log" | head -5 >&2; fail "migration $(basename "$MIG_FILE")"; }
done
echo "    applied baseline + $(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations"

echo "=== 3. seed identities, profiles and approved course listings ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL' || fail "seed"
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-aaaa-4aaa-8aaa-000000000001', 'e2e.trainer@example.test', '{}'::jsonb),
  ('11111111-aaaa-4aaa-8aaa-000000000002', 'e2e.admin@example.test', '{}'::jsonb),
  ('11111111-aaaa-4aaa-8aaa-000000000003', 'e2e.student@example.test', '{}'::jsonb),
  ('11111111-aaaa-4aaa-8aaa-000000000004', 'e2e.student2@example.test', '{}'::jsonb)
on conflict (id) do nothing;

update public.profiles set role = 'provider', account_status = 'active'
 where id = '11111111-aaaa-4aaa-8aaa-000000000001';
update public.profiles set role = 'admin', account_status = 'active'
 where id = '11111111-aaaa-4aaa-8aaa-000000000002';
-- The venue moderation journey uses a normal Admin with a database-scoped
-- assignment. Keep test authority narrow; do not make the fixture Super Admin.
insert into public.live_edit_admin_assignments (admin_user_id, module_id, category_id, assigned_by)
values (
  '11111111-aaaa-4aaa-8aaa-000000000002',
  'venues',
  'venue-function',
  '11111111-aaaa-4aaa-8aaa-000000000002'
)
on conflict do nothing;
update public.profiles set role = 'customer', account_status = 'active'
 where id in ('11111111-aaaa-4aaa-8aaa-000000000003', '11111111-aaaa-4aaa-8aaa-000000000004');

delete from public.class_enrollments;
delete from public.class_batches;
delete from public.listings where id in ('class-e2e-algebra', 'class-e2e-race');

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values
  ('class-e2e-algebra', '11111111-aaaa-4aaa-8aaa-000000000001', 'E2E Algebra Course',
   'class-academic', 'Academic', 'course', 5000, 'per month', 'active',
   '{"provider":{"name":"E2E Trainer"},"description":"Browser journey course","mode":"hybrid"}'::jsonb),
  ('class-e2e-race', '11111111-aaaa-4aaa-8aaa-000000000001', 'E2E Race Course',
   'class-academic', 'Academic', 'course', 1200, 'per month', 'active',
   '{"provider":{"name":"E2E Trainer"},"description":"Concurrency course","mode":"offline"}'::jsonb);

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values ('venue-e2e-hall', '11111111-aaaa-4aaa-8aaa-000000000001', 'E2E Function Hall',
  'venue-marriage', 'Function halls', 'venue', 5000, 'per event', 'active',
  '{"location":{"area":"Test District","city":"Hyderabad"},"images":[],"customFieldValues":{"capacity":300,"acType":"AC","parkingCapacity":"40 cars","cateringPolicy":"Outside catering allowed"}}'::jsonb)
on conflict (id) do update set status='active';
delete from public.cinema_screens where id in ('scr-e2e-1', 'scr-e2e-hidden');
insert into public.cinema_screens
  (id, cinema_listing_id, cinema_title, area, screen_name, format, sound_system, total_seats,
   tiers, seat_tiers, wheelchair_seats, showtimes, movie_title, show_date, city, pincode,
   is_visible, cancellation_allowed, cancellation_cutoff_minutes, refund_percent,
   convenience_fee_per_seat, gst_percent, fnb_delivery_enabled, row_version, updated_at)
values
  ('scr-e2e-1', 'movie-hyd-1', 'E2E Multiplex Gachibowli', 'Gachibowli', 'Screen 1 · E2E Laser',
   '4K Laser', 'Dolby Atmos', 80,
   '[{"name":"E2E Prime","rows":["A","B","C"],"price":250}]'::jsonb,
   '[{"id":"prime","name":"E2E Prime","priceMultiplier":1.0,"rows":["A","B","C"],"seatsPerRow":8}]'::jsonb,
   '["A1","A8"]'::jsonb, '["11:15 AM","03:30 PM"]'::jsonb, 'E2E Cinema Feature',
   current_date, 'Hyderabad', '500032', true, true, 120, 80, 28, 18, true, 1, now()),
  ('scr-e2e-hidden', 'movie-hyd-1', 'E2E Multiplex Gachibowli', 'Gachibowli', 'Screen 2 · Hidden',
   '4K Laser', 'Dolby Atmos', 80,
   '[]'::jsonb, '[]'::jsonb, '["A1"]'::jsonb, '["09:00 PM"]'::jsonb, 'E2E Hidden Feature',
   current_date, 'Hyderabad', '500032', false, true, 120, 80, 28, 18, true, 1, now())
on conflict (id) do update set show_date = excluded.show_date, movie_title = excluded.movie_title,
  showtimes = excluded.showtimes, is_visible = excluded.is_visible, updated_at = now();
-- Public showtimes require an approved screen for today's date; the insert above
-- must not leave the seeded rows pending or two days out.
update public.cinema_screens
   set approval_status = 'approved', state = 'Telangana', show_date = current_date, updated_at = now()
 where id in ('scr-e2e-1', 'scr-e2e-hidden');

insert into public.venue_booking_settings(listing_id,owner_user_id,time_zone,booking_enabled,requires_owner_approval,capacity,
  hourly_rate_paise,half_day_rate_paise,full_day_rate_paise,per_guest_rate_paise,included_guests,deposit_paise,tax_percent,
  setup_buffer_minutes,cleanup_buffer_minutes,advance_booking_days,minimum_advance_minutes,addon_rates,cancellation_policy)
values ('venue-e2e-hall','11111111-aaaa-4aaa-8aaa-000000000001','Asia/Kolkata',true,true,300,
  500000,1500000,2400000,1000,100,50000,5,30,45,365,0,'{}'::jsonb,
  '{"free_cancel_hours":48,"refund_percent":100}'::jsonb)
on conflict(listing_id) do update set booking_enabled=true;
SQL
echo "    seeded 4 identities and 2 approved course listings"

echo "=== 4. authoritative session store + signed sessions ==="
cat > "$STORE" <<'JSON'
{
  "seatLocks": {},
  "bookings": [],
  "enquiries": [],
  "paymentIntents": {},
  "usedUtrs": {},
  "checkedInPasses": {},
  "users": [
    {"id":"USR-E2E-P","name":"E2E Trainer","email":"e2e.trainer@example.test","phone":"+91 90000 00001","role":"provider","providerId":"prov-e2e","googleSub":"g-e2e-p","authProvider":"google","verified":true,"accountStatus":"active","status":"active","city":"Hyderabad","avatarUrl":"","joinedAt":"2026-01-01","lastLoginAt":"2026-01-01T00:00:00.000Z","listingsCount":2,"bookingsCount":0,"totalSpentOrEarned":0,"walletBalance":0,"totalBookings":0,"totalListings":2},
    {"id":"USR-E2E-A","name":"E2E Admin","email":"e2e.admin@example.test","phone":"+91 90000 00002","role":"admin","googleSub":"g-e2e-a","authProvider":"google","verified":true,"accountStatus":"active","status":"active","city":"Hyderabad","avatarUrl":"","joinedAt":"2026-01-01","lastLoginAt":"2026-01-01T00:00:00.000Z","listingsCount":0,"bookingsCount":0,"totalSpentOrEarned":0,"walletBalance":0,"totalBookings":0,"totalListings":0},
    {"id":"USR-E2E-C","name":"E2E Student","email":"e2e.student@example.test","phone":"+91 90000 00003","role":"customer","googleSub":"g-e2e-c","authProvider":"google","verified":true,"accountStatus":"active","status":"active","city":"Hyderabad","avatarUrl":"","joinedAt":"2026-01-01","lastLoginAt":"2026-01-01T00:00:00.000Z","listingsCount":0,"bookingsCount":0,"totalSpentOrEarned":0,"walletBalance":0,"totalBookings":0,"totalListings":0},
    {"id":"USR-E2E-C2","name":"E2E Student Two","email":"e2e.student2@example.test","phone":"+91 90000 00004","role":"customer","googleSub":"g-e2e-c2","authProvider":"google","verified":true,"accountStatus":"active","status":"active","city":"Hyderabad","avatarUrl":"","joinedAt":"2026-01-01","lastLoginAt":"2026-01-01T00:00:00.000Z","listingsCount":0,"bookingsCount":0,"totalSpentOrEarned":0,"walletBalance":0,"totalBookings":0,"totalListings":0}
  ],
  "notifications": [],
  "notificationCampaigns": [],
  "providerListings": {},
  "adminModules": {},
  "revokedTokens": {}
}
JSON

SECRET="bos-classes-ui-e2e-secret"
SESSIONS="$(SECRET="$SECRET" node -e '
const { createHmac } = require("node:crypto");
const secret = process.env.SECRET;
const people = {
  provider: { id: "USR-E2E-P", auth: "11111111-aaaa-4aaa-8aaa-000000000001", email: "e2e.trainer@example.test", name: "E2E Trainer", role: "provider", providerId: "prov-e2e" },
  admin: { id: "USR-E2E-A", auth: "11111111-aaaa-4aaa-8aaa-000000000002", email: "e2e.admin@example.test", name: "E2E Admin", role: "admin" },
  customer: { id: "USR-E2E-C", auth: "11111111-aaaa-4aaa-8aaa-000000000003", email: "e2e.student@example.test", name: "E2E Student", role: "customer" },
  customerB: { id: "USR-E2E-C2", auth: "11111111-aaaa-4aaa-8aaa-000000000004", email: "e2e.student2@example.test", name: "E2E Student Two", role: "customer" }
};
const out = {};
for (const [key, person] of Object.entries(people)) {
  const claims = {
    userId: person.id,
    supabaseUserId: person.auth,
    email: person.email,
    name: person.name,
    googleSub: "g-" + person.auth.slice(-4),
    phone: "+91 90000 00000",
    role: person.role,
    providerId: person.providerId,
    authProvider: "google",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret + ":SESSION_TOKEN_V2").update(payload).digest("hex");
  out[key] = {
    token: payload + "." + signature,
    user: {
      id: person.id, googleSub: "g-" + person.auth.slice(-4), name: person.name,
      email: person.email, phone: "+91 90000 00000", role: person.role,
      status: "active", verified: true, city: "Hyderabad", avatarUrl: "",
      joinedAt: "2026-01-01", lastLoginAt: "2026-01-01T00:00:00.000Z",
      totalBookings: 0, totalListings: person.role === "provider" ? 2 : 0,
      walletBalance: 0, authProvider: "google"
    }
  };
}
console.log(JSON.stringify(out));
')" || fail "could not mint test sessions"

DB_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable"

# Pre-bundle the dependency graph once per server boot. Without this the first
# browser navigation after a restart can answer 504 (Outdated Optimize Dep)
# while Vite re-bundles, which is a dev-server artefact and not an app failure.
# Non-fatal: if it cannot run, the spec's own mount retries absorb the delay.
prebundle_vite_deps() {
  [ -x node_modules/.bin/vite ] || return 0
  BOS_VITE_CACHE_DIR="$BOS_VITE_CACHE_DIR" node_modules/.bin/vite optimize --logLevel warn >> "$SERVER_LOG" 2>&1 || true
}

start_server() {
  prebundle_vite_deps
  PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')"
  SERVER_URL="http://127.0.0.1:$PORT"
  # Own HMR port for this run; Vite 8 embedded middleware reads server.ws.port,
  # so each headless journey owns an isolated websocket listener.
  HM_PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')"
  NODE_ENV=test \
  PORT="$PORT" \
  VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PROJECT_ID="local" VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
  VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" \
  VITE_ENABLE_DEMO_DATA=false \
  DISABLE_HMR=false \
  BOS_VITE_HMR_PORT="$HM_PORT" \
  BOS_VITE_CACHE_DIR="$BOS_VITE_CACHE_DIR" \
  BOS_SERVER_HMAC_SECRET="$SECRET" \
  BOS_LISTINGS_DATABASE_URL="$DB_URL" \
  BOS_TEST_AUTHORITATIVE_STORE_PATH="$STORE" \
  BOS_VENUE_PAYMENT_SANDBOX="1" \
  BOS_VENUE_PAYMENT_SANDBOX_SECRET="$VENUE_SANDBOX_SECRET" \
  RAZORPAY_KEY_ID="" RAZORPAY_KEY_SECRET="" RAZORPAY_WEBHOOK_SECRET="" \
  node node_modules/tsx/dist/cli.mjs server.ts >> "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  local deadline=$((SECONDS + 90))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      tail -30 "$SERVER_LOG" >&2
      fail "server exited before listening"
    fi
    code="$(curl -s -o /dev/null -w '%{http_code}' "$SERVER_URL/api/auth/me" || true)"
    [ "$code" = "401" ] && return 0
    sleep 0.5
  done
  tail -30 "$SERVER_LOG" >&2
  fail "server did not become ready"
}

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
}

warm_dev_middleware() {
  # A fresh Vite middleware instance may invalidate optimized-dependency URLs.
  # Mount the actual shell before starting browser assertions, especially
  # after Express restart; otherwise the first lazy module can return 504.
  curl -s "$SERVER_URL/" -o "$OUT/index.html" || true
  local entry_path
  entry_path="$(grep -oE '/src/[A-Za-z0-9._/-]+\.(tsx|ts)' "$OUT/index.html" | head -1)"
  if [ -n "$entry_path" ]; then curl -s -o /dev/null "$SERVER_URL$entry_path" || true; fi
  WARM_URL="$SERVER_URL" node -e '
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let warmed = false;
  for (let attempt = 1; attempt <= 6 && !warmed; attempt += 1) {
    try {
      await page.goto(process.env.WARM_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector("#root > *", { timeout: 25000 });
      await page.waitForFunction(() => document.body.innerText.trim().length > 200, { timeout: 25000 });
      warmed = true;
    } catch (error) {
      if (attempt === 6) console.error(String(error));
      else await page.waitForTimeout(1500);
    }
  }
  await browser.close();
  if (!warmed) process.exit(1);
  console.log("    app shell mounted and Vite dependencies are warm");
})().catch((error) => { console.error(String(error)); process.exit(1); });
' || { tail -40 "$SERVER_LOG" >&2; fail "the React shell did not mount in the warm-up"; }
}

echo "=== 5. boot the real server ==="
start_server
echo "    listening on $SERVER_URL"

PROVIDER_TOKEN="$(printf '%s' "$SESSIONS" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).provider.token))')"
ME_CODE="$(curl -s -o "$OUT/auth-me.json" -w '%{http_code}' -H "Authorization: Bearer $PROVIDER_TOKEN" "$SERVER_URL/api/auth/me")"
echo "    /api/auth/me -> $ME_CODE $(head -c 240 "$OUT/auth-me.json")"
[ "$ME_CODE" = "200" ] || { tail -40 "$SERVER_LOG" >&2; fail "the provider session is not accepted by /api/auth/me"; }

echo "=== 5b. warm the dev middleware (first paint compiles the shell) ==="
warm_dev_middleware

echo "=== 5c. provider portal diagnostic probe ==="
PROBE_TOKEN="$PROVIDER_TOKEN" \
PROBE_USER="$(printf '%s' "$SESSIONS" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(d).provider.user)))')" \
WARM_URL="$SERVER_URL" \
PROBE_SHOT="$OUT/provider-probe.png" \
node -e '
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const logs = [];
  page.on("pageerror", (error) => logs.push("pageerror: " + error.message));
  page.on("console", (message) => { if (message.type() === "error") logs.push("console: " + message.text()); });
  page.on("response", (response) => {
    if (response.status() >= 400) logs.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("bos_session_token_v1", token);
    localStorage.setItem("bos_google_auth_user_v1", user);
  }, { token: process.env.PROBE_TOKEN, user: process.env.PROBE_USER });
  await page.goto(process.env.WARM_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#root > *", { timeout: 30000 });
  await page.waitForTimeout(12000);
  const stored = await page.evaluate(() => localStorage.getItem("bos_google_auth_user_v1"));
  console.log("    stored role:", JSON.parse(stored || "{}").role || "<none>");
  console.log("    buttons:", (await page.getByRole("button").allTextContents()).slice(0, 18).join(" | "));
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 700);
  const emptyImageSources = await page.locator("img").evaluateAll((images) => images
    .filter((image) => !image.getAttribute("src")?.trim())
    .map((image) => image.getAttribute("alt") || "<no alt>"));
  console.log("    body:", body);
  console.log("    empty image sources:", emptyImageSources.join(", ") || "none");
  console.log("    browser errors / HTTP failures:", logs.slice(0, 12).join(" || ") || "none");
  await page.screenshot({ path: process.env.PROBE_SHOT, fullPage: false });
  await browser.close();
})().catch((error) => { console.error("    PROBE FAILED", String(error).slice(0, 400)); });
'

echo "=== 6. Playwright journey (Chromium) ==="
if [ "${BOS_RUN_VENUE_ONLY:-0}" != "1" ]; then
  E2E_BASE_URL="$SERVER_URL" \
  E2E_CLASS_SESSIONS="$SESSIONS" \
  E2E_RACE_COURSE_ID="class-e2e-race" \
  E2E_RACE_COURSE_TITLE="E2E Race Course" \
  E2E_COURSE_TITLE="E2E Algebra Course" \
  npx playwright test e2e/classes-training.spec.ts --project=chromium --retries=0 --reporter=list \
    > "$OUT/playwright-chromium.log" 2>&1 \
    || { tail -60 "$SERVER_LOG" >&2; tail -80 "$OUT/playwright-chromium.log"; fail "Chromium Classes journey (see $OUT/playwright-chromium.log)"; }
  grep -E "✓|passed|failed" "$OUT/playwright-chromium.log" | tail -12 | sed 's/^/    /'
  echo "=== 6a. Movies discovery, showtimes and seat availability ==="
  E2E_BASE_URL="$SERVER_URL" \
  E2E_MOVIES_SESSIONS="$SESSIONS" \
  E2E_MOVIES_TITLE="E2E Cinema Feature" \
  npx playwright test e2e/movies-showtimes.spec.ts --project=chromium --retries=0 --reporter=list \
    > "$OUT/playwright-movies.log" 2>&1 \
    || { tail -80 "$OUT/playwright-movies.log"; fail "Movies browser coverage (see $OUT/playwright-movies.log)"; }
  grep -E "✓|passed|failed" "$OUT/playwright-movies.log" | tail -8 | sed 's/^/    /'
else
  echo "    classes journey skipped by BOS_RUN_VENUE_ONLY=1"
fi

echo "=== 6b. Function Halls owner-create/admin-approve/customer/owner/admin browser journey ==="
E2E_BASE_URL="$SERVER_URL" \
E2E_VENUE_SESSIONS="$SESSIONS" \
E2E_VENUE_TITLE="$VENUE_TITLE" \
E2E_VENUE_SANDBOX_SECRET="$VENUE_SANDBOX_SECRET" \
npx playwright test e2e/venue-booking.spec.ts --project=chromium --retries=0 --grep-invert "persists venue" --reporter=list \
  > "$OUT/playwright-venues.log" 2>&1 \
  || { tail -140 "$OUT/playwright-venues.log"; fail "Chromium Function Halls browser journey (see $OUT/playwright-venues.log)"; }
grep -E "✓|passed|failed" "$OUT/playwright-venues.log" | tail -16 | sed 's/^/    /'

if [ "${BOS_RUN_VENUE_ONLY:-0}" = "1" ]; then
  VENUE_LISTING_ID=$(pq -d "$DB" -tAc "select id from public.listings where title='$VENUE_TITLE' and entity_type='venue' order by created_at desc limit 1")
  ACTIVE_VENUE=$(pq -d "$DB" -tAc "select count(*) from public.listings where id='$VENUE_LISTING_ID' and status='active'")
  VENUE_SETTINGS=$(pq -d "$DB" -tAc "select count(*) from public.venue_booking_settings where listing_id='$VENUE_LISTING_ID' and capacity=300 and setup_buffer_minutes=30 and cleanup_buffer_minutes=45")
  CANCELLED_VENUE=$(pq -d "$DB" -tAc "select count(*) from public.venue_bookings where listing_id='$VENUE_LISTING_ID' and status='cancelled'")
  OWNER_BLOCKS=$(pq -d "$DB" -tAc "select count(*) from public.venue_blocks where listing_id='$VENUE_LISTING_ID' and reason='Browser maintenance block'")
  DISPUTE_RESOLVED=$(pq -d "$DB" -tAc "select count(*) from public.venue_booking_disputes d join public.venue_bookings b on b.id=d.booking_id where b.listing_id='$VENUE_LISTING_ID' and d.status='resolved' and d.resolution like 'E2E admin resolved%'")
  RAZORPAY_REFUNDED=$(pq -d "$DB" -tAc "select count(*) from public.venue_payment_intents i join public.venue_bookings b on b.id=i.booking_id where b.listing_id='$VENUE_LISTING_ID' and i.provider='razorpay' and i.status='refunded'")
  UPI_VERIFIED=$(pq -d "$DB" -tAc "select count(*) from public.venue_payment_intents i join public.venue_bookings b on b.id=i.booking_id where b.listing_id='$VENUE_LISTING_ID' and i.provider='upi_webhook' and i.status='verified'")
  ADMIN_CATEGORIES=$(pq -d "$DB" -tAc "select count(*) from public.venue_category_events where category_id like 'venue-browser-%'")
  echo "    listing=$VENUE_LISTING_ID active=$ACTIVE_VENUE settings=$VENUE_SETTINGS cancelled=$CANCELLED_VENUE owner_blocks=$OWNER_BLOCKS resolved_disputes=$DISPUTE_RESOLVED razorpay_refunded=$RAZORPAY_REFUNDED upi_verified=$UPI_VERIFIED category_audits=$ADMIN_CATEGORIES"
  [ -n "$VENUE_LISTING_ID" ] && [ "$ACTIVE_VENUE" = "1" ] && [ "$VENUE_SETTINGS" = "1" ] && [ "$CANCELLED_VENUE" -ge 2 ] && [ "$OWNER_BLOCKS" = "1" ] && [ "$DISPUTE_RESOLVED" = "1" ] && [ "$RAZORPAY_REFUNDED" = "1" ] && [ "$UPI_VERIFIED" = "1" ] && [ "$ADMIN_CATEGORIES" -ge 1 ] || fail "venue browser state was not persisted correctly"

  echo "=== 6c. cross-engine and mobile/tablet venue surface ==="
  FIREFOX=0; WEBKIT=0
  node -e 'const {firefox}=require("playwright");firefox.launch().then(b=>b.close()).then(()=>process.exit(0)).catch(()=>process.exit(1))' && FIREFOX=1
  node -e 'const {webkit}=require("playwright");webkit.launch().then(b=>b.close()).then(()=>process.exit(0)).catch(()=>process.exit(1))' && WEBKIT=1
  echo "    firefox=$([ "$FIREFOX" = 1 ] && echo available || echo BLOCKED) webkit=$([ "$WEBKIT" = 1 ] && echo available || echo BLOCKED)"
  for ENGINE in chromium firefox webkit; do
    if [ "$ENGINE" = "firefox" ] && [ "$FIREFOX" != "1" ]; then continue; fi
    if [ "$ENGINE" = "webkit" ] && [ "$WEBKIT" != "1" ]; then continue; fi
    echo "    running $ENGINE mobile/tablet venue surface"
    E2E_BASE_URL="$SERVER_URL" E2E_VENUE_SESSIONS="$SESSIONS" E2E_VENUE_TITLE="$VENUE_TITLE" \
      npx playwright test e2e/venue-booking-cross-browser.spec.ts --project="$ENGINE" --retries=0 --reporter=list \
      > "$OUT/playwright-venue-$ENGINE.log" 2>&1 \
      || { tail -60 "$OUT/playwright-venue-$ENGINE.log"; fail "$ENGINE mobile/tablet venue surface (see $OUT/playwright-venue-$ENGINE.log)"; }
    grep -E "✓|passed|failed" "$OUT/playwright-venue-$ENGINE.log" | tail -4 | sed 's/^/      /'
  done

  echo "=== 6d. venue server-restart persistence ==="
  RESTART_REF=$(pq -d "$DB" -tAc "select b.booking_ref from public.venue_bookings b join public.venue_booking_disputes d on d.booking_id=b.id where b.listing_id='$VENUE_LISTING_ID' and d.status='resolved' order by d.resolved_at desc limit 1")
  [ -n "$RESTART_REF" ] || fail "no resolved-dispute booking reference for restart test"
  stop_server
  start_server
  echo "    warming the restarted Vite middleware before persistence assertions"
  warm_dev_middleware
  E2E_PHASE_TWO=1 \
  E2E_BASE_URL="$SERVER_URL" \
  E2E_VENUE_SESSIONS="$SESSIONS" \
  E2E_VENUE_TITLE="$VENUE_TITLE" \
  E2E_VENUE_SANDBOX_SECRET="$VENUE_SANDBOX_SECRET" \
  E2E_RESTART_BOOKING_REF="$RESTART_REF" \
  npx playwright test e2e/venue-booking.spec.ts --project=chromium --retries=0 --grep "persists venue" --reporter=list \
    > "$OUT/playwright-venue-restart.log" 2>&1 \
    || { tail -60 "$OUT/playwright-venue-restart.log"; fail "venue restart persistence (see $OUT/playwright-venue-restart.log)"; }
  grep -E "✓|passed|failed|skipped" "$OUT/playwright-venue-restart.log" | tail -6 | sed 's/^/    /'
  grep -q "1 passed" "$OUT/playwright-venue-restart.log" \
    || { cat "$OUT/playwright-venue-restart.log"; fail "venue restart persistence was skipped or did not pass"; }

  CANCELLED_AFTER=$(pq -d "$DB" -tAc "select count(*) from public.venue_bookings where listing_id='$VENUE_LISTING_ID' and status='cancelled'")
  RESOLVED_AFTER=$(pq -d "$DB" -tAc "select count(*) from public.venue_booking_disputes d join public.venue_bookings b on b.id=d.booking_id where b.listing_id='$VENUE_LISTING_ID' and d.status='resolved'")
  [ "$CANCELLED_AFTER" = "$CANCELLED_VENUE" ] && [ "$RESOLVED_AFTER" = "$DISPUTE_RESOLVED" ] || fail "restart changed persisted venue state"
  echo "    ALL FUNCTION HALLS UI CHECKS PASSED (create/approve/booking/cancellation/dispute/payment/restart; local signed test auth, not Google OAuth; signed sandbox webhooks only, no live PSP)"
  exit 0
fi

echo "=== 7. database assertions after the journey ==="
CANCELLED=$(pq -d "$DB" -tAc "select count(*) from public.class_enrollments where status = 'cancelled'")
CONFIRMED=$(pq -d "$DB" -tAc "select count(*) from public.class_enrollments where status = 'confirmed'")
PAID=$(pq -d "$DB" -tAc "select count(*) from public.class_enrollments where payment_status = 'verified'")
RACE_CONFIRMED=$(pq -d "$DB" -tAc "
  select count(*) from public.class_enrollments e
  join public.class_batches b on b.id = e.batch_id
  where b.title = 'E2E Race Batch' and e.status = 'confirmed'")
echo "    cancelled=$CANCELLED confirmed=$CONFIRMED verified_payments=$PAID race_confirmed=$RACE_CONFIRMED"
[ "$CANCELLED" -ge 1 ] || fail "no cancelled enrollment was persisted"
[ "$CONFIRMED" -ge 1 ] || fail "no confirmed enrollment was persisted"
[ "$PAID" = "0" ] || fail "a paid enrollment was fabricated without provider evidence"
[ "$RACE_CONFIRMED" = "1" ] || fail "the last seat race produced $RACE_CONFIRMED confirmed enrollments"

echo "=== 8. cross-browser availability ==="
FIREFOX=0; WEBKIT=0
node -e 'const {firefox}=require("playwright");firefox.launch().then(b=>b.close()).then(()=>process.exit(0)).catch(()=>process.exit(1))' && FIREFOX=1
node -e 'const {webkit}=require("playwright");webkit.launch().then(b=>b.close()).then(()=>process.exit(0)).catch(()=>process.exit(1))' && WEBKIT=1
echo "    firefox=$([ "$FIREFOX" = 1 ] && echo available || echo BLOCKED) webkit=$([ "$WEBKIT" = 1 ] && echo available || echo BLOCKED)"
for ENGINE in firefox webkit; do
  if [ "$ENGINE" = "firefox" ] && [ "$FIREFOX" = "1" ]; then FLAG="E2E_INCLUDE_FIREFOX=1"; elif [ "$ENGINE" = "webkit" ] && [ "$WEBKIT" = "1" ]; then FLAG="E2E_INCLUDE_WEBKIT=1"; else continue; fi
  echo "    running $ENGINE cross-browser surface"
  env $FLAG E2E_BASE_URL="$SERVER_URL" E2E_CLASS_SESSIONS="$SESSIONS" \
    npx playwright test e2e/classes-training.spec.ts --project="$ENGINE" --grep "cross-browser" --reporter=list \
    > "$OUT/playwright-$ENGINE.log" 2>&1 \
    || { tail -40 "$OUT/playwright-$ENGINE.log"; fail "$ENGINE cross-browser surface (see $OUT/playwright-$ENGINE.log)"; }
    grep -qE "[0-9]+ passed" "$OUT/playwright-$ENGINE.log" \
      || { cat "$OUT/playwright-$ENGINE.log"; fail "$ENGINE cross-browser surface was skipped"; }
done

echo "=== 9. restart persistence ==="
stop_server
start_server
# A fresh Vite middleware instance can return 504 (Outdated Optimize Dep)
# until its optimized dependencies and React entrypoint are warmed. Mount the
# real shell before Playwright's restart assertions, as in the first phase.
warm_dev_middleware
E2E_PHASE_TWO=1 \
E2E_BASE_URL="$SERVER_URL" \
E2E_CLASS_SESSIONS="$SESSIONS" \
E2E_COURSE_TITLE="E2E Algebra Course" \
npx playwright test e2e/classes-training.spec.ts --project=chromium --grep "persists after a server restart" --reporter=list \
  > "$OUT/playwright-restart.log" 2>&1 \
  || { tail -40 "$OUT/playwright-restart.log"; fail "restart persistence (see $OUT/playwright-restart.log)"; }
grep -E "✓|passed|failed|skipped" "$OUT/playwright-restart.log" | tail -5 | sed 's/^/    /'
# A filtered/skipped restart test exits 0 with no assertions; require a real pass.
grep -q "1 passed" "$OUT/playwright-restart.log" \
  || { cat "$OUT/playwright-restart.log"; fail "classes restart persistence was skipped or did not pass"; }

echo "=== 10. verdict ==="
echo "    ALL CLASSES UI CHECKS PASSED (chromium journey, cancelled=$CANCELLED, race_confirmed=$RACE_CONFIRMED, verified_payments=0)"
