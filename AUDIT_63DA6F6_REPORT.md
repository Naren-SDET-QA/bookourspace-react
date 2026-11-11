# Audit of commit `63da6f6` — Dynamic Services, GPS, OTP, RLS and Realtime

**Date:** 2026-11-11
**Branch:** `feat/universal-gps-tracking`
**Audited commit:** `63da6f6` (`feat(services): add dynamic super admin service category builder`)
**Audit fix commit:** the follow-up `fix(audit): verify dynamic services, gps, otp and cost limits` commit on this branch.
**Scope:** dynamic Super Admin builder, Groceries Delivery, Human Help, Medicine, Water, real GPS, OTP, recurrence, documents, RLS, Realtime, skipped DB tests, security, mobile UI and Supabase Pro cost limits.

**Overall result: PASS locally, with one explicitly BLOCKED item: the full Supabase Realtime WebSocket transport was not started locally. Its database publication and logical-decoding path were verified instead.**

No paid service, hosted database change, push or deployment was performed.

---

## 1. Audit result matrix

| Area | Result | Evidence |
|---|---|---|
| Dynamic Super Admin builder | **PASS** | `run_services_e2e.sh`: create draft → publish → version conflict → disable/enable → rollback; audit rows; browser builder open at desktop and 390 px |
| Groceries Delivery | **PASS** | Baseline `groceries_delivery` config added; API + browser mobile form + provider completion covered |
| Human Help booking flow | **PASS** | Required dynamic fields, quantity, OTP handover and completion |
| Medicine booking flow | **PASS** | Prescription required, unlicensed pharmacy rejected, verified pharmacy accepted, prescription verification gates OTP/completion |
| Water booking flow | **PASS** | Quantity + weekly recurrence + OTP completion |
| Custom category flow | **PASS** | New `pet_grooming` category created through the builder, saved fixed price, booked, completed |
| Real GPS | **PASS** | Real Chromium geolocation at 390×844 → server-issued device GPS row (lat/long asserted, `source=device_gps`) |
| Customer OTP | **PASS** | Customer generates via server, provider verifies once, handover confirmed, completion unblocked |
| Recurrence | **PASS** | Water and Groceries weekly recurrence persisted and exposed through the booking API |
| Documents | **PASS** | Medicine prescription required; admin verification releases OTP/completion; another customer cannot read the booking/tracking |
| RLS | **PASS** | Drafts hidden from anon, tenant B hidden, cross-customer booking/tracking denied, 10 new tables have RLS enabled |
| Realtime | **PASS at publication/WAL level; BLOCKED for WebSocket transport** | 5 tables in `supabase_realtime`; `pg_recvlogical` emitted `public service_tracking_locations`; local Supabase Realtime service was not started |
| Skipped DB tests | **PASS** | 480 tests with DB gates enabled: 479 pass, 0 fail, 1 static skip (non-DB) |
| Security | **PASS** | Server-authoritative actor checks, provider Google identity, RLS, rate guard, private documents, append-only audit |
| Mobile UI | **PASS** | 390 px customer form + provider GPS/OTP flow + mobile builder layout |
| Supabase Pro cost limits | **PASS within ~250 concurrent tracked deliveries** | [cost audit](SUPABASE_PRO_COST_LIMITS_AUDIT.md); connection quota binds before messages |

---

## 2. Issues found and fixed during the audit

1. **Skipped services test used invalid slot minute (`09:01`).**
   `tests/services-booking-e2e.test.mjs` generated slots with arbitrary minutes, so the real availability function rejected every create with `409 SERVICE_SLOT_UNAVAILABLE` when the DB gate was enabled. Fixed to the provider’s canonical `09:00` slot grid. This exposed a pre-existing latent test bug, not a server regression.

2. **GPS/OTP UI was Supabase-client-only.**
   Without a local Supabase stack, tracking panels failed even though the booking/OTP database was healthy. Added server-authoritative tracking endpoints and made the client use them first:
   - `GET /api/services/bookings/:id/tracking`
   - `POST /api/services/bookings/:id/tracking/location`
   - existing server OTP and verify endpoints are now the primary OTP path
   Supabase Realtime remains the live transport when configured; a 5-second polling fallback is used when it is not.

