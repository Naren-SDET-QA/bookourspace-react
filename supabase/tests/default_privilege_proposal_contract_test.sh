#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
proposal="$repo_root/DEV_DEFAULT_PRIVILEGE_REMEDIATION_PROPOSAL.md"
test -f "$proposal" || { echo "FAIL default privilege proposal missing" >&2; exit 1; }

require() {
  local text="$1"
  rg -Fq "$text" "$proposal" || { echo "FAIL proposal missing: $text" >&2; exit 1; }
}

require 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public'
require 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage'
require 'GraphQL defaults are deferred'
require 'Deferred GraphQL probe (prepared, not run)'
require 'ALTER DEFAULT PRIVILEGES IN SCHEMA graphql_public'
require 'SET LOCAL ROLE supabase_admin;'
require 'ROLLBACK;'
require 'REVOKE MAINTAIN, REFERENCES, TRIGGER ON TABLES'
require 'REVOKE TRUNCATE ON TABLES FROM service_role;'
require 'REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;'
require 'GRANT MAINTAIN, REFERENCES, TRIGGER ON TABLES'
require 'GRANT TRUNCATE ON TABLES TO service_role;'

if rg -Fq 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA' "$proposal"; then
  echo "FAIL deferred supabase_admin defaults appear in the proposed forward migration" >&2
  exit 1
fi

# This is a review document, not an executable migration. Keep proposed SQL
# out of the directory traversed by Supabase migration tooling.
if find "$repo_root/supabase/migrations" -maxdepth 1 -type f \
  -name '*default_privilege*' -print -quit | rg -q .; then
  echo "FAIL default privilege proposal was placed in migrations/" >&2
  exit 1
fi

# The proposal must not revoke CRUD, sequence, or RPC execution privileges.
if rg -ni '^\s*REVOKE\s+(SELECT|INSERT|UPDATE|DELETE|EXECUTE|USAGE)\b' "$proposal"; then
  echo "FAIL proposal revokes a preserved CRUD, sequence, or RPC privilege" >&2
  exit 1
fi

echo "PASS default privilege proposal preserves CRUD, sequence and function EXECUTE while removing only reviewed defaults"
