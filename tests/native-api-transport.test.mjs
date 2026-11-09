import test from 'node:test';
import assert from 'node:assert/strict';
import { readNativeSessionToken, routeNativeApiRequest } from '../src/mobile/nativeApiTransport.ts';
import { createNativeAppCorsMiddleware, parseNativeAppOrigins } from '../src/server/nativeAppCors.ts';

const currentOrigin = 'capacitor://localhost';

test('native API paths use the configured origin and current authoritative bearer token', () => {
  const [url, init] = routeNativeApiRequest('/api/bookings/atomic?mode=test', { method: 'POST' }, {
    native: true,
    backendOrigin: 'https://api.bookourspace.example',
    isDev: false,
    currentOrigin,
    sessionToken: 'server-issued-token',
  });
  assert.equal(url, 'https://api.bookourspace.example/api/bookings/atomic?mode=test');
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-issued-token');
  assert.equal(init?.method, 'POST');
});

test('explicit Supabase or server auth headers are preserved', () => {
  const [, init] = routeNativeApiRequest('/api/admin/users', { headers: { Authorization: 'Bearer verified-token' } }, {
    native: true,
    backendOrigin: 'https://api.bookourspace.example',
    isDev: false,
    currentOrigin,
    sessionToken: 'stored-token',
  });
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer verified-token');
});

test('native transport reads only the canonical authoritative session key', () => {
  const reads = [];
  const storage = { getItem(key) { reads.push(key); return key === 'bos_session_token_v1' ? 'current-token' : 'stale-token'; } };
  assert.equal(readNativeSessionToken(storage), 'current-token');
  assert.deepEqual(reads, ['bos_session_token_v1']);
});

test('web relative routes remain unchanged', () => {
  const input = '/api/marketplace/listings';
  const init = { headers: { Accept: 'application/json' } };
  const routed = routeNativeApiRequest(input, init, {
    native: false,
    backendOrigin: undefined,
    isDev: false,
    currentOrigin: 'https://bookourspace.example',
  });
  assert.equal(routed[0], input);
  assert.equal(routed[1], init);
});

test('native API fails closed without an origin and rejects insecure remote origins', () => {
  assert.throws(() => routeNativeApiRequest('/api/users', undefined, {
    native: true, isDev: false, currentOrigin,
  }), /VITE_NATIVE_API_ORIGIN/);
  assert.throws(() => routeNativeApiRequest('/api/users', undefined, {
    native: true, backendOrigin: 'http://api.bookourspace.example', isDev: true, currentOrigin,
  }), /HTTPS/);
  for (const origin of ['http://127.0.0.1:5199', 'http://10.0.2.2:5199']) {
    const [url] = routeNativeApiRequest('/api/users', undefined, {
      native: true, backendOrigin: origin, isDev: false, currentOrigin,
    });
    assert.equal(String(url), `${origin}/api/users`);
  }
  assert.throws(() => routeNativeApiRequest('/api/users', undefined, {
    native: true, backendOrigin: 'https://obkfgxjzlscungkhbyvq.supabase.co', isDev: false, currentOrigin,
  }), /not Supabase/);
});

test('non-API and cross-origin requests are not rerouted', () => {
  const init = { headers: { Authorization: 'Bearer token' } };
  for (const input of ['https://identity.example/oauth', 'https://unrelated.example/api/data', '/assets/app.js']) {
    const routed = routeNativeApiRequest(input, init, {
      native: true,
      backendOrigin: 'https://api.bookourspace.example',
      isDev: false,
      currentOrigin,
      sessionToken: 'stored-token',
    });
    assert.equal(routed[0], input);
    assert.equal(routed[1], init);
  }
});

test('native API CORS defaults to exact Capacitor origins and ignores wildcard entries', () => {
  assert.deepEqual([...parseNativeAppOrigins(undefined)], ['capacitor://localhost', 'https://localhost']);
  assert.deepEqual([...parseNativeAppOrigins('*')], []);
});

test('native API CORS answers preflight only for an explicitly allowed app origin', () => {
  const middleware = createNativeAppCorsMiddleware();
  const headers = {};
  const calls = { next: 0, status: null, ended: false };
  const req = { path: '/api/bookings/atomic', method: 'OPTIONS', get: (name) => name === 'origin' ? 'capacitor://localhost' : undefined };
  const res = {
    vary: () => {},
    setHeader: (name, value) => { headers[name] = value; },
    status(code) { calls.status = code; return this; },
    end() { calls.ended = true; return this; },
  };
  middleware(req, res, () => { calls.next += 1; });
  assert.equal(calls.status, 204);
  assert.equal(headers['Access-Control-Allow-Origin'], 'capacitor://localhost');
  assert.equal(headers['Access-Control-Allow-Credentials'], 'true');
  assert.equal(calls.ended, true);
});
