#!/usr/bin/env bash
# Offline inventory of legacy plaintext credential snapshots.
# Prints file names and modes only — never file contents, passwords or URIs.
# Exit 0 when none are found; 1 when legacy snapshots remain (owner action).
set -uo pipefail
export LC_ALL=C LANG=C
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

found=0
report() {
  local path="$1"
  [ -f "$path" ] || return 0
  found=$((found + 1))
  printf 'PLAINTEXT_SNAPSHOT %s mode=%s bytes=%s\n' "$path" "$(stat -f '%Sp' "$path" 2>/dev/null || echo '?')" "$(stat -f '%z' "$path" 2>/dev/null || echo '?')"
}

echo '=== workspace legacy env snapshots ==='
for name in .env.save .env.local.stockholm; do
  report "$REPO_ROOT/$name"
done
while IFS= read -r path; do
  case "$(basename "$path")" in
    .env|.env.local|.env.example|.env.save|.env.local.stockholm) ;; # reported above/active
    *) report "$path" ;;
  esac
done < <(find "$REPO_ROOT" -maxdepth 1 -type f \( -name '.env*' -o -name '*.bak' \) -print 2>/dev/null | sort)

echo '=== external env snapshot directory ==='
EXT="${BOS_ENV_SNAPSHOT_DIR:-$HOME/BookOurSpace_Backups/env}"
while IFS= read -r path; do
  [ -n "$path" ] && report "$path"
done < <(find "$EXT" -maxdepth 1 -type f -name '*.bak' -print 2>/dev/null | sort)

echo '=== active credential files (not snapshots; keep mode 600) ==='
for name in .env .env.local; do
  [ -f "$REPO_ROOT/$name" ] || continue
  mode="$(stat -f '%Sp' "$REPO_ROOT/$name" 2>/dev/null || echo '?')"
  printf 'ACTIVE %s mode=%s\n' "$name" "$mode"
  case "$mode" in
    -rw-------) ;;
    *) echo "WARN: $name should be mode 600" >&2 ;;
  esac
done

if [ "$found" -eq 0 ]; then
  echo 'PASS: no legacy plaintext credential snapshots found'
  exit 0
fi
echo "BLOCKED: $found legacy plaintext credential snapshot(s) remain. Rotate/revoke the old credentials, then encrypt or securely delete them with owner approval." >&2
echo 'Owner actions are in HOSTED_FIRST_INSTALL_READINESS.md and OWNER_GPG_KEY_SETUP.md.' >&2
exit 1
