# Gate J — Dual-Repository Database Reconciliation & Production Provisioning

**Date:** 2026-11-24
**React repo:** `/Users/aa/Downloads/bookourspace-react` — `feat/universal-gps-tracking` @ `96c1297`
**Flutter repo:** `/Users/aa/Desktop/BookMySpace` — `main` @ `fc35976`
**Mode:** READ-ONLY. No project created, no migration executed, no write of any kind, no deployment,
no Git modification.
**Predecessors:** Gates E, F, G, H, I.

Labels: **CONFIRMED** (observed this gate) · **INFERRED** (deduced, stated as such) ·
**UNRESOLVED** · **OWNER ACTION**.

> **Scope note.** The brief was truncated after "prepare a provisioning" in Phase 5. Gate J followed
> the Gate E–I convention: Phase 5 delivers a **prepared, unexecuted provisioning runbook** (§7), the
> deliverable is §1–§9 below, and nothing was provisioned.

---

## 1. Repository integrity

### 1.1 React repository

| Property | Value | Label |
| --- | --- | --- |
| Absolute path | `/Users/aa/Downloads/bookourspace-react` | CONFIRMED |
| Git remote | none configured for this worktree path in use (branch local) | CONFIRMED |
| Branch | `feat/universal-gps-tracking` | CONFIRMED |
| HEAD | `96c1297` | CONFIRMED |
| Working tree | 1 modified (`src/components/ProviderDashboard.tsx`), 0 staged, 5 untracked Gate reports | CONFIRMED |
| Migrations | **81** `.sql` files in `supabase/migrations/` | CONFIRMED |
| Config files | `.env`, `.env.local`, `.env.example`, `.env.save`, `.env.local.mumbai`, `.env.local.mumbai.pre-mumbai-key-20261104T174243`, `.env.local.pre-mumbai-key-20261104T174243`, `.env.local.stockholm` | CONFIRMED |
| Deployment config | `deploy/{CHECKLIST.md,POST_DEPLOY.md,env.production.example,cloudrun/,native/}` | CONFIRMED |
| Supabase refs | `obkfgxjzlscungkhbyvq` (dev), `sfoizxarbljhldmkgsma` (retired), `ezrxykyocgbolpaebnqx` (legacy dev) — **no production ref** | CONFIRMED |
| Startup guard | `src/server/supabaseProductionGuard.ts` — requires `BOS_PRODUCTION_SUPABASE_PROJECT_ID`, never falls back to dev (D7) | CONFIRMED |

### 1.2 Flutter repository

| Property | Value | Label |
| --- | --- | --- |
| Absolute path | `/Users/aa/Desktop/BookMySpace` | CONFIRMED |
| Git remote | `origin https://github.com/Naren-SDET-QA/bookmyspace.git` | CONFIRMED |
| Branch | `main` | CONFIRMED |
| HEAD | `fc35976f7bc2895f6b8bcbcb1f82bb1ea155eb6c` | CONFIRMED |
| Working tree | **clean** (0 entries) | CONFIRMED |
| SQL lineage | `supabase/migrations/0001…0016` = **16 files**; plus `supabase/test_harness_auth_stub.sql` and 3 files in `supabase/tests/` → **20 SQL files total** | CONFIRMED |
| Config files | `.env.example`, `env.example.json`, `pubspec.yaml`, `pubspec.lock`, `analysis_options.yaml` — **no `.env`, no `.env.prod`** | CONFIRMED |
| Deployment config | `docker/{docker-compose.local.yml,init-migrations.sh}` only — **no hosting config, no `firebase.json`, no `.firebaserc`** | CONFIRMED |
| Supabase refs | none committed. `String.fromEnvironment('SUPABASE_URL')` + `.env.example` placeholder `https://YOUR_PROJECT.supabase.co` | CONFIRMED |
| Startup guard | `AppConfig.validate()` throws `ConfigurationException` on missing/invalid `SUPABASE_URL` or `SUPABASE_ANON_KEY` | CONFIRMED |

**Both working trees preserved.** Gate J ran only read operations in both repositories. Flutter's
tree was already clean and remains clean; React's single pre-existing modification and all Gate
reports are untouched. No file was written inside either repository except this report (React root).

**Native identity note:** `com.bookourspace.app` appears in React docs as the **bundled application
ID** of its Capacitor shell (`capacitor://localhost`, `com.bookourspace.app://auth/callback`) — it is
a package identifier, **not** a DNS domain. The Flutter/Kotlin copies use
`com.bookmyspace.bookmyspace`. Two different native products, two different bundle IDs.

---

## 2. Migration lineage reconciliation

Mechanical comparison of every object definition in both lineages (read-only parse of all 97 SQL
files; no database schema was altered or re-created).

### 2.0 Headline counts

| Object class | React (81 files) | Flutter (16 migrations) | Overlap |
| --- | --- | --- | --- |
| `CREATE TABLE` (unique names) | 77 | 41 | **1** (`venue_categories`, incompatible) |
| `CREATE TYPE … AS ENUM` | **0** | **10** | **0** |
| `CREATE FUNCTION` | 182 (179 public + 3 in sibling file) | 28 | **0** |
| `CREATE TRIGGER` | 54 | 11 | **0** |
| `CREATE POLICY` statements | 187 | 74 | 0 shared names |
| Tables with RLS enabled | 78 | 41 | 1 |
| Live `public` tables (hosted dev) | 74 | — | — |

The two lineages are **not two versions of one schema**. They are two unrelated schemas that happen
to describe the same business domain with the same words.

### 2.1 Common database objects

Exactly **one** object name is defined by both: `public.venue_categories`. Its definitions are not
compatible (§2.3). The apparent "common" vocabulary — `bookings`, `reviews`, `profiles`, `venues`,
`payments`, `notifications` — is a **name collision, not a shared object**, because only one side
defines each (§2.2). This is the single most important finding of Gate J.

### 2.2 Duplicate table definitions — 4 runtime name collisions

