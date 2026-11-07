import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8');
const functionBody = (name, nextName) => {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? source.indexOf(`export async function ${nextName}`, start + 1) : source.length;
  return source.slice(start, end === -1 ? source.length : end);
};

const updateListing = functionBody('updateRlsListing', 'deleteRlsListing');
const deactivateListing = functionBody('deleteRlsListing', 'fetchRlsBookings');

assert.match(updateListing, /updateRow\.category_id\s*=\s*updates\.categoryId/);
assert.match(updateListing, /updateRow\.subcategory\s*=\s*updates\.subcategory/);
assert.match(updateListing, /updateRow\.entity_type\s*=\s*updates\.entityType/);
assert.match(updateListing, /updateRow\.price_unit\s*=\s*updates\.priceUnit/);
assert.match(updateListing, /\.select\('id'\)[\s\S]*\.maybeSingle\(\)/);
assert.match(updateListing, /data\?\.id\s*===\s*id/);

assert.doesNotMatch(deactivateListing, /\.delete\(\)/);
assert.match(deactivateListing, /\.update\(\{\s*status:\s*'expired'/);
assert.match(deactivateListing, /\.select\('id'\)[\s\S]*\.maybeSingle\(\)/);
assert.match(deactivateListing, /data\?\.id\s*===\s*id/);

assert.match(source, /table:\s*'platform_config_versions'[\s\S]*bos-live-page-config-refresh/);
console.log('PASS listing CRUD preserves rows, updates complete fields, and reports RLS no-op accurately');
console.log('PASS published App Builder config refresh subscription remains present');
