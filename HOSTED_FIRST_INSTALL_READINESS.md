# Hosted First-Install Readiness Checklist

**Project:** BookOurSpace React — Mumbai `obkfgxjzlscungkhbyvq`
**Target profile:** `supabase/backup/react-target.conf` (`ap-south-1`)
**Date:** 2026-11-05
**Status:** hosted first install **COMPLETED 2026-11-05**; Auth profile provisioned. Production deployment remains blocked by the persistence policy. See [HOSTED_AUTH_INSTALL_REPORT.md](HOSTED_AUTH_INSTALL_REPORT.md).

The first install and encrypted pre-change backups were performed under explicit approval. No push, merge or deployment was performed.

---

## 0. Current evidence snapshot

| Gate | Status | Evidence |
|---|---|---|
| Migration inventory / SHA-256 | **PASS** | `node supabase/tests/migration_manifest.mjs` → baseline + 37 migrations, unique versions, SHA-256 match; baseline SHA-256 `6d4c2d0ffee3c5b2f231b64ea5827384c06bfb87943b1ec84f5a1fe46b3a1a8c` |
| Mumbai preflight port quoting | **PASS** | mock + real libpq parser tests: unquoted `port=5432` accepted; quoted `port='5432'` rejected |
| Live Edit security | **PASS** | 19/19 backend HTTP/database security tests and 20/20 audit SQL assertions rerun on PostgreSQL 17.11 |
| Full local SQL/HTTP validation | **PASS** | `bash supabase/tests/run_local_validation.sh` → ALL CHECKS PASSED |
| Local backup/recovery drill | **PASS** | `bash supabase/tests/run_backup_recovery_drill.sh` → dump, clean restore, catalog/RLS/policy/privacy match |
| Encrypted production backup pipeline | **PASS (local self-test)** | throwaway test-only GPG key + disposable DB → encrypted archive, Auth and Storage metadata restored/count-matched; includes a zero-public-table first-install case |
| Backup guard regressions | **PASS** | `bash supabase/tests/backup_guards_test.sh` → 5/5; plaintext archive rejected, both hosted paths refuse before connecting without a key |
| Dev backup pipeline | **PASS (local self-test)** | throwaway test-only GPG key, encrypted dump, SHA-256, isolated Auth/Storage metadata restore; first-install zero-public-table case included |
| Storage metadata backup checks | **PASS (local fixtures)** | source/restored Storage table, bucket and object-row counts are compared; TOC must contain bucket/object metadata data when the schema exists |
| Keychain credential safety | **PASS (mocked guard tests)** | approval precedes lookup; password removed from DSN/argv and held in process memory; no URI/password printed |
| Target/guard dry-run | **PASS** | `bash supabase/tests/run_target_guard_dryrun.sh` → 24/24 |
| Hosted read-only identity preflight | **PASS** | project `obkfgxjzlscungkhbyvq`, PostgreSQL 17.11, one Auth user and Google identity before install; zero public tables |
| Local Keychain-backed target check | **BLOCKED** | `bos-production-backup` item metadata exists, but its password field is empty; no URI was retrieved and no connection was attempted |
| Owner GPG key | **BLOCKED** | configured keyring exists with mode 700 outside the repository, but contains no secret key; no owner key was generated |
| Hosted first install | **PASS (completed)** | baseline + 37 migrations; 56 public tables, 56 RLS, 115 policies, 38 history rows (baseline marker + 37), 1 profile |
| Hosted backup | **PASS** | encrypted pre-change archives taken; one Auth user/identity preserved; plaintext removed |
| Hosted PITR/recovery-point verification | **BLOCKED** | requires project management access |
| Google OAuth in Mumbai | **PASS (config)** · **BLOCKED (login proof)** | read-only Auth settings 2026-11-05: Google enabled, Email/Phone disabled, anonymous disabled; prior preflight found one Google user/identity |
| Server HMAC | **PASS (local)** | `BOS_SERVER_HMAC_SECRET` generated locally into ignored `.env.local`; production startup still blocked |
| Production server startup | **BLOCKED** | unconditional `AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION` guard; production PostgreSQL selector is rejected (`BOS_LISTINGS_POSTGRES_REPOSITORY_LOCAL_ONLY`) |
| Legacy plaintext credential snapshots | **BLOCKED** | 13 legacy `.env`/`.bak` files remain; helper retired; owner cleanup not approved |

The hosted state is a first install. No profile table exists yet, so the existing
Google user’s customer profile must be created only after the baseline and
migrations, through the separately gated, idempotent Google profile backfill.

