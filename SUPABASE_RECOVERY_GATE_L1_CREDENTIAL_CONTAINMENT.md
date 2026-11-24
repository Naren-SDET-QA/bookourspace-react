# Gate L1 — Credential Exposure Containment & Recovery Revalidation

**Date:** 2026-11-24
**Mode:** READ-ONLY CONTAINMENT REVIEW. No dump, no backup, no encryption or decryption, no migration,
no restore, no schema or extension change, no project, no clone, no deployment, no Git mutation.
**Verdict: NO-GO / BLOCKED at Phase 1** — owner password reset unconfirmed.

Read for this gate: `SUPABASE_RECOVERY_GATE_L_SCHEMA_CAPTURE_PREFLIGHT.md`,
`SUPABASE_RECOVERY_GATE_K_CANONICAL_SCHEMA_DESIGN.md`.

---

## 1. Credential exposure incident summary

| Property | Record |
| --- | --- |
| Vector | `npx supabase db dump --dry-run --linked` prints the generated shell script to stdout |
| Leaked field | `export PGPASSWORD="…"` inside that script |
| Role | `cli_login_postgres.obkfgxjzlscungkhbyvq` — a CLI-minted Supavisor pooler login mapping to the `postgres` database user |
| Project | `obkfgxjzlscungkhbyvq` — **development** (not production) |
| Scope | read/write on the dev database as `postgres`; **not** a service-role key, **not** the anon key, **not** an API token |
| Discovered | Gate L, by reading the tool output |
| Gate L1 handling | Not retrieved, not displayed, not tested, not repeated. `--dry-run` was **not** executed again in this gate (only a re-run with the mask extended was used in Gate L, and never since) |

**Root cause is a tool-design issue, not a typo in a command.** `supabase db dump --dry-run` documents
itself as *"Prints the pg_dump script that would be executed"* and that script necessarily contains the
connection password, because the CLI mints a login role and exports it as `PGPASSWORD`. Anyone running
`--dry-run` unmasked leaks a credential. This is recorded so no future gate treats it as safe.

**Status: UNCONTAINED.** See §2 — the owner has not confirmed rotation, and by instruction Gate L1 may
not test the credential to infer it.

---

## 2. Owner password-reset status — **BLOCKED**

| Question | Answer |
| --- | --- |
| Has the owner confirmed resetting the dev database password? | **No confirmation received** |
| Can Gate L1 verify it independently? | **No** — verification would require presenting the exposed credential to the server, which §Phase 1.2 forbids |
| Is there any indirect signal of rotation? | **None.** `db query --linked` still succeeds, but the CLI mints or reuses its *own* login role per invocation, so success proves nothing about whether the old value was invalidated |
| Status | **BLOCKED** |

This is the one blocker Gate L1 cannot clear on its own. Per the gate instruction — *"If password
rotation has not been completed, stop and report BLOCKED"* — **no capture work proceeds.**

**Required owner action (supabase.com/dashboard → project `obkfgxjzlscungkhbyvq` → Project Settings →
Database → Reset database password).** Resetting the `postgres` password derives new Supavisor
credentials for roles mapped to it and is the documented mechanism that invalidates a leaked pooler
login. If the owner prefers, the CLI-created `cli_login_postgres` role can also be dropped/re-minted;
either way the owner must confirm which action was taken so Gate L2 can record it as evidence rather
than inference.

**Adjacent credential deliberately not touched:** the app's `service_role` key, `anon` key, and the
`.env.local` database password are **not** implicated by this incident and were **not** rotated. Gate
L1 found no evidence they were exposed, and rotating them without evidence would be an unauthorised
change with its own blast radius.

---

## 3. Evidence of secret-log cleanup review

Scanned read-only, **paths and counts only — no matching value was printed**. Scope: the React
repository (including `.local/` and `.agents/` worktrees) and `~/BookOurSpace_Backups/`.

### 3.1 Results

