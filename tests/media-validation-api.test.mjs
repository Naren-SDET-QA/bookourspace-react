import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';
import { registerMediaValidationApi } from '../src/server/mediaValidationApi.ts';

const ownerId = '44444444-4444-4444-8444-444444444444';
const assetId = '55555555-5555-4555-8555-555555555551';
const accessToken = 'verified-google-access-token-for-local-test';
const serviceKey = 'server-only-test-secret';

function routeHarness(config, fetchImpl) {
  let route;
  registerMediaValidationApi({ post: (path, handler) => { assert.equal(path, '/api/media/finalize'); route = handler; } }, { ...config, fetchImpl });
  const response = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  return {
    response,
    invoke: () => route({ headers: { authorization: `Bearer ${accessToken}` }, body: { id: assetId } }, response),
  };
}

async function fixtures() {
  const original = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#366' } }).jpeg({ quality: 92 }).toBuffer();
  const derivative = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#366' } }).webp({ quality: 80 }).toBuffer();
  return { original, derivative };
}

function mockFetch({ original, derivative, corruptOriginal = false, calls }) {
  const originalPath = `${ownerId}/services/provider_listing/${assetId}/original.jpg`;
  const derivativePath = `${ownerId}/services/provider_listing/${assetId}/w400.webp`;
  const originalHash = createHash('sha256').update(original).digest('hex');
  return async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname.endsWith('/auth/v1/user')) {
      return Response.json({ id: ownerId, email: 'provider@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'google' }, identities: [{ provider: 'google', identity_data: { sub: 'google-user' } }] });
    }
    if (url.pathname.endsWith('/rest/v1/media_assets')) {
      return Response.json([{
        id: assetId, owner_id: ownerId, bucket_id: 'bos-public-media', object_path: originalPath,
        media_kind: 'image', media_format: 'jpeg', file_size_bytes: original.length,
        width: 800, height: 600, checksum_sha256: originalHash,
        variants: [{ object_path: derivativePath, width: 400, height: 300, mime_type: 'image/webp', file_size_bytes: derivative.length }],
        processing_status: 'quarantined',
      }]);
    }
    if (url.pathname.endsWith('/rest/v1/profiles')) return Response.json([{ id: ownerId, role: 'provider', account_status: 'active' }]);
    if (url.pathname.includes('/storage/v1/object/authenticated/')) {
      const path = decodeURIComponent(url.pathname.split('/bos-public-media/')[1] || '');
      if (path === originalPath) return new Response(corruptOriginal ? Buffer.from('not an image') : original, { status: 200 });
      if (path === derivativePath) return new Response(derivative, { status: 200 });
      return new Response('', { status: 404 });
    }
    if (url.pathname.endsWith('/rest/v1/rpc/finalize_media_asset_server')) return Response.json({ id: assetId, processing_status: 'ready' });
    throw new Error(`Unexpected local test request: ${url.pathname}`);
  };
}

test('trusted media endpoint checks owner, Google identity, full bytes and variants before finalizing', async () => {
  const { original, derivative } = await fixtures();
  const calls = [];
  const harness = routeHarness({
    projectUrl: 'https://obkfgxjzlscungkhbyvq.supabase.co',
    publishableKey: 'sb_publishable_local_fake_public_key',
    serverSecretKey: serviceKey,
  }, mockFetch({ original, derivative, calls }));
  await harness.invoke();
  assert.equal(harness.response.statusCode, 200);
  assert.deepEqual(harness.response.body, { ok: true, processingStatus: 'ready' });
  assert.equal(harness.response.headers['Cache-Control'], 'no-store');
  assert.ok(calls.some(({ url }) => url.pathname.endsWith('/rest/v1/rpc/finalize_media_asset_server')));
  assert.ok(calls.filter(({ init }) => String(new Headers(init.headers).get('Authorization') || '').includes(serviceKey)).length >= 3);
  assert.doesNotMatch(JSON.stringify(harness.response.body), /server-only-test-secret/);
});

test('invalid bytes remain quarantined and do not reach the service finalizer', async () => {
  const { original, derivative } = await fixtures();
  const calls = [];
  const harness = routeHarness({
    projectUrl: 'https://obkfgxjzlscungkhbyvq.supabase.co',
    publishableKey: 'sb_publishable_local_fake_public_key',
    serverSecretKey: serviceKey,
  }, mockFetch({ original, derivative, corruptOriginal: true, calls }));
  await harness.invoke();
  assert.equal(harness.response.statusCode, 422);
  assert.notEqual(harness.response.body.error, 'MEDIA_FINALIZATION_FAILED');
  assert.equal(calls.some(({ url }) => url.pathname.endsWith('/rest/v1/rpc/finalize_media_asset_server')), false);
});

test('opaque Supabase secret keys use apikey only, never Authorization Bearer', async () => {
  const { original, derivative } = await fixtures();
  const calls = [];
  const secretKey = 'sb_secret_local_test_key';
  const harness = routeHarness({
    projectUrl: 'https://obkfgxjzlscungkhbyvq.supabase.co',
    publishableKey: 'sb_publishable_local_fake_public_key',
    serverSecretKey: secretKey,
  }, mockFetch({ original, derivative, calls }));
  await harness.invoke();
  assert.equal(harness.response.statusCode, 200);
  const secretCalls = calls.filter(({ init }) => new Headers(init.headers).get('apikey') === secretKey);
  assert.ok(secretCalls.length >= 3);
  assert.ok(secretCalls.every(({ init }) => new Headers(init.headers).get('Authorization') !== `Bearer ${secretKey}`));
  assert.doesNotMatch(JSON.stringify(harness.response.body), /sb_secret_local_test_key/);
});

test('the endpoint fails closed when no server-only key is configured', async () => {
  let requested = false;
  const harness = routeHarness({ projectUrl: '', publishableKey: '', serverSecretKey: '' }, async () => { requested = true; });
  await harness.invoke();
  assert.equal(harness.response.statusCode, 503);
  assert.equal(requested, false);
});
