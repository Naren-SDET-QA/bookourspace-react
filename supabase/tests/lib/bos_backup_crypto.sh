#!/usr/bin/env bash
# =============================================================================
# Owner-controlled backup encryption helpers.
#
# Source this file; do not execute it.
#
#   . supabase/tests/lib/bos_backup_crypto.sh
#   bos_crypto_assert_separation "$ARCHIVE_DIR"
#   bos_crypto_encrypt archive/backup.dump archive/backup.dump.gpg
#   bos_crypto_roundtrip archive/backup.dump.gpg "$EXPECTED_SHA256"
#
# Key custody rules enforced here:
#   * the keyring lives OUTSIDE the backup destination and outside the repo,
#   * the recipient fingerprint must exist in that keyring,
#   * the private key is never exported, copied or printed,
#   * encryption refuses to run when no owner recipient is configured.
#
# Nothing in this file prints key material or plaintext.
# =============================================================================

[ -n "${BOS_BACKUP_CRYPTO_LOADED:-}" ] && return 0
BOS_BACKUP_CRYPTO_LOADED=1

bos_crypto_die() { printf '%s\n' "$*" >&2; exit 5; }

# This library must not depend on the target guard being sourced first.
BOS_CRYPTO_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

bos_crypto_keyring() {
  printf '%s' "${BOS_BACKUP_GNUPGHOME:-$HOME/.config/bookourspace/backup-gnupg}"
}

bos_crypto_require_recipient() {
  [ -n "${BOS_BACKUP_GPG_RECIPIENT:-}" ] \
    || bos_crypto_die "REFUSED: BOS_BACKUP_GPG_RECIPIENT is not set. Create the owner key first (see BACKUP_TARGET_HARDENING.md, owner action 2)."
  [ -d "$(bos_crypto_keyring)" ] \
    || bos_crypto_die "REFUSED: keyring $(bos_crypto_keyring) does not exist."
}

# Refuse a keyring that would be archived or committed alongside the data.
bos_crypto_assert_separation() { # archive_dir
  local archive_dir="${1:-}" keyring
  [ -n "$archive_dir" ] || bos_crypto_die "REFUSED: archive directory is not set."
  keyring="$(bos_crypto_keyring)"
  local kr ar
  kr="$(cd "$keyring" 2>/dev/null && pwd -P || printf '%s' "$keyring")"
  ar="$(cd "$archive_dir" 2>/dev/null && pwd -P || printf '%s' "$archive_dir")"
  case "$kr" in
    "$ar"|"$ar"/*) bos_crypto_die "REFUSED: the keyring must not live inside the archive directory." ;;
  esac
  case "$kr" in
    "$HOME/BookOurSpace_Backups"|"$HOME/BookOurSpace_Backups"/*)
      bos_crypto_die "REFUSED: the keyring must not live inside the backup destination tree." ;;
  esac
  case "$ar" in
    "$kr"|"$kr"/*) bos_crypto_die "REFUSED: the archive must not live inside the keyring." ;;
  esac
  case "$kr" in
    "$BOS_CRYPTO_REPO_ROOT"|"$BOS_CRYPTO_REPO_ROOT"/*)
      bos_crypto_die "REFUSED: the keyring must not live inside the repository." ;;
  esac
}

bos_crypto_fingerprint() {
  bos_crypto_require_recipient
  GNUPGHOME="$(bos_crypto_keyring)" gpg --batch --with-colons --list-keys "$BOS_BACKUP_GPG_RECIPIENT" 2>/dev/null \
    | awk -F: '/^fpr/ { print $10; exit }'
}

bos_crypto_encrypt() { # plaintext_path output_path
  local in="${1:-}" out="${2:-}"
  [ -s "$in" ] || bos_crypto_die "REFUSED: plaintext input is missing or empty."
  [ -n "$out" ] || bos_crypto_die "REFUSED: output path is required."
  [ -e "$out" ] && bos_crypto_die "REFUSED: $out already exists."
  bos_crypto_require_recipient
  local fpr
  fpr="$(bos_crypto_fingerprint)"
  [ -n "$fpr" ] || bos_crypto_die "REFUSED: recipient is not present in the owner keyring."

  ( umask 077
    GNUPGHOME="$(bos_crypto_keyring)" gpg --batch --yes --trust-model always \
      --recipient "$BOS_BACKUP_GPG_RECIPIENT" --output "$out" --encrypt "$in" ) \
    || bos_crypto_die "FAILED: encryption did not complete; the plaintext was left in place."
  [ -s "$out" ] || bos_crypto_die "FAILED: encryption produced no output."
  printf 'encrypted with key %s (private key stays in %s)\n' "$fpr" "$(bos_crypto_keyring)"
}

bos_crypto_verify() { # file.gpg
  local file="${1:-}" tmp
  [ -s "$file" ] || bos_crypto_die "REFUSED: $file is missing or empty."
  bos_crypto_require_recipient
  GNUPGHOME="$(bos_crypto_keyring)" gpg --batch --list-packets "$file" >/dev/null 2>&1 \
    || bos_crypto_die "FAILED: $file is not a parseable OpenPGP message."
  tmp="$(mktemp "${TMPDIR:-/tmp}/bos-verify.XXXXXX")" || bos_crypto_die "FAILED: cannot create verification temp file."
  chmod 600 "$tmp"
  bos_crypto_decrypt_to "$file" "$tmp" \
    || bos_crypto_die "FAILED: $file cannot be decrypted with the owner keyring."
  rm -f "$tmp"
  printf 'encrypted archive decrypts cleanly\n'
}

# Decrypt using the owner-held macOS Keychain item. The passphrase travels only
# through a pipe to GPG's stdin; it is never placed in argv, logs, or a file.
# This supports unattended local verification without weakening the key.
bos_crypto_decrypt_to() { # encrypted_path plaintext_output_path
  local file="${1:-}" output="${2:-}" service="${BOS_BACKUP_GPG_PASSPHRASE_SERVICE:-bos-backup-gpg-passphrase}"
  [ -s "$file" ] && [ -n "$output" ] || return 1
  command -v security >/dev/null 2>&1 || return 1
  security find-generic-password -s "$service" -w 2>/dev/null \
    | GNUPGHOME="$(bos_crypto_keyring)" gpg --batch --yes --pinentry-mode loopback \
      --passphrase-fd 0 --quiet --decrypt --output "$output" "$file" 2>/dev/null
}

bos_crypto_roundtrip() { # file.gpg expected_sha256
  local file="${1:-}" expected="${2:-}" tmp actual
  [ -n "$expected" ] || bos_crypto_die "REFUSED: expected plaintext checksum is required."
  tmp="$(mktemp "${TMPDIR:-/tmp}/bos-decrypt.XXXXXX")" || bos_crypto_die "FAILED: cannot create temp file."
  chmod 600 "$tmp"
  # shellcheck disable=SC2064
  trap 'rm -f "$tmp"' RETURN
  bos_crypto_require_recipient
  bos_crypto_decrypt_to "$file" "$tmp" \
    || bos_crypto_die "FAILED: decryption of $file did not complete."
  actual="$(shasum -a 256 "$tmp" | cut -d' ' -f1)"
  rm -f "$tmp"
  [ "$actual" = "$expected" ] \
    || bos_crypto_die "FAILED: decrypted archive checksum does not match the recorded plaintext checksum."
  printf 'decrypt round-trip reproduces the recorded plaintext checksum\n'
}
