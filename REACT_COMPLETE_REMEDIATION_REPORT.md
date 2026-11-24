# React Complete Remediation Report

**Status: READ-ONLY INVESTIGATION COMPLETE · LOCAL CHECKS RUN · ZERO DATABASE WRITES · MIGRATIONS 0 OF 8**
**Verdict: the code is ready; the database is not. See `REACT_FINAL_GO_NO_GO.md`.**

| | |
| --- | --- |
| Date | 2026-11-24 |
| Repository | `/Users/aa/Downloads/bookourspace-react` |
| Branch / HEAD | `feat/universal-gps-tracking` @ `96c1297fa7e1a5dae46872bf1f1c30b0c4788297` (re-checked at start of this run) |
| Development project | `obkfgxjzlscungkhbyvq` (ap-south-1) — **not production** |
| Linked workdir | `.local/pre-fix-backup` |
| Scope | **React only.** Flutter never read, never compared, never touched |
| Database writes | **0** — every hosted statement ran inside `begin read only; … rollback;` |
| Archives / dumps / restores | **0** — none created, none run |
| `supabase db dump --dry-run` | **not run** |
| Migrations executed | **0 of 8** |
| Git mutations | **0** — 1 modified + 15 untracked files preserved byte-for-byte |

---

## 1. Phase 1 — the real current state

### 1.1 Local repository

| Check | Result |
| --- | --- |
| Migration files | **81** |
| Duplicate version numbers | **0** |
| Out-of-order versions | **0** (strictly ascending) |
| Filename anomalies | **0** |
| Newest file | `20261112050000_business_ownership_phase5_transfer.sql` |
| Working tree | 1 modified (`src/components/ProviderDashboard.tsx`, **pre-existing**, 16 insertions) · **0 staged** · 15 untracked (all gate reports) |
| `.env.local` | untouched — mtime still `Nov 11 12:51` |
| Backup destination | `~/BookOurSpace_Backups/react` — **17 entries**, unchanged |
| Free disk | 9,141 MiB |
| Canonical GPG keyring | `~/.config/bookourspace/backup-gnupg-recovery-20261106`, `drwx------` |

The one modified file is the **business-context selector UI**. It is exactly what the pending migrations require the frontend to have, and it is uncommitted owner work — preserved, not staged, not modified.

### 1.2 Hosted ledger and catalogue (one read-only transaction)

| Fact | Measured value |
| --- | --- |
| Ledger rows | **74** |
| Synthetic baseline row | `00000000000000` / `bookourspace_baseline` |
| Real applied versions | **73** |
| Newest applied version | `20261108150000` |
| Duplicate ledger versions | **0** |
| **Pending** | **81 − 73 = 8** |
| Base tables (`public`) | **74** |
| Views | **1** (`public_provider_profiles`) |
| Functions (`public`) | **179** |
| Policies | **141** |
| Non-internal triggers | **40** |
| Indexes (`public`) | **292** |
| Tables with RLS enabled | **74 / 74** |
| Tables with `FORCE RLS` | **0** |
| `SECURITY DEFINER` without pinned `search_path` | **0** |
| Extensions | 7 — `btree_gist 1.7`, `pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1` |
| Event triggers | 7 |
| Server | PostgreSQL 17.11, `wal_level = logical`, `archive_mode = on` |
| Schemas | `auth, extensions, graphql, graphql_public, pgbouncer, private, public, realtime, storage, supabase_migrations, vault` |
| `cli_login*` roles present | **1** — the exposed role still exists (see §6) |

### 1.3 No migration has been partially applied — three independent axes

| Axis | Result |
| --- | --- |
| Any of the **17** pending tables live? | **0 of 17** (`pending_tables_live = NONE`) |
| Any of the **36** pending function names live? | **0 collisions** |
| Do step 3's guarded dependencies exist? | `storage.objects` **present**, `public.media_assets` **present** |

