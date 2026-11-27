#!/usr/bin/env bash
# Focused local Supabase Auth/RLS isolation test.
#
# This script is intentionally separate from the broad Realtime/Storage E2E.
# It creates exactly three temporary Auth users and only the minimum rows for
# profiles, bookings, user_favorites and user_module_configs. It never uses the
# linked project, hosted URLs, or an existing Supabase workdir.
set -euo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-auth-isolation.XXXXXX")"
PROJECT_DIR="$TMP_ROOT/project"
MARKER="$TMP_ROOT/.bos-auth-isolation-owned"
PROJECT_ID="bos-auth-$(openssl rand -hex 6)"
LOG="$TMP_ROOT/supabase.log"
STATUS_FILE="$TMP_ROOT/status.env"
BEFORE_CONTAINERS="$TMP_ROOT/before.containers"
BEFORE_VOLUMES="$TMP_ROOT/before.volumes"
BEFORE_NETWORKS="$TMP_ROOT/before.networks"

printf '%s\n' 'BookOurSpace focused local Auth isolation scratch directory' > "$MARKER"

die() { printf 'FAIL %s\n' "$1" >&2; exit 1; }

resource_names() {
  local kind="$1"
  case "$kind" in
    containers) docker ps -aq --filter "label=com.supabase.cli.project=$PROJECT_ID" | sort ;;
    volumes) docker volume ls -q --filter "label=com.supabase.cli.project=$PROJECT_ID" | sort ;;
    networks) docker network ls -q --filter "label=com.supabase.cli.project=$PROJECT_ID" | sort ;;
    *) die "unknown resource kind: $kind" ;;
  esac
}

assert_no_project_resources() {
  local kind="$1"
  test -z "$(resource_names "$kind")" || die "pre-existing resources use generated project id ($kind)"
}

snapshot_existing() {
  docker ps -aq --format '{{.ID}} {{.Names}}' | sort > "$BEFORE_CONTAINERS"
  docker volume ls -q | sort > "$BEFORE_VOLUMES"
  docker network ls -q | sort > "$BEFORE_NETWORKS"
}

assert_existing_untouched() {
  local now="$TMP_ROOT/now"
  docker ps -aq --format '{{.ID}} {{.Names}}' | sort > "$now.containers"
  docker volume ls -q | sort > "$now.volumes"
  docker network ls -q | sort > "$now.networks"
  diff -u "$BEFORE_CONTAINERS" "$now.containers" >/dev/null || die 'existing/container inventory changed'
  diff -u "$BEFORE_VOLUMES" "$now.volumes" >/dev/null || die 'existing/volume inventory changed'
  diff -u "$BEFORE_NETWORKS" "$now.networks" >/dev/null || die 'existing/network inventory changed'
}

