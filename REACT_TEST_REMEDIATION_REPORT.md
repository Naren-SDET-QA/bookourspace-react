# React Test Remediation Report

**Status: COMPLETE — 17 failures resolved, suite green, zero production-code changes.**
**Scope: React only. Local disposable PostgreSQL 17 only. No hosted database access, no migrations, no dumps, no credential changes, no Git mutations.**

| | |
| --- | --- |
| Date | 2026-11-24 |
| Repository | `/Users/aa/Downloads/bookourspace-react` |
| Branch / HEAD | `feat/universal-gps-tracking` @ `96c1297` (unchanged) |
| Test database | local cluster `.local/stays-db`, PostgreSQL 17, port 55440, database `bookourspace_dev` (disposable) |
| Hosted project | **not contacted** — all statements ran against the local cluster only |
| Source files changed | **0** — `server.ts`, `src/server/*`, `supabase/migrations/*` untouched |
| Test files changed | **4** (+316/−15 lines; the only other modification in the tree is the pre-existing `ProviderDashboard.tsx`) |
| Files added | 2 (this report and `REACT_SECURITY_REGRESSION_REPORT.md`) |
| Owner modification preserved | `src/components/ProviderDashboard.tsx` — still the only non-test modified file (16 insertions), not staged |

---

## 1. Reproduction (before)

Documented environment: local PostgreSQL 17 on `55440`, suite run through the repository's own script.

```
LC_ALL=C pg_ctl -D .local/stays-db -o "-p 55440 -k /tmp -c listen_addresses=127.0.0.1" -l .local/stays-db.log -w start
BOS_LISTINGS_DATABASE_URL="postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable" npm test
```

| Run | Tests | Pass | Fail | Skipped |
| --- | --- | --- | --- | --- |
| Before remediation | 491 | 472 | **17** | 2 |
| After remediation | 505 | 503 | **0** | 2 |

The test count rises from 491 to 505 because previously failing parent tests aborted before their subtests ran; those subtests now execute (the extra count is real assertions, not padding). The two skips are pre-existing and unrelated (`PostgreSQL-backed location API …` and `provider listing approval still requires an administrator`, both explicitly deferred to the PostgreSQL suites by their own skip messages).

## 2. The exact 17 failures and their assertions

All 17 were reproduced, then investigated one at a time. Failure text below is from the pre-remediation run log.

| # | File | Test | Observed vs expected |
| --- | --- | --- | --- |
| 1 | `classes-enrollment-postgres.integration.test.mjs` | `classes trainer → admin approval → student enrollment → cancellation` | `403 {"error":"BUSINESS_CONTEXT_REQUIRED"}` vs `201` |
| 2 | `live-edit-backend-security.integration.test.mjs` | `cross-provider editing is denied and RLS hides the row` | `403` vs `404` (`LISTING_NOT_FOUND`) |
| 3 | same | `suspended accounts are denied even with a signed token` | `403 BUSINESS_CONTEXT_REQUIRED` vs `403 ACTIVE_PROFILE_REQUIRED` |
| 4 | same | `providers cannot modify verification, featured, moderation or publication fields` | `BUSINESS_CONTEXT_REQUIRED` vs `FORBIDDEN_VERIFICATION_FIELD` |
| 5 | same | `server-side validation rejects invalid prices, media, availability and details` | `403` vs `400` |
| 6 | same | `audit events are server-attributed, append-only and RLS-scoped` | `403` vs `200` |
| 7 | same | `failed audit persistence rolls the listing write back` | `403` vs `503` |
| 8 | same | `concurrent edits, stale versions and read-after-write are deterministic` | `403` vs `200` |
| 9 | same | `cinema screen ownership and assignment are enforced server-side` | `403` vs `200` |
| 10 | same | `cinema edits are optimistic-concurrency and RLS safe` | status pair mismatch (`[403,403]` vs `[200,409]`) |
| 11 | same | `cinema ownership assignment is verified and Super Admin only` | `503 AUDIT_PERSISTENCE_FAILED` vs `200` |
| 12 | same | `cinema audit failure rolls the database and audit back` | `403` vs `503` |
| 13 | same | parent test `Live Edit backend security` | failed because subtests 2–12 failed |
| 14 | `provider-listings-postgres.integration.test.mjs` | `provider listing API uses local PostgreSQL transactions and RLS` | fixture crash: `23503` `listings`/`businesses` foreign keys |
| 15 | `services-booking-e2e.test.mjs` | `provider accept → start → complete, then customer cannot cancel, payment claim recorded` | `403` vs `200` |
| 16 | same | `customer cancels a requested booking and provider rejects another` | `403` vs `200` |
| 17 | same | `provider reschedules a live booking` | `403` vs `200` |

