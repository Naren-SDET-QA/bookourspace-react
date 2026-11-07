#!/usr/bin/env bash
# =============================================================================
# Archive completeness verifier for a BookOurSpace backup directory.
#
# Runs entirely offline: no network, no database, no credentials. It answers
# "is this archive complete, intact, encrypted as intended, and provably
# verified against its own restore record?" — not "is the dump good".
#
# Usage:
#   bash supabase/tests/verify_backup_archive.sh <backup-dir> [expected-ref]
#   BOS_EXPECTED_REF=obkfgxjzlscungkhbyvq bash supabase/tests/verify_backup_archive.sh <dir>
#   ... --max-age-hours 48
#
# The expected ref defaults to the approved React target in
# supabase/backup/react-target.conf; any other ref is refused (exit 3), so a
# stale Mumbai or legacy Stockholm archive cannot be passed off as recovery
# evidence for React. Existing archives are never modified.
#
# Exit: 0 complete and consistent; 1 one or more checks failed; 2 usage/not a dir;
#       3 not an approved target.
#
# It never prints file contents, connection strings or key material.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib/bos_target_guard.sh
. "$REPO_ROOT/supabase/tests/lib/bos_target_guard.sh"
bos_load_target_config

DIR="${1:-}"
[ -n "$DIR" ] && shift || true
EXPECTED_REF="${1:-${BOS_EXPECTED_REF:-}}"
[ -n "${1:-}" ] && shift || true

MAX_AGE_HOURS=""
REQUIRE_ENCRYPTION=yes
while [ $# -gt 0 ]; do
  case "$1" in
    --max-age-hours) MAX_AGE_HOURS="${2:-}"; shift 2 ;;
    --require-encryption) REQUIRE_ENCRYPTION=yes; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
  echo "usage: bash $0 <backup-dir> [expected-project-ref] [--max-age-hours N] [--require-encryption]" >&2
  exit 2
fi

# Only the approved React target may be verified as a recovery anchor.
[ -n "$EXPECTED_REF" ] || EXPECTED_REF="$BOS_APPROVED_REF"
if [ "$EXPECTED_REF" != "$BOS_APPROVED_REF" ]; then
  echo "REFUSED: '$EXPECTED_REF' is not the approved React target ($BOS_APPROVED_REF)." >&2
  echo "         Stale/legacy archives stay on disk untouched but are not React recovery evidence." >&2
  exit 3
fi

FAILURES=0
WARNINGS=0
ok()   { printf '  PASS  %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
warn() { printf '  WARN  %s\n' "$1"; WARNINGS=$((WARNINGS + 1)); }
exists() { [ -s "$DIR/$1" ]; }
file_bytes() { wc -c < "$DIR/$1" 2>/dev/null | tr -d ' '; }

echo "=== archive: $DIR ==="
PERMS=$(stat -f '%Sp' "$DIR" 2>/dev/null || echo '?')
case "$PERMS" in
  drwx------) ok "directory permissions $PERMS (owner-only)" ;;
  *)          bad "directory permissions $PERMS (expected drwx------)" ;;
esac

echo "=== 1. dump artefact ==="
PLAIN=no; ENCRYPTED=no
[ -s "$DIR/backup.dump" ] && PLAIN=yes
[ -s "$DIR/backup.dump.gpg" ] && ENCRYPTED=yes
if [ "$PLAIN" = yes ] && [ "$ENCRYPTED" = yes ]; then
  bad "both plaintext and encrypted dumps are present (plaintext should be removed after encryption)"