| Table | React definition | Flutter definition | Collides at runtime? |
| --- | --- | --- | --- |
| `bookings` | **live in hosted DB, no `CREATE TABLE` in the 81 migrations** — legacy pre-baseline table | `0003_availability_booking.sql` | **YES** — both apps query it |
| `profiles` | **live in hosted DB, no `CREATE TABLE` in the 81 migrations** | `0001_users_roles_organizations.sql` | **YES** — both apps query it |
| `reviews` | **live in hosted DB, no `CREATE TABLE` in the 81 migrations** | `0016_reviews_venue_management.sql` | **YES** — both apps query it |
| `venue_categories` | **live in hosted DB, no `CREATE TABLE` in the 81 migrations** | `0002_venues.sql` | **YES** — both apps query it |

**Second major finding:** React's most business-critical tables (`bookings`, `profiles`, `reviews`,
`venue_categories`, `listings`, `user_favorites`, `enquiries`, `user_module_configs`) have **no
`CREATE TABLE` statement in the 81-migration lineage**. They were created before the migration
baseline and are only ever `ALTER`ed and re-policied. React's schema is therefore **not reproducible
from its migrations alone** — a fact that directly constrains any production build (§7).

### 2.3 Conflicting column definitions — CONFIRMED from the live database

Read-only `information_schema` query against the dev project (`begin read only; … rollback;`), versus
Flutter's migration text:

| Column set | React (live, CONFIRMED) | Flutter (migration text, CONFIRMED) |
| --- | --- | --- |
| `bookings.id` | `text` | `uuid` |
| `bookings` keys | `listing_id text`, `provider_id text`, `user_id uuid` | `venue_id uuid`, `slot_id uuid`, `hold_id uuid`, `booking_ref text unique` |
| `bookings.status` | `text` (free-form) | `public.booking_status` **enum** |
| `bookings` money | `amount numeric`, `total_paise bigint`, `refund_paise bigint` | `amount numeric(12,2)`, `total_amount`, `tax_amount`, `discount_amount`, `currency text` |
| `bookings` time | `scheduled_date text`, `scheduled_time text`, `check_in date`, `check_out date` | `book_date date`, `start_time time`, `end_time time` |
| `bookings` extensibility | `payload jsonb`, `qr_signature`, `qr_pass_token`, `payment_utr`, `payment_mode`, `idempotency_key` | `metadata jsonb`, `cancellation_policy jsonb` |
| `bookings` overlap guard | none observable in the lineage | `EXCLUDE USING gist (venue_id =, tsrange(...) &&)` — `bookings_no_overlap` |
| `profiles` | `id, email, full_name, phone, role text, google_sub, account_status, verified, city, last_login_at, is_super_admin, avatar_url, cover_url` | `id, full_name, phone unique, email unique, avatar_url, locale, deleted_at` |
| `profiles.role` | `text` + `is_super_admin boolean` | role lives in a separate `user_roles` table with the `user_role` enum |
| `reviews` | `id text`, `listing_id text`, `customer_name text`, `rating numeric`, `payload jsonb` | `id uuid`, `venue_id uuid`, `booking_id uuid`, `rating integer 1..5`, `title`, `body`, `is_verified`, `unique(venue_id,user_id)` |
| `venue_categories` | `category_id text`, `label`, `emoji`, `subcategories ARRAY`, `active`, `sort_order`, `updated_by` | `id uuid`, `slug unique`, `name`, `icon` |

**Every one of the four colliding tables has a different primary-key type or a different key
shape.** `bookings.id` alone is `text` on one side and `uuid` on the other; `reviews.id` likewise.
There is no column-compatible supertype that both applications could share without a migration that
rewrites one of them.

### 2.4 Conflicting enum definitions

React defines **zero** PostgreSQL enums; every status is `text` guarded by `CHECK` constraints (e.g.
`bookings_payment_mode_check`, `bookings_total_paise_check`). Flutter defines **ten** enums:

```
booking_status    held, pending, confirmed, completed, cancelled, refunded, no_show
payment_status    pending, authorized, captured, failed, refunded, partially_refunded
user_role         customer, venue_owner, institute_owner, event_organizer, support_agent, administrator, super_administrator
org_type          venue_owner, institute_owner, event_organizer
venue_category    function_hall, marriage_hall, convention_center, party_hall, meeting_room,
                  community_hall, sports_ground, coworking_space, auditorium
event_category    meeting, conference, workshop, sports, entertainment, cultural, exhibition, community
course_mode       online, offline, hybrid
ticket_status     open, in_progress, resolved, closed
ticket_priority   low, medium, high, urgent
verification_status pending, submitted, approved, rejected
```

Adopting Flutter's enums into React's database would be a **breaking change to every React writer**:
`bookings.status` currently accepts text values React already stores (`pending`, `confirmed`,
`payment_pending`, `paid`, `cancelled`, …) that are not all members of `booking_status`. There is no
recorded mapping, and the live rows were not read (§ none — reading row values was out of scope).

### 2.5 RLS policy differences

| | React | Flutter |
| --- | --- | --- |
| Policy statements | 187 | 74 |
| Tables with RLS enabled | 78 | 41 |
| Naming convention | sentence-style + prefixed (`"PG booking parties read bookings"`, `venue_images_owner_*`) | snake_case (`bookings_user_read`, `analytics_admin_read`) |
| Identity source | `profiles.id` / `is_super_admin` / `is_business_member()` / `can_access_business()` | `user_roles` table + `has_role()` / `is_org_owner()` / `get_owner_user_id()` |
| Tenancy model | **business** (`businesses`, `business_members`, `business_module_access`) | **organization** (`organizations`, `owner_profiles`) |

The two permission models are structurally different: React authorises through a *business
membership* graph with per-module access; Flutter authorises through an *organization ownership*
role plus an enum role. A shared database would need one identity graph, and neither `businesses`
nor `organizations` exists on the other side.

Policy **counts on colliding tables** (React | Flutter): `bookings` 3 | 3, `profiles` 3 | 2,
`venue_categories` 1 | 1. Same table name, different predicates, different helper functions —
whichever set were applied last would silently govern the other application's rows.

