# BookOurSpace — Final Fix & Readiness Report

**Date:** 2026-11-05 · **Worktree:** `/Users/aa/Downloads/bookourspace-react` · **Branch:** `feat/module-flags-and-stay-inventory`
**Hosted project:** `obkfgxjzlscungkhbyvq` (no hosted write, migration, OAuth change, deployment, push or merge was performed)
**Verdict:** **NO-GO** · **Readiness: 74/100**

---

## 1. Completed fixes (changed files)

### Production PostgreSQL persistence (P0)

| File | Change |
|---|---|
| `src/server/persistencePolicy.ts` | New shared policy: production requires `BOS_LISTINGS_DATABASE_URL`; remote targets require `sslmode=require/verify-ca/verify-full`; loopback in production requires explicit `BOS_POSTGRES_LOCAL_TEST_MODE=true`; production requires a ≥32-char `BOS_SERVER_HMAC_SECRET`; dev/test can never reach a remote database. Specific fail-closed error codes. |
| `src/server/postgresPool.ts` | Shared pool now validates the target through the policy instead of a loopback-only guard. |
| `src/server/providerListingRepository.ts`, `classEnrollmentRepository.ts`, `serviceBookingRepository.ts`, `venueBookingRepository.ts`, `pgBookingRepository.ts`, `pgPaymentRepository.ts` | Removed `*_LOCAL_ONLY` production refusals; every repository validates the same target (environment-aware, so injection tests still work). |
| `src/server/stayApi.ts`, `stayPayments.ts`, `serviceCommerceApi.ts`, `platformApi.ts` | Raw `pg.Pool` registrations validate the connection target before opening. |
| `server.ts` | `assertProductionPersistenceReady()` retained before the listener and now returns a policy; production additionally requires all six domain repositories (`PRODUCTION_POSTGRES_REPOSITORY_REQUIRED`). Legacy JSON stores throw `PERSISTENCE_JSON_STORE_UNAVAILABLE_IN_PRODUCTION` and the error handler maps it to a 503 — no production JSON fallback. Production session verification/logout no longer read JSON (in-memory revocation set). Production Google sign-in, `/api/auth/me` and `/api/auth/protected/*` resolve identity and role from the PostgreSQL `profiles` row only. |
| `tests/production-persistence-safety.test.mjs` | 8 policy tests (dev/test allowed, missing DB refused, weak HMAC refused, insecure remote refused, loopback opt-in, TLS accepted, remote-in-dev refused, guard-before-listener subprocess). |
| `tests/provider-listing-repository-config.test.mjs` | Production TLS/loopback repository policy tests. |
| `supabase/tests/run_production_persistence_smoke.sh` | **New** production startup smoke test (see §4). |

### Services public-reviews bug (genuine 500)

| File | Change |
|---|---|
| `supabase/migrations/20261105010000_service_reviews_public_policy.sql` | **New migration.** The SELECT policy applied `public.is_admin()` to `anon`; an earlier hardening migration revoked `EXECUTE` on that function from `anon`, so every anonymous read of `service_reviews` failed with permission denied and `GET /api/services/listings/:id/reviews` returned 500. Policy is now split by role: anon sees published reviews only; authenticated sees published + own + admin. Function grants are unchanged. |
| `tests/services-lifecycle.e2e.mjs` | Failure diagnostics now include the response body. |
| `supabase/tests/run_pg_integration.sh` | Fixture admin marked `is_super_admin = true`, matching the Live Edit rule that only a Super Admin is platform-wide (plain admins are assignment-scoped). No authorization code was weakened. |
| `supabase/MIGRATION_MANIFEST.json`, `supabase/migrations.sha256` | Regenerated: baseline + **38** migrations, unique versions, SHA-256 verified. |

No working module was rewritten. No existing migration was modified.

---

## 2. PASS / FAIL / BLOCKED — actual evidence

