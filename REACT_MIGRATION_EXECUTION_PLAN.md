# React Migration Execution Plan — v2

**Status: PLAN ONLY — NOTHING EXECUTED. APPROVAL CHECKPOINT.**
**Verdict: BLOCKED. The SQL is sound; the restore point does not exist.**

| | |
| --- | --- |
| Date | 2026-11-24 (v2 — supersedes v1 of the same date) |
| Repository | `/Users/aa/Downloads/bookourspace-react` |
| Target project | `obkfgxjzlscungkhbyvq` (development, ap-south-1) — **never production** |
| Linked workdir | `.local/pre-fix-backup` |
| React state | `feat/universal-gps-tracking` @ `96c1297` — 1 modified, 0 staged, 15 untracked, all preserved |
| Scope | **React only. Flutter excluded entirely.** |
| Database writes made | **0** — one `begin read only; … rollback;` transaction |
| Migrations executed | **0 of 8** |

Changes in v2: measurements re-taken this session; R-2 re-read from source; **new risk R-10** (provider writes require business context immediately after the backfill); execution and forward-recovery procedure specified concretely; verification SQL made exact; approvals renumbered A–G.

---

## 1. Ledger reconciliation

| Observation | Value |
| --- | --- |
| Ledger rows | **74** |
| Synthetic baseline | `00000000000000` / `bookourspace_baseline` |
| Real applied versions | **73** |
| Newest applied | `20261108150000` |
| Local files | **81** |
| **Pending** | **8** = 81 − 73 |
| Hosted versions with no local file | **0** besides the baseline |
| Duplicate ledger versions | **0** |

The older "7 pending" figure came from treating all 74 rows as applied versions. Gates G/J/K were right. Gate L4 §4.2 and Gate L5 §1.1 item 3 / §1.3 are superseded and left unmodified as a point-in-time record.

The 17-table figure is confirmed twice over: the 8 pending files contain exactly 78 `CREATE TABLE` occurrences overall and exactly **17** in the pending set, and the live catalogue shows **0 of 17** present.

---

## 2. The eight pending migrations

| # | Version | File | Tables | Policies | Functions | Triggers | Indexes | Grants | Own `COMMIT` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `20261111190000` | `universal_delivery_tracking` | 4 | 5 | 5 | 2 | 2 | 6 | no |
| 2 | `20261111200000` | `dynamic_service_category_builder` | 6 | 12 | 23 | 8 | 9 | 21 | **yes** (L21/L1831) |
| 3 | `20261111210000` | `service_document_storage_access` | 0 | 2 | 0 | 0 | 0 | 0 | **yes** (L10/L55) |
| 4 | `20261112010000` | `business_ownership_phase1` | 6 | 12 | 8 | 5 | 8 | 3 | no |
| 5 | `20261112020000` | `business_ownership_phase2_backfill` | 0 | 0 | 0 | 0 | 5 | 0 | no |
| 6 | `20261112030000` | `business_ownership_phase3_rls` | 0 | 17 | 2 | 0 | 0 | 0 | no |
| 7 | `20261112040000` | `business_ownership_phase4_rls` | 0 | 7 | 0 | 0 | 0 | 2 | no |
| 8 | `20261112050000` | `business_ownership_phase5_transfer` | 1 | 1 | 1 | 1 | 1 | 1 | no |
| | | **Total** | **17** | **56** | **39 stmts / 36 names** | **16** | **25** | **33** | |

The 17 tables: `service_delivery_otps`, `service_delivery_profiles`, `service_tracking_events`, `service_tracking_locations`, `service_booking_documents`, `service_booking_field_values`, `service_category_config_audit`, `service_category_config_versions`, `service_category_configs`, `service_provider_credentials`, `business_audit_events`, `business_backfill_review`, `business_invitations`, `business_members`, `business_module_access`, `businesses`, `business_ownership_transfers`.

---

