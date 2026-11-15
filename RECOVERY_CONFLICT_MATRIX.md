# BookOurSpace Recovery Conflict Matrix

Date: 2026-11-15
Canonical checkout: /Users/aa/Projects/bookourspace-final
Canonical branch/HEAD: integration/recover-20261115 / b784023f7b89ace58845966dfe524a1e080bf1cc
Target: Naren-SDET-QA/bookourspace-react

## Read-only scope and safety

This report was produced without staging, committing, merging, rebasing, resetting, cleaning, pushing, deploying, or running database migrations. No secrets or environment-file contents were printed. The canonical checkout currently has pre-existing modifications in RECOVERY_MASTER_INVENTORY.md, server.ts, and src/components/AdminDashboard.tsx, plus untracked e2e-artifacts/; these were preserved.

## Reference repositories and refs

| Reference | Ref / HEAD | Finding |
|---|---|---|
| Canonical recovery | integration/recover-20261115 / b784023 | Recovery lineage includes business ownership, provider operations, and recovery documentation. |
| Current remote main | origin/main / 6dfecbf | Rewritten current main; canonical recovery is ahead with a broad recovery diff. |
| Main rewrite backup | origin/backup/main-before-author-rewrite / 3230675 | Preserved backup; local shorthand backup/main-before-author-rewrite is not available in the canonical checkout. |
| Local working main | /Users/aa/Documents/ChatGPT/react, main / 6dfecbf | Clean checkout observed earlier; same current main tip. |
| GPS branch | origin/feat/universal-gps-tracking / 96c1297 | Feature lineage is represented in canonical recovery; downloaded copy has a modified ProviderDashboard.tsx. |
| Module/stay branch | origin/feat/module-flags-and-stay-inventory / 9fd81e6 | Earlier module/stay implementation; canonical has later migrations and provider/business hardening. |
| Movies UPI branch | origin/feat/movies-upi-payment / 4526d11 | Earlier standalone movie/payment implementation; nested application is a duplicate candidate, not a safe drop-in. |
| Final dev | origin/final-dev / 1f8275e | Older customer-access and marketplace work. |

## Feature matrix

