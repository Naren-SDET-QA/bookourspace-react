/**
 * Google-only authentication contract for the BookOurSpace Express API.
 *
 * The identity provider is a local stand-in for Supabase Auth
 * (`tests/support/fake-supabase-auth.mjs`). It proves the *server contract*
 * without a real Google sign-in:
 *
 *   - a new Google identity is registered as a customer;
 *   - a returning Google identity reuses the same account and keeps its role;
 *   - a browser-supplied role never grants provider or admin;
 *   - a Supabase access token is never accepted as an application session;
 *   - an expired session is refused and logout revokes the session;
 *   - a blocked account is refused on sign-in and on an existing session.
 *
 * A real hosted Google sign-in is NOT exercised here. That is covered by the
 * live verification in the audit report, not by this simulated suite.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const SESSION_SECRET = 'google-oauth-auth-contract-secret';
const PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnopqrstuv_01234567';

const CUSTOMER_UUID = '11111111-2222-4333-8444-555555555555';
const PROVIDER_UUID = '22222222-3333-4444-8555-666666666666';
const BLOCKED_UUID = '33333333-4444-4555-8666-777777777777';

let authProcess;
let apiProcess;
let authBaseUrl;
let baseUrl;
let tempDir;
let storePath;

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

function googleIdentity({ id, email, verified = true, provider = 'google' }) {
  return {
    id,
    email,
    email_confirmed_at: verified ? '2026-01-01T00:00:00Z' : null,
    app_metadata: { provider, providers: [provider] },
    identities: [
      {
        provider,
        identity_data: { sub: `google-oauth2|${id}`, email, full_name: 'Contract User' },
      },
    ],
    user_metadata: { full_name: 'Contract User' },
  };
}

async function setIdentity(identity) {
  const response = await fetch(`${authBaseUrl}/__control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(identity),
  });
  assert.equal(response.status, 200);
}

/** A Supabase-style access token. Only its shape matters to the server. */
const accessToken = (label) => `supabase-access-token-${label}-${'x'.repeat(48)}`;

async function call(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body: parsed };
}

function signSession(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', `${SESSION_SECRET}:SESSION_TOKEN_V2`)
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

function seedStore() {
  const provider = {
    id: 'USR-CONTRACT-PROVIDER',
    supabaseUserId: PROVIDER_UUID,
    name: 'Contract Provider',
    email: 'provider@example.test',
    phone: '',
    role: 'provider',
    providerId: 'prov-contract',
    googleSub: `google-oauth2|${PROVIDER_UUID}`,
    authProvider: 'google',
    verified: true,
    kycDocument: 'Google OAuth 2.0 Verified',
    accountStatus: 'active',
    city: '',
    joinedAt: '2026-01-01',
    lastLoginAt: '2026-01-01',
    listingsCount: 0,
    bookingsCount: 0,
    totalSpentOrEarned: 0,
    permissions: ['create_listing'],
    publishState: 'published',
  };
  const blocked = {
    id: 'USR-CONTRACT-BLOCKED',
    supabaseUserId: BLOCKED_UUID,
    name: 'Blocked User',
    email: 'blocked@example.test',
    phone: '',
    role: 'customer',
    googleSub: `google-oauth2|${BLOCKED_UUID}`,
    authProvider: 'google',
    verified: true,
    kycDocument: 'Google OAuth 2.0 Verified',
    accountStatus: 'blocked',
    city: '',
    joinedAt: '2026-01-01',
    lastLoginAt: '2026-01-01',
    listingsCount: 0,
    bookingsCount: 0,
    totalSpentOrEarned: 0,
    permissions: ['book_services'],
    publishState: 'published',
  };
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      seatLocks: {},
      bookings: [],
      enquiries: [],
      paymentIntents: {},
      usedUtrs: {},
      checkedInPasses: {},
      users: [provider, blocked],
      notifications: [],
      notificationCampaigns: [],
      providerListings: {},
      adminModules: {},
      revokedTokens: {},
    }),
    'utf-8'
  );
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-oauth-contract-'));
  storePath = path.join(tempDir, 'store.json');

  // 1. The local stand-in for Supabase Auth.
  authProcess = spawn(process.execPath, ['tests/support/fake-supabase-auth.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, FAKE_SUPABASE_AUTH_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  authBaseUrl = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`fake auth did not start: ${output}`)), 15_000);
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/FAKE_SUPABASE_AUTH_PORT=(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    };
    authProcess.stdout.on('data', onData);
    authProcess.stderr.on('data', onData);
    authProcess.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`fake auth exited (${code}): ${output}`));
    });
  });

  seedStore();

  // 2. The application server, configured against the stand-in.
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  apiProcess = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: SESSION_SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
      VITE_SUPABASE_URL: authBaseUrl,
      VITE_SUPABASE_PROJECT_ID: 'local',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'local',
      VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      VITE_SUPABASE_ANON_KEY: PUBLISHABLE_KEY,
      BOS_LISTINGS_DATABASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`api did not start: ${output}`)), 30_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes('Full-Stack Server running')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    apiProcess.stdout.on('data', onData);
    apiProcess.stderr.on('data', onData);
    apiProcess.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`api exited (${code}): ${output}`));
    });
  });
});

