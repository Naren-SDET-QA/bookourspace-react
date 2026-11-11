# BookOurSpace — Hotels & Stays Completion Report

Date: 2026-11-05 (Asia/Kolkata)
Scope: Web (`/Users/aa/Downloads/bookourspace-react`), Capacitor (`/Users/aa/Downloads/bookourspace-react-capacitor`)
Supabase target referenced (not written to): `obkfgxjzlscungkhbyvq` (Mumbai)

Statuses used below: **PASS** = implemented and runtime-verified locally; **PARTIAL** = implemented but with a named gap; **FAIL** = not implemented; **BLOCKED** = cannot be verified without hosted credentials/approval/device capability.

No hosted writes, migrations, pushes, merges, deployments, or real payments were performed. Every database run used throwaway local PostgreSQL clusters.

---

## 1. Executive summary

| Area | Status | Evidence |
|---|---|---|
| All specified filters, chips, Clear All, combinations, counts, no-results/reset | PASS | 10 Playwright filter tests, 11 unit tests |
| Filter persistence across navigation and reload | PASS | `stays-filters` persistence test |
| Server-backed search with accurate counts and availability | PASS | `/api/stays/search` on PostgreSQL; 5 seeded stays |
| Customer journey through booking, trips, cancellation, review | PASS | 25 Playwright stay tests + PostgreSQL assertions |
| Host inventory, rooms, pricing, calendar blocks, bookings, check-in/out, payment recording, payout status | PASS | 4 host Playwright tests + 57 DB functional checks |
| Booking safety (no double booking, server pricing, idempotency, policy refunds) | PASS (local) | DB exclusion constraint concurrency test; manual approval audit |
| Live UPI settlement / real refunds | BLOCKED | No provider/sandbox settlement in this environment |
| Request-to-book (approval before confirmation) | FAIL | Instant Book flag exists; request flow not implemented |
| Native Android/iOS build and launch | PASS | APK + iOS simulator build; both launch screenshots |
| Native Stays end-to-end | BLOCKED | `VITE_NATIVE_API_ORIGIN` not configured; no device OAuth |
| Six existing modules intact | PASS | 23 Playwright smoke tests, 223 unit tests |
| Size increase | Measured | Stays-route JS down; DB +0.25 MB; storage +0 |

---

## 2. What was implemented

### 2.1 Database (additive, local candidate only)

`supabase/migrations/20261105170000_stay_discovery_filters.sql` (plus companion `20261105180000_stay_host_inventory_controls.sql` from the host-controls work):

- `stay_properties`: `place_type`, `bedrooms`, `beds`, `bathrooms`, `max_guests`, `instant_book`, `self_check_in`, `pets_allowed`, `guest_favourite`, `luxe_verified`, `host_languages[]`, `accessibility[]`, `cancellation_policy`, `cancellation_free_hours`; widened `property_type` domain to house/flat/guest house/villa/apartment/resort/hotel/lodge/homestay/temple stay.
- `stay_room_types`: `bedrooms`, `beds`, `bathrooms`.
- Immutable canonicalisation functions for amenities, languages and accessibility, plus GIN indexes; 18 new indexes covering price, type, rooms, flags, languages, accessibility and availability.
- `stay_night_calendar(listing_id, from, to)` for per-night availability.
- `stay_availability` now ignores inactive host blocks.
- `stay_blocks.is_active` + partial exclusion constraint so a host can switch a blackout off safely.
- `stay_cancel_booking` now applies the property’s published policy (flexible/moderate/strict/non-refundable) instead of one hard-coded 48h/24h rule.
- Pay-at-property checkout no longer requires a UPI VPA; `payment_intents.merchant_vpa/upi_uri` nullable only for offline mode.
- Partial unique index `reviews(bookingId)` prevents double reviews.
- Public `reviews` SELECT grant for anon/authenticated; service-role grants limited to the host/server paths.
- Host-safe RLS policy for reading blocks; media ordering policy (companion migration) reuses existing `media_assets`.

### 2.2 Server APIs

- `src/server/staySearchApi.ts` + `staySearchQuery.ts`: public `/api/stays/search`, `/api/stays/:listingId/calendar`, `/api/stays/:listingId/reviews`; strict parameter parsing, no client totals, RLS `anon` reads, availability joins, real review aggregates.
- `src/server/stayHostApi.ts`: owner-authorized host workspace — listings, stay upsert, room types, units, blackout blocks, bookings, check-in/out, offline payment recording, admin manual UPI settlement with audit event, media order.
- `src/server/stayApi.ts`: customer bookings now return true booking status, payment status, review eligibility; new post-checkout review endpoint with completed-booking, ownership and duplicate guards.
- `src/server/stayPayments.ts`: quote now returns server-computed `taxPercent`, `taxesPaise`, `totalWithTaxesPaise`; pay-at-property fixed.
- `server.ts`: registered search + host APIs before parameterised stay routes.

