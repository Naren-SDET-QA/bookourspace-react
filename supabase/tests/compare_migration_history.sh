#!/usr/bin/env bash
# =============================================================================
# Compare local migrations with hosted Supabase migration history (READ ONLY)
#
# Target: ONLY the approved React project in supabase/backup/react-target.conf,
# enforced by supabase/tests/lib/bos_target_guard.sh. Never writes to the hosted
# database. Prints missing/extra/renamed migrations and fails when they diverge.
#
# Real run:
#   BOS_DEV_DATABASE_URL='postgres://readonly@.../postgres' \
#   BOS_DEV_CONFIRM=obkfgxjzlscungkhbyvq \
#     bash supabase/tests/compare_migration_history.sh
#
# Self-test (local disposable cluster; proves MATCH and DRIFT detection):
#   BOS_HISTORY_SELFTEST=1 bash supabase/tests/compare_migration_history.sh
#
# Exit: 0 identical; 2 no URL; 3 wrong target; 4 history mismatch;
#       5 hosted history table missing/unreadable.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib/bos_target_guard.sh
. "$REPO_ROOT/supabase/tests/lib/bos_target_guard.sh"
bos_load_target_config
DEV_REF="$BOS_APPROVED_REF"
MIG_DIR="$REPO_ROOT/supabase/migrations"
URL="${BOS_BACKUP_DATABASE_URL:-${BOS_DEV_DATABASE_URL:-}}"
if [ -z "$URL" ] && command -v security >/dev/null 2>&1; then
  URL="$(security find-generic-password -s "${BOS_BACKUP_KEYCHAIN_SERVICE:-bos-production-backup}" -w 2>/dev/null || true)"
fi
TMP="$(mktemp -d "${TMPDIR:-/tmp}/bos-history.XXXXXX")" || exit 1
trap 'rm -rf "$TMP"' EXIT

free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}

