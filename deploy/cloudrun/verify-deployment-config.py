#!/usr/bin/env python3
"""Static audit of the BookOurSpace Cloud Run deployment configuration.

Reads configuration only: no deploy, no cloud calls, no secret values.

Usage:
    python3 deploy/cloudrun/verify-deployment-config.py [--root DIR]

`--root` defaults to the repository root and exists so the negative tests in
`deploy/cloudrun/test_verify_deployment_config.py` can audit a mutated copy of
the same files and prove that an invalid configuration fails.

Exit codes: 0 = every check passed, 1 = at least one check failed,
2 = the audit could not run (missing YAML parser, unreadable inputs).
"""
from pathlib import Path
import argparse
import re
import sys

SERVICE_REL = "deploy/cloudrun/service.yaml"
BUILD_REL = "deploy/cloudrun/cloudbuild.yaml"
DOCKER_REL = "deploy/cloudrun/Dockerfile"
GUARD_REL = "src/server/supabaseProductionGuard.ts"
PRODUCTION_ENV_REL = "deploy/env.production.example"
NATIVE_BUILD_REL = "deploy/native/build-production.sh"
SERVER_REL = "server.ts"

SECRET_ENV = {
    "bos-listings-database-url": "BOS_LISTINGS_DATABASE_URL",
    "bos-server-hmac-secret": "BOS_SERVER_HMAC_SECRET",
    "supabase-secret-key": "SUPABASE_SECRET_KEY",
}

REQUIRED_FILES = (
    "deploy/POST_DEPLOY.md",
    PRODUCTION_ENV_REL,
    NATIVE_BUILD_REL,
    SERVICE_REL,
    BUILD_REL,
    DOCKER_REL,
    GUARD_REL,
    SERVER_REL,
)

DEMO_FLAGS = (
    "BOS_STAY_INCLUDE_DEMO",
    "BOS_STAY_ALLOW_DEMO_BOOKING",
    "BOS_LOCAL_DEV_AUTH",
    "BOS_PAYMENT_SANDBOX",
    "BOS_UPI_SANDBOX",
    "BOS_VENUE_PAYMENT_SANDBOX",
)


