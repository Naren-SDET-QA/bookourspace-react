#!/usr/bin/env bash
# =============================================================================
# Home & Local Services real-browser E2E (customer → provider → admin).
#
# Creates a throwaway PostgreSQL cluster in a private temporary directory,
# applies the baseline schema and every migration, seeds test identities and one
# approved service listing, boots the real Express server (Vite dev middleware
# serving the real React app), seeds one provider-verified UPI payment, then
# drives the browser journey:
#
#   customer books a slot → provider accepts/starts/completes → customer cancels
#   a second booking → admin refunds the verified payment in Service oversight
#   → server restart → all three states still present.
#
# No cloud database, no live payment provider and no mocked booking API is used.
# Sessions are locally signed test sessions injected into the storage the Google
# flow uses; every request is still authorised by the server (HMAC session + DB
# role + RLS). This is local test authentication, not hosted Supabase Auth.
#
# Usage: bash supabase/tests/run_services_ui_e2e.sh
# Exit:  0 = all checks passed, 1 = failure
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-services-ui.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace services UI e2e scratch directory" > "$TMP_ROOT/.bos-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_services_ui
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER_LOG="$OUT/server.log"
SERVER_PID=""
LISTING_TITLE="E2E AC Repair"
SANDBOX_SECRET="bos-services-ui-sandbox-secret"
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

cleanup() {
  # Only this run's own server (and its children) is ever signalled.
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    pkill -P "$SERVER_PID" 2>/dev/null || true
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ "${BOS_KEEP_SERVICES_UI:-0}" = "1" ]; then
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
if root.parent != base or not root.name.startswith('bos-services-ui.'):
    raise SystemExit('refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace services UI e2e scratch directory':
    raise SystemExit('refusing cleanup: ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "=== 1. throwaway PostgreSQL cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || fail "initdb (see $OUT/initdb.log)"
# POSIX shared memory first: SysV shm segments are a shared machine resource and
# can be exhausted by unrelated clusters. Fall back to the default on platforms
# that reject shared_memory_type=mmap.
if ! pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1 -c shared_memory_type=mmap" -l "$OUT/postgres.log" start >/dev/null 2>&1; then
  pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
fi
for _ in $(seq 1 40); do
  pq -tAc "select 1" >/dev/null 2>&1 && break
  sleep 0.5
done
pq -tAc "select version()" >/dev/null 2>&1 || fail "postgres did not start (see $OUT/postgres.log)"
echo "    $(pq -tAc "select version()" | cut -d, -f1)"

echo "=== 2. database, Supabase stubs, schema and every migration ==="
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
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.role', '', false);
select set_config('request.jwt.claims', '', false);
select set_config('test.uid', '', false);
select set_config('test.role', '', false);
do $$ begin
  if auth.uid() is not null or auth.role() <> 'authenticated' then
    raise exception 'FAIL empty Auth claim settings must resolve safely for trusted-server transactions';
  end if;
end $$;
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
echo "    applied baseline + $(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations (unique versions)"

echo "=== 3. seed identities, profiles, module flags and one approved service listing ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL' || fail "seed"
insert into auth.users (id, email, raw_user_meta_data) values
  ('b1c2d3e4-1111-4222-8333-444455556666', 'services.provider@example.test', '{}'::jsonb),
  ('b1c2d3e4-2222-4333-8444-555566667777', 'services.customer@example.test', '{}'::jsonb),
  ('b1c2d3e4-4444-4555-8666-777788889999', 'services.admin@example.test', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role, account_status, verified, phone) values
  ('b1c2d3e4-1111-4222-8333-444455556666', 'services.provider@example.test', 'E2E Service Provider', 'provider', 'active', true, '+91 90000 00001'),
  ('b1c2d3e4-2222-4333-8444-555566667777', 'services.customer@example.test', 'E2E Service Customer', 'customer', 'active', true, '+91 90000 00002'),
  ('b1c2d3e4-4444-4555-8666-777788889999', 'services.admin@example.test', 'E2E Service Admin', 'admin', 'active', true, '+91 90000 00003')
on conflict (id) do update set role = excluded.role, account_status = 'active', verified = true;

delete from public.service_bookings where listing_id = 'svc-ui-listing';
delete from public.service_provider_schedules where provider_id = 'b1c2d3e4-1111-4222-8333-444455556666';

insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
values ('svc-ui-listing', 'b1c2d3e4-1111-4222-8333-444455556666', 'E2E AC Repair',
  'cat-4', 'AC Repair', 'service', 1500, 'per visit', 'active',
  '{"sectionType":"services","description":"Browser journey service","provider":{"name":"E2E Service Provider"}}'::jsonb)
on conflict (id) do update set status = 'active', price = 1500, payload = excluded.payload;

-- Movies only opens when an approval timestamp exists (enforced by trigger).
update public.platform_module_flags
   set is_enabled = true, allow_online_booking = true, requires_owner_approval = false,
       booking_approved_at = case when module_key = 'movies' then coalesce(booking_approved_at, now()) else booking_approved_at end
 where module_key in ('services', 'pg_hostels', 'classes', 'venues', 'hotel_stay', 'movies');
SQL
echo "    seeded 3 identities, 1 approved service listing and enabled modules"

echo "=== 4. signed test sessions ==="
SECRET="bos-services-ui-e2e-secret"
SESSIONS="$(SECRET="$SECRET" node -e '
const { createHmac, randomUUID } = require("node:crypto");
const secret = process.env.SECRET;
const people = {
  provider: { id: "USR-SVC-P", auth: "b1c2d3e4-1111-4222-8333-444455556666", email: "services.provider@example.test", name: "E2E Service Provider", role: "provider" },
  customer: { id: "USR-SVC-C", auth: "b1c2d3e4-2222-4333-8444-555566667777", email: "services.customer@example.test", name: "E2E Service Customer", role: "customer" },
  admin: { id: "USR-SVC-A", auth: "b1c2d3e4-4444-4555-8666-777788889999", email: "services.admin@example.test", name: "E2E Service Admin", role: "admin" }
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
    authProvider: "google",
    verified: true,
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
      totalBookings: 0, totalListings: 0, walletBalance: 0, authProvider: "google"
    }
  };
}
console.log(JSON.stringify(out));
')" || fail "could not mint test sessions"

