# BookOurSpace — Canonical Database Blueprint

**Status: PROPOSED SPECIFICATION. NOT EXECUTED. NOTHING IN THIS DOCUMENT HAS BEEN APPLIED.**

| | |
| --- | --- |
| Date | 2026-11-24 |
| Companion | `SUPABASE_RECOVERY_GATE_K_CANONICAL_SCHEMA_DESIGN.md` |
| Target | Option C — one authoritative Supabase project, separate application schemas, three shared contracts |
| Gate | Architecture and evidence only (Gate K). No project, no migration, no schema was created. |

Every SQL block below is a **sketch for review**, not a script to paste. Identifiers, types and
predicates require the owner decisions listed in §11 before any of it is written.

---

## 1. Design principles

1. **Never rewrite React's `public` schema.** 74 tables, 182 functions, 141 policies, 116 pinned
   `SECURITY DEFINER` search paths and 12 legacy triggers stay exactly as they are. No PK changes, no
   column retypes, no renames.
2. **Flutter gets its own schema**, not its own project and not React's namespace.
3. **Share only what must be shared** — identity, physical booking claims, settlement events. Three
   tables, nothing else.
4. **No blind `public` → `mobile` replacement.** Each of Flutter's 41 tables is re-homed individually
   with a reviewed mapping (§5).
5. **No cross-schema foreign keys.** Type mismatches (`text` vs `uuid`) make them impossible and RLS
   bypass makes them dangerous; contracts use discriminated `text` keys instead.
6. **Additive, reversible.** Every step has a documented reverse; no step depends on destroying data.

---

## 2. Target schema layout

| Schema | Contents | Owners | Exposure |
| --- | --- | --- | --- |
| `public` | React: 74 tables + `public_provider_profiles` view, 182 functions, 187 policies | React | `authenticated`, `anon` (per existing policies) |
| `mobile` | Flutter re-homed: 41 tables, 10 enums, 47 indexes, 28 functions, 74 policies | Flutter | `authenticated` only |
| `core` | The three contracts: identity view, resource claims, payment events | **joint** | `authenticated` (SELECT/RPC only) |
| `private` | Existing rate-limit windows + 18 internal functions; new internal helpers | platform | **no** external grants |
| `storage` | Buckets + object policies (author DDL — currently missing for Flutter) | joint | per policy |

Schema creation order: `core` → `mobile` → grants → contracts → backfill. `public` is untouched
throughout.

---

## 3. Grants and search-path policy

```sql
-- SKETCH — NOT EXECUTED
create schema if not exists core;
create schema if not exists mobile;

revoke all on schema core   from public, anon;
revoke all on schema mobile from public, anon;
revoke all on schema private from public, anon;   -- verification step, private already exists

grant usage on schema core   to authenticated;
grant usage on schema mobile to authenticated;
```

**Search-path rules (non-negotiable):**

- The **116 existing pinned `search_path` declarations must not be edited**. Two patterns exist today
  (`pg_catalog, auth, storage, public, pg_temp` and `pg_catalog, public, storage, auth`); both put
  `pg_catalog` first, which is correct.
- **New `mobile` and `core` functions** must declare
  `set search_path = pg_catalog, auth, storage, mobile, core, pg_temp` — never a bare or caller-derived path.
- The one function with exactly `search_path=pg_catalog` (`rls_auto_enable`) stays as is.
- Any function that needs `public` must name it explicitly rather than relying on a default.

---

## 4. Contract 1 — Identity

**Goal:** one `auth.users`, one `profiles` row, one role truth.

```sql
-- SKETCH — NOT EXECUTED

-- Flutter reads profiles through a view; it does not own a profiles table.
create or replace view mobile.profiles
with (security_invoker = true) as
select p.id,
       p.full_name,
       p.phone,
       p.email,
       p.avatar_url,
       coalesce(p.city, null) as city,
       p.created_at,
       p.updated_at
from public.profiles p;

grant select on mobile.profiles to authenticated;

-- Flutter's role vocabulary, seeded one-way from React's role truth.
create table if not exists mobile.user_roles (
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     mobile.user_role not null,
  org_id   uuid references mobile.organizations(id) on delete cascade,
  primary key (user_id, role, org_id)
);

-- Explicit, exhaustive mapping. Unmapped source roles must FAIL, not default.
create or replace function core.react_role_to_mobile(p_role text, p_super boolean)
returns mobile.user_role
language sql immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_super then 'super_administrator'::mobile.user_role
    when p_role = 'customer' then 'customer'::mobile.user_role
    when p_role = 'provider' then 'venue_owner'::mobile.user_role
    when p_role = 'admin'    then 'administrator'::mobile.user_role
    else null
  end
$$;
```