### 2.3 Web UI

- `src/components/AirbnbIndiaExperience.tsx` rewritten around server data (no demo fallback at all):
  - selected-filter chips with individual removal and Clear All;
  - filter drawer with Recommended, Place type, Price (nightly/trip total), Rooms & beds, Amenities with Show More, Booking, Standout, Property type, Accessibility, Host language with Show More;
  - live result count from the server, sort, List/Map switch, availability badges, empty/error states, Load more;
  - URL (`?sf=`) + sessionStorage persistence and `popstate` restore;
  - real review counts/rating; no fabricated listings.
- `src/components/stay/StayFilterDrawer.tsx`, `StayCard.tsx`, `StayDetail.tsx`, `StayTripsPanel.tsx`, `StayHostWorkspace.tsx`.
- Detail: photo gallery + lightbox (existing images only), amenities, accessibility, rooms, host name/avatar/languages, real reviews, availability calendar with disabled nights, map, server quote with taxes, sticky booking panel.
- Trips: real bookings, dates, payment state, address after confirmation, cancellation with server refund quote, post-checkout review form.
- Host workspace: property fields, amenities/languages/accessibility, room types and unit inventory, blackout dates, booking actions, payout status.
- Lazy loading: detail, filter drawer, trips, host workspace, map and MapLibre/Leaflet tiles are split; images remain `loading="lazy"`.

---

## 3. Feature-by-feature status

### 3.1 Filters (all runtime-verified)

| Requirement | Status | Notes / test |
|---|---|---|
| Selected chips, individual remove, Clear All | PASS | `stays-filters` tests 2, 4, 5 |
| Recommended: Kitchen, Wi-Fi, Free parking, Pets, AC, Washing machine, 1+ bathrooms | PASS | pets chip maps to `pets_allowed` boolean; 1+ bathrooms sets `bathrooms` |
| Place type Any/Room/Entire home | PASS | also shared room |
| Price nightly/trip total, INR min/max, valid ranges | PASS | min>max rejected; trip total uses nights |
| Taxes and fees | PARTIAL | server tax from `tax_percent` shown; no separate platform/cleaning fee model exists |
| Bedrooms, beds, bathrooms | PASS | counters, server `greatest(property, rooms)` |
| Amenities + Show More | PASS | 24 canonical amenities, GIN-indexed |
| Instant Book, Self check-in, Pets Allowed | PASS | real flags |
| Guest Favourite, Luxe only when verified | PASS | `guest_favourite`, `luxe_verified` booleans |
| Property types: house, flat, guest house, villa, apartment, resort, hotel, lodge, homestay, temple stay | PASS | all 10 + legacy guesthouse |
| Accessibility: step-free, parking, wide entrances, bedroom/bathroom, grab bars, shower chair, hoist | PASS | 9 keys canonicalised |
| Host languages: English, French, Hindi, Kannada, Swahili, Tamil, Telugu + others | PASS | 18 languages, Show More |
| Search by location/dates/guests/property/amenities | PASS | `/api/stays/search` |
| Persist across navigation and reload | PASS | sessionStorage + URL; browser back/forward uses `popstate` (hash-nav and reload tested) |
| Accurate counts, combinations, no-results/reset | PASS | draft count also fetched from server while drawer open |
| No fake properties/availability | PASS | demo fallback removed from Stay 2; API-only feed |

### 3.2 Customer journey

| Step | Status | Notes |
|---|---|---|
| Search → Filter → Results → Map/List | PASS | 5 seeded stays, map markers only for published coordinates |
| Property Details → Gallery → Amenities | PASS | existing listing payload images; lightbox |
| Host Profile | PARTIAL | inline host name/avatar/languages; no dedicated host page |
| Reviews | PASS | real rows; empty state; post-stay submission |
| Availability Calendar | PASS | per-night server calendar; disabled nights |
| Guests → Price Breakdown | PASS | server quote incl. taxes |
| Booking → UPI / Pay at Hotel → Confirmation | PASS (local) | UPI intent verified only by provider or admin manual approval; pay-at-hotel `pay_later` |
| My Bookings | PASS | trips panel |
| Check-in / Checkout | PARTIAL | host drives transitions; customer sees status, no self-service check-in action |
| Cancellation / Refund | PARTIAL | policy-aware server quote and state transition; no live refund rail |
| Review | PASS | only after host completes checkout; duplicate blocked |

### 3.3 Host journey

