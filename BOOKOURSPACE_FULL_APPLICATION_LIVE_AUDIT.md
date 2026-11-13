# BOOKOURSPACE — Full Application Live Reality Audit

Audit date: 2 November 2026 (Asia/Calcutta). Repository: `C:\Users\windows\Desktop\withreact\bookourspace-react`. Branch: `feat/windows-stays-airbnb`. Inspected HEAD: `83ed2cc`; the pre-existing extensive tracked and untracked changes were preserved. No commit, push, merge, deployment, production record change, real payment, or real refund was performed.

## Release decision

**FAIL — not ready for a production launch.** The application contains working UI and some real integrations, but every visible feature is not genuinely functional. The default marketplace displays seeded businesses, reviews, bookings, notifications, and transactions. Its booking authority is a local JSON file rather than a PostgreSQL transaction. Legacy authentication accepts unverified identities. Several privileged endpoints accept unauthenticated requests or caller-supplied roles. Other payment paths can fabricate success independently of Razorpay.

Real evidence obtained during this audit:

- Current source: **44 automated tests passed**, zero failed/skipped. `npm run lint` is TypeScript `tsc --noEmit`, not an ESLint/style/security audit. It passed. Production build and `git diff --check` passed.
- Intended Supabase project `ezrxykyocgbolpaebnqx`: successful read-only SQL and anonymous HTTP reads. Database size at inspection: **12,277,427 bytes (~11.71 MiB)**. This is total database size, not the size of this feature or Storage objects.
- Hosted tables: `public.tasks`, `public.movie_theatres`, `public.movie_titles`, `public.movie_showtimes`, and three `cinema_private` tables. Every inspected table has RLS enabled. All three Movies catalogue tables have **zero rows**, Auth has **one user**, Movies permissions has **zero rows**. Marketplace `profiles`, `listings`, and `bookings` tables are **absent**.
- Current `supabase db lint --linked`: **no schema errors found**. Earlier reports of unrelated function errors do not describe this execution.
- Razorpay test-key authentication: actual read-only `GET /v1/orders?count=1` returned **HTTP 200**. No checkout, payment capture, or refund was executed; this does not establish payment E2E success.
- Native Chrome Stays journey: search, guests, rating filter, Leaflet map, property details, second gallery image, room selection, price breakdown, and booking-form handoff **passed**. No booking was submitted in that browser test.
- Firefox broader audit: navigation and Stays handoff/favorite persistence worked, but five checks failed with Vite dynamic-import/module-load problems. WebKit crashed; an Edge run lost its browser session. These suites are not overall passes.
- An isolated native PostgreSQL replay passed the existing Movies visibility/RLS/rollback contract, customer/provider fixture isolation, repeated seeding, and disabled-theatre preservation. It uses fixture Auth and Realtime interfaces, **not Supabase Auth/PostgREST/Realtime E2E**. The subsequent expanded concurrency rerun failed to initialize because the Windows drive was full. Concurrent visibility edits are therefore **not verified by the new test**.

## Evidence and scope

Evidence files (generated locally, no credentials included):

- `output/audit/api-findings.json`: executed current-server vulnerability probes in a temporary local store, with gateway credentials blank.
- `output/audit/database-readonly.json`: actual hosted schema, RLS policies, constraints, aggregate counts, database size.
- `output/audit/source-inventory.json` and `output/audit/SOURCE_INVENTORY.md`: component, handler, route and table inventory.
- `output/audit/browser-chrome.json` / `.log`, `output/audit/browser-firefox.json` / `.log`: executed checks, failures, viewport results and page errors. Files reflect their latest completed attempts; initial runtime/tooling failures are described below.
- `output/playwright/audit-chromium-mobile.png`, `output/playwright/audit-firefox-mobile.png` when available: browser screenshots.
- `output/demo/postgres-validation.json`: the successful initial native PostgreSQL run. Its `concurrentVisibilityUpdates` flag is absent because the expanded run did not finish.

The inventory found **60 component files**, **1,135 onClick/onSubmit/onChange occurrences in those components**, **56 HTTP route declarations**, and **20 locally declared tables**. Counts are source discovery, not a count of independently verified user actions. Some handlers are conditional or belong to legacy screens. App-level handlers are additional.

This audit reviewed source across all six business areas and the shared flows below, exercised the stated public browser journeys, inspected hosted database metadata, and executed isolated API probes. **Not every conditional admin/modal interaction or input permutation was clicked.** Authenticated staging users, real-device access, full OAuth account switching, and provider settlement were unavailable. Unexecuted paths are explicitly BLOCKED or source-only; the inventory is the remaining interaction checklist, not a fabricated all-buttons PASS.

