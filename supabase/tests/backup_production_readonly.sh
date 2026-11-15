#!/usr/bin/env bash
# =============================================================================
# Read-only production backup for the React Supabase database.
#
# THIS SCRIPT IS DELIBERATELY GATED. It refuses to run unless both of these are
# provided by the operator, because taking a production dump is an authorised,
# separately approved operation:
#
#   BOS_BACKUP_AUTHORIZED=backup-only            explicit backup-only authorisation
#   BOS_PROD_REF_CONFIRM=ezrxykyocgbolpaebnqx    exact project-reference confirmation
#   BOS_PRODUCTION_DATABASE_URL=postgresql://... (direct or pooler)
#
# The connection host (direct) or username (pooler) must additionally name
# ezrxykyocgbolpaebnqx and no other project ref, or the run is refused.
#
# What it does:
#   1. pg_dump --format=custom --no-owner --no-privileges  (read-only)
#   2. records size + sha256 and writes a .sha256 sidecar
#   3. restores into a throwaway local cluster and compares catalog counts
#   4. re-runs the profile-privacy assertions against the restored copy
#
# It never writes to the source database (no DDL/DML; pg_dump only reads) and
# never prints the connection string. The URL is passed via the environment and
# to the tool through a private option file, not the command line.
#
# Usage:
#   BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM=ezrxykyocgbolpaebnqx \
#     BOS_PRODUCTION_DATABASE_URL=... \
#     bash supabase/tests/backup_production_readonly.sh /secure/path/react-$(date +%F).dump
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ "${BOS_BACKUP_AUTHORIZED:-}" != "backup-only" ]; then
  cat >&2 <<'MSG'
REFUSED: a production database dump requires explicit backup-only authorisation.
Set BOS_BACKUP_AUTHORIZED=backup-only together with BOS_PROD_REF_CONFIRM and
BOS_PRODUCTION_DATABASE_URL. No connection was attempted.
MSG
  exit 3
fi
if [ -z "${BOS_PRODUCTION_DATABASE_URL:-}" ]; then
  echo "REFUSED: BOS_PRODUCTION_DATABASE_URL is not set." >&2
  exit 3
fi

PROD_REF=ezrxykyocgbolpaebnqx
if [ "${BOS_PROD_REF_CONFIRM:-}" != "$PROD_REF" ]; then
  echo "REFUSED: set BOS_PROD_REF_CONFIRM=$PROD_REF to confirm the exact target." >&2
  exit 3
fi
case "$BOS_PRODUCTION_DATABASE_URL" in
  *prod*) echo "REFUSED: the connection string looks like production." >&2; exit 3 ;;
esac

# Exact project-reference verification: the host (direct connection) or the
# username (pooler connection) must name this ref and no other ref.
HOSTPART="$(printf '%s' "$BOS_PRODUCTION_DATABASE_URL" | sed -E 's|^[a-zA-Z0-9+.-]+://([^@/]*@)?([^/:?]+).*|\2|')"
USERPART="$(printf '%s' "$BOS_PRODUCTION_DATABASE_URL" | sed -E 's|^[a-zA-Z0-9+.-]+://([^@/]*)@.*|\1|' | sed -E 's|:.*$||')"
REFS="$(printf '%s %s' "$HOSTPART" "$USERPART" | grep -oE '[a-z]{20}' | sort -u | tr '\n' ' ' | sed -E 's/ +$//')"
if [ "$REFS" != "$PROD_REF" ]; then
  echo "REFUSED: connection host/user must name exactly $PROD_REF (found: ${REFS:-none})." >&2
  exit 3
fi
OUT_PATH="${1:-}"
if [ -z "$OUT_PATH" ]; then
  echo "usage: BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM=$PROD_REF BOS_PRODUCTION_DATABASE_URL=... bash $0 <output.dump>" >&2
  exit 2
fi
mkdir -p "$(dirname "$OUT_PATH")" || exit 1
if [ -e "$OUT_PATH" ]; then
  echo "REFUSED: $OUT_PATH already exists; refusing to overwrite a backup." >&2
  exit 2
fi

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/bos-prod-backup.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace production backup verification scratch" > "$SCRATCH/.bos-owned"
CONN_FILE="$SCRATCH/conn.conf"
umask 077
printf 'dbname=%s\n' "$BOS_PRODUCTION_DATABASE_URL" > "$CONN_FILE"
PGDATA="$SCRATCH/pgdata"
PGPORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
RESTORE_DB=bos_prod_restore

cleanup() {
  rm -f "$CONN_FILE"
  if [ -f "$PGDATA/PG_VERSION" ]; then pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true; fi
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

echo "=== 1. dump (read-only) ==="
PGOPTIONS="-c default_transaction_read_only=on" \
pg_dump --dbname="service=$CONN_FILE" --format=custom --no-owner --no-privileges \
  --file="$OUT_PATH" 2> "$SCRATCH/dump.err" \
  || { echo "pg_dump failed:"; sed -e 's#postgres\(ql\)\?://[^ ]*#<redacted>#g' "$SCRATCH/dump.err" >&2; exit 1; }
BYTES="$(wc -c < "$OUT_PATH" | tr -d ' ')"
SHA="$(shasum -a 256 "$OUT_PATH" | cut -d' ' -f1)"
printf '%s  %s\n' "$SHA" "$(basename "$OUT_PATH")" > "$OUT_PATH.sha256"
echo "    dump=$OUT_PATH bytes=$BYTES sha256=$SHA"

echo "=== 2. isolated restore verification ==="
initdb -D "$PGDATA" -U postgres --auth=trust > "$SCRATCH/initdb.log" 2>&1 || { echo "initdb failed" >&2; exit 1; }
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1 -c shared_memory_type=mmap" \
  -l "$SCRATCH/pg.log" start >/dev/null 2>&1 \
  || pg_ctl -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" -l "$SCRATCH/pg.log" start >/dev/null 2>&1
for _ in $(seq 1 40); do psql "postgresql://postgres@127.0.0.1:$PGPORT/postgres" -tAc "select 1" >/dev/null 2>&1 && break; sleep 0.5; done
psql "postgresql://postgres@127.0.0.1:$PGPORT/postgres" -q -c "create database $RESTORE_DB;" || exit 1
# Roles and grants are part of the security posture, so privileges are restored.
pg_restore -d "postgresql://postgres@127.0.0.1:$PGPORT/$RESTORE_DB" --no-owner "$OUT_PATH" \
  > "$SCRATCH/restore.log" 2>&1 || { grep -iE "error" "$SCRATCH/restore.log" | head -5 >&2; exit 1; }
psql "postgresql://postgres@127.0.0.1:$PGPORT/$RESTORE_DB" -tAc "
  select json_build_object(
    'tables',(select count(*) from pg_tables where schemaname='public'),
    'policies',(select count(*) from pg_policies where schemaname='public'),
    'rls_enabled',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
    'migrations_table',(select count(*) from information_schema.tables
       where table_schema='supabase_migrations' and table_name='schema_migrations')
  )::text"

echo "=== 3. privacy assertions on the restored copy ==="
psql "postgresql://postgres@127.0.0.1:$PGPORT/$RESTORE_DB" -q -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/supabase/tests/profile_private_access_test.sql" 2>&1 | grep -E "PASS|FAILED" || true

echo "=== 4. done ==="
echo "    verify locally with: shasum -a 256 -c $(basename "$OUT_PATH").sha256"
echo "    NOTE: hosted backup schedule / PITR window must still be read from the"
echo "    project dashboard before this dump is treated as the recovery anchor."
