# Gate L4 — Credential Incident Review & Schema Capture Readiness

**Date:** 2026-11-24 · **Evidence captured:** 15:27Z
**Mode:** READ-ONLY ASSESSMENT. No dump, backup, migration, restore, extension install, credential change,
production access or Git mutation.
**Verdict: capture remains NO-GO** — not for cryptographic reasons (D6 now PASSES), but because **A1 and
A1b are unapproved** and the **credential incident is OPEN** by owner decision.

Read for this gate: `…L1_CREDENTIAL_CONTAINMENT.md`, `…L2_SECURITY_CLOSURE.md`,
`…L3_GPG_VERIFICATION.md`, `…K_CANONICAL_SCHEMA_DESIGN.md`.

---

## 1. Credential incident status — **OPEN**

### 1.1 What was exposed

| Property | Record |
| --- | --- |
| Secret class | **Database login password** — not a JWT, not an `anon` key, not a `service_role` key, not a management API token, not a personal access token |
| Role | `cli_login_postgres.obkfgxjzlscungkhbyvq` — a Supavisor pooler login minted by the Supabase CLI |
| Effective privilege | the **`postgres`** database user on the dev project — full DDL and DML on every schema in that database, including `public`, `private` and `storage` metadata |
| Project | `obkfgxjzlscungkhbyvq` — **development only** (ap-south-1 / Mumbai) |
| Vector | `supabase db dump --dry-run --linked` prints its generated shell script to stdout, and that script contains `export PGPASSWORD="…"` |
| Root cause | **tool design**, not operator typo: the CLI must export a password for `pg_dump`, and `--dry-run` prints the whole script. Any unmasked `--dry-run` leaks a live credential |
| Discovered | Gate L, by reading tool output; masking had covered `postgres://` URIs but not the `PGPASSWORD` variable |

**What the credential is *not*:** it confers **no** management-plane power (no project creation, no
settings change, no billing, no key retrieval), **no** Storage object API power beyond what SQL grants,
and **no** access to production — production has never been configured in this environment
(`BOS_PRODUCTION_SUPABASE_PROJECT_ID` set in runtime env: **0**).

### 1.2 Confirmation that the exposed credential was not reused

| Check | Result |
| --- | --- |
| Retrieved from storage, replayed or tested since discovery | **No** — not in Gates L1, L2, L3 or L4 |
| `supabase db dump --dry-run` re-executed | **No** — prohibited by owner instruction 5 and not run since Gate L |
| Present in any file on disk | **No** — 0 files match a 20+-character `PGPASSWORD="…"` assignment |
| Present in CLI cache | **No** — `.temp/pooler-url` is 93 bytes with 0 password-shaped matches |
| The two real-password files (`.env.local`, `.local/pre-fix-backup/.env.local`) | **Different role** — they address the `postgres` user directly; the leaked value belongs to `cli_login_postgres`. Different roles carry different passwords, so these cannot be the leaked value. Both git-ignored |
| 18 loose URI matches | fixtures and `.env.example` placeholders — excluded by the strict 20+-character pattern |
| Residual copies | **chat transcript** (unavoidable, treat as sensitive) and the **operator's shell history/scrollback** (out of scope, not inspected) |

**Honest limit:** "not reused" is established by *absence of any action that would use it*, not by a
negative test. Testing whether it still authenticates would require presenting it, which is forbidden —
so this gate cannot and does not prove the value is dead.

### 1.3 Can the CLI-minted login role be invalidated independently?

**Yes — and by an owner action that needs no knowledge of the secret.**

