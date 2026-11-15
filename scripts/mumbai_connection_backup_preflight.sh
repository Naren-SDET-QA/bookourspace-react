#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -t 0 ]]; then
  echo 'BLOCKED: run this script in an interactive terminal so the connection URL can be entered without echo.' >&2
  exit 2
fi

for attempt in 1 2 3; do
  read -r -s -p 'Supabase Dashboard → Mumbai → Connect → Direct connection URI (hidden; session-mode URI is accepted if direct IPv6 is unavailable): ' BOS_MUMBAI_DATABASE_URL
  printf '\n'
  export BOS_MUMBAI_DATABASE_URL
  set +e
  node scripts/mumbai_connection_backup_preflight.mjs
  status=$?
  set -e
  unset BOS_MUMBAI_DATABASE_URL
  if [[ "$status" -eq 0 ]]; then exit 0; fi
  if [[ "$status" -ne 10 || "$attempt" -eq 3 ]]; then exit "$status"; fi
  echo 'Connection did not validate. Recheck the Dashboard Connect URI and password, then try again.' >&2
done

exit 10
