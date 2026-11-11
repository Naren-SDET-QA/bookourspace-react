# BookOurSpace — Remaining Stay Gaps: Completion Report

Date: 2026-11-05 (Asia/Kolkata)
Continues: `STAYS_COMPLETE_GAP_REPORT_20261105.md`
Repositories: Web `/Users/aa/Downloads/bookourspace-react`, Capacitor `/Users/aa/Downloads/bookourspace-react-capacitor`
Supabase target referenced, **not written to**: `obkfgxjzlscungkhbyvq`

Status key: **CODE** = implemented; **BUILT** = compiles/packages; **RUNTIME VERIFIED** = exercised against real local Express + PostgreSQL (or real browser/native WebView); **BLOCKED** = cannot be verified without hosted credentials/approval/device capability.

No hosted writes, migration execution, pushes, merges, deployments or real payments were performed.

---

## 1. CODE — what was implemented

### 1.1 Request-to-book (pending → approve/reject → payment/confirmation)

- New `create_stay_request` RPC: requires a non-instant-book stay, holds real physical inventory for **30 minutes** (existing hold primitive is capped at 30 minutes; this avoids extending a client-callable hold), creates `pending_approval` / `not_due` booking, computes the full price server-side and notifies the host.
- Host `approve_request` / `reject_request` actions:
  - reject → booking `rejected`, allocation `released`, guest notification, no money;
  - approve + pay-at-property → allocation `confirmed`, booking `confirmed` / `pay_later`;
  - approve + UPI → booking `approved` / `pending_verification`, 2-hour payment intent + UPI URI created **only after approval**, allocation expiry extended, guest notified.
- Expiry: `sweep_stay_requests()` runs on customer/host booking reads and actions; expires pending/approved requests, releases inventory, expires open intents and notifies both parties. Booking cancellation/rejection/expiry expires open intents via trigger.
- Convergence: a booking in `approved` becomes `confirmed` exactly when `payment_status` becomes `verified`, whether the settlement is a signed provider callback or an authorized admin approval (single BEFORE UPDATE trigger).
- Race guards: approval fails with `REQUEST_EXPIRED` if the held unit is gone; intent reuse only when still pending and unexpired.
- Customer cancellation of a pending/approved request uses the existing cancellation endpoint → released inventory, expired intent, refund quote 0.

### 1.2 Configurable fees and server-side INR pricing

- `stay_properties.cleaning_fee_paise`, `stay_properties.service_fee_bps` (0–3000 bps).
- One SQL formula, `stay_price_quote(room_type, check_in, check_out, units)`: subtotal, cleaning fee (per booking), service fee (subtotal × bps), taxes on subtotal + fees, total.
- Quote, instant checkout, request creation and booking payloads all use that function. No client total is accepted.
- Payment intents/booking totals now include fees and taxes.
- Host workspace edits both fees; customer checkout shows subtotal / cleaning / service / taxes / total.
- Card and detail “total before taxes” estimates include the same fees when dates are selected.

### 1.3 Host profile

- Public `GET /api/stays/hosts/:hostId`: verified `public_provider_profile_projection` fields only (name, avatar, city, verified), aggregated published host languages, active stay count, review rating/count and up to 12 active stay cards.
- `StayHostProfileModal` opened from listing detail. No phone, email or private profile data.
- API returns 404 unless the provider is public/verified.

### 1.4 Verified customer self check-in / checkout

- `POST /api/stays/bookings/:id/self-check-in` and `/self-check-out`:
  - owner-only, authenticated Google/HMAC session;
  - check-in requires `confirmed`, today ≥ check-in, and payment state `verified` / `pay_later` / `collected_offline` (pending UPI is rejected);
  - checkout requires `checked_in`;
  - writes `checked_in` / `completed`, notifies the host.
- Trips panel exposes the actions only when the server flags them; host check-in/out remains available.

### 1.5 Native origin + local runtime

