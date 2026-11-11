# PAYMENT SECURITY REPORT

Generated: 2026-11-03 · Worktree: `bookourspace-react`

## Automated security tests — PASS
`tests/payment-settlement-safety.test.mjs` spawns the real server and asserts:
1. provider-unavailable endpoints fail closed & reject unauthenticated intent creation
2. submitted UTR + client signature remains **pending** when the provider is unavailable
3. invalid UTRs and a different customer cannot update a payment intent
4. concurrent same-intent UTR retries remain pending and never settle
5. verified UTR retries are immutable; another intent cannot claim the same UTR
6. missing/falsified client payment flags cannot bypass server policy
7. verified intents are bound to listing, amount, purpose, owner and single use
8. movie checkout requires verified payment even if the client asks for pay-later
9. legitimate offline booking remains available for non-cinema listings
10. provider listing approval still requires an administrator
11. movie UI returns on failed verification before requesting ticket creation
12. the public settlement endpoint cannot mint proof; UI exposes provider unavailability

**Result: 12/12 PASS.** `provider-contact-request-flow` and `admin-authorization` also PASS.

## Server-authoritative design (verified by code + tests)
- Price is computed server-side from the listing/room, never from the client total.
- Payment intents are single-use and idempotent by `(intent, UTR)`.
- Settlement requires a **verified UTR + server-side signature**; the public endpoint cannot mint proof.
- Webhook settlement verifies HMAC (`BOS_SERVER_HMAC_SECRET`) before state change.
- Refunds are recorded with a lifecycle (`refunded` / `failed`) and never silently flipped to "paid".
- Admin actions are gated by signed admin identity (RBAC/RLS).

## Client money-path hardening (this session)
- **Movies V1 is now discovery-only.** A `MOVIES_BOOKING_ENABLED = false` gate disables the 5-step seat/payment/ticket flow (`openDistrictBooking`, seat-hold restore, booking modal). Tapping "Book" now shows a "coming soon" toast. V2 code remains isolated in `DistrictMoviesSection.tsx` and is not reachable.
- All other modules (PG, Classes, Venues, Services, Hotels) keep their enquiry/booking paths unchanged.

## Risks / not verified
| Item | Status |
|---|---|
| Razorpay live/test credentials | ❌ not configured — no live settlement test |
| Google OAuth session bound to payment | ❌ blocked (no OAuth env) |
| HMAC secret persistence | ❌ `BOS_SERVER_HMAC_SECRET` unset → ephemeral dev key; signed passes invalidate on restart |
| Webhook endpoint exposure | ⚠️ requires `APP_URL` + provider dashboard config; not verified |
| Refund reconciliation against real provider | ❌ blocked (no provider credentials) |
| Production DB payment tables/RLS | ❌ not audited against prod (read-only audit not executed) |

## Verdict
Server-side payment **logic** is well-guarded and tested (12/12 PASS). Production **payment readiness is BLOCKED** on credentials, HMAC secret, OAuth, and a read-only DB audit. No real payments/refunds were executed.
