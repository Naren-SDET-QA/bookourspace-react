import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/PostListingWizard.tsx', import.meta.url), 'utf8');

test('provider listing creation precedes media upload and reference persistence', () => {
  const createIndex = source.indexOf('const createdResponse = await saveServerProviderListing(null');
  const uploadIndex = source.indexOf("const uploadForListing = createMediaUploadHandler(selectedSection, 'provider_listing', listingId);");
  const attachIndex = source.indexOf('const mediaResponse = await saveServerProviderListing(listingId');

  assert.ok(createIndex >= 0, 'the durable listing create call must exist');
  assert.ok(uploadIndex > createIndex, 'media upload must be parented by an existing listing');
  assert.ok(attachIndex > uploadIndex, 'uploaded media references must be attached after upload');
  assert.match(source, /const listingPayload = \{[\s\S]*?images: \[\]/);
});