## 3. Order and dependencies

Ascending version, no reordering. The version order already encodes the dependency graph.

| Step | Depends on | Why the order matters |
| --- | --- | --- |
| 1 | live `service_bookings`, `profiles`, `is_active_user()` | creates the delivery/tracking tables step 2 extends |
| 2 | step 1's tables | **redefines 3 of step 1's functions** (`create_delivery_otp`, `ensure_service_delivery_profile`, `verify_delivery_otp`) and adds 5 columns to `service_delivery_profiles`; running it first would leave older bodies and a shape the client cannot read |
| 3 | `storage.objects`, `public.media_assets` | both blocks self-guard with `to_regclass(...) is null → return`; verified both exist, so it will not silently no-op |
| 4 | 18 pre-existing tables + steps 1–2 | creates `businesses`/`business_members`/… and adds `business_id` to `listings`, `bookings`, `enquiries`, `reviews`, … |
| 5 | step 4's tables and columns | backfills `business_id`; **17 `UPDATE`s touch live rows** and fail if step 4 did not fully apply |
| 6 | steps 4–5 | drops up to 12 pre-existing policies and creates 17 business-scoped ones |
| 7 | steps 4–6 | 7 further policy replacements + 2 grants |
| 8 | step 4 | creates `business_ownership_transfers` + its audit function/trigger |

No file references an object created by a later file, so a failure at step *k* never requires revisiting steps 1…*k*−1.

---

## 4. Expected deltas (measured baseline → expected)

| Object class | Live now | After | Delta |
| --- | --- | --- | --- |
| Base tables (`public`) | 74 | **91** | +17 |
| Views | 1 | 1 | 0 |
| Functions (`public`) | 179 | **215** | +36 names (39 statements) |
| Policies | 141 | **≥141, ≤197** | +56 created, up to 77 `drop-if-exists` (only existing ones actually drop — so a single target number is not asserted; the named-policy checks below are) |
| Non-internal triggers | 40 | **56** | +16 |
| Indexes (`public`) | 292 | **317** | +25 |
| RLS-enabled tables | 74/74 | **91/91** | +17 |
| `FORCE RLS` | 0 | **0** | 0 |
| `SECURITY DEFINER` without pinned `search_path` | 0 | **0** | 0 |
| Extensions | 7 | **7** | 0 — nothing installed or required (`postgis` is *not* needed by this set) |
| Event triggers | 7 | 7 | 0 |
| Ledger rows | 74 | **82** | +8 |

**Local corroboration:** the same eight files have already been applied to the project's local PostgreSQL 17 cluster, where all 17 tables and all 8 helper functions exist. The SQL executes. That is not hosted verification and is not treated as such.

---

## 5. Risk register