| Step | Status | Notes |
|---|---|---|
| Google Sign-In | BLOCKED | existing app flow; not exercised against hosted Mumbai in this run |
| Property Registration | PASS | existing listing wizard; host workspace creates the stay profile for an owned listing |
| Photo selection/upload | PARTIAL | reuses existing media pipeline; host workspace lists published `media_assets` and can reorder; no new upload UI was added and no new storage was written |
| Rooms / Amenities / Pricing | PASS | host workspace |
| Calendar | PASS | blackout blocks, toggle off, availability recalculation |
| Publish | PASS | `is_active` + admin-approved listing status |
| Manage Bookings | PASS | owner-filtered list |
| Payment Verification | PASS | offline collection → `collected_offline`; UPI manual approval admin-only by default, audited |
| Check-in / Checkout | PASS | host actions; date gate; state machine |
| Payout Status | PARTIAL | verified/collected/awaiting totals and `pending_payout`; no payout rail |

### 3.4 Booking safety

| Control | Status | Evidence |
|---|---|---|
| Overlap prevention under concurrency | PASS | partial GiST exclusion constraint; two-session test one 201/one 409 |
| Instant vs request-to-book | FAIL | instant flag and filter exist; request approval flow not implemented |
| Server-side total pricing | PASS | quote/checkout compute from `stay_room_types`; client totals ignored |
| Cancellation/refund policy | PASS (quote) | property policy applied; online refund settlement not exercised |
| Idempotent payment webhook | PASS (existing) | signed provider events + unique event id, untouched |
| UPI verified or authorized manual approval | PASS (local) | provider path existing; admin manual approval writes audit event + verifies intent + confirms allocation; owner default denied |
| Pay at Hotel pending until confirmed | PASS | `pay_later` → `collected_offline` by host |
| RLS / permissions | PASS | anon search; authenticated owner RLS; service-role only for rechecked server paths; guest cannot access host endpoints |

---

## 4. Tests and runtime evidence

All commands run locally.

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS |
| `npm test` | 238 tests, **223 pass, 0 fail**, 15 skipped (DB-gated) |
| `bash supabase/tests/run_local_validation.sh` | **ALL CHECKS PASSED** — functional=57, contact=23, app_config=14, rural=10, profile_privacy=10, super_admin=12, bootstrap=6, media=17, concurrency=1, no double booking |
| `npx playwright test e2e/stays-*.spec.ts` | **25 pass, 0 fail** |
| `npx playwright test e2e/app.smoke.spec.ts` | **23 pass, 0 fail** (six modules, responsive, a11y, deep links) |
| `node supabase/tests/migration_manifest.mjs` | PASS: baseline + 56 migrations, sha256 match |
| Android `./gradlew assembleDebug` | BUILD SUCCESSFUL |
| iOS `xcodebuild ... -sdk iphonesimulator` | BUILD SUCCEEDED |
| iOS simulator launch | PASS (auth gate screenshot) |
| Android emulator install/launch | PASS (auth gate screenshot) |

Screenshots (in `screenshots/stays-2026/`):

| File | Content |
|---|---|
| `01-desktop-list.png` | verified stay list, badges, filters/sort |
| `02-desktop-dates.png` | date search with availability |
| `03-desktop-filters-amenities.png` | filter drawer, amenities + Show More |
| `04-desktop-detail.png` | detail, gallery, host, sticky panel |
| `05-desktop-calendar.png` | availability calendar + reviews + map |
| `06-desktop-reviews.png` | reviews section |
| `07-desktop-trips.png` | My stays, payment state, cancel |
| `08-mobile-list.png` | mobile-first list |
| `09-mobile-filters.png` | mobile filter drawer |
| `10-mobile-detail.png` | mobile detail |
| `11-host-inventory.png` | host inventory editor |
| `12-host-bookings.png` | host bookings/payout status |
| `13-ios-launch.png` | iOS debug app launch |
| `14-android-launch.png` | Android debug app launch |
| `15-android-home.png` | Android launch state (auth gate) |

Key test files:
`e2e/stays-filters.spec.ts`, `e2e/stays-booking.spec.ts`, `e2e/stays-host.spec.ts`, `e2e/stays-real.spec.ts`, `e2e/stays-e2e-harness.ts`, `tests/stay-filters.test.mjs`.

---

## 5. Size measurements (exact)

### App / JavaScript

Measured with a local static server + Playwright `performance.getEntriesByType('resource')` on `#stays/airbnb`:

| Metric | Before (HEAD build) | After | Delta |
|---|---:|---:|---:|
| Stays-route JS transfer | 2,043,566 B | 1,996,288 B | **−47,278 B (−2.31%)** |
| Stays-route JS encoded | 2,042,666 B | 1,966,288 B | **−76,378 B (−3.74%)** |
| Stay entry chunk | 161,470 B | 96,691 B | **−64,779 B (−40.1%)** |

Lazy chunks added by this work (not in the initial Stays payload):

| Chunk | Bytes (min) |
|---|---:|
| `StayDetail` | 26,844 |
| `StayFilterDrawer` | 18,013 |
| `StayHostWorkspace` | 31,712 |
| `StayTripsPanel` | 12,293 |
| `stayFilters` | 15,113 |
| `FreeMap` (Leaflet + tiles) | 150,072 |

