#!/usr/bin/env bash
# =============================================================================
# Tests for supabase/tests/lib/bos_write_lock.sh and the migration-manifest
# writer lock.
#
# Proves that a second writer cannot silently overwrite the first one's pinned
# state (the cause of the manifest drift found in the audit), and that a lock
# left behind by a dead process is reclaimed instead of wedging the tooling.
#
# Usage: bash supabase/tests/run_write_lock_test.sh
# Exit:  0 all cases behaved as specified, 1 otherwise
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C
export TMPDIR=/tmp   # the node writer uses os.tmpdir(); keep both sides identical

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
LOCK_LIB="supabase/tests/lib/bos_write_lock.sh"

PASS=0
FAIL=0
pass() { printf '  PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

root_of() { bash -c ". '$LOCK_LIB'; bos_lock_root"; }
cleanup() { rm -rf "$(root_of)" 2>/dev/null || true; }
trap cleanup EXIT
cleanup

echo "=== 1. acquire and release ==="
if bash -c ". '$LOCK_LIB'; bos_lock_acquire unit-a && bos_lock_release unit-a"; then
  pass "acquire then release returns success"
else
  fail "acquire/release returned non-zero"
fi

echo "=== 2. a held lock blocks a second writer ==="
bash -c ". '$LOCK_LIB'; bos_lock_acquire unit-b; sleep 25" >/dev/null 2>&1 &
HOLDER=$!
sleep 1
out="$(bash -c ". '$LOCK_LIB'; bos_lock_acquire unit-b" 2>&1)"; rc=$?
if [ "$rc" -eq 9 ]; then pass "second acquire refused with exit 9"; else fail "second acquire exited $rc (expected 9)"; fi
case "$out" in
  *"another process holds the 'unit-b' write lock"*) pass "refusal names the held lock" ;;
  *) fail "refusal message did not name the lock: $out" ;;
esac

echo "=== 3. the manifest writer honours the same lock ==="
# The writer takes its own lock name, so hold exactly that one.
bash -c ". '$LOCK_LIB'; bos_lock_acquire migration-manifest; sleep 25" >/dev/null 2>&1 &
MANIFEST_HOLDER=$!
sleep 1
out="$(node supabase/tests/migration_manifest.mjs --write 2>&1)"; rc=$?
if [ "$rc" -eq 9 ]; then pass "manifest --write refused while the lock is held (exit 9)"; else fail "manifest --write exited $rc (expected 9)"; fi
case "$out" in
  *"migration-manifest write lock"*) pass "manifest refusal names the lock" ;;
  *) fail "manifest refusal message: $out" ;;
esac
kill "$HOLDER" "$MANIFEST_HOLDER" 2>/dev/null || true
wait "$HOLDER" 2>/dev/null || true
wait "$MANIFEST_HOLDER" 2>/dev/null || true
cleanup

echo "=== 4. a dead holder's lock is reclaimed ==="
ROOT="$(root_of)"; mkdir -p "$ROOT/unit-c.lock"
printf 'pid=999999\nhost=ghost\nstarted=2000-01-01T00:00:00Z\nowner=nobody\n' > "$ROOT/unit-c.lock/owner"
if bash -c ". '$LOCK_LIB'; bos_lock_acquire unit-c && bos_lock_release unit-c"; then
  pass "stale lock from a dead pid was reclaimed"
else
  fail "stale lock was not reclaimed"
fi

echo "=== 5. lock lives outside the repository ==="
case "$(root_of)" in
  "$REPO_ROOT"|"$REPO_ROOT"/*) fail "lock root is inside the repository" ;;
  *) pass "lock root is outside the repository ($(root_of))" ;;
esac

echo "=== verdict ==="
echo "  passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo "  ALL WRITE-LOCK CASES PASSED"
