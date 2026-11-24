# Gate K — Legacy Schema Recovery & Canonical Database Design

**Date:** 2026-11-24
**React:** `/Users/aa/Downloads/bookourspace-react` — `feat/universal-gps-tracking` @ `96c1297`
**Flutter:** `/Users/aa/Desktop/BookMySpace` — `main` @ `fc35976`
**Mode:** READ-ONLY investigation and design. No write, no migration, no schema change, no project
creation, no Docker, no backup, no deployment, no Git modification.
**Companion:** `SUPABASE_CANONICAL_DATABASE_BLUEPRINT.md` (proposed, unexecuted).
**Predecessors:** Gates E–J.

Labels: **CONFIRMED** · **INFERRED** · **UNRESOLVED** · **OWNER ACTION**.

---

## 0. Corrections to Gate J

Gate K gathered live evidence that corrects three Gate J statements. They are recorded here rather
than silently fixed, because later gates must build on the accurate numbers.

| Gate J said | Gate K finds | Evidence |
| --- | --- | --- |
| 8 legacy tables lack `CREATE TABLE` | **14** lack it | §1.1 |
| `venue_categories` has no `CREATE TABLE` in migrations | **It does** — `20261103175957_venue_dynamic_categories_timezone_dst.sql:17`, and its DDL matches the live shape exactly | §1.3 |
| Flutter buckets are `venue`, `general` | **Flutter has no storage DDL at all** — 0 bucket/policy statements in 16 migrations | §2.7 |
| 4 table-name collisions | **5** — `notifications` also collides, and it is Flutter's 2nd most-used table | §6.5 |

Everything else in Gate J stands.

---

## 1. React legacy schema inventory

### 1.1 The precise gap — CONFIRMED

Live `public` schema: **74 base tables + 1 view** (`public_provider_profiles`), 0 materialized views.

| Measure | Count | How derived |
| --- | --- | --- |
| Live base tables | 74 | `pg_class` relkind `r` |
| Table names declared by the 81 migrations | 77 | parse of all `CREATE TABLE` (78 matches minus one `private.*` artifact) |
| Declared **and** live | **60** | set intersection |
| Live but **never declared** | **14** | set difference — the legacy set |
| Declared but **not yet live** | **17** | the 8 pending migrations |
| Check | 74 = 60 + 14 ✓ · 77 = 60 + 17 ✓ | arithmetic closes |

This **resolves Gate J's open item J9** (77 declared vs 74 live). There is no unexplained drift:
17 tables are pending and 14 were never in the lineage.

### 1.2 The 14 legacy tables (no `CREATE TABLE` anywhere in the 81 migrations)

`bookings`, `cinema_screens`, `enquiries`, `listings`, `movie_refunds`, `movie_support_tickets`,
`notifications`, `payment_verifications`, `profiles`, `reviews`, `seat_locks`, `transactions`,
`user_favorites`, `user_module_configs`.

Every one of the 14 is a base table created **before** the migration baseline, present in the live
database, and altered thereafter by migrations that assume it exists.

### 1.3 Live column definitions — CONFIRMED (read-only `information_schema`)

| Table | Cols | Primary key | Notable columns |
| --- | --- | --- | --- |
| `bookings` | **30** | `id text` | `user_id uuid`, `listing_id text`, `provider_id text`, `payload jsonb`, `total_paise bigint`, `refund_paise bigint`, `check_in/check_out date`, `idempotency_key text`, `payment_status text` (8-value CHECK), `payment_mode text` (4-value CHECK), `qr_signature`, `qr_pass_token`, `request_expires_at`, `request_note` |
| `profiles` | **15** | `id uuid` → `auth.users` | `role text` (customer/provider/admin), `is_super_admin boolean`, `google_sub text UNIQUE`, `account_status text` (5-value CHECK), `verified`, `city`, `last_login_at`, `cover_url` |
| `reviews` | 8 | `id text` | `user_id uuid`, `listing_id text`, `rating numeric` (1–5 CHECK), `payload jsonb`, `customer_name text` |
| `listings` | 15 | `id text` | `owner_id uuid`, `category_id text`, `entity_type text`, `payload jsonb`, `price numeric`, `provider_availability_status text`, `is_verified bool`, `verified_by uuid` |
| `user_favorites` | 3 | `(user_id, listing_id)` | `user_id uuid`, `listing_id text` |
| `enquiries` | 10 | `id text` | `user_id uuid`, `listing_id text`, `provider_id text`, `message text`, `status text` |
| `user_module_configs` | 4 | `(user_id, module_key)` | `config_payload jsonb` |
| `cinema_screens` | **28** | `id text` | `cinema_listing_id text`, `tiers jsonb`, `showtimes jsonb`, `seat_tiers jsonb`, `refund_percent`, `gst_percent`, `row_version bigint` |
| `seat_locks` | 11 | `id text` | `listing_id text`, `show_date`, `seat_id`, `session_id`, `booking_id`, `expires_at` |
| `transactions` | 11 | `id text` | `user_id uuid`, `tx_type`, `plan_name`, `invoice_number`, `tx_date text` |
| `payment_verifications` | 10 | `id text` | `intent_id`, `merchant_vpa`, `utr_number`, `gateway_signature`, `status` |
| `notifications` | 11 | `id text` | `recipient_user_id uuid`, `target_role text`, `read_by jsonb`, `is_read bool`, `link_id text`, `created_by uuid` |
| `movie_refunds` | 15 | `id text` | `booking_id`, `pass_code`, `original_amount`, `deduction_amount`, `utr_reference` |
| `movie_support_tickets` | 12 | `id text` | `booking_id`, `pass_code`, `issue_category`, `resolution_note` |

