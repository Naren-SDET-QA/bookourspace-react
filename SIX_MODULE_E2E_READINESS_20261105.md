# BookOurSpace six-module E2E readiness

**Evidence collected:** 2026-11-05 17:43 UTC  
**Scope:** Web repository `/Users/aa/Downloads/bookourspace-react`, Capacitor repository `/Users/aa/Downloads/bookourspace-react-capacitor`, and disposable local PostgreSQL only. No hosted database or Storage writes were made.

## Module status

| Module | Status | Evidence | Remaining blocker |
|---|---|---|---|
| PG & Hostels | **RUNTIME VERIFIED — local core flow** | Disposable PostgreSQL and HTTP tests passed: owner bed inventory, customer booking/cancellation, ownership isolation, idempotency, concurrency, server restart and availability. Browser run passed 22 Chromium/Firefox/WebKit responsive discovery checks and the owner/customer/Admin journey. | The focused PG payment/refund suite was corrected to use the PG-specific signed webhook, but its rerun is blocked by local PostgreSQL shared-memory exhaustion. The new corrective migration is local only and needs hosted review/approval before use. |
| Home Services | **RUNTIME VERIFIED — local** | Disposable PostgreSQL/browser runner passed customer booking, provider accept/start/complete, customer cancellation, Admin refund of a verified sandbox payment, and restart persistence. One unrelated browser case was skipped by the runner. | No real Google identities or payment provider were used. |
| Classes & Courses | **RUNTIME VERIFIED — local** | Disposable SQL suite passed 25 checks for capacity, enrollment, duplicate prevention, waitlists, RLS and Admin publication. Chromium journey passed 7 browser checks, including last-seat concurrency. | Full 109-case suite could not start its separate database-backed fixture after host shared-memory exhaustion. |
| Function Halls & Venues | **RUNTIME VERIFIED — local core flow** | Disposable SQL concurrency/quote/visibility/idempotency/cancellation/restart test passed. Browser journey output showed 9 passing owner/Admin/customer/payment/dispute/reschedule checks. | Final cross-browser continuation of the combined UI runner was not captured; no hosted venue data was inspected. |
| Hotels & Stays | **RUNTIME VERIFIED — local** | Stay checkout runner passed 38/38 checks and 5/5 restart checks: database quote and fees, signed sandbox settlement, idempotency, refunds, pay-later, RLS and concurrent inventory. The local validation runner passed 57 functional/security checks and its concurrency test. | Native host management and payments were not exercised through a real hosted account. Full E2E database fixtures hit the local `initdb` resource limit. |
| Movies | **RUNTIME VERIFIED — discovery/privacy only** | Movies privacy suite passed 8/8 checks: discovery is public, booking/customer data stays private, forged roles are denied, and seat/booking/ticket/cancellation endpoints remain disabled. Builder tests confirm published booking widgets cannot enable Movies booking. | Authorized theatre inventory/showtime source and booking rights were not available, so booking remains disabled as required. |

## Feature-level coverage

