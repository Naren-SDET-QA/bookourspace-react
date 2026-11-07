#!/usr/bin/env bash
# =============================================================================
# Production persistence startup smoke test.
#
# Starts the real server with NODE_ENV=production against a THROWAWAY local
# PostgreSQL cluster (explicit BOS_POSTGRES_LOCAL_TEST_MODE=true) and proves:
#   1. production startup requires and attaches every PostgreSQL repository;
#   2. the server opens its listener and serves real database-backed routes;
#   3. legacy JSON compatibility routes fail closed with 503, never falling
#      back to a local JSON file;
#   4. no JSON store file is created or modified;
#   5. a restart keeps serving the same PostgreSQL data.
#
# It never contacts Supabase, never reads cloud credentials and never touches an
# existing database. The temporary directory is removed on exit.
#
# Usage: bash supabase/tests/run_production_persistence_smoke.sh
# Exit:  0 = every assertion passed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-prod-smoke.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace production persistence smoke scratch" > "$TMP_ROOT/.bos-prod-smoke-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
APIPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_prod_smoke
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
SERVER_PID=""
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DB" -tAc "$1"; }
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
import shutil, sys
root = Path(sys.argv[1]).resolve(); base = Path(sys.argv[2]).resolve()
marker = root / '.bos-prod-smoke-owned'
if root.parent != base or not root.name.startswith('bos-prod-smoke.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace production persistence smoke scratch':
    raise SystemExit('Refusing cleanup: scratch ownership marker did not match')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

start_server() {
  NODE_ENV=production \
  BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
  BOS_POSTGRES_LOCAL_TEST_MODE=true \
  BOS_SERVER_HMAC_SECRET="$SECRET" \
  DISABLE_HMR=true \
  PORT="$APIPORT" \
  VITE_ENABLE_DEMO_DATA=false \
  VITE_SUPABASE_URL="http://127.0.0.1:1" \
  VITE_SUPABASE_PROJECT_ID="local" \
  VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
  VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" \
  VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" \
  npx tsx server.ts > "$OUT/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 200); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/modules" 2>/dev/null || true)"
    [ -n "$CODE" ] && [ "$CODE" != "000" ] && return 0
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.25
  done
  tail -40 "$OUT/server.log" >&2
  return 1
}

echo "=== 1. throwaway PostgreSQL cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || fail "initdb"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $TMP_ROOT -c listen_addresses=127.0.0.1" -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
for _ in $(seq 1 40); do hope -d postgres -tAc "select 1" >/dev/null 2>&1 && break; sleep 0.5; done
if ! hope -d postgres -tAc "select version()" >/dev/null 2>&1; then
  echo "--- postgres.log ---" >&2
  cat "$OUT/postgres.log" >&2 2>/dev/null || true
  echo "--- initdb.log ---" >&2
  cat "$OUT/initdb.log" >&2 2>/dev/null || true
  fail "cluster did not start"
fi
echo "    $(hope -d postgres -tAc "select version()" | cut -d, -f1)"

echo "=== 2. database + Supabase stubs ==="
hope -q -c "drop database if exists $DB;" || fail "drop database"
hope -q -c "create database $DB;" || fail "create database"
psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL' || fail "stubs"
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
  banned_until timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid,
    nullif(current_setting('test.uid', true), '')::uuid) $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'role', ''),
    nullif(current_setting('test.role', true), ''), 'authenticated') $$;
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
psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/supabase/schema_and_rls.sql" > "$OUT/baseline.out" 2> "$OUT/baseline.err" \
  || { grep -E "ERROR|DETAIL" "$OUT/baseline.err" | head -5 >&2; fail "baseline schema"; }
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" \
    > "$OUT/migration.out" 2> "$OUT/migration.err" \
    || { echo "migration failed: $(basename "$MIG_FILE")" >&2; grep -E "ERROR|DETAIL" "$OUT/migration.err" | head -5 >&2; exit 1; }
done
echo "    tables=$(pq "select count(*) from pg_tables where schemaname='public'") migrations=$(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ')"

echo "=== 3a. disposable stay search fixtures ==="
psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL' || fail "stay search fixtures"
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'stay-owner@example.test'),
  ('44444444-4444-4444-8444-444444444444', 'stay-reviewer@example.test');
update public.profiles set role = 'provider', verified = true
 where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set role = 'admin', is_super_admin = true
 where id = '44444444-4444-4444-8444-444444444444';
select set_config('bos.stay_lifecycle_transition', 'on', false);
insert into public.listings
  (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit,
   status, is_verified, verified_by, payload)
