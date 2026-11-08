# Post-deploy: canonical HTTPS API URL

**Do not write a hostname here or anywhere else until Cloud Run returns it.**

After an approved deployment, resolve the canonical origin from the service:

```bash
export PROJECT_ID="<gcp-project-id>"
export REGION="asia-south1"
export SERVICE="bookourspace-api"

API_URL="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.url)')"

printf '%s\n' "$API_URL"
case "$API_URL" in
  https://*) ;;
  *) echo "BLOCKER: status.url is missing or not HTTPS"; exit 1 ;;
esac
```

`$API_URL` is the **only** canonical API URL. Do not infer it from the project
ID, service name, a custom domain, or a previous environment.

## Required updates

1. **Cloud Run runtime**
   ```bash
   gcloud run services update "$SERVICE" --region "$REGION" \
     --project "$PROJECT_ID" --update-env-vars "APP_URL=${API_URL}"
   ```
2. **Health verification**
   ```bash
   curl -fsS "${API_URL}/health/live"
   # Expected: {"ok":true,"service":"bookourspace-api","probe":"liveness"}
   curl -fsS "${API_URL}/api/health"
   # Expected: {"ok":true,"service":"bookourspace-api"}
   # 503 DATABASE_UNAVAILABLE means the process is up but PostgreSQL is not ready.
   ```
3. **Supabase Auth URL configuration**
   - Add `${API_URL}/auth/callback` to the allowed redirect URLs.
   - Confirm the Google OAuth authorized redirect URI remains
     `https://obkfgxjzlscungkhbyvq.supabase.co/auth/v1/callback`.
4. **Web build** — the web app uses relative `/api` paths; no API host is
   embedded. If a separate web origin is used, rebuild/redeploy it so its
   `/api` reverse proxy targets `$API_URL`.
5. **Native builds** — rebuild Android/iOS with:
   ```bash
   VITE_NATIVE_API_ORIGIN="$API_URL" \
   VITE_ENABLE_DEMO_DATA=false \
   VITE_BOS_LOCAL_DEV_AUTH=0 \
   bash deploy/native/build-production.sh --verify
   ```
   The native transport rejects non-HTTPS origins and the Supabase host.
6. **Secret/domain review** — add the URL to monitoring, CSP/connect-src if a
   strict policy is introduced, and the runbook. Never store credentials in
   client configuration.

## First-revision bootstrap

The server requires an HTTPS `APP_URL` before it will listen in production, but
Cloud Run assigns `status.url` only after the first revision. The runbook uses
`https://bootstrap.invalid` solely for that first revision, then replaces it in
step 1. `.invalid` is a reserved TLD and is not a canonical hostname.

## Recorded canonical URL

```
PENDING — resolved after approved deployment; not invented here.
```
