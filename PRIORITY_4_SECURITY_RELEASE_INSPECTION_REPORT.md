# PRIORITY 4 — SECURITY / RELEASE CONFIGURATION INSPECTION REPORT

Repository: `/Users/aa/Projects/bookourspace-final`
Branch: `integration/recover-20261115`
HEAD verified this pass: `c913554f93e7bc7bfcdf6acae2538f43580a42f0`
Worktree at start of pass: **132 changed entries, 0 staged** (verified with `git status --porcelain | wc -l` and `git diff --cached --name-only | wc -l`)
Date: 2026-11-21
Mode: **read-only inspection** in the original Priority 4 pass. SEC-01 was subsequently fixed in an authorized follow-up (see §9); nothing else in this report was changed. No hosted configuration read, no database access, no deploys, no commits, no staging, no credential rotation, no Flutter changes.

Scope of this report: authentication/session/OAuth, RLS and tenant isolation assumptions, secret and env handling, CORS/headers/cookies/CSRF/rate limiting, production build and deployment configuration, payment/booking/coupon safeguards, and Supabase project reference separation.

---

## 1. Verdict

**PRODUCTION READINESS: NOT READY.**

Nothing inspected in this pass is a confirmed P0/P1 vulnerability in the repository code. The blockers are:

1. one confirmed price-integrity gap in an unfinished surface (SEC-04),
2. several mitigations that are structurally correct but not enforced or not verifiable from this machine (SEC-02, SEC-05, SEC-06, SEC-07), and
3. a block of release-critical evidence that only a hosted/staging environment can produce (Section 6).

The one confirmed abuse/availability control defect (SEC-01) has since been fixed and proven over HTTP (§9). Because SEC-04, SEC-02 and SEC-06 are unresolved, and because hosted separation/RLS/backup evidence is missing, the readiness state stays **NOT READY**.

---

## 2. Findings summary

| ID | Area | Status | Severity | One-line finding |
|---|---|---|---|---|
| SEC-01 | Rate limiting / proxy awareness | **RESOLVED** (was FAIL) | P2 → closed | Distributed limiter keyed on `req.ip` with no `trust proxy`, so behind Cloud Run every client collapsed into one bucket per route. Fixed and proven over HTTP — see §9. |
| SEC-02 | Session storage | **PARTIAL** | P2 | Application session token lives in `localStorage`, not an httpOnly cookie; any XSS yields a 7-day impersonation token. |
| SEC-03 | Security headers / CORS | **PASS** | — | Exact-origin CORS allowlist, no wildcard, `Vary: Origin`, nosniff/frame-ancestors/referrer/permissions headers, HSTS in production. |
| SEC-04 | Coupon / discount authority | **FAIL** | P3 | `HelperJourney.tsx` computes a 10% discount in the browser; no server coupon endpoint or validation exists. |
| SEC-05 | OTP attempt limiting | **PARTIAL** | P3 | OTP cooldown/attempt buckets are per-process in memory; Cloud Run allows 2 instances, so budgets split. |
| SEC-06 | Deployment config enforcement | **PARTIAL** | P2 | `deploy/cloudrun/verify-deployment-config.py` cannot run here (missing PyYAML) and no CI job invokes it. |
| SEC-07 | OAuth callback origin | **PARTIAL** | P3 | `/api/auth/google/url` falls back to a Host-header-derived origin when `APP_URL` is unset. |
| SEC-08 | RLS / tenant isolation | **PASS (local) / NOT VERIFIED (hosted)** | P1 for the unverified part | Fail-closed admin predicate, explicit `service_role` claim injection, local RLS contract test and P3 cross-business refusal evidence; hosted RLS state unread. |
| SEC-09 | Secret handling / env validation | **PASS** | — | Only `.env.example` is tracked, no `.env*` ever committed, `.env.local` is `0600`, client key resolver refuses secret/service-role/DB-URL values. |
| SEC-10 | Production build / image | **PASS** | — | No source maps in `dist`, `dist` untracked, container runs non-root, no `.env` copied, no secret build args. |
| SEC-11 | Payment / booking safeguards | **PASS** | — | Intent creation always 503, client "settlement" endpoint 410, UTR path records reconciliation only, sandbox requires non-production + secret. |
| SEC-12 | Supabase project separation | **PASS (local config) / NOT VERIFIED (hosted)** | P1 for the unverified part | Dev ref `obkfgxjzlscungkhbyvq` confirmed; production guard refuses dev refs; deploy files contain no dev ref; hosted project identity not read. |
| SEC-13 | Debug / dev routes | **PASS** | — | Every `/api/dev/*` route is disabled in production and behind explicit flags/loopback checks. |