| Check | Result | Evidence |
|---|---|---|
| TypeScript (`tsc --noEmit`) | **PASS** | exit 0 |
| Production build (`vite build`) | **PASS** | exit 0, 503 kB main chunk (warning only) |
| Unit/security suite (`npm test`) | **PASS** | 178 tests, **163 pass, 0 fail**, 15 skipped (DB-gated, each covered by a dedicated PG suite) |
| Browser shell (Playwright Chromium) | **PASS** | **9/9** at mobile portrait/landscape, tablet portrait/landscape, desktop; deep links, zoom, PWA manifest, keyboard |
| PostgreSQL listing/booking/RLS integration | **PASS** | 31/31 phase-1 checks; restart persistence 4/4; RLS A=1/B=0; duplicate-id rows=1; JSON store sha256 unchanged; browser PG owner/Admin/customer journeys all PASS |
| Classes + Venues + RBAC/RLS local validation | **PASS** | functional=52, contact=23, app_config=14, rural=10, profile_privacy=7, concurrency=1, no double booking; Super Admin role management 5/5 |
| Services lifecycle + commerce | **PASS** | **11/11** after the policy fix; duplicate slots=0, cross-customer rows=0, restart persisted |
| Hotels/Stays checkout + payments | **PASS** | exit 0; restart persistence 5/5; overlapping allocations=0; RLS leak=0; JSON store untouched |
| Live Edit backend security | **PASS** | **19/19** |
| Backup guards | **PASS** | 5/5 |
| Temporary credential helper retirement | **PASS** | 6/6; `.env` unchanged; no new snapshot |
| Migration manifest | **PASS** | baseline + 38 migrations, sha256 match |
| Production startup smoke (new) | **PASS** | see §4 |
| Android debug build | **PASS** | `android/app/build/outputs/apk/debug/app-debug.apk` (17.7 MB) |
| iOS debug build | **PASS** | `** BUILD SUCCEEDED **` (iphonesimulator, App.app) |
| Android device install/launch | **BLOCKED** | `adb devices` → `emulator-5554 offline`; `adb install`/`am start` hang. No AVD/data was deleted. |
| iOS simulator launch | **BLOCKED** | 15 simulators available (iPhone 17 booted) but no app install/launch test was run. |
| Google OAuth end-to-end login | **BLOCKED** | Hosted config is Google-only (Google on, Email/Phone/anonymous off) from earlier read-only evidence; an interactive Google consent + new-user/existing-user/session-refresh proof needs the owner. Production PG identity code is implemented but has not been exercised with a real Supabase Google token. |
| Razorpay/UPI provider settlement | **BLOCKED** | No provider sandbox keys or webhook secret. Only server-signed sandbox events were tested; no live charge or refund was made. |
| 13 legacy plaintext snapshots | **BLOCKED** | `scripts/audit_plaintext_credentials.sh` exits 1; names/modes only, contents never read. Deletion/encryption needs owner approval + owner GPG key. |
| Hosted migration of the new review policy | **BLOCKED** | Requires explicit owner approval (hosted write). |

---

## 3. Six-module end-to-end matrix

| Module | Workflow evidence | State |
|---|---|---|
| PGs & Hostels | Provider listing → Admin approval → bed inventory → customer reservation → payment obligation/UPI intent → provider settlement → cancellation/refund quote → restart persistence; RLS isolation; concurrency (two customers, last bed) | **PASS (local PostgreSQL)** |
| Classes & Courses | Trainer → Admin approval → batch/schedule → enrollment → cancellation quote; role-scoped batch reads; no double booking | **PASS (local PostgreSQL)** |
| Function Halls & Venues | Listing/capacity → availability → server quote → concurrency → idempotency → cancellation → restart; venue timezone/DST correctness | **PASS (local PostgreSQL)** |
| Home & Local Services | Provider discovery → schedule availability → booking → accept/start/complete → payment claim → signed settlement → admin refund → public reviews (1 per booking) → restart | **PASS (local PostgreSQL)** |
| Hotels & Stays | Room inventory → checkout quote → hold → confirmation → overlapping-booking prevention (exclusion constraint) → pay-after-service → refund → restart; PGs stay also covered above | **PASS (local PostgreSQL)** |
| Movies | V1 is discovery/showtimes only. `/api/seats` and `/api/movies/bookings` return **410**; seat maps, 5-minute holds, concurrent seat locking, ticket QR and refund eligibility have **no production booking path**. Cinema screen Live Edit is PG-backed; admin movie records/refunds/support tickets are still JSON and return 503 in production. | **FAIL — not production-ready** |

---

## 4. Production PostgreSQL verification

`supabase/tests/run_production_persistence_smoke.sh` (new) starts the real server with `NODE_ENV=production` against a disposable PostgreSQL 17.11 cluster (explicit `BOS_POSTGRES_LOCAL_TEST_MODE=true`):

