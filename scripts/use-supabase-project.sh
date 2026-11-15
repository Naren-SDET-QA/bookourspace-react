#!/usr/bin/env bash
# =============================================================================
# BookOurSpace — switch the local React development target between Supabase
# projects.
#
#   bash scripts/use-supabase-project.sh mumbai      # -> .env.local.mumbai
#   bash scripts/use-supabase-project.sh stockholm   # -> .env.local.stockholm
#   bash scripts/use-supabase-project.sh show        # print the active target
#
# Each project keeps its own gitignored env file, so the publishable key of
# one project is never pasted into the other and no secret is ever committed.
# The script only copies a file; it never prints a key.
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

TARGET="${1:-show}"
ACTIVE=".env.local"

active_ref() {
  grep -E '^VITE_SUPABASE_PROJECT_ID=' "$1" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

case "$TARGET" in
  show)
    if [ -f "$ACTIVE" ]; then
      echo "active project : $(active_ref "$ACTIVE")"
      echo "active file    : $ACTIVE"
      for candidate in .env.local.mumbai .env.local.stockholm; do
        [ -f "$candidate" ] && echo "available       : $candidate -> $(active_ref "$candidate")"
      done
    else
      echo "no active $ACTIVE" >&2
      exit 1
    fi
    exit 0
    ;;
  mumbai|stockholm)
    SOURCE=".env.local.$TARGET"
    if [ ! -f "$SOURCE" ]; then
      echo "missing $SOURCE — create it first (see docs in the file)." >&2
      exit 1
    fi
    KEY_LINE=$(grep -E '^VITE_SUPABASE_PUBLISHABLE_KEY=' "$SOURCE" | head -1 | cut -d= -f2-)
    if [ -z "$KEY_LINE" ]; then
      echo "WARNING: $SOURCE has no publishable key. The app will stay disabled" >&2
      echo "         (it fails closed rather than talking to the wrong project)." >&2
    fi
    cp "$SOURCE" "$ACTIVE"
    echo "active project : $(active_ref "$ACTIVE")"
    echo "copied $SOURCE -> $ACTIVE (no key value was printed)"
    exit 0
    ;;
  *)
    echo "usage: $0 [mumbai|stockholm|show]" >&2
    exit 2
    ;;
esac