---

## 3. Confirmed findings (code-verified, reproducible from this checkout)

### SEC-01 — Rate limiter is not proxy-aware (**RESOLVED 2026-11-22**, was FAIL, P2)

> **Status: fixed after this inspection.** The analysis below is the finding as originally recorded; the implemented fix, its files and its HTTP-level evidence are in §9. The one detail this section states that later turned out to be incomplete is the auth policy: `bucketPath()` truncates to `/api/auth`, so the 12 req/min pattern requiring a trailing slash never matched and auth routes actually received the generic 120 req/min budget. That is fixed with the same change.

**Affected files:** `src/server/distributedApiRateLimit.ts`, `server.ts`, `deploy/cloudrun/service.yaml`.

**Evidence**

- `src/server/distributedApiRateLimit.ts:38-47` derives the bucket from `req.ip` and its own comment states: "`req.ip` uses the socket address unless Express trust proxy is explicitly configured. Deployments behind a proxy must set trust proxy to exact trusted hops".
- A repository-wide search for `trust proxy` returns **only that comment**; there is no `app.set('trust proxy', ...)` anywhere in `server.ts`.
- `deploy/cloudrun/service.yaml` deploys to Cloud Run, which terminates TLS at the Google front end and forwards the client address in `X-Forwarded-For`; the socket peer is the front end, not the caller.
- The limiter is enabled in production (`server.ts`, `enabled: ... process.env.NODE_ENV === 'production' || Boolean(pgRuntimePool)`), and the policies are 12 req/min for `/api/auth/*`, 30 req/min for payments/bookings/admin/builder, 120 req/min otherwise.

**Effect:** every caller shares one bucket per `(method, route-prefix)`. A single client can exhaust the global auth bucket (12/min) and lock out sign-in for all users, and the limiter stops being a per-client abuse control.

**Remediation:** set exactly one trusted hop for Cloud Run (`app.set('trust proxy', 1)`) before the limiter is mounted, or hash only the first `X-Forwarded-For` entry after verifying the peer is the platform front end. Add a unit test that two different `X-Forwarded-For` values behind a trusted proxy get independent buckets.

**Final status:** fixed in the authorized SEC-01 pass of 2026-11-22 (§9).

### SEC-04 — Client-side coupon discount with no server authority (FAIL, P3, price integrity)

**Affected file:** `src/components/HelperJourney.tsx`.

**Evidence**

- Line ~303: `const discount = couponApplied ? Math.round(subtotal * 0.1 * 100) / 100 : 0;` — the discount is computed in the browser from a local `couponApplied` boolean.
- `grep -rn -i coupon src server.ts` returns **only** `HelperJourney.tsx` (types, state, local draft persistence). There is no coupon table, endpoint, or server validation anywhere in `src`, `server.ts`, or `supabase/migrations`.

**Effect:** any total this screen displays can be reduced by a client-side flag. This matches the already-recorded W-10 (unimplemented module) and confirms the price-integrity consequence: a coupon-derived total must never be treated as authoritative until redemption is server-computed.

**Remediation:** keep the surface disabled/clearly non-binding, or implement server-authoritative redemption (eligibility, expiry, usage counters, discount computed server-side, total re-derived from the server quote). Do not send a client discount into any booking or payment write.

### SEC-02 — Session token in localStorage (PARTIAL, P2, XSS amplification)

**Affected files:** `src/lib/supabaseClient.ts` (`SESSION_TOKEN_STORAGE_KEY = 'bos_session_token_v1'`, `getStoredAuthoritativeSessionToken`/`setStoredAuthoritativeSession`), plus direct `localStorage` reads in `src/App.tsx`, `src/components/SupabaseAuthModal.tsx`, `src/components/CustomerLoginExperience.tsx`, `src/utils/adminEnterpriseStore.ts`, `src/utils/livePageEditorStore.ts`, `src/lib/serviceCommerceClient.ts`, `src/lib/deliveryTrackingClient.ts`, `src/lib/marketplaceVisibility.ts`.

**Evidence**

- The server mints its own HMAC session token (`signSessionToken`, `computeHmac`, constant-time comparison, expiry/`issuedAt` validation, revocation set in production) — the token format and verification are sound.
- The browser stores that token in `localStorage` and replays it as `Authorization: Bearer …` / `x-bos-session-token`.
- No cookie is ever set: `grep` for `res.cookie` / `Set-Cookie` / `document.cookie` returns **zero matches**.

