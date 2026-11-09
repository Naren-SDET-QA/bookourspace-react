#!/usr/bin/env bash
# =============================================================================
# Backup guard regression tests — offline only.
#
# Proves the hosted backup paths refuse to run without an owner encryption key,
# before any database connection/dump can occur; proves the archive verifier
# rejects plaintext when strict encryption is requested; proves the Mumbai
# connection helper contains no dump path. Dummy URLs contain no real secret.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bos-backup-guard.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0
pass() { printf '  PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

POOLER='postgresql://postgres.obkfgxjzlscungkhbyvq:not-a-secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require'

echo '=== 1. dev/production backup refuse without encryption before connecting ==='
set +e
out="$(BOS_BACKUP_AUTHORIZED=backup-only BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq \
  BOS_BACKUP_DATABASE_URL="$POOLER" BOS_BACKUP_GPG_RECIPIENT= \
  bash supabase/tests/run_dev_backup.sh 2>&1)"
rc=$?
set -e
if [ "$rc" -eq 5 ] && printf '%s' "$out" | grep -q 'encrypted OpenPGP backup is required'; then
  pass 'dev hosted backup refuses missing GPG recipient before dump'
else
  fail "dev backup refusal (exit $rc): $(printf '%s' "$out" | tail -2)"
fi

set +e
out="$(BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq \
  BOS_BACKUP_GPG_RECIPIENT= BOS_PRODUCTION_DATABASE_URL="$POOLER" \
  bash supabase/tests/backup_production_readonly.sh "$TMP/archive" 2>&1)"
rc=$?
set -e
if [ "$rc" -eq 5 ] && printf '%s' "$out" | grep -q 'encrypted OpenPGP backup is required'; then
  pass 'production backup refuses missing GPG recipient before dump'
else
  fail "production backup refusal (exit $rc): $(printf '%s' "$out" | tail -2)"
fi
[[ ! -e "$TMP/archive" ]] && pass 'production refusal created no archive directory' || fail 'archive directory was created before encryption guard'

echo '=== 2. strict archive verifier rejects plaintext ==='
mkdir -p "$TMP/plain" && chmod 700 "$TMP/plain"
dd if=/dev/zero of="$TMP/plain/backup.dump" bs=2048 count=1 2>/dev/null
printf 'select 1;\n' > "$TMP/plain/schema.sql"
printf 'toc\n' > "$TMP/plain/toc.txt"
printf 'identity=test\nsession_read_only=on\nproject_ref=obkfgxjzlscungkhbyvq\n' > "$TMP/plain/identity-preflight.txt"
printf 'restored_public_tables=1\n' > "$TMP/plain/restore-verification.txt"
printf 'sha\n' > "$TMP/plain/SHA256SUMS"
set +e
out="$(bash supabase/tests/verify_backup_archive.sh "$TMP/plain" obkfgxjzlscungkhbyvq --require-encryption 2>&1)"
rc=$?
set -e
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'plaintext dump is forbidden'; then
  pass 'strict verifier rejects a plaintext hosted archive'
else
  fail 'strict verifier accepted plaintext or missed the failure'
fi

echo '=== 3. Mumbai connection helper has no dump path ==='
if grep -Eq 'pg_dump|pg_restore|backup\.dump' scripts/mumbai_connection_backup_preflight.mjs; then
  fail 'Mumbai connection helper still contains an unencrypted dump path'
else
  pass 'Mumbai connection helper is read-only (no pg_dump/pg_restore)'
fi

echo
echo "  passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo 'ALL BACKUP GUARD TESTS PASSED (no hosted connection was attempted)'
