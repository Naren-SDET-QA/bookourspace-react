#!/usr/bin/env bash
# =============================================================================
# BookOurSpace — DEV migration plan / apply runner
#
# Default mode is PLAN: it prints exactly what would run and touches nothing.
#
#   bash supabase/tests/run_dev_migration_plan.sh plan      # no connection
#   bash supabase/tests/run_dev_migration_plan.sh check     # read-only schema check
#   BOS_DEV_APPLY=1 BOS_DEV_DATABASE_URL=... \
#     bash supabase/tests/run_dev_migration_plan.sh apply   # requires approval
#
# Guardrails:
#   * apply refuses unless BOS_DEV_APPLY=1 AND BOS_DEV_CONFIRM matches the
#     project ref being targeted.
#   * apply refuses any connection string containing "prod".
#   * baseline (supabase/schema_and_rls.sql) is only applied when
#     BOS_DEV_INCLUDE_BASELINE=1; first verify the hosted catalog with a
#     read-only database connection. The current Management API access is
#     denied, so whether baseline is needed is not established.
#   * every file runs with ON_ERROR_STOP=1; failure aborts the run.
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-plan}"
MIGRATION_DIR="$REPO_ROOT/supabase/migrations"
BASELINE="$REPO_ROOT/supabase/schema_and_rls.sql"

MIGRATIONS=()
while IFS= read -r mig; do
  MIGRATIONS+=("$mig")
done < <(find "$MIGRATION_DIR" -maxdepth 1 -name '*.sql' | sort)
COUNT="${#MIGRATIONS[@]}"

if [ "$MODE" = "plan" ]; then
  echo "BookOurSpace DEV migration plan"
  echo "project target : ezrxykyocgbolpaebnqx (configured DEV ref: see .env.local)"
  echo "baseline       : $BASELINE"
  echo "migrations     : $COUNT"
  echo
  echo "step 0  baseline schema_and_rls.sql  (conditional: include only after read-only catalog verification)"
  i=1
  for file in "${MIGRATIONS[@]}"; do
    printf 'step %-2d %s\n' "$i" "$(basename "$file")"
    i=$((i + 1))
  done
  echo
  echo "No connection was made. To verify the live schema read-only:"
  echo "  bash supabase/tests/run_dev_migration_plan.sh check"
  echo "To apply (after explicit approval):"
  echo "  BOS_DEV_APPLY=1 BOS_DEV_CONFIRM=<project-ref> BOS_DEV_DATABASE_URL=<session-pooler-url> \\"
  echo "    BOS_DEV_INCLUDE_BASELINE=1 bash supabase/tests/run_dev_migration_plan.sh apply"
  exit 0
fi

DATABASE_URL="${BOS_DEV_DATABASE_URL:-}"
if [ -z "$DATABASE_URL" ]; then
  echo "BLOCKED: BOS_DEV_DATABASE_URL is not set." >&2
  exit 2
fi
case "$DATABASE_URL" in
  *prod*) echo "REFUSED: the connection string looks like a production target." >&2; exit 3 ;;
esac

READONLY_PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

if [ "$MODE" = "check" ]; then
  echo "Read-only DEV schema check"
  "${READONLY_PSQL[@]}" -c "select current_database(), current_user, version();"
  echo "--- public tables"
  "${READONLY_PSQL[@]}" -tAc "select count(*) from pg_tables where schemaname='public';" | sed 's/^/public_tables=/'
  echo "--- expected tables (present?)"
  for table in profiles listings bookings platform_module_flags stay_properties stay_allocations service_bookings venue_bookings payment_intents; do
    present=$("${READONLY_PSQL[@]}" -tAc "select to_regclass('public.$table');" 2>/dev/null || echo "")
    if [ -n "$present" ]; then echo "  PRESENT $table"; else echo "  MISSING $table"; fi
  done
  echo "--- rls"
  "${READONLY_PSQL[@]}" -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity;" | sed 's/^/rls_enabled_tables=/'
  exit 0
fi

if [ "$MODE" != "apply" ]; then
  echo "Unknown mode: $MODE" >&2
  exit 1
fi

if [ "${BOS_DEV_APPLY:-}" != "1" ]; then
  echo "BLOCKED: apply requires BOS_DEV_APPLY=1 (explicit approval)." >&2
  exit 4
fi
if [ "${BOS_DEV_CONFIRM:-}" != "ezrxykyocgbolpaebnqx" ]; then
  echo "BLOCKED: BOS_DEV_CONFIRM must equal the DEV project ref (ezrxykyocgbolpaebnqx)." >&2
  exit 4
fi

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bos-dev-migrate.XXXXXX")"
echo "logs: $LOG_DIR"

if [ "${BOS_DEV_INCLUDE_BASELINE:-}" = "1" ]; then
  echo "--- baseline schema_and_rls.sql"
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -f "$BASELINE" > "$LOG_DIR/baseline.out" 2> "$LOG_DIR/baseline.err"; then
    echo "FAILED baseline (see $LOG_DIR/baseline.err)" >&2
    tail -5 "$LOG_DIR/baseline.err" >&2
    exit 5
  fi
  echo "    applied"
fi

index=0
for file in "${MIGRATIONS[@]}"; do
  index=$((index + 1))
  name="$(basename "$file")"
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -f "$file" > "$LOG_DIR/$name.out" 2> "$LOG_DIR/$name.err"; then
    echo "    PASS $index/$COUNT $name"
  else
    echo "    FAIL $index/$COUNT $name (see $LOG_DIR/$name.err)" >&2
    tail -5 "$LOG_DIR/$name.err" >&2
    exit 6
  fi
done

echo "--- verification"
psql "$DATABASE_URL" -X -q -tAc "select count(*) from pg_tables where schemaname='public';" | sed 's/^/public_tables=/'
psql "$DATABASE_URL" -X -q -tAc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity;" | sed 's/^/rls_enabled_tables=/'
psql "$DATABASE_URL" -X -q -tAc "select count(*) from pg_policies where schemaname='public';" | sed 's/^/policies=/'
echo "APPLIED $COUNT migrations"
