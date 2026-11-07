#!/usr/bin/env bash
set -euo pipefail
umask 077

BASE="${TMPDIR:-/tmp}"
ROOT="$(mktemp -d "$BASE/bos-location-search.XXXXXX")"
MARKER="$ROOT/.bos-location-search-owned"
printf '%s\n' 'BookOurSpace isolated location-search validation' > "$MARKER"
PGDATA="$ROOT/pgdata"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cleanup() {
  if [[ -f "$PGDATA/PG_VERSION" ]]; then pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true; fi
  if [[ "${BOS_KEEP_LOCATION_TEST_CLUSTER:-0}" == '1' ]]; then
    echo "Isolated cluster retained at $ROOT"
    return
  fi
  python3 - "$ROOT" "$BASE" <<'PY'
from pathlib import Path
import shutil, sys
root=Path(sys.argv[1]).resolve(); base=Path(sys.argv[2]).resolve()
marker=root/'.bos-location-search-owned'
if root.parent != base or not root.name.startswith('bos-location-search.'):
    raise SystemExit('Refusing cleanup: unscoped location test path')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace isolated location-search validation':
    raise SystemExit('Refusing cleanup: location test ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

for command in initdb pg_ctl createdb psql pg_restore; do command -v "$command" >/dev/null || { echo "BLOCKED: PostgreSQL utility missing: $command" >&2; exit 2; }; done
PGVER="$(postgres --version)"
echo "PostgreSQL: $PGVER"
if [[ "$PGVER" != *' 17.'* ]]; then echo 'BLOCKED: PostgreSQL 17 is required for this validation.' >&2; exit 2; fi

initdb -D "$PGDATA" -U postgres --auth=trust > "$ROOT/initdb.log" 2>&1
pg_ctl -D "$PGDATA" -o "-p $PORT -h 127.0.0.1 -c wal_level=logical" -l "$ROOT/postgres.log" start >/dev/null
createdb -h 127.0.0.1 -p "$PORT" -U postgres bos_locations
psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT service_role TO postgres;
SQL

MIGRATION="$REPO_ROOT/supabase/migrations/20261107183158_india_location_catalog_search.sql"
psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d bos_locations -v ON_ERROR_STOP=1 -q -f "$MIGRATION"
psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d bos_locations -v ON_ERROR_STOP=1 -q -f "$REPO_ROOT/supabase/migrations/20261108090000_india_location_directory.sql"
psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d bos_locations -v ON_ERROR_STOP=1 -f "$REPO_ROOT/supabase/tests/location_search_test.sql"

export BOS_LOCATION_TEST_DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/bos_locations?sslmode=disable"
cd "$REPO_ROOT"
./node_modules/.bin/tsx --test tests/location-search-api.test.mjs
