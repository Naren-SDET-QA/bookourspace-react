#!/usr/bin/env python3
"""Static audit of the BookOurSpace Cloud Run deployment configuration.

Reads configuration only: no deploy, no cloud calls, no secret values.
Exit code 0 = all checks pass.
"""
from pathlib import Path
import re
import sys
import yaml

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "deploy/cloudrun/service.yaml"
BUILD = ROOT / "deploy/cloudrun/cloudbuild.yaml"
DOCKER = ROOT / "deploy/cloudrun/Dockerfile"
failures: list[str] = []


def check(ok: bool, label: str) -> None:
    print(("PASS  " if ok else "FAIL  ") + label)
    if not ok:
        failures.append(label)


service = yaml.safe_load(SERVICE.read_text())
template = service["spec"]["template"]
annotations = template["metadata"]["annotations"]
container = template["spec"]["containers"][0]
env = {item["name"]: item for item in container.get("env", [])}

check(annotations.get("autoscaling.knative.dev/minScale") == "0", "minScale = 0")
check(annotations.get("autoscaling.knative.dev/maxScale") == "2", "maxScale = 2")
check(annotations.get("run.googleapis.com/cpu-throttling") == "true", "CPU throttling enabled")
check(service["metadata"].get("annotations", {}).get("run.googleapis.com/ingress") == "all", "ingress configured")
check("allUsers" not in yaml.safe_dump(service), "service YAML does not grant public invoker")

startup = container.get("startupProbe", {}).get("httpGet", {}).get("path")
liveness = container.get("livenessProbe", {}).get("httpGet", {}).get("path")
check(startup == "/api/health", "startup probe uses PostgreSQL readiness /api/health")
check(liveness == "/api/live", "liveness probe uses process-only /api/live")
check("readinessProbe" not in container, "no unsupported Cloud Run readinessProbe")

secret_env = {
    "bos-listings-database-url": "BOS_LISTINGS_DATABASE_URL",
    "bos-server-hmac-secret": "BOS_SERVER_HMAC_SECRET",
    "supabase-secret-key": "SUPABASE_SECRET_KEY",
}
for secret, env_name in secret_env.items():
    ref = env.get(env_name, {}).get("valueFrom", {}).get("secretKeyRef", {}).get("name")
    check(ref == secret, f"{secret} via Secret Manager")

check(env.get("APP_URL", {}).get("value") == "${APP_URL}", "APP_URL remains a deploy-time placeholder")
check(env.get("VITE_ENABLE_DEMO_DATA", {}).get("value") == "false", "demo data disabled")
for flag in ("BOS_STAY_INCLUDE_DEMO", "BOS_STAY_ALLOW_DEMO_BOOKING", "BOS_LOCAL_DEV_AUTH", "BOS_PAYMENT_SANDBOX", "BOS_UPI_SANDBOX", "BOS_VENUE_PAYMENT_SANDBOX"):
    check(env.get(flag, {}).get("value") == "0", f"{flag}=0")
check(env.get("BOS_NATIVE_APP_ORIGINS", {}).get("value") == "capacitor://localhost,https://localhost", "native CORS origins exact")

docker = DOCKER.read_text()
check("USER nodejs" in docker, "container runs non-root")
check('CMD ["node_modules/.bin/tsx", "server.ts"]' in docker, "startup command configured")
check("HEALTHCHECK" in docker, "Docker healthcheck present")
check("/api/live" in docker, "Docker healthcheck uses process-only /api/live")
check("NODE_ENV=production" in docker, "production mode in image")
check(not re.search(r"COPY\s+.*\.env", docker), "no env file copied into image")

build = BUILD.read_text()
check(not re.search(r"gcloud\s+run\s+(deploy|services\s+replace)", build), "cloudbuild is build-only")

deploy_text = "\n".join(
    p.read_text(errors="ignore")
    for p in (ROOT / "deploy").rglob("*")
    if p.is_file() and p.suffix in {".yaml", ".yml", ".example", ".md", ".sh", ".py"}
)
check(not re.search(r"\bVITE_[A-Z0-9_]*(SECRET|PASSWORD|SERVICE_ROLE|HMAC|PRIVATE)", deploy_text), "no VITE_ database/server secrets in deployment files")
check(not re.search(r"https://[a-z0-9.-]+\.run\.app", deploy_text), "no assumed Cloud Run hostname in configs")

for required in ("deploy/POST_DEPLOY.md", "deploy/env.production.example", "deploy/native/build-production.sh"):
    check((ROOT / required).is_file(), f"{required} present")

if failures:
    print(f"\nBLOCKED: {len(failures)} configuration check(s) failed", file=sys.stderr)
    sys.exit(1)
print("\nPASS: deployment configuration audit complete")
