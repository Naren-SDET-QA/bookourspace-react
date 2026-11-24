# SUPABASE RECOVERY — GATE G: OWNER DECISIONS & CONTROLLED BACKUP PREPARATION

**Project:** BookOurSpace Supabase recovery
**Date:** 2026-11-24 · **Mode:** PREPARATION ONLY — read-only, nothing executed
**Baseline:** `feat/universal-gps-tracking` @ `96c1297fa7e1a5dae46872bf1f1c30b0c4788297`
**Sources:** `SUPABASE_RECOVERY_GATE_E_BASELINE_RECONCILIATION.md`, `SUPABASE_RECOVERY_GATE_F_PRODUCTION_AND_BACKUP_READINESS.md`

> No hosted write, no backup execution, no Docker start, no key generation, no clone creation, no migration execution, no deployment, no Git modification. No credential or key material is printed. This gate prepares; it does not act.

**One distinction this document enforces throughout:** authorising a fresh backup authorises *reading* the database into an encrypted local file. It is not authorisation to restore, to migrate, to clone, or to touch production. §5 makes that separation structural rather than advisory.

---

## 1. Owner decision register

Four decisions. **None is pre-filled, recommended, or assumed.** Every field marked AWAITING is a genuine gap, not a formality.

### D1 — Production Supabase project reference

| Field | Value |
|---|---|
| Status | **AWAITING OWNER CONFIRMATION** |
| Question | Which project reference is production? |
| Currently known | `obkfgxjzlscungkhbyvq` = development (guard-listed); `ezrxykyocgbolpaebnqx` = legacy development; `sfoizxarbljhldmkgsma` = retired |
| Evidence that it is owner-only | `deploy/CHECKLIST.md` §8: "The production project reference is an owner input and is not recorded in this repository" |
| Evidence it is not in this account | Two projects visible across two orgs (`Babu` holds both; `ap-south-1` is empty); no third project exists |
| What the answer must contain | The exact ref, its region, and whether the project already exists |
| Unlocks | Production backup source; production recovery plan; any clone planning against real data |
| Does **not** authorise | A backup, a clone, a migration, or a deployment |
| If answered "no production project exists yet" | This becomes a *create* decision, which is a different approval with its own cost and plan implications |

### D2 — Do Flutter and React share one production project?

| Field | Value |
|---|---|
| Status | **AWAITING OWNER CONFIRMATION** |
| Question | Does the Flutter app write to the same production database as React? |
| Why it changes the plan | If shared: one archive protects both apps, and the `mobile`/`mobile_private` schema work (Gates B/C) lands in the same database. If separate: two archives, two recovery points, two clone sources |
| Related unresolved | `ehxuygrsyaknhhsaihhx` appears only in Flutter-side evidence; it is absent from this repository and from this account |
| Unlocks | Whether one or two recovery chains must be built |
| Does **not** authorise | Anything |

### D3 — Authorisation for a fresh backup **only**

| Field | Value |
|---|---|
| Status | **AWAITING OWNER APPROVAL** |
| Scope granted if approved | One read-only `pg_dump` of `obkfgxjzlscungkhbyvq`, encrypted, written to `~/BookOurSpace_Backups/react/`, plus its isolated local restore check that the script performs as part of verification |
| Scope explicitly **not** granted | No restore of the hosted project, no migration, no clone, no schema change, no deployment, no download of any hosted physical backup |
| Preconditions — all verified met (§2) | keyring READY · scripts syntax-clean · guard chain passes · credential authenticates · disk sufficient |
| Target must still be confirmed at execution time by | `BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq` (a second, explicit confirmation inside the script) |
| Reversible? | Yes — creates one new local directory; touches no hosted state |

### D4 — Authorisation for a **paid isolated hosted clone**

| Field | Value |
|---|---|
| Status | **AWAITING OWNER APPROVAL** — and **not yet advisable** |
| Scope granted if approved | Creation of one temporary project restored from a physical backup of the source, in the same region, for restore validation only |
| Scope explicitly **not** granted | No traffic, no deployment, no migration, no production cutover, no keeping the clone |
| Prerequisite blocked today | **D1** — the source project of a production clone is unknown |
| Cost | ≈ $0.014/hour of Micro compute while it exists; ≤ $0.35 for 24 h (§3.3). A plan upgrade may be required (§3.2) |
| Recommendation | **Do not approve before D1.** Resolving identity determines the correct recovery source; cloning the development project would spend money proving something the logical-dump path already proves |

