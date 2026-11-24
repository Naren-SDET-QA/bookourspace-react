# React Recovery Gate R3 — Independent Release Audit

**Date:** 2026-11-24
**Repository:** `/Users/aa/Downloads/bookourspace-react`
**Branch:** `feat/universal-gps-tracking`
**HEAD:** `3d901d7be129238ddd5f58940e3e2ba038f0f5aa` (`fix(db): harden business-ownership migrations before release`), working tree clean
**Audit scope:** React only. Flutter excluded.
**Hosted database:** not touched. Development project `obkfgxjzlscungkhbyvq`; production project still **UNCONFIRMED**.
**Verdict: CONDITIONAL — R3-D1 fixed and re-verified. Remaining Playwright failures are spec/fixture issues, and the external release gates below are still open.**

---

## 1. Phase 1 — Independent change review: PASS (one documentation finding)

| Check | Result |
| --- | --- |
| Migration files changed vs `96c1297` | 8 — modified: `20261111190000`, `20261111200000`, `20261111210000`, `20261112010000`, `20261112030000`, `20261112040000`, `20261112050000`; new: `20261112060000` |
| Already-applied migration altered | No (`20261112020000` untouched; none of the 74 hosted-ledger versions appear in the diff) |
| Unique versions / duplicates | 82 unique, 0 duplicates |
| Sorted ascending | Yes |
| `migration_manifest.mjs` check | PASS |
| Independent `shasum -a 256` vs `supabase/migrations.sha256` | 0 mismatches, 82 entries |
| Destructive additions in diff (`delete from`, `truncate`, `drop table`, `grant all`, `disable row level`) | None |
| `BEGIN/COMMIT` in migrations | Removed; harness now applies each file with `psql -1` |
| `REACT_MIGRATION_EXECUTION_MANIFEST.md` | Absent (not produced; not required by the package) |

**R3-F1 (minor, provenance).** `supabase/MIGRATION_MANIFEST.json` still carries the review record from 2026-11-07 with `migrationCount: 73`. The pinned set is now 82 and includes the nine business-ownership migrations. Hashes and order are correct, but the manifest's own review attestation does not cover the released set. Regenerate the review record with `migration_manifest.mjs --write --review-note …` before packaging.

---

## 2. Phase 2 — Security review: PASS (35/35)

Independent negative suite (`.local/r3-security-test.sql`, gitignored, synthetic users `aaaa1111…`…`aaaa5555…`, businesses `R3-BIZ-A/B`) run against the fresh sandbox, exit **0**, 35 PASS / 0 FAIL:

- Anonymous: reads active listings without invoking `is_admin()`; hidden from pending and draft listings; reads active venue categories through the repaired anon policy; cannot execute `is_admin()`; can evaluate only `business_publicly_available()` and `can_access_business_module()`.
- NULL-business legacy owner: reads and updates own listings (with and without a business), cannot touch another owner's NULL-business listing.
- Cross-business: owner A denied on B's draft listing, business row, members, member-access row, listing update and business update.
- Membership/staff: staff reads own business and own member-access row; denied on B; cannot rewrite own module scope.
- Admin: reads both businesses and B's draft listing. Customer: no business rows, no B draft.
- Helpers: authenticated cannot execute audit, transfer or ownership-membership trigger helpers; every SECURITY DEFINER routine pins `search_path` (also re-verified by the postcondition SQL).
- Audit trail: client role has no INSERT/UPDATE/DELETE privilege on `business_audit_events`, owner can read own business audit rows, and rows are written by the creation trigger. An attempted delete by the owner failed with a hard `permission denied` (stronger than a 0-row result); the append-only guard `LIVE_EDIT_AUDIT_APPEND_ONLY` blocks deletes even for the sandbox owner.

No policy was weakened. Fixture teardown uses `session_replication_role = replica` **only** to remove synthetic rows from the throwaway cluster; it is not part of the shipped package.

---

## 3. Phase 3 — Migration rehearsal: PASS

Fresh PostgreSQL 17.11 `initdb` cluster (`PGDATA=/var/folders/0b/pfm9qpq911511cs6dfnfpq_40000gn/T/bos-local-validation.k8lVlO/pgdata`, port `57540`, preserved).

