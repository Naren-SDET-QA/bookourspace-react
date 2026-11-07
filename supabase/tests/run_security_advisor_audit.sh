#!/usr/bin/env bash
# =============================================================================
# Security Advisor audit on a private throwaway PostgreSQL cluster.
#
#  1. creates a disposable cluster in a private temporary directory
#  2. stubs only what Supabase supplies (roles, auth, storage, realtime)
#  3. applies supabase/schema_and_rls.sql and every supabase/migrations/*.sql
#  4. runs supabase/tests/security_advisor_audit.sql
#
# It never contacts Supabase, never reads credentials and never touches a
# hosted project.
#
# Usage: bash supabase/tests/run_security_advisor_audit.sh
# Exit:  0 = no blocking findings, 1 = a blocking finding or setup failure
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-advisor.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace security advisor scratch directory" > "$TMP_ROOT/.bos-advisor-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_advisor
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$OUT"

fail() { echo "FAILED: $*" >&2; exit 1; }
pq() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }

cleanup() {
  pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

echo "=== 1. throwaway cluster on 127.0.0.1:$PGPORT ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.out" 2>&1 || fail "initdb"
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $TMP_ROOT" -l "$OUT/pg.log" start >/dev/null 2>&1 || fail "pg start"
pq -d postgres -q -c "create database $DB;" >/dev/null 2>&1 || fail "create database"

echo "=== 2. Supabase-compatible stub ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || fail "stub schema"
do $$ begin
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
  created_at timestamptz not null default now()
);
create table if not exists auth.identities (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  provider text not null,
  identity_data jsonb not null default '{}'::jsonb,
  last_sign_in timestamptz
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
SQL

pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/lib/bos_storage_stub.sql" >/dev/null 2>&1 \
  || fail "storage stub"

echo "=== 3. baseline + migrations ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" > "$OUT/baseline.out" 2>&1 \
  || { tail -5 "$OUT/baseline.out" >&2; fail "baseline schema"; }
APPLIED=0
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  if pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" > "$OUT/migration.out" 2>&1; then
    APPLIED=$((APPLIED + 1))
  else
    grep -E "ERROR|DETAIL" "$OUT/migration.out" | head -3 >&2
    fail "apply $(basename "$MIG_FILE")"
  fi
done
echo "  PASS  $APPLIED migrations applied"

echo "=== 4. advisor audit ==="
pq -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/security_advisor_audit.sql" 2>&1 | tee "$OUT/audit.out"
rc=${PIPESTATUS[0]}
if [ "$rc" -ne 0 ]; then
  echo "SECURITY ADVISOR AUDIT FAILED" >&2
  exit 1
fi
echo "SECURITY ADVISOR AUDIT PASSED"