elif [ "$ENCRYPTED" = yes ]; then
  ok "encrypted dump present ($(file_bytes backup.dump.gpg) bytes)"
  if command -v gpg >/dev/null 2>&1; then
    if gpg --batch --list-packets "$DIR/backup.dump.gpg" >/dev/null 2>&1; then
      ok "encrypted dump is a parseable OpenPGP message"
    else
      # The verifier deliberately runs without the owner keyring, so gpg cannot
      # parse a message addressed to a key it does not hold. Fall back to the
      # OpenPGP packet header, which identifies the format without any key.
      MAGIC="$(od -An -tx1 -N1 "$DIR/backup.dump.gpg" 2>/dev/null | tr -d ' \n')"
      case "$MAGIC" in
        # Public-key or symmetric session-key packet, old or new encoding:
        # 0x84-0x87 / 0x8c-0x8f (old format, packet tag 1 or 3) and 0xc1 / 0xc3.
        84|85|86|87|8c|8d|8e|8f|c1|c3) ok "encrypted dump carries an OpenPGP session-key packet header (0x$MAGIC)" ;;
        *) bad "encrypted dump is not an OpenPGP message (first byte 0x${MAGIC:-??})" ;;
      esac
    fi
  else
    warn "gpg not installed; cannot validate the encrypted message"
  fi
elif [ "$PLAIN" = yes ]; then
  BYTES=$(file_bytes backup.dump)
  if [ "$REQUIRE_ENCRYPTION" = yes ]; then
    bad "plaintext dump is forbidden; BookOurSpace archives must be encrypted"
  else
    bad "plaintext dump is forbidden; BookOurSpace archives must be encrypted"
  fi
else
  bad "no backup.dump or backup.dump.gpg found"
fi

echo "=== 2. required companion artefacts ==="
for f in schema.sql toc.txt SHA256SUMS restore-verification.txt identity-preflight.txt encryption.txt; do
  if exists "$f"; then ok "present: $f"; else bad "missing or empty: $f"; fi
done
[ -s "$DIR/dump.err" ] && warn "dump.err is non-empty; inspect it before trusting this archive" \
                       || ok "dump.err empty or absent"

echo "=== 3. checksum coverage and integrity ==="
if [ -s "$DIR/SHA256SUMS" ]; then
  if ( cd "$DIR" && shasum -a 256 -c SHA256SUMS >/dev/null 2>&1 ); then
    ok "every file listed in SHA256SUMS matches its digest"
  else
    bad "SHA256SUMS verification failed (a file is missing or modified)"
  fi
  for f in schema.sql toc.txt; do
    grep -qE "[[:space:]]\*?$f\$" "$DIR/SHA256SUMS" \
      && ok "covered by SHA256SUMS: $f" || bad "not covered by SHA256SUMS: $f"
  done
  if grep -qE 'backup\.dump(\.gpg)?$' "$DIR/SHA256SUMS"; then
    ok "covered by SHA256SUMS: dump artefact"
  else
    bad "not covered by SHA256SUMS: dump artefact"
  fi
  for f in restore-verification.txt identity-preflight.txt encryption.txt; do
    grep -qE "[[:space:]]\*?$f\$" "$DIR/SHA256SUMS" \
      || bad "not covered by SHA256SUMS: $f (recovery evidence can be edited undetected)"
  done
else
  bad "SHA256SUMS missing; integrity cannot be proven"
fi

echo "=== 4. table of contents ==="
if exists toc.txt; then
  ENTRIES=$(grep -cE '^[0-9]+;' "$DIR/toc.txt" 2>/dev/null || true)
  [ "${ENTRIES:-0}" -gt 0 ] && ok "TOC lists $ENTRIES dump entries" || bad "TOC has no parseable entries"
  grep -qE 'TABLE DATA public([ .])' "$DIR/toc.txt" && ok "TOC contains public schema table data" \
                                                   || warn "TOC has no TABLE DATA public.* entries"
  grep -qE 'SCHEMA - auth' "$DIR/toc.txt" && ok "TOC includes the auth schema definition" \
                                          || warn "TOC does not include the auth schema (Google profiles live there)"
  grep -qE 'TABLE DATA auth users([[:space:]]|$)' "$DIR/toc.txt" \
    && ok "TOC includes auth.users data" || bad "TOC is missing auth.users data"
  grep -qE 'TABLE DATA auth identities([[:space:]]|$)' "$DIR/toc.txt" \
    && ok "TOC includes auth.identities data" || bad "TOC is missing auth.identities data"
