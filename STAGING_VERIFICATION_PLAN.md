# BookOurSpace — DEV Hosted Verification Plan

**Prepared:** 2026-11-04 (updated)
**Workspace:** `/Users/aa/Downloads/bookourspace-react` (dirty worktree preserved)
**Mode:** local disposable migration dry run + read-only preparation. **No hosted database was modified.**
**No secrets printed, exposed or committed.** No commits, pushes or deployments.

> **Current environment decision (2026-11-04):** The owner designated the existing project `ezr…nqx` as development-only and confirmed there is no separate production project. A separate hosted staging project is **not required** for this work. This document's historical “staging” wording means the *disposable local PostgreSQL dry-run* unless it explicitly says hosted; any future hosted verification targets the existing DEV project. Hosted database or Auth-setting writes still require separate explicit approval. Project-scoped read-only Supabase access previously returned 403 (`project_admin_read` required), so no hosted schema state is established by this local plan.

> **Current verification update (2026-11-04, §12):** The current local manifest is **27 migrations** (not 26), all 27 were applied and re-applied in a disposable PostgreSQL 17 dry run, and all seven local booking-suite groups passed. Hotels/Stays browser E2E passed 24/24 across Chromium, Firefox and WebKit. Read-only Supabase management calls still return `MCP error -32600: You do not have permission to perform this action`; hosted migration history/schema/Auth/extension state remain blocked. The existing DEV project is the sole intended hosted target; no separate staging project is requested.

Older instructions below that mention a staging project, 26 migrations, an unimplemented Razorpay webhook, or a failed Classes run are historical snapshots and are superseded by §14. This plan does **not** ask for a second Supabase project.

---

## 1. Guardrails observed

| Rule | Status |
|---|---|
| Never print/expose/commit service-role, OAuth or payment secrets | **PASS** — only key *presence* and *type* inspected |
| Do not modify hosted DEV DB until separate approval | **PASS** — no hosted DB connection/write was made by this local dry run |
| Preserve existing code and local data | **PASS** — existing dirty and runtime data preserved; only task-scoped plan/test changes made |
| No commits, pushes, deployments | **PASS** |

---

## 2. Hosted DEV Supabase configuration — inspection

### 2.1 What exists

`.env.local` (local only, not committed) contains **6 keys**:

| Key | Type | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | public | `https://ezrxykyocgbolpaebnqx.supabase.co` |
| `VITE_SUPABASE_PROJECT_ID` | public | `ezrxykyocgbolpaebnqx` |
| `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID` | public | `ezrxykyocgbolpaebnqx` (**same ref**) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | public (`sb_publishable_…`) | frontend-safe |
| `VITE_ENABLE_DEMO_DATA` | flag | local demo content |
| (`VITE_SUPABASE_*` project ids) | — | — |

### 2.2 Current project selection — **existing DEV; no second project required**

- The owner explicitly designated the configured project (`ezrxykyocgbolpaebnqx`) as **development-only**; the prior production label was incorrect and is superseded by this decision.
- The configured URL, project reference, and development allowlist resolve to the same masked ref `ezr…nqx`.
- No separate staging project is requested or required. This plan keeps all hosted write operations behind a separate approval.

**Consequence:** Local configuration pairing is verified, but hosted schema/Auth/RLS checks remain **BLOCKED** until project-scoped read-only access is authorized. The last project-scoped attempt returned 403 for the missing `project_admin_read` scope; this is an access blocker, not evidence that the hosted schema is empty.

### 2.3 Required hosted DEV environment (configuration only; not applied)

Server-side only (never exposed to the browser):

| Variable | Purpose | Required |
|---|---|---|
| `APP_URL` | canonical origin used to build `/auth/callback` | yes |
| `BOS_SERVER_HMAC_SECRET` | session-token HMAC (`≥32` chars) | yes |
| `BOS_LISTINGS_DATABASE_URL` | existing DEV Postgres (pooled, `sslmode=require`) | yes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (server exchange) | yes |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | **sandbox** keys only | for payments |
| `RAZORPAY_WEBHOOK_SECRET` | sandbox webhook signing secret | for payments |
| `BOS_PAYMENT_SANDBOX=1` + `BOS_PAYMENT_SANDBOX_SECRET` (`≥16`) | signed PSP sandbox settlement | for sandbox E2E |
| `SUPABASE_SERVICE_ROLE_KEY` | admin-only server operations | only if server-side admin writes are needed |

