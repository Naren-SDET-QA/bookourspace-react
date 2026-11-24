# React Security Regression Report — Business Context Gate

**Status: PASS — no authorization bypass introduced, every pre-existing denial still denies, and five denials now have execution-level evidence.**
**Scope: React only. Local disposable PostgreSQL 17. No hosted database, no policy or server changes.**

| | |
| --- | --- |
| Date | 2026-11-24 |
| Gate under test | `server.ts:2420–2500` business-context middleware + `providerListingRepository` business/ownership checks |
| Files changed | 4 test files (see `REACT_TEST_REMEDIATION_REPORT.md`) |
| Production/source code changed | **none** |
| Full suite | 505 tests · 503 pass · 0 fail · 2 skipped · exit 0 |

---

## 1. What the gate does (unchanged by this work)

For every request to `/api/provider`, `/api/services/provider`, `/api/stays/host`, `/api/movies/screens`, `/api/services/earnings`, `/api/services/payment-claims`, `/api/pg/bookings`, `/api/services/bookings`, `/api/venue-bookings`, `/api/stays/bookings`:

| Condition | Response |
| --- | --- |
| no verified session | `401 UNAUTHORIZED_SESSION` |
| `admin` role | proceeds (admin authority is re-checked per route) |
| `customer` on a customer-shared prefix | proceeds (self-service) |
| blank/malformed `x-business-id`, provider **with** business rows | `403 BUSINESS_CONTEXT_REQUIRED` |
| blank/malformed `x-business-id`, provider with **no** business rows | legacy owner-scoped path (documented F2 fallback) |
| valid id, no active membership / not approved / disabled / module not approved | `403 BUSINESS_ACCESS_DENIED` |
| valid id, business module ≠ route module | `403 BUSINESS_MODULE_MISMATCH` |
| valid id, member module scope excludes the module | `403 BUSINESS_MODULE_FORBIDDEN` |

Provider listing updates additionally require `listing.business_id === selected business` (`403 FORBIDDEN_BUSINESS_CONTEXT`) and `listing.owner_id === actor` (`403 FORBIDDEN_NOT_LISTING_OWNER`).

**None of these conditions, codes, orderings or policies was modified.** The only files that changed are test fixtures, which now supply a genuine business context where the test represents an authorized provider.

## 2. The five previously-reported 403-vs-404/200/503 cases, individually

### 2.1 `403` where `404 LISTING_NOT_FOUND` was expected — **resolved as 404, semantics preserved**

`cross-provider editing is denied and RLS hides the row`. Provider B supplied no business, so the gate answered `403 BUSINESS_CONTEXT_REQUIRED` before the repository could apply RLS. Provider B now selects its **own** business; the request reaches the repository, RLS still hides provider A's row, and the API answers `404 LISTING_NOT_FOUND` — the non-disclosure behaviour the test encodes. The direct-SQL half of the test (RLS returns `rowCount 0` for B) is unchanged and still passes.

### 2.2 `403 BUSINESS_CONTEXT_REQUIRED` where `403 ACTIVE_PROFILE_REQUIRED` was expected — **resolved as `ACTIVE_PROFILE_REQUIRED`**

`suspended accounts are denied even with a signed token`. The suspended provider now owns an approved business, so the gate passes and the repository's `requireActiveProfile` produces the specific denial. This matters: the ordering is *strictly more denying* than before (context, then active profile, then role match), and the test now proves the suspended account is stopped at the profile check rather than accidentally at the context check.

The direct-SQL half changed shape only: the database now **raises** `LIVE_EDIT_ACTIVE_PROFILE_REQUIRED` for a suspended actor instead of silently matching zero rows. The assertion now expects the raised guard, and the listing title is re-read to prove nothing was written.

### 2.3 `403` where `200`/`400`/`409`/`503` was expected (8 live-edit subtests) — **resolved at the intended status**

Verification, validation, audit, concurrency and cinema subtests all represent an authorized provider, so they now send an approved, module-matched business and reach the intended code paths (`400` validation, `409` concurrency, `503` audit rollback, `200` success). Every one of those assertions still proves the *denial* half of its scenario (`FORBIDDEN_VERIFICATION_FIELD`, rollback with no persisted change, `CONCURRENT_MODIFICATION`, audit-failure rollback).

