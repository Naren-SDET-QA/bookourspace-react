#!/usr/bin/env bash
# =============================================================================
# Owner GPG key readiness check for BookOurSpace encrypted backups.
#
# Verifies, without ever printing private key material or a passphrase:
#   * the owner keyring exists, is owner-only, and sits outside the repository
#     and outside the backup destination tree,
#   * a public key exists and the recipient fingerprint resolves,
#   * the matching secret key is present (presence only, never contents),
#   * the key can actually encrypt (a real encryption of a throwaway file),
#   * decryption is exercised only when run from an interactive terminal, so the
#     passphrase is typed by the owner and never handled by a script.
#
# Usage:
#   bash supabase/tests/gpg_readiness.sh [fingerprint]
#
# The fingerprint may also come from BOS_BACKUP_GPG_RECIPIENT.
# The keyring comes from BOS_BACKUP_GNUPGHOME (default
# ~/.config/bookourspace/backup-gnupg), matching bos_backup_crypto.sh.
#
# Exit: 0 ready; 2 BLOCKED (keyring or key missing); 3 misconfigured.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
# shellcheck source=lib/bos_target_guard.sh
. "$REPO_ROOT/supabase/tests/lib/bos_target_guard.sh"
bos_load_target_config
# shellcheck source=lib/bos_backup_crypto.sh
. "$REPO_ROOT/supabase/tests/lib/bos_backup_crypto.sh"

RECIPIENT="${1:-${BOS_BACKUP_GPG_RECIPIENT:-}}"
KEYRING="$(bos_crypto_keyring)"
BACKUP_ROOT="${BOS_BACKUP_ROOT:-$HOME/BookOurSpace_Backups/react}"
FAILS=0
BLOCKED=0

ok()   { printf '  PASS     %s\n' "$1"; }
warn() { printf '  WARN     %s\n' "$1"; }
bad()  { printf '  FAIL     %s\n' "$1"; FAILS=$((FAILS + 1)); }
block(){ printf '  BLOCKED  %s\n' "$1"; BLOCKED=$((BLOCKED + 1)); }

echo "=== owner keyring: $KEYRING ==="

command -v gpg >/dev/null 2>&1 || { block "gpg is not installed"; echo "  verdict: BLOCKED"; exit 2; }

if [ ! -d "$KEYRING" ]; then
  block "keyring directory does not exist (create it, then generate the owner key)"
  echo "  verdict: BLOCKED"
  exit 2
fi
ok "keyring directory exists"

PERMS="$(stat -f '%Sp' "$KEYRING" 2>/dev/null || echo '?')"
case "$PERMS" in
  drwx------) ok "keyring permissions $PERMS (owner-only)" ;;
  *) bad "keyring permissions $PERMS (expected drwx------); run: chmod 700 '$KEYRING'" ;;
esac

# Key custody: must live outside the repository and the backup destination.
sep_out="$( ( bos_assert_keyring_separate "$KEYRING" "$BACKUP_ROOT" ) 2>&1 )"; sep_rc=$?
if [ "$sep_rc" -eq 0 ]; then
  ok "keyring is outside the repository and outside $BACKUP_ROOT"
else
  bad "keyring custody: $sep_out"
fi

PUB_COUNT="$(GNUPGHOME="$KEYRING" gpg --batch --with-colons --list-keys 2>/dev/null | grep -c '^pub:' || true)"
if [ "${PUB_COUNT:-0}" -eq 0 ]; then
  block "no public key in the owner keyring yet (generate it first)"
  echo "  verdict: BLOCKED"
  exit 2
fi
ok "public key present (${PUB_COUNT} key(s))"

if [ -z "$RECIPIENT" ]; then
  if [ "${PUB_COUNT:-0}" -eq 1 ]; then
    RECIPIENT="$(GNUPGHOME="$KEYRING" gpg --batch --with-colons --list-keys 2>/dev/null | awk -F: '/^fpr/{print $10; exit}')"
    ok "single key found; using recipient ${RECIPIENT}"
  else
    block "multiple keys present; pass the intended fingerprint as the first argument"
    echo "  verdict: BLOCKED"
    exit 2
  fi
