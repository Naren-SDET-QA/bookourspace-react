#!/usr/bin/env bash
# Focused local Supabase Storage RLS test. Never targets the linked project.
set -euo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_BASE="${TMPDIR:-/tmp}"
TMP_ROOT="$(mktemp -d "$TMP_BASE/bos-storage-isolation.XXXXXX")"
PROJECT_DIR="$TMP_ROOT/project"
MARKER="$TMP_ROOT/.bos-storage-isolation-owned"
PROJECT_ID="bos-storage-$(openssl rand -hex 6)"
LOG="$TMP_ROOT/supabase.log"
STATUS_FILE="$TMP_ROOT/status.env"
BEFORE_CONTAINERS="$TMP_ROOT/before.containers"
BEFORE_VOLUMES="$TMP_ROOT/before.volumes"
BEFORE_NETWORKS="$TMP_ROOT/before.networks"
printf '%s\n' 'BookOurSpace focused local Storage isolation scratch directory' > "$MARKER"

die() { printf 'FAIL %s\n' "$1" >&2; exit 1; }
resources() {
  case "$1" in
    containers) docker ps -aq --filter "label=com.supabase.cli.project=$PROJECT_ID" | sort ;;
    volumes) docker volume ls -q --filter "label=com.supabase.cli.project=$PROJECT_ID" | sort ;;
    networks) docker network ls -q --filter "label=com.supabase.cli.project=$PROJECT_ID" | sort ;;
    *) die "unknown resource kind" ;;
  esac
}
snapshot() {
  docker ps -aq --format '{{.ID}} {{.Names}}' | sort > "$BEFORE_CONTAINERS"
  docker volume ls -q | sort > "$BEFORE_VOLUMES"
  docker network ls -q | sort > "$BEFORE_NETWORKS"
}
assert_untouched() {
  local now="$TMP_ROOT/now"
  docker ps -aq --format '{{.ID}} {{.Names}}' | sort > "$now.containers"
  docker volume ls -q | sort > "$now.volumes"
  docker network ls -q | sort > "$now.networks"
  diff -u "$BEFORE_CONTAINERS" "$now.containers" >/dev/null || die 'existing containers changed'
  diff -u "$BEFORE_VOLUMES" "$now.volumes" >/dev/null || die 'existing volumes changed'
  diff -u "$BEFORE_NETWORKS" "$now.networks" >/dev/null || die 'existing networks changed'
}
cleanup() {
  set +e
  if [ -d "$PROJECT_DIR" ]; then supabase stop --workdir "$PROJECT_DIR" --no-backup >/dev/null 2>&1; fi
  for kind in containers volumes networks; do
    test -z "$(resources "$kind")" || { printf 'FAIL cleanup left generated %s\n' "$kind" >&2; return 1; }
  done
  assert_untouched || return 1
  python3 - "$TMP_ROOT" "$TMP_BASE" <<'PY'
from pathlib import Path
import shutil, sys
root = Path(sys.argv[1]).resolve(); base = Path(sys.argv[2]).resolve()
marker = root / '.bos-storage-isolation-owned'
if root.parent != base or not root.name.startswith('bos-storage-isolation.'):
    raise SystemExit('Refusing cleanup: temporary path is out of scope')
if not marker.is_file() or marker.read_text().strip() != 'BookOurSpace focused local Storage isolation scratch directory':
    raise SystemExit('Refusing cleanup: ownership marker mismatch')
shutil.rmtree(root)
PY
}
trap cleanup EXIT

for command in supabase docker openssl node python3; do command -v "$command" >/dev/null 2>&1 || die "$command unavailable"; done
snapshot
for kind in containers volumes networks; do test -z "$(resources "$kind")" || die "generated project id already exists ($kind)"; done
mkdir -p "$PROJECT_DIR"
supabase init --force --workdir "$PROJECT_DIR" >/dev/null 2>&1 || die 'supabase init failed'

python3 - "$PROJECT_DIR/supabase/config.toml" "$PROJECT_ID" <<'PY'
from pathlib import Path
import re, socket, sys
p = Path(sys.argv[1]); project = sys.argv[2]; text = p.read_text()
text = re.sub(r'^project_id = ".*"$', f'project_id = "{project}"', text, count=1, flags=re.M)
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); value = s.getsockname()[1]; s.close(); return value
ports = {key: port() for key in ('api','db','shadow','pooler','studio','inbucket','analytics')}
def set_port(section, value):
    global text
    pattern = re.compile(rf'(^\[{re.escape(section)}\]\n(?:.*\n)*?port = )(\d+)(\n)', re.M)
    text, count = pattern.subn(rf'\g<1>{value}\g<3>', text, count=1)
    if count != 1: raise SystemExit(f'missing port section: {section}')
