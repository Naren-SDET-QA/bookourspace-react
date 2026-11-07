#!/usr/bin/env bash
# =============================================================================
# Retired temporary-credential helper regression.
#
# Proves the helper and wrapper:
#   * exit 17 without prompting, reading or writing .env,
#   * create no snapshot under ~/BookOurSpace_Backups/env,
#   * contain no filesystem/process/dump code capable of persisting a secret.
# Offline only; no hosted connection and no secret is printed.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bos-retired-cred.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0
pass() { printf '  PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

ENV_FILE="$REPO_ROOT/.env"
BEFORE_HASH="absent"
[ -f "$ENV_FILE" ] && BEFORE_HASH="$(shasum -a 256 "$ENV_FILE" | cut -d' ' -f1)"
BEFORE_SNAPSHOTS="$(find "$HOME/BookOurSpace_Backups/env" -type f 2>/dev/null | wc -l | tr -d ' ')"

set +e
OUT="$(BOS_MUMBAI_TEMP_DB_PASSWORD='not-a-real-secret' node scripts/mumbai_temp_credential_preflight.mjs 2>&1)"
RC=$?
set -e
if [ "$RC" -eq 17 ] && printf '%s' "$OUT" | grep -q 'is retired'; then
  pass 'mjs helper exits 17 as retired'
else
  fail "mjs helper exit=$RC"
fi
if printf '%s' "$OUT" | grep -q 'BOS_MUMBAI_TEMP_DB_PASSWORD'; then
  fail 'mjs helper echoed the supplied secret variable name'
else
  pass 'mjs helper does not echo credential input'
fi

set +e
OUT2="$(bash scripts/mumbai_temp_credential_preflight.sh 2>&1)"
RC2=$?
set -e
if [ "$RC2" -eq 17 ] && printf '%s' "$OUT2" | grep -q 'is retired'; then
  pass 'wrapper exits 17 without prompting'
else
  fail "wrapper exit=$RC2"
fi

AFTER_HASH="absent"
[ -f "$ENV_FILE" ] && AFTER_HASH="$(shasum -a 256 "$ENV_FILE" | cut -d' ' -f1)"
[ "$BEFORE_HASH" = "$AFTER_HASH" ] && pass '.env was not modified' || fail '.env changed during retired helper test'
AFTER_SNAPSHOTS="$(find "$HOME/BookOurSpace_Backups/env" -type f 2>/dev/null | wc -l | tr -d ' ')"
[ "$BEFORE_SNAPSHOTS" = "$AFTER_SNAPSHOTS" ] && pass 'no new env snapshot was created' || fail 'an env snapshot was created'

if grep -Eq 'readFileSync|writeFileSync|openSync|renameSync|unlinkSync|spawnSync|pg_dump' scripts/mumbai_temp_credential_preflight.mjs; then
  fail 'retired helper still contains file/process code'
else
  pass 'retired helper has no file or process API'
fi

echo
echo "  passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo 'TEMP CREDENTIAL HELPER RETIREMENT TESTS PASSED'