---

## 1. Remaining owner approvals

- [x] Read-only preflight completed (owner-confirmed evidence above).
- [ ] Separate written approval for a **hosted backup**.
- [ ] Separate written approval for **schema/migration apply**.
- [ ] Separate written approval for the **Google profile backfill**.
- [ ] A named rollback owner and maintenance window.

The installer requires all four independent gates:

| Gate | Variable |
|---|---|
| Read-only preflight | `BOS_MUMBAI_READONLY_PREFLIGHT_APPROVED=obkfgxjzlscungkhbyvq` |
| Migration apply | `BOS_MUMBAI_APPLY_APPROVED=obkfgxjzlscungkhbyvq` |
| Profile backfill | `BOS_MUMBAI_PROFILE_BACKFILL_APPROVED=obkfgxjzlscungkhbyvq` |
| Exact target confirmation | `BOS_MUMBAI_CONFIRM_REF=obkfgxjzlscungkhbyvq` |

No approval variable should be set in `.env`; set them only in the approved shell.

---

## 2. Credentials and encryption readiness

- [ ] The existing **read-only** PostgreSQL URI is retrievable from the `bos-production-backup` Keychain item. Item metadata exists, but its password field was empty in this check. Re-save the existing working credential into that item; do not rotate it.
- [ ] A migration-capable credential exists but is not placed in `.env`.
- [ ] The Supabase CLI is linked to the approved project:
  `cat supabase/.temp/project-ref` → `obkfgxjzlscungkhbyvq`.
- [ ] An owner OpenPGP secret key exists in the mode-700 keyring
  `~/.config/bookourspace/backup-gnupg`, outside this repository and outside
  `~/BookOurSpace_Backups`. The directory exists; no secret key is present.
- [ ] The fingerprint is recorded in the owner runbook, not in the repository.
- [ ] `BOS_BACKUP_GPG_RECIPIENT` is available only in the approved shell.
- [ ] macOS Keychain (or an approved secret store) holds the credential; do not
  paste a URI into `MUMBAI_DB_PASSWORD` or commit `.env` snapshots.
- [ ] `gpg`, `pg_dump`, `pg_restore`, `psql` and Node are installed and their
  versions recorded.

Create the owner key yourself in Terminal; no key was generated automatically.
Choose an OpenPGP key with encryption capability, set an expiration, and enter
a strong passphrase in the GPG prompt. Do not put the passphrase on a command
line or in a file:

```bash
install -d -m 700 "$HOME/.config/bookourspace/backup-gnupg"
export GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg"
gpg --full-generate-key
gpg --list-secret-keys --keyid-format long
# copy the full primary fingerprint into the owner-only runbook
```

After creation, export a passphrase-protected recovery copy to an encrypted
offline/removable volume outside the repository and backup archive, with mode
600. Import that copy into a temporary isolated GPG home and verify it can
decrypt a disposable test ciphertext before relying on it. Do not email or
upload the recovery copy. Recovery-export/decryption checks are currently
**BLOCKED** because this keyring has no secret key.

---

## 3. Pre-change: freeze, verify inventory, verify Auth

- [ ] Freeze application writes and stop concurrent migration edits.
- [ ] Re-run the manifest **after** the freeze (checked twice during readiness; both PASS):

```bash
node supabase/tests/migration_manifest.mjs
# expected: baseline + 37 migrations, unique versions, sha256 match
```

- [ ] Confirm the installer plan matches the manifest:

```bash
bash supabase/install_mumbai_migrations.sh --plan
```

- [ ] Record the current live state (read-only):

```bash
BOS_MUMBAI_READONLY_PREFLIGHT_APPROVED=obkfgxjzlscungkhbyvq \
BOS_MUMBAI_DATABASE_URL='<read-only URI from Keychain>' \
  bash supabase/tests/mumbai_readonly_identity_preflight.sh
```

This checks `auth.users`, `auth.identities`, public catalog/RLS/trigger state,
migration history, and proves the session is read-only. It must report PASS
before a backup is taken.

---

## 4. Encrypted hosted backup + Auth identity verification (separate approval)

The approved backup command will use the existing Keychain item directly; it
does not place the URI in the command line or write it to a file. The script
keeps a password-free DSN and the password in process memory only. This command
is a template and must not be run until the owner key and backup approval exist:

```bash
BOS_BACKUP_AUTHORIZED=backup-only \
BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq \
BOS_BACKUP_KEYCHAIN_SERVICE=bos-production-backup \
BOS_BACKUP_GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg" \
BOS_BACKUP_GPG_RECIPIENT='<verified owner-key fingerprint>' \
  bash supabase/tests/backup_production_readonly.sh \
    "$HOME/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-$(date -u +%Y%m%dT%H%M%SZ)"
```

Required results:

- [ ] `identity-preflight.txt` shows the approved project/database and read-only session.
- [ ] dump contains `auth.users` **and** `auth.identities` table data, with source/restored counts equal.
- [ ] Storage bucket/object metadata table data and row counts match on isolated restore when the Storage schema is available.
- [ ] A first-install archive with zero public tables is valid when the Auth tables and identities restore exactly.
- [ ] isolated restore reproduces the exact Auth user/identity counts.
- [ ] plaintext `backup.dump` is removed; only `backup.dump.gpg` remains.
- [ ] `encryption.txt` names the owner fingerprint; private key was never exported.
- [ ] `SHA256SUMS` verifies every artefact.
- [ ] independent archive verifier passes in strict mode:

```bash
bash supabase/tests/verify_backup_archive.sh \
  "$HOME/BookOurSpace_Backups/react/<UTC-stamp>" \
  obkfgxjzlscungkhbyvq --require-encryption --max-age-hours 24
```

- [ ] the checksum file is copied to the owner’s offline evidence store.
- [ ] rollback owner confirms the archive can be decrypted and restored.

**BLOCKED until the backup approval is given.** No backup was taken during
readiness preparation.

The PostgreSQL archive contains database schemas and Storage metadata visible
to the database role; it does not contain Storage object bytes. Any existing
Storage objects need a separate approved object export/restore plan. The
retired `scripts/backup_database.sh` cannot create backups; disposable local
recovery drills are test fixtures, not hosted backup routes.

---

## 5. First install (separate approval)

Do not run without the encrypted backup and all four approval gates.

```bash
BOS_MUMBAI_APPLY_APPROVED=obkfgxjzlscungkhbyvq \
BOS_MUMBAI_PROFILE_BACKFILL_APPROVED=obkfgxjzlscungkhbyvq \
BOS_MUMBAI_CONFIRM_REF=obkfgxjzlscungkhbyvq \
BOS_MUMBAI_DATABASE_URL="$(security find-generic-password -s bos-production-backup -w)" \
BOS_MUMBAI_BACKUP_PATH="$HOME/BookOurSpace_Backups/react/<UTC-stamp>/pre-install.dump.gpg" \
BOS_BACKUP_GPG_RECIPIENT='<owner fingerprint>' \
  bash supabase/install_mumbai_migrations.sh --apply
```

The installer must:

- [ ] verify the manifest and local CLI project link before connecting;
- [ ] accept only direct Mumbai or Mumbai session-pooler target shape;
- [ ] require an encrypted `.gpg` pre-change backup outside the repository;
- [ ] verify `auth.users` and `auth.identities` are present before any write;
- [ ] apply baseline first, then migrations in manifest order;
- [ ] record migration history and Auth counts;
- [ ] apply the Google profile backfill only under its separate approval;
- [ ] stop on any failure rather than continuing partially.

---

## 6. Post-install verification

- [ ] `migration_manifest` history count = 38 entries (baseline marker + 37 migrations).
- [ ] `public.profiles`, `public.listings`, Live Edit tables, `public.cinema_screens`
      exist; RLS enabled on every public table.
- [ ] Live Edit tables/functions/permissions match `supabase/tests/live_edit_audit_test.sql`
      expectations after owner verification.
- [ ] Super Admin bootstrap is performed only by the documented owner-controlled
      process; no client role selector grants authority.
- [ ] Create a test listing in each of the six modules; verify verified permissions,
      PostgreSQL persistence, audit rows, and realtime.
- [ ] Verify cinema screens: owner assignment, provider edit, non-owner denial,
      concurrent edit 409, audit row.
- [ ] Verify booking/payment smoke paths (no payment credentials were changed).
- [ ] Record `auth.users` / `auth.identities` counts and compare with the backup.
- [ ] Confirm PITR window and latest recovery point in the Mumbai dashboard; if
      management access is unavailable, report **BLOCKED**, do not guess.
- [ ] Re-run `node supabase/tests/migration_manifest.mjs` after installation.

---

## 7. Application environment (set only after DB verification)

