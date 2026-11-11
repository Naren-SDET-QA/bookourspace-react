import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('PG Style 3 uses the compact two-up cards and its own detail page', () => {
  const section = source('src/components/PGSectionExperience.tsx');
  assert.match(section, /import \{ PgStyleThreeCards \} from '\.\/pg\/PgStyleThreeCards'/);
  assert.match(section, /import \{ PgStyleThreeDetail \} from '\.\/pg\/PgStyleThreeDetail'/);
  assert.match(section, /experienceTab === 'style3' && state === 'results'/);
  assert.match(section, /<PgStyleThreeCards/);
  assert.match(section, /<PgStyleThreeDetail/);
  assert.doesNotMatch(section, /<StyleThreeList[\s\S]*PGs style 3 list/);
});

test('PG Style 1 and Style 2 keep the original card and detail flow', () => {
  const section = source('src/components/PGSectionExperience.tsx');
  assert.match(section, /<PGListingCard/);
  assert.match(section, /experienceTab !== 'style3' && \(/);
  assert.match(section, /aria-labelledby="pg-detail-title"/);
  assert.match(section, /<PgBookingPanel listingId=\{selected\.id\}/);
});

test('the Style 3 detail keeps owner contact and live booking', () => {
  const detail = source('src/components/pg/PgStyleThreeDetail.tsx');
  assert.match(detail, /import \{ PgBookingPanel \}/);
  assert.match(detail, /<PgBookingPanel listingId=\{card\.id\}/);
  assert.match(detail, /onCall/);
  assert.match(detail, /onWhatsapp/);
  assert.match(detail, /Room Types &amp; Pricing/);
  assert.match(detail, /Book Visit/);
  for (const section of [
    'pg-style3-overview',
    'pg-style3-occupancy',
    'pg-style3-charges',
    'pg-style3-amenities',
    'pg-style3-rules',
    'pg-style3-location',
    'pg-style3-reviews',
  ]) {
    assert.match(detail, new RegExp(`id="${section}"`), section);
  }
  assert.match(detail, /Property Details/);
  assert.match(detail, /Occupancy/);
  assert.match(detail, /House Rules/);
  assert.match(detail, /openstreetmap\.org/);
});
