#!/usr/bin/env bash
# =============================================================================
# Live Edit verification: admin-only RBAC, audit trail, publish/rollback and
# restart persistence on the real Express server.
#
# The database half of live edit (platform_config_versions + the draft/publish/
# rollback RPCs and their RLS policies) is covered by
# supabase/tests/app_builder_config_test.sql in run_local_validation.sh
# (app_config checks). This script covers what that SQL test cannot: the HTTP
# surface, the actor recorded in the audit trail, refusal for anon/customer/
# provider, and that a published version survives a server restart.
#
# The server keeps its JSON compatibility store at <repo>/live-page-config.json.
# This script snapshots that file and restores it byte-for-byte on exit, so the
# worktree is left exactly as it was found.
# =============================================================================
set -uo pipefail
export LC_ALL=C LANG=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/bos-livedit.XXXXXX")" || exit 1
printf '%s\n' "BookOurSpace live edit verification scratch" > "$SCRATCH/.bos-owned"
STORE_PATH="$REPO_ROOT/live-page-config.json"
STORE_BACKUP="$SCRATCH/live-page-config.json.bak"
SERVER_PID=""
SECRET="bos-live-edit-verify-secret"

fail() { echo "FAILED: $*" >&2; exit 1; }
pass() { echo "    PASS $*"; }

restore_store() {
  if [ -f "$STORE_PATH" ]; then rm -f "$STORE_PATH"; fi
  if [ -f "$STORE_BACKUP" ]; then cp -p "$STORE_BACKUP" "$STORE_PATH"; fi
}
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  restore_store
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

if [ -f "$STORE_PATH" ]; then cp -p "$STORE_PATH" "$STORE_BACKUP"; fi

cat > "$SCRATCH/store.json" <<'JSON'
{
  "seatLocks": {}, "bookings": [], "enquiries": [], "paymentIntents": {},
  "users": [
    {"id":"USR-LE-A","name":"E2E Admin","email":"live.admin@example.test","phone":"+91 90000 00101","role":"admin","googleSub":"g-le-a","authProvider":"google","verified":true,"accountStatus":"active","status":"active","city":"Hyderabad","joinedAt":"2026-01-01","lastLoginAt":"2026-01-01T00:00:00.000Z","totalBookings":0,"totalListings":0,"walletBalance":0},
    {"id":"USR-LE-P","name":"E2E Provider","email":"live.provider@example.test","phone":"+91 90000 00102","role":"provider","googleSub":"g-le-p","authProvider":"google","verified":true,"accountStatus":"active","status":"active","city":"Hyderabad","joinedAt":"2026-01-01","lastLoginAt":"2026-01-01T00:00:00.000Z","totalBookings":0,"totalListings":1,"walletBalance":0},
    {"id":"USR-LE-C","name":"E2E Customer","email":"live.customer@example.test","phone":"+91 90000 00103","role":"customer","googleSub":"g-le-c","authProvider":"google","verified":true,"accountStatus":"active","status":"active","city":"Hyderabad","joinedAt":"2026-01-01","lastLoginAt":"2026-01-01T00:00:00.000Z","totalBookings":0,"totalListings":0,"walletBalance":0}
  ],
  "notifications": [], "notificationCampaigns": [], "providerListings": {},
  "adminModules": {}, "revokedTokens": {}
}
JSON

TOKENS="$(SECRET="$SECRET" node -e '
const { createHmac } = require("node:crypto");
const people = {
  admin: { id: "USR-LE-A", email: "live.admin@example.test", name: "E2E Admin", role: "admin" },
  provider: { id: "USR-LE-P", email: "live.provider@example.test", name: "E2E Provider", role: "provider" },
  customer: { id: "USR-LE-C", email: "live.customer@example.test", name: "E2E Customer", role: "customer" },
};
const out = {};
for (const [key, person] of Object.entries(people)) {
  const claims = { userId: person.id, email: person.email, name: person.name, role: person.role,
    googleSub: "g-" + person.id.toLowerCase(), phone: "+91 90000 00000", issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000 };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  out[key] = payload + "." + createHmac("sha256", process.env.SECRET + ":SESSION_TOKEN_V2").update(payload).digest("hex");
}
console.log(JSON.stringify(out));
')" || fail "could not mint sessions"
jq_get() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=eval("(JSON.parse(s))"+process.argv[1]);console.log(typeof v==="object"?JSON.stringify(v):String(v))}catch(e){console.log("__ERR__")}})' "$1"; }