A missing ledger version is not being read as "safe to execute"; the target objects are independently shown to be absent, so there is nothing half-written to reconcile.

### 1.4 Target identity

| Check | Result |
| --- | --- |
| Workdir `project-ref` | `obkfgxjzlscungkhbyvq` — **PASS** |
| Repo-root link | absent — **PASS** (root must never be used) |
| `BOS_PRODUCTION_SUPABASE_PROJECT_ID` | unset — **PASS** |
| Stockholm project `ezrxykyocgbolpaebnqx` | never contacted — **PASS** |
| Production write | none — **PASS** |

---

## 2. Phase 2 — statement-level audit of the eight pending migrations

Each file was read against the live catalogue. `BEGIN`/`COMMIT` detection and destructive-pattern scans were re-run this session.

| # | Version | Size | Transaction control in file | Objects | Reversible? |
| --- | --- | --- | --- | --- | --- |
| 1 | `20261111190000_universal_delivery_tracking` | 17 KB | none (CLI-wrapped) | 4 tables, 5 policies, 5 functions, 2 triggers, 2 indexes, 6 grants | **yes** — additive only |
| 2 | `20261111200000_dynamic_service_category_builder` | 85 KB | **own `begin;` at L21, `commit;` at L1831** | 6 tables, 12 policies, 23 functions, 8 triggers, 9 indexes, 21 grants | **partly** — see R-2 |
| 3 | `20261111210000_service_document_storage_access` | 1.8 KB | **own `begin;` at L10, `commit;` at L55** | 2 policy replacements, 0 tables | **yes** |
| 4 | `20261112010000_business_ownership_phase1` | 19 KB | none | 6 tables, 12 policies, 8 functions, 5 triggers, 8 indexes, 3 grants | **yes** |
| 5 | `20261112020000_business_ownership_phase2_backfill` | 9.9 KB | none | 7 `ADD COLUMN`, 8 indexes, **17 `UPDATE`s**, 44 inserts | **no** — data mutation |
| 6 | `20261112030000_business_ownership_phase3_rls` | 9.7 KB | none | 2 functions, 17 policies (drops up to 12 pre-existing) | **yes** — policies are re-creatable |
| 7 | `20261112040000_business_ownership_phase4_rls` | 3.8 KB | none | 7 policies (drops up to 6 pre-existing), 2 grants | **yes** |
| 8 | `20261112050000_business_ownership_phase5_transfer` | 2.2 KB | none | 1 table, 1 index, 1 policy, 1 function, 1 trigger, 1 grant | **yes** |

### 2.1 Destructive-operation audit — re-verified this session

| Pattern | In the 8 pending files |
| --- | --- |
| `DROP TABLE` | **0** |
| `DROP COLUMN` | **0** |
| `TRUNCATE` | **0** |
| `DELETE FROM` | **0** |
| `CREATE EXTENSION` | **0** |
| `CREATE INDEX CONCURRENTLY` | **0** |
| `ALTER TYPE … ADD VALUE` | **0** |
| `VACUUM` / `CLUSTER` | **0** |
| `DROP POLICY IF EXISTS` | 77 — every drop guarded |
| `DROP TRIGGER IF EXISTS` | 16 — every drop guarded |

Nothing in the pending set is non-transactional, so nothing is forced to auto-commit outside the CLI's wrapper except where a file commits deliberately (R-2).

### 2.2 `SECURITY DEFINER` / `search_path`

Every `SECURITY DEFINER` function in all eight files pins `search_path` (`public`, `public, extensions`, or `public, pg_temp`). The live catalogue independently reports **0** `SECURITY DEFINER` functions without a pinned `search_path`, so the migration cannot introduce one silently. **PASS.**

### 2.3 Per-operation contract (grouped, since the files repeat six patterns)