| # | Risk | Severity | Handling |
| --- | --- | --- | --- |
| **R-1** | **No restore point.** Newest archive ~14 days old; the 14 legacy tables have never been captured; PITR off. A failed step 5 has no rollback path | **Critical** | Capture before execution (Approval B). This is the blocker |
| **R-2** | Steps 2 and 3 carry their own `begin;`/`commit;`. The CLI wraps each file in a transaction, so the embedded `COMMIT` ends it early; a later statement in the same file can then fail **after** earlier work is committed → a file applied in part with **no ledger row** | **High** | Stop on first error; ledger is the truth for what committed; §9.4 defines the partial-file reconciliation. Never `migration repair` |
| **R-3** | Step 5's 17 `UPDATE`s mutate live rows in `listings`, `bookings`, `service_bookings`, `venue_bookings`, `stay_properties`, `enquiries`, `reviews`, `provider_contact_settings`, `media_assets`, plus 8 payment tables | **High** | Capture first; record row counts and `business_backfill_review` contents before/after |
| **R-4** | Step 4 alters 18 pre-existing tables; a shape mismatch fails partway | Medium | All 35 `ALTER TABLE` targets verified resolvable; the migration asserts the rest itself |
| **R-5** | Step 3 could silently no-op if its guards fail | Medium | Both `storage.objects` and `public.media_assets` confirmed present, so it will act; post-run assertion on the two policy names |
| **R-6** | Credential incident OPEN; the exposed postgres-equivalent role still exists (`cli_login*` = 1) | **High** | Rotation sequencing decision (Approval D) |
| **R-7** | Applying migrations is itself a write to a project with no fresh baseline | Medium | Capture **before**, not after |
| **R-8** | Stale "7 pending" wording persists in older gate reports | Low | Reconciliation lives in §1 and in the remediation report |
| **R-9** | Disk 9,141 MiB free; a capture adds one archive | Low | ≥ 2,048 MiB floor holds |
| **R-10** | **The backfill changes runtime authorisation.** Every provider with a listing receives a business, so `server.ts` stops applying its legacy fallback and returns `403 BUSINESS_CONTEXT_REQUIRED` on provider writes without `x-business-id`; the business must also be `approved`/enabled and module-matched. Backfilled businesses are inserted `approved`, so access is *granted*, not gated | **High** | Ship the business selector (already in the working tree) **before** executing; smoke-test provider writes as step 10, not just `SELECT` counts |
| **R-11** | Provider flows become tiered: providers with no listing keep the legacy path | Low | Documented as intended; owner nod requested |

---

## 6. Recovery prerequisite status — **NOT READY (the blocker)**

| Prerequisite | State | Verdict |
| --- | --- | --- |
| Schema-only capture of the current 74-table state | does not exist | **FAIL** |
| Storage configuration evidence | not captured | **FAIL** |
| Newest archive | `obkfgxjzlscungkhbyvq-20261110T041600Z` (~14 days) | **FAIL** (stale) |
| Existing archives ever decrypted | never (17 entries, 11 MB) | **UNVERIFIED** |
| Restore ever rehearsed | never | **FAIL** |
| PITR | not enabled | **FAIL** |
| Backup destination writable | `~/BookOurSpace_Backups/react`, 17 entries, 11 MB | PASS |
| Canonical key custody | fpr `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A`, keyring `drwx------`, D6 self-test PASS | PASS (key only — not archive-proven) |
| Free disk | 9,141 MiB | PASS |

**No backup, archive, dump or restore may be created without Approval B.** That is why this plan stops here rather than proceeding.

---

## 7. Target and safety preflight

| Check | Observed | Result |
| --- | --- | --- |
| Workdir project ref | `obkfgxjzlscungkhbyvq` | **PASS** |
| Workdir | `.local/pre-fix-backup` | **PASS** |
| Repo-root link | absent | **PASS** — root must never be used |
| Target class | development (ap-south-1) | **PASS** |
| `BOS_PRODUCTION_SUPABASE_PROJECT_ID` | unset | **PASS** |
| React branch / HEAD | `feat/universal-gps-tracking` @ `96c1297` | **PASS** |
| Modified / staged / untracked | 1 / 0 / 15 | **PASS** — untouched |
| `db dump --dry-run` | not run | **PASS** |
| Secrets printed | none (output masked at source) | **PASS** |
| Flutter touched | no | **PASS** |

---

## 8. Owner approvals required before any write

| # | Approval | Unblocks |
| --- | --- | --- |
| **A** | Approve **this plan**: the 8 versions, in §3 order, against `obkfgxjzlscungkhbyvq` | the execution gate itself |
| **B** | Authorise **schema-only capture + encrypted archive + decryption verification** of the 74-table state | R-1, R-3 — **the single approval that turns BLOCKED into executable** |
| **C** | Authorise **Storage configuration capture** (bucket list, visibility, size limits, `storage.objects` policy set) | R-5 completeness |
| **D** | Decide **credential sequencing**: rotate now / remove role / accept the incident open during execution | R-6 |
| **E** | Confirm **`migration repair` stays forbidden** and that a failed step means stop → verify → report | R-2 |
| **F** | Decide the **17 stale integration fixtures**: update fixtures to send `x-business-id`, or review the 403/404 and error-ordering assertions as intended behaviour | Phase 9 "tests pass" criterion |
| **G** | Authorise **restore rehearsal** into a scratch database (no hosted restore) | proving the capture is restorable, not just decryptable |

