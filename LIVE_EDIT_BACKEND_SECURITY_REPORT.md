# Live Edit Production Hardening — PASS/FAIL/BLOCKED

**Worktree:** `/Users/aa/Downloads/bookourspace-react`
**Date:** 2026-11-05 (Asia/Calcutta)
**Database:** disposable PostgreSQL 17.11 cluster (baseline + 37 migrations)
**Hosted Supabase `obkfgxjzlscungkhbyvq`:** untouched — no migration, push, merge or deployment.

| # | Requirement | Status |
|---|---|---|
| 1 | Cinema screen writes moved from JSON to transactional PostgreSQL | **PASS** |
| 2 | Cinema concurrency protection and durable audit | **PASS** |
| 3 | Secure, verified cinema ownership assignment | **PASS (mechanism)** · **BLOCKED (hosted owner rows not seeded)** |
| 4 | Unassigned providers fail closed | **PASS** |
| 5 | All six modules use server-verified permissions + PostgreSQL + audit | **PASS** |
| 6 | JSON fallback disabled for production Live Edit | **PASS (PostgreSQL/Live Edit paths)** · **BLOCKED (legacy non-production listing fallback remains)** |
| 7 | Cross-provider, assignments, Super Admin, concurrency, rollback, RLS tests | **PASS** |
| 8 | Lint, build and database/security tests | **PASS** |

No booking or payment code was changed. The six-module UI is preserved.

---

## 1. Cinema screens are now PostgreSQL-authoritative

The baseline already had `public.cinema_screens`, but it was unused by the write
path and had a broad “any active provider/admin can manage every screen” RLS
policy. The new migration **extends that table** (it does not create a second
source of truth):

- adds `fnb_delivery_enabled`, `seat_tiers`, `row_version`;
- seeds the five discovery screens once (`ON CONFLICT DO NOTHING`);
- replaces the broad policy with owner/assignment policies:
  - public `SELECT`;
  - `INSERT`/`UPDATE` only when `public.live_edit_cinema_actor_can_edit(id, cinema_listing_id)`;
- adds `guard_cinema_screen_write` (field bounds, showtime/tier/wheelchair validation,
  provider listing immutability, role/owner/assignment checks, `row_version` increment);
- adds `capture_cinema_screen_audit` (`cinema_screen.create` / `cinema_screen.update`,
  changed-field paths and before/after snapshots) in the **same transaction**;
- adds an owner-table guard/audit trigger and a `screen_id` foreign key.

`PUT /api/movies/screens` no longer loads or writes the JSON store. It:

1. authenticates the signed session;
2. resolves the canonical screen from PostgreSQL;
3. rejects provider creation of unknown screens;
4. rejects `screenId`/`listingId` target mismatch;
5. validates names, formats, showtimes, cutoff, refund, fees, GST, F&B,
   wheelchair seats, total seats, cancellation flag and 1–10 seat tiers;
6. executes `ProviderListingRepository.saveCinemaScreen` with a row lock and
   `expectedUpdatedAt` check;
7. returns `auditEventId` only after the DB update and audit trigger commit.

`GET /api/movies/inventory` now reads the same PostgreSQL rows, so the customer
UI, Live Edit verification and the database cannot diverge.

### Ownership assignment

`POST /api/movies/screens/:screenId/owner` is Super-Admin-only:

- the repository performs a fresh `is_current_user_super_admin()` check;
- the screen must exist;
- the owner must be an **active provider** profile;
- `listing_id` is derived from the screen row, not trusted from the caller;
- assignment/revocation is written to `live_edit_cinema_screen_owners`;
- a trigger audits `cinema_screen.owner_assigned` / `owner_revoked`;
- revocation takes effect on the next request (no cached authority).

Seeded screens have **no owner**, so providers are fail-closed until a Super
Admin assigns ownership. Admins assigned to the Movies module can still edit
their assigned screens; other providers/admins cannot.

---

## 2. Server + database enforcement (all six modules)