---

## 2. Backup preparation — validated, not executed

### 2.1 Canonical GPG keyring — **READY** (validator exit 0)

Ran `supabase/tests/gpg_readiness.sh` (offline; encrypts a throwaway file; no key material printed):

| Check | Result |
|---|---|
| Keyring directory exists | PASS |
| Permissions `drwx------` (owner-only) | PASS |
| Outside the repository and outside `~/BookOurSpace_Backups/react` | PASS |
| Public key present | PASS — 1 key |
| Recipient supplied | PASS — `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` |
| Recipient resolves to fingerprint | PASS |
| Matching secret key present | PASS (presence only) |
| Encryption capability | PASS |
| Real encryption to the recipient | PASS — 512-byte ciphertext produced |
| Expiry | **WARN** — expires 2028-11-05; schedule rotation before then |
| **Verdict** | **READY** |

**The one remaining gap:** decryption was **SKIPPED** because this is a non-interactive shell — the passphrase is deliberately typed by the owner, never handled by a script. Key presence, permissions, expiry and encryption are proven; **the private-key passphrase has not been exercised.** `bash supabase/tests/owner_gpg_test.sh` in your own terminal closes it in one step.

### 2.2 Scripts and recipient configuration — **PASS**

| Check | Result |
|---|---|
| `bash -n` on `backup_production_readonly.sh` | OK |
| `bash -n` on `verify_backup_archive.sh` | OK |
| `bash -n` on `scripts/verify_backup_restore.sh` | OK |
| `bash -n` on `run_backup_recovery_drill.sh` | OK |
| `bash -n` on `lib/bos_backup_crypto.sh` | OK |
| `bash -n` on `lib/bos_target_guard.sh` | OK |
| Recipient in `react-target.conf` matches keyring | PASS |
| Guard bridges `BOS_KEYRING_DEFAULT` → `BOS_BACKUP_GNUPGHOME` and asserts the expected values | PASS |

### 2.3 Guard chain — three paths exercised, none connected

| Test | Invocation | Result |
|---|---|---|
| A. No authorisation | bare script | **exit 3** — "requires explicit backup-only authorisation … No connection was attempted." |
| B. Guard-only preflight | `BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq BOS_BACKUP_GUARD_ONLY=1` | **exit 0** — "GUARDS PASS: Keychain/environment credential loaded in memory, backup-only approval and exact ref verified, no connection attempted." |
| C. Wrong ref | same with `BOS_PROD_REF_CONFIRM=ezrxykyocgbolpaebnqx` | **exit 3** — "set BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq to confirm the approved React target." |

Path B additionally reported: `target verified: ref=obkfgxjzlscungkhbyvq via=pooler host=aws-0-ap-south-1.pooler.supabase.com port=5432 db=postgres password_present=yes`.

**Disclosure:** test B sets `BOS_BACKUP_AUTHORIZED=backup-only` and `BOS_BACKUP_GUARD_ONLY=1`. The token exists only to reach the guard block; `GUARD_ONLY` returns **before** `prod_backup` is called and before any connection, which is why the script's own output states "no connection was attempted". No dump was produced and no archive directory was created.

**Precondition noted by the guard:** the Keychain URI carries no `sslmode`; the script exports `PGSSLMODE` from `BOS_SSLMODE=require` in the profile, so TLS is still enforced.

### 2.4 Backup command surface (inspected, not run)

`supabase/tests/backup_production_readonly.sh` takes **one positional argument** (the archive directory) and **no flags**. Behaviour is controlled entirely by environment:

| Variable | Required | Effect |
|---|---|---|
`BOS_BACKUP_AUTHORIZED` | **yes** (`backup-only`) | Absent → exit 3 before anything else |
`BOS_PROD_REF_CONFIRM` | **yes** (`obkfgxjzlscungkhbyvq`) | Wrong ref → exit 3 |
`BOS_BACKUP_GPG_RECIPIENT` | **yes** | Missing → exit 5 before connecting (no plaintext archive path exists) |
`BOS_BACKUP_KEYCHAIN_SERVICE` | no (default `bos-production-backup`) | Source of the DB URI |
`BOS_PRODUCTION_DATABASE_URL` | no | Overrides Keychain; not needed here |
`BOS_BACKUP_GUARD_ONLY` | no | `1` = validate guards, skip the dump |
`BOS_BACKUP_SELFTEST` | no | `1` = disposable local cluster, throwaway keyring |

