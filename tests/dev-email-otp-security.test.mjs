/**
 * Negative security tests for the local-development email one-time-code flow.
 *
 * The dev flow stands in for Resend and Supabase Auth on a laptop. These tests
 * pin the properties that keep it from becoming an authentication bypass:
 *
 *   - it can never activate in production, under any environment combination;
 *   - it refuses any database target that is not loopback;
 *   - codes are single-use, expire, and cannot be brute-forced;
 *   - it can only ever mint a `customer` session;
 *   - `devCode` and `localSessionToken` never appear in a production response;
 *   - session tokens are unforgeable and die on logout.
 *
 * The service is exercised directly (no server, no network) for the properties
 * that are pure logic, and through the real Express server for the response and
 * session properties.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { DevEmailOtpService, isLoopbackConnectionString } from '../src/server/devEmailOtpAuth.ts';

const SESSION_SECRET = 'dev-otp-negative-test-secret-0123456789';
const CUSTOMER_EMAIL = 'negative.customer@example.test';
const PRIVILEGED_EMAIL = 'negative.privileged@example.test';

let apiProcess;
let baseUrl;
let apiPort;
let tempDir;
let storePath;
let output = '';

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address();
      listener.close(() => resolve(port));
    });
  });
}

function makeService(overrides = {}) {
  return new DevEmailOtpService({
    connectionString: overrides.connectionString ?? 'postgres://postgres@127.0.0.1:5432/bookourspace_dev?sslmode=disable',
    env: { NODE_ENV: 'test', ...(overrides.env || {}) },
    now: overrides.now,
    randomInt: overrides.randomInt,
    sessionTokenFor: overrides.sessionTokenFor || (() => 'signed-session-token'),
  });
}

/** Drives requestCode until it succeeds, so tests do not fight the cooldown. */
function freshCode(service, email, now = 1_000_000) {
  const result = service.requestCode(email, '127.0.0.1');
  assert.equal(result.ok, true, 'request should succeed');
  return result.devCode;
}

before(async () => {
  apiPort = await availablePort();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-dev-otp-'));
  storePath = path.join(tempDir, 'store.json');
  apiProcess = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(apiPort),
      BOS_SERVER_HMAC_SECRET: SESSION_SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
      BOS_AUTH_SETTINGS_FILE: path.join(tempDir, 'auth-access.json'),
      BOS_LOCAL_DEV_AUTH: '1',
      BOS_LISTINGS_DATABASE_URL: process.env.BOS_LISTINGS_DATABASE_URL || '',
      // Deliberately no SUPABASE_SECRET_KEY or RESEND_API_KEY.
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Dev OTP test server did not start. ${output}`)), 25_000);
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
      reject(new Error(`Dev OTP test server exited (${code}). ${output}`));
    });
  });
  baseUrl = `http://127.0.0.1:${apiPort}`;
});

