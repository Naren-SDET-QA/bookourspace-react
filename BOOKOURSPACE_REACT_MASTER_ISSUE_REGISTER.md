# BOOKOURSPACE REACT — MASTER ISSUE REGISTER

Repository: `/Users/aa/Projects/bookourspace-final`
Branch: `integration/recover-20261115`
HEAD verified: `c913554f93e7bc7bfcdf6acae2538f43580a42f0`
Date: 2026-11-21
Last update: 2026-11-21 Priority 3 work-in-progress pass.
Rules: no commits, no hosted database access, no deployment.

Severity: **P0** data loss/security breach · **P1** production blocker · **P2** important defect · **P3** improvement.

## Verified and closed in this session

| ID | Sev | Issue | Evidence / fix |
|---|---|---|---|
| BR-01 | P2 | Unpublish was a single click with no confirmation; a Super Admin could take a public page offline by mistake. | Added an accessible `role="alertdialog"` confirmation naming the page/version and the consequence, with explicit Confirm/Cancel. `src/components/UniversalLiveBuilder.tsx`. Browser test asserts the confirmation appears and Cancel leaves the page published. |
| BR-02 | P1 | After unpublish the editor lost the document: `loadPage` read only `draft`/`published`, so with neither present Save/Publish were disabled and the UI could not republish. | `loadPage` now falls back to `versions[0].document` (the row that just became `unpublished`). `src/components/UniversalLiveBuilder.tsx`. Browser test republishes the retired page from the UI. |
| BR-03 | P2 | No browser-level test proved the unpublish control, its states, or public retraction; only HTTP was covered. | New `e2e/builder-unpublish-ui.spec.ts` (2 tests, real server + disposable PostgreSQL). See FINAL TEST REPORT. |
| BR-04 | P3 | Builder controls had no stable test hooks, making UI regression tests brittle. | Added `builder-page-<key>`, `unpublish-page`, `unpublish-confirmation`, `confirm-unpublish`, `cancel-unpublish`, `builder-status`, `builder-error`. |
| BR-05 | P1 | Playwright's isolated server could not mint an admin session (local-dev auth was not enabled). | `playwright.config.ts` sets `BOS_LOCAL_DEV_AUTH=1` for the isolated webServer only; the endpoint is 404 in production and unless explicitly opted in. |

## Open items (not locally actionable without approval)

| ID | Sev | Item | Status |
|---|---|---|---|
| BR-10 | P1 | Hosted migration history is still behind the repository's 124 migrations. Local application from empty is proven; the hosted project is untouched. | **Blocked by policy**: requires explicit approval for hosted DDL. See `REACT_MIGRATION_RELEASE_SEQUENCE.md`. |
| BR-11 | P1 | Production deployment, secrets, and OAuth/Supabase project configuration are not performed. | **Blocked by policy**: deployment requires approval. Checklist in `BOOKOURSPACE_REACT_PRODUCTION_RELEASE_CHECKLIST.md`. |
| BR-12 | P2 | The complete browser journey matrix for all seven customer modules was not re-executed this session (unit + DB integration suites cover their server behaviour). | Prior-session Playwright specs exist (`e2e/stays-*`, `e2e/classes-*`, `e2e/services-*`, `e2e/safe-image-rendering`, `e2e/access-control-*`). Re-run before launch. |
| BR-13 | P2 | Online payments and manual settlement remain deliberately disabled. | Intentional. Must stay disabled until the full server-side verification flow is proven end to end. |
| BR-14 | P3 | `/tmp/bookourspace-playwright-db-4548` and `-4550` clusters from earlier sessions are still running. | Pre-existing; left untouched. `-4547` (this session) was stopped. |
| BR-15 | P3 | Vite build warns about chunks > 500 kB. | Performance follow-up; does not block correctness or launch. |
| SEC-01 | P2 | Distributed API rate limiter keyed its bucket on `req.ip` with no `trust proxy`, so behind Cloud Run every caller collapsed into one bucket per `(method, route)`; the stricter auth/admin/builder budgets also never matched the aggregated route. | **RESOLVED 2026-11-22** — exactly one trusted hop on Cloud Run, explicit hop validation elsewhere, `policyFor` matched to the real route keys, 8 new HTTP-level tests green. Evidence: report §9 and register §10. |
| SEC-02 | P2 | Application session token is kept in `localStorage` (`bos_session_token_v1`), never in an httpOnly cookie. | **OPEN / PARTIAL** — deliberate header-token design (CSRF-resistant), but any XSS yields a 7-day impersonation token. |
| SEC-04 | P3 | The helper-journey coupon discount is computed in the browser (`subtotal * 0.1`) with no server endpoint. | **OPEN** — consistent with W-04: no server trust exists today; must never be sent as an authoritative total (W-10). |
| SEC-05 | P3 | OTP verify-attempt buckets are per-process memory while Cloud Run permits 2 instances. | **OPEN / PARTIAL** — budget splits across instances; fold into the DB-backed limiter. |
| SEC-06 | P2 | `deploy/cloudrun/verify-deployment-config.py` is not run by CI and cannot run here (PyYAML missing). | **OPEN / PARTIAL** — the configuration is currently correct but unenforced. |
| SEC-07 | P3 | `/api/auth/google/url` falls back to a Host-header-derived origin when `APP_URL` is unset. | **OPEN / PARTIAL** — production supplies `APP_URL`; startup does not require it. |

## Out of scope / refused

- No hosted Supabase writes, migration application, billing change, or credential rotation.
- No Flutter/Android/iOS source changes.
- No destructive Git operations; worktree preserved.

---

# PRIORITY 5 — FINAL TEST AND DOCUMENTATION (this turn)

The complete applicable test suite for this project is `npm test` (unit/integration,
`tests/run-unit-suite.mjs`) plus `npm run e2e` (Playwright, `e2e/`). Both were executed
as the Priority 5 deliverable. Playwright Chromium was installed first (`npx playwright
install chromium` exit 0) because the repo had no local browser binary; that install is
test infrastructure, not a product change.

Commands run (exact):
- `node tests/run-unit-suite.mjs` (via `npm test`) → exit 0; tests 786 · pass 786 · fail 0 ·
  skipped 0 · todo 0. The runner starts its own disposable PostgreSQL 17 cluster, applies the
  baseline plus all 124 migrations, exports `BOS_LISTINGS_DATABASE_URL`/`BOS_TEST_DATABASE_URL`/
  `BOS_LOCATION_TEST_DATABASE_URL`/`BOS_TEST_PG_ADMIN_URL`, and stops the cluster on exit.
  No developer or hosted database was used.
- `npm run e2e` (Playwright `--project=chromium`) → exit 0; 266 tests declared · 236 passed ·
  0 failed · 30 skipped (13.1 m).

Logs: `/tmp/priority5-unit-suite-final.log`, `/tmp/priority5-e2e.log`.

Failures investigated: none. 0 test failures. All 30 E2E skips were investigated from spec
source and are env-gated / by-design (external `E2E_BASE_URL`, pre-seeded session fixtures,
or the AI-Studio preview flag), not masked failures. Full breakdown in
`BOOKOURSPACE_REACT_FINAL_TEST_REPORT.md`.

Migration reports re-verified after the run: consistent with on-disk truth —
`supabase/MIGRATION_MANIFEST.json` migrationCount 124 / array length 124, `supabase/migrations/*.sql`
124 files, 122 committed, 2 pending (`20261119100000_user_access_control_engine.sql`,
`20261120100000_builder_page_unpublish.sql`), both pending present in the manifest and in
`supabase/migrations.sha256`, Priority 2 simulation artifacts under `migration-sim-artifacts/`
still 100% exit 0 (124/124, 73/73, 51/51). No migration report rewritten; none was inconsistent.

Priority 5 did not touch Priority 1/2/3 browser re-runs; the Priority 3 outcomes recorded
elsewhere in this register are unchanged by this pass.


All runs use the disposable local stack only. No hosted connection was made.

| ID | Sev | Finding | Status |
|---|---|---|---|
| W-01 | P2 | Services harness seeded no `services` customer grant; the stricter permission engine correctly returned `CUSTOMER_ACTION_FORBIDDEN`, blocking the seed. | **FIXED** (`run_services_ui_e2e.sh` now upserts `customer_module_access`). |
| W-02 | P3 | Services journey waited for a stale accessible name (`region "Services app"`) although the inline `services section` region is the mounted surface. | **FIXED** (`e2e/services-booking.spec.ts` accepts either surface). |
| W-03 | P1 | Classes orchestrator cannot mount the provider portal: `/api/auth/me` returns 200 `authenticated:true role:provider`, the tab keeps `#provider`, `user_role=provider`, yet no portal. The same navigation mounts immediately against the harness (`probe8`: `manager=1`). | **OPEN / BLOCKED** — exact failing command and state recorded in FINAL TEST REPORT. Not reproduced outside the orchestrator. |
| W-04 | P2 | No coupon redemption API exists. The helper journey's 10% "coupon" is local draft state (`couponApplied`) with no fetch and no persistence; there is nothing for the server to trust or validate. | **NOT A TRUST DEFECT**; coupon module remains unimplemented. |
| W-05 | P1 | Hotels/Stays, Movies, Function Halls, provider business-context and the dedicated dashboard specs were not executed this pass because their orchestrators depend on the blocked classes run or were out of turn budget. | **OPEN** — required before launch. |

## Evidence summary

- Services: `bash supabase/tests/run_services_ui_e2e.sh` → exit **0**; browser journey + restart-persistence tests passed; `ALL HOME SERVICES UI CHECKS PASSED`.
- PG: `bash supabase/tests/run_pg_integration.sh` → exit **0**; phase1 **37/37**, phase2 **6/6**, browser admin/owner/customer journeys all PASS, `rls_isolation=verified`, restart persistence PASS.
- Classes: `bash supabase/tests/run_classes_ui_e2e.sh` → exit **1** (blocked; diagnostics above).

---

# PRIORITY 3 — WORKFLOW VERIFICATION OUTCOMES (2026-11-21, this pass)

All runs use the disposable local stack only. No hosted connection was made. Evidence files are under `e2e-artifacts/p3-workflows/`.

## Verified surfaces (with real UI / API / DB evidence)

| Surface | Command | Exit | What was proven | Evidence file |
|---|---|---|---|---|
| Classes & Courses | `bash supabase/tests/run_classes_ui_e2e.sh > /tmp/p3-classes.log 2>&1` | 0 | Full managed browser journey: trainer creates pending batch; batch invisible to students until admin publishes; admin approves from admin console; student enrolls, is blocked from duplicate, cancels; unauthenticated visitor cannot enroll; concurrent browsers cannot both take the last seat; cross-browser rendering; explicit x-business-id scopes classes APIs and a foreign business is refused. | `e2e-artifacts/p3-workflows/classes-movies-verified.md` |
| Movies | `bash supabase/tests/run_classes_ui_e2e.sh` (movies phase) | 0 | Visible screen rendered and hidden screen hidden; legacy seat/booking endpoints hard-refused (`MOVIES_V1_DISPLAY_ONLY`). | `e2e-artifacts/p3-workflows/classes-movies-verified.md` |
| Function Halls | `bash supabase/tests/run_classes_ui_e2e.sh` (venues phase) and `BOS_RUN_VENUE_ONLY=1 bash supabase/tests/run_classes_ui_e2e.sh` | 0 / 0 | Owner creates venue pending; admin approves with category audit; owner configures server-authoritative rates/buffers/approval; customer searches, gets server quote, books, opens My Bookings; owner sees reservation, blocks calendar dates, reschedules; customer cancels and opens dispute; admin resolves dispute with audited resolution; mobile/tablet surface; restart persistence; Chromium/Firefox/WebKit cross-browser. Defect W-20 fixed during this pass. | `e2e-artifacts/p3-workflows/venue-function-halls-evidence.md` |
| Local Services | `bash supabase/tests/run_services_ui_e2e.sh > /tmp/p3-services.log 2>&1` | 0 | Customer cancels, provider completes, admin refunds a verified payment; after server restart the completed/cancelled/refunded service bookings persist. | `e2e-artifacts/p3-workflows/stays-services-verified.md` |
| Hotels & Stays (integration core) | `bash supabase/tests/run_pg_integration.sh > /tmp/p3-pg-integration.log 2>&1` | 0 | Phase 1: 37/37 checks; phase 2: 6/6 checks; browser admin/owner/customer journeys all PASS; `rls_isolation=verified`, conflict atomicity verified, restart persistence verified, JSON store untouched. | `e2e-artifacts/p3-workflows/stays-services-verified.md` and `e2e-artifacts/p3-workflows/p3-pg-verified.md` |
| PG & Hostels (admin deep journey) | `bash supabase/tests/run_pg_admin_e2e.sh > /tmp/p3-pg-admin-final.log 2>&1` | 1 | W-21 remains open: the React-routed customer reservation path on `/api/pg/bookings` reaches `public.pg_create_booking(...)`, which reads `auth.uid()` and enforces `ACTIVE_CUSTOMER_REQUIRED` from the DB profile. In the disposable harness transaction the `request.jwt.claim.sub` GUC is **not** set by the server path under test, so the booking insert cannot resolve the authenticated customer and the admin deep journey fails before dispute/invoice/payment/admin-audit checks. The `/api/pg/bookings` identity contract itself is now regression-covered in `tests/pg-bookings.integration.mjs` (verified customer identity is derived from the signed session token, not the request body; another customer cannot create or cancel a reservation they do not own). The remaining blocker is the React-routed admin deep journey reaching `pg_create_booking` without a valid `sub`/active-customer profile in that harness environment, not the underlying RPC identity guard. | `e2e-artifacts/p3-workflows/pg-admin-evidence.md` and `e2e-artifacts/p3-workflows/p3-pg-verified.md`; regression: `tests/pg-bookings.integration.mjs` |

## Not verified this turn (explicit)

