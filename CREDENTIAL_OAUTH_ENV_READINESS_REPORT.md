# Credential, OAuth and Production Readiness — PASS/FAIL/BLOCKED


> **POST-INSTALL UPDATE (2026-11-05):** the approved hosted first install has
> completed. Current evidence: 56 public tables, 56 RLS tables, 115 policies,
> 38 migration-history rows (baseline marker + 37), one customer profile linked
> to the one Google Auth user, and Google authorize redirect 302. See
> [HOSTED_AUTH_INSTALL_REPORT.md](HOSTED_AUTH_INSTALL_REPORT.md). Statements
> below that describe zero public tables, missing HMAC or zero GPG keys are the
> pre-install snapshot.

**Worktree:** `/Users/aa/Downloads/bookourspace-react`
**Date:** 2026-11-05 (Asia/Calcutta)
**Project:** `obkfgxjzlscungkhbyvq` (Mumbai, `ap-south-1`)

**No hosted write, migration, backup, OAuth setting change, push, merge or deployment was performed.**
No credential, key, token or connection URI is printed in this report.

---

## 1. Temporary credential helper — PASS (retired) · BLOCKED (legacy snapshots)

### Retired

`scripts/mumbai_temp_credential_preflight.mjs` and its `.sh` wrapper no longer
prompt, read/write `.env`, create snapshots, spawn a process or connect. Both
exit **17** with replacement instructions.

New regression test:

```text
bash supabase/tests/temp_credential_retirement_test.sh
PASS  mjs helper exits 17 as retired
PASS  mjs helper does not echo credential input
PASS  wrapper exits 17 without prompting
PASS  .env was not modified
PASS  no new env snapshot was created
PASS  retired helper has no file or process API
passed=6 failed=0
```

No plaintext snapshot is created by the retired helper.

### Remaining legacy snapshots — BLOCKED

`bash scripts/audit_plaintext_credentials.sh` (names/modes/sizes only, no
contents) finds **13 legacy plaintext credential snapshots**:

- `.env.save`
- `.env.local.stockholm`
- `.env.local.mumbai`
- `.env.local.mumbai.pre-mumbai-key-20261104T174243`
- `.env.local.pre-mumbai-key-20261104T174243`
- eight files under `~/BookOurSpace_Backups/env/` (`.env*.bak`)

All are mode `600`; access restriction is **not encryption**. No snapshot was
deleted, moved, encrypted or read during this pass because no owner key exists
and no destructive credential action was approved. Owner cleanup is specified in
[OWNER_GPG_KEY_SETUP.md](OWNER_GPG_KEY_SETUP.md).

---

## 2. Google OAuth reconciliation — PASS (configuration) · BLOCKED (login proof)

Read-only hosted evidence:

```text
GET https://obkfgxjzlscungkhbyvq.supabase.co/auth/v1/settings → 200
google: true
email: false
phone: false
anonymous_users: false
```

Read-only REST probes:

```text
public.listings            404 PGRST205
public.profiles            404 PGRST205
public.live_edit_audit_events 404 PGRST205
```

Prior successful read-only preflight: PostgreSQL 17.11, **one Google Auth user**,
**one Google identity**, zero public tables.

Offline audit:

```text
npm run audit:oauth
PASS: 0 failed check(s). No credential was printed and no network call was made.
```

The historical `GOOGLE_OAUTH_MUMBAI_REPORT.md` described the retired project
`sfoizxarbljhldmkgsma`; it is marked **SUPERSEDED**.

- **PASS:** current Mumbai Auth is Google-only/enabled; Email/Phone/anonymous are
  disabled; callback, redirect, frontend-secret and role-authority checks pass.
- **BLOCKED:** no end-to-end Google login was run, and the prior user/identity
  count could not be re-queried because the Keychain item
  `bos-production-backup` did not yield a usable URI to the noninteractive shell.
  No credential or setting was changed.

Details: [OAUTH_AND_PRODUCTION_ENV_RECONCILIATION.md](OAUTH_AND_PRODUCTION_ENV_RECONCILIATION.md).

---

## 3. Production environment requirements — PASS (inventory) · BLOCKED (startup)

Actual code requirements and current presence (values not printed):

| Variable | Requirement | Current |
|---|---|---|
| `BOS_SERVER_HMAC_SECRET` | Required in production; generate locally | **missing** |
| `BOS_LISTINGS_DATABASE_URL` | Intended PostgreSQL selector | **missing** |
| `APP_URL` | Stable origin/OAuth/webhooks | **missing** |
| `VITE_SUPABASE_URL` | Public frontend config | present |
| `VITE_SUPABASE_PROJECT_ID` | Public frontend config | present |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public frontend config | present |
| `BOS_ADMIN_PASSCODE` | **Not consumed by current code** | missing — do not generate |
| `SUPABASE_SERVICE_ROLE_KEY` | Not consumed by current app | missing — never put in Vite |
| `GOOGLE_CLIENT_SECRET` | Not consumed by current app | missing — hosted Supabase only |
| `BOS_BACKUP_GPG_RECIPIENT` | Hosted encryption | missing |
| `GEMINI_API_KEY` | Optional AI | missing |
| `RAZORPAY_*` | Optional payments | missing |