| Mechanism | Effect | Authorised? |
| --- | --- | --- |
| **Reset the `postgres` database password** (dashboard → Project Settings → Database) | Supavisor derives pooler credentials from the database password, so every CLI-minted login mapped to `postgres` — including the leaked one — stops authenticating | **owner action, DEFERRED** |
| `alter role "cli_login_postgres.obkfgxjzlscungkhbyvq" nologin` (or `connection limit 0`) | Blocks that one role's logins immediately without touching the shared password | **needs SQL — not authorised in this gate; would be A1-adjacent write, not read** |
| `drop role "cli_login_postgres…"` | Removes the login entirely; the CLI re-mints a fresh one on its next privileged operation | **needs SQL — not authorised** |
| Waiting for natural expiry | **Not relied upon.** No evidence of auto-expiry; conservative assumption is valid-until-rotated | n/a |

So rotation is the *clean* fix and role-level `nologin` is the *surgical* one. Both require the owner or an
approved write, and neither is exercised here.

### 1.4 Remediation options — none of which tests the credential

1. **Rotate the `postgres` password** (primary; invalidates all derived pooler logins). Owner decision.
2. **Role-level containment** — `nologin` / `connection limit 0` on the CLI role, as a faster-acting stop
   if the owner wants to avoid rotating the app's own DB password immediately.
3. **Keep the exposure dev-bounded** — already true: the credential cannot reach production, and
   production is unconfigured. This bounds blast radius to dev data and dev schema.
4. **Stop the leak recurring** — never run `db dump --dry-run` unmasked; when unavoidable, pipe through
   `sed -E 's#PGPASSWORD="[^"]*"#PGPASSWORD="[REDACTED]"#g'`.
5. **Clear the operator's scrollback/history** for the session where Gate L ran.
6. **Treat this transcript as sensitive** — do not export or share it.

### 1.5 Owner decision — preserved, not argued with

Owner's recorded position (Gate L2 §1): *"I have not reset the development database password yet. I intend
to rotate it later during the security cleanup."*

| Field | Value |
| --- | --- |
| Rotation | **DEFERRED BY OWNER** |
| Incident | **OPEN** |
| Accepted risk | the exposure clock keeps running: a `postgres`-equivalent credential to a dev database holding real provider/client data stays live until rotation |
| This gate's posture | recorded as an owner decision; **not** reported as resolved anywhere in this document |

---

## 2. D6 evidence reference — **PASS, verified**

Gate `SUPABASE_RECOVERY_GATE_L3_GPG_VERIFICATION.md` §2, run **2026-11-24T11:52:53Z → 11:52:54Z**, exit **0**:

```
encrypted with key E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A (private key stays in …backup-gnupg-recovery-20261106)
encrypted archive decrypts cleanly
decrypt round-trip reproduces the recorded plaintext checksum
PASS: owner key encrypted, decrypted and reproduced the test checksum.
PASS: no credential, key material or private-key path was printed.
```

Independently re-confirmed this gate: canonical keyring `~/.config/bookourspace/backup-gnupg-recovery-20261106`
is `drwx------`, parent `~/.config/bookourspace` is `drwx------`, fingerprint `E18BA34D…267A8E5A`.
Both scripts remain at **0 diff**.

**Consequence for this gate:** D6 is retired as a blocker. It was B-2 in Gate L1's blocker list; it is now
cleared. What it proves is key custody — the key can be *used*. It does **not** prove any existing archive
is readable, that a dump survives encrypt→decrypt, or that a restore reproduces a working database.

---

## 3. Backup readiness verification

