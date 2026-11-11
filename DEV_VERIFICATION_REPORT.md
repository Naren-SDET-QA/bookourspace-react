# BookOurSpace — DEV verification & migration plan

**Date:** 2026-11-04
**Target:** Supabase DEV — `ezrxykyocgbolpaebnqx` (`https://ezrxykyocgbolpaebnqx.supabase.co`)
**Mode:** **read-only**. No hosted write, migration, configuration change, commit, push, merge or deployment was performed.
**Worktree:** 198 dirty paths preserved.

---

## 1. Read-only access verification

All checks used only `GET` requests with the project's **public publishable key** (`sb_publishable_…`, already in `.env.local`). No service-role key was read, printed or used.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Project reachable | **PASS** | `GET /auth/v1/health` → **200** `{"name":"GoTrue","version":"v2.197.0"}` |
| 2 | Publishable key accepted | **PASS** | PostgREST returns structured errors (`PGRST205`), not `401 invalid api key` |
| 3 | Google provider enabled | **PASS** | `GET /auth/v1/settings` → `external.google = true` |
| 4 | Anonymous sign-in disabled | **PASS** | `external.anonymous_users = false` |
| 5 | Email provider disabled | **FAIL** | `external.email = true` — the app is Google-only; email auth is still enabled on the project |
| 6 | Expected public relations exposed | **FAIL / CATALOG BLOCKED** | 13/13 probed tables returned `404 PGRST205 … not in the schema cache`; full schema is not proven empty |
| 7 | Migration history | **BLOCKED** | project-scoped migration-history API returns 403. Local plan has 26 migrations + conditional baseline; hosted applied state is unverified. |
| 8 | Storage buckets | **EMPTY** | `GET /storage/v1/bucket` → **200** `[]` |
| 9 | OAuth redirect allowlist | **BLOCKED** | not readable with the publishable key (dashboard / Management API only) |
| 10 | Backup / PITR status | **BLOCKED** | not readable with the publishable key (dashboard / Management API only) |
| 11 | Real Google sign-in round trip | **BLOCKED** | requires the redirect allowlist + a real Google account |

### 1.1 Tables probed (all `404 PGRST205`)

`profiles`, `listings`, `bookings`, `platform_module_flags`, `stay_properties`, `stay_room_types`, `stay_units`, `stay_allocations`, `payment_intents`, `service_bookings`, `venue_bookings`, `class_batches`, `provider_registration_requests`.

**Interpretation:** the expected application relations are not exposed in the PostgREST schema cache. Management/catalog access is denied, so a complete schema inventory and migration history cannot be established from this check alone. The app cannot be verified end-to-end against the expected hosted PostgreSQL schema until read access is restored.

---

## 2. Safe plan to apply the current migrations to DEV

Runner: [`supabase/tests/run_dev_migration_plan.sh`](</Users/aa/Downloads/bookourspace-react/supabase/tests/run_dev_migration_plan.sh>)

```bash
# read-only preview (no connection)
bash supabase/tests/run_dev_migration_plan.sh plan

# read-only live schema check (counts + expected tables + RLS)
BOS_DEV_DATABASE_URL=... bash supabase/tests/run_dev_migration_plan.sh check

# apply — requires explicit approval flags and prior read-only catalog/backup review
BOS_DEV_APPLY=1 BOS_DEV_CONFIRM=ezrxykyocgbolpaebnqx \
BOS_DEV_DATABASE_URL=... \
  bash supabase/tests/run_dev_migration_plan.sh apply
```

**Guardrails baked into the runner**
- `apply` refuses without `BOS_DEV_APPLY=1` **and** `BOS_DEV_CONFIRM=ezrxykyocgbolpaebnqx`.
- refuses any connection string containing `prod`.
- `ON_ERROR_STOP=1` per file; the first failure aborts the run and keeps the log.
- the baseline (`supabase/schema_and_rls.sql`) is applied **only** when `BOS_DEV_INCLUDE_BASELINE=1`; first verify from the hosted catalog that it is needed. The current REST/Management evidence does not establish whether it is safe or required.

**Order (local compatibility only; hosted catalog/history remain unverified):**