**Assessment:** this is a deliberate design (header token ⇒ CSRF-resistant, no ambient credential). The residual risk is that any XSS — including a compromised third-party dependency — can exfiltrate a valid 7-day session. Severity is held at P2 because no XSS sink was found in this pass, not because the storage choice is safe.

**Remediation:** move the session to an httpOnly/Secure/SameSite=Lax cookie with a double-submit CSRF token for mutating routes, or cut the TTL and add rotation. Either way, record the decision explicitly.

### SEC-05 — OTP attempt budget is per-process (PARTIAL, P3)

**Affected file:** `src/server/emailOtpAuth.ts:268-282`.

**Evidence:** `attemptKey = clientAddress + "\0" + email`, tracked in an in-process `Map` (`verifyBuckets`), with `VERIFY_ATTEMPT_LIMIT`. `deploy/cloudrun/service.yaml` sets `maxScale: "2"` and `containerConcurrency: 20`, so a caller can get a fresh budget by landing on the other instance. `clientAddress` also comes from the same proxy-affected `req.ip`.

**Remediation:** reuse the existing database-backed limiter (`private.consume_api_rate_limit`) for OTP verification, keyed the same way, once SEC-01 is fixed.

### SEC-06 — Deployment configuration audit is not enforced (PARTIAL, P2)

**Affected files:** `deploy/cloudrun/verify-deployment-config.py`, `deploy/cloudrun/verify-deployment-config.sh`, `.github/workflows/ci.yml`.

**Evidence**

- Running the audit locally fails before any check executes: `ModuleNotFoundError: No module named 'yaml'` (exit 1).
- `.github/workflows/ci.yml` runs `npm test`, `npm run lint`, `npm run build`, a gitleaks diff scan, and a Chromium E2E job. **No job invokes the deployment-config audit.**
- Equivalent static checks performed manually this pass (Section 4) all pass, so the configuration itself is currently correct; the gap is that nothing keeps it correct.

**Remediation:** add `python3 -m pip install pyyaml` and `python3 deploy/cloudrun/verify-deployment-config.py` as a CI step, so a later edit that reintroduces a dev project ref or flips a `BOS_*` flag fails the build.

### SEC-07 — OAuth callback origin can be Host-header derived (PARTIAL, P3)

**Affected file:** `server.ts`, `GET /api/auth/google/url` (~line 2360).

**Evidence:** `const requestOrigin = process.env.APP_URL?.replace(/\/+$/, '') || \`${req.protocol}://${req.get('host')}\``; that value becomes `redirect_to` in the Supabase authorize URL. `deploy/cloudrun/service.yaml` supplies `APP_URL` as a deploy-time substitution, so production is expected to be explicit — but nothing forces it, and the production startup path does not assert `APP_URL`.

**Residual risk:** Supabase's hosted redirect allowlist is the real control here, and it is **not verified** (Section 6). If that allowlist is ever loose, a Host-header-driven callback becomes reachable.

**Remediation:** fail production startup when `APP_URL` is missing or not https, and keep the Supabase redirect allowlist to exact `https://<APP_URL>/auth/callback` plus the native callback URL.

---

## 4. Verified-correct findings (with the evidence that produced them)

### SEC-03 — Headers and CORS (PASS)

`server.ts` global middleware (~line 435-455) sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` with `Content-Security-Policy: frame-ancestors 'self'` outside the AI Studio preview path, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`, `X-DNS-Prefetch-Control: off`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production when the request is https. `app.disable('x-powered-by')` is set. `apiNoStoreByDefault` applies no-store to API responses.

`src/server/nativeAppCors.ts` defaults to exactly `capacitor://localhost` and `https://localhost`, parses entries through `new URL()`, rejects wildcards and credential-bearing/query/fragment URLs, ignores malformed entries, sets `Vary: Origin`, echoes only the matched origin, and answers a preflight from an unknown origin with 403. `tests/native-api-transport.test.mjs:85-103` asserts the exact-origin behaviour and the wildcard rejection.

`deploy/cloudrun/service.yaml` pins `BOS_NATIVE_APP_ORIGINS=capacitor://localhost,https://localhost` (no wildcard), and `deploy/cloudrun/verify-deployment-config.py` asserts that exact string.

CSRF: no cookies exist, so there is no ambient credential for a cross-site request to attach; mutations require the bearer token. Recorded as PASS with the reasoning above, contingent on SEC-02's design being kept.