| Feature | Canonical | origin/main | Backup | Other branches | Downloads | Best implementation |
|---|---|---|---|---|---|---|
| WhatsApp | src/server/evolutionWhatsApp.ts, src/server/whatsappFaq.ts, server.ts | Present in current main lineage | Preserved | Notifications/audit lineage includes 0f4009f and 59cab1e | Archive copies may contain UI-only text | Canonical server-side implementation; verify webhook/auth boundary |
| Resend email | src/server/resendEmail.ts, src/server/resendTransactionalEmails.ts, tests/resend-email.test.mjs | Present | Preserved | Notification/media commits 59cab1e and 61a4df3 | No superior standalone implementation found | Canonical server-side implementation |
| Universal GPS tracking | Device/tracking hooks, components, migration 20261111190000, tests | Present | Preserved | origin/feat/universal-gps-tracking at 96c1297 | Download checkout has modified ProviderDashboard.tsx | Canonical recovery plus targeted dashboard comparison |
| Provider portal/onboarding | Provider components/APIs, business APIs, migrations, E2E/tests | Present but older | Preserved | origin/dev, final-dev, fix-listing-images | Capacitor/archive copies are behind or duplicated | Canonical recovery business-scoped implementation |
| Customer login/auth | CustomerLoginExperience.tsx, SimpleLoginPage.tsx, authIdentity.ts, authAccessSettings.ts | Present | Preserved | Auth fixes include f9dd635, 39946a1, 8ab74b4 | Nested movie app has competing auth client | Canonical single auth path |
| Google OAuth and OTP | supabaseGoogleIdentity.ts, googleSignIn.ts, emailOtpAuth.ts, auth E2E/tests | Present | Preserved | Older variants in final-dev and feature refs | Nested app has duplicate Google/OTP paths | Canonical Supabase/server auth |
| Admin console | AdminDashboard.tsx, SupremeAdminControlPanel.tsx, APIs/tests | Present | Preserved | origin/dev has visual shell changes | Nested app contains separate admin console | Canonical authorized admin console |
| PG | PG experiences, workspaces, repositories/APIs, payment and E2E suites | Present | Preserved | fix-listing-images adds earlier owner workspace | Older copies only | Canonical recovery |
| Hotels/Stays | StaysExplorer.tsx, stay APIs/payments, migrations/E2E | Present | Preserved | Module/stay branch older | Capacitor mirrors web source; native unverified | Canonical recovery |
| Function halls/venues | HallsMandapExperience.tsx, venue APIs/components, migrations/tests | Present | Preserved | Older venue work in dev/final-dev | Archive copies contain older demos | Canonical recovery |
| Movies/UPI | MoviesNowShowing.tsx, movie APIs, movie migrations, security tests | Present; showtimes-only behavior retained | Preserved | movies-upi-payment branch at 4526d11 | Nested full duplicate app | Canonical recovery; selectively audit nested tests |
| Services | Discovery/booking/dispatch/category builder/provider dashboards and migrations | Present | Preserved | 63da6f6, 9daf27d, 59cab1e are earlier work | Older exports | Canonical recovery |
| Classes/Institutes | Enrollment, institute workspace, batches, APIs/tests, migrations | Present | Preserved | classes branch is older | Classes worktree is superseded/dirty | Canonical recovery |
| Booking/payments | Vertical APIs, Razorpay/UPI/pay-at-property, idempotency/security tests | Present | Preserved | Payment hardening spread across history | Nested app has simulated payment tests and separate server | Canonical recovery |
| Supabase migrations | Ordered migration chain, manifest, rollback and tests; latest visible migration 20261115120000 | Older subset | Preserved | Recovery adds tracking, institute, business, permissions and security | Nested monolithic schema is not equivalent | Canonical migration chain |
| Edge Functions | No independent supabase/functions tree found in inspected canonical files | Same observation | Same | No required function evidence yet | None proven | Confirm external functions before copying anything |
| Security/RLS | RLS migrations, security tests, fail-closed reports, business policies | Present but behind recovery hardening | Preserved | Security commits across safe-main/recovery | Nested schema/RLS is competing older design | Canonical recovery policies |
| Tests and CI/CD | .github/workflows/ci.yml, unit/integration/E2E/Supabase suites | Present | Preserved | consolidate-pr1 contains CI history | Nested app has limited scripts/tests and no equivalent CI | Canonical CI/test structure |

## Missing/newer/duplicate findings

- No requested business feature was proven completely missing from canonical recovery.
- Canonical recovery is dirty and must not be treated as a final merge source until modified server.ts and AdminDashboard.tsx are explained.
- The downloaded GPS checkout contains modified ProviderDashboard.tsx; this is the highest-priority file comparison.
- The nested movie application contains payment/refund verification scripts and a broad standalone server, but also duplicates auth, admin, data, UI, Supabase client, and configuration.
- No independently deployable Edge Functions were identified in the inspected canonical tree.
- origin/main is not the newest feature source; recovery commits and remote feature refs contain later business/provider/tracking/migration work.

## Nested movies-upi-payment investigation

The nested app is a separate Vite/Express application with its own package.json, server.ts, src/App.tsx, Supabase client, supabase/schema_and_rls.sql, and tests. It includes broad simulated payment/refund tests, movie and multi-vertical payment endpoints, its own Google/OTP/auth paths, and its own admin/provider/UI/data implementations.

It does not provide a migration-compatible replacement for the canonical Supabase history, and its tests do not prove canonical runtime behavior. Recommended treatment: retain it as audit evidence, compare payment/security contracts endpoint-by-endpoint, and integrate only proven missing behavior after adapting it to canonical APIs and RLS.