3. **Tracking labels showed “Human Help” for dynamic categories.**
   Groceries/Pet Grooming use the shared `human_help` tracking kind, so the UI labelled them Human Help. Added the saved category name to the server snapshot and used it in customer/provider tracking headers.

4. **Provider workspace stayed stale after OTP verification.**
   After verifying the handover OTP in the tracking dialog, the job still had the old `deliveryConfirmedAt` and “Mark completed” remained blocked. Closing the tracking dialog now reloads the job list.

5. **Groceries Delivery baseline was missing.**
   Added a published `groceries_delivery` category with basket fields, quantity, delivery options, GPS/OTP/payment/confirmation toggles and daily/weekly recurrence.

6. **GPS could be spammed into the Realtime stream.**
   Added a database rate guard: one accepted point per booking per 5 seconds (`TRACKING_UPDATE_TOO_FREQUENT`, HTTP 429), protecting both Postgres storage and the Supabase Realtime message quota.

7. **Realtime and RLS were not asserted by the E2E harness.**
   Added checks that the five tracking/category tables are in `supabase_realtime` and that all ten new service tables have RLS enabled. Added a cross-customer tracking/booking RLS assertion.

8. **Browser completion assertion was racy.**
   The GPS/OTP journey clicked “Mark completed” and queried the database before the action response settled. The test now waits for the actual `200` action response and the persisted status.

---

## 3. Verification evidence

### 3.1 Full unit/integration suite with DB gates enabled

Command (disposable PostgreSQL 17; baseline + 75 migrations):

```bash
BOS_LISTINGS_DATABASE_URL=postgres://postgres@127.0.0.1:64412/bos_audit3?sslmode=disable \
BOS_LOCATION_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:64412/bos_audit3?sslmode=disable \
npm test
```

Result:

```text
tests 480
pass 479
fail 0
skipped 1
```

The only skip is the pre-existing static note: “provider listing approval still requires an administrator” (covered by the disposable PostgreSQL RBAC/ownership tests; it is not DB-gated). All DB-gated suites ran, including classes enrollment, live-edit security, provider listings, services booking, services lifecycle, service builder, venue bookings and location search.

### 3.2 Services + dynamic builder E2E

```bash
bash supabase/tests/run_services_e2e.sh
```

Result: existing services lifecycle **12/12 PASS**, dynamic builder **20/20 PASS**, direct SQL:

```text
duplicate live slots=0  null_slot_keys=0  intents=3  events=4  refunded=1
rls=t  cross_customer_rows=0
baseline service categories=4  medicine_hard_rules=1
realtime_tables=5  new_rls=10
```

Covered categories: **Groceries Delivery, Human Help, Medicine Delivery, Water Bottle Delivery, Pet Grooming (new custom)**.

### 3.3 Real GPS / OTP browser evidence

The mobile browser test (390×844) granted real Chromium geolocation and asserted:

- `service_tracking_locations` row exists with `source = device_gps`;
- latitude/longitude are within 0.01 of the browser-supplied `17.4485 / 78.3748`;
- customer sees the GPS snapshot without Supabase;
- customer generates a 6-digit OTP through the server;
- provider verifies it once, handover becomes confirmed;
- provider completes the booking; persisted status is `completed` with `delivery_confirmed_at` set.

### 3.4 Realtime evidence

- `pg_publication_tables` contains the five tracking/category tables (`5/5` invariant).
- Logical decoding test against the disposable database:

```text
wal_level = logical
pg_create_logical_replication_slot('bos_rt_slot','pgoutput')
pg_recvlogical ... publication_names=supabase_realtime
insert into public.service_tracking_locations ...
output contains:
public
service_tracking_locations
```

This proves the database side of Postgres Changes publishes the correct table. The full Supabase Realtime WebSocket service was **not** started locally, so end-to-end socket delivery is the one BLOCKED item. The browser fallback (5-second polling) was exercised successfully instead.

