#!/usr/bin/env bash
# =============================================================================
# Local database validation for BookOurSpace migrations and stay inventory.
#
# Creates a unique THROWAWAY PostgreSQL cluster in a private temporary
# directory. It never reuses or removes a caller-supplied data path, database,
# output directory, port, or barrier file. It applies the existing baseline
# schema followed by every migration, then
# runs:
#   1. supabase/tests/stay_inventory_test.sql   (functional + invariant suite)
#   2. a genuine two-session concurrency test   (no double booking possible)
#
# It never contacts Supabase, never reads credentials and never touches the
# production project.
#
# The cluster only stubs what Supabase supplies: the `auth` schema, auth.users,
# auth.uid() and auth.role(). handle_new_user() reads raw_user_meta_data, so the
# stub table carries that column too.
#
# Usage:  bash supabase/tests/run_local_validation.sh
# Exit:   0 = everything passed, 1 = a check failed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C
# The integration children use this fresh disposable database, which includes
# the distributed limiter migration; enable the real middleware in those tests.
export BOS_TEST_RATE_LIMIT=1

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-local-validation.XXXXXX")" || exit 1
MARKER="$TMP_ROOT/.bos-local-validation-owned"
printf '%s\n' "BookOurSpace local validation scratch directory" > "$MARKER"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
BARRIER="$TMP_ROOT/concurrency-barrier"
export BOS_LOCAL_VALIDATION_BARRIER="$BARRIER"
DB=bos_dev
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

cleanup() {
  if [ "${BOS_KEEP_LOCAL_VALIDATION:-0}" = "1" ]; then
    echo "    preserved isolated test files at $TMP_ROOT"
    return
  fi
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  # Remove only the directory created by this invocation, after checking both
  # its parent and ownership marker. No fixed /tmp path is ever deleted.
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-local-validation-owned'
if root.parent != base or not root.name.startswith('bos-local-validation.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace local validation scratch directory':
    raise SystemExit('Refusing cleanup: scratch ownership marker did not match')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

echo "=== 1. throwaway cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 \
  || fail "initdb (see $OUT/initdb.log)"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1 -c wal_level=logical" \
       -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  pq -tAc "select 1" >/dev/null 2>&1 && break
  sleep 0.5
done
SERVER_VERSION=$(pq -tAc "select version()" 2>/dev/null) || fail "server did not start (see $OUT/postgres.log)"
echo "    $SERVER_VERSION"

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
-- raw_user_meta_data is required by the baseline's handle_new_user() trigger.
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  banned_until timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id));
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

echo "=== 3. baseline schema ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" \
   > "$OUT/baseline.out" 2> "$OUT/baseline.err" || fail "baseline schema (see $OUT/baseline.err)"
echo "    applied: $(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'") tables"

test_forward_migration_failure_atomicity() {
  local migration_file="$1"
  local migration_name="$2"
  local fault_file="$OUT/${migration_name}.fault-injected.sql"
  local fault_log="$OUT/${migration_name}.fault-injected.log"

  python3 - "$migration_file" "$fault_file" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1]).read_text()
lines = [line for line in source.splitlines() if line.strip().lower() not in {'begin;', 'commit;'}]
Path(sys.argv[2]).write_text('begin;\n' + '\n'.join(lines) + '\nselect 1 / 0;\ncommit;\n')
PY

  local data_before data_after
  data_before=$(pq -d "$DB" -tAc "select jsonb_build_object(
    'bookings', (select count(*) from public.bookings),
    'stay_allocations', (select count(*) from public.stay_allocations),
    'payment_intents', (select count(*) from public.payment_intents),
    'media_assets', (select count(*) from public.media_assets),
    'storage_objects', (select count(*) from storage.objects)
  )::text") || fail "capturing pre-failure data counts for $migration_name"

  if pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$fault_file" >"$fault_log" 2>&1; then
    fail "fault-injected $migration_name unexpectedly succeeded"
  fi

  data_after=$(pq -d "$DB" -tAc "select jsonb_build_object(
    'bookings', (select count(*) from public.bookings),
    'stay_allocations', (select count(*) from public.stay_allocations),
    'payment_intents', (select count(*) from public.payment_intents),
    'media_assets', (select count(*) from public.media_assets),
    'storage_objects', (select count(*) from storage.objects)
  )::text") || fail "capturing post-failure data counts for $migration_name"
  [ "$data_before" = "$data_after" ] || fail "$migration_name fault changed booking/payment/media/storage row counts"

  case "$migration_name" in
    20261105150000_server_media_byte_validation)
      pq -d "$DB" -tAc "select to_regprocedure('public.finalize_media_asset_server(uuid,uuid,text,integer,integer)') is null and has_function_privilege('authenticated', 'public.finalize_media_asset(uuid)', 'EXECUTE')" | grep -qx t \
        || fail "$migration_name fault did not roll back function and grant changes"
      ;;
    20261105160000_media_published_listing_visibility)
      pq -d "$DB" -tAc "select to_regclass('public.media_asset_publications') is null and exists (select 1 from pg_policies where schemaname='public' and tablename='media_assets' and policyname='Ready public media is readable')" | grep -qx t \
        || fail "$migration_name fault did not roll back publication and policy changes"
      ;;
    20261105170000_stay_discovery_filters)
      pq -d "$DB" -tAc "select not exists (select 1 from information_schema.columns where table_schema='public' and table_name='stay_properties' and column_name='place_type') and to_regprocedure('public.stay_amenity_key(text)') is null" | grep -qx t \
        || fail "$migration_name fault did not roll back Stay schema and function changes"
      ;;
    20261105163924_profile_media_and_account_closure)
      pq -d "$DB" -tAc "select to_regclass('public.account_closure_audit') is null and to_regprocedure('public.close_account_server(uuid,timestamptz,text)') is null and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='cover_url') and not exists (select 1 from storage.buckets where id='bos-private-profile-media')" | grep -qx t \
        || fail "$migration_name fault left profile media or account closure objects behind"
      ;;
    20261105220000_restore_pg_hostel_property_type)
      pq -d "$DB" -tAc "select position('pg_hostel' in pg_get_constraintdef(oid)) > 0 from pg_constraint where conrelid='public.stay_properties'::regclass and conname='stay_properties_property_type_chk'" | grep -qx t \
        || fail "$migration_name fault changed the prior PG-compatible property type constraint"
      ;;
  esac
  echo "    fault-injection PASS $migration_name: DDL and protected row counts unchanged"
}

