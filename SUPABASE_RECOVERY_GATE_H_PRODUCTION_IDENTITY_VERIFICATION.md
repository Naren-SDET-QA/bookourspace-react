# SUPABASE RECOVERY — GATE H: PRODUCTION IDENTITY VERIFICATION & OWNER READINESS

**Project:** BookOurSpace Supabase recovery
**Date:** 2026-11-24 · **Mode:** READ-ONLY — nothing executed, nothing downloaded, nothing created
**Previous:** `SUPABASE_RECOVERY_GATE_G_OWNER_DECISIONS_AND_BACKUP_PLAN.md`

---

## 0. Git baseline

| Item | Value |
|---|---|
| Branch | `feat/universal-gps-tracking` |
| HEAD | `96c1297` (`96c1297fa7e1a5dae46872bf1f1c30b0c4788297`) |
| Modified tracked files | `src/components/ProviderDashboard.tsx` (pre-existing, untouched) |
| Staged | none |
| Untracked | Gate E, Gate F, Gate G reports + this report |
| D7 | **ARMED** — `DEVELOPMENT_SUPABASE_PROJECT_REFS` still lists `obkfgxjzlscungkhbyvq`, `ezrxykyocgbolpaebnqx`, `sfoizxarbljhldmkgsma` |
| Migration files | 81 · applied 73 · pending 8 |

No Git modification was made in this gate. No file outside the reports was touched.

---

## 1. Phase 1 — React and Flutter project mapping

### 1.1 React — environment files as they exist now

Only project refs are reproduced; no key, password or secret was read into this report.

| File | URL ref | `PROJECT_ID` | Classification |
|---|---|---|---|
| `.env` | `obkfgxjzlscungkhbyvq` | `obkfgxjzlscungkhbyvq` | **development (active)** |
| `.env.local` | `obkfgxjzlscungkhbyvq` | `obkfgxjzlscungkhbyvq` | **development (active)** |
| `.env.example` | `obkfgxjzlscungkhbyvq` | — | template naming the development ref |
| `.env.local.mumbai` | `sfoizxarbljhldmkgsma` | `sfoizxarbljhldmkgsma` | **retired** |
| `.env.local.mumbai.pre-mumbai-key-20261104T174243` | `sfoizxarbljhldmkgsma` | `sfoizxarbljhldmkgsma` | retired (key-rotation backup) |
| `.env.local.pre-mumbai-key-20261104T174243` | `sfoizxarbljhldmkgsma` | `sfoizxarbljhldmkgsma` | retired (key-rotation backup) |
| `.env.save` | `sfoizxarbljhldmkgsma` | — | retired (stale save) |
| `.env.local.stockholm` | `ezrxykyocgbolpaebnqx` | `ezrxykyocgbolpaebnqx` | **legacy development** |

Ref frequency across all env files: **`obkfgxjzlscungkhbyvq` ×14 · `sfoizxarbljhldmkgsma` ×8 · `ezrxykyocgbolpaebnqx` ×2.**

**There is no production ref in any environment file.** Every ref present is either the designated development project or a retired/legacy one, all three of which D7 refuses in production.

### 1.2 React — code and configuration

| Artefact | Finding |
|---|---|
| `src/server/supabaseProductionGuard.ts` | Requires explicit `BOS_PRODUCTION_SUPABASE_PROJECT_ID`; refuses any D7-listed ref; refuses startup without it (`PRODUCTION_SUPABASE_PROJECT_ID_REQUIRED`) |
| `src/lib/supabaseConfig.ts` | Client validates `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID` against an allowlist; development-only path |
| `scripts/supabase-dev-preflight.ts`, `server.ts:1892`, `playwright.config.ts:96` | All hard-wired to the development project — no production path |
| `.github/workflows/ci.yml` | **No Supabase secrets, no ref, no deployment step** — CI cannot reveal or supply a production target |
| `deploy/env.production.example` | Every Supabase value is `__PRODUCTION_SUPABASE_PROJECT_REF__` |
| `deploy/cloudrun/service.yaml` | `value: "${SUPABASE_PROJECT_ID}"` — substituted by `envsubst` at apply time; no literal ref |
| `deploy/CHECKLIST.md` §8 | "The production project reference is an owner input and is not recorded in this repository." |
| `deploy/POST_DEPLOY.md` | Defers to `https://<production-project-ref>.supabase.co/auth/v1/callback` |