for section, key in (('api','api'),('db','db'),('db.pooler','pooler'),('studio','studio'),('local_smtp','inbucket'),('analytics','analytics')):
    set_port(section, ports[key])
text = re.sub(r'^shadow_port = \d+$', f'shadow_port = {ports["shadow"]}', text, count=1, flags=re.M)
p.write_text(text)
PY
mkdir -p "$PROJECT_DIR/supabase/migrations"
cp "$REPO_ROOT/supabase/schema_and_rls.sql" "$PROJECT_DIR/supabase/migrations/00000000000000_baseline.sql"
cp "$REPO_ROOT"/supabase/migrations/*.sql "$PROJECT_DIR/supabase/migrations/"
supabase start --workdir "$PROJECT_DIR" --yes > "$LOG" 2>&1 || { tail -40 "$LOG" >&2; die 'isolated Supabase start failed'; }
for kind in containers volumes networks; do test -n "$(resources "$kind")" || die "isolated project has no labeled $kind"; done
supabase status --workdir "$PROJECT_DIR" -o env > "$STATUS_FILE" 2>/dev/null || die 'supabase status failed'
set -a; . "$STATUS_FILE"; set +a
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) die 'API URL is not loopback' ;; esac
case "$DB_URL" in postgresql://*@127.0.0.1:*|postgresql://*@localhost:*) ;; *) die 'DB URL is not loopback' ;; esac
export BOS_STORAGE_URL="$API_URL" BOS_STORAGE_ANON_KEY="$ANON_KEY" BOS_STORAGE_SERVICE_KEY="$SERVICE_ROLE_KEY" BOS_STORAGE_DB_URL="$DB_URL" BOS_STORAGE_PROJECT_ID="$PROJECT_ID"

node --input-type=module <<'NODE'
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
const { Client } = pg;
const url = process.env.BOS_STORAGE_URL, anon = process.env.BOS_STORAGE_ANON_KEY;
const service = process.env.BOS_STORAGE_SERVICE_KEY, dbUrl = process.env.BOS_STORAGE_DB_URL;
const run = randomUUID(), admin = createClient(url, service, { auth: { persistSession: false } });
const users = {}, objects = [], metadata = [], listings = [], emails = {
  A: `bos-storage-a-${run}@example.test`, B: `bos-storage-b-${run}@example.test`,
};
const passwords = { A: `Storage-A-${run}-Pass!`, B: `Storage-B-${run}-Pass!` };
const path = { ADoc: '', BDoc: '', AProfile: '', AProfileClient: '', Public: '', PublicAttempt: '' };
function supabaseError(label, error) {
  return new Error(JSON.stringify({ fixture_error: label, message: error?.message ?? 'unknown error', code: error?.code ?? null, details: error?.details ?? null, hint: error?.hint ?? null }));
}
const output = (id, actor, bucket, operation, expected, data, error) => {
  const rows = Array.isArray(data) ? data.length : data == null ? 0 : 1;
  const status = error?.status ?? 200, code = error?.code ?? '-';
  const ok = expected === 'allow' ? !error : Boolean(error);
  console.log(JSON.stringify({ id, actor, bucket, operation, http_status: status, sqlstate_or_error: code, returned_rows: rows, expected, actual: error ? `error:${error.message}` : `rows:${rows}`, result: ok ? 'PASS' : 'FAIL' }));
  if (!ok) process.exitCode = 1;
};
async function sql(text, values = []) { const c = new Client({ connectionString: dbUrl }); await c.connect(); try { return await c.query(text, values); } finally { await c.end(); } }
async function provision() {
  for (const actor of ['A', 'B']) { const { data, error } = await admin.auth.admin.createUser({ email: emails[actor], password: passwords[actor], email_confirm: true }); if (error || !data.user) throw supabaseError(`auth ${actor} creation`, error); users[actor] = data.user; }
  const profileRows = [
    { id: users.A.id, role: 'customer', account_status: 'active', full_name: 'Storage A', email: emails.A },
    { id: users.B.id, role: 'customer', account_status: 'active', full_name: 'Storage B', email: emails.B },
  ];
  const profiles = await admin.from('profiles').upsert(profileRows, { onConflict: 'id', ignoreDuplicates: true });
  if (profiles.error) throw supabaseError('profile fixture upsert', profiles.error);
  for (const row of profileRows) {
    const profile = await admin.from('profiles').update({ email: row.email, full_name: row.full_name, role: row.role, account_status: row.account_status }).eq('id', row.id);
    if (profile.error) throw supabaseError(`profile fixture update ${row.id}`, profile.error);
  }
  path.ADoc = `${users.A.id}/storage-rls/${run}/a.txt`; path.BDoc = `${users.B.id}/storage-rls/${run}/b.txt`;
  path.AProfile = `${users.A.id}/profile_avatar/${run}/server-avatar.jpg`; path.AProfileClient = `${users.A.id}/profile_avatar/${run}/client-avatar.jpg`; path.Public = `${users.A.id}/services/provider_listing/${run}/public.jpg`; path.PublicAttempt = `${users.A.id}/services/provider_listing/${run}/customer-attempt.jpg`;
  const bucketRows = await sql("select id, public from storage.buckets where id = any($1::text[])", [['bos-private-documents','bos-private-profile-media','bos-public-media']]);
  if (bucketRows.rowCount !== 3 || bucketRows.rows.some((row) => row.public !== false)) throw new Error(JSON.stringify({ fixture_error: 'required bucket definitions missing or public', expected_bucket_count: 3, actual_bucket_count: bucketRows.rowCount }));
  const policyRows = await sql("select policyname, cmd, roles::text, coalesce(qual, '') as using_expr, coalesce(with_check, '') as check_expr from pg_policies where schemaname='storage' and tablename='objects' and policyname = any($1::text[])", [['Owners and Super Admins read private documents','Booking parties upload private documents','Owners read private profile images','Owners upload private profile images','Published public media objects are readable']]);
  const required = {
    'Owners and Super Admins read private documents': ['SELECT', 'bos-private-documents', 'split_part'],
    'Booking parties upload private documents': ['INSERT', 'bos-private-documents', 'split_part'],
    'Owners read private profile images': ['SELECT', 'bos-private-profile-media', 'split_part'],
    'Owners upload private profile images': ['INSERT', 'bos-private-profile-media', 'split_part'],
    'Published public media objects are readable': ['SELECT', 'bos-public-media', 'media_assets'],
  };
  for (const [name, [cmd, bucket, predicate]] of Object.entries(required)) {
    const row = policyRows.rows.find((candidate) => candidate.policyname === name);
    if (!row || row.cmd !== cmd || !(row.using_expr + row.check_expr).includes(bucket) || !(row.using_expr + row.check_expr).includes(predicate)) throw new Error(JSON.stringify({ fixture_error: `required Storage policy definition missing or mismatched: ${name}`, expected_command: cmd, expected_bucket: bucket, expected_predicate_marker: predicate, actual: row ?? null }));
  }
  console.log(JSON.stringify({ inspection: 'PASS', buckets: bucketRows.rows.map((row) => ({ id: row.id, public: row.public })), required_policies: Object.keys(required) }));
  const publicUpload = await admin.storage.from('bos-public-media').upload(path.Public, Buffer.from('fixture'), { contentType: 'image/jpeg', upsert: false });
  if (publicUpload.error) throw supabaseError('service public fixture upload', publicUpload.error); objects.push(['bos-public-media', path.Public]);
  const listing = await admin.from('listings').insert({ id: run, owner_id: users.A.id, title: 'Storage isolation fixture', category_id: 'storage-isolation', subcategory: 'storage-isolation', entity_type: 'service', status: 'active', payload: { images: [`storage://bos-public-media/${path.Public}`] } }).select('id').single();
  if (listing.error) throw supabaseError('public listing fixture', listing.error); listings.push(listing.data.id);
  const asset = await admin.from('media_assets').insert({ owner_id: users.A.id, module_key: 'services', parent_type: 'provider_listing', parent_id: listing.data.id, bucket_id: 'bos-public-media', object_path: path.Public, media_kind: 'image', media_format: 'jpeg', privacy: 'public', file_size_bytes: 7, checksum_sha256: 'a'.repeat(64), variants: [], display_order: 0, processing_status: 'ready' }).select('id').single();
  if (asset.error) throw supabaseError('public metadata fixture', asset.error); metadata.push(asset.data.id);
  const profileUpload = await admin.storage.from('bos-private-profile-media').upload(path.AProfile, Buffer.from('fixture'), { contentType: 'image/jpeg', upsert: false });
  if (!profileUpload.error) objects.push(['bos-private-profile-media', path.AProfile]);
  else throw supabaseError('service profile fixture upload', profileUpload.error);
}
async function session(actor) { const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }); const { data, error } = await c.auth.signInWithPassword({ email: emails[actor], password: passwords[actor] }); if (error || !data.session) throw new Error(`session ${actor} failed`); return c; }
async function verifyBytes(client, bucket, name, expected, label) { const result = await client.storage.from(bucket).download(name); if (result.error) return { ok: false, error: result.error }; const bytes = Buffer.from(await result.data.arrayBuffer()); return { ok: bytes.equals(Buffer.from(expected)), error: bytes.equals(Buffer.from(expected)) ? null : { message: `${label} content mismatch`, code: 'CONTENT_CHANGED' } }; }
async function mutationCheck(id, actor, bucket, operation, expected, fn, owner, name, original, inconclusiveCodes = []) { const result = await fn(); if (result.error && inconclusiveCodes.includes(result.error.code)) { console.log(JSON.stringify({ id, actor, bucket, operation, http_status: result.error.status ?? 400, sqlstate_or_error: result.error.code, returned_rows: 0, expected, actual: `inconclusive:${result.error.message}`, result: 'NOT_TESTED' })); process.exitCode = 1; return; } const verification = await verifyBytes(owner, bucket, name, original, `${operation} follow-up`); const pass = Boolean(result.error) ? verification.ok : verification.ok && (result.data == null || (Array.isArray(result.data) && result.data.length === 0)); console.log(JSON.stringify({ id, actor, bucket, operation, http_status: result.error?.status ?? 200, sqlstate_or_error: result.error?.code ?? '-', returned_rows: Array.isArray(result.data) ? result.data.length : 0, expected, actual: result.error ? `error:${result.error.message}; object_unchanged:${verification.ok}` : `rows:0; object_unchanged:${verification.ok}`, result: pass ? 'PASS' : 'FAIL' })); if (!pass) process.exitCode = 1; }
async function runTests() {
  const a = await session('A'), b = await session('B');
  const checks = [
    ['01','A','bos-private-documents','upload A private document','allow', async()=>a.storage.from('bos-private-documents').upload(path.ADoc, Buffer.from('A'), { contentType:'text/plain', upsert:false })],
    ['02','A','bos-private-documents','download A private document','allow', async()=>a.storage.from('bos-private-documents').download(path.ADoc)],
    ['03','B','bos-private-documents','download A private document','deny', async()=>b.storage.from('bos-private-documents').download(path.ADoc)],
    ['04','B','bos-private-documents','upload into A path','deny', async()=>b.storage.from('bos-private-documents').upload(path.ADoc, Buffer.from('B'), { contentType:'text/plain', upsert:false })],
    ['05','B','bos-private-documents','upload B private document','allow', async()=>b.storage.from('bos-private-documents').upload(path.BDoc, Buffer.from('B'), { contentType:'text/plain', upsert:false })],
    ['06','B','bos-private-documents','download B private document','allow', async()=>b.storage.from('bos-private-documents').download(path.BDoc)],
    ['07','A','bos-private-documents','download B private document','deny', async()=>a.storage.from('bos-private-documents').download(path.BDoc)],
    ['10','B','bos-private-profile-media','download A profile media','deny', async()=>b.storage.from('bos-private-profile-media').download(path.AProfile)],
    ['11','B','bos-private-profile-media','upload into A profile path','deny', async()=>b.storage.from('bos-private-profile-media').upload(path.AProfile, Buffer.from('x'), { contentType:'image/jpeg', upsert:false })],
    ['15','A','bos-private-profile-media','upload A profile media','allow', async()=>a.storage.from('bos-private-profile-media').upload(path.AProfileClient, Buffer.from('x'), { contentType:'image/jpeg', upsert:false })],
    ['16','A','bos-public-media','customer upload public media','deny', async()=>a.storage.from('bos-public-media').upload(path.PublicAttempt, Buffer.from('x'), { contentType:'image/jpeg', upsert:false })],
  ];
  for (const [id, actor, bucket, operation, expected, fn] of checks) { const result = await fn(); output(id, actor, bucket, operation, expected, result.data, result.error); if (!result.error && id === '01') objects.push(['bos-private-documents', path.ADoc]); if (!result.error && id === '05') objects.push(['bos-private-documents', path.BDoc]); if (!result.error && id === '15') objects.push(['bos-private-profile-media', path.AProfileClient]); if (!result.error && id === '16') objects.push(['bos-public-media', path.PublicAttempt]); }
  await mutationCheck('08', 'A', 'bos-private-documents', 'update A private document', 'deny', async()=>a.storage.from('bos-private-documents').update(path.ADoc, Buffer.from('x'), { upsert:true, contentType:'text/plain' }), a, path.ADoc, 'A', ['InvalidMimeType']);
  await mutationCheck('09', 'A', 'bos-private-documents', 'delete A private document', 'deny', async()=>a.storage.from('bos-private-documents').remove([path.ADoc]), a, path.ADoc, 'A');
  const publicObject = await admin.storage.from('bos-public-media').download(path.Public);
  const publicRow = await sql('select bucket_id, object_path, privacy, processing_status, variants from public.media_assets where id = $1', [metadata[0]]);
  const bMetadata = await b.from('media_assets').select('bucket_id, object_path, privacy, processing_status, variants').eq('id', metadata[0]).maybeSingle();
  console.log(JSON.stringify({ diagnostic: 'public-media-fixture', service_object: { exists: !publicObject.error, error: publicObject.error?.message ?? null }, service_metadata: { row_count: publicRow.rowCount, row: publicRow.rows[0] ?? null }, user_b_metadata: { visible: Boolean(bMetadata.data), error: bMetadata.error?.message ?? null } }));
  const publicRead = await b.storage.from('bos-public-media').download(path.Public);
  const publicBytes = publicRead.error ? { ok: false } : { ok: Buffer.from(await publicRead.data.arrayBuffer()).equals(Buffer.from('fixture')) };
  console.log(JSON.stringify({ id:'12', actor:'B', bucket:'bos-public-media', operation:'download ready A public object', http_status: publicRead.error?.status ?? 200, sqlstate_or_error: publicRead.error?.code ?? '-', returned_rows: publicRead.error ? 0 : 1, expected:'allow', actual: publicRead.error ? `error:${publicRead.error.message}` : `content_matches:${publicBytes.ok}`, result: !publicRead.error && publicBytes.ok ? 'PASS' : 'FAIL' }));
  if (publicRead.error || !publicBytes.ok) process.exitCode = 1;
  await mutationCheck('13', 'B', 'bos-public-media', 'update A public object', 'deny', async()=>b.storage.from('bos-public-media').update(path.Public, Buffer.from('x'), { upsert:true, contentType:'image/jpeg' }), a, path.Public, 'fixture', ['InvalidMimeType']);
  await mutationCheck('14', 'B', 'bos-public-media', 'delete A public object', 'deny', async()=>b.storage.from('bos-public-media').remove([path.Public]), a, path.Public, 'fixture');
  const profileMetadata = await a.from('media_assets').insert({ owner_id: users.A.id, module_key: 'profile', parent_type: 'profile_avatar', parent_id: users.A.id, bucket_id: 'bos-private-profile-media', object_path: path.AProfileClient, media_kind: 'image', media_format: 'jpeg', privacy: 'private', file_size_bytes: 1, variants: [], display_order: 0, processing_status: 'quarantined' }).select('id').single();
  if (profileMetadata.error) throw new Error(`profile media metadata contract failed: ${profileMetadata.error.message}`); metadata.push(profileMetadata.data.id);
  await verifyBytes(a, 'bos-private-documents', path.ADoc, 'A', 'A private document after denied mutations');
  await verifyBytes(b, 'bos-private-documents', path.BDoc, 'B', 'B private document');
  await verifyBytes(a, 'bos-private-profile-media', path.AProfile, 'fixture', 'A profile media after denied cross-user upload');
  await verifyBytes(b, 'bos-public-media', path.Public, 'fixture', 'ready public media after denied mutations');
  await verifyBytes(a, 'bos-private-profile-media', path.AProfileClient, 'x', 'A profile media');
}
async function cleanup() { for (const [bucket, name] of objects) { const result = await admin.storage.from(bucket).remove([name]); if (result.error) throw new Error(`object cleanup failed: ${result.error.message}`); } if (metadata.length) { const result = await admin.from('media_assets').delete().in('id', metadata); if (result.error) throw new Error('metadata cleanup failed'); } if (listings.length) { const result = await admin.from('listings').delete().in('id', listings); if (result.error) throw new Error('listing cleanup failed'); } const ids = Object.values(users).map((u)=>u.id); const p = await admin.from('profiles').delete().in('id', ids); if (p.error) throw new Error('profile cleanup failed'); for (const actor of ['A','B']) { const result = await admin.auth.admin.deleteUser(users[actor].id); if (result.error) throw new Error(`auth cleanup ${actor} failed`); } }
try { await provision(); await runTests(); } finally { await cleanup(); }
if (process.exitCode) throw new Error('one or more Storage assertions failed');
  console.log(JSON.stringify({ project: process.env.BOS_STORAGE_PROJECT_ID, fixture: 'two-users-three-buckets', assertions: 16 }));
NODE

printf '%s\n' 'PASS focused local Storage RLS test'
