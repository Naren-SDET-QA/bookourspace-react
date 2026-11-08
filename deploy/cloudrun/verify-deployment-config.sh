#!/usr/bin/env bash
# Static audit of the Cloud Run configuration. No cloud calls or deployments.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec python3 "$ROOT/deploy/cloudrun/verify-deployment-config.py"
