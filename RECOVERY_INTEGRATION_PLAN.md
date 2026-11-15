# BookOurSpace Recovery Integration Plan

Date: 2026-11-15
Status: Proposed only — approval required before integration

## Recommended source of truth

Use current remote origin/main at 6dfecbf as the eventual integration base, while preserving canonical recovery b784023 and all backup/feature refs. Do not push local main over rewritten remote history. First classify dirty server.ts and AdminDashboard.tsx changes.

## Feature sources and planned scope

| Feature | Source | Planned scope |
|---|---|---|
| WhatsApp | Canonical evolutionWhatsApp.ts, whatsappFaq.ts, server routes/tests/migrations | Port only missing route/config/test deltas after webhook comparison. |
| Resend | Canonical resendEmail.ts, resendTransactionalEmails.ts, tests | Preserve server-only credentials; add only missing templates/routes/tests. |
| GPS | Canonical tracking hooks/components/migration/tests; compare downloaded ProviderDashboard | Reconcile dashboard/API deltas; preserve permissions and RLS. |
| Provider | Canonical provider/business APIs, dashboards, migrations, E2E | Integrate business-scoped work in dependency order. |
| Auth | Canonical Supabase identity, Google, OTP, access settings, E2E | Keep one auth system; reject nested standalone auth. |
| Admin | Canonical admin components/APIs/tests; selectively compare origin/dev UI | Preserve authorization and RLS; browser-verify UI changes. |
| Marketplace | Canonical PG/stays/venues/services/classes/institutes/movies | Preserve canonical routes/data contracts; do not copy archive demos wholesale. |
| Payments | Canonical APIs/security/migrations/tests | Audit nested contracts and port only compatible missing behavior. |
| Migrations/RLS | Canonical ordered supabase/migrations, manifest, rollback/tests | Reconcile versions/checksums; do not apply hosted migrations in this phase. |
| CI/tests | Canonical workflow and test suites | Add focused tests for accepted deltas; retain existing gates. |

## Required integration order

1. Explain and preserve dirty canonical files and untracked artifacts.
2. Snapshot refs and source manifests without exposing secrets.
3. Compare recovery branch to origin/main and produce a reviewed patch list.
4. Reconcile migration manifests locally only.
5. Integrate shared server contracts and security boundaries.
6. Integrate auth and provider/business scope.
7. Integrate WhatsApp, Resend, and GPS deltas.
8. Integrate marketplace/payment deltas, including only approved movie behavior.
9. Run typecheck, build, unit, integration, feature E2E, and CI checks.
10. Commit on a dedicated recovery branch based on verified origin/main.
11. Push only that branch after review; prepare a reviewed PR without force-push.

## Required validation

- TypeScript/lint and production build.
- Unit and API tests.
- WhatsApp webhook signature/idempotency tests using a safe test endpoint.
- Resend template/render/send tests with a non-customer test recipient or provider sandbox.
- GPS permission, publisher, customer/provider visibility, and realtime tests.
- Provider onboarding, business isolation, portal, and owner workflow tests.
- Customer Google OAuth, email OTP, guest access, and role/session tests.
- Admin authorization, module visibility, live-edit, RLS, and fail-closed tests.
- PG, stays, venues, services, classes/institutes, movies, booking/payment/refund tests.
- Migration manifest/checksum and local disposable database validation.
- Browser E2E and CI checks; native checks separately with explicit device approval.

## Manual decisions required

1. Are modified canonical server.ts and AdminDashboard.tsx approved recovery work?
2. Are downloaded ProviderDashboard.tsx changes newer and wanted?
3. Which specific nested movie payment/refund contracts, if any, should be ported?
4. Are native Capacitor changes in scope?
5. Which hosted configuration/project is authorized for non-production validation?

## Risks and rollback

- Auth duplication: keep canonical Supabase/server auth.
- Payment: do not port simulated payment behavior without signature, replay, idempotency, and RLS review.
- Migration: compare manifests and validate locally before hosted action.
- Dirty tree: preserve current files and artifacts; use no destructive Git commands.
- History rewrite: base new work on verified origin/main; preserve backup refs; never force-push.
- Rollback: revert the dedicated integration branch/PR and retain all source folders and refs.

## Approval gate

Do not begin integration until the five manual decisions above are answered and the conflict matrix is accepted. This phase produces reports only; no application code or Git history is changed by the matrix work.