| Pattern | Result | Reading |
| --- | --- | --- |
| `PGPASSWORD="<20+ alphanumerics>"` | **no files** | the exposed value was never persisted to disk by the CLI |
| `:<20+ alnum>@` inside `.temp/pooler-url` | **0 matches**, 93 bytes | CLI cached URIs **without** the password |
| `postgres.obkfgxjzlscungkhbyvq:<20+ alnum>@` | **2 files**: `.env.local`, `.local/pre-fix-backup/.env.local` | see §3.2 |
| loose `postgres.obkfgxjzlscungkhbyvq:[^@]+@` | 18 files | dominated by placeholders — see §3.3 |

### 3.2 The two real-password files are not the exposed credential

Both are **git-ignored** (`git check-ignore` confirms), so neither is tracked or committed. More
decisively, both address the **`postgres`** user, while the leaked credential belongs to the distinct
**`cli_login_postgres`** role. Different roles carry different passwords, so the value in these files
**cannot be the leaked value**. No cleanup is required for them by this incident; they are the app's
normal local configuration and predate Gate L.

### 3.3 The 18 loose matches are fixtures and placeholders

They are `tests/*.test.mjs`, `supabase/tests/backup_*_test.sh` and `.env.example` files across three
worktrees — all of which deliberately contain URI *shapes* such as a placeholder password. The strict
20+-character pattern excluded every one of them, confirming no real secret lives there.

### 3.4 Where a copy does exist, and what needs owner attention

| Location | Copy present? | Action |
| --- | --- | --- |
| Repository working tree | **No** | none |
| Backup destination `~/BookOurSpace_Backups/react` | **No** (17 entries, unchanged) | none |
| CLI `.temp/pooler-url` | **No password** | none |
| Shell history / terminal scrollback | **Out of scope — not inspected** | owner should assume the value is present in the session where Gate L ran, and clear scrollback/history if that matters |
| This chat transcript and the desktop app's own logs | **Yes — unavoidable** | treat the conversation as sensitive; do not export or share it. Gate L1 did not read app-level logs, which live outside the project |
| Existing encrypted archives | **No** (ciphertext; written before Gate L) | none |

**Conclusion:** no *new* on-disk secret persistence was created, and no copy of the exposed value is
recoverable from the project or the backup destination. The residual copies are the conversation itself
and the operator's shell environment.

---

## 4. Development target revalidation — **PASS (unchanged)**

| Check | Expected | Observed | Result |
| --- | --- | --- | --- |
| Linked ref | `obkfgxjzlscungkhbyvq` | `obkfgxjzlscungkhbyvq` | **PASS** |
| Repo-root link | absent (Gate L finding) | still absent | **PASS** — unchanged |
| Target class | development | development | **PASS** |
| D7 dev refs in guard | 3 | **3** | **PASS** |
| D7 file diff | 0 lines | **0 lines** | **PASS — unweakened** |
| `BOS_PRODUCTION_SUPABASE_PROJECT_ID` | never set | **0 files set it** | **PASS** |
| React branch / HEAD | `feat/universal-gps-tracking` @ `96c1297` | identical | **PASS** |
| React tree | 1 modified, 0 staged | **1 modified, 0 staged** | **PASS** |
| React untracked | 8 Gate reports | **9** (8 + Gate L report) | **PASS** — expected delta only |
| Flutter branch / HEAD | `main` @ `fc35976` | identical | **PASS** |
| Flutter tree | clean | **0 entries** | **PASS** |

No unexpected working-tree change occurred other than the Gate L report this pipeline itself produced.
`src/components/ProviderDashboard.tsx` remains the single pre-existing modification and was not touched.

---

## 5. GPG round-trip status — **STILL UNVERIFIED (not completed)**

| Check | Observed |
| --- | --- |
| Canonical keyring | `~/.config/bookourspace/backup-gnupg-recovery-20261106`, `drwx------` |
| Fingerprint | `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A` — exact match |
| Evidence of a completed owner round-trip | **None** — no result artifact; newest backup entries remain `…20261110T041600Z` |
| Test script integrity | `owner_gpg_test.sh` tracked, **0 diff** — unmodified as required |
| Encryption capability | proven (Gate I) |
| **Decryption** | **UNVERIFIED** — no successful decrypt has been demonstrated |

