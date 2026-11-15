# Customer Module Access — Final Security Audit

**Scope:** customer/business module permissions (`public.businesses`, `public.business_members`, `public.business_module_access`, provider module APIs, RLS).
**Branch:** `feat/universal-gps-tracking` (uncommitted working tree preserved).
**Date:** 2026-11-13 (Asia/Calcutta).

---

## 1. Summary

The customer-module permission model is built on three layers:

1. **`public.business_module_access`** — per-business, per-module `enabled` + `approval_status` (`pending|approved|suspended|revoked`).
2. **Express provider middleware** (`server.ts:2419`) — re-derives business/module context from PostgreSQL on every request and 403s on missing/suspended/revoked context.
3. **RLS** (`phase 3/4`) — `can_access_business_module(business_id, roles)` scopes the domain tables by the row's `business_id`.

The model is sound for the happy path (approved business → approved module → access). This audit found **one authorization escalation** (fixed), **one regression to provider ownership** (pre-existing, reported), and **several defense-in-depth / mapping gaps** (reported with recommendations).

---

## 2. Findings

### F1 — FIXED: `business_module_access` write policy granted any active admin, not just super admin

- **Severity:** High (privilege escalation).
- **Location:** `supabase/migrations/20261112010000_business_ownership_phase1.sql`.
- **Detail:** The policy named `"Only super admins write module access"` used `public.is_admin()` (any active `role='admin'` profile), while the management API (`PATCH /api/admin/businesses/:id/access`, `businessApi.ts:95`) correctly re-checks `is_super_admin` from profiles. The `guard_business_privileged_changes` trigger (`businessApi`-adjacent, phase1:240-264) had the same inconsistency.
- **Impact:** Any active admin (not just super admin) could insert/update `business_module_access` and privileged `businesses` fields directly via PostgREST, bypassing the API's super-admin gate.
- **Fix:** Both now use `public.is_current_user_super_admin()` (phase1:247 and phase1:313-315).
- **Regression tests:** `tests/customer-module-access.test.mjs` — "only super admins can write business module access", "privileged business fields are protected by the super-admin guard".

### F2 — REPORTED (pre-existing): provider ownership workflow regressed by hard `x-business-id` gate

- **Severity:** High (requirement 7 — "provider ownership workflows remain unaffected").
- **Location:** `server.ts:2419-2460` business-context middleware.
- **Evidence:** `npx playwright test e2e/stays-host.spec.ts` fails with `BUSINESS_CONTEXT_REQUIRED` in the Host workspace — a host without a business record (or before one is backfilled/selected) can no longer open `/api/stays/host/*`.
- **Detail:** The middleware 403s whenever `x-business-id` is absent. `ProviderDashboard` only sets that header when `fetchBusinesses()` returns at least one business; a brand-new/legacy host with no `public.businesses` row therefore hard-fails the host workspace.
- **This is pre-existing** (part of the uncommitted feature; `server.ts` and `ProviderDashboard.tsx` were already modified before this audit). It is also acknowledged in `docs/business-ownership-migration-manifest.md` under "Remaining gaps".
- **Recommended fix:** in the middleware, when the actor is a provider with **no** business rows, fall back to legacy owner-scoped access (there is nothing to revoke); when the actor **has** businesses but sends no/invalid `x-business-id`, keep 403. This preserves legacy providers while keeping business-scoped enforcement.
- **Not changed in this pass** because it requires a DB query in the middleware plus a per-module business-selection decision, and a wrong fallback would either re-open a hole or regress further workflows. Flagging for an owner decision before merge.

### F3 — REPORTED (defense-in-depth): middleware does not verify the business `module_type` matches the route

- **Severity:** Medium.
- **Location:** `server.ts:2440-2455`.
- **Detail:** The middleware verifies the selected business is approved/enabled but does not check that `business.module_type` matches the module of the requested route. A multi-business provider can present an approved business id to a route for a *different* (revoked) module.
- **Impact:** For tables scoped by `business_id` under phase-3/4 RLS, the row is still hidden. However several trusted paths run under `SET LOCAL ROLE service_role` (e.g. `stayHostApi.ts:479`, `pgBookingRepository.ts:108`) and re-check only `owner_id` in SQL, so for those paths the middleware is the *only* module gate and the mismatch is exploitable.
- **Recommended fix:** add a route→expected-module map for the unambiguous single-module prefixes (`/api/stays/host`→`hotel_stay`, `/api/movies/screens`→`movies`, `/api/services/earnings`+`/api/services/payment-claims`→`services`, `/api/pg/bookings`→`pg_hostels`, `/api/services/bookings`→`services`, `/api/venue-bookings`→`venues`, `/api/stays/bookings`→`hotel_stay`) and 403 on mismatch; keep `/api/provider` multi-module. Pair with per-workspace business selection in the UI.

### F4 — REPORTED (medium): service-provider schedule/blackouts/credentials bypass business gating

