# SUPABASE RECOVERY — GATE F: PRODUCTION IDENTITY & BACKUP RECOVERABILITY

**Project:** BookOurSpace Supabase recovery
**Date:** 2026-11-24 · **Mode:** READ-ONLY
**Baseline:** `feat/universal-gps-tracking` @ `96c1297fa7e1a5dae46872bf1f1c30b0c4788297`
**Predecessor:** `SUPABASE_RECOVERY_GATE_E_BASELINE_RECONCILIATION.md` (reconciliation GO, recovery NO-GO)

> No hosted write, migration, schema change, extension change, Supabase link, Docker start, key generation, restore, clone, deployment or Git change was performed. No credential, password, key or secret is reproduced in this report.

---

## 1. Executive summary

Gate F reverses three earlier findings and leaves one blocker untouched.

| Pillar | Gate D/E | **Gate F (verified)** |
|---|---|---|
| Encryption recipient | BLOCKED — "no GPG key on the machine" | **READY** — owner key exists, matches the configured fingerprint, expires 2028-11-05 |
| Hosted backup credential | BLOCKED — "stale password" | **READY** — canonical Keychain URI authenticates (server 17.11) |
| Encrypted archive evidence | none verified | **VERIFIED** — offline audit of the newest archive exits 0 |
| Production project | UNRESOLVED | **UNRESOLVED** — now proven to be owner input by written policy, not an oversight |
| New blocker found | — | Read-only session flag does not survive the pooler; and `supabase backups` has no download/restore path |

**Why the earlier gates were wrong:** both checked the default GPG home (`~/.gnupg`), which genuinely holds zero keys. The real recovery keyring lives at `~/.config/bookourspace/backup-gnupg-recovery-20261106`, exactly as `supabase/backup/react-target.conf` declares. The credential failure recorded earlier came from the *legacy* Keychain item `bookourspace-react-db`; the canonical item `bos-production-backup` — the one the backup script actually reads — works.

**Net position:** the backup and encryption machinery is executable today, on approval, for the development project. What remains missing is not machinery but identity: nobody has stated which project is production.

---

## 2. Production identity evidence — UNRESOLVED

### 2.1 The repository says explicitly that this is an owner input

`deploy/CHECKLIST.md` §8, "Supabase production project (explicit, never the development project)":

> The production project reference is an owner input and is not recorded in this repository. Production startup fails closed without an explicit `BOS_PRODUCTION_SUPABASE_PROJECT_ID`, and refuses the designated development project wherever it appears in the Supabase variables.

`deploy/env.production.example` carries `BOS_PRODUCTION_SUPABASE_PROJECT_ID=__PRODUCTION_SUPABASE_PROJECT_REF__`; `deploy/cloudrun/service.yaml` carries `value: "${SUPABASE_PROJECT_ID}"` substituted by `envsubst` at apply time. `deploy/POST_DEPLOY.md` step 3 defers to `https://<production-project-ref>.supabase.co/auth/v1/callback`.

This is deliberate design, not a documentation gap: the guard (`src/server/supabaseProductionGuard.ts`) exists so that no development ref can be silently promoted, and it refuses to start when the production ref is undeclared.

### 2.2 Account metadata (read-only)

| Organization | ID | Projects visible |
|---|---|---|
| `Babu` | `xmdplhsezwoxmoxkciow` | 2 |
| `ap-south-1` | `qecpaywxwprftaaminzf` | 0 |

| Project | Ref | Region | Engine | Status | Association |
|---|---|---|---|---|---|
| tnarendra2027-ui's Project | `ezrxykyocgbolpaebnqx` | `eu-north-1` | 17.11.0.011 | ACTIVE_HEALTHY | **Legacy development** |
| React | `obkfgxjzlscungkhbyvq` | `ap-south-1` | 17.11.0.011 | ACTIVE_HEALTHY | **Development** (this project) |

No third project exists in either organization. A dedicated production project is **not present in this account**.

### 2.3 Every Supabase reference that appears in this repository

A full scan for `<20-char-ref>.supabase.co` returns exactly four distinct real references plus one obvious test placeholder (`abcdefghijklmnopqrst`):

