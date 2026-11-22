# BookOurSpace React — Production Release Checklist (single repository)

**Updated:** 2026-11-22 · **Branch:** `integration/recover-20261115` · **HEAD:** `3113eda`
**Verdict:** **READY AFTER EXPLICIT OWNER ACTIONS** — the application code is release-capable for the
verified journeys; the production environment, hosted database state, OAuth and recovery evidence are owner
gates that cannot be closed from this repository alone. The classes browser journey
(`e2e/classes-journey.spec.ts`) passes 4/4 locally and should be re-run on the deployment target as part of
the release smoke tests. This document supersedes the 2026-11-21 checklist;
the history lives in `BOOKOURSPACE_REACT_MASTER_ISSUE_REGISTER.md`.

One Git repository serves development and production. There is no second repository and no second
application; DEV and PROD differ only by configuration and by which Supabase project the build targets.

---

## 1. Environment separation

| | LOCAL | DEV (hosted) | PROD |
|---|---|---|---|
| Supabase project | local stack or none | `obkfgxjzlscungkhbyvq` (owner-confirmed development) | **does not exist yet** — must be created by the owner |
| Client target declared by | `VITE_SUPABASE_URL` + `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID` | same | `VITE_SUPABASE_URL` + `VITE_SUPABASE_PRODUCTION_PROJECT_ID` + `BOS_PRODUCTION_SUPABASE_PROJECT_ID` |
| Client bundle built by | `npm run build` (dev values inlined) | `npm run build` | `npm run build:production` (**required**) |
| Env file source | `.env.local` (gitignored) | deployment env | `deploy/production-env/` + process env / Secret Manager |
| Database URL | loopback `.local/stays-db` | `BOS_LISTINGS_DATABASE_URL` with the DEV allowlist | Secret Manager `BOS_LISTINGS_DATABASE_URL`, TLS (`sslmode=verify-full` or `require`) |
| Payments | sandbox only | **disabled** | **disabled** until the payment workflow is approved |
| Runtime guard | — | development allowlist | `assertProductionSupabaseEnvironment()` refuses startup when the target is unset, disagrees across variables, or names the development/legacy project |

Guards that make a DEV-pointed production release fail rather than mislead:

- **Build time** — `npm run build:production` refuses to build without an explicit non-development Supabase
  target, refuses any development reference (including a leftover `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID`),
  builds with `BOS_PRODUCTION_BUILD=1` so Vite reads `deploy/production-env/` instead of the developer's
  `.env.local`, then scans the output and fails if a development project reference, `sb_secret_` key, PEM
  private key or credential-bearing PostgreSQL URL appears in a shipped asset.
- **Startup** — `NODE_ENV=production` requires `APP_URL` (https), a strong `BOS_SERVER_HMAC_SECRET`, a
  non-loopback TLS database target, and a dedicated production Supabase project.
- **Runtime** — payments stay closed (`PG_PAYMENTS_*`/Razorpay unconfigured → `503`, never a fake success);
  unknown API routes return JSON `404`; every protected API answers `401`/`403` with `no-store`.

## 2. Build the artifact

```bash
npm ci                                   # lockfile is authoritative; postinstall runs patch-package
npx tsc --noEmit                         # must be exit 0
npm test                                 # 862 tests, 0 failed, 0 skipped (isolated PostgreSQL)
node supabase/tests/migration_manifest.mjs
npm run build                            # development/dev-preview bundle (inlines DEV values)
npm run build:production                 # PRODUCTION bundle — fails closed without production values
```

`build:production` needs, from the deployment environment (never committed):

```
BOS_PRODUCTION_SUPABASE_PROJECT_ID=<prod-ref>
VITE_SUPABASE_PROJECT_ID=<prod-ref>
VITE_SUPABASE_URL=https://<prod-ref>.supabase.co
VITE_SUPABASE_PRODUCTION_PROJECT_ID=<prod-ref>
VITE_SUPABASE_PUBLISHABLE_KEY=<public key>
```

Delete or blank `VITE_SUPABASE_DEVELOPMENT_PROJECT_ID` first; the guard rejects it by design, and Vite would
otherwise inline it. `npm run build` must never be used for a deployment.

