#!/usr/bin/env bash
# =============================================================================
# Hosted Live Builder verification — READ ONLY, approval-gated.
#
# Requires:
#   BOS_HOSTED_READONLY_DSN   read-only connection string for the Mumbai project
#   BOS_HOSTED_VERIFY_APPROVED=obkfgxjzlscungkhbyvq
#
# Forces default_transaction_read_only=on for the whole session and runs only
# SELECTs, so it cannot publish, roll back, create or delete anything.
#
# It is intentionally NOT run automatically: hosted access needs the owner's
# approval and a working read-only credential.
#
# Usage:
#   BOS_HOSTED_READONLY_DSN='postgresql://...' \
#   BOS_HOSTED_VERIFY_APPROVED=obkfgxjzlscungkhbyvq \
#   bash supabase/tests/run_hosted_builder_verification.sh
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

PROJECT_REF=obkfgxjzlscungkhbyvq
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ "${BOS_HOSTED_VERIFY_APPROVED:-}" != "$PROJECT_REF" ]; then
  echo "BLOCKED: set BOS_HOSTED_VERIFY_APPROVED=$PROJECT_REF to approve read-only hosted verification." >&2
  exit 3
fi

if [ -z "${BOS_HOSTED_READONLY_DSN:-}" ]; then
  echo "BLOCKED: BOS_HOSTED_READONLY_DSN is not set (no hosted credential available)." >&2
  exit 3
fi

echo "=== hosted Live Builder verification (read-only) ==="
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=20000' \
psql "$BOS_HOSTED_READONLY_DSN" \
  -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/supabase/tests/verify_hosted_live_builder_state.sql"
rc=$?

if [ "$rc" -ne 0 ]; then
  echo "HOSTED VERIFICATION FAILED (rc=$rc)" >&2
  exit 1
fi
echo
echo "HOSTED VERIFICATION COMPLETED — review section A/B verdicts above; any"
echo "'MISSING PUBLISHED VERSION', 'PUBLISHED VERSION IS NOT NEWEST' or"
echo "'PAGE KEY MISMATCH' row is a failure."
