# BOOKOURSPACE REACT — MASTER ISSUE REGISTER

Repository: `/Users/aa/Projects/bookourspace-final`
Branch: `integration/recover-20261115`
HEAD verified: `c913554f93e7bc7bfcdf6acae2538f43580a42f0`
Date: 2026-11-21
Last update: 2026-11-22 SEC-04 complete locally — server-authoritative coupons, 18 DB/HTTP/concurrency tests, Chromium coupon journey, 845/845 unit, verified 127-migration manifest (§11.12–§11.13); booking ownership remains unverified against a persisted booking. SEC-02 Chromium matrix green (247 passed, 0 flaky). Hosted evidence and the SEC-06 GitHub run remain open.
Rules: no commits, no hosted database access, no deployment.

Gitleaks remediation 2026-11-22: current working-file and relevant-tree scans
pass with 0 findings after replacing 14 synthetic key-shaped fixture literals.
The history scan reports 100 `generic-api-key` findings across 273 commits;
all are classified as historical-only fixtures or false positives with no
confirmed live credential. Complete redacted inventory: `GITLEAKS_REMEDIATION_REPORT_20261122.md`.

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
| SEC-02 | P2 | Application session token was kept in `localStorage` (`bos_session_token_v1`), never in an httpOnly cookie. | **RESOLVED 2026-11-22** — the session is delivered only in an HttpOnly `bos_session` cookie (Secure in production, `SameSite=Lax`; `SameSite=None` only for allowlisted native origins), and every unsafe `/api` request must echo a CSRF proof derived from the session signature. The Bearer/`x-bos-session-token` and localStorage transports are removed, not retained as a fallback. Evidence §11.7. |
| SEC-04 | P3 | The helper-journey coupon discount was computed in the browser (`subtotal * 0.1`) with no server endpoint. | **RESOLVED 2026-11-22** — the subtotal is now priced on the server from `src/lib/helperPricing.ts` (a client-supplied `subtotal` is ignored), the discount is exact integer-paise arithmetic, and redemption is a serialized transaction: coupon-row lock before the limit count, unique user/coupon and booking indexes behind it, idempotent replay of a retried redemption, explicit booking-ownership refusal, and 503 on database failure. RLS stays enabled with no policies and browser grants revoked, plus `discount <= subtotal` and booking-id constraints. Evidence: `tests/coupon-security.test.mjs` 18 behavioural DB/HTTP/concurrency tests (unique-index and mid-transaction rollback included), `e2e/helper-coupon-journey.spec.ts` Chromium journey, 845/845 unit tests, verified 127-migration manifest (§11.13). Booking ownership is **not** verified against a persisted booking — the helper journey has no booking record, so only reference uniqueness is enforced; see §11.13. Hosted apply pending. |
| SEC-05 | P3 | OTP verify-attempt buckets are per-process memory while Cloud Run permits 2 instances. | **RESOLVED 2026-11-22** — email/IP/verify budgets charged to `private.consume_api_rate_limit` through an HMAC key; limiter outage fails closed; 5 new tests. Evidence §11. |
| SEC-06 | P2 | `deploy/cloudrun/verify-deployment-config.py` is not run by CI and cannot run here (PyYAML missing). | **RESOLVED (local) 2026-11-22** — pinned `PyYAML==6.0.2`, `--root` audit, `deploy-config` CI job, 10 positive/negative tests. GitHub run itself NOT VERIFIED. Evidence §11. |
| SEC-07 | P3 | `/api/auth/google/url` falls back to a Host-header-derived origin when `APP_URL` is unset. | **RESOLVED 2026-11-22** — `resolveAuthOrigin`: APP_URL only in production, loopback-only dev fallback, 503 otherwise; 6 new tests. Evidence §11. |

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
| SEC-02 | Session storage | **RESOLVED 2026-11-22** | P2 | Session token is delivered only as an HttpOnly cookie; page script holds a CSRF proof in memory and nothing else. Legacy token keys are actively purged. | `src/server/sessionCookie.ts`, `src/server/sessionCsrfToken.ts`, `src/lib/sessionCsrf.ts`, `server.ts` (cookie transport + CSRF gate) |
| SEC-03 | Headers / CORS / CSRF | **PASS** | — | Exact-origin allowlist (no wildcard), `Vary: Origin`, 403 preflight for unknown origins, nosniff, `frame-ancestors 'self'`, Referrer-Policy, Permissions-Policy, HSTS in production; no cookies means no ambient credential for CSRF. | `server.ts:435-455`, `src/server/nativeAppCors.ts`, `tests/native-api-transport.test.mjs:85-103` |
| SEC-04 | Coupon authority | **FAIL** (surface unfinished) | P3 | `subtotal * 0.1` discount computed in the browser; no coupon table, endpoint or server validation exists. Consistent with W-04: no server trust exists today. | `src/components/HelperJourney.tsx:303` |
| SEC-05 | OTP attempt budget | **RESOLVED 2026-11-22** | P3 → closed | In-process `Map` buckets replaced by the database-backed limiter for email/IP/verify budgets, HMAC-keyed, fail-closed; §11.2. | `src/server/emailOtpAuth.ts`, `server.ts`, `tests/email-otp-distributed-limit.test.mjs` (new) |
| SEC-06 | Deployment config enforcement | **RESOLVED (local) 2026-11-22** | P2 → closed locally | Pinned `PyYAML==6.0.2`, `--root`-parameterised audit with graceful YAML failures, new `deploy-config` CI job, 10 positive/negative tests; §11.1. GitHub execution NOT VERIFIED. | `deploy/cloudrun/verify-deployment-config.py`, `deploy/cloudrun/requirements-verify.txt` (new), `deploy/cloudrun/test_verify_deployment_config.py` (new), `.github/workflows/ci.yml` |
| SEC-07 | OAuth callback origin | **RESOLVED 2026-11-22** | P3 → closed | No Host-header fallback: `resolveAuthOrigin` uses `APP_URL` (https in production), allows a loopback origin only outside production, and returns 503 `AUTH_ORIGIN_UNCONFIGURED` otherwise; §11.3. | `src/server/authOrigin.ts` (new), `server.ts`, `tests/auth-origin.test.mjs` (new) |
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
- **SEC-02 (P2)** — RESOLVED 2026-11-22: HttpOnly cookie + derived CSRF proof; evidence §11.7.

### 9.4 Verdict

**NOT READY.** No confirmed P0/P1 vulnerability was found in the inspected code, and the seven requested areas are all covered with evidence. SEC-01 (§10) and SEC-02 (§11.7) are resolved. Release stays blocked by SEC-06's unobserved GitHub run, the unfinished coupon surface (SEC-04 / W-04 / W-10), and the hosted-side evidence listed in 9.2 — on top of the unchanged Priority 2 blockers MR-02, MR-13, MR-05/MR-06, MR-07 and MR-11, and the policy-blocked BR-10 / BR-11.

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

**SEC-01: RESOLVED**, on the strength of the HTTP-level tests in §10.3 and the green run in §10.4 (re-confirmed 2026-11-22 after the GPS privilege migration). SEC-02 is now resolved (§11.7); SEC-06 (GitHub run) and SEC-04 remain open; Priority 5 not started.

---

## 11. Production-readiness execution (2026-11-22, branch `integration/recover-20261115`, from `add352b`)

Full detail: `PRODUCTION_REMEDIATION_REPORT_20261122.md` and
`FINAL_RELEASE_READINESS_REPORT_20261122.md`.

### 11.1 SEC-06 — deployment audit is enforced

- `deploy/cloudrun/verify-deployment-config.py` rewritten around `audit(root, yaml)` with `--root DIR`; missing PyYAML exits `2` with the install command, malformed YAML and a wrong Knative shape emit `FAIL` instead of a traceback; new checks for container port, plaintext secret values, and `.txt`/`.json` deployment files.
- `deploy/cloudrun/requirements-verify.txt` pins `PyYAML==6.0.2`.
- `deploy/cloudrun/test_verify_deployment_config.py` — 10 tests (1 positive, 9 negative against a mutated `--root` copy).
- `.github/workflows/ci.yml` — new `deploy-config` job: Python 3.12, `pip install -r`, audit, negative suite.

Evidence: audit `47 PASS`, exit 0; tests `Ran 10 tests ... OK`, exit 0; `yaml.safe_load('.github/workflows/ci.yml')` parses. GitHub Actions execution: **NOT VERIFIED**.

**SEC-06: RESOLVED (local).**

### 11.2 SEC-05 — OTP budgets are distributed

`src/server/emailOtpAuth.ts` accepts an optional `rateLimiter`; `server.ts` supplies an HMAC-keyed adapter over `private.consume_api_rate_limit` whenever a PostgreSQL runtime exists. Email/hour (5), IP/hour (20) and verify attempts (10/10 min) are charged to the database, so a second Cloud Run instance sees the same budget. Cooldown is charged after the address check so an IP rejection cannot consume the email's retry slot. A limiter error returns `503 OTP_RATE_LIMIT_UNAVAILABLE`; the in-process maps remain the no-database fallback.

Evidence: `npx tsx --test tests/email-otp-distributed-limit.test.mjs` — 5/5 pass, including two-instance email, two-instance IP, two-instance verify, fail-closed outage and local fallback. Limiter SQL unchanged and covered by `supabase/tests/distributed_api_rate_limit_test.sql`.

**SEC-05: RESOLVED.**

### 11.3 SEC-07 — OAuth origin is configuration only

`src/server/authOrigin.ts` resolves the callback origin from `APP_URL` (https required in production); without it production answers `503 AUTH_ORIGIN_UNCONFIGURED`. Development may use a loopback `Host` only. `/api/auth/google/url` no longer reads `req.get('host')` for the origin.

Evidence: `npx tsx --test tests/auth-origin.test.mjs` — 6/6 pass.

**SEC-07: RESOLVED.**

