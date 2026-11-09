#!/usr/bin/env bash
# =============================================================================
# Universal Live Builder end-to-end verification.
#
# Creates a THROWAWAY PostgreSQL cluster in a private temporary directory,
# applies the baseline schema and every migration, then drives the real Express
# API with signed sessions:
#
#   1. registry + published baseline reads (public)
#   2. anonymous / customer authorization failures
#   3. admin draft → Super Admin publish → public read
#   4. rejection of executable content, unknown components and stale versions
#   5. rollback to a published version
#   6. module builder (School/Job), relation guards and records
#   7. approved report metric + audit trail
#   8. RLS: anon sees published pages only; drafts stay hidden
#   9. audit rows cannot be updated or deleted
#  10. the legacy JSON store is untouched
#
# Usage: bash supabase/tests/run_universal_builder_e2e.sh
# Exit:  0 = every HTTP and SQL assertion passed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-builder.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace universal builder scratch directory" > "$TMP_ROOT/.bos-builder-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
APIPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_universal_builder
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION_SECRET="builder-e2e-session-secret-0123456789abcdef"
STORE="$TMP_ROOT/authoritative-store.json"
SERVER_PID=""
mkdir -p "$OUT"

UUID_SUPER="11111111-bbbb-4bbb-8bbb-111111111111"
UUID_ADMIN="22222222-bbbb-4bbb-8bbb-222222222222"
UUID_CUSTOMER="33333333-bbbb-4bbb-8bbb-333333333333"

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
marker = root / '.bos-builder-owned'
if root.parent != base or not root.name.startswith('bos-builder.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace universal builder scratch directory':
    raise SystemExit('Refusing cleanup: scratch ownership marker did not match')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

start_server() {
  BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
  BOS_SERVER_HMAC_SECRET="$SESSION_SECRET" \
  NODE_ENV=test \
  PORT="$APIPORT" \
  BOS_TEST_AUTHORITATIVE_STORE_PATH="$STORE" \
  DISABLE_HMR=true \
  npx tsx server.ts > "$OUT/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 200); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APIPORT/api/auth/me" 2>/dev/null || true)
    [ "$CODE" = "401" ] && return 0
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.2
  done
  tail -50 "$OUT/server.log" >&2
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
       grep -E "ERROR|DETAIL|HINT" "$OUT/migration.err" | head -8 >&2
       exit 1
     }
  echo "    applied $(basename "$MIG_FILE")"
done

echo "=== 4. seed administrators ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL || fail "seed"
insert into auth.users (id, email, raw_user_meta_data) values
  ('$UUID_SUPER', 'super@example.test', '{}'),
  ('$UUID_ADMIN', 'admin@example.test', '{}'),
  ('$UUID_CUSTOMER', 'customer@example.test', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role, account_status) values
  ('$UUID_SUPER', 'super@example.test', 'Super Admin', 'admin', 'active'),
  ('$UUID_ADMIN', 'admin@example.test', 'Admin', 'admin', 'active'),
  ('$UUID_CUSTOMER', 'customer@example.test', 'Customer', 'customer', 'active')
on conflict (id) do update set role = excluded.role, account_status = 'active';

update public.profiles set is_super_admin = true where id = '$UUID_SUPER';
SQL
printf '%s' '{"seatLocks":{},"bookings":[],"enquiries":[],"paymentIntents":{},"usedUtrs":{},"checkedInPasses":{},"users":[],"notifications":[],"notificationCampaigns":[],"providerListings":{},"adminModules":{},"revokedTokens":{}}' > "$STORE"
STORE_HASH_BEFORE=$(shasum -a 256 "$STORE" | awk '{print $1}')

echo "=== 5. start API ==="
start_server || fail "API did not become ready (see $OUT/server.log)"

echo "=== 6. HTTP assertions ==="
node "$REPO_ROOT/tests/universal-builder.integration.mjs" \
  "http://127.0.0.1:$APIPORT" "$SESSION_SECRET" "$UUID_SUPER" "$UUID_ADMIN" "$UUID_CUSTOMER" \
  | tee "$OUT/http.out"
HTTP_EXIT=${PIPESTATUS[0]}
[ "$HTTP_EXIT" = "0" ] || fail "HTTP assertions failed"