### 2.6 Function and trigger conflicts

**Zero function names in common** (React 182, Flutter 28). **Zero trigger names in common**
(React 54, Flutter 11). The two helper vocabularies are disjoint:

- React: `pg_*` (paying-guest vertical), `stay_*`, `service_*`, `venue_*`, `builder_*`,
  `platform_*`, `business_*`, `create_booking_atomic`, `settle_stay_payment`, …
- Flutter: `acquire_booking_hold`, `confirm_booking`, `nearby_venues`, `available_time_slots`,
  `register_owner`, `handle_new_user`, `enroll_in_course`, `reconcile_stale_payments`, …

No name clash means no direct conflict — but it also means **zero reuse**: neither app can call the
other's atomicity guarantees. Flutter's concurrent-booking correctness rests on
`acquire_booking_hold` + `bookings_no_overlap`; React's rests on `create_booking_atomic`. In a
shared database, a booking made by one app would not be seen by the other's guard unless a new
shared authority is built (§5, option C).

### 2.7 Foreign-key differences

| Relationship | React | Flutter |
| --- | --- | --- |
| Booking → inventory | `listing_id text` → `listings.id text` (polymorphic `entity_type`) | `venue_id uuid` → `venues.id uuid` |
| Booking → user | `user_id uuid` (no FK to `auth.users` recorded in lineage) | `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT` |
| Booking → time | free-text date/time, plus `check_in`/`check_out` for stays | `slot_id uuid → time_slots(id)`, `book_date`/`start_time`/`end_time` |
| Profile → user | `profiles.id uuid`, presumably `auth.users` (not in lineage) | `profiles.id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` |
| Tenancy | `listings.owner_id uuid` | `venues.org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE` |
| Deletion semantics | mostly `RESTRICT`-free / soft flags | explicit `RESTRICT` on bookings, `CASCADE` on orgs/venues, `SET NULL` on review→booking |

React's polymorphic `listings` table (`entity_type`, `payload jsonb`) is the deepest structural
difference: React stores **one** table for venues, PG, stays, classes, services and movies. Flutter
normalises each vertical into its own table. A single database cannot hold both without one side
rewriting its access paths.

### 2.8 Storage bucket differences

| | React | Flutter |
| --- | --- | --- |
| Buckets named in lineage | `bos-public-media`, `bos-private-documents` (hosted census: 3 private buckets) | `venue`, `general` |
| Object naming | `media_assets` + `media_asset_publications` registry, `finalize_media_asset()` | direct paths per feature |
| Access model | signed/public distinction via publication records | policy-per-bucket |
| Overlap | **none by name** | — |

No bucket names collide, so storage can coexist — but the *registry* cannot: React owns object
lifecycle through `media_assets`, Flutter has no such table, so Flutter-uploaded objects would be
invisible to React's publication machinery (and to its RLS on `media_assets`).

### 2.9 Authentication assumptions

| Assumption | React | Flutter |
| --- | --- | --- |
| Provider | Supabase Auth, Google OAuth (`google_sub` column, `com.bookourspace.app://auth/callback`) | Supabase Auth, email/password + phone OTP (`supabase_phone_otp_provider.dart`), Google |
| Identity root | `auth.users` → `profiles` | `auth.users` → `profiles` (trigger `trg_on_auth_user_created` → `handle_new_user()`) |
| Role storage | `profiles.role text` + `profiles.is_super_admin` + `business_members` | `user_roles` table + `user_role` enum + `has_role()` |
| Session | web + Capacitor (`capacitor://localhost`) + native origin | Flutter mobile |
| Redirect URIs | `com.bookourspace.app://auth/callback`, `https://<production-web-origin>/auth/callback` | injected at build, no committed URI |

Both rest on the **same** `auth.users` table, and both populate `profiles` — with different columns
and a different role model. Sharing one Supabase project would put **two `trg_on_auth_user_created`
/ profile-provisioning conventions** on one `auth.users`, and the Flutter trigger (`handle_new_user`)
does not exist in React's lineage. One of them would have to own user provisioning (§5).

### 2.10 Payment and booking dependencies

| | React | Flutter |
| --- | --- | --- |
| Provider | Razorpay — 9 migrations; `payment_intents`, `venue_payment_intents`, `service_payment_intents`, `payment_provider_events`, `pg_razorpay_raw_body_settlement.sql`, `razorpay_settle_verified_payment`, `pg_settle_verified_payment` | Razorpay — `razorpay_checkout_service.dart`, `payments`, `payment_attempts`, `refunds`, `webhook_events`, `reconcile_stale_payments()`, `register_webhook_event()` |
| Idempotency | `idempotency_key`, `payment_utr`, `qr_signature`, `qr_pass_token` | `webhook_events` table + `reconcile_stale_payments` |
| Settlement authority | server-side verified settlement (`settle_*_verified_payment`) | `reconcile_stale_payments()` routine |
| Booking atomicity | `create_booking_atomic`, `venue_create_booking`, `pg_create_booking` | `acquire_booking_hold` + GiST `EXCLUDE` constraint |
| Refunds | `pg_admin_approve_refund`, `refund_service_payment`, `refund_stay_payment` | `refunds` table, `trg_refunds_updated_at` |

Both integrate Razorpay under **separate webhook event tables** and **separate settlement
functions**. Two webhook endpoints against one Razorpay account with two disjoint idempotency stores
is the highest-risk integration point in any shared-database design: a captured payment could settle
in one app's ledger and remain `pending` in the other's.

### 2.11 Ownership matrix (database-object ownership)

Ownership = "which application's code actually reads and writes this object, and whose migrations
define it". `TBD` = requires owner decision under the chosen architecture.