fi
if [ "$PLAIN" = yes ] && command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$DIR/backup.dump" >/dev/null 2>&1 \
    && ok "pg_restore can read the dump header" \
    || bad "pg_restore cannot read the dump (corrupt or wrong format)"
fi

echo "=== 5. restore evidence ==="
if exists restore-verification.txt; then
  RT=$(sed -n 's/^restored_public_tables=//p' "$DIR/restore-verification.txt")
  RP=$(sed -n 's/^restored_policies=//p' "$DIR/restore-verification.txt")
  RR=$(sed -n 's/^restored_rls_tables=//p' "$DIR/restore-verification.txt")
  ST=$(sed -n 's/^source_public_tables=//p' "$DIR/restore-verification.txt")
  SR=$(sed -n 's/^source_rls_tables=//p' "$DIR/restore-verification.txt")
  SP=$(sed -n 's/^source_policies=//p' "$DIR/restore-verification.txt")
  SU=$(sed -n 's/^source_auth_users=//p' "$DIR/restore-verification.txt")
  SI=$(sed -n 's/^source_auth_identities=//p' "$DIR/restore-verification.txt")
  RU=$(sed -n 's/^restored_auth_users=//p' "$DIR/restore-verification.txt")
  RI=$(sed -n 's/^restored_auth_identities=//p' "$DIR/restore-verification.txt")
  SST=$(sed -n 's/^source_storage_tables=//p' "$DIR/restore-verification.txt")
  SSB=$(sed -n 's/^source_storage_buckets=//p' "$DIR/restore-verification.txt")
  SSO=$(sed -n 's/^source_storage_objects=//p' "$DIR/restore-verification.txt")
  RST=$(sed -n 's/^restored_storage_tables=//p' "$DIR/restore-verification.txt")
  RSB=$(sed -n 's/^restored_storage_buckets=//p' "$DIR/restore-verification.txt")
  RSO=$(sed -n 's/^restored_storage_objects=//p' "$DIR/restore-verification.txt")
  if [[ "${ST:-}" =~ ^[0-9]+$ ]] && [[ "${RT:-}" =~ ^[0-9]+$ ]] && [ "$ST" = "$RT" ]; then
    ok "source/restored public table counts match ($ST)"
    if [ "$ST" -eq 0 ]; then
      if [ "${SR:-unavailable}" = 0 ] && [ "${RR:-unavailable}" = 0 ]; then
        ok "zero-table first-install archive records and restores zero RLS relations"
      else
        bad "zero-table first-install source/restore reports unexpected RLS relations"
      fi
    else
      if [[ "${SR:-}" =~ ^[0-9]+$ ]] && [[ "${RR:-}" =~ ^[0-9]+$ ]] && [ "$SR" = "$RR" ] && [ "$RR" -ge 1 ]; then
        ok "source/restored RLS-enabled relation counts match ($RR)"
      else
        bad "source/restored RLS-enabled relation counts are missing, invalid, or different"
      fi
    fi
  else
    bad "source/restored public table counts are missing, invalid, or different"
  fi
  if [ -n "${SP:-}" ] && [ "${SP:-unavailable}" != unavailable ]; then
    [ "$SP" = "$RP" ] && ok "source/restored policy counts match ($SP)" \
                      || bad "source policy count $SP != restored $RP"
  else
    warn "source policy count unavailable in restore evidence"
  fi
  if [[ "${SU:-}" =~ ^[0-9]+$ ]] && [[ "${SI:-}" =~ ^[0-9]+$ ]] \
     && [[ "${RU:-}" =~ ^[0-9]+$ ]] && [[ "${RI:-}" =~ ^[0-9]+$ ]] \
     && [ "$SU" -gt 0 ] && [ "$SI" -gt 0 ] && [ "$SU" = "$RU" ] && [ "$SI" = "$RI" ]; then
    ok "Auth users and Google identities preserved ($RU users, $RI identities)"
  else
    bad "Auth user/identity source and restored counts are missing, empty, or different"
  fi
  if [[ "${SST:-}" =~ ^[0-9]+$ ]] && [[ "${RST:-}" =~ ^[0-9]+$ ]] \
     && [[ "${SSB:-}" =~ ^[0-9]+$ ]] && [[ "${RSB:-}" =~ ^[0-9]+$ ]] \
     && [[ "${SSO:-}" =~ ^[0-9]+$ ]] && [[ "${RSO:-}" =~ ^[0-9]+$ ]] \
     && [ "$SST" = "$RST" ] && [ "$SSB" = "$RSB" ] && [ "$SSO" = "$RSO" ]; then
    ok "Storage metadata tables, buckets and object rows preserved ($RST tables, $RSB buckets, $RSO object rows)"
  else
    bad "Storage metadata source and restored table/bucket/object counts are missing or different"
  fi
  grep -qE '^storage_binary_objects=EXCLUDED' "$DIR/restore-verification.txt" \
    && warn "Storage object bytes are excluded from this archive (PostgreSQL only)" || true
