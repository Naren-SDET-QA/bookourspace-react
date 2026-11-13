# Repository consolidation audit

Date: 2026-11-13 · Audited base: `main` = `e1b44af` · Destination repository:
`Naren-SDET-QA/bookourspace-react`.

This audit covers every local clone and every remote branch of the project. It
exists to answer one question: **is any implementation missing from `main`?**

Earlier audits are preserved in
[`dev-branch-consolidation.md`](dev-branch-consolidation.md) (base `9fd81e6`,
71 migrations) and
[`final-universal-consolidation.md`](final-universal-consolidation.md) (base
`39946a1`). This document supersedes them with the state after the November 2026
audit repairs.

## 1. Repository inventory

| Clone / repository | Ref | State | Finding |
|---|---|---|---|
| `bookourspace-final` (local) | `origin/main` = `e1b44af` | clean | Clone of **bookourspace-react**. This is the destination; `main` is the source of truth. |
| `bookourspace-react` (GitHub) | `main` = `e1b44af` | — | Destination repository. There is **no** GitHub repository named `bookourspace-final` (`git ls-remote` returns "Repository not found"); "bookourspace-final" is only the local directory name. |
| `bookourspace-aistudio` (local) | `d34eda3`, 65 commits behind `main` | 56 dirty paths | Separate AI-Studio clone of the same repository. Its dirty tree was compared file-by-file against `main` (section 4). |
| `movies-upi-payment/` tree | `4526d11` | — | Vendored copy of an older app inside a subdirectory (≈80k lines). Not application work. |

No other local clone contains BookOurSpace source.

## 2. Branch audit

`git rev-list --count` against `main` at `e1b44af`:

| Branch | Ahead | Behind | Verdict |
|---|---|---|---|
| `main` | 0 | 0 | Destination |
| `aistudio-final` | 0 | 119 | Fully contained; AI Studio UI already on `main` |
| `dev` | 0 | 91 | Fully contained |
| `final-dev` | 0 | 37 | Fully contained (merged in `fc2335d`) |
| `feat/module-flags-and-stay-inventory` | 0 | 105 | Fully contained |
| `codex/consolidate-pr1` | 0 | 66 | Fully contained (merged) |
| `codex/bookourspace-image-fix` | 0 | 53 | Fully contained |
| `codex/bookourspace-image-reload-fix` | 0 | 26 | Fully contained |
| `codex/fix-listing-images` | 0 | 45 | Fully contained |
| `codex/safe-main-integration` | 0 | 55 | Fully contained |
| `codex/prepare-aistudio` | 1 | 65 | Only unique commit: `aa21ea8` (AI Studio UI). Its Spotlight components, tests and config are on `main`; `MarketplaceHero.tsx` was **intentionally deleted** on `main` by `38ceaee fix(ui): remove marketplace hero from all sections`. Nothing to port. |
| `feat/bookourspace-live-audit` | 1 | 116 | Only unique commit: `5f931cb`. Implements a *different* Movies model (normalized `movie_theatres` / `movie_titles` / `movie_showtimes`, `cinema_private` permissions, bootstrap admins, `movies:sync`). It was applied to Supabase project `ezrxykyocgbolpaebnqx`, not this project, and conflicts with the shipped showtimes-only design (section 5). Intentionally not ported. |
| `feat/movies-upi-payment` | 1 | 116 | Only unique commit: `4526d11`. Adds the nested `movies-upi-payment/` duplicate tree. The movie UPI/payment flow is already implemented in `main`. Duplicate, not ported. |

## 3. Feature consolidation on `main`

