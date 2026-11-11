# Mumbai Supabase migration runbook

**Target:** `obkfgxjzlscungkhbyvq` only. This runbook and
`supabase/install_mumbai_migrations.sh` do not change any hosted database until
someone separately approves and explicitly invokes `--apply`.

## Current local preflight

- `supabase/.temp/project-ref` equals the Mumbai project reference.
- `supabase/MIGRATION_MANIFEST.json` verifies the baseline plus 62 unique,
  timestamp-ordered migrations and their SHA-256 hashes.
- Local PostgreSQL 17 disposable tests applied the baseline and all 62
  migrations. This verifies local SQL execution and RLS assertions only; it is
  not evidence of the hosted database's current schema or history.
- The last owner-reported hosted history count was 53 entries including the
  baseline. It was not queried during this local-only task. If that count is
  still current, local manifest orders 54–63 are the 10 pending candidates:
  `20261105150000`, `20261105160000`, `20261105163924`, `20261105170000`,
  `20261105180000`, `20261105210000`, `20261105220000`, `20261106010000`,
  `20261106120000`, and `20261106130000`. All 10 candidate SQL checksums now
  match between the Web and Capacitor worktrees. This is a conditional plan,
  not hosted ledger verification.
- The installer plan is local and prints the full ordered manifest; it does
  not prove hosted migration history by itself.
- No verified hosted backup is available for this task. The installer refuses
  `--apply` without a fresh encrypted pre-change archive containing Auth users
  and identities and a verified restore/catalog check. No backup was created.

## Before a future hosted apply

1. Obtain explicit approval for the exact migration set and maintenance window.
2. In Supabase Dashboard and the CLI, independently confirm the selected
   project is `obkfgxjzlscungkhbyvq`. Confirm the direct database hostname is
   `db.obkfgxjzlscungkhbyvq.supabase.co`; the runner rejects any other host and
   also checks the local CLI project link.
3. Review the hosted migration history and live schema read-only. If public
   profiles already exist without the baseline marker, stop and prepare a
   reviewed history-reconciliation plan. Never infer history from filenames
   alone. For a truly new project with no migration history, the guarded runner
   creates the CLI-compatible `supabase_migrations.schema_migrations` metadata
   table only after approval, target verification, and backup verification.
4. Take and verify a protected custom-format `pg_dump` backup. The guarded
   runner requires a new `BOS_MUMBAI_BACKUP_PATH`, sets restrictive file
   permissions, creates the backup before writes, checks it with
   `pg_restore --list`, and refuses to proceed unless the archive contains the
   Auth users and identities data tables. The local recovery drill proves that
   this archive format can be restored and catalog-checked; hosted PITR status
   remains unverified.
5. Review `bash supabase/install_mumbai_migrations.sh --plan` output. Do not use
   the older Stockholm-specific runner or any Flutter tooling.
6. Only after approval, configure `BOS_MUMBAI_DATABASE_URL` without printing
   it, set both `BOS_MUMBAI_CONFIRM_REF` and `BOS_MUMBAI_APPLY_APPROVED` to the
   exact Mumbai project reference, set a new protected `BOS_MUMBAI_BACKUP_PATH`,
   then explicitly run `bash supabase/install_mumbai_migrations.sh --apply`.

The guarded manual command prompts for the direct database URL without echoing
it or placing it in shell history. Run it only after the owner explicitly
approves the hosted apply:

```bash
cd /Users/aa/Downloads/bookourspace-react
bash -c '
set -euo pipefail
read -r -s -p "Mumbai direct PostgreSQL URL (hidden input): " BOS_MUMBAI_DATABASE_URL
printf "\n"
export BOS_MUMBAI_DATABASE_URL
export BOS_MUMBAI_APPLY_APPROVED=obkfgxjzlscungkhbyvq
export BOS_MUMBAI_CONFIRM_REF=obkfgxjzlscungkhbyvq
export BOS_MUMBAI_BACKUP_PATH="$HOME/BookOurSpace_Backups/mumbai/$(date -u +%Y%m%dT%H%M%SZ)-pre-install.dump"
bash supabase/install_mumbai_migrations.sh --apply
'
```

## Order and history behavior

The runner bootstraps the CLI-compatible history table when absent, applies
`supabase/schema_and_rls.sql` only when no baseline profile table exists, then
records a reserved `00000000000000` baseline marker in Supabase migration
history. It then processes migrations by their
14-digit filename version, skips only entries whose version and name match,
and records each successful migration. It refuses mismatched entries and
stops after any SQL or history failure. Do not blindly rerun after a partial
failure; inspect the restored/changed schema and history before reconciliation.
After the 62 migrations, the installer runs
`supabase/backfill_existing_google_profiles.sql`: this inserts missing Google
profiles as customers and uses `ON CONFLICT DO NOTHING`, preserving every
existing profile's role and account state. The installer verifies the Auth user
count did not change and no Google Auth user is missing a profile.

## Post-apply verification

The runner checks the baseline marker plus 62 migration history entries,
confirms every public table has RLS, and confirms the protected user access RPC
exists. Before reopening traffic, also verify the Supabase Google callback,
RLS/profile permissions, provider ownership, bookings/cancellations/refunds,
payment authorization without moving real money, and all six marketplace
modules. Use the local regression suites for the app-side checks; use read-only
catalog queries and approved non-production Auth accounts for hosted checks.

## Failure and recovery

- The runner stops on the first failed SQL statement or history write and never
  runs a destructive rollback migration.
- Preserve the verified pre-change backup and logs in the approved secure
  operations store. Do not send database URLs or backup contents in chat.
- If a migration partially changed the target or history is inconsistent,
  stop writes and compare the schema/history with the backup. Restore the
  backup to an isolated recovery project first, validate it, then use the
  approved Supabase recovery procedure. Prefer forward corrective migrations
  after diagnosis; do not drop/recreate production tables as an automatic
  rollback.
- Re-check the target project reference before every retry.