### 3.5 Build and types

```text
npx tsc --noEmit   PASS
npm run build      PASS
```

The only build warning is the existing >500 kB chunk warning.

---

## 4. Security audit

- **Super Admin writes:** category save/publish/rollback/disable RPCs are revoked from `anon`/`authenticated`; the app server calls them and the RPC re-derives `is_super_admin`, `role`, `account_status` from `profiles`.
- **Provider licence submission:** session must be a Google-authenticated provider with an active provider profile; the server rechecks the profile before insert.
- **Booking/documents:** RLS exposes booking field values/documents only to the customer, provider or admin; no client update policy exists for verification fields.
- **Tracking:** snapshot reads are booking-party/admin only; GPS inserts are provider-only and RLS additionally requires an accepted/in-progress booking with tracking enabled and a fresh capture timestamp.
- **Rate limiting:** server/client throttles plus the SQL 5-second guard prevent GPS spam and cost abuse.
- **Medicine:** hard rules are applied in TypeScript and again by the database guard trigger. A medicine category cannot be saved without prescription/document verification and licensed-pharmacy requirements. Prescription verification gates OTP and completion.
- **Payment:** a payment-disabled category forces pay-later and rejects payment intents at the database trigger.
- **Tenant isolation:** configs, versions, audit and credentials are tenant-scoped; repository reads and RPCs filter the configured tenant; anon/authenticated RLS hides another tenant’s rows.
- **Audit:** append-only trigger rejects update/delete.
- **No paid services:** map tiles are OpenStreetMap; no Google Maps/Twilio/SMS provider is used for tracking or OTP.

---

## 5. Mobile UI audit

- Customer dynamic Groceries form tested at **390×844**: basket fields, delivery option and recurring schedule remain visible and usable.
- Provider GPS/OTP journey tested at **390×844**: “Share live GPS”, browser geolocation permission, OTP verification and completion.
- Super Admin builder was reflowed to 390 px and still exposed the category list and configuration sections.
- No uncaught browser page errors were recorded beyond the known external Supabase WebSocket transport message that the harness blocks.

---

## 6. Supabase Pro cost limits

Full details and calculations: [SUPABASE_PRO_COST_LIMITS_AUDIT.md](SUPABASE_PRO_COST_LIMITS_AUDIT.md).

Summary (official Pro quotas: 8 GB DB, 250 GB egress, 100 GB file storage, 500 Realtime peak connections, 5M messages/month, 3 MB message):

- At 12-second GPS cadence and 30-minute deliveries, **250 simultaneous tracked deliveries** use ~2.25M Realtime messages/month and exactly 500 connections.
- The **connection quota binds first**; beyond 250 simultaneous tracked deliveries needs a higher connection quota even though messages remain under 5M.
- ~225 MB/month of GPS rows at that level; 8 GB is sufficient for years before other data.
- 100 GB document storage supports roughly 20,000 five-megabyte prescriptions/IDs.
- No Edge Functions, paid map API or SMS API are used.
- GPS rate guard and 5-second server minimum keep spam from inflating Realtime/storage usage.
- Pro spend caps remain enabled by default.

---

## 7. Blocked / owner-gated items

1. **Supabase Realtime WebSocket transport** — no local Supabase stack was started; publication and logical decoding passed, and the polling fallback was verified. Hosted/websocket behavior remains owner-gated.
2. **Hosted migration apply, push, deployment** — intentionally not performed.
3. **Real production volume** — all cost figures are static/derived estimates from repository constants and official Pro quotas, not hosted usage measurements.

---

## 8. Result

**PASS locally.** All required booking categories, dynamic builder, documents, recurrence, real browser GPS, server OTP, RLS, publication/WAL Realtime path, mobile UI and Pro cost checks passed. The only BLOCKED item is full Supabase Realtime socket delivery, which requires a local Supabase stack or hosted project; the tested polling fallback keeps the feature usable without it.