Classifications: LIVE VERIFIED means the specified real service operation was executed successfully; DEMO means visibly labelled samples; SIMULATED means local/mock/generated behavior; BROKEN means an observed failure or source-proven incorrect behavior; BLOCKED means missing environment/access/verification; NOT IMPLEMENTED means no corresponding implementation was found. A working UI does not make its data LIVE VERIFIED.

## Module matrix

| Module | UI | API | DB | E2E | Classification / release status |
|---|---|---|---|---|---|
| PGs & Hostels | Listing/navigation rendered in Chrome and Firefox | Shared JSON booking/enquiry paths | Marketplace tables absent; frontend key not configured | UI navigation only | SIMULATED / FAIL |
| Classes & Courses | Cards/navigation rendered | Shared booking path; calendars/comparison largely browser state | Marketplace tables absent | UI navigation only; no paid enrolment verified | SIMULATED / FAIL |
| Function Halls | Cards/navigation rendered | Shared JSON slot booking | No hosted venue inventory/booking persistence | UI navigation only | SIMULATED / FAIL |
| Home Services | Search/layout/category/provider UI rendered | Shared JSON request path; missing true provider messaging | No hosted marketplace records | Navigation verified; not fulfilment | SIMULATED / FAIL |
| Hotels & Stays | Search/filter/map/gallery/details/booking handoff verified | Current isolated probes demonstrate invented-booking and overlap defects | Local JSON; no real stay booking tables deployed | Chrome handoff PASS; Firefox handoff PASS, suite FAIL | SIMULATED + BROKEN / FAIL |
| Movies | Labelled four-movie local demo works in Chrome | Real anonymous feed HTTP 200, empty; admin request without token HTTP 401 | Real Movies schema/RLS inspected; zero catalogue and permission rows | Chrome demo filters verified; Firefox suite has failures | DEMO UI; LIVE VERIFIED empty read; BLOCKED admin E2E / FAIL |
| Authentication | Login UI and two session systems exist | Legacy identity/session issuance spoofable; Movies verifies Supabase token | One hosted Auth user; no Movies grants; marketplace profiles absent | Real Google sign-in/account-switch/session-isolation not executed | BROKEN + BLOCKED / FAIL |
| Payments | QR/Razorpay and legacy methods exist | Razorpay test credentials authenticate; UTR pending safeguard works; other fake-success paths remain | JSON intents, frontend transaction cache; no verified financial ledger deployed | No gateway capture/refund E2E | BROKEN + BLOCKED / FAIL |
| Admin | Large dashboard and theatre management exist | Legacy unauthenticated reads/caller-role checks; Movies route separately protected | Movies policies exist; no authorized admin fixture in hosted project | Privileged probes isolated; live admin edits not executed | SIMULATED + BROKEN + BLOCKED / FAIL |
| Super Admin | Legacy Supreme panel plus Movies permission controls | Movies Super Admin checks in code/native fixture; legacy admin identity untrustworthy | Zero hosted Movies permission rows | No hosted Super Admin login/grant/revoke flow executed | BLOCKED; legacy BROKEN / FAIL |

## Discovery: actual screens, state and integrations

The main application is a React SPA orchestrated in `src/App.tsx`, with component state and modals rather than a complete URL router. Business areas are `pg_hostels`, `classes`, `venues`, `services`, `hotel_stay`, and `movies`. Services, Stays, Movies, theatre administration, and maps have lazy imports. Hidden classic grids and `DistrictMoviesSection.tsx` remain in source; the new public movie feed excludes local cinema records through `src/features/movies/publicListings.ts`. Legacy seat/booking/payment endpoints still exist server-side; the public display-only screen does not remove those endpoints.

Reviewed shared areas include the home hub, category ribbons, global search, area selectors, radius/sort/date/rating filters, Leaflet map, listing details, saved listings, comparisons, recently viewed, booking enquiry and legacy booking modals, gallery, provider registration/posting, running batches/course calendar, login/profile/settings, notifications, chat/voice, AI quick booking, payments, wallet, invoices, reviews, QR passes, and admin modules for users, billing, integrations, data, analytics, themes, announcements, live-page configuration and permissions. See the component inventory for exact filenames and source handler counts.

API groups discovered: live-page config/draft/publish/rollback; billing records/run-cycle; AI quick-book; Google URL/callback/authenticate/session/me/logout/protected-route; seat locks/holds/releases; payment intents/UPI verification/simulated settlement/Razorpay order and verify; atomic bookings/cancellation/pass verification; isolation views; admin users/status/role/verification; notifications/send/read/clear; provider listing CRUD; module configuration; legacy cinema screens/bookings/refunds/support; and public/admin Movies RPC routes. `server.ts` and `src/server/movieRoutes.ts` contain the full route inventory. The duplicate legacy `/api/movies/inventory` declaration is shadowed by the earlier RLS-backed Movies router.

