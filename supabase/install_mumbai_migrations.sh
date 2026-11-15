#!/usr/bin/env bash
set -euo pipefail
umask 077

# Guarded installer for the Mumbai target. Default mode is a local plan only.
# Hosted apply is intentionally an explicit later operation, after approval.
readonly EXPECTED_REF='obkfgxjzlscungkhbyvq'
readonly BASELINE='supabase/schema_and_rls.sql'
readonly MIGRATION_DIR='supabase/migrations'
readonly MANIFEST='supabase/MIGRATION_MANIFEST.json'
readonly PROFILE_BACKFILL='supabase/backfill_existing_google_profiles.sql'
readonly HISTORY_TABLE='supabase_migrations.schema_migrations'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---plan}"

fail() { printf 'BLOCKED: %s\n' "$1" >&2; exit 2; }
[[ "$MODE" == '--plan' || "$MODE" == '--apply' ]] || fail 'usage: bash supabase/install_mumbai_migrations.sh [--plan|--apply]'
cd "$ROOT"
# shellcheck source=tests/lib/bos_backup_crypto.sh
. "$ROOT/supabase/tests/lib/bos_backup_crypto.sh"

command -v node >/dev/null || fail 'Node.js is required for manifest verification.'
node supabase/tests/migration_manifest.mjs || fail 'Migration manifest check failed.'
[[ -f "$PROFILE_BACKFILL" ]] || fail 'Existing Google profile backfill SQL is missing.'
[[ -f supabase/.temp/project-ref ]] || fail 'Supabase CLI project link is missing; link the Mumbai project locally before applying.'
LINKED_REF="$(tr -d '\r\n' < supabase/.temp/project-ref)"
[[ "$LINKED_REF" == "$EXPECTED_REF" ]] || fail 'Local Supabase CLI project reference is not the approved Mumbai project.'

# Use the verified manifest as the single source of truth for count and order.
# The verifier above rejects inventory/hash drift and duplicate versions before
# any plan is printed or any database connection can be attempted.
MANIFEST_MIGRATIONS=()
while IFS= read -r manifest_file; do
  [[ "$manifest_file" == "$MIGRATION_DIR/"*.sql ]] || fail "Invalid migration path in manifest: $manifest_file"
  [[ -f "$manifest_file" ]] || fail "Manifest migration file is missing: $manifest_file"
  MANIFEST_MIGRATIONS+=("$manifest_file")