| Check | Result |
| --- | --- |
| All 82 migrations from clean baseline (`supabase/tests/run_local_validation.sh`) | exit 0; every suite PASS (5c3 26/0, 5g0 8/0, 5g1 30/0, 5g 12/0, 5h 6/0, 5i 20/0, …) |
| `verify_pending_migrations.sql` | 7/7 PASS + `ALL PENDING-MIGRATION POSTCONDITIONS PASSED` (exit 0) |
| Reapply phase 2/3/4/5 + `20261112060000` | all OK; policy counts stable (listings 6, venue_categories 2) |
| Backfill idempotency | `businesses` 18 → 18; duplicate owner+module = 0 |
| Backfill review coverage | 12 review rows; 8 legacy NULL-business listings retained (not force-assigned) |
| Trigger behavior | membership rows created on business insert (owner/staff access above), audit rows written, append-only enforced |
| Ledger consistency | **Not verifiable locally**: the harness applies files directly, so the sandbox has no `supabase_migrations` schema. Hosted ledger state remains the R1 reading (74 rows, newest `20261108150000`, 8 pending) and was not re-checked in R3. |

Harness note: `run_local_validation.sh` re-applies the older venue-taxonomy migration near the end, which recreates the legacy anon `is_admin()` policy; re-applying `20261112060000` restores the intended order. Production applies each migration once in version order, so the final hosted state is correct, but the harness ordering should be fixed to avoid masking regressions.

---

## 4. Phase 4 — Application regression

| Check | Result |
| --- | --- |
| `npm test` | 473 tests: **455 pass, 0 fail, 18 skipped** (env-gated), 27.1 s |
| `npx tsc --noEmit` | exit 0 |
| `npx vite build` | exit 0, built in 1.23 s (chunk-size warning only) |
| Playwright Chromium, full suite (`LC_ALL=C LANG=C`, isolated port 4847) — before fix | 121 passed, 4 failed, 27 skipped, 5 did not run in 7.4 m; exit 1 |
| Playwright Chromium, full suite — after R3-D1 fix | **124 passed, 3 failed, 27 skipped, 3 did not run** in 7.2 m; exit 1 |
| Spec files collected | 26 (`find e2e -name '*.spec.ts'`). The brief says 29; the repository contains 26 — see R3-D5. |

### 4.1 Failures — triage (R3-D1 fixed)

| # | Spec | Symptom | Classification |
| --- | --- | --- | --- |
| **R3-D1** | `stays-onboarding.spec.ts:49` | `POST /api/stays/host/onboard` returned **403 `BUSINESS_CONTEXT_REQUIRED`**; expected 201 | **Fixed — spec now 4/4 passing** |
| R3-D2 | `classes-journey.spec.ts:270` | Card renders `… Mon-Fri · 6:00 PM – 8:00 PM ₹4,000 Course Fee Madhapur Hyderabad … Next Batch 2 seats left` but not `1 live batch`; test aborts at line 349 | UI copy/data-summary drift — needs product decision |
| R3-D3 | `shared-location-pg.spec.ts:3` | No `article[aria-label^="PG listing"]` for a Mumbai selection after 30 s | Fixture/geography gap (local PG inventory has no Mumbai rows) |
| R3-D4 | `site-chrome.spec.ts:4` | "Back to top" never becomes visible after the test's scroll attempt | Test scroll target vs bento shell (not a proven product defect) |

**R3-D1 detail and fix.** `server.ts` let customers bypass the business-context middleware only for non-provider paths. `/api/stays/host` is in `providerOnlyPrefixes`, so a customer without a business fell through to the `403 BUSINESS_CONTEXT_REQUIRED` branch. The stay host API explicitly supports this flow (`src/server/stayHostApi.ts:169`) and authorizes every call by listing ownership (`requireHost(..., true)` plus `requireOwnedStayListing`); it never reads `res.locals.businessContext`.

The fix adds one narrow exemption in the business-context middleware: a `customer` calling a path under `/api/stays/host` proceeds with `businessContext = null`, letting the stay host API's ownership checks decide. Provider behavior is untouched: a provider that has a business and sends no `x-business-id` still reaches the UUID check and receives `403 BUSINESS_CONTEXT_REQUIRED`, and `/api/provider`, `/api/movies/screens`, `/api/services/earnings` and `/api/services/payment-claims` still require a business context for every non-admin, non-customer-bypass request. Customers remain denied on those paths (verified structurally; the existing `provider-listings-postgres` assertion on `/api/provider/listings` and the live-edit missing/malformed-context assertions are unaffected).