Full `dist` comparison (includes all pre-existing uncommitted work, not only Stays): HEAD `14,675,846 B` → current `18,216,180 B` (+3,540,334 B). This total is **not** attributable to Stays alone; the route-level measurement above is the honest Stays metric.

Native artifacts:

| Artifact | Before | After | Delta |
|---|---:|---:|---:|
| Android debug APK | 18,685,198 B | 19,422,436 B | +737,238 B (+3.95%) |
| iOS `.app` (simulator) | not captured | 24,468 KB | n/a |

### Database

Measured on two throwaway PostgreSQL clusters with the same migration chain, one excluding the new discovery migration:

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Database size | 14,530,227 B | 14,784,179 B | **+253,952 B (+1.75%)** |
| Stay tables (`stay_properties`, `stay_room_types`, `stay_units`, `stay_blocks`, `stay_allocations`) | 196,608 B | 360,448 B | **+163,840 B** |
| Indexes on stay/booking/review tables | 237,568 B | 417,792 B | **+180,224 B** |
| Index count | 29 | 47 | +18 |

### Storage

| Metric | Before | After |
|---|---:|---:|
| `media_assets` rows / bytes | 0 / 0 | 0 / 0 |
| New objects uploaded by this implementation | — | **0** |
| New demo images added | — | **0** |

No new image assets or libraries were added. The gallery reuses existing listing payload images and published `media_assets`; no storage writes were performed.

---

## 6. Blockers and production-readiness steps

### BLOCKED / not verifiable here

1. **Hosted Supabase migration and RLS verification.** Migrations are local candidates only. They have not been applied to Mumbai (`obkfgxjzlscungkhbyvq`).
2. **Live UPI settlement and refunds.** No provider credentials/webhook in this environment; sandbox disabled. Manual admin settlement is verified locally with an audit event, but real money movement is untested.
3. **Native Stays end-to-end.** `VITE_NATIVE_API_ORIGIN` is not set, so the native WebView’s `/api/*` requests cannot reach a backend; both apps launch and stop at the auth gate. Automated taps on the WebView’s guest button were not accepted by the emulator, so native interaction is not claimed.
4. **Google OAuth on hosted Mumbai / native redirect.** Not exercised.
5. **Payout execution.** Payout status is computed; no payout rail is configured.

### FAIL / not implemented

1. **Request-to-book** (owner approval before confirmation). Instant Book flag/filter is implemented; the request/approval state machine is not.
2. **Separate cleaning/service fee model** (taxes only).
3. **Dedicated public host profile page** (inline host block only).
4. **Customer self-service check-in** (host marks check-in; customer sees status).

### Exact production steps

1. Review `20261105170000_stay_discovery_filters.sql` and `20261105180000_stay_host_inventory_controls.sql`; apply through the approved Mumbai migration process. Do not reapply old migrations. Verify `supabase/tests/migration_manifest.mjs`.
2. Set `BOS_UPI_MERCHANT_VPA`, `BOS_UPI_MERCHANT_NAME`, provider + webhook secrets; keep `BOS_PAYMENT_SANDBOX=0` in production; run one end-to-end sandbox settlement and refund with provider confirmation.
3. Decide whether owner manual settlement is allowed (`BOS_ALLOW_OWNER_MANUAL_SETTLEMENT`); default remains admin-only.
4. Set `VITE_NATIVE_API_ORIGIN=https://<production-api-origin>` for native builds, rebuild `dist`, `npx cap sync`, and reinstall both apps.
5. Configure the native OAuth redirect/custom scheme and test Google sign-in on a physical device.
6. Configure a payout rail or keep the status-only display.
7. Re-run the 25 Stays E2E tests against staging with production-like inventory, then run load/performance checks.

---

## 7. Key files changed

- `src/components/AirbnbIndiaExperience.tsx` (rewritten, server-backed)
- `src/components/stay/{StayCard,StayDetail,StayFilterDrawer,StayTripsPanel,StayHostWorkspace}.tsx` (new)
- `src/lib/stayFilters.ts`, `src/lib/staySearchClient.ts` (new), `src/lib/stayCheckoutClient.ts`
- `src/server/staySearchApi.ts`, `src/server/staySearchQuery.ts`, `src/server/stayHostApi.ts` (new)
- `src/server/stayApi.ts`, `src/server/stayPayments.ts`, `server.ts`
- `supabase/migrations/20261105170000_stay_discovery_filters.sql`, `20261105180000_stay_host_inventory_controls.sql` (companion)
- `e2e/stays-{filters,host,booking,real}.spec.ts`, `e2e/stays-e2e-harness.ts`
- `tests/stay-filters.test.mjs`
- `screenshots/stays-2026/*`
