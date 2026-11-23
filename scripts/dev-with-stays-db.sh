#!/usr/bin/env bash
# Development-only: run the app with a local PostgreSQL stays database seeded
# from the existing demo catalog. Never used by production start/deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# PostgreSQL 17 on macOS aborts a loopback cluster with "postmaster became
# multithreaded during startup" when the process has no valid locale (a CI or
# agent shell commonly has none). Pin a UTF-8 locale for this local cluster.
if [ -z "${LC_ALL:-}" ] || [ "${LC_ALL}" = "C" ] || [ "${LC_ALL}" = "POSIX" ]; then
  export LC_ALL="en_US.UTF-8"
fi
if [ -z "${LANG:-}" ] || [ "${LANG}" = "C" ]; then
  export LANG="en_US.UTF-8"
fi
CLI_BOS_DEV_DB_PORT="${BOS_DEV_DB_PORT-}"
# A caller that owns a throwaway cluster (the Playwright webServer and the
# provider-context harness) must keep its data directory and database URL.
# `.env.local` is sourced below for credentials, and without these captures it
# silently redirects the run at the developer's own local cluster, which fails
# with "psql: connection refused" on the caller's port.
CLI_BOS_DEV_DB_DATA_DIR="${BOS_DEV_DB_DATA_DIR-}"
CLI_BOS_LISTINGS_DATABASE_URL="${BOS_LISTINGS_DATABASE_URL-}"
# A harness that signs its own test sessions must keep its signing key: without
# this, `.env.local` above silently replaces it and every token is rejected 401.
CLI_BOS_SERVER_HMAC_SECRET="${BOS_SERVER_HMAC_SECRET-}"
CLI_PORT="${PORT-}"
CLI_VITE_ENABLE_DEMO_DATA="${VITE_ENABLE_DEMO_DATA-}"
CLI_BOS_STAY_INCLUDE_DEMO="${BOS_STAY_INCLUDE_DEMO-}"
CLI_BOS_STAY_ALLOW_DEMO_BOOKING="${BOS_STAY_ALLOW_DEMO_BOOKING-}"

# The Vite client loads .env.local automatically, but this standalone server
# process does not. Load the same local configuration so server-side Supabase
# and email authentication use the configured project during local testing.
if [ -f "$ROOT/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env.local"
  set +a
fi

# Preserve explicit command-line environment overrides over .env.local.
[ -n "$CLI_BOS_DEV_DB_PORT" ] && export BOS_DEV_DB_PORT="$CLI_BOS_DEV_DB_PORT"
[ -n "$CLI_BOS_DEV_DB_DATA_DIR" ] && export BOS_DEV_DB_DATA_DIR="$CLI_BOS_DEV_DB_DATA_DIR"
[ -n "$CLI_BOS_LISTINGS_DATABASE_URL" ] && export BOS_LISTINGS_DATABASE_URL="$CLI_BOS_LISTINGS_DATABASE_URL"
[ -n "$CLI_BOS_SERVER_HMAC_SECRET" ] && export BOS_SERVER_HMAC_SECRET="$CLI_BOS_SERVER_HMAC_SECRET"
[ -n "$CLI_PORT" ] && export PORT="$CLI_PORT"
[ -n "$CLI_VITE_ENABLE_DEMO_DATA" ] && export VITE_ENABLE_DEMO_DATA="$CLI_VITE_ENABLE_DEMO_DATA"
[ -n "$CLI_BOS_STAY_INCLUDE_DEMO" ] && export BOS_STAY_INCLUDE_DEMO="$CLI_BOS_STAY_INCLUDE_DEMO"
[ -n "$CLI_BOS_STAY_ALLOW_DEMO_BOOKING" ] && export BOS_STAY_ALLOW_DEMO_BOOKING="$CLI_BOS_STAY_ALLOW_DEMO_BOOKING"

DATA_DIR="${BOS_DEV_DB_DATA_DIR:-$ROOT/.local/stays-db}"
DB_NAME="bookourspace_dev"
DB_PORT="${BOS_DEV_DB_PORT:-55440}"
DB_URL="postgres://postgres@127.0.0.1:${DB_PORT}/${DB_NAME}?sslmode=disable"
MODE="${1:-serve}"

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null 2>&1 || { echo "[stays-dev] $bin is required (PostgreSQL 15+)." >&2; exit 1; }
done

mkdir -p "$ROOT/.local"
if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
  echo "[stays-dev] creating local cluster at $DATA_DIR"
  initdb -D "$DATA_DIR" -U postgres --auth=trust >/tmp/bos-stays-dev-initdb.log 2>&1
fi

if ! pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1; then
  echo "[stays-dev] starting PostgreSQL on 127.0.0.1:${DB_PORT}"
  pg_ctl -D "$DATA_DIR" -o "-p ${DB_PORT} -k /tmp -c listen_addresses=127.0.0.1" -l "$ROOT/.local/stays-db.log" -w start >/dev/null
fi

PSQL=(psql -h 127.0.0.1 -p "$DB_PORT" -U postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -d postgres -tAc "select 1 from pg_database where datname='${DB_NAME}'" | grep -q 1 \
  || "${PSQL[@]}" -d postgres -q -c "create database ${DB_NAME}"

if ! "${PSQL[@]}" -d "$DB_NAME" -tAc "select to_regclass('public.stay_properties')" | grep -q stay_properties; then
  echo "[stays-dev] applying baseline schema and all migrations (one time)"
  "${PSQL[@]}" -d "$DB_NAME" -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb, banned_until timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
                  nullif(current_setting('test.uid', true), '')::uuid) $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('test.role', true), ''), 'authenticated') $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
