# BookOurSpace React — Final Release Readiness Report (2026-11-22)

**Verdict: NOT READY.**

Branch `integration/recover-20261115`, starting commit `add352b`, verified with
`git rev-parse HEAD` at the start of the pass. No hosted read or write, no
migration applied to a hosted database, no deploy, no commit, no push, no
Flutter work.

---

## Summary

| Phase | Result | Evidence |
|---|---|---|
| 1 — SEC-06 deployment audit | **PASS (local)** | 47-check audit + 10-test negative suite + new CI job |
| 2 — SEC-05 OTP budgets | **PASS** | 5 new distributed-limit tests |
| 2 — SEC-07 OAuth origin | **PASS** | 6 new origin tests |
| 2 — SEC-01 rate limiting | **PASS (reconfirmed)** | 8 HTTP tests unchanged |
| 2 — SEC-02 session storage | **PASS (local)** | HttpOnly cookie + CSRF proof; browser and HTTP evidence recorded below |
| 2 — SEC-04 coupon authority | **PASS (local)** | Server-priced subtotal, integer-paise discount, locked idempotent redemption, 18 DB/HTTP/concurrency tests + Chromium journey; booking-reference ownership is NOT verified (no persisted booking); hosted apply remains pending |
| 3 — Functional workflows | **PARTIAL** | DB/HTTP suites pass; browser journeys not run |
| 4 — Database readiness | **PASS (local) / PENDING (hosted)** | manifest 126, fresh install, 3 NOT VALID prechecked |
| 5 — Booking and payment safety | **PASS (disabled)** | payments still 503/410; coupons closed locally (server-authoritative) |
| 6 — Recovery readiness | **NOT VERIFIED** | no authorised backup/PITR evidence |
| 7 — Final verification | **PARTIAL** | unit 805/805, tsc, build, audit, manifest green; Playwright and gitleaks not run |

---

## What changed in this pass

1. `deploy/cloudrun/verify-deployment-config.py` — root-parameterised audit, no crash on bad YAML or a missing parser, stricter structure/security assertions.
2. `deploy/cloudrun/requirements-verify.txt` *(new)* — `PyYAML==6.0.2`.
3. `deploy/cloudrun/test_verify_deployment_config.py` *(new)* — 10 positive/negative tests.
4. `.github/workflows/ci.yml` — `deploy-config` job running the audit and its negative suite.
5. `src/server/emailOtpAuth.ts` + `server.ts` — OTP budgets moved to the database-backed limiter (SEC-05).
6. `src/server/authOrigin.ts` *(new)* + `server.ts` — OAuth callback origin is `APP_URL` only (SEC-07).
7. `tests/email-otp-distributed-limit.test.mjs` *(new)*, `tests/auth-origin.test.mjs` *(new)*.
8. `supabase/tests/not_valid_constraint_precheck.sql` *(new)* — read-only precheck for the three NOT VALID constraints.
9. `PRODUCTION_REMEDIATION_REPORT_20261122.md` *(new)*, this report, and register §11.

No existing file was reverted, stashed or cleaned; every pre-existing untracked
and modified entry is still present.

---

## Verification (exact)

```bash
npm test                       # tests 805, pass 805, fail 0, duration 87s, exit 0
npx tsc --noEmit               # exit 0
npm run build                  # exit 0 (BR-15 chunk-size warning only)
npm audit --audit-level=low    # found 0 vulnerabilities
node supabase/tests/migration_manifest.mjs
# PASS manifest verified: baseline + 125 migrations, unique versions, sha256 match
/tmp/bos-verify-venv/bin/python deploy/cloudrun/verify-deployment-config.py
# 47 PASS checks, exit 0
/tmp/bos-verify-venv/bin/python deploy/cloudrun/test_verify_deployment_config.py
# Ran 10 tests ... OK, exit 0
BOS_TEST_RATE_LIMIT=1 bash supabase/tests/run_local_validation.sh
# exit 0, ALL CHECKS PASSED (functional=65, contact=25, app_config=14, rural=10,
# profile_privacy=10, super_admin=12, bootstrap=6, media=20, concurrency=1)
```

