#!/usr/bin/env node
// =============================================================================
// RETIRED — temporary Mumbai credential updater.
//
// This helper previously prompted for a database password, wrote it into .env,
// and left a plaintext `.env` snapshot under ~/BookOurSpace_Backups/env. That is
// no longer an allowed credential path.
//
// It now reads no file, writes no file, starts no process and connects to
// nothing. Use the macOS Keychain-backed credential and the approved read-only
// or encrypted backup scripts instead.
//
// See: BACKUP_TARGET_HARDENING.md, HOSTED_FIRST_INSTALL_READINESS.md
// =============================================================================
console.error(`BLOCKED: scripts/mumbai_temp_credential_preflight.mjs is retired.

  It previously persisted a temporary database password in .env and kept a
  plaintext .env backup containing credentials. It no longer reads or writes
  any file and makes no connection.

  Approved credential path:
    1. Store the full connection URI in macOS Keychain:
         security add-generic-password -U -a "$USER" -s bos-production-backup -w
    2. Use the read-only/backup/install scripts, which load the Keychain item
       without printing it:
         supabase/tests/mumbai_readonly_identity_preflight.sh
         supabase/tests/backup_production_readonly.sh <archive-directory>
         supabase/install_mumbai_migrations.sh --plan|--apply

  If an old plaintext .env or ~/BookOurSpace_Backups/env snapshot still exists,
  see the owner cleanup checklist in HOSTED_FIRST_INSTALL_READINESS.md.
`);
process.exit(17);
