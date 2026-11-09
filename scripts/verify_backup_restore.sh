#!/usr/bin/env bash
# =============================================================================
# BookOurSpace — restore a backup into an ISOLATED local PostgreSQL and verify.
#
#   bash scripts/verify_backup_restore.sh ~/BookOurSpace_Backups/<dir>
#
# It creates a private throwaway cluster in a temp directory, restores the
# custom-format dump, compares object counts against the manifest, then removes
# the cluster. It never connects to a hosted database.
# =============================================================================
set -euo pipefail

BACKUP_DIR="${1:-}"
if [ -z "$BACKUP_DIR" ] || [ ! -f "$BACKUP_DIR/schema.dump" ]; then
  echo "usage: $0 <backup-directory containing schema.dump>" >&2
  exit 2
fi

echo "=== 1. checksum verification ==="
( cd "$BACKUP_DIR" && shasum -a 256 -c SHA256SUMS )

echo "=== 2. isolated restore ==="
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/bos-restore.XXXXXX")"
PGDATA="$TMP_ROOT/pgdata"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
cleanup() { pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

initdb -D "$PGDATA" -U postgres --auth=trust > "$TMP_ROOT/initdb.log" 2>&1
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $TMP_ROOT -c listen_addresses=127.0.0.1" -l "$TMP_ROOT/pg.log" -w start >/dev/null
psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d postgres -q -c "create database restore_check;" >/dev/null

# Supabase-compatible stubs: the dump references these roles/schema in policies.
psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d restore_check -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create extension if not exists pgcrypto;
SQL

if pg_restore --no-owner --no-privileges --exit-on-error \
     -h 127.0.0.1 -p "$PGPORT" -U postgres -d restore_check "$BACKUP_DIR/schema.dump" \
     > "$TMP_ROOT/restore.out" 2> "$TMP_ROOT/restore.err"; then
  echo "    restore: OK"
else
  echo "    restore: FAILED (see $TMP_ROOT/restore.err)"
  tail -20 "$TMP_ROOT/restore.err"
  exit 3
fi

echo "=== 3. object comparison ==="
TABLES=$(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d restore_check -X -q -tAc "select count(*) from pg_tables where schemaname='public';")
RLS=$(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d restore_check -X -q -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity;")
POLICIES=$(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d restore_check -X -q -tAc "select count(*) from pg_policies where schemaname='public';")
FUNCS=$(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d restore_check -X -q -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';")
AUTH_USERS=$(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d restore_check -X -q -tAc "select count(*) from auth.users;")
AUTH_IDENTITIES=$(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d restore_check -X -q -tAc "select count(*) from auth.identities;")

SOURCE_TABLES=$(grep -E '^public_tables=' "$BACKUP_DIR/manifest.txt" | cut -d= -f2)
SOURCE_RLS=$(grep -E '^rls_tables=' "$BACKUP_DIR/manifest.txt" | cut -d= -f2)
SOURCE_POLICIES=$(grep -E '^policies=' "$BACKUP_DIR/manifest.txt" | cut -d= -f2)
SOURCE_AUTH_USERS=$(grep -E '^auth_users=' "$BACKUP_DIR/manifest.txt" | cut -d= -f2 || true)
SOURCE_AUTH_IDENTITIES=$(grep -E '^auth_identities=' "$BACKUP_DIR/manifest.txt" | cut -d= -f2 || true)

echo "    tables   source=$SOURCE_TABLES  restored=$TABLES"
echo "    rls      source=$SOURCE_RLS  restored=$RLS"
echo "    policies source=$SOURCE_POLICIES  restored=$POLICIES"
if [ -n "$SOURCE_AUTH_USERS" ]; then echo "    auth users source=$SOURCE_AUTH_USERS  restored=$AUTH_USERS"; fi
if [ -n "$SOURCE_AUTH_IDENTITIES" ]; then echo "    auth identities source=$SOURCE_AUTH_IDENTITIES  restored=$AUTH_IDENTITIES"; fi
echo "    functions restored=$FUNCS"

STATUS=0
[ "$TABLES" = "$SOURCE_TABLES" ] || { echo "    MISMATCH tables" >&2; STATUS=4; }
[ "$RLS" = "$SOURCE_RLS" ] || { echo "    MISMATCH rls" >&2; STATUS=4; }
[ "$POLICIES" = "$SOURCE_POLICIES" ] || { echo "    MISMATCH policies" >&2; STATUS=4; }
[ -z "$SOURCE_AUTH_USERS" ] || [ "$AUTH_USERS" = "$SOURCE_AUTH_USERS" ] || { echo "    MISMATCH auth users" >&2; STATUS=4; }
[ -z "$SOURCE_AUTH_IDENTITIES" ] || [ "$AUTH_IDENTITIES" = "$SOURCE_AUTH_IDENTITIES" ] || { echo "    MISMATCH auth identities" >&2; STATUS=4; }

if [ "$STATUS" -eq 0 ]; then
  echo "RESTORE VERIFIED — backup is complete and restorable"
else
  echo "RESTORE MISMATCH" >&2
fi
exit "$STATUS"