| Module | Persistence | Permission source | Audit |
|---|---|---|---|
| PGs/Hostels | `public.listings` | session profile + ownership / assignment / Super Admin | listing trigger |
| Classes | `public.listings` | same | listing trigger |
| Venues | `public.listings` | same | listing trigger |
| Services | `public.listings` | same | listing trigger |
| Hotels/Stays | `public.listings` | same | listing trigger |
| Movies | `public.cinema_screens` | owner row / Movies assignment / fresh Super Admin | cinema trigger |

Listing endpoints keep the earlier hardening:

- Admin module/category/listing assignments enforced by repository + RLS-facing
  `live_edit_admin_can_edit` + DB guard;
- provider owner identity checked against `auth.uid()` / `owner_id`;
- fresh Super Admin for verification/featured/moderation;
- publication only through review/GUC transition;
- server validation for price, images, facilities, availability, module details;
- append-only, attributable audit in the same transaction.

Cinema endpoints use the same model with `live_edit_cinema_actor_can_edit`.

### Protected fields

- `status` publication: provider 403; non-super admin 409 unless reviewed route;
  Super Admin allowed.
- `is_verified`/`verified_at`/`verified_by`: Super Admin only.
- `is_featured`: Super Admin only (provider input ignored as before; direct SQL blocked).
- `provider_availability_status`: API Super Admin only; direct SQL owner-reported update preserved.
- `owner_id`: Super Admin only for changes.

---

## 3. Concurrency, rollback and read-after-write

- Listing PATCH: `expectedUpdatedAt` + `SELECT … FOR UPDATE`; two concurrent writes
  produce exactly one 200 and one **409 `CONCURRENT_MODIFICATION`**.
- Cinema PUT: row lock + `expectedUpdatedAt` + `row_version`; tested with two
  concurrent same-version updates → one 200, one 409; persisted row_version advances.
- Client sends `expectedUpdatedAt` from the inventory `updatedAt`.
- The frontend re-reads inventory after save and only reports success when the
  server returns `auditEventId`.
- Audit-failure rollback:
  - listing trigger failure aborts the listing transaction;
  - cinema trigger failure aborts the screen transaction and leaves
    `refund_percent`/`row_version` unchanged;
  - no audit row is committed in either case.

---

## 4. JSON fallback and production guard

- `PUT /api/movies/screens` returns **503 `LIVE_EDIT_SECURITY_UNAVAILABLE`** when
  no PostgreSQL repository is configured; there is no JSON cinema write path.
- The Live Edit client still refuses any listing source other than `postgres`.
- The server's existing production guard throws
  `AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION` before startup; this work does
  not weaken or bypass that policy.
- The legacy JSON provider-listing PATCH/POST/DELETE routes still exist for
  non-production local compatibility. They have no DB assignments/audit and are
  **BLOCKED for Live Edit**; they are not reachable through the Live Edit client.
- Fallback protected fields now require a signed Super Admin scope; provider
  self-feature/verification is ignored.

---

## 5. Automated evidence

### Disposable PostgreSQL security suite

```bash
bash supabase/tests/run_live_edit_security.sh
```

**PASS — 19 tests / 19 pass, 0 fail** (PostgreSQL 17.11; baseline + 37 migrations):

```
forged roles are rejected by the database profile check
cross-provider editing is denied and RLS hides the row
unassigned admins are denied on HTTP and direct SQL paths
assigned admins may edit their scope, review it, and no more
suspended accounts are denied even with a signed token
admins cannot grant themselves assignments
stale assignments and Super Admin grants are re-read on every request
providers cannot modify verification, featured, moderation or publication fields
non-super admins cannot modify protected fields or publish directly
Super Admin moderation writes succeed with a fresh database check
server-side validation rejects invalid prices, media, availability and details
audit events are server-attributed, append-only and RLS-scoped
failed audit persistence rolls the listing write back
concurrent edits, stale versions and read-after-write are deterministic
cinema screen ownership and assignment are enforced server-side
cinema edits are optimistic-concurrency and RLS safe
cinema ownership assignment is verified and Super Admin only
cinema audit failure rolls the database row and audit back
ALL LIVE EDIT BACKEND SECURITY CHECKS PASSED
```