```text
tables=56 migrations=37
listening on 127.0.0.1:65440
PASS /api/modules 200 with PostgreSQL platform_module_flags
PASS /api/live-page-config 503 PERSISTENCE_JSON_STORE_UNAVAILABLE_IN_PRODUCTION
PASS /api/admin/modules 401 (anonymous, no JSON read)
PASS /api/admin/movies/records 401 (anonymous, no JSON read)
PASS /api/auth/me 401 and /api/auth/logout 200 without touching JSON state
PASS no JSON store file was created or modified
PASS PostgreSQL module flags persisted across a production restart
PASS production_startup=postgres json_fallback=disabled modules=db_backed restart=persisted
```

Negative policy proofs (unit tests): production without a database → `AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION`; weak HMAC → `BOS_SERVER_HMAC_SECRET_REQUIRED`; remote without TLS → `PRODUCTION_POSTGRES_TLS_REQUIRED`; loopback without opt-in → `PRODUCTION_POSTGRES_LOOPBACK_REQUIRES_TEST_MODE`; remote in dev/test → `BOS_LISTINGS_DATABASE_MUST_BE_LOOPBACK`.

**Remaining production-persistence gaps:** the live-page/App Builder config, the 17 admin-module settings, legacy movie admin records/refunds/support tickets and legacy Super Admin views are still JSON-shaped and are therefore disabled (503) in production rather than migrated. Verified remote TLS behaviour against the hosted database was not run (no hosted connection authorized).

---

## 5. Google OAuth and native results

- Google-only configuration (Google on; Email, Phone, anonymous off) is unchanged; no OAuth setting was modified.
- Existing Auth user/profile are preserved; production sign-in now provisions/reads profiles in PostgreSQL and never writes the JSON user store.
- **BLOCKED:** browser login, new-user registration, existing-user login, session refresh/expiry, account closure and native PKCE deep-link callback need an interactive Google consent and an approved HTTPS backend.
- Android: debug APK built; device verification blocked by `emulator-5554 offline`.
- iOS: simulator debug build succeeded; simulator install/launch not run. No simulator, AVD or user data was deleted.

---

## 6. Payment and refund security results

- Server pricing only: totals/refunds are read from PostgreSQL, never accepted from the browser.
- Settlement requires a signed provider event; unsigned, wrong-amount and replayed callbacks were rejected; provider event ids are unique (no duplicate capture).
- Refunds require a verified payment and stay within the paid amount; paid cancellation requires a reconciled refund; admin refunds are signed and audited.
- UTR/screenshot alone never marks a payment successful; the legacy UPI verification kill switch remains off.
- **BLOCKED:** no Razorpay sandbox keys/webhook secret and no UPI provider evidence; webhook signature verification against a real provider callback was not exercised. No live charge/refund was initiated.

---

## 7. Remaining owner approvals

1. **Hosted migration**: apply `20261105010000_service_reviews_public_policy.sql` to `obkfgxjzlscungkhbyvq` (hosted public reviews otherwise return 500).
2. **Interactive Google OAuth proof** on an approved HTTPS origin (browser + Android/iOS PKCE deep link).
3. **Payment provider credentials** (Razorpay test mode key/secret/webhook secret) and approval to verify create → settle → refund → webhook.
4. **Credential rotation** of the previously exposed database password, atomic Keychain/consumer update, then retirement of the 13 plaintext snapshots (owner GPG key + `BOS_BACKUP_GPG_RECIPIENT`).
5. **Android device fix**: re-enrol/restart the emulator (currently ADB `offline`); authorise a device install/launch run.
6. **iOS device/simulator run** approval.
7. **Deployment/publication** approval after the above.
8. **Production secret set**: `BOS_SERVER_HMAC_SECRET`, `APP_URL`, TLS `BOS_LISTINGS_DATABASE_URL`, deployment secret manager.

---

## 8. Verdict

**NO-GO — 74/100.**

| Dimension | Score | Basis |
|---|---:|---|
| Build, types, unit tests | 18/20 | All green; 15 DB-gated skips covered by dedicated PG suites |
| Production persistence | 20/25 | Production starts on PostgreSQL, all six repositories attached, JSON disabled; live-page/App Builder, admin modules and movie admin remain unmigrated |
| Six-module journeys | 18/25 | Five modules verified end-to-end on PostgreSQL; Movies has no booking path |
| Identity & access | 8/15 | RLS/RBAC/Live Edit pass; Google login proof and production identity path unexercised |
| Payments & refunds | 7/10 | Sandbox-signed lifecycle and concurrency proven; no real provider evidence |
| Native | 4/10 | Both debug builds succeed; device/simulator launch blocked |
| Security & operations | 5/10 | Guards and RLS pass; 13 plaintext snapshots, rotation and GPG custody pending; rate limiting unverified |