### 11.4 Database readiness

- Manifest: `PASS manifest verified: baseline + 125 migrations, unique versions, sha256 match`; `git ls-files 'supabase/migrations/*.sql' | wc -l` = 125.
- Fresh-install ordering: baseline + 125 migrations applied with no failure; 132 public tables.
- NOT VALID constraints: exactly three (`listings_price_range_check`, `live_edit_cinema_owner_screen_fkey`, `payment_verifications_intent_id_fkey`), queried from `pg_constraint where not convalidated`.
- New read-only precheck `supabase/tests/not_valid_constraint_precheck.sql`: on the disposable database all three report `violations = 0 / READY`. Validation statements are included but commented; running them needs hosted DEV approval.
- Retention migration `20261118200000_service_tracking_share_links.sql`: no `pg_cron`/`cron.schedule` anywhere, so `purge_old_service_tracking_locations` is dormant. Enabling a schedule is a retention decision **requiring the owner's written approval**; not enabled.

### 11.5 Verification run in this pass

| Check | Command | Result |
|---|---|---|
| Unit/API suite | `npm test` | 805 / 805 pass, exit 0 |
| TypeScript | `npx tsc --noEmit` | exit 0 |
| Build | `npm run build` | exit 0 (BR-15 warning only) |
| Deployment audit | `verify-deployment-config.py` | 47 PASS, exit 0 |
| Audit negative suite | `test_verify_deployment_config.py` | 10/10, exit 0 |
| Migration manifest | `migration_manifest.mjs` | PASS, 125 |
| DB validation | `BOS_TEST_RATE_LIMIT=1 bash supabase/tests/run_local_validation.sh` | exit 0, `ALL CHECKS PASSED` |
| Dependencies | `npm audit --audit-level=low` | 0 vulnerabilities |
| Secret scan | gitleaks (Docker) | **NOT RUN** — Docker daemon unavailable; heuristic `git grep` for `sk_live_`/`sb_secret_`/AKIA/private-key blocks found only a fake value in `tests/supabase-config.test.mjs:311` |
| Playwright journeys | `npm run e2e` | **NOT RUN** in this pass |

### 11.6 Remaining blockers

| ID | Status | Blocking reason |
|---|---|---|
| SEC-02 | **RESOLVED 2026-11-22** | Migrated to an HttpOnly cookie plus a derived CSRF proof; no localStorage/header transport remains. Evidence §11.7. |
| SEC-04 | **OPEN** | No server coupon engine; the helper-journey discount is still browser-computed. New feature work, must not ship as an authoritative price. |
| Hosted RLS/grants evidence | **NOT VERIFIED** | Needs hosted DEV access. |
| Constraint validation + retention schedule | **PENDING APPROVAL** | Hosted migration; precheck script prepared. |
| Backup/PITR restore | **NOT VERIFIED** | Needs authorised read-only evidence and a disposable restore environment. |
| Playwright journeys | **NOT VERIFIED** | Not executed in this pass. |

**Readiness: NOT READY.** SEC-04 remains open, hosted database evidence is missing, and the browser journeys were not re-run. No hosted change was made.

### 11.7 SEC-02 — HttpOnly cookie session + CSRF (2026-11-22)

**Design.** The application session is the same HMAC-signed token as before, but it
is delivered to browsers only through `Set-Cookie: bos_session=…; Path=/;
HttpOnly; SameSite=Lax; Secure; Max-Age=<session lifetime>`. Page script therefore
never holds a bearer credential. `Secure` is omitted only for loopback HTTP
development; `SameSite=None` is used only when the request `Origin` is an
allowlisted native app origin (`BOS_NATIVE_APP_ORIGINS`). `Max-Age` is derived from
the token's own `expiresAt`, so the cookie never outlives the session.

**CSRF.** The proof is `HMAC_SHA256(secret:CSRF_TOKEN_V1, session signature)` —
derived, never stored, so it rotates with the session and survives a restart. It
is returned as `csrfToken` by each sign-in response and by `/api/auth/me`, kept
in memory (`src/lib/sessionCsrf.ts`), and required in `x-bos-csrf` on every
unsafe `/api` request that carries the session cookie. Session-establishing
endpoints are exempt because the caller is verified by the identity provider.

**No fallback.** `extractRawTokenFromRequest` reads the cookie only. `Authorization`
and `x-bos-session-token` no longer authenticate anything (regression-tested), and
`purgeLegacySessionTokens()` erases `bos_session_token_v1` /
`bos_authoritative_session_token` on module load and on every session write.

**Migration.** Writers: `App.tsx`, `CustomerLoginExperience.tsx`,
`SupabaseAuthModal.tsx`, `lib/pgBookingClient.ts`, `context/MarketplaceContext.tsx`.
Readers: `moduleConfigStore`, `livePageEditorStore`, `adminEnterpriseStore`,
`builder/client`, `servicesBookingClient`, `serviceCommerceClient`,
`serviceCatalogClient`, `gpsPolicyClient`, `deliveryTrackingClient`,
`marketplaceVisibility`, `sectionStyleSettings`, `stayDiscoveryData`,
`signedStorageUrl`, `AdminPlatformModuleSettings`, `MoviesShowtimes`,
`SuperAdminControlHub`, the four Venue components, `StayCheckoutPage` (now reads
the non-secret profile cache instead of decoding a JWT) and
`mobile/nativeApiTransport` (cookie jar + `credentials: 'include'`, no token read).

**Browser follow-up (2026-11-22).** `e2e/session-cookie-harness.ts` and
`e2e/session-cookie.spec.ts` pass 3/3 in isolated Chromium for HttpOnly cookie
attributes, reload persistence, no token in web storage, CSRF enforcement,
logout revocation, session isolation, and role denial. Legacy suites that still
reference retired `sessionToken`/Bearer helpers remain open migration work.

| Check | Command | Result |
|---|---|---|
| Cookie/CSRF unit + HTTP suite | `npm test tests/session-cookie-auth.test.mjs` | 14/14 pass — flags, parser, derived-token rotation, static "no localStorage token" scan, 401 without cookie, 401 for Bearer-only, expired 401, CSRF 403, logout clears + revokes, two isolated sessions, admin-surface 403 |
| OAuth sign-in + refresh + logout | `npm test tests/google-oauth-auth-contract.test.mjs` | 12/12 pass (token now captured from `Set-Cookie`) |
| Email OTP sign-in | `npm test tests/email-otp-auth.test.mjs` | pass |
| Full unit suite | `npm test` | 819/819 pass |
| TypeScript | `npx tsc --noEmit` | exit 0 |
| Production build | `npm run build` | exit 0 |

**Not verified here:** a real browser reload/restart against the dev server and
the Playwright matrix (`npm run e2e`) were not re-run, so the two-session and
reload proofs are HTTP-level, not browser-level.

### 11.8 SEC-02 browser follow-up (2026-11-22, current worktree)

The dedicated cookie contract is now implemented in `e2e/sec02-cookie-browser.spec.ts`
and the existing `e2e/session-cookie.spec.ts` harness mismatch is repaired. The
isolated Chromium run passed the dedicated cookie tests and the OAuth/login entry
point suite passed independently. The combined run was rate-limited by the local
development auth/me limiter after the 17 entry-point tests; this is recorded as a
test-environment blocker, not a security pass.

| Evidence | Result |
|---|---|
| `npm test` | 825/825 pass, exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0; Vite config/chunk-size warnings only |
| Isolated cookie specs | 4/4 pass before combined-run rate limiting |
| OAuth/auth entrypoints | 17/17 pass in prior isolated Chromium run; 17/17 passed before rate limiting in combined run |
| Combined cookie + OAuth run | 20/24 pass; 4 failed with HTTP 429 from local auth/me rate limiting |
| `git diff --check` | pass |

At the time of this earlier snapshot, the remaining Playwright specs still
contained storage-token or Bearer transport references. The current follow-up
below records the migration result; SEC-02 remains **OPEN** pending green
functional browser evidence.

### 11.9 SEC-02 migration follow-up (current worktree)

The ten requested specs now contain no legacy browser authentication references;
their session transport uses `e2e/session-cookie-harness.ts` cookies and CSRF
proofs. The disposable Playwright server now accepts
`BOS_DISPOSABLE_TEST_AUTH_BUDGET=100` for `/api/auth` only; production remains
12 requests per minute.

| Check | Result |
|---|---|
| Dedicated SEC-02 browser suite | **4/4 pass** |
| Combined cookie/OAuth suite | **24/24 pass** |
| Ten-spec migration batch | **2 passed, 7 failed, 22 skipped, 26 did not run**; blocked by functional setup failures and disposable PostgreSQL shared-memory exhaustion during the run |
| `npm test` | **825/825 pass**, exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0; existing Vite/chunk-size warnings only |
| `git diff --check` | pass |

SEC-02 remains **OPEN** until the ten migrated specs and full Chromium matrix
pass. Production remains **NOT READY**.

Latest inventory narrows the true remaining transport-reference files to:
`access-control-dashboard.spec.ts`, `admin-users-authorization.spec.ts`,
`builder-unpublish-ui.spec.ts`, `classes-training.spec.ts`,
`legacy-pass-verification.spec.ts`, `provider-business-context.spec.ts`,
`provider-identity.spec.ts`, `stays-booking.spec.ts`, `stays-onboarding.spec.ts`,
`stays-host-money.spec.ts`, `stays-payments.spec.ts`, `stays-receipt-qr.spec.ts`, and
`venue-booking.spec.ts`. Harness-only token constructors are not browser
storage transport. SEC-02 remains **OPEN** pending these migrations and a
normal-rate-limit combined/full Chromium pass.

Latest named-spec execution: 74 scheduled tests, 17 passed, 6 failed, 27
skipped and 24 not run. The focused admin/provider/cookie run passed 11/11
with normal rate limiting. Remaining failures are recorded in the production
remediation report and do not qualify as SEC-02 PASS evidence.