| Check | Observed | Threshold | Result |
| --- | --- | --- | --- |
| Canonical GPG round-trip | exit 0, checksum reproduced (§2) | witnessed PASS | **PASS** |
| Destination `~/BookOurSpace_Backups` | `drwx------ aa:staff` | owner-only | **PASS** |
| Destination `~/BookOurSpace_Backups/react` | `drwx------ aa:staff` | owner-only | **PASS** |
| Keyring dir + parent | `drwx------` / `drwx------` | owner-only | **PASS** |
| Entries in destination | **17** | unchanged | **PASS** — nothing created |
| Free disk | **9,144–9,354 MiB** (two readings during this gate) | ≥ 2,048 MiB | **PASS** (≈4.5× margin) |
| Dev target identity | `.local/pre-fix-backup/supabase/.temp/project-ref` = `obkfgxjzlscungkhbyvq` | dev project | **PASS** |
| Repo-root link | **absent** (`supabase/.temp/project-ref` does not exist) | absent | **PASS** |
| D7 development refs | **3 distinct**: `obkfgxjzlscungkhbyvq` (dev/Mumbai), `ezrxykyocgbolpaebnqx` (legacy/Stockholm), `sfoizxarbljhldmkgsma` (retired/Mumbai) | 3 | **PASS** |
| D7 file diff | **0 lines** | 0 | **PASS — unweakened** |
| `BOS_PRODUCTION_SUPABASE_PROJECT_ID` in runtime env | **0** | unset | **PASS** |
| React | `feat/universal-gps-tracking` @ `96c1297` — 1 modified · 0 staged · 12 untracked | unchanged HEAD | **PASS** |
| Flutter | `main` @ `fc35976` — 0 dirty entries | clean | **PASS** |
| New archives / dumps / `.gpg` this gate | **0** | 0 | **PASS** |

**Correction of a recurring reporting ambiguity (not a change of fact):** earlier gates summarised D7 as
"3 refs" while a grep for the single dev ref returns **1**. Both are right — the guard lists **three
distinct** development refs and the current dev project appears **once** in that list. Recorded here so
future gates quote "3 distinct refs" and do not read a `1` as a weakened guard.

**Disk trend:** 9,336 → 9,136 → 9,131 → 9,258 → **9,144–9,354 MiB** (L, L1, L2, L3, L4). Fluctuating
around 9.1–9.3 GiB with no backup activity from this pipeline, so the drift is unrelated system churn rather
than a monotonic decline. The 2 GiB floor holds; re-check immediately before any capture.

**Archive freshness:** newest entry is `obkfgxjzlscungkhbyvq-20261110T041600Z` — **≈14 days 11 h old** at
this gate's timestamp. Capture readiness is therefore *also* a freshness question: even a successful A1
today would be the first fresh baseline since 10 November.

---

## 4. Capture completeness matrix

Reference census (Gates L1/L2, read-only): **74** public tables · 141 policies · 179 functions (116
`SECURITY DEFINER`) · 40 non-internal triggers · 1 view · 1,080 table + 443 routine grants · 7 extensions ·
3 storage buckets · 7 storage policies · 7 event triggers · 2 publications · 16 non-`pg_` roles · 74 ledger
rows. Local migration files: **81** → **7 pending**.

| # | Family | Live | Captured by | Approval | Gap if skipped |
| --- | --- | --- | --- | --- | --- |
| 1 | Schema objects (`public` + `private`) | 74 tables, 141 policies, 179 fns, 40 triggers, 1 view | `supabase db dump --linked` (schema-only is default) | **A1** | nothing restorable |
| 2 | **Storage buckets** (rows, not DDL) | 3 | read-only query on `storage.buckets`, emitted as `INSERT` | **A1b** | restored project has no buckets; every storage policy dangles |
| 3 | **Storage policies** | 7 | read-only query on `pg_policies where schemaname='storage'` | **A1b** | upload/view rules lost |
| 4 | Migration ledger | 74 rows | read-only query on `supabase_migrations.schema_migrations` + `migration list --linked` | **A1** | can't tell which of 81 migrations ran; A3 becomes guesswork |
| 5 | Extensions + versions | 7 (`btree_gist 1.7`, `pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`) | `CREATE EXTENSION` rides in the dump for public-installed ones; `COMMENT ON EXTENSION` lines are commented out | **A1** | version drift invisible |
| 6 | **Event triggers** | 7 | CLI **comments them out** → read-only `pg_event_trigger` query + hand-authored DDL | **A1** | audit/guard events silently absent |
| 7 | **Publications** | 2 | CLI comments out `supabase_realtime` → read-only `pg_publication` + `pg_publication_tables` | **A1** | realtime subscription config lost |
| 8 | Roles | 16 non-`pg_` | `supabase db dump --role-only --linked` | **A1** | ownership/grant targets missing |
| 9 | Grants / ACLs | 1,080 table + 443 routine | rides inside #1 for `public`/`private`; internal-schema ACLs commented out | **A1** | RLS helpers lose their effective grants |
| 10 | `postgis` | **installed 0**, available 1 | not installed → nothing to dump; must be recorded as an explicit target prerequisite | **A5** | Flutter `venues.geog` lineage cannot run |
| 11 | `auth` schema | platform-managed | intentionally excluded | — | accepted platform surface |
| 12 | Table **data** | — | never captured (`--schema-only`) | — | by design; `grep -cE '^(COPY|INSERT INTO )'` must be **0** |
| 13 | Existing archive readability | 17 entries | per-archive decrypt test | **A1-adjacent (new)** | fresh key proof does not certify 14-day-old ciphertext |

