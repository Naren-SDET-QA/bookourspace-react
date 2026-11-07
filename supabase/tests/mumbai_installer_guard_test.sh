#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALLER="$ROOT/supabase/install_mumbai_migrations.sh"
EXPECTED='obkfgxjzlscungkhbyvq'
EXPECTED_COUNT="$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).migrations.length)' "$ROOT/supabase/MIGRATION_MANIFEST.json")"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bos-mumbai-guard.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

bash "$INSTALLER" --plan >"$TMP/plan.out"
grep -q "target project : $EXPECTED" "$TMP/plan.out"
grep -q "migration files: $EXPECTED_COUNT (manifest order; baseline marker + migration history entries: $((EXPECTED_COUNT + 1)))" "$TMP/plan.out"
grep -q 'profile backfill: .*separate approval required' "$TMP/plan.out"
node - "$TMP/plan.out" "$ROOT/supabase/MIGRATION_MANIFEST.json" <<'NODE'
const fs = require('node:fs');
const plan = fs.readFileSync(process.argv[2], 'utf8');
const manifest = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const listed = [...plan.matchAll(/^\d+\. (supabase\/migrations\/[^\n]+)$/gm)].map((m) => m[1]);
const expected = manifest.migrations.map((m) => m.file);
if (JSON.stringify(listed) !== JSON.stringify(expected)) {
  console.error('FAIL installer plan order differs from migration manifest');
  process.exit(1);
}
NODE
grep -q 'psql -X -v ON_ERROR_STOP=1 --single-transaction -f "$file"' "$INSTALLER"
grep -q 'Migration has an unmatched explicit transaction boundary' "$INSTALLER"
grep -q 'bos_load_target_config' "$INSTALLER"
grep -q 'bos_require_recovery_identity' "$INSTALLER"
grep -q '\[--plan|--backup-only|--apply\]' "$INSTALLER"
node - "$ROOT/supabase/migrations" "$EXPECTED_COUNT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
const expectedCount = Number(process.argv[3]);
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
const pending = new Set([
  '20261105160000_media_published_listing_visibility.sql',
  '20261105163924_profile_media_and_account_closure.sql',
  '20261105170000_stay_discovery_filters.sql',
  '20261105180000_stay_host_inventory_controls.sql',
  '20261105210000_stay_requests_fees_profiles.sql',
  '20261105220000_restore_pg_hostel_property_type.sql',
  '20261106010000_stay_razorpay_and_verified_upi.sql',
  '20261106120000_stay_owner_onboarding_approval.sql',
  '20261106130000_stay_booking_guest_contacts.sql',
]);
if (pending.size !== 9) throw new Error(`expected 9 pending migration files; found ${pending.size}`);
if (files.length !== expectedCount) throw new Error(`expected ${expectedCount} manifest migration files; found ${files.length}`);
for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  const hasBegin = /^\s*begin\s*;\s*$/im.test(sql);
  const hasCommit = /^\s*commit\s*;\s*$/im.test(sql);
  if (hasBegin !== hasCommit) throw new Error(`unbalanced migration transaction markers: ${file}`);
  if (pending.has(file) && !hasBegin) throw new Error(`pending migration lacks explicit transaction boundary: ${file}`);
  if (!hasBegin && /create\s+(unique\s+)?index\s+concurrently/i.test(sql)) throw new Error(`unwrapped concurrent index migration: ${file}`);
}
console.log('PASS migration transaction inventory: all pending Mumbai migrations are wrapped; legacy unwrapped files use installer-owned transactions');
NODE

if BOS_MUMBAI_APPLY_APPROVED='ezrxykyocgbolpaebnqx' \
   BOS_MUMBAI_CONFIRM_REF='ezrxykyocgbolpaebnqx' \
   bash "$INSTALLER" --apply >"$TMP/wrong-approval.out" 2>&1; then
  echo 'FAIL installer accepted Stockholm as the approved project id' >&2
  exit 1
fi
grep -q 'explicit approval' "$TMP/wrong-approval.out"

