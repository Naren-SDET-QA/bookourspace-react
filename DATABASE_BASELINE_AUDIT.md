# Database Baseline & Migration Audit — BookOurSpace

Date: 2026-11-04
Scope: SQL migrations, database models, dependencies across the six modules.
Owner: Supabase Database Architect (database files and database tests only).

No hosted migration was applied, no `supabase db push` was run, and nothing was
deployed or pushed. Every check below ran against a private throwaway PostgreSQL
17 cluster created with `mktemp -d` and destroyed afterwards.

---

## 1. Project identity — blocker before any hosted work

Two different Supabase project refs are in play:

| Source | Ref | Region |
| --- | --- | --- |
| This task's project context / `.env` / `ENV_CONFIGURATION_STATUS.md` | `obkfgxjzlscungkhbyvq` | Mumbai |
| Every guard script (`compare_migration_history.sh`, `MUMBAI_MIGRATION_RUNBOOK.md`, `DEV_EXECUTION_PLAN.md`) | `ezrxykyocgbolpaebnqx` | Stockholm |

`supabase/tests/compare_migration_history.sh` refuses to run unless
`BOS_DEV_CONFIRM=ezrxykyocgbolpaebnqx` and the URL contains that ref. Against
`obkfgxjzlscungkhbyvq` it exits `3` (wrong target) by design. **Reconcile the ref
before any hosted apply**; do not edit the guard to accept a second ref.

Consequence: hosted migration history, catalog state and the existence of
`rls_auto_enable` on the live project are **unverified**. Nothing in this audit
depends on hosted state.

---

## 2. Exact apply order

Pinned by `supabase/MIGRATION_MANIFEST.json` (35 migrations + baseline, sha256
per file) and `supabase/migrations.sha256`.

**Order 1 — baseline**

1. `supabase/schema_and_rls.sql`

**Order 2–36 — migrations, ascending 14-digit version**

| # | Version | File | Module |
| --- | --- | --- | --- |
| 2 | 20261101000002 | marketplace_modules_and_stay_inventory | listings / stays |
| 3 | 20261101000003 | fix_provider_contact_listing_ids | provider ownership |
| 4 | 20261101000004 | platform_module_realtime | platform |
| 5 | 20261101072320 | active_admin_marketplace_listing_rls | RBAC / listings |
| 6 | 20261101073937 | admin_stay_inventory_safety | stays |
| 7 | 20261101075829 | app_builder_config_versions | Live Edit |
| 8 | 20261101175250 | former_local_services_listing_fields | listings |
| 9 | 20261103120000 | marketplace_foreign_key_indexes | indexes |
| 10 | 20261103130000 | provider_listing_idempotency | listings idempotency |
| 11 | 20261103171437 | provider_registration_workflow | provider ownership / RBAC |
| 12 | 20261103173631 | venue_booking_inventory | bookings (venues) |
| 13 | 20261103175957 | venue_dynamic_categories_timezone_dst | bookings (venues) |
| 14 | 20261103180000 | services_booking_lifecycle | bookings (services) |
| 15 | 20261103190000 | stay_checkout_and_payment_intents | payments (stays) |
| 16 | 20261103200000 | class_batches_and_enrollment | bookings (classes) |
| 17 | 20261103201000 | stay_confirmation_actor_authorization | bookings (stays) |
| 18 | 20261103210000 | pg_booking_lifecycle | bookings (PG) |
| 19 | 20261103211000 | services_schedule_and_verified_payments | payments (services) |
| 20 | 20261103220000 | pg_payment_lifecycle | payments (PG) |
| 21 | 20261103233000 | venue_booking_disputes | bookings (venues) |
| 22 | 20261103234000 | venue_payment_provider_binding | payments (venues) |
| 23 | 20261103240000 | stay_checkout_pay_after_service_without_vpa | payments (stays) |
| 24 | 20261103250000 | pg_admin_disputes_invoices | payments / RBAC |
| 25 | 20261104100000 | profiles_private_access | Google profiles / RLS |
| 26 | 20261104110000 | google_profile_provision_rpc | Google profiles |
| 27 | 20261104120000 | admin_provider_activation_rpc | provider ownership |
| 28 | 20261104130000 | pg_razorpay_raw_body_settlement | payments |
| 29 | 20261104140000 | restrict_profile_self_insert_columns | Google profiles / RBAC |
| 30 | 20261104150000 | live_edit_audit_trail | Live Edit |
| 31 | 20261104160000 | super_admin_role_management | RBAC |
| **32** | **20261104170000** | **provider_listing_ownership_guards** | **new — provider ownership** |
| **33** | **20261104180000** | **booking_idempotency_per_user** | **new — bookings idempotency** |
| **34** | **20261104190000** | **active_admin_authorization** | **new — RBAC** |
| **35** | **20261104200000** | **complete_foreign_key_indexes** | **new — indexes** |
| **36** | **20261104210000** | **restrict_definer_execution** | **new — payments / privileges** |