echo "=== 6b. independent browser sessions ==="
node "$REPO_ROOT/tests/universal-builder.browser.integration.mjs" \
  "http://127.0.0.1:$APIPORT" "$SESSION_SECRET" "$UUID_SUPER" \
  | tee "$OUT/browser.out"
BROWSER_EXIT=${PIPESTATUS[0]}
[ "$BROWSER_EXIT" = "0" ] || fail "independent browser assertions failed"

echo "=== 7. SQL: RLS and audit immutability ==="
TOTAL_ROWS=$(pq -d "$DB" -tAc "select count(*) from public.platform_page_versions")
PUBLISHED_ROWS=$(pq -d "$DB" -tAc "select count(*) from public.platform_page_versions where status='published'")
DRAFT_ROWS=$(pq -d "$DB" -tAc "select count(*) from public.platform_page_versions where status='draft'")
ANON_VISIBLE=$(pq -d "$DB" -tAc "set role anon; select count(*) from public.platform_page_versions;" 2>/dev/null | tail -1)
echo "    total versions=$TOTAL_ROWS published=$PUBLISHED_ROWS drafts=$DRAFT_ROWS anon_visible=$ANON_VISIBLE"
[ "$DRAFT_ROWS" -ge 1 ] || fail "expected at least one draft version"
[ "$ANON_VISIBLE" = "$PUBLISHED_ROWS" ] || fail "anon must only see published versions (saw $ANON_VISIBLE vs $PUBLISHED_ROWS)"
echo "  PASS  anonymous RLS exposes published versions only"
for PAGE_KEY in pg_hostels classes venues services hotel_stay movies; do
  PAGE_PUBLISHED=$(pq -d "$DB" -tAc "select count(*) from public.platform_page_versions where page_key='$PAGE_KEY' and status='published'")
  PAGE_ANON=$(pq -d "$DB" -tAc "set role anon; select count(*) from public.platform_page_versions where page_key='$PAGE_KEY';" 2>/dev/null | tail -1)
  PAGE_DRAFT=$(pq -d "$DB" -tAc "select count(*) from public.platform_page_versions where page_key='$PAGE_KEY' and status='draft'")
  [ "$PAGE_PUBLISHED" -ge 1 ] || fail "$PAGE_KEY has no published version"
  [ "$PAGE_ANON" = "$PAGE_PUBLISHED" ] || fail "$PAGE_KEY anon visibility $PAGE_ANON != published $PAGE_PUBLISHED"
  echo "  PASS  $PAGE_KEY RLS published=$PAGE_PUBLISHED drafts=$PAGE_DRAFT anon_visible=$PAGE_ANON"
done

if pq -d "$DB" -tAc "update public.platform_builder_audit set summary='tampered'" >/dev/null 2>&1; then
  fail "builder audit accepted an update"
fi
if pq -d "$DB" -tAc "delete from public.platform_builder_audit" >/dev/null 2>&1; then
  fail "builder audit accepted a delete"
fi
AUDIT_ROWS=$(pq -d "$DB" -tAc "select count(*) from public.platform_builder_audit")
echo "  PASS  audit is append-only ($AUDIT_ROWS rows)"

ANON_WRITE=$(pq -d "$DB" -tAc "begin; set local role anon; insert into public.platform_page_versions (page_key,version_number,status,document,summary,published_at) values ('services',99,'published','{}'::jsonb,'x',now()); commit;" >/dev/null 2>&1 && echo allowed || echo denied)
[ "$ANON_WRITE" = "denied" ] || fail "anon could insert a page version directly"
echo "  PASS  direct table writes are denied to anon"

echo "=== 8. JSON store untouched ==="
STORE_HASH_AFTER=$(shasum -a 256 "$STORE" | awk '{print $1}')
[ "$STORE_HASH_BEFORE" = "$STORE_HASH_AFTER" ] || fail "the legacy JSON store was modified"
echo "  PASS  json_store_sha256=unchanged"

echo "=== 9. verdict ==="
echo "    PASS pages=draft_publish_rollback rbac=enforced validation=allowlist audit=append_only rls=published_only records=module_scoped"
echo "    logs: $OUT"