There is **no `--dry-run`**. `BOS_BACKUP_GUARD_ONLY=1` is the only preflight mode, and it is the one exercised in §2.3.

The run also performs its own isolated restore before declaring PASS, then re-verifies the archive offline with `--require-encryption`.

### 2.5 Expected backup size — measured, not estimated

Gate F estimated ≤ 30 MB from database size. The archives on disk show what the tooling actually produces:

| Reference point | Size |
|---|---|
| Database total | 20 MB (20,543,155 bytes) |
| Newest complete archive `…20261110T041600Z` | **1.2 MB** |
| Every retained archive directory | 1–2 MiB |
| Entire backup root (17 entries) | **11 MiB** |

**Expected new archive: 1.5–3 MB** (ciphertext + schema + TOC + evidence files). Custom-format compression plus a catalog-heavy, data-empty database explains the 10× gap from raw size.

### 2.6 Disk and storage arithmetic

| Measure | Value |
|---|---|
| Free space now | **9,529 MiB** (9.3 GiB), 99 % used |
| Peak temporary during a run | ≈ **150–200 MB** — plaintext dump (≤3 MB) + schema/TOC (≤3 MB) + `initdb` cluster (~50 MB) + restored DB (~20 MB) + WAL (≤128 MB) |
| Retained: new archive | +1.5–3 MB (one directory) |
| Retained: existing | 11 MiB across 17 entries — unchanged, nothing deleted |
| Safety margin | 2,048 MB |
| **Total required** | **≈ 2.2 GiB — 24 % of free space** |

Sufficient with ~7.3 GiB to spare. Disk is at 99 % utilisation, so this is adequate for the backup but should be reclaimed before any larger rehearsal.

### 2.7 Exact backup-only command (prepared; **not executed**)

```bash
cd /Users/aa/Downloads/bookourspace-react

BOS_BACKUP_AUTHORIZED=backup-only \
BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq \
BOS_BACKUP_GPG_RECIPIENT=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
BOS_BACKUP_GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
bash supabase/tests/backup_production_readonly.sh \
  "$HOME/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-$(date -u +%Y%m%dT%H%M%SZ)-gateG"
```

Notes for the operator:

- The directory must **not already exist** — the script refuses to overwrite a backup (exit 2).
- The DB URI is read from Keychain `bos-production-backup`; no password appears on the command line.
- Do **not** add `BOS_PRODUCTION_DATABASE_URL`; that bypasses the Keychain path.
- Expected exit codes: `0` verified · `2` usage · `3` wrong/unsafe target or approval · `4` dump/scope · `5` checksum/encryption · `6` restore or verification failure.
- **This command has not been run.** It runs only after D3.

---

## 3. Hosted clone plan (documented, not created)

### 3.1 What the feature actually is

Supabase's **Restore to a New Project** duplicates a project from a physical backup or a PITR point. Per Supabase's documentation: it is exclusive to **paid plans**, requires **physical backups enabled on the source**, creates a **database-only** copy, and places it **in the same region** as the source. Storage objects, Edge Functions, Auth provider settings, API keys and Realtime configuration are **not** carried over.

This matters twice: the clone is a database copy, not an environment copy — and it cannot be used as the source of a second clone.

### 3.2 Plan and configuration requirements

| Requirement | Status |
|---|---|
| Paid plan (Pro/Team/Enterprise) | **UNCONFIRMED** — the account has exactly 2 projects, which is the Free-tier limit, yet it also holds daily physical backups with a 7-day window, a paid feature. The two signals conflict; confirm the plan in the dashboard before approving D4 |
| Physical backups enabled on source | **YES** — 8 COMPLETED daily physical backups |
| Same region as source | `ap-south-1` |
| Source identified | **NO** — depends on D1 |

If the organisation is on Free, a clone is unavailable and a third project is not permitted; the plan upgrade would be **$25/month**, independent of clone runtime.

### 3.3 Expected cost

