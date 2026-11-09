#!/usr/bin/env bash
# =============================================================================
# Guardrail audit for the BookOurSpace database baseline.
#
# Proves, on a private throwaway PostgreSQL cluster only:
#
#   1. the platform `rls_auto_enable` event trigger and its restricted EXECUTE
#      ACL survive the whole migration chain (installed before the baseline,
#      exactly as Supabase installs it),
#   2. every table created by the baseline or a migration ends up with RLS on,
#   3. baseline + all migrations + the Google profile backfill apply cleanly,
#   4. the 2026-11-04 hardening set is idempotent (applied twice),
#   5. ownership, idempotency, active-admin and privilege assertions hold,
#   6. the compensating rollback script reverses the hardening set without
#      touching the platform event trigger.
#
# It never contacts Supabase, never reads credentials and never touches a
# hosted project. Two databases are created in the same disposable cluster so
# the rollback drill cannot be polluted by test fixtures.
#
# Usage: bash supabase/tests/run_guardrails_audit.sh
# Exit:  0 = every check passed, 1 = a check failed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-guardrails.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace guardrail audit scratch directory" > "$TMP_ROOT/.bos-guardrails-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB_GUARD=bos_guard
DB_ROLLBACK=bos_rollback
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HARDENING_MIGRATIONS=(
  "20261104170000_provider_listing_ownership_guards.sql"
  "20261104180000_booking_idempotency_per_user.sql"
  "20261104190000_active_admin_authorization.sql"
  "20261104200000_complete_foreign_key_indexes.sql"
  "20261104210000_restrict_definer_execution.sql"
)
FAILURES=0
mkdir -p "$OUT"

pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
pq()   { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -X -q "$@"; }
hope() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -X -q -d postgres "$@"; }

cleanup() {
  if [ "${BOS_KEEP_GUARDRAILS:-0}" = "1" ]; then
    echo "    preserved scratch at $TMP_ROOT"
    return
  fi
  if [ -f "$PGDATA/PG_VERSION" ]; then
    pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
  fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil, sys
root = Path(sys.argv[1]).resolve(); base = Path(sys.argv[2]).resolve()
marker = root / '.bos-guardrails-owned'
if root.parent != base or not root.name.startswith('bos-guardrails.'):
    raise SystemExit('Refusing cleanup: scratch path is outside the scoped directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace guardrail audit scratch directory':
    raise SystemExit('Refusing cleanup: ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

stub_database() { # database name
  pq -d "$1" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key, email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  banned_until timestamptz,
  created_at timestamptz not null default now());
create table auth.identities (
  id uuid primary key, user_id uuid not null references auth.users(id),
  provider text not null, identity_data jsonb not null default '{}'::jsonb,
  last_sign_in timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid,
    nullif(current_setting('test.uid', true),'')::uuid) $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true),''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'role',''),
    nullif(current_setting('test.role', true),''),'authenticated') $$;
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
-- Supabase grants table privileges to anon/authenticated by default and relies
-- on RLS as the gate. Mirror that so the audit exercises RLS rather than a
-- missing GRANT.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
}

# The Supabase platform event trigger, reproduced faithfully. It is installed
# before the baseline so the audit can prove nothing in the tree replaces it.
install_rls_auto_enable() { # database name
  pq -d "$1" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
              where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  loop
    if cmd.schema_name = 'public' and cmd.object_type in ('table', 'partitioned table') then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception when others then
        raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$$;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
create event trigger rls_auto_enable on ddl_command_end
  execute function public.rls_auto_enable();
SQL
}

apply_chain() { # database name
  pq -d "$1" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" \
    > "$OUT/baseline.out" 2> "$OUT/baseline.err" || { tail -5 "$OUT/baseline.err" >&2; return 1; }
  for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
    pq -d "$1" -v ON_ERROR_STOP=1 -f "$MIG_FILE" \
      > "$OUT/migration.out" 2> "$OUT/migration.err" || {
        echo "    failed: $(basename "$MIG_FILE")" >&2
        grep -E "ERROR|DETAIL" "$OUT/migration.err" | head -5 >&2
        return 1
      }
  done
  pq -d "$1" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/backfill_existing_google_profiles.sql" \
    > "$OUT/backfill.out" 2> "$OUT/backfill.err" || { tail -5 "$OUT/backfill.err" >&2; return 1; }
}

echo "=== 1. throwaway cluster ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.log" 2>&1 || {
  tail -20 "$OUT/initdb.log" >&2
  fail "initdb (see $OUT/initdb.log)"
  exit 1
}
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1 -c wal_level=logical -c shared_memory_type=mmap -c max_connections=20 -c shared_buffers=32MB" \
       -l "$OUT/postgres.log" start >/dev/null 2>&1 || true
for _ in $(seq 1 40); do pq -d postgres -tAc "select 1" >/dev/null 2>&1 && break; sleep 0.5; done
pq -d postgres -tAc "select 1" >/dev/null 2>&1 || { fail "cluster did not start"; exit 1; }
pass "cluster ready on 127.0.0.1:$PGPORT"