| Domain / object group | Defined by | Written by | Read by | Owner |
| --- | --- | --- | --- | --- |
| `auth.users` | Supabase platform | both (sign-up paths) | both | **shared, needs single provisioner** |
| `profiles` | Flutter defines; React alters only | both | both | **CONTESTED → TBD** |
| `listings` (polymorphic) | legacy, pre-baseline | React | React | React |
| `bookings` | legacy (React) vs Flutter `0003` | both | both | **CONTESTED → TBD** |
| `reviews` | legacy (React) vs Flutter `0016` | both | both | **CONTESTED → TBD** |
| `venue_categories` | legacy (React) vs Flutter `0002` | both | both | **CONTESTED → TBD** |
| `user_favorites` | legacy | React | React | React |
| `enquiries` | legacy | React | React | React |
| `media_assets`, `*_publications`, `live_edit_*` | React | React | React | React |
| `venue_*` (blocks, booking events, disputes, settings, seasonal rates, payment intents) | React | React | React | React |
| `service_*` (bookings, field values, providers, tracking, payments, catalog) | React | React | React | React |
| `stay_*` (properties, room types, units, allocations, blocks) | React | React | React | React |
| `pg_*` (invoices, claims, disputes, audit) | React | React | React | React |
| `class_*` (batches, enrollments) | React | React | React | React |
| `platform_*`, `builder_*`, `app_builder_*` | React | React | React | React |
| `business_*` (ownership, members, modules, transfers) | React | React | React | React |
| `india_locations` | React | React | React | React |
| `organizations`, `owner_profiles`, `user_roles` | Flutter | Flutter | Flutter | Flutter |
| `venues`, `venue_images/facilities/operating_hours/blocked_dates`, `time_slots` | Flutter | Flutter | Flutter | Flutter |
| `booking_holds`, `booking_coupons`, `pricing_rules` | Flutter | Flutter | Flutter | Flutter |
| `payments`, `payment_attempts`, `refunds`, `payouts`, `platform_commissions`, `owner_bank_accounts` | Flutter | Flutter | Flutter | Flutter |
| `events`, `event_registrations`, `courses`, `course_batches`, `course_enrollments`, `institutes` | Flutter | Flutter | Flutter | Flutter |
| `support_tickets`, `support_ticket_messages`, `disputes`, `messages` | Flutter | Flutter | Flutter | Flutter |
| `notifications`, `device_tokens`, `favorites` | Flutter | Flutter | Flutter | Flutter |
| `audit_logs`, `audit_logs_archive`, `analytics_events`, `crash_reports`, `webhook_events` | Flutter | Flutter | Flutter | Flutter |
| `coupons` | Flutter | Flutter | Flutter | Flutter |
| buckets `bos-public-media`, `bos-private-documents` | React | React | React | React |
| buckets `venue`, `general` | Flutter | Flutter | Flutter | Flutter |

**Matrix summary:** 4 contested object names, 116 objects with a single unambiguous owner (77 React
name-space + 40 Flutter-only − 1 shared), 2 shared platform objects (`auth.users`, and `profiles`
which is both platform-provisioned and contested).

---

## 3. Runtime architecture

Traced from actual call sites, not from schema comments. React: `.from('…')` across `src/`. Flutter:
`.from('…')` across `lib/`.

### 3.1 React runtime surface — 19 distinct tables

```
profiles 8, listings 8, user_favorites 3, media_assets 3, live_edit_audit_events 3,
user_module_configs 2, stay_room_types 2, stay_properties 2, service_tracking_locations 2,
reviews 2, enquiries 2, bookings 2, stay_units 1, service_tracking_events 1,
service_delivery_profiles 1, service_bookings 1, platform_module_flags 1,
platform_config_versions 1, live_edit_admin_assignments 1
```

React is **listings-centric**: 8 of its 19 runtime tables touch `listings`, whose `entity_type`
discriminates Venue / PG / Class / Service / Stay / Movie. Its `bookings`, `reviews` and
`venue_categories` calls are the legacy pre-baseline trio.

### 3.2 Flutter runtime surface — 14 distinct tables

```
reviews 6, venues 4, notifications 4, bookings 4, support_tickets 3, owner_profiles 3,
favorites 3, event_registrations 2, courses 2, analytics_events 2, venue_categories 1,
time_slots 1, payments 1, audit_logs 1
```

Plus RPC-driven flows: `nearby_venues`, `available_time_slots`, `acquire_booking_hold`,
`confirm_booking`, `register_owner`, `enroll_in_course`, `reconcile_stale_payments`
(28 functions, 41 RLS tables).

Flutter is **venue/organization-centric**: `owner_profiles` → `venues` → `time_slots` →
`booking_holds` → `bookings` → `payments`/`refunds`, with `events`/`courses` as secondary verticals.

### 3.3 Flow-by-flow ownership

| Flow | React implementation | Flutter implementation | Owner |
| --- | --- | --- | --- |
| Authentication | Supabase Auth + Google (`google_sub`), `profiles` upsert | Supabase Auth email/password + phone OTP, `handle_new_user()` trigger → `profiles` | **contested** |
| User profiles | `profiles` + `business_members` + module access | `profiles` (+`locale`,`deleted_at`) + `user_roles` | **contested** |
| Business ownership | `businesses`, `business_members`, `business_invitations`, `business_ownership_transfers`, 5-phase RLS | `organizations` + `owner_profiles` + `org_type` enum | **structurally incompatible** |
| Venue listings | `listings` (entity_type='venue') + `payload jsonb` | `venues` (normalized) + `venue_images/facilities/operating_hours` | **contested** |
| Function halls | `listings` subtype + `venue_seasonal_rates`, `venue_booking_settings` | `venue_category` enum incl. `function_hall`, `marriage_hall` | **duplicated domain** |
| Hotel & PG inventory | `stay_properties`, `stay_room_types`, `stay_units`, `stay_allocations`, `stay_blocks`; `pg_*` financials | **absent** — no hotel/PG tables in the 41 | **React only** |
| Bookings | `bookings` (legacy text-id) + `venue_bookings`, `service_bookings`, `create_booking_atomic` | `bookings` (uuid) + `booking_holds` + GiST exclusion | **contested** |
| Payments | `payment_intents`, `*_payment_intents`, `payment_provider_events`, verified settlement RPCs | `payments`, `payment_attempts`, `webhook_events`, `reconcile_stale_payments()` | **contested, dual ledger** |
| Refunds | `pg_admin_approve_refund`, `refund_service_payment`, `refund_stay_payment` | `refunds` + `trg_refunds_updated_at` | **contested** |
| Reviews | `reviews` (legacy, `listing_id`) | `reviews` (uuid, `venue_id`, rating 1–5 + `reviews_rating_trigger`) | **contested** |
| Documents & storage | `media_assets`, `media_asset_publications`, buckets `bos-*` | buckets `venue`, `general`, direct paths | **separate but unmergeable registry** |
| Notifications | `provider_contact_settings`, contact events (no notification table) | `notifications`, `notifications_archive`, `device_tokens` | **Flutter only** (React lacks parity) |
| Admin operations | `platform_admin_*`, `pg_admin_*`, `live_edit_admin_assignments`, `user_access_audit_events` | `organizations` owner console, `audit_logs`, `support_tickets` | **both, disjoint models** |