`cinema ownership assignment is verified and Super Admin only` reported `503 AUDIT_PERSISTENCE_FAILED`. Diagnosed rather than guessed: the cinematic audit call itself succeeds when invoked with the same session configuration (`select public.record_live_edit_cinema_audit(...)` returned an id in a rolled-back transaction). The real cause was fixture state — the suite mutates shared `cinema_screens` rows, so a re-run presented an unchanged payload, and a leaked `test_reject_live_edit_audit` trigger from an earlier partially-failed run was still installed. Both are now neutralised in the seed (baseline reset + trigger cleanup), and the assertion passes on the real audit path.

### 2.4 `403 BUSINESS_CONTEXT_REQUIRED` where `403 FORBIDDEN_PROVIDER_ROLE_REQUIRED` was expected — **assertion updated, status and denial preserved**

`unauthorized and customer requests cannot create provider listings`. A customer POSTing to `/api/provider/listings` is a provider-only prefix, so the business gate answers before the route's role check. The test now asserts `403 BUSINESS_CONTEXT_REQUIRED` **and** that no listing row was created.

This is not a relaxation of an authorization decision (the request was, and is, a 403 with no side effect) but it is a real ordering observation: a customer learns why *business context* is missing rather than why the *role* is wrong. Two consequences for the owner:

* No information disclosure: the response is identical for every customer and reveals nothing about any resource.
* If role-first ordering is the intended contract, it requires moving the provider-role check ahead of the business gate in `server.ts` — an authorization-policy change explicitly out of scope for this gate. See §6.

### 2.5 Fixture crash `23503` on `businesses_owner_user_id_fkey` / `listings_business_id_fkey` — **fixture fixed, no security bearing**

The provider-listing suite deletes a profile to simulate a missing auth-trigger row. A backfilled business (and listings) referenced it with `ON DELETE RESTRICT`. Cleanup is now scoped to that single fixture UUID and removes its own listings and businesses first; the rollback fixture's `auth.users` insert is idempotent. No policy, grant or constraint was altered.

## 3. Negative coverage — preserved and extended

Every denial the suite asserted before this work still exists, and the five categories the task named now have explicit, executing assertions:

| Category | Coverage | Evidence |
| --- | --- | --- |
| **Missing business context** | new subtest `missing, malformed, foreign and wrong-module business context are denied` — provider A with `businessId: ''` | `403 BUSINESS_CONTEXT_REQUIRED`, listing unchanged |
| **Invalid business ids** | same subtest — `businessId: 'not-a-uuid'` | `403 BUSINESS_CONTEXT_REQUIRED` |
| **Unauthorized / cross-business access** | same subtest — provider A presenting provider B's business id | `403 BUSINESS_ACCESS_DENIED` |
| **Cross-business row access** | `cross-provider editing is denied and RLS hides the row` | `404 LISTING_NOT_FOUND` + RLS `rowCount 0` + owner feed excludes the row |
| **Wrong module for the route** | same new subtest — `pg_hostels` business on `/api/movies/screens` | `403 BUSINESS_MODULE_MISMATCH` |
| **Non-provider access** | new subtest (customer PATCH on a provider listing → 403, row unchanged) and `unauthorized and customer requests cannot create provider listings` (customer POST → 403, no row created) | both assert 403 **and** absence of the row |
| **Forged session roles** | `forged roles are rejected by the database profile check` | `403 SESSION_ROLE_MISMATCH` for provider-as-admin and customer-as-provider |
| **Suspended accounts** | `suspended accounts are denied even with a signed token` | `403 ACTIVE_PROFILE_REQUIRED` over HTTP **and** raised `LIVE_EDIT_ACTIVE_PROFILE_REQUIRED` over SQL |
| **Unassigned admin scope** | `unassigned admins are denied on HTTP and direct SQL paths` | `403 LISTING_ASSIGNMENT_REQUIRED`, RLS `rowCount 0` |
| **Super-Admin-only operations** | `cinema ownership assignment is verified and Super Admin only`, `admin rejection remains private…` | `403 SUPER_ADMIN_REQUIRED` / `SUPER_ADMIN_SCOPE_REQUIRED`, state unchanged after denial |
| **Business gate presence in source** | `tests/business-ownership.test.mjs`, `tests/customer-module-access.test.mjs` | static assertions on `BUSINESS_CONTEXT_REQUIRED`, `BUSINESS_ACCESS_DENIED`, module-set and prefix coverage — unchanged and passing |