Frontend (publishable only): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_CLIENT_ID`.

`.env.example` already documents every name above; nothing new is invented.

---

## 3. Migration dependency analysis

27 migration files, filename order as of 2026-11-04. They depend on the **baseline** schema shipped in `supabase/schema_and_rls.sql` (14 public tables: `profiles`, `listings`, `bookings`, `enquiries`, `transactions`, `reviews`, …) plus Supabase-supplied objects (`auth.users`, `auth.uid()`, `auth.role()`, `supabase_realtime` publication, `anon`/`authenticated`/`service_role`).

| Dependency | Provided by | Risk if missing |
|---|---|---|
| `auth.users` (uuid) | Supabase | FK failures on every owner/guest column |
| `auth.uid()` / `auth.role()` | Supabase | all RLS policies fail closed (deny) |
| `public.profiles` | baseline | admin/active-user checks fail |
| `public.listings` (`id text`) | baseline | stay/venue/service FKs fail |
| `public.bookings` | baseline | stay allocations FK fail |
| `supabase_realtime` publication | Supabase | migration 004 fails |
| `btree_gist`, `pgcrypto` | migration `create extension` | exclusion constraint / UUID gen fail |

**Order sensitivity:** `20261101000002` must run before `…073937`/`…190000` (stay tables), and `20261103171437` before the venue migrations. `20261103240000_stay_checkout_pay_after_service_without_vpa.sql` is a follow-up `CREATE OR REPLACE FUNCTION` for `create_stay_checkout`; it must run after `20261103190000_stay_checkout_and_payment_intents.sql` creates that RPC and its dependent tables/functions. `20261103250000_pg_admin_disputes_invoices.sql` uses the PG booking/payment tables and constraints established by `20261103210000_pg_booking_lifecycle.sql` and `20261103220000_pg_payment_lifecycle.sql`; its appended audit/dispute/claim/invoice schema follows those migrations. `20261104100000_profiles_private_access.sql` depends on the booking, stay allocation, class enrollment/batch, venue booking, and service booking objects established earlier; `20261104110000_google_profile_provision_rpc.sql` depends on Supabase `auth.uid()`/`auth.users` and the baseline profile columns. `20261104120000_admin_provider_activation_rpc.sql` depends on the `private` schema/`authenticated` usage grant created immediately before it and on `provider_registration_requests` plus the baseline profile role/status fields. Filename order satisfies these dependencies; the current dry run proves the complete sequence.

**Reconciliation:** the historical 21-file deployment plan predates six files now present. Migrations 22–27, omitted from that plan, are: `20261103240000_stay_checkout_pay_after_service_without_vpa.sql` (stay checkout supports unpaid pay-after-service without requiring a merchant VPA); `20261103250000_pg_admin_disputes_invoices.sql` (PG admin audit, disputes, offline collection claims, invoices, RPCs/policies and payment state/mode constraints); `20261104100000_profiles_private_access.sql` (private-profile RLS and a public provider projection); `20261104110000_google_profile_provision_rpc.sql` (authenticated profile provisioning RPC based on `auth.uid()` and `auth.users`); `20261104120000_admin_provider_activation_rpc.sql` (Admin-authorized provider registration decision and profile role activation in one RPC transaction); and `20261104130000_pg_razorpay_raw_body_settlement.sql` (PG Razorpay order/payment references, indexes, provider-bound intent creation and service-role-only signed-event settlement). The last file follows the PG booking/payment lifecycle and PG dispute/audit prerequisites. Files 25–27 use objects created in the preceding sequence; specifically, the Admin activation RPC follows the private-schema grant, and the Razorpay settlement RPC follows `payment_intents`, booking/payment functions, provider-event records, profiles and PG audit. All 27 apply and re-apply in filename order in the current local dry run. This is compatibility evidence only: hosted migration history remains unverified.

---

## 4. Migration dry run — **PASS**

Runner: [`supabase/tests/run_staging_migration_dry_run.sh`](</Users/aa/Downloads/bookourspace-react/supabase/tests/run_staging_migration_dry_run.sh>)
Isolated throwaway PostgreSQL 17, Supabase-compatible stub, real baseline, then all migrations twice.

```
PASS  baseline applied (14 public tables)
PASS  migrations applied: 27
PASS  all migrations re-applied cleanly (27)      ← idempotent
    public tables=51  rls_enabled=51  policies=107  functions=304
