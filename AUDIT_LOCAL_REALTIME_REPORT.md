# Local Supabase Realtime + GPS/OTP/Document Audit — branch `feat/universal-gps-tracking`

**Audited base:** `9daf27d` · **Scope:** real local Supabase Realtime stack, WebSocket subscriptions/reconnects, booking authorization, GPS updates for Groceries/Human Help/Medicine/Water/custom services, adaptive polling fallback, GPS permission/stale/offline, OTP security, recurring bookings, document privacy, full regression, mobile UI and Supabase Pro cost limits.

**No hosted database change, push, deployment or paid service was used.**

**Overall result: PASS locally across the Realtime/GPS/OTP/document/adaptive-polling scope and the complete six-module browser regression.**

---

## 1. Local Supabase Realtime stack

An isolated local Supabase CLI project was started on non-default, dynamically free ports so the existing local `bookmyspace` stack was untouched:

| Item | Value |
|---|---|
| Project ID | `bos-audit-rt` |
| API URL | `http://127.0.0.1:56421` |
| Database | `postgresql://postgres:postgres@127.0.0.1:56422/postgres` |
| Studio | `http://127.0.0.1:56423` |
| Mailpit | `http://127.0.0.1:56424` |
| Migrations applied | baseline + **76** migrations |
| Baseline categories | 4 (`Human Help`, `Medicine Delivery`, `Water Bottle Delivery`, `Groceries Delivery`) |
| Realtime publication | 12 tables, including all 5 tracking/category tables |
| RLS | 10/10 new service tables enabled |

The stack was stopped after verification with `supabase stop --workdir /tmp/bos-supabase --no-backup`.

## 2. Real WebSocket evidence

Command:

```bash
BOS_SUPABASE_URL=http://127.0.0.1:56421 \
BOS_SUPABASE_ANON_KEY=… BOS_SUPABASE_SERVICE_ROLE_KEY=… \
BOS_SUPABASE_DB_URL='postgresql://postgres:postgres@127.0.0.1:56422/postgres?sslmode=disable' \
node --import tsx --test tests/realtime-local-supabase.e2e.mjs
```

Result: **7/7 PASS**

| Test | Evidence |
|---|---|
| WebSocket GPS for Groceries, Human Help, Medicine, Water, custom | Supabase Auth + `channel.on('postgres_changes')` received an INSERT for each booking; assertion checked booking ID, latitude, longitude and `source=device_gps` |
| Booking authorization | Unrelated customer read GPS = 0 rows; unrelated customer insert denied; unassigned provider read/publish denied; unrelated customer received no Realtime event |
| Reconnect | `realtime.disconnect()` → `realtime.connect()` → new channel → fresh GPS INSERT received |
| OTP | Prescription-gated; wrong code returns false; correct code verifies once; reuse returns `OTP_ALREADY_USED`; only SHA-256 hash stored |
| OTP attempts | Five wrong attempts consumed the cap; the correct code then returned `OTP_ATTEMPTS_EXCEEDED` |
| Recurring booking | Weekly frequency and occurrence count persisted in the booking and delivery profile |
| Document privacy | Customer owner upload/read worked; another customer and anonymous read were denied; Super Admin could read; foreign metadata path denied |

## 3. Adaptive polling fallback

`nextTrackingPollDelay()` now controls the fallback poll:

| State | Delay |
|---|---:|
| Terminal or `trackingEnabled=false` | **stop** (`null`) |
| Offline | 30 s |
| Tab hidden | 30 s |
| Supabase Realtime configured | 60 s safety poll only |
| No location yet | 4 s |
| Stale location | 5 s |
| Live, fresh location | 8 s |

The Supabase Realtime channel is also unsubscribed as soon as tracking becomes terminal/disabled. The customer panel now shows an explicit offline message; polling resumes on the `online` event. The fixed 5-second fallback timer in the client was removed to avoid duplicate reads.

## 4. GPS permission, stale and offline states

- **Permission denied:** real Chromium (390×844) with no geolocation permission displayed “Permission denied. Allow location access…” and created **0** tracking rows. The app never invents coordinates.
- **Offline:** switching the customer browser offline showed “You are offline. Live updates are paused…” and switching online cleared it.
- **Stale:** the existing stale badge/last-GPS age and `nextTrackingPollDelay` stale branch are covered by unit tests and the panel uses the live/stale state.
- **Inactive:** polling returns `null` and the Realtime channel is dropped when tracking is terminal/disabled.

