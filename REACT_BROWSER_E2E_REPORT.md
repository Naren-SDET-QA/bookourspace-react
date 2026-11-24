# React Browser E2E Report — User Workflows

**Status: COMPLETE — 12 workflows exercised in a real browser on local infrastructure. 10 fully PASS, 2 have BLOCKED halves that local authentication cannot reach. Four UI defects found and fixed.**

| | |
| --- | --- |
| Date | 2026-11-24 |
| Repository | `/Users/aa/Downloads/bookourspace-react` |
| Branch / HEAD | `feat/universal-gps-tracking` @ `96c1297` (unchanged, nothing committed) |
| Browser | Playwright 1.63 headless **Chromium** (the repo's bundled engine), desktop viewport 1440×900 |
| App under test | local Express + Vite dev server on `http://127.0.0.1:3010` |
| Database | local disposable PostgreSQL 17, `.local/stays-db`, port `55440`, database `bookourspace_dev` |
| Hosted project | **not contacted** — see §1 |
| Files added | this report and `REACT_USER_WORKFLOW_DEFECTS.md` |
| Source files changed | 4 UI components (defects §5); `server.ts`, repositories, RLS, migrations untouched |

---

## 1. What this run actually was

```bash
# local database (disposable, loopback only)
LC_ALL=C pg_ctl -D .local/stays-db -o "-p 55440 -k /tmp -c listen_addresses=127.0.0.1" \
  -l .local/stays-db.log -w start

# local app, local session provider, demo fixtures on
PORT=3010 BOS_LOCAL_DEV_AUTH=1 VITE_BOS_LOCAL_DEV_AUTH=1 VITE_ENABLE_DEMO_DATA=true \
  bash scripts/dev-with-stays-db.sh

# browser verification (gitignored harness, real Chromium)
node .local/e2e/verify.mjs
```

The server printed its own confirmation that no hosted backend was in play:

```
[Supabase Configuration] Live Supabase is disabled. No project is selected implicitly.
[stays-dev] stays database ready: postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable
```

Sessions were created through the **application's own sign-in dialog** (`Continue with Google` → `Continue as Customer` / `Continue as Admin` / `Continue as PG Owner`), which calls `/api/auth/local-dev/session` and stores a server-signed session token — the same token path the UI uses. Seeded local identities only:

| Role | Identity used | Source |
| --- | --- | --- |
| Customer | `Demo Guest One` (`demo.guest.1@bookourspace.local`) | local seed |
| Provider | `Provider A` (`provider-a@example.test`, 5 approved businesses, 5 listings) | local seed |
| Admin | `Local E2E Admin` (`local.e2e.admin@bookourspace.invalid`, super admin) | local seed |

Harness: `.local/e2e/verify.mjs` (gitignored), assertions + network captures + screenshots in `.local/e2e/out/`. Raw log: `.local/e2e/verify-final2.log`.

**No real customer data was used. No `.env` file, credential, migration or hosted database was touched.**

---

## 2. Results

| # | Workflow | Status | Key evidence |
| --- | --- | --- | --- |
| 1a | Customer registration | **BLOCKED** | Sign-in dialog has **0** input fields; registration is Google-OAuth-only and needs hosted OAuth |
| 1b | Customer login | **PASS** | `/api/auth/me` 200, role `customer`, token persisted, header shows the customer name |
| 1c | Customer logout | **PASS** (after fix D-4) | token/profile cleared, role reset, signed-out header restored — was unclickable before the fix |
| 2 | Service discovery & listing search | **PASS** | 8 cards → search `PG` keeps 8 → no-match search removes all and shows an empty state |
| 3a | Provider registration (new account) | **BLOCKED** | same Google-OAuth-only entry point as 1a |
| 3b | Provider onboarding | **PASS** | provider hub renders, wizard opens at category selection, step 2 reachable |
| 4 | Business selection & switching | **PASS** | 5 memberships listed; switching to a Classes business updated storage and every scoped request |
| 5a | Provider listing creation | **PASS** | wizard POST → **201**, `x-business-id` present, row persisted as `pending_approval` |
| 5b | Provider listing editing (inline UI) | **BLOCKED** | Live Edit authenticates via `supabase.auth.getUser()`; local sessions get `NOT_AUTHENTICATED` |
| 5c | Provider listing editing (authorized path) | **PASS** | PATCH with correct business context → **200**, title changed, original restored |
| 6 | Business-context header propagation | **PASS** | every scoped provider request carried the selected id; explicit request → 200 |
| 7 | Unauthorized provider-write denial | **PASS** | customer POST → `403 BUSINESS_CONTEXT_REQUIRED`; anonymous POST → `401 UNAUTHORIZED_SESSION`; **0 rows created** |
| 8 | Cross-business / cross-account denial | **PASS** | own listing via other business → `403 FORBIDDEN_BUSINESS_CONTEXT`; foreign listing → `404 LISTING_NOT_FOUND`; foreign business id → `403 BUSINESS_ACCESS_DENIED` |
| 9 | Suspended provider denial | **BLOCKED** | local sign-in refuses suspended profiles (`404 LOCAL_DEMO_USER_NOT_FOUND`); no token can be minted in-browser |
| 10 | Admin login & protected screens | **PASS** | admin console renders; `/api/admin/businesses` 200; moderation feed 200; customer on the same API → `403 SUPER_ADMIN_REQUIRED` |
| 11 | Loading / empty / validation / error | **PASS** | loading status text, empty search state, submit validation alert, business-API failure alert |
| 12 | Refresh & session persistence | **PASS** | session, `#provider` hash and business id survive reload; second tab still signed in; **no** business-context error after reload |

Summary: **14 harness units — 13 PASS, 0 FAIL, 1 BLOCKED**; within the 12 named workflows, two have a BLOCKED half (1 and 5) and one whole workflow is BLOCKED (9). Nothing was reported as passing that did not execute.

---

## 3. Workflow detail and reproduction

### 1. Customer registration, login, logout

**Registration — BLOCKED.** Open the app, click `Continue with Google`. The dialog contains only Google OAuth entry points plus the clearly labelled *Local development sign-in* buttons; `dialog.locator('input').count()` is **0**. Account creation therefore requires the hosted Google/Supabase project, which this gate may not contact.

*Repro:* `localhost:3010` → `Continue with Google` → inspect the dialog.

**Login — PASS.** `Continue with Google` → `Continue as Customer`:

```
POST /api/auth/local-dev/session -> 200
GET  /api/auth/me -> 200  {"ok":true,"authenticated":true,"claims":{...,"role":"customer"}}
localStorage.bos_session_token_v1 = present
header identity = "Demo Guest One"
```

**Logout — PASS after fix D-4.** Profile → `Sign Out` → confirm `Sign Out`:

```
before: { bos_session_token_v1: present, bos_user_profile_v1: present }
after:  { bos_session_token_v1: null,    bos_user_profile_v1: null, user_role: "customer" }
signed-out header: "Continue with Google" visible again
```

Before D-4 was fixed the confirm button could not be clicked at all: it rendered **behind** the Profile panel (see the defect report).

### 2. Customer service discovery and listing search

Signed in as the customer: 8 listing cards render (`See the Room`). Typing `PG` keeps the results (8). Typing `zzzz-no-such-listing` removes all cards (0) and renders a no-results message. Screenshot `.local/e2e/out/w2-search.png`.

*Repro:* header search box → type the two queries above.

### 3. Provider registration and onboarding

New-account registration is the same BLOCKED Google path as 1a. Onboarding from an existing provider identity **passes**: after `Continue as PG Owner` the app keeps the `#provider` deep link, renders *Provider & Seller Hub*, and `Register as Provider & Submit Listing Request` opens the category-first wizard (`Choose Provider Category`, `Continue to Step 2`). Screenshot `.local/e2e/out/w3-onboarding.png`.

### 4. Provider business selection and switching

The *Business context* section lists **5** memberships for Provider A:

```
Provider A · Function Halls · Function Halls
Provider A · PG & Hostels · PG & Hostels
Local Institute Test · Classes · Classes
Fixture business pg_hostels · PG & Hostels
Fixture business movies · Movies
```

Selecting the Classes business changed `bos_business_id_v1` to `62043232-…` and every subsequent scoped request carried it:

```
GET /api/provider/listings        x-business-id=62043232-…
GET /api/provider/classes/batches x-business-id=62043232-…
```

*Repro:* provider hub → *Business* select → choose another business → observe localStorage and the Network panel.

### 5. Provider listing creation and editing

**Creation — PASS.** `Post Free` → wizard → step 2 (title `E2E verification listing`, price `7500`) → steps 3–4 → `Submit for Admin review`:

```
POST /api/provider/listings -> 201  x-business-id=e2ce422b-e46c-4111-91fa-d5989fb2e4ea
{"ok":true,"listing":{"id":"lst-…","title":"E2E verification listing","categoryId":"pg-students",
 "status":"pending_approval","ownerUserId":"11111111-…"}}
```

The row was confirmed in PostgreSQL and then deleted (cleanup) so the gate left no test listing behind.

**Inline editing — BLOCKED.** `Live Edit listings` opens the panel, which reports:

```
Live Edit is locked for this account
Sign in with a verified account to use Live Edit.
NOT_AUTHENTICATED
```

Cause: `src/lib/liveEdit/authority.ts` resolves the actor with `supabase.auth.getUser()`. A local-development session is a server-signed token with no Supabase session, so this is a limitation of the local harness, **not** a product defect.

**Authorized edit path — PASS.** The same browser session (correct business context) edited its own listing and restored it:

```
PATCH /api/provider/listings/live-pg-a  {"title":"E2E edited title"} -> 200
PATCH /api/provider/listings/live-pg-a  {"title":"Concurrent left"}  -> 200
```

### 6. Business-context header propagation

Every provider-scoped request after the membership list resolved carried exactly the selected id; the explicit probe returned 200:

```
GET /api/provider/listings          x-business-id=e2ce422b-…
GET /api/provider/classes/batches   x-business-id=e2ce422b-…
GET /api/notifications?userId=…     x-business-id=e2ce422b-…
fetch('/api/provider/listings', x-business-id) -> 200
```

Three requests are still sent without the header on the very first visit (before `/api/businesses` returns); they used to fail permanently and now retry successfully — see residual R-1.

### 7. Unauthorized provider-write denial

From the signed-in customer browser session:

```
POST /api/provider/listings  -> 403 {"ok":false,"error":"BUSINESS_CONTEXT_REQUIRED"}
POST /api/provider/listings (no session) -> 401 {"ok":false,"error":"UNAUTHORIZED_SESSION"}
SELECT count(*) FROM listings WHERE id LIKE 'e2e-denied-%' -> 0
```

No 403 was weakened and no row was written. The customer receives `BUSINESS_CONTEXT_REQUIRED` rather than `FORBIDDEN_PROVIDER_ROLE_REQUIRED`; that ordering wart (S-1 in `REACT_SECURITY_REGRESSION_REPORT.md`) is unchanged.

### 8. Cross-business access denial

Provider A, signed in, owning business `e2ce422b…`:

| Attempt | Result |
| --- | --- |
| Edit own listing that belongs to another of its businesses (`ce99fcb7…`) | `403 FORBIDDEN_BUSINESS_CONTEXT` |
| Edit another provider's listing (`pg-it-pg_hostels-…`) | `404 LISTING_NOT_FOUND` |
| List with another provider's business id (`dcff7443…`) | `403 BUSINESS_ACCESS_DENIED` |

### 9. Suspended provider denial — BLOCKED

The seeded suspended provider owns three approved businesses, but the local sign-in endpoint filters `account_status = 'active'`:

```
POST /api/auth/local-dev/session {role:"provider", email:"provider-suspended@example.test"}
-> 404 {"ok":false,"error":"LOCAL_DEMO_USER_NOT_FOUND"}
```

Minting a token in the browser would require the server HMAC secret, which this gate will not read. The denial itself is covered at execution level by `tests/live-edit-backend-security.integration.test.mjs` (`403 ACTIVE_PROFILE_REQUIRED` over HTTP and the raised `LIVE_EDIT_ACTIVE_PROFILE_REQUIRED` over SQL). Not re-tested here, not claimed.

### 10. Admin login and protected admin screens

`Continue as Admin` → `/api/auth/me` role `admin` (`local.e2e.admin@…`) → `Open Admin Console`:

```
BookOurSpace Admin Console rendered
GET /api/admin/businesses            -> 200
GET /api/admin/provider/listings     -> 200
same APIs with a customer session    -> 403 SUPER_ADMIN_REQUIRED
```

### 11. Loading, empty, validation and error states

| State | Evidence |
| --- | --- |
| Loading | With `/api/provider/listings` delayed 2.5 s, the PG inventory panel shows `role=status` “Loading your PG and Hostel listings…” |
| Empty | No-match search removes all cards and shows an empty state |
| Validation | Submitting the wizard without title/price → alert “Complete the selected category, subcategory, title and a valid non-negative price before submitting.” |
| Error | Aborting `/api/businesses` → alert “Business context unavailable: Failed to fetch. Showing the legacy provider view.” |

### 12. Refresh and session persistence

After provider sign-in: full reload keeps the provider session, `#provider`, and the business id, and shows **no** business-context alert (`[]`). A second tab in the same profile is signed in. (Before fix D-1, the reload itself wiped `bos_business_id_v1` and reproduced the 403s.)

---

## 4. Checks run

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | **PASS** (exit 0), run after the last edit |
| Production build | `npm run build` | **PASS** (exit 0, `✓ built in 1.66s`) |
| Static UI suites touching the edited files | `npx tsx --test tests/pg-owner-dashboard.test.mjs tests/business-ownership.test.mjs tests/live-edit-ui.test.mjs tests/customer-module-access.test.mjs` | **PASS** — 26/26 |
| Browser workflows | `node .local/e2e/verify.mjs` | **13 PASS · 0 FAIL · 1 BLOCKED** |

Not run (out of scope for a browser gate): the full `npm test` suite, an additional browser engine, mobile viewports, RLS spot-checks with two hosted accounts.

## 5. UI defects found and fixed

Four defects were found by driving the UI. All are local UI fixes; none touches authorization policy, RLS, the database or credentials. Full analysis, root causes and verification are in **`REACT_USER_WORKFLOW_DEFECTS.md`**.

| ID | Defect | File |
| --- | --- | --- |
| D-1 | Provider dashboard erased the persisted business id on first render and never retried, so business-scoped panels failed with `403 BUSINESS_CONTEXT_REQUIRED` — including after a reload | `src/components/ProviderDashboard.tsx` |
| D-2 | Venue workspace requests never sent `x-business-id` at all → permanent “BUSINESS CONTEXT REQUIRED” | `src/components/VenueOwnerWorkspace.tsx` |
| D-3 | Trainer console never re-fetched after context resolved and kept the stale error text | `src/components/ClassBatchManager.tsx` |
| D-4 | Sign-out/delete confirmation rendered underneath the Profile panel (`z-[80]` vs `z-[9999]`), so the confirm button could not be clicked | `src/components/ui/ConfirmDialog.tsx` |

## 6. Explicitly not claimed

* **Not** tested against the hosted project, its RLS, or real Google accounts.
* **Not** tested: brand-new registration, suspended-account denial through the UI, Live Edit inline saving — all BLOCKED by local authentication, as described above.
* Mobile/responsive layouts and non-Chromium engines were not exercised.
* The screenshots accompany the run but were not reviewed as a visual design pass.