else
  ok "recipient supplied: ${RECIPIENT}"
fi

FPR="$(GNUPGHOME="$KEYRING" gpg --batch --with-colons --list-keys "$RECIPIENT" 2>/dev/null | awk -F: '/^fpr/{print $10; exit}')"
if [ -z "$FPR" ]; then
  block "recipient ${RECIPIENT} is not present in the owner keyring"
  echo "  verdict: BLOCKED"
  exit 2
fi
ok "recipient resolves to fingerprint ${FPR}"
case "$FPR" in
  *[!0-9A-Fa-f]*) bad "fingerprint looks malformed: ${FPR}" ;;
  *) [ "${#FPR}" -ge 16 ] && ok "fingerprint length ${#FPR} (public identifier only)" || bad "fingerprint is suspiciously short" ;;
esac

if GNUPGHOME="$KEYRING" gpg --batch --with-colons --list-secret-keys "$FPR" 2>/dev/null | grep -q '^sec:'; then
  ok "matching secret key is present (contents never read or printed)"
else
  block "secret key for ${FPR} is not in this keyring (public key only?)"
fi

CAPS="$(GNUPGHOME="$KEYRING" gpg --batch --with-colons --list-keys "$FPR" 2>/dev/null | awk -F: '/^(pub|sub):/{print $12}' | tr '\n' ' ')"
case " $CAPS " in
  *e*) ok "key advertises encryption capability ($(printf '%s' "$CAPS" | tr -s ' '))" ;;
  *) bad "key does not advertise encryption capability; encryption would fail" ;;
esac

EXPIRY="$(GNUPGHOME="$KEYRING" gpg --batch --with-colons --list-keys "$FPR" 2>/dev/null | awk -F: '/^pub:/{print $7; exit}')"
if [ -n "$EXPIRY" ] && [ "$EXPIRY" != "0" ]; then
  warn "key expires $(date -r "$EXPIRY" -u +%Y-%m-%d 2>/dev/null || echo "$EXPIRY"); plan rotation before then"
else
  ok "key does not expire"
fi

echo "=== encryption test (public-key only; no passphrase needed) ==="
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bos-gpg-ready.XXXXXX")" || exit 3
trap 'rm -rf "$TMP"' EXIT
printf 'bookourspace-owner-key-roundtrip\n' > "$TMP/plain.txt"
if GNUPGHOME="$KEYRING" gpg --batch --yes --trust-model always --recipient "$FPR" \
     --output "$TMP/cipher.gpg" --encrypt "$TMP/plain.txt" 2>/dev/null; then
  if [ -s "$TMP/cipher.gpg" ]; then
    ok "encryption to ${FPR} produced a ciphertext ($(wc -c < "$TMP/cipher.gpg" | tr -d ' ') bytes)"
  else
    bad "encryption produced no output"
  fi
else
  bad "encryption to ${FPR} failed"
fi

echo "=== decryption round-trip ==="
if [ -t 0 ] && [ -t 1 ]; then
  if GNUPGHOME="$KEYRING" gpg --yes --output "$TMP/decrypted.txt" --decrypt "$TMP/cipher.gpg" 2>/dev/null \
     && cmp -s "$TMP/plain.txt" "$TMP/decrypted.txt"; then
    ok "decryption round-trip reproduced the plaintext"
  else
    bad "decryption round-trip failed (wrong passphrase or key mismatch)"
  fi
else
  warn "SKIPPED: not an interactive terminal; run this script in your own shell to exercise decryption (pinentry will prompt for your passphrase)"
fi

echo "=== verdict ==="
if [ "$FAILS" -gt 0 ]; then
  echo "  NOT READY — ${FAILS} failure(s), ${BLOCKED} blocked"
  exit 3
fi
if [ "$BLOCKED" -gt 0 ]; then
  echo "  BLOCKED — ${BLOCKED} item(s) still missing"
  exit 2
fi
echo "  READY — owner key can encrypt; decryption verified when run interactively"
exit 0
