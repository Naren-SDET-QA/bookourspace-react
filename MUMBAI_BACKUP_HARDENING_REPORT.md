# Mumbai Preflight, Backup Hardening and First-Install Readiness — Evidence


> **POST-INSTALL UPDATE (2026-11-05):** the approved hosted first install has
> completed. Current evidence: 56 public tables, 56 RLS tables, 115 policies,
> 38 migration-history rows (baseline marker + 37), one customer profile linked
> to the one Google Auth user, and Google authorize redirect 302. See
> [HOSTED_AUTH_INSTALL_REPORT.md](HOSTED_AUTH_INSTALL_REPORT.md). Statements
> below that describe zero public tables, missing HMAC or zero GPG keys are the
> pre-install snapshot.

**Worktree:** `/Users/aa/Downloads/bookourspace-react`
**Date:** 2026-11-05 (Asia/Calcutta)
**Hosted target:** `obkfgxjzlscungkhbyvq` (Mumbai, `ap-south-1`)

**No hosted write, migration, backup, push, merge or deployment was performed.**
No credential, key material or connection string is printed in this report.

---

## 1. Read-only preflight service-file port quoting — PASS

**Defect class:** PostgreSQL service files require an integer token:

```
port=5432      # valid
port='5432'    # ERROR: invalid integer value
```

**Fix / hardening:**

- `supabase/tests/mumbai_readonly_identity_preflight.sh` now writes the port via
  `str(int(uri.port or 5432))` with an explicit comment, so a quoted value cannot
  be introduced by a future edit.
- The mock preflight test now includes a positive real-libpq parse and a negative
  quoted-port regression.

**Evidence:**

```text
PASS: missing preflight approval stops before psql
PASS: wrong project is refused before psql
PASS: real libpq parsed service port as integer 5432 using loopback only
PASS: quoted service port 5432 was rejected by real libpq
PASS: verified pooler service/passfile, sslmode=require, read-only SQL, secret redaction, and cleanup
ALL MUMBAI READ-ONLY PREFLIGHT MOCK TESTS PASSED
```

Command: `bash supabase/tests/mumbai_readonly_preflight_test.sh`
Status: **PASS** (no hosted connection; mock psql + real libpq parser only).

---

## 2. Migration manifest SHA-256 recheck — PASS

Checked after the concurrent script edits stopped, then checked a second time
after a short pause. Migration file mtimes were stable; no migration file was
modified after the manifest was generated.

```text
PASS manifest verified: baseline + 37 migrations, unique versions, sha256 match
PASS manifest verified: baseline + 37 migrations, unique versions, sha256 match
```

Command: `node supabase/tests/migration_manifest.mjs`
Manifest: `supabase/MIGRATION_MANIFEST.json`
Checksum inventory: `supabase/migrations.sha256`

---

## 3. Every hosted backup path requires encryption + Auth identity verification — PASS

| Path | Encryption gate | Auth identity verification |
|---|---|---|
| `supabase/tests/run_dev_backup.sh` (real run) | refuses without `BOS_BACKUP_GPG_RECIPIENT`; encrypted archive; plaintext removed; strict archive verifier added | dump must contain `auth.users` + `auth.identities`; isolated restore compares counts |
| `supabase/tests/backup_production_readonly.sh` | encryption required before any connection; `.gpg` only; plaintext removed; `--require-encryption` verifier | identity preflight; TOC requires Auth data; restore compares Auth user/identity counts |
| `supabase/install_mumbai_migrations.sh --apply` | pre-change backup must end in `.gpg`, outside repo, encrypted + round-trip verified | TOC must contain `TABLE DATA auth users` and `auth identities` before any write |
| `scripts/mumbai_connection_backup_preflight.mjs` | **no dump path at all** now; read-only identity/TLS/catalog/Auth check only | queries `auth.users` / `auth.identities` counts and requires readable Auth tables |
| `scripts/backup_database.sh` | retired, exits BLOCKED, no connection | no longer a backup path |
| `supabase/tests/verify_backup_archive.sh` | `--require-encryption` makes a plaintext dump a failure | validates restore-evidence Auth counts and identity |