### 4.1 A1 vs A1b — deliberately separate approvals

| Approval | Exact scope | Why it is separate |
| --- | --- | --- |
| **A1** | families 1, 4, 5 (verification), 6, 7, 8, 9 — schema-only DDL, roles, and **metadata queries**; encrypt to `E18BA34D…267A8E5A`; record SHA-256 + size; verify counts against the census | produces **no row data**; still requires a live read-only connection for the metadata families |
| **A1b** | families 2, 3 — the **3 bucket definitions** and **7 storage policies**, emitted as SQL | buckets are **configuration rows**, not DDL; approving A1 must not be read as approving data export. Specifically authorised or not done |

Neither approval implies the other, and neither implies A2 (restore), A3 (migrations), A5 (PostGIS) or any
production step. Everything in row 13 (per-archive decrypt) is a **new** item with no approval of any kind.

### 4.2 Pending-migration arithmetic — one figure explained, one still open

| Claim | Status |
| --- | --- |
| Ledger 74 / local 81 / pending 7 | **CONFIRMED** (measured twice, read-only) |
| Gate L's "73 ledger rows" | **RETIRED** — measurement error |
| Gates G/J/K's "8 pending" | **RETIRED** — it is 7 |
| Gate K's "**17** tables declared but not live" | **stands as a set difference**, not a file count: 77 declared − 60 live intersect = 17, which closes with 74 live = 60 + 14 legacy. It does **not** depend on the pending count, so the "8 pending" annotation was incidental rather than causal |

**New measurement this gate (local files only, no connection):** the newest 7 migration files create **13**
`CREATE TABLE`s; the newest 9 create **17**; the newest 12 create **18**. So a naive "newest N files = the
pending set" reading produces 13 where the schema-set difference says 17. These can only coexist if the 7
pending versions are **not** exactly the newest 7 files, or if some applied migrations' tables were later
dropped (drift). **Therefore the identity of the 7 pending versions must be established by a ledger diff
before A3** — that diff is a read-only query and is *not* authorised in this gate.

Candidate newest files (identity unconfirmed):

```
20261111200000_dynamic_service_category_builder.sql      6 tables, 12 policies, 23 functions
20261111210000_service_document_storage_access.sql       0 tables,  2 policies
20261112010000_business_ownership_phase1.sql             6 tables, 12 policies,  8 functions
20261112020000_business_ownership_phase2_backfill.sql    0 tables
20261112030000_business_ownership_phase3_rls.sql         0 tables, 17 policies
20261112040000_business_ownership_phase4_rls.sql         0 tables,  7 policies
20261112050000_business_ownership_phase5_transfer.sql    1 table,   1 policy,   1 function
```

---

## 5. Remaining risks

