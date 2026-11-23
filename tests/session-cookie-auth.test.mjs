/**
 * SEC-02: the application session is an HttpOnly cookie and state-changing
 * requests must prove CSRF. These tests fail if a header/localStorage token
 * transport is ever reintroduced.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import {
  CSRF_HEADER_NAME,
  isUnsafeMethod,
  parseCookieHeader,
  readSessionTokenFromCookie,
  requiresCsrfCheck,
  resolveCookiePolicy,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../src/server/sessionCookie.ts';
import { csrfTokensMatch, deriveCsrfToken } from '../src/server/sessionCsrfToken.ts';
import { clearSessionCsrfToken, sessionAuthHeaders, setSessionCsrfToken } from '../src/lib/sessionCsrf.ts';

const TEST_SECRET = 'sec02-cookie-session-test-secret';
const baseClaims = {
  userId: 'USR-SEC02',
  supabaseUserId: '8ce923f0-7800-4400-a460-3b454cabc999',
  email: 'sec02@example.test',
  name: 'SEC 02',
  role: 'customer',
  authProvider: 'google',
  issuedAt: Date.now(),
};

function signedSession(overrides = {}) {
  const claims = { ...baseClaims, expiresAt: Date.now() + 60_000, ...overrides };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', `${TEST_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function cookieHeaders(token) {
  return {
    cookie: `bos_session=${token}`,
    [CSRF_HEADER_NAME]: deriveCsrfToken(token, TEST_SECRET),
  };
}

/* ------------------------------ cookie policy ------------------------------ */

test('the cookie parser reads a session cookie and ignores malformed pairs', () => {
  assert.deepEqual(parseCookieHeader('a=1; bos_session=abc.def; broken'), {
    a: '1',
    bos_session: 'abc.def',
  });
  assert.equal(readSessionTokenFromCookie('bos_session=abc.def'), 'abc.def');
  assert.equal(readSessionTokenFromCookie('other=1'), null);
  assert.equal(readSessionTokenFromCookie(undefined), null);
});

test('a production cookie is Secure and SameSite=Lax, and loopback development may omit Secure', () => {
  const production = resolveCookiePolicy({ nodeEnv: 'production', requestOrigin: 'https://app.example' });
  assert.equal(production.secure, true);
  assert.equal(production.sameSite, 'Lax');

  const development = resolveCookiePolicy({ nodeEnv: 'development', requestOrigin: 'http://localhost:3000' });
  assert.equal(development.secure, false);
  assert.equal(development.sameSite, 'Lax');

  const native = resolveCookiePolicy({ nodeEnv: 'production', requestOrigin: 'https://app.example', nativeOriginAllowed: true });
  assert.equal(native.secure, true);
  assert.equal(native.sameSite, 'None');
});

test('the serialized session cookie is HttpOnly with a bounded lifetime', () => {
  const cookie = serializeSessionCookie('token.value', { secure: true, sameSite: 'Lax', path: '/' }, 600);
  assert.match(cookie, /^bos_session=token\.value/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=600/);

  const cleared = serializeClearedSessionCookie({ secure: true, sameSite: 'Lax', path: '/' });
  assert.match(cleared, /Max-Age=0/);
});

/* ----------------------------------- CSRF ---------------------------------- */

test('only unsafe methods need a CSRF proof, and session-establishing routes are exempt', () => {
  assert.equal(isUnsafeMethod('GET'), false);
  assert.equal(isUnsafeMethod('post'), true);
  assert.equal(requiresCsrfCheck('POST', '/bookings', true), true);
  assert.equal(requiresCsrfCheck('DELETE', '/bookings/1', true), true);
  assert.equal(requiresCsrfCheck('GET', '/auth/me', true), false);
  assert.equal(requiresCsrfCheck('POST', '/auth/local-dev/session', true), false);
  assert.equal(requiresCsrfCheck('POST', '/auth/google/authenticate', true), false);
  // No ambient cookie means no ambient authority to protect.
  assert.equal(requiresCsrfCheck('POST', '/bookings', false), false);
});