**Every difference was a refusal where a success was expected, or a coarser refusal where a more specific one was expected. Nothing became more permissive.** No test was removed, skipped, or converted to a looser assertion without a compensating assertion (see §5 and the security report).

## 3. Root cause

`server.ts:2420–2500` gates every provider-owned prefix on business context that it re-derives from PostgreSQL on each request:

* invalid/absent `x-business-id` → legacy fallback **only** for a provider with no `business_members`/`businesses` rows at all; otherwise `403 BUSINESS_CONTEXT_REQUIRED`;
* valid id → `businesses` ⋈ `business_members` ⋈ `business_module_access` must be `approved`/`enabled`/`active`, and the business module must match the route's module → otherwise `403 BUSINESS_ACCESS_DENIED` / `BUSINESS_MODULE_MISMATCH`.

`src/server/providerListingRepository.ts:1162` and `:1380` additionally require the row's `business_id` to equal the selected business for provider updates, and `:790` scopes the provider feed by it.

The four failing files are provider-write suites written before business context became mandatory. They seeded profiles and listings but never a business, and only `tests/business-ownership.test.mjs` / `tests/customer-module-access.test.mjs` referenced `x-business-id` — and those two are static source assertions, so nothing in the suite exercised the gate dynamically.

The local cluster made this visible because the pending migrations have already been applied there: the backfill created provisional businesses for every fixture provider that had ever published a listing (`BIZ-…` refs). From that point the legacy fallback stops applying to those fixtures, which is exactly the production consequence recorded as R-10 in `REACT_COMPLETE_REMEDIATION_REPORT.md`. **The failures were the migration's rollout effect surfacing early, not a regression in the gate.**

`provider-listings` failure #14 was a second-order effect of the same backfill: the fixture deletes a profile to simulate a missing auth-trigger row, and the backfill's business row (`businesses_owner_user_id_fkey … ON DELETE RESTRICT`) now blocks that delete; the parent test aborted during setup, so none of its subtests ran.

## 4. What was changed, file by file

All changes are inside `tests/`. No application code, no repository code, no migration, no configuration, no environment file.

Each file gained one small helper — `ensureBusiness(ref, ownerId, moduleType)` — and a token→business map that mirrors what the browser does (`localStorage.bos_business_id_v1` → `x-business-id` via `buildAuthHeaders()`).

`ensureBusiness` writes exactly the rows an admin/owner would:

1. upserts one `businesses` row (`approval_status='approved'`, `is_enabled=true`, `backfill_source='integration_fixture'`) keyed by a per-file `business_ref`;
2. re-asserts the `owner`/`active` `business_members` row;
3. re-asserts the `business_module_access` row (`enabled=true`, `approved`).

It is an upsert rather than delete-and-insert because `listings.business_id` is `ON DELETE RESTRICT`; re-running the suite must reuse the same business instead of orphaning last run's listings.

### 4.1 `tests/services-booking-e2e.test.mjs` (+47 lines)

* Provider fixture gets an approved `services` business; `request()` sends `x-business-id` **only** for the provider session token.
* Customers, the admin, and the anonymous calls still send no business header, so their paths are unchanged.

### 4.2 `tests/classes-enrollment-postgres.integration.test.mjs` (+52 lines)

* Trainer fixture gets an approved `classes` business; the second trainer (the one asserting `FORBIDDEN_NOT_COURSE_OWNER` and an empty roster) gets its own, so those assertions still reach the route instead of being pre-empted by the gate.
* `request()` adds the header per token; customers and admin unaffected.

### 4.3 `tests/live-edit-backend-security.integration.test.mjs` (+144/−11)

* Provider A and provider B each get a `pg_hostels` business (for `/api/provider/...`) and a `movies` business (for `/api/movies/screens`); the suspended provider gets both as well, so its denial is the intended `ACTIVE_PROFILE_REQUIRED`, not a context error.
* `businessHeadersFor(token, url)` picks the module-appropriate business by route; only the three real provider sessions are mapped. `forgedProvider` / `forgedAdmin` are deliberately **not** mapped, which is why their `SESSION_ROLE_MISMATCH` assertions still pass through the legacy fallback.
* The five seeded listings are now inserted with `business_id` (owner-mapped), because the repository rejects a provider edit whose row belongs to a different business.
* Seeded cinema screens are reset to a known baseline (`refund_percent = 25`, `row_version + 1`) before assertions, because the suite mutates those shared rows and a re-run would otherwise hit the "unchanged" short-circuit and never produce an audit event.
* Test-only audit triggers (`test_reject_live_edit_audit`, `test_reject_cinema_audit`) are dropped at seed time: they are created inside subtests and previously leaked whenever an assertion failed before their cleanup, poisoning the next run.
* The suspended provider's direct-SQL denial is now asserted as the raised guard `LIVE_EDIT_ACTIVE_PROFILE_REQUIRED` instead of `rowCount === 0` (the database now refuses the write rather than silently matching zero rows — strictly stronger).
* New subtest `missing, malformed, foreign and wrong-module business context are denied` (see the security report).

