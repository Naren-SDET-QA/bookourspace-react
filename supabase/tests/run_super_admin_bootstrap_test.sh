#!/usr/bin/env bash
# =============================================================================
# Super Admin bootstrap test — private throwaway PostgreSQL cluster only.
#
# Proves, on a disposable cluster with the baseline plus every migration:
#   1. the script refuses missing variables and an invalid confirmation token
#   2. a dry run changes nothing
#   3. the RPC refuses non-Google, unconfirmed and non-owner sessions
#   4. an approved run promotes exactly one account and appends one audit row
#   5. a second approved run is refused and adds no audit row
#   6. the last active Super Admin cannot revoke itself
#   7. client roles cannot execute the bootstrap routine
#
# Never contacts Supabase, never reads credentials.
#
# Usage: bash supabase/tests/run_super_admin_bootstrap_test.sh
# Exit:  0 = every check passed, 1 = a check or setup step failed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-bootstrap.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace bootstrap test scratch directory" > "$TMP_ROOT/.bos-bootstrap-owned"
PGDATA="$TMP_ROOT/pgdata"
OUT="$TMP_ROOT/output"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
DB=bos_bootstrap
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/supabase/bootstrap_super_admin.sql"
mkdir -p "$OUT"

OWNER_ID=11111111-1111-4111-8111-111111111111

PASSES=0
FAILS=0
pass() { PASSES=$((PASSES + 1)); printf '  PASS  %s\n' "$1"; }
fail() { FAILS=$((FAILS + 1)); printf '  FAIL  %s\n' "$1"; }
pq() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres "$@"; }
q() { pq -d "$DB" -tAc "$1"; }
run_bootstrap() { pq -d "$DB" -v ON_ERROR_STOP=1 -f "$SCRIPT" "$@" > "$OUT/bootstrap.out" 2>&1; }