test('the CSRF proof is derived from the session, so it rotates and cannot be guessed', () => {
  const first = signedSession();
  const second = signedSession({ issuedAt: Date.now() + 1 });
  assert.equal(deriveCsrfToken(first, TEST_SECRET), deriveCsrfToken(first, TEST_SECRET));
  assert.notEqual(deriveCsrfToken(first, TEST_SECRET), deriveCsrfToken(second, TEST_SECRET));
  assert.notEqual(deriveCsrfToken(first, TEST_SECRET), deriveCsrfToken(first, 'other-secret'));
  assert.equal(deriveCsrfToken('not-a-token', TEST_SECRET), null);
  assert.equal(csrfTokensMatch(deriveCsrfToken(first, TEST_SECRET), deriveCsrfToken(first, TEST_SECRET)), true);
  assert.equal(csrfTokensMatch('a'.repeat(64), deriveCsrfToken(first, TEST_SECRET)), false);
  assert.equal(csrfTokensMatch(undefined, deriveCsrfToken(first, TEST_SECRET)), false);
});

test('the browser holds only the CSRF proof and never a bearer credential', () => {
  clearSessionCsrfToken();
  assert.deepEqual(sessionAuthHeaders(), {});
  setSessionCsrfToken('abc');
  assert.deepEqual(sessionAuthHeaders(), { [CSRF_HEADER_NAME]: 'abc' });
  const headers = sessionAuthHeaders();
  assert.equal('Authorization' in headers, false);
  clearSessionCsrfToken();
  assert.deepEqual(sessionAuthHeaders(), {});
});

test('no source file reads a session token from web storage', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(full, 'utf8');
        for (const line of source.split('\n')) {
          if (!/bos_session_token_v1|bos_authoritative_session_token/.test(line)) continue;
          // Only the deliberate purge of a retired key may mention it.
          if (/LEGACY_SESSION_TOKEN_KEYS/.test(line)) continue;
          if (/removeItem\((?:'|")bos_(?:authoritative_)?session_token/.test(line)) continue;
          offenders.push(`${path.relative(process.cwd(), full)}: ${line.trim()}`);
        }
      }
    }
  };
  walk(path.join(process.cwd(), 'src'));
  assert.deepEqual(offenders, []);
});

/* --------------------------------- runtime -------------------------------- */

let server;
let baseUrl;
let tempDir;

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-sec02-'));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_SERVER_HMAC_SECRET: TEST_SECRET,
      BOS_TEST_AUTHORITATIVE_STORE_PATH: path.join(tempDir, 'store.json'),
      // Force the database-free compatibility path this contract exercises.
      BOS_PG_URL: '',
      BOS_LISTINGS_DATABASE_URL: '',
      BOS_TEST_DATABASE_URL: '',
      VITE_SUPABASE_URL: 'http://127.0.0.1:1',
      VITE_SUPABASE_PROJECT_ID: 'local',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'local',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'local-publishable-key',
      VITE_SUPABASE_ANON_KEY: 'local-publishable-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server did not start. ${output}`)), 20_000);
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
      reject(new Error(`server exited ${code}. ${output}`));
    });
  });
});