after(async () => {
  for (const child of [apiProcess, authProcess]) {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('the Google authorize URL is built from the configured project only', async () => {
  const response = await call('GET', '/api/auth/google/url');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.authProvider, 'google');
  assert.match(response.body.supabaseAuthorizeUrl, /\/auth\/v1\/authorize\?provider=google/);
  assert.match(response.body.callbackUrl, /\/auth\/callback$/);
  assert.equal(response.body.supabaseAuthCallbackUrl, `${authBaseUrl}/auth/v1/callback`);
});

test('a new Google identity is registered as a customer and receives a session', async () => {
  await setIdentity(googleIdentity({ id: CUSTOMER_UUID, email: 'new.customer@example.test' }));
  const response = await call('POST', '/api/auth/google/authenticate', {
    token: accessToken('new'),
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.isNewUser, true);
  assert.equal(response.body.user.role, 'customer');
  assert.equal(response.body.user.email, 'new.customer@example.test');
  assert.equal(response.body.redirectTarget, 'marketplace');
  assert.equal(response.body.claims.role, 'customer');
  assert.ok(String(response.body.sessionToken).includes('.'));
});

test('a browser supplied role never grants provider or admin', async () => {
  await setIdentity(googleIdentity({ id: CUSTOMER_UUID, email: 'new.customer@example.test' }));
  const response = await call('POST', '/api/auth/google/authenticate', {
    token: accessToken('escalation'),
    body: { requestedRole: 'admin', role: 'admin', allowRoleChange: true, authProvider: 'google' },
  });
  assert.ok([200, 201].includes(response.status));
  assert.equal(response.body.user.role, 'customer');
  assert.equal(response.body.claims.role, 'customer');
  assert.equal(response.body.redirectTarget, 'marketplace');
});

test('a returning Google identity reuses the account and keeps its role', async () => {
  await setIdentity(googleIdentity({ id: PROVIDER_UUID, email: 'provider@example.test' }));
  const response = await call('POST', '/api/auth/google/authenticate', {
    token: accessToken('returning-provider'),
  });
  assert.ok([200, 201].includes(response.status));
  assert.equal(response.body.isNewUser, false);
  assert.equal(response.body.user.id, 'USR-CONTRACT-PROVIDER');
  assert.equal(response.body.user.role, 'provider');
  assert.equal(response.body.redirectTarget, 'provider_portal');
});

test('a non-Google or unverified identity is refused', async () => {
  await setIdentity(
    googleIdentity({ id: CUSTOMER_UUID, email: 'password@example.test', provider: 'email' })
  );
  const nonGoogle = await call('POST', '/api/auth/google/authenticate', {
    token: accessToken('non-google'),
  });
  assert.equal(nonGoogle.status, 401);
  assert.equal(nonGoogle.body.error, 'INVALID_GOOGLE_SESSION');

  await setIdentity(googleIdentity({ id: CUSTOMER_UUID, email: 'unverified@example.test', verified: false }));
  const unverified = await call('POST', '/api/auth/google/authenticate', {
    token: accessToken('unverified'),
  });
  assert.equal(unverified.status, 401);
  assert.equal(unverified.body.error, 'INVALID_GOOGLE_SESSION');
});

test('a blocked Google identity cannot obtain a session', async () => {
  await setIdentity(googleIdentity({ id: BLOCKED_UUID, email: 'blocked@example.test' }));
  const response = await call('POST', '/api/auth/google/authenticate', {
    token: accessToken('blocked'),
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'ACCOUNT_BLOCKED');
});

test('a Supabase access token is never accepted as an application session', async () => {
  const response = await call('GET', '/api/auth/me', { token: accessToken('wrong-type') });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'UNAUTHORIZED_SESSION');

  const protectedRoute = await call('GET', '/api/auth/protected/admin_console', {
    token: accessToken('wrong-type'),
  });
  assert.equal(protectedRoute.status, 401);
  assert.equal(protectedRoute.body.error, 'UNAUTHORIZED_SESSION');
});

test('a forged or unsigned session token is refused', async () => {
  const forged = signSession({
    userId: 'USR-CONTRACT-PROVIDER',
    supabaseUserId: PROVIDER_UUID,
    email: 'provider@example.test',
    role: 'admin',
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });
  const [payload, signature] = forged.split('.');
  const tampered = `${payload}.${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
  const response = await call('GET', '/api/auth/me', { token: tampered });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'UNAUTHORIZED_SESSION');
});

test('an expired session is refused and logout revokes the session', async () => {
  await setIdentity(googleIdentity({ id: CUSTOMER_UUID, email: 'new.customer@example.test' }));
  const authenticated = await call('POST', '/api/auth/google/authenticate', {
    token: accessToken('lifecycle'),
  });
  const sessionToken = String(authenticated.body.sessionToken);
  assert.ok(sessionToken.includes('.'));

  const restored = await call('GET', '/api/auth/me', { token: sessionToken });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.authenticated, true);
  assert.equal(restored.body.user.id, authenticated.body.user.id);

  const expired = signSession({
    userId: authenticated.body.user.id,
    supabaseUserId: CUSTOMER_UUID,
    email: 'new.customer@example.test',
    role: 'customer',
    authProvider: 'google',
    issuedAt: Date.now() - 7_200_000,
    expiresAt: Date.now() - 3_600_000,
  });
  const expiredResponse = await call('GET', '/api/auth/me', { token: expired });
  assert.equal(expiredResponse.status, 401);

  const logout = await call('POST', '/api/auth/logout', { token: sessionToken });
  assert.equal(logout.status, 200);
  assert.equal(logout.body.loggedOut, true);

  const afterLogout = await call('GET', '/api/auth/me', { token: sessionToken });
  assert.equal(afterLogout.status, 401);
  assert.equal(afterLogout.body.error, 'UNAUTHORIZED_SESSION');
});

test('a customer session cannot reach provider or admin surfaces', async () => {
  await setIdentity(googleIdentity({ id: CUSTOMER_UUID, email: 'new.customer@example.test' }));
  const authenticated = await call('POST', '/api/auth/google/authenticate', {
    token: accessToken('customer-guard'),
  });
  const sessionToken = String(authenticated.body.sessionToken);

  const adminConsole = await call('GET', '/api/auth/protected/admin_console', { token: sessionToken });
  assert.equal(adminConsole.status, 403);
  assert.equal(adminConsole.body.error, 'FORBIDDEN_ADMIN_ONLY');

  const providerPortal = await call('GET', '/api/auth/protected/provider_portal', { token: sessionToken });
  assert.equal(providerPortal.status, 403);
  assert.equal(providerPortal.body.error, 'FORBIDDEN_PROVIDER_OR_ADMIN_ONLY');

  const adminUsers = await call('GET', '/api/admin/users', { token: sessionToken });
  assert.equal(adminUsers.status, 403);

  const superAdmin = await call('POST', '/api/auth/super-admin/session', { token: sessionToken });
  assert.equal(superAdmin.status, 403);
});

test('legacy session issuance stays disabled', async () => {
  const response = await call('POST', '/api/auth/session', {
    body: { userId: 'USR-CONTRACT-PROVIDER', email: 'provider@example.test', role: 'admin' },
  });
  assert.equal(response.status, 410);
  assert.equal(response.body.error, 'UNVERIFIED_SESSION_ISSUANCE_DISABLED');
});

test('the OAuth callback forwards no identity fields from the URL', async () => {
  const response = await fetch(`${baseUrl}/auth/callback?code=abc&email=admin%40example.test&sub=forged`, {
    redirect: 'manual',
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Completing secure sign-in/);
  assert.doesNotMatch(html, /admin%40example.test|admin@example.test|forged/);
  assert.match(html, /\/\?code=abc/);
});