### 3.4 Is cross-application sharing *required* or merely *possible*?

The honest answer splits four ways:

1. **User identity — sharing is required.** Both apps authenticate the same humans against
   `auth.users` and both provision `profiles`. If one owner signs into both products, two separate
   databases produce two unrelated user UUIDs for one person, and no Razorpay customer, invoice or
   booking can ever be correlated across apps. **CONFIRMED requirement**, because both apps expose
   Google sign-in and owner registration for the same population.
2. **Physical inventory — sharing is required for correctness.** A marriage hall listed through
   React and booked through Flutter is one physical room. Flutter's double-booking protection is a
   Postgres `EXCLUDE` constraint on `bookings`; React's is `create_booking_atomic`. **Constraints
   cannot span databases.** Two projects ⇒ the same hall can be double-booked with no error anywhere.
   This is the strongest technical argument in Gate J.
3. **Payments — sharing is required for reconciliation.** One Razorpay merchant account, two
   webhook stores, two settlement routines ⇒ a capture can settle in one ledger and stay `pending` in
   the other. Money is not eventually consistent.
4. **Feature verticals — sharing is merely possible.** The verticals are almost disjoint: React owns
   stays/hotels and PG inventory (`stay_*`, `pg_*`), classes (`class_*`), movies
   (`live_edit_cinema_*`) and the platform builder (`platform_*`, `builder_*`); Flutter owns events,
   courses, institutes and notifications (`event*`, `course*`, `institute*`, `notifications`).
   Neither app's vertical tables appear in the other. These could live apart with no correctness
   loss.

**Conclusion:** sharing is required for identity, inventory and payments, and unnecessary for
verticals. Any architecture must therefore be *shared at the core, partitioned at the edges* — which
is exactly what rules out both a naive single-schema merge and a clean two-project split.

---

## 4. Production architecture comparison

### Option A — one shared production Supabase project, both lineages in `public`

Both apps point at one project and both migration histories run against `public`.