Latest diagnosis: cookie-path remediation is verified by 3/3 passing
provider-business-context tests. Remaining isolated stays failures are
`OWNED_STAY_LISTING_REQUIRED` (host property save, 404) and `MISSING_LISTING`
(receipt checkout, 400). The broader batch also showed disposable PostgreSQL
termination and dependent `RATE_LIMIT_SERVICE_UNAVAILABLE`; these require local
harness lifecycle/resource repair and are not production rate-limit bypasses.
SEC-02 remains **OPEN**.

### 11.17 Backup/data-protection approval record

**Decision: PENDING — NOT AUTHORIZED FOR EXECUTION.**

| # | Requirement | Responsible owner | Evidence | Approval date | Status |
|---:|---|---|---|---|---|
| 1 | Named backup owner and restore operator |  | Named individuals and roles |  | **PENDING** |
| 2 | Authorized access list |  | Approved identities, least-privilege scope and revocation owner |  | **PENDING** |
| 3 | Encrypted destinations and KMS/Secret Manager key policy |  | Destination IDs, encryption/key custody and access policy |  | **PENDING** |
| 4 | Retention, deletion and access-revocation rules |  | Retention/deletion schedule and revocation procedure |  | **PENDING** |
| 5 | Auth/OAuth configuration capture without secret values |  | Redacted configuration checklist and secret-handling statement |  | **PENDING** |
| 6 | Separate encrypted Storage object-byte backup and verification |  | Object inventory, encrypted-copy plan and byte/hash evidence |  | **PENDING** |
| 7 | Written acceptance of RPO ≤24 hours |  | Signed RPO acceptance |  | **PENDING** |
| 8 | Written acceptance of rehearsal RTO ≤2 hours |  | Signed RTO acceptance and measurement method |  | **PENDING** |
| 9 | Disposable restore environment and cost approval |  | Isolated target, cleanup plan, budget and cost approval |  | **PENDING** |

No backup creation, restore, migration, constraint validation, grant change or
hosted database modification is authorized until all nine requirements have an
owner, evidence and approval date. Production remains **NOT READY**. SEC-04
remains **BLOCKED** and payments remain disabled.

Latest SEC-02 evidence: provider switching independent repeat **3/3 pass**;
venue share-link focused repeat **3/3 pass**; full Chromium **247 pass, 30
documented skips, 0 failures**, exit 0. Unit tests **826/826 pass**, with
TypeScript, lint, build and diff check passing. Gitleaks still reports 100
redacted generic-api-key matches, individually classified as fixture/test/
example false positives across the documented files; command exit remains 1.
No active production credential was identified or exposed. Browser closure is
complete, but SEC-02 remains OPEN pending release-owner acceptance of the
non-secret Gitleaks corpus.

### SEC-02 release-owner acceptance record — 2026-11-22

`GITLEAKS_REMEDIATION_REPORT_20261122.md` documents all 100 findings by file,
line group, rule, category and evidence. They are classified as historical
synthetic test values, fixtures, examples or false positives; no active
production credential was identified. Residual risk is limited to unknown
historical reuse, which cannot be ruled out without an owner credential
inventory. No allowlist or history rewrite was used.

Release-owner acceptance: **NOT PROVIDED**. Approval must be supplied by the
release owner outside this worktree before the historical non-zero scan can be
accepted for SEC-02 closure. SEC-02 remains **OPEN**.

Latest evidence: anonymous stay test **1/1 PASS**; named Chromium batch **54
passed, 1 flaky, 19 skipped**. Stay booking/receipt coverage passed. The sole
flaky failure was disposable PostgreSQL startup cleanup: initialization failed,
then the harness catch path issued `pg_ctl -m fast stop`; retry passed. TypeScript,
lint, build and `git diff --check` passed. Full Chromium and final unit/Gitleaks
exit statuses remain pending; SEC-02 is **OPEN**.

### 11.10 SEC-02 resource and full-matrix follow-up (2026-11-22)

Measured local cause of `shmget: No space left on device`: macOS System V
shared-memory limits were `shmmni=32` and `shmall=1024`; orphaned disposable
PostgreSQL clusters had consumed the segment slots. Only explicitly test-owned
clusters were stopped; persistent databases and unrelated containers were not
changed. Bounded one-worker execution avoided recurrence.

The disposable-only budgets are accepted only when `NODE_ENV !== production`.
The regression test proves production remains 12/minute for auth and 30/minute
for API routes even if the disposable override is present; `npx tsx --test
tests/distributed-api-rate-limit.test.mjs` passed 6/6.

The ten requested cookie-migrated specs passed 35 tests with 22 fixture-gated
skips and 0 failures. The three full-matrix failures were diagnosed and then
passed individually: `stays-commit-visibility` 1/1, `stays-host` 9/9, and
`access-control-api` 7/7. The latter was a shared request-context cookie
isolation defect in the test, not an authorization weakening.

The full Chromium matrix has not yet been rerun after these fixes; SEC-02
remains **OPEN** pending that evidence and the required final checks.

Post-fix standard Chromium matrix: **235 passed, 2 failed, 30 skipped, 10 did
not run**. Both failures were Playwright trace-artifact ENOENT cleanup errors,
not application assertions. With `--trace=off`, provider-business-context passed
**6/6** and stays-filters passed **12/12**. The standard matrix remains
non-zero, so SEC-02 stays **OPEN**.

### 11.11 SEC-02 final verification (2026-11-22)

Playwright trace output now uses a unique per-process directory:
`/tmp/bookourspace-playwright-results-<port>-<pid>`. The disposable local
server now stops only explicitly named `/tmp/bookourspace-playwright-db-*`
clusters on exit; persistent PostgreSQL data was preserved.

Standard command:
`BOS_PLAYWRIGHT_PORT=4890 BOS_PLAYWRIGHT_DB_PORT=14890 BOS_PLAYWRIGHT_DB_DATA_DIR=/tmp/bookourspace-playwright-db-4890 npm run e2e -- --workers=1 --retries=0`

Result: **exit 0; 247 passed, 30 intentional skips, 0 failures, 0 unexplained
not-run tests**. The 30 skips are documented fixture/environment gates: class
sessions (9), movie external-base/session fixtures (3), services seeded
fixtures (2), GPS external server (2), AI Studio-only SafeImage (1), explicitly
authorized real stays (1), Stay 2 cloud smoke (1), and venue session fixtures
(11). The prior 10 not-run entries were dependent venue serial tests and no
longer occurred as unexplained not-run output.

Final checks: `npm test` **exit 0, 826/826**; `npm run lint` **exit 0**;
`npx tsc --noEmit` **exit 0**; `npm run build` **exit 0** (existing chunk-size
warning); `git diff --check` **exit 0**. Gitleaks remains previously verified:
working-tree/source scans 0 findings; historical-only findings documented.

SEC-02 is **PASS for the local Chromium scope**. Hosted OAuth and the
intentionally gated external-fixture journeys remain separate release evidence
requirements; production remains **NOT READY** until the other release gates
are closed.

Post-run ownership audit found prior orphaned disposable directories from older
runs; all were stopped with scoped `pg_ctl` commands. The persistent Homebrew
cluster and `.local/stays-db` remained running. Playwright now requests graceful
SIGTERM shutdown for five seconds so the disposable cleanup trap can run before
force termination.

Latest remediation: the stays harness has a disposable-only auth budget and
canonical hotel fixture. Host property save and receipt checkout passed in the
next isolated run. The anonymous empty-token cookie/CSRF fixture bug was fixed;
full Chromium verification remains pending.

Lifecycle remediation is now implemented: teardown is ownership-gated by a
successful PostgreSQL start in the same harness invocation. Repeated host-money
verification passed **3/3, 3/3 and 3/3**. Full Chromium and skip classification
remain pending; SEC-02 stays **OPEN**.


### 11.11 SEC-02 browser verification — PASS (2026-11-22, final)

Supersedes the "SEC-02 remains OPEN" notes in 11.8–11.10. Worktree: branch
`integration/recover-20261115`, HEAD `add352b91aa0f7558283c4e7ee352800f82876b4`,
all changes uncommitted.

Transport under test: `Set-Cookie: bos_session=<signed token>; Path=/;
Max-Age=<token lifetime>; SameSite=Lax; HttpOnly` (`Secure` omitted only for
loopback HTTP, never in production). Page script holds only the CSRF proof, in
memory. No Bearer or `x-bos-session-token` path exists.

E2E migration: `e2e/session-cookie-harness.ts` writes the HttpOnly cookie with
`context.addCookies` for both loopback spellings, and derives the CSRF proof
either from the secret the disposable harness owns or from `/api/auth/me`.
All 16 previously localStorage-seeded specs use it. `grep -rn "Bearer " e2e/*.ts`
returns nothing; the only `bos_session_token_v1` references left under `e2e/`
are assertions that the key is absent, and every remaining `src/` reference is
a deletion of the legacy keys.

Browser matrix — 11/11 pass (`e2e/session-cookie.spec.ts` 7,
`e2e/sec02-cookie-browser.spec.ts` 4):

| Requirement | Evidence |
|---|---|
| Login + authenticated navigation | local-dev sign-in sets the cookie; `/api/auth/me` 200; console mounts |
| Reload | reload re-bootstraps through `/api/auth/me` 200 |
| Browser restart | page close/reopen in the same context stays signed in; a fresh context is 401 |
| Two independent sessions | separate contexts hold different cookie values and do not share state |
| Logout → 401 | logout 200 clears the cookie; a replayed old cookie value is 401 on `/api/auth/me` |
| Expired session | invalid/expired cookie is 401 after reload |
| Revoked session | logout revocation rejects the copied token |
| CSRF | missing proof → 403; wrong proof → 403; session survives the refused request |
| Authorization | customer cookie is 403 on `/api/admin/access-control/accounts` |
| Cookie attributes | `HttpOnly`, `SameSite=Lax`, `Path=/`, expiry bounded by the 12h session; `document.cookie` never shows the name |