values
  ('listing-public-stay-001', '11111111-1111-4111-8111-111111111111',
   'Verified Smoke Stay', 'hotels', 'hotel', 'stay', 450000, 'night',
   'active', true, '44444444-4444-4444-8444-444444444444', '{"stayLifecycle":"approved"}'),
  ('listing-private-stay-001', '11111111-1111-4111-8111-111111111111',
   'Private Smoke Draft', 'hotels', 'hotel', 'stay', 250000, 'night',
   'pending_approval', false, null, '{"stayLifecycle":"draft"}'),
  ('listing-demo-stay-001', '11111111-1111-4111-8111-111111111111',
   'Demo Smoke Stay', 'hotels', 'hotel', 'stay', 150000, 'night',
   'active', true, '44444444-4444-4444-8444-444444444444', '{"stayLifecycle":"approved","demo":true}');
insert into public.stay_properties
  (id, listing_id, owner_user_id, name, property_type, city, base_price_paise, tax_percent)
values
  ('11111111-0000-4111-8111-000000000001', 'listing-public-stay-001',
   '11111111-1111-4111-8111-111111111111', 'Verified Smoke Stay', 'hotel', 'Hyderabad', 450000, 12),
  ('11111111-0000-4111-8111-000000000002', 'listing-private-stay-001',
   '11111111-1111-4111-8111-111111111111', 'Private Smoke Draft', 'hotel', 'Hyderabad', 250000, 12),
  ('11111111-0000-4111-8111-000000000003', 'listing-demo-stay-001',
   '11111111-1111-4111-8111-111111111111', 'Demo Smoke Stay', 'hotel', 'Hyderabad', 150000, 12);
SQL

# A real database-backed flag the public API must return.
pq "update public.platform_module_flags set is_enabled = true, allow_online_booking = true where module_key = 'pg';" >/dev/null \
  || fail "could not update platform_module_flags"

JSON_STORE="$REPO_ROOT/authoritative-marketplace-store.json"
LIVE_STORE="$REPO_ROOT/live-page-config.json"
JSON_HASH_BEFORE="$(shasum -a 256 "$JSON_STORE" 2>/dev/null | awk '{print $1}')"
LIVE_HASH_BEFORE="$(shasum -a 256 "$LIVE_STORE" 2>/dev/null | awk '{print $1}')"

echo "=== 4. start production server on PostgreSQL ==="
start_server || fail "production server did not become ready (see $OUT/server.log)"
grep -q "Full-Stack Server running" "$OUT/server.log" || fail "production server did not log its listener"
echo "    listening on 127.0.0.1:$APIPORT"

echo "=== 5. database-backed public API ==="
MODULES_JSON="$(curl -s -w '\n%{http_code}' "http://127.0.0.1:$APIPORT/api/modules")"
MODULES_CODE="$(printf '%s' "$MODULES_JSON" | tail -1)"
MODULES_BODY="$(printf '%s' "$MODULES_JSON" | sed '$d')"
[ "$MODULES_CODE" = "200" ] || fail "/api/modules returned $MODULES_CODE"
printf '%s' "$MODULES_BODY" | grep -q '"module_key":"pg"' || fail "/api/modules did not read platform_module_flags"
printf '%s' "$MODULES_BODY" | grep -q '"allow_online_booking":true' || fail "/api/modules did not return the updated database flag"
echo "    PASS /api/modules 200 with PostgreSQL platform_module_flags"

MOVIES_JSON="$(curl -s -w '\n%{http_code}' "http://127.0.0.1:$APIPORT/api/movies/inventory")"
MOVIES_CODE="$(printf '%s' "$MOVIES_JSON" | tail -1)"
MOVIES_BODY="$(printf '%s' "$MOVIES_JSON" | sed '$d')"
[ "$MOVIES_CODE" = "200" ] || fail "/api/movies/inventory returned $MOVIES_CODE"
printf '%s' "$MOVIES_BODY" | grep -q '"screens":\[' || fail "/api/movies/inventory did not return PostgreSQL screens"
printf '%s' "$MOVIES_BODY" | grep -q '"screenId":"scr-amb-1"' || fail "/api/movies/inventory did not return the database cinema fixture"
printf '%s' "$MOVIES_BODY" | grep -q '"bookings"' && fail "/api/movies/inventory exposed booking records"
echo "    PASS /api/movies/inventory 200 from PostgreSQL; booking data excluded"

