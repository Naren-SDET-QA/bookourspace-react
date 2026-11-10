# BookOurSpace Cloud Run + Mumbai pre-deployment checklist

**Status: PREPARED — do not execute without separate approval.**

- Region: `asia-south1`
- Service: `bookourspace-api`
- Supabase: dedicated production project (explicit; never the development project)
Canonical API URL: **PENDING** (`gcloud run services describe … status.url` after deploy)

This checklist does not deploy, apply SQL, take payments, push git, or publish apps.

---

## 0. Gates (must stay closed until the owner approves each one)

- [ ] Push local commits (`2050a74` and any follow-up) to `origin/final-dev`
- [ ] Create or confirm GCP project + billing account
- [ ] Create Secret Manager values (never paste into `VITE_*` or git)
- [ ] `gcloud builds submit` / `gcloud run services replace`
- [ ] Hosted Mumbai `--apply` of the 21 pending migrations (skip-backup forbidden)
- [ ] `allUsers` Cloud Run invoker binding
- [ ] Live Razorpay secrets
- [ ] Native store publish

---

## 1. Google Cloud project (asia-south1)

- [ ] `PROJECT_ID` chosen; billing enabled
- [ ] APIs: `run`, `artifactregistry`, `cloudbuild`, `secretmanager`
- [ ] Artifact Registry repo `bookourspace` in `asia-south1`
- [ ] Runtime SA `bookourspace-api@${PROJECT_ID}.iam.gserviceaccount.com`
- [ ] Cloud Build SA can push to `asia-south1-docker.pkg.dev/$PROJECT_ID/bookourspace`
- [ ] Budget alert ₹5,000 at 50/90/100% (alerts only; does not stop spend)
- [ ] Artifact cleanup policy: `deploy/cloudrun/artifact-cleanup-policy.json`

## 2. Secrets (Secret Manager, user-managed replication is fine)

Create interactively (`read -r -s`); never commit.

| Secret | Env var | Notes |
|---|---|---|
| `bos-listings-database-url` | `BOS_LISTINGS_DATABASE_URL` | Production pooler, `sslmode=verify-full` (or `require`). User `postgres.<production-project-ref>` on port 5432 |
| `bos-server-hmac-secret` | `BOS_SERVER_HMAC_SECRET` | ≥32 chars; 64+ recommended |
| `supabase-secret-key` | `SUPABASE_SECRET_KEY` | Server-only. Never `VITE_` |

Grant **only** `roles/secretmanager.secretAccessor` on those three to the runtime SA.

Optional later (payment go-live): `razorpay-key-id`, `razorpay-key-secret`, `razorpay-webhook-secret`.

**IAM:** the runtime SA must not have `roles/editor`, `roles/owner`, or Secret Admin. Image pull uses the Cloud Run service agent, not the runtime SA.

## 3. Production flags (must be off)

Confirm in `deploy/cloudrun/service.yaml` and the image build args:

- `NODE_ENV=production`
- `VITE_ENABLE_DEMO_DATA=false`
- `VITE_BOS_LOCAL_DEV_AUTH=0`
- `BOS_LOCAL_DEV_AUTH=0`
- `BOS_PAYMENT_SANDBOX=0`
- `BOS_UPI_SANDBOX=0`
- `BOS_VENUE_PAYMENT_SANDBOX=0`
- `BOS_STAY_INCLUDE_DEMO=0`
- `BOS_STAY_ALLOW_DEMO_BOOKING=0`
- `BOS_ALLOW_OWNER_MANUAL_SETTLEMENT=false`

## 4. Build image (no deploy)

```bash
export SUPABASE_PROJECT_ID="<dedicated production project ref>"   # required; never the development project
export SUPABASE_PUBLISHABLE_KEY="<public anon/publishable key>"
gcloud builds submit --project "$PROJECT_ID" \
  --config deploy/cloudrun/cloudbuild.yaml \
  --substitutions "_VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY},_VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}"
```

Build args are public Vite values only. Database password, HMAC, and service-role keys are not Docker build args.

## 5. First Cloud Run revision (after approval)

```bash
export REGION=asia-south1 SERVICE=bookourspace-api
export SUPABASE_PROJECT_ID="<dedicated production project ref>"   # required by service.yaml
export IMAGE="asia-south1-docker.pkg.dev/${PROJECT_ID}/bookourspace/api:<sha>"
export SERVICE_ACCOUNT="bookourspace-api@${PROJECT_ID}.iam.gserviceaccount.com"
export APP_URL="https://bootstrap.invalid"   # temporary; not canonical
envsubst < deploy/cloudrun/service.yaml | \
  gcloud run services replace - --region "$REGION" --project "$PROJECT_ID"
gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(spec.template.metadata.annotations)' | grep maxScale
```