| Operation group | Precondition | Expected result | Failure behaviour | Verification |
| --- | --- | --- | --- | --- |
| `CREATE TABLE IF NOT EXISTS` (17) | parent tables (`profiles`, `service_bookings`, `businesses`) exist | 17 new RLS-enabled tables | statement error → file stops | each name present; RLS on |
| `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (7 + 3) | target tables exist (all 35 `ALTER` targets verified resolvable) | nullable `business_id` / timestamp columns | error → stops | column present, nullable |
| `CREATE OR REPLACE FUNCTION` (36 names) | referenced helpers exist (`is_admin`, `is_active_user`, `can_access_business`) | 39 statements replace in place | error → stops | 36 names present; 0 unpinned definers |
| `DROP POLICY IF EXISTS` + `CREATE POLICY` (56) | `business_id` columns exist (step 5) | business-scoped RLS replaces owner-scoped RLS | error → stops | named policies exist; RLS 91/91 |
| `UPDATE` backfill (17 statements in file 5) | steps 1–4 applied | `business_id` populated where mapping is deterministic; unresolved rows recorded in `business_backfill_review` | error → stops; **no rollback without a capture** | row counts in `business_backfill_review`; no NULL-mapped rows silently dropped |
| `INSERT … ON CONFLICT DO NOTHING/UPDATE` (44) | unique constraints from steps 1/4 | provisional businesses, members, module access, audit rows | idempotent by construction | counts stable on re-run |

The backfill is deliberately conservative: it maps only owner+module and listing→booking→payment chains, and records anything ambiguous in `business_backfill_review` instead of guessing. That is the right design and it is why it needs a restore point — it is the only step that mutates existing rows.

---

## 3. Phase 6 — local application checks (what actually ran)

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` (`npm run lint`) | **PASS** — exit 0, no diagnostics |
| Production build | `npm run build` | **PASS** — exit 0, 0 errors, 3553 modules, `✓ built in 1.22s` |
| Unit + integration suite, no local DB | `npm test` | **473 tests · 419 pass · 36 fail** — every failure `ECONNREFUSED` → `BOS_LISTINGS_DATABASE_UNAVAILABLE` |
| Unit + integration suite, local PG up | `BOS_LISTINGS_DATABASE_URL=…:55440 npm test` | **491 tests · 472 pass · 17 fail** |

The first run's 36 failures were purely environmental: the suite spawns `server.ts`, which requires a reachable PostgreSQL. The project's own local cluster (`.local/stays-db`, PG 17) was present but stopped; the repo's documented bootstrap (`scripts/dev-with-stays-db.sh`) starts it on **55440**. It was started with `LC_ALL=C` (macOS otherwise aborts with *"postmaster became multithreaded during startup"*), used for the test run, and **stopped again** — no persistent service left running.

**Incidental but important finding:** that local cluster already contains **all 17** pending tables, the 8 business/delivery helper functions (`can_access_business`, `can_access_business_module`, `business_publicly_available`, `business_module_for_listing`, `create_delivery_otp`, `verify_delivery_otp`, `ensure_service_delivery_profile`, `record_business_transfer_audit`), 275 functions and 231 policies. So the eight migrations have **already executed successfully against a real PostgreSQL 17 database**. That is strong evidence the SQL itself is sound; it does not amount to hosted verification and is not being presented as such.

### 3.1 Schema the app expects vs schema that exists

| App reference | Where | Exists hosted today? | Created by |
| --- | --- | --- | --- |
| `.from('service_delivery_profiles')` | `src/lib/deliveryTrackingClient.ts` | **no** | `20261111190000` (+ 5 columns added by `20261111200000`) |
| `.from('service_tracking_events')` | same | **no** | `20261111190000` |
| `.from('service_tracking_locations')` | same | **no** | `20261111190000` |
| `.rpc('create_delivery_otp')`, `.rpc('verify_delivery_otp')` | same | **no** | `20261111190000`, redefined by `20261111200000` |
| `business_id` columns, `businesses`, `business_members`, `business_module_access`, `business_audit_events`, `business_backfill_review`, `business_ownership_transfers` | `src/server/businessApi.ts`, `businessClient.ts`, `businessPermissions.ts`, `businessModuleMap.ts`, `BusinessAccessPanel.tsx`, `ProviderDashboard.tsx` | **no** | `2026111201/2/3/4/50000` |
| `service_bookings.helper_assigned_at`, `tracking_started_at`, `tracking_stopped_at` | `deliveryTrackingClient.ts` | **no** | `20261111190000` |