PASS  every public table has RLS enabled
DRY RUN PASSED
```

No staging/production connection was used.

---

## 5. RLS policy inventory (from the dry run + local mirror)

| Table group | Tables | Policies |
|---|---|---|
| Marketplace | `listings` (6), `profiles` (1), `provider_registration_requests` (3), `platform_module_flags` (2), `platform_config_versions` (4) | 16 |
| Stays | `stay_properties` (4), `stay_room_types` (4), `stay_units` (3), `stay_allocations` (1), `stay_blocks` (2), `stay_audit_events` (2) | 16 |
| Services | `service_bookings` (3), `service_booking_events` (2), `service_payment_claims` (3), `service_reviews` (2) | 10 |
| Venues | `venue_bookings` (1), `venue_booking_settings` (2), `venue_blocks` (1), `venue_seasonal_rates` (1), `venue_booking_events` (1), `venue_payment_intents` (1) | 7 |
| Payments | `payment_intents` (1), `payment_provider_events` (1) | 2 |
| Classes | `class_batches` (3), `class_enrollments` (1) | 4 |

Invariant checked by the local suite: `rls_leak_rows = 0`, every public table `rls_enabled = t`.

**Staging-specific checks to run after approval (read-only first):**
`select tablename from pg_tables t join pg_class c on c.relname=t.tablename where schemaname='public' and not c.relrowsecurity;` → must return **zero rows**.

---

## 6. Google-only OAuth — verification

| Check | Result | Evidence |
|---|---|---|
| Only provider advertised | **PASS** | `/api/auth/google/url` builds `…/auth/v1/authorize?provider=google&…&prompt=select_account` |
| Callback route present and hardened | **PASS** | `/auth/callback` forwards only `code/state/error/error_description`, sends `Cache-Control: no-store` + strict CSP, no credentials in URL |
| Fail-closed without configuration | **PASS** | `supabaseConfig` unit suite + 503 branch when project/key absent |
| Publishable-key-only client | **PASS** | service-role / `sb_secret_` / DB URLs are refused by `supabaseConfig` |
| Email/password UI | **PASS (dead code)** | `signInWithEmailPassword` / `signUpWithEmailPassword` are exported but **no component imports them** — recommend deleting or gating |
| Redirect allowlist on DEV | **BLOCKED** | requires authorized read access to the existing DEV project's Auth → URL Configuration |

**Proposed staging redirect URLs (to be added in Supabase Auth + Google Console):**
- `https://<staging-host>/auth/callback`
- `https://<staging-project-ref>.supabase.co/auth/v1/callback`
- `http://localhost:3000/auth/callback` (local only)

**`APP_URL` must be set on staging** — it is currently unset locally, so the callback falls back to the request host.

---

## 7. Razorpay sandbox — preparation and findings

### 7.1 Implemented and verified (no live calls)

[`tests/razorpay-sandbox-webhook.e2e.test.mjs`](</Users/aa/Downloads/bookourspace-react/tests/razorpay-sandbox-webhook.e2e.test.mjs>) → **4/4 PASS**

| Check | Result |
|---|---|
| Order creation fails closed (503 `RAZORPAY_NOT_CONFIGURED`) before any network call | **PASS** |
| Webhook fails closed (503 `RAZORPAY_WEBHOOK_NOT_CONFIGURED`) without a secret | **PASS** |
| Missing signature → 401 `MISSING_WEBHOOK_SIGNATURE` | **PASS** |
| Forged signature → 401 `INVALID_WEBHOOK_SIGNATURE` | **PASS** |
| Correctly signed event → **501 `WEBHOOK_HANDLER_NOT_IMPLEMENTED`** | **PASS (honest gap)** |

### 7.2 Findings

1. **Razorpay settlement is not implemented.** The webhook verifies the signature and returns `501`. Only the signed **PSP sandbox** path settles money (`/api/payments/sandbox/psp-webhook`, `/api/services/payments/sandbox/webhook`, venue equivalent) — that path passes **37/37 + 5/5** in `npm run test:db:stay-payments`. **FAIL** for “Razorpay payment E2E” until a settlement handler exists.
2. **Signature canonicalisation risk.** `platformApi.ts` signs `JSON.stringify(req.body)` while Razorpay signs the **raw** body. Express already captures `rawBody` (`server.ts:352`) and other webhooks use it — the Razorpay handler should switch to `rawBody` before production.
3. **Sandbox PSP path is the trustworthy one** and is already covered end-to-end (signed events, forged callbacks rejected, refunds, restart persistence).

