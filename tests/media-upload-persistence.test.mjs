import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createMediaUploadHandler } from '../src/lib/media/uploadMediaAsset.ts';

function file(name, type, content) {
  return new File([content], name, { type });
}

function fakeClient({ userId = '11111111-1111-4111-8111-111111111111', duplicate = null, uploadErrorAt = -1, finalizeError = false } = {}) {
  const uploads = [];
  const inserts = [];
  const finalizations = [];
  let uploadCount = 0;
  const client = {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
      getSession: async () => ({ data: { session: { access_token: 'verified-test-token' } }, error: null }),
    },
    storage: {
      from(bucket) {
        return { upload: async (path, value, options) => {
          uploads.push({ bucket, path, value, options });
          const index = uploadCount++;
          return { error: index === uploadErrorAt ? new Error('denied') : null };
        } };
      },
    },
    from(table) {
      assert.equal(table, 'media_assets');
      const query = {
        filters: {},
        select() { return this; },
        eq(key, value) { this.filters[key] = value; return this; },
        is(key, value) { this.filters[key] = value; return this; },
        maybeSingle: async () => ({ data: duplicate, error: null }),
        insert(row) { inserts.push(row); this.row = row; return this; },
        single: async function () { return { data: { id: this.row.id }, error: null }; },
      };
      return query;
    },
  };
  return {
    client, uploads, inserts, finalizations,
    finalize: async (_client, id) => {
      finalizations.push(id);
      if (finalizeError) throw new Error('MEDIA_FINALIZATION_FAILED');
    },
  };
}

const details = (original, variant) => ({
  inspected: { kind: 'image', format: 'jpeg', mimeType: 'image/jpeg' },
  processedImage: { original, width: 800, height: 600, variants: [{ file: variant, width: 400, height: 300, mimeType: 'image/webp' }] },
  altText: 'Room exterior', caption: '', displayOrder: 0, onProgress() {},
});

test('media uploads persist owner-scoped objects and quarantined metadata with derivative references', async () => {
  const original = file('room.jpg', 'image/jpeg', 'original-image-bytes');
  const derivative = file('room-400.webp', 'image/webp', 'smaller-image-bytes');
  const { client, uploads, inserts, finalizations, finalize } = fakeClient();
  const upload = createMediaUploadHandler('pg_hostels', 'provider_listing', 'lst-test-1', client, finalize);
  const result = await upload(original, details(original, derivative));

  assert.equal(uploads.length, 2);
  assert.ok(uploads.every((entry) => entry.bucket === 'bos-public-media' && entry.options.upsert === false));
  assert.ok(uploads.every((entry) => entry.path.startsWith('11111111-1111-4111-8111-111111111111/pg_hostels/provider_listing/')));
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].owner_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(inserts[0].parent_id, 'lst-test-1');
  assert.equal(inserts[0].processing_status, 'quarantined');
  assert.equal(inserts[0].checksum_sha256.length, 64);
  assert.equal(inserts[0].variants.length, 1);
  assert.match(result.objectPath, /^storage:\/\/bos-public-media\//);
  assert.equal(result.variantPaths.length, 1);
  assert.deepEqual(finalizations, [result.id]);
});

test('matching owner/context/checksum reuses an existing ready object without another upload', async () => {
  const original = file('room.jpg', 'image/jpeg', 'original-image-bytes');
  const checksum = createHash('sha256').update('original-image-bytes').digest('hex');
  const { client, uploads, inserts, finalizations, finalize } = fakeClient({ duplicate: {
    id: 'asset-existing', object_path: 'user/pg_hostels/provider_listing/ready.jpg',
    media_kind: 'image', file_size_bytes: original.size, width: 800, height: 600,
    checksum_sha256: checksum, variants: [], privacy: 'public', processing_status: 'ready',
  } });
  // The mock database match stands in for the owner-scoped SQL result; no hosted request is made.
  const upload = createMediaUploadHandler('pg_hostels', 'provider_listing', 'lst-test-1', client, finalize);
  const result = await upload(original, { ...details(original, file('room-400.webp', 'image/webp', 'v')), processedImage: null });
  assert.equal(uploads.length, 0);
  assert.equal(inserts.length, 0);
  assert.equal(finalizations.length, 0);
  assert.equal(result.id, 'asset-existing');
});

test('a quarantined duplicate is finalized instead of reused as ready', async () => {
  const original = file('room.jpg', 'image/jpeg', 'original-image-bytes');
  const checksum = createHash('sha256').update('original-image-bytes').digest('hex');
  const { client, uploads, inserts, finalizations, finalize } = fakeClient({ duplicate: {
    id: 'asset-quarantined', object_path: 'user/pg_hostels/provider_listing/pending.jpg',
    media_kind: 'image', file_size_bytes: original.size, width: 800, height: 600,
    checksum_sha256: checksum, variants: [], privacy: 'public', processing_status: 'quarantined',
  } });
  const upload = createMediaUploadHandler('pg_hostels', 'provider_listing', 'lst-test-4', client, finalize);
  const result = await upload(original, { ...details(original, file('room-400.webp', 'image/webp', 'v')), processedImage: null });
  assert.equal(uploads.length, 0);
  assert.equal(inserts.length, 0);
  assert.deepEqual(finalizations, ['asset-quarantined']);
  assert.equal(result.id, 'asset-quarantined');
});

test('unauthenticated, partial and finalization failures fail closed without publishing media', async () => {
  const original = file('room.jpg', 'image/jpeg', 'original-image-bytes');
  const signedOut = createMediaUploadHandler('pg_hostels', 'provider_listing', 'lst-test-2', fakeClient({ userId: null }).client);
  await assert.rejects(signedOut(original, details(original, file('room-400.webp', 'image/webp', 'v'))), /MEDIA_UPLOAD_REQUIRES_VERIFIED_SESSION/);

  const partial = fakeClient({ uploadErrorAt: 1 });
  const upload = createMediaUploadHandler('pg_hostels', 'provider_listing', 'lst-test-3', partial.client, partial.finalize);
  await assert.rejects(upload(original, details(original, file('room-400.webp', 'image/webp', 'v'))), /MEDIA_STORAGE_PARTIAL_UPLOAD_REQUIRES_AUDITED_CLEANUP/);
  assert.equal(partial.inserts.length, 0);
  assert.equal(partial.finalizations.length, 0);

  const finalizeFailure = fakeClient({ finalizeError: true });
  const failedFinalization = createMediaUploadHandler('pg_hostels', 'provider_listing', 'lst-test-5', finalizeFailure.client, finalizeFailure.finalize);
  await assert.rejects(failedFinalization(original, details(original, file('room-400.webp', 'image/webp', 'v'))), /MEDIA_FINALIZATION_FAILED/);
  assert.equal(finalizeFailure.inserts.length, 1);
  assert.equal(finalizeFailure.inserts[0].processing_status, 'quarantined');
  assert.equal(finalizeFailure.finalizations.length, 1);
});