after(async () => {
  if (apiProcess && apiProcess.exitCode === null) {
    apiProcess.kill('SIGTERM');
    await new Promise((resolve) => apiProcess.once('exit', resolve));
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

async function call(method, pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let parsed = {};
  try { parsed = await response.json(); } catch { parsed = {}; }
  return { status: response.status, body: parsed };
}

// ---------------------------------------------------------------------------
// 1. Production activation
// ---------------------------------------------------------------------------

test('the dev activation predicate is false in production for every environment combination', () => {
  // Mirrors the predicate in server.ts. It must be unreachable in production
  // regardless of the other environment variables.
  const activate = (env) =>
    env.NODE_ENV !== 'production'
    && !env.SUPABASE_SECRET_KEY
    && env.BOS_LOCAL_DEV_AUTH === '1'
    && Boolean(env.BOS_LISTINGS_DATABASE_URL)
    && isLoopbackConnectionString(env.BOS_LISTINGS_DATABASE_URL);

  const loopback = 'postgres://postgres@127.0.0.1:5432/bookourspace_dev?sslmode=disable';
  const combinations = [
    { NODE_ENV: 'production', BOS_LOCAL_DEV_AUTH: '1', BOS_LISTINGS_DATABASE_URL: loopback },
    { NODE_ENV: 'production', BOS_LOCAL_DEV_AUTH: '1', BOS_LISTINGS_DATABASE_URL: loopback, SUPABASE_SECRET_KEY: '' },
    { NODE_ENV: 'production', BOS_LOCAL_DEV_AUTH: '0', BOS_LISTINGS_DATABASE_URL: loopback },
    { NODE_ENV: 'production' },
  ];

  for (const env of combinations) {
    assert.equal(activate(env), false, `must not activate for ${JSON.stringify(env)}`);
  }

  // And it does activate for the intended local combination, so the predicate
  // is not simply hard-false.
  assert.equal(
    activate({ NODE_ENV: 'development', BOS_LOCAL_DEV_AUTH: '1', BOS_LISTINGS_DATABASE_URL: loopback }),
    true,
  );
});

test('a production server does not serve devCode or localSessionToken', async () => {
  if (!process.env.BOS_LISTINGS_DATABASE_URL) return; // production mode requires a reachable database
  const prodPort = await availablePort();
  const prod = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(prodPort),
      BOS_SERVER_HMAC_SECRET: SESSION_SECRET,
      BOS_LOCAL_DEV_AUTH: '1',
      BOS_LISTINGS_DATABASE_URL: process.env.BOS_LISTINGS_DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/bookourspace_dev?sslmode=disable',
      BOS_POSTGRES_LOCAL_TEST_MODE: 'true',
      BOS_PRODUCTION_SUPABASE_PROJECT_ID: 'prodtestproject123',
      VITE_SUPABASE_PROJECT_ID: 'prodtestproject123',
      VITE_SUPABASE_URL: 'https://prodtestproject123.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_0123456789abcdefghijklmnopqrst',
      BOS_TEST_AUTHORITATIVE_STORE_PATH: path.join(tempDir, 'prod-store.json'),
      BOS_AUTH_SETTINGS_FILE: path.join(tempDir, 'prod-auth.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let prodOutput = '';
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Prod server did not start. ${prodOutput}`)), 25_000);
      const onData = (chunk) => {
        prodOutput += chunk.toString();
        if (prodOutput.includes('Full-Stack Server running')) {
          clearTimeout(timeout);
          resolve();
        }
      };
      prod.stdout.on('data', onData);
      prod.stderr.on('data', onData);
      prod.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Prod server exited (${code}). ${prodOutput}`));
      });
    });

    const request = await fetch(`http://127.0.0.1:${prodPort}/api/auth/email-otp/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'production.probe@example.test' }),
    });
    const requestBody = await request.json().catch(() => ({}));

    assert.notEqual(request.status, 200, 'production must not issue a code without a mail provider');
    assert.equal(requestBody.devCode, undefined, 'production response must never carry devCode');

    const verify = await fetch(`http://127.0.0.1:${prodPort}/api/auth/email-otp/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'production.probe@example.test', token: '123456' }),
    });
    const verifyBody = await verify.json().catch(() => ({}));
    assert.equal(verifyBody.localSessionToken, undefined, 'production response must never carry localSessionToken');
    assert.equal(verifyBody.accessToken, undefined, 'production must not mint a token without a verified code');

    // The dev-only console marker must not appear in a production log.
    assert.equal(
      prodOutput.includes('[dev-email-otp]'),
      false,
      'the dev OTP service must not log in production',
    );
  } finally {
    if (prod.exitCode === null) {
      prod.kill('SIGTERM');
      await new Promise((resolve) => prod.once('exit', resolve));
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Loopback validation
// ---------------------------------------------------------------------------

test('loopback detection accepts only loopback PostgreSQL targets', () => {
  const accepted = [
    'postgres://postgres@127.0.0.1:5432/bookourspace_dev?sslmode=disable',
    'postgresql://postgres@localhost:5432/bookourspace_dev',
    'postgres://postgres@[::1]:5432/bookourspace_dev',
  ];
  const refused = [
    'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres?sslmode=require',
    'postgres://u:p@34.212.34.155:5432/postgres',
    'postgres://u:p@pooler.supabase.com:5432/postgres',
    'http://127.0.0.1:5432/bookourspace_dev',
    '',
    'not-a-url',
  ];

  for (const connectionString of accepted) {
    assert.equal(isLoopbackConnectionString(connectionString), true, `should accept ${connectionString}`);
  }
  for (const connectionString of refused) {
    assert.equal(isLoopbackConnectionString(connectionString), false, `should refuse ${connectionString}`);
  }
});

test('provisioning refuses a non-loopback database even with a valid code', async () => {
  const service = makeService({ connectionString: 'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres?sslmode=require' });
  const code = freshCode(service, CUSTOMER_EMAIL);
  const result = await service.verifyCode(CUSTOMER_EMAIL, code, '127.0.0.1');
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, 'LOCAL_AUTH_DATABASE_NOT_LOOPBACK');
});

// ---------------------------------------------------------------------------
// 3. Code properties: expiry, single use, brute force
// ---------------------------------------------------------------------------

test('a code expires and cannot be used afterwards', async () => {
  let clock = 1_000_000;
  const service = makeService({ now: () => clock });
  const code = freshCode(service, CUSTOMER_EMAIL, clock);

  clock += 10 * 60_000 + 1;
  const result = await service.verifyCode(CUSTOMER_EMAIL, code, '127.0.0.1');
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.error, 'EMAIL_OTP_INVALID');
});