**Retire Flutter's provisioner.** `trg_on_auth_user_created` / `handle_new_user()` must be dropped in
the re-homed lineage; React's provisioning path remains the only writer of new `profiles` rows.

**Owner decision required:** Flutter's `institute_owner`, `event_organizer`, `support_agent` have no
React counterpart. Either React's `profiles.role` CHECK is widened (a change to a live constraint —
needs explicit approval) or those roles live only in `mobile.user_roles`. **Recommended:** the latter,
keeping `public.profiles` untouched.

---

## 5. Contract 2 — Booking authority

**Goal:** a physical space can be claimed once, regardless of which app booked it.

```sql
-- SKETCH — NOT EXECUTED
create extension if not exists btree_gist;
create extension if not exists postgis;   -- Flutter already implies both; neither is declared

create table core.resource_claim (
  claim_id      text primary key,                    -- app-scoped id, stringified
  app           text not null check (app in ('react','mobile')),
  resource_kind text not null check (resource_kind in ('venue','listing','stay_unit','screen_seat')),
  resource_id   text not null,                       -- text: public PKs are text, mobile PKs are uuid
  period        tstzrange not null,
  status        text not null check (status in ('held','pending','confirmed','cancelled','expired')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint resource_claim_no_overlap
    exclude using gist (resource_kind with =, resource_id with =, period with &&)
    where (status in ('held','pending','confirmed'))
);

create index core_claim_resource_period on core.resource_claim (resource_kind, resource_id, period);
create index core_claim_app on core.resource_claim (app, claim_id);
```

**Wiring (both sides additive, no PK change):**

- React: an `AFTER INSERT OR UPDATE OF status, check_in, check_out` trigger on `public.bookings`
  maintains a claim row keyed `resource_kind='listing'`, `resource_id = listing_id`,
  `period = tstzrange(check_in, check_out + 1, '[)')`, `app='react'`, `claim_id = id::text`.
  React rows without `check_in`/`check_out` (timed venue bookings) use
  `scheduled_date + scheduled_time` to build the range.
- Flutter: the equivalent trigger on `mobile.bookings` keyed `resource_kind='venue'`,
  `resource_id = venue_id::text`, `app='mobile'`, `claim_id = id::text`. `bookings_no_overlap` stays
  in place for intra-Flutter correctness.
- Both triggers run in the writer's transaction, so a conflict aborts the booking atomically.

**Acceptance test:** book a hall through React for 2026-12-01 10:00–14:00; attempt the same venue and
window through Flutter; the second must fail with a mapped conflict error, not a silent success.

**Owner decision required:** `resource_kind` mapping between React's polymorphic `listings`
(Venue / PG / Class / Service / Stay / Movie) and Flutter's normalised verticals. Only `venue` is
shared today; stays/PG/movies are React-only and need no claim at all.

---

## 6. Contract 3 — Payment settlement

**Goal:** one Razorpay merchant, one idempotency decision, two app projections.

```sql
-- SKETCH — NOT EXECUTED
create table core.payment_event (
  provider           text not null check (provider in ('razorpay','upi','offline')),
  provider_event_id  text not null,
  kind               text not null check (kind in ('capture','refund','payout','claim','verification')),
  booking_ref        text not null,                  -- text: spans both PK types
  app                text not null check (app in ('react','mobile')),
  amount_paise       bigint not null check (amount_paise >= 0),
  status             text not null check (status in ('received','settled','failed','reversed')),
  payload_digest     text not null,                  -- hash only; no raw customer data
  received_at        timestamptz not null default now(),

  primary key (provider, provider_event_id)
);

create index core_payment_event_booking on core.payment_event (booking_ref, kind);
```