DB_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable"

start_server() {
  PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')"
  SERVER_URL="http://127.0.0.1:$PORT"
  HM_PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')"
  # Vite may fill empty shell values from a developer's .env.local. Use an
  # explicit loopback-only invalid configuration so this test can never select
  # a hosted project, even when the checkout has personal environment files.
  NODE_ENV=test \
  PORT="$PORT" \
  VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PROJECT_ID="local" VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
  VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" \
  VITE_ENABLE_DEMO_DATA=false \
  DISABLE_HMR=false \
  BOS_VITE_HMR_PORT="$HM_PORT" \
  BOS_SERVER_HMAC_SECRET="$SECRET" \
  BOS_LISTINGS_DATABASE_URL="$DB_URL" \
  BOS_SERVICES_UPI_VPA="bookourspace@okhdfcbank" \
  BOS_SERVICES_UPI_NAME="BookOurSpace Services" \
  BOS_PAYMENT_SANDBOX="1" \
  BOS_PAYMENT_SANDBOX_SECRET="$SANDBOX_SECRET" \
  RAZORPAY_KEY_ID="" RAZORPAY_KEY_SECRET="" RAZORPAY_WEBHOOK_SECRET="" \
  node node_modules/tsx/dist/cli.mjs server.ts >> "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  local deadline=$((SECONDS + 90))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      tail -30 "$SERVER_LOG" >&2
      fail "server exited before listening"
    fi
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$SERVER_URL/api/auth/me" || true)" = "401" ] && return 0
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
  # A fresh Vite middleware instance can invalidate optimised dependency URLs.
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
warm_dev_middleware

PROVIDER_TOKEN="$(printf '%s' "$SESSIONS" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).provider.token))')"
CUSTOMER_TOKEN="$(printf '%s' "$SESSIONS" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).customer.token))')"
ADMIN_TOKEN="$(printf '%s' "$SESSIONS" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).admin.token))')"

echo "=== 6. provider publishes a real schedule ==="
curl -s -o "$OUT/schedule.json" -w '    schedule_http=%{http_code}\n' \
  -X PUT "$SERVER_URL/api/services/provider/schedule" \
  -H "Authorization: Bearer $PROVIDER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"workingDays":[0,1,2,3,4,5,6],"dayStart":"09:00","dayEnd":"18:00","slotMinutes":60,"serviceAreas":["Madhapur","Gachibowli"],"travelRadiusKm":12}'
grep -q '"ok":true' "$OUT/schedule.json" 2>/dev/null || grep -q '"scheduleConfigured"\|"workingDays"' "$OUT/schedule.json" 2>/dev/null \
  || { head -c 400 "$OUT/schedule.json"; fail "provider schedule was not accepted"; }