| Area | Implementation | Migrations / tests |
|---|---|---|
| Authentication: Google + Email OTP | `src/server/authIdentity.ts`, `src/server/emailOtpAuth.ts`, `src/lib/supabaseClient.ts`; provider canonicalized to `google \| email` | `tests/authentication-security.test.mjs`, `tests/email-otp-*`; [`email-otp-auth.md`](email-otp-auth.md) |
| Session/role authority | `src/server/adminAuthorization.ts`, `memberAccess.ts`, `customerModuleAccess.ts`; server re-verifies Supabase identity for every privileged write | `tests/admin-authorization*`, `tests/customer-module-access-grants.test.mjs` |
| Business ownership | `src/server/businessApi.ts`, `src/components/pg/Business*Panel.tsx`, `src/components/admin/BusinessAccessPanel.tsx` | `20261112010000_business_ownership_phase1.sql`, `20261112020000_business_ownership_phase2_backfill.sql`; [`business-ownership-migration-manifest.md`](business-ownership-migration-manifest.md) |
| Provider portal | `src/components/ProviderDashboard.tsx`, `src/components/ProviderOnboardingForm.tsx` | `20261113010000_provider_portal_membership_guard.sql` (admin-only writes + scope-checked definer invite/accept RPCs), `tests/provider-portal-membership-guard.test.mjs` |
| Customer module access | `src/server/customerModuleAccess.ts`, `moduleGate.ts` | `20261113000000_customer_module_access.sql` (read/write grants so RLS is enforced), [`customer-module-access.md`](customer-module-access.md) |
| Payments, invoices, receipts | `src/server/pgPaymentsApi.ts`, `pgPaymentRepository.ts`, `stayPayments.ts`, `invoicePdf.ts`, `src/utils/gstInvoiceGenerator.ts`, `PaymentModal.tsx` | `20261103190000_stay_checkout_and_payment_intents.sql`, `20261103211000_*`, `20261103220000_pg_payment_lifecycle.sql`, `20261113020000_payment_claim_business_trigger.sql` |
| Media security | `src/server/privateMediaSignApi.ts`, `mediaValidationApi.ts`, `src/lib/media/signedStorageUrl.ts`, `SafeImage.tsx` | `tests/private-media-sign-api.test.mjs`, `tests/signed-storage-url.test.mjs`, `e2e/safe-image-rendering.spec.ts` |
| Movies (showtimes-only) | `src/server/moviesShowtimesApi.ts`, `MoviesShowtimes.tsx`; schema-capability detection returns `503 MOVIES_APPROVAL_MIGRATION_REQUIRED` until the approval migration is applied | `20261108120000_movies_showtimes_only.sql`, `20261108130000_movies_showtimes_dates.sql`, `20261112330000_movies_state_approval.sql`; [`movies-showtimes-only.md`](movies-showtimes-only.md) |
| Stays / host / search | `src/server/stayHostApi.ts`, `staySearchApi.ts`, `src/components/stay/*` | `tests/stay-*`, `e2e/stays-*.spec.ts` |
| Module flags + six modules | `src/server/moduleGate.ts`, `moduleHealth.ts`, `platformSettingsApi.ts` | [`modules.md`](modules.md) |
| Account closure + retention | `src/server/accountClosureApi.ts` | `supabase/tests/account_closure_test.sql` |
| WhatsApp / Evolution dev | `src/server/evolutionWhatsApp.ts` | [`evolution-whatsapp-dev.md`](evolution-whatsapp-dev.md) |

## 4. AI-Studio clone comparison (56 dirty paths)

Each dirty path in `bookourspace-aistudio` was diffed against the same path on
`main`:

| Result | Count | Meaning |
|---|---|---|
| Identical to `main` | 34 | Work already consolidated |
| Stray `tsx` binary/symlink | 1 | Not source (build artifact) |
| Differs | 21 | All are **older** revisions; `main` is a superset |

The 21 differing paths are docs/config (`README.md`, `.env.example`,
`deploy/*`, `docs/*`), files rewritten by the November repairs (`server.ts`,
`ProviderDashboard.tsx`, `SafeImage.tsx`, `MarketplaceContext.tsx`,
`signedStorageUrl.ts`, `privateMediaSignApi.ts`) and the tests around them.
Spot-checked deltas all show `main` ahead, for example:

- `providerListingRepository.ts`: clone has `authProvider?: 'google'`; `main` has
  the verified `google \| email` union plus server-owned `businessId`.
- `staySearchApi.ts`: clone lacks the permanent `42501`/`0LP01` permission
  backoff that `main` uses to avoid re-opening failing transactions.
- `stayHostApi.ts`: clone lacks the persistable-URL documentation and guards.
- `tests/migration-dry-run-safety.test.mjs`: clone asserts a hard-coded 73
  migrations; `main` asserts the manifest is internally consistent at 109.