A–G are independent. **Nothing in this document authorises a write.** "Fix everything" is not one of these approvals.

---

## 9. Execution procedure (Phase 8 only, after approval)

### 9.1 Reconfirm before touching anything

```bash
cat .local/pre-fix-backup/supabase/.temp/project-ref        # must print obkfgxjzlscungkhbyvq
test -e supabase/.temp/project-ref && echo "ABORT: repo root is linked" || echo "ok: root unlinked"
env | grep -c BOS_PRODUCTION_SUPABASE_PROJECT_ID            # must print 0
git rev-parse --short HEAD                                  # must be 96c1297
```

Abort on any mismatch. Re-run §1's ledger query and confirm still **74 rows / 8 pending**.

### 9.2 Confirm the recovery point exists and is real

- Archive file present, `umask 077` permissions, SHA-256 of ciphertext recorded.
- `gpg --decrypt` of that archive reproduces a schema file whose object counts match the census in §4 (74 tables, 179 functions, 141 policies, 40 triggers, 292 indexes).
- A decrypt-verification pass has been run **on this archive**, not just on the D6 self-test.
- §9.3's partial-application checks all still negative.

### 9.3 Partial-application re-check — abort if any is positive

```sql
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r'
   and c.relname in ('service_delivery_otps','service_delivery_profiles','service_tracking_events',
     'service_tracking_locations','service_booking_documents','service_booking_field_values',
     'service_category_config_audit','service_category_config_versions','service_category_configs',
     'service_provider_credentials','business_audit_events','business_backfill_review',
     'business_invitations','business_members','business_module_access','businesses',
     'business_ownership_transfers');           -- must be 0 today
```

### 9.4 Execute

The CLI applies pending migrations in version order in one invocation and records each ledger row as it goes. There is no per-version flag, so this is the correct command shape:

```bash
npx --no-install supabase migration up --linked --workdir .local/pre-fix-backup
```

**Transaction behaviour to expect:** each file is wrapped, except that step 2 commits at its own L1831 and step 3 at its own L55. A failure *after* one of those points leaves committed objects with no ledger row. That is the only non-atomic surface, and §9.5 handles it.

**Rules during execution:** no `migration repair`; no manual ledger insert; no editing a historical migration to make it pass; no retry before the failure is understood; no unrelated SQL; no `.env` change; no Git operation.

### 9.5 Failure and partial-commit handling

1. **Stop immediately.** Record version, exact error, duration, and the ledger's last row.
2. If the failing version is **step 1, 4, 5, 6, 7 or 8** (no embedded commit), the file rolled back: the ledger and the schema still agree, and nothing from that file exists.
3. If the failing version is **step 2 or 3** (embedded commit), reconcile before anything else:
   - re-run the §5/§10 census queries and list every object the file declares;
   - a partially present set means the capture is the rollback, **or** forward recovery is possible because every statement in these files is `if not exists` / `or replace` / `drop policy if exists`.
4. **Forward recovery** (with approval): fix the root cause, then re-run `migration up`. The CLI sees the version still pending and applies the whole file; idempotent statements make re-application safe. This is *not* `migration repair` — no ledger row is fabricated, the real file is simply re-run.
5. **Rollback** (with approval): restore the capture into the project, verify against the census, then re-attempt from §9.3.
6. Write the outcome into `REACT_POST_MIGRATION_VERIFICATION.md` **only from real output**.

### 9.6 What must never happen

