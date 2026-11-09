#!/usr/bin/env bash
# =============================================================================
# DISABLED — this script is retired. It is kept only so existing docs and habits
# fail loudly instead of silently dumping the wrong project.
#
# Why it is disabled:
#   * it pinned PROD_REF to the LEGACY Stockholm project
#     (ezrxykyocgbolpaebnqx) and bypassed supabase/tests/lib/bos_target_guard.sh,
#     so it could never dump the approved React project
#     (obkfgxjzlscungkhbyvq) and was willing to dump a retired one;
#   * it wrote a plaintext dump and had no Auth-preservation assertions.
#
# Use one of these instead (both are guarded, encrypted and restore-verified):
#   supabase/tests/run_dev_backup.sh           approved React target, encrypted
#   supabase/tests/backup_production_readonly.sh  production path, encrypted
#
# This file reads no environment variable, connects to nothing and writes
# nothing.
# =============================================================================
set -uo pipefail

cat >&2 <<'MSG'
BLOCKED: scripts/backup_database.sh is retired and cannot be used.

  It pinned the legacy project (ezrxykyocgbolpaebnqx), bypassed the approved-target
  guard, wrote plaintext dumps and did not verify Auth preservation.

  Use one of these instead:
    bash supabase/tests/run_dev_backup.sh
    bash supabase/tests/backup_production_readonly.sh <archive-directory>

  Both require BOS_BACKUP_AUTHORIZED=backup-only, an exact ref confirmation and
  BOS_BACKUP_GPG_RECIPIENT, and both refuse any project other than
  obkfgxjzlscungkhbyvq. No connection was attempted.
MSG
exit 17
