#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
IFS= read -r -s -p 'Temporary Mumbai PostgreSQL password (hidden input): ' BOS_MUMBAI_TEMP_DB_PASSWORD
printf '\n'
if [[ -z "$BOS_MUMBAI_TEMP_DB_PASSWORD" ]]; then
  echo 'BLOCKED: no password entered; no connection attempted.' >&2
  exit 2
fi
export BOS_MUMBAI_TEMP_DB_PASSWORD
set +e
node scripts/mumbai_temp_credential_preflight.mjs
status=$?
unset BOS_MUMBAI_TEMP_DB_PASSWORD
set -e
exit "$status"