Both apps' webhook handlers record into `core.payment_event` first. An `ON CONFLICT DO NOTHING` on the
primary key is the whole idempotency story: if the row exists, the event was already processed and the
handler returns without touching either app's ledger. React's `payment_provider_events` and Flutter's
`webhook_events` remain as app-local detail projections.

**Acceptance test:** deliver one Razorpay `capture` webhook twice; exactly one settlement row, one
ledger transition. Issue a refund in React; confirm Flutter sees the same `core.payment_event` row.

---

## 7. Flutter re-homing plan

Every table moves `public` → `mobile`, one by one, with the policies that reference it. **No global
text substitution.** Grouped for review:

| Group | Tables | Notes |
| --- | --- | --- |
| Tenancy | `organizations`, `owner_profiles`, `user_roles` | `org_id` FKs stay inside `mobile` |
| Venues | `venues`, `venue_categories`, `venue_images`, `venue_facilities`, `venue_operating_hours`, `venue_blocked_dates`, `time_slots` | `venues.category_id` → `mobile.venue_categories` (uuid) |
| Booking | `bookings`, `booking_holds`, `booking_coupons` | keeps `bookings_no_overlap`; adds `core.resource_claim` trigger |
| Payments | `payments`, `payment_attempts`, `refunds`, `payouts`, `platform_commissions`, `owner_bank_accounts`, `pricing_rules`, `webhook_events` | adds `core.payment_event` writer |
| Engagement | `favorites`, `reviews`, `notifications`, `notifications_archive`, `device_tokens` | `reviews` keeps its rating trigger |
| Events/courses | `events`, `event_registrations`, `courses`, `course_batches`, `course_enrollments`, `institutes` | Flutter-only verticals |
| Support | `support_tickets`, `support_ticket_messages`, `disputes`, `messages`, `coupons` | — |
| Ops | `audit_logs`, `audit_logs_archive`, `analytics_events`, `crash_reports` | — |
| Identity | `profiles` | **becomes the `mobile.profiles` view of §4 — not a table** |

Per-table checklist: (1) `CREATE TABLE mobile.<t>` with identical columns/constraints, (2) recreate
indexes and the GiST exclusion, (3) recreate policies with `on mobile.<t>`, (4) rewrite function bodies
that name `public.<t>` to `mobile.<t>`, (5) verify no `public.<t>` reference remains, (6) only then drop
the `public` copy *if it was ever created* — in production it never will be.

**Standing rule honoured:** the five `pg_catalog`-only `search_path` declarations in the React lineage
are not touched by this plan; `mobile` functions receive their own pinned paths (§3).

---

## 8. Collision resolutions (summary)

| Collision | React | Flutter | Resolution | React change |
| --- | --- | --- | --- | --- |
| `bookings` | `public.bookings`, `id text` | `mobile.bookings`, `id uuid` | separate + `core.resource_claim` | **none** |
| `reviews` | `public.reviews`, `id text`, payload aggregate | `mobile.reviews`, `id uuid`, rating trigger | separate | **none** |
| `profiles` | `public.profiles`, 15 cols, role text | view over it | one table + view | **none** |
| `venue_categories` | `public.venue_categories`, `category_id text` | `mobile.venue_categories`, `id uuid` | separate; optional `core` bridge table | **none** |
| `notifications` | `public.notifications`, `recipient_user_id` | `mobile.notifications`, `user_id` | separate (leak prevention) | **none** |

Enums: all 10 stay in `mobile`. React's text+CHECK columns are untouched; no value migration.

---

## 9. Storage, extensions and auth — the missing DDL

### 9.1 Extensions (currently absent from both lineages)

```sql
-- SKETCH — NOT EXECUTED
create extension if not exists btree_gist;   -- required by Flutter's EXCLUDE and core.resource_claim
create extension if not exists postgis;      -- required by venues.geog
create extension if not exists pgcrypto;     -- gen_random_uuid() is used throughout
```

### 9.2 Storage buckets