# Profile backfill is independently gated before any connection attempt.
if BOS_MUMBAI_APPLY_APPROVED="$EXPECTED" \
   BOS_MUMBAI_CONFIRM_REF="$EXPECTED" \
   BOS_MUMBAI_DATABASE_URL='postgresql://not-a-secret@example.invalid:5432/postgres?sslmode=require' \
   bash "$INSTALLER" --apply >"$TMP/missing-backfill-approval.out" 2>&1; then
  echo 'FAIL installer accepted migration approval without separate profile-backfill approval' >&2
  exit 1
fi
grep -q 'profile backfill requires separate explicit approval' "$TMP/missing-backfill-approval.out"

# Even with the exact Mumbai approval values, a database hostname identifying
# any other project is rejected before psql/pg_dump can connect or write.
if BOS_MUMBAI_APPLY_APPROVED="$EXPECTED" \
   BOS_MUMBAI_PROFILE_BACKFILL_APPROVED="$EXPECTED" \
   BOS_MUMBAI_CONFIRM_REF="$EXPECTED" \
   BOS_MUMBAI_DATABASE_URL='postgresql://not-a-secret@example.invalid:5432/postgres?sslmode=require' \
   BOS_MUMBAI_BACKUP_PATH="$TMP/should-not-exist.dump" \
   bash "$INSTALLER" --apply >"$TMP/wrong-host.out" 2>&1; then
  echo 'FAIL installer accepted a non-Mumbai database hostname' >&2
  exit 1
fi
grep -q 'does not identify the approved Mumbai direct endpoint or Mumbai session pooler' "$TMP/wrong-host.out"
[[ ! -e "$TMP/should-not-exist.dump" ]]

# Wrong project-specific user on an otherwise plausible Mumbai-region pooler is rejected.
if BOS_MUMBAI_APPLY_APPROVED="$EXPECTED" \
   BOS_MUMBAI_PROFILE_BACKFILL_APPROVED="$EXPECTED" \
   BOS_MUMBAI_CONFIRM_REF="$EXPECTED" \
   BOS_MUMBAI_DATABASE_URL='postgresql://postgres.ezrxykyocgbolpaebnqx:not-a-secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres' \
   BOS_MUMBAI_BACKUP_PATH="$TMP/should-not-exist-pooler.dump" \
   bash "$INSTALLER" --apply >"$TMP/wrong-pooler-user.out" 2>&1; then
  echo 'FAIL installer accepted a pooler URL with a different project user' >&2
  exit 1
fi
grep -q 'does not identify the approved Mumbai direct endpoint or Mumbai session pooler' "$TMP/wrong-pooler-user.out"
[[ ! -e "$TMP/should-not-exist-pooler.dump" ]]

# The backup skip flag is prohibited even when it names the correct project:
# this installer can only target the hosted Mumbai endpoints.
if BOS_MUMBAI_APPLY_APPROVED="$EXPECTED" \
   BOS_MUMBAI_CONFIRM_REF="$EXPECTED" \
   BOS_MUMBAI_PROFILE_BACKFILL_APPROVED="$EXPECTED" \
   BOS_MUMBAI_SKIP_BACKUP_APPROVED="$EXPECTED" \
   BOS_MUMBAI_DATABASE_URL='postgresql://postgres@db.obkfgxjzlscungkhbyvq.supabase.co:5432/postgres' \
   bash "$INSTALLER" --apply >"$TMP/skip-backup.out" 2>&1; then
  echo 'FAIL installer accepted a backup skip flag' >&2
  exit 1
fi
grep -q 'Pre-change backup cannot be skipped for a Mumbai apply' "$TMP/skip-backup.out"

if BOS_MUMBAI_APPLY_APPROVED="$EXPECTED" \
   BOS_MUMBAI_CONFIRM_REF="$EXPECTED" \
   BOS_MUMBAI_PROFILE_BACKFILL_APPROVED="$EXPECTED" \
   BOS_MUMBAI_SKIP_PROFILE_BACKFILL_APPROVED="$EXPECTED" \
   BOS_MUMBAI_DATABASE_URL='postgresql://postgres@db.obkfgxjzlscungkhbyvq.supabase.co:5432/postgres' \
   bash "$INSTALLER" --apply >"$TMP/ambiguous-backfill.out" 2>&1; then
  echo 'FAIL installer accepted both backfill and skip-backfill approvals' >&2
  exit 1
