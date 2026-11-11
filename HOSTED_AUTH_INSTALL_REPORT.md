# Hosted Auth First Install — Completion Report

**Project:** `obkfgxjzlscungkhbyvq` (Mumbai, `ap-south-1`)
**Date:** 2026-11-05 (Asia/Calcutta)
**Approval:** explicit hosted first-install approval + approval to generate a temporary owner key.

**No push, merge or deployment was performed.** No credential, key or connection URI is printed.

---

## 1. Result

| Item | Result |
|---|---|
| Encrypted pre-change backup | **PASS** |
| Baseline + 37 migrations | **PASS** |
| Google profile backfill | **PASS** (after schema-compatibility fix) |
| Migration history reconciliation | **PASS** — 37 hosted rows match 37 local migrations; baseline marker `00000000000000` also present |
| Public schema | **PASS** — 56 tables, 56 RLS-enabled, 115 policies |
| Auth user/identity preservation | **PASS** — 1 user, 1 Google identity |
| Profile linked to Auth user | **PASS** — 1 customer profile, active, verified, Google subject present |
| Google provider configuration | **PASS** — enabled; Email/Phone/anonymous disabled; authorize redirects to Google |
| Browser Google login proof | **BLOCKED** — not run |
| Production deployment | **BLOCKED** — persistence policy |

### Evidence

```text
auth_users=1 | identities=1 | profiles=1
role=customer | status=active | google_sub=1
public tables=56 | RLS=56 | policies=115
migration history rows=38 (baseline marker + 37)
cinema_screens rows=5
live_edit_audit_events / screen owners / cinema screens present
on_auth_user_created trigger present

GET /auth/v1/settings → 200
google=true email=false phone=false anonymous=false
GET /auth/v1/authorize?provider=google → 302 to accounts.google.com

compare_migration_history.sh:
local migrations: 37
hosted rows:      37
MATCH: every local migration version/name exists in hosted history and nothing is extra
```

---

## 2. Encrypted backups retained

All encrypted with the temporary owner key; plaintext dumps were removed.

```text
~/BookOurSpace_Backups/react/20261104T213743Z-first-install-prechange/
  backup.dump.gpg
  encryption.txt
  restore-verification.txt
  ...
~/BookOurSpace_Backups/react/20261104T213817Z-first-install/
  installer-prechange.dump.gpg
~/BookOurSpace_Backups/react/20261104T214137Z-first-install-final/
  post-install-verification.dump.gpg
```

The pre-change archive records one Auth user, one Google identity, zero public
tables, and a successful isolated restore. The strict archive verifier passed
(`--require-encryption`, fresh at the time).

---

## 3. Backfill bug found and fixed

The first installer run applied all 37 migrations but stopped at the profile
backfill:

```text
ERROR: column identities.last_sign_in does not exist
HINT: Perhaps you meant identities.last_sign_in_at
```

The helper test fixtures used `last_sign_in`, while hosted Supabase exposes
`last_sign_in_at`. The backfill now reads either column through JSON:

```sql
order by coalesce(
  (to_jsonb(identities)->>'last_sign_in_at')::timestamptz,
  (to_jsonb(identities)->>'last_sign_in')::timestamptz
) desc nulls last
```

It remains idempotent (`on conflict (id) do nothing`) and preserves existing
roles/statuses. Local staging dry run passed; hosted re-run inserted one profile
then inserted zero on a repeat. The final guarded installer run exited **0**:

```text
APPLY COMMANDS COMPLETED. History, RLS, role RPC, and backup checks passed.
Verify Auth callback and six-module booking/payment smoke tests before release.
```

---

## 4. Environment changes

- The provided `VITE_SUPABASE_URL`, project ID and publishable key already
  matched the checkout; no public value was changed.
- `BOS_SERVER_HMAC_SECRET` was generated locally (`openssl rand -hex 32`) and
  appended to ignored `.env.local` with mode `600`. It is not printed here.
- The temporary hosted DB URI was stored in macOS Keychain service
  `bos-production-backup`, account `readonly`.
- It is also available to operational scripts through the ignored `.env.local`:
  `BOS_HOSTED_DATABASE_URL`, `BOS_MUMBAI_DATABASE_URL`,
  `BOS_BACKUP_GPG_RECIPIENT` and `BOS_BACKUP_GNUPGHOME`.
  `BOS_LISTINGS_DATABASE_URL` remains intentionally unset because the current
  runtime rejects remote/production PostgreSQL selectors.
- A read-only preflight launched **directly from `.env.local`** passed:
  `auth_users=1`, `google_auth_user=1`, `migration_history=38`.
- `BOS_LISTINGS_DATABASE_URL` was deliberately **not** set to the hosted URI:
  the current code rejects a non-local selector in development and rejects the
  PostgreSQL selector entirely in production.

---

## 5. Security follow-up — required

1. **Rotate the temporary database password now.** It was shared in chat. After
   rotation, update the Keychain item `bos-production-backup` and any deployment
   secret. Until rotated, treat it as exposed.
2. **Take custody of the temporary GPG key.** It lives in
   `~/.config/bookourspace/backup-gnupg`; its passphrase is in Keychain service
   `bos-backup-gpg-passphrase`. Export the secret key to offline media, keep two
   copies, and replace it with the owner’s long-term key when ready:
   ```bash
   export GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg"
   FPR="$(cat "$GNUPGHOME/recipient.fpr")"
   gpg --export-secret-keys --armor "$FPR" > /Volumes/OFFLINE/bos-temp-backup-secret.asc
   ```
   Do not delete this key until the encrypted backups are independently
   recoverable and a replacement owner key is in place.
3. **Legacy plaintext snapshots remain:** 13 `.env`/`.bak` files. Follow
   [OWNER_GPG_KEY_SETUP.md](OWNER_GPG_KEY_SETUP.md) and
   `bash scripts/audit_plaintext_credentials.sh` until it exits 0.
4. **Production startup remains blocked.** Do not deploy until the production
   persistence adapter/policy is implemented and tested:
   ```text
   AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION
   BOS_LISTINGS_POSTGRES_REPOSITORY_LOCAL_ONLY
   ```
5. **Run browser login proof.** The provider and profile are ready; an actual
   Google consent/login and post-login `/auth/callback` have not been exercised.

---

## 6. Remaining blockers

| Item | Status |
|---|---|
| End-to-end browser Google login | BLOCKED — not run |
| Production server startup | BLOCKED — persistence policy |
| PITR/recovery window verification | BLOCKED — requires project management access |
| Live payment/refund provider verification | BLOCKED — no provider credentials |
| Legacy plaintext snapshots | BLOCKED — 13 files; owner cleanup |
| Six-module hosted booking/payment smoke tests | BLOCKED — not run |

---

## 7. Verdict

Hosted authentication is now **provisioned and verified at the database/provider
level**: the schema exists, the existing Google user has an active customer
profile, future Auth inserts have the trigger, and Google authorization redirects
correctly. It is **not yet proven end-to-end in a browser**, and production
deployment is still blocked by the persistence policy.

No push, merge or deployment occurred.