No test that asserted a denial was deleted, skipped, or inverted. The three assertions whose *expected code* moved (§2.2 SQL half, §2.4, and the `rowCount`→raised-guard change) all became equally or more strict, and each is accompanied by a re-read proving no data changed.

## 4. Which tests now carry business context, and which deliberately do not

| Session | Sends `x-business-id` | Why |
| --- | --- | --- |
| Authorized provider fixtures (`services-booking`, `classes` ×2 trainers, `live-edit` A/B/suspended, `provider-listings` A/B/activated applicant) | **yes**, one approved business per module the route serves | they represent authorized providers |
| Customers (`services-booking`, `classes` students, `provider-listings` customer) | no | must keep self-service booking and must be denied on provider-only writes |
| Admins / Super Admin / assigned / unassigned admins | no | admin authority is re-derived per route; the gate is bypassed by design |
| `forgedProvider`, `forgedAdmin` (signed role claim ≠ DB profile) | no, deliberately | so the legacy fallback path still exposes `SESSION_ROLE_MISMATCH`; mapping them would have converted the intended assertion into a context error |
| Anonymous | no | `401` asserted |

## 5. Checks run

| Check | Result |
| --- | --- |
| Full suite against local PG 17 (`npm test`, `BOS_LISTINGS_DATABASE_URL=…:55440`) | **PASS** — 505 / 503 pass / 0 fail / 2 pre-existing skips / exit 0 |
| The four remediated files in isolation | **PASS** — 41 / 41 |
| TypeScript (`npx tsc --noEmit`) | **PASS** — exit 0 |
| Production build (`npm run build`) | **PASS** — exit 0 |
| Static authorization suites (`business-ownership`, `customer-module-access`, `access-control`, `admin-authorization`, `live-edit-authority`, `route-ownership`) | **PASS** — included in the full run, 0 failures |

Not run (out of scope for this gate, and unchanged by it): hosted-database checks, RLS spot-checks with two real accounts against the hosted project, restore rehearsal, migration application. The migration/approval state in `REACT_FINAL_GO_NO_GO.md` is untouched.

## 6. Residual risks and owner decisions

| # | Item | Assessment |
| --- | --- | --- |
| S-1 | Customer on a provider-only prefix receives `BUSINESS_CONTEXT_REQUIRED` instead of `FORBIDDEN_PROVIDER_ROLE_REQUIRED` | No disclosure and still `403`. Changing the order is an authorization-policy edit and was **not** made. Decide whether role-first ordering is the intended contract. |
| S-2 | The legacy fallback (F2) keeps working for providers with **zero** business rows | This is existing intended behaviour and is why `forgedProvider` still receives `SESSION_ROLE_MISMATCH`. After the pending backfill, that set shrinks to providers who have never published a listing — an access tiering the owner should explicitly accept (R-10). |
| S-3 | Fixtures seed businesses directly as the test role | Correct for a disposable cluster; it means the suites now require the business schema, i.e. a migrated database. |
| S-4 | `cinema_screens` is shared mutable fixture state | Now reset per run; a future test that depends on absolute refund values must read the baseline first. |
| S-5 | Module-scope denial (`BUSINESS_MODULE_FORBIDDEN`) and member-scoped access (`business_member_access`) | The gate asserts them in source; they are **not** exercised over HTTP by these suites because every fixture member is an owner (owners are intentionally unrestricted). Unverified dynamically — reported as such rather than claimed. |
| S-6 | Hosted behaviour | Not tested here and not claimed. Everything in this report was measured against the local PostgreSQL 17 cluster. |

## 7. Verdict

* **Authorization bypass introduced: none.** Source diff outside `tests/` is empty.
* **Security-denial tests: all preserved**; five categories gained explicit executing assertions.
* **403 semantics:** no 403 was loosened; one expected *code* changed at an unchanged status, with the denial strengthened by a data-absence assertion.
* **Blockers:** none for the test suite. The rollout decisions (Approvals A–G; credential incident; restore point) remain open and are unchanged by this gate.