Configured integrations observed: Movies Supabase URL/publishable key, Razorpay **test** ID/secret. Main marketplace `VITE_SUPABASE_PUBLISHABLE_KEY`/anon key is absent in `.env.local`; main frontend Supabase persistence is therefore disabled in this environment. Secrets were checked by presence/mode only, not copied into this report. Google is enabled in the hosted Supabase Auth settings, and email auth is also enabled. No configured authorized daily movie feed, sync service credential, staging project, or staging accounts were evidenced in the inspected environment.

The native runtime is Windows NT 10.0.26200, Node 24.22.1, npm 11.19.1, Supabase CLI 2.113.0, Vite 8.3.5. Linux `libasound2t64` is not appropriate for this Windows runtime. No OS package change was made. No native Android/iOS or Flutter application was found in this repository.

## Critical findings

### C1 — Legacy authentication accepts unverified identity (OPEN)

Rule: EXPRESS-INPUT-001 / REACT-AUTHZ-001. Locations: `server.ts:2058` (`/api/auth/google/authenticate`), `server.ts:2250` (`/api/auth/session`), `server.ts:1824` (callback), `server.ts:854` (HMAC configuration), `server.ts:1406` (token verification).

Evidence: the authenticate route passes caller `email` and `googleSub` directly to `authenticateOrRegisterGoogleUser` without verifying a Google/Supabase token. In the isolated current-server probe an arbitrary `example.com` identity received **201 + a signed session**. The session route similarly returned **200 + a token** for caller-specified identity. Callback query identity and JWT payload decoding in its HTML do not establish token authenticity. OAuth state is encoded JSON, not verified one-time state bound to the initiating browser. Source supplies fallback HMAC/admin-passcode values; their contents are intentionally redacted.

Impact: an attacker can impersonate identities; source email allowlists and legacy signed sessions cannot be trusted to authorize bookings or admin work. A signature over an unverified identity does not repair authentication.

Required fix: one verified identity authority; verify Supabase bearer tokens server-side, require the Google provider for the approved flow, derive identity and server-managed roles from verified records, eliminate unverified issuance/callback shortcuts and hardcoded signing/passcode fallbacks, and bind OAuth state to a short-lived initiating session. Credential rotation requires separate operator approval. This is a coordinated auth change, left OPEN rather than replaced by another mock.

### C2 — Legacy admin authorization and private reads are insufficient (OPEN)

Rule: REACT-AUTHZ-001 / EXPRESS-INPUT-001. Locations: `server.ts:251`, `:292`, `:366` live-page mutations, `:418` billing read, `:426` run-cycle, `:3458` admin users, `:3466` user creation, `:3684` notifications.

Evidence: live-page routes inspect `req.headers['x-admin-role'] || req.body?.role`. Several handlers reject a non-admin session only when `claims` exists, allowing missing claims to proceed. Anonymous actual localhost GETs returned **200** for users (14 records), billing (6 records), and module configuration. The isolated empty admin-user POST reached payload validation (**400 NAME_AND_PHONE_REQUIRED**) instead of rejecting authentication. An empty draft POST with forged admin header similarly reached **400 Missing config payload**. Invalid payloads were used to avoid changing application configuration. Notifications can be filtered with caller role/user query parameters.

Impact: disclosure of user/financial/admin data and possible unauthorized privileged mutations. No production admin mutation was attempted.

Required fix: common mandatory authentication plus deny-by-default server authorization on every admin/billing/provider/notification route; derive subject/scope from verified claims and stored ownership, never client role headers. Movies' separate token/permission checks are stronger and must not be weakened.

### C3 — Booking authority does not validate the actual commercial resource (OPEN)

Rule: EXPRESS-INPUT-001 / REACT-AUTHZ-001. Locations: `server.ts:2864` atomic handler, `server.ts:2990` payment lookup, `server.ts:3086` confirmed status, `server.ts:1322` JSON persistence; `src/context/MarketplaceContext.tsx:1112` local booking cache.

Executed isolated probes: no session + invented listing + caller total **1** returned **201 confirmed**. A second overlapping multi-night stay returned **201 confirmed**. A different issued identity replayed the first idempotency key and received the original booking (**200**).

Source trusts listing/provider IDs and amounts, checks exact date/time slot strings rather than all occupied nights, and uses synchronous read/modify/write of a JSON file. Payment lookup does not bind a verified intent to the authenticated customer, exact listing/quote, amount and one-time consumption. `requireVerifiedPayment` is client-selected. Price and availability are not provider-inventory transactions in PostgreSQL. The frontend creates a second local booking identity after the JSON result; best-effort optional DB writes do not make both stores atomic.