React declares `bos-public-media` and `bos-private-documents` in its migrations. **Flutter declares
nothing.** Before provisioning, the following must be authored with explicit policies:

```sql
-- SKETCH — NOT EXECUTED (shape only; policy predicates require a security review)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue',    'venue',    false, 10485760, array['image/jpeg','image/png','image/webp']),
       ('general',  'general',  false, 10485760, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;
```

Rule: **`public` must be `false`** for both. A public Flutter bucket would expose every uploaded
venue document. Object policies must pin the owning `org_id`/`auth.uid()` path prefix.

### 9.3 Auth configuration (not expressible in SQL)

Must be applied deliberately and recorded in the runbook: site URL, exact redirects
(`https://<production-origin>/auth/callback`, `com.bookourspace.app://auth/callback`, Flutter's
build-time URL), Google provider credentials, phone OTP provider, and email templates. Flutter's
`supabase_phone_otp_provider.dart` expects a *dev* project (`zykxneztahxbjduagutv`, outside this
account) to be configured — that dependency must be re-pointed, not inherited.

---

## 10. Verification queries (read-only, to run after any build)

```sql
-- object census; expected: public 74 + core 3 + mobile 41 (base tables), 1 view in public
select n.nspname, count(*) filter (where c.relkind='r') as tables,
       count(*) filter (where c.relkind='v') as views
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','mobile','core') group by 1 order by 1;

-- definer safety; expected: 0 rows
select proname from pg_proc
where pronamespace in ('public'::regnamespace,'mobile'::regnamespace,'core'::regnamespace)
  and prosecdef and proconfig is null;

-- exclusion constraints present; expected: bookings_no_overlap + resource_claim_no_overlap
select conrelid::regclass::text, conname from pg_constraint where contype='x';

-- RLS coverage; expected: 0 unprotected base tables in mobile/core
select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('mobile','core') and c.relkind='r' and not c.relrowsecurity;

-- no cross-schema FKs into public; expected: 0 rows
select conname from pg_constraint
where contype='f' and connamespace in ('mobile'::regnamespace,'core'::regnamespace)
  and confrelid::regclass::text like 'public.%';
```

---

## 11. Owner decisions this blueprint depends on

| # | Decision | Blocks |
| --- | --- | --- |
| D2 | Adopt Option C (this blueprint) | everything |
| K1 | Flutter role mapping: keep extended roles in `mobile.user_roles` (recommended) vs widen `public.profiles.role` CHECK | §4 |
| K2 | `resource_kind` mapping for React's polymorphic listings | §5 |
| K3 | Migrate the 8 dev users or start production with none | §9.3 |
| K4 | Storage bucket names/policies for Flutter (`venue`, `general` proposed) | §9.2 |
| K5 | Seed/demo content: excluded from production? | reproducibility matrix |
| A1/A3/A5 | Dump, pending migrations, re-homing implementation | sequence |

---

## 12. Non-goals and prohibited actions

- No `public` → `mobile` global substitution, anywhere, ever.
- No PK type change on `bookings`/`reviews` (text → uuid or back).
- No merged `profiles`/`notifications`/`reviews` tables.
- No enum migration into React's text+CHECK columns.
- No cross-schema FKs into `public`.
- No mobile grants on `public.payload` or on the `private` schema.
- No edit to the 116 pinned `search_path` declarations.
- No bucket created with `public = true`.

---

## 13. Implementation order (when approved)

1. Dump + decrypt + verify (A1, D6).
2. Apply the 8 pending migrations to dev (A3) → 81/81, 17 tables appear.
3. Rebuild a throwaway database from dump + migrations; diff against dev; **stop on any diff**.
4. Author extension + storage DDL (§9.1, §9.2).
5. Choose one profile provisioner; write and test the role mapping (§4).
6. Create `core`, then `mobile`; re-home Flutter per §7 with per-object review.
7. Wire the three contracts; run the acceptance tests in §5 and §6.
8. Provision production (Mumbai, paid plan), build schema dump-first, apply 81, create `mobile`/`core`.
9. Configure auth + storage; verify with §10.
10. Clone-and-restore drill; only then declare production recoverable.

**Nothing in this document has been executed. No project exists. No migration has run.**