local_manifest() {
  local f base version name
  for f in "$MIG_DIR"/*.sql; do
    base="$(basename "$f" .sql)"
    version="${base%%_*}"
    name="${base#*_}"
    printf '%s\t%s\n' "$version" "$name"
  done | sort
}

# compare <database_url> [--expect-drift]
compare() {
  local url="$1" expect_drift="${2:-no}" rows
  local_manifest > "$TMP/local.tsv"
  if ! rows="$(psql "$url" -tAc "select version, coalesce(name,'') from supabase_migrations.schema_migrations order by version" 2>"$TMP/hosted.err")"; then
    echo "FAILED: cannot read supabase_migrations.schema_migrations (see reason below)." >&2
    head -3 "$TMP/hosted.err" >&2
    return 5
  fi
  # The first install records a baseline marker (00000000000000) for
  # supabase/schema_and_rls.sql. It has no local migration file, so exclude only
  # that marker; every real migration must still match exactly.
  printf '%s\n' "$rows" | awk -F'|' 'NF && $1!="00000000000000"{print $1"\t"$2}' | sed 's/[[:space:]]*$//' | sort > "$TMP/hosted.tsv"

  local missing extra renamed=0
  missing="$(comm -23 <(cut -f1 "$TMP/local.tsv") <(cut -f1 "$TMP/hosted.tsv"))"
  extra="$(comm -13 <(cut -f1 "$TMP/local.tsv") <(cut -f1 "$TMP/hosted.tsv"))"
  while IFS=$'\t' read -r v n; do
    h="$(awk -F'\t' -v v="$v" '$1==v{print $2}' "$TMP/hosted.tsv")"
    if [ -n "$h" ] && [ "$h" != "$n" ]; then
      echo "RENAMED  $v  local=$n  hosted=$h"
      renamed=$((renamed + 1))
    fi
  done < "$TMP/local.tsv"

  echo "    local migrations: $(wc -l < "$TMP/local.tsv" | tr -d ' ')"
  echo "    hosted rows:      $(wc -l < "$TMP/hosted.tsv" | tr -d ' ')"
  [ -n "$missing" ] && { echo "MISSING IN HOSTED:"; printf '%s\n' "$missing" | sed 's/^/    /'; }
  [ -n "$extra" ] && { echo "HOSTED-ONLY (not in this tree):"; printf '%s\n' "$extra" | sed 's/^/    /'; }

  local drift=0
  [ -n "$missing" ] && drift=1
  [ -n "$extra" ] && drift=1
  [ "$renamed" -gt 0 ] && drift=1

  if [ "$expect_drift" = "--expect-drift" ]; then
    [ "$drift" -eq 1 ] && { echo "    drift correctly detected"; return 0; }
    echo "    EXPECTED drift but histories matched" >&2
    return 4
  fi
  if [ "$drift" -eq 0 ]; then
    echo "    MATCH: every local migration version/name exists in hosted history and nothing is extra"
    return 0
  fi
  return 4
}

# -----------------------------------------------------------------------------
# Self-test
# -----------------------------------------------------------------------------
if [ "${BOS_HISTORY_SELFTEST:-}" = "1" ]; then
  DATA="$TMP/pgdata"; PORT="$(free_port)"
  cleanup_self() { pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; }
  trap 'cleanup_self; rm -rf "$TMP"' EXIT
  echo "=== SELF-TEST (disposable local history table; no hosted access) ==="
  initdb -D "$DATA" -U postgres --auth=trust > "$TMP/initdb.log" 2>&1 || { echo "SELF-TEST FAILED: initdb"; exit 1; }
  pg_ctl -D "$DATA" -o "-p $PORT -k $TMP -c listen_addresses=127.0.0.1" -l "$TMP/pg.log" start >/dev/null 2>&1 \
    || { echo "SELF-TEST FAILED: start"; exit 1; }
  for _ in $(seq 1 60); do psql -h 127.0.0.1 -p "$PORT" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break; sleep 0.5; done
  psql -h 127.0.0.1 -p "$PORT" -U postgres -q -c 'create database bos_history' || { echo "SELF-TEST FAILED: create db"; exit 1; }

  local_manifest > "$TMP/seed.tsv"
  {
    echo "create schema if not exists supabase_migrations;"
    echo "create table supabase_migrations.schema_migrations (version text primary key, name text);"
    while IFS=$'\t' read -r v n; do
      printf "insert into supabase_migrations.schema_migrations values ('%s','%s');\n" "$v" "$n"
    done < "$TMP/seed.tsv"
  } | psql "postgres://postgres@127.0.0.1:$PORT/bos_history" -q -v ON_ERROR_STOP=1 \
      || { echo "SELF-TEST FAILED: seed history"; exit 1; }

  if ! compare "postgres://postgres@127.0.0.1:$PORT/bos_history"; then
    echo "SELF-TEST FAILED: identical history was not reported as MATCH" >&2
    exit 1
  fi
  psql "postgres://postgres@127.0.0.1:$PORT/bos_history" -q \
    -c "insert into supabase_migrations.schema_migrations values ('20990101000000','injected_drift')" || exit 1
  if ! compare "postgres://postgres@127.0.0.1:$PORT/bos_history" --expect-drift; then
    echo "SELF-TEST FAILED: injected drift was not detected" >&2
    exit 1
  fi
  echo "SELF-TEST PASS: MATCH and DRIFT detection both behave correctly"
  exit 0
fi

# -----------------------------------------------------------------------------
# Guarded real run
# -----------------------------------------------------------------------------
if [ -z "$URL" ]; then
  echo "BLOCKED: BOS_DEV_DATABASE_URL is not set; hosted migration history cannot be read." >&2
  exit 2
fi
bos_require_ref_confirmation "${BOS_DEV_CONFIRM:-}"
bos_assert_connection "$URL"
export PGSSLMODE="${PGSSLMODE:-$BOS_SSLMODE}"

echo "=== hosted vs local migration history ($DEV_REF) ==="
if compare "$URL"; then
  exit 0
fi
echo "MIGRATION HISTORY MISMATCH: do not apply until reconciled." >&2
exit 4