| Variable | Required | Current |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | present |
| `VITE_SUPABASE_PROJECT_ID` | yes | present |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | present |
| `BOS_LISTINGS_DATABASE_URL` | local/dev selector; **production currently rejects it** | **missing / blocked** |
| `BOS_SERVER_HMAC_SECRET` | yes for durable signed sessions/passes; generate locally | **present locally (64 hex)** |
| `BOS_ADMIN_PASSCODE` | **not consumed by current code** — stale docs only | do not generate |
| `APP_URL` | yes for stable origin/OAuth/webhooks | **missing** |
| Google OAuth enabled in Mumbai Auth | yes for sign-in | **enabled; authorize endpoint 302 to Google; browser login proof not run** |

Never place service-role keys or database passwords in `VITE_*` variables.

---

## 8. Rollback plan

- [ ] The encrypted pre-change archive and checksum are available offline.
- [ ] The decryption key is available only to the rollback owner.
- [ ] The rollback owner can restore into a clean disposable database first.
- [ ] Application traffic is frozen before restore.
- [ ] Forward-only corrective migrations are preferred after a partially applied
      migration; a full restore requires explicit owner approval.
- [ ] After restore, re-run Auth count and RLS/policy comparisons before reopening.

---

## 8a. Owner GPG and plaintext credential cleanup

- [ ] Create the owner OpenPGP key outside the repository and outside
      `~/BookOurSpace_Backups`; follow `OWNER_GPG_KEY_SETUP.md`.
- [ ] Test owner-key encryption/decryption:
      `BOS_BACKUP_GPG_RECIPIENT=<FPR> bash supabase/tests/owner_gpg_test.sh`.
- [ ] Retire the temporary credential helper (already disabled; exits 17).
- [ ] Run `bash scripts/audit_plaintext_credentials.sh`. It currently reports
      **13 legacy plaintext snapshots**:
      `.env.save`, `.env.local.stockholm`, `.env.local.mumbai`,
      `.env.local.mumbai.pre-mumbai-key-*`, `.env.local.pre-mumbai-key-*`, and
      eight `~/BookOurSpace_Backups/env/*.bak` files.
- [ ] Rotate/revoke credentials present in those snapshots.
- [ ] With owner approval, encrypt the snapshots with the owner key and remove
      plaintext, or securely delete them through the owner procedure.
- [ ] Re-run the audit until it prints
      `PASS: no legacy plaintext credential snapshots found`.
- [ ] Keep active `.env`/`.env.local` mode `600` and git-ignored.

## 8b. OAuth and production-environment reconciliation

- [ ] Read-only Auth evidence: Google enabled, Email/Phone disabled, anonymous
      disabled (2026-11-05). Do not change hosted settings without approval.
- [ ] Prior read-only preflight: one Google Auth user, one Google identity, zero
      public tables. The fresh database re-query was blocked because the Keychain
      item did not yield a usable URI; do not guess.
- [ ] Production startup is **BLOCKED** by the persistence policy, not by a
      missing secret. Do not deploy until the production PostgreSQL adapter is
      implemented and tested.
- [ ] Generate only `BOS_SERVER_HMAC_SECRET` (and optional integration secrets)
      locally. Do **not** generate `BOS_ADMIN_PASSCODE`; current code does not
      consume it.
- [ ] Set `APP_URL` to the production origin; set `BOS_LISTINGS_DATABASE_URL`
      only when the production adapter accepts it.
- [ ] Never place `SUPABASE_SERVICE_ROLE_KEY` or `GOOGLE_CLIENT_SECRET` in any
      `VITE_*` variable or frontend file.

## 9. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Owner / Super Admin | | APPROVED / REJECTED | |
| Rollback owner | | APPROVED / REJECTED | |
| Security reviewer | | APPROVED / REJECTED | |

Backup/preflight evidence: [MUMBAI_BACKUP_HARDENING_REPORT.md](MUMBAI_BACKUP_HARDENING_REPORT.md)

Credential/OAuth/env evidence: [CREDENTIAL_OAUTH_ENV_READINESS_REPORT.md](CREDENTIAL_OAUTH_ENV_READINESS_REPORT.md)

**Readiness verdict:** hosted read-only identity preflight **PASS**; encrypted
pre-change backups **PASS**; first install **PASS** (56 tables, 56 RLS, 38
history rows, one customer profile). Auth provider configuration and Google
authorize redirect **PASS**. Remaining blockers: production server startup
(persistence policy), end-to-end browser login proof, PITR/recovery-point
verification, and legacy plaintext snapshot cleanup. No push, merge or
deployment was performed.