echo "=== 7. seed one provider-verified UPI payment (signed sandbox settlement) ==="
SEEDED="$(SERVER_URL="$SERVER_URL" CUSTOMER_TOKEN="$CUSTOMER_TOKEN" SANDBOX_SECRET="$SANDBOX_SECRET" node -e '
const base = process.env.SERVER_URL;
const token = process.env.CUSTOMER_TOKEN;
const secret = process.env.SANDBOX_SECRET;
const { createHmac, randomUUID } = require("node:crypto");
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const call = (method, path, body) => fetch(base + path, {
  method,
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
  body: body === undefined ? undefined : JSON.stringify(body),
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

async function book(date, slot, paymentMode) {
  const created = await call("POST", "/api/services/bookings", {
    listingId: "svc-ui-listing",
    scheduledDate: date,
    timeSlot: slot,
    serviceAddress: "Flat 402, Madhapur, Hyderabad",
    customerPhone: "+91 90000 00000",
    paymentMode,
    idempotencyKey: randomUUID(),
  });
  if (created.status !== 201) throw new Error("booking seed failed " + created.status + " " + JSON.stringify(created.data));
  return created.data.booking;
}

(async () => {
  const jobDate = day(2);
  const cancelDate = day(3);
  const refundDate = day(4);
  const job = await book(jobDate, "10:00", "pay_after_service");
  const cancellable = await book(cancelDate, "12:00", "pay_after_service");
  const refundable = await book(refundDate, "11:00", "upi_intent");

  const intent = await call("POST", `/api/services/bookings/${refundable.id}/payment-intent`, { idempotencyKey: randomUUID() });
  if (intent.status !== 201) throw new Error("intent seed failed " + intent.status + " " + JSON.stringify(intent.data));
  const intentId = intent.data.intentId;
  const providerPaymentId = "pay_svc_ui_" + Date.now();
  const eventId = "evt-svc-ui-" + Date.now();
  const amountPaise = Math.round(Number(intent.data.amount) * 100);
  const signature = createHmac("sha256", secret)
    .update(`${eventId}|${intentId}|payment.captured|${amountPaise}|${providerPaymentId}`).digest("hex");
  const settled = await fetch(base + "/api/services/payments/sandbox/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bos-signature": signature },
    body: JSON.stringify({ eventId, intentId, eventType: "payment.captured", amountPaise, providerPaymentId }),
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
  if (settled.status !== 200) throw new Error("signed settlement refused " + settled.status + " " + JSON.stringify(settled.data));

  const list = await call("GET", "/api/services/bookings");
  const rows = list.data.bookings || [];
  const refundRow = rows.find((row) => row.id === refundable.id);
  if (!refundRow) throw new Error("seeded refund booking not listed");
  if (refundRow.paymentStatus !== "settled") throw new Error("payment not settled: " + refundRow.paymentStatus);
  console.log(JSON.stringify({
    job: { ref: job.bookingRef, date: jobDate },
    cancel: { ref: cancellable.bookingRef, date: cancelDate },
    refund: { ref: refundRow.bookingRef, date: refundDate },
  }));
})().catch((error) => { console.error(String(error)); process.exit(1); });
')" || fail "could not seed services bookings"
JOB_DATE="$(printf '%s' "$SEEDED" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).job.date))')"
CANCEL_DATE="$(printf '%s' "$SEEDED" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).cancel.date))')"
REFUND_REF="$(printf '%s' "$SEEDED" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).refund.ref))')"
echo "    seeded bookings: job ${JOB_DATE}, cancel ${CANCEL_DATE}, refund ${REFUND_REF} (provider-verified)"

echo "=== 7b. signed-in services section probe ==="
PROBE_TOKEN="$CUSTOMER_TOKEN" \
PROBE_USER="$(printf '%s' "$SESSIONS" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(d).customer.user)))')" \
WARM_URL="$SERVER_URL" \
PROBE_SHOT="$OUT/services-probe.png" \
node -e '
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const logs = [];
  page.on("pageerror", (error) => logs.push("pageerror: " + error.message));
  page.on("console", (message) => { if (message.type() === "error") logs.push("console: " + message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) logs.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("bos_session_token_v1", token);
    localStorage.setItem("bos_google_auth_user_v1", user);
  }, { token: process.env.PROBE_TOKEN, user: process.env.PROBE_USER });
  await page.goto(process.env.WARM_URL + "/#services", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#root > *", { timeout: 30000 });
  await page.waitForTimeout(10000);
  console.log("    url:", page.url());
  console.log("    headings:", (await page.getByRole("heading").allTextContents()).slice(0, 12).join(" | "));
  console.log("    buttons:", (await page.getByRole("button").allTextContents()).slice(0, 20).join(" | "));
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 900);
  console.log("    body:", body);
  console.log("    errors:", logs.slice(0, 10).join(" || ") || "none");
  await page.screenshot({ path: process.env.PROBE_SHOT, fullPage: false });
  await browser.close();
})().catch((error) => { console.error("    PROBE FAILED", String(error).slice(0, 400)); });
'
echo "=== 8. browser journey (Chromium) ==="
# Phase one drives the lifecycle only; the restart assertion is phase two.
E2E_BASE_URL="$SERVER_URL" \
E2E_SERVICE_SESSIONS="$SESSIONS" \
E2E_SERVICE_LISTING_TITLE="$LISTING_TITLE" \
E2E_SERVICE_REFUND_REF="$REFUND_REF" \
E2E_SERVICE_JOB_DATE="$JOB_DATE" \
E2E_SERVICE_CANCEL_DATE="$CANCEL_DATE" \
npx playwright test e2e/services-booking.spec.ts --project=chromium --reporter=list \
  > "$OUT/playwright-services.log" 2>&1 \
  || { tail -40 "$SERVER_LOG" >&2; tail -80 "$OUT/playwright-services.log"; fail "services browser journey (see $OUT/playwright-services.log)"; }
