import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDemoCatalog, renderDemoSeed } from './catalog';
import { assertLocalDatabaseUrl, assertLocalHttpUrl } from '../../src/lib/localDemoSafety';

test('demo seed has fixed identities, valid ownership, small counts and future non-overlapping shows', () => {
  const catalog = buildDemoCatalog('2026-11-02');
  assert.deepEqual(catalog, buildDemoCatalog('2026-11-02'));
  assert.deepEqual(catalog.cities.map(c => c.city), ['Hyderabad', 'Bengaluru', 'Chennai']);
  assert.equal(catalog.providers.length, 5);
  assert.equal(catalog.movies.length, 4);
  assert.equal(catalog.theatres.length, 4);
  assert.equal(catalog.showtimes.length, 16);
  assert.equal(catalog.listings.length, 29);
  assert.equal(catalog.listings.filter(l => l.customFieldValues.sectionType === 'services').length, 15);
  assert.equal(catalog.listings.filter(l => l.customFieldValues.sectionType === 'hotel_stay').length, 4);
  assert.equal(catalog.listings.filter(l => l.customFieldValues.sectionType === 'venues').length, 4);
  assert.equal(new Set(catalog.listings.map(l => l.id)).size, catalog.listings.length);
  for (const listing of catalog.listings) {
    assert.ok(catalog.providers.some(p => p.id === listing.providerId));
    assert.ok(catalog.cities.some(c => c.city === listing.location.city));
    assert.ok(listing.providerEmail.endsWith('.invalid'));
    assert.ok(listing.images.every(src => src.startsWith('/assets/demo/')));
    assert.equal(listing.status, 'active');
    assert.ok(listing.price > 0);
  }
  for (const provider of catalog.providers) {
    assert.equal(catalog.listings.filter(l => l.providerId === provider.id && l.customFieldValues.sectionType === 'services').length, 3);
  }
  for (const show of catalog.showtimes) {
    assert.ok(catalog.movies.some(m => m.id === show.movie_id));
    assert.ok(catalog.theatres.some(t => t.id === show.theatre_id));
    assert.ok(Date.parse(show.starts_at) > Date.parse('2026-11-02T23:59:59Z'));
    const adjacent = catalog.showtimes.filter(s => s.theatre_id === show.theatre_id && s.starts_at > show.starts_at);
    assert.ok(adjacent.every(s => Date.parse(s.starts_at) - Date.parse(show.starts_at) >= 4 * 3600000));
  }
  assert.equal(catalog.favorites.length, 3);
  assert.equal(catalog.notifications.length, 3);
  const sql = renderDemoSeed(catalog);
  assert.match(sql, /ON CONFLICT/);
  assert.doesNotMatch(sql, /disable row level security|truncate|delete from|payment_verifications|encrypted_password/i);
  assert.throws(() => buildDemoCatalog('not-a-date'));
});

test('local demo rejects hosted, deceptive and privileged endpoints before connecting', () => {
  assertLocalHttpUrl('http://127.0.0.1:54321');
  assertLocalDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  for (const url of ['https://ezrxykyocgbolpaebnqx.supabase.co', 'http://localhost.evil.test', 'https://example.com', 'http://user@127.0.0.1:54321', 'http://127.0.0.1:54321/path', 'http://127.1:54321']) {
    assert.throws(() => assertLocalHttpUrl(url));
  }
  for (const url of ['postgresql://postgres:secret@db.example.com/postgres', 'postgresql://postgres@localhost.evil.test/postgres', 'https://localhost/db']) {
    assert.throws(() => assertLocalDatabaseUrl(url));
  }
});