- Documented `VITE_NATIVE_API_ORIGIN` in `.env.example`.
- Native transport now permits HTTP **only** for loopback aliases (`127.0.0.1`, `localhost`, `::1`, Android emulator `10.0.2.2`); any remote origin must be HTTPS. Tests updated.
- Local-only Android build with `VITE_NATIVE_API_ORIGIN=http://127.0.0.1:5199` + `adb reverse` was used to verify the real Stays screen and detail against the real Express/PostgreSQL backend. Production builds remain HTTPS-only.

### 1.6 Size optimization

- Found 20 unreferenced AI Studio demo images (11 MB) under `public/assets/aistudio`; moved them to `docs/legacy-aistudio-assets/` (preserved, no new images added) so they are no longer shipped in Web/Capacitor bundles.
- Found the Android APK had ~11.7 MB of stale bytes from incremental packaging after asset changes. A clean Gradle build removes them.
- No new dependencies, no new image storage, no duplicated records.

### 1.7 Payment failure / refund correctness

- Signed `payment.failed` now releases the held allocation, marks the booking `cancelled` / `failed` and notifies the guest. Previously only the intent was marked failed.
- Refund remains provider-signed; admin-only; second refund is refused.

---

## 2. BUILT

| Artifact | Result |
|---|---|
| Web production build | PASS (`npm run build`, 6.93 MB dist) |
| TypeScript | PASS (0 errors) |
| Capacitor Web build + sync | PASS |
| Android debug APK | PASS — clean build **8,217,078 B** |
| iOS simulator app | PASS — **13,900 KB** |
| Migration manifest | PASS — baseline + **59 migrations**, unique versions, sha256 match |

Final artifacts:
- `android/app/build/outputs/apk/debug/app-debug.apk` (Capacitor worktree)
- iOS `App.app` (DerivedData `App-dace…/Debug-iphonesimulator`)

---

## 3. RUNTIME VERIFIED

### Tests

| Suite | Result |
|---|---|
| `npm test` | **245 tests, 230 pass, 0 fail**, 15 DB-gated skips |
| `run_local_validation.sh` | **ALL CHECKS PASSED** — functional=57, contact=23, app_config=14, rural=10, profile_privacy=10, super_admin=12, bootstrap=6, media=17, concurrency=1, no double booking |
| Stays Playwright E2E | **33 pass, 0 fail** (filters, booking, host, payments, real) |
| Six-module smoke E2E | **23 pass, 0 fail** |
| Migration manifest | PASS (59 migrations) |
| Android native install/launch | PASS |
| iOS native install/launch | PASS |

### Request-to-book (real DB)

- Request created → `pending_approval` / `not_due`; inventory held.
- Host approve (pay-at-property) → `confirmed` / `pay_later`; guest sees it in trips.
- Host approve (UPI) → `approved` / `pending_verification`; 2h intent + UPI URI.
- Admin manual settlement → intent `verified` (provider `manual_approval`), audit event, allocation `confirmed`, booking `confirmed`.
- Reject → `rejected` + allocation `released`.
- Expiry (forced past `request_expires_at`) → `expired` + released.
- Guest cancel pending → `cancelled` + released.
- Customer self check-in → `checked_in`; self check-out → `completed`; review accepted once, duplicate 409.

### Fees

- 2 nights × ₹9,000, cleaning ₹500, service 5%, tax 12%:
  - subtotal 1,800,000; cleaning 50,000; service 90,000; taxes 232,800; **total 2,172,800 paise**.
- Quote and checkout returned the same values; booking row stores the same total and breakdown.

### Payments

- Signed `payment.captured` verifies intent, booking and allocation; replay is idempotent.
- Unsigned and tampered events rejected 401; mismatched signature cannot confirm.
- `payment.failed` marks intent failed, booking cancelled, allocation released.
- Admin refund records a signed sandbox refund event; second refund 409.

### Native runtime

- Android (local-only build, real backend): Stays list with **5 verified stays**, real images, detail with host profile button.
  - `screenshots/stays-2026/17-android-stays-live.png`
  - `screenshots/stays-2026/18-android-detail.png`
- iOS final app launches (`20-ios-final.png`); interactive iOS Stays not driven.

---