Commands and exact results:

| Command | Exit | Result |
|---|---|---|
| `npm test` | 0 | tests 826 · pass 826 · fail 0 · skipped 0 |
| `npx tsc --noEmit` | 0 | no diagnostics |
| `npm run build` | 0 | built (chunk-size warning only) |
| `BOS_PLAYWRIGHT_PORT=4599 npx playwright test e2e/session-cookie.spec.ts e2e/sec02-cookie-browser.spec.ts --project=chromium --workers=1` | 0 | 11 passed |
| `BOS_PLAYWRIGHT_PORT=4599 npm run e2e` | 0 | 277 declared · 247 passed · 30 skipped · 0 failed · 0 flaky · no retries |

Port 4547 was held by a pre-existing dev server and was left untouched; the
suite ran on an isolated port with its own throwaway PostgreSQL cluster.

The earlier matrix's single flake (`access-control-dashboard` › "search,
switch, complete access, view-only and revoke") was Playwright infrastructure,
not the product: `browserContext.close: ENOENT
.../.playwright-artifacts-0/traces/...-recording8.trace` followed by `ENOENT
.../<hash>.zip`. Retry artifacts are written under
`<outputDir>/.playwright-artifacts-<workerIndex>`, and every `playwright test`
invocation begins with a "clear output" task that recursively deletes its
`outputDir` (`node_modules/playwright/lib/runner/index.js`,
`createRemoveOutputDirsTask`). A second matrix running in the same working
directory therefore deleted the live run's artifact directory mid-test. The
config now gives each invocation a private output directory
(`/tmp/bookourspace-playwright-results-<port>-<pid>`, still overridable with
`BOS_PLAYWRIGHT_OUTPUT_DIR`). Two illustrative overlapping runs that share an
`outputDir` reproduce the identical ENOENT; with distinct directories they stay
clean. Assertions, `retries: 1`, worker count and skips are unchanged, and the
recorded 247-pass matrix completed without a single retry.

Remaining limitations: the Google OAuth popup and blocked-popup contracts are
covered by `auth-entrypoints.spec.ts` and `auth-role-and-session.spec.ts`, but no
live Google callback was executed (no hosted credentials; policy). Firefox and
WebKit binaries are absent. The `SameSite=None` native-app policy is proven by
unit tests, not by a browser on a native origin. Hosted RLS/backup evidence and
the SEC-06 GitHub run stay out of scope.

**SEC-02: OPEN.** Full Chromium produced 245 passed, 2 flaky, and 30 gated
skips (277 scheduled, exit 1). Static checks passed, and three repeated
host-money runs passed 3/3. The flakes, gated external coverage, and 100
redacted Gitleaks findings prevent closure.

Focused investigation: provider business switching is serial-state dependent
when invoked alone (Beta access is seeded by the preceding transition test),
while venue share-link restoration passed all three focused repetitions. The
full matrix's first-attempt readiness flakes remain unresolved; no sleeps,
weakened assertions, or new retries were added.

Focused repeat evidence: venue share-link 3/3 PASS; provider switching 0/3
when isolated. The remaining provider defect is deterministic fixture/context
state, not a basis for weakening the authorization assertion. SEC-02 remains
OPEN.

### 11.12 Production blocker audit (2026-11-22)

Fresh read-only DEV check used only `obkfgxjzlscungkhbyvq` and verified
`ACTIVE_HEALTHY`, Mumbai `ap-south-1`. Hosted migration parity is **FAIL/BLOCKED**:
the hosted ledger has **74 applied migrations**, latest `20261108150000`, versus
**126** in the local manifest. The three pending constraints remain
`convalidated=false`: `listings_price_range_check`,
`live_edit_cinema_owner_screen_fkey`, and `payment_verifications_intent_id_fkey`.

RLS and expected policies exist on the inspected security-sensitive tables, but
grants require review because read-only metadata showed broad/unusual privileges,
including `anon` metadata privileges. Supabase health had no lints; performance
advisors reported unused indexes and multiple permissive policies.

GitHub Actions is **NOT VERIFIED**: no workflow run exists for expected HEAD
`add352b91aa0f7558283c4e7ee352800f82876b4`. Cloud Run configuration is **PASS
locally** (47/47 audit checks, 10/10 negative tests), while actual service,
Secret Manager, domain, monitoring, rollback, OAuth and backup/PITR/restore
evidence remain unverified. Payments remain disabled.

Production verdict: **NOT READY**. Highest-priority next action: obtain owner
approval to reconcile the hosted DEV migration ledger, then repeat hosted
RLS/grant and constraint preflight checks before any validation or deployment.

The older SEC-02 narrative above is historical checkpoint evidence. The latest
verified SEC-02 checkpoint remains accepted and was not rerun for this audit:
the standard Chromium matrix passed with 247 passed, 30 intentional skips, and
exit 0; unit, lint, TypeScript, build, and diff checks also passed. This audit
does not treat those completed checks as evidence for the hosted blockers above.

Evidence commands/queries recorded for this audit: `git status --short
--branch`; `git rev-parse HEAD`; `node supabase/tests/migration_manifest.mjs`;
read-only Supabase migration-ledger, constraint, RLS/policy, grants, and
advisor queries against project `obkfgxjzlscungkhbyvq`;
`/tmp/bos-verify-venv/bin/python deploy/cloudrun/verify-deployment-config.py`;
`/tmp/bos-verify-venv/bin/python deploy/cloudrun/test_verify_deployment_config.py -q`;
`bash -n deploy/cloudrun/verify-app-url.sh scripts/dev-with-stays-db.sh`; and
`git diff --check`. No hosted write or constraint validation was performed.

### 11.13 Hosted DEV migration reconciliation plan (read-only)

Project identity was re-verified before hosted inspection: ref
`obkfgxjzlscungkhbyvq`, Mumbai `ap-south-1`, `ACTIVE_HEALTHY`. Exact comparison
found 52 local versions absent from DEV, one bootstrap naming mismatch, and no
shared-version name conflicts or local ordering errors. The missing versions
are:

`20261102124513`, `20261102142141`, `20261111190000`, `20261111192224`,
`20261111200000`, `20261111210000`, `20261112010000`, `20261112020000`,
`20261112030000`, `20261112040000`, `20261112050000`, `20261112080846`,
`20261112100000`, `20261112130000`, `20261112140000`, `20261112150000`,
`20261112160000`, `20261112170000`, `20261112180000`, `20261112190000`,
`20261112200000`, `20261112210000`, `20261112220000`, `20261112230000`,
`20261112240000`, `20261112250000`, `20261112260000`, `20261112270000`,
`20261112280000`, `20261112290000`, `20261112300000`, `20261112310000`,
`20261112320000`, `20261112330000`, `20261112340000`, `20261113000000`,
`20261113010000`, `20261113020000`, `20261113030000`, `20261113040000`,
`20261113050000`, `20261114090000`, `20261114100000`, `20261114110000`,
`20261114120000`, `20261115120000`, `20261118180000`, `20261118190000`,
`20261118200000`, `20261119100000`, `20261120100000`, `20261122100000`,
`20261122110000`.

The hosted-only entry is `00000000000000 bookourspace_baseline`; local
`supabase/schema_and_rls.sql` is the corresponding bootstrap artifact. This is
not permission to edit migration history or mark rows applied. Local SQL for
all 52 versions was inspected. Effects include schema, RLS/policy and function
changes, security privilege tightening, and data backfills. Hosted metadata
confirmed only the pre-existing `cinema_screens` among representative
new-object names queried, so no missing migration is considered reconciled.

The three constraints remain unvalidated. Read-only grants showed unusual
`anon` metadata privileges on `listings` and `payment_verifications`, plus
broad authenticated privileges on protected tables. Neither constraints nor
grants were changed.

Proposed sequence: backup/restore-point evidence; immutable ledger and manifest
comparison; read-only object, policy, orphan-row and backfill prechecks; apply
reviewed migrations in timestamp order by dependency batch; then separately
validate constraints only after zero invalid/orphan rows. Rollback is limited
because several migrations backfill data, replace policies, drop a trigger or
tighten privileges; tested restore is the recovery mechanism. Coupon migration
remains a separate SEC-04 approval boundary.

Status: **BLOCKED pending owner approval** for the DEV backup/restore point,
reviewed application of the 52 missing migrations, baseline reconciliation and
a separate constraint-validation window. No hosted change was executed.

### 11.14 DEV backup and restore-point verification (2026-11-22)

Verification timestamp: **2026-11-22T11:31:29Z**. Project ref was re-verified
as `obkfgxjzlscungkhbyvq`, `ACTIVE_HEALTHY`, Mumbai, before inspection. Exact
read-only command: `supabase backups list --project-ref
obkfgxjzlscungkhbyvq --output-format json`.

| Requirement | Status | Evidence |
|---|---|---|
| Daily backup exists | **PASS** | 8 physical backups, all `COMPLETED`; newest ID `2339765861`, `2026-11-22T02:39:06.829Z`. |
| PITR | **FAIL** | Response reports `pitr_enabled:false`; no sub-day recovery window. |
| Pre-migration restore point | **PASS, snapshot only** | The newest snapshot predates all proposed migrations; no migration was executed. Restorability is unproven. |
| Isolated restore rehearsal | **NOT VERIFIED** | None performed. Clone/new project or logical dump plus isolated local PostgreSQL is required. |
| Database schema/data | **PARTIAL** | Provider physical backup is expected to cover database state, but no restore inspection verified it. |
| Extensions | **NOT VERIFIED** | Current extensions were read-only inventoried; restoration was not tested. |
| Supabase configuration | **FAIL for complete coverage** | OAuth, redirect URLs, secrets, API keys, project settings, monitoring and deployment configuration are outside the database backup. |
| Storage bytes | **FAIL for complete coverage** | Storage metadata may be in the database; object bytes are not covered and have no backup evidence. |

