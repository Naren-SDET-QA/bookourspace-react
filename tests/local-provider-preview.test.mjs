import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isLocalAdminPreviewEnabled,
  isLocalProviderPreviewEnabled,
  isLoopbackPreviewRequest,
} from '../src/server/localProviderPreviewApi.ts';

const LOOPBACK_DB = 'postgres://postgres@127.0.0.1:55441/bookourspace_dev?sslmode=disable';
const REMOTE_DB = 'postgres://postgres@db.example.com:5432/bookourspace?sslmode=require';

const productionEnv = (overrides = {}) => ({
  NODE_ENV: 'production',
  BOS_POSTGRES_LOCAL_TEST_MODE: 'true',
  BOS_LOCAL_PROVIDER_PREVIEW: '1',
  ...overrides,
});

test('preview session stays disabled unless both local flags are set', () => {
  assert.equal(isLocalProviderPreviewEnabled({}, LOOPBACK_DB), false);
  assert.equal(isLocalProviderPreviewEnabled(productionEnv({ BOS_LOCAL_PROVIDER_PREVIEW: '' }), LOOPBACK_DB), false);
  assert.equal(isLocalProviderPreviewEnabled(productionEnv({ BOS_POSTGRES_LOCAL_TEST_MODE: '' }), LOOPBACK_DB), false);
  assert.equal(isLocalProviderPreviewEnabled(productionEnv({ BOS_LOCAL_PROVIDER_PREVIEW: 'yes' }), LOOPBACK_DB), false);
  // The loopback database flag has to be the literal value persistencePolicy checks.
  assert.equal(isLocalProviderPreviewEnabled(productionEnv({ BOS_POSTGRES_LOCAL_TEST_MODE: '1' }), LOOPBACK_DB), false);
});

test('preview session refuses a remote database even with both flags', () => {
  assert.equal(isLocalProviderPreviewEnabled(productionEnv(), REMOTE_DB), false);
  assert.equal(isLocalProviderPreviewEnabled(productionEnv(), ''), false);
});

test('preview session is enabled for a loopback database under explicit local flags', () => {
  assert.equal(isLocalProviderPreviewEnabled(productionEnv(), LOOPBACK_DB), true);
});

test('preview session only answers requests from loopback with a loopback host', () => {
  assert.equal(isLoopbackPreviewRequest('127.0.0.1', '127.0.0.1:4174'), true);
  assert.equal(isLoopbackPreviewRequest('::ffff:127.0.0.1', 'localhost:4174'), true);
  assert.equal(isLoopbackPreviewRequest('::1', '[::1]:4174'), true);

  // A tunnel or LAN caller must not reach the route even with localhost in Host.
  assert.equal(isLoopbackPreviewRequest('10.0.0.5', '127.0.0.1:4174'), false);
  // A public hostname must not proxy through to the local preview.
  assert.equal(isLoopbackPreviewRequest('127.0.0.1', 'app.bookourspace.example'), false);
  assert.equal(isLoopbackPreviewRequest(null, '127.0.0.1'), false);
});

test('the admin preview needs its own flag and the same local database gate', () => {
  assert.equal(isLocalAdminPreviewEnabled(productionEnv(), LOOPBACK_DB), false);
  const adminEnv = { ...productionEnv(), BOS_LOCAL_ADMIN_PREVIEW: '1' };
  assert.equal(isLocalAdminPreviewEnabled(adminEnv, LOOPBACK_DB), true);
  // A remote database stays refused, and the provider flag never implies admin.
  assert.equal(isLocalAdminPreviewEnabled(adminEnv, REMOTE_DB), false);
  assert.equal(isLocalAdminPreviewEnabled(productionEnv(), LOOPBACK_DB), false);
  assert.equal(
    isLocalAdminPreviewEnabled(productionEnv({ BOS_LOCAL_ADMIN_PREVIEW: '1', BOS_POSTGRES_LOCAL_TEST_MODE: '' }), LOOPBACK_DB),
    false,
  );
});

test('each route is role-locked, 404s when disabled, and is registered on the server', () => {
  const api = fs.readFileSync(
    path.join(process.cwd(), 'src/server/localProviderPreviewApi.ts'),
    'utf8',
  );
  const server = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

  assert.match(api, /const ROUTE = '\/api\/local-provider-preview\/session'/);
  assert.match(api, /const ADMIN_ROUTE = '\/api\/local-admin-preview\/session'/);
  assert.match(api, /error: 'NOT_FOUND'/);
  // The shared handler signs only a profile whose role matches the route.
  assert.match(api, /profile\.role !== config\.expectedRole/);
  assert.match(api, /route: ROUTE,[\s\S]{0,120}expectedRole: 'provider'/);
  assert.match(api, /route: ADMIN_ROUTE,[\s\S]{0,120}expectedRole: 'admin'/);
  assert.match(api, /res\.status\(403\)\.json\(\{ ok: false, error: 'LOOPBACK_ONLY' \}\)/);
  // Never creates or promotes an account.
  assert.doesNotMatch(api, /insert into public\.profiles/i);
  assert.doesNotMatch(api, /update public\.profiles/i);
  assert.match(server, /registerLocalProviderPreviewApi\(app, \{/);
});