Gate L1 did not decrypt, did not substitute the legacy keyring, and did not request a passphrase.

**Owner command (manual, interactive — one pinentry prompt for key `B151F3EB267A8E5A`):**

```bash
cd /Users/aa/Downloads/bookourspace-react
BOS_BACKUP_GNUPGHOME="$HOME/.config/bookourspace/backup-gnupg-recovery-20261106" \
BOS_BACKUP_GPG_RECIPIENT=E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A \
bash supabase/tests/owner_gpg_test.sh
```

`BOS_BACKUP_GNUPGHOME` is mandatory: the script sources only `lib/bos_backup_crypto.sh`, not the guard,
so without it the call falls through to the **legacy** keyring `~/.config/bookourspace/backup-gnupg`,
which lacks the canonical key, and returns **exit 2 BLOCKED** — a false "owner key missing" result.
Expected codes: `0` pass · `2` blocked · `5` crypto failure. **A `0` here is the only thing that
converts decryption from UNVERIFIED to VERIFIED.**

---

## 6. Complete dump coverage matrix

Live census used as the reference for every row (read-only, this gate): **74** public tables ·
**74** ledger rows · **7** extensions · **3** storage buckets · **7** storage policies ·
**7** event triggers · **2** publications · **16** non-`pg_` cluster roles · 141 policies ·
179 functions · 40 triggers · 1,080 table + 443 routine grants.

| # | Family | Live count | Capture method (supported, prepared) | Independently verifiable by | CLI-only dump covers it? |
| --- | --- | --- | --- | --- | --- |
| 1 | Schema objects — `public` + `private` | 74 tables, 141 policies, 179 fns, 40 triggers, 1 view | `supabase db dump --linked --workdir .local/pre-fix-backup --file schema.sql` (schema-only is the default; `--schema-only` is passed internally) | count `CREATE TABLE/FUNCTION/POLICY/TRIGGER` in output == live census; 14 legacy tables specifically present | **YES** |
| 2 | Storage buckets | **3** | not in the dump (`storage` is in `--exclude-schema`); capture via read-only `supabase db query` on `storage.buckets` / `storage.objects` metadata and emit `INSERT INTO storage.buckets …` | re-query count == 3 and ids/pub|file_size_limit match | **NO** |
| 3 | Storage policies | **7** | same read-only query on `pg_policies where schemaname='storage'`, emitted as `CREATE POLICY` on `storage.objects` | count == 7, per-bucket policy names match | **NO** |
| 4 | Migration ledger | **74** rows (74 distinct, 0 duplicates) | `supabase db query` on `supabase_migrations.schema_migrations`, plus `supabase migration list --linked` as a cross-check | distinct versions == 74; local files 81 → **7 pending** | **NO** (`supabase_migrations` excluded) |
| 5 | Extensions + versions | **7**: `btree_gist 1.7`, `pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1` | read-only query on `pg_extension` (+ `pg_available_extensions` for candidates); `CREATE EXTENSION` for public-installed ones also rides in the dump | name/version pair set matches exactly; note the dump's `COMMENT ON EXTENSION` lines are commented out | **PARTIAL** |
| 6 | Event triggers | **7** | CLI **comments these out** by design; capture name/enabled/function/tags via read-only query on `pg_event_trigger` (+ `pg_event_trigger_ddl_commands`) and hand-author DDL | count == 7 and each `evtname` ↔ function mapping matches | **NO** |
| 7 | Publications | **2** | CLI comments out `supabase_realtime`; capture `pg_publication` + `pg_publication_tables` via read-only query | publication names and their table membership lists match | **NO** (partially suppressed) |
| 8 | Roles | **16** non-`pg_` roles | `supabase db dump --role-only --linked --workdir …` (flag verified present in this CLI) | role-name set matches the 16 | **NO** in the schema dump |
| 9 | Grants / ACLs | 1,080 table + 443 routine | ride inside #1 for `public`/`private`; internal-schema ACLs are deliberately commented out by the CLI | `GRANT`/`REVOKE` statement counts vs the live ACL row counts | **YES for public/private only** |
| 10 | **PostGIS prerequisite** | **installed 0 — available 1** | not installed, so nothing to dump; must be captured as an explicit `CREATE EXTENSION postgis` prerequisite in the target manifest | `select count(*) from pg_extension where extname='postgis'` == 1 **and** `spatial_ref_sys` present in the restored DB | **NO — absent, not merely excluded** |
| 11 | `auth` schema | platform-managed | intentionally excluded; not captured | — | **NO** (accepted) |
| 12 | Table **data** | — | never captured: `--schema-only` | `grep -cE '^(COPY \|INSERT INTO )'` == 0 | **guaranteed absent** |

