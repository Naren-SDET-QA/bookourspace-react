import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderListingRepository } from '../src/server/providerListingRepository.ts';

test('listing repository refuses embedded image data before contacting PostgreSQL', async () => {
  const repository = new ProviderListingRepository('postgres://postgres@127.0.0.1:55432/bos_test', { NODE_ENV: 'test' });
  const actor = { role: 'provider', supabaseUserId: '00000000-0000-4000-8000-000000000001' };
  try {
    await assert.rejects(
      repository.create(actor, { payload: { images: ['data:image/png;base64,Zm9v'] } }),
      (error) => error?.code === 'MEDIA_OBJECT_REFERENCE_REQUIRED' && error?.httpStatus === 400,
    );
    await assert.rejects(
      repository.update(actor, 'listing-id', { payload: { coverImage: 'data:image/jpeg;base64,Zm9v' } }),
      (error) => error?.code === 'MEDIA_OBJECT_REFERENCE_REQUIRED' && error?.httpStatus === 400,
    );
  } finally {
    await repository.close();
  }
});