echo "=== 4. migrations (filename order) ==="
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  MIG_NAME=$(basename "$MIG_FILE")
  if [ "${BOS_FORWARD_RECOVERY_ONLY:-0}" = "1" ] && [[ "$MIG_NAME" > "20261105170000_stay_discovery_filters.sql" ]]; then
    echo "    excluded by forward-recovery scope: $MIG_NAME"
    continue
  fi
  case "$MIG_NAME" in
    20261105150000_server_media_byte_validation.sql|20261105160000_media_published_listing_visibility.sql|20261105163924_profile_media_and_account_closure.sql|20261105170000_stay_discovery_filters.sql|20261105220000_restore_pg_hostel_property_type.sql)
      test_forward_migration_failure_atomicity "$MIG_FILE" "${MIG_NAME%.sql}"
      ;;
  esac
  pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" \
     > "$OUT/migration.out" 2> "$OUT/migration.err" || {
       grep -E "ERROR|DETAIL" "$OUT/migration.err" | head -10 >&2
       fail "migration $MIG_NAME"
     }
  echo "    applied $MIG_NAME"
done
echo "    tables: $(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public'")"
echo "=== 4a1. distributed API rate limiter privileges and atomic behavior ==="
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/distributed_api_rate_limit_test.sql" > "$OUT/distributed-api-rate-limit.out" 2>&1 \
  || fail "distributed API rate limiter SQL assertions (see $OUT/distributed-api-rate-limit.out)"
grep "NOTICE:  PASS" "$OUT/distributed-api-rate-limit.out" | sed 's/^/    /'
RATE_LIMIT_SQL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/distributed-api-rate-limit.out" || true)
[ "$RATE_LIMIT_SQL_PASS" = "6" ] || fail "distributed API rate limit suite ran only $RATE_LIMIT_SQL_PASS passing assertions"
echo "=== 4a2. distributed rate limiter concurrent requests ==="
(
  pq -d "$DB" -tAc "set role service_role; select allowed from private.consume_api_rate_limit(repeat('b',64),1,3600)" > "$OUT/rate-limit-concurrent-a.out" 2>&1
) & RATE_LIMIT_A_PID=$!
(
  pq -d "$DB" -tAc "set role service_role; select allowed from private.consume_api_rate_limit(repeat('b',64),1,3600)" > "$OUT/rate-limit-concurrent-b.out" 2>&1
) & RATE_LIMIT_B_PID=$!
wait "$RATE_LIMIT_A_PID" || fail "first concurrent rate-limit transaction failed"
wait "$RATE_LIMIT_B_PID" || fail "second concurrent rate-limit transaction failed"
RATE_LIMIT_ALLOWED=$(cat "$OUT/rate-limit-concurrent-a.out" "$OUT/rate-limit-concurrent-b.out" | grep -c '^t$' || true)
RATE_LIMIT_DENIED=$(cat "$OUT/rate-limit-concurrent-a.out" "$OUT/rate-limit-concurrent-b.out" | grep -c '^f$' || true)
[ "$RATE_LIMIT_ALLOWED" = "1" ] && [ "$RATE_LIMIT_DENIED" = "1" ] || fail "concurrent atomic limiter decisions were allowed=$RATE_LIMIT_ALLOWED denied=$RATE_LIMIT_DENIED"
echo "    PASS concurrent requests serialized: allowed=$RATE_LIMIT_ALLOWED denied=$RATE_LIMIT_DENIED"
echo "=== 4aa. profile media and account closure migration idempotency ==="
PROFILE_MEDIA_MIGRATION="$REPO_ROOT/supabase/migrations/20261105163924_profile_media_and_account_closure.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$PROFILE_MEDIA_MIGRATION" \
  > "$OUT/profile-media-closure-reapply.out" 2> "$OUT/profile-media-closure-reapply.err" \
  || fail "reapplying profile media and account closure migration"
PROFILE_MEDIA_POLICY_COUNT=$(pq -d "$DB" -tAc "select count(*) from pg_policies where schemaname='public' and tablename='media_assets' and policyname='Customers register private profile images'")
PROFILE_MEDIA_BUCKET_PUBLIC=$(pq -d "$DB" -tAc "select public from storage.buckets where id='bos-private-profile-media'")
[ "$PROFILE_MEDIA_POLICY_COUNT" = "1" ] || fail "profile media insert policy duplicated or missing after reapply"
[ "$PROFILE_MEDIA_BUCKET_PUBLIC" = "f" ] || fail "profile media bucket is not private after reapply"
echo "    profile media policy remains singular and bucket remains private after reapply"
if [ "${BOS_FORWARD_RECOVERY_ONLY:-0}" = "1" ]; then
  echo "    forward-recovery preflight PASS: only prerequisite migrations through 051700 were applied locally"
  exit 0
fi