## 3b. Local runtime fix (the empty-screen bug)

The Web app had no `BOS_LISTINGS_DATABASE_URL`, so `/api/stays/search` correctly
returned `503 STAY_SEARCH_UNAVAILABLE` and the Live screen showed
“Stays could not be loaded”.

`npm run dev` now bootstraps a loopback-only development database:

- `.local/stays-db` (gitignored, port 55440) with the baseline schema and all 59 migrations;
- 28 stay properties / 28 room types / 56 units seeded from the **existing**
  `airbnbIndiaData` catalog (no new images, no upload, CDN URLs reused);
- 336 demo reviews so rating/count renders;
- `npm run dev:web` remains the DB-free server for Playwright/CI;
- Demo guest / Demo host buttons appear only under `DEMO_DATA_ENABLED`; the
  `/api/dev/demo-session` route is hard-disabled when `NODE_ENV=production`,
  requires demo opt-in and a loopback database, and can only sign the two
  seeded accounts.

Verified locally at `http://127.0.0.1:5173`:
28 stays, 17 villas after the Villa filter, real detail page, pay-at-property
booking, and the host workspace.

## 4. BLOCKED

1. **Hosted Mumbai migrations** — not applied. Review package is below; requires separate approval.
2. **Real payment provider settlement/refund** — only signed sandbox events and authorized manual approval were exercised. No live UPI/PSP money moved.
3. **Google OAuth end-to-end** — hosted Mumbai OAuth and native redirect were not exercised; local contract/unit tests pass.
4. **iOS interactive Stays** — launch verified only; no WebView automation driver for iOS in this environment.
5. **Payout transfer** — payout status is computed; no payout rail configured.
6. **Native production API connectivity** — production APK has no `VITE_NATIVE_API_ORIGIN` baked in (by design). A local test build with a loopback origin was used for runtime verification.
7. **Request window is 30 minutes**, not 24 hours, because the existing hold primitive caps client-triggerable holds at 30 minutes. Extending it requires a separate server-only hold policy decision.

---

## 5. SIZES — BEFORE / AFTER (exact)

### Web

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| `dist` total | 18,216,180 B | 6,929,454 B | **−11,286,726 B (−61.96%)** |
| Stays lazy entry chunk | 96,691 B | 99,177 B | +2,486 B (new request/fees/profile features) |
| Stay detail chunk | 29,080 B | 29,080 B | — |
| Host workspace chunk | 33,440 B | 33,440 B | — |
| Host profile chunk | — | 5,630 B | lazy only |
| Legacy AI Studio images in bundle | 11 MB | 0 | moved to `docs/` |

### Android APK

| Build | Bytes |
|---|---:|
| Session-start APK | 18,685,198 |
| Intermediate (stale packaging) | 19,893,683 |
| Clean build with legacy assets | 19,546,555 |
| **Final clean build without legacy assets** | **8,217,078** |
| Delta vs session start | **−10,468,120 B (−56.0%)** |
| Delta vs stale intermediate | −11,676,605 B |
| Delta from removing legacy assets (clean builds) | −11,329,477 B |

Root cause of the +737 KB finding: incremental Gradle packaging retained ~11.7 MB of stale bytes after asset changes; a clean build removes them. The 11 MB unreferenced AI Studio image set was also packaged into every APK. Stays JS itself costs ~15 KB compressed in a same-native control APK.

### iOS

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Simulator `App.app` | 25,140 KB | 13,900 KB | **−11,240 KB (−44.7%)** |

### Database

| Measurement (isolated throwaway cluster) | Before | After | Delta |
|---|---:|---:|---:|
| Discovery/host migration phase | 14,530,227 B | 14,784,179 B | +253,952 B (+1.75%) |
| Request/fees migration phase | 14,702,259 B | 14,751,411 B | **+49,152 B (+0.33%)** |
| Stay tables in request/fee phase | 442,368 B | 450,560 B | +8,192 B |
| Indexes (same phase) | 54 | 55 | +1 |

### Storage

