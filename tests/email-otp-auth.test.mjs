/**
 * Email one-time-code sign-in and administrator-controlled sign-in switches.
 *
 * A local stand-in provides Supabase Auth's Admin/verify endpoints and Resend's
 * mail endpoint. The browser contract is exercised end to end through the real
 * Express server: request a code, deliver it through the fake Resend, verify it
 * with Supabase, then exchange the Supabase token for a server session.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const SESSION_SECRET = 'email-otp-contract-secret';
const PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnopqrstuv_01234567';
const SECRET_KEY = 'test-supabase-secret-key';
const CUSTOMER_UUID = '8a1f122e-2da8-4f87-949f-dbc461b9a111';
const ADMIN_UUID = '9b2f122e-2da8-4f87-949f-dbc461b9a222';
const CUSTOMER_EMAIL = 'otp.customer@example.test';
const OTP_CODE = '482913';
const SUPABASE_ACCESS_TOKEN = `supabase-access-token-${'x'.repeat(52)}`;
const SUPABASE_REFRESH_TOKEN = `supabase-refresh-token-${'y'.repeat(48)}`;

let providerServer;
let resendServer;
let apiProcess;
let baseUrl;
let tempDir;
let storePath;
let lastEmail = null;
let lastAdminUserBody = null;
let lastGenerateLinkBody = null;
let userEmail = CUSTOMER_EMAIL;

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk.toString(); });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function supabaseUser({ email = userEmail, provider = 'email', confirmed = true } = {}) {
  return {
    id: CUSTOMER_UUID,
    email,
    email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null,
    app_metadata: { provider, providers: [provider] },
    identities: [{ provider, identity_data: { email, email_verified: true } }],
    user_metadata: { full_name: 'OTP Customer' },
  };
}

function signSession(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', `${SESSION_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

async function call(method, url, { token, body, headers } = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
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
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 300) }; }
  return { status: response.status, body: parsed };
}

function seedStore() {
  const admin = {
    id: 'USR-OTP-ADMIN',
    supabaseUserId: ADMIN_UUID,
    name: 'OTP Admin',
    email: 'admin.otp@example.test',
    phone: '',
    role: 'admin',
    authProvider: 'google',
    verified: true,
    kycDocument: 'Google OAuth 2.0 Verified',
    accountStatus: 'active',
    city: 'Hyderabad',
    joinedAt: '2026-01-01',
    lastLoginAt: '2026-01-01',
    listingsCount: 0,
    bookingsCount: 0,
    totalSpentOrEarned: 0,
    permissions: [],
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
      usedRazorpayPaymentIds: {},
      razorpayWebhookEvents: {},
      checkedInPasses: {},
      passVerificationAudit: [],
      users: [admin],
      notifications: [],
      notificationCampaigns: [],
      providerListings: {},
      adminModules: {},
      revokedTokens: {},
    }),
  );
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-email-otp-'));
  storePath = path.join(tempDir, 'store.json');
  seedStore();

  providerServer = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/auth/v1/admin/users' && request.method === 'POST') {
      lastAdminUserBody = await readBody(request);
      json(response, 200, { id: CUSTOMER_UUID });
      return;
    }
    if (url.pathname === '/auth/v1/admin/generate_link' && request.method === 'POST') {
      lastGenerateLinkBody = await readBody(request);
      json(response, 200, {
        action_link: 'https://example.test/verify',
        email_otp: OTP_CODE,
        hashed_token: 'hashed-token',
        verification_type: 'magiclink',
        redirect_to: 'http://localhost:5173',
      });
      return;
    }
    if (url.pathname === '/auth/v1/verify' && request.method === 'POST') {
      const body = await readBody(request);
      if (body?.token !== OTP_CODE || body?.email !== userEmail) {
        json(response, 400, { error: 'invalid_grant', msg: 'Token has expired or is invalid' });
        return;
      }
      json(response, 200, {
        access_token: SUPABASE_ACCESS_TOKEN,
        refresh_token: SUPABASE_REFRESH_TOKEN,
        expires_in: 3600,
        token_type: 'bearer',
        user: supabaseUser(),
      });
      return;
    }
    if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
      const authorization = String(request.headers.authorization || '');
      if (authorization !== `Bearer ${SUPABASE_ACCESS_TOKEN}`) {
        json(response, 401, { error: 'invalid_token' });
        return;
      }
      json(response, 200, supabaseUser());
      return;
    }
    json(response, 404, { error: 'not_found' });
  });
  await new Promise((resolve) => providerServer.listen(0, '127.0.0.1', resolve));
  const providerPort = providerServer.address().port;

  resendServer = http.createServer(async (request, response) => {
    if (request.url === '/emails' && request.method === 'POST') {
      lastEmail = { authorization: String(request.headers.authorization || ''), body: await readBody(request) };
      json(response, 200, { id: 'email_contract_1' });
      return;
    }
    json(response, 404, { error: 'not_found' });
  });
  await new Promise((resolve) => resendServer.listen(0, '127.0.0.1', resolve));
  const resendPort = resendServer.address().port;

  const apiPort = await availablePort();
  baseUrl = `http://127.0.0.1:${apiPort}`;
  apiProcess = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(apiPort),
      BOS_SERVER_HMAC_SECRET: SESSION_SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
      BOS_AUTH_SETTINGS_FILE: path.join(tempDir, 'auth-access.json'),
      BOS_GUEST_LOGIN_ENABLED: '0',
      BOS_EMAIL_OTP_ENABLED: '1',
      BOS_GOOGLE_LOGIN_ENABLED: '1',
      VITE_SUPABASE_URL: `http://127.0.0.1:${providerPort}`,
      VITE_SUPABASE_PROJECT_ID: 'local',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'local',
      VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      VITE_SUPABASE_ANON_KEY: PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: SECRET_KEY,
      RESEND_API_KEY: 'test-resend-key',
      RESEND_FROM_EMAIL: 'BookOurSpace <login@example.test>',
      RESEND_API_BASE_URL: `http://127.0.0.1:${resendPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Email OTP test server did not start. ${output}`)), 20_000);
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
      reject(new Error(`Email OTP test server exited (${code}). ${output}`));
    });
  });
});

after(async () => {
  if (apiProcess && apiProcess.exitCode === null) {
    apiProcess.kill('SIGTERM');
    await new Promise((resolve) => apiProcess.once('exit', resolve));
  }
  if (providerServer) await new Promise((resolve) => providerServer.close(resolve));
  if (resendServer) await new Promise((resolve) => resendServer.close(resolve));
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('public sign-in config hides guest browsing until an administrator enables it', async () => {
  const response = await call('GET', '/api/auth/config');
  assert.equal(response.status, 200);
  assert.equal(response.body.guestLoginEnabled, false);
  assert.equal(response.body.emailOtpEnabled, true);
  assert.equal(response.body.emailOtpConfigured, true);
  assert.equal(response.body.googleLoginEnabled, true);
});

test('an invalid email is refused before any provider call', async () => {
  lastEmail = null;
  const response = await call('POST', '/api/auth/email-otp/request', { body: { email: 'not-an-email' } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'INVALID_EMAIL');
  assert.equal(lastEmail, null);
});

test('a valid request creates the Supabase user, generates a code and emails it through Resend', async () => {
  lastEmail = null;
  lastAdminUserBody = null;
  lastGenerateLinkBody = null;
  const response = await call('POST', '/api/auth/email-otp/request', { body: { email: CUSTOMER_EMAIL } });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(lastAdminUserBody.email, CUSTOMER_EMAIL);
  assert.equal(lastAdminUserBody.email_confirm, true);
  assert.equal(lastGenerateLinkBody.type, 'magiclink');
  assert.equal(lastGenerateLinkBody.email, CUSTOMER_EMAIL);
  assert.ok(lastEmail, 'Resend must receive the message');
  assert.equal(lastEmail.authorization, 'Bearer test-resend-key');
  assert.deepEqual(lastEmail.body.to, [CUSTOMER_EMAIL]);
  assert.match(String(lastEmail.body.subject), new RegExp(OTP_CODE));
  assert.match(String(lastEmail.body.text), new RegExp(OTP_CODE));
  assert.match(String(lastEmail.body.html), new RegExp(OTP_CODE));
  const serialized = JSON.stringify(response.body);
  assert.doesNotMatch(serialized, new RegExp(OTP_CODE), 'the API response never contains the code');
});

test('a resend inside the cooldown is refused', async () => {
  const response = await call('POST', '/api/auth/email-otp/request', { body: { email: CUSTOMER_EMAIL } });
  assert.equal(response.status, 429);
  assert.equal(response.body.error, 'OTP_COOLDOWN');
  assert.ok(response.body.retryAfterSeconds > 0);
});

test('a wrong code is refused with a generic message', async () => {
  const response = await call('POST', '/api/auth/email-otp/verify', {
    body: { email: CUSTOMER_EMAIL, token: '000000' },
  });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'EMAIL_OTP_INVALID');
});

test('the emailed code verifies, mints a session and restores as an email identity', async () => {
  const verified = await call('POST', '/api/auth/email-otp/verify', {
    body: { email: CUSTOMER_EMAIL, token: OTP_CODE },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.ok, true);
  assert.equal(verified.body.accessToken, SUPABASE_ACCESS_TOKEN);
  assert.equal(verified.body.refreshToken, SUPABASE_REFRESH_TOKEN);

  const authenticated = await call('POST', '/api/auth/supabase/authenticate', {
    token: verified.body.accessToken,
  });
  assert.ok([200, 201].includes(authenticated.status));
  assert.equal(authenticated.body.ok, true);
  assert.equal(authenticated.body.authProvider, 'email');
  assert.equal(authenticated.body.user.role, 'customer');
  assert.ok(String(authenticated.body.sessionToken).includes('.'));

  const restored = await call('GET', '/api/auth/me', { token: authenticated.body.sessionToken });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.authenticated, true);
  assert.equal(restored.body.authProvider, 'email');
  assert.equal(restored.body.user.email, CUSTOMER_EMAIL);
});

test('the email endpoint refuses a Google-only identity on the Google contract', async () => {
  // Keep the historical Google-only semantics: an email identity must never
  // satisfy /api/auth/google/authenticate even though it has a valid token.
  const response = await call('POST', '/api/auth/google/authenticate', { token: SUPABASE_ACCESS_TOKEN });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'INVALID_GOOGLE_SESSION');
});

test('administrators can hide guest browsing and disable email sign-in', async () => {
  const adminToken = signSession({
    userId: 'USR-OTP-ADMIN',
    supabaseUserId: ADMIN_UUID,
    email: 'admin.otp@example.test',
    role: 'admin',
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });

  const initial = await call('GET', '/api/admin/auth-settings', { token: adminToken });
  assert.equal(initial.status, 200);
  assert.equal(initial.body.settings.guestLoginEnabled, false);

  const enabled = await call('PUT', '/api/admin/auth-settings', {
    token: adminToken,
    body: { guestLoginEnabled: true },
  });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.settings.guestLoginEnabled, true);

  const publicConfig = await call('GET', '/api/auth/config');
  assert.equal(publicConfig.body.guestLoginEnabled, true);

  const disabledEmail = await call('PUT', '/api/admin/auth-settings', {
    token: adminToken,
    body: { emailOtpEnabled: false },
  });
  assert.equal(disabledEmail.status, 200);

  const refused = await call('POST', '/api/auth/email-otp/request', { body: { email: 'new.person@example.test' } });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'EMAIL_OTP_DISABLED');

  // A client that bypasses the UI and verifies directly with Supabase must
  // still be refused when the administrator disabled email sign-in.
  const exchange = await call('POST', '/api/auth/supabase/authenticate', { token: SUPABASE_ACCESS_TOKEN });
  assert.equal(exchange.status, 403);
  assert.equal(exchange.body.error, 'EMAIL_OTP_DISABLED');

  const noMethods = await call('PUT', '/api/admin/auth-settings', {
    token: adminToken,
    body: { googleLoginEnabled: false },
  });
  assert.equal(noMethods.status, 400);
  assert.equal(noMethods.body.error, 'AUTH_SETTINGS_NO_SIGN_IN_METHOD');

  const restore = await call('PUT', '/api/admin/auth-settings', {
    token: adminToken,
    body: { emailOtpEnabled: true, googleLoginEnabled: true, guestLoginEnabled: false },
  });
  assert.equal(restore.status, 200);
});

test('a customer session cannot change sign-in settings', async () => {
  const customerToken = signSession({
    userId: 'USR-OTP-CUSTOMER',
    supabaseUserId: CUSTOMER_UUID,
    email: CUSTOMER_EMAIL,
    role: 'customer',
    authProvider: 'email',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });
  const response = await call('PUT', '/api/admin/auth-settings', {
    token: customerToken,
    body: { guestLoginEnabled: true },
  });
  assert.equal(response.status, 403);
});