Impact: fabricated confirmations, overselling, replay/disclosure, incorrect charges and divergent ledgers. Required fix: authoritative catalogue/room inventory and quote calculation, mandatory verified ownership, scoped idempotency, per-night locking or constraints, verified payment binding/consumption, and one PostgreSQL booking transaction. Do not deploy the existing handler as a reservation engine.

### C4 — Alternate payment, wallet and provider-plan flows fabricate financial success (OPEN)

Locations: `src/components/PaymentModal.tsx:410` finalization, `:1189` Google Pay callback; `src/components/UserWalletAndQuickModals.tsx:103`; `src/components/PostListingWizard.tsx:1467`; `src/context/MarketplaceContext.tsx:1238` recordPayment.

Source evidence: `PaymentModal` checks provider verification inside its UPI branch, while card/netbanking/Google Pay finalization can reach `recordPayment` without a captured-gateway proof. Wallet top-up immediately adds a `Settled` ledger entry and records payment locally. Provider request submission calls `recordPayment` after a timer with no gateway verification. The context assigns `status: 'success'` unconditionally. These paths were not executed against real payment services during this audit.

Impact: balances, subscriptions, receipts and listings can claim payment success without settlement. Required fix: all payment-related state transitions must consume a server-issued verified/captured result with ownership and amount checks; wallet ledger and provider-plan activation must be transactional. Keep unsupported methods pending/unavailable instead of fabricating success. Gateway-verified Razorpay booking code does not secure every legacy payment screen automatically.

## High-priority findings

### H1 — Hosted marketplace schema/persistence is missing (OPEN)

Actual hosted metadata shows marketplace profiles/listings/bookings absent; the main frontend publishable key is unconfigured. `src/context/MarketplaceContext.tsx:207` initializes seed/cache state and `:341` conditionally hydrates/merges remote records. `src/lib/supabaseClient.ts:260` and its sibling CRUD helpers exist but their presence is not successful persistence. Most writes ignore returned failure booleans after updating UI. Refreshing localStorage is not multi-user/database/restart verification. Deploy and validate reviewed migrations only in isolated staging first; applying `schema_and_rls.sql` unchanged is unsafe because of H2.

### H2 — Local SQL booking/payment contracts need redesign before deployment (OPEN; source-only)

`supabase/schema_and_rls.sql:551` defines a SECURITY DEFINER booking function accepting caller amount and payment status, without deriving a trusted price/settlement or enforcing a stay inventory model. Its idempotency lookup is not user-scoped. `:716` cancellation accepts caller refund amount/status, including `completed`, even though its comment says it only initiates refunds. Profile insertion/notification/provider policies also need targeted abuse tests before installation. These marketplace tables/functions are not present in the inspected hosted project, so these findings concern the proposed local schema, not a proven deployed exploit. Test hostile calls with separate staging users, audit grants, and make financial fields server-owned.

### H3 — Account data is merged into shared browser caches (OPEN)

`src/context/MarketplaceContext.tsx:417` merges bookings by ID; generic localStorage keys hold bookings/reviews/transactions. `:703` logout clears identity state but not those account datasets. Seeded bookings are shown before login. This is a source-proven isolation risk for shared browsers/account switching; two real OAuth accounts were not available to verify it end-to-end. Scope caches by verified user, clear private React/storage state on logout/subject changes, and replace private remote snapshots rather than merging prior users' data.

### H4 — Cancellation UI and refund settlement are disconnected (OPEN)

`src/App.tsx:5233` calls the context's local `cancelBooking`; it does not call `cancelStayBookingAtomic`. The server cancellation route requires a legacy session but permits any provider role without checking ownership of that booking's listing. Its policy is a fixed 80%/24-hour rule, not provider inventory policy, and its check-in time uses UTC. No real provider refund API or reconciled settlement worker was found. The isolated integration test proves a local `initiated` state, not money returned. Fix provider ownership, connect the customer action to the transaction, use the property's timezone/policy, and implement idempotent gateway refund reconciliation.

### H5 — Reviews, ratings, chat and verification claims are generated (OPEN)

`src/data/seedData.ts:649`, `:667`, `:690` define bookings, verified reviews and successful transactions. Other data generators assign business names, phone numbers, ratings, counts, prices and distances. `src/components/ReviewSubmissionModal.tsx:197` can substitute a positive sample comment and sets `verifiedCustomer: true` without a completed-booking check. `src/components/ChatModal.tsx:108` generates random provider replies after a timer, including availability/callback promises. `src/components/AdminIntegrationsSection.tsx:151` simulates status/latency; billing run-cycle assigns email-sent states without an email service. These must be visibly labelled demonstrations or connected to actual providers and independent evidence. Unverified seeded information must not be published as real availability, reputation, contact or settlement.

### H6 — Invoice correctness and trust remain incomplete (OPEN; HTML injection FIXED)