What changed materially: production can no longer start or serve authoritative data from JSON, all six PostgreSQL domain repositories are attached at startup, production identity is PostgreSQL-only, and a real public-reviews 500 is fixed. What still blocks GO: Movies booking, Google login proof, provider-backed payments, hosted migration approval, native device verification and credential cleanup.

No push, merge, deployment, hosted write or destructive action was performed.

---

## 9. Release scope update — Movies is optional (2026-11-05)

**Owner decision:** Movies is an optional module for this release and is **out of scope for GO**. No Movies booking engine, seat-hold table, ticket QR/validation or theater scanning is being built for this release.

The existing V1 behaviour is kept exactly as shipped and stays fail-closed:

- Discovery and showtimes only; `MOVIES_BOOKING_ENABLED = false` in `src/components/DistrictMoviesSection.tsx`.
- `GET/POST /api/seats*` and `/api/movies/bookings*` keep returning **410 `MOVIES_V1_DISPLAY_ONLY`**; the legacy JSON seat-lock and ticket code stays unreachable.
- `tests/movies-discovery-safety.test.mjs` and `tests/movies-inventory-privacy.test.mjs` continue to pass, so no fabricated showtime, ticket or confirmation can appear.
- No JSON movie admin data becomes authoritative in production: those routes stay 503 rather than reading a writable file.

Consequences for the verdict below: the Movies row in §3 is **DEFERRED (optional)**, not a release blocker. Everything else in this report is unchanged, so the verdict remains **NO-GO 74/100** on the remaining blockers (Google login proof, provider-backed payments, hosted migration approval, native device verification, credential rotation).

If Movies is enabled in a later release it requires the full PostgreSQL engine (screens, shows, seat inventory, atomic holds, server-priced settlement, single-use ticket validation) before any booking button is turned on.

---

## 10. Continuation check — native launch (2026-11-05)

- **iOS simulator launch: PASS.** Booted the existing iPhone 17 / iOS 26.4 simulator, installed the existing `com.bookourspace.app` debug build, and launched it with `simctl`. After the app's loading screen, a screenshot showed the BookOurSpace home page, all six module tiles, and the Google sign-in entry point. No simulator reset or data deletion was performed.
- **Android launch: BLOCKED.** `adb devices -l` reports no connected device, and `emulator -list-avds` returns no configured AVDs. No Android install or device-data change was attempted.
- This confirms native app startup on one iOS simulator only; it does not validate native Google OAuth, module journeys, or Android startup.

---

## 11. Migration review and settings persistence (2026-11-05, this session)

**Verdict:** **NO-GO — 86/100** (was 74/100). The remaining blockers are unchanged in kind: Google login proof, provider-backed payments, hosted apply approval, native device verification and credential rotation. No hosted write was performed.

### 11.1 Migration manifest — PASS

`20261105020000_universal_live_builder.sql` (865 lines) was reviewed end to end against the 38 pinned migrations before pinning:

- no table, function, policy or index name collides with an existing object;
- every column it references exists (`profiles.role`, `profiles.account_status`, `profiles.is_super_admin`), and FKs target `public.profiles(id)`;
- the anon SELECT policies test `status`/`state` only and never call `is_admin()`, so the class of 500 fixed in `20261105010000_service_reviews_public_policy.sql` is not reintroduced;
- every statement is re-appliable (`if not exists`, `create or replace`, `drop policy if exists`, guarded constraint).

Three defects were found and fixed **before** pinning:

1. **Wrong volatility.** `builder_assert_blocks`, `builder_validate_page_document` and `builder_validate_entity_schema` were declared `IMMUTABLE` while reading `platform_component_registry` / `platform_field_types`. An immutable function must not read tables; it also advertises legality inside index expressions. All three are now `STABLE`.
2. **Over-broad record reads.** The `platform_entity_records` policy exposed records for any published entity whose `permissions.read` was `public` **or** the default `authenticated` — meaning every signed-in customer could read every entity's records (for example School Jobs applications). Non-admin reads now require an explicit `public` scope, and a separate policy grants admins `is_admin()`.
3. **Missing referential integrity.** `platform_entities.current_version_id` had no FK. Added `platform_entities_current_version_fk` (`on delete set null`) in an idempotent `DO` block.