**After all migrations** — `supabase/backfill_existing_google_profiles.sql`
(not a migration; safe to re-run, never updates an existing profile).

Existing migrations contain explicit `begin;`/`commit;` and are designed to be
re-applied (verified twice per file). The **baseline is not transactional as a
file**: applied through `psql -f` it autocommits per statement. Apply it inside
a single transaction (`psql -1 -f`) or let the Supabase CLI wrap it.

---

## 3. Model map and what was verified

### Google-authenticated profiles
- `public.profiles` keyed on `auth.users(id)` `ON DELETE CASCADE`, `google_sub`
  UNIQUE, `account_status` CHECK, `is_super_admin` boolean.
- Authority chain: `handle_new_user()` trigger (Auth signup) →
  `private.provision_google_profile()` (verified Google session) →
  `backfill_existing_google_profiles.sql` (pre-schema users).
- Client grants are column-level only: SELECT on public columns, INSERT
  `(id, full_name, phone)`, UPDATE `(full_name, phone, updated_at)`. Role, email,
  status and identity columns are not client-writable. Verified: `anon` has no
  SELECT privilege on `profiles`; a customer can read self + booking counterpart
  only; an active admin can read all.
- Trigger still provisions profiles **after** EXECUTE was revoked from
  PUBLIC/anon (asserted in the new suite).

### Provider ownership
- `listings.owner_id → auth.users(id)`; `provider_registration_requests.user_id →
  profiles(id)`; owner-facing RPCs (`review_provider_registration`,
  `issue_invoice`, venue owner RPCs) check `private.is_current_user_admin()` or
  listing ownership.
- **Defect fixed:** `bookings.provider_id` and `enquiries.provider_id` are free
  TEXT. A customer could store another provider's auth UUID and inject rows into
  that provider's dashboard (the read policy matches
  `provider_id = auth.uid()::text`). New BEFORE INSERT/UPDATE guards reject a
  write when `provider_id` resolves to a real profile that does not own the
  referenced listing.
- Compatibility: catalogue-era identifiers (`prov-103`, `prov-movie-1`, …) are
  not profiles and remain accepted, so seeded-catalogue bookings keep working.

### Listings
- `listings.owner_id` default `auth.uid()`, `status` gates public visibility,
  `payload` JSONB holds module data, admin policy `Active admins manage all
  listings`, provider idempotency index `uniq_listings_owner_request_id`
  (`owner_id + payload->>'requestId'`) — concurrency-safe, not in-memory.
- All dependent tables (`stay_properties`, `venue_booking_settings`,
  `service_bookings`, `class_batches`, `service_reviews`,
  `provider_contact_settings`) have FKs to `listings`.

### Bookings
- Four parallel booking systems: legacy `bookings`, `service_bookings`,
  `venue_bookings`, `class_enrollments`. Each has RLS, party-scoped read
  policies and lifecycle RPCs with server-side role derivation.
- **Defect fixed:** `create_booking_atomic` inserted into four columns that do
  not exist (`customer_address`, `time_slot`, `total_amount`, `notes`) and
  omitted the NOT NULL `scheduled_time`, so the RPC always raised. Rewritten
  against real columns with the same signature and JSON contract.

### Payments
- Ledgers: `payment_intents`, `payment_verifications`, `service_payment_intents`,
  `venue_payment_intents` + `*_events`, `pg_payment_claims`, `pg_invoices`.
