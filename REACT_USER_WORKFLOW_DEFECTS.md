# React User-Workflow Defects — Browser Verification

**Status: 4 defects found, 4 fixed locally, 0 security-policy or database changes.** Residual limitations and unexercised paths are listed in §3.

| | |
| --- | --- |
| Gate | BookOurSpace React — End-to-End Browser Verification |
| Date | 2026-11-24 |
| Environment | local Express/Vite on `127.0.0.1:3010`, local PostgreSQL 17 (`55440`), headless Chromium |
| Source files changed | 4 UI components (below). `server.ts`, `src/server/*`, RLS, migrations, `.env` untouched |
| Owner change preserved | the business selector already present in `src/components/ProviderDashboard.tsx` is kept intact; the fixes are additive |

Severity uses the workflow impact observed in the browser: **High** = a workflow cannot complete; **Medium** = a workflow shows a false failure or loses state; **Low** = cosmetic/transient.

---

## 1. Defects

### D-1 — Provider dashboard erased the stored business id on mount, and panels never retried (High)

**Impact.** On the provider hub, *My Provider Listings*, *Classes batches* and *Venue* panels failed with `403 BUSINESS_CONTEXT_REQUIRED`. The error survived a page reload, so a provider with a perfectly good business membership could not use the business-scoped parts of their own dashboard. This is the UI half of migration risk **R-10** (`REACT_MIGRATION_EXECUTION_PLAN.md`): the selector ships the header, but it was being wiped before consumers could use it.

**Symptom (before).**

```
GET /api/provider/classes/batches -> 403 x-business-id=NONE
GET /api/provider/listings        -> 403 x-business-id=NONE
GET /api/provider/listings        -> 403 x-business-id=NONE
stored business: e2ce422b-e46c-4111-91fa-d5989fb2e4ea
alerts: ["Your courses could not be loaded.", "BUSINESS CONTEXT REQUIRED"]

-- after a full reload, with the id already in localStorage --
GET /api/provider/listings        -> 403 x-business-id=NONE
GET /api/provider/classes/batches -> 403 x-business-id=NONE
alerts: ["Your courses could not be loaded.", "BUSINESS CONTEXT REQUIRED"]
```

**Root cause.** Two things in `ProviderDashboard`:

1. `selectedBusinessId` started as `''`, and its persistence effect ran on the first render and therefore executed `localStorage.removeItem('bos_business_id_v1')`. The stored selection was destroyed before `/api/businesses` resolved, and every child request in that window was header-less.
2. Nothing re-fetched when the selection finally arrived, so the 403 was permanent until a manual refresh of a panel that used an explicit id.

**Fix** (`src/components/ProviderDashboard.tsx`):

* initialise the state from `localStorage` (`useState(() => … 'bos_business_id_v1' …)`), so a reload never loses the selection;
* only clear storage once the account is known to have **no** business (`businesses.length === 0 && !businessError`);
* keep a stored id only while it is still one of the account's memberships, otherwise fall back to the preferred approved `pg_hostels` business (or the first);
* when the resolved selection differs from the one found at mount, dispatch `bos-business-context-changed`;
* pass the selection to `PgProviderWorkspace` (`businessId={selectedBusinessId || undefined}`).

**Verification (after).**

```
first load: 3 requests 403 (before memberships resolved) → retried with the id
GET /api/provider/classes/batches -> 200 x-business-id=e2ce422b-…
GET /api/provider/listings        -> 200 x-business-id=e2ce422b-…
GET /api/provider/listings        -> 200 x-business-id=e2ce422b-…

after reload: all 200 with the id, alerts: []
```

**Repro.** Provider hub → DevTools Network, filter `provider` → observe the 403s and the missing header; reload and observe them again.

---

### D-2 — Venue workspace never sent `x-business-id` (High)

**Impact.** The *Function hall bookings* panel always showed `BUSINESS CONTEXT REQUIRED` for venue providers, even with an approved `venues` business. Unlike the other panels, it could never recover.

**Root cause.** `VenueOwnerWorkspace.request()` built headers from `init.headers`, then added only `Authorization` from `getStoredAuthoritativeSessionToken()`. It bypassed `buildAuthHeaders()`, which is the single place that attaches `x-business-id`, so no business context could ever reach `/api/provider/listings`, `/api/venue-bookings` or the venue settings routes.

**Fix** (`src/components/VenueOwnerWorkspace.tsx`): build the headers with `buildAuthHeaders(init.headers)`, which supplies both the bearer token and the business id, and keep the existing JSON content-type fallback. A `bos-business-context-changed` listener re-loads the venue list when the provider switches business.

**Verification.** Before: `BUSINESS CONTEXT REQUIRED` in the panel with an approved venue business present. After: the panel no longer reports a context error; the business-switch workflow shows the venue request carrying the newly selected id.

---

### D-3 — Trainer console kept a stale error and never re-fetched (Medium)

**Impact.** *Course batches & calendar* displayed “Your courses could not be loaded.” even after the business context had arrived and the data had loaded successfully. The panel also stayed empty until the page was reloaded.

**Root cause.** `ClassBatchManager` loads once on mount (`useEffect(..., [])`), has no reaction to the business selection becoming available, and never clears `error` on a successful retry.

**Fix** (`src/components/ClassBatchManager.tsx`): clear `error` at the start of every load, and re-run the load when `bos-business-context-changed` fires.