def audit(root: Path, yaml) -> list:
    failures = []

    def check(ok: bool, label: str) -> None:
        print(("PASS  " if ok else "FAIL  ") + label)
        if not ok:
            failures.append(label)

    missing = [rel for rel in REQUIRED_FILES if not (root / rel).is_file()]
    for rel in missing:
        check(False, f"required file present: {rel}")
    if missing:
        return failures

    # ------------------------------------------------------------------
    # YAML structure: the audit must fail, not crash, on malformed input.
    # ------------------------------------------------------------------
    try:
        service = yaml.safe_load((root / SERVICE_REL).read_text())
    except yaml.YAMLError as error:
        check(False, f"service.yaml parses as YAML ({error.__class__.__name__})")
        return failures
    check(isinstance(service, dict), "service.yaml is a YAML mapping")

    try:
        template = service["spec"]["template"]
        annotations = template["metadata"]["annotations"]
        container = template["spec"]["containers"][0]
        env = {item["name"]: item for item in container.get("env", [])}
    except (KeyError, IndexError, TypeError):
        check(False, "service.yaml has the expected Knative/Cloud Run shape")
        return failures
    check(True, "service.yaml has the expected Knative/Cloud Run shape")

    check(annotations.get("autoscaling.knative.dev/minScale") == "0", "minScale = 0")
    check(annotations.get("autoscaling.knative.dev/maxScale") == "2", "maxScale = 2")
    check(annotations.get("run.googleapis.com/cpu-throttling") == "true", "CPU throttling enabled")
    check(
        service["metadata"].get("annotations", {}).get("run.googleapis.com/ingress") == "all",
        "ingress configured",
    )
    check("allUsers" not in yaml.safe_dump(service), "service YAML does not grant public invoker")

    ports = container.get("ports") or []
    check(
        bool(ports) and ports[0].get("containerPort") in (8080, "8080"),
        "container port declared",
    )

    startup = container.get("startupProbe", {}).get("httpGet", {}).get("path")
    liveness = container.get("livenessProbe", {}).get("httpGet", {}).get("path")
    check(startup == "/api/health", "startup probe uses PostgreSQL readiness /api/health")
    check(liveness == "/api/live", "liveness probe uses process-only /api/live")
    check("readinessProbe" not in container, "no unsupported Cloud Run readinessProbe")

    for secret, env_name in SECRET_ENV.items():
        entry = env.get(env_name, {})
        ref = entry.get("valueFrom", {}).get("secretKeyRef", {}).get("name")
        check(ref == secret, f"{secret} via Secret Manager")
        check("value" not in entry, f"{env_name} has no plaintext value")

    check(env.get("APP_URL", {}).get("value") == "${APP_URL}", "APP_URL remains a deploy-time placeholder")
    check(env.get("VITE_ENABLE_DEMO_DATA", {}).get("value") == "false", "demo data disabled")
    for flag in DEMO_FLAGS:
        check(env.get(flag, {}).get("value") == "0", f"{flag}=0")
    check(
        env.get("BOS_NATIVE_APP_ORIGINS", {}).get("value") == "capacitor://localhost,https://localhost",
        "native CORS origins exact",
    )
    check(
        env.get("BOS_TRUST_PROXY_HOPS", {}).get("value") == "1",
        "trusted proxy hops pinned to the single Cloud Run front end",
    )

    # ------------------------------------------------------------------
    # Container image
    # ------------------------------------------------------------------
    docker = (root / DOCKER_REL).read_text()
    check("USER nodejs" in docker, "container runs non-root")
    check('CMD ["node_modules/.bin/tsx", "server.ts"]' in docker, "startup command configured")
    check("HEALTHCHECK" in docker, "Docker healthcheck present")
    check("/api/live" in docker, "Docker healthcheck uses process-only /api/live")
    check("NODE_ENV=production" in docker, "production mode in image")
    check(not re.search(r"COPY\s+.*\.env", docker), "no env file copied into image")

    # ------------------------------------------------------------------
    # Build stays build-only and never names a dev project
    # ------------------------------------------------------------------
    build = (root / BUILD_REL).read_text()
    check(
        not re.search(r"gcloud\s+run\s+(deploy|services\s+replace)", build),
        "cloudbuild is build-only",
    )

    deploy_files = [
        p
        for p in (root / "deploy").rglob("*")
        if p.is_file() and p.suffix in {".yaml", ".yml", ".example", ".md", ".sh", ".py", ".txt", ".json"}
    ]
    deploy_text = "\n".join(p.read_text(errors="ignore") for p in deploy_files)
    check(
        not re.search(r"\bVITE_[A-Z0-9_]*(SECRET|PASSWORD|SERVICE_ROLE|HMAC|PRIVATE)", deploy_text),
        "no VITE_ database/server secrets in deployment files",
    )
    check(
        not re.search(r"https://[a-z0-9.-]+\.run\.app", deploy_text),
        "no assumed Cloud Run hostname in configs",
    )

    # ------------------------------------------------------------------
    # Development / production Supabase separation
    # ------------------------------------------------------------------
    guard_text = (root / GUARD_REL).read_text()
    development_refs = set(re.findall(r"'([a-z0-9]{20})'", guard_text))
    check(len(development_refs) >= 3, "runtime guard declares the development Supabase references")

    offending = sorted(
        str(p.relative_to(root))
        for p in deploy_files
        if any(ref in p.read_text(errors="ignore") for ref in development_refs)
    )
    check(not offending, "no deployment file names a development Supabase project")
    for name in offending:
        print("      offending: " + name, file=sys.stderr)

    production_env = (root / PRODUCTION_ENV_REL).read_text()
    check(
        "BOS_PRODUCTION_SUPABASE_PROJECT_ID=__PRODUCTION_SUPABASE_PROJECT_REF__" in production_env,
        "production env template requires an explicit production Supabase project",
    )
    check(
        "VITE_SUPABASE_URL=https://__PRODUCTION_SUPABASE_PROJECT_REF__.supabase.co" in production_env,
        "production env template derives the URL from the production project ref",
    )

    service_text = (root / SERVICE_REL).read_text()
    check('value: "${SUPABASE_PROJECT_ID}"' in service_text, "service.yaml takes the project ref from a substitution")
    check("BOS_PRODUCTION_SUPABASE_PROJECT_ID" in service_text, "service.yaml passes BOS_PRODUCTION_SUPABASE_PROJECT_ID")
    check(
        env.get("VITE_SUPABASE_PRODUCTION_PROJECT_ID", {}).get("value") == "${SUPABASE_PROJECT_ID}",
        "service.yaml declares the client production Supabase target",
    )
    check(
        not re.search(r"[a-z0-9]{20}\.supabase\.co", service_text),
        "service.yaml hard-codes no Supabase project host",
    )

    check(
        '_VITE_SUPABASE_PROJECT_ID: "REPLACE_WITH_PRODUCTION_SUPABASE_PROJECT_REF"' in build,
        "cloudbuild.yaml requires an explicit production project substitution",
    )
    check(
        "- VITE_SUPABASE_PRODUCTION_PROJECT_ID=${_VITE_SUPABASE_PROJECT_ID}" in build,
        "cloudbuild.yaml passes the production client declaration to the image build",
    )
    check(
        "npm run build:production" in docker,
        "Dockerfile builds through the guarded production build",
    )
    check(
        "ARG VITE_SUPABASE_PRODUCTION_PROJECT_ID" in docker,
        "Dockerfile declares the production client target as a build argument",
    )
    check(
        "Refusing to build production with a development Supabase project reference." in build,
        "cloudbuild.yaml refuses a development project ref",
    )
    check(
        not re.search(r"[a-z0-9]{20}\.supabase\.co", build),
        "cloudbuild.yaml hard-codes no Supabase project host",
    )

    native_build = (root / NATIVE_BUILD_REL).read_text()
    check(
        "a release build must not target the development Supabase project" in native_build,
        "native release build refuses a development project ref",
    )
    check(
        "npm run build:production" in native_build,
        "native release build uses the guarded production build",
    )

    server_text = (root / SERVER_REL).read_text()
    guard_call = "assertProductionSupabaseEnvironment();"
    listen_call = "httpServer.listen("
    check(
        guard_call in server_text
        and listen_call in server_text
        and server_text.index(guard_call) < server_text.index(listen_call),
        "production startup validates Supabase separation before listening",
    )

    return failures


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Audit the Cloud Run deployment configuration (read-only).")
    parser.add_argument(
        "--root",
        default=str(Path(__file__).resolve().parents[2]),
        help="repository root to audit (defaults to this checkout)",
    )
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()

    try:
        import yaml  # noqa: PLC0415 - the audit must report a missing parser, not crash
    except ModuleNotFoundError:
        print(
            "FAIL  PyYAML is required: python3 -m pip install -r deploy/cloudrun/requirements-verify.txt",
            file=sys.stderr,
        )
        return 2

    if not root.is_dir():
        print(f"FAIL  audit root does not exist: {root}", file=sys.stderr)
        return 2

    failures = audit(root, yaml)
    if failures:
        print(f"\nBLOCKED: {len(failures)} configuration check(s) failed", file=sys.stderr)
        return 1
    print("\nPASS: deployment configuration audit complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
