# React Production Deployment Package

**Companion to:** `REACT_PRODUCTION_READINESS_20261124.md`
**Applies to:** branch `feat/universal-gps-tracking` @ `96c1297` (plus the uncommitted migration repairs on top)
**Target:** a Supabase project whose ref is supplied by the owner as `$PROD_REF`. The development ref `obkfgxjzlscungkhbyvq` is **not** a production candidate.

> Nothing in this document has been executed. It is the procedure, not a record of deployment.

---

## 1. Environment checklist

Set these in the production host (not in git, not in chat). Values marked **required** must exist before the build.

| Variable | Required | Purpose / failure if missing |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Auth/Storage endpoint for the production ref |
| `VITE_SUPABASE_PROJECT_ID` | yes | Must equal `$PROD_REF` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Browser auth; build fails closed without it |
| `BOS_LISTINGS_DATABASE_URL` | yes | Server PostgreSQL (pooler, `sslmode=require`) |
| `BOS_SERVER_HMAC_SECRET` | yes | Session/QR signing; rotating it logs everyone out |
| `APP_URL` | yes | Absolute origin used in OAuth redirects and links |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | Google sign-in; production redirect URI must be registered |
| `BOS_STRICT_PRODUCTION_MODE` | recommended | Refuses demo/fallback paths |
| `BOS_PAYMENT_SANDBOX` / `BOS_PAYMENT_SANDBOX_SECRET` | per product decision | Keep sandbox unless payments are approved |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | only if live payments approved | Capabilities report `razorpayConfigured=false` without them |
| `BOS_BOOKING_QR_SECRET` | yes | Pass verification |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` | if email enabled | Silent failure of notifications otherwise |
| `BOS_GST_*`, `BOS_UPI_*` | only if invoicing is enabled | Invoices must not be issued with placeholders |
| `SUPABASE_SECRET_KEY` | server only | Never exposed to `VITE_*` |

Rules: no `VITE_*` secret; no development ref in any production file; `BOS_ALLOW_REMOTE_DEVELOPMENT_DATABASE` must be unset.

---

## 2. Project identity verification (before any write)

```sql
-- Run against the candidate connection.
select current_database(),
       current_user,
       current_setting('server_version'),
       (select count(*) from pg_tables where schemaname = 'public') as public_tables;