## 3. Owner approvals required before any deploy

- [ ] **Create a dedicated production Supabase project** (none exists). Do not reuse `obkfgxjzlscungkhbyvq`.
- [ ] **Apply the approved migration set** to that project with one runner only
  (`supabase/tests/run_approved_migration_set.mjs` + `supabase/migration-allowlists/hosted-dev-20261122.json`);
  the 51-file set, the two excluded movie migrations and the one no-op are pinned and hash-verified.
  Hosted readiness is currently **NOT YET READY TO APPLY** (B5 signature, B6 PITR/restore evidence).
- [ ] **Validate the three `NOT VALID` constraints** after the read-only precheck reports READY.
- [ ] **Backup/PITR and a restore rehearsal** recorded (RPO/RTO, restore target, measured duration).
- [ ] **Google OAuth** client + Supabase callback for the production origin; exercise one real sign-in.
- [ ] **Secrets in Secret Manager** (`BOS_SERVER_HMAC_SECRET`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`,
  database URL). Never in `VITE_*`, never in this repository.
- [ ] **Gitleaks acceptance** for the 100 documented historical findings (release-owner signature).
- [ ] **Payments remain disabled** in the release; enabling them is a separate, approved change.

## 4. Deploy (one service)

1. `gcloud builds submit` with `deploy/cloudrun/cloudbuild.yaml` (image from this repository's `Dockerfile`).
2. `gcloud run services replace deploy/cloudrun/service.yaml` with `asia-south1`, then resolve the canonical
   origin with `deploy/cloudrun/verify-app-url.sh`; never hard-code it.
3. Run `python3 deploy/cloudrun/verify-deployment-config.py` and its negative suite before the revision is
   promoted.
4. Confirm the revision starts (a refused startup is the guard working, not a platform fault).

## 5. Rollback

- **Application:** redeploy the previous Cloud Run revision (`gcloud run services update-traffic … --to-revisions`).
  The artifact is immutable per revision; no database change is implied.
- **Database:** migrations are forward-only. A bad migration is corrected by a new forward migration; there is
  no down-migration path and no ledger repair. Restore from a verified backup/PITR point only on owner
  authorisation, into the same project, with the incident recorded.
- **Client bundle:** a bundle built with a development target is never a rollback candidate; rebuild with
  `build:production` and the same production values.

## 6. Post-deploy smoke tests

| Check | Expected |
|---|---|
| `GET /api/health` | `200` JSON, database attached |
| `GET /api/definitely-not-a-route` | `404` JSON `API_ROUTE_NOT_FOUND`, `no-store` |
| `GET /api/auth/me` unauthenticated | `401` JSON, `no-store`, no stack |
| `GET /api/payments/capabilities` | `razorpay:false`, `upi:false` while payments are disabled |
| `POST /api/stays/requests` unauthenticated | `401`, never a shell |
| Sign-in (Google + email OTP) on the production origin | session cookie `HttpOnly`/`SameSite`, `/auth/callback` works |
| Customer journeys | stays search → quote → request; movies list; services; classes; venue; coupons |
| Admin/provider consoles | role-gated; a customer token gets `403` on admin routes |
| Mobile 375/390/430 | no horizontal overflow, CLS budget ≤ 0.1, 44px touch targets |
| Console/network | no failed asset, no mixed content, no 5xx |
| Rate limits | auth `12/min` then `429`; API `30/min` |

## 7. Missing production infrastructure and configuration

- No production Supabase project (reference, keys, pooler URL, RLS/grants state, storage buckets).
- No production Google OAuth client / callback allow-list, no hosted sign-in evidence.
- No production database backup/PITR evidence and no restore rehearsal.
- No production GCP project, billing, Artifact Registry image or Cloud Run revision (deployment is unapproved).
- No production monitoring/alerting, log retention policy or error budget.
- No release-owner Gitleaks acceptance.

## 8. Hard stops

No hosted migration, DDL/DML, policy change, deployment, payment activation, credential rotation, billing
change or destructive operation without explicit owner approval. Payments stay disabled. This checklist
prepares a release; it does not authorise one.