### 4.4 `tests/provider-listings-postgres.integration.test.mjs` (+73/−4)

* Provider A and provider B get approved `pg_hostels` businesses; the applicant, after an admin approves the registration, gets an approved `services` business and its refreshed session token is mapped to it.
* Setup deletes this fixture user's own leftover `listings` and `businesses` before deleting the profile it is testing (scoped to that one fixture UUID, and required because of `ON DELETE RESTRICT`).
* The rollback fixture's `auth.users` insert is now `on conflict (id) do nothing`; a previous aborted run left the row behind and the suite could not start.
* Customer denial assertion updated (see §5).

## 5. The one assertion whose expected *code* changed

`tests/provider-listings-postgres.integration.test.mjs`, subtest `unauthorized and customer requests cannot create provider listings`:

* **before** — expected `403 FORBIDDEN_PROVIDER_ROLE_REQUIRED` for a customer POSTing to `/api/provider/listings`.
* **after** — asserts `403 BUSINESS_CONTEXT_REQUIRED` **and** that no `listings` row with that id exists.

The HTTP status is unchanged (403), and the denial is unchanged (the write does not happen); only the innermost error code differs, because the business-context middleware is registered before provider-role routing and answers first for a customer on a provider-only prefix. Tightening the assertion with a database read makes the security property strictly stronger than the string it replaced. This is reported as an ordering observation for the owner, **not** as a behaviour change: no server code was touched and no 403 was relaxed.

## 6. Verification actually run

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **PASS** — exit 0 |
| Production build | `npm run build` | **PASS** — exit 0, `✓ built in 1.22s` |
| Full suite, local PG 17 | `BOS_LISTINGS_DATABASE_URL=…:55440 npm test` | **PASS** — 505 tests · 503 pass · 0 fail · 2 skipped · exit 0 |
| The four remediated files only | `npx tsx --test --test-concurrency=1 <4 files>` | **PASS** — 41 tests · 41 pass · 0 fail |

Additional read-only database probes were used only to diagnose (row counts, trigger inventory, stored function bodies, one manual `begin … rollback` reproduction of the cinema audit call). All writes were made by the test fixtures themselves against `bookourspace_dev`; no hosted statement of any kind was issued.

## 7. Explicitly not done

* No change to `server.ts`, `src/server/providerListingRepository.ts`, `src/modules/businessPermissions.ts`, or any migration — the 403 gate, its ordering, its module matching and the repository's business-ownership check are exactly as they were.
* No `x-business-id` header added for customers, admins, anonymous callers, or forged-role sessions.
* No test removed, skipped, or marked todo; no assertion relaxed from "denied" to "allowed".
* No RLS change, no policy change, no fake production data, no `.env`/Keychain/GPG change, no Git reset/clean/checkout/stash/commit/push.
* The exposed-credential incident, the archive/recovery gates and the migration approvals (A–G in `REACT_FINAL_GO_NO_GO.md`) are untouched by this gate.

## 8. Remaining notes / blockers for the owner

1. **These suites now depend on the business tables existing.** That is correct for any database the pending migrations have been applied to, but it means the four files require a migrated schema; they will fail against a pre-business database, as would the application itself.
2. **Fixture businesses are created directly by the test role**, not through the business API, on a disposable local cluster. No seeded row is exported or reused as production data.
3. **Gate ordering for customers** (§5) is a real, small behavioural wart: a customer hitting a provider-only route learns `BUSINESS_CONTEXT_REQUIRED` rather than `FORBIDDEN_PROVIDER_ROLE_REQUIRED`. Fixing it means moving a role check ahead of the business gate — an authorization-policy change that this gate deliberately did **not** make.
4. **Migration rollout risk R-10 is unchanged and now demonstrated:** any provider with a backfilled business must send `x-business-id` or every provider write returns 403. The uncommitted `ProviderDashboard.tsx` selector is what supplies it; shipping that UI is a prerequisite for applying the pending migrations, not an optional polish item.