```

Accept only when all are true:

1. Host is the intended project’s pooler, and `current_user` contains the intended ref (`postgres.<ref>`).
2. `$PROD_REF` ≠ `obkfgxjzlscungkhbyvq`; `env | grep -c BOS_PRODUCTION_SUPABASE_PROJECT_ID` returns `0` in the deploy shell unless the value is the confirmed ref.
3. `select version()` is PostgreSQL 17.x.
4. The migration ledger exists: `select count(*) from supabase_migrations.schema_migrations;` — record it.
5. Take a timestamped record of `public_tables`; it is the baseline for the postcondition delta.

Stop if the ref is unknown or the ledger cannot be read.

---

## 3. Ordered manifest

`supabase/MIGRATION_MANIFEST.json` (regenerated and verified) pins the baseline plus **82** migrations by sha256. Apply in this order; the last nine are the business-ownership/public-read set.

| Order | Version | File | Depends on |
| --- | --- | --- | --- |
| 74 | `20261111190000` | universal_delivery_tracking | service_bookings |
| 75 | `20261111200000` | dynamic_service_category_builder | 11190000 (delivery tables) |
| 76 | `20261111210000` | service_document_storage_access | 11200000, storage schema |
| 77 | `20261112010000` | business_ownership_phase1 | profiles (adds 13 of the 19 `business_id` columns) |
| 78 | `20261112020000` | business_ownership_phase2_backfill | 12010000 |
| 79 | `20261112030000` | business_ownership_phase3_rls | 12010000, 12020000 |
| 80 | `20261112040000` | business_ownership_phase4_rls | 12030000 |
| 81 | `20261112050000` | business_ownership_phase5_transfer | 12010000 |
| 82 | `20261112060000` | public_read_admin_helper_isolation | venue_categories (applied earlier) |

Never rename or renumber. Never edit an applied file; add a forward migration instead.

---

## 4. Per-migration pre/postconditions

Run the precondition before the file and the postcondition immediately after. Any failure stops the run.

### `20261111190000` — delivery tracking
- **Pre:** `to_regclass('public.service_bookings')` not null; `pgcrypto` available; no `service_delivery_profiles` with a different shape.
- **Post:** 4 tables exist with RLS; 6 policies; `create_delivery_otp`/`verify_delivery_otp` executable by `authenticated` only; `service_delivery_otps` has no client grants; 3 triggers on `service_bookings`.
- **Fail:** nothing applied (single transaction). Fix the cause; do not retry blindly.

### `20261111200000` — service category builder
- **Pre:** 11190000 applied; `service_bookings` exists; `profiles.is_super_admin` exists.
- **Post:** 3 catalog tables + `service_provider_credentials` + `service_booking_documents` exist; medicine hard-rule trigger present; `service_booking_requirements_check` and `service_booking_category_transition_guard` not executable by client roles.
- **Fail:** transaction rolls back; no partial catalog.

### `20261111210000` — document storage access
- **Pre:** `storage.objects` exists (Supabase always); `media_assets` exists; `is_active_user()` exists.
- **Post:** INSERT policy `Booking parties upload private documents` on `storage.objects`, scoped to `bos-private-documents` + `auth.uid()` prefix + active user; `media_assets` policy present.
- **Fail:** no policy change.

### `20261112010000` — business foundation
- **Pre:** `profiles` exists; none of the eight business tables exist.
- **Post:** 8 tables (incl. `business_member_access`), RLS on each, owner-membership and audit triggers, 4 helper functions with the correct EXECUTE boundary, 13 `business_id` columns (19 after phase 2).
- **Fail:** nothing applied.

### `20261112020000` — backfill
- **Pre:** 12010000 applied; `business_module_for_listing` exists.
- **Post:** 7 additional `business_id` columns; deterministic businesses created per owner+module; `business_backfill_review` populated; every listing with a resolvable owner+module has `business_id`.
- **Fail:** rollback; no businesses inserted.
- **Operational note:** 17 full-table UPDATEs. Run in a low-traffic window; expect WAL/lock time proportional to table size.

### `20261112030000` — RLS phase 3
- **Pre:** 12010000+12020000 applied; `can_access_business_module` not yet defined.
- **Post:** listings/venue/bookings/stays/payments policies replaced; anon listings policy exists and never references `is_admin()`; owner fallback present only for `business_id IS NULL`.
- **Fail:** rollback.

### `20261112040000` — RLS phase 4
- **Pre:** 12030000 applied.
- **Post:** invoices, enquiries, contact settings, payment claims policies replaced with NULL-business fallbacks.
- **Fail:** rollback.

### `20261112050000` — transfer
- **Pre:** 12010000 applied.
- **Post:** `business_ownership_transfers` with RLS; SELECT only for owner/admin; transfer-audit trigger not executable by clients.
- **Fail:** rollback.

### `20261112060000` — public read repair
- **Pre:** `venue_categories` exists.
- **Post:** legacy `Read active venue categories` gone; anon policy uses `active` only; authenticated policy keeps the admin branch.
- **Fail:** rollback; the previous broken policy remains, so anonymous venue browsing stays broken — treat as release blocker.

Machine-checkable gate after all nine:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verify_pending_migrations.sql
```

Expected: seven `PASS` notices and `ALL PENDING-MIGRATION POSTCONDITIONS PASSED`.

---

## 5. Deployment sequence

1. **Freeze** writes or accept a maintenance window. Record the current ledger count.
2. **Recovery point:** confirm a fresh backup or a PITR timestamp that predates the window. Without it, stop (blocker B-1).
3. **Identity:** §2, twice — once by the operator, once by a second person.
4. **Dry run:** apply the nine files to a staging copy or a disposable PG 17 cluster seeded from a schema-only dump. `run_local_validation.sh` already proves the empty-database path; staging proves the with-data path.
5. **Apply:** `supabase db push --project-ref "$PROD_REF"` (or `--db-url` for a non-linked target). Do not use `--include-all` blindly; the ledger must show exactly these versions pending.
6. **Verify:** postcondition script, then ledger:
   ```sql
   select version, name from supabase_migrations.schema_migrations
    where version >= '20261111190000' order by version;
   ```
   Expect 9 rows.
7. **Smoke:** §7.
8. **Unfreeze** only after smoke passes.

---

## 6. Failure detection, recovery, rollback

**Detection.** `db push` stops on the first failed file. Each file is transactional (no `BEGIN/COMMIT` remains, no `CONCURRENTLY`, no `VACUUM`), so a failure leaves the previous migration complete and the failed one absent from both schema and ledger.