| Item | Basis | Cost |
|---|---|---|
| Clone compute, Micro | $10/month ≈ 730 h → $0.0137/h | **≈ $0.014/h** |
| 24-hour validation window | $0.0137 × 24 | **≈ $0.33** |
| One-week window | $0.0137 × 168 | **≈ $2.30** |
| Disk | 20 MB database vs 8 GB included on Pro | **$0** |
| Egress | validation queries only | **≈ $0** |
| Plan upgrade, if required | Pro tier | **$25/month** |
| PITR add-on | **not required**; $0.137/h (~$100/mo), not spend-cap covered | **$0 — do not enable** |

A clone deserves a bounded lifetime: cost scales with hours alive, and an abandoned clone bills indefinitely.

### 3.4 Isolation requirements

- **Dedicated ref, referenced nowhere.** No `VITE_SUPABASE_*`, no server env, no deployment points at it.
- **Never in a production variable.** Do not set `BOS_PRODUCTION_SUPABASE_PROJECT_ID` to a clone ref.
- **D7 stays as it is.** The three development refs remain listed; a clone ref must not be added casually, and must never be treated as production.
- **No outbound integrations.** `pg_cron`, `pg_net` and `postgis` are **not installed** on the source, so a restored copy cannot fire scheduled jobs or HTTP callbacks into production. Re-check this on the clone before handing it to anyone.
- **No secrets.** Edge Function secrets are not copied; do not add any.
- **Fresh keys.** Do not reuse the development publishable key.
- **Access.** Restrict to the operator performing validation; delete the project when done.

### 3.5 Restore validation criteria

A clone is only evidence if these counts match the source at backup time:

| Criterion | Expected |
|---|---|
| Public base tables | 74 |
| RLS-enabled relations | 74 |
| Public policies | 141 |
| Migration ledger rows | 74 (73 applied + 1 baseline marker) |
| Highest applied version | `20261108150000` |
| The 8 pending migrations applied | **0** — none of `20261111190000` … `20261112050000` may appear |
| Auth users / identities | 8 / 8 (as of 2026-11-24) |
| Buckets / object metadata rows | 3 / 2 (private; object **bytes** are not in a DB restore) |
| `pitr_enabled` on the clone | irrelevant — do not enable |
| Measured RTO | record start-to-validated duration |

**Anything that fails this table invalidates the rehearsal, not the backup.** Record the discrepancy before deleting the clone.

### 3.6 Cleanup and retention

- Capture the validation table above into the gate report **before** deletion.
- Delete the clone after validation; confirm deletion in the dashboard.
- **Retain all local archives.** Gate G authorises no deletion and no cleanup: 17 entries, 11 MiB, untouched. Pruning requires its own approval.
- Record measured RTO permanently — it is the number that later justifies or refutes a PITR purchase.

---

## 4. Risk assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| G1 | Clone authorised before D1, proving recovery of the wrong database | Medium | High — money spent, wrong source validated | Sequence D1 → D4; this gate recommends exactly that |
| G2 | Backup approved but then assumed to authorise a restore or migration | Medium | High — the classic scope-creep failure | §5 matrix; the script itself demands a separate token per action |
| G3 | GPG passphrase unverified → archive cannot be decrypted when needed | Medium | High — a backup nobody can open is not a backup | Run `owner_gpg_test.sh` interactively before or immediately after D3 |
| G4 | Read-only assertion bypassed (`PGOPTIONS` does not survive the pooler) | High | Medium — safety depends on the transaction, not the session flag | Known and documented; the dump itself is read-only SQL and the guard chain passed |
| G5 | Archive written while disk sits at 99 % | Low | Medium | Needs ≈ 2.2 GiB of 9.3 GiB; reclaim before any larger operation |
| G6 | Clone left running | Medium | Low–Medium — ~$0.33/day | Bounded lifetime; delete after validation |
| G7 | Wrong project confirmed by habit (dev ref typed for a production intent) | Low | High | Script demands exact ref match, refuses wrong ref (test C), and records identity in the archive |
| G8 | Plan is Free → clone silently unavailable mid-approval | Medium | Low | Confirm plan before approving D4 |

---

## 5. Authorisation boundaries

Six permissions. **Approving one never implies another.** Each row names the artefact that enforces it.