**Nine of the 14 use a `text` primary key.** This is the single deepest structural fact about React's
legacy core: identity is `uuid`, but every legacy business object is keyed by an application-generated
`text` id.

### 1.4 Foreign keys — CONFIRMED (28 constraints on the 14 tables)

| From | To | Behaviour |
| --- | --- | --- |
| `bookings.user_id`, `profiles.id`, `reviews.user_id`, `listings.owner_id`, `enquiries.user_id`, `user_favorites.user_id`, `user_module_configs.user_id`, `transactions.user_id`, `notifications.*`, `cinema_screens.*` | `auth.users(id)` | mostly `ON DELETE CASCADE` |
| `listings.verified_by` | `auth.users(id)` | `ON DELETE SET NULL` |
| `venue_categories.updated_by` | `auth.users(id)` | no action |

**No foreign key ever points from a legacy table to another legacy table.** `bookings.listing_id`,
`reviews.listing_id`, `enquiries.listing_id`, `user_favorites.listing_id` are unconstrained `text`
references to `listings.id`. Referential integrity between legacy tables is enforced *only* in
application code and in trigger functions. This matters for restore ordering (§8) and for the
integration contracts (§5): there is no DB-level guarantee that a `listing_id` exists.

### 1.5 Indexes — CONFIRMED (29 on the legacy set)

Highlights, verbatim from `pg_indexes`:

```
bookings      idx_bookings_listing_dates (listing_id, check_in, check_out)
bookings      idx_bookings_request_expiry (status, request_expires_at) WHERE status IN ('pending_approval','approved')
bookings      idx_pg_bookings_customer_dates (user_id, check_in DESC) WHERE payload->>'source' = 'pg_booking'
bookings      uniq_bookings_user_idempotency_key UNIQUE (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
reviews       idx_reviews_booking_unique UNIQUE ((payload->>'bookingId')) WHERE payload ? 'bookingId'
listings      idx_listings_active_services_recent (category_id, created_at DESC) WHERE status='active'
listings      uniq_listings_owner_request_id UNIQUE (owner_id, (payload->>'requestId'))
profiles      profiles_google_sub_key UNIQUE (google_sub)
venue_categories  venue_categories_pkey UNIQUE (category_id)
```

Two **partial unique indexes keyed on JSONB payload paths** are load-bearing business rules
(`uniq_bookings_user_idempotency_key`, `idx_reviews_booking_unique`). Any writer that populates
`payload->>'bookingId'` participates in a global uniqueness rule it may not know about — a
cross-application hazard (§7.4).

### 1.6 RLS and policies — CONFIRMED

| Table | RLS enabled | FORCE | Policies |
| --- | --- | --- | --- |
| `bookings` | yes | **no** | 6 |
| `listings` | yes | **no** | 5 |
| `reviews` | yes | **no** | 4 |
| `user_module_configs` | yes | **no** | 4 |
| `profiles` | yes | **no** | 3 |
| `enquiries` | yes | **no** | 3 |
| `user_favorites` | yes | **no** | 3 |
| `venue_categories` | yes | **no** | 1 |
| **Total** | 8/8 | 0 forced | **29** |

`FORCE ROW LEVEL SECURITY` is false everywhere, so the table owner bypasses RLS. All 74 live tables
follow this pattern. Consequence: any `SECURITY DEFINER` function executes as its (privileged) owner
and **RLS does not constrain it** — every such function must enforce tenancy itself (§7.3).

### 1.7 Triggers and dependent functions — CONFIRMED (12)

| Table | Trigger | Function |
| --- | --- | --- |
| `bookings` | `enforce_stay_checkout_publicability` | `enforce_stay_checkout_publicability` |
| `bookings` | `trg_enforce_booking_provider_ownership` | `enforce_booking_provider_ownership` |
| `bookings` | `trg_guard_stay_booking_insert` | `guard_stay_booking_insert` |
| `bookings` | `trg_stay_confirm_request_on_payment` | `stay_confirm_request_on_payment` |
| `bookings` | `trg_stay_expire_intents_on_booking_close` | `stay_expire_intents_on_booking_close` |
| `enquiries` | `trg_enforce_enquiry_provider_ownership` | `enforce_enquiry_provider_ownership` |
| `listings` | `live_edit_listing_audit` | `capture_live_edit_listing_audit` |
| `listings` | `trg_guard_listing_verification_fields` | `guard_listing_verification_fields` |
| `listings` | `trg_guard_live_edit_listing_write` | `guard_live_edit_listing_write` |
| `listings` | `trg_guard_stay_listing_lifecycle` | `guard_stay_listing_lifecycle` |
| `profiles` | `sync_public_provider_profile_after_delete` | `sync_public_provider_profile` |
| `profiles` | `sync_public_provider_profile_after_write` | `sync_public_provider_profile` |

All 12 functions are **defined in migrations**, so the trigger layer, unlike the table layer, *is*
reproducible. It also means five stay-specific guards already police a table whose DDL was never
committed — the guards would fail to attach if the table were absent.

### 1.8 Views and materialized views — CONFIRMED

- Materialized views: **0**.
- Views: **1** — `public_provider_profiles` (feeds the `public_provider_profile_projection` table via
  the `sync_public_provider_profile` trigger). No view or matview definition references any of the
  14 legacy tables directly.

### 1.9 Application references — CONFIRMED