# A fresh migration-only cluster lets the HTTP Classes integration run in
# isolation from the other module suites when requested.
if [ "${BOS_ONLY_CLASSES_INTEGRATION:-0}" = "1" ]; then
  echo "=== isolated Node HTTP Classes PostgreSQL integration ==="
  BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
  NODE_ENV=test \
  node --import tsx --test "$REPO_ROOT/tests/classes-enrollment-postgres.integration.test.mjs" \
    > "$OUT/class-enrollment-node.out" 2>&1 \
    || { sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/class-enrollment-node.out" | tail -120; fail "isolated classes PostgreSQL HTTP integration"; }
  sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/class-enrollment-node.out" | tail -35
  exit 0
fi

echo "=== 4a. Function Halls & Venues PostgreSQL HTTP integration ==="
BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
NODE_ENV=test \
node --import tsx --test "$REPO_ROOT/tests/venue-bookings-postgres.integration.test.mjs" \
  > "$OUT/venue-bookings-node.out" 2>&1 \
  || { sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/venue-bookings-node.out" | tail -120; fail "venue booking PostgreSQL HTTP integration"; }
sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/venue-bookings-node.out" | tail -25

echo "=== 4a2. venue categories/timezone migration idempotency and RLS ==="
VENUE_TAXONOMY_MIGRATION="$REPO_ROOT/supabase/migrations/20261103175957_venue_dynamic_categories_timezone_dst.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$VENUE_TAXONOMY_MIGRATION" \
  > "$OUT/venue-taxonomy-reapply.out" 2> "$OUT/venue-taxonomy-reapply.err" \
  || fail "reapplying venue taxonomy/timezone migration"
VENUE_CATEGORY_RLS=$(pq -d "$DB" -tAc "select relrowsecurity from pg_class where oid='public.venue_categories'::regclass")
VENUE_CATEGORY_AUDIT_RLS=$(pq -d "$DB" -tAc "select relrowsecurity from pg_class where oid='public.venue_category_events'::regclass")
VENUE_CATEGORY_COUNT=$(pq -d "$DB" -tAc "select count(*) from public.venue_categories where active")
VENUE_CATEGORY_DIRECT_WRITE=$(pq -d "$DB" -tAc "select has_table_privilege('authenticated','public.venue_categories','INSERT') or has_table_privilege('authenticated','public.venue_categories','UPDATE')")
[ "$VENUE_CATEGORY_RLS" = "t" ] && [ "$VENUE_CATEGORY_AUDIT_RLS" = "t" ] || fail "venue taxonomy RLS is disabled"
[ "$VENUE_CATEGORY_COUNT" -ge "20" ] || fail "venue categories were not seeded"
[ "$VENUE_CATEGORY_DIRECT_WRITE" = "f" ] || fail "authenticated users can bypass the audited category RPC"
echo "    categories=$VENUE_CATEGORY_COUNT; category and audit RLS enabled; direct writes revoked; reapply passed"

echo "=== 4b. module flags Realtime publication ==="
REALTIME_FLAG_ROWS=$(pq -d "$DB" -tAc "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='platform_module_flags'")
[ "$REALTIME_FLAG_ROWS" = "1" ] || fail "platform_module_flags is not in supabase_realtime"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/migrations/20261101000004_platform_module_realtime.sql" \
  > "$OUT/migration-004-repeat.out" 2> "$OUT/migration-004-repeat.err" \
  || fail "migration 004 is not idempotent on reapply"
REALTIME_FLAG_ROWS=$(pq -d "$DB" -tAc "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='platform_module_flags'")
[ "$REALTIME_FLAG_ROWS" = "1" ] || fail "reapplying migration 004 duplicated/removed the publication entry"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/migrations/20261108150000_superadmin_module_visibility.sql" \
  > "$OUT/superadmin-module-visibility-reapply.out" 2> "$OUT/superadmin-module-visibility-reapply.err" \
  || fail "reapplying the final Super Admin module visibility policy"
MODULE_FLAG_CLIENT_WRITE_PRIVILEGE=$(pq -d "$DB" -tAc "select exists (
  select 1 from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as p(privilege)
   where has_table_privilege('anon','public.platform_module_flags',p.privilege)
      or has_table_privilege('authenticated','public.platform_module_flags',p.privilege)
)")
MODULE_FLAG_WRITE_POLICY=$(pq -d "$DB" -tAc "select count(*) from pg_policies where schemaname='public' and tablename='platform_module_flags' and cmd in ('ALL','INSERT','UPDATE','DELETE')")
MODULE_FLAG_RLS=$(pq -d "$DB" -tAc "select relrowsecurity from pg_class where oid='public.platform_module_flags'::regclass")
MODULE_FLAG_SELECT_GRANTS=$(pq -d "$DB" -tAc "select has_table_privilege('anon','public.platform_module_flags','SELECT') and has_table_privilege('authenticated','public.platform_module_flags','SELECT')")
MODULE_FLAG_PUBLIC_READ_POLICY=$(pq -d "$DB" -tAc "select count(*) from pg_policies where schemaname='public' and tablename='platform_module_flags' and cmd='SELECT' and qual='true'")
[ "$REALTIME_FLAG_ROWS" = "1" ] || fail "module visibility migration altered the Realtime publication"
[ "$MODULE_FLAG_CLIENT_WRITE_PRIVILEGE" = "f" ] || fail "anon/authenticated retain a direct module flag write privilege"
[ "$MODULE_FLAG_WRITE_POLICY" = "0" ] || fail "authenticated users retain a direct module flag write policy"
[ "$MODULE_FLAG_RLS" = "t" ] || fail "module visibility migration disabled RLS"
[ "$MODULE_FLAG_SELECT_GRANTS" = "t" ] || fail "public module flag SELECT grant was removed"
[ "$MODULE_FLAG_PUBLIC_READ_POLICY" = "1" ] || fail "public module flag SELECT policy is missing or changed"
echo "    module flags are published once; final Super Admin-only server write boundary survives legacy migration reapply"

echo "=== 4c. active-admin listing policy idempotency ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/supabase/migrations/20261101072320_active_admin_marketplace_listing_rls.sql" \
  > "$OUT/admin-listing-policy-reapply.out" 2>&1 \
  || fail "reapplying active-admin listing policy migration"
ACTIVE_ADMIN_POLICIES=$(pq -d "$DB" -tAc "select count(*) from pg_policies where schemaname='public' and tablename='listings' and policyname='Active admins manage all listings'")
[ "$ACTIVE_ADMIN_POLICIES" = "1" ] || fail "reapplying active-admin listing migration changed policy count"
echo "    active-admin listing policy is present once after reapply"

echo "=== 4d. admin stay inventory migration idempotency ==="
STAY_MIGRATION="$REPO_ROOT/supabase/migrations/20261101073937_admin_stay_inventory_safety.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$STAY_MIGRATION" \
  > "$OUT/admin-stay-migration-reapply.out" 2> "$OUT/admin-stay-migration-reapply.err" \
  || fail "reapplying admin stay inventory migration"
STAY_ADMIN_RPC=$(pq -d "$DB" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_upsert_stay_inventory'")
[ "$STAY_ADMIN_RPC" = "1" ] || fail "admin stay inventory RPC missing or duplicated after reapply"
STAY_DELETE_POLICIES=$(pq -d "$DB" -tAc "select count(*) from pg_policies where schemaname='public' and tablename in ('stay_properties','stay_room_types','stay_units','stay_blocks') and cmd in ('DELETE','ALL')")
[ "$STAY_DELETE_POLICIES" = "0" ] || fail "stay inventory still has a broad/delete RLS policy"
echo "    atomic stay RPC present once; authenticated delete policies remain absent"

echo "=== 4e. App Builder migration idempotency + Realtime ==="
APP_CONFIG_MIGRATION="$REPO_ROOT/supabase/migrations/20261101075829_app_builder_config_versions.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$APP_CONFIG_MIGRATION" \
  > "$OUT/app-config-migration-reapply.out" 2> "$OUT/app-config-migration-reapply.err" \
  || fail "reapplying App Builder config migration"
APP_CONFIG_TABLE=$(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public' and tablename='platform_config_versions'")
APP_CONFIG_REALTIME=$(pq -d "$DB" -tAc "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='platform_config_versions'")
[ "$APP_CONFIG_TABLE" = "1" ] || fail "App Builder config table is missing/duplicated"
[ "$APP_CONFIG_REALTIME" = "1" ] || fail "App Builder config table is not published for Realtime"
echo "    App Builder table and Realtime membership survive migration reapply"

echo "=== 4f. Farm & Village listing migration idempotency ==="
RURAL_MIGRATION="$REPO_ROOT/supabase/migrations/20261101175250_former_local_services_listing_fields.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$RURAL_MIGRATION" \
  > "$OUT/former-local-services-migration-reapply.out" 2> "$OUT/former-local-services-migration-reapply.err" \
  || fail "reapplying Farm & Village listing migration"
RURAL_VERIFICATION_TRIGGER=$(pq -d "$DB" -tAc "select count(*) from pg_trigger where tgrelid='public.listings'::regclass and tgname='trg_guard_listing_verification_fields' and not tgisinternal")
[ "$RURAL_VERIFICATION_TRIGGER" = "1" ] || fail "Farm & Village verification trigger missing or duplicated after reapply"
echo "    Farm & Village fields and verification trigger survive migration reapply"

echo "=== 4g. provider registration migration idempotency + RLS ==="
PROVIDER_REG_MIGRATION="$REPO_ROOT/supabase/migrations/20261103171437_provider_registration_workflow.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$PROVIDER_REG_MIGRATION" \
  > "$OUT/provider-registration-reapply.out" 2> "$OUT/provider-registration-reapply.err" \
  || fail "reapplying provider registration migration"
PROFILE_PRIVACY_MIGRATION="$REPO_ROOT/supabase/migrations/20261104100000_profiles_private_access.sql"
PROFILE_INSERT_MIGRATION="$REPO_ROOT/supabase/migrations/20261104140000_restrict_profile_self_insert_columns.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$PROFILE_PRIVACY_MIGRATION" \
  > "$OUT/profile-privacy-after-registration.out" 2> "$OUT/profile-privacy-after-registration.err" \
  || fail "reapplying profile privacy migration after provider-registration migration"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$PROFILE_INSERT_MIGRATION" \
  > "$OUT/profile-insert-after-registration.out" 2> "$OUT/profile-insert-after-registration.err" \
  || fail "reapplying profile insert restriction migration after provider-registration migration"
PROVIDER_REG_TABLE=$(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public' and tablename='provider_registration_requests'")
PROVIDER_REG_RLS=$(pq -d "$DB" -tAc "select relrowsecurity from pg_class where oid='public.provider_registration_requests'::regclass")
PROVIDER_SELF_INSERT_POLICY=$(pq -d "$DB" -tAc "select count(*) from pg_policies where schemaname='public' and tablename='profiles' and policyname='Users can create own customer profile'")
[ "$PROVIDER_REG_TABLE" = "1" ] || fail "provider registration table missing/duplicated"
[ "$PROVIDER_REG_RLS" = "t" ] || fail "provider registration RLS is disabled"
[ "$PROVIDER_SELF_INSERT_POLICY" = "1" ] || fail "safe customer-only profile insert policy is missing/duplicated"
echo "    registration table, RLS and customer-only profile provisioning survive migration reapply"

echo "=== 4h. PG monthly inventory migration idempotency + grants ==="
PG_BOOKING_MIGRATION="$REPO_ROOT/supabase/migrations/20261103210000_pg_booking_lifecycle.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$PG_BOOKING_MIGRATION" \
  > "$OUT/pg-booking-migration-reapply.out" 2> "$OUT/pg-booking-migration-reapply.err" \
  || fail "reapplying PG booking migration"
PG_OWNER_RPC=$(pq -d "$DB" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pg_owner_upsert_inventory'")
PG_CREATE_RPC=$(pq -d "$DB" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pg_create_booking'")
PG_CANCEL_RPC=$(pq -d "$DB" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pg_cancel_booking'")
PG_BOOKING_RLS=$(pq -d "$DB" -tAc "select relrowsecurity from pg_class where oid='public.bookings'::regclass")
[ "$PG_OWNER_RPC" = "1" ] && [ "$PG_CREATE_RPC" = "1" ] && [ "$PG_CANCEL_RPC" = "1" ] || fail "PG booking RPC missing/duplicated"
[ "$PG_BOOKING_RLS" = "t" ] || fail "bookings RLS is disabled"
echo "    PG inventory/booking RPCs, RLS and monthly schema survive migration reapply"

echo "=== 4f. App Builder authorization, versioning, validation ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/app_builder_config_test.sql" > "$OUT/app-config.out" 2>&1 \
  || fail "App Builder configuration tests (see $OUT/app-config.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/app-config.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
grep -E '^psql:.*(ERROR|WARNING):' "$OUT/app-config.out" | sed 's/^/    /' || true
APP_CONFIG_PASS=$(grep -c "NOTICE:  PASS" "$OUT/app-config.out" || true)
APP_CONFIG_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/app-config.out" || true)
APP_CONFIG_SQL_ERRORS=$(grep -Ec '^psql:.*ERROR:' "$OUT/app-config.out" || true)
echo "    PASS=$APP_CONFIG_PASS FAIL=$APP_CONFIG_FAIL"

echo "=== 5. functional suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/stay_inventory_test.sql" > "$OUT/functional.out" 2>&1
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/functional.out" \
  | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
grep -E '^psql:.*(ERROR|WARNING):' "$OUT/functional.out" | sed 's/^/    /' || true
PASS_COUNT=$(grep -c "NOTICE:  PASS" "$OUT/functional.out" || true)
FAIL_COUNT=$(grep -c "NOTICE:  FAIL" "$OUT/functional.out" || true)
echo "    PASS=$PASS_COUNT FAIL=$FAIL_COUNT"

echo "=== 5a. stay owner onboarding and Super Admin approval ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/stay_owner_approval_test.sql" \
  > "$OUT/stay-owner-approval.out" 2>&1 || fail "stay owner approval test (see $OUT/stay-owner-approval.out)"
grep -E "PASS: customer approval denied" "$OUT/stay-owner-approval.out" \
  || fail "stay owner approval assertions did not report PASS"

echo "=== 5b. provider contact suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/provider_contact_test.sql" > "$OUT/contact.out" 2>&1
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/contact.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
CONTACT_PASS=$(grep -c "NOTICE:  PASS" "$OUT/contact.out" || true)
CONTACT_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/contact.out" || true)
echo "    PASS=$CONTACT_PASS FAIL=$CONTACT_FAIL"

echo "=== 5c. Farm & Village listing authorization suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/former_local_services_test.sql" > "$OUT/former-local-services.out" 2>&1 \
  || fail "Farm & Village listing authorization tests (see $OUT/former-local-services.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/former-local-services.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
RURAL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/former-local-services.out" || true)
RURAL_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/former-local-services.out" || true)
RURAL_SQL_ERRORS=$(grep -Ec '^psql:.*ERROR:' "$OUT/former-local-services.out" || true)
echo "    PASS=$RURAL_PASS FAIL=$RURAL_FAIL SQL_ERRORS=$RURAL_SQL_ERRORS"

echo "=== 5c2. provider registration profile and RLS suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/provider_registration_test.sql" > "$OUT/provider-registration.out" 2>&1 \
  || fail "provider registration RLS tests (see $OUT/provider-registration.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/provider-registration.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
PROVIDER_REG_SQL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/provider-registration.out" || true)
PROVIDER_REG_SQL_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/provider-registration.out" || true)
echo "    PASS=$PROVIDER_REG_SQL_PASS FAIL=$PROVIDER_REG_SQL_FAIL"

echo "=== 5c3. Classes batch/enrollment SQL suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/class_enrollment_test.sql" > "$OUT/class-enrollment.out" 2>&1 \
  || fail "class enrollment SQL tests (see $OUT/class-enrollment.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/class-enrollment.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
CLASS_SQL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/class-enrollment.out" || true)
CLASS_SQL_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/class-enrollment.out" || true)
CLASS_SQL_ERRORS=$(grep -Ec '^psql:.*(ERROR|FATAL):' "$OUT/class-enrollment.out" || true)
echo "    PASS=$CLASS_SQL_PASS FAIL=$CLASS_SQL_FAIL SQL_ERRORS=$CLASS_SQL_ERRORS"

echo "=== 5c5. Customer and member permission grant SQL suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/permission_grants_test.sql" > "$OUT/permission-grants.out" 2>&1 \
  || {
    grep -E "ERROR|FAIL|DETAIL" "$OUT/permission-grants.out" | head -10 >&2
    fail "permission grant SQL tests (see $OUT/permission-grants.out)"
  }
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/permission-grants.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
PERMISSION_SQL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/permission-grants.out" || true)
PERMISSION_SQL_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/permission-grants.out" || true)
PERMISSION_SQL_ERRORS=$(grep -Ec '^psql:.*(ERROR|FATAL):' "$OUT/permission-grants.out" || true)
echo "    PASS=$PERMISSION_SQL_PASS FAIL=$PERMISSION_SQL_FAIL SQL_ERRORS=$PERMISSION_SQL_ERRORS"

echo "=== 5c6. Deny-by-default permission backfill SQL suite ==="
pq -d "$DB" -f "$REPO_ROOT/supabase/tests/permission_backfill_test.sql" > "$OUT/permission-backfill.out" 2>&1 \
  || {
    grep -E "ERROR|FAIL|DETAIL" "$OUT/permission-backfill.out" | head -10 >&2
    fail "permission backfill SQL tests (see $OUT/permission-backfill.out)"
  }
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/permission-backfill.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
BACKFILL_SQL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/permission-backfill.out" || true)
BACKFILL_SQL_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/permission-backfill.out" || true)
BACKFILL_SQL_ERRORS=$(grep -Ec '^psql:.*(ERROR|FATAL):' "$OUT/permission-backfill.out" || true)
echo "    PASS=$BACKFILL_SQL_PASS FAIL=$BACKFILL_SQL_FAIL SQL_ERRORS=$BACKFILL_SQL_ERRORS"

echo "=== 5c7. Permission gates with strict flags enabled (PostgreSQL) ==="
rm -f "$OUT/permission-gates-node.out"
BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
NODE_ENV=test \
node --import tsx --test "$REPO_ROOT/tests/permission-gates-postgres.integration.test.mjs" \
  > "$OUT/permission-gates-node.out" 2>&1 \
  || {
    sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/permission-gates-node.out" | tail -60 >&2
    fail "permission gates PostgreSQL integration"
  }
# The reporter prints its summary as "# pass 9" (TAP) or with a spec marker
# prefix, so match the counts themselves rather than the marker, which is not
# ASCII-safe in every locale.
grep -E "(tests|pass|fail) [0-9]+" "$OUT/permission-gates-node.out" | sed 's/^/    /'
GATE_NODE_PASS=$(grep -E " pass [0-9]+" "$OUT/permission-gates-node.out" | grep -oE '[0-9]+$' | tail -1)
GATE_NODE_FAIL=$(grep -E " fail [0-9]+" "$OUT/permission-gates-node.out" | grep -oE '[0-9]+$' | tail -1)
: "${GATE_NODE_PASS:=0}"
: "${GATE_NODE_FAIL:=0}"

echo "=== 5c4. Classes enrollment migration reapply idempotency ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/supabase/migrations/20261103200000_class_batches_and_enrollment.sql" \
  > "$OUT/class-migration-reapply.out" 2> "$OUT/class-migration-reapply.err" \
  || fail "reapplying class batches/enrollment migration"
CLASS_TABLES=$(pq -d "$DB" -tAc "select count(*) from pg_tables where schemaname='public' and tablename in ('class_batches','class_enrollments')")
CLASS_RLS=$(pq -d "$DB" -tAc "select count(*) from pg_class where oid in ('public.class_batches'::regclass,'public.class_enrollments'::regclass) and relrowsecurity")
CLASS_RPCS=$(pq -d "$DB" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('class_enroll','class_cancel_enrollment','class_review_batch','class_batch_availability')")
[ "$CLASS_TABLES" = "2" ] || fail "class tables missing or duplicated after migration reapply"
[ "$CLASS_RLS" = "2" ] || fail "class table RLS is disabled after migration reapply"
[ "$CLASS_RPCS" = "4" ] || fail "class enrollment functions missing or duplicated after migration reapply"
echo "    tables=$CLASS_TABLES rls=$CLASS_RLS rpcs=$CLASS_RPCS after reapply"
# Reapplying this historical migration restores its original SELECT policy.
# Reapply the later authorization migration to leave the disposable database
# in the same final state as a fresh install before the HTTP integration runs.
CLASS_RLS_HARDENING_MIGRATION="$REPO_ROOT/supabase/migrations/20261105000000_class_batches_role_scoped_read_policies.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$CLASS_RLS_HARDENING_MIGRATION" \
  > "$OUT/class-rls-hardening-reapply.out" 2> "$OUT/class-rls-hardening-reapply.err" \
  || fail "reapplying class batch role-scoped read policy migration"
echo "    final role-scoped Classes read policies restored after legacy reapply"

echo "=== 5d. Node HTTP provider-listing PostgreSQL integration suite ==="
BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
NODE_ENV=test \
node --import tsx --test "$REPO_ROOT/tests/provider-listings-postgres.integration.test.mjs" \
  > "$OUT/provider-listings-node.out" 2>&1 \
  || { sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/provider-listings-node.out" | tail -100; fail "Node provider listing API integration (see $OUT/provider-listings-node.out)"; }
sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/provider-listings-node.out" | tail -30

echo "=== 5e. Node HTTP classes enrollment PostgreSQL integration suite ==="
BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT/$DB?sslmode=disable" \
NODE_ENV=test \
node --import tsx --test "$REPO_ROOT/tests/classes-enrollment-postgres.integration.test.mjs" \
  > "$OUT/class-enrollment-node.out" 2>&1 \
  || { sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/class-enrollment-node.out" | tail -120; fail "Node classes enrollment API integration (see $OUT/class-enrollment-node.out)"; }
sed -E 's/(postgres(ql)?:\/\/)[^@ ]+@/\1[redacted]@/g' "$OUT/class-enrollment-node.out" | tail -30

echo "=== 5f. re-apply final profile privacy migration and verify client permissions ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/supabase/migrations/20261104100000_profiles_private_access.sql" \
  > "$OUT/profile-privacy-migration-reapply.out" 2> "$OUT/profile-privacy-migration-reapply.err" \
  || fail "reapplying profile privacy migration"
pq -d "$DB" -q -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/supabase/migrations/20261104140000_restrict_profile_self_insert_columns.sql" \
  > "$OUT/profile-insert-migration-reapply.out" 2> "$OUT/profile-insert-migration-reapply.err" \
  || fail "reapplying profile insert restriction migration"
pq -d "$DB" -q -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/supabase/migrations/20261105102436_public_provider_profile_projection.sql" \
  > "$OUT/provider-projection-migration-reapply.out" 2> "$OUT/provider-projection-migration-reapply.err" \
  || fail "reapplying safe public provider projection migration"
# This validation deliberately replays older profile migrations after the
# complete chain. Reapply the later closure migration afterward so its active
# account read guard remains the final policy, matching timestamped install order.
pq -d "$DB" -q -v ON_ERROR_STOP=1 \
  -f "$PROFILE_MEDIA_MIGRATION" \
  > "$OUT/profile-media-closure-migration-reapply.out" 2> "$OUT/profile-media-closure-migration-reapply.err" \
  || fail "reapplying profile media and account closure migration after profile policy replay"
echo "    final profile-read active-account guard restored after legacy policy replay"
# Several older idempotency checks above replay migrations that predate the
# security correction. Reapply the forward-only fix last so validation reflects
# real timestamped install order rather than a test-only rollback in behavior.
SECURITY_FIX_MIGRATION="$REPO_ROOT/supabase/migrations/20261106174309_security_advisor_forward_fixes.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$SECURITY_FIX_MIGRATION" \
  > "$OUT/security-fixes-reapply.out" 2> "$OUT/security-fixes-reapply.err" \
  || fail "reapplying forward security corrections after legacy idempotency checks"
echo "    final SECURITY DEFINER grants, payment event immutability, and RLS initplan policies restored"
RPC_SECURITY_MIGRATION="$REPO_ROOT/supabase/migrations/20261107032340_authenticated_rpc_security_boundary_audit.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$RPC_SECURITY_MIGRATION" \
  > "$OUT/rpc-security-migration-reapply.out" 2> "$OUT/rpc-security-migration-reapply.err" \
  || fail "reapplying authenticated RPC security boundary migration"
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/authenticated_rpc_security_audit_test.sql" \
  > "$OUT/authenticated-rpc-security.out" 2>&1 \
  || fail "authenticated RPC security audit tests (see $OUT/authenticated-rpc-security.out)"
grep "NOTICE:  PASS" "$OUT/authenticated-rpc-security.out" | sed 's/^/    /'
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/profile_private_access_test.sql" > "$OUT/profile-private-access.out" 2>&1 \
  || fail "private profile access tests (see $OUT/profile-private-access.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/profile-private-access.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
PROFILE_PRIVACY_PASS=$(grep -c "NOTICE:  PASS" "$OUT/profile-private-access.out" || true)
PROFILE_PRIVACY_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/profile-private-access.out" || true)
echo "    PASS=$PROFILE_PRIVACY_PASS FAIL=$PROFILE_PRIVACY_FAIL"

echo "=== 5g0. hosted security-advisor and SECURITY DEFINER assertions ==="
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/hosted_security_advisor_test.sql" > "$OUT/hosted-security-advisor.out" 2>&1 \
  || fail "hosted security advisor tests (see $OUT/hosted-security-advisor.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/hosted-security-advisor.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
ADVISOR_SQL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/hosted-security-advisor.out" || true)
ADVISOR_SQL_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/hosted-security-advisor.out" || true)
echo "    PASS=$ADVISOR_SQL_PASS FAIL=$ADVISOR_SQL_FAIL"

echo "=== 5g1. public RPC exposure and payment-ledger privacy assertions ==="
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/public_rpc_security_test.sql" > "$OUT/public-rpc-security.out" 2>&1 \
  || fail "public RPC/payment privacy SQL tests (see $OUT/public-rpc-security.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/public-rpc-security.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
PUBLIC_RPC_SQL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/public-rpc-security.out" || true)
PUBLIC_RPC_SQL_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/public-rpc-security.out" || true)
echo "    PASS=$PUBLIC_RPC_SQL_PASS FAIL=$PUBLIC_RPC_SQL_FAIL"

echo "=== 5g. Super Admin role management authorization and atomic audit ==="
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/super_admin_role_management_test.sql" > "$OUT/super-admin-role-management.out" 2>&1 \
  || fail "Super Admin role management SQL tests (see $OUT/super-admin-role-management.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/super-admin-role-management.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
SUPERADMIN_SQL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/super-admin-role-management.out" || true)
SUPERADMIN_SQL_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/super-admin-role-management.out" || true)
echo "    PASS=$SUPERADMIN_SQL_PASS FAIL=$SUPERADMIN_SQL_FAIL"

echo "=== 5h. owner-only Super Admin bootstrap repeat and audit integrity ==="
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/super_admin_bootstrap_test.sql" > "$OUT/super-admin-bootstrap.out" 2>&1 \
  || fail "Super Admin bootstrap SQL tests (see $OUT/super-admin-bootstrap.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/super-admin-bootstrap.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
BOOTSTRAP_SQL_PASS=$(grep -c "NOTICE:  PASS" "$OUT/super-admin-bootstrap.out" || true)
BOOTSTRAP_SQL_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/super-admin-bootstrap.out" || true)
echo "    PASS=$BOOTSTRAP_SQL_PASS FAIL=$BOOTSTRAP_SQL_FAIL"

echo "=== 5i. private media finalization and derivative read policy ==="
MEDIA_MIGRATION="$REPO_ROOT/supabase/migrations/20261105130000_media_finalization.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MEDIA_MIGRATION" \
  > "$OUT/media-migration-reapply.out" 2> "$OUT/media-migration-reapply.err" \
  || fail "reapplying media finalization migration"
echo "    media finalization migration reapply passed"
MEDIA_POLICY_MIGRATION="$REPO_ROOT/supabase/migrations/20261105140000_media_anon_policy_split.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MEDIA_POLICY_MIGRATION" \
  > "$OUT/media-policy-migration-reapply.out" 2> "$OUT/media-policy-migration-reapply.err" \
  || fail "reapplying media anonymous policy split migration"
echo "    media anonymous policy split migration reapply passed"
MEDIA_BYTE_VALIDATION_MIGRATION="$REPO_ROOT/supabase/migrations/20261105150000_server_media_byte_validation.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MEDIA_BYTE_VALIDATION_MIGRATION" \
  > "$OUT/media-byte-validation-reapply.out" 2> "$OUT/media-byte-validation-reapply.err" \
  || fail "reapplying server-side media byte validation migration"
echo "    server-side media byte validation migration reapply passed"
MEDIA_VISIBILITY_MIGRATION="$REPO_ROOT/supabase/migrations/20261105160000_media_published_listing_visibility.sql"
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MEDIA_VISIBILITY_MIGRATION" \
  > "$OUT/media-visibility-migration-reapply.out" 2> "$OUT/media-visibility-migration-reapply.err" \
  || fail "reapplying published-media visibility migration"
echo "    published-media visibility migration reapply passed"
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/media_finalization_test.sql" > "$OUT/media-finalization.out" 2>&1 \
  || fail "media finalization SQL tests (see $OUT/media-finalization.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/media-finalization.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
MEDIA_FINALIZATION_PASS=$(grep -c "NOTICE:  PASS" "$OUT/media-finalization.out" || true)
MEDIA_FINALIZATION_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/media-finalization.out" || true)
echo "    PASS=$MEDIA_FINALIZATION_PASS FAIL=$MEDIA_FINALIZATION_FAIL"

echo "=== 5j. server-authorized account closure and financial retention ==="
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/account_closure_test.sql" > "$OUT/account-closure.out" 2>&1 \
  || fail "account closure SQL tests (see $OUT/account-closure.out)"
grep "NOTICE:  PASS" "$OUT/account-closure.out" | sed 's/^/    /'

echo "=== 5k. audit blocker repairs (provider portal, payment claim, customer modules) ==="
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/audit_blocker_repairs_test.sql" > "$OUT/audit-blocker-repairs.out" 2>&1 \
  || fail "audit blocker repair SQL tests (see $OUT/audit-blocker-repairs.out)"
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/audit-blocker-repairs.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
AUDIT_REPAIR_PASS=$(grep -c "NOTICE:  PASS" "$OUT/audit-blocker-repairs.out" || true)
AUDIT_REPAIR_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/audit-blocker-repairs.out" || true)
echo "    PASS=$AUDIT_REPAIR_PASS FAIL=$AUDIT_REPAIR_FAIL"

echo "=== 6. concurrency: two guests, two units, identical dates ==="
pq -d "$DB" -q -c "update platform_module_flags set allow_online_booking = true where module_key='hotels';" >/dev/null
(
  pq -d "$DB" > "$OUT/session_a.out" 2>&1 <<'SQLA'
\set ON_ERROR_STOP 1
begin;
set local test.uid = '22222222-2222-2222-2222-222222222222';
set local role service_role;
select count(*) as units_held_by_a
  from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2027-06-01','2027-06-03',2);
\! touch "$BOS_LOCAL_VALIDATION_BARRIER"
select pg_sleep(4);
commit;
SQLA
) &
A_PID=$!
for _ in $(seq 1 100); do [ -f "$BARRIER" ] && break; sleep 0.1; done
[ -f "$BARRIER" ] || { kill "$A_PID" 2>/dev/null; fail "session A never reached the barrier"; }

pq -d "$DB" > "$OUT/session_b.out" 2>&1 <<'SQLB'
\set ON_ERROR_STOP 1
set test.uid = '33333333-3333-3333-3333-333333333333';
set role service_role;
select count(*) as units_held_by_b
  from public.stay_hold_units('11111111-0000-0000-0000-000000000002','2027-06-01','2027-06-03',2);
SQLB
B_EXIT=$?
wait "$A_PID"; A_EXIT=$?

A_HELD=$(grep -Eo '^ +[0-9]+$' "$OUT/session_a.out" | head -1 | tr -d ' ')
echo "    session A: exit=$A_EXIT units_held=${A_HELD:-<none>}"
echo "    session B: exit=$B_EXIT $(grep -Eo 'INSUFFICIENT_AVAILABILITY|SEAT_TAKEN_BY_ANOTHER_GUEST' "$OUT/session_b.out" | head -1)"
DUPES=$(pq -d "$DB" -tAc "
  select count(*) from (
    select unit_id from public.stay_allocations
     where status in ('held','confirmed')
       and stay_dates && daterange('2027-06-01','2027-06-03','[)')
     group by unit_id having count(*) > 1
  ) d;")
BLOCKING=$(pq -d "$DB" -tAc "
  select count(*) from public.stay_allocations
   where stay_dates && daterange('2027-06-01','2027-06-03','[)')
     and status in ('held','confirmed');")
echo "    units holding two blocking allocations: $DUPES (must be 0)"
echo "    blocking allocations for those dates:   $BLOCKING (must be 2)"

echo "=== 7. verdict ==="
[ "$FAIL_COUNT" = "0" ]        || fail "$FAIL_COUNT functional assertion(s) failed"
[ "$CONTACT_FAIL" = "0" ]      || fail "$CONTACT_FAIL provider contact assertion(s) failed"
[ "$APP_CONFIG_FAIL" = "0" ]  || fail "$APP_CONFIG_FAIL App Builder assertion(s) failed"
[ "$APP_CONFIG_SQL_ERRORS" = "0" ] || fail "$APP_CONFIG_SQL_ERRORS App Builder SQL error(s) occurred"
[ "$RURAL_FAIL" = "0" ]        || fail "$RURAL_FAIL Farm & Village listing assertion(s) failed"
[ "$RURAL_SQL_ERRORS" = "0" ]  || fail "$RURAL_SQL_ERRORS Farm & Village listing SQL error(s) occurred"
[ "$PROVIDER_REG_SQL_PASS" = "2" ] || fail "provider registration RLS assertions did not all pass"
[ "$PROVIDER_REG_SQL_FAIL" = "0" ] || fail "$PROVIDER_REG_SQL_FAIL provider registration RLS assertion(s) failed"
[ "$ADVISOR_SQL_PASS" = "8" ] || fail "hosted security advisor suite ran only $ADVISOR_SQL_PASS passing assertion(s)"
[ "$ADVISOR_SQL_FAIL" = "0" ] || fail "$ADVISOR_SQL_FAIL hosted security advisor assertion(s) failed"
[ "$PUBLIC_RPC_SQL_PASS" = "30" ] || fail "public RPC security suite ran only $PUBLIC_RPC_SQL_PASS passing assertion(s)"
[ "$PUBLIC_RPC_SQL_FAIL" = "0" ] || fail "$PUBLIC_RPC_SQL_FAIL public RPC/payment privacy assertion(s) failed"
[ "$PROFILE_PRIVACY_PASS" = "10" ] || fail "profile privacy RLS assertions did not all pass"
[ "$PROFILE_PRIVACY_FAIL" = "0" ] || fail "$PROFILE_PRIVACY_FAIL profile privacy assertion(s) failed"
[ "$SUPERADMIN_SQL_PASS" = "12" ] || fail "Super Admin SQL suite ran only $SUPERADMIN_SQL_PASS passing assertion(s)"
[ "$SUPERADMIN_SQL_FAIL" = "0" ] || fail "$SUPERADMIN_SQL_FAIL Super Admin role management assertion(s) failed"
[ "$BOOTSTRAP_SQL_PASS" = "6" ] || fail "Super Admin bootstrap suite ran only $BOOTSTRAP_SQL_PASS passing assertion(s)"
[ "$BOOTSTRAP_SQL_FAIL" = "0" ] || fail "$BOOTSTRAP_SQL_FAIL Super Admin bootstrap assertion(s) failed"
[ "$MEDIA_FINALIZATION_PASS" = "20" ] || fail "media finalization suite ran only $MEDIA_FINALIZATION_PASS passing assertion(s)"
[ "$MEDIA_FINALIZATION_FAIL" = "0" ] || fail "$MEDIA_FINALIZATION_FAIL media finalization assertion(s) failed"
[ "$AUDIT_REPAIR_PASS" -ge 7 ] || fail "audit blocker repair suite ran only $AUDIT_REPAIR_PASS passing assertion(s)"
[ "$AUDIT_REPAIR_FAIL" = "0" ] || fail "$AUDIT_REPAIR_FAIL audit blocker repair assertion(s) failed"
[ "$PERMISSION_SQL_FAIL" = "0" ] || fail "$PERMISSION_SQL_FAIL permission grant assertion(s) failed"
[ "$PERMISSION_SQL_ERRORS" = "0" ] || fail "$PERMISSION_SQL_ERRORS permission grant SQL error(s) occurred"
[ "$BACKFILL_SQL_FAIL" = "0" ] || fail "$BACKFILL_SQL_FAIL permission backfill assertion(s) failed"
[ "$BACKFILL_SQL_ERRORS" = "0" ] || fail "$BACKFILL_SQL_ERRORS permission backfill SQL error(s) occurred"
[ "$GATE_NODE_FAIL" = "0" ] || fail "permission gate integration reported $GATE_NODE_FAIL failure(s)"
[ "$GATE_NODE_PASS" -ge 8 ] || fail "permission gate integration ran only $GATE_NODE_PASS passing test(s)"
[ "$BACKFILL_SQL_PASS" -ge 10 ] || fail "permission backfill suite ran only $BACKFILL_SQL_PASS passing assertion(s)"
[ "$PERMISSION_SQL_PASS" -ge 20 ] || fail "permission grant suite ran only $PERMISSION_SQL_PASS passing assertion(s)"
[ "$CLASS_SQL_FAIL" = "0" ] || fail "$CLASS_SQL_FAIL class enrollment assertion(s) failed"
[ "$CLASS_SQL_ERRORS" = "0" ] || fail "$CLASS_SQL_ERRORS class enrollment SQL error(s) occurred"
[ "$CLASS_SQL_PASS" -ge 12 ] || fail "class enrollment SQL suite ran only $CLASS_SQL_PASS passing assertion(s)"
[ "$A_EXIT" = "0" ]            || fail "session A should have succeeded"
[ "${A_HELD:-0}" = "2" ]       || fail "session A should have held exactly 2 units"
[ "$B_EXIT" != "0" ]           || fail "session B should have been refused"
[ "$DUPES" = "0" ]             || fail "double booking detected"
[ "$BLOCKING" = "2" ]          || fail "expected exactly 2 blocking allocations"

echo "    ALL CHECKS PASSED (functional=$PASS_COUNT, contact=$CONTACT_PASS, app_config=$APP_CONFIG_PASS, rural=$RURAL_PASS, profile_privacy=$PROFILE_PRIVACY_PASS, super_admin=$SUPERADMIN_SQL_PASS, bootstrap=$BOOTSTRAP_SQL_PASS, media=$MEDIA_FINALIZATION_PASS, concurrency=1, no double booking)"
echo "    logs: $OUT"