- Idempotency is per-scope and correct: `payment_intents(user_id,
  idempotency_key)`, `service_payment_intents(booking_id, idempotency_key)`,
  `venue_payment_intents(booking_id, provider)`, plus unique
  `provider_order_id` / `provider_payment_id` and `utr_number` anti-replay.
- **Defect fixed:** `payment_verifications.intent_id` had no FK to
  `payment_intents(id)` (both TEXT). Added `NOT VALID` — see §5.
- Settlement mutations are revoked from clients (`pg_settle_verified_payment`,
  `pg_razorpay_settle_verified_payment`, `settle_*`, `refund_*` have no
  authenticated grant).

### Live Edit
- `platform_config_versions` with `platform_config_versions_one_draft` unique
  partial index, immutability guard trigger, RPCs `save_/publish_/rollback_`.
- `app_builder_audit_events` is append-only: no client write grant, SECURITY
  DEFINER trigger derives `auth.uid()`, and a guard trigger rejects
  UPDATE/DELETE/TRUNCATE. Both triggers are installed.

### Role-based permissions
- Roles: `customer | provider | admin` on `profiles`, with `is_super_admin` as a
  separate explicit authority. Role changes only through
  `private.manage_user_access()` (super-admin, reason ≥ 5 chars, no
  self-change, no super-admin target), writing `user_access_audit_events` in the
  same transaction.
- **Defect fixed:** `public.is_admin()` checked `role = 'admin'` only, ignoring
  `account_status`. A suspended or blocked administrator kept admin rights
  through 35 RLS policies. It now requires `account_status = 'active'`, matching
  `private.is_current_user_admin()`. All 35 policies become status-aware without
  being rewritten.

---

## 4. Test evidence (isolated disposable cluster only)

Environment: PostgreSQL 17.11 (Homebrew), `LC_ALL=C`, throwaway `initdb`
cluster, Supabase-compatible stubs (`anon` / `authenticated` / `service_role`,
`auth.users`, `auth.identities`, `auth.uid()`, `auth.role()`, `supabase_realtime`
publication, default table grants to mirror Supabase). No network, no Supabase
credentials.

| Check | Command | Result |
| --- | --- | --- |
| Manifest integrity | `node supabase/tests/migration_manifest.mjs` | PASS — baseline + 35 migrations, unique versions, sha256 match |
| Full chain apply + re-apply | `bash supabase/tests/run_staging_migration_dry_run.sh` | PASS — 35/35 applied, 35/35 re-applied, 53 public tables, 53/53 RLS, exit 0 |
| Guardrails, RLS guard, rollback | `bash supabase/tests/run_guardrails_audit.sh` | PASS — 0 failures, exit 0 |
| Ownership/idempotency/RBAC assertions | (inside guardrails harness) | PASS — 13/13 |
| `rls_auto_enable` preservation | (guardrails, installed **before** baseline) | PASS — event trigger `rls_auto_enable\|ddl_command_end\|O`, function body md5 unchanged, ACL unchanged `{postgres=X/postgres}`, no event-trigger DDL anywhere in `supabase/**/*.sql` |
| Hardening idempotency | (guardrails) | PASS — 5 hardening migrations applied twice each, no error |
| Rollback drill | (guardrails, second database) | PASS — guards removed, per-user idempotency reverted to global unique, 30 indexes removed, `is_admin()` PUBLIC grant restored, `rls_auto_enable` still enabled |

Existing regression suites, run after applying the hardening set:

| Suite | PASS | FAIL | SQL errors |
| --- | --- | --- | --- |
| `profile_private_access_test.sql` | 7 | 0 | 0 |
| `provider_registration_test.sql` | 2 | 0 | 0 |
| `super_admin_role_management_test.sql` | 5 | 0 | 0 |
| `class_enrollment_test.sql` | 21 | 0 | 0 |
| `live_edit_audit_test.sql` | 20 | 0 | 0 |
| `former_local_services_test.sql` | 10 | 0 | 0 |
| `app_builder_config_test.sql` (alone, fresh DB) | 14 | 0 | 0 |

`app_builder_config_test.sql` reports 4 FAILs when run in the same database
after other suites: its assertions are absolute counts (`count(*) = 1`) on
`platform_config_versions`, which earlier suites pollute. Run alone on a fresh
database it is 14/0. This is pre-existing test isolation, not a regression.