| Step | File |
|---|---|
| 0 | `supabase/schema_and_rls.sql` (baseline) |
| 1 | `20261101000002_marketplace_modules_and_stay_inventory.sql` |
| 2 | `20261101000003_fix_provider_contact_listing_ids.sql` |
| 3 | `20261101000004_platform_module_realtime.sql` |
| 4 | `20261101072320_active_admin_marketplace_listing_rls.sql` |
| 5 | `20261101073937_admin_stay_inventory_safety.sql` |
| 6 | `20261101075829_app_builder_config_versions.sql` |
| 7 | `20261101175250_former_local_services_listing_fields.sql` |
| 8 | `20261103120000_marketplace_foreign_key_indexes.sql` |
| 9 | `20261103130000_provider_listing_idempotency.sql` |
| 10 | `20261103171437_provider_registration_workflow.sql` |
| 11 | `20261103173631_venue_booking_inventory.sql` |
| 12 | `20261103175957_venue_dynamic_categories_timezone_dst.sql` |
| 13 | `20261103180000_services_booking_lifecycle.sql` |
| 14 | `20261103190000_stay_checkout_and_payment_intents.sql` |
| 15 | `20261103200000_class_batches_and_enrollment.sql` |
| 16 | `20261103201000_stay_confirmation_actor_authorization.sql` |
| 17 | `20261103210000_pg_booking_lifecycle.sql` |
| 18 | `20261103211000_services_schedule_and_verified_payments.sql` |
| 19 | `20261103220000_pg_payment_lifecycle.sql` |
| 20 | `20261103233000_venue_booking_disputes.sql` |
| 21 | `20261103234000_venue_payment_provider_binding.sql` |
| 22 | `20261103240000_stay_checkout_pay_after_service_without_vpa.sql` |
| 23 | `20261103250000_pg_admin_disputes_invoices.sql` |
| 24 | `20261104100000_profiles_private_access.sql` |
| 25 | `20261104110000_google_profile_provision_rpc.sql` |
| 26 | `20261104120000_admin_provider_activation_rpc.sql` |

**Pre-apply checklist (needs authorized read-only catalog access and a dashboard session)**
1. Confirm the project identity is `ezrxykyocgbolpaebnqx`; record actual catalog and migration history. Current table count is unknown.
2. Take a manual backup / confirm PITR, test the backup, and record pre-change object and row counts.
3. Disable the **email** provider if the product must be Google-only (`external.email = true` today).
4. Add the OAuth redirect URLs before any sign-in test:
   - `https://ezrxykyocgbolpaebnqx.supabase.co/auth/v1/callback`
   - the app origin(s) `/auth/callback` (local `http://localhost:3000/auth/callback`, plus your dev host)
5. Review exact plan and migration order against hosted catalog, then separately approve hosted writes. Baseline is conditional on catalog evidence.

**Rollback plan**
- Prefer a verified backup restore or approved PITR to the recorded pre-apply point.
- Do not use `drop schema public cascade` or assume plan objects are new. Complete down migrations do not exist; object-level recovery must be designed against the actual catalog.
- Verify catalog, representative data, RLS/RBAC and Auth after recovery.

**Rollback after a partial apply:** stop, capture logs, run read-only catalog checks and compare the exact partially applied file. Restore from the verified recovery point or use an explicitly reviewed object-level recovery. Do not assume all steps are idempotent or rerun blindly.

---

## 3. Real signed-in Google OAuth E2E — prepared, **not executed**

Prepared spec pattern (Playwright, real browser, no mocks): navigate to the app, click **Sign in with Google**, complete the real Google consent in a headed browser, land on `/auth/callback`, assert `/api/auth/me` returns the Google identity, then book a stay.

| Requirement | Status |
|---|---|
| Google provider enabled on DEV | **PASS** (`external.google = true`) |
| Redirect allowlist contains the app callback | **BLOCKED** (not readable; must be set in the dashboard) |
| Google client authorised for the project | **BLOCKED** (Supabase-managed; cannot verify via anon key) |
| A real Google test account | **BLOCKED** (not provided) |
| `APP_URL` set for the dev host | **FAIL** — `APP_URL` is unset in `.env.local`; the callback currently derives from the request host |

**To unblock:** set `APP_URL`, add both redirect URLs in Supabase Auth, then run the headed Google journey against the dev host. Until then the journey cannot be executed honestly.

---

## 4. Razorpay Test Mode settlement / refund — prepared, **BLOCKED**

