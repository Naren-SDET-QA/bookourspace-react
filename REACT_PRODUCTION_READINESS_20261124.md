# React Production Readiness & Migration Preparation

**Date:** 2026-11-24
**Repository:** `/Users/aa/Downloads/bookourspace-react`
**Branch / HEAD:** `feat/universal-gps-tracking` @ `96c1297`
**Scope:** React application + PostgreSQL migration set. Flutter excluded.
**Hosted development project:** `obkfgxjzlscungkhbyvq` (read-only; never used as a test database)
**Production project:** **not confirmed** — never assumed to be development.

---

## Verdict

| Area | Verdict |
| --- | --- |
| React application (typecheck, build, unit/integration, browser E2E) | **GO** |
| Migration set on a clean PostgreSQL 17 sandbox (81 originals + 1 forward repair) | **GO** — full harness exit 0 |
| Migration manifest / byte pinning | **GO** — 82 migrations, unique versions, sha256 verified |
| Deployment package (env, sequence, pre/post checks, recovery) | **READY** — in `REACT_PRODUCTION_DEPLOYMENT_PACKAGE.md` |
| **Applying anything to a hosted project** | **BLOCKED** — see §8 |

Nothing was applied to any hosted database. No backup, dump, encryption or restore was run. The eight pending migrations were corrected in place **before** application, which is legitimate only because none of them is in the hosted ledger yet (R1 evidence: 8 pending, 0 of their tables live).

---

## 1. Phase 1 — preservation record

Recorded before any edit:

```
branch  feat/universal-gps-tracking
HEAD    96c1297fa7e1a5dae46872bf1f1c30b0c4788297
staged  0
modified 8   (4 UI components, 4 integration test files)
untracked 24 (review/recovery/gate reports)
```

Those 8 modified files and 24 reports were preserved untouched. After this task the tree adds 1 migration file, 9 corrected migration/test files, the regenerated manifest, and this report + the deployment package + the postcondition script. No file was reverted, stashed or discarded.

Prior evidence read: `REACT_FINAL_GO_NO_GO.md`, `REACT_MIGRATION_EXECUTION_PLAN.md`, `REACT_COMPLETE_REMEDIATION_REPORT.md`, `REACT_RECOVERY_GATE_R1/R2/R2.1`, `REACT_SECURITY_REGRESSION_REPORT.md`, `REACT_BROWSER_E2E_REPORT.md`, `SUPABASE_RECOVERY_GATE_L1…L5`, `SUPABASE_CANONICAL_DATABASE_BLUEPRINT.md`.

### Architecture (verified against the tree, 323 TS/TSX files)

- React 19 + Vite 8 SPA (`src/App.tsx`, 115 components), Express server (`server.ts`, 48 modules under `src/server`), PostgreSQL via `pg`, Supabase only for Auth/Storage.
- Modules: Stays, PG/Hostels, Function Halls, Classes, Movies, Services, Admin, Live Edit.
- Authorization is enforced in three layers: session token → route middleware (`server.ts` provider-prefix gate, `x-business-id`), repository SQL, and RLS. RLS is the last line; the application never relies on client-supplied role claims.
- Business context: `server.ts` resolves `x-business-id` to an approved business + active membership + module access. A provider with **no** business row keeps the legacy owner-scoped path (explicit fallback).

### Development-bypass check

- `BOS_ALLOW_REMOTE_DEVELOPMENT_DATABASE` defaults off; the dev server runs against local PG and logs “Live Supabase is disabled”.
- `VITE_ENABLE_DEMO_DATA` is only set by the dev/E2E scripts, never by `vite build` or `start`.
- Demo/pass fixtures are guarded by `NODE_ENV !== 'production'` checks (unit-tested by `demo-data-and-role-safety`, `database-free-preview-security`, `auth-frontend-guards`: all pass).
- No route grants admin from a request header; admin checks re-derive the role from `profiles`/Supabase.

---

## 2. Phase 2 — application readiness

The application code was **not** rewritten. Every genuine defect found during Phase 2 was caused by the pending schema, and fixing it in the migration was the only correct place:

| App-visible defect | Cause | Evidence |
| --- | --- | --- |
| Anonymous marketplace listing reads return `permission denied for function is_admin` | public SELECT policy calls `is_admin()`, whose EXECUTE was revoked from `anon` | `curl`-equivalent SQL as `anon` in sandbox failed before the fix |
| Anonymous venue-category reads fail the same way | same anti-pattern in an already-applied migration | sandbox probe |
| Anonymous class discovery fails | class-batch policy subquery reads `listings`, inheriting the broken policy | `class_enrollment_test.sql:96` |
| Every provider write carrying `x-business-id` returns **500 `BUSINESS_CONTEXT_UNAVAILABLE`** | `server.ts` joins `public.business_member_access`, which no migration created | `provider-listings-postgres.integration.test.mjs` (5 failures) |
| Provider cannot read its own venue bookings / listings / payments after the rollout | business-only policies with no `business_id IS NULL` fallback | `venue-bookings-postgres.integration.test.mjs:77` |

Preserved product decisions: online booking/payment flows were **not** enabled or altered; payments remain sandbox-gated (`BOS_VENUE_PAYMENT_SANDBOX`), Razorpay reports `razorpayConfigured=false` unless keys exist, and no authorization was relaxed to satisfy a test. The four uncommitted UI fixes (`ProviderDashboard`, `ClassBatchManager`, `VenueOwnerWorkspace`, `ConfirmDialog`) were left as they were.

---

## 3. Phase 3 — audit of all 81 migrations

Method: chronological read of all 81 files, static pattern scan, and — decisively — applying every file to a throwaway PostgreSQL 17.11 cluster with Supabase-compatible `auth`/`storage` stubs, then exercising the SQL and HTTP suites. Version numbers and filenames were not changed.

### Findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| M-1 | `20261111200000` and `20261111210000` contain their own top-level `BEGIN;`/`COMMIT;`. `supabase db push` already wraps each migration **and its ledger insert** in one transaction, so the inner `COMMIT` commits the schema without the `supabase_migrations` row — the exact partial-application state the CLI warns about. | High | **Fixed** (control statements removed; CLI/harness provide atomicity) |
| M-2 | `20261112030000` creates the listings SELECT policy twice; the second definition silently overrides the first, dropping the owner fallback added to the first. | High | **Fixed** (dead first definition removed) |
| M-3 | Phases 3–4 replace owner/provider policies with business-only predicates. Any row with `business_id IS NULL` — which is **every listing created after the migration**, since no trigger or app path assigns it — becomes invisible and unwritable to its owner. | **Critical** | **Fixed** (every affected policy now ORs a `business_id IS NULL` owner/provider fallback: listings, bookings, service/venue bookings, stays, enquiries, contact settings, payment intents, invoices and claims) |
| M-4 | The public listings SELECT policy is granted to `public` but calls `is_admin()`; `anon` cannot execute it, so all anonymous listing reads fail. | **Critical** | **Fixed** (role-split policies: anon never evaluates `is_admin()`) |
| M-5 | `venue_categories` has the same anon/`is_admin()` defect, from an already-applied migration. | High | **Fixed** by forward migration `20261112060000` |
| M-6 | `server.ts` joins `public.business_member_access`; no migration creates it. Every provider write with a business header returns 500. | **Critical** | **Fixed** (table + RLS + grants in phase 1) |
| M-7 | 14 SECURITY DEFINER functions retain the default `PUBLIC` EXECUTE grant (delivery-tracking triggers, business helpers, transfer audit). | High | **Fixed** (explicit revoke/grant boundary) |
| M-8 | Phase 2 performs 17 full-table `UPDATE`s in one transaction; no batching, no `LIMIT`. Lock and WAL volume scale with table size. | Medium | **Accepted + documented** (idempotent, guarded by `IS DISTINCT FROM`; run in a low-traffic window) |
| M-9 | Storage migration guards on `to_regclass('storage.objects')` and is idempotent, but its upload policy admits **any active user** to their own prefix in `bos-private-documents`, not only booking parties. | Low | **Accepted** (path-scoped, private bucket, active-user check; documented) |
| M-10 | Backfill creates one provisional business per owner+module; two brands under one owner merge into one provisional business. Unresolved rows are recorded in `business_backfill_review`. | Medium | **Accepted** (provisional flag + review queue; owner split is a product action) |

