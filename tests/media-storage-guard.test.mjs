import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findEmbeddedDataUrl } from '../src/server/mediaInputGuard.ts';

test('nested inline base64 media is found before App Builder or Live Edit records can be saved', () => {
  assert.equal(findEmbeddedDataUrl({ pages: [{ banner: { source: 'data:image/png;base64,AAAA' } }] }), 'payload.pages[0].banner.source');
  assert.equal(findEmbeddedDataUrl({ logo: 'data:image/svg+xml,<svg/>' }), 'payload.logo');
  assert.equal(findEmbeddedDataUrl({ document: 'data:application/pdf;base64,AAAA' }), 'payload.document');
  assert.equal(findEmbeddedDataUrl({ title: 'A regular label', media: '/assets/fallbacks/venues.svg' }), null);
});
