# BookOurSpace Hotels & Stays — cloud Airbnb-style readiness

Date: 2026-11-06  
Repos: Web `/Users/aa/Downloads/bookourspace-react`, Capacitor `/Users/aa/Downloads/bookourspace-react-capacitor`  
Supabase target (not written): `obkfgxjzlscungkhbyvq` (Mumbai, ap-south-1)

No hosted writes, migrations, real payments, push, merge or deployment were performed.

---

## Verdict

**NO-GO for production.** Stays is **code-complete locally** for search → OSM map → details → photos → calendar → checkout (Razorpay Checkout, verified UPI QR/intent, pay at property) → My Trips → cancel/refund → check-in/out → reviews, with PostgreSQL inventory locks.

**Cloud production is BLOCKED** until Mumbai migrations are applied, stay inventory is published, a hosted HTTPS API (not this Mac) is deployed, Razorpay/UPI credentials and webhooks are configured, Google OAuth is proven on that host, and Android/iOS are rebuilt against `VITE_NATIVE_API_ORIGIN`.

Local tests must not be read as cloud readiness.

---

## Status key

| Tag | Meaning |
|---|---|
| **PASS** | Implemented and runtime-verified locally |
| **CODE** | Implemented; not exercised against Mumbai |
| **BLOCKED** | Needs hosted credentials, approval, or a non-Mac API |

---

## 1. Task results

| # | Task | Status | Evidence |
|---|---|---|---|
| 1 | Hotels/Stays cloud-backed; no fake listings or simulated production payments | **CODE locally / BLOCKED hosted** | Search and checkout refuse JSON/demo fallbacks. Production startup requires `BOS_LISTINGS_DATABASE_URL` with TLS. Host `approve_online` returns `SIMULATED_SETTLEMENT_FORBIDDEN` when `NODE_ENV=production`. Mumbai currently has **0** stay properties. |
| 2 | Airbnb core journey | **PASS locally** | Host Playwright 9/9 (pricing, request-to-book, self check-in/out, reviews). Payment Playwright 4/4. OSM map + discovery remain in `HotelsStayExperience`. |
| 3 | Razorpay Checkout + separate verified UPI + pay at property | **PASS locally / BLOCKED live money** | Instant checkout + host request approval. Production UPI creates a Razorpay UPI QR (no screenshot/UTR). Sandbox keeps a VPA URI. Pay at property unchanged. Guest My Trips can complete Razorpay Checkout or show the verified QR. |
| 4 | Cloud PostgreSQL inventory locks, pricing, date blocking, no double-book | **PASS locally / BLOCKED hosted apply** | GiST exclusion + `stay_hold_units`; concurrent 3-guest/2-room test. Pending Mumbai stay migrations include discovery/host/request/fees/Razorpay. |
| 5 | Host dashboard, property management, Admin approval, Google-only Sign-In, RLS | **PASS locally / BLOCKED hosted OAuth** | Host workspace + request approve/reject. Google-only Auth contract. RLS on stay/payment tables in local validation. |
| 6 | Six modules, 59→60 local migrations, pending Mumbai, media visibility | **PASS review** | Other modules untouched. Manifest **baseline + 60**. Mumbai ledger last snapshot **53 rows** (baseline + 52). See §4. |
| 7 | Real cloud persistence, Google OAuth, Razorpay sandbox, verified UPI, Web/Android/iOS E2E | **BLOCKED** | Only local PostgreSQL + signed sandbox events. Native production origin unset. APK/IPA not rebuilt. |
| 8 | PASS/FAIL/BLOCKED report | This file | — |

---

## 2. What changed in this session (code)

Forward-only local migration `20261106010000_stay_razorpay_and_verified_upi.sql` (not applied to Mumbai):

- Instant checkout accepts `razorpay` as well as `upi` and `pay_after_service`.
- `settle_stay_provider_event` settles by stored Razorpay order/QR id; amount must match the PostgreSQL quote; replays are idempotent.
- Sandbox `settle_stay_payment` still works for local UPI HMAC tests.

Server:

- Production UPI (instant checkout **and** host request approval) creates a Razorpay UPI QR. A raw `upi://pay` VPA is sandbox-only.
- `POST /api/stays/payments/razorpay/webhook` verifies **raw-body** HMAC.
- `POST /api/stays/payments/razorpay/verify` checks Checkout HMAC then fetches the payment.
- Host `approve_online` is refused in production (`SIMULATED_SETTLEMENT_FORBIDDEN`). Local e2e still records an admin audit event under `NODE_ENV=test`.
- `GET /api/stays/bookings` returns `razorpayOrderId`, `razorpayKeyId`, `qrImageUrl` so My Trips can finish payment after host approval.

UI: three methods on Stays checkout; My Trips Pay now for Razorpay Checkout and verified UPI; host “Approve settlement” only when sandbox capabilities are on. Same sources copied to the Capacitor tree.

---

## 3. Local runtime evidence

| Suite | Result |
|---|---|
| `npx tsc --noEmit` (web) | PASS |
| `npx tsc --noEmit` (Capacitor) | PASS |
| `npm run build` (web) | PASS — `dist` **7,058,116 B** |
| `npx tsx --test tests/stay-razorpay-signature.test.mjs tests/payment-settlement-safety.test.mjs` | **20/20 PASS** (3 Razorpay signature + 17 settlement safety; UTR still never settles) |
| `bash supabase/tests/run_stay_payment_e2e.sh` | **47/47 + 5/5 PASS** including Razorpay capture, replay, checkout verify, UPI HMAC, pay-at-property, refund, concurrency, restart |
| `npx playwright test e2e/stays-payments.spec.ts` | **4/4 PASS** including Razorpay webhook |
| `npx playwright test e2e/stays-host.spec.ts` | **9/9 PASS** including request-to-book, check-in/out, reviews, owner refused / admin recorded sandbox settlement |
| `node supabase/tests/migration_manifest.mjs` | PASS — baseline + **60** |
| `bash supabase/tests/mumbai_installer_guard_test.sh` | PASS (plan only; no apply) |