The `not_valid_constraint_precheck.sql` run against a freshly migrated
disposable database reported:

```
 listings_price_range_check           | 0 | READY
 live_edit_cinema_owner_screen_fkey   | 0 | READY
 payment_verifications_intent_id_fkey | 0 | READY
```

## Not verified (and why)

- **Playwright browser journeys** — not executed; previous sessions' specs exist but were not re-run here.
- **GitHub Actions execution** — the `deploy-config` job is committed to the workflow definition, but no run was observed.
- **Secret scanning with gitleaks** — Docker daemon was not running (`Cannot connect to the Docker daemon`). A heuristic `git grep` for `sk_live_`, `sb_secret_`, `AKIA…` and private-key blocks found only the deliberate fake `sb_secret_abcdefghijklmnop` in `tests/supabase-config.test.mjs:311`.
- **Hosted DEV RLS/grants, constraint validation, retention schedule, backup/PITR and restore** — require hosted access and/or the owner's approval; none attempted.

## Blocking work, in order

1. **SEC-02** — **PASS locally**: 14/14 cookie/CSRF/session-isolation contract tests and 17/17 Chromium auth/OAuth entrypoint tests pass. Hosted OAuth remains unproven.
2. **SEC-02** — **OPEN**: dedicated browser contract is 4/4 and combined cookie/OAuth coverage is 24/24; the ten migrated-spec batch is not green and the full Chromium matrix has not passed.
3. **SEC-04** — **PASS locally (2026-11-22, final)**: the coupon discount is priced on the server (`src/lib/helperPricing.ts`), calculated in integer paise, and redeemed in a coupon-row-locked transaction with idempotent replay, booking-ownership refusal and 503 on database failure; RLS/grant/constraint guards verified. `tests/coupon-security.test.mjs` is now 18 behavioural DB/HTTP/concurrency tests (was 3 source-text checks), `e2e/helper-coupon-journey.spec.ts` drives the browser journey, and the full unit suite is 845/845 with the 127-migration manifest verified. Booking ownership is **not** verified against a persisted booking — only reference uniqueness — and hosted application of the two coupon migrations is still pending. Register §11.12–§11.13.
4. **Hosted DEV verification** — run RLS/tenant-isolation checks, the three `validate constraint` statements after the precheck reports READY, and decide on the tracking-purge retention schedule (owner approval required).
5. **Backup/PITR** — obtain read-only hosted evidence, record RPO/RTO, and perform a restore into an approved disposable environment.
6. **Playwright matrix** — resolve the remaining migrated-spec functional/setup failures, then run the complete browser matrix.

Until 1–5 are closed, this release stays **NOT READY**.

## SEC-02 checkpoint update — 2026-11-22

The measured `shmget` cause was local macOS System V shared-memory exhaustion
(`shmmni=32`, `shmall=1024`) from orphaned disposable PostgreSQL clusters. Test-
owned clusters were stopped safely and future runs use one worker; no Docker
prune, volume deletion, unrelated container stop, or hosted change was made.

The disposable auth/API budgets are guarded by non-production checks. The
production-configuration regression test passed 6/6 and confirms the production
limits remain 12/minute for authentication and 30/minute for API routes.

The ten requested migrated specs passed 35 tests, with 22 fixture-gated skips
and 0 failures. Previously failing full-matrix specs subsequently passed
individually: commit visibility 1/1, host workspace 9/9, and access-control API
7/7. SEC-02 remains **OPEN / production NOT READY** until the post-fix full
Chromium matrix and final unit, lint, TypeScript, build, and diff checks are
recorded.

Post-fix standard Chromium matrix: **235 passed, 2 failed, 30 skipped, 10 did
not run**. Both failures were Playwright trace-artifact ENOENT cleanup errors,
not application assertions. With `--trace=off`, provider-business-context passed
**6/6** and stays-filters passed **12/12**. The standard matrix remains
non-zero, so SEC-02 and production readiness stay **OPEN / NOT READY**.

### Final SEC-02 verification