| Table | Files referencing | `.from()` calls |
| --- | --- | --- |
| `listings` | 4 | 8 |
| `profiles` | 5 | 8 |
| `bookings` | 1 | 2 |
| `reviews` | 1 | 2 |
| `enquiries` | 1 | 2 |
| `user_favorites` | 1 | 3 |
| `user_module_configs` | 1 | 2 |
| `venue_categories` | 0 | 0 |

`profiles` additionally appears across **8 server modules** (`providerListingRepository`,
`mediaValidationApi`, `classEnrollmentRepository`, `stayAdminApi`, `supabaseGoogleIdentity`,
`platformBuilderRepository`, `serviceCatalogRepository`, `serviceBookingRepository`) and is read by
essentially every RLS helper (`is_current_user_admin`, `is_active_user`, `business_role`, …). It is
the most load-bearing table in the system and the hardest to reconstruct by hand.

### 1.10 Does `supabase/schema_and_rls.sql` provide a complete reproducible baseline?

**No — but it is closer than Gate J assumed, and it is the origin of all 14 legacy tables.**

| Check | Result |
| --- | --- |
| File exists | `supabase/schema_and_rls.sql`, 39,246 bytes, modified 2026-11-07 14:40 |
| `CREATE TABLE` statements | **14** |
| Which 14? | `profiles, listings, bookings, enquiries, reviews, transactions, user_favorites, user_module_configs, seat_locks, payment_verifications, notifications, cinema_screens, movie_refunds, movie_support_tickets` — **exactly the 14 legacy tables** |
| `CREATE POLICY` statements | 52 |
| Covers ALL legacy tables? | **Yes, 14/14** |
| Matches live column counts? | **No.** `profiles` 7 vs live **15**; `bookings` 13 vs **30**; `listings` 12 vs **15**; `cinema_screens` 17 vs **28** |
| Every file column exists live? | Yes — the file's columns are a strict **subset** of live; no phantom columns |
| Extensions / storage / auth config | not present in the file |
| In the migration ledger | **no** — it is a manual "run this in the SQL editor" script |

**Verdict:** `schema_and_rls.sql` is a **historical snapshot**, not a baseline. It would create all
14 tables with their original (much narrower) shapes; the subsequent 81 migrations would then add the
missing 23 `bookings` columns, 8 `profiles` columns, 3 `listings` columns and 11 `cinema_screens`
columns. That *might* converge — and it is the only path that avoids a dump — but convergence is
**UNVERIFIED** and cannot be proven without a real dry-run restore (A2-class, not permitted here).
Three concrete reasons not to rely on it:

1. Its 52 policies predate 187 migration policies and overlap by name; ordering effects are unproven.
2. It cannot prove the result equals the current live database — only a dump can.
3. It is unversioned and outside the ledger, so it can drift silently.

**Therefore: React's baseline is NOT reproducible today. The authoritative source must be a
schema-only `pg_dump` of the dev project (Gate J Step 1), with `schema_and_rls.sql` demoted to a
historical reference document.**

---

## 2. Flutter schema inventory

16 migrations, `0001`–`0016`, sequential numbering (not timestamps), no ledger, never applied to any
reachable project.

### 2.1 Objects per migration — CONFIRMED

| Migration | Tables | Enums | Functions | Notable |
| --- | --- | --- | --- | --- |
| `0001_users_roles_organizations` | `profiles`, `user_roles`, `organizations`, `owner_profiles` | `user_role`, `org_type`, `verification_status`, `booking_status`, `payment_status` | `handle_new_user`, `get_owner_user_id`, `has_role`, `is_org_owner` | `trg_on_auth_user_created` provisions profiles from `auth.users` |
| `0002_venues` | `venue_categories`, `venues`, `venue_images`, `venue_facilities`, `venue_operating_hours` | `venue_category` | `nearby_venues` (in 0009) | geographic `geog` generated column |
| `0003_availability_booking` | `time_slots`, `booking_holds`, `bookings`, `booking_coupons` | — | `acquire_booking_hold`, `confirm_booking`, `expire_stale_holds`, `available_time_slots` (0011) | **`bookings_no_overlap` EXCLUDE USING gist** |
| `0004_payments` | `payments`, `payment_attempts`, `refunds`, `payouts`, `platform_commissions`, `owner_bank_accounts`, `pricing_rules` | — | `reconcile_stale_payments` | Razorpay |
| `0005_rls_policies` | — | — | — | bulk policy set |
| `0006_engagement_support_events` | `favorites`, `reviews`(later), `events`, `event_registrations`, `support_tickets`, `support_ticket_messages`, `disputes`, `messages`, `coupons`, `notifications`(later) | `event_category`, `course_mode` | `register_for_event`, `cancel_event_registration`, `mark_ticket_resolved` | — |
| `0007_seed_data` | — | — | — | seed |
| `0008_scheduled_jobs` | — | — | `expire_stale_holds` scheduling | — |
| `0009_nearby_venues_rpc` | — | — | `nearby_venues` | PostGIS |
| `0010_demo_content` | — | — | — | demo data |
| `0011_available_time_slots_rpc` | — | — | `available_time_slots` | — |
| `0012_events_enrollment` | — | — | `register_for_event` | — |
| `0013_events_courses_read` | `courses`, `course_batches`, `course_enrollments`, `institutes` | — | `enroll_in_course`, `drop_course_enrollment`, `my_enrolled_batches` | — |
| `0014_owner_registration` | `owner_profiles` (extend) | — | `register_owner`, `create_owner_venue`, `update_owner_venue`, `delete_owner_venue`, `get_owner_venues`, `delete_owner_account` | — |
| `0015_notifications_analytics_support_audit` | `notifications`, `notifications_archive`, `analytics_events`, `crash_reports`, `device_tokens`, `audit_logs`, `audit_logs_archive`, `webhook_events`, `support_tickets` | `ticket_status`, `ticket_priority` | `register_webhook_event` | — |
| `0016_reviews_venue_management` | `reviews`, `venue_*` management | — | `reviews_rating_trigger`, `update_venue_rating` | rating aggregate trigger |