| Dimension | Assessment |
| --- | --- |
| Cost | Lowest: one project, ≈$10/mo (Micro, $0.01344/h), one disk allowance (Pro 8 GB, then $0.125/GB), one backup series. |
| Complexity | **Prohibitive.** Four table names collide with incompatible PK types (`bookings.id` text vs uuid), 10 Flutter enums would have to coexist with React's text+CHECK columns, and both `profiles` provisioning conventions would fight over `auth.users`. Requires rewriting one application entirely — a schema migration of the same magnitude as a rebuild. |
| Security | Poor. 187 + 74 policies over one namespace; a policy written for React's `bookings` would silently govern Flutter's rows (or be dropped as a duplicate name). RLS regression risk is highest of all options, and Gate C already documented how easily policy sets in this domain are silently widened. |
| Data consistency | Best possible (single source of truth) — but **unreachable**, because the schema cannot be made to fit without rewriting an app. |
| Migration ownership | Unresolvable by construction: React's critical tables have **no `CREATE TABLE` at all**, so `public` cannot be rebuilt from either lineage, let alone both. |
| Backup & recovery | Simplest: one dump, one restore, one drill (Gate G's command already targets one ref). |
| Operational maintenance | One project to monitor, but every deploy of either app can break the other instantly. |
| Future scalability | Blocked: React's polymorphic `listings` vs Flutter's normalized verticals will keep diverging. |
| Verdict | **REJECTED ON EVIDENCE.** Not a judgement call — §2.3 proves the collision. |

### Option B — separate React and Flutter production projects

| Dimension | Assessment |
| --- | --- |
| Cost | ≈$20/mo (two Micro instances), two disk allowances, two archive sets ≈90–180 MB/30 days, drills ≈$0.64/24 h for both. Still small in absolute terms. |
| Complexity | **Lowest.** Zero reconciliation: each lineage owns its database. React's 81 → project R; Flutter's 16 → project F. Flutter's GiST exclusion constraint keeps working inside F. |
| Security | Clean separation, smallest blast radius per app, independent key rotation and independent anon keys. But **identity is split**, so no cross-app authorisation is possible, and two owner populations must be reconciled out-of-band. |
| Data consistency | **Worst.** No FK, no constraint, no transaction can span the two. The same hall double-books; Razorpay settles in one ledger only; `auth.users` diverges and every cross-app report becomes a data-merge project. |
| Migration ownership | Trivially clear: React owns R, Flutter owns F. No shared ledger to reconcile — the single genuine advantage of B. |
| Backup & recovery | Correct but heavier: **two** series, **two** approved refs, **two** `BOS_PROD_REF_CONFIRM` values, two archive directories that must not be confused, two verification baselines, two drills. The current tooling pins one `BOS_APPROVED_REF` in `supabase/backup/react-target.conf` and would need a reviewed change to a safety-critical file. Restore independence becomes possible (restore one app only) — the main operational benefit. |
| Operational maintenance | Double the surface: two projects, two sets of secrets, two sets of migrations, two deploy pipelines. |
| Future scalability | Each app scales independently; but every future cross-app feature becomes an integration project. |
| Verdict | **VIABLE but correctness-costly.** Technically simplest to build, and it is the only option that needs no reconciliation — but it accepts double-booking and split payments as permanent properties. |

### Option C — one authoritative production project with controlled integration

One Supabase project is authoritative. React's schema keeps `public`. Flutter's 16 migrations are
**explicitly re-homed** into a dedicated schema (e.g. `mobile`), object by object, with the five
`pg_catalog`-only `search_path` declarations preserved — **never** a blind global `public`→`mobile`
substitution. Integration happens through deliberate contracts, not shared tables:

1. **Identity contract** — one `auth.users`, one provisioning trigger. `profiles` keeps React's
   shape; Flutter's extra columns (`locale`, `deleted_at`) are added to it, and Flutter's role model
   maps onto `business_members`/`is_super_admin` via a compatibility view.
2. **Inventory contract** — one booking-authority table (or one `resource_holds` table) that both
   apps write inside their own transaction, so the GiST exclusion constraint governs *physically*
   the same room regardless of which app booked it. This is the single largest piece of new work.
3. **Payment contract** — one settlement ledger with two adapters; `webhook_events` becomes the
   single idempotency store keyed by Razorpay event id, so a capture can never settle twice or
   half-settle.
4. **Vertical isolation** — Flutter-only verticals (events, courses, institutes, notifications)
   and React-only verticals (stays, PG, movies, builder) stay in their own schemas and are never
   joined by cross-schema FKs.

| Dimension | Assessment |
| --- | --- |
| Cost | ≈$10/mo, one project, one backup series, one drill (≈$0.32/24 h) — same as A. |
| Complexity | **Medium-high, once.** Requires re-homing 41 Flutter tables + 10 enums + 28 functions into `mobile`, building the three contracts, and a reviewed migration path. Materially less than A (which needs an app rewrite) and more than B (which needs nothing). |
| Security | Best achievable: one identity graph (no split population), per-schema RLS with explicit grants, `search_path` pinned per function, and the five protected declarations respected. Blast radius is contained by schema boundaries rather than by project boundaries. |
| Data consistency | **Strongest practical.** Single-database transactions and FKs across the core contracts; double-booking prevented physically; payment settlement single-sourced. |
| Migration ownership | Explicit and reviewable: React owns `public` + its legacy pre-baseline tables; Flutter owns `mobile`; contracts are owned jointly and versioned. Requires the pre-baseline base tables (`bookings`, `profiles`, `reviews`, `venue_categories`, `listings`, …) to be **captured as a baseline dump** before any production build — a hard prerequisite (§7). |
| Backup & recovery | One series, one ref confirmation, one drill — the Gate G/F tooling works unreviewed. Single-project restore restores both apps atomically, which is correct given the shared core. |
| Operational maintenance | One project, one set of secrets, one backup regime; two deploy pipelines (already true today). |
| Future scalability | Good: new verticals go into whichever schema owns them; new apps integrate through contracts. |
| Verdict | **RECOMMENDED — see §4.1.** |

### 4.1 Recommendation with evidence

> **Option C.** One authoritative production project, React's schema in `public`, Flutter's schema
> explicitly re-homed into a dedicated schema, and three explicit contracts for identity, inventory
> and payments.

Evidence chain, in order of weight:

1. **Both apps must see one physical inventory** (§3.4.2). Flutter's correctness depends on a
   Postgres `EXCLUDE` constraint; constraints cannot span databases. Option B therefore *guarantees*
   double-bookable halls. That alone disqualifies B for a booking business.
2. **Both apps must see one money ledger** (§3.4.3). Two webhook stores against one Razorpay merchant
   account is a settlement bug waiting to happen, and refunds already exist on both sides.
3. **Both apps must see one identity** (§3.4.1). One person, one `auth.users` row — otherwise nothing
   correlates across apps.
4. **Option A is impossible, not merely unattractive** (§2.3): `bookings.id` is `text` in React's live
   schema and `uuid` in Flutter's, on the same table name. Four such collisions exist.
5. **Vertical partitioning is safe** (§3.4.4): events/courses/notifications and stays/PG/movies share
   nothing, so they can live apart inside one project at no cost.
6. **Cost is not the differentiator** ($10 vs $20/mo); **recovery is**. C keeps one backup series and
   one drill, which is the property Gates F–I spent four passes validating.

The recommendation is conditional on the §7 prerequisite (a captured pre-baseline schema dump) and on
owner confirmation of D1/D2. **Nothing was provisioned, created, migrated or deployed.**

---

## 5. Production provisioning readiness

Note: the brief numbers this "Phase 5" but the section sequence in §1–§9 follows Phase 1–5 + deliverable.

### 5.1 Has production ever been provisioned? — NO (six negatives, re-confirmed)

| Probe | Result | Label |
| --- | --- | --- |
| Connected organizations | `Babu` (`xmdplhsezwoxmoxkciow`), `ap-south-1` (`qecpaywxwprftaaminzf`, empty) | CONFIRMED |
| Existing projects | exactly two: `obkfgxjzlscungkhbyvq` (dev, Mumbai, 2026-11-04) and `ezrxykyocgbolpaebnqx` (legacy dev, Stockholm, 2026-10-30) | CONFIRMED |
| Deployment configuration | `deploy/env.production.example` = `__PRODUCTION_SUPABASE_PROJECT_REF__` placeholder; `deploy/native/*` = `<production-project-ref>`; `build-production.sh` fails closed | CONFIRMED |
| Environment templates | React: 8 `.env*` files, none containing a production ref. Flutter: `.env.example` + 3 `.env.*.example` with `prod-project-ref` placeholder; no live env file | CONFIRMED |
| Production secrets (presence only) | Keychain `bos-production-backup` **PRESENT**, `bookourspace-react-db` **PRESENT** — both are the **development** project's pooler credentials (Gate G/H); the name does not make them production. No distinct production secret exists | CONFIRMED (presence only; no value read) |
| Existing backups | 8 × PHYSICAL COMPLETED, all on `obkfgxjzlscungkhbyvq`, 2026-11-17 → 2026-11-24 | CONFIRMED |
| Application startup guards | React: requires `BOS_PRODUCTION_SUPABASE_PROJECT_ID`, never falls back to dev. Flutter: throws `ConfigurationException` on missing URL/anon key | CONFIRMED |
| DNS / hosting | no production hostname anywhere. `com.bookourspace.app` is an Android/iOS **bundle id**, not a domain. Cloud Run's `verify-deployment-config.py` explicitly asserts *"no assumed Cloud Run hostname in configs"* and *"service.yaml hard-codes no Supabase project host"*. Flutter has `web/` but no `firebase.json`/`.firebaserc` | CONFIRMED |

**CONFIRMED: production has never been provisioned.** No project, no ref, no secret, no deployment,
no hostname, no backup.

### 5.2 Provisioning readiness gaps

| # | Gap | Severity | Why it blocks |
| --- | --- | --- | --- |
| J1 | **React schema is not reproducible from migrations** — `bookings`, `profiles`, `reviews`, `venue_categories`, `listings`, `user_favorites`, `enquiries`, `user_module_configs` have no `CREATE TABLE` in the 81 files | **Critical** | A fresh project built from `supabase db push` would be missing React's core tables. Production build needs a captured baseline (`pg_dump --schema-only`) from the dev project, approved as A1-class evidence. |
| J2 | 8 pending migrations (73 applied / 8 not) | High | Production must start from the reconciled 81, not from 73. |
| J3 | Flutter's applied state unknown (never run against any reachable project) | High | Its 16 migrations have no ledger record anywhere accessible. |
| J4 | 4 table-name collisions unresolved | High | Requires the Option C re-homing decision (D2). |
| J5 | Decryption never exercised (Gate I) | **Critical** | A production backup set that cannot be decrypted is not a recovery plan. |
| J6 | Plan tier: paid, most likely Pro (8 daily backups, 7-day retention) | Medium | Physical backups + clone require a paid plan on the **production** project too. |
| J7 | Disk 99 % used, 9.6 GiB free | Medium | Baseline dumps + archives need ≈2.2 GiB headroom per Gate G. |
| J8 | Region must be Mumbai (`ap-south-1`) to match dev | Low | Clone/restore requires same-region source and target. |

---

## 6. Integration contracts required by Option C

Option C is only safe if these three contracts exist. They are the design work that replaces
Option A's impossible merge and Option B's impossible cross-project integrity. **None is
implemented**; this section defines what would have to be built and approved.

### 6.1 Identity contract

One `auth.users` table, **one** profile-provisioning trigger. React's `profiles` shape stays
canonical; Flutter's `locale` and `deleted_at` are added as nullable columns, and Flutter's
`user_roles` + `user_role` enum are exposed to Flutter through a compatibility view that maps
`organization` ownership onto React's `businesses`/`business_members`. Rationale: two provisioning
conventions on one `auth.users` would race on every sign-up and could produce rows that satisfy one
app's policies and violate the other's. Requirement: exactly one of
`handle_new_user()` (Flutter) or React's profile-upsert path survives, and the other becomes a thin
caller.

### 6.2 Inventory / booking-authority contract — **largest work item**

A single table holds the authoritative claim on a physical space and time range for *all* bookings,
regardless of originating app. React's `bookings` (`id text`) and Flutter's `bookings`
(`id uuid` + `bookings_no_overlap` GiST exclusion) cannot both be authoritative, and an `EXCLUDE`
constraint cannot span two tables any more than it can span two databases. Options inside the
contract:

- **(i) Promote one table.** Flutter's normalised `bookings` becomes authoritative in the `mobile`
  schema; React writes through a contract function and keeps a projection view named `bookings` for
  its existing 2 runtime call sites.
- **(ii) Introduce `resource_holds`.** A new narrow table (resource id, time range, holder app,
  booking id, GiST exclusion) written by both apps inside their own transactions; each app keeps its
  own detail table.

Option (ii) is less invasive to both codebases and keeps each app's detail schema intact; option (i)
is simpler to reason about. **The choice is an owner decision, not a Gate J conclusion.** Either way
the acceptance test is the same: a hall booked through React must make the same slot unavailable
through Flutter, atomically, with both apps seeing a conflict error.

### 6.3 Payment settlement contract

One settlement ledger, one idempotency store keyed by Razorpay event id, two adapters. Today React
has `payment_provider_events` + `settle_*_verified_payment` and Flutter has `webhook_events` +
`reconcile_stale_payments()`; the contract collapses these into one event table plus per-app
projections, so a capture cannot settle in one ledger and stay pending in the other. Acceptance
test: replaying a Razorpay webhook twice settles exactly once; a refund issued from either app is
visible as the same refund from the other.

### 6.4 What must NOT be done

- No blind global `public` → `mobile` replacement of Flutter's migrations (standing rule).
- No `search_path` rewrite of the five `pg_catalog`-only declarations.
- No migration of Flutter's 10 enums into React's text+`CHECK` columns without an explicit, tested
  value mapping.
- No policy set applied twice under colliding names (§2.5).

---

## 7. Provisioning runbook — PREPARED, NOT EXECUTED

Nothing below was run. Every step is owner-gated. No command here creates a project, applies a
migration or deploys.

**Step 0 — preconditions (all owner decisions, §7).** D1 answered; D2 architecture chosen (Gate J
recommends C); A1-class approval for the *baseline dump* of the dev project; A3 approval for the 8
pending migrations.

**Step 1 — capture the missing baseline (J1).** Read-only `pg_dump --schema-only` of
`obkfgxjzlscungkhbyvq` into the encrypted backup root, using the existing Gate G pattern
(`BOS_BACKUP_AUTHORIZED=backup-only`, `BOS_PROD_REF_CONFIRM=obkfgxjzlscungkhbyvq`, canonical
recipient `E18BA34DE55EEEDA266D35B4B151F3EB267A8E5A`, keyring
`~/.config/bookourspace/backup-gnupg-recovery-20261106`). Verify with
`verify_backup_archive.sh <dir> obkfgxjzlscungkhbyvq --max-age-hours 24`. Requires disk headroom
(J7) and a working decrypt path (J5) before the archive can be trusted.

**Step 2 — provision.** Create one project in org `Babu`, region **South Asia (Mumbai)**, paid plan
(so PHYSICAL backups and clone are available). Record the ref as `BOS_PRODUCTION_SUPABASE_PROJECT_ID`
in the deploy environment — never commit it, never reuse a dev ref.

**Step 3 — schema build, in this order.**
1. `pg_restore --schema-only` from Step 1's archive (restores React's legacy base tables).
2. Apply React's 81 migrations in timestamp order (including the 8 pending) so the ledger matches.
3. Apply Flutter's 16 migrations re-homed into the `mobile` schema, object by object, preserving the
   five `pg_catalog`-only `search_path` declarations.