The client's delivery-tracking select and the migration's table definition were checked column by column and **agree**, including the five columns that only `20261111200000` adds (`category_id`, `live_map_enabled`, `otp_enabled`, `delivery_confirmation_enabled`, `delivery_confirmed_at`). No mismatch was found. This means the pending migration set is what makes already-shipped UI code work — the feature is live in the working tree and dead against the hosted database today.

### 3.2 The 17 remaining test failures — one root cause, not a code defect

`server.ts:2437–2466` reads `x-business-id`. If it is not a UUID **and** the caller is a provider who has an active `business_members` row or owns a `businesses` row, the request is refused with `403 BUSINESS_CONTEXT_REQUIRED`. A legacy fallback exists **only** for a provider with *no business rows at all*.

The local database has been backfilled (55 businesses, 76 members), so the fallback no longer fires for these fixtures, and only two test files (`business-ownership.test.mjs`, `customer-module-access.test.mjs`) ever send `x-business-id`.

| Failures | Shape |
| --- | --- |
| 12 | literal `{"ok":false,"error":"BUSINESS_CONTEXT_REQUIRED"}` |
| 1 | expected `ACTIVE_PROFILE_REQUIRED`, got `BUSINESS_CONTEXT_REQUIRED` |
| 1 | expected `404`, got `403` |
| 1 | expected `[200, 409]`, got `[403, 403]` |
| 1 | expected `200`, got `403` |
| 1 | aggregate `provider-listing API` test (same file family) |

All four affected files (`classes-enrollment-postgres.integration`, `live-edit-backend-security.integration`, `provider-listings-postgres.integration`, `services-booking-e2e`) are provider-write tests written before business context became mandatory. **They are stale fixtures, not an application regression:** every observed difference is a refusal where a success was expected, or a coarser refusal where a more specific one was expected. Nothing became *more* permissive.

**Deliberately not "fixed".** Making these pass means either (a) adding business setup + `x-business-id` to four security-focused suites, or (b) relaxing assertions that currently encode denial semantics (403 vs 404 is an information-disclosure distinction, `ACTIVE_PROFILE_REQUIRED` vs `BUSINESS_CONTEXT_REQUIRED` is a diagnostics distinction). Both are owner decisions about intended behaviour, and doing (b) unasked would be exactly the "make the errors disappear" shortcut this task forbids. Logged as **Approval F**.

---

## 4. Phase 3 — recovery readiness (summary)

Full detail in **`REACT_RECOVERY_READINESS_REPORT.md`**. Headline: **NOT READY**.

The 14 live tables that no migration ever creates — `bookings, cinema_screens, enquiries, listings, movie_refunds, movie_support_tickets, notifications, payment_verifications, profiles, reviews, seat_locks, transactions, user_favorites, user_module_configs` — are precisely the tables that hold production-shaped data (`profiles`, `listings`, `bookings`, `reviews`, `enquiries`, `transactions`) and precisely the tables the backfill's 17 `UPDATE`s touch. They are not represented in any historical baseline, and the newest archive is ~14 days old. PITR is not enabled.

---

## 5. Phase 4 — credential incident

**Status: OPEN.** The credential leaked by the earlier `db dump --dry-run` (`cli_login_postgres.obkfgxjzlscungkhbyvq`, postgres-equivalent, bypasses RLS) has **not** been tested, printed, retrieved or reused in this run.