Confirm **maxScale=2**, **minScale=0**.

### Probes

| Probe | Path | Meaning |
|---|---|---|
| Startup | `GET /health/live` | Node process is listening |
| Liveness | `GET /health/live` | Restart only if the process is dead |
| Readiness | `GET /api/health` | PostgreSQL `SELECT 1`; 503 removes traffic |

Production Node also exits before `listen()` if PostgreSQL is missing or incompatible.

## 6. Canonical HTTPS URL (do not invent)

```bash
API_URL="$(gcloud run services describe "$SERVICE" --region asia-south1 \
  --project "$PROJECT_ID" --format='value(status.url)')"
# Must start with https://
gcloud run services update "$SERVICE" --region asia-south1 \
  --project "$PROJECT_ID" --update-env-vars "APP_URL=${API_URL}"
```

Record `$API_URL` in `deploy/POST_DEPLOY.md`. It is the only canonical API origin.

Verify:

```bash
curl -fsS "${API_URL}/health/live"    # 200 probe=liveness
curl -fsS "${API_URL}/api/health"     # 200 when PostgreSQL is ready
```

`/api/health` 503 = process up, database not ready. Do not shift production traffic until it is 200.

## 7. Request authentication and CORS

**Cloud Run IAM:** the default is private. Browser HMAC sessions and Capacitor apps cannot present Google identity tokens.

- [ ] Owner decides: public marketplace (`allUsers` `roles/run.invoker`) **or** a Google-authenticated admin-only API
- [ ] If public: `gcloud run services add-iam-policy-binding … --member=allUsers --role=roles/run.invoker`
- [ ] Application auth remains HMAC (`BOS_SERVER_HMAC_SECRET`) after Google → Supabase Auth. Cloud Run IAM does not replace it
- [ ] CORS allowlist is exact: `capacitor://localhost,https://localhost` (`BOS_NATIVE_APP_ORIGINS`). No wildcards
- [ ] Same-origin web (this service serves `dist` + `/api`) does not need extra CORS
- [ ] Probe paths `/health/live` and `/api/health` are unauthenticated by design

## 8. Supabase production project (explicit, never the development project)

The production project reference is an owner input and is not recorded in this
repository. Production startup fails closed without an explicit
`BOS_PRODUCTION_SUPABASE_PROJECT_ID`, and refuses the designated development
project wherever it appears in the Supabase variables.

- [ ] `SUPABASE_PROJECT_ID` exported for `envsubst` / the build substitution
- [ ] `BOS_PRODUCTION_SUPABASE_PROJECT_ID` supplied to the service (not the development project)
- [ ] `VITE_SUPABASE_PROJECT_ID` / `VITE_SUPABASE_URL` match the production ref (`https://<ref>.supabase.co`)
- [ ] Auth redirect: `https://<production-ref>.supabase.co/auth/v1/callback`
- [ ] After `API_URL` exists, add `${API_URL}/auth/callback` to Supabase Auth URL configuration
- [ ] Hosted schema: local chain is 73 files; hosted ledger 53 through `20261105140000`. **21 pending. `--apply` is a separate approval. Do not skip backup.**
- [ ] Pooler for the production project: `aws-0-ap-south-1.pooler.supabase.com:5432` user `postgres.<production-ref>`, `sslmode=verify-full`
- [ ] Never `supabase db push`
- [ ] `python3 deploy/cloudrun/verify-deployment-config.py` reports PASS

## 9. Native bake (after `API_URL`)

```bash
VITE_NATIVE_API_ORIGIN="$API_URL" \
VITE_ENABLE_DEMO_DATA=false VITE_BOS_LOCAL_DEV_AUTH=0 \
BOS_PAYMENT_SANDBOX=0 BOS_UPI_SANDBOX=0 BOS_VENUE_PAYMENT_SANDBOX=0 \
bash deploy/native/build-production.sh --verify
```

`--android` / `--ios` and store upload need further approval. Empty origin remains fail-closed.

## 10. Billing safeguards (already in `service.yaml`)

- min instances **0**, max instances **2**
- request-based billing (`cpu-throttling: true`)
- 1 vCPU / 512 MiB / concurrency 20 / timeout 300s
- budget alert + Artifact Registry cleanup
- Do not raise maxScale, set minScale > 0, or switch to instance-based billing without a cost review

## 11. Rollback

```bash
gcloud run revisions list --service "$SERVICE" --region asia-south1
gcloud run services update-traffic "$SERVICE" --region asia-south1 \
  --to-revisions "<previous-revision>=100"
```
