#!/usr/bin/env bash
# =============================================================================
# Real local Supabase Realtime audit.
#
# Creates an isolated, throwaway Supabase local stack on free ports, applies the
# repository baseline plus every migration, then runs real Supabase Auth users,
# RLS-scoped bookings, WebSocket subscriptions, reconnects, GPS inserts, OTP and
# private Storage tests. It never contacts a hosted project.
#
# Usage: bash supabase/tests/run_local_supabase_realtime_e2e.sh
# Exit:  0 = every Realtime/auth/storage assertion passed
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-realtime-e2e.XXXXXX")" || exit 1
PROJECT_DIR="$TMP_ROOT/project"
MARKER="$TMP_ROOT/.bos-realtime-e2e-owned"
printf '%s\n' "BookOurSpace local Realtime scratch directory" > "$MARKER"
LOG="$TMP_ROOT/realtime-e2e.log"

cleanup() {
  if [ -d "$PROJECT_DIR" ]; then
    supabase stop --workdir "$PROJECT_DIR" --no-backup >/dev/null 2>&1 || true
  fi
  if [ "${BOS_KEEP_REALTIME_E2E:-0}" = "1" ]; then
    echo "    preserved isolated Realtime files at $TMP_ROOT"
    return
  fi
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-realtime-e2e-owned'
if root.parent != base or not root.name.startswith('bos-realtime-e2e.'):
    raise SystemExit('Refusing cleanup: path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace local Realtime scratch directory':
    raise SystemExit('Refusing cleanup: ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

command -v supabase >/dev/null 2>&1 || { echo "FAILED: supabase CLI is unavailable" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "FAILED: Docker is unavailable" >&2; exit 1; }

mkdir -p "$PROJECT_DIR"
supabase init --force --workdir "$PROJECT_DIR" >/dev/null 2>&1 || { echo "FAILED: supabase init" >&2; exit 1; }

python3 - "$PROJECT_DIR/supabase/config.toml" <<'PY'
from pathlib import Path
import re
import secrets
import socket
import sys

config = Path(sys.argv[1])
text = config.read_text()
project_id = f"bos-rt-{secrets.token_hex(3)}"
text = re.sub(r'^project_id = ".*"$', f'project_id = "{project_id}"', text, count=1, flags=re.M)

def free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port

ports = {name: free_port() for name in (
    "api", "db", "shadow", "pooler", "studio", "inbucket", "analytics", "smtp", "pop3"
)}

# Replace only the port line inside each named section.
def set_section_port(section, value):
    global text
    pattern = re.compile(rf'(^\[{re.escape(section)}\]\n(?:.*\n)*?port = )(\d+)(\n)', re.M)
    text, count = pattern.subn(rf'\g<1>{value}\g<3>', text, count=1)
    if count != 1:
        raise SystemExit(f"could not set [{section}] port")

set_section_port("api", ports["api"])
set_section_port("db", ports["db"])
set_section_port("db.pooler", ports["pooler"])
set_section_port("studio", ports["studio"])
set_section_port("local_smtp", ports["inbucket"])
set_section_port("analytics", ports["analytics"])
# Optional SMTP/POP blocks are commented by default; leave their defaults.
text = re.sub(r'^shadow_port = \d+$', f'shadow_port = {ports["shadow"]}', text, count=1, flags=re.M)
text = re.sub(r'^site_url = ".*"$', 'site_url = "http://127.0.0.1:3410"', text, count=1, flags=re.M)
text = re.sub(r'^additional_redirect_urls = \[.*\]$', 'additional_redirect_urls = ["http://127.0.0.1:3410"]', text, count=1, flags=re.M)
config.write_text(text)
Path(config.parent.parent / "ports.env").write_text(
    "\n".join(f"{key.upper()}={value}" for key, value in ports.items()) + "\n"
)
PY

mkdir -p "$PROJECT_DIR/supabase/migrations"
cp "$REPO_ROOT/supabase/schema_and_rls.sql" "$PROJECT_DIR/supabase/migrations/00000000000000_baseline.sql"
cp "$REPO_ROOT"/supabase/migrations/*.sql "$PROJECT_DIR/supabase/migrations/"

echo "=== starting isolated local Supabase Realtime stack ==="
supabase start --workdir "$PROJECT_DIR" --yes > "$LOG" 2>&1
if [ $? -ne 0 ]; then
  tail -40 "$LOG" >&2
  echo "FAILED: supabase start (see $LOG)" >&2
  exit 1
fi
echo "    $(supabase status --workdir "$PROJECT_DIR" -o env 2>/dev/null | grep '^API_URL=' || true)"

STATUS_FILE="$TMP_ROOT/status.env"
supabase status --workdir "$PROJECT_DIR" -o env > "$STATUS_FILE" 2>/dev/null || {
  echo "FAILED: supabase status" >&2
  exit 1
}
set -a
# shellcheck disable=SC1090
. "$STATUS_FILE"
set +a

export BOS_SUPABASE_URL="$API_URL"
export BOS_SUPABASE_ANON_KEY="$ANON_KEY"
export BOS_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export BOS_SUPABASE_DB_URL="$DB_URL"

echo "=== real Supabase Auth + WebSocket + Storage E2E ==="
node --import tsx --test "$REPO_ROOT/tests/realtime-local-supabase.e2e.mjs" 2>&1 | tee "$TMP_ROOT/realtime-test.out"
TEST_EXIT=${PIPESTATUS[0]}
if [ "$TEST_EXIT" -ne 0 ]; then
  echo "FAILED: realtime-local-supabase.e2e.mjs (see $TMP_ROOT/realtime-test.out)" >&2
  exit "$TEST_EXIT"
fi
echo "PASS local Supabase Realtime, RLS, OTP, recurrence and document privacy"
