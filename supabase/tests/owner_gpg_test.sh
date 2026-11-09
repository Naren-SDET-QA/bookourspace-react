#!/usr/bin/env bash
# =============================================================================
# Owner GPG key round-trip test.
#
# Offline only. Encrypts a non-secret test string with the owner recipient,
# decrypts it into a temporary file, and compares SHA-256. It never prints key
# material, the keyring path's private contents, or any database credential.
#
# Exit: 0 = owner key round-trip verified
#       2 = BLOCKED: owner key/keyring not available (owner action)
#       5 = encryption/decryption failure
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
# shellcheck source=lib/bos_backup_crypto.sh
. "$REPO_ROOT/supabase/tests/lib/bos_backup_crypto.sh"

KEYRING="$(bos_crypto_keyring)"
if [ ! -d "$KEYRING" ]; then
  echo "BLOCKED: owner keyring $KEYRING is absent. Follow OWNER_GPG_KEY_SETUP.md; no encryption test was attempted." >&2
  exit 2
fi
if [ -z "${BOS_BACKUP_GPG_RECIPIENT:-}" ]; then
  echo 'BLOCKED: set BOS_BACKUP_GPG_RECIPIENT to the owner fingerprint. Follow OWNER_GPG_KEY_SETUP.md.' >&2
  exit 2
fi
if [ -z "$(bos_crypto_fingerprint)" ]; then
  echo 'BLOCKED: the owner recipient is not present in the owner keyring. No encryption test was attempted.' >&2
  exit 2
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/bos-owner-gpg.XXXXXX")" || exit 5
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"
bos_crypto_assert_separation "$TMP"
PLAIN="$TMP/roundtrip.txt"
ENC="$TMP/roundtrip.gpg"
printf 'BookOurSpace owner-key round-trip test; not a credential.\n' > "$PLAIN"
chmod 600 "$PLAIN"
EXPECTED="$(shasum -a 256 "$PLAIN" | cut -d' ' -f1)"

echo '=== owner key encryption/decryption ==='
bos_crypto_encrypt "$PLAIN" "$ENC" || exit 5
bos_crypto_verify "$ENC" || exit 5
bos_crypto_roundtrip "$ENC" "$EXPECTED" || exit 5

echo 'PASS: owner key encrypted, decrypted and reproduced the test checksum.'
echo 'PASS: no credential, key material or private-key path was printed.'