### 2.2 Totals — CONFIRMED

| Object class | Count |
| --- | --- |
| Tables | **41** |
| Enums | **10** |
| Functions | **28** |
| Triggers | **11** |
| Policies | **74** |
| Tables with RLS | **41** (100 %) |
| Indexes | **47** |
| Foreign keys | 25 → `auth.users`, 13 → `venues`, 7 → `organizations`, 7 → `bookings`, 12 others |

### 2.3 Booking overlap prevention — the crown jewel

```sql
constraint bookings_no_overlap exclude using gist (
  venue_id with =,
  book_date with =,
  tsrange(book_date + start_time, book_date + end_time, '[)') with &&
) where (status in ('held', 'pending', 'confirmed', 'completed'))
```

This is a **database-enforced** guarantee that no two live bookings overlap a venue's date/time. It is
the strongest correctness property in either codebase, it cannot be expressed outside Postgres, and it
cannot span databases. `booking_holds` (`expires_at`, `idx_holds_expiry ... where status='active'`)
plus `acquire_booking_hold()`/`expire_stale_holds()` implement a soft-lock layer above it.

Any architecture that splits Flutter into its own project keeps this property *inside* that project
and loses it across apps; any architecture that puts Flutter's tables in a second schema of one
database keeps it *within* Flutter's schema but still not across React's `bookings` (§6.1).

### 2.4 Venue ownership and tenancy

`organizations.owner_user_id` → `owner_profiles` → `venues.org_id` (`ON DELETE CASCADE`). Authorisation
helpers `get_owner_user_id()`, `is_org_owner()`, `has_role()` read `user_roles`/`owner_profiles`.
Owner lifecycle RPCs (`register_owner`, `create_owner_venue`, `delete_owner_account`) exist and are
`SECURITY DEFINER`-style wrappers.

### 2.5 Authentication

`trg_on_auth_user_created` → `handle_new_user()` inserts into `profiles` (and presumably
`user_roles`) on every new `auth.users` row. This **conflicts directly** with React's own provisioning
path (`supabaseGoogleIdentity.ts` + `bootstrap_super_admin.sql` + 3 migrations that police
`profiles` self-insert). Two provisioners on one `auth.users` table is a hard blocker (§7.2).

### 2.6 Payment processing

`payments` → `payment_attempts` → `refunds`, with `webhook_events` (`provider, processed`,
partial index on `processed=false`) as the idempotency store and `reconcile_stale_payments()` as the
repair path. `payouts`, `platform_commissions`, `owner_bank_accounts`, `pricing_rules` complete a
marketplace settlement model that React does not have.

### 2.7 Storage permissions — **ABSENT**

```
grep -c 'bucket' supabase/migrations/*.sql  → 0 matches in all 16 files
storage.buckets / storage.objects references → none
```

**CONFIRMED: Flutter's migrations contain no bucket creation and no `storage.objects` policy.**
Gate J's `venue`/`general` bucket claim was a false positive from a generic quoted-pair grep. The
storage layer is therefore configured **out of band** (dashboard or manual SQL) and is **not
reproducible, not reviewable and not auditable** from the repository. This is a security blocker
(§7.5), not merely a reproducibility gap.

### 2.8 Flutter reproducibility verdict

| Layer | Reproducible from repo? |
| --- | --- |
| Tables, columns, enums, indexes, FKs | **YES** — 16 migrations are self-contained |
| Functions, triggers, policies | **YES** — all declared |
| Seed/demo data | Partially (`0007`, `0010`) |
| Extensions | `postgis` implied by `geography`, `btree_gist` implied by `EXCLUDE` — not explicitly created |
| **Storage buckets and policies** | **NO** — nothing in the repo |
| Auth provider configuration (email/phone OTP/Google) | **NO** — dashboard only |

**Flutter schema is reproducible for its relational core and NOT reproducible for storage or auth
configuration.** Two explicit `CREATE EXTENSION` statements are also missing.

---

## 3. Complete object ownership matrix

Ownership domains after Gate K. `CONTESTED` = same name, incompatible shape, both apps at runtime.

| Domain | Objects | Defined by | Owner | Conflict |
| --- | --- | --- | --- | --- |
| **Legacy core** | 14 tables | *nothing* (pre-baseline) + `schema_and_rls.sql` (stale) | React | — (React only) |
| **React migrations** | 60 live tables | 73 applied migrations | React | — |
| **React pending** | 17 tables | 8 pending migrations | React | — (not yet applied) |
| **React views** | `public_provider_profiles` | migration | React | — |
| **React functions** | 179 public + 18 private | migrations | React | — |
| **React policies** | 141 (live census) | migrations | React | — |
| **Flutter core** | 41 tables | 16 migrations | Flutter | 5 names collide |
| **Flutter enums** | 10 | 16 migrations | Flutter | semantic clash with React text+CHECK |
| **Flutter functions** | 28 | 16 migrations | Flutter | 0 name clashes |
| **Flutter policies** | 74 | 16 migrations | Flutter | 0 name clashes |
| **Flutter storage** | *unknown* | **nothing** | **nobody** | **blocker** |
| `auth.users` | platform | Supabase | **shared** | two provisioners |