### Critical blocker

Production startup fails before any secret can help:

```text
NODE_ENV=production npx tsx server.ts
Error: AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION:
configure and wire a verified transactional PostgreSQL repository before
starting the production server.
```

The PostgreSQL selector is also rejected in production:

```text
NODE_ENV=production BOS_LISTINGS_DATABASE_URL=... ProviderListingRepository.fromEnvironment()
→ BOS_LISTINGS_POSTGRES_REPOSITORY_LOCAL_ONLY
```

**No environment secret can make production start until the production
persistence adapter/policy is implemented and tested.** This is a code/deployment
blocker, not a missing secret. Reported **BLOCKED**.

### Secrets to generate locally

| Secret | Local generation |
|---|---|
| `BOS_SERVER_HMAC_SECRET` | `openssl rand -hex 32` |
| `BOS_PAYMENT_SANDBOX_SECRET` (non-production only) | `openssl rand -hex 32` |
| `BOS_CINEMA_POS_KEY` (only if enabled) | `openssl rand -hex 32` |
| `NPCI_LIVE_WEBHOOK_SECRET` (only if enabled) | `openssl rand -hex 32` |
| Owner GPG key | `gpg --quick-generate-key ...` — see owner guide |
| Database password | Generate/rotate in Supabase, not in Git |

Provider-issued, **not** locally generated: Razorpay keys/webhook, Gemini API
key, Google OAuth client secret, Supabase publishable key.

Do **not** generate `BOS_ADMIN_PASSCODE` for this codebase; the old passcode gate
was removed. Stale docs were corrected.

---

## 4. Owner GPG key — PASS (instructions/test harness) · BLOCKED (no owner key)

- Owner keyring path: `~/.config/bookourspace/backup-gnupg` — directory exists,
  **0 keys**.
- `BOS_BACKUP_GPG_RECIPIENT` is unset.
- Instructions and exact commands: [OWNER_GPG_KEY_SETUP.md](OWNER_GPG_KEY_SETUP.md).
- Round-trip test: `supabase/tests/owner_gpg_test.sh`.
  - Real owner key: **BLOCKED (exit 2)** — no recipient/key.
  - Throwaway test key: **PASS** — encrypt, decrypt, checksum compared; no key
    material printed:
    ```text
    encrypted archive decrypts cleanly
    decrypt round-trip reproduces the recorded plaintext checksum
    PASS: owner key encrypted, decrypted and reproduced the test checksum.
    ```

Owner action: create the key, record the fingerprint, store the passphrase in
Keychain, export the secret key only to offline media, then run the test with
`BOS_BACKUP_GPG_RECIPIENT=<FPR>`.

---

## 5. Reconfirmation — PASS

| Check | Result |
|---|---|
| `node supabase/tests/migration_manifest.mjs` | **PASS** — baseline + 37 migrations, unique versions, SHA-256 match |
| `bash supabase/tests/backup_guards_test.sh` | **PASS** — 5/5; encryption required before connection; plaintext archive rejected |
| `bash supabase/tests/run_backup_recovery_drill.sh` | **PASS** — dump, clean restore, catalog/RLS/policy/privacy match, Auth preserved |
| `bash supabase/tests/run_live_edit_security.sh` | **PASS** — **19/19**, 0 fail |
| `bash supabase/tests/temp_credential_retirement_test.sh` | **PASS** — 6/6 |
| `npm run audit:oauth` | **PASS** — 0 failures, offline |

Live Edit remains unchanged at 19/19 and 37 verified migrations.

---

## 6. Exact owner actions

1. **Legacy snapshots:** rotate/revoke credentials in the 13 snapshots, then with
   owner approval encrypt them with the owner key and remove plaintext, or
   securely delete them. Re-run `bash scripts/audit_plaintext_credentials.sh`
   until it exits 0. Do not delete active `.env`/`.env.local` before the
   replacement credential is verified.
2. **OAuth:** keep the current Google-only hosted configuration; approve/run an
   end-to-end Google sign-in if login proof is required. Do not toggle providers
   without approval.
3. **Production persistence:** implement and test the production PostgreSQL
   adapter/policy before deployment. Do not expect any secret to bypass
   `AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION`.
4. **Generate** `BOS_SERVER_HMAC_SECRET` locally; store it only in the deployment
   secret manager or ignored env. Do **not** generate `BOS_ADMIN_PASSCODE`.
5. **Set** `APP_URL` to the production origin and configure
   `BOS_LISTINGS_DATABASE_URL` once the production adapter accepts it.
6. **Owner GPG:** complete `OWNER_GPG_KEY_SETUP.md` and run
   `BOS_BACKUP_GPG_RECIPIENT=<FPR> bash supabase/tests/owner_gpg_test.sh`.
7. **No hosted writes/backups/migrations** until the separate approval gates in
   [HOSTED_FIRST_INSTALL_READINESS.md](HOSTED_FIRST_INSTALL_READINESS.md) are met.