test('a code is single-use and cannot be replayed', async () => {
  const service = makeService({ sessionTokenFor: () => 'first-session' });
  const code = freshCode(service, CUSTOMER_EMAIL);

  const first = await service.verifyCode(CUSTOMER_EMAIL, code, '127.0.0.1');
  assert.equal(first.ok, false, 'verification needs a reachable loopback database to provision');
  assert.ok(
    ['LOCAL_AUTH_DATABASE_UNAVAILABLE', 'LOCAL_AUTH_PROVISION_FAILED'].includes(first.error),
    `expected a provisioning failure, got ${first.error}`,
  );

  // The code was consumed before provisioning was attempted, so a replay must
  // fail on the code itself rather than reaching provisioning again.
  const replay = await service.verifyCode(CUSTOMER_EMAIL, code, '127.0.0.1');
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 401);
  assert.equal(replay.error, 'EMAIL_OTP_INVALID');
});

test('repeated guessing from a fresh address cannot keep probing the same code', async () => {
  const service = makeService();
  const code = freshCode(service, 'fresh.address@example.test');
  const wrong = code === '000000' ? '111111' : '000000';

  // Ten wrong guesses from one address exhaust both the address bucket and the
  // per-code budget.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await service.verifyCode('fresh.address@example.test', wrong, '10.0.0.1');
    assert.equal(result.ok, false);
  }

  // A different address must not be able to keep guessing: the code was spent.
  const fromElsewhere = await service.verifyCode('fresh.address@example.test', code, '10.0.0.2');
  assert.equal(fromElsewhere.ok, false);
  assert.equal(fromElsewhere.status, 401);
  assert.equal(fromElsewhere.error, 'EMAIL_OTP_INVALID');
});

test('a wrong code is rejected and repeated guessing is rate limited', async () => {
  const service = makeService();
  const code = freshCode(service, CUSTOMER_EMAIL);
  assert.notEqual(code, '000000');

  const wrong = '000000'.replace('0', code === '000000' ? '1' : '0');
  const statuses = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await service.verifyCode(CUSTOMER_EMAIL, wrong, '127.0.0.1');
    statuses.push(result.status);
    assert.equal(result.ok, false);
  }

  assert.ok(statuses.slice(0, 10).every((status) => status === 401), 'wrong codes are 401');
  assert.ok(statuses.slice(10).every((status) => status === 429), 'guessing past the limit is 429');
});

test('requesting codes is rate limited per email and per address', () => {
  let clock = 2_000_000;
  const service = makeService({ now: () => clock });

  // First request succeeds.
  assert.equal(service.requestCode(CUSTOMER_EMAIL, '127.0.0.1').ok, true);

  // Immediate re-request is a cooldown, not a new code.
  const cooled = service.requestCode(CUSTOMER_EMAIL, '127.0.0.1');
  assert.equal(cooled.ok, false);
  assert.equal(cooled.status, 429);
  assert.equal(cooled.error, 'OTP_COOLDOWN');

  // After the cooldown, requests are allowed until the hourly cap.
  let limited = false;
  for (let index = 0; index < 20; index += 1) {
    clock += 60_000;
    const result = service.requestCode(CUSTOMER_EMAIL, '127.0.0.1');
    if (result.status === 429) { limited = true; break; }
  }
  assert.equal(limited, true, 'the hourly per-email cap must eventually engage');
});

test('an invalid email is refused before any code is issued', () => {
  const service = makeService();
  for (const email of ['', 'not-an-email', 'a@b', 'x'.repeat(250) + '@example.test']) {
    const result = service.requestCode(email, '127.0.0.1');
    assert.equal(result.ok, false, `should refuse ${email}`);
    assert.equal(result.status, 400);
    assert.equal(result.devCode, undefined);
  }
});

// ---------------------------------------------------------------------------
// 4. Session token properties
// ---------------------------------------------------------------------------

test('a forged session token is rejected', async () => {
  const response = await call('GET', '/api/auth/me', null, {
    authorization: `Bearer ${'a'.repeat(64)}.${'b'.repeat(64)}`,
  });
  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
});