done < <(node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  for (const migration of manifest.migrations) console.log(migration.file);
' "$MANIFEST")
COUNT="${#MANIFEST_MIGRATIONS[@]}"
EXPECTED_HISTORY_COUNT=$((COUNT + 1)) # baseline marker plus each manifest migration
[[ "$COUNT" -gt 0 ]] || fail 'Manifest contains no migrations; refusing an empty installation.'

printf 'BookOurSpace Mumbai migration plan\n'
printf 'target project : %s (verified local Supabase CLI link)\n' "$EXPECTED_REF"
printf 'baseline       : %s (first-install only)\n' "$BASELINE"
printf 'migration files: %s (manifest order; baseline marker + migration history entries: %s)\n' "$COUNT" "$EXPECTED_HISTORY_COUNT"
printf 'history table  : %s\n' "$HISTORY_TABLE"
printf 'profile backfill: %s (separate approval required; insert missing Google profiles as customers)\n' "$PROFILE_BACKFILL"
printf 'pre-change backup: encrypted .gpg; Auth users + identities; external owner key required\n'
printf 'rollback       : restore a pre-change backup; apply forward corrective migrations only\n\n'
printf '1. %s\n' "$BASELINE"
index=2
for file in "${MANIFEST_MIGRATIONS[@]}"; do
  printf '%d. %s\n' "$index" "$file"
  index=$((index + 1))
done

[[ "$MODE" == '--apply' ]] || exit 0

[[ "${BOS_MUMBAI_APPLY_APPROVED:-}" == "$EXPECTED_REF" ]] || fail 'hosted apply requires explicit approval by setting BOS_MUMBAI_APPLY_APPROVED to the Mumbai project reference.'
[[ "${BOS_MUMBAI_PROFILE_BACKFILL_APPROVED:-}" == "$EXPECTED_REF" ]] || fail 'Google profile backfill requires separate explicit approval by setting BOS_MUMBAI_PROFILE_BACKFILL_APPROVED to the Mumbai project reference.'
[[ "${BOS_MUMBAI_CONFIRM_REF:-}" == "$EXPECTED_REF" ]] || fail 'BOS_MUMBAI_CONFIRM_REF must match the Mumbai project reference.'
DATABASE_URL="${BOS_MUMBAI_DATABASE_URL:-}"
[[ -n "$DATABASE_URL" ]] || fail 'BOS_MUMBAI_DATABASE_URL is required; credentials are never printed.'
command -v psql >/dev/null || fail 'psql is required.'
command -v pg_dump >/dev/null || fail 'pg_dump is required for a pre-change backup.'
command -v pg_restore >/dev/null || fail 'pg_restore is required to verify the backup.'

# Accept Mumbai's direct endpoint, or its transaction-independent session
# pooler endpoint for IPv4-only clients. The pooler target is pinned by both
# Mumbai's ap-south-1 region hostname and its project-specific database user.
CONNECTION_FIELDS="$(node -e '
try {
  const u = new URL(process.argv[1]);
  if (!(["postgres:", "postgresql:"].includes(u.protocol))) process.exit(1);
  process.stdout.write([u.hostname.toLowerCase(), u.port || "5432", decodeURIComponent(u.username), decodeURIComponent(u.pathname.replace(/^\//, ""))].join(String.fromCharCode(10)));
} catch { process.exit(1); }
' "$DATABASE_URL")" || fail 'Database URL is malformed.'
URL_HOST="$(printf '%s\n' "$CONNECTION_FIELDS" | sed -n '1p')"
URL_PORT="$(printf '%s\n' "$CONNECTION_FIELDS" | sed -n '2p')"
URL_USER="$(printf '%s\n' "$CONNECTION_FIELDS" | sed -n '3p')"
URL_DATABASE="$(printf '%s\n' "$CONNECTION_FIELDS" | sed -n '4p')"
DIRECT_TARGET=false
SESSION_TARGET=false
if [[ "$URL_HOST" == "db.${EXPECTED_REF}.supabase.co" && "$URL_PORT" == '5432' && "$URL_USER" == 'postgres' ]]; then
  DIRECT_TARGET=true
fi
if [[ "$URL_HOST" =~ ^aws-[0-9]+-ap-south-1\.pooler\.supabase\.com$ && "$URL_PORT" == '5432' && "$URL_USER" == "postgres.${EXPECTED_REF}" ]]; then
  SESSION_TARGET=true
fi
[[ "$DIRECT_TARGET" == true || "$SESSION_TARGET" == true ]] || fail 'Database URL does not identify the approved Mumbai direct endpoint or Mumbai session pooler.'
[[ "$URL_DATABASE" == 'postgres' ]] || fail 'Database URL must select the postgres database.'
# Enforce TLS even if a pasted dashboard URI omitted or weakened its query option.
DATABASE_URL="$(node -e 'const u=new URL(process.argv[1]); u.searchParams.set("sslmode","require"); process.stdout.write(u.toString())' "$DATABASE_URL")"
unset CONNECTION_FIELDS URL_HOST URL_PORT URL_USER URL_DATABASE DIRECT_TARGET SESSION_TARGET
export PGDATABASE="$DATABASE_URL"
export PGSSLMODE=require

# Confirm the connection is PostgreSQL and capture only non-sensitive identity
# fields before the first write. The host reference is independently checked above.
psql -X -v ON_ERROR_STOP=1 -Atc "select current_database(), current_user, version()" >/dev/null \
  || fail 'Could not verify the selected target database connection.'

BACKUP_PATH="${BOS_MUMBAI_BACKUP_PATH:-}"
[[ -n "$BACKUP_PATH" ]] || fail 'BOS_MUMBAI_BACKUP_PATH is required so an encrypted pre-change backup is created before any write.'
[[ "$BACKUP_PATH" == *.gpg ]] || fail 'BOS_MUMBAI_BACKUP_PATH must end in .gpg; the pre-change backup is encrypted.'
[[ ! -e "$BACKUP_PATH" ]] || fail 'Backup path already exists; choose a new protected path rather than overwriting a backup.'
[[ ! -e "$BACKUP_PATH.sha256" ]] || fail 'Backup checksum path already exists; refusing to overwrite it.'
BACKUP_DIR="$(dirname "$BACKUP_PATH")"
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd -P)"
case "$BACKUP_DIR" in "$ROOT"|"$ROOT"/*) fail 'Encrypted backup must be stored outside the repository.' ;; esac
bos_crypto_require_recipient || fail 'Owner encryption key is required before any migration can run.'
bos_crypto_assert_separation "$BACKUP_DIR"
TEMP_BACKUP="$BACKUP_PATH.plain.tmp"
[[ ! -e "$TEMP_BACKUP" ]] || fail 'Temporary plaintext backup path already exists; refusing to overwrite it.'
trap '[[ -z "${TEMP_BACKUP:-}" ]] || rm -f -- "$TEMP_BACKUP"' EXIT
pg_dump --format=custom --no-owner --file "$TEMP_BACKUP"
BACKUP_ENTRIES="$(pg_restore --list "$TEMP_BACKUP")" || fail 'Pre-change backup could not be verified.'
grep -q 'TABLE DATA auth users' <<<"$BACKUP_ENTRIES" || fail 'Pre-change backup does not contain Auth user data; stop before any migration.'
grep -q 'TABLE DATA auth identities' <<<"$BACKUP_ENTRIES" || fail 'Pre-change backup does not contain Auth identity data; stop before any migration.'
PLAINTEXT_SHA="$(shasum -a 256 "$TEMP_BACKUP" | cut -d' ' -f1)"
bos_crypto_encrypt "$TEMP_BACKUP" "$BACKUP_PATH"
bos_crypto_verify "$BACKUP_PATH"
bos_crypto_roundtrip "$BACKUP_PATH" "$PLAINTEXT_SHA"
rm -f -- "$TEMP_BACKUP"
TEMP_BACKUP=''
shasum -a 256 "$BACKUP_PATH" > "$BACKUP_PATH.sha256"
printf 'Verified encrypted pre-change backup: %s (Auth users and identities included)\n' "$BACKUP_PATH"

AUTH_USERS_BEFORE="$(psql -X -v ON_ERROR_STOP=1 -Atc 'select count(*) from auth.users')"

HISTORY_EXISTS="$(psql -X -v ON_ERROR_STOP=1 -Atc "select to_regclass('$HISTORY_TABLE') is not null")"
if [[ "$HISTORY_EXISTS" != 't' ]]; then
  # The Supabase CLI creates this metadata table on its first db push. This
  # guarded installer does direct psql application, so bootstrap the same
  # CLI-compatible shape only after target verification and a verified backup.
  psql -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);
commit;
SQL
fi

HISTORY_SHAPE="$(psql -X -v ON_ERROR_STOP=1 -Atc "
  select
    (select count(*) from information_schema.columns
      where table_schema='supabase_migrations' and table_name='schema_migrations'
        and ((column_name='version' and data_type='text')
          or (column_name='statements' and data_type='ARRAY')
          or (column_name='name' and data_type='text'))),
    exists(
      select 1 from pg_constraint constraint_row
      join pg_class table_row on table_row.oid=constraint_row.conrelid
      join pg_namespace schema_row on schema_row.oid=table_row.relnamespace
      join pg_attribute version_column on version_column.attrelid=table_row.oid and version_column.attname='version'
      where schema_row.nspname='supabase_migrations' and table_row.relname='schema_migrations'
        and constraint_row.contype='p' and constraint_row.conkey=array[version_column.attnum]::smallint[]
    )
")"
[[ "$HISTORY_SHAPE" == '3|t' ]] || fail 'Supabase migration history table shape is incompatible; stop for manual reconciliation.'

BASELINE_MARKER='00000000000000'
BASELINE_DONE="$(psql -X -v ON_ERROR_STOP=1 -Atc "select exists(select 1 from $HISTORY_TABLE where version='$BASELINE_MARKER')")"
if [[ "$BASELINE_DONE" != 't' ]]; then
  PROFILE_EXISTS="$(psql -X -v ON_ERROR_STOP=1 -Atc "select to_regclass('public.profiles') is not null")"
  [[ "$PROFILE_EXISTS" != 't' ]] || fail 'Profiles already exist without the baseline history marker; stop for manual history reconciliation.'
  psql -X -v ON_ERROR_STOP=1 -f "$BASELINE"
  psql -X -v ON_ERROR_STOP=1 -c "insert into $HISTORY_TABLE(version,name,statements) values ('$BASELINE_MARKER','bookourspace_baseline',array['$BASELINE'])"
fi

for file in "${MANIFEST_MIGRATIONS[@]}"; do
  filename="$(basename "$file" .sql)"
  version="${filename%%_*}"
  name="${filename#*_}"
  [[ "$version" =~ ^[0-9]{14}$ ]] || fail "Invalid migration version in $filename."
  already="$(psql -X -v ON_ERROR_STOP=1 -Atc "select exists(select 1 from $HISTORY_TABLE where version='$version')")"
  if [[ "$already" == 't' ]]; then
    tracked_name="$(psql -X -v ON_ERROR_STOP=1 -Atc "select name from $HISTORY_TABLE where version='$version'")"
    [[ "$tracked_name" == "$name" ]] || fail "History name mismatch for migration $version; reconcile before continuing."
    continue
  fi
  # Each migration contains its own transaction boundaries. Only record its
  # version after the SQL file returns successfully. If history insertion
  # fails, stop and reconcile the schema before retrying; never blindly replay.
  psql -X -v ON_ERROR_STOP=1 -f "$file"
  psql -X -v ON_ERROR_STOP=1 -c "insert into $HISTORY_TABLE(version,name,statements) values ('$version','$name',array['$filename'])"
done

# The baseline trigger handles future Auth inserts only. Backfill pre-existing
# Google Auth users now; SQL inserts only and ON CONFLICT preserves all rows.
psql -X -v ON_ERROR_STOP=1 -f "$PROFILE_BACKFILL"

TRACKED_COUNT="$(psql -X -v ON_ERROR_STOP=1 -Atc "select count(*) from $HISTORY_TABLE where version >= '$BASELINE_MARKER'")"
[[ "$TRACKED_COUNT" == "$EXPECTED_HISTORY_COUNT" ]] || fail "Expected baseline marker plus $COUNT manifest migrations in history; found $TRACKED_COUNT. Stop for history reconciliation."
AUTH_USERS_AFTER="$(psql -X -v ON_ERROR_STOP=1 -Atc 'select count(*) from auth.users')"
[[ "$AUTH_USERS_AFTER" == "$AUTH_USERS_BEFORE" ]] || fail 'Auth user count changed during installation; stop and use the verified recovery procedure.'
MISSING_GOOGLE_PROFILES="$(psql -X -v ON_ERROR_STOP=1 -Atc "
  select count(*) from auth.users users
  join auth.identities identities on identities.user_id=users.id and identities.provider='google'
  left join public.profiles profiles on profiles.id=users.id
  where profiles.id is null
")"
[[ "$MISSING_GOOGLE_PROFILES" == '0' ]] || fail "Profile backfill left $MISSING_GOOGLE_PROFILES Google Auth user(s) without profiles."
RLS_DISABLED="$(psql -X -v ON_ERROR_STOP=1 -Atc "select count(*) from pg_tables t join pg_class c on c.relname=t.tablename where t.schemaname='public' and not c.relrowsecurity")"
[[ "$RLS_DISABLED" == '0' ]] || fail "Post-migration verification found $RLS_DISABLED public tables without RLS. Restore/recover using the verified backup and investigate."
ROLE_RPC="$(psql -X -v ON_ERROR_STOP=1 -Atc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='manage_user_access'")"
[[ "$ROLE_RPC" == '1' ]] || fail 'Post-migration verification did not find the user role-management RPC.'

printf 'APPLY COMMANDS COMPLETED. History, RLS, role RPC, and backup checks passed. Verify Auth callback and six-module booking/payment smoke tests before release.\n'