## 5. Documents

A new forward-only migration adds private-document upload for active booking parties:

`supabase/migrations/20261111210000_service_document_storage_access.sql`

- Upload is limited to the authenticated user’s own path prefix in `bos-private-documents`.
- Reads remain owner/Super-Admin only; no public or cross-customer read.
- `media_assets` metadata insert allows private booking-document images/documents/text under the owner path.
- Local Supabase Storage test proved owner upload/read, cross-customer denial, anonymous denial and Super-Admin read.

## 6. Full regression

| Command | Result |
|---|---|
| `npm test` with DB gates enabled (fresh DB, baseline + 76 migrations) | **481 tests, 480 pass, 0 fail, 1 static skip** |
| `bash supabase/tests/run_services_e2e.sh` | existing services **12/12 PASS**; builder/GPS/offline/permission/mobile-all-services **22/22 PASS** |
| `bash supabase/tests/run_all_booking_suites.sh` | **ALL BOOKING SUITES PASSED** — all nine suites exit 0 |
| `npm run test:realtime` (reproducible isolated stack) | **7/7 PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** |
| `node supabase/tests/migration_manifest.mjs` | **PASS**, baseline + 76 migrations pinned |

The single skip is the pre-existing static test “provider listing approval still requires an administrator” (not DB-gated; PostgreSQL RBAC/ownership tests cover it).

The six-module booking runner was executed:

| Suite | Result |
|---|---|
| live_edit_audit | **PASS** |
| live_edit_security | **PASS** |
| services_api | **PASS** |
| services_browser | **PASS** |
| stays | **PASS** |
| pg_integration (all engines) | **PASS** — phase1 37/37, phase2 6/6, admin-console journey |
| pg_payments (all engines) | **PASS** — phase1 59/59, phase2 5/5 |
| classes | **PASS** — 7/7 journey, movies 2/2, cross-browser and restart persistence |
| venues | **PASS** — 9/9 Chromium journey, Chromium/Firefox/WebKit mobile/tablet/desktop, restart persistence |

The browser harnesses were repaired to the current UI rather than weakening assertions:

- PG: Style 3 card `article` + `View`; Style 3 detail `#pg-style3-detail-title`; bottom-nav My Bookings.
- Classes: Style 3 `Course listing` article + `View Details` + `Enroll Now`; `Back to all classes` close; pending-row scoping; stateful serial retries disabled so retries cannot create duplicate pending/active batches.
- Venues: `View and book`, `Book Hall`, and the current pending/approved labels; cross-browser spec updated identically.

No product backend or six-module API test failed.

## 7. Security and cost

- Realtime RLS is enforced per booking; direct unrelated reads/inserts were denied and no WebSocket event leaked.
- OTP plaintext is never stored; attempts are capped; medicine prescription verification gates OTP.
- Private documents are not public; cross-customer and anonymous reads fail.
- GPS rate guard remains one accepted point per booking per 5 seconds.
- Adaptive fallback polling reduces fallback reads and stops entirely for inactive tracking.
- Supabase Pro remains within 5M Realtime messages at ~250 concurrent 30-minute tracked deliveries; the 500-connection quota binds first. See [Supabase Pro cost audit](SUPABASE_PRO_COST_LIMITS_AUDIT.md).
- No paid map/SMS provider is used.

## 8. Supabase Pro limits

The local stack is free/local; no hosted quota was consumed. The cost analysis remains valid: ~250 simultaneous 30-minute tracked deliveries use ~2.25M of 5M Realtime messages and exactly 500 Pro connections. Adaptive polling does not add Supabase Realtime messages because the fallback uses the server API. The rate guard caps GPS writes.

## 9. Remaining owner-gated items

1. **Hosted migration apply, push, deployment** were not performed.
2. The local Supabase stack is disposable and was stopped; hosted Realtime behavior remains subject to the owner’s hosted environment.
3. The six-module suite’s browser jobs can be resource-sensitive under concurrent Docker/Playwright load; individual suite reruns are recorded in the final result.

---

## Final result

**PASS locally** for real Supabase Auth/Realtime WebSockets, reconnects, booking authorization, GPS updates across all five categories, adaptive polling, GPS permission/offline handling, OTP security, recurrence, private documents, full unit/DB regression, the complete six-module browser regression, mobile customer/provider/Super Admin dynamic-service views and the production build.

**BLOCKED:** none in the local scope. Hosted migration apply, push, merge and deployment remain owner-gated and were not performed; no paid service was used.