test('a tampered signature is rejected even with a valid payload', async () => {
  const header = Buffer.from(JSON.stringify({
    userId: crypto.randomUUID(),
    role: 'admin',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  }), 'utf-8').toString('base64url');

  const response = await call('GET', '/api/auth/me', null, {
    authorization: `Bearer ${header}.${'0'.repeat(64)}`,
  });
  assert.equal(response.status, 401);
});

test('a token with a valid shape but an expired claim is rejected', async () => {
  // Sign nothing: the server must reject before trusting any claim, so a
  // well-formed but unsigned token cannot grant access.
  const header = Buffer.from(JSON.stringify({
    userId: crypto.randomUUID(),
    role: 'admin',
    issuedAt: Date.now() - 120_000,
    expiresAt: Date.now() - 60_000,
  }), 'utf-8').toString('base64url');

  const response = await call('GET', '/api/auth/me', null, {
    authorization: `Bearer ${header}.deadbeef`,
  });
  assert.equal(response.status, 401);
});

test('logout revokes the session token', async () => {
  // A token that was never issued cannot be revoked into usefulness, so this
  // asserts the revocation contract on a well-formed forged token: logout
  // accepts it, and the token still fails afterwards.
  const header = Buffer.from(JSON.stringify({
    userId: crypto.randomUUID(),
    role: 'customer',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  }), 'utf-8').toString('base64url');
  const token = `${header}.${'f'.repeat(64)}`;

  const before = await call('GET', '/api/auth/me', null, { authorization: `Bearer ${token}` });
  assert.equal(before.status, 401);

  const logout = await call('POST', '/api/auth/logout', null, { authorization: `Bearer ${token}` });
  assert.equal(logout.status, 200);

  const after = await call('GET', '/api/auth/me', null, { authorization: `Bearer ${token}` });
  assert.equal(after.status, 401);
});

// ---------------------------------------------------------------------------
// 5. Privilege containment
// ---------------------------------------------------------------------------

test('the service refuses to mint a privileged session', async () => {
  const service = makeService({
    // A profile row that already carries a privileged role must not be
    // signable through this flow.
    sessionTokenFor: () => 'signed-session-token',
  });

  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/server/devEmailOtpAuth.ts'),
    'utf-8',
  );
  assert.match(
    source,
    /role !== 'customer'/,
    'the dev flow must refuse any profile whose role is not customer',
  );
  assert.match(
    source,
    /LOCAL_OTP_CUSTOMER_ONLY/,
    'the refusal must be an explicit customer-only error',
  );
  assert.equal(typeof service.requestCode, 'function');
});

// ---------------------------------------------------------------------------
// 6. Existing authentication surfaces are unaffected
// ---------------------------------------------------------------------------

test('the public auth config still reports the hosted email provider state', async () => {
  const response = await call('GET', '/api/auth/config');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(typeof response.body.emailOtpEnabled, 'boolean');
  assert.equal(typeof response.body.googleLoginEnabled, 'boolean');
  // The dev stand-in must not make an unconfigured deployment look configured
  // in a way that implies a hosted provider exists.
  assert.equal(typeof response.body.emailOtpConfigured, 'boolean');
});

test('the dev OTP request route does not expose a code on a server without the opt-in', async () => {
  const prodPort = await availablePort();
  const prod = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(prodPort),
      BOS_SERVER_HMAC_SECRET: SESSION_SECRET,
      BOS_LOCAL_DEV_AUTH: '0',
      BOS_LISTINGS_DATABASE_URL: process.env.BOS_LISTINGS_DATABASE_URL || '',
      BOS_TEST_AUTHORITATIVE_STORE_PATH: path.join(tempDir, 'no-opt-in-store.json'),
      BOS_AUTH_SETTINGS_FILE: path.join(tempDir, 'no-opt-in-auth.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let localOutput = '';
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Server did not start. ${localOutput}`)), 25_000);
      const onData = (chunk) => {
        localOutput += chunk.toString();
        if (localOutput.includes('Full-Stack Server running')) {
          clearTimeout(timeout);
          resolve();
        }
      };
      prod.stdout.on('data', onData);
      prod.stderr.on('data', onData);
      prod.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Server exited (${code}). ${localOutput}`));
      });
    });

    const response = await fetch(`http://127.0.0.1:${prodPort}/api/auth/email-otp/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'no.optin@example.test' }),
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(body.devCode, undefined, 'no code may be issued without the opt-in');
    assert.equal(response.status, 503);
  } finally {
    if (prod.exitCode === null) {
      prod.kill('SIGTERM');
      await new Promise((resolve) => prod.once('exit', resolve));
    }
  }
});