Recovery evidence supports only a provider-managed daily snapshot and an
approximate worst-case RPO of 24 hours. There is no verified portable backup,
PITR, isolated restore, or measured RTO. In-place restore is destructive and a
new-project clone requires approval, plan support and cost. DEV remains
**NOT SAFE for the proposed migration window** until a disposable restore
rehearsal and non-database coverage plan are approved and evidenced.

### 11.15 DEV recovery and backup plan (design only)

The proposed recovery package must include an encrypted portable PostgreSQL
custom-format dump, separate schema/pre-data/post-data review dumps, roles and
grant inventory, extension/version inventory, migration ledger and SHA-256
manifest, critical-table counts/checksums, and timestamps. It must be stored in
two approved locations with KMS/Secret Manager-controlled encryption keys. No
secret values belong in Git, logs or reports.

Supabase configuration requires a separate redacted inventory: project/plan,
network and pooler settings, Auth providers/redirects/session policy, Realtime
and cron, Edge Function source/runtime configuration, secret names/references,
Cloud Run/domain/monitoring/webhook settings, and Storage bucket metadata.
Storage object bytes require a separate encrypted object backup and inventory;
they are not covered by the database snapshot.

The preferred rehearsal is an owner-approved restore-to-new-project clone. The
fallback is a logical dump restored to a localhost-only disposable PostgreSQL
17.11 cluster. Neither may target DEV or production. Verification must cover
schema/data counts and checksums, migration history, extensions, roles/grants,
RLS/policies, SECURITY DEFINER paths, Storage metadata/bytes, representative
Auth rows and payment-disabled application smoke tests. Restore duration and
time to usable service must be measured.

Acceptance targets: current daily backups provide only an approximate RPO of
≤24 hours; a tighter target requires separately approved PITR and billing
changes. Proposed rehearsal RTO is ≤2 hours to a usable isolated DEV clone.
All critical checks must pass with no unexplained missing Storage bytes,
configuration items or secret references.

Before the 52 migrations: verify project ref and fresh snapshot, create and
hash the portable package, complete the isolated rehearsal, reconcile the
baseline name, freeze or bound writes, record critical counts/checksums, run
orphan/invalid-value prechecks for the three constraints, review every
backfill/policy/grant change, stage dependencies in timestamp order, define
batch stop conditions and obtain explicit approvals.

Required approvals: backup/data-protection owner, temporary DB credential,
encrypted storage/retention, clone or isolated-host budget, any PITR/billing
change, Auth/OAuth and Storage owners, named restore operator/window, and
migration-owner approval. Manual recovery remains required for project
settings, OAuth, secrets, API keys, monitoring, Edge Function deployment and
Storage bytes. Status: **BLOCKED / DESIGN ONLY**; no execution occurred.

### 11.16 DEV recovery execution approval checklist

All approval gates remain **PENDING**: backup/data-protection scope; temporary
least-privilege database access; encrypted storage, KMS custody and retention;
clone or isolated-host infrastructure and budget; PITR/billing decision;
Auth/OAuth ownership; Storage object ownership; named restore operator/window;
and migration-owner approval for the 52-version sequence. The detailed
owner/action/evidence matrix and phase requirements are recorded in the
production remediation report.

Mandatory before backup creation: data-protection scope, temporary access,
encrypted destinations/retention, Auth/OAuth and Storage approvals. Mandatory
before rehearsal: isolated target, restore operator/window, Auth/OAuth, Storage
and migration-owner approvals. Mandatory before migrations: a passing
rehearsal, accessible hashed backup package, resolved baseline plan, approved
dependency sequence, clean orphan/invalid prechecks and explicit RPO/PITR
decision. Constraint validation and grant changes remain separate gates.

Rehearsal PASS requires matching schema/data/checksum evidence, migration
metadata, extensions, roles/grants, RLS/policies/functions, intentional
constraint state, Auth/session behavior, Storage byte/hash samples, redacted
configuration references, payment-disabled smoke tests, measured RPO/RTO and
cleanup proof. Targets are RPO ≤24 hours with current daily backups and RTO
≤2 hours to an isolated DEV clone. Any unexplained discrepancy is STOP.

Local-only work may continue: SQL/effect and dependency review, preflight SQL
preparation, checksums, redacted manifests, grant/RLS diff review and a
localhost-only restore harness. These do not establish hosted recoverability.

Current decision: **STOP / BLOCKED**. The single next approval is the written
backup/data-protection owner approval covering scope, encrypted destinations,
retention and Auth/Storage handling, supported by the signed scope,
destination/key policy and named owner. No hosted action is authorized.

### 11.18 DEV-only development readiness reclassification

Only DEV project `obkfgxjzlscungkhbyvq` exists; no production environment or
real customer/business data exists. Production-only backup/PITR/restore,
multi-region infrastructure, production RTO/RPO, production OAuth/domain and
Cloud Run recovery are **DEFERRED** until launch or valuable data exists.

Current verdict: **DEV DEVELOPMENT CONTINUES WITH HOSTED-MIGRATION BLOCKERS**.
Local work may continue, but hosted execution of the 52 missing migrations is
blocked by ledger/schema drift, baseline naming mismatch, three NOT VALID
constraints and incomplete RLS/grant review.

Basic DEV protection is limited to recording the newest completed provider
snapshot and UTC timestamp before an approved migration window, confirming it
predates the window, exporting the hosted ledger/local manifest, preserving
read-only preflight results and defining batch stop points. Recovery would be
an owner-approved, destructive in-place restore to that snapshot; no backup
creation or restore is authorized now.

Next DEV work: reconcile the 52 migrations and dependency batches; run the
constraint precheck read-only; prepare RLS and least-privilege grant diffs;
review backfills, policy/privilege changes and trigger drops; and obtain
approval before hosted execution. SEC-02 stays **OPEN** pending genuine
release-owner Gitleaks acceptance. SEC-04 stays **BLOCKED** and payments stay
disabled.

Production-launch controls remain future blockers: tested portable backup,
PITR/RPO decision, restore rehearsal, Storage-object recovery, Supabase/Auth/
OAuth configuration recovery, secret recovery, monitoring and rollback.
No hosted migration, constraint validation, grant change, backup/restore,
deployment or payment enablement occurred.

### 11.19 Migration reconciliation planning update — read-only

Current local manifest verification: `node supabase/tests/migration_manifest.mjs`
→ PASS, baseline plus 126 migrations, unique versions and SHA-256 match. The
DEV ledger remains 74 entries, leaving 52 local versions absent. DEV's
`00000000000000 bookourspace_baseline` is mapped for review to local
`supabase/schema_and_rls.sql`; it must not be re-applied or manually inserted
into migration history.

Recommended order is: A movie foundation; B delivery/institute foundations; C
business ownership and backfills; D provider/institute/payment hardening; E
business/access hardening; F GPS/tracking/access; G builder and trigger
privileges. Every phase is timestamp-ordered, with read-only object, policy,
grant, backfill and constraint prechecks at each boundary. The exact
version/filename matrix is in the updated F4 report and the production
remediation report.

Current blockers: baseline object/effect mapping; 52-version ledger/schema
reconciliation; unresolved backfill and ordering risk; three NOT VALID
constraints; RLS/grant review; and explicit approval for any hosted execution.
The first candidate batch for approval is **Phase A only**
(`20261102124513_movie_visibility_management`, then
`20261102142141_movie_tamil_nadu`) after baseline/object preflight, movie-row
compatibility checks and a read-only constraint/policy diff. It is not approved
to run. Phase G coupon validation remains SEC-04 blocked.

No hosted SQL, migration, constraint validation, grant change, backup/restore,
deployment or Git publishing operation occurred.

### 11.20 First movie-batch preflight — read-only

DEV ref was verified as `obkfgxjzlscungkhbyvq`, `ACTIVE_HEALTHY`, Mumbai. Local
inspection of both complete SQL files and read-only DEV catalog queries found:

- `auth.users`, `listings`, `cinema_screens` and `realtime.send` exist.
- `cinema_private`, `movie_theatres`, `movie_titles` and `movie_showtimes` do
  not exist.
- DEV has 5 visible `cinema_screens` rows with showtimes and 0 non-null
  `movie_id` values; movie-category listings count is 0.
- DEV already has later `cinema_screens` movie migrations
  `20261108120000` and `20261108130000`, creating a potential duplicate/parallel
  movie architecture conflict.
- Existing `cinema_screens` public SELECT policy is permissive; existing
  listings policies are public-active/owner read plus authenticated owner/admin
  writes. The first candidate would add restrictive guards and alter ACLs.

Verdicts:

- `20261102124513_movie_visibility_management`: **BLOCKED**. It would create a
  separate movie catalog, insert four bootstrap identities, add many functions,
  policies and grants, and alter listing/screen visibility. Baseline mapping is
  not proof that this effect is compatible with current DEV.
- `20261102142141_movie_tamil_nadu`: **BLOCKED**. Its target table and
  `movie_theatres_state_check` do not exist; it cannot run independently.

The exact SELECT-only preflight SQL and expected evidence are recorded in the
updated F4 report. Required evidence before reconsideration: baseline
object/effect diff, explicit decision on the parallel movie architecture,
bootstrap identity approval, policy/ACL interaction tests and compatibility
review of existing cinema rows. No hosted write or migration was performed.

### SEC-02 release-owner acceptance request — current

`SEC02_RELEASE_OWNER_ACCEPTANCE_REQUEST_20261122.md` contains the acceptance
statement, 100-finding summary, review method, residual-risk limitation and
blank approver fields. Required role: BookOurSpace release owner/security
approver. No identity or approval is invented; status remains **NOT PROVIDED**.
The next action is a written or signed decision with identity, decision,
conditions, credential-inventory confirmation, date and ticket/signature
reference. SEC-02 remains **OPEN**.