cleanup() {
  set +e
  if [ -d "$PROJECT_DIR" ]; then
    supabase stop --workdir "$PROJECT_DIR" --no-backup >/dev/null 2>&1
  fi
  local remaining
  for kind in containers volumes networks; do
    remaining="$(resource_names "$kind")"
    test -z "$remaining" || {
      printf 'FAIL cleanup left generated %s: %s\n' "$kind" "$remaining" >&2
      return 1
    }
  done
  assert_existing_untouched
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
base = Path(sys.argv[2]).resolve()
marker = root / '.bos-auth-isolation-owned'
if root.parent != base or not root.name.startswith('bos-auth-isolation.'):
    raise SystemExit('Refusing cleanup: path is outside the scoped temporary directory')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace focused local Auth isolation scratch directory':
    raise SystemExit('Refusing cleanup: ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

command -v supabase >/dev/null 2>&1 || die 'supabase CLI unavailable'
command -v docker >/dev/null 2>&1 || die 'Docker unavailable'
command -v openssl >/dev/null 2>&1 || die 'openssl unavailable'
command -v node >/dev/null 2>&1 || die 'Node unavailable'

snapshot_existing
for kind in containers volumes networks; do assert_no_project_resources "$kind"; done

mkdir -p "$PROJECT_DIR"
supabase init --force --workdir "$PROJECT_DIR" >/dev/null 2>&1 || die 'supabase init failed'

python3 - "$PROJECT_DIR/supabase/config.toml" "$PROJECT_ID" <<'PY'
from pathlib import Path
import re
import socket
import sys

config = Path(sys.argv[1])
project_id = sys.argv[2]
text = config.read_text()
text = re.sub(r'^project_id = ".*"$', f'project_id = "{project_id}"', text, count=1, flags=re.M)

def free_port():
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()
    return port

ports = {name: free_port() for name in ('api', 'db', 'shadow', 'pooler', 'studio', 'inbucket', 'analytics')}

def set_section_port(section, value):
    global text
    pattern = re.compile(rf'(^\[{re.escape(section)}\]\n(?:.*\n)*?port = )(\d+)(\n)', re.M)
    text, count = pattern.subn(rf'\g<1>{value}\g<3>', text, count=1)
    if count != 1:
        raise SystemExit(f'missing port section: {section}')

for section, key in (('api', 'api'), ('db', 'db'), ('db.pooler', 'pooler'),
                     ('studio', 'studio'), ('local_smtp', 'inbucket'), ('analytics', 'analytics')):
    set_section_port(section, ports[key])
text = re.sub(r'^shadow_port = \d+$', f'shadow_port = {ports["shadow"]}', text, count=1, flags=re.M)
text = re.sub(r'^site_url = ".*"$', 'site_url = "http://127.0.0.1:3410"', text, count=1, flags=re.M)
text = re.sub(r'^additional_redirect_urls = \[.*\]$', 'additional_redirect_urls = ["http://127.0.0.1:3410"]', text, count=1, flags=re.M)
config.write_text(text)
PY

mkdir -p "$PROJECT_DIR/supabase/migrations"
cp "$REPO_ROOT/supabase/schema_and_rls.sql" "$PROJECT_DIR/supabase/migrations/00000000000000_baseline.sql"
cp "$REPO_ROOT"/supabase/migrations/*.sql "$PROJECT_DIR/supabase/migrations/"

supabase start --workdir "$PROJECT_DIR" --yes > "$LOG" 2>&1 || {
  tail -40 "$LOG" >&2
  die 'isolated Supabase start failed'
}

for kind in containers volumes networks; do
  test -n "$(resource_names "$kind")" || die "isolated project has no labeled $kind"
done

supabase status --workdir "$PROJECT_DIR" -o env > "$STATUS_FILE" 2>/dev/null || die 'isolated Supabase status failed'
set -a
# shellcheck disable=SC1090
. "$STATUS_FILE"
set +a
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) die 'API URL is not loopback' ;; esac
case "$DB_URL" in postgresql://*@127.0.0.1:*|postgresql://*@localhost:*) ;; *) die 'DB URL is not loopback' ;; esac

export BOS_AUTH_ISOLATION_URL="$API_URL"
export BOS_AUTH_ISOLATION_ANON_KEY="$ANON_KEY"
export BOS_AUTH_ISOLATION_SERVICE_KEY="$SERVICE_ROLE_KEY"
export BOS_AUTH_ISOLATION_DB_URL="$DB_URL"
export BOS_AUTH_ISOLATION_PROJECT_ID="$PROJECT_ID"

node --input-type=module <<'NODE'
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.BOS_AUTH_ISOLATION_URL;
const anonKey = process.env.BOS_AUTH_ISOLATION_ANON_KEY;
const serviceKey = process.env.BOS_AUTH_ISOLATION_SERVICE_KEY;
const projectId = process.env.BOS_AUTH_ISOLATION_PROJECT_ID;
const runId = randomUUID();
const emails = {
  A: `bos-local-a-${runId}@example.test`,
  B: `bos-local-b-${runId}@example.test`,
  P: `bos-local-p-${runId}@example.test`,
};
const passwords = {
  A: `Local-A-${runId}-Pass!`,
  B: `Local-B-${runId}-Pass!`,
  P: `Local-P-${runId}-Pass!`,
};
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users = {};
const fixture = {
  bookingA: `auth-isolation-${runId}-booking-a`,
  bookingB: `auth-isolation-${runId}-booking-b`,
  listing: `auth-isolation-${runId}-listing`,
  module: `auth-isolation-${runId}`,
};

function resultLine(actor, table, expected, data, error) {
  const rows = Array.isArray(data) ? data.length : data == null ? 0 : 1;
  const status = error?.status ?? 200;
  const code = error?.code ?? '-';
  const actual = error ? `error:${error.message}` : `rows:${rows}`;
  const pass = expected === 'one row' ? !error && rows === 1 : !error && rows === 0;
  console.log(JSON.stringify({ actor, table, http_status: status, sqlstate_or_error: code, returned_rows: rows, expected, actual, result: pass ? 'PASS' : 'FAIL' }));
  if (!pass) process.exitCode = 1;
}

async function provision() {
  for (const actor of ['A', 'B', 'P']) {
    const { data, error } = await admin.auth.admin.createUser({ email: emails[actor], password: passwords[actor], email_confirm: true });
    if (error || !data.user) throw new Error(`fixture auth user ${actor} creation failed: ${error?.message ?? 'no user'}`);
    users[actor] = data.user;
  }
  const profileRows = [
    { id: users.A.id, role: 'customer', account_status: 'active', full_name: 'Isolation A', email: emails.A },
    { id: users.B.id, role: 'customer', account_status: 'active', full_name: 'Isolation B', email: emails.B },
    { id: users.P.id, role: 'provider', account_status: 'active', full_name: 'Isolation Provider', email: emails.P },
  ];
  const profileResult = await admin.from('profiles').upsert(profileRows, { onConflict: 'id' });
  if (profileResult.error) throw new Error(`profile fixture failed: ${profileResult.error.message}`);
  const listingResult = await admin.from('listings').insert({
    id: fixture.listing,
    owner_id: users.P.id,
    title: 'Isolation listing',
    category_id: 'auth_isolation',
    subcategory: 'security-test',
    entity_type: 'service',
    status: 'active',
    price: 0,
    price_unit: 'per test',
    payload: { test_fixture: true },
  });
  if (listingResult.error) throw new Error(`listing fixture failed: ${listingResult.error.message}`);
  const bookingResult = await admin.from('bookings').insert([
    { id: fixture.bookingA, user_id: users.A.id, listing_id: fixture.listing, listing_title: 'Isolation listing', provider_id: users.P.id, customer_name: 'Isolation A', customer_phone: '0000000000', scheduled_date: '2099-01-01', scheduled_time: '00:00' },
    { id: fixture.bookingB, user_id: users.B.id, listing_id: fixture.listing, listing_title: 'Isolation listing', provider_id: users.P.id, customer_name: 'Isolation B', customer_phone: '0000000000', scheduled_date: '2099-01-01', scheduled_time: '00:00' },
  ]);
  if (bookingResult.error) throw new Error(`booking fixture failed: ${bookingResult.error.message}`);
  const favoritesResult = await admin.from('user_favorites').insert([
    { user_id: users.A.id, listing_id: fixture.listing },
    { user_id: users.B.id, listing_id: fixture.listing },
  ]);
  if (favoritesResult.error) throw new Error(`favorite fixture failed: ${favoritesResult.error.message}`);
  const configResult = await admin.from('user_module_configs').insert([
    { user_id: users.A.id, module_key: fixture.module, config_payload: { owner: 'A' } },
    { user_id: users.B.id, module_key: fixture.module, config_payload: { owner: 'B' } },
  ]);
  if (configResult.error) throw new Error(`module config fixture failed: ${configResult.error.message}`);
}

async function signIn(actor) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: emails[actor], password: passwords[actor] });
  if (error || !data.session) throw new Error(`authenticated session ${actor} failed: ${error?.message ?? 'no session'}`);
  return client;
}

async function readMatrix() {
  const a = await signIn('A');
  const b = await signIn('B');
  const p = await signIn('P');
  const checks = [
    ['A', 'profiles', a.from('profiles').select('id').eq('id', users.A.id), 'one row'],
    ['A', 'profiles', a.from('profiles').select('id').eq('id', users.B.id), 'zero rows'],
    ['B', 'profiles', b.from('profiles').select('id').eq('id', users.B.id), 'one row'],
    ['B', 'profiles', b.from('profiles').select('id').eq('id', users.A.id), 'zero rows'],
    ['P', 'profiles', p.from('profiles').select('id').eq('id', users.A.id), 'one row'],
    ['P', 'profiles', p.from('profiles').select('id').eq('id', users.B.id), 'one row'],
    ['A', 'bookings', a.from('bookings').select('id').eq('id', fixture.bookingA), 'one row'],
    ['A', 'bookings', a.from('bookings').select('id').eq('id', fixture.bookingB), 'zero rows'],
    ['B', 'bookings', b.from('bookings').select('id').eq('id', fixture.bookingB), 'one row'],
    ['B', 'bookings', b.from('bookings').select('id').eq('id', fixture.bookingA), 'zero rows'],
    ['P', 'bookings', p.from('bookings').select('id').eq('id', fixture.bookingA), 'one row'],
    ['P', 'bookings', p.from('bookings').select('id').eq('id', fixture.bookingB), 'one row'],
    ['A', 'user_favorites', a.from('user_favorites').select('listing_id').eq('user_id', users.A.id), 'one row'],
    ['A', 'user_favorites', a.from('user_favorites').select('listing_id').eq('user_id', users.B.id), 'zero rows'],
    ['B', 'user_favorites', b.from('user_favorites').select('listing_id').eq('user_id', users.B.id), 'one row'],
    ['B', 'user_favorites', b.from('user_favorites').select('listing_id').eq('user_id', users.A.id), 'zero rows'],
    ['A', 'user_module_configs', a.from('user_module_configs').select('module_key').eq('user_id', users.A.id), 'one row'],
    ['A', 'user_module_configs', a.from('user_module_configs').select('module_key').eq('user_id', users.B.id), 'zero rows'],
    ['B', 'user_module_configs', b.from('user_module_configs').select('module_key').eq('user_id', users.B.id), 'one row'],
    ['B', 'user_module_configs', b.from('user_module_configs').select('module_key').eq('user_id', users.A.id), 'zero rows'],
  ];
  for (const [actor, table, query, expected] of checks) {
    const { data, error } = await query;
    resultLine(actor, table, expected, data, error);
  }
}

async function cleanup() {
  const ids = Object.values(users).map((user) => user?.id).filter(Boolean);
  const bookingCleanup = await admin.from('bookings').delete().in('id', [fixture.bookingA, fixture.bookingB]);
  if (bookingCleanup.error) throw new Error(`booking cleanup failed: ${bookingCleanup.error.message}`);
  if (ids.length) {
    const configCleanup = await admin.from('user_module_configs').delete().in('user_id', ids);
    if (configCleanup.error) throw new Error(`module config cleanup failed: ${configCleanup.error.message}`);
    const favoriteCleanup = await admin.from('user_favorites').delete().in('user_id', ids);
    if (favoriteCleanup.error) throw new Error(`favorite cleanup failed: ${favoriteCleanup.error.message}`);
  }
  const listingCleanup = await admin.from('listings').delete().eq('id', fixture.listing);
  if (listingCleanup.error) throw new Error(`listing cleanup failed: ${listingCleanup.error.message}`);
  if (ids.length) {
    const profileCleanup = await admin.from('profiles').delete().in('id', ids);
    if (profileCleanup.error) throw new Error(`profile cleanup failed: ${profileCleanup.error.message}`);
  }
  for (const actor of ['A', 'B', 'P']) {
    if (users[actor]?.id) {
      const { error } = await admin.auth.admin.deleteUser(users[actor].id);
      if (error) throw new Error(`fixture auth user ${actor} cleanup failed: ${error.message}`);
    }
  }
}

try {
  await provision();
  await readMatrix();
} finally {
  await cleanup();
}
if (process.exitCode) throw new Error('one or more authenticated RLS assertions failed');
console.log(JSON.stringify({ project: projectId, fixture: 'three-users-four-tables', assertions: 20, storage: 'NOT_TESTED' }));
NODE

printf '%s\n' 'PASS focused local Auth/RLS isolation test'