grep -E "✓|passed|failed|skipped" "$OUT/playwright-services.log" | tail -8 | sed 's/^/    /'
# A skipped journey exits 0 with no database writes, so assert that the browser
# phase actually ran instead of letting the persistence assertions report the
# symptom later.
grep -qE "[0-9]+ passed" "$OUT/playwright-services.log" \
  || { cat "$OUT/playwright-services.log"; fail "services browser journey did not execute"; }

echo "=== 9. database assertions after the journey ==="
COMPLETED=$(pq -d "$DB" -tAc "select count(*) from public.service_bookings where status = 'completed' and listing_id = 'svc-ui-listing'")
CANCELLED=$(pq -d "$DB" -tAc "select count(*) from public.service_bookings where status = 'cancelled' and listing_id = 'svc-ui-listing'")
REFUNDED_INTENTS=$(pq -d "$DB" -tAc "select count(*) from public.service_payment_intents i join public.service_bookings b on b.id = i.booking_id where b.listing_id = 'svc-ui-listing' and i.status = 'refunded'")
REFUNDED_BOOKINGS=$(pq -d "$DB" -tAc "select count(*) from public.service_bookings where payment_status = 'refunded' and listing_id = 'svc-ui-listing'")
echo "    completed=$COMPLETED cancelled=$CANCELLED refunded_intents=$REFUNDED_INTENTS refunded_bookings=$REFUNDED_BOOKINGS"
[ "$COMPLETED" -ge 1 ] || fail "no completed service booking was persisted"
[ "$CANCELLED" -ge 1 ] || fail "no cancelled service booking was persisted"
[ "$REFUNDED_INTENTS" -ge 1 ] || fail "no provider-confirmed refund was recorded"
[ "$REFUNDED_BOOKINGS" -ge 1 ] || fail "the refunded booking was not marked refunded"

echo "=== 10. server-restart persistence ==="
stop_server
start_server
warm_dev_middleware
E2E_PHASE_TWO=1 \
E2E_BASE_URL="$SERVER_URL" \
E2E_SERVICE_SESSIONS="$SESSIONS" \
E2E_SERVICE_LISTING_TITLE="$LISTING_TITLE" \
E2E_SERVICE_REFUND_REF="$REFUND_REF" \
E2E_SERVICE_JOB_DATE="$JOB_DATE" \
E2E_SERVICE_CANCEL_DATE="$CANCEL_DATE" \
npx playwright test e2e/services-booking.spec.ts --project=chromium --grep "persists completed" --reporter=list \
  > "$OUT/playwright-services-restart.log" 2>&1 \
  || { tail -60 "$OUT/playwright-services-restart.log"; fail "services restart persistence (see $OUT/playwright-services-restart.log)"; }
grep -E "✓|passed|failed|skipped" "$OUT/playwright-services-restart.log" | tail -5 | sed 's/^/    /'
grep -q "1 passed" "$OUT/playwright-services-restart.log" \
  || { cat "$OUT/playwright-services-restart.log"; fail "restart persistence was skipped or did not pass"; }

AFTER_COMPLETED=$(pq -d "$DB" -tAc "select count(*) from public.service_bookings where status = 'completed' and listing_id = 'svc-ui-listing'")
AFTER_REFUNDED=$(pq -d "$DB" -tAc "select count(*) from public.service_bookings where payment_status = 'refunded' and listing_id = 'svc-ui-listing'")
[ "$AFTER_COMPLETED" = "$COMPLETED" ] && [ "$AFTER_REFUNDED" = "$REFUNDED_BOOKINGS" ] \
  || fail "the restart changed persisted service state"

echo "=== 11. verdict ==="
echo "    ALL HOME SERVICES UI CHECKS PASSED (customer booking, provider accept/start/complete,"
echo "    customer cancellation, admin refund of a provider-verified payment, restart persistence;"
echo "    local signed test auth, not Google OAuth; signed sandbox webhooks only, no live PSP)"