### Specifically requested investigations

- **Two migrations with their own transactions** — M-1. Both were otherwise atomic; removing the statements keeps that property under the CLI and under the local harness (`psql -1`).
- **Function redefinitions** — `business_module_for_listing` (phase 1) and `can_access_business_module` / `business_publicly_available` (phase 3) are new or replaced once each. The dangerous redefinition was a **policy**, not a function (M-2). `20261111200000` redefines none of the delivery functions created in `20261111190000`; the dependency is one-way.
- **17 UPDATE operations** — listings (1), booking-family rows (8: bookings, service_bookings, venue_bookings, stay_properties, enquiries, reviews, provider_contact_settings, media_assets), payment intents (2), PG invoices (2), PG claims (1), service intents (1), service claims (1), venue intents (1). All are deterministic joins; none writes a price, status, owner or audit field.
- **14 legacy tables** — `profiles` holds 8 rows, `cinema_screens` 5, the other 12 are empty (R1 census). The backfill never updates `profiles` or `cinema_screens`; it only reports providers without a listing relationship.
- **Dependency between 4–8** — phase 1 (tables, helper functions, columns) → phase 2 (columns on 7 more tables + data) → phase 3 (uses `business_publicly_available`) → phase 4 (uses `can_access_business_module`) → phase 5 (uses phase-1 audit table). `20261111200000` must run before phase 4/5 because it introduces `service_booking_documents` and the medicine guards. Order in the manifest is correct.
- **Storage guards in `20261112010000`** (document-storage file) — DO blocks return early when `storage.objects` is absent, so a non-Supabase CI database does not fail; policy creation is drop-then-create, so re-application is safe.
- **Unexpected overwrite of production data** — none found. There is no `TRUNCATE`, no `DROP TABLE`, no `DELETE`, and no business insert overwrites an existing row (`ON CONFLICT (business_ref) DO NOTHING`). The only writes are additive columns and `business_id` assignments derived from existing ownership.

---

## 4. Phase 4 — repairs and validation

Repairs (all in still-pending files except the forward migration):

| File | Change |
| --- | --- |
| `20261111190000_universal_delivery_tracking.sql` | revoke client EXECUTE on two trigger helpers |
| `20261111200000_dynamic_service_category_builder.sql` | remove `BEGIN`/`COMMIT`; revoke client EXECUTE on two trigger guards |
| `20261111210000_service_document_storage_access.sql` | remove `BEGIN`/`COMMIT` |
| `20261112010000_business_ownership_phase1.sql` | add `business_member_access` + RLS + policies; revoke/grant helper EXECUTE |
| `20261112030000_business_ownership_phase3_rls.sql` | NULL-business owner/provider fallbacks; role-split listings SELECT; remove duplicate policy; helper grants |
| `20261112040000_business_ownership_phase4_rls.sql` | NULL-business fallbacks for invoices, enquiries, contact settings, payment claims |
| `20261112050000_business_ownership_phase5_transfer.sql` | revoke EXECUTE on transfer-audit trigger |
| `20261112060000_public_read_admin_helper_isolation.sql` | **new** forward repair for `venue_categories` anon reads |
| `supabase/tests/run_local_validation.sh` | apply each migration with `psql -1` (per-file transaction, mirroring the CLI) |
| `supabase/tests/media_finalization_test.sql` | expect 4 storage INSERT policies and assert the new one is path-scoped |

New artifacts: `supabase/tests/verify_pending_migrations.sql` (read-only postconditions), regenerated `supabase/MIGRATION_MANIFEST.json` / `migrations.sha256` (82 migrations, verified).