| Item | Status | Evidence |
|---|---|---|
| Order creation fails closed without keys | **PASS** | `tests/razorpay-sandbox-webhook.e2e.test.mjs` → `503 RAZORPAY_NOT_CONFIGURED` |
| Webhook fails closed without secret | **PASS** | `503 RAZORPAY_WEBHOOK_NOT_CONFIGURED` |
| Missing / forged signature rejected | **PASS** | `401 MISSING_WEBHOOK_SIGNATURE` / `401 INVALID_WEBHOOK_SIGNATURE` |
| Signed event authenticated | **PASS** | signature verified |
| **Booking-bound settlement handler** | **PASS (local only)** | booking-bound order, capture, replay and refund authorization are covered by `tests/razorpay-sandbox-webhook.e2e.test.mjs` with synthetic HMAC events; no Razorpay gateway was contacted |
| Razorpay test-mode keys / real provider round trip | **BLOCKED** | no test-mode credentials or provider webhook round trip was performed |
| Signed PSP sandbox settlement (stay/services/venue) | **PASS** | `npm run test:db:stay-payments` → 37/37 + 5/5 |

**To run a true Razorpay test-mode settlement:** bind the existing verified handler to a provider-created booking/order, provide authorized test-mode credentials and a reachable test webhook, then verify provider settlement and refund reconciliation. Local signed fixtures are not provider evidence.

---

## 5. PASS / FAIL / BLOCKED summary

| Area | Result |
|---|---|
| Auth health/settings via publishable key | **PASS**; Management API/catalog access | **BLOCKED (403)** |
| Google provider enabled | **PASS** |
| Anonymous sign-in disabled | **PASS** |
| Email provider disabled | **FAIL** |
| Expected application relations exposed | **FAIL / catalog blocked** |
| Migration history | **BLOCKED (management API 403)** |
| Storage ready | **EMPTY** (not required for stays) |
| OAuth redirect allowlist | **BLOCKED** |
| Backup / PITR verification | **BLOCKED** |
| Real Google sign-in E2E | **BLOCKED** |
| Razorpay test-mode settlement | **BLOCKED** (local fail-closed and fixture tests pass; provider verification absent) |
| Local suites, unit tests, migration count | **See current audit section 34**; current plan has 26 migrations and disposable PostgreSQL validation passes |

---

## 6. Remaining production launch requirements

1. **Review and explicitly approve** the baseline only if the hosted catalog proves it is required, then the reviewed 26 migrations (nothing happened yet).
2. **Disable email auth** on DEV and confirm Google is the only provider.
3. **Set `APP_URL`** and register the OAuth redirect URLs, then run the real Google E2E.
4. **Provide Razorpay Test Mode credentials/webhook** and run settlement/refund E2E with provider-confirmed events.
5. **Verify backup/PITR** from the dashboard before the first real booking.
6. Production deployment, backup/restore, and real payment requirements remain separate release gates.

**Nothing in this report changed the hosted project.** First unblock authorized read-only catalog, migration-history and backup verification; hosted writes remain a separate explicit approval.

---

## 7. Final local regression evidence (2026-11-04)

This section records the latest rerun and supersedes the earlier local test counts. All PostgreSQL execution used disposable local clusters with baseline + 26 migrations.

| Suite | Result |
|---|---|
| `run_classes_ui_e2e.sh` | **7/7 Classes + 9/9 Function Halls Chromium UI checks**; Firefox/WebKit venue surfaces available; Classes restart persistence **1/1**. |
| `run_pg_payment_e2e.sh` | PG lifecycle **57/57**, restart **5/5**, Chromium customer payment flow **36/36**, plus Chromium/Firefox/WebKit availability/layout **22/22** across mobile, tablet and desktop. |
| `run_pg_integration.sh` | PG HTTP **24/24**, restart **4/4**, responsive Playwright **22/22**, Chromium/Firefox/WebKit. |
| `run_pg_admin_e2e.sh` | Admin API **42/42**, restart **4/4**, full Admin browser flow **31/31 Chromium**. |
| `run_services_e2e.sh` | **11/11** lifecycle checks. |
| `run_stay_payment_e2e.sh` | **37/37** + restart **5/5**. |
| `run_local_validation.sh` | exit **0**; Classes SQL 21/21, provider registration RLS 2/2, provider listing HTTP 14/14, profile privacy 4/4, app config 14/14, functional 52/52, contact 23/23, rural listings 10/10, concurrency 1/1, plus venue/Classes HTTP integration. |
| `npm test` / lint / build | **114 total: 100 pass, 0 fail, 14 skipped**; `tsc --noEmit` passes; Vite build passes (2,762 modules; main JS 498.24 kB / 143.25 kB gzip). |
| Razorpay handler / migration manifest | Synthetic signed-fixture tests **19/19**; baseline + 26 migration SHA-256 manifest passes. No gateway call. |

Hosted OAuth, catalog/RLS, migration-history, backup/PITR, provider-verified settlement/refund and physical device results remain **BLOCKED**, as detailed above. Local synthetic authentication and signed payment fixtures are not hosted identity or payment evidence. The application remains **NO-GO**.