4. Build the three Option C contracts (identity, inventory/booking authority, payment settlement).

**Step 4 — auth and storage configuration.** Site URL = the eventual production origin; exact
redirects `https://<production-web-origin>/auth/callback` and `com.bookourspace.app://auth/callback`
(React/Capacitor); Flutter's build-time URL pointed at the same ref. Buckets `bos-public-media`,
`bos-private-documents`, `venue`, `general` with their respective policies.

**Step 5 — verification (read-only).** Compare against Gate E's census: 74 public tables, 179 public
functions, 18 private functions, 141 policies, 3 private buckets, 7 storage policies, plus the
`mobile` schema's 41 tables / 28 functions / 74 policies. Reconcile every difference explicitly —
React's lineage declares 77 `CREATE TABLE` against 74 live tables, and that 3-table discrepancy is
still unexplained.

**Step 6 — recovery readiness.** Confirm backups now exist on the new ref, then re-run Gate G's
clone-and-restore rehearsal (`supabase/tests/run_backup_recovery_drill.sh`,
`scripts/verify_backup_restore.sh <dir>`) before declaring production recoverable. Decryption (J5)
must pass first.

**Step 7 — deploy.** Only after Steps 1–6, only with explicit deployment approval. React's
`deploy/native/build-production.sh` and `deploy/cloudrun/verify-deployment-config.py` already fail
closed on a missing or mismatched ref, so they will refuse until Step 2 is genuinely done.