### SEC-08 — RLS / API authorization / tenant isolation (PASS locally, hosted NOT VERIFIED)

- `src/server/adminAuthorization.ts` — `hasAdminAuthorization` requires a non-empty `userId`, `role === 'admin'` **and** the current role to be `admin`; fail-closed by construction.
- `src/server/authIdentity.ts` — a server session is only "verified" when `authProvider` is `google` or `email` **and** `supabaseUserId` is a real Supabase UUID; the DB RPCs repeat the check via `auth.uid()`.
- `src/server/stayPayments.ts`, `serviceCommerceApi.ts`, `stayHostApi.ts`, `locationSearchApi.ts` — elevated work runs inside a transaction with `SET LOCAL ROLE service_role` **and** an explicit `request.jwt.claim.role` / `request.jwt.claims` including `sub`, so the RPC boundary has a real identity rather than a bare role.
- `src/lib/supabaseClient.ts` — user-scoped RLS writes always filter on `user.id`; `updateRlsListing`/`deleteRlsListing` require a returned row id so a zero-row RLS refusal cannot look like success; `fetchRlsTransactions` returns `null` and `insertRlsTransaction` returns `false` because client-writable rows are not settlement evidence.
- `supabase/schema_and_rls.contract.test.ts` exists as the local contract for the schema/RLS surface; `supabase/tests/ownership_and_privileges_test.sql` and `public_rpc_security_test.sql` assert privilege boundaries locally.
- Priority 3 evidence (`e2e-artifacts/p3-workflows/classes-movies-verified.md`) records that an explicit `x-business-id` scopes the classes APIs and a foreign business is refused.

**Not verified:** the hosted project's actual RLS policies, grants and owner columns. That is a hosted read and was out of scope.

### SEC-09 — Secret handling and env validation (PASS)

- `.gitignore` ignores `.env` and `.env.*` with `!.env.example`; `git ls-files | grep -i '\.env'` returns only `.env.example`.
- `git log --all --diff-filter=A -- .env .env.local` returns nothing: no `.env*` file has ever been added to this repository's history.
- A tracked-file scan for `sk-…`, `sb_secret_…` and JWT-shaped literals matches only `tests/*.mjs` fixtures whose values are placeholders (`sb_secret_test`, `sb_secret_local`, `sb_secret_abcd`) used to prove the resolver **rejects** them.
- `.env.local` is mode `0600`, ignored, and holds the live local values (WhatsApp token, Resend key, Evolution DB password, `SUPABASE_SECRET_KEY` in the new `sb_secret_` format). No value was printed in this pass; only names, lengths and boolean shapes were read.
- `src/lib/supabaseConfig.ts` refuses a `postgres://`/`postgresql://` value, any `sb_secret_` value, any legacy JWT whose `role` is not `anon`, and any key whose `ref` does not match the configured project; a rejected pairing drops the project entirely instead of half-configuring it.
- `src/server/persistencePolicy.ts` requires TLS (`require`/`verify-ca`/`verify-full`) for remote targets, allowlists development remote targets, refuses loopback in production, refuses a JSON store in production, and requires a ≥32-character `BOS_SERVER_HMAC_SECRET`.
- `src/server/supabaseProductionGuard.ts` refuses production startup when any Supabase variable names a development ref, when a development ref is declared in the same process, or when the production ref is missing/unparseable/conflicting.

### SEC-10 — Production build and image (PASS)

- `vite.config.ts` sets no `build.sourcemap`; `ls dist/assets/*.map` returns **0** files.
- `git ls-files dist` returns nothing — build output is not tracked.
- `deploy/cloudrun/Dockerfile`: build args are public `VITE_*` values only (with an explicit comment forbidding secrets), `USER nodejs` (non-root), no `COPY … .env`, a healthcheck against `/api/live`, `NODE_ENV=production`, and Playwright stripped from the runtime image.
- `deploy/cloudrun/service.yaml`: `minScale 0`/`maxScale 2` cost guards, secrets sourced from Secret Manager (`bos-listings-database-url`, `bos-server-hmac-secret`, `supabase-secret-key`), `BOS_PAYMENT_SANDBOX=0`, `BOS_UPI_SANDBOX=0`, `BOS_VENUE_PAYMENT_SANDBOX=0`, `BOS_LOCAL_DEV_AUTH=0`, `BOS_STAY_INCLUDE_DEMO=0`, `BOS_STAY_ALLOW_DEMO_BOOKING=0`, `VITE_ENABLE_DEMO_DATA=false`, startup probe on DB readiness `/api/health` and liveness on process-only `/api/live`.
- Manual equivalents of the audit script checks pass: no development Supabase ref in `deploy/`, no hard-coded `<ref>.supabase.co` host in `service.yaml`/`cloudbuild.yaml`, `BOS_PRODUCTION_SUPABASE_PROJECT_ID` passed from a substitution, and **no `allUsers` binding** outside the YAML comments (`grep -v '^\s*#' | grep -c allUsers` → `0`).