New `20261105030000_platform_settings_persistence.sql` adds the live page configuration stream and the 17 admin module settings (registry, settings, RLS, audited server-only RPCs).

Manifest repinned only after the suites passed:

```text
manifest written: 42 migrations + baseline; checksum inventory refreshed
PASS manifest verified: baseline + 42 migrations, unique versions, sha256 match
```

### 11.2 Production persistence — PASS (local PostgreSQL)

| Area | Store | Evidence |
|---|---|---|
| Live Page Editor (OTA config) | `platform_live_page_config` + save/publish/rollback RPCs | draft replace, Super-Admin-only publish, rollback to a new version, audit row |
| Universal App Builder | `platform_page_versions` | builder e2e 27/27 |
| Universal Feature / Module Builder | `platform_entities`, `platform_entity_versions`, `platform_entity_records` | relation guards, schema validation, records |
| 17 admin module settings | `platform_admin_module_registry` + `platform_admin_module_settings` | revision bump, unknown key refused, 256 KB cap, audit |
| Remaining legacy JSON admin records | movie admin records/refunds/support tickets, legacy Super Admin views | **still JSON-shaped → 503 in production** (unchanged) |

- Authorization is re-derived from `public.profiles` inside every SQL function; `has_function_privilege` is false for `anon` and `authenticated` on all seven builder RPCs and all four settings RPCs.
- `server.ts` registers the PostgreSQL routes **before** the JSON handlers, so a database-backed process cannot fall through to the JSON store; without a database, local development keeps the old behaviour.
- Production smoke now proves it over HTTP: `PASS /api/live-page-config 200 from PostgreSQL, no JSON fallback`, `PASS /api/admin/modules 401 (anonymous, no JSON read)`, `PASS no JSON store file was created or modified`, `PASS PostgreSQL module flags persisted across a production restart`.
- Audit rows remain append-only (`BUILDER_AUDIT_IMMUTABLE` on update and delete).

### 11.3 Tests actually run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `tests/platform_settings_test.sql` via `run_platform_settings_e2e.sh` | **PASS 27/27, 0 fail, 0 SQL errors** |
| `run_universal_builder_e2e.sh` | **PASS 40/40** + RLS/audit SQL checks (six pages, entity rollback, legacy PostgreSQL config, policies) |
| `run_local_validation.sh` (baseline + 42 migrations) | **PASS** — functional=52, contact=23, app_config=14, rural=10, profile_privacy=7, concurrency=1, no double booking |
| `run_staging_migration_dry_run.sh` | **PASS — 42 migrations apply and re-apply cleanly** |
| `run_production_persistence_smoke.sh` | **PASS** (66 tables, 42 migrations) |
| `npm test` | **PASS** — 200 tests, 185 pass, **0 fail**, 15 DB-gated skips |
| Movies discovery safety (`movies-discovery-safety`, `movies-inventory-privacy`) | **PASS 10/10** — gate still `MOVIES_BOOKING_ENABLED = false`, endpoints still `410 MOVIES_V1_DISPLAY_ONLY` |

### 11.4 Updated score

| Dimension | Was | Now | Basis |
|---|---:|---:|---|
| Build, types, unit tests | 18 | 19 | tsc + 174 unit tests + new SQL suite |
| Production persistence | 20 | 23 | live page config and 17 module settings now PostgreSQL; only movie admin + legacy Super Admin views remain JSON |
| Six-module journeys | 18 | 20 | five in-scope modules pass; Movies optional per owner decision |
| Identity & access | 8 | 8 | Google login proof still outstanding |
| Payments & refunds | 7 | 7 | no provider credentials |
| Native | 4 | 4 | Android device / iOS run unverified |
| Security & operations | 5 | 5 | 13 plaintext snapshots and rotation pending |
| **Total** | **74** | **86** | |

### 11.5 Database credential — BLOCKED (owner action)

The Keychain item `bookourspace-react-db` (account `postgres.obkfgxjzlscungkhbyvq`) holds a 16-character password that Supabase rejects on both the session pooler and the direct endpoint (`FATAL: password authentication failed for user "postgres"`). The URL shape is correct (pooler host, port 5432, `postgres` database, no unescaped special characters), so the password itself is stale. `bos-production-backup` holds an empty 1-byte placeholder and is not a usable credential.

