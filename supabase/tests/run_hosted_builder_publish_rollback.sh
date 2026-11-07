#!/usr/bin/env bash
# =============================================================================
# Hosted Live Builder publish -> customer visibility -> rollback.
#
# Default mode is --plan and performs read-only verification only.
# --apply requires ALL of:
#   BOS_HOSTED_WRITE_DSN             owner/write PostgreSQL connection string
#   BOS_HOSTED_WRITE_APPROVED        obkfgxjzlscungkhbyvq
#   BOS_HOSTED_TEST_DATA_APPROVED    obkfgxjzlscungkhbyvq
#   BOS_BUILDER_TEST_ACTOR_UUID      an active verified Super Admin Auth UUID
#   BOS_BUILDER_TEST_PAGE_KEY        one of the six builder page keys
#
# The SQL test refuses to touch a page with an existing draft, appends a
# copy-published version, verifies anon visibility, appends a rollback version,
# verifies the original document is visible, and checks the audit trail. It
# deletes nothing.
#
# Usage:
#   bash supabase/tests/run_hosted_builder_publish_rollback.sh --plan
#   bash supabase/tests/run_hosted_builder_publish_rollback.sh --apply
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

PROJECT_REF=obkfgxjzlscungkhbyvq
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

case "$MODE" in
  --plan|--apply) ;;
  *) echo "BLOCKED: usage: $0 [--plan|--apply]" >&2; exit 3 ;;
esac

if [ "$MODE" = "--plan" ]; then
  if [ -z "${BOS_HOSTED_READONLY_DSN:-}" ]; then
    echo "BLOCKED: BOS_HOSTED_READONLY_DSN is not set." >&2
    exit 3
  fi
  if [ "${BOS_HOSTED_VERIFY_APPROVED:-}" != "$PROJECT_REF" ]; then
    echo "BLOCKED: set BOS_HOSTED_VERIFY_APPROVED=$PROJECT_REF for read-only planning." >&2
    exit 3
  fi
  echo "=== hosted Builder plan (read-only) ==="
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=20000' \
  psql "$BOS_HOSTED_READONLY_DSN" -v ON_ERROR_STOP=1 \
    -f "$REPO_ROOT/supabase/tests/verify_hosted_live_builder_state.sql"
  rc=$?
  [ "$rc" -eq 0 ] || { echo "HOSTED BUILDER PLAN FAILED (rc=$rc)" >&2; exit 1; }
  echo
  echo "PLAN COMPLETE — no write was attempted. Applying still requires separate"
  echo "approval for hosted migrations and test-data writes."
  exit 0
fi

if [ "${BOS_HOSTED_WRITE_APPROVED:-}" != "$PROJECT_REF" ]; then
  echo "BLOCKED: set BOS_HOSTED_WRITE_APPROVED=$PROJECT_REF." >&2
  exit 3
fi
if [ "${BOS_HOSTED_TEST_DATA_APPROVED:-}" != "$PROJECT_REF" ]; then
  echo "BLOCKED: set BOS_HOSTED_TEST_DATA_APPROVED=$PROJECT_REF." >&2
  exit 3
fi
if [ -z "${BOS_HOSTED_WRITE_DSN:-}" ]; then
  echo "BLOCKED: BOS_HOSTED_WRITE_DSN is not set." >&2
  exit 3
fi
if ! [[ "${BOS_BUILDER_TEST_ACTOR_UUID:-}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]]; then
  echo "BLOCKED: BOS_BUILDER_TEST_ACTOR_UUID must be the active verified Super Admin UUID." >&2
  exit 3
fi
case "${BOS_BUILDER_TEST_PAGE_KEY:-}" in
  pg_hostels|classes|venues|services|hotel_stay|movies) ;;
  *) echo "BLOCKED: BOS_BUILDER_TEST_PAGE_KEY must be one of the six builder pages." >&2; exit 3 ;;
esac

echo "=== hosted Builder publish/visibility/rollback (approved write test) ==="
psql "$BOS_HOSTED_WRITE_DSN" -v ON_ERROR_STOP=1 \
  -v bos_actor="$BOS_BUILDER_TEST_ACTOR_UUID" \
  -v bos_page_key="$BOS_BUILDER_TEST_PAGE_KEY" \
  -f "$REPO_ROOT/supabase/tests/hosted_builder_publish_rollback_test.sql"
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "HOSTED BUILDER WRITE TEST FAILED (rc=$rc) — transaction rolled back; inspect audit/state." >&2
  exit 1
fi
echo "HOSTED BUILDER WRITE TEST PASSED — two append-only versions were created; no row was deleted."