### 1.3 Flutter

| Check | Result |
|---|---|
| `.dart` files in this repository | **0** |
| Live-tree references to "flutter" | **0** — every hit is inside `.local/pre-fix-backup/`, a stale snapshot |
| Project ref `ehxuygrsyaknhhsaihhx` | **0 occurrences anywhere in this repo** |

The Flutter application is **outside this repository**. Its Supabase configuration cannot be inspected from here, and no ref for it is recorded here. The only Flutter-relevant statements available are historical, from the snapshot:

- *"Flutter database is separate and out of scope."*
- *"Flutter local configuration points to a different ref, so shared-database synchronization is not verified."*

Both point to **separate databases**, but both are from a superseded audit and neither names a production project. Treat as **weak supporting evidence, not proof.**

### 1.4 Documented drift found (reporting, not fixing)

| Document | Says | Reality |
|---|---|---|
| `deploy/CHECKLIST.md` §8 | "local chain is 73 files; hosted ledger 53 through `20261105140000`. **21 pending**" | 73 applied, **8 pending** (Gate E, machine-verified) |
| `STAGING_VERIFICATION_PLAN.md:37` | `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID` = `ezrxykyocgbolpaebnqx` (**same ref**) | Now `obkfgxjzlscungkhbyvq` |
| `BOOKOURSPACE_FULL_APPLICATION_LIVE_AUDIT.md:2164` | `.env.local` refs = `ezrxykyocgbolpaebnqx` | Now `obkfgxjzlscungkhbyvq` |

These are stale references from the Stockholm era. They are also precisely why a ref found in a document must never be promoted to a production target by inference.

---

## 2. Production identity — **UNRESOLVED**

Applying the three-independent-sources test to the authenticated account:

| Source | Yields a production ref? |
|---|---|
| Committed configuration | **No** — all placeholders, by design |
| Reachable project in the account | **No** — only `obkfgxjzlscungkhbyvq` (dev) and `ezrxykyocgbolpaebnqx` (legacy dev), both in org `Babu` |
| Runtime declaration | **No** — `BOS_PRODUCTION_SUPABASE_PROJECT_ID` is unset everywhere |

| Project | Ref | Region | Status | Classification | Basis |
|---|---|---|---|---|---|
| React | `obkfgxjzlscungkhbyvq` | ap-south-1 | ACTIVE_HEALTHY | **development** | D7 list, `.env.local`, README, preflight scripts |
| — | `ezrxykyocgbolpaebnqx` | eu-north-1 | ACTIVE_HEALTHY | **legacy development** | D7 list, `.env.local.stockholm` |
| — | `sfoizxarbljhldmkgsma` | ap-south-1 (retired) | absent from account | **retired** | D7 list, `.env.local.mumbai`, env.save |
| **Production (React)** | **unknown** | — | — | **does not exist in this account** | no ref anywhere |
| **Production (Flutter)** | **unknown** | — | — | **external to this repo** | 0 references |

**Conclusion: production identity is not derivable from technical evidence.** A dedicated production project either has not been created, or exists in an account this session cannot see. Both are owner facts. Per the brief, identity is **not** inferred from names — "React" is a project name, not a role.

### 2.1 Do React and Flutter share production?

Currently **unanswerable**: neither app has a production project. What can be said:

- Today React development and Flutter are **not** the same database (historical audit + the absence of any Flutter ref here).
- The decision of whether they *will* share production cannot be read from the repository. `deploy/env.production.example` assumes one project for the React backend; nothing here accounts for a second writer.

---

## 3. Phase 2 — GPG verification readiness

### 3.1 The trap this gate found