| Feature area | Status | Evidence or gap |
|---|---|---|
| PG discovery, owner inventory, Admin listing approval, bed availability, booking, cancellation, duplicate prevention and concurrent allocation | **RUNTIME VERIFIED** | Local PostgreSQL + browser suite; database enforces allocation conflicts and the JSON store remains unchanged. |
| PG signed payment capture/refund and failed-payment cancellation | **BLOCKED for final rerun** | Earlier focused run exercised capture/refund but its failed-event test called the generic Stays webhook. The E2E now targets the PG-specific signed webhook; local `initdb` exhaustion prevented revalidation. |
| PG move-in/out operations, attendance, invoices and review completion | **CODE / NOT RUNTIME VERIFIED** | Not exercised in the successful focused runs collected for this report. |
| Services categories, schedule/availability, booking, provider work-state progression, cancellation, signed sandbox settlement and Admin refund | **RUNTIME VERIFIED** | Services browser/database runner passed the booking/payment/refund/restart journey. |
| Services quotes/reschedules, disputes, warranty/revisit and review completion | **CODE / NOT RUNTIME VERIFIED** | No successful end-to-end assertion for these stages was collected in this run. |
| Classes category catalogue, batch publication, enrollment, duplicate protection, waitlist, cancellation and last-seat concurrency | **RUNTIME VERIFIED** | SQL and 7-test browser suites passed. |
| Classes attendance, successful paid enrollment settlement and review completion | **BLOCKED / NOT RUNTIME VERIFIED** | Enrollment obligations were tested; the database refuses online enrollment without a verified provider settlement. Attendance/review completion was not exercised. |
| Venues listing approval, server quote, availability, booking, calendar block/reschedule, cancellation, dispute and signed sandbox payment/refund retry | **RUNTIME VERIFIED — local** | Browser runner output showed all 9 flow checks passing; SQL concurrency/quote/visibility/restart test passed. |
| Venue site visit, completion/invoice and review completion | **CODE / NOT RUNTIME VERIFIED** | Not part of the successful browser assertions collected. |
| Stays database quote/fees, UPI sandbox settlement, pay-after-service obligation, refund, inventory conflict and restart | **RUNTIME VERIFIED** | Dedicated runner passed 38/38 and 5/5 persistence checks. |
| Stays host request/approval, cleaning flow, payouts/reconciliation, native booking journey and review completion | **CODE / BLOCKED for full E2E** | Full host/browser harnesses could not allocate a fresh local PostgreSQL cluster; targeted hosted/native workflows were not attempted. |
| Movies titles/showtimes, theatre location filters and synchronization | **BLOCKED** | No authorized source/account was available to distinguish valid showtimes from unverified catalogue data. Existing booking endpoints stay disabled. |
| Shared Google authentication/session persistence, logout, protected return navigation and server-authoritative roles | **RUNTIME VERIFIED with local OAuth interception; real OAuth BLOCKED** | Browser tests exercise UI redirects and role boundaries; database suites exercise RLS/Super Admin security. Mumbai publishable key is a placeholder, so no real Google session was created. |

## Shared workflows and platform checks

- **Live Builder:** **RUNTIME VERIFIED locally.** The disposable PostgreSQL runner passed 40 API/database checks. Independent customer browser sessions observed Super Admin publish and rollback for all six module pages. RLS exposed published versions only and denied direct anonymous writes. JSON store hash stayed unchanged.
- **Database permissions:** **RUNTIME VERIFIED locally.** The disposable SQL run passed role, profile privacy, Super Admin bootstrap/audit, media RLS, and security-definer execution checks. These results do not establish the current hosted state.
- **Google/Guest UI:** **RUNTIME VERIFIED with local OAuth interception.** Full Chromium tests covered splash/welcome, Guest persistence, Home, Home header, Profile, top-right Sign In, popup fallback, protected destination return, and denial of client-selected privileged roles. This did not authenticate with Google.
- **Real Google OAuth:** **BLOCKED.** Both repositories point at Mumbai project `obkfgxjzlscungkhbyvq`, but their `VITE_SUPABASE_PUBLISHABLE_KEY` and legacy anon-key settings are placeholders. No real login or hosted session persistence was attempted.
- **Web build/type check:** **PASS** in both repositories. Main repository: 230 unit tests passed, 15 skipped, 0 failed. Capacitor repository: 145 passed, 14 skipped, 0 failed.
- **Android:** **BUILT and RUNTIME VERIFIED at launch/shell level.** Debug APK installed with update semantics on the running emulator (no app data cleared), launched, and rendered the six-module Home and signed-out Welcome/Profile state. No `FATAL EXCEPTION` was found in the inspected logcat window.
- **iOS:** **BUILT and RUNTIME VERIFIED at launch/shell level.** Xcode Simulator build succeeded; app installed and launched on an iPhone 17 Pro simulator. Screenshot shows the six-module Home with safe-area spacing; no app-process error entries were returned by the simulator log query.
- **Native Google OAuth, logout with a real session, and provider workflows:** **BLOCKED** by the missing Mumbai publishable key and absence of an authorized live test account. No mocked result is reported as real authentication.

## Full Chromium suite and local resource limit

`npm run e2e` ran 109 tests: **52 passed, 5 failed before test bodies, 21 skipped, 31 did not run**. All five failures reported `initdb` failing to allocate a PostgreSQL shared-memory segment (`shmget`, “No space left on device”). At inspection there were 32 existing disposable PostgreSQL clusters from other local runs. The test-created clusters from this task were cleaned; I did not stop clusters I did not start.