**Verification.** Service requests now carry the id after the event; the stale message is cleared by the retry. A first-visit race that can still leave the message until the next load is documented as residual **R-1**.

---

### D-4 — Sign-out confirmation rendered underneath the Profile panel (High)

**Impact.** A signed-in customer could not sign out with a mouse. The confirmation dialog was visible-ish but not clickable: every pointer event at the button's location hit the Profile panel instead. Playwright reported it precisely:

```
<div role="dialog"> … <button>Sign Out</button>
— click intercepted —
<span class="min-w-0 flex-1">Notifications</span> from
<div role="region" aria-label="Profile" class="fixed inset-0 z-[9999] …">
  subtree intercepts pointer events
```

Because the click landed on the panel, `onConfirm` never ran and `bos_session_token_v1` stayed in storage — i.e. the session did not end. The same component is used for *Delete Account*, so that confirmation had the same problem.

**Root cause.** `ConfirmDialog` portals to `document.body` with `z-[80]`, while `ProfileScreen` opens as a `fixed inset-0 z-[9999]` region. The dialog was rendered **below** the panel that opened it.

**Fix** (`src/components/ui/ConfirmDialog.tsx`): raise the portalled overlay to `z-[10000]`, above the app's highest panel layer. No other styling or behaviour changed.

**Verification.**

```
before: bos_session_token_v1 present, alert-free but still signed in
after:  bos_session_token_v1 = null, bos_user_profile_v1 = null, user_role = "customer",
        header shows "Continue with Google"
```

**Repro.** Sign in as customer → Profile → Sign Out → try to click the `Sign Out` button in the confirmation.

---

## 2. Fix summary

| ID | File | Change | Lines |
| --- | --- | --- | --- |
| D-1 | `src/components/ProviderDashboard.tsx` | seed selection from storage; guarded clear; membership validation; context-change event; pass id to PG workspace | ~+30 / −4 |
| D-2 | `src/components/VenueOwnerWorkspace.tsx` | use `buildAuthHeaders()`; reload on context change | +3 / −2 |
| D-3 | `src/components/ClassBatchManager.tsx` | clear stale error; reload on context change | +11 |
| D-4 | `src/components/ui/ConfirmDialog.tsx` | `z-[80]` → `z-[10000]` | +1 / −1 |

Total diff of these four files: `+45 / −7` (the same diff also contains the owner's pre-existing, preserved business-selector block in `ProviderDashboard.tsx`).

**Checks after the fixes:** `npx tsc --noEmit` exit 0 · `npm run build` exit 0 · 26/26 static UI source tests pass · browser run 13 PASS / 0 FAIL / 1 BLOCKED.

---

## 3. Residual issues and unexercised paths (not fixed, by design)

| # | Item | Assessment |
| --- | --- | --- |
| R-1 | **First-ever provider visit sends 3 header-less requests** before `/api/businesses` resolves. They now retry successfully, but the console still logs three 403s, and if the retry resolves before the first failure, the trainer console can keep “Your courses could not be loaded.” until the next load. | Cosmetic + one stale message. Eliminating it means deferring panel mounts until context resolves, or making the loader last-write-wins — a broader render change than this gate should make unasked. Reproduced only on a browser with no stored business id. |
| R-2 | **Live Edit cannot be exercised locally.** `resolveLiveEditAuthority` uses `supabase.auth.getUser()`; local development sessions are server-signed tokens with no Supabase session, so the panel shows `NOT_AUTHENTICATED`. | Harness limitation, not a product defect. Inline editing remains unverified in a browser; authorized edits were verified over the same session (200). |
| R-3 | **Suspended-account denial is not reachable in the browser.** `/api/auth/local-dev/session` only signs `account_status = 'active'` profiles, so the suspended fixture cannot obtain a UI session. | Covered by the integration suite (`403 ACTIVE_PROFILE_REQUIRED`, raised `LIVE_EDIT_ACTIVE_PROFILE_REQUIRED`), not by this gate. |
| R-4 | **Customer on a provider-only route receives `BUSINESS_CONTEXT_REQUIRED`** rather than `FORBIDDEN_PROVIDER_ROLE_REQUIRED` (S-1). | Unchanged; the request is still 403 with no side effect. Fixing the order is an authorization-policy change and was **not** made. |
| R-5 | **Module mismatch looks like “no data”.** With a `pg_hostels` business selected, the Classes and Venue panels legitimately return empty sets; the UI says “No … listings yet” rather than “this business does not serve this module”. | Presentation only. The server correctly refuses mismatched modules (`BUSINESS_MODULE_MISMATCH`). Recorded, not changed. |

## 4. Boundaries respected

* No change to `server.ts`, `src/server/providerListingRepository.ts`, `src/modules/businessPermissions.ts`, any repository, policy or migration.
* No 403 was relaxed, bypassed, or reordered to make a test pass.
* No hosted database statement, migration, dump, restore, credential or `.env` change; local PostgreSQL only.
* No Git reset/clean/checkout/stash/commit/push. The four component edits are unstaged working-tree changes next to the existing ones.
* Local verification data was cleaned up: the two listings created by the wizard were deleted, and the listing edited in the authorized-edit check was restored to its original title.
* Items that would require a policy, RLS or hosted-data decision (R-2, R-3, R-4) were stopped and reported rather than worked around.
