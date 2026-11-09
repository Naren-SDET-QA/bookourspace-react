#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C LANG=C
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bos-backup-keychain.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
cat > "$TMP/bin/security" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == find-generic-password && "$2" == -s && "$3" == bos-production-backup && "$4" == -w ]]
printf '%s\n' 'postgresql://postgres.obkfgxjzlscungkhbyvq:fixture-secret-not-for-output@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require'
SH
chmod 700 "$TMP/bin/security"
export PATH="$TMP/bin:$PATH"
export BOS_BACKUP_KEYCHAIN_SERVICE=bos-production-backup
export BOS_BACKUP_GUARD_ONLY=1

echo '=== libpq credential preparation keeps the URI password out of the DSN ==='
. "$ROOT/supabase/tests/lib/bos_target_guard.sh"
bos_load_target_config
bos_prepare_libpq_auth 'postgresql://postgres.obkfgxjzlscungkhbyvq:helper-secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require&password=query-secret'
if [[ "$BOS_LIBPQ_DSN" == *helper-secret* || "$BOS_LIBPQ_DSN" == *query-secret* ]] \
   || [[ "$PGPASSWORD" != helper-secret ]] || [[ "$BOS_LIBPQ_DSN" != *'sslmode=require'* ]]; then
  echo 'FAIL password-free libpq DSN or memory-only password was not prepared' >&2
  exit 1
fi
unset PGPASSWORD BOS_LIBPQ_DSN
echo 'PASS URI/query passwords removed from DSN; password held only in process memory'

echo '=== no approval must stop before reading Keychain ==='
set +e
out="$(env -u BOS_BACKUP_AUTHORIZED -u BOS_DEV_CONFIRM -u BOS_PROD_REF_CONFIRM \
  -u BOS_BACKUP_DATABASE_URL -u BOS_DEV_DATABASE_URL -u BOS_PRODUCTION_DATABASE_URL \
  bash "$ROOT/supabase/tests/run_dev_backup.sh" 2>&1)"
rc=$?
set -e
if [[ "$rc" -eq 3 ]] && grep -q 'missing approval' <<<"$out"; then
  echo 'PASS dev backup authorization precedes Keychain read'
else
  echo 'FAIL dev backup did not stop before credential access' >&2
  exit 1
fi

echo '=== authorized guard-only runs load a target-checked credential in memory ==='
for kind in dev production; do
  if [[ "$kind" == dev ]]; then
    out="$(env -u BOS_BACKUP_DATABASE_URL -u BOS_DEV_DATABASE_URL \
      BOS_BACKUP_AUTHORIZED=backup-only BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq \
      bash "$ROOT/supabase/tests/run_dev_backup.sh" 2>&1)"
  else
    out="$(env -u BOS_PRODUCTION_DATABASE_URL \
      BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq \
      bash "$ROOT/supabase/tests/backup_production_readonly.sh" "$TMP/archive" 2>&1)"
  fi
  if grep -q 'GUARDS PASS: Keychain/environment credential loaded in memory' <<<"$out" \
     && ! grep -q 'fixture-secret-not-for-output' <<<"$out" \
     && ! grep -q 'postgresql://' <<<"$out"; then
    echo "PASS $kind backup loads Keychain credential without logging URI or password; no connection attempted"
  else
    echo "FAIL $kind backup Keychain guard output was unsafe or rejected the approved target" >&2
    exit 1
  fi
done

[[ ! -e "$TMP/archive" ]] || { echo 'FAIL guard-only created an archive directory' >&2; exit 1; }
echo 'ALL KEYCHAIN BACKUP GUARD TESTS PASSED'