**Contested names (5):** `bookings`, `profiles`, `reviews`, `venue_categories`, `notifications`.

**Non-overlapping counts:** 182 React functions vs 28 Flutter functions, **0 shared**; 54 vs 11
triggers, **0 shared**; 0 enums vs 10, **0 shared**; 3 React buckets vs 0 declared Flutter buckets.

---

## 4. Missing baseline definitions

### 4.1 The 14 missing definitions

| # | Table | Live cols | Present in `schema_and_rls.sql` | Shape match |
| --- | --- | --- | --- | --- |
| 1 | `bookings` | 30 | yes | 13/30 — **stale** |
| 2 | `profiles` | 15 | yes | 7/15 — **stale** |
| 3 | `listings` | 15 | yes | 12/15 — **stale** |
| 4 | `cinema_screens` | 28 | yes | 17/28 — **stale** |
| 5 | `reviews` | 8 | yes | 8/8 — exact |
| 6 | `enquiries` | 10 | yes | 10/10 — exact |
| 7 | `transactions` | 11 | yes | 11/11 — exact |
| 8 | `notifications` | 11 | yes | 11/11 — exact |
| 9 | `payment_verifications` | 10 | yes | 10/10 — exact |
| 10 | `seat_locks` | 11 | yes | 11/11 — exact |
| 11 | `movie_refunds` | 15 | yes | 15/15 — exact |
| 12 | `movie_support_tickets` | 12 | yes | 12/12 — exact |
| 13 | `user_favorites` | 3 | yes | 3/3 — exact |
| 14 | `user_module_configs` | 4 | yes | 4/4 — exact |

**9 of 14 are exactly reproducible** from `schema_and_rls.sql`; **5 are stale** and depend on later
migrations to be completed. Crucially, the stale five (`bookings`, `profiles`, `listings`,
`cinema_screens`) are exactly the ones with the most dependent triggers, policies and application
code.

### 4.2 Why this is still a blocker

A dump is required not because the DDL is unobtainable, but because **equivalence cannot be proven
without one**. The five stale tables carry 12 triggers, 29 policies, 29 indexes and partial unique
indexes on JSONB expressions; reconstructing them from `schema_and_rls.sql` + replaying 81 migrations
is a *hypothesis* about what the database should look like, and a restore drill is the only way to
test it.

---

## 5. Cross-application integration contracts

Option C needs exactly **three** contracts. Full DDL sketches are in the Blueprint; this section
states the obligations.

### 5.1 Identity contract

- One `auth.users`, **one** provisioning path. React's path survives (it owns `profiles`, 15 columns,
  8 server modules and every RLS helper).
- Flutter's `handle_new_user()` / `trg_on_auth_user_created` must be **retired**, replaced by a
  view `mobile.profiles` exposing `id, full_name, phone, email, avatar_url, locale`.
- Flutter's `user_roles` + `user_role` enum stay in `mobile`; ownership maps to React's
  `business_members`/`is_super_admin` through a compatibility view — **no dual role truth**.
- Acceptance: a user created via either client has exactly one `profiles` row, one role
  representation, and both apps' authorisation helpers agree.

### 5.2 Booking-authority contract

- A single table `core.resource_claim(resource_kind, resource_id, period tstzrange, app, claim_id,
  status)` with an `EXCLUDE USING gist (resource_kind WITH =, resource_id WITH =, period WITH &&)`
  constraint — the **only** place a physical space can be double-claimed.
- React's `bookings` stays exactly as it is (`id text`, 30 cols); a trigger on insert/update writes the
  corresponding claim. Flutter's `mobile.bookings` keeps its own GiST exclusion for intra-Flutter
  correctness *and* also writes `core.resource_claim`.
- Because `public.bookings.id` is `text` and `mobile.bookings.id` is `uuid`, `claim_id` is `text` with
  a `app` discriminator — **no FK across schemas** (type mismatch makes one impossible).
- Acceptance: a venue booked through React makes the same slot unavailable through Flutter, and
  vice-versa, atomically, with the second attempt receiving a constraint violation mapped to a
  user-facing conflict.

### 5.3 Payment settlement contract

- `core.payment_event(provider, provider_event_id UNIQUE, kind, booking_ref, app, amount_paise,
  status, received_at)` — the single idempotency store, keyed by Razorpay event id.
- React's `payment_provider_events` and Flutter's `webhook_events` each become a projection that
  records their app-specific detail while `core.payment_event` decides "was this already processed".
- `kind` distinguishes `capture`, `refund`, `payout`; `booking_ref` is `text` to span both ID types.
- Acceptance: replaying one Razorpay webhook twice settles exactly once; a refund created in either
  app is visible as the same refund from the other.

### 5.4 Explicit non-contracts

- No cross-schema FKs into `public` (type mismatch + RLS bypass risk).
- No writes from `mobile` into `public.payload` (two partial unique indexes depend on it).
- No shared enum types; `mobile` enums stay in `mobile`.
- No `mobile` grants on the `private` schema.

---

## 6. Conflict resolution proposals

All five are resolved by **schema separation plus one view**, with **zero changes** to React's primary
keys, column types or existing `public` tables. None is implemented here.

### 6.1 `bookings.id` — text vs uuid

