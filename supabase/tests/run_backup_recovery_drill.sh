#!/usr/bin/env bash
# =============================================================================
# Backup / recovery drill for the migration plan.
#
# The migration plan says the rollback anchor is a logical dump (or PITR) taken
# before any hosted apply. This drill proves the local half of that procedure is
# real, repeatable and sufficient to restore both schema and security posture:
#
#   throwaway cluster → baseline + every migration → full pg_dump (-Fc) →
#   restore into a second database → compare objects, RLS and policies →
#   re-run the profile-privacy assertions on the restored copy.
#
# It never contacts Supabase and never reads cloud credentials. The hosted half
# (backup schedule, PITR window, latest recovery point) requires project
# management access and is reported BLOCKED when that access is denied.
#
# Usage: bash supabase/tests/run_backup_recovery_drill.sh
# Exit:  0 = dump and restore reproduce the schema and security posture
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-backup-drill.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace backup drill scratch directory" > "$TMP_ROOT/.bos-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
SRC=bos_drill_source
DST=bos_drill_restored
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DUMP="$OUT/dev-pre.dump"
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres "$@"; }

cleanup() {
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil, sys
root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-owned'
if root.parent != base or not root.name.startswith('bos-backup-drill.'):
    raise SystemExit('refusing cleanup: scratch path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace backup drill scratch directory':
    raise SystemExit('refusing cleanup: ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

echo "=== 1. tooling ==="
pg_dump --version | sed 's/^/    /'
pg_restore --version | sed 's/^/    /'

echo "=== 2. throwaway cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || fail "initdb (see $OUT/initdb.log)"
if ! pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1 -c shared_memory_type=mmap" -l "$OUT/postgres.log" start >/dev/null 2>&1; then
  pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
fi
for _ in $(seq 1 40); do
  pq -tAc "select 1" >/dev/null 2>&1 && break
  sleep 0.5
done
pq -tAc "select version()" >/dev/null 2>&1 || fail "cluster did not start (see $OUT/postgres.log)"

echo "=== 3. baseline + every migration into the source database ==="
hope -q -c "create database $SRC;" || fail "create source database"
pq -d "$SRC" -q -v ON_ERROR_STOP=1 <<'SQL' || fail "stubs"
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
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id)
);
create table if not exists auth.identities (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  provider text not null,
  identity_data jsonb not null default '{}'::jsonb,
  last_sign_in timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
                  nullif(current_setting('test.uid', true), '')::uuid) $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated') $$;
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
pq -d "$SRC" -q -v ON_ERROR_STOP=1 <<'SQL' || fail "seed pre-schema Google user"
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','pre-schema-google@example.test',
        '{"full_name":"Pre-schema Google User"}', '{"provider":"google"}', now());
insert into auth.identities(id,user_id,provider,identity_data,last_sign_in)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'google','{"sub":"google-sub-pre-schema"}',now());
SQL
pq -d "$SRC" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" > "$OUT/baseline.log" 2>&1 \
  || fail "baseline schema (see $OUT/baseline.log)"
MIGRATIONS=$(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ')
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  pq -d "$SRC" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" > "$OUT/migration.log" 2>&1 \
    || { grep -E "ERROR|DETAIL" "$OUT/migration.log" | head -5 >&2; fail "migration $(basename "$MIG_FILE")"; }
done
pq -d "$SRC" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/backfill_existing_google_profiles.sql" \
  > "$OUT/profile-backfill.log" 2>&1 || fail "pre-existing Google profile backfill"
echo "    applied baseline + $MIGRATIONS migrations"

measure() {
  pq -d "$1" -tAc "
    select json_build_object(
      'tables', (select count(*) from pg_tables where schemaname='public'),
      'views', (select count(*) from pg_views where schemaname='public'),
      'functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),
      'policies', (select count(*) from pg_policies where schemaname='public'),
      'rls_enabled', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
      'rls_disabled', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
      'indexes', (select count(*) from pg_indexes where schemaname='public')
    )::text"
}

echo "=== 4. pre-migration anchor (full custom-format dump) ==="
pg_dump "postgresql://postgres@127.0.0.1:$PGPORT/$SRC" -Fc --no-owner -f "$DUMP" \
  > "$OUT/dump.log" 2>&1 || fail "pg_dump (see $OUT/dump.log)"
echo "    dump=$(basename "$DUMP") bytes=$(wc -c < "$DUMP" | tr -d ' ') sha256=$(shasum -a 256 "$DUMP" | cut -d' ' -f1)"

echo "=== 5. restore into a second database ==="
hope -q -c "create database $DST;" || fail "create restore database"
# Privileges are part of the security posture under test: restoring without them
# would silently drop the schema/function grants RLS depends on.
pg_restore -d "postgresql://postgres@127.0.0.1:$PGPORT/$DST" --no-owner "$DUMP" \
  > "$OUT/restore.log" 2>&1 || { grep -E "error|ERROR" "$OUT/restore.log" | head -8; fail "pg_restore (see $OUT/restore.log)"; }

echo "=== 6. compare source and restored catalog ==="
SRC_JSON="$(measure "$SRC")"
DST_JSON="$(measure "$DST")"
echo "    source:   $SRC_JSON"
echo "    restored: $DST_JSON"
[ "$SRC_JSON" = "$DST_JSON" ] || fail "restored catalog differs from the source"

PRIVACY_POLICY=$(pq -d "$DST" -tAc "select count(*) from pg_policies where schemaname='public' and tablename='profiles' and policyname='Users read own or booking-related profiles'")
PRIVACY_FN=$(pq -d "$DST" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_read_private_profile'")
PROVIDER_VIEW=$(pq -d "$DST" -tAc "select count(*) from pg_views where schemaname='public' and viewname='public_provider_profiles'")
[ "$PRIVACY_POLICY" = "1" ] || fail "profile privacy policy was not restored"
[ "$PRIVACY_FN" = "1" ] || fail "can_read_private_profile was not restored"
[ "$PROVIDER_VIEW" = "1" ] || fail "public_provider_profiles view was not restored"
echo "    privacy policy=$PRIVACY_POLICY function=$PRIVACY_FN public_provider_view=$PROVIDER_VIEW"
RESTORED_AUTH=$(pq -d "$DST" -tAc "select count(*) from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'")
RESTORED_IDENTITY=$(pq -d "$DST" -tAc "select count(*) from auth.identities where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and provider='google'")
RESTORED_PROFILE=$(pq -d "$DST" -tAc "select count(*) from public.profiles where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role='customer'")
[ "$RESTORED_AUTH" = "1" ] && [ "$RESTORED_IDENTITY" = "1" ] && [ "$RESTORED_PROFILE" = "1" ] \
  || fail "restored copy did not retain the Google Auth user, identity, and customer profile"
echo "    preserved Google Auth user=$RESTORED_AUTH identity=$RESTORED_IDENTITY customer_profile=$RESTORED_PROFILE"

echo "=== 7. privacy assertions on the restored copy ==="
pq -d "$DST" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/profile_private_access_test.sql" \
  > "$OUT/restored-privacy.log" 2>&1 || { tail -8 "$OUT/restored-privacy.log"; fail "privacy assertions failed on the restored copy"; }
grep -E "PASS" "$OUT/restored-privacy.log" | sed 's/^/    /'

echo "=== 8. verdict ==="
echo "    PASS dump=pg_dump_custom_format restore=into_clean_database catalog=match rls=match policies=match privacy=verified"
echo "    local drill only: hosted backup schedule, PITR window and latest recovery point are BLOCKED without project management access"