### SEC-11 — Payment, booking and "false success" safeguards (PASS)

- `POST /api/payments/create-intent` — requires a customer session, then returns **503 `PAYMENT_PROVIDER_NOT_CONFIGURED`** unconditionally (`TRUSTED_PAYMENT_PROVIDER_CONFIGURED = false` at `server.ts:1354`). It cannot report a created intent.
- `POST /api/payments/webhook-settle` — returns **410** with an explicit "settlement must be confirmed by an independently verified provider" message; a client request can never mint payment proof.
- `POST /api/payments/verify-upi` — validates a 12–22 char UTR, records reconciliation only, and requires the owning customer session.
- `src/lib/supabaseClient.ts` — `PAYMENT_VERIFICATION_AVAILABLE = false`, and `fetchRlsTransactions`/`insertRlsTransaction` deliberately refuse to surface or write settlement rows from the client.
- Sandbox settlement is gated in every module by `BOS_PAYMENT_SANDBOX === '1'` **and** `NODE_ENV !== 'production'` **and** a ≥16-char secret (`stayRazorpay.ts`, `serviceCommerceApi.ts`, `pgPaymentsApi.ts`, `pgAdminApi.ts`, `stayPayments.ts`); the venue path requires `NODE_ENV === 'test'` (`venueBookingsApi.ts:50`), and `service.yaml` sets the flags to `0` for production.
- No endpoint in `server.ts` returns a success shape for a payment that was not provider-settled. Booking flows that are pay-later are labelled as such.

### SEC-12 — Supabase project reference separation (PASS locally, hosted NOT VERIFIED)

- `.env.example:20-22` sets `VITE_SUPABASE_PROJECT_ID="obkfgxjzlscungkhbyvq"` and `VITE_SUPABASE_URL="https://obkfgxjzlscungkhbyvq.supabase.co"`, and documents the auth callback as `https://obkfgxjzlscungkhbyvq.supabase.co/auth/v1/callback`.
- `.env.local` verified by value comparison without printing: `VITE_SUPABASE_PROJECT_ID` **equals** `obkfgxjzlscungkhbyvq`, `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID` **equals** the same ref, and `VITE_SUPABASE_URL` **resolves to** that ref. `APP_URL` is a loopback length-21 value, i.e. local development.
- `src/server/supabaseProductionGuard.ts` lists `obkfgxjzlscungkhbyvq` (plus the retired `ezrxykyocgbolpaebnqx` Stockholm and `sfoizxarbljhldmkgsma` Mumbai refs) as development-only and throws `PRODUCTION_SUPABASE_TARGET_IS_DEVELOPMENT` if any production variable names one of them.
- `deploy/` contains **no** development ref and no hard-coded Supabase host; `service.yaml` takes the ref from `${SUPABASE_PROJECT_ID}`.
- The React development target is therefore unambiguously `obkfgxjzlscungkhbyvq` (Mumbai, ap-south-1), and it must not be confused with the retired Stockholm and Mumbai projects above.

**Not verified:** which project the live deployment actually points at, and its auth configuration. That requires a hosted read.

### SEC-13 — Debug routes (PASS)

- `/api/dev/demo-session` (`src/server/devDemoSessionApi.ts`): registered only when `NODE_ENV !== 'production'` **and** `VITE_ENABLE_DEMO_DATA === 'true'` **and** a connection string is set, and only after `assertPostgresConnectionTarget` accepts a loopback target; otherwise the route is a hard 404. It can only sign the two seeded demo profiles and never creates users or elevates roles.
- `/api/auth/local-dev/session` (`server.ts:3516`): 404 when `NODE_ENV === 'production'` or `BOS_LOCAL_DEV_AUTH !== '1'`; only selects an existing active profile.
- `/api/dev/resend/pg-samples`, `/api/dev/evolution/pg-samples`, `/api/dev/resend/test-email`: development sample helpers gated by their own enable flags; none is reachable in production (`service.yaml` sets the demo/dev flags to `0`).
- `src/server/emailOtpAuth.ts:225` — the OTP `developmentCode` is returned only when `NODE_ENV !== 'production'` **and** `BOS_EMAIL_OTP_DEV_FALLBACK === '1'` **and** Resend delivery already failed.

