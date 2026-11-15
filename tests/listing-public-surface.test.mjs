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

test('public details are served from the canonical repository and are active-only', async () => {
  const api = await read('../src/server/platformApi.ts');
  assert.match(api, /app\.get\('\/api\/marketplace\/listings\/:id'/);
  assert.match(api, /findPublicById/);
  assert.match(api, /LISTING_NOT_FOUND/);

  const repository = await read('../src/server/providerListingRepository.ts');
  assert.match(repository, /l\.status = 'active'/);
  assert.match(repository, /setStatusForAdmin/);
});