- **Severity:** Medium.
- **Location:** `/api/services/provider/schedule`, `/api/services/provider/blackouts` (`serviceCommerceApi.ts:251,303`), `/api/services/provider/credentials` (`serviceCatalogRepository.ts:844,859`).
- **Detail:** These routes are authorized by Google identity + `role='provider'` + `provider_id` RLS ownership, but are **not** in the business-context middleware and their tables (`service_provider_schedules`, `service_provider_blackouts`, `service_provider_credentials`) have `business_id` columns but **no business-scoped RLS policy**. A suspended/revoked services business can still edit its own schedule/blackouts and submit credentials.
- **Recommended fix:** add these prefixes to the middleware and attach `x-business-id` in `serviceCommerceClient.request`/`serviceCatalogClient.request`; add business-scoped RLS to the three tables. Do this together with F2's legacy fallback so providers without a business keep working.

### F5 — INFO: no `expires_at` on module access

- Revoked/suspended permissions **do take effect immediately** (middleware re-queries per request; RLS is per-query; `approval_status !== 'approved'`, `is_enabled !== true`, `module_enabled !== true`, `module_approval_status !== 'approved'` are all checked at `server.ts:2451`).
- "Expired" currently applies only to invitations (7 days) and ownership transfers (48 hours); both are enforced immediately (`expires_at > now()`).
- If time-bound module entitlements are required, a new `expires_at` column + predicate is needed. Flagging as a product gap, not a security hole.

### F6 — INFO: business access management is super-admin-only

- The API (`businessApi.ts:95-139`, `:244-250`) and now the RLS write policy require `is_super_admin`. This is **tighter** than the audit's "Admin and Super Admin" wording: a regular active admin cannot manage module access. Safe as-is; revisit only if regular admins are meant to manage access.

### F7 — INFO: module taxonomy is inconsistent across three naming schemes

- `business_module_access`/marketplace: `pg_hostels, classes, venues, services, hotel_stay, movies`.
- `platform_module_flags` / `moduleGate.ts`: `pg, classes, function_hall, services, hotels, movies, ecommerce`.
- `modules/registry.ts`: same as moduleGate plus `ecommerce`.
- Requested names map as: **PG→pg_hostels, Stays/Properties→hotel_stay, Services→services, Movies→movies, Institutes→classes, Events→venues**. "Properties" and "Events" are not distinct modules.
- **Fix:** `src/modules/businessModuleMap.ts` now centralizes this mapping with aliases and a collision check; regression tests pin it.

---

## 3. Fixes applied

| File | Change |
|---|---|
| `supabase/migrations/20261112010000_business_ownership_phase1.sql` | `"Only super admins write module access"` policy and `guard_business_privileged_changes` now use `is_current_user_super_admin()` (F1). |
| `src/modules/businessModuleMap.ts` | New single source of truth for module ids/aliases/platform keys/registry ids/market sections (F7). |
| `tests/customer-module-access.test.mjs` | New 16-case regression suite covering all ten audit requirements. |
| `supabase/MIGRATION_MANIFEST.json`, `supabase/migrations.sha256` | Regenerated via `node supabase/tests/migration_manifest.mjs --write` after the migration edit. |

---

## 4. Test results

| Gate | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | ✅ pass |
| `npm run build` (`vite build`) | ✅ pass (3.4s; pre-existing chunk-size warnings only) |
| `npm test` (unit) | ✅ **473 tests — 455 pass, 0 fail, 18 skipped** (skips are pre-existing PostgreSQL integration tests) |
| `e2e/auth-role-and-session.spec.ts` | ✅ 6/6 pass |
| `e2e/stays-host.spec.ts` | ❌ 1 failed, 1 passed, 7 not run — **pre-existing** `BUSINESS_CONTEXT_REQUIRED` (F2) |

New regression suite (`tests/customer-module-access.test.mjs`): **16/16 pass**.

---

## 5. Remaining risks

1. **F2** — provider ownership workflow regressed for hosts without a business record (pre-existing; needs a fallback decision).
2. **F3** — cross-module middleware gap, exploitable on `service_role` paths that scope by `owner_id` only.
3. **F4** — service-provider schedule/blackouts/credentials not business-gated.
4. **F5** — no time-expiry for module access (product gap only).
5. Multi-customer isolation (requirement 6) is enforced structurally (RLS `can_access_business_module(business_id, …)` + per-request middleware), but there is no end-to-end DB test in this pass because the business migrations are intentionally not applied to any hosted database.

---

## 6. Git status

Uncommitted work preserved. This audit **added**:

```
?? src/modules/businessModuleMap.ts
?? tests/customer-module-access.test.mjs
 M supabase/MIGRATION_MANIFEST.json        (regenerated)
 M supabase/migrations.sha256              (regenerated)
?? supabase/migrations/20261112010000_business_ownership_phase1.sql  (edited: F1 fix)
```

No commit, push, deployment, or hosted migration was performed. No destructive database change was made. All prior uncommitted work (business ownership feature, server.ts, App.tsx, provider dashboards, docs, migration phases 2–5, rollback plan) is intact.