`src/utils/gstInvoiceGenerator.ts` contains a sample company GSTIN, client-generated numbers, fixed tax assumptions, a hash-pattern SVG described as a validation QR, and a download that is HTML despite the function's PDF name. A generated IRN string is not evidence of official invoice registration. Receipts can say `Grand Total Paid` from local data. Do not treat them as proof of payment or tax compliance. A server financial ledger, merchant-validated tax rules and proper invoice/pass verification are prerequisites. User-controlled invoice text previously entered a print iframe as raw HTML; escaping was fixed in this audit with two passing tests.

### H7 — No successful end-to-end webhook/refund verification (BLOCKED / partly NOT IMPLEMENTED)

Razorpay signature checking and a payment lookup exist; captured-only validation is now fixed. There is no observed incoming signed Razorpay webhook route with event deduplication/settlement and refund reconciliation. Direct UPI accepts a UTR only as pending, as it should, but no actual bank/provider settlement integration was evidenced. Test credentials alone do not prove checkout, failure recovery, exact-quote binding, duplicate-event handling, refund settlement or durable reconciliation. Run those flows only in an isolated authorized sandbox after fixing C1–C4.

## Medium and low-priority findings

| ID | Finding and evidence | Required follow-up |
|---|---|---|
| M1 | Public Movies is one page of movie/theatre groups with inline times (`MoviesNowShowing.tsx:38`), not the approved poster page -> separate movie showtimes page. No date/format detail navigation exists in that component. | Build the second display-only page with real available metadata; do not invent ratings/trailers/distance. |
| M2 | Language filtering runs after a 30-showtime server page (`MoviesNowShowing.tsx:26`); Next is based on filtered row count. | Filter before server pagination and use a real continuation/total. A matching movie on later pages can otherwise be unreachable. |
| M3 | Demo date is fixed at 3 November 2026, and demo filtering does not discard expired shows. Read-only demo admin marks Metro Garden OFF while public demo still includes it. | Use explicitly labelled relative-date fixtures and one coherent demo visibility source. Real hosted public filtering separately checks visibility/time. |
| M4 | Manual theatre visibility/permissions/audit controls exist; theatre-name/address/showtime metadata edit endpoint was not found in the new Movies router. Daily sync script exists without a configured feed/scheduler. | Authorize metadata edit separately and configure an authorized source/scheduler; prove sync cannot reset visibility. |
| M5 | Actual hosted theatre state constraint allows AP/TS/KA only, whereas local code and the second migration include Tamil Nadu. Actual grants on public RPC wrappers also differ from local revoke statements. Internal private-function grants still restrict anonymous mutation. | Review schema/grant drift in staging; no production migration was applied here. |
| M6 | Real browser geolocation resolves only bounded Hyderabad localities. The 5 km filter uses stored listing distances, not GPS-to-listing distance; maps may use shared approximate locality centres. | Label approximations, compute real distances only with verified coordinates, support other cities without false location claims. |
| M7 | Stays favorite persistence was fixed; Services cards still use local `liked` state (`ServicesExplorer.tsx:311`). | Use the existing shared favorites context and verify refresh/account behavior for Services too. |
| M8 | Stay fees are fixed 5% cleaning, 8% service, 12% tax in `staysUtils.ts:129`; room selection is a single provider-tariff radio, and no remote availability query occurs in the explorer. | Use an authoritative quote and provider-managed room types/units; do not interpret search results as confirmed availability. |
| M9 | Dialogs/clickable cards often lack semantic dialog roles, focus trapping or keyboard equivalents; some movie mobile text is 9px. The screenshot uses three poster columns and a second page, while current mobile UI has two detailed columns and duplicate global/local search controls. | Keyboard/screen-reader audit, usable type sizes, dialog focus, then image-based comparison at matching dimensions. No 100% parity claim is justified. |
| M10 | `npm audit --json` fails ENOLOCK; no tracked npm lockfile. | Establish a reviewed lockfile and reproducible CI, then rerun vulnerability audit. No dependency was upgraded or auto-fixed. |
| M11 | Main production JS is 2,441.66 kB, gzip 620.19 kB; CSS 383.09 kB, gzip 44.76 kB. Public assets total 11,328,900 bytes with several >1 MB images. | Split large admin/editor modules, compress/resize existing images, avoid duplicate assets. Preserve functionality. |
| M12 | Supabase listing/bookings/reviews helpers fetch unbounded sets, often `select('*')`; pagination in Stays/Services is in memory. | Server pagination and targeted fields/indexes after authoritative schema design. |
| M13 | No app rate limiter/security-header middleware found; JSON limit is 10 MB. Public live config exposes draft/audit data; default Express metadata is observable. | Add route-scoped limits, structured errors and appropriate headers; verify edge behavior before deployment. CORS/CSRF depend on the final auth model; no exploit is claimed solely from missing middleware. |
| L1 | Vite warns about `__dirname` config loading and ineffective dynamic import of statically imported Supabase client. | Clean up config and use deliberate module boundaries. |
| L2 | Some Settings/Profile actions are placeholder alerts; voice and profile-upload paths include simulation. | Use the component inventory to replace placeholders with working, verifiable actions or honest unavailable states. |