---

## 5. Confirmed vulnerabilities vs missing evidence

**Confirmed from this checkout**

| Finding | Why it is confirmed |
|---|---|
| SEC-01 rate limiter collapses all clients behind the proxy | **FIXED 2026-11-22.** Was confirmed by the `req.ip` bucket key, the missing `trust proxy`, and the Cloud Run deploy target; now configured for exactly one hop and proven by HTTP tests (§9). |
| SEC-04 client-only coupon discount | The discount arithmetic exists in `HelperJourney.tsx` and a repository-wide `coupon` search finds no server table or endpoint. |
| SEC-02 session in `localStorage`, no cookie | `localStorage` writes/reads are present in ten files; `res.cookie`/`Set-Cookie`/`document.cookie` return zero matches. |
| SEC-05 per-process OTP budget | In-memory `Map` in `emailOtpAuth.ts` versus `maxScale: 2` in `service.yaml`. |
| SEC-06 config audit not enforced | Local run fails on missing `yaml`; `ci.yml` has no job calling it. |
| SEC-10 no source maps shipped | `dist/assets/*.map` count is 0 and `vite.config.ts` sets no sourcemap. |
| SEC-12 dev ref is `obkfgxjzlscungkhbyvq` | Byte-for-byte value comparison against `.env.local` (no value printed). |
| SEC-11 payments cannot fake success | The three payment endpoints return 503/410/503-by-flag and both client helpers are hard-coded false. |

**Missing evidence (cannot be produced without a hosted read or a deployed revision)**

| Item | Why it is missing |
|---|---|
| Hosted Supabase auth config: redirect allowlist, JWT/session lifetime, whether signup is disabled, OTP provider settings | Requires hosted project access, which is out of scope. |
| Hosted RLS state: actual policies, grants, `owner_id` columns, `SECURITY DEFINER` search paths for the two pending migrations | Requires hosted/staging read; local contract test and P3 evidence are the substitutes available here. |
| Hosted constraint validity for the three `NOT VALID` constraints | Recorded in Priority 2 as MR-13. |
| Backup/PITR existence and a successful restore | Recorded in Priority 2 as MR-11. |
| The live Cloud Run revision's real environment (secret mounts, actual `APP_URL`, `BOS_*` flags) | `service.yaml` is the intended state, not the deployed state. |
| Supabase Storage bucket policies and any OAuth client secrets rotation | Hosted configuration. |
| Whether any historical commit ever contained a credential | Full-history gitleaks scan was not run this pass; only a `.env*`-addition check and a tracked-file pattern scan were. |

---

## 6. Release-critical items still open (and who owns them)

| Ref | Item | Status |
|---|---|---|
| SEC-01 | Proxy awareness for the distributed limiter plus per-client bucket tests | **RESOLVED 2026-11-22** — one trusted hop on Cloud Run, explicit hop validation elsewhere, and 8 new HTTP-level tests (§9) |
| SEC-04 | Keep the coupon surface non-binding until redemption is server-authoritative (W-10) | **OPEN** — module unimplemented |
| SEC-02 | Decide and document session storage (cookie vs header token), or shorten TTL/rotate | **OPEN** — architectural decision |
| SEC-06 | Wire `verify-deployment-config.py` into CI with PyYAML installed | **OPEN** — small CI change |
| MR-02 | Commit the 2 pending migrations + manifest + sha256 so the release is reproducible from HEAD | **OPEN** (Priority 2) |
| MR-13 | Validate the three `NOT VALID` constraints against violating rows on hosted/staging | **OPEN** (Priority 2) |
| MR-05/MR-06 | Gate 1 pre-checks against live DEV data | **OPEN** (Priority 2) |
| MR-07 | Retention sign-off for `20261118200000` | **OPEN** (Priority 2) |
| MR-11 | Backup/PITR evidence plus a restore test | **OPEN** (Priority 2) |
| BR-10/BR-11 | Hosted migration application and production deployment | **BLOCKED BY POLICY** — requires explicit approval |

---

## 7. What this pass did not do