echo "=== 2. two databases + Supabase-compatible stubs ==="
for DB in "$DB_GUARD" "$DB_ROLLBACK"; do
  hope -c "drop database if exists $DB" >/dev/null 2>&1
  hope -c "create database $DB" >/dev/null 2>&1 || { fail "create $DB"; exit 1; }
  stub_database "$DB" || { fail "stubs for $DB"; exit 1; }
  install_rls_auto_enable "$DB" || { fail "rls_auto_enable for $DB"; exit 1; }
done
pass "stubs + platform rls_auto_enable installed before the baseline"

BEFORE_TRIGGER=$(pq -d "$DB_GUARD" -tAc "select evtname||'|'||evtevent||'|'||evtenabled::text||'|'||evtfoid::regproc from pg_event_trigger")
BEFORE_DEF=$(pq -d "$DB_GUARD" -tAc "select md5(pg_get_functiondef('public.rls_auto_enable()'::regprocedure))")
BEFORE_ACL=$(pq -d "$DB_GUARD" -tAc "select coalesce(proacl::text,'<default>') from pg_proc where oid='public.rls_auto_enable()'::regprocedure")

echo "=== 3. baseline + migrations + backfill (guard database) ==="
apply_chain "$DB_GUARD" || { fail "apply chain"; exit 1; }
TABLE_COUNT=$(pq -d "$DB_GUARD" -tAc "select count(*) from pg_tables where schemaname='public'")
MIG_COUNT=$(ls "$REPO_ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ')
pass "applied baseline + $MIG_COUNT migrations + profile backfill ($TABLE_COUNT public tables)"

echo "=== 4. rls_auto_enable preservation ==="
AFTER_TRIGGER=$(pq -d "$DB_GUARD" -tAc "select evtname||'|'||evtevent||'|'||evtenabled::text||'|'||evtfoid::regproc from pg_event_trigger")
AFTER_DEF=$(pq -d "$DB_GUARD" -tAc "select md5(pg_get_functiondef('public.rls_auto_enable()'::regprocedure))")
AFTER_ACL=$(pq -d "$DB_GUARD" -tAc "select coalesce(proacl::text,'<default>') from pg_proc where oid='public.rls_auto_enable()'::regprocedure")
[ "$BEFORE_TRIGGER" = "$AFTER_TRIGGER" ] && pass "event trigger definition unchanged ($AFTER_TRIGGER)" || fail "event trigger changed: $BEFORE_TRIGGER -> $AFTER_TRIGGER"
[ "$BEFORE_DEF" = "$AFTER_DEF" ] && pass "rls_auto_enable() body unchanged" || fail "rls_auto_enable() body was replaced"
[ "$BEFORE_ACL" = "$AFTER_ACL" ] && pass "rls_auto_enable() execution ACL unchanged ($AFTER_ACL)" || fail "rls_auto_enable() ACL changed: $BEFORE_ACL -> $AFTER_ACL"
STATIC_HITS=$(grep -rilE "(drop|alter|create)[[:space:]]+event[[:space:]]+trigger" "$REPO_ROOT/supabase" --include='*.sql' 2>/dev/null | wc -l | tr -d ' ')
[ "$STATIC_HITS" = "0" ] && pass "no SQL in supabase/ creates, alters or drops an event trigger" || fail "event trigger DDL found in $STATIC_HITS file(s)"

UNPROTECTED=$(pq -d "$DB_GUARD" -tAc "select coalesce(string_agg(tablename,','),'') from pg_tables where schemaname='public' and not rowsecurity")
[ -z "$UNPROTECTED" ] && pass "every public table has RLS enabled ($TABLE_COUNT/$TABLE_COUNT)" || fail "tables without RLS: $UNPROTECTED"

echo "=== 4b. hosted security-advisor and SECURITY DEFINER assertions ==="
pq -d "$DB_GUARD" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/hosted_security_advisor_test.sql" \
  > "$OUT/advisor.out" 2>&1 || { fail "hosted_security_advisor_test.sql raised"; tail -20 "$OUT/advisor.out" >&2; }
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/advisor.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
ADV_PASS=$(grep -c "NOTICE:  PASS" "$OUT/advisor.out" || true)
ADV_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/advisor.out" || true)
ADV_ERR=$(grep -Ec '^psql:.*ERROR:' "$OUT/advisor.out" || true)
[ "$ADV_FAIL" = "0" ] || fail "$ADV_FAIL hosted security advisor assertion(s) failed"
[ "$ADV_ERR" = "0" ] || fail "$ADV_ERR SQL error(s) during hosted security advisor assertions"
[ "$ADV_PASS" -ge 8 ] && pass "hosted security advisor suite: $ADV_PASS passing assertion(s)" || fail "hosted security advisor suite ran only $ADV_PASS assertion(s)"

echo "=== 5. ownership / idempotency / privilege assertions ==="
pq -d "$DB_GUARD" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/ownership_and_privileges_test.sql" \
  > "$OUT/ownership.out" 2>&1 || { fail "ownership_and_privileges_test.sql raised"; tail -20 "$OUT/ownership.out" >&2; }
pq -d "$DB_GUARD" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/authenticated_rpc_security_audit_test.sql" \
  > "$OUT/authenticated-rpc-security.out" 2>&1 || { fail "authenticated_rpc_security_audit_test.sql raised"; tail -20 "$OUT/authenticated-rpc-security.out" >&2; }
sed -E 's/^psql:[^ ]* NOTICE:  //;s/^NOTICE:  //' "$OUT/ownership.out" | grep -E "^(PASS|FAIL)" | sed 's/^/    /'
OWN_PASS=$(grep -c "NOTICE:  PASS" "$OUT/ownership.out" || true)
OWN_FAIL=$(grep -c "NOTICE:  FAIL" "$OUT/ownership.out" || true)
OWN_ERR=$(grep -Ec '^psql:.*ERROR:' "$OUT/ownership.out" || true)
[ "$OWN_FAIL" = "0" ] || fail "$OWN_FAIL ownership assertion(s) failed"
[ "$OWN_ERR" = "0" ] || fail "$OWN_ERR SQL error(s) during ownership assertions"
[ "$OWN_PASS" -ge 11 ] && pass "ownership suite: $OWN_PASS passing assertion(s)" || fail "ownership suite ran only $OWN_PASS assertion(s)"

echo "=== 6. hardening idempotency (rollback database) ==="
apply_chain "$DB_ROLLBACK" || { fail "apply chain (rollback db)"; exit 1; }
for MIG in "${HARDENING_MIGRATIONS[@]}"; do
  for PASS_NO in 1 2; do
    pq -d "$DB_ROLLBACK" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/migrations/$MIG" \
      > "$OUT/reapply.out" 2> "$OUT/reapply.err" || {
        fail "re-apply #$PASS_NO of $MIG"
        grep -E "ERROR|DETAIL" "$OUT/reapply.err" | head -3 >&2
      }
  done