cleanup() {
  pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

echo "=== 1. throwaway cluster on 127.0.0.1:$PGPORT ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$OUT/initdb.out" 2>&1 || { fail "initdb"; exit 1; }
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $TMP_ROOT" -l "$OUT/pg.log" start >/dev/null 2>&1 || { fail "pg start"; exit 1; }
pq -d postgres -q -c "create database $DB;" >/dev/null 2>&1 || { fail "create database"; exit 1; }
pass "cluster ready (local, disposable)"

echo "=== 2. Supabase-compatible stub + baseline + migrations ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || { fail "stub schema"; exit 1; }
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
  banned_until timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade
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
  || { fail "storage stub"; exit 1; }
pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/schema_and_rls.sql" > "$OUT/baseline.out" 2>&1 \
  || { tail -5 "$OUT/baseline.out" >&2; fail "baseline schema"; exit 1; }
for MIG_FILE in "$REPO_ROOT"/supabase/migrations/*.sql; do
  pq -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIG_FILE" > "$OUT/migration.out" 2>&1 \
    || { grep -E "ERROR|DETAIL" "$OUT/migration.out" | head -3 >&2; fail "apply $(basename "$MIG_FILE")"; exit 1; }
done
pass "baseline + every migration applied"

echo "=== 3. fixtures ==="
pq -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || { fail "fixtures"; exit 1; }
insert into auth.users(id, email, raw_app_meta_data, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test', '{"provider":"google"}'::jsonb, now()),
  ('22222222-2222-4222-8222-222222222222', 'pending@example.test', '{"provider":"google"}'::jsonb, null),
  ('33333333-3333-4333-8333-333333333333', 'password@example.test', '{"provider":"email"}'::jsonb, now());
insert into public.profiles(id, email, role) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test', 'customer'),
  ('22222222-2222-4222-8222-222222222222', 'pending@example.test', 'customer'),
  ('33333333-3333-4333-8333-333333333333', 'password@example.test', 'customer')
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='app_sql') then create role app_sql login; end if;
end $$;
grant usage on schema public, private, auth to app_sql;
grant select on auth.users to app_sql;
grant execute on function private.bootstrap_super_admin(uuid, text) to app_sql;
SQL
pass "Google-confirmed, unconfirmed and password-only users; non-owner role"

echo "=== 4. script refusals ==="
if run_bootstrap -v bootstrap_email=owner@example.test -v bootstrap_note='approved bootstrap note'; then
  fail "missing confirmation token was accepted"
else
  grep -q 'BOOTSTRAP_CONFIRMATION_REQUIRED\|BOOTSTRAP_CONFIRMATION_INVALID' "$OUT/bootstrap.out" \
    && pass "missing confirmation token refused" || fail "missing token failed for the wrong reason"
fi

if run_bootstrap -v bootstrap_email=owner@example.test -v bootstrap_confirm=YES -v bootstrap_note='approved bootstrap note'; then
  fail "invalid confirmation token was accepted"
else
  grep -q 'BOOTSTRAP_CONFIRMATION_INVALID' "$OUT/bootstrap.out" \
    && pass "invalid confirmation token refused" || fail "invalid token failed for the wrong reason"
fi

if run_bootstrap -v bootstrap_email=missing@example.test -v bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN -v bootstrap_note='approved bootstrap note'; then
  fail "unknown email was promoted"
else
  grep -q 'BOOTSTRAP_TARGET_NOT_FOUND' "$OUT/bootstrap.out" \
    && pass "unknown email refused" || fail "unknown email failed for the wrong reason"
fi

echo "=== 5. RPC identity checks ==="
if run_bootstrap -v bootstrap_email=pending@example.test -v bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN -v bootstrap_note='approved bootstrap note'; then
  fail "unconfirmed email was promoted"
else
  grep -q 'TARGET_MUST_BE_VERIFIED_GOOGLE_AUTH_USER' "$OUT/bootstrap.out" \
    && pass "unconfirmed Google account refused" || fail "unconfirmed account failed for the wrong reason"
fi

if run_bootstrap -v bootstrap_email=password@example.test -v bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN -v bootstrap_note='approved bootstrap note'; then
  fail "password-only account was promoted"
else
  grep -q 'TARGET_MUST_BE_VERIFIED_GOOGLE_AUTH_USER' "$OUT/bootstrap.out" \
    && pass "non-Google account refused" || fail "non-Google account failed for the wrong reason"
fi

if psql -h 127.0.0.1 -p "$PGPORT" -U app_sql -d "$DB" -v ON_ERROR_STOP=1 -f "$SCRIPT" \
     -v bootstrap_email=owner@example.test -v bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN \
     -v bootstrap_note='approved bootstrap note' > "$OUT/nonowner.out" 2>&1; then
  fail "non-owner session promoted an account"
else
  grep -q 'BOOTSTRAP_OWNER_SQL_REQUIRED' "$OUT/nonowner.out" \
    && pass "non-owner session refused" || fail "non-owner session failed for the wrong reason"
fi

echo "=== 6. UUID dry run writes nothing ==="
if run_bootstrap -v bootstrap_user_id="$OWNER_ID" -v bootstrap_confirm=DRY-RUN -v bootstrap_note='approved bootstrap note'; then
  role="$(q "select role || '/' || is_super_admin from public.profiles where id='$OWNER_ID'")"
  audit="$(q "select count(*) from public.user_access_audit_events where action like 'bootstrap_%'")"
  [ "$role" = "customer/false" ] && [ "$audit" = "0" ] \
    && pass "verified Google UUID dry run resolved one account and wrote nothing" \
    || fail "UUID dry run mutated state (role=$role audit=$audit)"
else
  fail "UUID dry run exited non-zero"
fi

echo "=== 6b. email dry run writes nothing ==="
if run_bootstrap -v bootstrap_email=owner@example.test -v bootstrap_confirm=DRY-RUN -v bootstrap_note='approved bootstrap note'; then
  role="$(q "select role || '/' || is_super_admin from public.profiles where id='$OWNER_ID'")"
  audit="$(q "select count(*) from public.user_access_audit_events where action like 'bootstrap_%'")"
  [ "$role" = "customer/false" ] && [ "$audit" = "0" ] \
    && pass "dry run promoted and audited nothing" \
    || fail "dry run mutated state (role=$role audit=$audit)"
else
  fail "dry run exited non-zero"
fi

echo "=== 7. approved bootstrap ==="
if run_bootstrap -v bootstrap_email=owner@example.test -v bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN -v bootstrap_note='2026-11-05 approved by owner'; then
  role="$(q "select role || '/' || is_super_admin from public.profiles where id='$OWNER_ID'")"
  audit="$(q "select count(*) from public.user_access_audit_events where action='bootstrap_grant' and target_user_id='$OWNER_ID' and reason='2026-11-05 approved by owner' and new_is_super_admin is true and actor_user_id is null and actor_type='database_owner' and actor_database_role='postgres'")"
  [ "$role" = "admin/true" ] && [ "$audit" = "1" ] \
    && pass "approved run promoted one account and audited target, truthful database actor, reason, and state" \
    || fail "approved run left role=$role audit=$audit"
else
  sed -n '1,8p' "$OUT/bootstrap.out" >&2
  fail "approved bootstrap exited non-zero"
fi

if run_bootstrap -v bootstrap_email=owner@example.test -v bootstrap_confirm=BOOTSTRAP-SUPER-ADMIN -v bootstrap_note='2026-11-05 approved by owner'; then
  fail "second bootstrap of the same account was accepted"
else
  grep -q 'TARGET_ALREADY_SUPER_ADMIN' "$OUT/bootstrap.out" \
    && pass "repeat bootstrap refused" || fail "repeat bootstrap failed for the wrong reason"
fi
[ "$(q "select count(*) from public.user_access_audit_events where action='bootstrap_grant'")" = "1" ] \
  && pass "repeat attempt added no audit row" || fail "repeat attempt added audit rows"

echo "=== 8. last Super Admin is protected and clients are locked out ==="
if pq -d "$DB" -q -v ON_ERROR_STOP=1 -c "select * from private.revoke_super_admin('$OWNER_ID'::uuid, 'revoke the only super admin')" > "$OUT/revoke.out" 2>&1; then
  fail "the only active Super Admin was revoked"
else
  grep -q 'LAST_SUPER_ADMIN_CANNOT_BE_REVOKED' "$OUT/revoke.out" \
    && pass "last active Super Admin cannot be revoked" || fail "revoke failed for the wrong reason"
fi

for role in anon authenticated service_role; do
  if [ "$(q "select has_function_privilege('$role','private.bootstrap_super_admin(uuid,text)','EXECUTE')")" = "f" ]; then
    pass "$role cannot execute the bootstrap routine"
  else
    fail "$role can execute the bootstrap routine"
  fi
done
[ "$(q "select has_function_privilege('anon','public.manage_user_access(uuid,text,text)','EXECUTE')")" = "f" ] \
  && pass "anon cannot call manage_user_access" || fail "anon can call manage_user_access"

echo
echo "=== result: $PASSES passed, $FAILS failed ==="
[ "$FAILS" -eq 0 ] || exit 1
echo "SUPER ADMIN BOOTSTRAP TEST PASSED"