### 7.3 Sandbox E2E plan once keys exist

1. Set sandbox `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` + `BOS_PAYMENT_SANDBOX=1` + `BOS_PAYMENT_SANDBOX_SECRET`.
2. Create order → verify amount server-side → mock/sandbox capture → signed webhook → assert booking `payment_status='verified'` **only** from the signed event.
3. Replay the same `eventId` → idempotent (no double settlement).
4. Wrong amount / wrong intent / forged signature → rejected, booking stays unpaid.
5. Refund → signed refund event → allocation released + audit event.

---

## 8. Backup and rollback plan (for the later approved migration)

**Before applying (staging only):**
1. Confirm a Supabase **PITR/daily backup** exists for staging; record the recovery window.
2. Snapshot the schema: `pg_dump --schema-only --no-owner` (stored outside the repo).
3. Snapshot row counts for every table the migrations touch (`profiles`, `listings`, `bookings`, stay/venue/service tables).
4. If later authorized, apply to the existing DEV project inside a transaction **per file**; abort on first error.
5. Re-run the RLS invariant queries and the 27-migration idempotency pass.

**Rollback:**
- **Preferred:** restore the pre-migration snapshot / PITR to a point immediately before apply.
- **Per-migration:** every migration is additive (`create table if not exists`, `create or replace function`, `drop policy if exists` + `create policy`, `create index if not exists`). A reverse script must therefore drop the *new* objects only — it must **never** drop baseline tables or columns.
- **Policy rollback:** re-run `20261101072320_active_admin_marketplace_listing_rls.sql`’s `drop policy` block, then re-create the previous owner policies (captured in the snapshot).
- **Post-rollback verification:** `rls_enabled` count, policy count, function count must return to the pre-apply numbers; app boot + `/api/auth/me` 401.

---

## 9. Exact changes proposed (nothing applied yet)

**Database (target):** the local plan contains 27 files in `supabase/migrations/`. Any future application to the existing DEV project requires project identity, actual migration history/catalog, backup/recovery plan, a fresh dry run and separate explicit approval. No hosted migrations were applied in this work.

**Application config (staging):** add the server-side variables from §2.3, set `APP_URL`, register the callback URLs from §6, and point the frontend at the **staging** publishable key — never production.

**Code changes required before production (not staging blockers):**
1. Switch the Razorpay webhook to `req.rawBody` for signature verification.
2. Implement Razorpay/webhook settlement (currently 501) or explicitly scope payments to the signed PSP sandbox path.
3. Delete or gate the unused email/password auth helpers to enforce Google-only.

---

## 10. PASS / FAIL / BLOCKED

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | Migration dependencies mapped | **PASS** | §3 + dry run |
| 2 | All 27 migrations apply on baseline | **PASS** | §12 disposable local dry run 27/27 |
| 3 | Migrations are idempotent (re-apply) | **PASS** | §12 disposable local dry run 27/27 re-applied |
| 4 | RLS enabled on every public table | **PASS** | 51/51 in current isolated dry run; invariant `rls_leak_rows=0` |
| 5 | Google-only OAuth code path | **PASS** | §6, provider=google only |
| 6 | OAuth callback route hardened | **PASS** | §6 |
| 7 | DEV OAuth redirect allowlist | **BLOCKED** | needs authorized project read access + Google console |
| 8 | Razorpay webhook signature gate | **PASS** | 4/4 sandbox tests |
| 9 | Razorpay sandbox settlement | **FAIL** | 501 `WEBHOOK_HANDLER_NOT_IMPLEMENTED` |
| 10 | Razorpay raw-body signature correctness | **FAIL (risk)** | re-serialised `JSON.stringify(req.body)` |
| 11 | Signed PSP sandbox settlement (stay/services/venue) | **PASS** | 37/37 + 5/5 |
| 12 | Staging Supabase project isolated from production | **BLOCKED** | no staging ref/keys |
| 13 | Staging RLS/persistence re-run | **BLOCKED** | needs #12 + approval |
| 14 | Production untouched | **PASS** | no hosted connection made |

---

## 11. What I need to proceed