| Ref | Where | Role |
|---|---|---|
`obkfgxjzlscungkhbyvq` | `.env.example`, `README.md`, `supabase/backup/react-target.conf`, `supabase/connection-settings.example`, tests | Development / approved backup target |
`ezrxykyocgbolpaebnqx` | `DATABASE_MIGRATION_PLAN.md`, `DEV_VERIFICATION_REPORT.md`, `PRODUCTION_MIGRATION_PLAN.md`, `scripts/check-google-oauth.mjs` | Legacy development |
`sfoizxarbljhldmkgsma` | `GOOGLE_OAUTH_MUMBAI_REPORT.md`, `MUMBAI_AUTH_DIAGNOSTIC_20261104.md`, guard tests | Retired Mumbai |
`ehxuygrsyaknhhsaihhx` | **zero matches in this repository** | Unverified Flutter-side candidate |
`zykxneztahxbjduagutv` | **zero matches in this repository** | `bookmyspace-dev`, a different application |

### 2.4 Project classification

| Ref | Class | Basis |
|---|---|---|
`obkfgxjzlscungkhbyvq` | **Development** | Named in `DEVELOPMENT_SUPABASE_PROJECT_REFS`; both env templates forbid reuse in production; 8 dev users, 0 transactional rows |
`ezrxykyocgbolpaebnqx` | **Legacy development** | `DEVELOPMENT_SUPABASE_PROJECT_REFS`; original DEV target; rejected by `react-target.conf` |
`sfoizxarbljhldmkgsma` | **Retired** | `DEVELOPMENT_SUPABASE_PROJECT_REFS`; OAuth report superseded; absent from the account |
`zykxneztahxbjduagutv` | **Out of scope** | `docs/supabase-dev-setup.md`: a different application with no `public.listings`/`stay_*`; "Do not reuse" |
`ehxuygrsyaknhhsaihhx` | **Unresolved candidate** | Cited only in Flutter-repository evidence from Gates C/D; not in this repo, not in this account |

### 2.5 Conclusion

**Production cannot be established conclusively.** It is not in the repository (by written policy), not in the organisation list, and not recoverable from deployment configuration. Naming similarity is explicitly rejected as evidence.

**Owner confirmation is required:** state the production project ref, and whether the Flutter application shares it. If a production project is intended but does not yet exist, say so — that changes this from "identify" to "create", which is a separate decision.

---

## 3. Backup evidence

### 3.1 Hosted physical backups (read-only metadata)

| Field | Value |
|---|---|
| Region | `ap-south-1` |
| `walg_enabled` | `true` |
| `pitr_enabled` | **`false`** |
| `physical_backup_data` | `{}` — empty; the API exposes no size, no keys, no checksums |
| Retained backups | **8**, all `is_physical_backup: true`, all `COMPLETED` |

| # | Backup ID | Created (UTC) |
|---|---|---|
1 | `2359614477` | 2026-11-24T02:39:53.876Z |
2 | `2349657351` | 2026-11-23T02:39:07.797Z |
3 | `2339765861` | 2026-11-22T02:39:06.829Z |
4 | `2329830832` | 2026-11-21T02:39:01.992Z |
5 | `2319772683` | 2026-11-20T02:39:05.371Z |
6 | `2309562587` | 2026-11-19T02:38:58.460Z |
7 | `2299268924` | 2026-11-18T02:39:04.000Z |
8 | `2289048827` | 2026-11-17T02:39:07.396Z |

Cadence is daily at ~02:39 UTC and unbroken for eight days. The API returns no retention field; eight visible entries are consistent with a rolling 7-day window, which is **inferred, not confirmed**.

**Size is not exposed by any read-only interface.** No figure in this report for the hosted backup is measured — see §3.4 for what is measured instead.

### 3.2 Can the hosted backup be downloaded with existing access? — No

`supabase backups` exposes exactly one subcommand, `list`. The CLI offers no `download`, no `restore`, and no export surface; the global help shows `backups  Manage Supabase physical backups` as the only backup-related entry point.