## Database validation and production impact

Read-only SQL was run through the linked project's CLI Management API inside `begin read only ... commit`. No production table rows, grants, policies or schema were changed. CLI login-role initialization is tooling-managed connection setup, not an application migration. Anonymous PostgREST read and public Movies API each returned HTTP 200 with zero showtimes. The admin Movies endpoint rejected a missing token with HTTP 401. An empty catalogue does not prove row-level isolation between two actual users.

Hosted Movies RLS uses `cinema_private.is_public(kind,id) OR cinema_private.is_admin()`. Inspected catalogue tables have primary keys, ID/name checks, restricted state values, and showtime foreign keys with ON DELETE RESTRICT; title legacy IDs are unique. Private permission/audit tables have RLS and no direct public read policies. Source visibility changes use ordered row locks, an advisory transaction lock, version checks and protected audit records. Sync upserts omit admin flags/versions. Those are positive design findings; they do not replace executed staging mutation/concurrency tests.

The initial successful native PostgreSQL test installed the local migrations and base schema in a fresh temporary cluster, used fixture roles/JWT lookup and a stub Realtime function, ran the existing rollback contract, seeded twice, and exercised local owner/provider isolation. Counts were 6 fixture profiles, 29 listings, 4 movies, 4 theatres, 16 showtimes, 3 favorites and 3 notifications. Catalogue row storage was 38,888 bytes; native database size 9,680,575 bytes. Fixture rows are original demo records, not real business data.

Expanded native test: two psql processes contend to change the same theatre version; intended assertion is one winner and one serialization failure. That added test is present, but the first rerun hit initdb timeout and the later rerun failed with **No space left on device**. It has **not passed**, and no staging concurrency/rollback run occurred. `test:movies:db` and `test:movies:concurrency` point at the linked hosted project and were intentionally not run: rollback is not authorization to perform production test writes/locks. No isolated staging project or staging identities were available.

Database growth caused in production by this audit: **zero application rows/tables/assets added**. Storage-bucket object sizes were not measured. Temporary native test clusters and browser-runtime downloads consume local disk. The C: drive later reported zero free bytes. Deletion of stopped audit-created clusters was rejected by automatic approval review; no alternative deletion was attempted and no user data was removed. The native initdb failure reported removing its own incomplete `data` directory automatically. Existing repository/output artifacts were preserved.

## Authentication and role test status

| Check | Result |
|---|---|
| Hosted Google enabled setting | LIVE VERIFIED read: true |
| Google-only enforcement across app | FAIL: hosted email auth enabled, Movies admin uses email OTP, legacy identity is spoofable |
| New/existing real Google sign-in | BLOCKED: no completed interactive Google login performed |
| Legacy unverified identity/session issuance | FAIL, reproduced in isolated process |
| Missing legacy auth/me token | HTTP 401 verified |
| Missing Movies token | HTTP 401 verified on running app |
| Ordinary-user/provider Movies mutation denial | Router fixture tests and native SQL contract PASS; hosted two-user test BLOCKED |
| Movies Super Admin grant/revoke/audit | Native SQL fixture contract PASS; hosted real session BLOCKED, zero grant rows |
| Real session refresh/logout/expiry/account switch | BLOCKED; browser cache isolation concerns found in source |
| Real provider ownership and user isolation | Native SQL fixture isolation PASS; live app DB path unavailable |

## Executed checks and browser evidence

