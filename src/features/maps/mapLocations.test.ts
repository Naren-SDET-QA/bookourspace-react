import assert from 'node:assert/strict';
import test from 'node:test';
import { MarketplaceListing } from '../../types/marketplace';
import { resolveListingMapLocation } from './mapLocations';

const listing = (area: string, lat?: number, lng?: number): MarketplaceListing => ({
  id: 'map-test', title: 'Map test', description: '', categoryId: 'cat-2', subcategory: 'Electrician', entityType: 'service', price: 100, priceUnit: '/visit', currency: 'INR',
  location: { city: 'Hyderabad', area, lat, lng }, images: [], providerId: 'provider', providerName: 'Provider', providerPhone: '', providerEmail: '', providerAvatar: '', providerRating: 4.5, reviewCount: 1, isVerified: true, isFeatured: false, status: 'active', customFieldValues: {}, postingPlanId: 'plan', viewsCount: 0, enquiriesCount: 0, createdAt: '2026-01-01', expiresAt: '2027-01-01', reported: false,
});

test('uses exact listing coordinates when a provider supplies them', () => {
  const result = resolveListingMapLocation(listing('Anywhere', 17.4, 78.5));
  assert.deepEqual(result, { lat: 17.4, lng: 78.5, accuracy: 'exact' });
});

test('uses a labelled approximate centre for known Hyderabad localities', () => {
  const result = resolveListingMapLocation(listing('Madhapur / Hitech City'));
  assert.equal(result?.accuracy, 'approximate');
  assert.ok(result && result.lat > 17.4 && result.lat < 17.5);
  assert.ok(result && result.lng > 78.3 && result.lng < 78.5);
});

test('does not place a marker for an unknown locality', () => {
  assert.equal(resolveListingMapLocation(listing('Unknown locality')), null);
});
