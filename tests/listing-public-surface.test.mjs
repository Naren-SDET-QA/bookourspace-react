import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('customer marketplace hydrates only approved PostgreSQL listings', async () => {
  const context = await read('../src/context/MarketplaceContext.tsx');
  assert.match(context, /fetch\('\/api\/marketplace\/listings'/);
  assert.match(context, /data\.source !== 'postgresql'/);
  assert.match(context, /mapPostgresPublicListing/);
  const stayDiscovery = await read('../src/lib/stayDiscoveryData.ts');
  assert.match(stayDiscovery, /payload\?\.source === 'postgresql'/);
  assert.equal(stayDiscovery.includes("payload?.source === 'authoritative-store'"), false);
  const client = await read('../src/lib/supabaseClient.ts');
  assert.match(client, /data\?\.source !== 'postgresql'/);

  const mappingStart = context.indexOf('function mapPostgresPublicListing');
  const effectStart = context.indexOf('// One PostgreSQL source');
  assert.ok(mappingStart > 0 && effectStart > mappingStart);
  const mapping = context.slice(mappingStart, effectStart);
  assert.ok(!/providerPhone|ownerUserId|providerEmail/.test(mapping),
    'the public feed mapping must not copy private contact fields');
  assert.match(mapping, /providerId: ''/, 'the UI model must not fabricate a provider identity');
});

test('#listing-<id> deep link opens the correct customer detail modal', async () => {
  const app = await read('../src/App.tsx');
  assert.match(app, /#listing-<id>/);
  assert.match(app, /\^listing\[-\/\]/i);
  assert.match(app, /setSelectedDetailListing\(target\)/);
  assert.match(app, /resolveSectionForCategory\(target\.categoryId\)/);
});

test('listing create validation persists public Storage refs and original HTTPS photos', async () => {
  const { validateListingPatch } = await import('../src/server/liveEditValidation.ts');
  const stored = validateListingPatch({
    actorRole: 'provider',
    existing: {},
    updates: {
      title: 'Storage photo PG',
      categoryId: 'pg_hostels',
      subcategory: 'Single Sharing',
      entityType: 'property',
      price: 5000,
      priceUnit: 'per month',
      payload: {
        images: [
          'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
          'storage://bos-public-media/887f5e06-e06d-4bee-a5a2-081f6cbd32ec/pg_hostels/provider_listing/asset/original.jpg',
        ],
      },
    },
  });
  assert.equal(stored.payload.images.length, 2);
  try {
    validateListingPatch({
      actorRole: 'provider',
      existing: {},
      updates: { payload: { images: ['storage://bos-private-documents/owner/id.pdf'] } },
    });
    assert.fail('private document refs must be rejected');
  } catch (error) {
    assert.equal(error.code, 'INVALID_LISTING_IMAGES');
  }
});

test('public details are served from the canonical repository and are active-only', async () => {
  const api = await read('../src/server/platformApi.ts');
  assert.match(api, /app\.get\('\/api\/marketplace\/listings\/:id'/);
  assert.match(api, /findPublicById/);
  assert.match(api, /LISTING_NOT_FOUND/);
  assert.match(api, /verificationdocuments/,
    'public listing sanitization must remove private verification document metadata');
  assert.match(api, /PRIVATE_STORAGE_REFERENCE/,
    'public listing sanitization must remove private Storage image references');

  const repository = await read('../src/server/providerListingRepository.ts');
  assert.match(repository, /l\.status = 'active'/);
  assert.match(repository, /setStatusForAdmin/);
});
