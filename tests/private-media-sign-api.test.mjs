import assert from 'node:assert/strict';
import test from 'node:test';
import { registerPrivateMediaSignApi } from '../src/server/privateMediaSignApi.ts';

function createHarness(actor, fetchImpl) {
  let handler;
  registerPrivateMediaSignApi(
    { post: (path, fn) => { assert.equal(path, '/api/media/private-sign'); handler = fn; } },
    {
      projectUrl: 'https://obkfgxjzlscungkhbyvq.supabase.co',
      serverSecretKey: 'sb_secret_local_test_key',
      verifySession: () => actor,
      fetchImpl,
    },
  );
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return {
    response,
    invoke: (body) => handler({ body }, response),
  };
}

test('private-media signing requires a verified session and owner prefix', async () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const unauth = createHarness(null, async () => {
    throw new Error('should not fetch');
  });
  await unauth.invoke({ reference: `storage://bos-private-profile-media/${ownerId}/avatar.webp` });
  assert.equal(unauth.response.statusCode, 401);
  assert.equal(unauth.response.headers['Cache-Control'], 'no-store');

  const stranger = createHarness({ userId: '22222222-2222-4222-8222-222222222222', role: 'customer' }, async () => {
    throw new Error('should not fetch');
  });
  await stranger.invoke({ reference: `storage://bos-private-profile-media/${ownerId}/avatar.webp` });
  assert.equal(stranger.response.statusCode, 403);

  const publicBucket = createHarness({ userId: ownerId, role: 'customer' }, async () => {
    throw new Error('should not fetch');
  });
  await publicBucket.invoke({ reference: `storage://bos-public-media/${ownerId}/cover.webp` });
  assert.equal(publicBucket.response.statusCode, 400);
});

test('private-media signing issues a short-lived signed URL for the verified owner', async () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  const owner = createHarness({ userId: 'local-user', supabaseUserId: ownerId, role: 'customer' }, async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ signedURL: `/object/sign/bos-private-profile-media/${ownerId}/avatar.webp?token=test-sig` });
  });
  await owner.invoke({ reference: `storage://bos-private-profile-media/${ownerId}/avatar.webp` });
  assert.equal(owner.response.statusCode, 200);
  assert.equal(owner.response.headers['Cache-Control'], 'no-store');
  assert.equal(
    owner.response.body.signedUrl,
    `https://obkfgxjzlscungkhbyvq.supabase.co/storage/v1/object/sign/bos-private-profile-media/${ownerId}/avatar.webp?token=test-sig`,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.apikey, 'sb_secret_local_test_key');
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