### 11.21 Movie architecture decision — read-only

React evidence supports one canonical path: `MoviesShowtimes.tsx`,
`GET /api/movies/showtimes`, `moviesShowtimesApi.ts` and
`providerListingRepository.ts` all use `public.cinema_screens`; ownership is
joined through `cinema_listing_id` and `public.listings`. The UI is showtimes-
only and has no active movie booking/payment surface. No active consumer was
found for the November 2 separate-catalog tables or RPCs.

Decision: **canonical architecture = `cinema_screens`**. The separate
`movie_theatres`/`movie_titles`/`movie_showtimes` path is a duplicated,
unconsumed RLS/ACL architecture and is **superseded as-is**.

Disposition:

- `20261102124513_movie_visibility_management`: **SUPERSEDED**; do not execute.
- `20261102142141_movie_tamil_nadu`: **SUPERSEDED/CONSOLIDATE**; if Tamil Nadu
  is needed, add it to the canonical `cinema_screens` constraint path.
- `20261108120000_movies_showtimes_only`: **RETAIN / already in DEV ledger**.
- `20261108130000_movies_showtimes_dates`: **RETAIN / already in DEV ledger**.
- `20261112330000_movies_state_approval`: **EXECUTE LATER, approval-gated**;
  current API dependency, but its state constraint omits Tamil Nadu.

Unresolved: Tamil Nadu launch scope, real titles/dates for five existing
screens, and whether the current public cinema policy should be replaced by
the approval guard. Smallest safe next task: add a local architecture contract
test proving active movie code uses `cinema_screens` and the November 2 RPCs have
no consumers. No hosted change occurred; stop for review.

Local contract test evidence: added `tests/movie-architecture-contract.test.mjs`
to inspect the active UI, admin mount, API and repository. It enforces the
`cinema_screens`/`listings` path and rejects superseded catalog table/RPC
references in active source. `node --test
tests/movie-architecture-contract.test.mjs tests/movies-showtimes-only.test.mjs
tests/movies-discovery-safety.test.mjs` passed **9/9**; `npx tsx --test
tests/movies-schema-compat.test.mjs` passed **4/4**. Combined: **13/13 PASS**,
exit 0. No hosted action occurred.

### 11.22 All-India movie showtimes requirement — local update

Product requirement is now **all 28 Indian states and 8 union territories**.
Canonical architecture remains `public.cinema_screens` plus the existing
`listings` integration. Local hardcoded four-state lists were replaced with
shared `src/lib/indiaMovieStates.ts` and used by movie routes, admin/provider
filters and the active showtimes UI. Admin copy now states all-India coverage.

The local approval-gated `20261112330000_movies_state_approval.sql` was revised
to enumerate all 36 names, but was **not executed**. It still requires hosted
state-value/null preflight, approval-backfill review and RLS/grant comparison.
The November 2 separate-catalog migrations remain **SUPERSEDED**.

Focused verification: architecture/showtimes/discovery tests **10/10 PASS**;
schema compatibility command **4/4 PASS**; combined **14/14 PASS**, exit 0.
No hosted SQL, migration, data, policy or grant change occurred.

Next approval-gated task: run read-only DEV checks for all existing
`cinema_screens.state` values and approve the canonical all-India state/approval
migration only after the values, null policy, backfill and RLS/grant effects
are reviewed.

### 11.23 All-India state/approval migration preflight — read-only

DEV ref `obkfgxjzlscungkhbyvq` was verified as `ACTIVE_HEALTHY` before
inspection. The shared list and local migration each contain 36 unique
state/UT names. DEV currently lacks both `cinema_screens.state` and
`approval_status`, so existing state values cannot yet be read and would be
NULL after column creation. DEV has 5 visible rows, 0 hidden, 5 missing movie
titles and 5 missing show dates; the approval backfill would mark all five
`approved`, while the public API would still exclude them until title/date
requirements are met.

Current cinema policies/grants were reviewed read-only: public/anon and
authenticated SELECT is `qual=true`; authenticated owner/assignment INSERT and
UPDATE remain; anon SELECT and authenticated INSERT/SELECT/UPDATE grants
remain. No changes were made.

Exact conditional preflight SQL is in F4. Verdict: **NEEDS MORE EVIDENCE**,
not READY FOR APPROVAL, because post-apply state/approval behavior is untested
and RLS/grant review remains separate. The unrelated TypeScript error remains
at `src/components/HelperJourney.tsx:800` (`setCouponDiscount` undefined).
No hosted action occurred; stop for authorization.


### 11.12 SEC-04 — coupons and redemption security (2026-11-22, final)

Supersedes the "SEC-04 remains open" statements in §9.4, §10.4 and the earlier
release-report blocker list. React only: no hosted write, no migration applied
to Supabase, no deployment, no staging or commit.

**What existed.** `public.coupons` and `public.coupon_redemptions` with RLS
enabled, no policies, browser grants revoked; `/api/coupons/validate` and
`/api/coupons/redeem`; and three `tests/coupon-security.test.mjs` checks that
only matched strings in the source. No behaviour was proven.

**Defects found and fixed.**

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | Both endpoints calculated the discount from a **client-supplied `subtotal`** | A browser could send ₹999,999 and take 10% of it; the ₹200 minimum could be cleared the same way | `src/lib/helperPricing.ts` is now the single price table (hours × ₹99 + ₹29 + ₹12, helpers 1–10). The API prices the request from `durationId` + `helpers` and ignores any money in the body; `HelperJourney` imports the same table, so the quote and the server agree |
| 2 | A retried redemption returned `409` instead of the stored result | A network retry looked like a failed redemption | Redeem re-reads the redemption under the coupon lock; the same (coupon, user, booking) replays `200 { idempotent: true }` with the stored discount, and a `23505` race falls back to the stored row |
| 3 | A booking already discounted for another account was a generic duplicate error | No ownership decision, only a constraint message | Explicit `COUPON_BOOKING_ALREADY_DISCOUNTED` (409) when the booking id is held by another user; `COUPON_ALREADY_REDEEMED` (409) for a second booking by the same user |
| 4 | Discounts computed in floating-point rupees | Platform-dependent rounding | `src/lib/couponMath.ts` works in integer paise and hundredths of a percent (`Math.round(p * basisPoints / 10_000)`), capped by `max_discount`, by the subtotal, and by 0 |
| 5 | A database outage surfaced as `422 COUPON_INVALID` | An outage looked like a coupon decision | Only `CouponRefusal` maps to 4xx; any other error is `503 COUPON_DATABASE_UNAVAILABLE`, and the client keeps the coupon unapplied |
| 6 | No per-request reason codes | Opaque failures | `COUPON_INVALID`, `COUPON_MIN_SUBTOTAL`, `COUPON_ALREADY_REDEEMED`, `COUPON_LIMIT_REACHED`, `COUPON_BOOKING_ALREADY_DISCOUNTED`, `COUPON_DATABASE_UNAVAILABLE`; every response is `Cache-Control: no-store` |

**Database.** `supabase/migrations/20261122120000_coupon_redemption_integrity.sql`
adds `coupon_redemptions_discount_le_subtotal` (`discount <= subtotal`), a
`booking_id` format check matching the API regex, and re-revokes all privileges
on both tables from `anon` and `authenticated`. The existing unique indexes
`(coupon_id, user_id)` and `(booking_id)` remain the second line of defence
behind the coupon-row lock.

**Concurrency.** Redemption locks the coupon row (`select … for update`) before
counting redemptions, so parallel requests serialize on the coupon and cannot
both read a below-limit count. Four behavioural tests drive the real handler
with parallel HTTP requests:

| Scenario | Parallel requests | Observed | Rows |
|---|---|---|---|
| One user, distinct booking ids, no global limit | 8 | 1 × 200, 7 × 409 `COUPON_ALREADY_REDEEMED` | 1 |
| `max_redemptions = 1`, distinct users | 8 | 1 × 200, 7 × 422 `COUPON_LIMIT_REACHED` | 1 |
| `max_redemptions = 3`, distinct users | 16 | 3 × 200, 13 × 422 `COUPON_LIMIT_REACHED` | 3 |
| Same booking id, eight different accounts | 8 | 1 × 200, 7 × 409 `COUPON_BOOKING_ALREADY_DISCOUNTED` | 1 |

**Requirement evidence** (`tests/coupon-security.test.mjs`, 16 tests):

| Requirement | Test |
|---|---|
| Server-authoritative pricing | `helper pricing is the server-side subtotal source of truth`; `a client-supplied subtotal cannot change the discount or pass the minimum` |
| Active/inactive and expiry | `activation window and expiry are enforced on the server` |
| Minimum subtotal | `minimum booking subtotal is measured on the server-priced subtotal` |
| Redemption and per-user limits | `global redemption limit and per-user limit are enforced` |
| Duplicate redemption | same test + `parallel redemptions cannot exceed the per-user limit` |
| Booking ownership | `a booking discounted for one account cannot be claimed by another` |
| Discount/currency/rounding | `coupon maths is exact in paise and bounded by cap, subtotal and percent` (33.33% of ₹239.00 = ₹79.66) |
| Atomicity under concurrency | the four parallel tests above |
| Client cannot forge status/limits/records | `RLS, revoked grants and constraints protect the coupon tables` (0 policies, `42501` for select/insert/update/delete as `authenticated` and `anon`, `23514` for discount > subtotal and malformed booking ids) |
| Authorization | `only a signed-in customer can validate or redeem` (anonymous/provider/admin/non-UUID → 401) |
| Error handling | `malformed and unbookable requests are rejected before any database work` (400); `a database outage fails closed with 503 instead of granting a discount` |
| Idempotency | `a retried redemption is idempotent instead of double-counting` |
| Auditability | redemption row asserted to hold the server-computed `subtotal`, `discount`, `booking_id`, `user_id` and `redeemed_at`; no client role may update or delete it |

