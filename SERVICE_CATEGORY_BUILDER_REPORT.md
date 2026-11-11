# Dynamic Super Admin Service Builder — Local Verification Report

**Date:** 2026-11-11
**Branch:** `feat/universal-gps-tracking`
**Scope:** Extend the Universal GPS Tracking work with a dynamic, configuration-driven service catalog. No hosted database, push or deployment was performed.

**Final status: PASS (local E2E, unit suite and production build). A follow-up audit of this commit is recorded in [AUDIT_63DA6F6_REPORT.md](AUDIT_63DA6F6_REPORT.md).**

---

## 1. What was delivered

| Requirement | Implementation |
|---|---|
| Super Admin creates/edits/enables service categories without code | `service_category_configs` + append-only `service_category_config_versions`; draft/publish/rollback/enable RPCs; Super Admin Services tab in the existing Universal Live Builder |
| Name, icon, image, fields, pricing, quantity, booking type, provider assignment, delivery options, recurring schedules | Normalized `ServiceCategoryConfig` contract in `src/lib/serviceCatalog.ts`; generic builder form and server/SQL validators |
| Per-service toggles: GPS, live map, OTP, prescription/document verification, payment, delivery confirmation | `toggles` in the saved config; copied into each booking's `service_delivery_profiles`; enforced by RLS-backed booking/tracking RPCs |
| Dynamic customer booking forms | `ServiceBookingPanel` renders `DynamicBookingFields` from the published config: custom fields, documents, quantity, delivery option and recurrence |
| Dynamic provider dashboard | `ServiceOperationsWorkspace` displays saved field values, documents, prescription state, handover state and licence status, and uses config-aware completion rules |
| Dynamic admin management | Services builder (configuration/versions/verification/audit), plus document and provider-licence review in Service oversight |
| Reuse booking, RLS, Realtime, GPS and OTP infrastructure | Existing `service_bookings`, `service_delivery_profiles`, `service_tracking_locations`, `service_tracking_events`, `service_delivery_otps` and OTP RPCs are extended, not duplicated |
| Custom fields, required documents, approval workflows, category-specific validation | Server and deferred SQL constraint trigger validate required fields/documents; approval workflows can require admin acceptance or verified documents; lead time / advance window / quantity / recurrence validated per category |
| Medicine enforced regardless of admin toggles | TS + SQL hard-rule applier forces `prescriptionVerification`, `documentVerification`, a required prescription document, `requiresLicensedPharmacy` and document-verified completion. A new pharmacy licence credential must be verified and unexpired |
| Secure server-side permissions | Browser cannot write configuration tables or RPCs; every RPC re-derives the actor from `profiles`; RLS hides drafts and other tenants; audit append-only; provider licence submission rechecks active provider role |
| Configuration versioning / audit / tenant isolation | Append-only version stream with optimistic concurrency, copy-forward rollback, immutable audit rows, explicit `tenant_id` on configs/versions/audit/credentials and repository/RPC tenant filters |
| No fake data / paid APIs / hardcoded service screens | Seeded categories are configuration only (quote pricing, no fake providers or listings). No paid APIs. All category forms/dashboards are generic and configuration-driven |

---

## 2. Files added

- `supabase/migrations/20261111200000_dynamic_service_category_builder.sql`
- `src/lib/serviceCatalog.ts` — shared types, validation, medicine hard rules, pricing/quantity/recurrence/document validation
- `src/lib/serviceCatalogClient.ts` — browser API client
- `src/server/serviceCatalogRepository.ts` — secure catalog repository + API routes
- `src/hooks/usePublicServiceCatalog.ts`
- `src/components/serviceCatalog/ServiceCategoryBuilder.tsx`
- `src/components/serviceCatalog/DynamicBookingFields.tsx`
- `src/components/serviceCatalog/BookingDocumentField.tsx`
- `tests/service-category-builder.test.mjs`
- `tests/service-builder-lifecycle.e2e.mjs`
- `SERVICE_CATEGORY_BUILDER_REPORT.md` (this report)

## 3. Files modified

- `server.ts` — repository wiring and `/api/service-catalog`, `/api/admin/service-catalog/*` registration
- `src/server/serviceBookingRepository.ts` — config snapshot, dynamic fields/documents, quantity, recurrence, delivery mode, payment/assignment snapshots, medicine licence check, config-aware completion, OTP/confirm API methods
- `src/server/serviceBookingApi.ts` — confirm-delivery, OTP and verify-OTP endpoints
- `src/server/serviceCommerceApi.ts` — payment-disabled mapping
- `src/components/UniversalLiveBuilder.tsx` — new Services tab
- `src/components/HomeServicesSection.tsx` — dynamic category discovery and config-aware booking panel
- `src/components/ServicesDiscoverySection.tsx` — dynamic category tiles
- `src/components/ServiceBookingPanel.tsx` — config-driven form, documents, quantity, recurrence, delivery option
- `src/components/ServiceCustomerBookings.tsx` — dynamic details and toggle-aware actions
- `src/components/ServiceOperationsWorkspace.tsx` — dynamic job details, licence submission, admin verification queue, config-aware completion
- `src/components/tracking/DeliveryTrackingPanel.tsx`, `HelperTrackingPublisher.tsx` — live-map/OTP/delivery-confirmation toggles
- `src/lib/deliveryTrackingClient.ts` — snapshot toggle fields
- `src/lib/servicesBookingClient.ts` — booking detail and delivery/OTP API client
- `src/lib/media/uploadMediaAsset.ts` — booking documents stay in the private bucket even when uploaded as images
- `src/lib/sectionExperiences.ts`, `src/context/MarketplaceContext.tsx`, `src/lib/supabaseClient.ts` — dynamic listing section marker
- `supabase/tests/run_services_e2e.sh` — runs the builder E2E and verifies baseline categories + medicine hard rules
- `tests/migration-dry-run-safety.test.mjs` — manifest count no longer pinned to a stale number
- `supabase/MIGRATION_MANIFEST.json`, `supabase/migrations.sha256` — regenerated (75 migrations)