start_server() {
  PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')"
  BASE="http://127.0.0.1:$PORT"
  NODE_ENV=test PORT="$PORT" VITE_ENABLE_DEMO_DATA=false DISABLE_HMR=true \
  VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PROJECT_ID="local" VITE_SUPABASE_DEVELOPMENT_PROJECT_ID="local" \
  VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key" VITE_SUPABASE_ANON_KEY="your-supabase-publishable-or-anon-key" \
  BOS_SERVER_HMAC_SECRET="$SECRET" BOS_TEST_AUTHORITATIVE_STORE_PATH="$SCRATCH/store.json" \
  RAZORPAY_KEY_ID="" RAZORPAY_KEY_SECRET="" RAZORPAY_WEBHOOK_SECRET="" \
  node node_modules/tsx/dist/cli.mjs server.ts >> "$SCRATCH/server.log" 2>&1 &
  SERVER_PID=$!
  local deadline=$((SECONDS + 90))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS "$BASE/api/live-page-config" -o /dev/null 2>/dev/null; then return 0; fi
    kill -0 "$SERVER_PID" 2>/dev/null || { tail -20 "$SCRATCH/server.log" >&2; fail "server exited during boot"; }
    sleep 0.5
  done
  tail -20 "$SCRATCH/server.log" >&2
  fail "server did not become ready"
}

call() { # method path token body -> "status<TAB>body"
  local method="$1" path="$2" token="$3" body="${4:-}"
  local args=(-sS -o "$SCRATCH/resp.json" -w '%{http_code}' -X "$method" "$BASE$path")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  local status; status="$(curl "${args[@]}")"
  printf '%s\t%s' "$status" "$(cat "$SCRATCH/resp.json")"
}

echo "=== 1. boot the real server with an isolated authoritative store ==="
start_server
pass "listening on $BASE"
ADMIN="$(printf '%s' "$TOKENS" | jq_get '.admin')"
PROVIDER="$(printf '%s' "$TOKENS" | jq_get '.provider')"
CUSTOMER="$(printf '%s' "$TOKENS" | jq_get '.customer')"
[ -n "$ADMIN" ] || fail "admin token missing"

echo "=== 2. anon read exposes no draft, history or audit data ==="
OUT="$(call GET /api/live-page-config '')"
STATUS="${OUT%%$'\t'*}"; BODY="${OUT#*$'\t'}"
[ "$STATUS" = "200" ] || fail "anon GET status=$STATUS"
[ "$(printf '%s' "$BODY" | jq_get '.draft')" = "undefined" ] || fail "anon saw draft"
[ "$(printf '%s' "$BODY" | jq_get '.versions')" = "undefined" ] || fail "anon saw versions"
[ "$(printf '%s' "$BODY" | jq_get '.auditLogs')" = "undefined" ] || fail "anon saw auditLogs"
pass "anon GET omits draft/versions/auditLogs"