No real Razorpay, UPI, or Google network calls were made. Sandbox orders are `order_sandbox_*`.

---

## 4. Migrations and media

### Local chain

Previously 59 files. This worktree has a 60th candidate. Manifest SHA-256 matches the working tree.

### Mumbai hosted (last read-only snapshot, 2026-11-06)

Ledger **53 rows** = baseline marker + 52 applied through `20261105140000_media_anon_policy_split`. Public tables 68, RLS on all 68. Stay properties/room types/bookings: **0**. `media_assets`: 1 ready/public test row with **no active listing**. Storage: 2 objects, 148,357 bytes.

This session did **not** re-query Mumbai (no hosted connection).

### Pending on Mumbai (apply only with explicit approval, installer `--plan` then `--apply`)

Previously seven; with this candidate **eight**:

| Order | File | Note |
|---:|---|---|
| 1 | `20261105150000_server_media_byte_validation.sql` | READY FOR APPROVAL — no object rewrite |
| 2 | `20261105160000_media_published_listing_visibility.sql` | **REVIEW** — public reads require a published listing/publication. The existing unreferenced test asset (`1739b44f-3a47-4d0f-a1fd-0e42a2088747`, `[BOS-MEDIA-TEST-20261105]`) will drop out of public listing discovery. Bytes are not deleted. |
| 3 | `20261105163924_profile_media_and_account_closure.sql` | READY FOR APPROVAL |
| 4 | `20261105170000_stay_discovery_filters.sql` | READY FOR APPROVAL — Stays filters/calendar |
| 5 | `20261105180000_stay_host_inventory_controls.sql` | READY FOR APPROVAL — host blocks, policy cancel |
| 6 | `20261105210000_stay_requests_fees_profiles.sql` | READY FOR APPROVAL — request-to-book, fees |
| 7 | `20261105220000_restore_pg_hostel_property_type.sql` | READY FOR APPROVAL — conditional PG type repair |
| 8 | `20261106010000_stay_razorpay_and_verified_upi.sql` | **NEW, local only** — Razorpay/UPI settlement for Stays |

Do not use `supabase db push`. Use `bash supabase/install_mumbai_migrations.sh --plan` then a separately approved `--apply`.

---

## 5. Missing credentials and hosting

| Item | Status |
|---|---|
| Mumbai DB URL for production API (`BOS_LISTINGS_DATABASE_URL`, TLS, session pooler 5432, `postgres.<ref>`) | Missing from this session; loopback-only locally |
| `BOS_SERVER_HMAC_SECRET` (≥32 chars) on the **hosted** API | Local `.env.local` is not production |
| Razorpay Key ID / Key Secret / Webhook Secret | Not used against Razorpay; placeholders only |
| Razorpay dashboard webhooks | Need `https://<hosted-api>/api/stays/payments/razorpay/webhook` (and PG URL if sharing the account) |
| Google OAuth QA on Mumbai Auth | BLOCKED — no approved live login this session |
| `VITE_NATIVE_API_ORIGIN` | Empty by design until a hosted HTTPS API exists. Android/iOS production cannot call this Mac. |
| `BOS_NATIVE_APP_ORIGINS` | `https://localhost,capacitor://localhost` |
| Hosted stay listings + photos | Zero properties on Mumbai; seed/publish is a hosted write |
| Payout rail | Status only; no transfer provider |

Production must run an API process with `NODE_ENV=production` on a public HTTPS host, pointed at Mumbai PostgreSQL. `npm run dev` on this Mac is not that process.

---

## 6. Size

| Artifact | Previous documented | This session | Delta |
|---|---:|---:|---:|
| Web `dist` | 6,929,454 B (then 7,055,887 B) | **7,058,116 B** | **+128,662 B** vs original documented; **+2,229 B** vs prior Stays Razorpay build |
| Stay checkout client chunk | — | 2.19 kB (0.98 kB gzip) | Razorpay fields |
| `StayTripsPanel` | — | 17.89 kB (5.13 kB gzip) | Razorpay Checkout + verified UPI on My Trips |
| `HotelsStayExperience` | — | 119.34 kB (27.51 kB gzip) | includes checkout methods |
| Android APK / iOS app | 8,217,078 B / 13,900 KB | **not rebuilt** | Capacitor **source** synced; binaries stale until the next native build |

No new images. No hosted Storage writes.

---

## 7. What still must happen before claiming cloud Airbnb-style Stays

1. Approve installer apply of the eight pending Mumbai migrations (decide media visibility for the unreferenced test asset).
2. Deploy the Express API to HTTPS with Mumbai `BOS_LISTINGS_DATABASE_URL` (`sslmode=verify-full` or `require`), HMAC secret, Razorpay keys, webhook secret.
3. Register Razorpay webhooks on that host.
4. Publish real stay listings (host + Admin approval) so search is not empty.
5. Point Capacitor `VITE_NATIVE_API_ORIGIN` at that HTTPS API and rebuild Android/iOS.
6. Run Google Sign-In, Razorpay test-mode capture, UPI QR capture, pay-at-property, cancel/refund, and check-in on **that** host — not on localhost.

Until those steps are approved and executed, production Stays remain **BLOCKED**.