| Command/check | Actual outcome |
|---|---|
| `npm test` | 44 passed, 0 failed, 0 skipped; includes 2 Movies router tests, 1 Stays isolated-server integration scenario, security/pure-function and source contract checks |
| `npm run lint` | PASS; TypeScript only |
| `npm run build` | PASS, 2715 modules; large-chunk/config/dynamic-import warnings remain |
| `git diff --check` | PASS; LF/CRLF warning on existing App.tsx |
| `node --import tsx src/lib/razorpaySecurity.test.ts` equivalent test invocation with `--test` | Before fix missing-export failure; after fix 2 tests PASS |
| `node --import tsx --test src/utils/gstInvoiceGenerator.test.ts` | Before fix 2 tests FAIL for raw HTML/text escaping; after fix both PASS |
| `node --import tsx scripts/audit-api.ts` | Completed isolated probes; findings include security failures, not an overall application PASS |
| `supabase db query --linked --file scripts/audit-database.sql --output-format json` | PASS read-only inspection |
| `supabase db lint --linked` | PASS, no schema errors |
| `npm audit --json` | BLOCKED/FAIL ENOLOCK |
| Initial `npm run test:demo:postgres` | Native PostgreSQL fixture contracts PASS, not Supabase E2E |
| Expanded `npm run test:demo:postgres` | BLOCKED by initdb timeout then disk-full error; new concurrency check unexecuted |
| Initial `npm run test:e2e` | FAIL: WSL Firefox could not reach Windows loopback (`NS_ERROR_CONNECTION_REFUSED`) |
| First native runner retry | FAIL: inline JavaScript arguments split on Windows; runner subsequently changed to `--filename` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stays-e2e.ps1 -Browser chrome` after fixes | PASS through payment-option form; no booking/payment submitted |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/audit-browser.ps1 -Browser chrome` | Broad navigation/Movie filters/geolocation and responsive checks executed; earlier Stays marker interaction failed. Latest artifact is not a full-suite PASS |
| Same broader command `-Browser firefox` | Firefox 158: 9/14 checks PASS, 5 FAIL; all 5 Movies viewport-overflow checks PASS. Errors include Vite dynamic-import failure and websocket closure |
| Same broader command `-Browser webkit` | Browser installed/launched, then `Target crashed`; no suite PASS |
| Same broader command `-Browser msedge` | Installed Edge launched, then `Session closed`; no suite PASS |

Playwright CLI 0.1.23 used Chrome 156.0.8078.76 and Firefox 158. Matching Firefox/WebKit runtime revisions were initially missing and were installed into the user's Playwright cache; no Linux audio packages/system configuration were changed. Early parallel runs suffered daemon/session crashes and timeouts. A long-lived audit-owned browser daemon consumed approximately 3.3 GB working memory; after graceful close stalled, that exact verified audit daemon was stopped. This is tool/runtime evidence, not a measured application heap leak. The existing application server was not stopped or restarted.

Browser widths exercised: 320x740, 390x844, 844x390, 768x1024 and 1366x900. The recorded Movies overflow checks passed at these sizes. This is viewport emulation on Windows, not Android/iPhone/iPad hardware validation. macOS Safari, actual iPhone/iPad Safari, Android Chrome/WebView, iOS WebView, native apps, screen readers, sustained slow-network/offline recovery and a complete keyboard-only journey are **BLOCKED/not executed**. A Windows WebKit run is not Safari-on-macOS verification.

The suite initially targeted a hidden second `<main>` and carried global location state between scenarios. Those harness issues were corrected by selecting the visible main and starting independent journeys from a fresh page. Co-located approximate map pins also make a lower overlapping marker difficult to click; the handoff test now clicks the topmost rendered marker naturally, without forced clicks. This does not prove every overlapped marker is individually reachable on the map.

## Safe remediation completed in this audit

1. **Captured-payment gate:** `src/lib/razorpaySecurity.ts`, `src/lib/razorpaySecurity.test.ts`, `server.ts`. Rejects authorized/failed payments, mismatched order/payment ID, wrong currency and wrong amount before verified status. Unit tests ran red then green. Actual provider-captured checkout is still BLOCKED.
2. **Invoice HTML escaping:** `src/utils/gstInvoiceGenerator.ts`, new `src/utils/gstInvoiceGenerator.test.ts`. All string fields are escaped at the document-generation boundary. Tests demonstrated raw markup injection before the fix and safe literal text afterward. This does not validate tax policy, settlement or official invoice registration.
3. **Stays favorites:** `src/components/StaysExplorer.tsx`. Replaced per-card `useState(false)` with the existing marketplace favorites store and added `aria-pressed`. Browser reproduction failed before the fix; refresh persistence passed in the broader audit. This proves browser persistence, not account-scoped live Supabase persistence.
4. **Native E2E runner:** `scripts/stays-e2e.ps1` and new `scripts/stays-browser-scenario.js`. Uses native CLI on Windows, reads scenario from file, checks CLI error output, validates current real Leaflet/gallery/room/price labels and the payment-form handoff, and fixes the mismatched success marker. Existing customer actions were preserved.
5. **Audit evidence:** new `scripts/audit-api.ts`, `scripts/audit-browser.ps1`, `scripts/audit-browser-scenario.js`, `scripts/audit-database.sql`, `scripts/audit-inventory.ts`; native `scripts/demo/validate-postgres.ts` extended with actual concurrent connections and bounded initdb time. The expanded concurrency test remains blocked and is not presented as passing.

No frontend-only mock was added to replace a backend. Production RLS or permissions were not modified. The two security fixes were scoped to preserve existing successful flows, consistent with the code-review and security-review skills. Broad auth/finance redesign was left as explicit work rather than an unsafe local patch.

## Readiness score and launch prerequisites