React `public.bookings.id text`; Flutter `mobile.bookings.id uuid`. A cross-schema FK is impossible
without rewriting one side. **Proposal:** no FK. Both write `core.resource_claim` (§5.2), which is
`text`-keyed with an `app` discriminator. React keeps its table untouched; Flutter keeps its table
untouched; the claim table is the only join point. Backward compatible: yes, because neither
application changes a PK.

### 6.2 `reviews.id` — text vs uuid

Same shape of problem. **Proposal:** React keeps `public.reviews` (`id text`, aggregate via
`payload`), Flutter keeps `mobile.reviews` (`id uuid`, `rating int 1–5`, unique `(venue_id,user_id)`,
`reviews_rating_trigger`). Cross-app review visibility, if ever needed, is a union **view** in
`core`, not a merged table. Note `public.reviews` has a partial UNIQUE index on `payload->>'bookingId'`
— `mobile` must never write `public.reviews`.

### 6.3 `profiles.role` — text vs enum + `user_roles`

React: `public.profiles.role text CHECK (customer|provider|admin)` + `is_super_admin boolean` +
`business_members`. Flutter: `mobile.user_roles` with a 7-value `user_role` enum.
**Proposal:** `public.profiles` remains the single profile row (it already has 15 columns and 8 server
dependencies). `mobile.profiles` becomes a **view** over it. `mobile.user_roles` remains Flutter's
authorisation source, seeded from `public.profiles.role`/`is_super_admin` by a one-way sync function.
Mapping to decide (owner): `customer→customer`, `provider→venue_owner`, `admin→administrator`,
`is_super_admin→super_administrator`; Flutter's `institute_owner`, `event_organizer`,
`support_agent` have **no React counterpart** and need explicit values — an unmapped enum member is
a silent privilege bug, so the mapping must be exhaustive and tested.

### 6.4 `venue_categories` — incompatible structures

React: `category_id text PK` (`^venue-[a-z0-9-]{2,60}$`), `label`, `emoji`, `subcategories text[]`,
`active`, `sort_order`, `updated_by`. Flutter: `id uuid PK`, `slug`, `name`, `icon`.
**Proposal:** no merge. React keeps `public.venue_categories`; Flutter keeps
`mobile.venue_categories`. A `core.venue_category_map(react_category_id text, mobile_category_id uuid)`
bridge table is created **only if** a cross-app product requirement appears — it is not needed for
booking correctness. Correction to Gate J: this table *does* have a `CREATE TABLE` in migration
`20261103175957` and its 8 live columns match that DDL exactly; the "missing DDL" classification was
wrong.

### 6.5 `notifications` — the newly discovered fifth collision

| React `public.notifications` | Flutter `mobile.notifications` |
| --- | --- |
| `id text`, `recipient_user_id uuid`, `target_role text`, `read_by jsonb`, `is_read bool`, `link_id`, `created_by`, `created_at` | `id uuid`, `user_id uuid`, `body`, `type` (7-value CHECK), `data jsonb`, `read bool`, `read_at`, `updated_at` |

This is the most dangerous collision because Flutter uses `notifications` **four times** at runtime
(its 2nd most-used table) and React uses it for admin broadcasts. A shared table would let Flutter's
`user_id`-based policies read rows whose recipient lives in `recipient_user_id` — a straightforward
cross-user notification leak. **Proposal:** complete separation, `public.notifications` for React,
`mobile.notifications` for Flutter, plus a delivery fan-out RPC if notifications must ever be shared.

---

## 7. Security and RLS assessment

No policy was changed. Findings are ordered by severity.

### 7.1 SECURITY DEFINER surface — CONFIRMED

| Metric | Value |
| --- | --- |
| `SECURITY DEFINER` functions in `public` | **116** |
| `SECURITY INVOKER` functions | 63 |
| Definers with **no** pinned `search_path` | **0** |
| Definers with a pinned `search_path` | **116** |
| Definers with exactly `search_path=pg_catalog` | **1** (`rls_auto_enable`) |

Two pinned patterns are in use:
`pg_catalog, auth, storage, public, pg_temp` (majority) and `pg_catalog, public, storage, auth`
(`finalize_media_asset*`). Both put `pg_catalog` first, which is correct. **No definer is
unpinned — this is the single strongest security property in React's database, and it must be
preserved verbatim.**

### 7.2 Two profile provisioners — HIGH

React provisions profiles from application code (`supabaseGoogleIdentity`, migration-guarded
self-insert policies, `bootstrap_super_admin.sql`); Flutter provisions from an `auth.users` trigger.
On one `auth.users` table both would run, in an order nobody controls, producing either duplicate
inserts (unique violation → failed sign-ups) or rows satisfying one app's policies and violating the
other's. **Blocker for Option C until exactly one provisioner is chosen** (§5.1).

### 7.3 RLS bypass through definers — HIGH

`FORCE ROW LEVEL SECURITY` is false on all 74 tables. Every `SECURITY DEFINER` function runs as a
privileged owner and is **not** constrained by RLS. Any new `mobile`-facing function that reads
`public.bookings` and forgets a tenant predicate exposes every tenant's bookings. Mitigation: the
Blueprint requires every cross-schema definer to take an explicit actor argument and assert it, plus a
regression test mirroring the existing
`supabase/tests/authenticated_rpc_security_audit_test.sql` pattern.

### 7.4 JSONB payload as an authorisation surface — HIGH

Three load-bearing rules live inside `payload`:

- `uniq_bookings_user_idempotency_key` — global uniqueness per user.
- `idx_reviews_booking_unique` — UNIQUE on `payload->>'bookingId'`.
- `idx_pg_bookings_customer_dates` — index predicate on `payload->>'source' = 'pg_booking'`.