else
  bad "no restore evidence; restorability is unproven"
fi

if exists encryption.txt; then
  grep -q '^encryption=openpgp$' "$DIR/encryption.txt" \
    && ok "restore evidence records OpenPGP encryption" || bad "encryption evidence is missing or invalid"
  grep -Eq '^recipient_fingerprint=[A-Fa-f0-9]{40,64}$' "$DIR/encryption.txt" \
    && ok "encryption evidence records an owner recipient fingerprint" \
    || bad "encryption evidence has no valid recipient fingerprint"
else
  bad "encryption evidence is missing"
fi

echo "=== 6. target identity ==="
if exists identity-preflight.txt; then
  REF=$(sed -n 's/^project_ref=//p' "$DIR/identity-preflight.txt")
  if [ -n "$EXPECTED_REF" ]; then
    [ "$REF" = "$EXPECTED_REF" ] && ok "archive identity matches expected ref ($REF)" \
                                 || bad "archive identity '$REF' != expected '$EXPECTED_REF'"
  elif [ -n "$REF" ]; then
    ok "archive records project ref $REF"
  else
    warn "identity-preflight.txt records no project_ref"
  fi
  sed -n 's/^session_read_only=on.*/&/p' "$DIR/identity-preflight.txt" | grep -q . \
    && ok "dump session recorded as read-only" || warn "no read-only session marker recorded"
else
  bad "no identity preflight; the archive may belong to a different project"
fi

echo "=== 7. freshness ==="
if [ -n "$MAX_AGE_HOURS" ]; then
  NEWEST=""
  for f in backup.dump backup.dump.gpg; do
    [ -s "$DIR/$f" ] && NEWEST="$DIR/$f"
  done
  if [ -n "$NEWEST" ]; then
    AGE_S=$(( $(date +%s) - $(stat -f '%m' "$NEWEST") ))
    AGE_H=$(( AGE_S / 3600 ))
    [ "$AGE_H" -le "$MAX_AGE_HOURS" ] && ok "archive is ${AGE_H}h old (limit ${MAX_AGE_HOURS}h)" \
                                      || bad "archive is ${AGE_H}h old, exceeds ${MAX_AGE_HOURS}h"
  fi
else
  warn "freshness not evaluated (pass --max-age-hours N)"
fi

echo "=== verdict ==="
if [ "$FAILURES" -eq 0 ]; then
  echo "  ARCHIVE COMPLETE — $WARNINGS warning(s)"
  exit 0
fi
echo "  ARCHIVE INCOMPLETE — $FAILURES failure(s), $WARNINGS warning(s)"
exit 1