| Metric | Before | After |
|---|---:|---:|
| `media_assets` rows / bytes (local measurement) | 0 / 0 | 0 / 0 |
| New objects uploaded | — | **0** |
| New images added to repo | — | **0** (legacy assets moved, not duplicated) |

---

## 6. Pending Mumbai migration review (NOT applied)

| Migration | Transaction | Depends on | Review note |
|---|---|---|---|
| `20261105163924_profile_media_and_account_closure.sql` | `begin;`/`commit;` | media assets, live edit | profile closure/media policy; wrapped |
| `20261105170000_stay_discovery_filters.sql` | wrapped | schema, stay inventory, payment intents, reviews | columns/indexes/canonical keys; now retains `pg_hostel` |
| `20261105180000_stay_host_inventory_controls.sql` | wrapped | `20261105040000` media assets, live-edit function | media ordering + active block availability |
| `20261105210000_stay_requests_fees_profiles.sql` | wrapped | 170000, payment intents/bookings, notifications | requests/fees/self check-in; adds triggers |
| `20261105220000_restore_pg_hostel_property_type.sql` | wrapped | 170000 | restores `pg_hostel`; must run after discovery |

Checks performed:
- No duplicate 14-digit versions; 59 files + baseline in `MIGRATION_MANIFEST.json`; sha256 verified.
- New DDL is transactional; no `CONCURRENTLY` inside a transaction; no destructive table drops.
- New functions use explicit `search_path` and `revoke`/`grant` scopes.
- RLS is preserved; service-role grants are limited to server-only host/payment paths.
- Host approval, manual settlement and payment-failure handling are single transactions with row locks.
- **Recommendation:** apply 170000 → 180000 → 210000 → 220000 in order through the approved Mumbai process, then run the local suites against staging. Do not apply piecemeal: 170000's calendar function expects `stay_blocks.is_active`, added by 180000.

---

## 7. Exact production steps

1. Approve/apply the five migrations above to Mumbai via the controlled installer; verify manifest/hash before and after. No hosted writes were done here.
2. Configure `BOS_UPI_MERCHANT_VPA`, `BOS_UPI_MERCHANT_NAME`, provider webhook secret + refund provider; keep sandbox off in production; run one live-mode sandbox capture/failure/refund drill.
3. Decide whether `BOS_ALLOW_OWNER_MANUAL_SETTLEMENT` is enabled (default false = admin only).
4. Set `VITE_NATIVE_API_ORIGIN=https://<api-origin>` and rebuild/sync both native apps; retest OAuth redirect on physical devices.
5. Configure payout rail or keep the status-only display.
6. Add monitoring for `sweep_stay_requests`, pending requests, failed intents and orphaned allocations.

---

## 8. Files and evidence

Key code:
- `supabase/migrations/20261105210000_stay_requests_fees_profiles.sql`
- `src/server/stayHostApi.ts` (approve/reject, fees, self actions)
- `src/server/stayApi.ts` (requests, self check-in/out, review)
- `src/server/stayPayments.ts` (fee quote, payment-failure release)
- `src/server/staySearchApi.ts` + `staySearchQuery.ts` (host profile, hostId, fees)
- `src/components/stay/StayHostProfileModal.tsx`
- `src/components/stay/StayHostWorkspace.tsx`, `StayTripsPanel.tsx`, `StayCheckoutPanel.tsx`
- `src/mobile/nativeApiTransport.ts`, `.env.example`

Tests:
- `e2e/stays-host.spec.ts` (9 tests), `e2e/stays-payments.spec.ts` (3), `e2e/stays-filters.spec.ts`, `e2e/stays-booking.spec.ts`, `e2e/stays-real.spec.ts`
- `tests/stay-filters.test.mjs`, `tests/native-api-transport.test.mjs`

Screenshots in `screenshots/stays-2026/`:
- `01`–`12`: Web list/filters/detail/calendar/reviews/trips/host workspace
- `13`, `20`: iOS launch/final
- `14`–`19`: Android launch, native Stays live, native detail, final APK
- `17-android-stays-live.png`, `18-android-detail.png` are the strongest native-backend evidence.
