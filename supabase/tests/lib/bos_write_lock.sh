#!/usr/bin/env bash
# =============================================================================
# Repository write lock for BookOurSpace tooling.
#
# Source this file; do not execute it.
#
#   . supabase/tests/lib/bos_write_lock.sh
#   bos_lock_acquire migration-manifest || exit 9
#   trap 'bos_lock_release migration-manifest' EXIT
#
# Why: two agents (or an agent and an editor) writing the same configuration or
# migration pin at the same time is what produced the manifest drift this lock
# is meant to prevent. The lock is advisory and cooperative: every tool that
# rewrites pinned state must take it, and a lock left behind by a dead process
# is reclaimed automatically after its TTL.
#
# Guarantees:
#   * atomic acquisition (mkdir is atomic on POSIX filesystems),
#   * a live holder is never silently overridden (exit 9 with holder details),
#   * a dead holder's lock is reclaimed (pid gone) or after the TTL,
#   * the lock lives outside the repository, so it can never be committed.
#
# Exit: 0 acquired; 9 held by someone else.
# =============================================================================

[ -n "${BOS_WRITE_LOCK_LOADED:-}" ] && return 0
BOS_WRITE_LOCK_LOADED=1

BOS_LOCK_REPO="${BOS_LOCK_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"

bos_lock_root() {
  local key
  key="$(printf '%s' "$BOS_LOCK_REPO" | shasum -a 256 | cut -c1-12)"
  printf '%s' "${BOS_LOCK_DIR:-${TMPDIR:-/tmp}/bos-locks/$key}"
}

bos_lock_holder() { # name
  local owner
  owner="$(bos_lock_root)/$1.lock/owner"
  [ -r "$owner" ] || return 1
  sed -n 's/^pid=/pid=/p;s/^host=/host=/p;s/^started=/started=/p' "$owner" | tr '\n' ' '
}

bos_lock_acquire() { # name [ttl_minutes]
  local name="${1:-}" ttl="${2:-15}" root dir owner pid attempt
  [ -n "$name" ] || { echo "REFUSED: bos_lock_acquire needs a lock name." >&2; return 9; }
  root="$(bos_lock_root)"
  dir="$root/$name.lock"
  owner="$dir/owner"
  mkdir -p "$root" 2>/dev/null || { echo "REFUSED: cannot create lock root $root." >&2; return 9; }
  chmod 700 "$root" 2>/dev/null || true

  for attempt in 1 2; do
    if mkdir "$dir" 2>/dev/null; then
      {
        printf 'pid=%s\n' "$$"
        printf 'host=%s\n' "$(hostname 2>/dev/null || echo unknown)"
        printf 'started=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        printf 'owner=%s\n' "${USER:-unknown}"
      } > "$owner" 2>/dev/null || true
      BOS_LOCK_HELD="$name"
      return 0
    fi

    # Held: is the holder gone?
    pid="$(sed -n 's/^pid=//p' "$owner" 2>/dev/null | head -1)"
    local stale=0
    if [ -z "$pid" ]; then
      stale=1
    elif ! kill -0 "$pid" 2>/dev/null; then
      stale=1
    elif [ -n "$(find "$dir" -maxdepth 0 -mmin +"$ttl" -print 2>/dev/null)" ]; then
      stale=1
    fi
    if [ "$stale" = "1" ]; then
      rm -rf "$dir" 2>/dev/null || true
      continue
    fi

    echo "REFUSED: another process holds the '$name' write lock ($(bos_lock_holder "$name"))." >&2
    echo "         Concurrent edits to the same pinned state are blocked; retry after it exits." >&2
    return 9
  done
  echo "REFUSED: could not acquire the '$name' write lock." >&2
  return 9
}

bos_lock_release() { # name
  local name="${1:-}" dir owner pid
  [ -n "$name" ] || return 0
  dir="$(bos_lock_root)/$name.lock"
  [ -d "$dir" ] || return 0
  owner="$dir/owner"
  pid="$(sed -n 's/^pid=//p' "$owner" 2>/dev/null | head -1)"
  if [ "${BOS_LOCK_FORCE:-}" = "1" ] || [ -z "$pid" ] || [ "$pid" = "$$" ]; then
    rm -rf "$dir"
    return 0
  fi
  echo "NOTE: '$name' lock is held by pid ${pid}; not releasing it." >&2
  return 1
}
