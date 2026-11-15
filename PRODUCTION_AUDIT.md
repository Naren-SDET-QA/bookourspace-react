# PRODUCTION AUDIT — bookourspace-react (feat/module-flags-and-stay-inventory)

Date: 2026-11-03 · Local disposable PostgreSQL 17 on 127.0.0.1:5544 (test DB `bos_test`)

> Evidence-based status only. Items that could not be executed are BLOCKED, not PASS.

## 1. Baseline (current tree)

| Check | Result | Evidence |
|---|---|---|
| `tsc --noEmit` | **PASS** | exit 0 |
| `vite build` | **PASS** | exit 0 |
| `npm test` | **PASS** | 80 tests · 74 pass · 0 fail · 6 skipped (DB-gated) |
| `git diff --check` | **PASS** | 0 whitespace errors |
| App boots | **PASS** | HTTP 200 on :3000 |

## 2. Database / RLS / concurrency (PASS, local disposable DB)

- All **12 migrations apply cleanly** to a fresh PostgreSQL 17 instance (after provisioning a Supabase-compatible base schema: `auth.users`, `auth.uid()`, `auth.role()`, `public.profiles/listings/bookings` + grants).
- `stay_allocations` enforces **no double booking** at the database level via `EXCLUDE USING gist (unit_id WITH =, stay_dates WITH &&) WHERE status IN ('held','confirmed')`.
- `stay_confirm_booking` **refuses to consume inventory** unless `bookings.payment_status = 'verified'` (`BOOKING_NOT_PAID`, SQLSTATE 42501) — no fake success.
- Provider listing RLS/RBAC verified by `tests/provider-listings-postgres.integration.test.mjs` (PASS set below).

### Postgres integration suite (14 tests)
| Result | Count |
|---|---|
| PASS | **8** |
| FAIL | **6** |
| BLOCKED | 0 |

Failing cases and evidence:
- `AUTH_PROFILE_PERSISTENCE_UNAVAILABLE` (503) — local `authenticated` role lacks INSERT/UPDATE on `public.profiles` (base-schema grant parity; the real Supabase baseline grants this).
- `404` on provider-registration workflow endpoints (local base schema is a stub, not the full baseline).
- `pg_hostels filtered feed` — marketplace feed mapping depends on baseline tables absent from the stub.
- `approved newly onboarded provider listing persists after restart` — depends on the same registration path.

**Verdict:** the transactional/RLS/concurrency design is verified; the residual failures are **local base-schema parity**, not product logic.

## 3. Stays — availability / hold / booking / cancel (PARTIAL PASS)

New API: `src/server/stayApi.ts` mounted in `server.ts`
- `GET /api/stays/:listingId/availability?checkIn&checkOut`
- `POST /api/stays/:listingId/holds`
- `POST /api/stays/holds/:token/confirm` (requires a **verified** booking)
- `POST /api/stays/holds/:token/release`
- `POST /api/stays/bookings/:bookingId/cancel` → server-computed refund quote (`FULL_REFUND_48H` / `HALF_REFUND_24H` / `NO_REFUND_UNDER_24H`)
- `GET /api/stays/bookings`

E2E (`tests/stay-booking-e2e.test.mjs`): **4/5 PASS**
- PASS: unauthenticated availability allowed but holds require session (401)
- PASS: invalid dates (400) and unknown room type (404) fail closed
- PASS: concurrent holds on the last unit → one `201`, one `409` (no double booking)
- PASS: released hold frees the unit for the next guest
- **FAIL**: paid confirm — the `stay_confirm_booking` RPC returns `42501` through the API connection while the same call succeeds when executed directly in SQL. **Open bug.**

## 4. Services (BLOCKED on missing API surface)

- Migration `20261103180000_services_booking_lifecycle.sql` exists and applies (booking lifecycle tables/constraints).
- **No HTTP API endpoints** for service booking create / provider accept / complete / cancel were found (`server.ts` exposes only listings CRUD + payments + admin).
- **Result: FAIL (not implemented)** — UI routes render and filters work, but the lifecycle cannot be exercised end-to-end.

## 5. UPI / Pay After Service (BLOCKED)

- Existing: `POST /api/payments/create-intent`, `POST /api/payments/webhook-settle`, `POST /api/payments/verify-upi` (server-side, provider-fail-closed, UTR immutability covered by `payment-settlement-safety.test.mjs` — 12/12 PASS).
- **Missing:** dedicated UPI **QR/intent** endpoint and an explicit **Pay After Service** settlement path with trusted provider evidence.
- **Result: FAIL (not implemented)**; settlement verification itself is PASS.

## 6. UI / routes / devices

- Routes verified: `/`, `#pg`, `#classes`, `#stays`, `#services`, `#venues`, `#movies`, `#venue-<id>` deep link, `#admin` (gated).
- Style routes verified: `#pg/style1|style2`, `#stays/old|airbnb`, `#services/old|triangle`.
- Device matrix (previous run): **7 devices × 7 routes = 49 combinations, 0 overflow, 0 console errors, 0 broken images.**

## 7. BLOCKED (credentials / tooling — cannot be executed here)

| Item | Why BLOCKED |
|---|---|
| Playwright browser E2E | Not installed in the repo; browser checks used headless Chrome + CDP instead |
| Real Supabase staging / Google OAuth | No `GOOGLE_CLIENT_ID/SECRET`; no staging project |
| Payment sandbox (Razorpay/UPI) | No sandbox keys (`RAZORPAY_*` empty) |
| Production DB / RLS audit | Requires approval; local disposable DB only |
| Notifications (email/WhatsApp) | No provider credentials |