If `mobile` ever writes `public.bookings` or `public.reviews`, it can (a) collide a legitimately
distinct booking on idempotency key, (b) block re-reviewing a booking, (c) silently change index
selection. Mitigation: `mobile` gets **no** INSERT/UPDATE grant on the legacy core; only the contract
tables.

### 7.5 Flutter storage has no declared policy — HIGH (blocker)

With zero bucket and zero `storage.objects` policy in the repo, the production storage authorisation
surface is **unknown and unversioned**. A Flutter bucket created with `public = true` in a dashboard
would expose every uploaded document. Cannot be assessed from evidence — must be authored as DDL
before any provisioning.

### 7.6 `private` schema exposure — MEDIUM

`private.api_rate_limit_windows` exists alongside 18 private functions. Grants to `anon`/`authenticated`
on `private` would be a direct control bypass. The Blueprint requires an explicit `REVOKE ALL ON SCHEMA
private FROM PUBLIC, anon, authenticated` verification step, and the same for the new `core` schema.

### 7.7 Type-mismatched cross-schema relations — MEDIUM

Attempting an FK from `mobile.bookings.id (uuid)` to `public.bookings.id (text)` is not merely
disallowed by design — Postgres will refuse it. Any "shared booking" design that assumes such an FK
exists would fail at migration time and, worse, might be replaced with an unenforced `text` join. The
contract table's `text` key with an `app` discriminator is the deliberate resolution.

### 7.8 Webhook authorisation — MEDIUM

React settles via `settle_*_verified_payment` / `pg_razorpay_raw_body_settlement`; Flutter via
`register_webhook_event` + `reconcile_stale_payments`. Two webhook endpoints, two idempotency stores,
one merchant account. A missing signature check on either endpoint lets any caller mark a payment
captured. The settlement contract (§5.3) fixes the *double-settle* case; each endpoint's signature
verification still needs an explicit, tested review.

---

## 8. Database reproducibility matrix

`Source` = what would have to be replayed. `Status` is about a *fresh* project.

| # | Object | Source | Owner | Dependency | Status | Required remediation |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 9 legacy tables (exact in `schema_and_rls.sql`) | `schema_and_rls.sql` | React | none | **Reproducible** | Move into ledger or replace with dump |
| 2 | 5 legacy tables (stale in file) | file + later migrations | React | file first | **Unproven** | Schema-only dump |
| 3 | 60 migration-defined live tables | 73 migrations | React | baseline tables exist | **Reproducible given #1/#2** | ordering proof |
| 4 | 17 pending tables | 8 pending migrations | React | #3 | **Pending** | A3 approval |
| 5 | `public_provider_profiles` view | migration | React | `profiles` | Reproducible | — |
| 6 | 179 public + 18 private functions | migrations | React | tables | Reproducible | — |
| 7 | 141 policies | migrations | React | tables | Reproducible | — |
| 8 | 12 legacy triggers | migrations | React | legacy tables | Reproducible | — |
| 9 | 3 storage buckets + 7 storage policies | migrations (React) | React | `storage` schema | **Partially** — verify | bucket replay check |
| 10 | Flutter 41 tables | 16 migrations | Flutter | extensions | **Reproducible** | — |
| 11 | Flutter 10 enums | 16 migrations | Flutter | none | Reproducible | — |
| 12 | Flutter 47 indexes incl. GiST exclusion | 16 migrations | Flutter | `btree_gist` | **Missing extension DDL** | add `CREATE EXTENSION IF NOT EXISTS btree_gist` |
| 13 | Flutter 28 functions / 11 triggers | 16 migrations | Flutter | tables | Reproducible | — |
| 14 | Flutter 74 policies | 16 migrations | Flutter | tables | Reproducible | — |
| 15 | PostGIS | implied | Flutter | — | **Missing extension DDL** | add `CREATE EXTENSION IF NOT EXISTS postgis` |
| 16 | Flutter storage buckets/policies | **none** | **nobody** | — | **NOT REPRODUCIBLE** | author DDL |
| 17 | Auth provider config (email, phone OTP, Google, redirects) | **none** | owner | project | **NOT REPRODUCIBLE** | document + apply via CLI |
| 18 | Seed/demo content | `0007`, `0010` | Flutter | tables | Partial | decide production policy |
| 19 | Bootstrap super admin | `bootstrap_super_admin.sql` | React | `profiles` | Manual script | fold into runbook |
| 20 | `auth.users` (8 users, 8 identities) | **data**, not schema | owner | — | **NOT REPRODUCIBLE** | explicit decision: fresh vs migrate users |

**Every missing prerequisite, consolidated:** schema-only dump of the 5 stale legacy tables; 8 pending
migrations; `btree_gist`; `postgis`; Flutter storage DDL; auth provider configuration; super-admin
bootstrap; seed policy; and a decision on whether the 8 dev users are migrated or re-registered.

---

## 9. Production provisioning prerequisites