The focused PG payment suite was also blocked on a subsequent `initdb`. Its earlier run exposed a test routing error: PG payment events used the general Stays webhook, which cancels failed generic stay bookings. The PG E2E test now signs the booking-bound event and targets `/api/pg/payments/provider-webhook`. Syntax validation passed, but the corrected PG payment suite still needs a clean local PostgreSQL environment for runtime confirmation.

## Safe local changes

- Added [20261105220000_restore_pg_hostel_property_type.sql](/Users/aa/Downloads/bookourspace-react/supabase/migrations/20261105220000_restore_pg_hostel_property_type.sql). The Stays discovery constraint had removed `pg_hostel`, although the PG inventory RPC inserts it. This forward migration retains the Stays property types and restores `pg_hostel`. Applying it to Mumbai is **not approved or performed**. The Capacitor repository’s current discovery migration already includes `pg_hostel`.
- Updated the PG browser harness in both repositories to select the real Guest entry before exercising public discovery; this prevents the welcome overlay from intercepting controls while keeping signed local API identities for the owner journey.
- Updated the stay payment test in both repositories to validate the database-computed subtotal and quote total (including configured fees), rather than assuming the total is only nightly price × nights.
- Updated the PG payment test in both repositories to use the dedicated PG provider webhook and booking-bound signature. Static syntax checks passed; runtime rerun is blocked as described above.
- No product source component was rewritten. Existing module workflows were tested; the only schema fix prepared locally is the PG property-type correction.

## Current artifact sizes

| Artifact | Measured size |
|---|---:|
| Web `dist` tree | 6,930,335 bytes |
| Web JS chunks | 5,573,414 bytes raw; 1,655,712 bytes gzip sum |
| Capacitor `dist` tree | 6,934,515 bytes |
| Capacitor JS chunks | 5,577,624 bytes raw; 1,657,308 bytes gzip sum |
| Android debug APK | 8,313,347 bytes |
| iOS Simulator `.app` bundle | 13,920 KiB |
| Existing public assets | 944 KiB |
| New hosted Storage objects / database records | **0 / 0** |

These are current sizes; a reliable before-build measurement was not available, so no size delta is claimed. Hosted database and Storage size were not queried. Local disposable databases were removed by their test runners.

## Screenshots

- Android Home after Guest: `/tmp/bookourspace-android-home-e2e.png`
- Android signed-out Welcome/Profile: `/tmp/bookourspace-android-profile-e2e.png`
- iOS Simulator Home: `/tmp/bookourspace-ios-e2e.png`

## Remaining approval and action

1. Provide/authorize the Mumbai publishable key for local WebView configuration and an authorized test account before attempting real Google OAuth. Keep any service-role or client-secret material server-side.
2. Review and separately approve the new PG property-type migration before any hosted SQL. No hosted SQL has been prepared or applied in this task.
3. Free the host PostgreSQL shared-memory limit by confirming old disposable clusters are no longer needed (or use a fresh local environment), then rerun `bash supabase/tests/run_pg_payment_e2e.sh` and `npm run e2e`.
4. Provide an authorized Movies theatre/showtime source and booking rights before implementing or testing ticket sales. Until then, Movies booking remains unavailable.
5. Run hosted read-only verification and live login only with explicit scope/credentials; this report contains local evidence only.

**Verdict: NO-GO for production completion.** Core module workflows have substantial local runtime evidence, but real Google OAuth is unverified, the focused PG payment rerun and full browser suite are blocked by local PostgreSQL shared memory, Movies has no authorized booking inventory, and no current hosted verification was performed.

---

## Verification update — 2026-11-06 00:15 IST

This update supersedes the shared-memory and full-Chromium results above. All activity below used local disposable PostgreSQL or hosted read-only Supabase queries. No hosted SQL, Auth, Storage, fixture, payment, push, or deployment writes occurred.

### Six-module E2E status