`owner_gpg_test.sh` sources **only** `lib/bos_backup_crypto.sh`, not `lib/bos_target_guard.sh`. The library resolves the keyring as:

```
${BOS_BACKUP_GNUPGHOME:-$HOME/.config/bookourspace/backup-gnupg}
```

Two keyrings exist on this machine, and they are **not** interchangeable:

| Keyring | Fingerprint | UID | Canonical recipient present? |
|---|---|---|---|
| `~/.config/bookourspace/backup-gnupg` (default) | `CC5AE8D856FE65C7349E9EE94F2EF422CFD44129` | BookOurSpace Temporary Hosted Install | **NO** |
| `~/.config/bookourspace/backup-gnupg-recovery-20261106` (**canonical**) | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` | BookOurSpace Backup Recovery 2026 | **YES** |

Because the guard is not sourced, `BOS_KEYRING_DEFAULT` from `react-target.conf` is **not** applied. Run with only the recipient and the test hits the default keyring, fails to find the key, and exits **2 BLOCKED** — a misleading "blocked" that looks like a missing key rather than a missing `GNUPGHOME`.

**The exact command must therefore set `BOS_BACKUP_GNUPGHOME` explicitly.**

### 3.2 Exact command

```bash
cd /Users/aa/Downloads/bookourspace-react && \
BOS_BACKUP_GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
BOS_BACKUP_GPG_RECIPIENT=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
bash supabase/tests/owner_gpg_test.sh
```

Run it in **your own interactive terminal**, not through an agent shell.

### 3.3 What it verifies

- The canonical keyring exists and the recipient resolves inside it.
- A non-secret test string is encrypted to the recipient.
- The ciphertext is decrypted back **with your private key** and the SHA-256 is compared.
- Separation: the temporary directory is checked to be outside the repo and the backup tree.

It proves the full **encrypt → decrypt** loop, i.e. that an archive stamped with this key can actually be opened. It prints no key material and no credential.

### 3.4 Interactive passphrase?

**Yes.** `bos_crypto_roundtrip` decrypts, so GnuPG invokes pinentry for the private-key passphrase. That interaction is the entire reason this test is owner-only — it is the one thing no script can do for you.

### 3.5 Expected successful output

```
=== owner key encryption/decryption ===
encrypted with key E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A (private key stays in …)
PASS: owner key encrypted, decrypted and reproduced the test checksum.
PASS: no credential, key material or private-key path was printed.
```
Exit **0**.

### 3.6 Failure handling

| Exit | Meaning | Action |
|---|---|---|
| **2** | Keyring absent, recipient unset, or recipient not in the **resolved** keyring | Check `BOS_BACKUP_GNUPGHOME` first — this is almost certainly the default-keyring trap (§3.1), not a lost key |
| **5** | Encryption/decryption failed | Wrong passphrase, or pinentry unavailable. Retry; if the passphrase is unknown, the archive is unreadable and key recovery becomes the top priority |
| **0** | Round-trip verified | Record it; G3 closes |

**Do not** regenerate keys to "fix" a failure. A new key cannot decrypt existing archives.

---

## 4. Phase 3 — Backup readiness revalidated

| Item | Status |
|---|---|
| Backup guard (`bash -n`) | PASS — all six scripts syntax-clean |
| Guard-only preflight, re-run this gate | **exit 0** — "GUARDS PASS … exact ref verified, no connection attempted" |
| Target confirmed as `target verified: ref=obkfgxjzlscungkhbyvq via=pooler host=aws-0-ap-south-1.pooler.supabase.com port=5432 password_present=yes` | PASS |
| Refusal without authorisation | exit 3 (verified in Gate G) |
| Refusal on wrong ref | exit 3 (verified in Gate G) |
| Encryption recipient in config | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` — matches canonical keyring |
| Canonical keyring | present, `drwx------`, pub=1, sec=1, expires 2028-11-05 |
| Backup destination | `~/BookOurSpace_Backups/react`, `drwx------`, 17 entries, 11 MiB |
| Free disk | **9,436 MiB** (99 % used) — fluctuates 9.2–9.5 GiB between gates |
| Requirement | ≈ 2.2 GiB (peak temp 150–200 MB + retained 3 MB + 2 GiB margin) |
| Verdict | **READY** — nothing technical remains before an authorised run |