| # | Prerequisite | Gate | Approval |
| --- | --- | --- | --- |
| P1 | Owner answers D1 (provision new vs adopt) and D2 (Option C) | K | **AWAITING OWNER** |
| P2 | Schema-only dump of `obkfgxjzlscungkhbyvq` (resolves §4) | J/K | A1 |
| P3 | Decryption verified interactively (archive must be readable) | I | D6 |
| P4 | 8 pending migrations approved and applied to dev first | E/K | A3 |
| P5 | Flutter storage DDL authored and reviewed | K | A5 |
| P6 | `btree_gist` + `postgis` extension statements added | K | A5 |
| P7 | Single profile provisioner chosen | K | D2 |
| P8 | Identity role mapping (7 Flutter roles → React roles) signed off | K | D2 |
| P9 | `core` schema contracts implemented (claims, events, identity view) | K | A5 |
| P10 | Backup entitlement on the new project (paid plan) + first backup | H | A1 |
| P11 | Clone/restore drill proves recoverability | G | A2/A4 |
| P12 | Disk headroom ≥ 2.2 GiB and 99 % utilisation addressed | G | owner |

---

## 10. Recommended implementation sequence

Nothing here is executed. Each step is an owner gate.

1. **Approve A1 + D6.** Dump the dev schema, verify the archive decrypts. *Without this nothing else is
   verifiable.*
2. **Apply the 8 pending migrations to dev (A3).** They are self-consistent and already written; doing
   them on dev first means production starts from 81/81, not 73/81, and closes the 17 missing tables.
3. **Prove reproducibility by restore.** Build a throwaway database from dump + migrations, compare
   object-by-object against dev (74 tables, 179 functions, 141 policies, 12 legacy triggers, 3
   buckets). Any diff is a finding, not a nuisance.
4. **Author Flutter storage DDL (P5) and extension statements (P6).** Until these exist, Flutter is not
   provisionable.
5. **Decide the single profile provisioner (P7)** and write the role mapping (P8). Test both sign-in
   paths against a disposable database.
6. **Create the `mobile` schema and re-home Flutter's 16 migrations**, object by object. Preserve the
   GiST exclusion. **No global `public`→`mobile` substitution**; each object reviewed individually.
7. **Create the `core` schema** with the three contracts, then wire React's and Flutter's writes.
8. **Provision production** (only now): Mumbai, paid plan, dump-first schema build, 81 migrations,
   `mobile`, `core`.
9. **Configure auth + storage**, apply the documented provider settings, create buckets with explicit
   policies.
10. **Verify and rehearse**: full census comparison, then a clone-and-restore drill before declaring
    production recoverable.

---

## 11. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Production built from `schema_and_rls.sql` misses legacy columns | **High** | **Critical** | Dump-first (P2); restore drill (step 3) |
| R2 | Two profile provisioners corrupt sign-ups | High | Critical | One provisioner (P7), tested |
| R3 | `mobile` definer reads `public` without tenant predicate | Medium | Critical | Actor-argument rule (§7.3) + audit test |
| R4 | JSONB partial unique indexes disrupted by mobile writes | Medium | High | No mobile grants on legacy core (§7.4) |
| R5 | Flutter storage bucket created public | Medium | High | Storage DDL (P5) before provisioning |
| R6 | Double-booking across apps persists | Medium | High | `core.resource_claim` exclusion constraint (§5.2) |
| R7 | Double-settled Razorpay payment | Low | Critical | `core.payment_event` UNIQUE on event id (§5.3) |
| R8 | Enum role not mapped → silent privilege escalation | Medium | High | Exhaustive mapping + test (P8) |
| R9 | `search_path` regression when `mobile` is added | Low | High | Never edit the 116 pinned declarations; additive only |
| R10 | Disk exhaustion during dump (99 % used) | Medium | Medium | Free space before P2 |
| R11 | `mobile` names collide with a future React table | Low | Medium | Schema namespacing makes it structurally impossible |
| R12 | Archive unreadable when needed | Medium | Critical | D6 before any provisioning |

---

## 12. GO/NO-GO verdict

### GO
- **Option C feasibility:** GO — technically feasible. Schema separation resolves all five collisions
  with **zero changes** to React's primary keys, column types or `public` tables, and three contract
  tables carry the shared semantics.
- **Flutter relational reproducibility:** GO — 41 tables, 10 enums, 47 indexes, 28 functions, 11
  triggers and 74 policies are fully declared.
- **React trigger/function/policy layer:** GO — 182 functions, 54 triggers, 187 policies and all 116
  pinned `search_path`s are in the ledger.
- **Security baseline:** GO — 0 unpinned `SECURITY DEFINER` functions is an unusually good starting
  point that must be preserved.

### NO-GO
- **React baseline reproducibility:** **NO-GO.** 14 tables have no DDL in the ledger; 5 of them are
  only partially described by `schema_and_rls.sql`. A schema-only dump is mandatory.
- **Flutter provisioning:** **NO-GO.** Storage is entirely undeclared, `btree_gist`/`postgis` are
  implied but never created, and auth config is dashboard-only.
- **Production provisioning:** **NO-GO.** P1–P12 are unapproved; D1/D2 unanswered.
- **Option C implementation:** **NO-GO to build**, GO as a design (§5, Blueprint) pending D2.
- **Any execution:** NO-GO — nothing was created, altered, migrated or deployed.

### The short version

React's baseline is **recoverable but not currently reproducible**: 14 tables predate the migration
ledger, 9 of them verbatim in an untracked 39 KB script and 5 only partially. Flutter's *relational*
schema is fully reproducible, but its storage layer exists nowhere in source at all. The five
collisions resolve cleanly by putting Flutter in its own schema and sharing exactly three contracts
(identity, booking claims, settlement events), which requires no change to any React primary key.

Option C is therefore **technically feasible and the right target**, but it cannot be built on an
unproven baseline. The next milestone is not "create the project" — it is **prove the baseline**:
dump the dev schema, decrypt it, rebuild a throwaway database, and diff it against the live 74
tables. Everything else depends on that result.