Trace output was isolated per Playwright process at
`/tmp/bookourspace-playwright-results-<port>-<pid>`, eliminating the shared
artifact cleanup collision. The disposable server now traps exit and stops
only its explicit `/tmp/bookourspace-playwright-db-*` cluster; persistent local
PostgreSQL processes and data were not touched.

The standard run
(`BOS_PLAYWRIGHT_PORT=4890 BOS_PLAYWRIGHT_DB_PORT=14890 BOS_PLAYWRIGHT_DB_DATA_DIR=/tmp/bookourspace-playwright-db-4890 npm run e2e -- --workers=1 --retries=0`)
passed with **exit 0: 247 passed, 30 intentional skips, 0 failures, and 0
unexplained not-run tests**. Skips are documented missing external fixtures or
explicit authorization gates: classes 9, movies 3, services 2, GPS 2, AI Studio
SafeImage 1, real stays 1, Stay 2 cloud smoke 1, and venue 11.

Final verification: `npm test` **826/826, exit 0**; lint **exit 0**;
TypeScript **exit 0**; build **exit 0** with only the existing chunk-size
warning; `git diff --check` **exit 0**. Gitleaks was already complete with
working-tree/source scans at 0 findings and historical-only detections
documented.

**SEC-02: PASS for local Chromium. Production: NOT READY** pending hosted OAuth,
external fixture evidence, database/backup and deployment gates.

The final ownership audit stopped only stale `/tmp/bookourspace-playwright-db-*`
clusters. Persistent `/opt/homebrew/var/postgresql@17` and
`.local/stays-db` were preserved. Playwright webServer shutdown now allows a
five-second SIGTERM grace period for the disposable cleanup trap.


## Launch-readiness pass — 2026-11-22 (second pass, API boundary)

**What was reproduced and fixed.** Every unmatched `/api/*` path — a typo, a
removed endpoint, or a wrong method on a real path — returned `200 text/html`
(the SPA shell) in both development and production routing, because no API
fallback existed before the Vite middleware and `app.get('*')`. A JSON caller
therefore saw success and failed later in parsing, and monitoring could not see
the miss. `server.ts` now registers a JSON 404 (`API_ROUTE_NOT_FOUND`,
`Cache-Control: no-store`) after all API routes and before both page fallbacks.
`tests/api-route-boundary.test.mjs` (new, 4 HTTP tests against the real server)
covers unknown paths, unknown writes, a wrong method on a real path, real API
routes and the deep-link shell. Verified live post-fix.

**Verification.** `npm test` → exit 0, **849/849**. Chromium: auth/session/
authorization/route inventory **71/71**; customer modules (services, stays,
stays filters, venue, classes, movies, site chrome, builder unpublish)
**32 passed + 15 fixture-gated skips**; post-fix regression **51/51**. HTTP
probes: rate limiting (`12` then `429`), `no-store` and generic bodies on
unauthenticated personal endpoints, security headers, fail-closed startup
without the database, and the local-dev sign-in guard. `npx tsc --noEmit` 0,
`npm run build` 0, `git diff --check` 0, migration manifest PASS.

**Still blocking release (none of it application logic).**

1. Hosted DEV migrations: 127 local migrations are pinned and verified locally
   but not applied to the hosted project (owner approval required); the three
   `NOT VALID` constraints, RLS/tenant evidence and the retention sign-off are
   hosted-side.
2. Hosted Google sign-in has never been exercised against the production
   project; only the local contract and stand-in provider are proven.
3. Backup/PITR and a restore into a disposable environment are not evidenced.
4. Payments stay disabled: no live Razorpay/UPI create→settle→refund, so no paid
   booking capability can be claimed.
5. Release-owner Gitleaks acceptance for the 100 historical findings is
   unsigned.
6. Not audited: mobile viewport responsiveness, and the known 1.09 MB main JS
   entry.

**Verdict: NOT READY FOR PRODUCTION** — application code is launch-capable for
the verified journeys, but hosted infrastructure, paid bookings and the
release-owner security acceptance are release prerequisites that are still open.