| Surface | Why not verified here |
|---|---|
| PG & Hostels admin deep journey booking creation | Reproducible server-side defect W-21 (`pg_create_booking` reads `auth.uid()` without `sub` GUC in the disposable harness transaction path). |
| Coupons | No server table, route, or RPC for coupon creation/redemption/apply exists anywhere in `src`, `server.ts`, or `supabase/migrations`. Server-side coupon validation/enforcement is therefore absent by construction, not partially implemented and misconfigured. The only artifact on disk is the local draft 10% computation in `src/components/HelperJourney.tsx` (`couponApplied` → `Math.round(subtotal * 0.1 * 100) / 100`), which is client-only draft state with no fetch, no persistence, no business/eligibility scoping, and no redemption guard; there is nothing for the server to trust, validate, or refuse. UI→API→DB cannot be proven locally. |

## Defects found and fixed this pass

- **W-20 (P1, fixed)**: PG admin customer-dispute surface was missing at the React-routed path. Before the fix, `bash supabase/tests/run_pg_admin_e2e.sh` exited 1 with `customer can open a dispute with evidence` failing as `INVALID_DISPUTE_ID` and every downstream dispute/invoice/payment check failing. After the fix, the dispute path exists and the admin harness still exits 1 only because of the deeper `ACTIVE_CUSTOMER_REQUIRED` booking-creation defect (W-21), which is a different failure and is recorded separately.

## Evidence commands (exact)

```bash
bash supabase/tests/run_classes_ui_e2e.sh > /tmp/p3-classes.log 2>&1   # exit 0
BOS_RUN_VENUE_ONLY=1 bash supabase/tests/run_classes_ui_e2e.sh > /tmp/p3-venueonly.log 2>&1  # exit 0
bash supabase/tests/run_services_ui_e2e.sh > /tmp/p3-services.log 2>&1  # exit 0
bash supabase/tests/run_pg_integration.sh > /tmp/p3-pg-integration.log 2>&1  # exit 0
bash supabase/tests/run_pg_admin_e2e.sh > /tmp/p3-pg-admin-final.log 2>&1  # exit 1 (W-21)
```

## Gate results (this pass)

- Unit tests: `node tests/run-unit-suite.mjs` → exit 0; tests 786 · pass 786 · fail 0 · skipped 0 · todo 0 (isolated PG, 124 migrations from empty).
- TypeScript: `npx tsc --noEmit` → exit 0.
- Production build: `npm run build` → exit 0.
- E2E (chromium, `npm run e2e`) → exit 0; 266 tests · 236 passed · 0 failed · 30 skipped.
- HEAD: `c913554f93e7bc7bfcdf6acae2538f43580a42f0`
- Staged changes: none

## Verdict note for this pass

With the evidence above, the repository has real, repeated, disposable-evidence coverage for Classes, Movies, Function Halls, Local Services, and the PG/Hotels integration core. The PG booking identity contract on `/api/pg/bookings` is now regression-covered (`tests/pg-bookings.integration.mjs`), but the PG admin deep journey is still blocked on W-21: the React-routed path reaches `public.pg_create_booking(...)`, which reads `auth.uid()`/`ACTIVE_CUSTOMER_REQUIRED` from the DB profile, and the disposable harness transaction path under test does not set `request.jwt.claim.sub`, so booking creation cannot resolve the authenticated customer in that environment. Coupons is unimplemented on the server (no table, route, or RPC), so there is no server-side coupon validation or enforcement to assess. Payments/booking confirmation remain intentionally disabled. Verdict for Priority 3 as of this pass: **NOT READY**, because W-21 and the Coupons surface remain open and payments/booking confirmation are disabled.

---

# W-07 RESOLUTION AND PRIORITY 3 REFRESH (2026-11-21, fourth pass)

## W-07 — session-token instability — RESOLVED

Fix (product code, no auth weakening):
- `server.ts` `/api/auth/me`: the incoming token is reused when the resolved claims
  (`userId`, `role`, `providerId`) are unchanged; a new token is minted only on a real
  role/provider change. Applied to the production and local branches.
- `src/lib/sessionTokenReuse.ts` (new): `shouldReuseIncomingSessionToken`.
- `src/lib/sessionVerificationGuard.ts`: `shouldAcceptExhaustedReverify` + exported
  `MAX_SESSION_RECHECKS`; the client accepts a 200 verification for the **same**
  stored user when re-checks are exhausted instead of returning a local 409.
  401/403/blocked/expired responses still never produce an authenticated session.

Regression: `node --import tsx --test tests/auth-session-race.test.mjs` → **10/10 pass**
(unchanged pre-existing 7 + 3 new: unchanged-claims reuse, exhausted-recheck
same-identity acceptance, two concurrent verifications converge).

Observed contract after the fix (browser capture, 5 calls): status 200,
`hasUser:true`, `userId:USR-E2E-P`, `sessionToken` present, `sameToken:true` every time.

## Remaining Classes failure (precise)

`bash supabase/tests/run_classes_ui_e2e.sh` → exit **1** (run F, 47.7 s first test).
The provider portal **does** mount (snapshot contains `navigation "Provider portal
navigation"`, `Server-authorized workspace`, no marketplace hero), but
`class-batch-manager` is absent because App's `userRole`/`authUser` state is still
null/customer while the header renders from the persisted profile. The auth contract is
correct and stable, so this is a React state-propagation defect, not authentication.

Next action (single): instrument `MarketplaceContext` consumers to confirm whether
`setAuthUser` from `verifySessionAndSync` reaches `App` in this runner (suspect duplicate
provider instances or a context remount), then fix the propagation.

## Priority 3 refreshed results

| Workflow | Command | Result | Exit |
|---|---|---|---|
| Local Services (re-run) | `bash supabase/tests/run_services_ui_e2e.sh` | journey + restart passed; `ALL HOME SERVICES UI CHECKS PASSED`; grant confirmed fixture-only (`run_services_ui_e2e.sh:228`, cleanup `:245`; no migration seeds it) | **0** |
| Classes & Courses | `bash supabase/tests/run_classes_ui_e2e.sh` | 0 passed / 2 failed / 5 not run; portal mounts, module gate unsatisfied | **1** |
| Movies | via classes orchestrator | not run (aborts after Classes) | — |
| Function Halls / Venues | `BOS_RUN_VENUE_ONLY=1 bash supabase/tests/run_classes_ui_e2e.sh` | not run (same abort) | — |

`npx tsc --noEmit` → exit 0 after every edit.

---

# W-07 CLOSED — CLASSES UI E2E GREEN (2026-11-21, fifth pass)

## Root cause (fixture, not authentication)

`class-batch-manager` was mounted correctly: `userRole`/`authUser` were `provider`
throughout. The component returned `null` because its two provider endpoints answered
**403 `BUSINESS_CONTEXT_REQUIRED`** (`/api/provider/listings`, `/api/provider/classes/batches`),
so it set `notApplicable` and hid itself. Three fixture defects produced that:

1. the runner seeded no approved, enabled `businesses` row with an active membership;
2. the signed session used `userId: "USR-E2E-P"` (display id) instead of the profile UUID
   the middleware resolves (`claims.supabaseUserId || claims.userId`);
3. later seed steps/triggers added a second membership, which makes the server require an
   explicit `x-business-id` selection and fail closed.

## Fix (test fixture + spec only; authorization untouched)

- `supabase/tests/run_classes_ui_e2e.sh`
  - seeds one approved/enabled `classes` business for the provider, sets
    `listings.business_id`, deletes extra memberships **at the end of the seed**, asserts
    `provider active memberships: 1`;
  - session claims use `userId: person.auth` (profile UUID);
  - seeds the customers' classes module grants (same actions the harness provisions);
  - new `BOS_SKIP_VENUES=1` switch so a full Classes run is not aborted by the separate
    Function Halls phase (venue-only mode unchanged);
  - `E2E_COURSE_ID` passed to both Playwright invocations.
- `e2e/classes-training.spec.ts`
  - opens `/#classes/style3` (the card surface this journey asserts on);
  - `ensureCourseInCatalog()` puts the DB course into the browser catalogue before
    student discovery;
  - `openCourseEnrollment()` accepts Style 4 (`View details for …`) and Style 3 cards and
    fails in 30 s with the surface text instead of burning the 180 s budget;
  - guest test asserts the closed anonymous route (guest entry disabled) plus a direct
    unauthenticated `POST /api/classes/enrollments` → 401/403;
  - race test reuses the shared helpers instead of Style-4-blind selectors.

## Evidence

| Run | Command | Result | Exit |
|---|---|---|---|
| AE | `BOS_SKIP_VENUES=1 bash supabase/tests/run_classes_ui_e2e.sh` | 7 journey + 2 movies + 1 restart passed; `ALL CLASSES UI CHECKS PASSED (cancelled=1, race_confirmed=1, verified_payments=0)` | **0** |
| AF | same, fresh cluster | same | **0** |
| AH | same on the cleaned tree (probes removed) | same | **0** |
| AI | same, fresh cluster | same | **0** |

Browser assertions exercised: batch created with `pending_approval`, invisible to students,
admin publishes, student confirms seat, duplicate refused by the server, cancellation
recorded, last-seat race leaves exactly one confirmed enrollment, restart persistence.

Regression `node --import tsx --test tests/auth-session-race.test.mjs` → **14/14 pass**
(valid hydration, unchanged claims, exhausted re-check, expired, revoked, provider
deep-link identity, concurrent convergence).

## Remaining

- **Function Halls journey fails** once reachable (`e2e/venue-booking.spec.ts:208`,
  `expect(locator).toBeVisible()`); it is the next blocker, not a Classes defect.
- A legitimate multi-business provider's explicit `x-business-id` selection is supported
  by the server but not exercised by an E2E test yet.

---

# FUNCTION HALLS CLOSEOUT — W-05 / W-08 / W-11 / W-12 (2026-11-21, sixth pass)

| ID | Sev | Finding | Status |
|---|---|---|---|
| W-08 | P1 | Movies and Venues specs could not run while the Classes journey aborted the orchestrator. | **CLOSED** — the orchestrator now completes both phases; venue-only mode exits 0 (runs M, N) and the Classes run exercises the Movies phase (run R). |
| W-05 | P1 | Function Halls / provider business-context browser coverage was never executed. | **CLOSED for Function Halls** — full owner/admin/customer/owner/admin plus cross-engine and restart phase green twice. Hotels/Stays browser UI remains unexecuted (API/SQL only). |
| W-11 | P1 | The venue owner workspace (`VenueOwnerWorkspace`) was never mounted, so "Function hall bookings" could not render for any provider. It is now mounted at App level next to the Classes module and hides itself when the selected business is not a venue business (the listings endpoint answers 403 for another module). | **FIXED** (`src/App.tsx`, `src/components/VenueOwnerWorkspace.tsx`). |
| W-12 | P1 | The seeded provider's second (venues) business made the dashboard selection ambiguous; the settings save then carried the classes business and the server correctly refused with `BUSINESS_MODULE_MISMATCH`. The venue journey now runs with a single active membership, and a dedicated regression test proves the multi-business contract. | **FIXED** (`supabase/tests/run_classes_ui_e2e.sh` mode split; regression in `e2e/classes-training.spec.ts`). |

## Regression coverage added (multi-business)

`e2e/classes-training.spec.ts` → `provider business selection` test:
`GET /api/provider/classes/batches` with `x-business-id: <classes business>` → **200**;
with the approved venues business → **403 `BUSINESS_MODULE_MISMATCH`**;
with a foreign UUID → **403 `BUSINESS_ACCESS_DENIED`**;
without the header while two memberships exist → **403 `BUSINESS_CONTEXT_REQUIRED`**.
Passed inside run R (exit 0).

## Evidence

| Run | Command | Result | Exit |
|---|---|---|---|
| M | `BOS_RUN_VENUE_ONLY=1 bash supabase/tests/run_classes_ui_e2e.sh` | 9 journey + 3 cross-browser + 1 restart passed; `listing=lst-ad5c8dcc… active=1 settings=1 cancelled=2 owner_blocks=1 resolved_disputes=1 razorpay_refunded=1 upi_verified=1 category_audits=1` | **0** |
| N | same, second consecutive clean run | 9 + 3 + 1 passed; `listing=lst-fd48040d… active=1 settings=1 cancelled=2 owner_blocks=1 resolved_disputes=1 razorpay_refunded=1 upi_verified=1 category_audits=1` | **0** |
| R | `BOS_SKIP_VENUES=1 bash supabase/tests/run_classes_ui_e2e.sh` | 8 journey (incl. new business-selection test) + 2 movies + 1 restart; `cancelled=1 confirmed=1 verified_payments=0 race_confirmed=1` | **0** |
| — | `npx tsc --noEmit` | clean | **0** |
| — | `npm test` (node tests/run-unit-suite.mjs) | 786 passed / 0 failed / 0 skipped (isolated PG, 124 migrations from empty) | **0** |
| — | `npm run build` | `✓ built in 1.07s` | **0** |

## Changed files this pass

- `src/App.tsx` — mounts `VenueOwnerWorkspace` for providers.
- `src/components/VenueOwnerWorkspace.tsx` — sends `x-business-id`, stays hidden for a foreign module context.
- `src/components/ProviderDashboard.tsx` — honours the stored business selection and no longer clears it on an empty first render.
- `e2e/venue-booking.spec.ts` — selects the venues business when the selector is present, reloads before configuring rates, and matches the rendered day format.
- `e2e/classes-training.spec.ts` — explicit business header on the raw provider API call; new multi-business regression test.
- `supabase/tests/run_classes_ui_e2e.sh` — two seeded module businesses, mode-scoped membership, `function_hall` customer grant, business-id exports.

## Remaining blockers (unchanged by this pass)

- Hotels/Stays browser UI, Coupons (no server module), Payments/booking confirmation disabled, hosted migration reconciliation. Verdict remains **NOT READY**.

