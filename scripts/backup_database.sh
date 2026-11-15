#!/usr/bin/env bash
# =============================================================================
# BookOurSpace — secure local database backup + checksum
#
#   BOS_BACKUP_DATABASE_URL=postgres://... \
#     bash scripts/backup_database.sh [label]
#
# Writes to ~/BookOurSpace_Backups/<UTC timestamp>[-label]/ :
#   schema.dump      pg_dump custom format (no owner/privileges)
#   schema.sql       plain SQL (human review)
#   globals.sql      roles (if permitted)
#   manifest.txt     project ref / server version / table + row counts
#   SHA256SUMS       checksums for every artefact
#
# Guardrails:
#   * never prints the connection string
#   * refuses a connection string containing "prod"
#   * a target naming the production ref requires BOTH
#       BOS_BACKUP_AUTHORIZED=backup-only   (explicit backup-only authorisation)
#       BOS_PROD_REF_CONFIRM=ezrxykyocgbolpaebnqx  (exact target confirmation)
#     and the connection host/user must name that ref and no other ref
#   * every session is forced read-only (default_transaction_read_only=on)
#   * aborts on any pg_dump failure (set -e)
# =============================================================================
set -euo pipefail

LABEL="${1:-manual}"
DATABASE_URL="${BOS_BACKUP_DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ]; then
  echo "BLOCKED: BOS_BACKUP_DATABASE_URL is not set." >&2
  exit 2
fi
case "$DATABASE_URL" in
  *prod*) echo "REFUSED: the connection string looks like production." >&2; exit 3 ;;
esac

# Exact project-reference verification. The host (direct connection) or the
# username (pooler connection) must name one project ref only.
PROD_REF=ezrxykyocgbolpaebnqx
HOSTPART="$(printf '%s' "$DATABASE_URL" | sed -E 's|^[a-zA-Z0-9+.-]+://([^@/]*@)?([^/:?]+).*|\2|')"
USERPART="$(printf '%s' "$DATABASE_URL" | sed -E 's|^[a-zA-Z0-9+.-]+://([^@/]*)@.*|\1|' | sed -E 's|:.*$||')"
REFS="$(printf '%s %s' "$HOSTPART" "$USERPART" | grep -oE '[a-z]{20}' | sort -u | tr '\n' ' ' | sed -E 's/ +$//' || true)"
# grep exits 1 when no ref is present; that is a valid (local) target, not a failure.

IS_LOOPBACK=0
case "$HOSTPART" in
  localhost|127.0.0.1|::1) IS_LOOPBACK=1 ;;
esac

if [ "$REFS" = "$PROD_REF" ] || printf '%s' "$DATABASE_URL" | grep -q "$PROD_REF"; then
  if [ "${BOS_BACKUP_AUTHORIZED:-}" != "backup-only" ]; then
    echo "BLOCKED: a dump of $PROD_REF requires BOS_BACKUP_AUTHORIZED=backup-only." >&2
    echo "         backup only: no writes, no migrations, no configuration changes." >&2
    exit 3
  fi
  if [ "${BOS_PROD_REF_CONFIRM:-}" != "$PROD_REF" ]; then
    echo "BLOCKED: set BOS_PROD_REF_CONFIRM=$PROD_REF to confirm the exact target." >&2
    exit 3
  fi
  if [ "$REFS" != "$PROD_REF" ]; then
    echo "REFUSED: connection host/user must name exactly $PROD_REF (found: ${REFS:-none})." >&2
    exit 3
  fi
  TARGET_KIND=production
elif [ -n "$REFS" ] || [ "$IS_LOOPBACK" != "1" ]; then
  echo "REFUSED: hosted target is not $PROD_REF and is not loopback." >&2
  echo "         only the confirmed production ref or a disposable local database may be dumped." >&2
  exit 3
else
  TARGET_KIND=local
fi

# Read-only sessions: a backup must never be able to write to its source.
PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on"
export PGOPTIONS

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SAFE_LABEL="$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '_')"
BACKUP_ROOT="${BOS_BACKUP_ROOT:-$HOME/BookOurSpace_Backups/react}"
DEST="$BACKUP_ROOT/${STAMP}-${SAFE_LABEL}"
mkdir -p "$DEST"
chmod 700 "$DEST"

echo "backup directory: $DEST"
echo "server: $(psql "$DATABASE_URL" -X -q -tAc 'select version();' | cut -c1-60)"

# Data-only + schema, custom format (compressed, restorable with pg_restore).
pg_dump "$DATABASE_URL" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --file="$DEST/schema.dump"

pg_dump "$DATABASE_URL" \
  --format=plain --no-owner --no-privileges \
  --file="$DEST/schema.sql"

pg_dumpall --roles-only --no-role-passwords > "$DEST/globals.sql" 2>/dev/null \
  || echo "globals not dumped (permission)" > "$DEST/globals.sql"

q() { psql "$DATABASE_URL" -X -q -tAc "$1"; }
{
  echo "project_ref=${REFS:-local}"
  echo "target_kind=$TARGET_KIND"
  echo "authorized=${BOS_BACKUP_AUTHORIZED:-none}"
  echo "session_read_only=default_transaction_read_only=on"
  echo "created_utc=$STAMP"
  echo "label=$LABEL"
  echo "server_version=$(q 'show server_version;')"
  echo "database=$(q 'select current_database();')"
  echo "public_tables=$(q "select count(*) from pg_tables where schemaname='public';")"
  echo "rls_tables=$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity;")"
  echo "policies=$(q "select count(*) from pg_policies where schemaname='public';")"
  echo "migrations_applied_guess=$(q "select count(*) from pg_tables where schemaname='public' and tablename in ('platform_module_flags','stay_properties','service_bookings','venue_bookings','class_batches','payment_intents');")"
} > "$DEST/manifest.txt"

( cd "$DEST" && shasum -a 256 schema.dump schema.sql globals.sql manifest.txt > SHA256SUMS )
chmod 600 "$DEST"/* 2>/dev/null || true

du -sh "$DEST" | sed 's/^/size: /'
cat "$DEST/manifest.txt"
echo "checksums:"
cat "$DEST/SHA256SUMS"
