import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createResponsiveMediaResolver,
  createSignedStorageUrlResolver,
  isPersistableListingImageSource,
  isRenderableListingImageSource,
  listingImageSources,
  MEDIA_URL_TTL_SECONDS,
  parseStorageObjectReference,
  storageReferenceForSource,
} from '../src/lib/media/signedStorageUrl.ts';

test('listing image sources keep original HTTPS photos and ready public Storage refs', () => {
  assert.equal(isRenderableListingImageSource('https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1000&q=80'), true);
  assert.equal(isRenderableListingImageSource('storage://bos-public-media/owner/listing/photo.webp'), true);
  assert.equal(isRenderableListingImageSource('/assets/fallbacks/pg.svg'), true);
  assert.equal(isRenderableListingImageSource('storage://bos-private-documents/owner/id.pdf'), false);
  assert.equal(isRenderableListingImageSource('data:image/png;base64,Zm9v'), false);
  assert.equal(isRenderableListingImageSource('http://example.test/photo.jpg'), false);
  assert.equal(isRenderableListingImageSource(' /assets/fallbacks/pg.svg'), false);
});

test('listingImageSources unwraps payload arrays, cover fields, and {url} objects', () => {
  assert.deepEqual(
    listingImageSources({
      images: [
        'storage://bos-public-media/owner/listing/photo.webp',
        { url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80' },
        'http://insecure.test/skip.jpg',
        '  https://media.example.test/padded.jpg',
      ],
      imageUrl: 'https://media.example.test/cover.jpg',
    }),
    [
      'storage://bos-public-media/owner/listing/photo.webp',
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
      'https://media.example.test/padded.jpg',
      'https://media.example.test/cover.jpg',
    ],
  );
  assert.deepEqual(
    listingImageSources({ images: [] }, { imageUrl: 'https://media.example.test/only-cover.jpg' }),
    ['https://media.example.test/only-cover.jpg'],
  );
});

test('listing persistence keeps HTTPS originals and public Storage refs, not signed URLs', () => {
  assert.equal(isPersistableListingImageSource('https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1000&q=80'), true);
  assert.equal(isPersistableListingImageSource('storage://bos-public-media/owner/listing/photo.webp'), true);
  assert.equal(isPersistableListingImageSource('/assets/fallbacks/pg.svg'), true);
  assert.equal(isPersistableListingImageSource('http://example.test/photo.jpg'), false);
  assert.equal(isPersistableListingImageSource('storage://bos-private-documents/owner/id.pdf'), false);
  assert.equal(isPersistableListingImageSource('https://obkfgxjzlscungkhbyvq.supabase.co/storage/v1/object/sign/bos-public-media/owner/photo.jpg?token=x'), false);
});

test('storage references accept only approved buckets and safe canonical object paths', () => {
  assert.deepEqual(parseStorageObjectReference('storage://bos-public-media/owner/listing/photo.webp'), {
    bucket: 'bos-public-media', path: 'owner/listing/photo.webp',
  });
  assert.deepEqual(parseStorageObjectReference('storage://bos-private-documents/user/certificates/file.pdf'), {
    bucket: 'bos-private-documents', path: 'user/certificates/file.pdf',
  });
  for (const value of [
    'https://example.test/image.png',
    'storage://other-bucket/user/file.png',
    'storage://bos-public-media/../secret.png',
    'storage://bos-public-media/%2e%2e/secret.png',
    'storage://bos-public-media/user/%2fetc/passwd',
    'storage://bos-public-media/user/photo%3Ftoken.jpg',
    'storage://bos-public-media/user/photo%23hash.jpg',
    'storage://bos-public-media/user/file.png?token=unsafe',
    'storage://bos-public-media/user\\file.png',
  ]) assert.equal(parseStorageObjectReference(value), null, value);
});

test('Supabase object URLs normalize to canonical refs, including relative paths', () => {
  const projectUrl = 'https://obkfgxjzlscungkhbyvq.supabase.co';
  assert.equal(
    storageReferenceForSource('/storage/v1/object/bos-public-media/owner/listing/original.jpg?download=1', projectUrl),
    'storage://bos-public-media/owner/listing/original.jpg',
  );
  assert.equal(
    storageReferenceForSource(`${projectUrl}/storage/v1/object/public/bos-public-media/owner/listing/original.jpg`, projectUrl),
    'storage://bos-public-media/owner/listing/original.jpg',
  );
  assert.equal(
    storageReferenceForSource('/storage/v1/object/bos-private-documents/owner/id.pdf', projectUrl),
    'storage://bos-private-documents/owner/id.pdf',
  );
  assert.equal(
    storageReferenceForSource('https://other.supabase.co/storage/v1/object/public/bos-public-media/owner/listing/original.jpg', projectUrl),
    null,
  );
  assert.equal(
    storageReferenceForSource('/storage/v1/object/public/bos-public-media/owner/listing/photo%2Fvariant.jpg', projectUrl),
    null,
  );
  assert.equal(
    storageReferenceForSource('storage://BOS-PUBLIC-MEDIA/owner/listing/original.jpg'),
    'storage://bos-public-media/owner/listing/original.jpg',
  );
});

test('signed URLs are in-memory cached, deduplicated, and can be explicitly refreshed', async () => {
  let now = 1_000_000;
  let calls = 0;
  const storage = {
    from(bucket) {
      return {
        async createSignedUrl(path, ttl) {
          calls += 1;
          assert.equal(bucket, 'bos-public-media');
          assert.equal(path, 'owner/listing/photo.webp');
          assert.equal(ttl, MEDIA_URL_TTL_SECONDS);
          await Promise.resolve();
          return { data: { signedUrl: `https://signed.test/${calls}` }, error: null };
        },
      };
    },
  };
  const resolve = createSignedStorageUrlResolver(storage, () => now);
  const ref = 'storage://bos-public-media/owner/listing/photo.webp';
  const [first, concurrent] = await Promise.all([resolve(ref), resolve(ref)]);
  assert.equal(first, concurrent);
  assert.equal(calls, 1);
  assert.equal(await resolve(ref), first);
  assert.equal(calls, 1);
  assert.equal(await resolve(ref, true), 'https://signed.test/2');
  assert.equal(calls, 2);
  now += MEDIA_URL_TTL_SECONDS * 1000;
  assert.equal(await resolve(ref), 'https://signed.test/3');
});

test('signed URL errors fail closed without returning an object URL', async () => {
  const resolve = createSignedStorageUrlResolver({
    from: () => ({ createSignedUrl: async () => ({ data: null, error: new Error('denied') }) }),
  });
  await assert.rejects(resolve('storage://bos-private-documents/user/doc.pdf'), /MEDIA_SIGNED_URL_UNAVAILABLE/);
});

test('responsive resolver signs only stored variants and caches the derived srcset', async () => {
  let now = 1_000_000;
  const signedPaths = [];
  let lookups = 0;
  const storage = {
    from(bucket) {
      return {
        async createSignedUrl(path, ttl) {
          assert.equal(ttl, MEDIA_URL_TTL_SECONDS);
          signedPaths.push(`${bucket}/${path}`);
          return { data: { signedUrl: `https://signed.test/${bucket}/${path}` }, error: null };
        },
      };
    },
  };
  const lookup = async (bucket, objectPath) => {
    lookups += 1;
    assert.equal(bucket, 'bos-public-media');
    assert.equal(objectPath, 'owner/listing/photo.jpg');
    return [
      { object_path: 'owner/listing/w400.webp', width: 400 },
      { object_path: 'owner/listing/w160.webp', width: 160 },
      { object_path: '../outside.webp', width: 99 },
    ];
  };
  const resolve = createResponsiveMediaResolver(storage, lookup, () => now);
  const reference = 'storage://bos-public-media/owner/listing/photo.jpg';
  const first = await resolve(reference);
  assert.equal(first.src, 'https://signed.test/bos-public-media/owner/listing/photo.jpg');
  assert.equal(first.srcSet, 'https://signed.test/bos-public-media/owner/listing/w160.webp 160w, https://signed.test/bos-public-media/owner/listing/w400.webp 400w');
  assert.deepEqual(signedPaths, [
    'bos-public-media/owner/listing/photo.jpg',
    'bos-public-media/owner/listing/w160.webp',
    'bos-public-media/owner/listing/w400.webp',
  ]);
  assert.equal(lookups, 1);

  await resolve(reference);
  assert.equal(lookups, 1);
  assert.equal(signedPaths.length, 3);

  const refreshed = await resolve(reference, true);
  assert.equal(refreshed.srcSet, first.srcSet);
  assert.equal(lookups, 2);
  assert.equal(signedPaths.length, 6);

  const privateResult = await resolve('storage://bos-private-documents/user/certificate.pdf');
  assert.deepEqual(privateResult, { src: 'https://signed.test/bos-private-documents/user/certificate.pdf' });
  assert.equal(lookups, 2);

  now += 5 * 60 * 1000;
  await resolve(reference);
  assert.equal(lookups, 3);
});