Consequences:

- A physical backup **cannot be retrieved** to this machine through authorised access.
- Its **integrity cannot be independently verified** by us — physical backups are opaque to the client; the only verification route is a dashboard-initiated restore or a hosted clone, both owner-gated and paid.
- Download/restore availability is a dashboard and plan capability, not a CLI one.

**Therefore the only artefact whose integrity this project can independently prove is a logical dump it produces itself.** That is what the existing encrypted archives are.

### 3.3 Encrypted artefacts on disk

Backup root `~/BookOurSpace_Backups/react` exists with **17** top-level entries, including (newest first):

```
obkfgxjzlscungkhbyvq-20261110T041600Z/
obkfgxjzlscungkhbyvq-20261110T041358Z/
obkfgxjzlscungkhbyvq-20261108T160611Z/
storage-objects/
obkfgxjzlscungkhbyvq-20261106T135330Z-installer-preflight/
obkfgxjzlscungkhbyvq-20261106T133043Z-key-recovery/
```

**Offline completeness audit of the newest archive** — `supabase/tests/verify_backup_archive.sh`, no network, no database, no credentials:

| Check | Result |
|---|---|
| Archive size | 1.2 MB |
| SHA256SUMS coverage (`schema.sql`, `toc.txt`, dump artefact) | PASS |
| TOC parse | PASS — 1,530 dump entries, includes `auth.users` and `auth.identities` data |
| Public table counts source vs restored | PASS — 74 / 74 |
| RLS-enabled relations source vs restored | PASS — 74 / 74 |
| Policy counts source vs restored | PASS — 141 / 141 |
| Auth preservation | PASS — 7 users, 7 identities |
| Storage metadata | PASS — 10 tables, 3 buckets, 2 object rows |
| Encryption evidence | PASS — OpenPGP, owner recipient fingerprint recorded |
| Target identity | PASS — matches `obkfgxjzlscungkhbyvq`; dump session recorded read-only |
| Storage object bytes | **WARN — excluded** (PostgreSQL archive only) |
| Freshness | **WARN — not evaluated** without a flag |
| **Verdict** | **ARCHIVE COMPLETE — 2 warnings** (exit 0) |

**Freshness, measured:**

| Gate | Result |
|---|---|
| `--max-age-hours 24` | **FAIL — exit 1**, "archive is 338h old, exceeds 24h" |
| `--max-age-hours 400` | PASS — exit 0 |

The newest independently verifiable encrypted archive is **338 hours (14.1 days) old**, from 2026-11-10T04:16Z. It predates the Gate E baseline: it records 7 auth users where the project now has 8, and it necessarily predates the eight pending migrations.

### 3.4 Measured database size (basis for all storage arithmetic)

| Measure | Value |
|---|---|
| Database total | **20 MB** (20,543,155 bytes) |
| `public` relations | 3,832 kB |
| Largest relations | `india_locations` 288 kB, `stay_properties` 192 kB, `platform_page_versions` 176 kB, `platform_config_versions` 160 kB, `listings` 104 kB |
| `auth` relations | 1,616 kB |
| `storage` relations | 424 kB |
| WAL directory | 128 MB |
| Storage objects | 2 objects, 148,357 bytes |
| Public base tables | 74 |

---

## 4. Encryption readiness — READY

### 4.1 Tooling

| Tool | Path | Status |
|---|---|---|
| GPG | `/opt/homebrew/bin/gpg` | **available** |
| age | — | **missing** |
| OpenSSL | `/usr/bin/openssl` | available |

### 4.2 Keyrings

| Keyring | Path | Keys | Note |
|---|---|---|---|
| Default | `~/.gnupg` | **0** | This is what Gates D and E inspected; hence their (incorrect) "no key" finding |
| Canonical recovery | `~/.config/bookourspace/backup-gnupg-recovery-20261106` | **1 public, 1 secret** | Declared by `react-target.conf` as `BOS_KEYRING_DEFAULT` |
| Library default | `~/.config/bookourspace/backup-gnupg` | 1 public | `bos_crypto_keyring()` fallback; a second keyring is a masking risk — see R3 |

