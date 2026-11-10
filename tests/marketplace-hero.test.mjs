import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const hero = await readFile(new URL('../src/components/MarketplaceHero.tsx', import.meta.url), 'utf8');
const hub = await readFile(new URL('../src/components/SuperAppBentoHomeHub.tsx', import.meta.url), 'utf8');

test('marketplace hero uses live counts and real media only', () => {
  assert.match(hero, /listingCount/);
  assert.match(hero, /verifiedListingCount/);
  assert.match(hero, /heroImage/);
  assert.match(hero, /Real listing media/);
  assert.doesNotMatch(hero, /unsplash|priceTag|\$\d|₹\d/);
});
test('Bento hub mounts the live-data hero without changing module navigation', () => {
  assert.match(hub, /<MarketplaceHero/);
  assert.match(hub, /onExplore=\{\(\) => onSelectCategoryAndAdvance\('pg_hostels', 'all'\)\}/);
  assert.match(hub, /onSelectCategoryAndAdvance/);
});