echo "=== 3. RBAC: only an active admin may write ==="
OUT="$(call POST /api/live-page-config/draft '' '{"config":{"globalBrandName":"Anon"}}')"
[ "${OUT%%$'\t'*}" = "401" ] || fail "anon draft expected 401, got ${OUT%%$'\t'*}"
[ "$(printf '%s' "${OUT#*$'\t'}" | jq_get '.error')" = "UNAUTHORIZED_SESSION" ] || fail "anon error code"
pass "anon draft -> 401 UNAUTHORIZED_SESSION"
OUT="$(call POST /api/live-page-config/draft "$CUSTOMER" '{"config":{"globalBrandName":"Customer"}}')"
[ "${OUT%%$'\t'*}" = "403" ] || fail "customer draft expected 403, got ${OUT%%$'\t'*}"
[ "$(printf '%s' "${OUT#*$'\t'}" | jq_get '.error')" = "FORBIDDEN_ADMIN_ONLY" ] || fail "customer error code"
pass "customer draft -> 403 FORBIDDEN_ADMIN_ONLY"
OUT="$(call POST /api/live-page-config/publish "$PROVIDER" '{"config":{"globalBrandName":"Provider"}}')"
[ "${OUT%%$'\t'*}" = "403" ] || fail "provider publish expected 403, got ${OUT%%$'\t'*}"
pass "provider publish -> 403 FORBIDDEN_ADMIN_ONLY"

echo "=== 4. admin saves a draft and the audit trail names the actor ==="
OUT="$(call POST /api/live-page-config/draft "$ADMIN" '{"config":{"globalBrandName":"BookOurSpace Live Edit"},"summary":"E2E draft" }')"
[ "${OUT%%$'\t'*}" = "200" ] || fail "admin draft status=${OUT%%$'\t'*}"
DRAFT_BODY="${OUT#*$'\t'}"
[ "$(printf '%s' "$DRAFT_BODY" | jq_get '.auditLogs[0].actor')" = "E2E Admin" ] || fail "audit actor"
[ "$(printf '%s' "$DRAFT_BODY" | jq_get '.auditLogs[0].role')" = "admin" ] || fail "audit role"
[ "$(printf '%s' "$DRAFT_BODY" | jq_get '.auditLogs[0].action')" = "Saved Page Draft" ] || fail "audit action"
[ "$(printf '%s' "$DRAFT_BODY" | jq_get '.auditLogs[0].details')" = "E2E draft" ] || fail "audit details"
pass "draft saved; audit actor=E2E Admin role=admin action=Saved Page Draft"

echo "=== 5. admin publishes; version history advances and audit records it ==="
OUT="$(call POST /api/live-page-config/publish "$ADMIN" '{"summary":"E2E publish"}')"
[ "${OUT%%$'\t'*}" = "200" ] || fail "publish status=${OUT%%$'\t'*}"
PUB_BODY="${OUT#*$'\t'}"
VERSION_ID="$(printf '%s' "$PUB_BODY" | jq_get '.versionId')"
printf '%s' "$VERSION_ID" | grep -Eq '^v1\.[0-9]+\.0$' || fail "unexpected versionId $VERSION_ID"
[ "$(printf '%s' "$PUB_BODY" | jq_get '.versions[0].versionId')" = "$VERSION_ID" ] || fail "history head mismatch"
[ "$(printf '%s' "$PUB_BODY" | jq_get '.published.globalBrandName')" = "BookOurSpace Live Edit" ] || fail "published config"
printf '%s' "$(printf '%s' "$PUB_BODY" | jq_get '.auditLogs[0].action')" | grep -q "Published $VERSION_ID" || fail "publish audit action"
pass "published $VERSION_ID; audit action Published $VERSION_ID"

echo "=== 6. admin-only read surface, anon still restricted ==="
OUT="$(call GET /api/live-page-config "$ADMIN")"
[ "${OUT%%$'\t'*}" = "200" ] || fail "admin GET status"
[ "$(printf '%s' "${OUT#*$'\t'}" | jq_get '.versions[0].versionId')" = "$VERSION_ID" ] || fail "admin history"
OUT="$(call GET /api/live-page-config '')"
[ "$(printf '%s' "${OUT#*$'\t'}" | jq_get '.versions')" = "undefined" ] || fail "anon saw versions after publish"
pass "admin sees history; anon does not"

echo "=== 7. published state and history survive a server restart ==="
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""
start_server
OUT="$(call GET /api/live-page-config "$ADMIN")"
[ "${OUT%%$'\t'*}" = "200" ] || fail "admin GET after restart"
[ "$(printf '%s' "${OUT#*$'\t'}" | jq_get '.published.versionId')" = "$VERSION_ID" ] || fail "published version lost on restart"
[ "$(printf '%s' "${OUT#*$'\t'}" | jq_get '.versions[0].versionId')" = "$VERSION_ID" ] || fail "history lost on restart"
pass "restart preserved published $VERSION_ID and history"

echo "=== 8. admin rollback restores the snapshot and is audited ==="
TARGET="$(printf '%s' "$PUB_BODY" | jq_get '.versions[0].versionId')"
OUT="$(call POST /api/live-page-config/rollback "$ADMIN" "{\"versionId\":\"$TARGET\"}")"
[ "${OUT%%$'\t'*}" = "200" ] || fail "rollback status=${OUT%%$'\t'*}"
RB_BODY="${OUT#*$'\t'}"
[ "$(printf '%s' "$RB_BODY" | jq_get '.published.versionId')" = "$TARGET-rollback" ] || fail "rollback version id"
printf '%s' "$(printf '%s' "$RB_BODY" | jq_get '.auditLogs[0].action')" | grep -q "Rolled Back to $TARGET" || fail "rollback audit"
pass "rollback -> $TARGET-rollback with audit entry"

echo "=== 9. rollback to an unknown version is refused ==="
OUT="$(call POST /api/live-page-config/rollback "$ADMIN" '{"versionId":"v9.99.0"}')"
[ "${OUT%%$'\t'*}" = "404" ] || fail "unknown rollback expected 404, got ${OUT%%$'\t'*}"
pass "unknown version -> 404"

echo
echo "ALL LIVE EDIT CHECKS PASSED (admin RBAC, audit actor/action, publish history, restart persistence, rollback; DB RPC + RLS covered by app_builder_config_test.sql)"