**New evidence this session:** `select count(*) from pg_roles where rolname like 'cli_login%'` → **1**. The role still exists in the development database. Nothing about it was read beyond its existence.

What the owner must do, in order (none of it performed here):

1. **Rotate the database password** in the Supabase dashboard for `obkfgxjzlscungkhbyvq` — this invalidates the leaked postgres credential.
2. **Remove the CLI-minted login role** (dashboard → Database → Roles, or `drop role` once confirmed unused), so no postgres-equivalent principal lingers.
3. **Purge the leak source** — the shell history / CI log that captured the connection string, and any local file that recorded it.
4. **Confirm no reuse** — check dashboard auth logs for connections from unexpected addresses after the exposure timestamp.
5. Ask for the incident to be recorded **CLOSED** in the gate chain only after 1–4 are evidenced.

Rotation is **DEFERRED BY OWNER** (Gate L5 D3, still unanswered). Migrations use the same postgres-equivalent path, so the incident is a *sequencing* risk (R-6), not a content risk.

---

## 6. The finding that changes the operational plan — R-10

The migration set is additive, but it is **not operationally inert**.

`business_ownership_phase2_backfill` gives *every provider who owns a listing* a provisional business row and an `owner` membership. From that moment, `server.ts` no longer takes its legacy fallback for those providers: any provider write without a valid `x-business-id` returns **403 `BUSINESS_CONTEXT_REQUIRED`**, and the function then also requires the business to be `approved`, `is_enabled`, its module to be `approved` and `enabled`, and to match the module the route serves.

Consequences the owner should weigh before approving execution:

1. **Existing provider sessions break on the next write** unless the UI has selected and persisted a business id. The working tree already contains that selector (`ProviderDashboard.tsx`, uncommitted), which sets `localStorage.bos_business_id_v1`; `buildAuthHeaders()` sends it as `x-business-id`.
2. **The 17 test failures measured today are a live preview of that breakage**, not a separate problem.
3. Backfilled businesses are inserted with `approval_status = 'approved'` and module access `approved`, so they do *not* need an admin approval pass before providers can write. That is deliberate in the migration, and worth an explicit owner nod because it means the backfill grants access rather than gating it.
4. Providers with **no** listing get no business and keep the legacy path — access becomes *tiered* by whether a provider has ever published a listing.

This is why the plan's post-migration smoke tests are provider-write tests, not just a `SELECT` count.

---

## 7. What was written to disk

| File | Change |
| --- | --- |
| `REACT_COMPLETE_REMEDIATION_REPORT.md` | **new** (this file) |
| `REACT_MIGRATION_EXECUTION_PLAN.md` | **rewritten** with today's measurements, R-10, exact verification SQL |
| `REACT_RECOVERY_READINESS_REPORT.md` | **new** |
| `REACT_FINAL_GO_NO_GO.md` | **new** |
| `REACT_POST_MIGRATION_VERIFICATION.md` | **deliberately not created** — there is no execution to verify; an empty verification report would corrupt the evidence chain |
| Scratch SQL in `.local/` | created for read-only queries, then deleted |

Nothing else was created, edited, staged or deleted. 81 migration files unchanged. 17 backup entries unchanged. `.env.local` unchanged. No Flutter path read.

---

## 8. Standing blockers

| # | Blocker | Owner action |
| --- | --- | --- |
| B-1 | No restore point for the 74-table state (14 legacy tables never captured) | approve schema-only capture + archive + decrypt verification |
| B-2 | 17 `UPDATE`s on live rows, PITR off, archive 14 days old | same as B-1 |
| B-3 | Credential incident OPEN; exposed role still present | rotation + role removal |
| B-4 | Two files carry their own `COMMIT` → partial-file risk | accept stop-and-verify discipline; no repair |
| B-5 | Provider writes require `x-business-id` immediately after backfill | accept, and ship the selector UI |
| B-6 | 17 stale integration fixtures | decide fixture update vs assertion review |