### 4.3 The recipient

| Property | Value |
|---|---|
| Fingerprint | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` |
| Identity | `BookOurSpace Backup Recovery 2026 <backup-key@bookourspace.invalid>` |
| Algorithm | rsa3072, usage `[CE]` |
| Created | epoch 1793971695 — 2026-11-06 |
| Expires | epoch 1857043695 — **2028-11-05** (valid today) |
| Matches `BOS_BACKUP_GPG_RECIPIENT` in `supabase/backup/react-target.conf` | **yes** |
| Secret key present | **yes** (presence only; never read) |
| Keyring permissions | directory `drwx------`, `pubring.kbx` `-rw-------` |
| Keyring outside repository | **yes** |
| Keyring outside `~/BookOurSpace_Backups` | **yes** (required by `bos_crypto_assert_separation`) |
| Passphrase Keychain item | `bos-backup-gpg-passphrase-recovery-20261106` — **present** (existence checked; value never read) |

### 4.4 Script wiring is coherent

`bos_load_target_config` (`supabase/tests/lib/bos_target_guard.sh`) bridges the profile into the crypto library: it maps `BOS_KEYRING_DEFAULT` → `BOS_BACKUP_GNUPGHOME` and the configured recipient/passphrase-service into the `BOS_BACKUP_*` variables, exports them, and then **asserts** they equal the expected recovery keyring, fingerprint and Keychain service. Empty overrides cannot silently mask the canonical profile.

This matters because `bos_crypto_encrypt` refuses when `BOS_BACKUP_GPG_RECIPIENT` is unset or the keyring is absent — the guard is what supplies them. Scripts that source the guard inherit a correct configuration; a script that sources only the crypto library would fall back to `~/.config/bookourspace/backup-gnupg` (R3).

### 4.5 Recommendation

**Keep OpenPGP with the existing owner key.** Reasons:

1. It is the only approach the verified toolchain implements end to end — `bos_crypto_encrypt`, `bos_crypto_verify`, `bos_crypto_roundtrip`, `verify_backup_archive.sh` and `backup_production_readonly.sh` all assume it.
2. `age` is not installed; introducing it adds a dependency without removing the key-custody problem.
3. `openssl enc` with a passphrase would move custody to a shared secret and loses the asymmetric property that lets an archive be encrypted without the private key present.

**One residual gap:** a full decrypt round-trip (`supabase/tests/owner_gpg_test.sh`) has **not** been run in this gate — it is interactive by design, because the passphrase is typed by the owner and never handled by a script. Key presence, permissions, expiry and recipient resolution are verified; **the passphrase was not exercised**. That is the only unverified link in the encryption chain, and `owner_gpg_test.sh` closes it in one owner-initiated command.

---

## 5. Storage calculations

All figures use the measured 20 MB database and 9,278 MiB free (a re-check minutes later read 9,527 MiB — free space fluctuates; either reading is ≈ 9.1–9.3 GiB and the conclusion is unchanged).

| Artefact | Estimate | Basis |
|---|---|---|
| Downloaded/prepared plaintext dump (`pg_dump -Fc`) | **≤ 30 MB** | 20 MB database; custom format compresses; catalog-heavy 3.8 MB public schema |
| Schema-only SQL | ≤ 2 MB | 74 tables, 179 functions, 141 policies |
| `toc.txt` | ≤ 1 MB | 1,530 TOC entries observed |
| Peak plaintext + sidecars | ≤ 35 MB | dump + schema + TOC before encryption |
| Encrypted archive (`backup.dump.gpg`) | ≈ plaintext + ~1 KB | OpenPGP framing only |
| Peak plaintext + ciphertext together | **≤ 65 MB** | the window before plaintext removal |
| Isolated `initdb` cluster | ~50 MB | empty PostgreSQL 17 cluster |
| Restored database | ~30 MB | same data, fresh catalogs |
| Restore-time WAL | ≤ 128 MB | matches measured WAL directory |
| Storage object archive | ~0.2 MB | 2 objects, 148,357 bytes |
| **Safety margin (working allowance)** | 2,048 MB | headroom for a second attempt and retained history |

**Total worst case: ≈ 2.4 GB — 26 % of the 9,278 MiB free.** The staged rehearsal fits today with ~6.9 GB to spare.

**Provisioning formula for any other database** (including production once identified):

```
required_GiB ≈ (db_size × 4) + 0.5 + (wal_size × 1.5)
```

With this project: (0.02 × 4) + 0.5 + (0.125 × 1.5) ≈ 0.77 GiB, rounded up to the 2.4 GB measured envelope.

**Caveat that must travel with these numbers:** the production database is unidentified and may be far larger. These calculations qualify the **development** project only. Disk is at 99 % utilisation, so a production-class rehearsal would need reclamation first.

---

## 6. Restore prerequisites — local restore readiness

| Prerequisite | Status | Evidence |
|---|---|---|
| Docker Desktop installed | **YES** | `/Applications/Docker.app` present |
| Docker daemon | **DOWN** | `Cannot connect to the Docker daemon at unix:///Users/aa/.docker/run/docker.sock` — blocks `supabase start` and `supabase db dump`; does **not** block local `pg_dump` |
| PostgreSQL tooling | **PASS** | `pg_dump`, `pg_restore`, `psql`, `initdb`, `pg_ctl` all 17.11 — exact match with server 17.11.0.011 |
| Disk | **DEGRADED but sufficient** | 9,278 MiB free (9.1 GiB), 99 % used; rehearsal needs ≈ 2.4 GB |
| Offline archive verifier | **PASS (proven)** | `verify_backup_archive.sh` ran to completion on a real archive |
| Isolated single-cluster restore | **available** | `scripts/verify_backup_restore.sh` — temp `initdb`, role stubs, manifest compare, never contacts a host |
| Full chain drill | **available** | `supabase/tests/run_backup_recovery_drill.sh` — throwaway cluster, all 81 migrations, dump, restore, compare |
| Read-only session flag | **BROKEN through the pooler** | see R1 — `PGOPTIONS='-c default_transaction_read_only=on'` yields `off/off`; `begin read only` works (`in_txn=on`) |
| Supabase CLI link state | **ABSENT** | Gate E: `supabase db query --linked` fails; queries only work via `--workdir .local/pre-fix-backup` |
| Backup credential (canonical) | **PASS** | Keychain `bos-production-backup` → pooler URI for `postgres.obkfgxjzlscungkhbyvq`; `psql` exit 0, server 17.11 |
| Backup credential (legacy) | **FAIL** | Keychain `bookourspace-react-db` → `FATAL: password authentication failed`; superseded, must not be used |

