#!/usr/bin/env bash
# Verifies that Cloud Run's actual HTTPS status.url is the APP_URL before the
# service is exposed to production traffic. Read-only; does not deploy.
#
# Requires an approved Cloud Run service and gcloud auth. Run after the first
# revision and before granting public invocation.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:=asia-south1}"
: "${SERVICE:=bookourspace-api}"

API_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
if [[ ! "$API_URL" =~ ^https://[^/]+$ ]]; then
  echo "BLOCKED: status.url is missing or not an HTTPS origin: $API_URL" >&2
  exit 2
fi
if [[ "$API_URL" == *".invalid"* ]]; then
  echo "BLOCKED: APP_URL is still the first-revision bootstrap placeholder." >&2
  exit 2
fi

CONFIGURED="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format=json \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); env=d["spec"]["template"]["spec"]["containers"][0].get("env",[]); print(next((e.get("value","") for e in env if e.get("name")=="APP_URL"), ""))')"

if [[ "$CONFIGURED" != "$API_URL" ]]; then
  echo "BLOCKED: APP_URL ($CONFIGURED) does not equal status.url ($API_URL)." >&2
  echo "Run: gcloud run services update $SERVICE --region $REGION --update-env-vars APP_URL=$API_URL" >&2
  exit 2
fi

READY="$(curl -fsS --max-time 10 "$API_URL/api/health" || true)"
LIVE="$(curl -fsS --max-time 10 "$API_URL/health/live" || true)"
if [[ "$READY" != *'"ok":true'* || "$LIVE" != *'"probe":"liveness"'* ]]; then
  echo "BLOCKED: deployed probes are not healthy. readiness=$READY liveness=$LIVE" >&2
  exit 2
fi

echo "PASS: canonical APP_URL matches Cloud Run status.url"
echo "PASS: readiness=$READY"
echo "PASS: liveness=$LIVE"