**R3-D2 detail.** The style-3 card renders "Next Batch" and a flat fee; the spec expects "1 live batch" and "From ₹4,000/month". Either the card lost the live-batch summary in the UI rework or the spec targets a retired card variant. Ten later assertions in that journey did not run. No security impact; needs a product/copy decision and a spec update.

**R3-D3 detail.** On the home/bento screen the app shell is `.bos-app-shell-bento` with `overflow-visible`, so the test's `shell.scrollTop = 900` is a no-op; `getScrollMetrics()` targets `window`, which the test never scrolls. The assertion therefore tested the wrong scroller. Fix the spec to use real wheel/window scrolling before treating this as a product defect.

**R3-D4 detail.** The PG style-3 page shows no listing for Mumbai. The local catalog is Hyderabad-centric; this is missing fixture coverage rather than an application error. It cannot be signed off without a city-matching fixture.

### 4.2 Skips and non-runs

27 skipped, all gated by explicitly absent external fixtures/sessions:
- `E2E_VENUE_SESSIONS` — `venue-booking.spec.ts` (10), `venue-booking-cross-browser.spec.ts` (1)
- `E2E_CLASS_SESSIONS` + phase-two — `classes-training.spec.ts` (8), `classes-journey.spec.ts` (6)
- `E2E_MOVIES_SESSIONS` / `E2E_BASE_URL` — `movies-showtimes.spec.ts` (3)
- `E2E_SERVICE_SESSIONS` / seeded fixtures — `services-booking.spec.ts` (2)
- `stays-onboarding` serial remainder (4), `E2E_STAYS_REAL` (1), `E2E_STAY2_SMOKE` (1), AI-Studio-only `safe-image-rendering` (1)

These suites need pre-minted session tokens and seeded fixtures, normally produced from the development project. They are **not executed** in this gate. 3 further tests did not run because serial describe blocks aborted after the remaining failures. No suite was skipped to hide a failure.

**R3-D5 (documentation).** The brief refers to 29 Playwright spec files; the repository has 26. All 26 were collected and run. Confirm whether three specs were intentionally removed/merged before claiming "all 29" coverage.

---

## 5. Release gates still open (unchanged by this audit)

1. **Credential rotation — OPEN.** Gate R2.1 is not verified; no rotation has been performed. No hosted writes may be requested until it closes.
2. **Production project identity — UNCONFIRMED.** `obkfgxjzlscungkhbyvq` must never be assumed to be production.
3. **Verified restore point — none.** No dump/backup/restore may be taken under the standing restrictions; a verified recovery point is still required before any hosted migration.
4. **Hosted ledger re-check — not performed in R3.** The R1 reading (74 applied, 8 pending, 0/17 pending tables live) is now stale relative to HEAD; re-read it only after rotation and with explicit read approval.
5. **Deployment/write authorization — not requested and not granted.**

---

## 6. Verdict

**CONDITIONAL — do not request hosted-database or production deployment authorization yet.**

The migration package is internally consistent, independently hash-verified, rehearses cleanly from zero on PostgreSQL 17, passes all postconditions, is idempotent where required, and survives 35 independent authorization attacks. R3-D1 is fixed and verified:

- `e2e/stays-onboarding.spec.ts` — **4/4 passing** (onboarding 201, pre-approval booking refusal, incomplete-profile 400, demo and concurrency guards).
- Full suite — **124 passed, 3 failed, 27 skipped, 3 did not run**; the three remaining failures are the previously triaged spec/fixture issues, not the onboarding regression.
- `npm test` 455 pass / 0 fail / 18 skipped; `tsc` exit 0.

Still open before deployment authorization:

1. The four external gates above (rotation, production identity, restore point, hosted ledger verification).
2. Triage/closure of R3-D2…D5 (copy/spec drift, fixture gaps, stale manifest review record, spec-count mismatch).

Changed code: `server.ts` (customer stay-host exemption only). No migration or RLS policy was changed; the audit report is the only new file.