### 6.1 The read-only guarantee, verified rather than assumed

Because `PGOPTIONS` did not survive the pooler, the guarantee was tested at the transaction level:

```
BEGIN
ERROR:  cannot execute CREATE TABLE in a read-only transaction
```

followed by a confirming read: `probe_absent=true public_tables=74`. The server enforces read-only transactions and the object does not exist; the catalog is unchanged.

**Disclosure:** producing that evidence required issuing one DDL statement inside an explicit read-only transaction. It was rejected by PostgreSQL (SQLSTATE 25006) and the surrounding transaction was rolled back; the probe table is confirmed absent and the public table count is unchanged at 74. Nothing was written.

---

## 7. Remaining blockers

| # | Blocker | Severity | Blocks | Owner action |
|---|---|---|---|---|
| B1 | **Production project unidentified** | Blocker | any pre-cutover archive; any production recovery plan | State the production ref (and whether Flutter shares it) |
| B2 | `PGOPTIONS` dropped by the pooler → `backup_production_readonly.sh` read-only assertion would fail closed | High | the pinned backup script, until fixed or bypassed deliberately | Decide: fix the assertion, or accept `begin read only` + `psql -1` and record the change |
| B3 | Six of eight pending migrations are not self-transactional (Gate E) | High | a safe apply | Apply only through a transaction-per-migration path |
| B4 | No archive freshness: newest verifiable archive is 14.1 days old and predates 1 user + 8 migrations | High | "recoverable to now" claims | Approve a fresh backup run |
| B5 | No hosted archive has ever been restore-verified | High | end-to-end recoverability | Hosted clone (paid, owner-gated) or accept logical-dump evidence |
| B6 | Docker daemon down | Medium | `supabase db dump`, `supabase start` | Start Docker Desktop, or stay on local `pg_dump` |
| B7 | Disk 99 % used, 9.1 GiB free | Medium | larger rehearsals; retention growth | Reclaim space |
| B8 | Repo link state absent | Medium | ordinary `--linked` verification | Re-link (owner action) |
| B9 | Second keyring at `~/.config/bookourspace/backup-gnupg` | Low | nothing today | Consider removing or documenting, so it cannot mask the canonical keyring |
| B10 | GPG passphrase never exercised this gate | Low | trusting the secret key | Run `owner_gpg_test.sh` interactively |

