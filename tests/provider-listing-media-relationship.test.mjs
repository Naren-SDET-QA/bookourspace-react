import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeReadyPublicListingMedia } from '../src/server/providerListingRepository.ts';

test('public listing projections merge ready public media without exposing private buckets', () => {
  const payload = mergeReadyPublicListingMedia(
    {
      images: [
        'https://images.example.test/existing.jpg',
        'storage://bos-public-media/owner/listing/original.jpg',
      ],
      verificationDocuments: ['storage://bos-private-documents/owner/id.pdf'],
    },
    [
      'storage://bos-public-media/owner/listing/original.jpg',
      'storage://bos-public-media/owner/listing/w320.webp',
      'storage://bos-private-documents/owner/id.pdf',
      'storage://bos-public-media/owner/../private.jpg',
    ],
  );

  assert.deepEqual(payload.images, [
    'https://images.example.test/existing.jpg',
    'storage://bos-public-media/owner/listing/original.jpg',
    'storage://bos-public-media/owner/listing/w320.webp',
  ]);
  assert.deepEqual(payload.verificationDocuments, ['storage://bos-private-documents/owner/id.pdf']);
});

test('missing media relations leave a listing payload unchanged', () => {
  const payload = { title: 'No photo listing', images: [] };
  assert.deepEqual(mergeReadyPublicListingMedia(payload, []), { images: [] });
});
