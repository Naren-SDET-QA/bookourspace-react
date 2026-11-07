import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAccountClosureApi } from '../src/server/accountClosureApi.ts';

const uid = '83cfbd93-f844-4bcf-ae52-09aa0914b3d4';
function token(authTime) {
  const payload = Buffer.from(JSON.stringify({ auth_time: authTime })).toString('base64url');
  return `header.${payload}.signature`;
}
function harness(fetchImpl) {
  let handler;
  const app = { post: (_path, callback) => { handler = callback; } };
  registerAccountClosureApi(app, { projectUrl: 'https://project.example', publishableKey: 'publishable', serverSecretKey: 'sb_secret_test', fetchImpl });
  const response = {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  return { invoke: (accessToken) => handler({
    headers: { authorization: `Bearer ${accessToken}` },
    get: () => '',
  }, response), response };
}

test('server closes only a recently authenticated verified Google account', async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({
      id: uid, email: 'owner@example.com', email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'google' }, identities: [{ provider: 'google', identity_data: { sub: 'google-sub' } }],
    }), { status: 200 });
    return new Response('', { status: 200 });
  };
  const { invoke, response } = harness(fetchImpl);
  const authTime = Math.floor(Date.now() / 1000) - 30;
  await invoke(token(authTime));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { ok: true });
  const rpc = calls.find((call) => call.url.endsWith('/rpc/close_account_server'));
  assert.ok(rpc);
  assert.equal(rpc.init.headers.apikey, 'sb_secret_test');
  assert.equal(rpc.init.headers.Authorization, undefined);
  assert.equal(JSON.parse(rpc.init.body).p_owner_id, uid);
});

test('stale Google authentication is rejected before the privileged closure RPC', async () => {
  let rpcCalled = false;
  const fetchImpl = async (input) => {
    if (String(input).endsWith('/auth/v1/user')) return new Response(JSON.stringify({
      id: uid, email: 'owner@example.com', email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'google' }, identities: [{ provider: 'google', identity_data: { sub: 'google-sub' } }],
    }), { status: 200 });
    rpcCalled = true;
    return new Response('', { status: 200 });
  };
  const { invoke, response } = harness(fetchImpl);
  await invoke(token(Math.floor(Date.now() / 1000) - 700));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'RECENT_GOOGLE_AUTHENTICATION_REQUIRED');
  assert.equal(rpcCalled, false);
});