Sandbox: throwaway `initdb` cluster, PostgreSQL 17.11, stubbed `auth.users`/`auth.uid()`/`auth.role()`/`storage.*`, roles `anon`/`authenticated`/`service_role`, baseline `supabase/schema_and_rls.sql`, then all migrations in filename order with fault-injection on five legacy forward-fix migrations. No hosted connection was opened and no credential was read.

---

## 5. Phase 5 — validation results (actual runs)

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **exit 0** |
| Production build | `npx vite build` | **exit 0** (chunk-size warnings only) |
| React unit/integration | `npm test` | **455 pass, 0 fail, 18 skipped** |
| Migrations + DB integration | `bash supabase/tests/run_local_validation.sh` | **exit 0** (91 public tables; all suites PASS) |
| Migration ordering/pinning | `node supabase/tests/migration_manifest.mjs` | **PASS** — baseline + 82 migrations, unique versions, sha256 match |
| Postconditions | `psql -f supabase/tests/verify_pending_migrations.sql` | **ALL PASSED** (7 groups) |
| Browser E2E (Chromium) | `LC_ALL=C BOS_PLAYWRIGHT_PORT=4747 npx playwright test e2e/app.smoke.spec.ts e2e/auth-entrypoints.spec.ts` | **40 passed** |

Notes, stated plainly:

- The 18 skipped unit tests are environment-gated (PostgreSQL/network) and are **not** counted as passing.
- The E2E run covers the smoke + auth-entrypoint specs, not all 29 spec files. A full `npm run e2e` was not run.
- E2E on this machine needs `LC_ALL=C`; without it `initdb`’s postmaster aborts (“became multithreaded”) — infrastructure, not app code.
- Port 4547 was occupied by an unrelated process; the run used 4747 rather than killing it.

Every failure encountered during the task was fixed at its cause (policy, migration control, missing table, grants, stale assertion), then the **full harness** was re-run until exit 0 — not just the failing suite.

---

## 6. Phase 6 — deployment package

`REACT_PRODUCTION_DEPLOYMENT_PACKAGE.md` contains the environment checklist, project-identity verification, ordered manifest, per-migration pre/postconditions, failure/recovery and forward-repair procedures, rollback feasibility, app↔schema compatibility matrix, deployment sequence, health checks and post-deployment SQL.

---

## 7. Files changed in this task

| File | Purpose |
| --- | --- |
| 7 pending migrations + 1 new forward migration | defect repairs (M-1…M-7) |
| `supabase/tests/run_local_validation.sh` | per-file transaction in the sandbox |
| `supabase/tests/media_finalization_test.sql` | align storage policy count + scope assertion |
| `supabase/tests/verify_pending_migrations.sql` | new postcondition gate |
| `supabase/MIGRATION_MANIFEST.json`, `supabase/migrations.sha256` | re-pinned for 82 migrations |
| `REACT_PRODUCTION_READINESS_20261124.md` | this report |
| `REACT_PRODUCTION_DEPLOYMENT_PACKAGE.md` | deployment package |

---

## 8. Standing blockers (owner action, not code)

1. **Development credential rotation is still OPEN.** Gate R2.1 proved the pre-rotation password still authenticates and no env/Keychain artifact changed. Deploying with a compromised credential is not acceptable.
2. **Production project identity is unconfirmed.** Do not deploy until the target ref is named and verified independently of the development ref.
3. **No verified restore point.** R1 found the newest archive stale (auth 7 vs live 8) and three incomplete archives. A pre-deployment backup or confirmed PITR window is required.
4. **Hosted application is unauthorized.** Applying these migrations to the development project needs explicit approval; production needs the same plus 1–3.
5. **`cli_login_postgres` cleanup** remains a separate, explicitly approved step.

---

## 9. Honest limitations

- The application was not exercised against a hosted Supabase instance (auth callbacks, Storage signed URLs, Realtime). Local stubs cannot prove those.
- The venue/listing/class HTTP suites run the real Express handlers against PostgreSQL, but not through a real browser session token.
- Phase 2 fixes are schema-side; the pre-existing uncommitted UI changes were preserved, not reviewed line-by-line beyond the earlier browser gate.
- Migration timings and lock impact on production-size data were not measured; only correctness on synthetic fixtures was.