**If the ledger row is missing but objects exist** (only possible after a manual psql run or an old CLI): do **not** re-run the whole file. Compare the postcondition list, then either
- insert the ledger row only if every postcondition for that file is satisfied, or
- apply a forward repair migration for the missing pieces.

**Forward-repair plan for a partially applied set**
1. Inventory with the postcondition script; list which of the 9 pass.
2. Re-apply the earliest failing file only if it is idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`). All nine are.
3. If data was partially backfilled, re-running `20261112020000` is safe: every UPDATE is guarded by `IS DISTINCT FROM` and every insert uses `ON CONFLICT`.
4. Never delete `business_*` rows to “reset” — ownership mappings would be lost.

**Rollback feasibility**

| Migration | Rollback | Risk |
| --- | --- | --- |
| 11190000, 11200000, 11210000 | drop the new tables/policies | loses delivery/catalog data if used |
| 12010000–12050000 | not recommended | dropping `business_id` and business tables destroys the ownership mapping; policies would revert to pre-business behavior |
| 12060000 | recreate the legacy policy | re-breaks anon venue reads — do not roll back |

Preferred recovery is always **forward repair**, never down-migration.

---

## 7. Health checks and smoke tests

Unauthenticated (must all succeed):

```bash
curl -fsS "$APP_URL/" | head -c 200
curl -fsS "$APP_URL/api/venues/payment-capabilities" | jq -e '.payAtVenue != null'
```

Database-level (read-only):

```sql
-- Anonymous must be able to read public surfaces.
set role anon;
select count(*) from public.listings;             -- no permission error
select count(*) from public.venue_categories;     -- no permission error
select count(*) from public.stay_properties;      -- no permission error
reset role;

-- Helper boundary.
select has_function_privilege('anon','public.is_admin()','EXECUTE');  -- false
```

Authenticated journeys (browser, one account per role):

1. Customer: sign in → open a listing → open a class → open a venue → sign out → reload stays signed out.
2. Provider without a business: create a listing (legacy path) → edit it → it remains visible.
3. Provider with a business: select business → dashboard loads → listing create/edit carries `x-business-id` → no 500.
4. Admin: admin console loads; a customer receives 403 on `/api/admin/...`.
5. Owner calendar shows a reservation created by the customer; a second customer cannot read it.

Post-deployment SQL (record the output):

```sql
select 'tables', count(*) from pg_tables where schemaname='public'
union all select 'businesses', count(*) from public.businesses
union all select 'members', count(*) from public.business_members
union all select 'unmapped_listings', count(*) from public.listings where business_id is null
union all select 'review_rows', count(*) from public.business_backfill_review;
```

`unmapped_listings` is expected to be non-zero only for listings whose owner/module cannot be derived; each such row must have a matching `business_backfill_review` entry.

---

## 8. App ↔ schema compatibility matrix

| Application surface | Tables/columns it needs | Provided by |
| --- | --- | --- |
| Provider write gate (`server.ts`) | `business_member_access.allowed_modules` | 12010000 |
| Business switcher / dashboard | `businesses`, `business_members`, `business_module_access` | 12010000 |
| Listing create/edit (business) | `listings.business_id` + policies | 12010000/12030000 |
| Listing create/edit (legacy owner) | NULL-business fallback | 12030000 |
| Venue bookings/calendar | `venue_bookings.owner_user_id`, `business_id` fallback | 12020000/12030000 |
| Classes discovery (anon) | listings anon policy | 12030000 |
| Classes enrollment | `class_batches`, `class_enrollments` | earlier migrations |
| Stays host inventory | `stay_properties.business_id` + fallback | 12010000/12030000 |
| PG invoices/claims | `pg_invoices.business_id`, `pg_payment_claims.business_id` | 12010000/12040000 |
| Service payments | `service_payment_intents/claims.business_id` | 12010000/12030000 |
| Delivery tracking/OTP | `service_delivery_*`, `service_tracking_*` | 11190000 |
| Dynamic service catalog | `service_category_config*`, `service_provider_credentials` | 11200000 |
| Customer document upload | storage policy + `media_assets` | 11210000 |
| Venue category admin | `venue_categories` role-split policies | 12060000 |

---

## 9. Approvals required before execution

1. Confirmed production ref and a second-person identity check.
2. Verified backup/PITR point (R1 blocker B-1).
3. Credential rotation closed (Gate R2.1 currently **OPEN**).
4. Explicit approval to write to a hosted project — development and production separately.
5. Decision on the provisional-business merge (M-10) and the low-traffic window for the backfill (M-8).

Until 1–4 exist, this package is ready but **not deployable**.