**Readiness score: 24/100**, an evidence-based release rubric, not a probability or percentage of live features. Each category earns points only for demonstrated implementation/verification; blocked launch-critical work earns no completion credit.

| Category | Available | Earned | Reason |
|---|---:|---:|---|
| Customer UI and journeys | 15 | 10 | Six modules render; several search/filter/details paths work; Movies second page and full accessibility remain incomplete |
| Authoritative backend and persistence | 20 | 2 | Real Movies empty read/schema; main marketplace schema and transactional inventory absent |
| Authentication and permissions | 15 | 0 | Critical legacy identity/authorization failures remain |
| Bookings, payments, refunds | 25 | 2 | UTR pending safeguard and signature/capture checks; fabricated booking/financial paths and no settlement E2E |
| Security and isolation | 10 | 2 | Protected Movies design and escaped invoice text; severe systemic gaps remain |
| Automated/runtime evidence | 10 | 7 | 44 tests, build, read-only DB, native SQL fixtures, browser journeys; several browser/staging gates failed or blocked |
| Operations and supported devices | 5 | 1 | Local startup/build verified; no deployed operations, full device matrix or disk headroom |
| **Total** | **100** | **24** | **Launch blocked** |

Critical prerequisites, in order:

1. Restore sufficient Windows disk headroom to finish reliable verification. Preserve user data and obtain approval for any unrelated cleanup; no automatic deletion beyond tooling's own failed initialization occurred.
2. Replace spoofable legacy identity/session paths and enforce verified server-side roles/ownership across every privileged endpoint. Remove public private-data reads and source secret fallbacks.
3. Design and validate the authoritative marketplace schema, provider inventory, quote calculation, booking idempotency/overlap constraints and financial state machine in an isolated staging Supabase project. Do not install the current financial SQL unchanged.
4. Remove every fabricated payment/wallet/provider-plan success path; bind bookings to captured, owned, amount-matched, single-use intents. Implement signed webhooks, deduplication, durable reconciliation and real sandbox refunds.
5. Separate demonstrators from production listings/reviews/chat/notifications/analytics and require evidence for verification, availability and reputation claims.
6. Connect cancellation, history, favorites, profiles, provider registration and admin changes to one persistent authority with proper error reporting and user cache isolation.
7. Complete approved display-only Movies pages, coherent demo fixtures, correct pre-pagination filtering and an authorized daily feed; validate actual role grants, RLS, sync preservation and concurrent edits in staging.
8. Establish lockfile-based CI and dependency scanning, production secrets, headers/rate limits, migration/rollback review, backup/restore checks, monitoring and alerting. Review payment-security changes against any external branch/commit actually supplied before merge; no Mac-specific revision was identified or claimed compared here.
9. Re-run Chrome/Firefox/Edge/WebKit suites after environment stability is restored, then real supported Android/iOS/macOS targets, keyboard/screen-reader checks, offline/reconnect and slow-network tests. Complete all remaining interaction inventory items before claiming every visible control works.

## Direct answers to the requested questions

1. **Is every visible feature actually working?** No. Working UI coexists with broken authorization, invented commercial confirmations, placeholders, simulations and blocked live integrations.
2. **Which screens contain demo/fabricated data?** Default marketplace cards in the first five modules; seeded bookings/reviews/transactions/notifications; wallet/admin billing/analytics/integration screens; simulated chat; labelled local Movies catalogue. Details and maps inherit their listing source.
3. **Which actions are simulated?** Legacy provider chat/replies, wallet top-up, provider-plan payment recording, some payment finalization, integration diagnostics, billing email state, and assorted profile/voice actions. Local JSON confirmation is not real provider acceptance or PostgreSQL reservation.
4. **Which modules use real Supabase persistence?** Movies has a real deployed schema and verified anonymous read path, currently empty. Main marketplace helpers are present but unconfigured and their core tables absent. No full application live CRUD claim is supported.
5. **Are authentication and permissions secure?** The legacy auth/admin architecture is not. Movies uses stronger token/RLS checks, but hosted multi-user and admin mutation validation remain blocked.
6. **Are bookings/payments genuinely verified?** The app-wide claim is false. UPI pending and Razorpay signature/capture safeguards exist, but booking price/inventory/identity checks and alternate financial paths are critically incomplete. Sandbox credential authentication succeeded; a completed gateway transaction/refund was not tested.
7. **Which browsers/devices were tested?** Windows Chrome and Firefox with the precise partial/pass results above; Edge/WebKit launched but failed their suites. Five viewport sizes were emulated. No physical mobile, macOS Safari or native-app PASS is claimed.
8. **What remains before launch?** C1–C4 and H1–H7, isolated staging/live-service validation, browser/device/interaction gaps and production operational controls. The project is not 100% live or production ready.
