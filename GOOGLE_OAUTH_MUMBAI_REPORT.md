# Google OAuth for the Mumbai Supabase project — configuration and verification report

> **SUPERSEDED (2026-11-05):** this report describes the retired Mumbai project
> `sfoizxarbljhldmkgsma` and predates the current project
> `obkfgxjzlscungkhbyvq`. Current read-only evidence is in
> [OAUTH_AND_PRODUCTION_ENV_RECONCILIATION.md](OAUTH_AND_PRODUCTION_ENV_RECONCILIATION.md):
> Mumbai Auth reports Google enabled, Email/Phone disabled, anonymous disabled.

**Date:** 2026-11-04
**Working directory:** `/Users/aa/Downloads/bookourspace-react`
**New Mumbai project:** `sfoizxarbljhldmkgsma`
**Old Stockholm project:** `ezrxykyocgbolpaebnqx`
**Branch:** `feat/module-flags-and-stay-inventory` (dirty worktree, preserved)

No hosted write, no OAuth client creation, no commit, push, merge or deployment was performed.
Stockholm Supabase was **not** modified. Mumbai's hosted database and Auth settings were **not** modified.

---

## 1. Existing OAuth configuration found

### 1.1 The React app does not hold a Google OAuth client

A repository-wide search found **no** Google client id in the application code:

| Location | Finding |
|---|---|
| `src/**`, `index.html`, `server.ts` | no `VITE_GOOGLE_CLIENT_ID`, no `client_id`, no `*.apps.googleusercontent.com` |
| `.env.local` | only Supabase URL / project id / publishable key |
| `.env.example` | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `VITE_GOOGLE_CLIENT_ID` are **placeholders only** |
| git history | placeholders only, no real client id was ever committed |
| macOS keychain | a `bos-production-backup` entry exists; **no** Google client secret entry |

### 1.2 Google sign-in is delegated to Supabase Auth

`src/lib/supabaseClient.ts:810` calls `supabase.auth.signInWithOAuth({ provider: 'google' })`. The browser is sent to the **Supabase project's** authorize endpoint, which performs the Google handshake:

```
browser → https://<project>.supabase.co/auth/v1/authorize?provider=google&redirect_to=<app>/auth/callback
        → Google                                   (the Web Client lives here)
        → https://<project>.supabase.co/auth/v1/callback
        → http://localhost:5173/auth/callback?role=customer
```

**Consequence:** the Google OAuth Web Client id and secret are **Supabase Auth credentials** (Authentication → Providers → Google), not application credentials. The server says so explicitly — `server.ts:1932` returns `googleCloudConfigured: false` and *"Google sign-in is delegated to Supabase Auth for the explicitly configured project."*

### 1.3 Hosted OAuth state (read-only)

| Probe | Result |
|---|---|
| Mumbai `GET /auth/v1/settings` with its publishable key (2026-11-04) | **HTTP 200** — `google: false`, `email: true`, `phone: false` |
| Mumbai migration list and public schema | Migration API returned no migrations; no public tables and no `supabase_migrations.schema_migrations` table exist |
| Stockholm | Not queried during this phase and not modified. Prior report evidence is not a current verification. |

Mumbai Google sign-in is currently disabled and Email is enabled. No hosted setting was changed.

### 1.4 The identity and role contract (already correct)

`src/server/supabaseGoogleIdentity.ts` accepts a session only when **all** of these hold: a valid Supabase Auth UUID, a **verified** e-mail, and a **Google** provider identity. `server.ts` then calls `authenticateOrRegisterGoogleUser` with `requestedRole: 'customer'` and `allowRoleChange: false`, and the durable profile row decides the role:

* `private.provision_google_profile(...)` reads the e-mail from the **`auth.users`** row (never from the browser) and writes `role = 'customer'`, `account_status = 'active'`.
* `GET /api/auth/me` re-reads the role from the authoritative profile (`effectiveRole = String(profile.role)`).
* The Super Admin scope comes from the protected database function `is_current_user_super_admin`, never from an e-mail address.

**No change was needed for the role contract, and the Super Admin security fixes are untouched.**

---

