# Gate L5 — Owner Decisions & Final Pre-Capture Reconciliation

**Date:** 2026-11-24 · **Evidence captured:** local re-measurement, 0 database contact
**Mode:** DECISION REGISTER ONLY. No capture, no dump, no backup, no decryption, no migration, no restore,
no extension install, no credential change or test, no production access, no Git mutation.
**Verdict: all seven owner decisions PENDING — nothing approved, nothing executed.**

Read for this gate: `SUPABASE_RECOVERY_GATE_L4_CAPTURE_READINESS.md`,
`SUPABASE_RECOVERY_GATE_L3_GPG_VERIFICATION.md`,
`SUPABASE_RECOVERY_GATE_K_CANONICAL_SCHEMA_DESIGN.md`,
`SUPABASE_CANONICAL_DATABASE_BLUEPRINT.md`.

---

## 0. Input completeness — read this before trusting the register

The Gate L5 instruction was delivered **twice and truncated both times at the same point**: inside Phase 1
(D5) on the first delivery, and inside Phase 2's closing sentence — *"Record every decision as APPROVED, DECLIN"* — on
the second. Both truncations fall at the same character budget, so this is a message-length cap, not a
partial paste.

| Element | Received? | Handling |
| --- | --- | --- |
| Objective | **Yes**, complete | followed exactly; no execution, four-way separation in §3 |
| Phase 1 — evidence list + corrected facts | **Yes**, complete | §1 adopts every corrected figure as given |
| Phase 2 — **D1 through D7** | **Yes**, complete | §2 records all seven verbatim in substance |
| Phase 2 closing status vocabulary | **Partial** — "APPROVED, DECLIN…" | assumed to be **APPROVED / DECLINED / DEFERRED** (§6 A-1) |
| Phase 3 and later | **No** | not invented; §3–§5 built from the objective's own four-way split |
| Deliverable filename | **No** | this file, named per the L-series convention (§6 A-2) |
| Restrictions block | **No** | the standing rules from L1–L4 continue to apply unmodified (§7) |

**Consequence:** nothing here is recorded as answered, because no answer was given. A register that guessed
an approval would be worse than no register at all.

---

## 1. Phase 1 — Evidence base

### 1.1 Corrected figures adopted as authoritative

These supersede every earlier figure in the programme, including the Blueprint's §13 step 2 ("8 pending
migrations… 17 tables appear"), which is now known to be wrong on both counts.

| # | Fact | Value | Source of authority |
| --- | --- | --- | --- |
| 1 | React local migration files | **81** | re-measured this gate |
| 2 | React hosted migration versions | **74** | Gate L4 §4.2 (measured twice, read-only) |
| 3 | Pending migrations | **7** — **filenames NOT established** | 81 − 74; identity requires D4 |
| 4 | React live schema | **74 base tables + 1 view** (`public_provider_profiles`) | live census, Gates L1/L2 |
| 5 | "17 tables" figure | **schema-set difference, NOT a pending-file count** | Gate L4 §4.2 |
| 6 | Flutter declared tables | **41** across 16 migrations | Gate K §2 |
| 7 | Flutter Storage DDL | **none** — 0 bucket references in all 16 migrations | Gate K §2.7 |
| 8 | D6 GPG round-trip | **PASS** (2026-11-24T11:52:53Z, exit 0) | Gate L3 §2 |
| 9 | Archive decryptability | **UNPROVEN** — no existing archive has ever been opened | Gate L3 §5, L4 §3 |
| 10 | Credential incident | **OPEN**; rotation **DEFERRED BY OWNER** | Gates L2 §1, L4 §1.5 |
| 11 | Development target | `obkfgxjzlscungkhbyvq` (ap-south-1) — **NOT production** | Gate L4 §1.1 |
| 12 | React working tree | pre-existing changes — **preserved, untouched** | re-verified §1.2 |