---

## 4. Security model

- **No browser write access.** `service_category_configs`, `service_category_config_versions`, `service_category_config_audit`, booking field values and booking documents have no insert/update/delete grants for anonymous or authenticated clients. Writes go through server-only `SECURITY DEFINER` RPCs.
- **Actor re-derivation.** Every RPC re-reads `profiles.role`, `account_status` and `is_super_admin`; a session token only identifies the caller. The API repository repeats the check.
- **Tenant isolation.** Configs, versions, credentials and audit rows carry `tenant_id`; reads and RPCs filter it. RLS hides another tenant's published configuration and drafts.
- **Medicine cannot be toggled off.** Hard rules run in TypeScript and again in a database guard trigger before any version is stored. A direct privileged insert still gets the prescription/document/licence requirements.
- **Documents are private.** Booking document uploads use the existing private media bucket/pipeline; only booking parties/admins can read metadata; only an admin can verify.
- **No financial bypass.** A category with payment disabled forces `pay_after_service` and a trigger rejects payment intents. Settlement/refund authority is unchanged.
- **Audit is append-only.** Update/delete on the audit table raises `SERVICE_CATALOG_AUDIT_IMMUTABLE`.

---

## 5. Local verification executed

### TypeScript / build / unit

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run build` | PASS (exit 0; existing 500 kB chunk warning only) |
| `npm test` | PASS — **426 pass, 0 fail, 18 DB-gated skips** |
| `tests/service-category-builder.test.mjs` | PASS — 12/12 |
| `bash supabase/tests/run_services_e2e.sh` | PASS — existing services lifecycle + new builder E2E |

### End-to-end (throwaway PostgreSQL 17 + real Express server + real Chromium)

`bash supabase/tests/run_services_e2e.sh` applies the baseline and all 75 migrations, then ran:

- existing services lifecycle: **12/12 PASS** (schedule, availability, canonical slots, signed UPI settlement, refunds, restart persistence, browser journey)
- dynamic service builder: **20/20 PASS** (including Groceries Delivery and mobile GPS/OTP)
  - baseline Human Help, Medicine Delivery, Water Bottle Delivery and Groceries Delivery configs are public
  - anonymous/customer/non-super-admin writes are rejected
  - custom category draft is invisible until publish, then visible
  - optimistic version conflict returns `409 SERVICE_CATALOG_VERSION_CONFLICT`
  - disable/enable, publish and rollback restore the prior configuration with a new version
  - medicine saved with toggles off is stored with prescription/document/licence rules forced on
  - Human Help books saved custom fields, uses quantity, OTP handover and completion
  - Water books quantity + weekly recurrence through the same engine
  - newly created custom category books at its saved fixed price (`₹998` for 2 × ₹499), handover-confirms and completes
  - payment-disabled category forces pay-later and rejects a payment intent
  - admin-approval category rejects a provider acceptance and accepts it as admin
  - medicine without prescription is rejected; unlicensed pharmacy is rejected; licensed pharmacy + prescription succeeds
  - medicine completion and OTP are blocked until an admin verifies the prescription
  - provider licence submission and admin verification work
  - audit contains `category_created`, `category_published`, `category_rolled_back`, `category_disabled`, `category_enabled`, `document_reviewed`, `credential_reviewed`; audit update is rejected
  - tenant B config is invisible to tenant A/default, drafts are hidden from anonymous RLS
  - configuration and bookings persist across a server restart
  - **real browser:** Super Admin opens the Services builder and sees the custom category config; customer sees the dynamic listing, fills the generated form, books successfully; provider sees saved fields and completes the handover; persisted amount/category match

Direct SQL invariants from the same run:

```text
duplicate live slots=0  null_slot_keys=0  intents=3  events=4  refunded=1
rls=t  cross_customer_rows=0
baseline service categories=4  medicine_hard_rules=1  realtime_tables=5  new_rls=10
```

---

## 6. Deliberate limits / owner-gated items

1. **Hosted migration not applied.** `20261111200000_dynamic_service_category_builder.sql` is committed locally only. Applying it to the hosted project needs owner approval and a verified recovery point.
2. **Provider assignment runtime.** `customer_selects`, `platform_managed` and `admin_assigns` are stored on the category and snapshotted on each booking; actual administrator reassignment of a booking to a different provider is not part of this change (the existing listing owner remains the assigned provider).
3. **Document storage.** The upload control reuses private Supabase storage. In environments without Supabase storage, the form accepts an existing secure `storage://` or `https://` reference rather than storing bytes locally.
4. **Realtime publication.** The migration adds category tables to `supabase_realtime` only when the publication exists; hosted Supabase will opt in when applied.
5. **No deployments.** No `git push`, hosted migration, deployment or paid API call was made.