do $$ begin if not exists (select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if; end $$;
SQL
  "${PSQL[@]}" -d "$DB_NAME" -q -f "$ROOT/supabase/tests/lib/bos_storage_stub.sql"
  "${PSQL[@]}" -d "$DB_NAME" -q -f "$ROOT/supabase/schema_and_rls.sql"
  "${PSQL[@]}" -d "$DB_NAME" -q -c "create table if not exists public._dev_migrations (filename text primary key, applied_at timestamptz not null default now())"
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    "${PSQL[@]}" -d "$DB_NAME" -q -f "$migration" >/dev/null
    "${PSQL[@]}" -d "$DB_NAME" -q -c "insert into public._dev_migrations(filename) values ('$(basename "$migration")') on conflict do nothing"
  done
else
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    name="$(basename "$migration")"
    applied=$("${PSQL[@]}" -d "$DB_NAME" -tAc "select 1 from public._dev_migrations where filename='${name}'")
    if [ "$applied" != "1" ]; then
      echo "[stays-dev] applying new migration ${name}"
      "${PSQL[@]}" -d "$DB_NAME" -q -f "$migration" >/dev/null
      "${PSQL[@]}" -d "$DB_NAME" -q -c "insert into public._dev_migrations(filename) values ('${name}') on conflict do nothing"
    fi
  done
fi

# Match the hosted public media metadata grant used by the stay search query.
# This is applied only to the throwaway loopback database; Storage policies
# and private-document access are never changed.
"${PSQL[@]}" -d "$DB_NAME" -q <<'SQL'
grant select on public.listings to anon, authenticated;
grant select (id, owner_id, parent_type, parent_id, bucket_id, object_path,
              variants, privacy, processing_status, display_order, created_at)
  on public.media_assets to anon, authenticated;
SQL

LOC_COUNT=$("${PSQL[@]}" -d "$DB_NAME" -tAc "select coalesce(to_regclass('public.india_locations')::text, '')")
if [ -n "$LOC_COUNT" ]; then
  LOC_ROWS=$("${PSQL[@]}" -d "$DB_NAME" -tAc "select count(*) from public.india_locations")
  if [ "${LOC_ROWS:-0}" -lt 1000 ]; then
    echo "[stays-dev] seeding India location directory (loopback only)"
    BOS_LISTINGS_DATABASE_URL="$DB_URL" npx tsx "$ROOT/scripts/seed-india-locations.ts"
  fi
fi

COUNT=$("${PSQL[@]}" -d "$DB_NAME" -tAc "select count(*) from public.stay_properties")
if [ "$COUNT" = "0" ]; then
  echo "[stays-dev] seeding the existing demo catalog into the local database"
  BOS_LISTINGS_DATABASE_URL="$DB_URL" npx tsx "$ROOT/scripts/seed-stays-demo.ts"
fi

export BOS_LISTINGS_DATABASE_URL="$DB_URL"
# Local previews intentionally include clearly marked demo fixtures. Production
# never uses this script; the flag is exported only for this loopback process.
export VITE_ENABLE_DEMO_DATA="${VITE_ENABLE_DEMO_DATA:-true}"
# Explicit local preview opt-in. The catalog seeded above is stored with
# payload.demo=true, and stay search drops demo rows unless this flag is set.
# Without it the Airbnb-style Stay grid falls back to whatever non-demo rows
# happen to exist (locally: photoless test fixtures), so every card renders
# "Photos coming soon". Production never sets this and always drops demo rows.
export BOS_STAY_INCLUDE_DEMO="1"
# The seeded demo catalog is also fully bookable in this local preview so the
# whole Stay journey can be exercised. Production never sets this.
export BOS_STAY_ALLOW_DEMO_BOOKING="1"
echo "[stays-dev] stays database ready: ${DB_URL}"

if [ "$MODE" = "ensure" ]; then
  exit 0
fi

echo "[stays-dev] starting the app (Ctrl+C stops the app; disposable Playwright databases are stopped too)"

# Playwright owns an explicitly named /tmp cluster for each isolated run. The
# normal developer cluster must remain running, so cleanup is enabled only for
# that exact disposable naming contract. No data directory is removed.
DISPOSABLE_DB=0
case "$DATA_DIR" in
  /tmp/bookourspace-playwright-db-*) DISPOSABLE_DB=1 ;;
esac
APP_PID=""
cleanup_disposable_db() {
  if [ "$DISPOSABLE_DB" = 1 ] && [ -n "$APP_PID" ]; then
    kill -TERM "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  if [ "$DISPOSABLE_DB" = 1 ]; then
    pg_ctl -D "$DATA_DIR" -m fast -w stop >/dev/null 2>&1 || true
  fi
}
trap cleanup_disposable_db EXIT INT TERM
npx tsx "$ROOT/server.ts" &
APP_PID=$!
wait "$APP_PID"