Command prepared in Gate G §2.7; **not executed.**

---

## 5. Phase 4 — Subscription tier findings

No CLI payload exposes the plan (`orgs list` returns id/name/slug; `projects list` returns no plan or subscription field), so the tier is established from **feature evidence plus published pricing**, not from a plan field.

### 5.1 Evidence

| Observation | Weight |
|---|---|
| 8 automatic daily physical backups exist (`COMPLETED`, 2026-11-17 → 2026-11-24) | decisive |
| Supabase pricing comparison table: **Automatic backups — Free: "Not included"** | decisive |
| Supabase KB: *"Does Supabase automatically back up my database on the Free plan? **No** … For automatic daily backups, upgrade to the Pro plan or above."* | decisive |
| Backups also documented as created for **all Pro, Team and Enterprise** projects | confirms paid |
| Retention observed = **exactly 7 days** | discriminates **Pro** (Team = 14, Enterprise = 30) |
| 2 projects (the Free cap) | **irrelevant** — paid plans have no such cap |

**Finding: the organisation is on a paid plan, most consistent with Pro.** Owner confirmation in the dashboard is still required because no API surface asserts it; the inference is strong but indirect.

### 5.2 What that makes available

| Capability | Status |
|---|---|
| Physical backups | **ACTIVE** — `walg_enabled: true`, 8 daily COMPLETED |
| PITR | **Available as add-on, disabled** (`pitr_enabled: false`) |
| Restore to a new project (clone) | **Available in principle** — requires paid plan ✔ and physical backups on source ✔ |
| Hosted branching | Paid-plan feature; **not independently verified this gate** — confirm in the dashboard if it is ever wanted (nothing in this plan depends on it) |
| Database size limit | Pro: **8 GB disk included**, then $0.125/GB — current usage **20 MB (0.25 %)** |
| Compute | Micro: **$0.01344/h ≈ $10/mo**, max DB 10 GB |
| Storage | 100 GB included on Pro; current usage 148,357 B across 2 objects |
| Database-only clone possible? | **Yes** — Supabase's restore-to-new-project creates a database-only copy (no Storage bytes, no Edge Functions, no Auth provider settings, no API keys) in the same region |

---

## 6. Recovery cost estimate

| Scenario | Cost | Notes |
|---|---|---|
| **Fresh encrypted backup (A1)** | **$0** | Read-only dump to local disk; no hosted charge |
| **Local restore rehearsal (A3)** | **$0** | Local cluster only |
| **Hosted clone, 24 h (A4)** | **≈ $0.32** | $0.01344/h × 24 |
| **Hosted clone, 7 days** | **≈ $2.26** | |
| **Hosted clone, left running a month** | **≈ $10** | The real risk, not the restore itself |
| Clone disk | **$0** | 20 MB vs 8 GB included |
| PITR add-on | **$100/mo** (7-day, $0.137/h) | **Not needed.** Not covered by spend cap. Do not enable to satisfy a restore requirement |
| Plan upgrade | $0 | Already paid |

**Bottom line: the entire recovery rehearsal costs well under one dollar** provided the clone is deleted the same day. PITR — at a hundred dollars a month — buys nothing this plan needs.

---

## 7. Six-permission register

Each is independent. **No approval is inferred from any other, and none is inferred from this gate's work.**

| # | Permission | Status | Evidence / blocker |
|---|---|---|---|
| **A1** | Fresh production backup only | **NOT APPROVED** | Technically READY (§4); no production project exists to back up; no owner authorisation |
| **A2** | Download backup | **NOT APPROVED** | Hosted physical backups are not downloadable (documented); a local archive already exists and needs no download |
| **A3** | Local isolated restore rehearsal | **NOT APPROVED** | Tooling verified; executor not authorised |
| **A4** | Paid hosted recovery clone | **NOT APPROVED** | Wave requires a source project; no production ref; plan eligibility looks satisfied |
| **A5** | Execute pending migrations | **NOT APPROVED** | 8 pending; 6 of 8 not self-transactional; no target |
| **A6** | Production deployment | **NOT APPROVED** | Fails closed without `BOS_PRODUCTION_SUPABASE_PROJECT_ID`; D7 armed |