Safe manual steps (no secret is ever printed, pasted into this repository, or passed on a command line):

```bash
# 1. Read the current password from the Supabase dashboard for project
#    obkfgxjzlscungkhbyvq (Settings -> Database). Do not reset it unless you
#    intend to rotate the production credential.

# 2. Store it silently in the same Keychain item the installer uses.
read -r -s -p "Mumbai DB password: " BOS_DB_PW; printf '\n'
security add-generic-password -U -s bookourspace-react-db \
  -a postgres.obkfgxjzlscungkhbyvq -w "$BOS_DB_PW"
unset BOS_DB_PW

# 3. Confirm only its length, never the value.
security find-generic-password -s bookourspace-react-db \
  -a postgres.obkfgxjzlscungkhbyvq -w | wc -c
```

After that, the approved install can be re-attempted unchanged; the installer now builds a 0600 `pg_service.conf` + `pgpass` pair in a private temporary directory (libpq does not expand a URI supplied through `PGDATABASE`, and this keeps the password out of `ps` output). Rotating the password requires explicit owner approval and invalidates the old credential.

### 11.6 Addendum — two further migrations and the storage stub (same session)

Two migrations authored in a parallel worktree landed while this review was running and were reviewed before pinning:

| Migration | Review result |
|---|---|
| `20261105040000_universal_media_assets` | `media_assets` metadata table plus Storage bucket/object policies. Owner-scoped paths (`split_part(name,'/',1) = auth.uid()`), bucket/privacy coupling enforced by CHECK, public reads limited to `ready` + `public`, no client UPDATE/DELETE policy. Buckets are inserted with `on conflict do nothing` and a mismatch raises `BOS_*_BUCKET_CONFIGURATION_MISMATCH` instead of overwriting settings. |
| `20261105050000_builder_entity_rollback` | `builder_rollback_entity` — Super-Admin-only, append-only copy-forward, audited, revoked from `anon`/`authenticated`. Covered by section F of the settings suite. |

Two defects in that parallel work were repaired so the tree builds and tests:

1. `platformBuilderRepository.ts` called `this.translate(...)`, which does not exist (the module helper is `translateError`). TypeScript failed; now `translateError`.
2. The new entity-rollback test read `version_number`/`id` while the builder API has always returned `versionNumber`/`versionId`. The test was aligned to the existing contract; no assertion was weakened.

The media migration defines policies on `storage.objects`/`storage.buckets`, which Supabase provides but a bare cluster does not. A Supabase-compatible `supabase/tests/lib/bos_storage_stub.sql` was added and inlined into all 16 harnesses that apply migrations, so the suites exercise the migration instead of skipping it.

Final manifest state: **`PASS manifest verified: baseline + 42 migrations, unique versions, sha256 match`**.

### 11.7 Universal Live Builder — six-page integration (2026-11-05)

The builder is now connected to the customer pages and the legacy live-page configuration stream:

| Requirement | Result | Evidence |
|---|---|---|
| Six-page rendering | **PASS (implemented + API/browser)** | `PublishedBuilderRegion` in both App branches; Playwright 3/3 (Classes render, Movies discovery guard, failure fallback); publish/rollback API checks for all six keys |
| Live publish propagation | **PASS (API)** | 40/40 E2E; public read updates after publish for each page; two-browser session not exercised |
| Rollback | **PASS** | Page rollback and new entity rollback restore the prior published version; public read follows |
| Legacy JSON persistence migration | **PASS** | `/api/live-page-config` returns 200 from PostgreSQL, draft→publish persists, JSON store sha256 unchanged |
| Capacitor synchronization | **PASS (types/build)** | Builder client/render/UI copied, region + admin launcher mounted; `tsc` and `vite build` exit 0; native runtime not run |
| PostgreSQL / RLS security | **PASS** | E2E: anon sees 20 published vs 1 draft, anon insert denied, audit append-only, 34 rows |
| Offline last-known-good | **PASS (code + no-cache browser test)** | Cache-first client; failed fetch with no cache leaves the page unchanged; offline-with-cache browser test not run |
| Approved payment/inventory/role/report policies | **PASS (advisory)** | Admin-only server-validated allowlist; save 200, unknown key/out-of-range 400; never consulted by pricing/RLS |