1. **Read-only project access** for the already designated DEV project, with `project_admin_read` scope, to verify hosted migration history, schema/RLS, Auth configuration and policies. For any later hosted writes, stop for separate explicit approval and use server-only credentials from the local secret store; never place them in chat.
2. **Google OAuth** client ID/secret for the staging origin + the redirect URLs added in §6.
3. **Razorpay sandbox** key id/secret/webhook secret (test mode only).
4. After the hosted DEV catalog and recovery point are verified, separate explicit approval to apply the reviewed migrations to DEV.

Until then: production and staging remain untouched, and the local suites stay green.

## 12. Current local E2E and DEV-access update — 2026-11-04

This section supersedes the older count and suite claims above. No separate staging project was created or used. Local integration/browser flows used disposable PostgreSQL and signed test sessions; the test payment events are synthetic signed fixtures and are not PSP evidence.

### Migration reconciliation

- Current manifest: **27 unique migration files**, verified by `node supabase/tests/migration_manifest.mjs` (baseline + 27; unique versions and SHA-256 match).
- The prior 21-file plan's historical 22nd extra file is `20261103240000_stay_checkout_pay_after_service_without_vpa.sql`.
- Current manifest additionally has files 23–27: PG disputes/invoices; private-profile access; Google profile provisioning; Admin provider activation; and `20261104130000_pg_razorpay_raw_body_settlement.sql`.
- The written 26-migration list omitted the current 27th file, `20261104130000_pg_razorpay_raw_body_settlement.sql`. It follows `20261104120000_admin_provider_activation_rpc.sql`; it requires the earlier PG booking/payment and audit/event objects. Its additive `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `CREATE OR REPLACE FUNCTION` statements applied and re-applied cleanly in the local harness.
- `bash supabase/tests/run_staging_migration_dry_run.sh`: **PASS**, baseline plus 27/27 apply and 27/27 re-apply; 51/51 public tables RLS-enabled, 107 policies, 304 functions. This says nothing about hosted DEV migration history.

The historical claim that 22 migrations were applied to hosted DEV is **not verified**. Today's read-only Supabase management calls for project details, migration history, public table catalog and extensions all returned `MCP error -32600: You do not have permission to perform this action`. No hosted writes were attempted.

### Local launch-journey evidence

| Scope | Result | Evidence boundary |
|---|---|---|
| PG provider → Admin activation/listing approval → owner inventory → customer booking/cancel | **PASS** | Local Express + disposable PostgreSQL; Chromium journey. |
| PG styles/live availability | **PASS** | 22 cross-engine/device checks across Chromium, Firefox, WebKit and mobile/tablet/desktop; WebKit Style 1 inventory GET returned 200 in about 20 ms; availability text rendered within 5–7 ms after click; no console/page errors. The reported timeout did not reproduce. No timeout was increased in this diagnostic rerun. |
| PG payment/inventory | **PASS locally** | 57/57 payment-lifecycle, 5/5 restart, 36 Chromium browser checks and PG SQL/API assertions. Signed local events only; not real Razorpay settlement. |
| Classes | **PASS** | 7/7 Chromium journey and restart check; in the sequential harness the earlier Vite optimize-dependency restart race did not reproduce. |
| Function Halls/Venues | **PASS** | 9/9 Chromium customer/provider/Admin journey; cross-engine viewport and restart checks passed. |
| Home Services | **PASS locally** | Real browser customer cancellation → provider completion → Admin refund of provider-verified test payment; 1/1 main lifecycle, persistence checks and post-restart check passed. Services API suite also passed 11/11. |
| Hotels & Stays | **PASS locally** | `npx playwright test e2e/stays-booking.spec.ts --project=chromium --project=firefox --project=webkit`: 24/24. Both Style 1 and Style 2 reservations/cancellations, inventory release, mobile/tablet viewports, unauthenticated/foreign-user rejection, concurrency, disabled-online-payment honesty, server pricing and restart persistence. |
| Full booking suite | **PASS** | `bash supabase/tests/run_all_booking_suites.sh /tmp/bos-booking-suites-2.log`: all seven groups exited 0 (`pg_integration`, `pg_payments`, `classes`, `venues`, `services_api`, `services_browser`, `stays`). |
| SQL/RLS | **PASS locally** | `bash supabase/tests/run_local_validation.sh`: functional 52/52, contact 23/23, App Builder 14/14, rural listing 10/10, provider registration 2/2, Classes SQL 21/21, provider listing HTTP 14/14, Classes HTTP 1/1, private-profile privacy 4/4, concurrency 1/1, no double booking. |
| Unit/build | **PASS** | `npm test`: 122 total / 108 pass / 0 fail / 14 PostgreSQL-gated skips; `npm run lint` (TypeScript) exit 0; `npm run build` exit 0, main JS 498.24 kB (143.26 kB gzip), AdminDashboard 154.65 kB (29.93 kB gzip), deferred chart 359.08 kB. |

### Hosted DEV remains blocked

- Read-only management project/migration/schema/extension inspection: **BLOCKED** by permission error above. The existing DEV project remains the only intended hosted project; no extra project is needed.
- Local application browser tests issued configured read-only GETs to the DEV PostgREST endpoints; listings, reviews and `platform_config_versions` returned 404/PGRST205. This does not establish whether the base tables exist or identify why they are not exposed; hosted catalog and Data API grants remain unverified.
- Real Google-only OAuth and hosted cross-user RLS/multi-session persistence: **BLOCKED**.
- Real Razorpay Test Mode order/webhook/refund and independent Direct UPI reconciliation: **BLOCKED**; no live provider account was contacted. Local synthetic signature tests are application behavior tests only.
- Full WCAG 2.2 AA/assistive-technology and physical Android/iOS tests: **BLOCKED/PARTIAL**. Responsive browser checks are not native device or screen-reader certification; axe tooling is not installed.
- Movies remains display-only.

**Release: NO-GO.** Local workflows are now verified across all five bookable modules, but hosted identity/schema/RLS, real provider settlement, backup/PITR and device/accessibility signoff remain unverified. Do not apply any migration or change hosted Auth/configuration until the read-only permission is granted and the exact target state is reviewed; hosted writes still require separate explicit approval.

## 13. Current verification update — 2026-11-04 (supersedes prior migration counts)

The owner-designated existing DEV project remains the intended hosted target; this plan does not require creating a separate staging project. Hosted inspection remains **BLOCKED**: read-only Supabase management calls for project metadata, migrations, tables, and extensions return permission denied (`MCP error -32600`). No hosted database or Auth settings were changed.

The local repository manifest is now **baseline + 29 migrations**, not 21, 26, or 27. The current 29-file manifest passed uniqueness/hash validation. The 29 migrations applied and reapplied on a newly created disposable PostgreSQL cluster; 52/52 public tables had RLS enabled, with 108 policies. Local validation is not hosted validation. Files 28 and 29 add protected-profile insert restrictions and an append-only App Builder edit audit trail, respectively; see `DATABASE_MIGRATION_PLAN.md` §13 for order and dependencies.

Before hosted verification, the operator must grant project-scoped read access and confirm the target URL/ref in the Dashboard. Then capture, without secrets: project identity, PostgreSQL major version/extensions, actual schema/table/RLS/grant inventory, migration history, Auth provider/redirect configuration, Data API exposure, and backup/PITR state. Compare the exported history with `node supabase/tests/migration_history_reconcile.mjs`. Stop on unknown/out-of-order versions or schema drift. Any hosted apply requires a separately reviewed change plan, recoverable backup, and explicit approval; none is authorized by this update.

## 14. Production access, backup and verification status — 2026-11-04

The selected production project's local URL/ref pair matches `ezr…nqx`. Supabase MCP `get_project` still returns `MCP error -32600: You do not have permission to perform this action`; `list_projects` and `list_organizations` show only resources available to the current connector identity and do not identify whether the cause is account selection, missing membership, or insufficient project scope. Do not substitute another project.

The backup phase stopped safely: `BOS_PRODUCTION_DATABASE_URL` is absent and Keychain service `bos-production-backup`, account `readonly`, contains one byte (newline only). No remote database connection, dump, or restore occurred. Replace it locally with a URL for a verified read-only database role; never share it in chat. The backup script currently consumes an environment URL rather than loading Keychain itself and does not establish role read-only grants, so those checks must precede any retry.

Local verification remains: manifest baseline + 29, all 29 migrations apply/reapply on disposable PostgreSQL, all 52 public tables RLS-enabled; local booking and browser suites pass. Hosted migration history, Auth/Google-only settings, RLS, Data API grants, backup/PITR, Google test login, Razorpay webhook settlement/refunds, and direct UPI reconciliation are **BLOCKED**. No hosted configuration or database changes have been made. Full accessibility and physical mobile-device checks remain outstanding.
