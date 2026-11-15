# BookOurSpace Recovery Master Inventory

Date: 2026-11-15  
Canonical project: `/Users/aa/Projects/bookourspace-final`  
Target repository: `Naren-SDET-QA/bookourspace-react`

## Discovery safety state

- Canonical checkout branch: `integration/recover-20261115`
- Canonical HEAD: `b784023` (`docs(recovery): record the phase 4 integration log`)
- Canonical working tree: **dirty**; untracked `e2e-artifacts/` exists
- Canonical remote: `origin` → `https://github.com/Naren-SDET-QA/bookourspace-react.git`
- No merge, overwrite, reset, clean, force-push, production database write, or deployment was performed during this discovery pass.
- Secrets were not printed or copied into this inventory.

## Feature inventory

| Feature | Source folder | Branch/commit | Files / evidence | Status | Missing dependencies or risks |
|---|---|---|---|---|---|
| WhatsApp integration and webhook/security handling | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | `src/server/evolutionWhatsApp.ts`, `src/server/whatsappFaq.ts`, `server.ts`, WhatsApp-related migrations/tests | Implemented; integration must be verified from the application entry point | Provider credentials, webhook configuration, safe test recipient, hosted verification still required |
| Resend transactional email | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | `src/server/resendEmail.ts`, `src/server/resendTransactionalEmails.ts`, `tests/resend-email.test.mjs` | Implemented; test coverage exists | Server-side Resend key/from-address configuration; no real customer sends during testing |
| Universal GPS/delivery tracking | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | `src/hooks/useDeviceLocation.ts`, `src/hooks/useDeliveryTracking.ts`, `tests/universal-delivery-tracking.test.mjs`, provider/customer components | Implemented in canonical source; runtime and permission flow require verification | Device permissions, realtime/backend configuration, safe test fixtures |
| Provider portal and owner workflows | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | Provider dashboards, `src/server/provider*`, `src/server/businessApi.ts`, provider E2E/tests | Implemented and substantially integrated | Role/business fixtures and database-backed E2E validation |
| Customer login/authentication | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | `src/server/authIdentity.ts`, `src/server/emailOtpAuth.ts`, `src/server/supabaseGoogleIdentity.ts`, `e2e/auth-entrypoints.spec.ts`, auth tests | Implemented; duplicate-auth risk must be checked | OAuth/OTP environment configuration and hosted callback verification |
| Admin and super-admin controls | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | `src/components/AdminDashboard.tsx`, `src/components/SupremeAdminControlPanel.tsx`, admin APIs/tests | Implemented and reachable through authorized flows | Hosted admin/session verification; preserve RLS and fail-closed policies |
| PG / hostel marketplace | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | PG components, repositories, APIs, migrations, E2E and integration tests | Implemented | Disposable database and payment test environment |
| Hotels / stays marketplace | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | `src/components/StaysExplorer.tsx`, stay APIs/payments, stays E2E/tests | Implemented; hosted readiness remains separate | Razorpay sandbox and database fixtures; no production payment activity |
| Home services marketplace | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | Services components/APIs, dispatch, category builder, lifecycle tests | Implemented | Provider/service fixtures and safe integration environment |
| Institutes/classes/venues | `/Users/aa/Projects/bookourspace-final` | `integration/recover-20261115` / `b784023` | Institute workspace, classes enrollment, venue booking APIs/components/tests | Implemented | Database-backed journey validation |
| Movies and UPI booking | Canonical source plus nested duplicate `/movies-upi-payment` | Canonical recovery history; nested copy has separate lineage | `src/components/MoviesNowShowing.tsx`, movie API/tests, duplicate nested app | Canonical implementation exists; nested copy is a duplicate candidate | Must compare exact deltas before removing or integrating; do not blindly copy |
| Database migrations, RLS, and Edge/server functions | `/Users/aa/Projects/bookourspace-final/supabase`, `src/server` | Recovery lineage through `b784023`; remote `origin/main` at `6dfecbf` | Migration files, manifests, security/readiness reports, server APIs | Present; reconciliation required | Current remote base and rewritten history must be compared before any branch integration |
| Mobile Capacitor shells | `/Users/aa/Downloads/bookourspace-react-capacitor` and canonical mobile files | Separate Capacitor worktree/history | `android/`, `ios/`, `src/mobile` | Shared web source exists; native parity unverified | Controlled sync and emulator/simulator approval required |