Additional cinema assertions: PostgreSQL inventory returns the edited screen;
non-owner provider and unassigned admin direct SQL updates affect **0 rows**;
owner reassignment grants immediate access and revocation removes it immediately;
customer/inactive provider ownership is rejected.

### Existing suite

```bash
bash supabase/tests/run_local_validation.sh
```

**PASS** — ALL CHECKS PASSED (functional=52, contact=23, app_config=14,
rural=10, profile_privacy=7, concurrency=1, no double booking).
Provider PostgreSQL integration: **14/14 pass**.

### Static / tests / build

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm test` | **PASS** — 136 tests, 121 pass, 0 fail, 15 skips (DB suite skips without `BOS_LISTINGS_DATABASE_URL`) |
| `npm run build` | **PASS** |
| `node supabase/tests/migration_manifest.mjs` | **PASS** — baseline + 37 migrations, SHA-256 match |

---

## 6. Exact BLOCKED items

1. **Hosted project still has no schema.** Read-only probes on 2026-11-05 returned
   `404 PGRST205` for `public.listings`, `public.live_edit_admin_assignments`,
   `public.live_edit_cinema_screen_owners` and `public.live_edit_audit_events`
   (“Could not find the table … in the schema cache”). No hosted migration was run;
   hosted Live Edit remains **BLOCKED** until the owner applies the schema +
   all migrations and configures `BOS_LISTINGS_DATABASE_URL`.
2. **Cinema ownership must be provisioned.** The migration seeds screens but
   deliberately assigns no provider owners. Until Super Admin calls the owner
   endpoint (or inserts owner rows), providers are denied and only Super
   Admin/Movies-assigned admins can edit.
3. **Legacy JSON fallback listing mutations remain non-production.** No durable
   audit/assignments; production startup is refused with a JSON store and the
   Live Edit client refuses non-PostgreSQL sources. Reported **BLOCKED for Live Edit**.
4. **Module-specific enums on direct PostgREST writes.** The API validates every
   module field; the DB guard validates shape/bounds/protected fields but does not
   duplicate every enum/date/URL rule. The API is the supported Live Edit surface.
5. **Legacy `payload.isVerified`.** Editable JSON for backward compatibility but
   non-authoritative; the protected column/verification stamps remain enforced.

---

## 7. Files changed

**Database**

- `supabase/migrations/20261104220000_live_edit_backend_security.sql` — assignments,
  cinema ownership, PostgreSQL cinema table extension/seed/policies/guard/audit,
  listing guard/audit, owner assignment guard/audit.
- `supabase/MIGRATION_MANIFEST.json`, `supabase/migrations.sha256` refreshed.

**Server**

- `src/server/providerListingRepository.ts` — cinema list/find/save/owner methods,
  assignment/ownership enforcement, concurrency, audit id.
- `src/server/liveEditValidation.ts` — cinema/listing validation including total
  seats/cancellation flag.
- `server.ts` — PostgreSQL inventory, PostgreSQL cinema PUT, owner endpoint,
  JSON cinema write removal.
- `src/server/providerListingsApi.ts` — listing audit id.

**Frontend (preserved, no UI redesign)**

- `src/lib/liveEdit/mapping.ts` — sends `expectedUpdatedAt`, area, total seats,
  cancellation flag for cinema.
- `src/lib/liveEdit/repository.ts`, `audit.ts`, `types.ts` — server-issued audit
  evidence and new cinema audit actions.
- `src/components/liveEdit/LiveEditPanel.tsx` — consumes server audit evidence.

**Tests**

- `tests/live-edit-backend-security.integration.test.mjs` — 19-test security suite.
- `supabase/tests/run_live_edit_security.sh` — disposable-cluster runner.
- `supabase/tests/run_all_booking_suites.sh` — registers the suite.
- Existing provider/registration and SQL fixtures updated where they previously
  relied on any active admin being able to verify/publish.

**No hosted Supabase change, migration application, push, merge or deployment was performed.**