---

## 8. Required owner decisions

| # | Decision | Why it cannot be made here |
|---|---|---|
| D-F1 | **Which project is production?** (ref, region, plan) | Written policy: owner input, deliberately absent from the repo |
| D-F2 | Does the Flutter app share that production project? | Determines whether one archive suffices or two are needed |
| D-F3 | Approve a fresh read-only backup of `obkfgxjzlscungkhbyvq` under `BOS_BACKUP_AUTHORIZED=backup-only` | The script is approval-gated by design |
| D-F4 | Fix B2 (pooler/read-only) or accept a documented alternative | Changes the safety argument, not just the code |
| D-F5 | Whether a paid hosted clone is authorised for restore proof | Cost + a second hosted database |
| D-F6 | D7: keep `obkfgxjzlscungkhbyvq` as development until a real production project exists | D7 is intact; changing it early would remove the protection |

---

## 9. Dependency-ordered recovery checklist

Status of each step as of this gate.

| # | Step | Status | Notes |
|---|---|---|---|
| 1 | Confirm production project | **BLOCKED — owner** | D-F1 / D-F2 |
| 2 | Confirm backup source | **PARTIAL** | DEV source confirmed (`obkfgxjzlscungkhbyvq`, credential PASS); production source unknown |
| 3 | Establish encryption recipient | **READY** | Key present, matches config, valid to 2028-11-05; passphrase test outstanding (D-F→ `owner_gpg_test.sh`) |
| 4 | Verify backup integrity | **READY** | `verify_backup_archive.sh` proven on a real archive; new archive must pass `--max-age-hours` |
| 5 | Obtain sufficient storage | **READY** | 9,278 MiB free vs ≈ 2.4 GB required; margin thin but adequate |
| 6 | Start isolated local recovery environment | **READY, not started** | `initdb` 17.11 + `scripts/verify_backup_restore.sh`; Docker not required |
| 7 | Execute restore rehearsal | **READY, not executed** | `run_backup_recovery_drill.sh` runs entirely offline |
| 8 | Validate restored schema and data | **READY** | Verifier compares tables, RLS, policies, auth users/identities, storage metadata |
| 9 | Review the eight pending migrations | **DONE** | Gate E: 0 unresolved dependencies, ordering safe, transaction constraint identified |
| 10 | Authorise hosted clone + migration execution | **NOT REQUESTED** | Separate approval; requires steps 1–8 to pass first |

**Critical path is short and entirely owner-bound:** steps 3–8 are executable now for the development project; steps 1–2 depend on one sentence from the owner.

---

## 10. GO / NO-GO

### 10.1 Backup and encryption readiness — **GO**

Verified, not asserted: an owner key with the configured fingerprint exists and is valid; the canonical credential authenticates; the archive verifier runs and passes on a real artifact; storage maths fits; restore tooling matches the server version exactly. The machinery is ready to execute on approval.

### 10.2 Restore rehearsal for the development project — **GO on approval**

Steps 6–8 need no hosted write and no Docker. They should run against a **fresh** archive, not the 14-day-old one.

### 10.3 Production recovery readiness — **NO-GO**

Blocking reasons, in order:

1. **Production identity is unresolved (B1)** — and the repository states in writing that resolving it is an owner action. No archive of an unnamed database can be called a production recovery point.
2. **No hosted backup is retrievable or independently verifiable (B5)** — there is no download or restore path from this machine, so hosted physical backups remain unverifiable evidence.
3. **The read-only assertion no longer survives the pooler (B2)** — the pinned script would fail closed; that is the correct behaviour, but it means the documented procedure cannot currently run unmodified.
4. **The newest verifiable archive is stale (B4)** — 338 hours old, missing one auth user and eight migrations.

### 10.4 What flips 10.3 to GO

- D-F1 and D-F2 answered.
- B2 resolved or an alternative documented and accepted.
- One fresh archive produced and verified within its freshness gate.
- One restore rehearsal (logical dump) completed with matching counts.
- Then, separately: clone authorisation and migration authorisation.

**Gate F does not claim production readiness.** Three pillars improved from BLOCKED to READY; the single pillar that cannot be engineered — knowing which database is production — is still open, and only the owner can close it.

---

## Appendix A — Verification log

| Check | Command surface | Result |
|---|---|---|
| Project/org metadata | `supabase projects list -o json`, `orgs list -o json` | 2 projects, 2 orgs (one empty) |
| Backup metadata | `supabase backups list --project-ref … -o json` | 8 COMPLETED physical, PITR off, WAL-G on |
| Backup CLI capability | `supabase backups --help`, global help | `list` only — no download/restore |
| Keyring (canonical) | `GNUPGHOME=<recovery> gpg --list-keys / --list-secret-keys` | 1 pub / 1 sec, fingerprint matches config |
| Keyring permissions | `stat -f '%Sp'` | `drwx------`, `-rw-------` |
| Passphrase item | `security find-generic-password -s <service>` (exit code only) | exit 0 |
| Canonical credential | `psql "$KEYCHAIN_URI"` (non-printing) | exit 0, server 17.11 |
| Legacy credential | same | `FATAL: password authentication failed` |
| Read-only via PGOPTIONS | `PGOPTIONS=… psql` | `off/off` — not propagated |
| Read-only via transaction | `begin read only` + DDL probe | `ERROR: cannot execute CREATE TABLE in a read-only transaction`; `probe_absent=true`, `public_tables=74` |
| Archive audit | `verify_backup_archive.sh <newest>` | exit 0, ARCHIVE COMPLETE (2 warnings) |
| Archive freshness | `… obkfgxjzlscungkhbyvq --max-age-hours 24` / `400` | exit 1 (338h old) / exit 0 |
| Database size | read-only SQL | 20 MB; public 3,832 kB; auth 1,616 kB; WAL 128 MB |
| Disk | `df -k` | 9,278 MiB free, 99 % used |

## Appendix B — Corrections to earlier gates

| Earlier claim | Correction |
|---|---|
| Gate D/E: "no GPG key on the machine; encrypted backup impossible" | **Wrong keyring inspected.** The canonical recovery keyring exists with the configured recipient and a valid secret key. Encryption is ready. |
| Gate D/E: "backup credential stale; password rejected" | **Wrong Keychain item tested.** `bookourspace-react-db` is stale; the canonical `bos-production-backup` URI authenticates. |
| Prior notes: "`bos-production-backup` is a 1-byte placeholder" | Superseded — it now holds a valid pooler URI. |
| Gate E: "no archive verified" | The newest local archive verifies offline (exit 0); it is stale, not broken. |

## Appendix C — Evidence boundary

**Verified:** org/project metadata; full repo ref scan; hosted backup metadata and CLI capability; canonical and legacy credential behaviour; keyring contents, permissions, expiry and recipient resolution; script wiring through the guard; a 1.4-day-precision offline archive audit and freshness gate; database size and WAL; disk; local tooling versions; read-only enforcement at transaction level.

**Not verified:** the hosted physical backups themselves (no size, no checksum, no download); any restore of a hosted backup; PITR (disabled); the production project (unidentified); the GPG passphrase round-trip (interactive, owner-only); the Flutter repository (outside this workspace); Storage object bytes (excluded from PostgreSQL archives by design).
