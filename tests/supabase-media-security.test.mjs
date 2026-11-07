import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSignedStorageUrlResolver,
  isPublicImageStorageSource,
  isSupabaseStorageSource,
  parseStorageObjectReference,
} from '../src/lib/media/signedStorageUrl.ts';

test('media references accept only approved buckets and normalized object paths', () => {
  assert.deepEqual(parseStorageObjectReference('storage://bos-public-media/listings/a/photo.webp'), {
    bucket: 'bos-public-media',
    path: 'listings/a/photo.webp',
  });
  assert.equal(parseStorageObjectReference('storage://unknown/listings/photo.webp'), null);
  assert.equal(parseStorageObjectReference('storage://bos-public-media/a%2Fb.webp'), null);
  assert.equal(isPublicImageStorageSource('storage://bos-public-media/listings/a/photo.webp'), true);
  assert.equal(isPublicImageStorageSource('storage://bos-private-documents/users/a/id.pdf'), false);
});

test('Supabase storage URLs are recognized so the image component can re-sign or reject them', () => {
  assert.equal(isSupabaseStorageSource('storage://bos-public-media/a.webp'), true);
  assert.equal(isSupabaseStorageSource('https://example.supabase.co/storage/v1/object/public/bos-public-media/a.webp'), true);
  assert.equal(isSupabaseStorageSource('https://cdn.example.test/a.webp'), false);
});

test('signed URL resolver deduplicates concurrent signing and caches only until expiry', async () => {
  let now = 1_000_000;
  let calls = 0;
  const resolver = createSignedStorageUrlResolver({
    from(bucket) {
      return {
        async createSignedUrl(path, ttlSeconds) {
          calls += 1;
          await Promise.resolve();
          return { data: { signedUrl: `https://storage.example/${bucket}/${path}?ttl=${ttlSeconds}&n=${calls}` }, error: null };
        },
      };
    },
  }, () => now);

  const reference = 'storage://bos-public-media/listings/a/photo.webp';
  const [first, second] = await Promise.all([resolver(reference), resolver(reference)]);
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(await resolver(reference), first);
  assert.equal(calls, 1);

  now += 30 * 60 * 1000;
  const refreshed = await resolver(reference);
  assert.notEqual(refreshed, first);
  assert.equal(calls, 2);
});
