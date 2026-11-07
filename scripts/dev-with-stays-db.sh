#!/usr/bin/env bash
# Development-only: run the app with a local PostgreSQL stays database seeded
# from the existing demo catalog. Never used by production start/deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

COUNT=$("${PSQL[@]}" -d "$DB_NAME" -tAc "select count(*) from public.stay_properties")
if [ "$COUNT" = "0" ]; then
  echo "[stays-dev] seeding the existing demo catalog into the local database"
  BOS_LISTINGS_DATABASE_URL="$DB_URL" npx tsx "$ROOT/scripts/seed-stays-demo.ts"
fi

export BOS_LISTINGS_DATABASE_URL="$DB_URL"
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

echo "[stays-dev] starting the app (Ctrl+C stops the app; the local database stays for next run)"
exec npx tsx "$ROOT/server.ts"