## Source locations inspected

- `/Users/aa/Projects/bookourspace-final` — canonical recovery checkout.
- `/Users/aa/Documents/ChatGPT/react` — clean local `main`, HEAD `6dfecbf`, tracking `origin/main`.
- `/Users/aa/Downloads/bookourspace-react` — branch `feat/universal-gps-tracking`, HEAD `96c1297`; its tree currently matches the local main tree in the comparison performed.
- `/Users/aa/Downloads/bookourspace-react-capacitor` — mobile/native copy; requires separate controlled comparison.
- `/Users/aa/Downloads/bookourspace-react-classes-wt` — classes worktree.
- `/Users/aa/Downloads/bookourspace-aistudio-final` — AI Studio branch/copy.
- `/Users/aa/Downloads/bookourspace-codex`, `bookourspace-freebuff`, `bookourspace-kilo`, `bookourspace-opencode`, `bookourspace-movies-upi`, and `bookourspace-react-merged` — additional downloaded copies/worktrees.
- `/Users/aa/Projects/bookourspace-aistudio` and `/Users/aa/Projects/bookourspace-recovery-2026-11-15` — additional project copies.
- Other BookMySpace/BookOurSpace folders under `/Users/aa`, including Android projects and backup directories, were located and require classification as source, backup, native, or archive before any code import.
- Freebuff and DeepSeek application data locations were inspected as metadata/session/cache sources; they are not treated as source code without a direct project checkout or explicit file-level evidence.

## Git history and protection findings

- Local `main`: `6dfecbf`; local reflog preserves the pre-rewrite lineage at `refs/original/refs/heads/main` → `a0c6fe2`.
- `backup/main-before-author-rewrite`: `3230675` is present locally and remotely.
- `origin/main`: `6dfecbf`.
- Recovery checkout includes commits `76945cf`, `5b136bc`, `2a774b6`, `a56e82b`, and `b784023`.
- Additional remote branches and backup refs were enumerated; no ref was deleted or rewritten.
- The canonical checkout’s untracked `e2e-artifacts/` must be preserved and classified before any backup or branch operation.

## Duplicate/conflict candidates

1. The nested `movies-upi-payment/` application duplicates canonical movie, data, payment, admin, and shared UI files.
2. Multiple downloaded AI Studio/BookMySpace exports may contain older versions of marketplace components and must not override canonical files without commit-level comparison.
3. Separate auth implementations must be compared around Supabase Google identity, email OTP, local/demo sessions, and any downloaded login flows.
4. WhatsApp and Resend code exists in the canonical recovery checkout; importing another copy before comparing APIs/configuration would risk duplicate endpoints and webhook behavior.
5. Capacitor contains native files that must not be overwritten by web-source synchronization.

## Proposed next phase — review required before integration

1. Snapshot each repository’s status, HEAD, refs, and untracked files without exposing secrets.
2. Compare canonical recovery history to current `origin/main`, backup main, remote feature branches, and downloaded repositories using commit/file manifests.
3. Produce a conflict matrix for WhatsApp, Resend, GPS, auth, provider, admin, migrations, and tests.
4. Create recoverable source/ref backups only after confirming exact targets and preserving all dirty files.
5. Present the conflict matrix and integration plan for review.
6. Only after review: create a dedicated integration branch from the verified remote base, integrate one feature family at a time, run feature-specific validation, and commit locally.

## Current conclusion

The canonical recovery checkout already contains the requested feature families, but source presence is not proof of complete runtime integration. The main unresolved work is evidence-based comparison against the rewritten remote base and duplicate copies, followed by safe validation. No feature should yet be marked fully recovered until its real application entry point and relevant tests pass.
