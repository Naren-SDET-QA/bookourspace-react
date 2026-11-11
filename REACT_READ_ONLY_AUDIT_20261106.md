# BookOurSpace React — Read-Only Audit

**Audited:** 2026-11-06 (Asia/Kolkata)  
**Repository:** `/Users/aa/Downloads/bookourspace-react`  
**Branch / HEAD:** `feat/module-flags-and-stay-inventory` / `a67cbec527bdd63e89063be6056900ac43221950`  
**Audit status:** **READY_FOR_REMEDIATION**  
**Production verdict:** **NO-GO**

## Executive summary

The checkout is on the requested branch and exact expected HEAD, but the working tree is not clean: 101 tracked paths differ from HEAD and 695 paths are untracked (796 status entries when expanded). This report audits the **current working-tree snapshot**; it cannot attribute those changes to this task or infer which are intended. No existing changes were reverted or overwritten. No source, configuration, migration, or environment file was changed. The only repository write is this requested audit report.

The React application contains broad marketplace, provider, admin, Builder, Google OAuth, PostgreSQL booking and payment code. Production persistence is designed to fail closed and Movies is explicitly discovery-only. However, current production readiness is blocked by eight local migrations absent from the hosted ledger, unverified Google/Razorpay provider configuration, no live inventory/booking evidence, and a production start command that invokes `tsx` even though `tsx` is in `devDependencies`.

## Repository and verification state

| Check | Result | Evidence / limitation |
|---|---|---|
| Expected branch and HEAD | PASS | `git branch --show-current`; `git rev-parse HEAD` |
| Working tree | DIRTY | 101 tracked paths changed; 695 untracked files; includes edits to `.env.example`, `server.ts`, `src/App.tsx`, the SQL baseline and an existing migration. Existing `dist/` and `test-results/` were present and left intact. |
| TypeScript (`npm run lint`) | PASS | `tsc --noEmit`, exit 0 |
| Unit suite (`npm test`) | PASS with skips | 269 cases: 254 pass, 0 fail, 15 skip |
| Production client build | PASS | `npx vite build --outDir /tmp/bos-react-readonly-audit-dist --emptyOutDir`; existing repository `dist/` not overwritten |
| Chromium auth-entry tests | PASS, mocked | `e2e/auth-entrypoints.spec.ts`: 12/12 pass. OAuth authorization was intercepted; this is not a real Google login. Output went to `/tmp/bos-react-audit-playwright-output`. |
| Full Chromium suite | NOT RUN | Existing `test-results/` was preserved; remaining flows use local database/test fixtures. No full-suite or database mutation run was performed in this read-only audit. |
| Migration manifest | PASS | `node supabase/tests/migration_manifest.mjs`: baseline + 60 local migrations, unique versions and checksums match current files |
| Duplicate-route audit | FAIL / tool finding | `npm run audit:duplicates` exits 1 and flags 3 cross-file duplicates. Registration order shows PostgreSQL routes are intentionally installed before legacy handlers when the repository is configured; the checker does not model that cross-file conditional ordering. See P2 finding. |

## Hosted Supabase facts (read-only)

The connected project was verified as **`obkfgxjzlscungkhbyvq`**, region `ap-south-1`, status `ACTIVE_HEALTHY`, PostgreSQL 17.11. Read-only Supabase metadata and aggregate SQL reported:

- **68 public tables**, all 68 with RLS enabled; **135 public policies**; zero public tables without RLS.
- **53 hosted migration-ledger entries** (including the baseline marker). The local manifest has 60 migrations, leaving these eight files pending; they were not applied:
  - `20261105150000_server_media_byte_validation.sql`
  - `20261105160000_media_published_listing_visibility.sql`
  - `20261105163924_profile_media_and_account_closure.sql`
  - `20261105170000_stay_discovery_filters.sql`
  - `20261105180000_stay_host_inventory_controls.sql`
  - `20261105210000_stay_requests_fees_profiles.sql`
  - `20261105220000_restore_pg_hostel_property_type.sql`
  - `20261106010000_stay_razorpay_and_verified_upi.sql`