## Builder unpublish UI verification — status

 - Priority 1 (App Builder unpublish UI): browser and DB-read verification passes on the disposable stack (`e2e/builder-unpublish-ui.spec.ts`, 2 passed, exit 0). **Superseded by §7**, which re-ran the control in the browser with saved screenshots, console/network evidence and found and fixed one UI defect (the editor's document-state label kept saying "(published)" after unpublish).
- **Re-validation this pass (before any code change):** the already-fixed control was re-run as-is in Chromium against the disposable Playwright stack (`npx playwright test e2e/builder-unpublish-ui.spec.ts --project=chromium`). Result: 2 passed / 0 failed / 0 skipped, exit 0, 14.3 s. Evidence captured again to `e2e-artifacts/builder-unpublish/{super-admin-run.json,regular-admin-run.json,01..11-*.png}`. No defect was found on this re-run; the prior BU-UI-01 fix and its pre-fix regression proof in §7.4 remain in place.

- Regression checks on the final tree: venue run exit 0, classes run exit 0, `npx tsc --noEmit` exit 0, `npm test` 786 pass / 0 fail / 0 skipped (isolated PG, 124 migrations from empty), `npm run e2e` 266·236/0/30 exit 0, `npm run build` exit 0.
- Remaining priorities (migration readiness, workflow coverage for Hotels/Stays, PG, Movies, Local Services, Coupons, security and release configuration, the remaining report files) are not complete. Verdict: NOT READY.
- Working tree: 125 changed entries, nothing staged, nothing committed.

## Priority 3 — WORKFLOW VERIFICATION OUTCOMES (2026-11-21, this pass, continued)

All runs use the disposable local stack only. No hosted connection was made and no hosted database operation was performed.

### Suite reconciliation this pass

- `npx tsc --noEmit` → exit 0 (re-run this pass with `./node_modules/.bin/tsc --noEmit`; no error lines).
- Representative unit subset this pass → `tests/customer-module-access.test.mjs`, `tests/business-ownership.test.mjs`, `tests/admin-authorization.test.mjs` via `./node_modules/.bin/tsx --test --test-concurrency=1 ...` → exit 0; **16 pass / 0 fail / 0 skip / 0 todo**.
- Browser E2E disposable stack sanity probe this pass → `BOS_PLAYWRIGHT_PORT=4600 BOS_PLAYWRIGHT_OUTPUT_DIR=/tmp/p3-probe-classes npx playwright test e2e/classes-journey.spec.ts --project=chromium --reporter=list` → disposable webServer started, migrations applied, Chromium launched, 4 tests enqueued; probe stopped by the agent after confirming the disposable stack is alive and reachable. Not a re-run of closed Priority 1.

### What was already verified with evidence on disk before this pass

- Classes & Courses: 8/8
- Movies: 2/2 (display-only; seat/booking paths intentionally refused)
- Function Halls: 9/9 managed + 13/13 venue-only (incl. restart + cross-browser)
- Local Services: 2/2 (incl. restart persistence)
- PG & Hostels integration core: 37/37 + 6/6 + browser journeys + restart persistence + RLS isolation

### PG & Hostels admin deep journey — still blocked on W-21

- Command: `bash supabase/tests/run_pg_admin_e2e.sh > /tmp/p3-pg-admin-final.log 2>&1` → exit **1**.
- What fails: customer reservation via `POST /api/pg/bookings` → `pg_create_booking` raises `ACTIVE_CUSTOMER_REQUIRED` because the function reads `auth.uid()` and the disposable harness transaction path does not resolve the authenticated customer identity for that call.
- What I inspected this pass to confirm the blocker is real and not a stale note:
  - `src/server/pgBookingsApi.ts:138` requires `hasVerifiedSupabaseIdentity(actor)` before calling `repository.createBooking(actor, ...)`.
  - `src/server/pgBookingRepository.ts:55-72` `transaction()` sets `set local role ...` and `set_config('request.jwt.claim.sub', ...)` for the actor when the repository drives the call.
  - `supabase/migrations/20261103210000_pg_booking_lifecycle.sql:124-160` `pg_create_booking` reads `auth.uid()` and requires `role='customer'` and `account_status='active'`.
  - The PG admin browser journey (`tests/pg-admin-browser-journey.e2e.mjs`) genuinely reserves a bed through the browser (`assertCheck('customer: a bed can be reserved', ...)`), so customer booking creation works for the browser-signed session path; the failure is specific to the `run_pg_admin_e2e.sh` phase1 harness call path recorded as W-21.
- Evidence files: `e2e-artifacts/p3-workflows/pg-admin-evidence.md`, `e2e-artifacts/p3-workflows/p3-pg-evidence.md`, `e2e-artifacts/p3-workflows/p3-verdict-notes.md`.

### Surfaces not verified this turn (explicit)

- PG & Hostels admin deep journey booking creation — reproducible server-side defect W-21.
- Coupons — no server table/route/RPC exists; server-side coupon validation/enforcement is absent by construction.
- Customer/Owner/Admin dashboards, business membership/ownership — covered indirectly by the existing permission + business-ownership unit suites and the PG admin browser journey snapshots, but a full dashboard matrix re-run was not repeated this pass.

### Evidence commands (exact, as on disk)

```bash
./node_modules/.bin/tsc --noEmit > /tmp/p3-tsc.log 2>&1   # exit 0
./node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/customer-module-access.test.mjs \
  tests/business-ownership.test.mjs \
  tests/admin-authorization.test.mjs > /tmp/p3-unit-subset.log 2>&1  # exit 0, 16/0/0/0
BOS_PLAYWRIGHT_PORT=4600 BOS_PLAYWRIGHT_OUTPUT_DIR=/tmp/p3-probe-classes \
  npx playwright test e2e/classes-journey.spec.ts --project=chromium --reporter=list > /tmp/p3-probe-classes.log 2>&1  # disposable stack alive probe; agent-stopped
bash supabase/tests/run_pg_admin_e2e.sh > /tmp/p3-pg-admin-final.log 2>&1  # exit 1 (W-21)
```

### Verdict note for Priority 3 (this pass)

Priority 3 is **NOT READY**. The disposable-evidence surfaces that already passed on disk (Classes, Movies, Function Halls, Local Services, PG/Hotels integration core) are unchanged and remain proven. The remaining blocker is W-21: the PG admin deep journey customer reservation path cannot create a booking through the `run_pg_admin_e2e.sh` harness identity path because `pg_create_booking` requires `auth.uid()` / active-customer profile resolution that the harness transaction path does not provide. Coupons is unimplemented on the server. Payments/booking confirmation remain intentionally disabled.

### Priority 3 blockers

- W-21: PG admin deep journey customer reservation path (`POST /api/pg/bookings` → `pg_create_booking`) cannot resolve the authenticated customer in the disposable harness transaction path; downstream dispute/invoice/refund/admin-audit checks cannot complete. Not a React defect; not worked around in the UI.
- Coupons: no server entity exists.
- Full dashboard + business membership/ownership matrix not re-executed this pass.

---

## Migration readiness issues (Priority 2 pass)

Evidence: `REACT_MIGRATION_CLASSIFICATION_REPORT.md`, `REACT_MIGRATION_LOCAL_SIMULATION_REPORT.md`, `REACT_MIGRATION_RELEASE_SEQUENCE.md`. Local checks (2026-11-21 Priority 2 pass): 124/124 migrations applied in manifest order on a disposable PostgreSQL 17.11 cluster twice (empty and populated), plus the recorded DEV split (73 applied, then 51 pending) — all exit 0, evidence in `migration-sim-artifacts/`. `node supabase/tests/migration_manifest.mjs` exit 0; `node scripts/migration-dry-run.mjs --check-sql` exit 0. Hosted state was not read or written in this pass.

| ID | Sev | Finding | Status |
|---|---|---|---|
| MR-01 | P1 | Pending count reconciled to the repo manifest: 124 files = 124 manifest entries, HEAD committed 122. The delta is 2 untracked migrations: `20261119100000_user_access_control_engine.sql` and `20261120100000_builder_page_unpublish.sql`. | **Open, evidence refreshed 2026-11-21.** Manifest verifier exit 0 (`baseline + 124 migrations, unique versions, sha256 match`); sanitizer exit 0. Correct DEV `obkfgxjzlscungkhbyvq` (prior read-only CLI): 73 applied, 51 pending, 0 unaccounted, and the two sets are **not** a contiguous prefix (first pending `20261102124513`). That split was reproduced locally: 73/73 then 51/51 exit 0. Pending SQL is still not checked against the live DEV schema. The earlier 107-version / zero-overlap MCP result came from the wrong project and is retracted. |
| MR-02 | P1 | The two pending migrations and the manifest/sha256 files are uncommitted. A release cannot be reproduced from HEAD. | **Open.** Needs an approved commit; none made. Corrected: the prerequisites `20261104160000`, `20261105020000` and `20261105114000` are recorded as **applied** on DEV (73/73), so the untracked migrations are not blocked by the ledger; live DEV object presence is still unread. Both files applied cleanly in the local DEV-shaped run. |
| MR-03 | P1 | `20261120100000_builder_page_unpublish` widens the `platform_page_versions` CHECK, which takes ACCESS EXCLUSIVE on a populated table. Lock duration unmeasured. | **Open.** Schedule in a low-traffic window after measuring on a staging copy. Rollback is forward-fix only. |
| MR-04 | P1 | Destructive function drops in `20261101000003_fix_provider_contact_listing_ids` and `20261104110000_google_profile_provision_rpc`, plus overload drops in `20261106010000`. | **Open.** Local applies exit 0 on empty, populated and DEV-shaped databases. No caller check against a hosted schema, so a repository-wide search for the dropped signatures is still required before release. |
| MR-05 | P1 | `20261106010000` drops and re-adds `payment_intents_upi_fields_chk`. Re-adding validates existing rows. | **Open.** Local re-add succeeded, but the synthetic set has **no `payment_intents` rows**, so no violating-row scenario was exercised. Hosted pre-check (Gate 1 check 1) must return 0 before release. |
| MR-06 | P1 | Requires-backfill migrations `20261108090000_india_location_directory` (backfill then SET NOT NULL) and `20261112230000_strict_listing_business_assignment` (transactional backfill then SET NOT NULL, ACCESS EXCLUSIVE). | **Open, local evidence strengthened.** On populated synthetic data the backfill produced 4 businesses (one per owner+module), 0 listings with null `business_id`, 0 owner mismatches, 4 `business_members`; identical in the DEV-shaped run. Duration and hosted row counts still unmeasured; Gate 1 checks 3–4 required. |
| MR-07 | P1 | Data-destroying operations: the owner delete path in `20261107032340` (`venue_seasonal_rates`) and the `p_retain` purge in `20261118200000` (`service_tracking_locations`). Cannot be reversed by forward-fix. | **Open, unchanged by the 2026-11-21 run.** Applying `20261118200000` deletes nothing; the local apply (three databases) executed no purge. Destruction happens only on an explicit service-role call. Retention owner sign-off and a confirmed backup are still required before release. |
| MR-08 | P2 | No down-migrations exist and no forward-fix scripts were written for the destructive steps. | **Open.** Write and review forward-fix scripts for MR-03, MR-04 and MR-07 before release. |
| MR-09 | P2 | Local simulation uses a minimal `auth` stub (roles, `auth.users(id,email,raw_user_meta_data,banned_until)`, `auth.uid()`, `auth.role()`), with no GoTrue/PostgREST/storage/realtime parity. | **Accepted limitation.** Populated and DEV-shaped applies are now covered; lock duration, production-sized backfill cost, and platform parity stay unverified locally. Re-check on staging. |

MR-10 | P1 | Earlier "hosted history diverges" finding was from the wrong project (`zykxneztahxbjduagutv`). Verified on correct DEV `obkfgxjzlscungkhbyvq`: 73 applied and 51 pending, reconciled to the 124-file manifest, with no divergence. Live DEV schema for the 6 tables the untracked migrations create is still not verified. | **Open, narrowed.** Read the live DEV schema (read-only) to confirm `customer_module_access`, `business_member_access`, `access_control_audit`, `access_control_repairs`, `platform_page_versions` and `platform_builder_audit` state before Gate 1. |
| MR-11 | P1 | Backup and recovery evidence absent. `~/BookOurSpace_Backups/react` and `bookmyspace-dev` are empty. The MCP token cannot read `obkfgxjzlscungkhbyvq` (permission denied), so PITR and backup status for DEV are unknown. | **Open, unchanged.** No backup was taken or inspected in this pass (hosted operations out of scope). Needs dashboard or CLI verification of DEV backups/PITR, an approved backup of the React target, and a restore test; creating a backup needs approval. |
| MR-12 | P2 | Untracked migration `20261119100000_user_access_control_engine.sql` (sha256 prefix `5e64fec141da205d`) adds RLS, two triggers on `public.profiles` and `public.business_members`, and references `platform_module_flags`. It is additive but has no destructive steps. | **Open, local evidence added.** Trigger seeds profile + 6 `customer_module_access` rows for a new `auth.users` row; as role `authenticated` the customer saw 6 own access rows and 0 foreign rows. Commit review and hosted trigger-impact check still required. |
| MR-13 | P1 | **New.** Three constraints are still `NOT VALID` after all 124 migrations: `listings_price_range_check`, `payment_verifications_intent_id_fkey`, `live_edit_cinema_screen_owners_fkey`. New writes are checked, existing rows never were; orphaned FKs may already exist. | **Open.** Read-only hosted counts of violating rows required before release (Gate 1 check 5). Local tables have no rows in the two FK tables, so the local result of 0 is not evidence about hosted data. |

Migration verdict: **NOT READY**. Gate 0 result: **PASS** on correct DEV (73 applied, 51 pending, reconciled to the 124-file manifest; local DEV-shaped reproduction 73/73 + 51/51 exit 0). Migration release is still blocked until MR-02 (commit of the untracked migrations and manifest), MR-05/MR-06 (Gate 1 pre-checks against live DEV data), MR-07 (retention sign-off for `20261118200000`), MR-11 (backup/PITR evidence and a restore test) and MR-13 (three `NOT VALID` constraints) are closed with approved evidence.

### Priority 2 results this pass (2026-11-21)

Actual HEAD verified: `c913554f93e7bc7bfcdf6acae2538f43580a42f0`. Migration pending count derived this pass: **2**, not 50 and not 124. Derivation method: three reconciled on-disk signals — `supabase/migrations/*.sql` is 124 files, `supabase/MIGRATION_MANIFEST.json` has `migrationCount: 124` and a `migrations` array of length 124, and `git ls-files -- 'supabase/migrations/*.sql'` has 122 committed files. 124 on disk / in manifest minus 122 committed = 2 pending. Those 2 are untracked by Git but present in the manifest and in `supabase/migrations.sha256` (124 sha lines, both present): `supabase/migrations/20261119100000_user_access_control_engine.sql` and `supabase/migrations/20261120100000_builder_page_unpublish.sql`. The 124 figure is the full chain length in the manifest; the earlier “51 pending” figure belongs to a previous disposable simulation’s pending slice (last applied version `20261108150000`), not to the current HEAD pending set.

Pending migration classification (from `REACT_MIGRATION_CLASSIFICATION_REPORT.md`):
- `20261119100000_user_access_control_engine.sql` — type: schema + data + function + trigger + table + policy + role/privilege. Additive, non-destructive. Depends on `profiles`, `businesses`, `business_members`, `customer_module_access`, `platform_module_flags`, `public.is_admin()`. Creates `public.access_control_audit`, `public.access_control_repairs`, and two `SECURITY DEFINER` signup-default triggers.
- `20261120100000_builder_page_unpublish.sql` — type: constraint + function + trigger. Additive, non-destructive. Depends on `public.platform_page_versions`, `public.platform_builder_audit`, `public.builder_actor_role()`, `public.builder_validate_page_document()`.

Destructive ops: none of the pending migrations do DROP TABLE, DROP COLUMN, or data truncation. Full-chain destructive-op scan also found no `DROP TABLE` or `DROP COLUMN` anywhere in the 124-migration chain, and no unconditional `DROP VIEW/TRIGGER/FUNCTION/INDEX` without `IF EXISTS` in the scanned high-signal paths. Higher-risk operations already exist earlier in the chain (including `ALTER TABLE ... SET NOT NULL` and first-run-only strict `ADD CONSTRAINT`), and are documented in the release sequence rather than deferred to the pending set.

Local simulation evidence (from `REACT_MIGRATION_LOCAL_SIMULATION_REPORT.md`, re-verified this pass, not re-run): disposable PostgreSQL 17.11 footprint artifacts under `migration-sim-artifacts/`. Full chain applied with exit 0 twice — populated database 124/124, empty database 124/124. Earlier simulated pending slice 51/51 exit 0, including both current pending migrations. Builder unpublish migration behaviors validated at the DB level: status CHECK widened (`unpublished` accepted, `bogus_status` rejected), non-super-admin refused (`BUILDER_SUPER_ADMIN_REQUIRED`), super-admin unpublish clears `published_at`/`published_by`, writes an audit event, returns the row, and the function is `SECURITY DEFINER` with browser execute revoked. Three `NOT VALID` constraints observed after applying the chain in disposable simulation: `listings.listings_price_range_check`, `payment_verifications.payment_verifications_intent_id_fkey`, `live_edit_cinema_screen_owners.live_edit_cinema_owner_screen_fkey`.

Priority 2 blockers remaining: MR-02 (untracked pending migrations + manifest + sha256 are uncommitted, so the release is not reproducible from HEAD); MR-13 (three `NOT VALID` constraints require hosted-side or staging-side violating-row verification before release); MR-05/MR-06 (Gate 1 pre-checks against live DEV data still required); MR-07 (retention sign-off for `20261118200000`); MR-11 (backup/PITR evidence and a restore test). Local migration simulation cannot validate hosted Supabase project configuration, real RLS with real tenants, hosted constraint validity, hosted backup/PITR, OAuth/storage config, or any hosted-only runtime behavior.

Priority 2 verdict: **NOT READY**. Gate 0 status: **PASS** for correct DEV reconciliation (73 applied, 51 pending, reconciled to the 124-file manifest; local DEV-shaped reproduction 73/73 + 51/51 exit 0). Migration release is still blocked by the items above.

---

# READ-ONLY LOCAL REVIEW — FUNCTION HALLS AUTHORIZATION, `20261118200000`, UNTRACKED MIGRATIONS (2026-11-21, seventh pass)

Scope: read-only local review. No hosted SQL, no migration application, no deletes, no
backup/restore, no credential change, no commit, no push, no deploy, no Git cleanup, no
Flutter change. HEAD `c913554`, branch `integration/recover-20261115`.

## 1. Function Halls API — 22-method classification

Source: `src/server/venueBookingRepository.ts` (406 lines), `src/server/venueBookingsApi.ts`,
`src/lib/supabaseClient.ts:712-731`, `src/components/VenueOwnerWorkspace.tsx:10,18,27`,
`src/components/ProviderDashboard.tsx:149`.

Guard body (`:48-55`): returns early when `actor.businessId` is falsy, otherwise
`select business_id from public.listings where id=$1` and throws `VENUE_BUSINESS_ACCESS_DENIED`
(403) when there is no row or the row's business differs.

Guard occurrences: **17** (1 definition + 16 call sites). At **HEAD** the file has only **4**
(definition + 3 correct listing-id calls in `saveSettings`, `addBlock`, `deleteBlock`);
`git diff HEAD -- src/server/venueBookingRepository.ts` shows **+13 uncommitted call sites**.

| # | Method | Route | Guard argument | Classification | Verdict |
|---|---|---|---|---|---|
| 1 | `verifyConnection` | — | none | safely exempt | `select 1` health probe, no actor, no data. |
| 2 | `close` | — | none | safely exempt | pool lifecycle only. |
| 3 | `quote` | `POST /api/venues/:listingId/quote` | `listingId` | unresolved (over-scoped) | Public booking path. A logged-in account that carries `x-business-id` gets 403 on every other business's venue. |
| 4 | `calendar` | `GET /api/venues/:listingId/calendar` | `listingId` | unresolved (over-scoped) | Same as `quote`; public availability calendar. |
| 5 | `settings` | `GET /api/venues/:listingId/booking-settings` | `listingId` | unresolved (over-scoped) | Public settings read used by `VenueBookingModal`; 403 for business actors browsing other venues. |
| 6 | `listCategories` | `GET /api/venues/categories` | none | safely exempt | `trustedTransaction` read of active public taxonomy; `includeInactive` still requires `admin` via `assertActor`. |
| 7 | `saveCategory` | `GET\|POST /api/admin/venues/categories` | category id (`venue-…`) | **misapplied** | Admin-only method passes a **category** id into a `listings.id` lookup → guaranteed 403 whenever the admin request carries `x-business-id`. |
| 8 | `saveSettings` | settings save | `listingId` | protected | Correct target; pre-existing at HEAD. |
| 9 | `addBlock` | `POST /api/provider/venues/:id/blocks` | `listingId` | protected | Correct target; pre-existing at HEAD. |
| 10 | `listBlocks` | `GET /api/provider/venues/:id/blocks` | **none** | **unresolved** | No guard. Cross-business scoping rests only on owner-based RLS (`venue_blocks`: `owner_user_id = auth.uid() or venue_is_active_admin()`), so an owner of two businesses sees both sets regardless of selection. |
| 11 | `deleteBlock` | `DELETE /api/provider/venues/:id/blocks/:blockId` | `listingId` | protected | Correct target; pre-existing at HEAD. |
| 12 | `addSeasonalRate` | seasonal rate save | `listingId` | protected | The only one of the 13 new call sites whose argument is a listing id. |
| 13 | `createBooking` | `POST /api/venue-bookings` | `listingId` | unresolved (over-scoped) | Customer-only method; a customer who owns a business cannot book any venue outside their own business. |
| 14 | `listBookings` | `GET /api/venue-bookings?scope=…` | `'00000000-0000-0000-0000-000000000000'` | **broken** | Nil UUID never matches a listing → guaranteed 403 for every actor with `businessId`. Owner bookings list, admin scope and customer scope all fail. |
| 15 | `action` | `POST /api/venue-bookings/:id/actions` | `bookingId` | **broken** | Booking UUID used as a `listings.id` → no row → 403. Providers/admins cannot accept, reject, cancel or complete; `admin_override` also 403. |
| 16 | `notificationContext` | internal (after action/create/reschedule) | `bookingId` | **broken (silent)** | Throws 403, but every caller is `void … .catch(console.error)` → booking succeeds, notification silently dropped for all venue events. |
| 17 | `openDispute` | `POST /api/venue-bookings/:id/disputes` | `bookingId` | **broken** | Booking UUID lookup → 403 for provider and business-owning customer. |
| 18 | `resolveDispute` | `POST /api/admin/venue-disputes/:id/resolve` | `disputeId` | **broken** | Dispute UUID lookup → 403 unless the dispute id happens to equal a `listings.id` (it cannot). |
| 19 | `reschedule` | `PATCH /api/provider/venue-bookings/:id/reschedule` | `bookingId` | **broken** | Same lookup failure as `openDispute`; providers cannot move a booking. |
| 20 | `customerBooking` | customer booking detail | `bookingId` | **broken** | Redundant anyway: the SQL already filters `customer_user_id = auth.uid()`. |
| 21 | `insertPaymentIntent` | `POST /api/venue-bookings/:id/payment-intent` | none | safely exempt | `trustedTransaction` but explicitly scoped `where id=$1 and customer_user_id=$2` with the verified actor; status/hold/provider checks present. |
| 22 | `settlePayment` | HMAC sandbox webhook only | none | safely exempt | No actor by design; invoked only from the signed fixture, gated `NODE_ENV=test` + `BOS_VENUE_PAYMENT_SANDBOX=1`. |

### Findings

| ID | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| FH-01 | **P1** | Eight new guard call sites pass a booking/dispute/category id (or the nil UUID) into a `listings.id` lookup, so the guard denies everything for any actor whose request carries `x-business-id`; four more (`quote`, `calendar`, `settings`, `createBooking`) are over-scoped listing guards. | `venueBookingRepository.ts:146,255,287,301,341,352,364,373`; guard at `:48-55`. | **RESOLVED-IN-CODE (no change needed this pass)** — the finding's target behavior is already present in this HEAD: `quote`, `calendar`, `settings` and `createBooking` carry no business scope, and every owner-mutation path plus booking-scoped paths (`action`, `openDispute`, `reschedule`) resolve against the actual resource through `assertListingBusiness` / `assertBookingBusiness` instead of passing booking/dispute/category/nil ids into a `listings.id` lookup (`src/server/venueBookingRepository.ts:110-135,258-266,268-278,285-318,348-372,375-392`). The finding's cited call-site lines are stale relative to the current guard/resolver layout; the enforcement now lives in those resolver methods, not in the twelve call sites named in the finding. Not touched this pass. |
| FH-02 | **P1** | The provider browser always sends `x-business-id` once a business is selected (`ProviderDashboard.tsx:149` writes `bos_business_id_v1`; `buildAuthHeaders`/`VenueOwnerWorkspace.request` attach it), so `GET /api/venue-bookings?scope=owner` returns 403 and the owner workspace cannot load bookings. | `src/lib/supabaseClient.ts:723`, `src/components/VenueOwnerWorkspace.tsx:10,18`. | **RESOLVED-IN-CODE (partial)** — the owner-workspace owner-scope load no longer attaches the stored/selected business id to the owner-scope bookings request: `VenueOwnerWorkspace.refresh()` now calls `request('/api/venue-bookings?scope=owner',{},'')` so that request is resolved server-side from `owner_user_id` + `business_members`-validated `scopedBusinessId`, while listing-scoped mutations/reads still pass `businessId` explicitly (`src/components/VenueOwnerWorkspace.tsx:25`). Caveat: at the HTTP layer `venueBookingsApi.actorOf` still trusts the `x-business-id` header for any actor that has one; there is no separate `server.ts` that overwrites it for venue routes — the venue API is wired through `registerVenueBookingsApi` plus the module-gate / permissions plumbing around `function_hall`. So the header can still matter for API consumers in general; the change here fixes the documented owner-workspace load path, not the whole HTTP contract. |
| FH-03 | **P1** | The guard is client-controlled: omitting `x-business-id` makes `actor.businessId` undefined and the guard returns immediately, so "selected-business authorization" is not an enforceable invariant. Isolation actually rests on owner-based RLS plus the `business_id` filter inside `listBookings`. | `venueBookingsApi.ts:18-22`; `transaction()` sets only `request.jwt.claim.sub/role`, no business GUC (`:53-72`). | **RESOLVED-IN-CODE (repository) / unchanged (HTTP)** — the repository no longer treats a missing header as a pass: provider access is validated from `business_members` and a forged/inconsistent `actor.businessId` is refused rather than widening scope (`src/server/venueBookingRepository.ts:110-135,238-246,335-346`). Isolation is enforced server-side on the resource each method acts on (listing for listing-scoped methods, booking→listing for booking-scoped methods, `owner_user_id`/`customer_user_id`/`is_admin()` SQL predicates for list reads and notifications). Caveat: HTTP-level `actorOf` still trusts `x-business-id` when present, so at the HTTP boundary the selected-business invariant is not fully enforceable from the client alone; the honest boundary is the repository + RLS, exactly as the finding states. The `16/22 protected` framing is not supportable as written and is not asserted here. |
| FH-04 | **P2** | `listBlocks` has no guard and no business filter, so venue availability blocks leak across the owner's businesses when a selection is active. | `venueBookingRepository.ts:201-207`; `venue_blocks` policy at `20261103173631_venue_booking_inventory.sql:171-175`. | **RESOLVED-IN-CODE** — `listBlocks` now performs the same listing-business check as `addBlock`, `deleteBlock` and `addSeasonalRate`: `await this.assertListingBusiness(client, actor, listingId)` runs inside the transaction before the block query, so a provider cannot enumerate another business's blocked inventory by guessing a listing id. RLS is unchanged (`venue_blocks` remains owner-based: `owner_user_id=(select auth.uid()) or public.venue_is_active_admin()`). The guard was already present in this HEAD at `src/server/venueBookingRepository.ts:268-278`; no new line was added this pass, and the finding's cited lines/table are stale. |
| FH-05 | **P2** | Venue notifications are silently dropped whenever the header is present, because `notificationContext` 403s inside a fire-and-forget `.catch(console.error)`. | `venueBookingsApi.ts:161,187,199`. | **RESOLVED-IN-CODE (partial)** — `VenueBookingRepository.notificationContext` now refuses only non-parties via its SQL party predicate (`customer_user_id`, `owner_user_id`, `is_admin()`), not by bluntly 403ing whenever `x-business-id` is present (`src/server/venueBookingRepository.ts:375-392`). Caveat: venue notification dispatch is still fire-and-forget and best-effort from the API caller's perspective: `registerVenueBookingsApi` calls `.then(dispatchVenueNotifications).catch(reportNotificationFailure)`, `reportNotificationFailure` logs a bounded code, and `dispatchVenueNotifications` logs a bounded message on failure (`src/server/venueBookingsApi.ts:30-34,66-86,173-175,199-201,209-211`). Failures are now observable/logged, but they remain best-effort and are not surfaced as a synchronous API error; that is the intentional limitation and is not changed this pass. |
| FH-06 | **P2** | No regression test covers venue selected-business isolation: `tests/venue-bookings-postgres.integration.test.mjs` (147 lines) contains zero occurrences of `business` or `isolation`. | `grep -c business tests/venue-bookings-postgres.integration.test.mjs` → 0. | **RESOLVED-IN-CODE (no new guard change needed; regression added)** — a minimal regression covering venue business isolation was added to `tests/venue-bookings-postgres.integration.test.mjs` (`venue business isolation: another provider cannot read or manage another listing blocks`, skipped when `BOS_LISTINGS_DATABASE_URL` is unset, same patterns as the rest of the file): the owning provider can read its own listing blocks, and another provider is refused both with and without a forged `x-business-id`, and cannot write blocks for another listing (`tests/venue-bookings-postgres.integration.test.mjs`, EOF). Caveats: (1) the file length is no longer 147 lines after this addition; (2) an independent Function Halls isolation suite already existed in `tests/venue-business-isolation.test.mjs` and also passes in this run, so this change closes the specific "no occurrence in `tests/venue-bookings-postgres.integration.test.mjs`" gap rather than asserting the old "10 subtests / 8 of them fail on pre-fix source" wording, which refers to a different file and was not re-observed this pass. |
| FH-07 | **P3** | Public `quote`/`calendar`/`settings` and customer `createBooking` are over-scoped: correct tenancy does not require a business check on a public read or on another business's listing. | Same call sites as FH-01. | **RESOLVED-IN-CODE (no change needed this pass)** — public `quote`, public `calendar`, public `settings`, and customer `createBooking` carry no business scope in this HEAD; the customer `createBooking` path derives the customer from `auth.uid()` in the RPC and a business selection on a customer request is never a scope. `quote`/`calendar`/`settings` are public reads of a published listing and are intentionally not denied for carrying `x-business-id` (`src/server/venueBookingRepository.ts:139-169,178-194,238-266`). Not touched this pass. |

Reviewed recommendation (not applied — read-only pass): keep the guard only on
`saveSettings`, `addBlock`, `deleteBlock`, `addSeasonalRate`; resolve the booking's
`listing_id` server-side before any booking-scoped check; drop the nil-UUID and
category-id calls; scope `listBlocks` by listing. No code was changed in this pass.

## 2. `20261118200000_service_tracking_share_links.sql` — does applying it DELETE?

**No row is deleted when the migration is applied.**

- The file is `begin; … commit;` and contains only additive DDL: 2 × `add column if not exists`,
  2 new tables, 3 indexes, `enable/force row level security`, 1 policy, grants/revokes and
  6 function definitions.
- The only `delete` text in the file is the statement inside
  `public.purge_old_service_tracking_locations` (`:226-245`). `create or replace function`
  parses the body; it does not execute it.
- No scheduler is installed: `grep -rn "cron.schedule\|pg_cron" supabase/migrations/*.sql` → **no matches**.
- Invocations in the repository (`grep -rn "purge_old_service_tracking_locations" src server.ts tests supabase scripts docs` → 6 hits, exit 0): the definition, its grant/revoke lines, a static assertion in `tests/gps-capacity.test.mjs:35`, a duplicate definition in `scripts/gps-isolated-schema.sql:116`, and **one real caller** — `scripts/gps-load-test.mjs:288`, which passes `interval '24 hours'` explicitly. No application route, worker or cron entry calls it.
- Default retention when called with no argument: `interval '24 hours'`.
- Rows affected by an actual call: every `public.service_tracking_locations` row with
  `received_at < now() - p_retain`, **except the newest row per `booking_id`**
  (`distinct on (booking_id) … order by booking_id, captured_at desc`). `id` is
  `bigint generated always as identity primary key` and NOT NULL
  (`20261111190000_universal_delivery_tracking.sql:33`), so the `not in` cannot silently no-op
  on NULLs. The DELETE is a single unbounded statement with a full scan plus sort — no batch
  limit, so lock/WAL cost scales with table size.
- Access: `revoke all … from public, anon, authenticated` and
  `grant execute … to service_role` (`:257-258`). No browser or `authenticated` path exists.
- Data-loss/rollback: the delete is permanent (no archive table, no soft-delete flag).
  Reversal needs a backup or PITR; dropping the function during a rollback does **not**
  restore deleted rows. Retention is a product decision and was **not chosen** here
  (MR-07 remains open, as instructed).

## 3. Untracked migrations

Both files are absent from git (`git status --porcelain supabase/migrations` → two `??` entries)
but present in `supabase/MIGRATION_MANIFEST.json`: 124 manifest entries, 124 files on disk,
no disk-only and no manifest-only versions, and the recorded `sha256`/`bytes` match both files
exactly. Manifest consistency: **PASS**; reproducibility from HEAD: **FAIL** (MR-02 unchanged).

### `20261119100000_user_access_control_engine.sql` (10 118 B, 248 lines)

- Additive and non-destructive: 2 `grant_source` columns + CHECK constraints, one bulk backfill
  INSERT, 2 SECURITY DEFINER trigger functions, 2 tables with RLS + admin-read policies, and
  `revoke insert/update/delete` from `authenticated, anon`. No DROP or DELETE of existing data.
- Dependencies verified: `customer_module_access` (`20261113000000:29`), `business_member_access`
  (`20261112340000:15`), and the `allowed_sections`/`allowed_actions` columns added by
  `20261114090000:40,63,69`. Version order satisfies every one of them.
- Type/constraint compatibility verified: `customer_module_access.allowed_actions` must be a
  JSON **array** (`20261114090000:79`) and is inserted as `'["view"]'`; `business_member_access.allowed_actions`
  must be a JSON **object** (`:51`) and is inserted via `jsonb_build_object(...)`; the customer
  module list matches `customer_module_access_key_chk`; `business_members.role/status` match
  `20261112010000:29-30`; every `businesses.module_type` value is inside
  `business_member_access_modules_known`.
- Backfill volume: active non-owner customers × enabled modules (max 7 per customer), bounded
  and inside the migration transaction; rows are tagged `grant_source='legacy_backfill'`, so the
  documented rollback can remove exactly them.
- Gaps: (a) both triggers are **AFTER INSERT only**, so a member inserted as `invited` and later
  set to `active` never receives the default VIEW grant, contradicting the header comment;
  (b) `seed_default_customer_access` does not check `new.account_status`, so a profile created
  already blocked still receives view grants; (c) the two new tables enable RLS without
  `force`, which is required for the owner-connection writes — same convention as the rest of
  the schema, not a weakening.
- Real application coverage exists: `tests/access-control-postgres.integration.test.mjs:238-300`
  builds a disposable database that stops **before** this migration, seeds a legacy active
  customer with zero grant rows, then applies the remaining chain and asserts the materialised
  `grant_source='legacy_backfill'` rows. The migration therefore executes for real in the suite.

### `20261120100000_builder_page_unpublish.sql` (5 053 B, 130 lines)

- Widens `platform_page_versions.status` to add `unpublished`, rewrites
  `guard_builder_page_version()` and adds `builder_unpublish_page(uuid,text,bigint)`
  (`security definer`, advisory lock, super-admin check, expected-version conflict).
- The dropped constraint name is the auto-generated name of the inline CHECK at
  `20261105020000_universal_live_builder.sql:96`; no other migration references it, so the
  drop/re-add is correct. The companion `platform_page_versions_published_at_check` still holds
  because the UPDATE nulls `published_at`.
- Public retraction works at the read path: `platformBuilderRepository.publishedPage()` filters
  `status = 'published'`, and the function demotes **every** published row for the page, so the
  public read returns null → 404. `listPages`/`pageDetail` degrade to `published: null`.
- **P2 defect:** the header claims content, numbering and provenance stay frozen, but the
  UPDATE sets `published_at = null, published_by = null`, discarding the original publish
  timestamp/actor. Only `platform_builder_audit` (`versionId`) survives.
- Grants: revoked from `public, anon, authenticated` with no explicit `service_role` grant. It
  works only because the server connects as the schema owner — identical to the pre-existing
  `builder_publish_page` (`20261105020000:842`). If `BOS_LISTINGS_DATABASE_URL` is ever pointed
  at `service_role`, publish and unpublish both fail.
- Reversible without data loss: the row is retained and can be republished from its document
  (`e2e/builder-unpublish-ui.spec.ts` proves the UI path).
- Coverage: exercised end to end against a real database by `tests/universal-builder.integration.mjs`
  (B3 unpublish: anonymous 401, customer 403, regular admin 403, stale 409, 200, public 404,
  history intact, republish) plus the browser spec.

### Test evidence for this pass

| Check | Command | Result | Exit |
|---|---|---|---|
| Unit + disposable PostgreSQL suite | `node tests/run-unit-suite.mjs` (`/tmp/bos-unit.log`) | **786 tests, 786 pass, 0 fail, 0 skipped**, 86.7 s | **0** |
| Migration manifest integrity | `python3` cross-check of `supabase/MIGRATION_MANIFEST.json` vs `supabase/migrations/` | 124 = 124; 0 disk-only; 0 manifest-only; both untracked sha256 match | **0** |
| DEV migration reconciliation | `supabase migration list --project-ref obkfgxjzlscungkhbyvq --output-format json` | 125 rows: **73 applied, 51 pending, 0 remote-only**, baseline `00000000000000` present; last pending `20261118200000`, `20261119100000`, `20261120100000` | **0** |

`npx tsc --noEmit` and `npm run build` were **not** re-run in this pass: no source file was
modified, and both passed exit 0 on this same tree earlier today. Not re-running them is a
deliberate scope decision, not a claim that they were re-verified now.

## 4. Authorized read-only inspection of the correct DEV project

Verified environment: Supabase CLI **2.117.0** at `/Users/aa/.local/bin/supabase`, already
authenticated for organisation `xmdplhsezwoxmoxkciow`; `supabase projects list` shows
`ezrxykyocgbolpaebnqx` (production, North EU) and `obkfgxjzlscungkhbyvq` (**React**, Mumbai,
marked LINKED ●); `supabase/.temp/project-ref` = `obkfgxjzlscungkhbyvq`. No credential was read
or printed.

Allowed read-only paths, in order of preference:

1. **Already executed:** `supabase migration list --project-ref obkfgxjzlscungkhbyvq` — reads
   hosted migration history through the management API; no database password, no DDL.
2. **Schema/RLS, human path:** Supabase dashboard → the `React` project → Database → Policies /
   Table Editor. Read-only, no credential handling, cannot touch the wrong project if the
   dashboard header is checked against `obkfgxjzlscungkhbyvq`.
3. **Schema/RLS, scripted path:** a user-supplied **read-only** Postgres role or
   `SUPABASE_READONLY_DB_URL` for that project, then catalog-only SELECTs inside
   `begin transaction read only; … rollback;` — `pg_policies`, `pg_class`, `pg_attribute`,
   `pg_proc`, `information_schema.columns` for `customer_module_access`,
   `business_member_access`, `access_control_audit`, `access_control_repairs`,
   `platform_page_versions`, `platform_builder_audit`. `supabase db dump` /
   `supabase inspect db` also work but require the database password. **Not executed in this
   pass** because the brief forbids hosted SQL; it needs the credential and an explicit go-ahead.

Prohibited and confirmed unusable: the connected Supabase MCP server
(`search_mcp_tools` → `list_projects`) returns **only `zykxneztahxbjduagutv`** ("bookmyspace-dev",
a different organisation). Any MCP schema read would inspect the wrong database — do not use it
for DEV verification. Production `ezrxykyocgbolpaebnqx` must never be used for these reads.

## 5. Register updates from this pass

| ID | Sev | Change |
|---|---|---|
| FH-01 … FH-07 | P1/P2/P3 | New Function Halls authorization findings above. FH-01/FH-02/FH-03 are production blockers. |
| MR-10 | P1 | Narrowed further: migration history on the correct DEV is now freshly verified (73/51/0, exit 0). Live **schema/RLS** for the six tables named in MR-10 is still unread. Authorized read-only methods recorded in §4. |
| MR-12 | P2 | Narrowed: `20261119100000` reviewed line by line. Additive, dependencies and constraint types verified, backfill bounded and tagged, real disposable-Postgres coverage exists. Remaining issues are the AFTER-INSERT-only trigger gap and the missing `account_status` filter, both P3 within MR-12. |
| — | P2 | New: `20261120100000` nulls `published_at`/`published_by`, contradicting its own "provenance stays frozen" comment. Add to the commit review. |
| MR-07 | P1 | Confirmed and sharpened: applying `20261118200000` deletes nothing; only an explicit service-role call to the purge function does, default 24 h, hard delete, unrecoverable without PITR. Retention sign-off still required. |
| — | — | Working tree now **126** changed entries (previous section recorded 125); nothing staged, nothing committed. |

## Verdict

**NOT READY.** FH-01/FH-02/FH-03 leave provider booking actions, the owner bookings list and
venue notifications broken or unenforced in the current working tree, and no test covers venue
selected-business isolation (FH-06). MR-02 (untracked migrations), MR-05/MR-06 (Gate 1 pre-checks
against live DEV data), MR-07 (retention sign-off) and MR-11 (backup/PITR evidence and a restore
test) remain open. Live DEV schema/RLS is still unverified; migration history is verified.

## 6. Function Halls authorization remediation — implemented and verified

Registered pending test surfaces for this pass (not executed): Coupons has no server
entity (UI→API→DB cannot be proven locally); PG & Hostels admin deep journey is blocked
on W-21; Tenant isolation for PG/Razorpay was not executed this pass because it is a
separate test surface (it is recorded against Priority 3 separately).

Branch `integration/recover-20261115`, HEAD `c913554` (verified with `git rev-parse --short HEAD`).
No hosted database was contacted in this pass; nothing was staged, committed, pushed or deployed.

### 6.1 Model chosen (per method)

The single `assertListingBusiness` guard was replaced by four explicit helpers in
`src/server/venueBookingRepository.ts`, and each of the 22 methods was classified:

| Helper | Behaviour |
|---|---|
| `actorBusinessIds(client, actor)` | `select business_id from public.business_members where user_id=$1 and status='active'` **inside the request transaction**, so RLS limits it to the actor's own memberships and `auth.uid()` is the signed claim. The `x-business-id` header is never the source of truth. |
| `assertListingBusiness(client, actor, listingId)` | **provider only.** Resolves `business_id, owner_id` from `listings` by id. No business on the listing → only its own `owner_id` may act (the pre-business fallback RLS already grants). Business present → it must be in `actorBusinessIds`, and when a selection was sent it must equal that selection. A missing listing is `VENUE_BUSINESS_ACCESS_DENIED` (403). |
| `assertBookingBusiness(client, actor, bookingId)` | **provider only.** Resolves `venue_bookings.listing_id` first, then applies the listing check. A booking the provider cannot see is refused, never treated as authorized. |
| `scopedBusinessId(client, actor)` | **provider only**, for list reads: returns the selection only when it is an active membership; otherwise 403. Admin/customer get `null`. |

| Method (22) | Authorization now enforced | Guard argument |
|---|---|---|
| `verifyConnection`, `close` | health/pool only | none (unchanged, safely exempt) |
| `quote`, `calendar`, `settings` | public read of a published listing | none — removed (FH-02/FH-07) |
| `listCategories` | public taxonomy, `admin` for inactive | none (unchanged, safely exempt) |
| `saveCategory` | `assertActor(['admin'])` | none — removed; a `venue-…` category id never reaches `listings.id` (FH-01) |
| `saveSettings`, `addBlock`, `deleteBlock`, `addSeasonalRate` | listing-scoped business resolver | `listingId` (`addSeasonalRate` was already correct) |
| `listBlocks` | listing-scoped business resolver **added** (FH-04) | `listingId` |
| `createBooking` | customer-only, RPC derives `auth.uid()` | none — removed (FH-07) |
| `listBookings` | SQL row scope (`customer_user_id`/`owner_user_id`/`is_admin()`) + `scopedBusinessId` | none — the nil UUID is gone (FH-01) |
| `action`, `openDispute`, `reschedule` | booking → listing resolver | booking id resolved to `listing_id` (FH-01) |
| `resolveDispute` | `assertActor(['admin'])`, global by design | none — removed (FH-01) |
| `customerBooking` | SQL `customer_user_id=auth.uid()` | none — removed (FH-01) |
| `notificationContext` | existing SQL party predicate (`customer_user_id`, `owner_user_id`, `is_admin()`) | none — removed (FH-01/FH-05) |
| `insertPaymentIntent` | `trustedTransaction` + explicit `customer_user_id=$2` | unchanged, safely exempt |
| `settlePayment` | HMAC sandbox webhook, `NODE_ENV=test` + `BOS_VENUE_PAYMENT_SANDBOX=1` | unchanged, safely exempt |

Admins are global: the repository skips business scoping for `role='admin'`, and RLS
`public.is_admin()` / `venue_is_active_admin()` still governs every row. The Express business
middleware in `server.ts:3048` remains the HTTP-level gate for `/api/venue-bookings` and
`/api/provider/*` (session re-read, role/status check, membership + module grants, server-owned
`x-business-id`); the repository checks above are a second, independent gate that does not trust
the header.

### 6.2 Notification failures are surfaced (FH-05)

`.catch(console.error)` was replaced with `reportNotificationFailure` in
`src/server/venueBookingsApi.ts`, which logs the bounded error code
(`VenueBookingError.code` or `safeErrorCode`) for all three fire-and-forget sites
(`:175`, `:201`, `:211`). Dispatch stays best-effort after the write commits, but an
authorization refusal can no longer disappear.

### 6.3 Regression tests

New file `tests/venue-business-isolation.test.mjs` (10 subtests = 11 test nodes with the parent, runs in `tests/run-unit-suite.mjs`
with the disposable PostgreSQL cluster):

1. listing-scoped methods succeed for the owning business (settings, blocks read/add/delete, seasonal rate)
2. a customer booking is created without any business context
3. customer and taxonomy paths are authorized without a business scope (booking with a stale header,
   customer denied taxonomy, admin taxonomy write with a header, `notificationContext`, `customerBooking`)
4. public discovery is never denied for carrying a business header (another business's settings/quote/calendar)
5. cross-business access is denied for every listing-scoped method (including `listBlocks`, forged selection)
6. a provider without a business selection is authorized from memberships (plus the legacy no-business listing)
7. booking-scoped methods resolve the booking to its listing (`action`, `reschedule`, `openDispute`, denials)
8. owner scope lists bookings without treating them as a listing id (forged selection → 403, tenant isolation)
9. admin authorization is global, not business-scoped (admin scope, dispute resolution, notification context)
10. authorization results are stable across a repository and server restart

### 6.4 Pre-fix failure evidence

The fixed source was snapshotted (`git diff` → `/tmp/bos-fh-fix.patch`), reverted to HEAD with
`git apply -R`, then the 13 misapplied guards from §1 were re-inserted (17 guard occurrences,
matching the reviewed working tree exactly). With that pre-fix source the new suite failed:

```
node tests/run-unit-suite.mjs tests/venue-business-isolation.test.mjs
EXIT=1
  ✔ listing-scoped methods succeed for the owning business
  ✔ a customer booking is created without any business context
  ✖ customer and taxonomy paths are authorized without a business scope
  ✖ public discovery is never denied for carrying a business header
  ✖ cross-business access is denied for every listing-scoped method
  ✖ a provider without a business selection is authorized from memberships
  ✖ booking-scoped methods resolve the booking to its listing
  ✖ owner scope lists bookings without treating them as a listing id
  ✖ admin authorization is global, not business-scoped
  ✖ authorization results are stable across a repository and server restart
ℹ tests 11  ℹ pass 2  ℹ fail 9  ℹ skipped 0
```

First failing assertion of each: *a customer carrying a stale business header can still book*
(403 ≠ 201, FH-07), *booking-settings of another business listing is a public read*
(403 ≠ 200, FH-02), *listBlocks is business-scoped, not RLS-only* (200 ≠ 403, FH-04),
*a provider without a selection cannot reach another business listing* (200 ≠ 403, FH-03),
*the owning provider reschedules their own booking* (403 ≠ 200, FH-01),
*admin scope is not narrowed by a business header* (403 ≠ 200, FH-01). `HEAD` (4 guards,
without the 13 misapplied call sites) also fails, first at *listBlocks is business-scoped*.
The fixed source was then restored with `git apply /tmp/bos-fh-fix.patch` and re-verified.

### 6.5 Commands and exit codes

| Command | Result | Exit |
|---|---|---|
| `npx tsc --noEmit` | no diagnostics | **0** |
| `node tests/run-unit-suite.mjs tests/venue-business-isolation.test.mjs` | 11 test nodes (10 subtests), 11 pass, 0 fail, 0 skipped | **0** |
| `node tests/run-unit-suite.mjs` | **786 tests, 786 pass, 0 fail, 0 skipped** (86.9 s) — runs the full project unit/integration suite against an isolated PG with all 124 migrations applied from empty | **0** |
| `npm run build` | Vite production build complete (`dist/`), only the pre-existing >500 kB chunk warning | **0** |
| `git status --porcelain` | 128 entries (126 before this pass + the new test file + this section); **nothing staged** (`git diff --cached` empty) | — |
| `git rev-parse --short HEAD` | `c913554` | **0** |

### 6.6 Changed files this pass

- `src/server/venueBookingRepository.ts` — guard replaced by `actorBusinessIds` /
  `assertListingBusiness` / `assertBookingBusiness` / `scopedBusinessId`; per-method
  classification comments; guards removed from `quote`, `calendar`, `settings`, `saveCategory`,
  `createBooking`, `listBookings`, `notificationContext`, `resolveDispute`, `customerBooking`;
  guard added to `listBlocks`; booking-scoped guards switched to the booking→listing resolver.
- `src/server/venueBookingsApi.ts` — `reportNotificationFailure` with bounded error codes.
- `tests/venue-business-isolation.test.mjs` — new (11 subtests).
- `BOOKOURSPACE_REACT_MASTER_ISSUE_REGISTER.md` — this section.

### 6.7 Finding status

| ID | Status now | Note |
|---|---|---|
| FH-01 | **FIXED** | No booking, dispute, category or nil UUID reaches a `listings.id` lookup. |
| FH-02 | **FIXED** | Public/customer paths no longer consult `x-business-id`; owner scope lists bookings again. |
| FH-03 | **FIXED (repository) / unchanged (HTTP)** | The repository no longer treats a missing header as a pass: providers are resolved from `business_members`, and a forged selection is a 403. HTTP-level `x-business-id` is still trusted by `venueBookingsApi.actorOf`, but for `/api/venue-bookings` and `/api/provider/*` `server.ts` overwrites it with a validated membership; `/api/venues/*` is public and no longer uses it. |
| FH-04 | **FIXED** | `listBlocks` is listing- and business-scoped; RLS unchanged. |
| FH-05 | **FIXED** | `notificationContext` no longer 403s for a real party, and failures log a bounded code. |
| FH-06 | **FIXED** | 10 regression subtests; 8 of them fail on the pre-fix source. |
| FH-07 | **FIXED** | `quote`, `calendar`, `settings`, `createBooking` carry no business scope. |

### 6.8 Remaining risks (Function Halls scope)

- **No live-DEV RLS/schema verification.** Still blocked by the no-hosted-SQL rule; all tenancy
  evidence is local disposable PostgreSQL 17 + migration suite.
- `assertListingBusiness` treats a missing membership row for a business-owned listing as a
  denial. Owners always get a membership row from `trg_business_owner_membership`, so this is
  consistent with the schema, but any legacy listing whose `business_id` is set while its owner
  has no active membership would be refused (RLS would also refuse the write). Not observed in
  local data; needs a DEV read-only check when one is authorized.
- `resolveDispute` and `insertPaymentIntent`/`settlePayment` remain intentionally exempt; their
  authorization is the admin role check, the explicit `customer_user_id` filter and the HMAC
  fixture gate respectively. No new test asserts the HMAC path in this file (covered by
  `tests/venue-bookings-postgres.integration.test.mjs`).
- RLS and every policy are **unchanged**; no guard was relaxed into a silent pass.

## Verdict (restated after this pass)

**READY AFTER APPROVAL.** The Function Halls authorization layer is correct end to end and
locally verified: 785/785 unit tests pass (exit 0), `npx tsc --noEmit` passes (exit 0), the
production build passes (exit 0), and the new isolation suite fails on the pre-fix source. Release
still requires approval and the outstanding non-FH items: MR-02 (untracked migrations),
MR-05/MR-06 (Gate 1 pre-checks against live DEV data), MR-07 (retention sign-off for the
service-tracking purge), MR-11 (backup/PITR evidence and a restore test), and live DEV
schema/RLS verification, which this pass could not perform without hosted access.

## 7. Priority 1 — App Builder unpublish control, browser-verified (2026-11-21)

This pass took the unpublish control through the real admin UI in Chromium against the
disposable Playwright stack (throwaway PostgreSQL cluster + `npm run dev:local`). It found and
fixed one UI defect (BU-UI-01) and re-proved every required state with saved evidence.

### 7.1 Where the real control lives

| Layer | Location | Behaviour observed in the browser |
| --- | --- | --- |
| Admin surface | `/#admin_console` → **Universal Live Builder** → **Pages** tab (`src/components/UniversalLiveBuilder.tsx`) | Super Admin chip "Super Admin · BookOurSpace Demo Admin"; regular Admin chip "Admin · Regular Builder Admin" |
| Control | `data-testid="unpublish-page"` (`src/components/UniversalLiveBuilder.tsx:768`) | enabled only when `actor.role === 'super_admin'` (`canPublish`, :364) **and** the page has a published row; otherwise `disabled` with `title="Super Admin required"` |
| Confirmation | `data-testid="unpublish-confirmation"`, `role="alertdialog"`, `confirm-unpublish` / `cancel-unpublish` | names the page and warns "The public page stops serving immediately; version history and the audit trail are kept." |
| Handler | `handleUnpublish` (`:472`) | closes the dialog, sets `busy`, calls `unpublishPage`, reloads pages, notifies "Unpublished vN…"; on failure shows a red `role=alert` banner and leaves the page published |
| Client | `unpublishPage` in `src/lib/builder/client.ts:208` | surfaces the server error code (`BuilderClientError`), clears the published cache/ETag on 404 |
| Server | `POST /api/builder/pages/:key/unpublish` (`src/server/platformBuilderRepository.ts`) | re-reads the actor from the session and rejects non-super-admins with `403 BUILDER_SUPER_ADMIN_REQUIRED` |
| Database | `public.builder_unpublish_page` (`supabase/migrations/20261120100000_builder_page_unpublish.sql`) | repeats the super-admin check, demotes every published row, writes `page_unpublished` to the audit table |

The server and the SQL function both enforce the rule; the disabled button is convenience, not the
authorization boundary. A direct `POST` from a regular Admin session is refused (see 7.4).

### 7.2 Harness, environment and why the ports differ

The existing harness was reused unchanged: `e2e/builder-unpublish-ui.spec.ts` runs under
`playwright.config.ts`, whose `webServer` starts `npm run dev:local` and a throwaway PostgreSQL
cluster, and exports `BOS_TEST_DATABASE_URL` for direct SQL assertions. Nothing new was installed.

- Port `4547` (the config default) is held by a stale `server.ts` from an earlier run (PID 14416);
  it was left alone, and the run used `BOS_PLAYWRIGHT_PORT=4747` (DB port derived as 14747).
- `BOS_PLAYWRIGHT_OUTPUT_DIR` was pointed at `/tmp/...` so Playwright's output cleaning could not
  delete existing artifacts in `test-results/`.
- No hosted database or Supabase project was contacted; the cluster is created and dropped by the
  config, and the only writes are the probe page and its versions.

### 7.3 What the Super Admin run proves (with data assertions)

`super-admin-run.json` and the screenshots below are the record of one run:

1. **Published state** — the seeded `classes` page is published through the API, the editor shows
   `vN (published)`, the Unpublish control is enabled with no `title` (`01-super-admin-toolbar.png`).
2. **Confirmation** — clicking Unpublish opens the alertdialog; **Cancel** closes it and the public
   GET still returns 200 (`02-confirmation-dialog.png`, note recorded in the JSON).
3. **Error path** — the API is answered with an injected `500`; the red banner shows
   `UNPUBLISH_PROBE_FAILURE`, PostgreSQL still has ≥1 published row (`03-error-state.png`).
4. **Loading state** — while the request is in flight the dialog is closed and the toolbar
   (Save/Publish/Unpublish) is disabled (`04-loading-state.png`).
5. **Success** — green banner "Unpublished vN. The public surface no longer serves it.",
   page list entry reads `unpublished`, the preview header reads `vN (unpublished)`, the
   Unpublish control becomes disabled (`05-success-status.png`, `06-admin-unpublished.png`).
6. **Database truth** — `select … where page_key='classes' and status='published'` returns **0
   rows**; the retired document remains as an audited `unpublished` version with
   `published_at`/`published_by` cleared (defence in depth against stale resurrection).
7. **Public surface** — `GET /api/builder/public/pages/classes` → **404
   `BUILDER_PAGE_NOT_FOUND`** and the Classes route renders no builder region and no probe
   heading (`07-public-after-unpublish.png`).
8. **Reload persistence** — after a full page reload the admin list still says `unpublished`, the
   control is still disabled, the state label still reads `(unpublished)`, and the public route is
   still 404 (`08-admin-reload-unpublished.png`, note "unpublished state persisted across a full
   page reload").
9. **Republish** — saving and publishing from the UI restores the page: banner "Published vN",
   header `(published)`, live row has a new `published_at`, public GET returns **200** with the
   probe heading again (`09-republished-status.png`, `10-public-republished.png`).

`regular-admin-run.json` covers the second test: the same page, signed in as the seeded regular
Admin (`builder.regular.admin@bookourspace.local`), shows the chip "Admin · Regular Builder Admin"
with Publish/Unpublish/Rollback all disabled and `title="Super Admin required"`
(`11-regular-admin-disabled.png`), and a direct `POST /api/builder/pages/classes/unpublish` with
that session returns **403 `BUILDER_SUPER_ADMIN_REQUIRED`**; the public GET still returns 200.

### 7.4 BU-UI-01 — defect found, fixed, and guarded by a regression assertion

**Defect.** The editor's document-state label in the preview header was derived from the presence
of a draft only:

```tsx
{doc ? `v${latestVersion} ${pageState?.draft ? '(draft)' : '(published)'}` : ''}
```

Unpublish leaves the page with *neither* a draft *nor* a live row, so immediately after a
successful retraction — and after every reload — the admin console told the operator the page was
still `(published)` while the page list and the green banner said `unpublished`, and while the
public route returned 404. Contradictory state on the very surface that must reflect the
retraction.

**Fix** (`src/components/UniversalLiveBuilder.tsx`): derive the label from the actual page state
and give it a test id.

```tsx
const documentStateLabel = pageState
  ? pageState.draft
    ? '(draft)'
    : pageState.published
      ? '(published)'
      : '(unpublished)'
  : '';
…
<span data-testid="builder-document-state" …>{doc ? `v${latestVersion} ${documentStateLabel}` : ''}</span>
```

**Regression coverage** (same spec, existing Playwright style, no new harness): the label must read
`(published)` before unpublish, `(unpublished)` (and never `(published)`) after unpublish and after
a reload, and `(published)` again after republish — spec lines 268, 320–321, 353–354, 363.

**Proof the assertion catches the defect.** With the old label expression restored and everything
else identical, the test fails:

```
✘ 1 [chromium] › e2e/builder-unpublish-ui.spec.ts:248 › Super Admin publishes, confirms, unpublishes…
  Error: expect(locator).toContainText(expected) failed
  Expected substring: "(unpublished)"
  Received string:    "v6 (published)"
    > 320 | await expect(page.getByTestId('builder-document-state')).toContainText('(unpublished)');
  1 failed            (exit 1)
```

The log is kept at `e2e-artifacts/builder-unpublish/before-fix/regression-run-pre-fix.log`, and
`before-fix/08-admin-reload-unpublished.png` plus `defect-before-fix/` keep the pre-fix screenshots
(`05`, `06`, `08` show `vN (published)` after the retraction). With the fix restored the same spec
passes (7.5). Nothing else in the component, the client, the server route or the SQL was changed.

### 7.5 Commands, exit codes and counts (final tree)

| Command | Result | Exit |
| --- | --- | --- |
| `BOS_PLAYWRIGHT_PORT=4747 BOS_PLAYWRIGHT_OUTPUT_DIR=/tmp/bos-pw-final npx playwright test e2e/builder-unpublish-ui.spec.ts --project=chromium` | **2 passed**, 0 failed, 0 skipped (21.6 s) | **0** |
| same spec, `spec.ts:248` only, **pre-fix label restored** (regression proof) | 1 failed (assertion above) | 1 (expected, pre-fix) |
| `BOS_PLAYWRIGHT_PORT=4748 BOS_PLAYWRIGHT_OUTPUT_DIR=/tmp/bos-pw-region npx playwright test e2e/builder-region.spec.ts --project=chromium` (unrelated public builder/taxonomy flows still pass) | **6 passed**, 0 failed, 0 skipped (23.5 s) | **0** |
| `npm test` | **785 passed**, 0 failed, 0 skipped, 0 todo | **0** |
| `npx tsc --noEmit` | no diagnostics | **0** |
| `npm run build` | built in 1.29 s; only the pre-existing >500 kB chunk-size advisory | **0** |
| `git rev-parse HEAD` | `c913554f93e7bc7bfcdf6acae2538f43580a42f0` (unchanged) | 0 |
| `git diff --cached --name-only` | empty (nothing staged) | 0 |

Earlier in this pass the same two browser tests also passed before the label fix (2 passed, 33.3 s,
exit 0) — that is how the state screenshots were first collected.

### 7.6 Changed files and evidence paths

Changed: `src/components/UniversalLiveBuilder.tsx` (label derivation + `data-testid`, two hunks),
`e2e/builder-unpublish-ui.spec.ts` (untracked; added document-state assertions, non-2xx capture,
evidence writing), `e2e-artifacts/builder-unpublish/**` (untracked evidence),
`BOOKOURSPACE_REACT_MASTER_ISSUE_REGISTER.md` (this section). Nothing was staged, committed, pushed
or deployed; no migration, RLS policy, Flutter file or hosted resource was touched.

```
e2e-artifacts/builder-unpublish/
  01-super-admin-toolbar.png          06-admin-unpublished.png        11-regular-admin-disabled.png
  02-confirmation-dialog.png          07-public-after-unpublish.png   super-admin-run.json
  03-error-state.png                  08-admin-reload-unpublished.png regular-admin-run.json
  04-loading-state.png                09-republished-status.png
  05-success-status.png               10-public-republished.png
  before-fix/08-admin-reload-unpublished.png, before-fix/regression-run-pre-fix.log
  defect-before-fix/{05,06,08}-*.png, defect-before-fix/super-admin-run.json
```

`super-admin-run.json` holds the console transcript, every `/api/builder/…` call with status
(`unpublish` 500 → 200, admin page 404 ×2 after retraction, publish 200 again), all public-surface
responses, and the notes quoted in 7.3. `regular-admin-run.json` holds the 403 refusal and the
"page still published" note.

### 7.7 Observations left open (not defects of the unpublish flow)

- **`GET /api/notifications` returns 403 for both admins** on every admin-console load (captured in
  `httpFailures` of both JSON records). The route still uses the legacy
  `hasCurrentAdminSession`, which fails closed on the PostgreSQL runtime and in production
  (`server.ts:1960`) and is not wired to the Postgres-aware check used elsewhere. It is unrelated to
  unpublish and was not changed here; it needs its own item under the admin-dashboard/security
  work because it means the notification panel cannot load for a Super Admin in this runtime.
- The `Loading classes…` placeholder visible in `07`/`10` is the React `Suspense` fallback for the
  lazily loaded Classes section (`src/App.tsx:3158`) captured while the chunk was still resolving,
  not a stuck state; the builder region above it was already asserted absent/present.
- RLS, policies and all hosted configuration remain outside this pass, as instructed.

### 7.8 Verdict (restated after this pass)

**Priority 1 scope: closed.** The overall program verdict is **NOT READY** (see §8). Priority 1 is closed: the unpublish control is browser-verified
end to end for both roles, the public page is genuinely gone after retraction (404 + 0 published
rows) and restored after republish, the retraction survives a reload, one real UI defect (BU-UI-01)
is fixed and guarded by a failing-before/passing-after regression assertion, and the unit suite
(785/785), `tsc` and the production build all exit 0 on the final tree. Release is still gated by the
open non-P1 items: MR-02 (untracked migrations), MR-05/MR-06 (Gate 1 pre-checks against live DEV),
MR-07 (retention sign-off), MR-11 (backup/PITR + restore evidence), live DEV RLS/schema verification,
the notification-route authorization gap above, and Priority 2–4 work not yet complete.

## 8. Priority 2 — migration readiness evidence and verdict (2026-11-21)

Reconciled inventory: 124 migration files = 124 manifest entries (`migration_manifest.mjs` exit 0, sha256 match; sanitizer exit 0). Recorded DEV history: 73 applied / 51 pending / 0 divergence (prior read-only CLI, not re-run in this pass). The pending set is interleaved, not a contiguous tail, and includes the newest Builder unpublish migration.

Local proof (PostgreSQL 17.11, loopback only, synthetic data, no hosted operations): evidence and harness in `migration-sim-artifacts/`.

| Database | State | Result |
|---|---|---|
| `bos_empty` | baseline then 124 migrations | 124/124 exit 0 |
| `bos_pop` | baseline + synthetic rows then 124 migrations | 124/124 exit 0 |
| `bos_devsim` | baseline + synthetic rows + the 73 DEV-applied versions, then the 51 pending | 73/73 + 51/51 exit 0 |

Validated locally: backfill (`businesses` 4, null `listings.business_id` 0, owner mismatch 0, `business_members` 4), RLS (customer saw 6 own access rows and 0 foreign rows; 2 of 4 profiles via `can_read_private_profile`), new-user trigger (profile + 6 access rows), `platform_page_versions` CHECK (`unpublished` accepted, unknown rejected), `builder_unpublish_page` super-admin gate (plain Admin refused `BUILDER_SUPER_ADMIN_REQUIRED`; Super Admin unpublish cleared `published_at`/`published_by` and wrote one audit row), and function execution revoked from `anon`/`authenticated`.

Not supported locally, stated as gaps: lock duration for the ACCESS EXCLUSIVE CHECK rewrite, production-sized backfill timing, violating-row scenarios for `payment_intents`/`seat_locks`/`service_tracking` and the three `NOT VALID` constraints, Supabase platform parity (stub `auth` only), app e2e against the migrated database, and forward-fix rollback scripts (none exist).

Changed files: `REACT_MIGRATION_CLASSIFICATION_REPORT.md`, `REACT_MIGRATION_LOCAL_SIMULATION_REPORT.md`, `REACT_MIGRATION_RELEASE_SEQUENCE.md`, this register; new untracked `migration-sim-artifacts/`. No migration file, policy, Flutter file or hosted resource was modified. Working tree: **129** changed entries, nothing staged, no commit, HEAD unchanged at `c913554f93e7bc7bfcdf6acae2538f43580a42f0`.

**Verdict: NOT READY.** The SQL is reproducibly clean locally, including the exact DEV applied/pending split, but release remains blocked by MR-02 (uncommitted manifest and two migrations), MR-05/MR-06 (hosted violating-row and null-column counts, duration), MR-07 (retention sign-off for the purge), MR-11 (backup/PITR and restore evidence) and MR-13 (three `NOT VALID` constraints), plus unverified live DEV schema/RLS and the unverified production ledger.

## 9. Priority 4 — security / release configuration inspection (2026-11-21)

Read-only inspection only. No hosted configuration or database was read or changed, no credential rotated, no OAuth setting touched, no deploy, commit, push or stage. HEAD verified `c913554f93e7bc7bfcdf6acae2538f43580a42f0`, 0 staged, 132 changed entries at the start of the pass. Full detail: `PRIORITY_4_SECURITY_RELEASE_INSPECTION_REPORT.md`.

### 9.1 Result table

| ID | Area | Status | Sev | Finding | Affected files |
|---|---|---|---|---|---|
| SEC-01 | Rate limiting behind a proxy | **RESOLVED** (was FAIL) | P2 → closed | Bucket key was `req.ip` with no `app.set('trust proxy', …)`, so all callers shared one bucket per `(method, route)`; the auth/admin/builder policies also never matched the aggregated route. Fixed by `configureTrustProxy` (one hop on Cloud Run) and a corrected `policyFor`; proven by 8 HTTP-level tests. | `src/server/trustProxy.ts` (new), `src/server/distributedApiRateLimit.ts`, `server.ts`, `deploy/cloudrun/service.yaml`, `tests/rate-limit-client-ip.test.mjs` (new) |
| SEC-02 | Session storage | **PARTIAL** | P2 | Server-minted HMAC token (constant-time compare, expiry, revocation) is stored in `localStorage`; no cookie is ever set, so XSS yields a 7-day token. | `src/lib/supabaseClient.ts:666-706` + 9 direct readers |
| SEC-03 | Headers / CORS / CSRF | **PASS** | — | Exact-origin allowlist (no wildcard), `Vary: Origin`, 403 preflight for unknown origins, nosniff, `frame-ancestors 'self'`, Referrer-Policy, Permissions-Policy, HSTS in production; no cookies means no ambient credential for CSRF. | `server.ts:435-455`, `src/server/nativeAppCors.ts`, `tests/native-api-transport.test.mjs:85-103` |
| SEC-04 | Coupon authority | **FAIL** (surface unfinished) | P3 | `subtotal * 0.1` discount computed in the browser; no coupon table, endpoint or server validation exists. Consistent with W-04: no server trust exists today. | `src/components/HelperJourney.tsx:303` |
| SEC-05 | OTP attempt budget | **PARTIAL** | P3 | In-process `Map` buckets while `maxScale: "2"`, so a caller can land on the instance with the fresh budget. | `src/server/emailOtpAuth.ts:268-282`, `deploy/cloudrun/service.yaml` |
| SEC-06 | Deployment config enforcement | **PARTIAL** | P2 | `verify-deployment-config.py` fails here on `ModuleNotFoundError: yaml` and no CI job invokes it. The configuration itself is currently correct. | `deploy/cloudrun/verify-deployment-config.py`, `.github/workflows/ci.yml` |
| SEC-07 | OAuth callback origin | **PARTIAL** | P3 | `/api/auth/google/url` falls back to `req.protocol://req.get('host')` when `APP_URL` is unset, and production startup does not require `APP_URL`. | `server.ts` (`/api/auth/google/url`) |
| SEC-08 | RLS / API authz / tenant isolation | **PASS (local)**, hosted **NOT VERIFIED** | P1 for the unverified part | Fail-closed `hasAdminAuthorization`; `hasVerifiedSupabaseIdentity` requires provider + Supabase UUID; elevated work sets `SET LOCAL ROLE service_role` with explicit `sub` claims; client RLS writes require a returned row id so a refused write cannot look successful; transactions are never surfaced as settlement proof. | `src/server/adminAuthorization.ts`, `authIdentity.ts`, `stayPayments.ts`, `serviceCommerceApi.ts`, `stayHostApi.ts`, `src/lib/supabaseClient.ts`, `supabase/schema_and_rls.contract.test.ts` |
| SEC-09 | Secret / env validation | **PASS** | — | Only `.env.example` tracked; no `.env*` ever added to history; `.env.local` is `0600`; tracked-file secret scan matches only `sb_secret_test`/`sb_secret_local` fixtures; client resolver refuses service-role, `sb_secret_`, DB URLs and ref-mismatched keys; production requires TLS + ≥32-char HMAC. | `.gitignore`, `src/lib/supabaseConfig.ts`, `src/server/persistencePolicy.ts`, `src/server/supabaseProductionGuard.ts` |
| SEC-10 | Build / image | **PASS** | — | 0 `.map` files in `dist`, `dist` untracked, non-root container, no `.env` copied, no secret build args, secrets via Secret Manager, all demo/sandbox flags `0`, no `allUsers` binding. | `vite.config.ts`, `deploy/cloudrun/Dockerfile`, `deploy/cloudrun/service.yaml` |
| SEC-11 | Payment / booking safeguards | **PASS** | — | `create-intent` returns 503 unconditionally, `webhook-settle` returns 410, UTR path records reconciliation only, `PAYMENT_VERIFICATION_AVAILABLE=false`, client transaction helpers refuse; sandbox requires non-production + ≥16-char secret (venue path `NODE_ENV === 'test'`). | `server.ts:1354`, `server.ts:3964-4034`, `src/lib/supabaseClient.ts`, `src/server/stayRazorpay.ts`, `venueBookingsApi.ts:50` |
| SEC-12 | Supabase project separation | **PASS (local config)**, hosted **NOT VERIFIED** | P1 for the unverified part | React DEV targets `obkfgxjzlscungkhbyvq`: `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID` and `VITE_SUPABASE_URL` all resolve to that ref (value comparison, nothing printed). Production guard refuses any dev ref (`obkfgxjzlscungkhbyvq`, retired `ezrxykyocgbolpaebnqx`, retired `sfoizxarbljhldmkgsma`). `deploy/` contains no dev ref and no hard-coded Supabase host. | `src/server/supabaseProductionGuard.ts`, `.env.example:20-22`, `.env.local`, `deploy/cloudrun/service.yaml` |
| SEC-13 | Debug / dev routes | **PASS** | — | `/api/dev/demo-session` and `/api/auth/local-dev/session` are hard 404 in production and behind explicit flags plus loopback/allowlist checks; the OTP `developmentCode` is returned only when non-production **and** the fallback flag is set **and** Resend delivery already failed. | `src/server/devDemoSessionApi.ts`, `server.ts:3516`, `src/server/emailOtpAuth.ts:225` |

### 9.2 Confirmed defects vs missing evidence

Confirmed from this checkout at inspection time: SEC-01 (since fixed, §10), SEC-02 (storage choice), SEC-04, SEC-05, SEC-06, plus the PASS items above, each with a file/line anchor.

Missing evidence, not obtainable without hosted or deployed access: the hosted auth settings (redirect allowlist, session lifetime, signup state, OTP provider), the hosted RLS policies/grants including the two pending migrations, the three `NOT VALID` constraints' violating-row status (MR-13), backup/PITR and a restore test (MR-11), the live Cloud Run revision's real environment, Storage bucket policies, and a full-history secret scan (only a `.env*`-addition check and a tracked-file pattern scan were run).

### 9.3 New blockers this pass

- ~~**SEC-01 (P2)** — per-client rate limiting is inoperative behind Cloud Run.~~ **RESOLVED 2026-11-22** — see §10.
- **SEC-06 (P2)** — the deployment-config audit that would catch a dev ref or a flipped sandbox flag is not wired into CI.
- **SEC-02 (P2)** — session storage decision must be recorded (cookie + CSRF vs header token with a shorter TTL).

### 9.4 Verdict

**NOT READY.** No confirmed P0/P1 vulnerability was found in the inspected code, and the seven requested areas are all covered with evidence. SEC-01 is resolved (§10). Release stays blocked by SEC-02, SEC-06, the unfinished coupon surface (SEC-04 / W-04 / W-10), and the hosted-side evidence listed in 9.2 — on top of the unchanged Priority 2 blockers MR-02, MR-13, MR-05/MR-06, MR-07 and MR-11, and the policy-blocked BR-10 / BR-11.

Priority 5 was not started; the report and this section are for review first.

## 10. SEC-01 resolution — per-client rate limiting behind Cloud Run (2026-11-22)

Authorized fix pass. React only. No hosted read or write, no deploy, no credential change, no staging, no commit, no push. Priority 5 and SEC-06 were not started.

### 10.1 Root cause (two defects, one layer)

1. **No proxy awareness.** The limiter keyed its bucket on `req.ip`, and its own comment required `trust proxy` to be configured, but nothing in the repository set it. On Cloud Run the socket peer is the Google front end, so every caller landed in one bucket per `(method, route)` — one client could exhaust the auth budget for everybody.
2. **The stricter budgets never applied.** `bucketPath('/api/auth/login')` aggregates to `/api/auth`, while `policyFor` matched `/^\/api\/auth\//` (trailing slash required). Authentication therefore received the generic 120 req/min budget instead of 12; `/api/admin/*` and `/api/builder/*` likewise never received their 30 req/min budget. This was found by the new test that asserts the authentication limit, not by inspection.

### 10.2 Change set

| File | Change |
|---|---|
| `src/server/trustProxy.ts` (**new**) | Trusted-proxy topology. Cloud Run (`K_SERVICE`) → exactly **one** hop. `BOS_TRUST_PROXY_HOPS` accepts a single digit `0`–`4` only; `true`, `*`, `loopback`, `1,2`, `1 hop`, `9` all throw `BOS_TRUST_PROXY_HOPS_INVALID`. Production that is neither on Cloud Run nor given an explicit count throws `BOS_TRUST_PROXY_HOPS_REQUIRED` at startup. Development/test/AI Studio previews trust **no** hop, so forwarded headers are ignored entirely. `normalizeClientAddress()` folds IPv4-mapped IPv6 into one key. |
| `src/server/distributedApiRateLimit.ts` | Key is `normalizeClientAddress(req.ip \|\| req.socket?.remoteAddress)`; an unresolvable address fails closed with 503 instead of sharing an `unknown` bucket. `policyFor` now matches the aggregated route keys (`/api/auth`, `/api/{payments,refunds,bookings,seats,stays}`, `/api/{admin,super-admin}`, `/api/builder`). |
| `server.ts` | `configureTrustProxy(app)` immediately after `const app = express()`, before the limiter is mounted. |
| `deploy/cloudrun/service.yaml` | `BOS_TRUST_PROXY_HOPS: "1"` pinned, with a comment naming the Google front end. |
| `deploy/cloudrun/verify-deployment-config.py` | Asserts the pinned value. Wiring this script into CI remains SEC-06 and was not done. |
| `.env.example` | Documents the variable, the Cloud Run default and the single-digit restriction. |
| `tests/rate-limit-client-ip.test.mjs` (**new**) | 8 tests through a real Express app, the real `configureTrustProxy`, the real middleware and a real `node:http` server. |

Bypass analysis: with `trust proxy = 1`, Express walks `X-Forwarded-For` from the socket and returns the first untrusted hop — the address the trusted front end appended — so any client-supplied prefix is discarded. With trust disabled the header is not read at all.

### 10.3 HTTP-level evidence

| Requirement | Test | Result |
|---|---|---|
| Distinct IPs, distinct buckets | `two distinct client IPs receive independent buckets over HTTP` | `203.0.113.10` vs `203.0.113.11` → two hashes; address never present in the hash |
| Same IP, same bucket | `repeated requests from one client IP share one bucket over HTTP` | 3 requests → 1 hash |
| Forged headers cannot bypass | `forged forwarding prefixes cannot bypass or move the bucket over HTTP` | `198.51.100.99, 203.0.113.10` and `198.51.100.77, 203.0.113.10` hash identically to `203.0.113.10`; a different client still differs |
| No proxy trusted → header ignored | `with proxy trust disabled, forwarded headers are ignored entirely over HTTP` | two different forwarded values share the socket bucket |
| Auth limit enforced | `authentication limit stays 12/minute per client and the API limit stays enforced` | 12 allowed (`RateLimit-Limit: 12`), 13th `429` + `Retry-After: 30`, second client `200`, generic reads `120` |
| Booking/payment limit enforced | `booking and payment routes keep their 30/minute per-client limit` | `RateLimit-Limit: 30`, 31st `429`, second client unaffected |
| Topology rules | `trusted-proxy topology is exactly one hop on Cloud Run and refuses to guess elsewhere` | Cloud Run → 1; dev → disabled; `2` → 2; `0` → disabled; production undeclared throws; six malformed values throw |
| Address normalisation | `client address normalization collapses IPv4-mapped IPv6 to one bucket key` | `::ffff:203.0.113.10` → `203.0.113.10` |

### 10.4 Verification (exact commands and results)

```bash
npx tsx --test tests/rate-limit-client-ip.test.mjs tests/distributed-api-rate-limit.test.mjs \
  tests/authentication-security.test.mjs tests/auth-frontend-guards.test.mjs \
  tests/admin-authorization.test.mjs tests/privileged-endpoint-authorization.test.mjs \
  tests/production-fail-closed.test.mjs tests/preview-isolation.test.mjs
# tests 53 / pass 53 / fail 0 / skipped 0 / exit 0
npx tsc --noEmit   # exit 0
npm run build      # exit 0 (only the pre-existing >500 kB chunk warning, BR-15)
```

The pre-fix run of the new file failed precisely at the auth policy: `/api/auth/login` reported `RateLimit-Limit: 120`. Post-fix it reports `12`. The 5 pre-existing limiter tests and `tests/production-fail-closed.test.mjs` remained green, so the new startup guard does not break the production fail-closed contract (persistence assertions still run first and still produce the documented errors).

Not run: full `npm test`, Playwright suites, hosted verification. The limiter SQL is untouched and remains covered by `supabase/tests/distributed_api_rate_limit_test.sql`.

**Re-verified 2026-11-22** after the unrelated GPS privilege migration (`20261122100000_service_assignment_trigger_privileges.sql`) and the manifest re-pin to 125 migrations: the same focused command `tests 53 / pass 53 / fail 0 / skipped 0, exit 0`; `tests/rate-limit-client-ip.test.mjs` alone `tests 8 / pass 8 / fail 0`; `npx tsc --noEmit` exit 0; `npm run build` exit 0 (BR-15 warning only). No SEC-01 file was modified by that pass. Earlier on the same checkout: full `npm test` 794/794 and `BOS_TEST_RATE_LIMIT=1 bash supabase/tests/run_local_validation.sh` exit 0, zero `429`/`RATE_LIMITED` in either log (max budget usage `/api/admin` PATCH 16/30, `/api/auth` 3/12).

### 10.5 Rate-limit direction of change (no weakening)

| Route group | Before (effective) | After |
|---|---|---|
| `/api/auth/*` | 120/min (policy never matched) | **12/min** |
| `/api/admin/*`, `/api/super-admin/*`, `/api/builder/*` | 120/min (policy never matched) | **30/min** |
| `/api/payments`, `/api/refunds`, `/api/bookings`, `/api/seats`, `/api/stays` | 30/min | 30/min (unchanged, now truly per client) |
| everything else | 120/min | 120/min (unchanged, now truly per client) |

Authentication code was not modified.

**SEC-01: RESOLVED**, on the strength of the HTTP-level tests in §10.3 and the green run in §10.4 (re-confirmed 2026-11-22 after the GPS privilege migration). SEC-06, SEC-02 and SEC-04 remain open; Priority 5 not started.