fi
grep -q 'refusing an ambiguous backfill decision' "$TMP/ambiguous-backfill.out"

! grep -q 'SKIP_BACKUP' "$INSTALLER" || grep -q 'Pre-change backup cannot be skipped' "$INSTALLER"
BACKUP_LINE="$(grep -n 'Verified encrypted pre-change backup:' "$INSTALLER" | cut -d: -f1)"
BASELINE_LINE="$(grep -n 'Apply the baseline atomically' "$INSTALLER" | cut -d: -f1)"
[[ -n "$BACKUP_LINE" && -n "$BASELINE_LINE" && "$BACKUP_LINE" -lt "$BASELINE_LINE" ]]

# A sandbox psql stub proves the exact approved pooler URL passes target
# validation without contacting a hosted database.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/psql" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
chmod +x "$TMP/bin/psql"
if BOS_MUMBAI_APPLY_APPROVED="$EXPECTED" \
   BOS_MUMBAI_PROFILE_BACKFILL_APPROVED="$EXPECTED" \
   BOS_MUMBAI_CONFIRM_REF="$EXPECTED" \
   BOS_MUMBAI_DATABASE_URL="postgresql://postgres.$EXPECTED:not-a-secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" \
   BOS_MUMBAI_BACKUP_PATH="$TMP/should-not-exist-accepted.dump" \
   PATH="$TMP/bin:$PATH" bash "$INSTALLER" --apply >"$TMP/session-shape.out" 2>&1; then
  echo 'FAIL sandbox psql unexpectedly reported a successful database connection' >&2
  exit 1
fi
grep -q 'Could not verify the selected target database connection' "$TMP/session-shape.out"
[[ ! -e "$TMP/should-not-exist-accepted.dump" ]]

# Backup-only mode must reject any override of the pinned owner recovery key
# before reading a connection credential or creating the requested archive.
for spec in \
  'BOS_BACKUP_GNUPGHOME|/tmp/wrong-keyring|GPG keyring override differs' \
  'BOS_BACKUP_GPG_RECIPIENT|0000000000000000000000000000000000000000|GPG fingerprint override differs' \
  'BOS_BACKUP_GPG_PASSPHRASE_SERVICE|bos-backup-gpg-passphrase|GPG Keychain service override differs'
do
  IFS='|' read -r key value message <<<"$spec"
  if env "$key=$value" BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM="$EXPECTED" \
     BOS_MUMBAI_BACKUP_DIR="$TMP/must-not-be-created-$key" \
     bash "$INSTALLER" --backup-only >"$TMP/recovery-$key.out" 2>&1; then
    echo "FAIL installer accepted mismatched $key" >&2
    exit 1
  fi
  grep -q "$message" "$TMP/recovery-$key.out"
  [[ ! -e "$TMP/must-not-be-created-$key" ]]
done

if BOS_MUMBAI_APPLY_APPROVED="$EXPECTED" BOS_MUMBAI_CONFIRM_REF="$EXPECTED" \
   BOS_MUMBAI_PROFILE_BACKFILL_APPROVED="$EXPECTED" \
   BOS_BACKUP_GPG_PASSPHRASE_SERVICE=bos-backup-gpg-passphrase \
   BOS_MUMBAI_DATABASE_URL='postgresql://not-a-secret@example.invalid:5432/postgres' \
   bash "$INSTALLER" --apply >"$TMP/apply-wrong-keychain-service.out" 2>&1; then
  echo 'FAIL apply mode accepted the retired GPG Keychain service' >&2
  exit 1
fi
grep -q 'GPG Keychain service override differs from the approved recovery item' "$TMP/apply-wrong-keychain-service.out"

if BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM="$EXPECTED" \
   bash "$INSTALLER" --backup-only >"$TMP/missing-backup-path.out" 2>&1; then
  echo 'FAIL backup-only mode accepted an absent, unapproved backup path' >&2
  exit 1
fi
grep -q 'BOS_MUMBAI_BACKUP_DIR is required' "$TMP/missing-backup-path.out"

echo 'PASS Mumbai installer plan and wrong-project guards (no hosted connection attempted)'