done
[ "$FAILURES" -eq 0 ] && pass "hardening migrations re-applied twice without error"

echo "=== 7. rollback drill ==="
pq -d "$DB_ROLLBACK" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/rollback/20261104_hardening_down.sql" \
  > "$OUT/rollback.out" 2>&1 || { fail "rollback script"; tail -20 "$OUT/rollback.out" >&2; }
ROLLBACK_ERRORS=$(grep -Ec '^psql:.*ERROR:' "$OUT/rollback.out" || true)
[ "$ROLLBACK_ERRORS" = "0" ] || fail "rollback produced $ROLLBACK_ERRORS SQL error(s)"

GUARD_TRIGGERS=$(pq -d "$DB_ROLLBACK" -tAc "select count(*) from pg_trigger where tgname in ('trg_enforce_booking_provider_ownership','trg_enforce_enquiry_provider_ownership')")
GUARD_FUNCS=$(pq -d "$DB_ROLLBACK" -tAc "select count(*) from pg_proc where proname in ('enforce_booking_provider_ownership','enforce_enquiry_provider_ownership')")
USER_IDEM=$(pq -d "$DB_ROLLBACK" -tAc "select count(*) from pg_class where relname='uniq_bookings_user_idempotency_key'")
GLOBAL_IDEM=$(pq -d "$DB_ROLLBACK" -tAc "select count(*) from pg_constraint where conrelid='public.bookings'::regclass and conname='bookings_idempotency_key_key'")
NEW_INDEXES=$(pq -d "$DB_ROLLBACK" -tAc "select count(*) from pg_class where relname like 'idx_%' and relname in ('idx_pg_invoices_user_id','idx_user_access_audit_events_target','idx_service_reviews_customer')")
ADMIN_PUBLIC=$(pq -d "$DB_ROLLBACK" -tAc "select has_function_privilege('anon','public.is_admin()','EXECUTE')")
TRIGGER_AFTER_ROLLBACK=$(pq -d "$DB_ROLLBACK" -tAc "select evtname||'|'||evtenabled::text from pg_event_trigger")

[ "$GUARD_TRIGGERS" = "0" ] && [ "$GUARD_FUNCS" = "0" ] && pass "ownership triggers and functions removed" || fail "ownership guards survived rollback"
[ "$USER_IDEM" = "0" ] && [ "$GLOBAL_IDEM" = "1" ] && pass "per-user idempotency reverted to the global unique constraint" || fail "idempotency rollback incomplete"
[ "$NEW_INDEXES" = "0" ] && pass "foreign-key indexes removed" || fail "$NEW_INDEXES sampled new index(es) survived rollback"
[ "$ADMIN_PUBLIC" = "t" ] && pass "is_admin() PUBLIC grant restored as before" || fail "is_admin() grant was not restored"
[ "$TRIGGER_AFTER_ROLLBACK" = "rls_auto_enable|O" ] && pass "rls_auto_enable still enabled after rollback" || fail "rls_auto_enable altered by rollback: $TRIGGER_AFTER_ROLLBACK"

echo "=== 8. verdict ==="
if [ "$FAILURES" -eq 0 ]; then
  echo "    ALL GUARDRAIL CHECKS PASSED"
  echo "    logs: $OUT"
  exit 0
fi
echo "    $FAILURES GUARDRAIL CHECK(S) FAILED"
echo "    logs: $OUT"
exit 1
