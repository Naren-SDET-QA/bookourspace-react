#!/usr/bin/env bash
# =============================================================================
# RETIRED — wrapper for the temporary Mumbai credential updater.
#
# The underlying helper no longer prompts, writes .env, creates plaintext
# credential snapshots or connects to a database. This wrapper is kept only so
# old commands fail loudly with the approved replacement instructions.
# =============================================================================
set -uo pipefail
umask 077

cat >&2 <<'MSG'
BLOCKED: scripts/mumbai_temp_credential_preflight.sh is retired.

  No password prompt was shown, no .env file was read or written, no plaintext
  snapshot was created and no connection was attempted.

  Use the Keychain-backed credential and the approved scripts:
    security add-generic-password -U -a "$USER" -s bos-production-backup -w
    supabase/tests/mumbai_readonly_identity_preflight.sh
    supabase/tests/backup_production_readonly.sh <archive-directory>
    supabase/install_mumbai_migrations.sh --plan|--apply

  Existing plaintext snapshots are listed in the owner cleanup checklist at
  HOSTED_FIRST_INSTALL_READINESS.md.
MSG
exit 17