| Module | Status | New evidence |
|---|---|---|
| PG & Hostels | **PASS — local core flows; BLOCKED subflow** | Corrected `run_pg_payment_e2e.sh`: payment phase **57/57**, restart phase **5/5**, signed-out/signed-in PG browser journey **36/36**, plus **20** Chromium/Firefox/WebKit responsive availability checks. Concurrency produced exactly one reservation for the last bed; SQL checks found no overlapping blocking allocations or cross-customer leaks. Provider UI inventory discovery was still blocked in the runner that specifically probes that surface; owner inventory, cross-provider isolation, Admin adjustment, check-in/out, payment capture, refund reconciliation, failure and restart were otherwise exercised through API/SQL/browser paths. |
| Classes & Courses | **PASS — local** | Full Chromium suite passed trainer batch creation, Admin approval, duplicate and unauthenticated enrollment refusal, last-seat concurrency, mobile/tablet/desktop flow. Dedicated fixture runner passed **7** Classes journeys plus **1** restart-persistence test. |
| Function Halls & Venues | **PASS — local** | Dedicated venue fixture runner passed **9/9** Chromium owner/Admin/customer journeys. Database assertions verified active listing, owner calendar block, resolved dispute, refund, verified UPI payment, category audit and cancellation state. Chromium, Firefox and WebKit mobile/tablet surfaces each passed; a separate Chromium restart test preserved venue approval, cancellation, dispute and block state. |
| Home Services | **PASS — local** | Dedicated PostgreSQL/Chromium runner passed customer cancellation, provider completion, Admin refund of a signed sandbox payment, and restart persistence. One unrelated browser case was skipped. |
| Hotels & Stays | **PASS — local** | Full Chromium suite passed **33** database-backed booking, host, filter, access-control, payment, cancellation, fee, concurrency and persistence cases after the harness fix. Signed sandbox capture/refund and pay-after-service paths were exercised; no live PSP was called. |
| Movies | **PASS — discovery-only by policy** | Browser builder test passed the custom-booking-widget guard. Dedicated Movies discovery/privacy tests passed **10/10**: no fabricated live showtimes or ticket actions, no customer-data leaks, and booking/seat/ticket/cancellation endpoints remain disabled. No theatre source or booking rights were supplied, so Movies remains discovery-only. |

The complete serial Chromium suite ran **109 cases: 88 passed, 21 skipped, 0 failed**. Its opt-in Classes, Services and Venues fixtures are tested by their dedicated runners above; those fixture-dependent cases remain skipped in the default suite. OAuth and role-boundary browser tests use local signed test identities and intercepted OAuth requests, not a real Google login.

### PostgreSQL resource recovery and local fixes

- The initial exhaustion came from **32 orphaned BookOurSpace test postmasters** under the temporary-directory test prefixes. Each had a matching ownership marker, parent PID 1, and zero client sessions. They were stopped with graceful `pg_ctl -m fast`; **all data directories were retained**.
- Tests now ran one worker at a time against isolated throwaway clusters. No shared-memory allocation failure occurred in the completed runs. A separate ownership-marked validation cluster was confirmed to have zero client connections, then also stopped gracefully; its data directory was retained.
- The default Chromium run exposed an incomplete disposable `auth.users` stub: it lacked Supabase's `banned_until` and `updated_at` fields. Read-only hosted catalog inspection confirmed both columns exist on the target. The Classes/Stays E2E and relevant shell harness stubs were aligned; no production migration was changed for this issue.
- The PG webhook repository now returns the settled database intent status after the verified-event RPC, and its lifecycle test asserts both the intent and booking states. The PG browser harness now chooses Guest from the initial welcome screen before public discovery.

Main repository checks: TypeScript **PASS**, production build **PASS**, unit tests **230 pass / 15 skip / 0 fail**. Capacitor repository checks: TypeScript **PASS**, production build **PASS**, unit tests **145 pass / 14 skip / 0 fail**. Movies-specific discovery/privacy suite: **10/10 pass**.

### Mumbai hosted read-only preflight and migration review

At **2026-11-06 00:15 IST**, the connected project was verified as `obkfgxjzlscungkhbyvq`, active/healthy in `ap-south-1`. Its live migration ledger has **53 records** including the baseline and ends at `20261105140000_media_anon_policy_split`. The repository has **59** migration files and the manifest has **59/59 matching filenames, sizes and SHA-256 hashes**. Therefore the seven local candidates below are pending on the hosted ledger; none was applied. Read-only catalog inventory found **68 public tables, 0 with RLS disabled, and 135 public policies**.