### 6.1 Assessment

A CLI-only dump is **necessary but not sufficient**: it fully covers rows 1 and 9 and *nothing else*.
Rows 2, 3, 4, 6, 7, 8 and 10 would be lost, producing a restored project with no buckets, no record of
which of the 81 migrations ran, no event triggers, no replication publication, and a Flutter schema
that cannot be created at all.

**Two corrections to earlier gates, from measurement in this gate:**

1. **The ledger is 74 rows, not 73.** Gate L reported 73; the server reports
   `count(*) = 74`, `count(distinct version) = 74`, `duplicates = 0`. With 81 local migration files the
   pending set is therefore **7**, not the 8 recorded in Gate G/J/K. This must be reconciled against the
   actual file list as an A3 precondition — the earlier "8 pending → 17 tables" arithmetic cannot be
   carried forward unexamined.
2. **Gate 2's bucket capture is a schema-only exception.** Buckets are *rows*, not DDL. Capturing the
   3 bucket definitions means exporting a small amount of configuration data, which sits outside the
   "no table data" rule and needs its own explicit owner approval (call it **A1b**) rather than being
   smuggled in under A1.

**One method is deliberately marked untested:** `supabase db dump -s storage`. Because `storage` also
appears in the CLI's `--exclude-schema` list, exclusion almost certainly wins and yields an empty file,
but Gate L1 did not run it — that would be a dump. It is recorded as **not a supported path** until
someone verifies it under approval.

---

## 7. PostGIS prerequisite status

| Check | Result |
| --- | --- |
| Installed in `obkfgxjzlscungkhbyvq` | **0 — absent** |
| Available on the server | **1 — `postgis` can be created, no support ticket needed** |
| Required by | Flutter `venues.geog geography(Point,4326)` and `nearby_venues()` |
| Consequence today | Flutter's migration lineage **cannot run** against this project as-is — it fails at the geography column |
| `btree_gist` | **installed 1.7** — the `EXCLUDE USING gist` constraints and Blueprint `core.resource_claim` prerequisite **is** satisfied |
| Action taken | **none** — installing an extension is prohibited in this gate and needs **A5** |

The good news is that absence is a configuration gap, not a hosting limitation: `postgis` is offered by
the platform for this project. The Blueprint's extension list should therefore record `postgis` as
**required and creatable**, not as a blocker.

---

## 8. Disk and destination status

| Check | Observed | Threshold | Result |
| --- | --- | --- | --- |
| Destination | `~/BookOurSpace_Backups/react`, `drwx------ aa:staff` | owner-only | **PASS** |
| Entries | **17** (unchanged from Gate L) | — | **PASS** — nothing created |
| Free space | **9,136 MiB** (volume reports 100 % used — ~9.1 GiB free) | **≥ 2,048 MiB** | **PASS** |
| New directories / archives / temp / encrypted files | **none** | none | **PASS** |

Free space **fell by 200 MiB** since Gate L (9,336 → 9,136 MiB) with no backup activity from this
pipeline, i.e. unrelated system growth. The volume is now reported 100 % full, which is cosmetic for
APFS but the margin should be watched: at this trajectory a future restore target (~20 MB DB + working
files) is still safe, but the 2 GiB floor is the thing to re-check immediately before any capture.

---

## 9. Remaining approvals and blockers

### Blockers — ordered