- Hosted counts: 2 Auth users, 1 custom `auth.users` trigger, 2 Storage objects. Public `listings`, `bookings`, and `payment_intents` each have zero rows. The table listing also showed zero rows for the major service, venue, class, and stay inventory/booking tables. These counts mean the hosted project has no current real marketplace/booking inventory to exercise; they do not establish whether external listing URLs or other media exist.
- Security advisor observation timestamp: `2026-11-06T11:48:09.781Z`. It reports 7 anon-callable and 51 authenticated-callable `SECURITY DEFINER` functions, plus 2 RLS-enabled tables with no policies (`user_access_audit_events`, `venue_payment_events`). No bypass was demonstrated. The no-policy tables fail closed; review the function bodies and exact grants before launch, especially mutators, because role-level callability alone does not prove each function’s internal authorization.
- Health advisor returned no lints. Auth advisor reports leaked-password protection disabled; the app source disallows password authentication, but the hosted Auth setting remains an operational security review item.

Hosted OAuth provider settings and third-party secret configuration are not available through the read-only project/table/ledger tools used here. No secret or environment value was read or printed. Consequently, Google OAuth enablement, redirects, Razorpay account mode/webhook setup, and production key presence remain **unverified**.

## Feature inventory

| Area | Current evidence | Audit assessment |
|---|---|---|
| Home, navigation, module gates | Module registry defines Hotels, PG, Services, Function Hall, Classes and Movies; App shell renders their experiences and section fallbacks. See [`src/modules/registry.ts:96`](src/modules/registry.ts#L96) and [`src/App.tsx:1639`](src/App.tsx#L1639), [`src/App.tsx:2573`](src/App.tsx#L2573). | Implemented; unit coverage verifies all six deep links and disabled-module behavior. |
| Hotels & Stays | Discovery, host inventory, availability, holds, PostgreSQL-priced checkout, cancellation and payment routes exist. See [`src/server/stayHostApi.ts:31`](src/server/stayHostApi.ts#L31), [`src/server/stayApi.ts:28`](src/server/stayApi.ts#L28), [`src/server/stayPayments.ts:25`](src/server/stayPayments.ts#L25). | Partial for production: the host-controls, filter/profile/fee and Razorpay migrations are pending. The unit suite skips five database-backed hold/confirm/cancel/concurrency checks. Hosted inventory and bookings are empty. |
| PG & Hostels | Provider listing CRUD, PG bed inventory/blocks, customer bookings and payment APIs are PostgreSQL-backed. See [`src/server/providerListingsApi.ts:152`](src/server/providerListingsApi.ts#L152), [`src/server/pgBookingsApi.ts:131`](src/server/pgBookingsApi.ts#L131), [`src/server/pgPaymentsApi.ts:97`](src/server/pgPaymentsApi.ts#L97). | Implemented in source; hosted E2E is unproven and current hosted listings/bookings are empty. PG provider integration tests are skipped absent their disposable DB setup. |
| Function Halls / Venues | Provider bookings, schedules/blocks, disputes and database repository routes exist. Venue API explicitly keeps online checkout unavailable unless sandbox is enabled; its HMAC webhook is documented as a test fixture. See [`src/server/venueBookingsApi.ts:47`](src/server/venueBookingsApi.ts#L47), [`src/server/venueBookingsApi.ts:154`](src/server/venueBookingsApi.ts#L154). | Partial. Pay-at-venue and sandbox workflows exist; no live Razorpay/UPI settlement adapter is advertised. Hosted category rows exist but hosted listings/bookings are empty. PostgreSQL concurrency E2E is skipped in the unit run. |
| Classes & Institutes | Batch enrollment, cancellation and provider/admin review repositories and UI exist. | Partial. No hosted batches/enrollments; the class trainer→admin approval→enrollment DB journey is skipped in unit tests. Full class browser E2E was not run. |
| Movies | Discovery UI only; module gates, API tests and unit tests prohibit booking/payment/ticket routes. See [`tests/movies-discovery-safety.test.mjs`](tests/movies-discovery-safety.test.mjs) and [`tests/movies-inventory-privacy.test.mjs`](tests/movies-inventory-privacy.test.mjs). | Correctly scoped as discovery-only pending legitimate inventory/rights. Do not count cinema booking as implemented. |
| Local Services, Farm & Village | Services discovery and provider listing categories include Local Services and Farm & Village; contact and service-booking workflows exist. See [`tests/former-local-services.test.mjs`](tests/former-local-services.test.mjs), [`src/server/serviceBookingRepository.ts`](src/server/serviceBookingRepository.ts). | Partial. Current code distinguishes enquiry/provider-reported availability from confirmed booking and server-verified settlement. Six PostgreSQL service lifecycle tests are skipped; no live payment capability was verified. |
| Admin marketplace/provider onboarding | Provider registration, owner-scoped listing CRUD, admin review/activation and booking oversight routes exist. Source rechecks actor and role in server/repository paths. | Implemented in source; actual hosted provider/customer/admin workflows are not evidenced by live inventory. Hosted account data has only two profiles; role detail was not exposed in this report. |
| App Builder/platform settings | Versioned Builder repository and settings API persist through PostgreSQL when configured; actor roles are resolved from `profiles`. See [`src/server/platformBuilderRepository.ts:120`](src/server/platformBuilderRepository.ts#L120), [`src/server/platformBuilderRepository.ts:135`](src/server/platformBuilderRepository.ts#L135). | Implemented in source, hosted persistence not exercised. Hosted Builder/config tables contain rows, but no publish/rollback write or cross-session read was performed. |
| Authentication/profile | Google-only Supabase OAuth entrypoints, callback handling, server-side Google identity verification, customer-default registration and authoritative profile role lookup exist. Password and email OTP helpers reject use in [`src/lib/supabaseClient.ts:95`](src/lib/supabaseClient.ts#L95) and [`src/lib/supabaseClient.ts:724`](src/lib/supabaseClient.ts#L724). | Source/security unit tests pass; real Google sign-in is unverified. The 12 Chromium tests intercept OAuth and only prove local navigation/URL behavior. |
| Booking/pricing/payments | PG and Stays quote/inventory/payment repositories use PostgreSQL transactions and reject unverified client settlement. Stays payment comments and paths require provider signature and server-side payment verification; PG order and webhook code is server-side. | Strong implementation signals, but only sandbox/mock/unit evidence here. Live keys, webhooks, cancellation/refund provider behavior and production persistence are unverified. Venues stay pay-at-venue/sandbox only. |
| UI, responsive states, accessibility | Section tests cover loading/error/empty/results; auth Chromium E2E covers mobile and desktop sizes, focus return and the signed-out flow. | Partial verification. No full accessibility audit, screen-reader pass, or full module visual/browser regression was run. |

## Findings by priority

### P1 — Resolve before production launch

1. **Eight local migrations are not installed on the connected project.** Verified ledger has 53 entries versus the 60-file manifest. The missing migrations add server-validated media finalization/publication, account/profile media changes, Stays filters/host controls/fees, a PG property-type restoration, and Stays Razorpay/verified UPI integration. Code paths reference these objects (for example, [`src/server/stayHostApi.ts:145`](src/server/stayHostApi.ts#L145) writes `stay_properties`; [`src/server/stayPayments.ts:100`](src/server/stayPayments.ts#L100) gates checkout). This audit did not issue SQL writes or prove the pending SQL chain against an isolated restore. Treat the dependent production paths as unavailable until a separately approved migration preflight/apply and post-apply verification.

2. **The production start script depends on a development-only package.** [`package.json:11`](package.json#L11) runs `tsx server.ts`, while `tsx` is listed under `devDependencies` at [`package.json:80`](package.json#L80). A production install that omits development dependencies cannot start this script. Confirm the deployment install model or ship a compiled/server runtime dependency before release.

3. **Real external Auth and payment setup is unverified.** Project metadata does not expose Google provider/redirect configuration or Razorpay secrets/webhook registration, and this audit did not use an authorized QA OAuth account or issue provider calls. Keep Google real-login and online settlement release checks blocked until verified in the designated non-production environment. Do not treat intercepted OAuth or signed local sandbox events as live-provider proof.

### P2 — Close before broad launch / investigate with focused tests

4. **Database-backed journey coverage is incomplete.** `npm test` skipped 15 cases, including class approval/enrollment, Live Edit PostgreSQL security, provider listing PostgreSQL/RLS, six Services lifecycle checks, five Stays hold/booking/cancellation/concurrency checks, and Venue PostgreSQL concurrency. Those flows need disposable local DB execution after a safe fixture/worker setup is confirmed.

5. **Duplicate route audit reports three duplicate endpoint pairs.** `scripts/audit-duplicate-routes.mjs` exits 1 for `/api/live-page-config/rollback`, `GET /api/admin/modules`, and `PUT /api/admin/modules/:moduleKey`. The PostgreSQL handlers are registered at startup before the legacy JSON handlers ([`server.ts:422`](server.ts#L422), [`server.ts:426`](server.ts#L426)); the legacy handlers follow later ([`server.ts:568`](server.ts#L568), [`server.ts:4265`](server.ts#L4265)). This makes database mode appear intentionally first-match, but the audit tool’s cross-file ordering analysis is not reliable and no integration test proved precedence. Consolidate route ownership or add a route test, then make the duplicate audit accurately distinguish fallback registration from true shadowing.

6. **Supabase Security Advisor flags exposed `SECURITY DEFINER` RPCs.** At the recorded timestamp, 7 functions were executable by `anon` and 51 by `authenticated`; two audit/event tables have RLS enabled with no policies. The latter fail closed. The RPC list includes public availability/quote functions and authenticated mutation functions; the advisor finding is not itself proof of privilege escalation. Review each function body, `search_path`, explicit schema qualification, caller checks, and grants against the intended public/owner/admin model before release.

7. **Potential PostgreSQL connection fanout.** The duplicate audit finds 12 `new Pool()` allocations across server modules. Some modules may share the singleton pool while others allocate their own. Compute worst-case per-instance connections against hosted limits and consolidate pools or lower limits if needed; no exhaustion was reproduced in this audit.

8. **Hosted modules lack real inventory.** Read-only hosted counts show zero listings/bookings and zero primary module inventory/booking rows, so customers cannot complete meaningful live inventory journeys even where code is present. This is a data-readiness blocker, not a request to seed production data.

### P3 — Operational polish

9. **Auth security setting advisory.** Supabase reports leaked-password protection disabled. Password login is disabled in application code, lowering direct relevance, but confirm the intended Auth policy and enable protections if password-based Auth is ever allowed.

10. **Full accessibility and visual regression evidence is absent.** Add focused automated/manual accessibility checks and per-module responsive/error/empty visual coverage after the backend readiness gates.

## Security and data boundaries

- Browser Supabase config is explicit-target-only and validates publishable/anon key shape; it refuses service-role/secret/database keys and mismatched project refs in [`src/lib/supabaseConfig.ts:1`](src/lib/supabaseConfig.ts#L1), [`src/lib/supabaseConfig.ts:137`](src/lib/supabaseConfig.ts#L137). The client source does not hard-code an implicit live project. Local env file **presence** was observed (`.env`, `.env.local`, `.env.example`); their contents were deliberately not read. `.env*` is ignored by Git. Therefore local credential correctness is not verified.
- Production persistence requires `BOS_LISTINGS_DATABASE_URL`, remote TLS, and a sufficiently long HMAC secret; production startup fails closed without them. See [`src/server/persistencePolicy.ts:87`](src/server/persistencePolicy.ts#L87) and the repository check in [`server.ts:362`](server.ts#L362). Local development can use the JSON compatibility store; it is not an acceptable production source.
- Demo session issuance is non-production, explicit-opt-in, loopback-only and restricted to seeded local customer/provider identities: [`src/server/devDemoSessionApi.ts:5`](src/server/devDemoSessionApi.ts#L5), [`src/server/devDemoSessionApi.ts:17`](src/server/devDemoSessionApi.ts#L17). Demo/seed data must remain clearly distinguished from hosted listings.
- OAuth code reads verified identity from Supabase and checks active profile/current DB role; no browser-supplied role is sufficient. The source tests cover forged identity/role and stale-session rejection. A live Google redirect/callback was not tested.
- Builder policy documents are constrained to approved values; source comments state policy settings do not determine actual price, availability, refunds, or permission. Database/service rules remain authoritative.
- No live settlement, hosted database write, migration, Auth account creation, Storage upload, or payment/refund was attempted.

## Database and migration assessment

- Local manifest ordering is baseline first, followed by 60 unique timestamped migrations. Current local bytes match `MIGRATION_MANIFEST.json` and `migrations.sha256`.
- Hosted migration history currently stops at `20261105140000_media_anon_policy_split`; the exact eight later local migrations are pending. No migration was reapplied or installed.
- The checked-in baseline and `20261101000002_marketplace_modules_and_stay_inventory.sql` are modified in the worktree; dozens of subsequent migration files are untracked. The pinned manifest does validate their current working-tree bytes, but that does not establish review/approval history or prove restore compatibility.
- Hosted RLS coverage is complete by table count (68/68). Policy semantics, every function body/grant, storage policy behavior, and actual row-level authorization were not exhaustively replayed against a disposable restore. The two no-policy tables are currently fail-closed, which can also mean service-role-only workflows.
- No backup/restore readiness assertion is made. The user asked for a read-only audit and did not authorize backup creation or restore activity.

## Remediation order and dependencies

1. **Freeze and preserve the dirty worktree.** Inventory each pre-existing change and assign ownership; do not reset or regenerate ignored artifacts. Review only intended source/migration diffs.
2. **Close packaging/startup.** Choose compiled server output or make the runtime dependency available in production; verify a clean production-only install can start with missing config failing closed.
3. **Resolve migration drift safely.** For each of the eight pending files, inspect dependencies and DDL/data effects; replay baseline + all 60 migrations in an isolated PostgreSQL database; verify checksums, grants/RLS, forward recovery, and current hosted object compatibility. Obtain explicit approval before any hosted write.
4. **Review privileged RPCs.** Compare advisor output with function definitions, grants, search paths and authorization predicates; create negative tests for anon/customer/provider/admin and cross-owner cases. Do not broadly revoke functions needed by public discovery.
5. **Run disposable DB regression.** Set up isolated worker data directories and ports, then run the 15 skipped database tests plus booking concurrency/restart and payment/refund sandbox suites. No hosted credentials in this phase.
6. **Exercise complete browser flows locally.** Run the Chromium suite with isolated Playwright output and disposable DB. Capture module journeys, admin/provider/customer, loading/empty/error states and persistence after server restart.
7. **Verify authorized non-production cloud configuration.** Separately confirm Google OAuth redirect allowlists and Razorpay test-mode/webhooks with an explicitly approved QA account; retain the distinction between provider sandbox and live funds. Avoid production Auth/data writes unless separately approved.
8. **Launch gate.** Require nonempty legitimate inventory, all critical module journeys passing, no unexplained advisor findings, startup proven from production-only dependencies, and operational rollback/recovery agreed before production release.

## Risks and rollback considerations

- Do not reset or clean the repository: the dirty/untracked set is large and may contain required user work. The audit report is the only new repo file.
- Do not run `npm run clean`; it deletes `dist` and `server.js`. Existing `dist/` was preserved; the audit build used `/tmp`.
- Do not rely on the legacy JSON store as a recovery strategy in production. Production intentionally rejects missing/non-TLS PostgreSQL and missing signing secret.
- Pending migrations are forward-only candidates and some redefine shared functions. Rollback should be a separately reviewed forward-correction or verified restore procedure; this report does not authorize either.
- Payment tests must stay on explicitly labelled local/test-mode credentials. Never claim a test settlement represents a real charge/refund.

## Final status

**READY_FOR_REMEDIATION** — the read-only audit is complete enough to prioritize safe local fixes. **Production remains NO-GO** until P1 findings and the database-backed test gaps are closed. Real Google OAuth, live payment/refund flows, full module E2E, migration replay against a disposable database, backup/recovery, and live inventory remain unverified or blocked.