- `tests/signed-storage-url.test.mjs`: clone lacks the encoded-slash
  (`%2F`) rejection and `firstUsableListingImage` coverage.
- `supabase/certs/supabase-root-ca.crt`: differs in formatting only — identical
  SHA-256 fingerprint `80:70:25:AD:…:CA:FA` (Supabase Root 2021 CA).

No file in that clone is newer than `main`.

## 5. Why the old Movies model is not merged

`feat/bookourspace-live-audit` ships a normalized catalogue
(`movie_theatres`, `movie_titles`, `movie_showtimes`) maintained by
`npm run movies:sync`, with `cinema_private.admin_permissions` and bootstrap
admins. Its own `MOVIES_VISIBILITY.md` records that it was applied to project
`ezrxykyocgbolpaebnqx` and that the live catalogue was empty. `main` ships the
later, deliberately chosen **showtimes-only** directory on `cinema_screens` +
`listings`, with pending→approved state gating. Both models implement the same
feature with incompatible tables, RLS and admin flows, so
importing the older migrations would duplicate/conflict with
`20261108120000_movies_showtimes_only.sql` and `20261112330000_movies_state_approval.sql`
without adding a capability the product still wants. It is therefore excluded
under the "no duplicate or conflicting migrations" rule.

## 6. Migration and schema state

- **109** forward-only migrations under `supabase/migrations/`; the newest is
  `20261113020000_payment_claim_business_trigger.sql`.
- `supabase/MIGRATION_MANIFEST.json` and `supabase/migrations.sha256` list the
  same 109 files with matching SHA-256 digests; no duplicate version prefixes
  and no edited applied migration (repairs were added as new migrations).
- The three November audit repairs are forward-only:
  `20261113000000_customer_module_access.sql`,
  `20261113010000_provider_portal_membership_guard.sql`,
  `20261113020000_payment_claim_business_trigger.sql`.
- Hosted status: these migrations are **not applied** to the hosted project and
  no hosted write, migration or deploy was performed during this audit. Movies
  write endpoints report `503 MOVIES_APPROVAL_MIGRATION_REQUIRED` until
  `20261112330000` is applied; the UI tolerates the un-applied schema.

## 7. Verification at `main` = `e1b44af`

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS |
| Production build | `npm run build` | PASS |
| Unit/API | `npm test` | 553 tests, 533 pass, 0 fail, 20 skipped |
| Database (disposable local cluster, all 109 migrations) | `npm run test:db` | ALL CHECKS PASSED (functional 65, contact 25, app_config 14, rural 10, profile_privacy 10, super_admin 12, bootstrap 6, media 20, concurrency 1) |
| Chromium E2E (`--retries=0`) | `auth-entrypoints`, `auth-role-and-session`, `safe-image-rendering` | 28 passed, 1 skipped, 0 failed |

`npm test` was run with the local `.env.local` temporarily set aside because it
points at a development Postgres that is not running; the file was restored
unchanged and is not tracked. E2E requires `LC_ALL=C` on macOS so `postgres`
can start its throwaway cluster.

## 8. Not transferable / intentionally excluded

| Item | Reason |
|---|---|
| `feat/bookourspace-live-audit` Movies catalogue | Incompatible with the shipped showtimes-only model; applied to a different Supabase project |
| `feat/movies-upi-payment` nested tree | Duplicate copy of the application; UPI/payment flow already on `main` |
| `MarketplaceHero.tsx` | Removed on purpose by `38ceaee`; replaced by `SuperAppBentoHomeHub` |
| `bookourspace-aistudio` dirty tree | Older than `main` in every file; no unique work |
| Capacitor native shells | Live in a separate worktree; native build requires a device/signing setup, not part of web consolidation |
| Hosted migrations, secrets, deploy config | Out of scope by instruction; no hosted writes or deploys performed |

## 9. Remaining blockers

1. The three November repair migrations plus the Movies state/approval
   migration are still pending on the hosted project; applying them is an
   operator action.
2. Email OTP and Google sign-in end-to-end still need real provider accounts
   (Resend, Google OAuth consent) in an environment with the server secrets.
3. 20 unit tests skip without a live Supabase/PostgreSQL target by design.
