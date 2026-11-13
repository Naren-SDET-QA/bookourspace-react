import assert from 'node:assert/strict';
import test from 'node:test';
import { MarketplaceListing } from '../../types/marketplace';
import { buildServicePriceBreakdown, filterServiceListings } from './servicesUtils';
import { initialListings } from '../../data/seedData';
import { additionalServiceCategories } from '../../data/additionalServiceCategories';

const listing = (overrides: Partial<MarketplaceListing>): MarketplaceListing => ({
  id: 'service-1',
  title: 'Verified electrician visit',
  description: 'Same-day electrical repair for homes and offices.',
  categoryId: 'cat-2',
  subcategory: 'Electrician',
  entityType: 'service',
  price: 299,
  priceUnit: '/visit',
  currency: 'INR',
  location: { city: 'Hyderabad', area: 'Madhapur' },
  images: ['https://example.test/electrician.jpg'],
  providerId: 'provider-1',
  providerName: 'BookOurSpace Pro',
  providerPhone: '9000000000',
  providerEmail: 'provider@example.test',
  providerAvatar: '',
  providerRating: 4.8,
  reviewCount: 18,
  isVerified: true,
  isFeatured: false,
  status: 'active',
  customFieldValues: {},
  postingPlanId: 'standard',
  viewsCount: 0,
  enquiriesCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  reported: false,
  ...overrides,
});

test('filters services by location, category, verification, rating, and paginates results', () => {
  const results = filterServiceListings(
    [
      listing({ id: 'electrician', categoryId: 'cat-2', providerRating: 4.8, isVerified: true }),
      listing({ id: 'plumber', title: 'Madhapur plumbing repair', categoryId: 'cat-3', providerRating: 4.6, isVerified: true }),
      listing({ id: 'unverified', categoryId: 'cat-2', providerRating: 4.9, isVerified: false }),
      listing({ id: 'course', title: 'Madhapur electrician course', categoryId: 'class-it', providerRating: 4.9, isVerified: true }),
    ],
    { query: 'Madhapur', categoryId: 'cat-2', verifiedOnly: true, minimumRating: 4.5, page: 1, pageSize: 1 }
  );

  assert.equal(results.total, 1);
  assert.equal(results.items[0].id, 'electrician');
  assert.equal(results.hasNextPage, false);
});

test('uses provider price-breakdown fields without inventing a service total', () => {
  const price = buildServicePriceBreakdown(
    listing({
      price: 499,
      priceBreakdown: { baseRent: 499, maintenance: 0, serviceFee: 49, taxes: 0 },
    })
  );

  assert.equal(price.baseAmount, 499);
  assert.equal(price.platformFee, 49);
  assert.equal(price.total, 548);
});

test('keeps non-service module records out of the all-services feed', () => {
  const results = filterServiceListings(
    [
      listing({ id: 'electrician', categoryId: 'cat-2' }),
      listing({ id: 'course', title: 'Electrician training', categoryId: 'class-it' }),
    ],
    { query: '', categoryId: 'all', verifiedOnly: false, minimumRating: 0, page: 1, pageSize: 8 }
  );

  assert.deepEqual(results.items.map((item) => item.id), ['electrician']);
});

test('includes approved dairy providers and excludes pending providers', () => {
  const result = filterServiceListings([
    listing({ id: 'milk', categoryId: 'srv-milk', title: 'Fresh milk delivery' }),
    listing({ id: 'pending-milk', categoryId: 'srv-milk', status: 'pending_approval' }),
    listing({ id: 'repair', categoryId: 'cat-2' }),
  ], { query: 'Hyderabad', categoryId: 'srv-milk', verifiedOnly: false, minimumRating: 0, page: 1, pageSize: 8 });
  assert.deepEqual(result.items.map((item) => item.id), ['milk']);
});

test('new categories do not manufacture provider listings in the seed generator', () => {
  const newIds = new Set(additionalServiceCategories.map((category) => category.id));
  assert.equal(new Set(additionalServiceCategories.map((category) => category.id)).size, additionalServiceCategories.length);
  assert.deepEqual(initialListings.filter((item) => newIds.has(item.categoryId)), []);
});

test('daily essentials group includes only its categories, preserves search and pagination', () => {
  const result = filterServiceListings([
    listing({ id: 'milk', categoryId: 'srv-milk' }),
    listing({ id: 'water', categoryId: 'srv-water-delivery' }),
    listing({ id: 'repair', categoryId: 'cat-2' }),
    listing({ id: 'elsewhere', categoryId: 'srv-milk', location: { city: 'Delhi', area: 'Central' } }),
  ], { query: 'Hyderabad', categoryId: 'all', categoryIds: ['srv-milk', 'srv-water-delivery'], verifiedOnly: false, minimumRating: 0, page: 2, pageSize: 1 });
  assert.equal(result.total, 2);
  assert.deepEqual(result.items.map((item) => item.id), ['water']);
  assert.equal(result.hasNextPage, false);
});
