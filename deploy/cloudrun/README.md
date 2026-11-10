# BookOurSpace — Cloud Run production runbook (asia-south1)

This directory prepares a **Mumbai (`asia-south1`)** Cloud Run service for the
BookOurSpace API + built web app. Nothing here deploys automatically.

> **Do not deploy, apply migrations, or create secrets without separate
> approval.** The commands below are a reviewed runbook, not an executed plan.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage Node 22 build; runs `tsx server.ts` on port 8080 |
| `service.yaml` | Cloud Run Knative service: min 0, max 2, probes, Secret Manager refs |
| `cloudbuild.yaml` | Build/push only; no deploy step |
| `artifact-cleanup-policy.json` | Keep 10 images; delete older than 30 days |
| `../../.dockerignore` | Keeps `.env*`, tests, native projects and runtime JSON out of the image |
| `../env.production.example` | Public build/runtime configuration template |
| `../POST_DEPLOY.md` | Canonical URL discovery and post-deploy updates |
| `../native/` | Android/iOS production build configuration |
| `../CHECKLIST.md` | asia-south1 + Mumbai go-live checklist (no execute) |

## 1. Prerequisites (human-approved)

```bash
export PROJECT_ID="<gcp-project-id>"
export REGION="asia-south1"
export SERVICE="bookourspace-api"
export REPO="bookourspace"
export SERVICE_ACCOUNT="bookourspace-api@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com --project "$PROJECT_ID"
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location="$REGION" --project "$PROJECT_ID"
```

Create a dedicated runtime service account and grant only the roles it needs:

```bash
gcloud iam service-accounts create bookourspace-api \
  --display-name="BookOurSpace Cloud Run runtime" --project "$PROJECT_ID"
```

## 2. Secret Manager (values supplied interactively; never committed)

Create each secret with a prompt so the value never appears in shell history or
the repository:

```bash
read -r -s -p "Supabase pooler URL (server-only): " DB_URL; echo
printf '%s' "$DB_URL" | gcloud secrets create bos-listings-database-url \
  --data-file=- --replication-policy=automatic --project "$PROJECT_ID"

read -r -s -p "BOS_SERVER_HMAC_SECRET (64+ random chars): " HMAC; echo
printf '%s' "$HMAC" | gcloud secrets create bos-server-hmac-secret \
  --data-file=- --replication-policy=automatic --project "$PROJECT_ID"

read -r -s -p "Supabase secret/service-role key (server-only): " SB_SECRET; echo
printf '%s' "$SB_SECRET" | gcloud secrets create supabase-secret-key \
  --data-file=- --replication-policy=automatic --project "$PROJECT_ID"
```

Grant the runtime account access to only these secrets:

```bash
for secret in bos-listings-database-url bos-server-hmac-secret supabase-secret-key; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" --project "$PROJECT_ID"
done
```

Optional server-only secrets (add to `service.yaml` only when the feature is
enabled): Razorpay key/webhook secrets, `BOS_BOOKING_QR_SECRET`,
`GOOGLE_MAPS_PLACES_API_KEY`, `GEMINI_API_KEY`, cinema/POS webhook secrets.

**Never** create a `VITE_` secret for a database password, HMAC key, service-role
key, or `sb_secret_` key.

## 3. Build the image (no deploy)

```bash
export SUPABASE_PROJECT_ID="<dedicated production Supabase project ref>"
export SUPABASE_PUBLISHABLE_KEY="<public publishable/anon key>"
gcloud builds submit \
  --project "$PROJECT_ID" \
  --config deploy/cloudrun/cloudbuild.yaml \
  --substitutions "_VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY},_VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID}"
```

The build fails if the public Supabase key is still the placeholder, and also
when the project reference is missing, still a placeholder, or one the runtime
guard designates as a development/legacy project. The image is pushed to:

```
asia-south1-docker.pkg.dev/${PROJECT_ID}/bookourspace/api:${SHORT_SHA}
```

## 4. First revision (only after approval)

Cloud Run assigns the HTTPS URL **after** the first revision exists, while the
server requires an HTTPS `APP_URL` in production. For that first revision only,
use the reserved `.invalid` placeholder below; it is not a real hostname and is
replaced immediately in step 5.

```bash
export IMAGE="asia-south1-docker.pkg.dev/${PROJECT_ID}/bookourspace/api:<sha>"
export SERVICE_ACCOUNT="bookourspace-api@${PROJECT_ID}.iam.gserviceaccount.com"
export SUPABASE_PROJECT_ID="<dedicated production Supabase project ref>"   # required by service.yaml; never the development project
export SUPABASE_PUBLISHABLE_KEY="<public publishable/anon key>"
export APP_URL="https://bootstrap.invalid"   # temporary; never documented as canonical

envsubst < deploy/cloudrun/service.yaml | \
  gcloud run services replace - --region "$REGION" --project "$PROJECT_ID"
```