The seven candidates were all applied in filename order on fresh disposable PostgreSQL by the local suites. All are transactional (`BEGIN`/`COMMIT`), preserve rows during migration, and their dependencies are ordered correctly. Hosted compatibility checks found `auth.users.banned_until` and `updated_at`; one active profile; one public `media_assets` row compatible with its public-bucket constraint; zero stay properties and zero bookings. The migration adding profile media would create the currently absent private profile-media bucket. It was not created.

| Pending migration | Status | Review result |
|---|---|---|
| `20261105150000_server_media_byte_validation.sql` | **PASS locally; pending hosted** | Restricts metadata finalization to `service_role`; server finalizer checks ownership, quarantine state, hash, dimensions and Storage metadata. |
| `20261105160000_media_published_listing_visibility.sql` | **PASS locally; pending hosted** | Enables RLS on publication/audit tables, limits anonymous column access, and narrows public media/object reads to ready, referenced or explicitly published media. This intentionally changes public image visibility when applied; no rows/objects are deleted. |
| `20261105163924_profile_media_and_account_closure.sql` | **PASS locally; pending hosted** | Existing hosted profile status and the one public asset fit the constraints. Adds a private bucket and service-role-only account-closure RPC; it does not close or delete an account during migration. |
| `20261105170000_stay_discovery_filters.sql` | **PASS locally; pending hosted** | Extends the property-type constraint and discovery fields; hosted currently has zero stay properties. Adds indexes inside the transaction, so table/index locks should be scheduled with a short maintenance window if the target grows. |
| `20261105180000_stay_host_inventory_controls.sql` | **REVIEW REQUIRED before hosted apply** | Owner-scoped RLS and media reorder checks are present. Its `SECURITY DEFINER` availability function uses `search_path = public`; hosted `anon` and `authenticated` roles cannot `CREATE` in `public`, but hardening to an empty, explicit search path is recommended before approval. |
| `20261105210000_stay_requests_fees_profiles.sql` | **PASS locally; pending hosted** | Fee/request/payment state checks and service-role expiry worker are ordered after discovery/host controls. Hosted currently has zero bookings, so the payment-status constraint has no legacy rows to reject. |
| `20261105220000_restore_pg_hostel_property_type.sql` | **REDUNDANT; pending hosted** | The hosted legacy constraint already includes `pg_hostel`; migration `20261105170000` then replaces it with the full 12-value constraint. This final migration recreates that same constraint a second time. It is data-safe in the listed order but should be removed from the future hosted batch/manifest after review rather than applied as an unnecessary repeat. |

The hosted project currently has 18,396,851 database bytes and 2 Storage objects totaling 148,357 bytes (metadata size sum). Our hosted-write delta is **0 rows and 0 Storage objects**. The fresh local build measured web `dist` **7,010,184 bytes** and Capacitor `dist` **7,014,364 bytes**. These are current totals; the earlier snapshot differs by 79,849 bytes per tree, but the current work changed only server/test harnesses and no reliable clean pre-build artifact baseline exists, so that difference is not attributed to this task.

### Remaining blockers and verdict

- **Real Google OAuth: BLOCKED.** The connected project list shows the Stockholm project and the Mumbai project named `React`, but no clearly designated non-production Supabase project or authorized QA account. Tests used a synthetic publishable key and local signed identities; no hosted Auth write or real sign-in was attempted.
- **Hosted migrations: BLOCKED pending local review correction and separate approval.** Harden the `SECURITY DEFINER` search path in `20261105180000_stay_host_inventory_controls.sql`, remove the redundant `20261105220000` migration from the proposed batch/manifest after review, then request explicit approval before any hosted SQL.
- **Movies ticketing: BLOCKED by missing authorized theatre inventory/source and booking rights.** Its discovery-only state is intentional and verified.
- **PG provider inventory UI: BLOCKED** in the current provider-surface probe; API, database ownership, role separation and booking flows pass.

**Updated verdict: NO-GO for production.** Local six-module E2E evidence is now complete for the implemented flows, but real Google OAuth is unverified, hosted migrations remain unapplied pending review/approval, Movies ticket booking must stay disabled, and one PG provider UI surface remains unverified.