**Why fact 5 matters:** deriving "17 pending migrations" from the 17-table set difference would put A3 on a
false plan. The difference is 77 declared − 60 live intersection, which closes arithmetically with
74 live = 60 migrated + 14 legacy. It never depended on the pending count.

### 1.2 Fresh local verification (this gate, zero database contact)

| Check | Observed now | Expected | Result |
| --- | --- | --- | --- |
| Local migration files | **81** | 81 | **PASS** |
| Newest file | `20261112050000_business_ownership_phase5_transfer.sql` | matches L4 §4.2 candidate list | **PASS** |
| React HEAD | `feat/universal-gps-tracking` @ `96c1297` | unchanged | **PASS** |
| React change set | **1 modified · 0 staged · 13 untracked** | pre-existing; preserved | **PASS** — nothing staged, nothing mutated |
| D7 development refs | **3 distinct** | 3 | **PASS** |
| Backup destination entries | **17** | 17 (unchanged) | **PASS** — 0 created |
| Backup destination size | **11 MB** | small | **PASS** |
| Free disk | **9,149 MiB** | ≥ 2,048 MiB | **PASS** (≈4.5× margin) |
| Canonical keyring | `drwx------` | owner-only | **PASS** |
| Database connections made | **0** | 0 | **PASS** |
| Files created / transferred | **1** (this report) | 0 capture artifacts | **PASS** |

The 13 untracked entries are the L-series gate reports themselves. This gate adds a 14th and changes
nothing else.

### 1.3 Static object inventory of the seven pending *candidates* (local grep, not a ledger)

Correcting L4 §4.2's candidate table with this gate's measurement — note `phase2_backfill` also declares
0 policies:

| Candidate file | `CREATE TABLE` | `CREATE POLICY` | `CREATE FUNCTION` |
| --- | --- | --- | --- |
| `20261111200000_dynamic_service_category_builder` | 6 | 12 | 23 |
| `20261111210000_service_document_storage_access` | 0 | 2 | 0 |
| `20261112010000_business_ownership_phase1` | 6 | 12 | 8 |
| `20261112020000_business_ownership_phase2_backfill` | 0 | 0 | 0 |
| `20261112030000_business_ownership_phase3_rls` | 0 | 17 | 2 |
| `20261112040000_business_ownership_phase4_rls` | 0 | 7 | 0 |
| `20261112050000_business_ownership_phase5_transfer` | 1 | 1 | 1 |
| **Total if all seven are pending** | **13** | **51** | **34** |

**13 ≠ 17.** Either the pending set is not the newest seven, or applied migrations' tables were later
dropped. This is unresolved and is precisely what **D4** exists to settle. No local artifact can resolve
it: the CLI state directories were inspected by name only
(`cli-latest`, `gotrue-version`, `linked-project.json`, `pooler-url`, `postgres-version`, `project-ref`,
`rest-version`, `storage-migration`, `storage-version`) and **none contains a migration ledger**.

---

## 2. Phase 2 — Owner decision register

**Every entry below is `PENDING — NOT ANSWERED`.** The status field is left blank deliberately; it may
only be completed by the owner, in writing, per decision. No approval is inferred from any prior gate, from
the D6 success, or from the recommendations in this document.

### D1 — A1: React schema-only capture

**Question.** Does the owner explicitly authorize **one** schema-only dump from development project
`obkfgxjzlscungkhbyvq`?