## 2. Can the old React Web Client be reused? — **Likely; not verified**

A Google OAuth Web client can register multiple authorized redirect URIs, so the same client can serve both projects if the existing client is still valid and available. The actual client ID/secret and redirect list were not verified through Google Cloud or dashboard access. Reuse requires two things and creates nothing new:

1. add Mumbai's Supabase callback to the **existing** client's *Authorized redirect URIs* (keeping Stockholm's), and
2. enter the **same** client id and secret into **Mumbai's** Supabase Auth → Providers → Google.

The only value that is **not** reusable is the Supabase **publishable key**: it is scoped to one project, so Mumbai needs its own.

---

## 3. Exact manual Google Cloud settings required

**Google Cloud Console → the existing OAuth 2.0 Web client (do not create a new one) → Authorized redirect URIs**

```
https://sfoizxarbljhldmkgsma.supabase.co/auth/v1/callback   ← add this
https://ezrxykyocgbolpaebnqx.supabase.co/auth/v1/callback   ← keep this
```

Nothing else changes on the Google client: keep the same OAuth type (**Web application**), the same client id and the same client secret. The client secret stays in Google and in Supabase Auth — **never** in this repository or in frontend environment variables.

**Google Cloud Console → OAuth consent screen:** confirm the consent screen still lists the accounts that should reach BookOurSpace. The screen is shared by both projects, so a change there affects Stockholm as well.

---

## 4. Exact Mumbai Supabase settings required

**Mumbai dashboard → Authentication → Providers → Google**

| Field | Value |
|---|---|
| Enable Google provider | on |
| Client ID | the **same** Web client id as Stockholm |
| Client Secret | the **same** Web client secret as Stockholm |
| (Optional) Skip nonce check | leave as it is on Stockholm, so the two projects behave the same |

**Mumbai dashboard → Authentication → URL Configuration**

| Field | Value |
|---|---|
| Site URL | Production React application origin |
| Additional redirect URLs | Exact React app callback, e.g. `https://<production-host>/auth/callback`; optionally `http://localhost:5173/auth/callback` for local development |

The Supabase callback `https://sfoizxarbljhldmkgsma.supabase.co/auth/v1/callback` belongs in the Google Cloud OAuth client's **Authorized redirect URIs**, not Supabase's post-login Redirect URLs.

**Mumbai dashboard → Authentication → Sign In / Providers** — enable Google, disable Email and Phone, and keep anonymous sign-in disabled for Google-only authentication.

**Mumbai dashboard → Project Settings → API** — copy the publishable key into `.env.local.mumbai` (and `.env.local`).

**Mumbai database (only when the hosted migration is approved)** — the schema in `supabase/migrations/` must be applied, including `20261104110000_google_profile_provision_rpc.sql` and `20261104120000_admin_provider_activation_rpc.sql`. The existing guardrails are in place and were exercised offline:

| Guardrail | Command | Result |
|---|---|---|
| Migration plan, no connection | `bash supabase/install_mumbai_migrations.sh --plan` | PASS — Mumbai only; baseline + all 30 migrations listed |
| Remote history and schema | Mumbai read-only Supabase tools | PASS — no migration history table, no recorded migrations, no public tables |
| Apply | Not run | **BLOCKED pending explicit approval**, verified backup, and the installer’s guarded preflight |
| Backup + isolated restore | `scripts/backup_database.sh` + `scripts/verify_backup_restore.sh` | PASS — "RESTORE VERIFIED — backup is complete and restorable" (run against a local disposable database) |
| Mumbai hosted backup availability | Supabase Dashboard → Database → Backups / PITR | **BLOCKED** — status not available through current read-only tools; no hosted backup was taken. Require a fresh verified backup before apply. |
| Migration-history reconciliation | `BOS_HISTORY_SELFTEST=1 bash supabase/tests/compare_migration_history.sh` | PASS — MATCH and drift detection both behave correctly |
| Offline configuration preflight | `npx tsx scripts/supabase-dev-preflight.ts` | PASS — no network request, no key printed |

---

## 5. Local code changes made

| Change | File | Why |
|---|---|---|
| Local target switched to Mumbai | `.env.local` (gitignored) | Phase 3.1 — the React local development target is Mumbai |
| Stockholm preserved verbatim | `.env.local.stockholm` (gitignored) | "Preserve all existing environment files and secrets" |
| Mumbai project file and active local config | `.env.local.mumbai`, `.env.local` (gitignored) | Both target Mumbai and contain its publishable key; the original files were preserved in permission-0600 backups |
| One-command project switch | `scripts/use-supabase-project.sh` (new) | `mumbai` / `stockholm` / `show`; never prints a key |
| Offline OAuth readiness check | `scripts/check-google-oauth.mjs` (new) | Verifies both callbacks, the redirect, the secret-leak scan and the role authority; prints the manual steps |
| Offline OAuth E2E harness | `supabase/tests/run_mumbai_oauth_e2e.sh` + `tests/mumbai-oauth.e2e.mjs` (new) | Proves the whole OAuth path against a local Supabase Auth stand-in |
| Local Supabase Auth stand-in | `tests/support/fake-supabase-auth.mjs` (new) | Loopback-only; never contacts Google or Supabase |
| npm scripts | `package.json` | `audit:oauth`, `supabase:use`, `test:db:mumbai-oauth` |

The Mumbai publishable key was read from the Mumbai project and written only to the two Mumbai environment files. Prior file contents were preserved in permission-0600 backups; both files are now permission-0600 and gitignored. The key value is not recorded in this report.

---

## 6. PASS / FAIL / BLOCKED

### 6.1 `npm run audit:oauth` — **PASS (0 failures, offline)**

| Check | Result |
|---|---|
| Mumbai resolves with the expected project and `https://sfoizxarbljhldmkgsma.supabase.co/auth/v1/callback` | PASS |
| Stockholm still resolves with `https://ezrxykyocgbolpaebnqx.supabase.co/auth/v1/callback` | PASS |
| The browser redirect targets the configured project's `/auth/v1/authorize` | PASS (both projects) |
| The provider is Google only | PASS (both projects) |
| The post-login redirect returns to the React application | PASS (both projects) |
| The role is carried in the redirect, never in the identity | PASS |
| No Google client secret, service-role key, `sb_secret_` key or database URL in any frontend source file | PASS |
| Every local env file is git-ignored | PASS |
| A Google sign-in always requests `customer` and never allows a role change | PASS |
| The session role is re-read from the authoritative profile row | PASS |
| The Super Admin scope comes from a protected database function, not an e-mail address | PASS |
| Only a verified Google identity is accepted | PASS |

### 6.2 `npm run test:db:mumbai-oauth` — **PASS (20/20 checks + database invariants, offline)**

| Check | Result |
|---|---|
| The OAuth URL route is available | PASS |
| The redirect targets the configured project's authorize endpoint | PASS |
| The redirect asks for the Google provider only | PASS |
| The post-login redirect returns to the React application | PASS |
| The server reports the configured project's auth callback | PASS |
| A **non-Google** identity is refused (`401 INVALID_GOOGLE_SESSION`) | PASS |
| An **unverified** Google e-mail is refused (`401`) | PASS |
| A request without a Supabase session is refused (`401`) | PASS |
| A new Google identity is signed in (`201`, `isNewUser: true`) | PASS |
| The new session is a customer session | PASS |
| A session token is issued | PASS |
| The same identity signs in again | PASS |
| The existing account is reused, **not** duplicated | PASS |
| The session reports the role from the database | PASS |
| A customer is refused an administrator-only route (`403`) | PASS |
| A customer cannot obtain a super administrator session (`403`) | PASS |
| An expired session is refused (`401`) | PASS |
| Logout succeeds | PASS |
| The session is refused after logout (`401`) | PASS |
| Database invariant: exactly **one** profile row, `role = customer`, `account_status = active` | PASS |
| Database invariant: exactly **one** `auth.users` row | PASS |

### 6.3 Live application check with the Mumbai target

| Check | Result |
|---|---|
| The application boots and serves the shell with the Mumbai environment | PASS (`http=200`) |
| `GET /api/auth/me` without a session | PASS (`401 UNAUTHORIZED_SESSION`) |
| `GET /api/auth/google/url` reports the **Mumbai** project and the **Mumbai** callback | PASS (`supabaseProjectId = sfoizxarbljhldmkgsma`, `supabaseAuthCallbackUrl = https://sfoizxarbljhldmkgsma.supabase.co/auth/v1/callback`) |
| Local React env resolves to Mumbai and passes `scripts/supabase-dev-preflight.ts` | PASS; key value withheld |
| Mumbai Auth provider settings | BLOCKED for login: read-only probe reports `google: false`, `email: true`, `phone: false` |
| Live Google sign-in | BLOCKED — dashboard configuration is unchanged and no real Google login was attempted |

### 6.4 Regression

| Command | Result |
|---|---|
| `npm test` | **PASS** — 130 tests: 116 passed, 0 failed, 14 skipped |
| `npm run lint` (`tsc --noEmit`) | **PASS** |
| `npm run build` | **PASS** |
| `bash supabase/tests/run_local_validation.sh` | **PASS** |
| `bash supabase/tests/run_pg_admin_e2e.sh` | **PASS** (42/42 + 4/4 + 21/21 + 148 browser checks) |
| `git diff --check` | **PASS** |
| Six marketplace modules | PASS in local disposable-database/browser suites. The first combined run exposed an ambiguous venue-card selector; the venue locator was scoped to the All Venues section and the full venue suite then passed in Chromium, Firefox, and WebKit plus restart persistence. |

### 6.5 BLOCKED — genuinely not proven here

| Item | Why |
|---|---|
| **A real Google sign-in** | No Google account, no browser session and no client secret were used, and no hosted Auth settings were changed. The OAuth path was proven against a **local Supabase Auth stand-in**, which is not the same as a live Google login. **This must not be reported as a live PASS.** |
| Existing Google Web Client id/secret and Google Cloud redirect list | Not present in local React config and not verified in Google Cloud or either dashboard. Confirm in the existing Web client/password manager; never put the secret in this repository or chat. |
| Mumbai Google-only provider state | Google is disabled and Email is enabled. Dashboard changes require separate approval. |
| Stockholm | Not queried or modified during this phase. Keep its existing callback when configuring Mumbai. |
| Mumbai's hosted schema | Not applied. The plan, backup, restore and history-reconciliation guardrails were exercised locally and hold. |

---

## 7. Remaining manual steps

1. **Google Cloud Console** → verify the existing OAuth 2.0 Web client. Add `https://sfoizxarbljhldmkgsma.supabase.co/auth/v1/callback` to **Authorized redirect URIs** and keep `https://ezrxykyocgbolpaebnqx.supabase.co/auth/v1/callback`. Do not create a second client.
2. Using the approved password manager, reuse the existing Web client ID and secret in **Mumbai dashboard → Authentication → Sign In / Providers → Google** and enable Google. Never place the secret in React env files, source code, Git, or chat.
3. In **Mumbai dashboard → Authentication → Sign In / Providers**, disable Email and Phone and ensure anonymous sign-in is disabled.
4. In **Mumbai dashboard → Authentication → URL Configuration**, set Site URL to the production React origin and allow the exact React callback (for example `https://<production-host>/auth/callback`; optionally `http://localhost:5173/auth/callback`). The Supabase `/auth/v1/callback` is for Google Cloud's Authorized redirect URIs.
5. Local Mumbai env files already contain Mumbai's publishable key and passed `npx tsx scripts/supabase-dev-preflight.ts`; no further key copy is needed.
6. **Only with explicit approval:** after a verified backup and review of the clean remote baseline state, run `bash supabase/install_mumbai_migrations.sh --plan`, then use its guarded `--apply` procedure. Never use the Stockholm-specific scripts.
7. After dashboard configuration is approved, perform one real Google sign-in against Mumbai and then rerun the offline `npm run test:db:mumbai-oauth` regression.

### Rollback

`bash scripts/use-supabase-project.sh stockholm` restores the previous Stockholm target instantly; `.env.local.stockholm` was preserved byte-for-byte and no Stockholm configuration was touched.