Additional checks: `npx tsc --noEmit` PASS (main and Capacitor), `npm run build` PASS (main and
Capacitor), `npx playwright test e2e/builder-region.spec.ts` PASS 3/3, migration manifest PASS 42.

Still not production-ready:

1. Hosted migrations are not applied; the five pinned migrations need owner approval.
2. Native Android/iOS runtime verification (safe area, WebView cache, background revalidation) is outstanding.
3. Two simultaneous browser sessions and offline-with-cache propagation are not exercised in a browser.
4. The hosted database credential is still stale (see 11.5).

No hosted Supabase change, deployment, push or merge was performed.

## 12. Universal Live Builder final verification — 2026-11-05

This final addendum records verification run after section 11.7. Hosted checks were read-only. The
five migrations below remain unapplied; the hosted Builder is therefore not ready for live customer
publishing.

### Status by module

| Module | Local regression evidence | Hosted Builder status |
|---|---|---|
| PGs & Hostels | **PASS** — PostgreSQL/listing and booking integration; six-key Builder publish/rollback | **BLOCKED** — page-version schema migration absent |
| Classes & Courses | **PASS** — enrollment, approval, cancellation, waitlist/concurrent-seat tests; Builder publish/rollback | **BLOCKED** — page-version schema migration absent |
| Function Halls & Venues | **PASS** — provider/admin/customer browser journey, inventory, cancellation/dispute, signed sandbox-settlement tests; Builder publish/rollback | **BLOCKED** — page-version schema migration absent |
| Home & Local Services | **PASS** — API and browser booking/refund journey plus restart persistence; Builder publish/rollback | **BLOCKED** — Builder/settings schema migrations absent |
| Hotels & Stays | **PASS** — inventory, checkout, cancellation, API authority and restart tests; Builder publish/rollback | **BLOCKED** — Builder/settings schema migrations absent |
| Movies | **PASS** — discovery-only checks, injected booking/inventory/form/calendar blocks suppressed; feature flag and database trigger guard checkout | **BLOCKED** — Builder schema absent; no hosted Builder publication tested |

The `PASS` entries above are local disposable database/browser evidence, not hosted acceptance.
Movies remains discovery-only. Its current module flag has online booking disabled; a database trigger
rejects enabling checkout without explicit approval. Builder documents are schema/registry validated,
and policy documents only change approved presentation/workflow settings; they do not grant roles or
control authoritative pricing, inventory, payment settlement, refunds, or RLS.

### Builder publication, cache, persistence and security

- **Two independent browsers: PASS locally.** A Super Admin session published a Classes page in one
  Chromium context; a separate customer context rendered that publication and then observed the
  rollback. The disposable PostgreSQL harness passes all 40 API checks, six page-key publish/rollback
  checks, RLS checks (published pages only to anon, draft hidden), immutable audit checks, and leaves
  the legacy JSON store hash unchanged.
- **Offline browser behavior: PASS.** Focused Playwright: **6/6**. Covered valid cached page with
  transient 503, cold start without cache, stale cache expiry/removal, offline fallback, reconnect
  revalidation, and failure without cache. The configured cache lifetime is seven days.
- **Legacy `/api/live-page-config`: PASS locally; hosted BLOCKED.** Production smoke serves it from
  PostgreSQL, persists across server restart, and confirms there is no JSON fallback/creation. Hosted
  `platform_live_page_config` is absent, so a live hosted 200 cannot be established.
- **Media: PASS locally for inspection/preview.** Existing shared manager and image pipeline retain
  originals, preserve aspect ratio, avoid upscaling, sanitize SVG, and fail closed when Storage is
  unavailable. Only metadata/references belong in PostgreSQL. Hosted Storage catalogs exist but have
  no buckets or objects; no upload/deletion was attempted.

### Native results

- **iOS simulator: PARTIAL PASS.** Current synced bundle built and launched on iPhone 17 and iPad A16
  simulators. Both render the home screen after WebView startup; top safe area and fixed bottom
  navigation are visible. An immediate post-install screenshot was blank, but the screen rendered
  after four seconds and WebKit logged successful document/subresource completion. This is a transient
  startup frame. The simulator UI test showed module selection works. Native scroll gesture was not
  verified; responsive scrolling is covered in browser tests. Published Builder content, persistent
  native cache, offline fallback and foreground revalidation are **BLOCKED** because the installed app
  has no local test API and the hosted Builder schema is absent.
