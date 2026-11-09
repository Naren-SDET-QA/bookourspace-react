#!/usr/bin/env bash
# =============================================================================
# Dry-run matrix for the approved-target guard.
#
# Proves, without any network connection, that the shared guard accepts only the
# approved React target and refuses every stale, legacy, mismatched or
# unapproved variant with exit 3 and a targeted message.
#
# Usage: bash supabase/tests/run_target_guard_dryrun.sh
# Exit:  0 all cases behaved as specified, 1 otherwise
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
GUARD="supabase/tests/lib/bos_target_guard.sh"
PASS=0
FAIL=0

pass() { printf '  PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

probe() { # snippet -> stdout+stderr, exit code in $?
  bash -c "set -uo pipefail; cd '$REPO_ROOT'; . '$GUARD'; bos_load_target_config; $1" 2>&1
}

expect_ok() { # label snippet
  local out rc
  out="$(probe "$2")"; rc=$?
  if [ "$rc" -eq 0 ]; then pass "$1"; else fail "$1 (exit $rc)"; printf '        %s\n' "$out" | tail -2; fi
}

expect_refusal() { # label needle snippet
  local out rc
  out="$(probe "$3")"; rc=$?
  if [ "$rc" -ne 3 ]; then fail "$1 (expected exit 3, got $rc)"; printf '        %s\n' "$out" | tail -2; return; fi
  case "$out" in
    *"$2"*) pass "$1" ;;
    *) fail "$1 (message missing: $2)"; printf '        %s\n' "$out" | tail -2 ;;
  esac
}

echo "=== 1. target profile ==="
REF="$(probe 'printf "%s" "$BOS_APPROVED_REF"')"
[ "$REF" = "obkfgxjzlscungkhbyvq" ] && pass "approved ref is obkfgxjzlscungkhbyvq" || fail "approved ref is '$REF'"
PROF="$(probe 'printf "%s" "$BOS_TARGET_PROFILE"')"
[ "$PROF" = "react" ] && pass "profile is react" || fail "profile is '$PROF'"
REGION="$(probe 'printf "%s/%s" "$BOS_REGION" "$BOS_POOLER_HOST"')"
[ "$REGION" = "ap-south-1/aws-0-ap-south-1.pooler.supabase.com" ] && pass "region and pooler host match ap-south-1" || fail "region/pooler: $REGION"
RECOVERY="$(probe 'printf "%s|%s|%s" "$BOS_BACKUP_GNUPGHOME" "$BOS_BACKUP_GPG_RECIPIENT" "$BOS_BACKUP_GPG_PASSPHRASE_SERVICE"')"
EXPECTED_RECOVERY='/Users/aa/.config/bookourspace/backup-gnupg-recovery-20261106|E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A|bos-backup-gpg-passphrase-recovery-20261106'
[ "$RECOVERY" = "$EXPECTED_RECOVERY" ] && pass "canonical Mumbai backup profile loads recovery keyring, fingerprint and Keychain service" || fail "unexpected recovery defaults"

echo "=== 2. approved connections accepted ==="
expect_ok "session pooler, correct tenant, port 5432, sslmode=require" \
  'bos_assert_connection "postgresql://postgres.obkfgxjzlscungkhbyvq@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"'
expect_ok "direct connection, user postgres" \
  'bos_assert_connection "postgresql://postgres@db.obkfgxjzlscungkhbyvq.supabase.co:5432/postgres?sslmode=require"'

echo "=== 3. stale and legacy refs refused by name ==="
expect_refusal "stale Mumbai ref (sfoizxarbljhldmkgsma) refused" "STALE Mumbai project sfoizxarbljhldmkgsma" \
  'bos_assert_connection "postgresql://postgres.sfoizxarbljhldmkgsma@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"'
expect_refusal "stale direct host refused" "STALE Mumbai project sfoizxarbljhldmkgsma" \
  'bos_assert_connection "postgresql://postgres@db.sfoizxarbljhldmkgsma.supabase.co:5432/postgres"'
expect_refusal "legacy Stockholm ref refused" "LEGACY Stockholm project ezrxykyocgbolpaebnqx" \
  'bos_assert_connection "postgresql://postgres.ezrxykyocgbolpaebnqx@aws-0-eu-north-1.pooler.supabase.com:5432/postgres"'