- No hosted Supabase, Cloud Run, Secret Manager or GitHub configuration was read or changed.
- No credential rotated, no OAuth setting touched, no deploy, no commit, no push, no staging.
- No Flutter/Android/iOS source touched.
- No secret value was printed; only variable names, lengths and boolean shapes were inspected.
- `deploy/cloudrun/verify-deployment-config.py` could not execute here (missing PyYAML); equivalent static checks for every assertion it makes were run manually and are reported in Section 4 (SEC-10).

---

## 8. Priority 4 verdict

**NOT READY.**

The repository code does not exhibit a confirmed P0/P1 vulnerability in the inspected areas: authorization predicates fail closed, payment endpoints cannot fabricate settlement, secret handling and env validation are strict, the production build ships no source maps, and the Supabase development reference is unambiguous. SEC-01 is now resolved with HTTP-level proof (§9). Release remains blocked by SEC-04 (one confirmed price-integrity gap in an unfinished surface), SEC-02 (session storage decision), the unenforced deployment-config audit (SEC-06), and the hosted-side evidence in Section 5 that this pass could not obtain.

---

## 9. SEC-01 resolution — trusted-proxy topology (2026-11-22)

This section was added after an authorized fix pass. Everything above is the original inspection; the SEC-01 rows were updated in place and this section carries the implementation and the proof.

### 9.1 What was wrong

Two defects, both in the abuse/availability control layer:

1. **No proxy awareness.** `src/server/distributedApiRateLimit.ts` derived its bucket from `req.ip`, and its own comment required `trust proxy` to be configured, but nothing set it. On Cloud Run the socket peer is the Google front end, so every caller shared one bucket per `(method, route)`.
2. **The stricter policies never applied.** `bucketPath()` aggregates `/api/auth/login` to `/api/auth`, while `policyFor` matched `/^\/api\/auth\//` (trailing slash required) — so authentication requests silently received the generic 120 req/min budget instead of 12, and `/api/admin/*` and `/api/builder/*` never received their 30 req/min budget either. This was discovered by the new test asserting the auth limit.

### 9.2 What changed

| File | Change |
|---|---|
| `src/server/trustProxy.ts` (**new**) | `resolveTrustProxy(env)` / `configureTrustProxy(app, env)` / `normalizeClientAddress(value)`. Cloud Run (`K_SERVICE` set) trusts exactly **one** hop. `BOS_TRUST_PROXY_HOPS` accepts only a single digit `0`–`4`; `true`, `*`, `loopback`, `1,2` and any other expression throw `BOS_TRUST_PROXY_HOPS_INVALID`. A production process that is neither on Cloud Run nor given an explicit hop count throws `BOS_TRUST_PROXY_HOPS_REQUIRED` at startup rather than guessing. Development, test and AI Studio previews trust **no** hop, so forwarded headers are ignored entirely. |
| `src/server/distributedApiRateLimit.ts` | Bucket key is `normalizeClientAddress(req.ip || req.socket?.remoteAddress)` — IPv4-mapped IPv6 (`::ffff:a.b.c.d`) collapses to one key, empty addresses fail closed with 503 instead of sharing an `unknown` bucket. `policyFor` now matches the aggregated route (`/api/auth`, `/api/admin`, `/api/super-admin`, `/api/builder`, `/api/{payments,refunds,bookings,seats,stays}`), so the documented 12/30/120 budgets are actually enforced. |
| `server.ts` | `configureTrustProxy(app)` is called immediately after `const app = express()` and before the limiter is mounted. |
| `deploy/cloudrun/service.yaml` | `BOS_TRUST_PROXY_HOPS: "1"` pinned with a comment naming the Google front end. |
| `deploy/cloudrun/verify-deployment-config.py` | Asserts `BOS_TRUST_PROXY_HOPS == "1"`. (Wiring this script into CI is still SEC-06 and was not done.) |
| `.env.example` | Documents the variable, the Cloud Run default and the single-digit restriction. |
| `tests/rate-limit-client-ip.test.mjs` (**new**) | 8 tests through real Express + real HTTP sockets. |

Why this cannot be bypassed: with `trust proxy = 1`, Express walks `X-Forwarded-For` from the socket and takes the first untrusted hop, which is the address the trusted front end appended. Any prefix the client prepends is discarded by that walk. With `trust proxy = false` (direct process) the socket address is used and the header is ignored completely.

### 9.3 HTTP-level proof (the tests that were run)

`npx tsx --test tests/rate-limit-client-ip.test.mjs` — real `express()` app, real `configureTrustProxy()`, real middleware, real `node:http` server on a loopback port, raw `X-Forwarded-For` control:

| Requirement | Test | Assertion |
|---|---|---|
| Two distinct client IPs get independent buckets | `two distinct client IPs receive independent buckets over HTTP` | `203.0.113.10` and `203.0.113.11` produce two different bucket hashes; the raw address never appears in the hash |
| One IP shares one bucket | `repeated requests from one client IP share one bucket over HTTP` | 3 requests → 1 distinct hash |
| Forged headers cannot bypass or move the bucket | `forged forwarding prefixes cannot bypass or move the bucket over HTTP` | `198.51.100.99, 203.0.113.10` and `198.51.100.77, 203.0.113.10` hash identically to the honest `203.0.113.10`; a different real client still differs |
| Forwarded headers are ignored when no proxy is trusted | `with proxy trust disabled, forwarded headers are ignored entirely over HTTP` | two different `X-Forwarded-For` values on a direct process share one (socket) bucket |
| Authentication limit stays enforced | `authentication limit stays 12/minute per client and the API limit stays enforced` | 12 requests allowed with `RateLimit-Limit: 12`, 13th is `429` + `Retry-After: 30` + `RATE_LIMITED`, a second client still gets `200`, generic reads still `120` |
| Booking/payment limit stays enforced | `booking and payment routes keep their 30/minute per-client limit` | `RateLimit-Limit: 30`, 31st request `429`, a second client unaffected |
| Topology rules | `trusted-proxy topology is exactly one hop on Cloud Run and refuses to guess elsewhere` | Cloud Run → hops 1; development → disabled; explicit `2` → 2; `0` → disabled; production with no declaration throws; six malformed values throw |
| Address normalisation | `client address normalization collapses IPv4-mapped IPv6 to one bucket key` | `::ffff:203.0.113.10` → `203.0.113.10` |

### 9.4 Verification results (exact)

```bash
npx tsx --test tests/rate-limit-client-ip.test.mjs tests/distributed-api-rate-limit.test.mjs \
  tests/authentication-security.test.mjs tests/auth-frontend-guards.test.mjs \
  tests/admin-authorization.test.mjs tests/privileged-endpoint-authorization.test.mjs \
  tests/production-fail-closed.test.mjs tests/preview-isolation.test.mjs
# tests 53, pass 53, fail 0, cancelled 0, skipped 0, exit 0
# (8 new + 5 existing rate-limit tests; the other 40 are the auth, admin-authorization,
#  privileged-endpoint, production-fail-closed and preview-isolation suites)

npx tsc --noEmit      # exit 0
npm run build         # exit 0 (only the pre-existing >500 kB chunk warning, BR-15)
```

The pre-fix run of the same new file failed exactly where the defect was: `authentication limit stays 12/minute per client and the API limit stays enforced` returned `RateLimit-Limit: 120` for `/api/auth/login`. After the `policyFor` fix it returns `12`. `tests/distributed-api-rate-limit.test.mjs` (5 pre-existing tests) and `tests/production-fail-closed.test.mjs` stayed green, so the new startup guard does not break the production fail-closed contract.

Not run in this pass: the full `npm test` suite, Playwright suites, and any hosted verification. The limiter's SQL (`private.consume_api_rate_limit`) is unchanged and remains covered by `supabase/tests/distributed_api_rate_limit_test.sql`.

**Re-verified 2026-11-22 after the unrelated GPS privilege migration (`20261122100000`) and the manifest re-pin to 125 migrations:** the same focused command returned `tests 53 / pass 53 / fail 0 / skipped 0, exit 0`, `tests/rate-limit-client-ip.test.mjs` alone returned `tests 8 / pass 8 / fail 0`, `npx tsc --noEmit` exit 0, and `npm run build` exit 0 with only the BR-15 chunk-size warning. The SEC-01 files were not edited by that pass. The full `npm test` run on the same checkout (before the migration was added) was 794/794, and `BOS_TEST_RATE_LIMIT=1 bash supabase/tests/run_local_validation.sh` passed end to end after it, with no `429`/`RATE_LIMITED` in either log.

### 9.5 Scope discipline

React only. No hosted read or write, no deploy, no credential change, no staging, no commit, no push. No rate limit was loosened: `/api/auth` moved from 120 to its documented 12, `/api/admin`/`/api/builder` from 120 to 30, and the generic budget stayed 120. Authentication logic was not touched.

**SEC-01: RESOLVED**, on the strength of the HTTP-level tests in §9.3 and the green run in §9.4 (re-confirmed 2026-11-22 after the GPS privilege migration; §9.4).