---

## 8. Remaining owner decisions

| # | Decision | Status | Blocks |
| --- | --- | --- | --- |
| **D1** | Production project ref, region, and whether one should be provisioned at all | **AWAITING OWNER** | All provisioning |
| **D2** | Architecture: A (shared naive) / B (separate) / **C (recommended)** | **AWAITING OWNER** | Schema re-homing, contracts |
| **A1** | Execute a backup / baseline dump | **NOT APPROVED** | Step 1 |
| **A2** | Restore rehearsal | **NOT APPROVED** | Step 6 |
| **A3** | Apply the 8 pending migrations | **NOT APPROVED** | Step 3.2 |
| **A4** | Paid clone for drill (≈$0.32/24 h) | **NOT APPROVED** | Step 6 |
| **A5** | Flutter schema re-homing into a dedicated schema | **NOT APPROVED** | Step 3.3, Option C |
| **A6** | Deployment | **NOT APPROVED** | Step 7 |
| **D5** | Canonical Flutter repo + owner of `zykxneztahxbjduagutv` + Flutter production ref | **AWAITING OWNER** | Flutter mapping |
| **D6** | Interactive GPG decryption test | **AWAITING OWNER** | Step 6 |
| **J9** | Explain the 3-table gap (77 declared vs 74 live) | **AWAITING OWNER** | Step 5 |

---

## 9. GO/NO-GO verdict

### GO
- **Reconciliation analysis:** GO — the two lineages are now fully characterised: 1 shared table
  name, 4 runtime collisions with incompatible PK types, 0 shared functions, 0 shared triggers,
  10 Flutter-only enums, 116 single-owner objects.
- **Architecture recommendation:** GO — Option C is recommended with evidence (§4.1).
- **Read-only inspection of both repositories:** GO — both trees preserved, Flutter clean,
  React's pre-existing change intact.
- **Read-only database inspection:** GO — `information_schema` queried inside
  `begin read only; … rollback;`; nothing written.

### NO-GO
- **Production provisioning:** NO-GO. It has never happened (§5.1), and Step 1 is impossible to skip
  because **React's core schema cannot be rebuilt from its migrations** (J1).
- **Option A:** NO-GO on evidence — the schema literally cannot hold both lineages (§2.3).
- **Option B:** NO-GO as a recommendation — it accepts permanent double-booking and split payments,
  because constraints and ledgers cannot span projects (§3.4).
- **Migration readiness:** NO-GO — 73/81 applied, 8 pending, Flutter state unknown, 3-table
  discrepancy unexplained.
- **Recovery readiness:** NO-GO — decryption still unverified (J5).
- **Any write of any kind:** NO-GO — nothing was created, migrated, deployed or approved.

### The short version

The two applications are **not two views of one database** — they are two separate products that
happen to use the same nouns. React is a polymorphic JSONB marketplace (`listings` + `payload`,
`id text`); Flutter is a normalised venue-rental system (`organizations` → `venues` → `bookings`,
`id uuid`, GiST exclusion). Four table names collide with different primary-key types; nothing else
is shared at all.

That makes a naive merged database impossible and a two-project split *unsafe* for a booking business,
because neither a unique constraint nor a settlement ledger can span two databases. The only design
that is both buildable and correct is **one authoritative project with Flutter re-homed into its own
schema behind explicit identity/inventory/payment contracts** — Option C — and it cannot start until
someone captures the pre-baseline schema that React's 81 migrations never contained.

### Recommended next actions, in order

1. Owner answers **D2** = C (or rejects it with reasons), and **D1** = provision a new Mumbai project
   vs. adopt an existing one.
2. Owner approves **A1** for the *read-only schema baseline dump* of `obkfgxjzlscungkhbyvq` — the
   missing piece that makes a production build possible at all.
3. Owner runs the interactive GPG test (D6) so the baseline archive can actually be read back.
4. Owner explains **J9** (77 declared vs 74 live tables) before any schema build is attempted.