Measured before → after the hardening set:

- Foreign keys without a leading index: **30 → 0** (97 FKs total).
- SECURITY DEFINER functions executable by `anon`: **17 → 7** (the 7 remaining
  are read-only catalogue helpers, deliberately unchanged).
- Cross-tenant idempotency replay: **reproduced and blocked** (same key, two
  users → two independent bookings, no leaked `bookingId`).

---

## 5. Rollback strategy

`supabase/rollback/20261104_hardening_down.sql` reverses the new set in reverse
order, inside one transaction, and is exercised by the guardrails harness.

- Pure additions (indexes, triggers, functions) are dropped.
- Redefined functions (`is_admin`, `create_booking_atomic`) are restored
  byte-for-byte to their previous bodies, including the pre-existing
  `create_booking_atomic` defect, deliberately.
- Grants are restored to their previous PUBLIC state, which re-opens the
  anon-executable surface. Roll back only with that understood.
- **Conditional:** restoring `idempotency_key TEXT UNIQUE` fails if two users
  stored the same key after the migration. Pre-check:
  ```sql
  select idempotency_key, count(distinct user_id)
    from public.bookings where idempotency_key is not null
   group by idempotency_key having count(distinct user_id) > 1;
  ```
  Rows present → roll forward, do not roll back.
- The payment-verification FK is additive; dropping it loses no data.
- `rls_auto_enable` is untouched by both the forward and the rollback path
  (asserted).

Data rollback is out of scope: no migration in this set deletes or rewrites
rows.

---

## 6. Remaining risks and blockers

1. **Project ref mismatch** (`obkfgxjzlscungkhbyvq` vs `ezrxykyocgbolpaebnqx`) —
   blocks any hosted step. (§1)
2. **No true FK on `bookings.listing_id` / `enquiries.listing_id` /
   `provider_id`.** The application persists bookings for catalogue-only
   listings (e.g. `catalogue-listing-xyz`, provider `prov-103`) that are not rows
   in `public.listings`. Adding the FK now would reject live traffic. Staged path:
   backfill catalogue listings → add FK `NOT VALID` → validate. The shipped
   ownership guard closes the spoofing hole in the meantime.
3. **`payment_verifications.intent_id` FK is `NOT VALID`.** Existing orphan rows
   are unknown on hosted. Reconcile, then
   `alter table public.payment_verifications validate constraint
   payment_verifications_intent_id_fkey;` as a separate scheduled step.
4. **`public.is_active_user()` fails open** (`COALESCE(..., true)`) when the
   caller has no profile row. Left unchanged: making it fail closed would alter
   behaviour across many policies at once and needs its own review.
5. **Seven read-only helpers remain executable by `anon`** (`venue_quote`,
   `stay_availability`, `venue_public_calendar`, `class_batch_availability`,
   `service_listing_slots`, `service_listing_profile`,
   `provider_contact_details`). They back the anonymous storefront; tightening
   them is a product decision, not a migration detail.
6. **`20261103171437_provider_registration_workflow.sql` re-grants table-wide
   `SELECT, INSERT, UPDATE ON public.profiles`.** Re-running it *after* the later
   profile migrations re-widens privileges. Normal version-ordered apply is
   correct and verified; never re-run a single old migration out of order.
7. **Hosted state unverified.** `rls_auto_enable` was reproduced from the
   platform definition and proven preserved locally; its presence and ACL on the
   hosted project have not been read (no hosted access performed).
8. **Baseline is not atomic as a file** (see §2).

---

## 7. Files added

```
supabase/migrations/20261104170000_provider_listing_ownership_guards.sql
supabase/migrations/20261104180000_booking_idempotency_per_user.sql
supabase/migrations/20261104190000_active_admin_authorization.sql
supabase/migrations/20261104200000_complete_foreign_key_indexes.sql
supabase/migrations/20261104210000_restrict_definer_execution.sql
supabase/rollback/20261104_hardening_down.sql
supabase/tests/ownership_and_privileges_test.sql
supabase/tests/run_guardrails_audit.sh
```

Modified: `supabase/MIGRATION_MANIFEST.json`, `supabase/migrations.sha256`
(regenerated, 35 migrations).

No frontend, OAuth component, mobile configuration, hosted project or branch was
touched.