The service definitions include:

- **Startup probe** `GET /api/health` (PostgreSQL readiness; 503 at startup fails the revision) every 5s (up to 24 failures)
- **Liveness probe** `GET /api/live` (process-only) every 30s (3 failures)
- A temporary PostgreSQL outage fails readiness but does **not** restart a healthy container. Cloud Run startup/liveness probes are used; no separate readinessProbe is configured.
- Production Node also refuses to listen until `initializePostgresRuntime` succeeds, so the first revision never binds 8080 without PostgreSQL
- **Minimum instances 0 / maximum instances 2**
- CPU throttling and startup CPU boost enabled
- 1 vCPU, 512 MiB, concurrency 20, 300s timeout

## 5. Resolve the canonical URL and update the service

```bash
API_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --project "$PROJECT_ID" --format='value(status.url)')"
printf 'Canonical API URL: %s\n' "$API_URL"
test -n "$API_URL" && case "$API_URL" in https://*) ;; *) echo "Refusing non-HTTPS URL"; exit 1;; esac

gcloud run services update "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --update-env-vars "APP_URL=${API_URL}"
```

Then follow `deploy/POST_DEPLOY.md`. **Do not assume or hard-code a hostname**
until `status.url` returns it.

If the web app must be publicly reachable, add the invoker binding only after
approval:

```bash
gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
  --project "$PROJECT_ID" --member="allUsers" --role="roles/run.invoker"
```

## 6. Billing safeguards

Cost is bounded by **minScale 0 / maxScale 2**, request-based billing
(`cpu-throttling: true`), concurrency 20, 1 vCPU / 512 MiB, and a 300s timeout.
Idle time is unbilled because minimum instances is 0. Cloud Run has **no hard
spend cap**; budget alerts notify and do not stop the service.

asia-south1 uses Cloud Run Tier 1 request-based list prices
(https://cloud.google.com/run/pricing, USD):

| Meter | List price | Monthly free tier (billing-account, us-central1 rates) |
|---|---|---|
| CPU (active) | $0.000024 / vCPU-second | 180,000 vCPU-seconds |
| Memory (active) | $0.0000025 / GiB-second | 360,000 GiB-seconds |
| Requests | $0.40 / million | 2 million |

Order-of-magnitude estimates for this service definition (compute only; INR
follows the Cloud Billing FX rate):

- **Idle / near-zero traffic:** about $0 Cloud Run compute (min instances 0).
- **Light production** (~100k requests/month, ~200 ms billed time, 1 instance):
  typically covered by the free tier or a few USD.
- **Ceiling (2 instances billed continuously for 30 days):** about
  2 × 1 vCPU × 2,592,000 s × $0.000024 ≈ **$124 CPU** plus
  2 × 0.5 GiB × 2,592,000 s × $0.0000025 ≈ **$6.50 memory**, plus request
  charges above 2 million. This is the hard scale ceiling, not the expected bill.

Additional billable items outside Cloud Run compute:

- Artifact Registry image storage and Cloud Build (`E2_HIGHCPU_8` in `cloudbuild.yaml`)
- Secret Manager (~$0.06 per secret version-month plus access operations)
- Internet egress from Cloud Run (GCP Mumbai) to Supabase (AWS ap-south-1)
- Cloud Logging retention
- The Supabase Mumbai plan itself

```bash
gcloud billing budgets create \
  --billing-account="<billing-account-id>" \
  --display-name="BookOurSpace production alert" \
  --budget-amount=5000INR \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100 \
  --filter-projects="projects/${PROJECT_ID}"

gcloud artifacts repositories set-cleanup-policies "$REPO" \
  --location="$REGION" --project="$PROJECT_ID" \
  --policy=deploy/cloudrun/artifact-cleanup-policy.json
```

Confirm `--max-instances=2` after the first revision; the Cloud Run default is
100. Do not raise maxScale, switch to instance-based billing, or set minScale
above 0 without a new cost review.

## 7. Rollback

```bash
gcloud run revisions list --service "$SERVICE" --region "$REGION" --project "$PROJECT_ID"
gcloud run services update-traffic "$SERVICE" --region "$REGION" \
  --to-revisions "<previous-revision>=100" --project "$PROJECT_ID"
```

## Blockers before execution

- `APP_URL` cannot be known until Cloud Run creates the service; use the
  temporary bootstrap only for the first revision.
- Supabase production project reference, pooler URL, HMAC secret and
  service-role/secret key must be supplied by the owner; they are not in this
  repository. Production startup rejects an undeclared target and refuses the
  development project.
- Billing account, project ID, domain/OAuth redirect approval and public-access
  decision are owner inputs.