| # | Risk | Severity | Owner of the fix |
| --- | --- | --- | --- |
| R-1 | **Exposed `postgres`-equivalent dev credential is live** — 14 days of standing exposure and counting; dev holds real provider/client data | **High** | Owner (rotate, or `nologin` the CLI role) |
| R-2 | **No fresh baseline exists** — newest archive is ~14 days old; the 14 legacy tables have never been dumped at all | **High** | A1 |
| R-3 | A CLI-only dump loses families 2, 3, 4, 6, 7, 8 → 6 of 12 families, producing a project that looks restored but isn't | **High** | A1 + A1b scope discipline |
| R-4 | **Restore never rehearsed** — no dump has ever been restored; encryption proof ≠ restore proof | **High** | A2 |
| R-5 | Existing 17 archives have **never been decrypted individually**; D6 proves the key, not the ciphertext | Medium | new approval |
| R-6 | `postgis` absent → Flutter lineage blocked at `venues.geog` | Medium | A5 |
| R-7 | Pending-7 identity unresolved (13 vs 17 tables) → A3 plan may be wrong | Medium | read-only ledger diff |
| R-8 | `supabase/schema_and_rls.sql` is a narrow historical snapshot (profiles 7 vs 15 cols, bookings 13 vs 30); using it as a baseline would silently under-restore | Medium | keep demoted to reference |
| R-9 | Single-machine custody: key + Keychain + archives all on this Mac; no off-machine copy, no restore of the key itself | Medium | owner decision |
| R-10 | Disk drifts downward ~200 MiB/period with 100 %-full volume reporting | Low | re-check before capture |
| R-11 | `db dump --dry-run` leaks by design; one careless future run re-opens everything | Low (after masking rule) | procedural |

---

## 6. Exact prerequisites for A1

A1 may proceed only when **all** of the following are true. Nothing here is invented — each line comes from
an earlier gate's measurement.

