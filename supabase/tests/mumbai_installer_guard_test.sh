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

if BOS_MUMBAI_APPLY_APPROVED='ezrxykyocgbolpaebnqx' \
   BOS_MUMBAI_CONFIRM_REF='ezrxykyocgbolpaebnqx' \
   bash "$INSTALLER" --apply >"$TMP/wrong-approval.out" 2>&1; then
  echo 'FAIL installer accepted Stockholm as the approved project id' >&2
  exit 1
fi
grep -q 'explicit approval' "$TMP/wrong-approval.out"

# Even with the exact Mumbai approval values, a database hostname identifying
# any other project is rejected before psql/pg_dump can connect or write.
if BOS_MUMBAI_APPLY_APPROVED="$EXPECTED" \
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
   BOS_MUMBAI_CONFIRM_REF="$EXPECTED" \
   BOS_MUMBAI_DATABASE_URL='postgresql://postgres.ezrxykyocgbolpaebnqx:not-a-secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres' \
   BOS_MUMBAI_BACKUP_PATH="$TMP/should-not-exist-pooler.dump" \
   bash "$INSTALLER" --apply >"$TMP/wrong-pooler-user.out" 2>&1; then
  echo 'FAIL installer accepted a pooler URL with a different project user' >&2
  exit 1
fi
grep -q 'does not identify the approved Mumbai direct endpoint or Mumbai session pooler' "$TMP/wrong-pooler-user.out"
[[ ! -e "$TMP/should-not-exist-pooler.dump" ]]

# A sandbox psql stub proves the exact approved pooler URL passes target
# validation without contacting a hosted database.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/psql" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
chmod +x "$TMP/bin/psql"
if BOS_MUMBAI_APPLY_APPROVED="$EXPECTED" \
   BOS_MUMBAI_CONFIRM_REF="$EXPECTED" \
   BOS_MUMBAI_DATABASE_URL="postgresql://postgres.$EXPECTED:not-a-secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres" \
   BOS_MUMBAI_BACKUP_PATH="$TMP/should-not-exist-accepted.dump" \
   PATH="$TMP/bin:$PATH" bash "$INSTALLER" --apply >"$TMP/session-shape.out" 2>&1; then
  echo 'FAIL sandbox psql unexpectedly reported a successful database connection' >&2
  exit 1
fi
grep -q 'Could not verify the selected target database connection' "$TMP/session-shape.out"
[[ ! -e "$TMP/should-not-exist-accepted.dump" ]]

echo 'PASS Mumbai installer plan and wrong-project guards (no hosted connection attempted)'