echo "=== 4. mismatched hosts and tenants refused ==="
expect_refusal "unknown host refused" "host does not match the approved React target" \
  'bos_assert_connection "postgresql://postgres.obkfgxjzlscungkhbyvq@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"'
expect_refusal "pooler URL with no project ref anywhere refused" "connection must name exactly obkfgxjzlscungkhbyvq" \
  'bos_assert_connection "postgresql://postgres@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"'
expect_refusal "pooler with misplaced tenant refused" "pooler username must be exactly postgres.obkfgxjzlscungkhbyvq" \
  'bos_assert_connection "postgresql://obkfgxjzlscungkhbyvq.postgres@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"'
expect_refusal "direct host with tenant username refused" "direct connection username must be exactly postgres" \
  'bos_assert_connection "postgresql://postgres.obkfgxjzlscungkhbyvq@db.obkfgxjzlscungkhbyvq.supabase.co:5432/postgres"'
expect_refusal "transaction-mode port 6543 refused" "session pooler requires port 5432" \
  'bos_assert_connection "postgresql://postgres.obkfgxjzlscungkhbyvq@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"'
expect_refusal "wrong database name refused" "database must be" \
  'bos_assert_connection "postgresql://postgres.obkfgxjzlscungkhbyvq@aws-0-ap-south-1.pooler.supabase.com:5432/otherdb"'
expect_refusal "sslmode=disable refused" "sslmode must be require" \
  'bos_assert_connection "postgresql://postgres.obkfgxjzlscungkhbyvq@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=disable"'
expect_refusal "ref that is not the approved one refused" "must name exactly obkfgxjzlscungkhbyvq" \
  'bos_assert_connection "postgresql://postgres.abcdefghijklmnopqrst@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"'

echo "=== 5. approval gate ==="
expect_refusal "missing approval refused" "missing approval" \
  'unset BOS_BACKUP_AUTHORIZED; bos_require_approval'
expect_ok "explicit approval accepted" 'BOS_BACKUP_AUTHORIZED=backup-only bos_require_approval'
expect_refusal "wrong ref confirmation refused" "BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq" \
  'bos_require_ref_confirmation "ezrxykyocgbolpaebnqx"'

echo "=== 6. URI inside a password variable ==="
expect_refusal "URI in a password variable refused" "holds a PostgreSQL URI" \
  'bos_assert_password_is_bare MUMBAI_DB_PASSWORD "postgresql://postgres:x@db.obkfgxjzlscungkhbyvq.supabase.co/postgres"'
expect_ok "bare password value accepted" 'bos_assert_password_is_bare MUMBAI_DB_PASSWORD "not-a-uri-value"'

echo "=== 6b. pinned recovery identity ==="
expect_refusal "wrong recovery keyring refused" "keyring override differs from the approved recovery keyring" \
  'BOS_BACKUP_GNUPGHOME=/tmp/wrong-keyring bos_require_recovery_identity'
expect_refusal "wrong recovery fingerprint refused" "fingerprint override differs from the approved recovery key" \
  'BOS_BACKUP_GPG_RECIPIENT=0000000000000000000000000000000000000000 bos_require_recovery_identity'
expect_refusal "wrong recovery Keychain service refused" "Keychain service override differs from the approved recovery item" \
  'BOS_BACKUP_GPG_PASSPHRASE_SERVICE=bos-backup-gpg-passphrase bos_require_recovery_identity'

echo "=== 7. keyring custody ==="
. "$GUARD"
bos_load_target_config
expect_refusal "keyring inside the archive dir refused" "must not live inside the backup destination" \
  "bos_assert_keyring_separate \"$HOME/BookOurSpace_Backups/react/x\" \"$HOME/BookOurSpace_Backups/react\""
expect_refusal "keyring inside the repository refused" "must not live inside the repository" \
  "bos_assert_keyring_separate \"$REPO_ROOT/.keys\" \"$HOME/BookOurSpace_Backups/react\""
expect_ok "external keyring accepted" \
  "bos_assert_keyring_separate \"$HOME/.config/bookourspace/backup-gnupg\" \"$HOME/BookOurSpace_Backups/react\""

echo "=== verdict ==="
echo "  passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo "  ALL GUARD CASES PASSED (no connection was attempted)"