**Commands.** `node tests/run-unit-suite.mjs tests/coupon-security.test.mjs` →
exit 0, **16/16 pass** on a fresh disposable cluster (baseline + 127
migrations). `npm test` → exit 0, **843/843 pass, 0 fail, 0 skipped**.
`npx tsc --noEmit` → 0. `npm run build` → 0. `git diff --check` → 0.
`node supabase/tests/migration_manifest.mjs` verifies the two SEC-04 entries and
then reports drift at position 107 for
`supabase/migrations/20261112330000_movies_state_approval.sql`: the manifest
pins the committed bytes (`ace7408b…`, matching `git show HEAD:`), while a
concurrent session changed that file in the worktree at 17:50. Unrelated to
SEC-04 and left untouched.

**Residual risks (SEC-04).** The helper booking is presentation-only, so booking
ownership is enforced as "one account owns a booking reference", not against a
persisted booking row; a coupon cannot be applied by a staff role; the hosted
schema still needs the two local migrations applied before this claim holds in
DEV. No Playwright coupon journey exists (there was none before).

The `HelperJourney.tsx:800` `setCouponDiscount` TypeScript error recorded at the
end of this register was a transient state during the edit described above;
`npx tsc --noEmit` exits 0 on the final tree.

**SEC-04: PASS (local unit + DB + HTTP + concurrency).**


### 11.13 SEC-04 follow-up — manifest reconciliation and booking-reference review (2026-11-22)

**Manifest diagnosis (exact).** The verifier reported `order or metadata differs
at migration position 107: supabase/migrations/20261112330000_movies_state_approval.sql`
plus `migration checksum inventory drift`. `compare()` numbers positions from 1,
so "position 107" is array index 106 — the movies migration. It was **not** an
ordering or count problem: 127 files on disk, 127 manifest entries, 127 unique
14-digit versions, every filename conforming, and order/name/version identical
element-for-element. The only difference was that entry's content: the manifest
pinned 1264 bytes / `ace7408b…`, exactly the committed HEAD bytes
(`git show HEAD:… | shasum -a 256`), while the worktree file is 1759 bytes /
`0bf2edac…` after a concurrent session expanded the state check to all Indian
states and union territories at 17:50 IST. The inventory drift is that same file.

**Reconciliation (verified, not blind).** Before re-pinning: 127 unique
versions, 0 non-conforming filenames, manifest order/name/version identical to
disk, and a full disposable install of all 127 migrations succeeded. Re-pinned
with `node supabase/tests/migration_manifest.mjs --write --review-note "…"`; the
diff is exactly the movies entry's bytes/sha (preserved as authored), the two
coupon entries, the counts and the review record — no other migration byte
changed. `node supabase/tests/migration_manifest.mjs` → **exit 0**,
`PASS manifest verified: baseline + 127 migrations, unique versions, sha256 match`.
No write lock was held; the script's lock would have refused a second writer.

#### Booking-reference security — verified limit

Determined from the code and schema, not assumed:

- `HelperJourney` generates the reference in the browser (`BOS-<year>-<4 digits>`,
  `HelperJourney.tsx:236`) and keeps it in the localStorage draft; the API
  receives it as `bookingId`.
- **No authoritative helper booking exists.** There is no helper-bookings table,
  `public.coupon_redemptions.booking_id` is `text` with **no foreign key** to
  `service_bookings` or `venue_bookings`, and the journey neither creates nor
  loads a booking row (it is presentation-only and collects no payment).
- The server enforces: format (`^[A-Za-z0-9_-]{3,128}$`, in the API and as a DB
  check), global uniqueness of the reference
  (`coupon_redemptions_booking_unique`), one redemption per (coupon, user)
  (`coupon_redemptions_user_coupon_unique`), and `409
  COUPON_BOOKING_ALREADY_DISCOUNTED` when another account already used the
  reference.

Prevented: two accounts sharing one booking reference, a second redemption by
the same user, malformed/oversized references, and any client influence over the
amount. **Not prevented: ownership of the reference**, because there is no
persisted booking to check against. An authenticated customer can redeem once
against an invented reference; that row has no monetary effect today (payments
disabled, no booking created) and it consumes their single per-coupon allowance.
**Booking ownership is not verified, and this register does not claim it.**
Closing it needs a server-created helper booking (owner + idempotency key) before
redemption, an FK from `coupon_redemptions.booking_id`, and an ownership
predicate in the same transaction — a booking-workflow change outside SEC-04's
approved scope, recorded as residual risk.

#### Idempotency, constraints, locking and outage — reviewed against tests

| Property | Implementation | Test |
|---|---|---|
| Idempotent replay | Same (coupon, user, booking) → 200 `idempotent: true` with stored values | `a retried redemption is idempotent instead of double-counting` |
| Same user, new booking | 409 `COUPON_ALREADY_REDEEMED` | `global redemption limit and per-user limit are enforced` |
| Reference owned by another account | 409 `COUPON_BOOKING_ALREADY_DISCOUNTED` | `a booking discounted for one account cannot be claimed by another` |
| Unique indexes (defence in depth) | 23505 on `coupon_redemptions_user_coupon_unique` / `coupon_redemptions_booking_unique` | `the unique indexes block a second redemption for a user or a booking` (**new**) |
| Coupon locking | `select … for update` before the count; 16 parallel → exactly 3 | `a hot limit of three is never exceeded by sixteen parallel redemptions` |
| Outage before connect/query | 503 `COUPON_DATABASE_UNAVAILABLE` | `a database outage fails closed with 503 instead of granting a discount` |
| Outage mid-transaction | rollback, no commit, client released, 503 | `a failure inside the redemption transaction rolls back and fails closed` (**new**) |

#### Browser journey

`e2e/helper-coupon-journey.spec.ts` (**new**, 1 test, Chromium): a disposable
customer signs in with the cookie harness, opens Services → Human Help, completes
steps 1–3, applies `HELPER10` and confirms. It asserts the rendered
`Applied on ₹239.00: ₹23.90 off`, that **both** coupon requests carry only
`code`/`durationId`/`helpers` (plus `bookingId` on redeem) and no money, and that
the stored row holds 239.00 / 23.90. No payment is enabled and no booking
workflow is invented — it drives the existing presentation-only journey.
Result: `1 passed (2.3s)`.

**Commands (final).** Focused suite → exit 0, **18/18**; `npm test` → exit 0,
**845/845**, 0 fail, 0 skipped; `npx tsc --noEmit` → 0; `npm run build` → 0;
`node supabase/tests/migration_manifest.mjs` → 0 (`PASS manifest verified`);
`git diff --check` → 0; coupon browser journey → **1/1**.

**SEC-04 status.** Local: **COMPLETE** (unit + DB + HTTP + concurrency +
browser). Hosted: **NOT APPLIED** — `20261122110000_coupon_validation.sql` and
`20261122120000_coupon_redemption_integrity.sql` still need owner-approved hosted
migration; until then the hosted project has no coupon tables and none of this
evidence extends to it. Payments remain disabled.


### 11.14 Production launch-readiness pass — API boundary fix and workflow evidence (2026-11-22)

Branch `integration/recover-20261115`, HEAD `add352b`, worktree preserved
(224 tracked entries before this pass, unchanged except the two files below).
No hosted read/write, no migration applied, no deploy, no commit, no reset,
stash or clean.

**Defect found and fixed — unmatched `/api/*` answered with the SPA shell.**
Reproduced on a local server: `GET /api/definitely-not-a-route`,
`GET /api/coupons`, `GET /api/public/movies` and `GET /api/auth/logout`
(POST-only) all returned **200 `text/html`** with the application shell. Cause:
Express had no API fallback, so the Vite dev middleware (`appType: 'spa'`) and
the production `app.get('*')` page route answered every unmatched path,
including `/api/*`. Impact: a typo, a removed endpoint or a wrong method looked
like a success, failed later in client-side JSON parsing with an unrelated
error, and could not be distinguished by monitoring. Fix: one JSON boundary
registered after every real API route and before both page fallbacks in
`server.ts` (`API_ROUTE_NOT_FOUND`, 404, `Cache-Control: no-store`).

Regression coverage: `tests/api-route-boundary.test.mjs` (new, 4 tests) boots
the real server and asserts unknown GET/write paths are JSON 404s, a wrong
method on a real path is a JSON 404, `/api/auth/config` still answers 200 JSON,
`/api/coupons/validate` still answers 401 JSON unauthenticated, and the page
shell still renders for the `/venues` deep link. Live post-fix probe on a local
server confirmed identical results.

**Workflows verified in this pass (Chromium, isolated clusters).**

| Batch | Specs | Result |
|---|---|---|
| Auth, session, authorization, routing | `auth-entrypoints`, `auth-role-and-session`, `authenticated-routes`, `session-cookie`, `access-control-api`, `admin-users-authorization`, `routes-inventory` | **71 passed**, exit 0 |
| Customer modules | `services-booking`, `stays-booking`, `stays-filters`, `venue-booking`, `classes-journey`, `movies-showtimes`, `site-chrome`, `builder-unpublish-ui` | **32 passed, 15 fixture-gated skips**, 0 failed, exit 0 |
| Post-fix regression | `app.smoke`, `auth-entrypoints`, `session-cookie`, `helper-coupon-journey` | **51 passed**, exit 0 |

Included in those runs: the Classes trainer→admin-approval→student-enrolment
journey with duplicate/last-seat/forged-fee refusals, waitlist ordering, the
stay and venue booking journeys with filters, the services booking journey, the
movie showtimes surface, and the regular-admin unpublish refusal (403).

**Controls probed directly over HTTP.**

- Rate limiting: 40 rapid `POST /api/auth/email-otp/request` → 12 × `400`
  then `429` for the rest; the auth budget is enforced.