after(() => {
  server?.kill();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('a request without the session cookie is unauthenticated', async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(response.status, 401);
});

test('the cookie alone authenticates, and a bearer header is not accepted', async () => {
  const token = signedSession();
  const cookieResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: cookieHeaders(token) });
  assert.equal(cookieResponse.status, 200);
  assert.equal(cookieResponse.headers.get('cache-control'), 'no-store');
  const body = await cookieResponse.json();
  assert.equal(body.authenticated, true);

  const bearerResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${token}`, 'x-bos-session-token': token },
  });
  assert.equal(bearerResponse.status, 401, 'the retired header transport must stay closed');
});

test('an expired session cookie is refused', async () => {
  const expired = signedSession({ expiresAt: Date.now() - 1_000 });
  const response = await fetch(`${baseUrl}/api/auth/me`, { headers: cookieHeaders(expired) });
  assert.equal(response.status, 401);
});

test('an unsafe request without the CSRF proof is rejected', async () => {
  const token = signedSession();
  const missing = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie: `bos_session=${token}` },
  });
  assert.equal(missing.status, 403);
  assert.equal((await missing.json()).error, 'CSRF_TOKEN_INVALID');

  const wrong = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie: `bos_session=${token}`, [CSRF_HEADER_NAME]: 'f'.repeat(64) },
  });
  assert.equal(wrong.status, 403);
});

test('logout with a valid CSRF proof clears and revokes the session', async () => {
  const token = signedSession();
  const headers = cookieHeaders(token);
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers });
  assert.equal(logout.status, 200);
  const setCookie = logout.headers.getSetCookie().join(',');
  assert.match(setCookie, /bos_session=;/);
  assert.match(setCookie, /Max-Age=0/);

  const afterLogout = await fetch(`${baseUrl}/api/auth/me`, { headers });
  assert.equal(afterLogout.status, 401);
});

test('a customer session cannot reach an admin surface', async () => {
  const token = signedSession();
  const response = await fetch(`${baseUrl}/api/auth/protected/admin_console`, { headers: cookieHeaders(token) });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'FORBIDDEN_ADMIN_ONLY');
});

test('two independent sessions stay isolated and survive a reload', async () => {
  const alice = signedSession({ userId: 'USR-ALICE', email: 'alice@example.test', supabaseUserId: '8ce923f0-7800-4400-a460-3b454cabc111' });
  const bob = signedSession({ userId: 'USR-BOB', email: 'bob@example.test', supabaseUserId: '8ce923f0-7800-4400-a460-3b454cabc222' });

  const [first, second] = await Promise.all([
    fetch(`${baseUrl}/api/auth/me`, { headers: cookieHeaders(alice) }),
    fetch(`${baseUrl}/api/auth/me`, { headers: cookieHeaders(bob) }),
  ]);
  assert.equal((await first.json()).user.id, 'USR-ALICE');
  assert.equal((await second.json()).user.id, 'USR-BOB');

  // "Reload": a fresh request with the same cookie (no other client state) is
  // still the same identity.
  const reloaded = await fetch(`${baseUrl}/api/auth/me`, { headers: cookieHeaders(alice) });
  assert.equal(reloaded.status, 200);
  assert.equal((await reloaded.json()).user.id, 'USR-ALICE');

  // Signing one out must not touch the other.
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: cookieHeaders(alice) });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: cookieHeaders(alice) })).status, 401);
  const survivor = await fetch(`${baseUrl}/api/auth/me`, { headers: cookieHeaders(bob) });
  assert.equal(survivor.status, 200);
  assert.equal((await survivor.json()).user.id, 'USR-BOB');
});

/**
 * A session-issuing endpoint must deliver the token only through the HttpOnly
 * cookie. Scanning the real response bodies keeps a newly added endpoint from
 * quietly reintroducing a JavaScript-readable bearer token.
 */
function jsonResponseBodies(source) {
  const bodies = [];
  const marker = /res(?:\.status\([^)]*\))?\.json\(/g;
  let match;
  while ((match = marker.exec(source))) {
    const start = match.index + match[0].length;
    let depth = 1;
    let index = start;
    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      index += 1;
    }
    bodies.push(source.slice(start, index - 1));
  }
  return bodies;
}

test('no API response body carries an application session token', () => {
  const files = [
    'server.ts',
    ...fs.readdirSync(path.join(process.cwd(), 'src/server'))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => path.join('src/server', name)),
  ];
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    for (const body of jsonResponseBodies(source)) {
      // Only a response property leaks a credential; a bare identifier here
      // is the argument handed to the cookie writer.
      if (/(?:^|[{,;\s])sessionToken\s*(?:[,:]|\}|$)/.test(body)) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], 'a session token must reach the browser only as an HttpOnly cookie');
});

test('the browser discovers its session through /api/auth/me, not through a token body', () => {
  const client = fs.readFileSync(path.join(process.cwd(), 'src/lib/supabaseClient.ts'), 'utf8');
  const bootstrap = client.slice(client.indexOf('export async function fetchCurrentAuthSession'));
  assert.match(bootstrap, /\/api\/auth\/me/);
  assert.doesNotMatch(bootstrap, /sessionToken/);
});

test('the Super Admin console requests its scope through the cookie and CSRF proof only', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperAdminControlHub.tsx'), 'utf8');
  assert.match(source, /sessionAuthHeaders\(\)/);
  assert.match(source, /setSessionCsrfToken\(/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /data\.sessionToken/);
});
