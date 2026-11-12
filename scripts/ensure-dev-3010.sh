#!/usr/bin/env bash
# Idempotent local app launcher: ensures the loopback PostgreSQL cluster is
# running, then starts the preview on :3010 with demo fixtures enabled.
# This script is development-only; it is never used by production start.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3010}"
DB_PORT="${BOS_DEV_DB_PORT:-55440}"
DATA_DIR="${BOS_DEV_DB_DATA_DIR:-$ROOT/.local/stays-db}"

if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "[dev-ensure] app already healthy on :${PORT}"
  exit 0
fi

if [ -f "$DATA_DIR/PG_VERSION" ] && ! pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1; then
  echo "[dev-ensure] starting local PostgreSQL on :${DB_PORT}"
  pg_ctl -D "$DATA_DIR" -o "-p ${DB_PORT} -k /tmp -c listen_addresses=127.0.0.1" -l "$ROOT/.local/stays-db.log" -w start >/dev/null
fi

echo "[dev-ensure] starting BookOurSpace on :${PORT}"
exec env PORT="$PORT" VITE_ENABLE_DEMO_DATA=true bash "$ROOT/scripts/dev-with-stays-db.sh"
