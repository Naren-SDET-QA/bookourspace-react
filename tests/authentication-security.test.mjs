import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import {
  canLinkSupabaseAuthIdentity,
  listSupabaseUserProfiles,
  manageSupabaseUserAccess,
  verifySupabaseGoogleIdentity,
  verifySupabaseSuperAdmin,
} from '../src/server/supabaseGoogleIdentity.ts';

const TEST_SECRET = 'isolated-auth-test-secret';
const AUTH_UUID = '7a1f122e-2da8-4f87-949f-dbc461b9a001';
let server;
let baseUrl;
let tempDir;

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

function signedSession(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', `${TEST_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

async function checkSession(token) {
  return fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-auth-safety-'));
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: TEST_SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: path.join(tempDir, 'isolated-store.json'),
      VITE_SUPABASE_URL: 'http://127.0.0.1:1',
      VITE_SUPABASE_PROJECT_ID: 'local',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'local',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'your-supabase-publishable-or-anon-key',
      VITE_SUPABASE_ANON_KEY: 'your-supabase-publishable-or-anon-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Local test server did not start. ${output}`)), 20_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes('Full-Stack Server running')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Local test server exited (${code}). ${output}`));
    });
  });
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('forged email and Google claims cannot create a server session', async () => {
  const response = await fetch(`${baseUrl}/api/auth/google/authenticate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authProvider: 'google', email: 'admin@bookourspace.in', googleSub: 'forged', requestedRole: 'admin' }),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'VERIFIED_GOOGLE_SESSION_REQUIRED');
});

test('legacy body-only customer, provider, and admin session issuance is disabled', async () => {
  for (const role of ['customer', 'provider', 'admin']) {
    const response = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'forged-user', email: 'admin@bookourspace.in', role, adminPasscode: 'guess' }),
    });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, 'UNVERIFIED_SESSION_ISSUANCE_DISABLED');
  }
});

test('role and account-status mutations fail closed when current Supabase authority is unavailable', async () => {
  const claims = {
    userId: 'USR-ADMIN-TEST',
    supabaseUserId: AUTH_UUID,
    email: 'admin@example.test',
    role: 'admin',
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
  for (const [path, body] of [
    ['/api/admin/users/8ce923f0-7800-4400-a460-3b454cabc123/role', { role: 'admin', reason: 'approved by owner' }],
    ['/api/admin/users/8ce923f0-7800-4400-a460-3b454cabc123/status', { status: 'suspended', reason: 'security review' }],
  ]) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${signedSession(claims)}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'DATABASE_AUTHORITY_UNAVAILABLE');
  }
});

test('session tokens require a finite future expiration and reject malformed or forged signatures', async () => {
  const baseClaims = { userId: 'USR-1004', role: 'customer', issuedAt: Date.now() };
  for (const claims of [
    baseClaims,
    { ...baseClaims, expiresAt: Date.now() - 1 },
    { ...baseClaims, expiresAt: 'never' },
    { ...baseClaims, expiresAt: null },
    { ...baseClaims, expiresAt: Date.now() + 60_000, role: 'owner' },
  ]) {
    const response = await checkSession(signedSession(claims));
    assert.equal(response.status, 401, `rejected claims: ${JSON.stringify(claims)}`);
  }
  const malformed = await checkSession('not-a-token.extra.parts');
  assert.equal(malformed.status, 401);
  const valid = signedSession({ ...baseClaims, expiresAt: Date.now() + 60_000 });
  const [payload, signature] = valid.split('.');
  const forged = `${payload}.${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
  assert.equal((await checkSession(forged)).status, 401);
});

test('notification access ignores caller role and user filters and requires a signed session', async () => {
  const unauthenticated = await fetch(`${baseUrl}/api/notifications?role=admin&userId=other-user`);
  assert.equal(unauthenticated.status, 401);

  const customerToken = signedSession({
    userId: 'USR-CUSTOMER-TEST',
    email: 'customer@example.test',
    role: 'customer',
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });
  const notifications = await fetch(`${baseUrl}/api/notifications?role=admin&userId=other-user`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert.equal(notifications.status, 200);
  const data = await notifications.json();
  assert.deepEqual(data.campaigns, []);
  assert.ok(data.notifications.every((n) => !n.recipientUserId || n.recipientUserId === 'USR-CUSTOMER-TEST'));

  const clear = await fetch(`${baseUrl}/api/notifications/clear`, { method: 'POST' });
  assert.equal(clear.status, 401);
});

test('callback query identity fields cannot authenticate or assign roles', async () => {
  const response = await fetch(`${baseUrl}/auth/callback?google_email=admin%40bookourspace.in&google_name=Admin&google_sub=forged&role=admin`, { redirect: 'manual' });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Completing secure sign-in/);
  assert.doesNotMatch(html, /OAUTH_AUTH_SUCCESS|google_email|google_sub/);
});

test('Google OAuth is unavailable rather than falling back when Supabase is not configured', async () => {
  const response = await fetch(`${baseUrl}/api/auth/google/url`);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.url, undefined);
});

test('server identity verifier accepts only an Auth-verified Google identity', async () => {
  const accessToken = 'supabase-access-token-that-is-never-logged';
  const validUser = {
    id: AUTH_UUID,
    email: 'customer@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'google' },
    identities: [{ provider: 'google', identity_data: { sub: 'google-sub-1', full_name: 'Verified Customer' } }],
  };
  let requested = false;
  const verified = await verifySupabaseGoogleIdentity({
    projectUrl: 'https://dev-project.supabase.co',
    publishableKey: 'public-key',
    accessToken,
    fetchImpl: async (url, init) => {
      requested = true;
      assert.equal(String(url), 'https://dev-project.supabase.co/auth/v1/user');
      assert.equal(init.headers.Authorization, `Bearer ${accessToken}`);
      return new Response(JSON.stringify(validUser), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(requested, true);
  assert.deepEqual(verified, {
    id: AUTH_UUID,
    email: 'customer@example.com',
    googleSub: 'google-sub-1',
    name: 'Verified Customer',
  });

  for (const user of [
    { ...validUser, app_metadata: { provider: 'email' }, identities: [] },
    { ...validUser, email_confirmed_at: null },
    { ...validUser, email: 'not-an-email' },
    { ...validUser, id: 'not-a-supabase-uuid' },
  ]) {
    const rejected = await verifySupabaseGoogleIdentity({
      projectUrl: 'https://dev-project.supabase.co', publishableKey: 'public-key', accessToken,
      fetchImpl: async () => new Response(JSON.stringify(user), { status: 200 }),
    });
    assert.equal(rejected, null);
  }
});

test('verified Supabase identity links legacy profiles once and rejects takeover', () => {
  assert.equal(canLinkSupabaseAuthIdentity(undefined, AUTH_UUID), true);
  assert.equal(canLinkSupabaseAuthIdentity(AUTH_UUID, AUTH_UUID), true);
  assert.equal(canLinkSupabaseAuthIdentity('9f9d9c3b-a83b-4da1-b2b6-4b2c0dbb1212', AUTH_UUID), false);
  assert.equal(canLinkSupabaseAuthIdentity(undefined, 'not-a-uuid'), false);
});

test('identity verifier fails closed on missing config, invalid tokens, and non-HTTPS hosted URLs', async () => {
  const fetchImpl = async () => new Response('{}', { status: 200 });
  assert.equal(await verifySupabaseGoogleIdentity({ projectUrl: '', publishableKey: 'k', accessToken: 'a'.repeat(32), fetchImpl }), null);
  assert.equal(await verifySupabaseGoogleIdentity({ projectUrl: 'https://dev-project.supabase.co', publishableKey: '', accessToken: 'a'.repeat(32), fetchImpl }), null);
  assert.equal(await verifySupabaseGoogleIdentity({ projectUrl: 'https://dev-project.supabase.co', publishableKey: 'k', accessToken: 'short', fetchImpl }), null);
  assert.equal(await verifySupabaseGoogleIdentity({ projectUrl: 'http://dev-project.supabase.co', publishableKey: 'k', accessToken: 'a'.repeat(32), fetchImpl }), null);
});

test('Super Admin scope and role changes are decided by authenticated Supabase RPCs', async () => {
  const accessToken = 'verified-google-access-token-long-enough-for-the-boundary';
  const verifiedUser = {
    id: AUTH_UUID,
    email: 'admin@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'google' },
    identities: [{ provider: 'google', identity_data: { sub: 'sub-admin' } }],
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify(verifiedUser), { status: 200 });
    if (String(url).endsWith('/rpc/is_current_user_super_admin')) return new Response('true', { status: 200 });
    return new Response(JSON.stringify([{
      id: '8ce923f0-7800-4400-a460-3b454cabc123',
      email: 'target@example.com', role: 'admin', account_status: 'active', verified: true, is_super_admin: false,
    }]), { status: 200 });
  };
  const base = { projectUrl: 'https://dev-project.supabase.co', publishableKey: 'public-key', accessToken, fetchImpl };
  assert.equal((await verifySupabaseSuperAdmin(base))?.id, AUTH_UUID);
  const changed = await manageSupabaseUserAccess({
    ...base,
    targetUserId: '8ce923f0-7800-4400-a460-3b454cabc123',
    action: 'promote',
    reason: 'approved by security review',
  });
  assert.equal(changed.role, 'admin');
  const rpcCall = calls.find((call) => call.url.endsWith('/rpc/manage_user_access'));
  assert.equal(rpcCall.init.headers.Authorization, `Bearer ${accessToken}`);
  assert.deepEqual(JSON.parse(rpcCall.init.body), {
    p_target_user_id: '8ce923f0-7800-4400-a460-3b454cabc123',
    p_action: 'promote',
    p_reason: 'approved by security review',
  });

  const denied = await verifySupabaseSuperAdmin({
    ...base,
    fetchImpl: async (url) => String(url).endsWith('/auth/v1/user')
      ? new Response(JSON.stringify(verifiedUser), { status: 200 })
      : new Response('false', { status: 200 }),
  });
  assert.equal(denied, null);
});

test('Admin profile listing uses the verified matching Google identity and current database role', async () => {
  const accessToken = 'verified-google-access-token-for-admin-listing';
  const verifiedUser = {
    id: AUTH_UUID,
    email: 'admin@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'google' },
    identities: [{ provider: 'google', identity_data: { sub: 'sub-admin' } }],
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify(verifiedUser), { status: 200 });
    if (String(url).endsWith('/rpc/is_current_user_admin')) return new Response('true', { status: 200 });
    return new Response(JSON.stringify([{ id: AUTH_UUID, role: 'admin', account_status: 'active' }]), { status: 200 });
  };
  const profiles = await listSupabaseUserProfiles({
    projectUrl: 'https://dev-project.supabase.co', publishableKey: 'public-key', accessToken,
    expectedActorUserId: AUTH_UUID, fetchImpl,
  });
  assert.equal(profiles.length, 1);
  const profileRequest = calls.find((call) => call.url.includes('/rest/v1/profiles?'));
  assert.ok(profileRequest);
  assert.match(profileRequest.url, /select=id%2Cemail%2Cfull_name/);
  assert.equal(profileRequest.init.headers.Authorization, `Bearer ${accessToken}`);

  const forbidden = await listSupabaseUserProfiles({
    projectUrl: 'https://dev-project.supabase.co', publishableKey: 'public-key', accessToken,
    expectedActorUserId: '8ce923f0-7800-4400-a460-3b454cabc123', fetchImpl,
  });
  assert.equal(forbidden, null, 'a Supabase token cannot be paired with a different signed server identity');
});