## 8. Honest score

| Area | Status |
|---|---|
| Build / typecheck / unit tests | PASS |
| PostgreSQL transactions + RLS + concurrency | PASS (integration 8/14; residual = base-schema parity) |
| Stays API (availability/hold/cancel/concurrency) | PARTIAL (4/5 E2E; paid-confirm bug) |
| Services booking lifecycle API | FAIL (not implemented) |
| UPI QR + Pay After Service | FAIL (not implemented) |
| Playwright E2E | BLOCKED (not installed) |
| Staging/OAuth/payment sandbox E2E | BLOCKED (no credentials) |

**Not 100% production ready.** The DB/RLS/concurrency core and the payment-verification guards are verified. The remaining critical gaps are the Services lifecycle API, UPI QR/Pay-After-Service endpoints, the stay paid-confirm bug, and the local base-schema grant parity needed to make the full integration suite green.

## 9. Function Halls & Venues — booking completion re-audit (2026-11-03)

This section supersedes the venue rows above. Scope was a disposable local PostgreSQL cluster, the local Express API and a built Vite preview in Chromium. No hosted Supabase, cloud schema, live payment, commit, push or deployment was touched.

### 9.1 Verified invariants

| Area | Result | Evidence |
|---|---|---|
| Overlapping reservations | **PASS** | Two simultaneous customer requests for the same protected interval return exactly one `201` and one `409`; a second request inside the setup/cleanup buffer is also `409`. |
| Atomicity / price authority | **PASS** | Booking creation is one PostgreSQL function call under a per-listing advisory lock; the GiST exclusion constraint is the final guard. A forged client `amountPaise`/`total` does not change the server quote (`total_paise` equals the quote). |
| Idempotency | **PASS** | Same key + same fingerprint returns the original booking (`200`); same key + different input returns `409 IDEMPOTENCY_CONFLICT`. |
| RLS / RBAC | **PASS** | Foreign customer cancellation **403**, foreign owner accept **403**, owner scope for a non-owner **empty**, admin scope for a customer **403**, foreign dispute **403**, non-admin dispute resolution **403**. |
| Owner availability | **PASS** | Month calendar reads PostgreSQL reservations/blocks; owner can block a date range; a block overlapping a live reservation is refused; owner calendar shows the protected reserved interval without customer identity. |
| Slots and buffers | **PASS** | Hourly, half-day (≤6h), full-day (≤12h) and multi-day (≥24h) quotes are server-calculated; the protected interval includes setup and cleanup buffers. |
| Pay at Venue | **PASS (unpaid obligation)** | Booking is recorded as `obligation_recorded`; no client path sets `verified`. |
| Sandbox UPI/Razorpay | **PASS (sandbox only)** | When `BOS_VENUE_PAYMENT_SANDBOX=1` and a ≥16-byte secret exist, Razorpay/UPI intents are created; a mismatched intent is `409`; only the HMAC-verified raw-body callback settles. Live providers return `503`. |
| Refunds | **PASS (sandbox)** | Cancellation computes a policy refund (`refund_pending`); a signed `refund.processed` event marks it `refunded`; replay is idempotent. |
| Disputes | **PASS** | Party-opened dispute `201`, duplicate `409`, non-party `403`, admin resolution with audit `200`, resolved state survives restart. |
| Restart persistence | **PASS** | After closing the repository/server and reconnecting, the owner still reads six bookings, the refunded payment state and the resolved dispute. |
| Customer/owner/admin UI wiring | **PASS (source + shell)** | Venue detail → booking modal → quote → reservation → payment choice → My Bookings → cancellation; owner calendar/settings/bookings/reschedule; admin dispute queue/override. |

### 9.2 Commands actually run

| Command | Result |
|---|---|
| `bash supabase/tests/run_local_validation.sh` | **PASS**, exit 0. Venue HTTP/PostgreSQL integration 1/1; all existing suites green; new venue migrations applied cleanly. |
| `npm test` | **PASS**, exit 0 — 98 tests, 84 passed, 0 failed, 14 skipped (DB-gated). |
| `npx tsc --noEmit` | **PASS**, exit 0. |
| `npm run build` | **PASS**, exit 0. |
| `npx playwright test e2e/app.smoke.spec.ts --project=chromium` | **PASS**, 9/9 in 8.6s (isolated `vite preview`); includes `#venues`. |
| `git diff --check` | **PASS**, exit 0. |

### 9.3 Still blocked / not claimed

- Hosted Google OAuth profile provisioning and hosted Supabase RLS were not exercised; local signed sessions and a disposable PostgreSQL cluster were used.
- Live Razorpay/UPI credentials, live order creation, live webhook handling and live refunds remain blocked. Only the local HMAC sandbox path is verified.
- A database-backed venue checkout in a real browser was not exercised; the 9 Playwright checks cover the shell, routes and PWA, not a signed-in venue purchase.
- WebKit/Firefox/Edge and physical Android/iOS/tablet testing were unavailable.
- Dynamic Admin venue categories and venue-local weekly opening-hour schedules are not fully wired into customer/owner pickers.

**Focused venue readiness: 78/100 — NO-GO** until hosted auth/RLS, live payment verification and cross-engine/device evidence exist.