1. **Explicit written approval naming the command, the output path and the encryption recipient.** Read-only
   authorisation does not imply it (Gate L2 §2, item 9's exclusion list).
2. **Incident sequenced deliberately** — either the `postgres` password is rotated, or the owner states in
   writing that A1 proceeds with the exposure open. (Not a cryptographic precondition; D6 already cleared.)
3. **Disk re-check immediately before the run** — `≥ 2,048 MiB` free (currently 9,144 MiB).
4. **Correct workdir** — `--workdir .local/pre-fix-backup`, because **the repo root is not linked**
   (`supabase/.temp/project-ref` absent). Running without it targets nothing.
5. **Restrictive output** — `umask 077`, output under
   `~/BookOurSpace_Backups/react/obkfgxjzlscungkhbyvq-schema-$STAMP`, directory `drwx------`.
6. **No dry-run in the pipeline,** and if one is ever unavoidable, mask with
   `sed -E 's#PGPASSWORD="[^"]*"#PGPASSWORD="[REDACTED]"#g'`. Never unmasked.
7. **Metadata families captured in the same gate** — families 4, 6, 7, 8 need read-only queries; a
   schema-only dump silently omits them.
8. **A1b authorised separately** if buckets/policies are to be included; otherwise record them explicitly as
   **not captured** in A1's result.
9. **Coverage verification against the census** — 74 tables, ≥179 functions, 141 policies, 40 triggers,
   116 `SET search_path`, 74 `ENABLE ROW LEVEL SECURITY`, 14/14 legacy tables present, and
   `grep -cE '^(COPY|INSERT INTO )'` = **0** (proves no data).
10. **Post-run evidence** — SHA-256 + byte size + UTC timestamp recorded; a secret scan of the artifact and
    the transcript with 0 hits; `pg_dump`/CLI warnings captured, not discarded.
11. **Encrypt to the canonical fingerprint only** — `BOS_BACKUP_GNUPGHOME=…backup-gnupg-recovery-20261106`,
    recipient `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A`. The legacy keyring must never be the fallback.
12. **Decrypt-and-diff the new artifact in the same gate** — otherwise A1 hands over ciphertext nobody has
    opened, repeating the D6 gap at a larger scale.

---

## 7. Does capture remain NO-GO? — **YES**

| Gate item | Verdict | Reason |
| --- | --- | --- |
| **A1 schema capture** | **NO-GO** | not approved (§4.1); incident open |
| **A1b bucket capture** | **NO-GO** | not approved; separate authorisation required |
| **A3 pending migrations** | **NO-GO** | not approved; pending-7 identity unresolved (§4.2) |
| **A5 PostGIS** | **NO-GO** | not approved; `postgis` absent |
| **A2 restore rehearsal** | **NO-GO** | not approved; nothing to restore yet |
| **Production provisioning** | **NO-GO** | unchanged |
| **D6 GPG round-trip** | **GO — PASSED** | retired as a blocker |
| Read-only investigation | GO within L2's nine boundaries | unchanged |

**The shape of the answer changed, but not the answer.** Two gates ago the blockers were *"we can't open
our backups"* and *"the password is leaked"*. The first is now closed on evidence. What remains is
authorisation for A1/A1b, the owner's sequencing of rotation, and three unresolved measurement questions
that belong to A3, not A1.

D6's success removes the strongest argument for delay; it does not supply the approval.

---

## 8. Owner decisions required

| # | Decision | Blocks | Recommendation |
| --- | --- | --- | --- |
| **D-1** | Approve **A1** with the 12 prerequisites in §6 (command, path, recipient stated explicitly) | any fresh baseline | approve; D6 has removed the technical objection |
| **D-2** | Approve **A1b** for the 3 bucket rows + 7 storage policies, or accept their loss in writing | storage fidelity | approve together with A1; the payload is kilobytes |
| **D-3** | Sequence rotation: rotate now, `nologin` the CLI role as a stop-gap, or keep deferring | incident closure, R-1 | rotate before A1 so the baseline is taken on a contained target |
| **D-4** | Authorise a **read-only ledger diff** to identify the 7 pending versions (13 vs 17 tables) | A3 correctness | approve; read-only, no writes |
| **D-5** | Authorise a **decrypt test of one existing archive** | confidence in 17 existing entries | approve; one file, canonical key, checksum compare |
| **D-6** | Decide on **off-machine key + archive custody** (single-machine today) | disaster recovery, R-9 | decide before production |
| **D-7** | Approve **A5** PostGIS when Flutter re-homing starts | Flutter lineage | defer until A1/A2 done |

---

## 9. Verdict

**Credential incident: OPEN** — `cli_login_postgres.obkfgxjzlscungkhbyvq`, a `postgres`-equivalent dev
password, exposed via `db dump --dry-run`, never reused, never persisted to disk, valid until rotation.
Rotation **DEFERRED BY OWNER**; the deferral is recorded as a decision, not treated as closure.

**D6: PASS** — canonical keyring, exact fingerprint, encrypt → decrypt → checksum reproduced, exit 0
(Gate L3 §2). Key custody is proven; archive readability and restore remain unproven.

**Capture: NO-GO** — A1 and A1b unapproved, incident open. Eleven prerequisites for A1 are enumerated in §6
so approval can be granted against a precise specification rather than a general intention.

Three measurement corrections this gate: D7's "3 refs" means **3 distinct development refs** (the dev ref
appears once); the "17 tables" figure is a **schema-set difference** (77 declared − 60 live) and not a
pending-file count; and the newest 7 local files create **13** tables, which is why the pending-7 identity
must be settled by a ledger diff before A3.

**A1 · A1b · A3 · A5 NOT APPROVED · Production NO-GO · Rotation DEFERRED · Incident OPEN.**

*Stopping here. No dump, backup, migration, restore, extension install, credential change, production access
or Git mutation was performed in this gate. Awaiting explicit approval.*
