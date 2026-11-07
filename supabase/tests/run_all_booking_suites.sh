#!/usr/bin/env bash
# =============================================================================
# Sequential runner for the five booking module suites.
#
# Each suite boots its own disposable PostgreSQL cluster, its own Express server
# and its own Vite websocket/HMR port (the harnesses allocate free ports per
# run), so fixtures are isolated and the suites cannot collide with each other
# or with a developer's running dev server.
#
# Usage: bash supabase/tests/run_all_booking_suites.sh [logfile]
# Exit:  0 only when every suite exits 0
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
LOG="${1:-${TMPDIR:-/tmp}/bos-booking-suites.log}"
: > "$LOG"
FAILED=""
RESULTS=""

run_suite() { # label, command...
  local label="$1"; shift
  echo "" >> "$LOG"
  echo "################ $label ################" >> "$LOG"
  echo "    running $label"
  "$@" >> "$LOG" 2>&1
  local code=$?
  echo "SUITE_EXIT $label=$code" >> "$LOG"
  RESULTS="${RESULTS}${label}=${code} "
  [ "$code" -eq 0 ] || FAILED="$FAILED $label"
  echo "    $label exit=$code"
}

echo "Booking module suites on the current tree (sequential, isolated fixtures)"
run_suite live_edit_audit     bash supabase/tests/run_live_edit_audit.sh
run_suite live_edit_security  bash supabase/tests/run_live_edit_security.sh
run_suite pg_integration      bash supabase/tests/run_pg_integration.sh
run_suite pg_payments         bash supabase/tests/run_pg_payment_e2e.sh
run_suite classes             bash supabase/tests/run_classes_ui_e2e.sh
run_suite venues              env BOS_RUN_VENUE_ONLY=1 bash supabase/tests/run_classes_ui_e2e.sh
run_suite services_api        bash supabase/tests/run_services_e2e.sh
run_suite services_browser    bash supabase/tests/run_services_ui_e2e.sh
run_suite stays               bash supabase/tests/run_stay_payment_e2e.sh

echo "" | tee -a "$LOG"
echo "SUMMARY $RESULTS" | tee -a "$LOG"
if [ -n "$FAILED" ]; then
  echo "FAILED SUITES:$FAILED" | tee -a "$LOG"
  echo "log: $LOG"
  exit 1
fi
echo "ALL BOOKING SUITES PASSED" | tee -a "$LOG"
echo "log: $LOG"