---

## Final gap-closure update — 2026-11-06 00:46 IST

This update supersedes the earlier PG provider UI and migration 2200 findings. The worktree contains unrelated pre-existing edits; only the provider PG workspace, PG inventory editor, PG browser test, Services browser test, two pending migration files and their manifest/checksum records were touched for this closure. No hosted writes, Auth account creation, Storage writes, real payments, push, merge or deployment occurred.

### Code and module verification

- Added a **PG & Hostel Inventory** provider tab. It loads rows through the existing authenticated `/api/provider/listings` endpoint, filters PG categories and embeds the existing PostgreSQL inventory and bookings controls. The existing backend authorization still checks the active provider, listing owner and Admin role. Providers can create/edit room types, beds and pricing, check date-based availability and manage resident booking operations from the portal. Listing activation remains the existing Admin review action; this change does not grant provider self-publication.
- Added an explicit **Add room type** flow to the existing editor, retaining server-side validation and PostgreSQL writes.
- The previously optional PG owner-surface probe still reports its separate “no Marketplace/PG search surface” condition. The new provider-portal E2E below passes and exercises the intended owner route directly.
- Hardened `stay_availability` in `20261105180000_stay_host_inventory_controls.sql`: empty `search_path`, `pg_catalog.daterange`, schema-qualified relations/functions, and explicit `EXECUTE` revocation/grants for `anon`, `authenticated` and `service_role`. The grant remains intentional because this function exposes free unit labels to the public storefront.
- Reworked `20261105220000_restore_pg_hostel_property_type.sql` into a conditional, ledger-preserving repair. In the ordered path, migration `20261105170000` already creates the complete valid constraint, so version 2200 is a no-op. It only repairs a missing/incomplete constraint, adds it `NOT VALID`, and validates before commit. This avoids an unnecessary drop/rebuild, full table rescan and `ACCESS EXCLUSIVE` lock in the normal path.
- The Movies discovery-only rule remains intact and is covered by both Builder browser checks and its explicit discovery/privacy tests.

Local checks: TypeScript **PASS**; production web build **PASS**; unit suite **230 pass / 15 skip / 0 fail**; Movies discovery/privacy **10/10 pass**; complete serial Chromium suite **88 pass / 21 skip / 0 fail**. Dedicated PG provider portal, booking/cancellation and inventory UI passed; PG payment/refund suite passed with signed local sandbox events, concurrency and restart persistence. Venue suite passed **9/9** browser lifecycle checks, cross-engine viewport checks and restart persistence. Services PostgreSQL/API suite passed **11/11** and its browser runner passed customer cancellation, provider completion, Admin refund and restart persistence. Classes approval/enrollment/cancellation/concurrency and Stays host/customer/payment/filter/restart flows passed in the Chromium suite. Local disposable database validation applied the baseline plus all 59 migration files and passed its full functional, profile privacy, Super Admin, media security, account-closure and concurrency suites. The media/security suite passed **20/20**; the full local verdict reported 57 functional, 23 contact, 14 App Config, 10 rural, 10 profile privacy, 12 Super Admin, 6 bootstrap and 20 media checks plus the no-double-booking concurrency check.

One `git diff --check` warning remains in an unrelated pre-existing edit at `src/components/FlipkartBannerSlider.tsx:211` (trailing whitespace). It was left unchanged.

### Refreshed hosted read-only preflight

At approximately **2026-11-06 00:46 IST**, the connected Supabase project was re-verified as `obkfgxjzlscungkhbyvq`, `ap-south-1`, `ACTIVE_HEALTHY`. The live ledger still contains **53 entries** and ends at `20261105140000_media_anon_policy_split`. The seven pending candidates are exactly:

1. `20261105150000_server_media_byte_validation.sql` — locally applied in disposable databases; service-role-only media finalization; no row rewrite. Checksum is pinned in the local manifest.
2. `20261105160000_media_published_listing_visibility.sql` — locally applied; tightens anonymous media reads to active/referenced or explicitly published assets and restricts anonymous columns. It changes visibility but deletes no bytes.
3. `20261105163924_profile_media_and_account_closure.sql` — locally applied; adds profile-media and account-closure controls; creates a private Storage bucket if absent. No existing account is closed by the migration.
4. `20261105170000_stay_discovery_filters.sql` — locally applied; adds discovery columns, checks, functions and ordinary indexes in one transaction. Must precede 1800, 2100 and 2200.
5. `20261105180000_stay_host_inventory_controls.sql` — locally applied with the search-path/grant hardening above; follows 1700.
6. `20261105210000_stay_requests_fees_profiles.sql` — locally applied; request/fee/payment checks and service-role workflow, after stay schema setup.
7. `20261105220000_restore_pg_hostel_property_type.sql` — locally applied as a conditional ledgered repair after 1700; no-op when the correct constraint is already present.

The current local manifest verifies **59/59 migration files** with SHA-256 checksums. Supabase’s migration ledger returns version/name, not file checksums, so the seven local hashes cannot be compared to hosted file bytes. All seven migration files have explicit `BEGIN`/`COMMIT`; local disposable replay confirmed they apply in filename order. Transactional `ALTER TABLE`/ordinary index DDL can wait on or block concurrent work. The hosted snapshot showed **0 other sessions waiting on locks**; this is only a point-in-time observation, not an execution-time guarantee. The 2200 no-op removes its routine constraint rebuild; the remaining 1700/1800/2100 DDL still needs normal lock monitoring. Each migration is atomic on its own: on failure, stop and verify schema plus ledger before retrying; already committed earlier versions remain, and recovery should use a forward corrective migration rather than replaying blindly.

Read-only compatibility snapshot: **68/68 public tables have RLS enabled**, **135 policies**, 1 profile, 0 listings, 0 stay properties, 0 room types and 0 bookings. The one media asset conforms to the existing public bucket/privacy constraints. There are **2 Storage objects, 148,357 bytes**. The asset’s parent listing is missing, and neither object is referenced by a listing payload; there are zero active listing media references. Migration 1600 will retain the bytes but may make those two orphan objects unreadable to anonymous customers. Resolve/map those objects or explicitly accept that visibility effect before hosted approval. Current database size: **18,405,043 bytes**. The earlier report recorded 18,396,851 bytes; the observed 8,192-byte difference between snapshots has no known cause and is not attributed to this task. Hosted write delta from this task: **0 database rows / 0 Storage objects**.

The locally built web `dist` is **7,560 KiB** (about 7.4 MiB); Android source project is **97,388 KiB** (about 95 MiB); iOS source project is **19,916 KiB** (about 19 MiB). Android and iOS were not rebuilt or synchronized in this task, so these are current directory sizes rather than verified before/after native artifact deltas. Test databases were disposable and removed by their harnesses.

### OAuth and production verdict

`npm run audit:oauth` passed all local configuration/security assertions: Google-only provider, customer-by-default request, authoritative database role checks, Mumbai callback derivation, and no privileged credentials in frontend source. It made no network call. The connected Supabase account still exposes only the old Stockholm project and production Mumbai project; no explicitly designated non-production project or authorized QA account is available. A real Google login was not attempted, and no hosted Auth write was made.

**Code: PASS. Build: PASS. Local browser/database runtime: PASS for covered workflows. Android/iOS runtime: NOT RUN. Hosted production readiness: NO-GO / BLOCKED.** Remaining gates: resolve the two orphan Storage objects’ visibility, separately approve hosted migration application, and designate a non-production Supabase project plus authorized QA Google account for real OAuth. Movies ticketing remains discovery-only until legitimate theatre inventory and booking rights are provided.

### PG provider-flow verification addendum — 2026-11-06 02:20 IST

Reran `npm run test:db:pg` after extending the provider-portal browser assertions. **PASS:** provider loads only actor-authorized PG listings, creates room/bed inventory, edits the room rent and verifies the persisted price through the authenticated API, checks future-date live availability, then refreshes and sees the customer cancellation in the owner bookings list. The customer reservation/cancellation and PostgreSQL inventory-release path also passed. Final verdict: `state=persisted`, `rls_isolation=verified`, `conflict_atomicity=verified`, `pg_bookings=verified`, `json_store=untouched`. The runner’s legacy optional marketplace-search probe still reports BLOCKED because it only checks that separate discovery path; the direct provider-portal owner flow passed.