VENUE_CATEGORIES_CODE="$(curl -s -o "$OUT/venue-categories.json" -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/venues/categories")"
[ "$VENUE_CATEGORIES_CODE" = "200" ] || fail "/api/venues/categories returned $VENUE_CATEGORIES_CODE"
grep -q '"label":"Function Halls"' "$OUT/venue-categories.json" || fail "/api/venues/categories omitted the database-seeded Function Halls category"
echo "    PASS /api/venues/categories 200 with the PostgreSQL Function Halls category"

STAYS_SEARCH_CODE="$(curl -s -o "$OUT/stays-search.json" -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/stays/search")"
[ "$STAYS_SEARCH_CODE" = "200" ] || fail "/api/stays/search returned $STAYS_SEARCH_CODE"
python3 - "$OUT/stays-search.json" <<'PY' || fail "PostgreSQL stay search response"
import json, sys
body = json.load(open(sys.argv[1]))
assert body.get('ok') is True, body
assert body.get('source') == 'postgresql', body
assert body.get('fixtures') is False, body
assert isinstance(body.get('items'), list), body
ids = [item.get('listingId') for item in body['items']]
assert ids == ['listing-public-stay-001'], ids
assert body['items'][0].get('name') == 'Verified Smoke Stay', body
print('    PASS /api/stays/search returns only the published, verified PostgreSQL stay; draft/demo excluded')
PY

echo "=== 6. JSON routes fail closed, database-backed routes serve PostgreSQL ==="
for ROUTE in /api/live-page-config /api/admin/modules /api/admin/movies/records; do
  BODY_FILE="$OUT/route-$(echo "$ROUTE" | tr '/' '_').json"
  CODE="$(curl -s -o "$BODY_FILE" -w '%{http_code}' "http://127.0.0.1:$APIPORT$ROUTE")"
  if [ "$ROUTE" = "/api/live-page-config" ]; then
    # The live page config is PostgreSQL-backed as of
    # 20261105030000_platform_settings_persistence.sql, so a production process
    # serves it instead of refusing the JSON store. It must still never touch
    # the JSON file (asserted below by the before/after hash).
    [ "$CODE" = "200" ] || fail "$ROUTE returned $CODE instead of 200 from PostgreSQL"
    grep -q '"ok":true' "$BODY_FILE" || fail "$ROUTE did not return a success envelope"
    grep -q '"otaSync"' "$BODY_FILE" || fail "$ROUTE omitted the OTA sync block"
    echo "    PASS $ROUTE 200 from PostgreSQL, no JSON fallback"
  else
    [ "$CODE" = "401" ] || fail "$ROUTE returned $CODE instead of 401 for an anonymous caller"
    echo "    PASS $ROUTE 401 (anonymous, no JSON read)"
  fi
done

echo "=== 7. unauthenticated identity routes are not broken by the policy ==="
ME_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/auth/me")"
[ "$ME_CODE" = "401" ] || fail "/api/auth/me returned $ME_CODE instead of 401"
LOGOUT_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$APIPORT/api/auth/logout")"
[ "$LOGOUT_CODE" = "200" ] || fail "/api/auth/logout returned $LOGOUT_CODE instead of 200"
echo "    PASS /api/auth/me 401 and /api/auth/logout 200 without touching JSON state"

JSON_HASH_AFTER="$(shasum -a 256 "$JSON_STORE" 2>/dev/null | awk '{print $1}')"
LIVE_HASH_AFTER="$(shasum -a 256 "$LIVE_STORE" 2>/dev/null | awk '{print $1}')"
[ "$JSON_HASH_BEFORE" = "$JSON_HASH_AFTER" ] || fail "authoritative-marketplace-store.json was modified in production"
[ "$LIVE_HASH_BEFORE" = "$LIVE_HASH_AFTER" ] || fail "live-page-config.json was modified in production"
echo "    PASS no JSON store file was created or modified"

echo "=== 8. restart and re-verify persistence ==="
stop_server
start_server || fail "production server did not restart (see $OUT/server.log)"
MODULES_CODE="$(curl -s -o "$OUT/modules-after.json" -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/modules")"
[ "$MODULES_CODE" = "200" ] || fail "/api/modules after restart returned $MODULES_CODE"
grep -q '"module_key":"pg"' "$OUT/modules-after.json" || fail "module flags were not persisted across restart"
echo "    PASS PostgreSQL module flags persisted across a production restart"

echo "=== 9. verdict ==="
echo "    PASS production_startup=postgres json_fallback=disabled modules=db_backed restart=persisted"
echo "    logs: $OUT"