All six: **NOT APPROVED** — nothing here is AWAITING OWNER except in the sense that every one of them needs an owner signature.

---

## 8. Remaining blockers

| # | Blocker | Owner-actionable? |
|---|---|---|
| **H1** | **Production project unidentified** — not in repo, not in account, not in CI, not in deploy config | **Yes** — name the ref |
| H2 | GPG passphrase never exercised interactively | **Yes** — one command (§3.2) |
| H3 | Owner GPG test resolves the *default* keyring unless `BOS_BACKUP_GNUPGHOME` is set (would report BLOCKED misleadingly) | No — mitigated by the exact command |
| H4 | `PGOPTIONS` read-only does not survive Supavisor (defence-in-depth gap, not a correctness gap) | No — needs a code change decision |
| H5 | 6 of 8 pending migrations are not self-transactional | No — design work |
| H6 | Disk at 99 % (9.4 GiB free) | Partly — reclaim space |
| H7 | Flutter app outside this repository; its Supabase config unverifiable here | **Yes** — provide its config or confirm scope |
| H8 | Plan tier not asserted by any API surface | **Yes** — confirm in dashboard |
| H9 | Documentation drift (CHECKLIST says 21 pending; actual 8) | No — will be corrected when edits are authorised |

---

## 9. Exact next recommended action

**Run the owner GPG round-trip test**, unchanged, in your own terminal:

```bash
cd /Users/aa/Downloads/bookourspace-react && \
BOS_BACKUP_GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
BOS_BACKUP_GPG_RECIPIENT=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
bash supabase/tests/owner_gpg_test.sh
```

It takes seconds, costs nothing, needs no project identity, and closes the only blocker that can be closed without new information: **whether your encrypted backup can actually be opened.**

Then, and this is the one that unlocks everything else: **name the production project ref (D1).** The plan is complete on every other axis; it is blocked on a single identifier that only you hold.

---

## 10. GO / NO-GO

| Stage | Verdict |
|---|---|
| Production identity resolution | **NO-GO — unresolved**, not inferable from technical evidence |
| React dev mapping | **GO** — `obkfgxjzlscungkhbyvq`, verified |
| Flutter mapping | **NO-GO** — application external to this repo |
| Shared production database | **UNRESOLVED** — no production project exists to share |
| GPG readiness | **GO on owner execution** — encryption proven; decryption owner-only |
| Backup readiness | **GO** — guards pass, keyring canonical, disk sufficient |
| Backup execution | **NO-GO** — A1 not approved; no production target |
| Plan eligibility | **GO (paid, most likely Pro)** — clone and physical backups available; owner confirmation outstanding |
| Clone creation | **NO-GO** — A4 not approved; no source |
| Migration execution | **NO-GO** |
| Production deployment | **NO-GO** |

**Nothing in this gate claims production readiness.** The recovery machinery is verified; the production project it is meant to protect is still unknown, and no amount of preparation substitutes for that identifier.

---

## Appendix — Evidence boundary

**Verified this gate:** git baseline and D7 content; every env file's ref (values never printed); absence of Flutter artefacts and of the Flutter ref; CI has no Supabase secrets; deploy templates hold placeholders only; `owner_gpg_test.sh` source and its keyring resolution; both keyrings' fingerprints and recipient presence; backup guard re-run (exit 0, no connection); destination and disk; Supabase published pricing and backups documentation.

**Not verified:** the production project (does not exist in this account); the Flutter Supabase configuration (not in this repo); the subscription tier by direct API assertion (inferred from backup entitlement and 7-day retention); any clone behaviour (none created); hosted backup contents (not downloadable); passphrase round-trip (owner-only, deliberately not executed).