| # | Permission | Grants exactly | Never implies | Enforced by |
|---|---|---|---|---|
| A1 | **Fresh backup** | One read-only encrypted dump of the confirmed ref + its built-in local restore check | Download, restore, clone, migration, deployment | `BOS_BACKUP_AUTHORIZED=backup-only` + `BOS_PROD_REF_CONFIRM` |
| A2 | **Backup download** | Copying an archived ciphertext off this machine | Decrypting it, restoring it, uploading it anywhere | Not scripted; operational, owner-performed |
| A3 | **Local restore rehearsal** | Restoring an existing archive into a throwaway local cluster | Any hosted restore or any migration | `scripts/verify_backup_restore.sh` (never contacts a host) |
| A4 | **Hosted clone creation** | One temporary project from a physical backup | Traffic, deployment, migrations, keeping it | Dashboard action, owner-performed |
| A5 | **Migration execution** | Applying the 8 pending migrations to a confirmed target | Production deployment, schema free-for-all | Gate E analysis + transaction-per-migration constraint |
| A6 | **Production deployment** | Serving the app against production | Database changes beyond A5 | `supabaseProductionGuard.ts` + D7 |

Two consequences worth stating plainly:

1. **D3 (A1) today does not permit A3's rehearsal of the production database**, because there is no production database named. It does permit rehearsing the development archive — which is already what A1's built-in verification does.
2. **A4 is not a migration permission.** A clone that becomes production is a cutover, which needs A5 and A6 separately.

---

## 6. GO / NO-GO

| Stage | Verdict | Basis |
|---|---|---|
| Backup preparation | **GO — ready to execute** | Keyring READY (validator exit 0), 6/6 scripts syntax-clean, guard chain proven on three paths, credential authenticates, expected archive 1.5–3 MB, needs 2.2 GiB of 9.3 GiB free |
| Fresh backup execution | **BLOCKED on D3** — nothing technical remains | One approval; one command; reversible |
| Hosted clone planning | **GO** — plan complete | Cost, requirements, isolation, validation, cleanup all specified |
| Hosted clone creation | **NO-GO** | D1 unresolved; plan tier unconfirmed; and per recommendation, identity first |
| Migration execution | **NO-GO** | 8 pending migrations exist by design; Gate E's transaction constraint stands; no authorisation |
| Production deployment | **NO-GO** | No production project, no D7 change, no cutover |

**Position stated honestly:** the recovery machinery is in the best state it has been in across six gates — encryption is proven capable, the guard refuses on command, and the archive format is measured at megabytes rather than tens of megabytes. What is missing is not engineering. It is one identifier.

---

## 7. Owner decisions still required

Exactly four, and no others:

1. **D1 — Which project is production?** Ref, region, and whether it already exists.
2. **D2 — Do Flutter and React share it?** Determines one recovery chain or two.
3. **D3 — Approve the fresh backup only?** One command, §2.7, reversible, no hosted write.
4. **D4 — Approve a paid hosted clone?** Recommended **after** D1, not before.

Two smaller owner actions accompany them and neither is a decision:

- Run `bash supabase/tests/owner_gpg_test.sh` in your own terminal once, so the passphrase is exercised rather than assumed (addresses G3).
- Confirm the organisation's plan tier in the dashboard before D4, because a Free tier makes a clone impossible regardless of approval (addresses G8).

Until D1 is answered, every recovery claim in this project is scoped to a development database — and no amount of backup machinery changes what that database is.

---

## Appendix A — Verification log

| Check | Result |
|---|---|
| `gpg_readiness.sh` | exit 0 — READY; 11 PASS, 1 WARN (expiry 2028-11-05), decryption skipped (non-interactive) |
| `bash -n` × 6 scripts | all OK |
| Guard test A (no authorisation) | exit 3, refused, no connection |
| Guard test B (guard-only) | exit 0, GUARDS PASS, target verified, no connection |
| Guard test C (wrong ref) | exit 3, refused |
| Backup script flags | none; one positional directory argument; `BOS_BACKUP_GUARD_ONLY` is the only preflight |
| Archive sizes | newest 1.2 MB; all directories 1–2 MiB; backup root 11 MiB / 17 entries |
| Disk | 9,529 MiB free, 99 % used |
| Projects | 2, both in org `xmdplhsezw…` |

## Appendix B — Evidence boundary

**Verified this gate:** keyring readiness and encryption capability; script syntax and guard behaviour on three paths; credential availability in memory without connecting; measured archive sizes; disk; the documented clone feature, cost basis and plan constraints (Supabase documentation).

**Not verified:** the GPG passphrase round-trip (interactive, owner-only); the organisation's plan tier; any clone behaviour (none created); the production project (unidentified); hosted physical backup contents, size or checksums (not exposed).