| # | Blocker | Owner of the fix | Clears |
| --- | --- | --- | --- |
| **B-1** | **Dev database password not confirmed reset** — the incident is uncontained | Owner (dashboard) | Phase 1, and all capture work |
| **B-2** | **D6 decryption unverified** — an archive nobody can open is not a baseline | Owner (interactive pinentry) | trust in any future archive |
| **B-3** | Ledger arithmetic corrected 73→**74** rows / 8→**7** pending — must be reconciled before A3 | Gate L2 / A3 | migration plan accuracy |
| **B-4** | Bucket capture needs its own approval (**A1b**) because buckets are data | Owner | storage coverage |
| **B-5** | `postgis` absent — Flutter lineage blocked until enabled | Owner (**A5**) | Flutter re-homing |

### Approvals

| Approval | Scope | Status |
| --- | --- | --- |
| Password reset | dev `postgres` password / `cli_login_postgres` | **AWAITING OWNER — BLOCKING** |
| **A1** | schema capture (`public`+`private`+roles+metadata), encrypt, checksum | **NOT APPROVED** |
| **A1b** | capture the 3 storage bucket definitions (configuration rows only) | **NOT APPROVED — new** |
| **D6** | interactive GPG round-trip | **AWAITING OWNER** |
| **A2** | restore rehearsal | **NOT APPROVED** |
| **A3** | apply pending migrations (7, per §6.1) | **NOT APPROVED** |
| **A5** | enable `postgis`, author storage DDL | **NOT APPROVED** |
| **A6** | deployment | **NOT APPROVED** |
| D1 / D2 | production identity / Option C | **AWAITING OWNER** |

---

## 10. GO/NO-GO verdict

### BLOCKED (primary)
**Credential containment.** The password reset is unconfirmed and cannot be verified without using the
exposed value. Per the gate's own rule, capture work stops here. This is a hard stop, not a caution: the
credential grants `postgres`-level access to the dev database, and the project's only recovery asset is
an archive set that has **never been proven readable**.

### NO-GO
- **A1 capture** — gated on B-1 and B-2.
- **Decryption (D6)** — still unverified; unchanged since Gate I.
- **Dump completeness** — a CLI-only artifact would omit 7 of the 12 families in §6.
- **Production provisioning** — unchanged NO-GO; now additionally gated on the corrected ledger arithmetic.
- **Flutter migration** — blocked by absent `postgis`.

### GO (verified this gate)
- **Target identity** — `obkfgxjzlscungkhbyvq`, development, four independent signals.
- **D7 protection** — **3 refs, 0 diff, unweakened.**
- **Repository preservation** — React `96c1297` (1 modified / 0 staged / 9 untracked, expected delta only),
  Flutter `fc35976` clean.
- **Secret-log review** — **no on-disk persistence of the exposed value**; the 18 loose matches are
  fixtures and placeholders; the 2 real-password files belong to a different role and are git-ignored.
- **Canonical keyring** — `drwx------`, fingerprint exact, recipient resolvable.
- **Disk and destination** — `drwx------`, 9,136 MiB free, ≥ 2 GiB met, nothing created.

### The short version

The evidence side of this gate is clean: the target is provably development, D7 is untouched, both
repositories are exactly where they were, the exposed value left **no trace on disk**, the canonical
keyring is intact, and there is 9.1 GiB free.

What has not moved is the part that actually matters. **The password reset is unconfirmed, so the
incident is still open** — and the recovery side is still theoretical, because no archive has ever been
decrypted. Until the owner resets the dev password and completes the D6 round-trip, every further gate
would be building evidence on top of an uncontained credential and an unproven backup.

Three concrete corrections this gate contributes: the ledger is **74** rows with **7** migrations
pending (not 73/8, and the 8→17-tables arithmetic must be re-derived), bucket capture is **data** and
needs its own **A1b** approval, and `postgis` is **absent but installable**, which blocks Flutter but not
hosting.

**A1 NOT APPROVED · A1b NOT APPROVED · D6 PENDING · A3 NOT APPROVED · A5 NOT APPROVED**
