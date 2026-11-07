#!/usr/bin/env bash
# =============================================================================
# Offline validation of the Google OAuth path for the Mumbai Supabase project.
#
# Creates a THROWAWAY PostgreSQL cluster, applies the baseline schema and every
# migration, starts a LOCAL stand-in for Supabase Auth and drives the real
# Express API with it. It proves the OAuth path end to end without contacting
# Google, without contacting Supabase, and without touching any hosted
# project.
#
# It never applies a hosted migration, never signs in to Google and never
# modifies Stockholm or Mumbai.
#
# Usage: bash supabase/tests/run_mumbai_oauth_e2e.sh
# Exit:  0 = every assertion passed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-mumbai-oauth.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace Mumbai OAuth scratch directory" > "$TMP_ROOT/.bos-mumbai-oauth-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
APIPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_mumbai_oauth
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION_SECRET="mumbai-oauth-e2e-session-secret"
STORE="$TMP_ROOT/authoritative-store.json"
SERVER_PID=""
AUTH_PID=""
mkdir -p "$OUT"

UUID_CUSTOMER="77777777-8888-4999-8888-777777777777"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
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

stop_auth() {
  if [ -n "$AUTH_PID" ] && kill -0 "$AUTH_PID" 2>/dev/null; then
    kill "$AUTH_PID" 2>/dev/null
    wait "$AUTH_PID" 2>/dev/null || true
  fi
  AUTH_PID=""
}

cleanup() {
  stop_server
  stop_auth
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-mumbai-oauth-owned'
if root.parent != base or not root.name.startswith('bos-mumbai-oauth.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace Mumbai OAuth scratch directory':
    raise SystemExit('Refusing cleanup: scratch ownership marker did not match')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

echo "=== 1. throwaway PostgreSQL cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || fail "initdb"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" \
       -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
for _ in $(seq 1 40); do
  pq -tAc "select 1" >/dev/null 2>&1 && break
  sleep 0.5
done
pq -tAc "select version()" >/dev/null 2>&1 || fail "cluster did not start (see $OUT/postgres.log)"
echo "    $(pq -tAc "select version()" | cut -d, -f1)"

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
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
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
done
echo "    $(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations applied"

echo "=== 4. local stand-in for Supabase Auth ==="
node "$REPO_ROOT/tests/support/fake-supabase-auth.mjs" > "$OUT/fake-auth.log" 2>&1 &
AUTH_PID=$!
for _ in $(seq 1 60); do
  AUTH_PORT=$(sed -n 's/^FAKE_SUPABASE_AUTH_PORT=//p' "$OUT/fake-auth.log" | head -1)
  [ -n "$AUTH_PORT" ] && break
  sleep 0.2
done
[ -n "${AUTH_PORT:-}" ] || { tail -5 "$OUT/fake-auth.log" >&2; fail "the local Auth stand-in did not start"; }
AUTH_BASE="http://127.0.0.1:$AUTH_PORT"
echo "    listening on $AUTH_BASE (loopback only, no external call)"

echo "=== 5. start the API against the local Auth stand-in ==="
# Supabase Auth owns the auth.users row: it is created the first time the
# Google identity signs in. The profile email is read from that row, never
# from the browser, so the fixture mirrors the hosted behaviour exactly.
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL || fail "seed the auth user"
insert into auth.users (id, email, raw_user_meta_data) values
  ('$UUID_CUSTOMER', 'new.customer@example.test', '{"provider":"google","providers":["google"]}')
on conflict (id) do nothing;
SQL
printf '%s' '{"seatLocks":{},"bookings":[],"enquiries":[],"paymentIntents":{},"usedUtrs":{},"checkedInPasses":{},"users":[],"notifications":[],"notificationCampaigns":[],"providerListings":{},"adminModules":{},"revokedTokens":{}}' > "$STORE"
VITE_SUPABASE_URL="$AUTH_BASE" \
VITE_SUPABASE_PROJECT_ID="local" \
VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_abcdefghijklmnopqrstuv_01234567" \
BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
BOS_SERVER_HMAC_SECRET="$SESSION_SECRET" \
NODE_ENV=test \
PORT="$APIPORT" \
BOS_TEST_AUTHORITATIVE_STORE_PATH="$STORE" \
npx tsx server.ts > "$OUT/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 400); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/auth/me" 2>/dev/null || true)
  [ "$CODE" = "401" ] && break
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 0.2
done
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/auth/me" 2>/dev/null || true)
[ "$CODE" = "401" ] || { tail -30 "$OUT/server.log" >&2; fail "the API did not become ready"; }
echo "    listening on http://127.0.0.1:$APIPORT"

echo "=== 6. OAuth path assertions ==="
node "$REPO_ROOT/tests/mumbai-oauth.e2e.mjs" \
  "http://127.0.0.1:$APIPORT" "$AUTH_BASE" "$SESSION_SECRET" \
  | tee "$OUT/oauth.out"
OAUTH_EXIT=${PIPESTATUS[0]}
if [ "$OAUTH_EXIT" != "0" ]; then
  tail -40 "$OUT/server.log" >&2
  fail "the OAuth assertions failed"
fi

echo "=== 7. database invariants ==="
PROFILE_ROWS=$(pq -d "$DB" -tAc "select count(*) from public.profiles where id = '$UUID_CUSTOMER'")
PROFILE_ROLE=$(pq -d "$DB" -tAc "select role from public.profiles where id = '$UUID_CUSTOMER'")
PROFILE_STATUS=$(pq -d "$DB" -tAc "select account_status from public.profiles where id = '$UUID_CUSTOMER'")
AUTH_USER_ROWS=$(pq -d "$DB" -tAc "select count(*) from auth.users where id = '$UUID_CUSTOMER'")
STORE_HASH=$(shasum -a 256 "$STORE" | awk '{print $1}')
echo "    profile_rows=$PROFILE_ROWS role=$PROFILE_ROLE status=$PROFILE_STATUS auth_user_rows=$AUTH_USER_ROWS"
[ "$PROFILE_ROWS" = "1" ] || fail "the Google identity did not provision exactly one profile row"
[ "$PROFILE_ROLE" = "customer" ] || fail "the provisioned profile is not a customer"
[ "$PROFILE_STATUS" = "active" ] || fail "the provisioned profile is not active"
[ "$AUTH_USER_ROWS" = "1" ] || fail "the identity was provisioned more than once"

echo "=== 8. verdict ==="
echo "    PASS oauth_redirect=generated google_only=verified customer=provisioned_once admin=refused"
echo "    PASS session_expiry=refused logout=revoked role_source=database"
echo "    BLOCKED live Google sign-in: no real OAuth login was performed"
echo "    logs: $OUT"