- **Android: PARTIAL PASS.** Current debug build succeeds. Runtime launch is **BLOCKED**: no Android
  emulator executable/AVD and `adb devices` reports no connected device. No device data was deleted.

### Complete regression runs

- Main TypeScript: **PASS**; unit suite: **186 passed, 0 failed, 15 skipped**; Vite production build:
  **PASS**.
- Main Chromium suite: **60 passed, 0 failed, 22 skipped** (fixture/environment-gated journeys are
  separately exercised by the disposable PostgreSQL runners).
- Focused Builder Playwright: **6 passed, 0 failed**.
- Capacitor TypeScript: **PASS**; unit suite: **138 passed, 0 failed, 14 skipped**; Vite build,
  iOS simulator build and Android debug build: **PASS**.
- `run_local_validation.sh`: **PASS**, 52 functional checks plus profile privacy, role management,
  class enrollment and concurrency/no-double-booking.
- `run_live_edit_security.sh`: **PASS**, 19/19.
- `run_all_booking_suites.sh`: **PASS**, all 9 suites (Live Edit audit/security, PostgreSQL
  integration/payments, Classes, Venues, Services API/browser, Stays).
- `run_staging_migration_dry_run.sh`: **PASS**, all 42 migrations apply and reapply in an isolated
  PostgreSQL cluster. `run_production_persistence_smoke.sh`: **PASS** for DB-backed modules and
  legacy live config with JSON fallback disabled.
- Backup/recovery: **PASS locally** (custom-format dump, restore to clean DB, matching catalog/RLS).
  Hosted recovery point/PITR: **BLOCKED/unverified**.

### Exact hosted migration gaps and recovery requirements

Read-only history for production target `obkfgxjzlscungkhbyvq` shows baseline plus 37 of 42 pinned
migrations. The exact five absent migrations are:

1. `20261105010000_service_reviews_public_policy.sql`
2. `20261105020000_universal_live_builder.sql`
3. `20261105030000_platform_settings_persistence.sql`
4. `20261105040000_universal_media_assets.sql`
5. `20261105050000_builder_entity_rollback.sql`

Read-only hosted catalog: 56 public tables, all with RLS; 115 policies; no Builder/settings/entity/
media tables; Storage schema present, with **0 buckets, 0 objects, 0 bytes**. Dependencies were checked
against hosted profile/admin authorization and review tables, and the local migration dry run verified
the full order. These migrations add policy/table/function and metadata structures; none deletes or
rewrites existing listings, bookings, payments or auth users. Media setup would create private bucket
definitions if applied. Runtime page/entity rollback is audited copy-forward, not a schema downgrade;
there is no automated down migration for this set. Schema recovery requires a reviewed forward fix or
a verified pre-change restore.

The disposable post-migration catalog has 67 public tables, 65 with RLS. The only two without RLS are
`platform_component_registry` and `platform_field_types`, the public read-only metadata registries;
anon/authenticated receive SELECT only and have INSERT/UPDATE/DELETE revoked. All 56 pre-existing
hosted public tables have RLS enabled.

### Approval steps still required

1. Project owner verifies a current hosted backup/PITR window and a recoverable point for
   `obkfgxjzlscungkhbyvq`.
2. Project owner separately approves applying the five exact migrations, in filename order, to that
   project. No hosted writes or migration commands were run in this verification.
3. After approval and application, run hosted read-only catalog/RLS/Builder endpoint checks, then
   test authenticated hosted publication/rollback and public customer rendering in two browsers.
4. For native acceptance, provide an Android emulator/device and an authorized test API environment;
   verify native scroll, published-page rendering, cache persistence, offline fallback and
   foreground refresh. No real payment credential is needed for the local mocked/signed sandbox tests;
   a real payment must remain disabled unless separately approved.

**Final verdict: NO-GO for hosted Live Builder release.** Local Builder and module regression evidence
passes, but hosted schema/recovery verification and native live-cache validation remain blocked.
No hosted change, push, merge, deployment, real payment or media deletion occurred.

## Addendum 2026-11-05 — hosted state correction

This report's "42 migrations" figures are superseded. The local manifest is now
**50 migrations**; the hosted ledger is reported at **43 records**, so **8 are
pending**. See `HOSTED_SECURITY_AND_BOOTSTRAP_REPORT_20261105.md` for the pending
list, the security-advisor result (**0 blocking, 17 reviewed**), the tested
Super Admin bootstrap (**18/18 PASS**) and the blocked hosted six-module
verification.
