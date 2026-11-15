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
# Exit: 0 complete and consistent; 1 one or more checks failed; 2 usage/not a dir.
#
# It never prints file contents, connection strings or key material.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

DIR="${1:-}"
[ -n "$DIR" ] && shift || true
EXPECTED_REF="${1:-${BOS_EXPECTED_REF:-}}"
[ -n "${1:-}" ] && shift || true

MAX_AGE_HOURS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --max-age-hours) MAX_AGE_HOURS="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
  echo "usage: bash $0 <backup-dir> [expected-project-ref] [--max-age-hours N]" >&2
  exit 2
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
    gpg --batch --list-packets "$DIR/backup.dump.gpg" >/dev/null 2>&1 \
      && ok "encrypted dump is a parseable OpenPGP message" \
      || bad "encrypted dump is not a parseable OpenPGP message"
  else
    warn "gpg not installed; cannot validate the encrypted message"
  fi
elif [ "$PLAIN" = yes ]; then
  BYTES=$(file_bytes backup.dump)
  [ "${BYTES:-0}" -gt 1024 ] && ok "plaintext custom-format dump present ($BYTES bytes)" \
                             || bad "plaintext dump is implausibly small ($BYTES bytes)"
  warn "archive is NOT encrypted (access-restricted directory only)"
else
  bad "no backup.dump or backup.dump.gpg found"
fi

echo "=== 2. required companion artefacts ==="
for f in schema.sql toc.txt SHA256SUMS restore-verification.txt identity-preflight.txt; do
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
  for f in restore-verification.txt identity-preflight.txt; do
    grep -qE "[[:space:]]\*?$f\$" "$DIR/SHA256SUMS" \
      || warn "not covered by SHA256SUMS: $f (restore evidence can be edited undetected)"
  done
else
  bad "SHA256SUMS missing; integrity cannot be proven"
fi

echo "=== 4. table of contents ==="
if exists toc.txt; then
  ENTRIES=$(grep -cE '^[0-9]+;' "$DIR/toc.txt" 2>/dev/null || true)
  [ "${ENTRIES:-0}" -gt 0 ] && ok "TOC lists $ENTRIES dump entries" || bad "TOC has no parseable entries"
  grep -qE 'TABLE DATA public\.' "$DIR/toc.txt" && ok "TOC contains public schema table data" \
                                                   || warn "TOC has no TABLE DATA public.* entries"
  grep -qE 'SCHEMA - auth' "$DIR/toc.txt" && ok "TOC includes the auth schema definition" \
                                          || warn "TOC does not include the auth schema (Google profiles live there)"
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
  SP=$(sed -n 's/^source_policies=//p' "$DIR/restore-verification.txt")
  [ "${RT:-0}" -ge 1 ] && ok "isolated restore produced $RT public tables" \
                       || bad "restore evidence reports no public tables"
  [ "${RR:-0}" -ge 1 ] && ok "restore evidence reports $RR RLS-enabled relations" \
                       || bad "restore evidence reports no RLS-enabled relations"
  if [ -n "${ST:-}" ] && [ "${ST:-unavailable}" != unavailable ]; then
    [ "$ST" = "$RT" ] && ok "source/restored table counts match ($ST)" \
                      || bad "source table count $ST != restored $RT"
  else
    warn "source table count unavailable in restore evidence"
  fi
  if [ -n "${SP:-}" ] && [ "${SP:-unavailable}" != unavailable ]; then
    [ "$SP" = "$RP" ] && ok "source/restored policy counts match ($SP)" \
                      || bad "source policy count $SP != restored $RP"
  else
    warn "source policy count unavailable in restore evidence"
  fi
  grep -qE '^storage_binary_objects=EXCLUDED' "$DIR/restore-verification.txt" \
    && warn "Storage object bytes are excluded from this archive (PostgreSQL only)" || true
else
  bad "no restore evidence; restorability is unproven"
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