| Field | Record |
| --- | --- |
| What approval authorises | one `supabase db dump --linked` run, schema-only (CLI default), plus the read-only metadata queries for families 4, 6, 7, 8 (ledger, event triggers, publications, roles) |
| Exact command | `npx --no-install supabase db dump --linked --workdir .local/pre-fix-backup --file "$OUT/schema.sql"` with `umask 077` |
| Exact output path | `~/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-schema-$STAMP/`, `drwx------` |
| Encryption recipient | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` (canonical keyring only) |
| What it does **not** authorise | A1b, A2 restore, A3 migrations, A5 PostGIS, production, any off-machine transfer |
| Preconditions | Gate L4 §6's **12** prerequisites, all of them — notably correct `--workdir` (the repo root is **not linked**), no unmasked `--dry-run`, coverage verification against the census, and decrypt-and-diff of the new artifact in the same gate |
| Standing evidence | D6 PASS removed the cryptographic objection; the incident remains the sequencing question (D3) |
| Recommendation | **APPROVE** — no fresh baseline exists; the newest archive is ~14 days old and the 14 legacy tables have never been dumped at all |
| **Owner answer** | *(none received)* |
| **Status** | **PENDING — NOT ANSWERED** |

### D2 — A1b: Storage configuration capture

**Question.** Does the owner explicitly authorize read-only capture of the **3 Storage bucket configuration
rows** and **7 Storage policies**?

| Field | Record |
| --- | --- |
| What approval authorises | read-only `select` on `storage.buckets` (3 rows) and `pg_policies where schemaname='storage'` (7 rows), emitted as SQL |
| Why separate from D1 | buckets are **configuration rows**, not DDL. A schema dump cannot contain them, and approving a schema capture must not be read as approving a data export |
| Payload size | kilobytes |
| What it does **not** authorise | any object in any bucket, any `storage.objects` content read, any bucket creation or mutation |
| Gap if declined | a restored project has **no buckets**; all 7 storage policies dangle; upload/view rules are lost |
| Recommendation | **APPROVE together with D1** — the fidelity cost of declining is disproportionate to the payload |
| **Owner answer** | *(none received)* |
| **Status** | **PENDING — NOT ANSWERED** |

### D3 — Credential rotation

**Question.** Should password rotation remain deferred, or does the owner want to complete it **before**
any capture?

| Field | Record |
| --- | --- |
| Exposed secret | database login password for `cli_login_postgres.obkfgxjzlscungkhbyvq` — **`postgres`-equivalent** on the dev project |
| Vector | `supabase db dump --dry-run` prints `export PGPASSWORD="…"` (tool design, not operator typo) |
| Reached production? | **No** — production has never been configured in this environment |
| Recorded owner position | *"I have not reset the development database password yet. I intend to rotate it later during the security cleanup."* (Gate L2 §1, preserved verbatim in L4 §1.5) |
| Current register status of the incident | **OPEN** — and this gate does **not** close it, soften it, or report it as resolved |
| Containment options | (a) rotate the `postgres` password — clean, invalidates all derived pooler logins; (b) `alter role "cli_login_postgres.obkfgxjzlscungkhbyvq" nologin` — surgical, needs an approved write; (c) keep deferring — accepted risk stays live |
| Prohibited here | **Never test or reuse the exposed credential.** Verifying whether it still authenticates would require presenting it, which is forbidden — so the incident cannot be closed by measurement, only by rotation |
| Recommendation | **Complete rotation before capture**, so the baseline is taken on a contained target; `nologin` as the stop-gap if the app's own password cannot change immediately |
| **Owner answer** | *(none received)* |
| **Status** | **PENDING — NOT ANSWERED**; incident **OPEN** regardless of the answer |

### D4 — Migration ledger reconciliation

**Question.** Does the owner authorize **one read-only query** against `supabase_migrations.schema_migrations`
to compare hosted versions with the 81 local filenames and identify the exact **7** pending files?

| Field | Record |
| --- | --- |
| What approval authorises | one wrapped `begin read only; … rollback;` query listing `version, name` from `supabase_migrations.schema_migrations`, diffed locally against `supabase/migrations/*.sql` |
| Command shape | `npx --no-install supabase db query --linked --workdir .local/pre-fix-backup --file <sql>` |
| What it does **not** authorise | any write, any `migration repair`, any `migration up`, any DDL or DML |
| Why it is a hard dependency | the newest 7 local files create **13** tables; the schema-set difference says **17**. **13 ≠ 17** means the pending identity cannot be inferred from filenames, ordering, or counts. No local ledger cache exists (§1.3) |
| Blocks | A3 correctness — applying the wrong seven, or assuming the right seven, is a schema-drift incident |
| Recommendation | **APPROVE** — single read-only query, no writes, settles an open measurement question that would otherwise corrupt A3 |
| **Owner answer** | *(none received)* |
| **Status** | **PENDING — NOT ANSWERED** |

### D5 — Future archive decryption verification

**Question.** Does the owner authorize a decryption-and-integrity check of **one future encrypted
archive**, but **ONLY after** archive creation has been separately authorised and completed?

| Field | Record |
| --- | --- |
| What approval authorises | decrypt that archive into a restricted temporary location, verify SHA-256/content integrity, record the result, securely delete the temporary plaintext |
| Sequencing | **strictly after** a separately authorised creation run. Approval here does not authorise the creation |
| What it does **not** authorise | archive **creation**, database **restore**, production access, or any additional capture |
| Keyring | canonical `~/.config/bookourspace/backup-gnupg-recovery-20261106` only; never the legacy keyring |
| Scope gap this decision leaves open | it covers a **future** archive. The **17 existing** archives — including `obkfgxjzlscungkhbyvq-20261110T041600Z` — remain **untested**. Gate L4's D-5 proposed a decrypt test of one *existing* archive; L5's D5 replaces it with a *future* one. Both are wanted; only the future case is on the table here |
| Recommendation | **APPROVE** — a dump nobody has opened repeats the D6 gap at larger scale |
| **Owner answer** | *(none received)* |
| **Status** | **PENDING — NOT ANSWERED** |

### D6 — Backup custody

**Question.** Which custody boundary is intended?

| Option | Meaning | Cost / consequence |
| --- | --- | --- |
| **A** | Encrypted **local-only** archive | key, Keychain and archives all remain on this one Mac — a single machine failure or theft loses everything (Gate L4 R-9) |
| **B** | Encrypted archive **plus an owner-approved off-machine destination** | requires the owner to name a confirmed destination; **no upload or transfer happens under this gate** |

| Field | Record |
| --- | --- |
| What approval authorises | **the choice of boundary only** — no upload, no transfer, no account creation, no destination configuration |
| Explicit limit | any actual off-machine copy needs **separate explicit authorization and a confirmed destination** first |
| Current factual state | Option A in practice: 17 entries, 11 MB, on this machine, with the private key also on this machine and its passphrase in the local Keychain |
| Recommendation | **Option B**, with the destination decided before production — but recorded now as a boundary, not an action |
| **Owner answer** | *(none received)* |
| **Status** | **PENDING — NOT ANSWERED** |

### D7 — PostGIS / A5

**Question.** Confirm whether **PostGIS installation remains deferred**.

| Field | Record |
| --- | --- |
| Observed state | `postgis`: **installed 0, available 1** |
| Consequence of deferral | Flutter's lineage is blocked at `venues.geog`; `btree_gist` is separately required by Flutter's `EXCLUDE` and by `core.resource_claim` |
| What this gate authorises | **nothing** — no extension installation of any kind |
| Recommendation | **CONFIRM DEFERRED** until A1 and A2 are complete; revisit when Flutter re-homing starts |
| **Owner answer** | *(none received)* |
| **Status** | **PENDING — NOT ANSWERED** |

### 2.1 Register summary

| Decision | Subject | Recommendation | Owner answer | Status |
| --- | --- | --- | --- | --- |
| D1 | A1 schema-only capture | APPROVE | — | **PENDING** |
| D2 | A1b storage config capture | APPROVE (with D1) | — | **PENDING** |
| D3 | Credential rotation | ROTATE BEFORE CAPTURE | — | **PENDING** — incident **OPEN** |
| D4 | Ledger reconciliation (read-only) | APPROVE | — | **PENDING** |
| D5 | Future archive decrypt check | APPROVE (conditional on creation) | — | **PENDING** |
| D6 | Backup custody boundary | OPTION B (off-machine) | — | **PENDING** |
| D7 | PostGIS / A5 | CONFIRM DEFERRED | — | **PENDING** |

**Approved: 0 of 7. Declined: 0 of 7. Deferred: 0 of 7. Unanswered: 7.**

---

## 3. Four-way separation (the objective's core requirement)

### 3.1 Verified facts — measured, reproducible, no inference

1. 81 local migration files; newest is `20261112050000_business_ownership_phase5_transfer.sql`.
2. 74 hosted migration versions → **7 pending**, identity unknown.
3. Live schema is 74 base tables + 1 view.
4. The 17-table figure is a schema-set difference, not a pending-file count.
5. Flutter declares 41 tables in 16 migrations and **0** Storage DDL.
6. D6 GPG round-trip passed with exit 0 on the canonical fingerprint.
7. No existing archive has ever been decrypted.
8. The credential incident is OPEN; rotation is DEFERRED BY OWNER.
9. `postgis` is absent (installed 0, available 1).
10. React @ `96c1297` with 1 modified / 13 untracked; D7 3 distinct refs; 17 backup entries / 11 MB; 9,149 MiB free; keyring `drwx------`.

### 3.2 Proposed actions — designed, specified, **not executed**

| # | Action | Fully specified? | Blocked by |
| --- | --- | --- | --- |
| P1 | A1 schema-only dump + metadata families, encrypt to canonical fpr | Yes (L4 §6, 12 prerequisites) | **D1**, D3 sequencing |
| P2 | A1b bucket rows + storage policies capture | Yes | **D2** |
| P3 | Read-only ledger diff → exact 7 filenames | Yes (query shape in §2 D4) | **D4** |
| P4 | Rotate `postgres` password / `nologin` the CLI role | Described, not scripted | **D3** |
| P5 | Decrypt-and-verify one future archive | Yes, scoped in D5 | **D5** + a D1 run |
| P6 | Choose custody boundary; later name a destination | Boundary only | **D6** |
| P7 | Restore rehearsal (A2) on a throwaway database | Sketched in Blueprint §13.3 | A1 output + explicit approval |
| P8 | Apply 7 pending migrations (A3) | Blocked on P3's result | **D4** → then explicit approval |
| P9 | PostGIS / A5 | Described in Blueprint §9.1 | **D7** |
| P10 | Flutter re-homing into `mobile`, `core` contracts | Blueprint §7–§8, unapproved architecture | Option C approval + A5 |

### 3.3 Owner decisions — seven, all open

D1–D7 in §2. No answer was received for any of them, and none is inferred.

### 3.4 Outstanding blockers — carried forward, with owners

| # | Blocker | Severity | Closes when |
| --- | --- | --- | --- |
| B-1 | Incident OPEN; exposed `postgres`-equivalent dev credential valid-until-rotation | **High** | D3 answered **and** rotation/containment verified |
| B-2 | No fresh baseline; newest archive ~14 days old; 14 legacy tables never dumped | **High** | D1 answered and P1 completes |
| B-3 | A CLI dump alone loses 6 of 12 capture families — a project that looks restored but isn't | **High** | D1 **and** D2, with §4.1 scope discipline |
| B-4 | Restore never rehearsed; encryption proof ≠ restore proof | **High** | A2, after P1 |
| B-5 | Pending-7 identity unresolved (13 vs 17) | Medium | D4 answered and P3 completes |
| B-6 | 17 existing archives never individually decrypted | Medium | a decrypt test of an **existing** archive (not in D5's scope) |
| B-7 | `postgis` absent → Flutter lineage blocked at `venues.geog` | Medium | D7 + A5 |
| B-8 | Single-machine custody: key, Keychain and archives all on one Mac | Medium | D6 = Option B, then a named destination |
| B-9 | `schema_and_rls.sql` is a narrow stale snapshot (profiles 7/15 cols, bookings 13/30) | Medium | keep demoted to reference; never a baseline |
| B-10 | Disk drifts ~200 MiB/period with a 100 %-full volume reported | Low | re-check immediately before any capture |

---

## 4. Reconciliation notes — where earlier documents now disagree

Recorded so no future gate silently picks the convenient version.

| Earlier statement | Where | Now |
| --- | --- | --- |
| "8 pending migrations" | Gates G, J, K, Blueprint §13.2 | **7** — retired |
| "73 ledger rows" | Gate L | **74** — retired |
| "17 tables appear when pending migrations apply" | Gate K §3, Blueprint §13.2 | **13** tables in the newest seven files; the 17 is a schema-set difference. Unresolved until D4 |
| "3 refs" (D7) | Gates F–K shorthand | **3 distinct development refs**; the dev ref appears once. Guard diff 0 |
| D-5 = decrypt one **existing** archive | Gate L4 §8 | L5's D5 covers a **future** archive; existing 17 remain untested (B-6) |
| Rotation "during security cleanup" | Gate L2 §1 | still the recorded position; incident still OPEN; D3 now asks for an explicit pre/post-capture ruling |

---

## 5. What this gate did not do

- **No database contact of any kind** — no dump, no query, no `--dry-run`, no `migration list`, no restore.
- **No decryption** — not one archive, not one test payload.
- **No credential access, retrieval, test or reuse** — the exposed value was never presented to anything.
- **No extension install**, no project creation, no clone.
- **No production contact** — `BOS_PRODUCTION_SUPABASE_PROJECT_ID` remains unset in this environment.
- **No Git mutation** — nothing staged, committed, or pushed; the pre-existing modified file and 13 untracked reports are untouched.
- **No file transfer** and no destination configured, despite D6 being on the table.
- One file written: this report.

---

## 6. Assumptions forced by the truncated instruction

| # | Assumption | Basis | Risk if wrong |
| --- | --- | --- | --- |
| A-1 | The status vocabulary is **APPROVED / DECLINED / DEFERRED** | the received fragment "APPROVED, DECLIN…" | cosmetic — every decision is recorded un-answered regardless |
| A-2 | Deliverable is `SUPABASE_RECOVERY_GATE_L5_OWNER_DECISIONS.md` | L-series naming convention | a rename on request |
| A-3 | Phases beyond Phase 2 are served by §3's four-way separation and §3.4's blocker list | the objective names exactly those four categories | a missing section can be added without re-running the gate |
| A-4 | L1–L4's standing rules continue to apply verbatim | consistency across the series; nothing in L5 relaxes them | none — the stricter reading was taken |

---

## 7. Verdict

**Register: 7 decisions presented, 0 answered, 0 approved.**

The evidence base is now internally consistent and corrected: 81 local files, 74 hosted versions, 7 pending
whose **filenames are unknown**, 74 tables + 1 view live, 13 tables in the newest seven candidate files, and a
17-table figure that is a schema-set difference rather than a migration count. The D6 key proof is real and
does not extend to any archive. The **credential incident is OPEN** and rotation remains **DEFERRED BY
OWNER** — recorded as a decision, never as closure.

Nothing can move until the owner answers. The cheapest unblocking step is **D4**: one read-only query, no
writes, which removes the only measurement question standing between this register and a correct A3 plan.
The most consequential is **D3**, because it decides whether the first fresh baseline in fourteen days is
taken on a contained target or on a target with a live `postgres`-equivalent credential.

**D1 · D2 · D3 · D4 · D5 · D6 · D7 — ALL PENDING · A1 · A1b · A3 · A5 NOT APPROVED · Production NO-GO ·
Rotation DEFERRED · Incident OPEN.**

*Stopping here. No capture, no dump, no decryption, no migration, no restore, no extension install, no
credential change, no production access and no Git mutation was performed in this gate. Awaiting the
owner's answers to D1–D7.*