- Personal endpoint headers: `GET /api/auth/me` unauthenticated → `401`,
  `Cache-Control: no-store`, `application/json`, body `UNAUTHORIZED_SESSION`
  with no stack or internal detail.
- Security headers on the shell: `nosniff`, `SAMEORIGIN`, `frame-ancestors
  'self'`, `strict-origin-when-cross-origin`, `Permissions-Policy`, no
  `X-Powered-By`.
- Fail-closed startup verified incidentally: with an unreachable
  `BOS_LISTINGS_DATABASE_URL` the server refuses to start
  (`BOS_LISTINGS_DATABASE_UNAVAILABLE`) rather than serving partial state;
  `NODE_ENV=production` additionally requires an https `APP_URL` and a
  production Supabase project distinct from development.
- Local-only sign-in (`/api/auth/local-dev/session`) is 404 outside
  development and without `BOS_LOCAL_DEV_AUTH=1`.

**Commands and results.** `npm test` → exit 0, **849/849** (845 before the new
file), 0 fail, 0 skipped. `npx tsc --noEmit` → 0. `npm run build` → 0 (only the
known chunk-size warning; main entry 1.09 MB / CSS 537 kB). `git diff --check`
→ 0. `node supabase/tests/migration_manifest.mjs` → 0 (`PASS manifest verified:
baseline + 127 migrations`).

**Not verified here (unchanged from 11.13 and the readiness report).** Hosted
DEV migrations, hosted Google sign-in, hosted RLS/tenant evidence, backup/PITR
and restore, payment provider live flows (payments remain disabled), the three
`NOT VALID` constraint validations, retention sign-off, release-owner Gitleaks
acceptance, mobile-viewport audit, and the full 247-test matrix (only the three
batches above were re-run this pass).

**Verdict: NOT READY FOR PRODUCTION.** The application code passed every
workflow exercised in this pass with one fixed defect; the remaining blockers
are hosted/operational, not application logic.
### 11.27 Production-readiness execution — build target guard, production client target, classes locator (2026-11-22)

Branch `integration/recover-20261115`, HEAD `3113eda`, worktree preserved (no reset, clean, stash, add,
commit or push). No hosted read/write, no migration, no deployment, no payment activation, no credential
access. SEC-04 and every completed implementation were left untouched.

**Defect 1 (CONFIGURATION → fixed) — a production build shipped the development project.** Reproduced:
`npm run build` inlines `obkfgxjzlscungkhbyvq` into four shipped assets
(`index-*.js`, `supabaseClient-*.js`, `emailOtpClient-*.js`, `demoDataPolicy-*.js`), and nothing failed the
build. The server refuses to *start* in production with a development target, but a bundle served by any
static host had no such check. Two mechanisms were added:
1. `scripts/verify-production-bundle.mjs` — pre-build gate (explicit, non-development Supabase target
   required, development allowlist refused, project id and URL must agree) and post-build scan (development
   project reference, `sb_secret_` key, PEM private key or credential-bearing PostgreSQL URL → fail).
   Development refs are read from `src/server/supabaseProductionGuard.ts`, so the two checks cannot drift.
2. `vite.config.ts` — `BOS_PRODUCTION_BUILD=1` points `envDir` at `deploy/production-env/`, so Vite stops
   loading the developer's `.env.local` (it is loaded in every mode) into a production build.
   `npm run build:production` chains prebuild gate → isolated build → bundle scan.
   Reproduced before the fix: the scan reported 4 development references, exit 1. After the fix: a build with
   a placeholder production ref while `.env.local` still exists contains **0** development references and the
   scan passes; `build:production` with no production values fails closed before Vite runs. A false positive
   was found and fixed during verification — the Supabase client legitimately tests
   `key.startsWith('sb_secret_')`, so the secret rule matches a complete key, not a bare prefix.

**Defect 2 (CODE → fixed) — the client could not target any production Supabase project.**
`resolveSupabaseConfig` accepted a hosted target only when it equalled
`VITE_SUPABASE_DEVELOPMENT_PROJECT_ID`, so a dedicated production project was always rejected
(`SUPABASE_DEVELOPMENT_PROJECT_NOT_ALLOWLISTED`) and production sign-in could never be configured. Added an
explicit production declaration: `VITE_SUPABASE_PRODUCTION_PROJECT_ID` is accepted only when it matches the
URL project, a project cannot be declared as both development and production, and the previous development
behaviour (including every existing error code) is unchanged when the variable is unset.
`tests/supabase-config.test.mjs` gained 5 cases; all 22 in that file pass. `deploy/env.production.example`
and `.env.example` document the variable.

**Defect 3 (CODE → fixed) — the classes browser journey failed on an ambiguous accessible name.** At HEAD the
header renders a `Switch to Dark Mode` button whose accessible name contains "Mode", so
`getByLabel('Mode')` matched two controls and the filters test aborted with a strict-mode violation
(`e2e/classes-journey.spec.ts:382`). Fixed the locator (`{ exact: true }`); the app's accessible names are
correct and unchanged.

**Verification (this pass).** `npx tsc --noEmit` exit 0. `npm test` **862/862, 0 failed, 0 skipped**
(92 s, isolated PostgreSQL, baseline + 127 migrations). `npm run build` exit 0 (development bundle still
contains the development target, as intended). `node --test tests/production-bundle-guard.test.mjs`
**13/13** pass. Chromium: 61 passed / 1 failed / 15 skipped / 3 not run before the locator fix; the failing
classes journey is the subject of defect 3 and now passes 4/4 (§11.28).

**Remaining blockers are not application logic** — production Supabase project and hosted migration apply
(B5 signature, B6 PITR/restore), hosted OAuth, deployment/secrets/monitoring, payments intentionally
disabled, Gitleaks acceptance. Release checklist: `BOOKOURSPACE_REACT_PRODUCTION_RELEASE_CHECKLIST.md`.

**Verdict: READY AFTER EXPLICIT OWNER ACTIONS.** The application code is release-capable for the verified
journeys; no production deployment is authorised by this entry.

### 11.28 Browser matrix result and the classes filter control (2026-11-22)

**Chromium run (10 specs, 1 worker, `--retries=0`): 61 passed, 1 failed, 15 skipped, 3 not run.**
Specs: `mobile-responsive`, `auth-entrypoints`, `auth-role-and-session`, `access-control-api`,
`admin-users-authorization`, `movies-showtimes`, `venue-booking`, `services-booking`, `classes-journey`,
`helper-coupon-journey`. The 15 skips are the documented fixture-gated cases; the 3 "not run" are the
remaining tests in `classes-journey` after its first test failed, which Playwright stops by design.

**Fixed during the run — the classes `Mode` filter select had no usable accessible name.** Its `<label>`
wraps both the visible text and the `<select>`, so the browser folded the option text into the accessible
name: `combobox "ModeAllOnlineOfflineHybridRecorded"`. That made `getByLabel('Mode')` ambiguous with the
header's `Switch to Dark Mode` button (strict-mode violation at
`e2e/classes-journey.spec.ts:382`). `FilterSelect` in `src/components/ClassesTimingsExperience.tsx` now sets
`aria-label={label}` on the select; the page snapshot after the fix reports `combobox "Mode"`, and the spec
uses `{ exact: true }`.

**Diagnosis of the earlier 180 s timeouts (three hypotheses, tested).** Two throwaway instrumented runs
measured the journey's exact failure point; both were deleted afterwards.
1. *Is the select disabled?* **No.** `count = 1`, `isEnabled = true`, `isVisible = true`, `isEditable = true`,
   `disabled = false`, box 74×15 at (570,328) unchanged across 2 s of sampling, and `document.elementFromPoint`
   returns the select itself (no overlay, no open dialog, body `overflow: clip visible`).
2. *Does the page fail to settle?* **No.** Main-thread `evaluate` round trip **4 ms**, DOM mutations steady at
   **13/s** (ordinary React updates, not a render loop), and `selectOption(..., { trial: true })` passed; the
   real selection then completed in **23 ms** on a clean page.
3. *Is the harness API dying?* **Not during the filter step.** The instrumented runs logged no failed API
   request and no `ECONNREFUSED`; the `[classes-harness] API process exited` lines are the harness's own
   `restartApi()` (spec line 468) and `stop()` cleanup. The single `ECONNREFUSED` seen earlier coincided with
   Vite re-optimizing dependencies after `vite.config.ts` was edited mid-session
   (`[vite] Re-optimizing dependencies because vite config has changed`), i.e. a document reload while the run
   was in flight.

**Result: the journey passes on a stable tree.** The unmodified committed spec at `classes-journey.spec.ts:292`
passed (**1 passed, 11.9 s**), and the whole file then passed **4/4 in 51 s**
(`trainer→admin approval→enrolment→duplicate refusal→cancellation`, waitlist ordering, forged-fee/last-seat
refusals, and the mobile/tablet/desktop enrolment journey). The earlier timeouts were an artifact of editing
`vite.config.ts` and component source while that run was live — not a disabled control, not a dead API, not an
unstable page. The only real defect was the accessible-name ambiguity recorded above, which is fixed.

**Verified this pass:** `npx tsc --noEmit` exit 0; `npm test` 862/862 with 0 failed and 0 skipped; `npm run
build` exit 0; `node supabase/tests/migration_manifest.mjs` PASS (baseline + 127 migrations); guard suite
13/13; `git diff --check` exit 0. The 61 passing browser tests cover mobile responsiveness and CLS, signed-out
and signed-in auth entry points, role/session boundaries, API authorization, admin user authorization, movie
showtimes, venue booking, service booking and the coupon journey.

**Release impact.** The classes module is verified in Chromium. The verdict is unchanged —
**READY AFTER EXPLICIT OWNER ACTIONS** — because the remaining gates are production environment, hosted
database, OAuth and recovery evidence, not application behaviour. The journey should still be re-run on the
deployment target as part of the release smoke tests.