Marking a failed version applied; skipping a version and continuing; hand-writing a ledger row; editing a historical file; re-running `db dump --dry-run`; declaring success from the CLI's exit code alone.

---

## 10. Post-migration verification (Phase 5 — planned, not run)

One read-only transaction, collapsed into `UNION ALL` because `db query` returns only the last result set.

| # | Assertion | Expected |
| --- | --- | --- |
| 1 | `count(*) from supabase_migrations.schema_migrations` | **82** |
| 2 | versions ≠ baseline | **81** |
| 3 | distinct versions | **82** (0 duplicates) |
| 4 | versions not present locally | **0** |
| 5 | base tables in `public` | **91** |
| 6 | views | **1** |
| 7 | the 17 named tables present | **17** |
| 8 | functions in `public` | **215** |
| 9 | the 36 named functions present | **36** |
| 10 | `SECURITY DEFINER` without pinned `search_path` | **0** |
| 11 | tables with RLS enabled | **91 / 91** |
| 12 | `FORCE RLS` | **0** |
| 13 | non-internal triggers | **56** |
| 14 | indexes in `public` | **317** |
| 15 | extensions | still the same 7, list unchanged |
| 16 | event triggers | 7 |
| 17 | policies: `business_*` present, plus `"Booking parties upload private documents"` on `storage.objects` and `"Active booking parties register private documents"` on `public.media_assets` | all present (proves step 3 did not no-op) |
| 18 | `business_backfill_review` row count by reason | recorded, non-collapsing |
| 19 | `businesses` where `backfill_source='owner_module_backfill_v1'` | recorded; each has an `owner` member and approved module access |
| 20 | rows with `business_id is null` in `listings` | recorded; every one has a `business_backfill_review` row |
| 21 | `cli_login*` roles | unchanged by the migration (incident work is separate) |

## 11. React smoke tests after migration

| Test | Command / path | Expected |
| --- | --- | --- |
| Typecheck | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| Suite | local PG on 55440 (`LC_ALL=C pg_ctl … start`), `BOS_LISTINGS_DATABASE_URL=… npm test` | the 17 R-10 failures must be **0 or explained by Approval F**; no new failures |
| Delivery tracking | `/services/bookings/:id/tracking` | profile, latest location, events load; OTP create/verify returns 6 digits |
| Provider write | provider dashboard, business selector visible | write succeeds with `x-business-id`; 403 without it (that is the intended gate) |
| Customer self-access | customer booking list | unchanged |
| Admin | admin console | unchanged |

## 12. Rollback / forward recovery

| Situation | Action | Requires |
| --- | --- | --- |
| Failure in a non-committing file | nothing to undo; fix cause, re-run | A, E |
| Failure in step 2/3 after embedded commit | restore capture **or** re-run the file (idempotent) | B, plus approval to retry |
| Wrong result but no error | restore capture, verify census, investigate | B |
| Any of the above | never `migration repair` | — |

---

## 13. Verdict

**BLOCKED at the approval checkpoint — for one reason, and it is not the SQL.**

The migration content is additive and low risk: 0 `DROP TABLE`, 0 `DROP COLUMN`, 0 `TRUNCATE`, 0 `DELETE`, 0 extensions, 0 non-transactional statements outside two deliberate file-level commits, 77 guarded policy drops, 16 guarded trigger drops, 0 of 17 tables and 0 of 36 function names already present, and every `SECURITY DEFINER` already pins `search_path`. The same eight files have already run clean on a local PostgreSQL 17 database.

What is missing is a **verified recovery point** (R-1: 17 `UPDATE`s on live rows, PITR off, 14 legacy tables never captured), plus an owner decision on the credential incident (R-6) and on how the business-context gate (R-10) ships.

**Approval B is the one item that converts BLOCKED into executable. Migrations executed: 0 of 8.**

*No migration, write, dump, backup, archive, restore, extension install, `.env` change or Git operation was performed in producing this plan.*