**Plaintext rejection evidence:**

```text
FAIL  plaintext dump is forbidden for a hosted archive (--require-encryption)
ARCHIVE INCOMPLETE
```

**Encrypted production backup self-test** (throwaway GPG key + disposable DB):

```text
SELF-TEST PASS: encrypted, Auth-preserving, restore-verified archive passes verify_backup_archive.sh
NOTE: this validates the production backup tooling only; it is not a backup of obkfgxjzlscungkhbyvq.
```

**Encrypted dev backup self-test:**

```text
encrypted with key <redacted> (private key stays in <temp keyring>)
encrypted archive decrypts cleanly
decrypt round-trip reproduces the recorded plaintext checksum
plaintext removed and verified removable
SELF-TEST PASS: dump, SHA-256 verification and isolated restore reproduced the schema
```

---

## 4. Backup guards and local restore tests — PASS

### Guard regression suite

`bash supabase/tests/backup_guards_test.sh` → **5/5 PASS**

```text
PASS  dev hosted backup refuses missing GPG recipient before dump
PASS  production backup refuses missing GPG recipient before dump
PASS  production refusal created no archive directory
PASS  strict verifier rejects a plaintext hosted archive
PASS  Mumbai connection helper is read-only (no pg_dump/pg_restore)
```

### Target/approval guard matrix

`bash supabase/tests/run_target_guard_dryrun.sh` → **24/24 PASS**, including
stale Mumbai/Stockholm refs, wrong pooler tenant, transaction port 6543,
`sslmode=disable`, approval, URI-in-password and keyring custody.

### Local restore drill

`bash supabase/tests/run_backup_recovery_drill.sh` → **PASS**

```text
dump=pg_dump_custom_format restore=into_clean_database
catalog=match rls=match policies=match privacy=verified
preserved Google Auth user=1 identity=1 customer_profile=1
local drill only: hosted backup schedule, PITR window and latest recovery point are BLOCKED without project management access
```

### Installer guard

`bash supabase/tests/mumbai_installer_guard_test.sh` → **PASS** (plan order,
wrong project/approval/host/user refusals; no hosted connection).

---

## 5. Other verification — PASS

| Command | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | **PASS** |
| `npm run build` | **PASS** (existing chunk-size warning only) |
| Live Edit security suite | **19/19 PASS** (unchanged) |
| `run_local_validation.sh` | **ALL CHECKS PASSED** |
| Migration manifest | **PASS** (37 migrations, SHA-256) |

---

## 6. BLOCKED — hosted execution

| Item | Reason |
|---|---|
| Hosted read-only identity preflight | Requires owner approval + live read-only credential; not supplied |
| Hosted backup | Requires separate backup approval, live credential and owner GPG keyring |
| Hosted first install | Not approved; hosted schema still empty (`PGRST205` for core/Live Edit tables) |
| Google profile backfill | Separate approval required; not run |
| PITR/recovery-point verification | Requires project management access |
| Google OAuth in Mumbai | Prior read-only report: disabled |
| Server HMAC / admin passcode | `BOS_SERVER_HMAC_SECRET` / `BOS_ADMIN_PASSCODE` still unset |

Readiness checklist: [HOSTED_FIRST_INSTALL_READINESS.md](HOSTED_FIRST_INSTALL_READINESS.md)

---

## 7. Residual notes

- The legacy temporary-credential helper is now **retired** (exit 17, no file or
  network access). Thirteen pre-existing plaintext `.env`/`.bak` snapshots remain
  under owner control; `scripts/audit_plaintext_credentials.sh` inventories them
  and [OWNER_GPG_KEY_SETUP.md](OWNER_GPG_KEY_SETUP.md) gives the owner cleanup
  procedure. No snapshot was deleted or encrypted in this pass.
- `scripts/mumbai_connection_backup_preflight.mjs` is now deliberately a
  **read-only connection/identity preflight** and cannot produce a dump.
- No hosted PITR/recovery point could be verified; reported **BLOCKED**, not
  assumed.