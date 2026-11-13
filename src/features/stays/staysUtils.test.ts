import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarketplaceListing } from '../../types/marketplace';
import {
  buildStayPriceBreakdown,
  filterStayListings,
  getStayTypeForListing,
  stayTypeOptions,
} from './staysUtils';
import { evaluateStayCancellation } from './stayCancellation';
import { isAuthoritativeBookingAccepted } from '../../lib/bookingValidation';

const makeListing = (
  overrides: Partial<MarketplaceListing> = {}
): MarketplaceListing => ({
  id: 'stay-1',
  title: 'Garden View Home Stay',
  description: 'A quiet home stay near the lake',
  categoryId: 'hotel-homestay',
  subcategory: 'Family Homestay',
  entityType: 'property',
  price: 2400,
  priceUnit: '/day',
  currency: '₹',
  location: { city: 'Hyderabad', area: 'Kokapet', distanceKm: 4.2 },
  images: ['stay.jpg'],
  providerId: 'provider-1',
  providerName: 'BookOurSpace Hosts',
  providerPhone: '9999999999',
  providerEmail: 'host@example.com',
  providerAvatar: 'host.jpg',
  providerRating: 4.8,
  reviewCount: 24,
  isVerified: true,
  isFeatured: false,
  status: 'active',
  customFieldValues: {
    sectionType: 'hotel_stay',
    dailyPrice: 2400,
    guestCapacityEn: '4 Guests',
  },
  postingPlanId: 'plan-pro',
  viewsCount: 10,
  enquiriesCount: 2,
  createdAt: '2026-10-01',
  expiresAt: '2026-12-01',
  reported: false,
  ...overrides,
});

test('maps stay listings to the Airbnb-style stay type filters', () => {
  assert.equal(stayTypeOptions.find((option) => option.id === 'hotels')?.teLabel, 'హోటల్స్');
  assert.equal(getStayTypeForListing(makeListing()), 'home_stays');
  assert.equal(
    getStayTypeForListing(
      makeListing({ categoryId: 'hotel-resorts', title: 'Palm Breeze Resort Villa' })
    ),
    'resorts'
  );
  assert.equal(
    getStayTypeForListing(
      makeListing({
        categoryId: 'hotel-service-apt',
        title: 'Oakwood Furnished Service Apartments',
        subcategory: '1BHK / 2BHK Service Flats',
      })
    ),
    'apartments'
  );
  assert.equal(
    getStayTypeForListing(
      makeListing({ categoryId: 'hotel-service-apt', subcategory: 'Furnished Flats' })
    ),
    'flats'
  );
});

test('filters stays by query, type, rating, guests, and paginates results', () => {
  const listings = [
    makeListing({ id: 'stay-1', title: 'Garden View Home Stay' }),
    makeListing({
      id: 'stay-2',
      categoryId: 'hotel-resorts',
      title: 'Palm Breeze Pool Resort',
      providerRating: 4.3,
      customFieldValues: { sectionType: 'hotel_stay', guestCapacityEn: '12 Guests' },
    }),
    makeListing({ id: 'stay-3', title: 'Metro City Lodge', categoryId: 'hotel-hourly' }),
  ];

  const result = filterStayListings(listings, {
    query: 'pool',
    stayType: 'resorts',
    guests: 6,
    minimumRating: 4,
    page: 1,
    pageSize: 1,
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.id, 'stay-2');
  assert.equal(result.hasNextPage, false);
});

test('calculates a transparent stay price breakdown from the selected nights', () => {
  const breakdown = buildStayPriceBreakdown(makeListing(), 2);

  assert.equal(breakdown.nightlyRate, 2400);
  assert.equal(breakdown.nights, 2);
  assert.equal(breakdown.baseAmount, 4800);
  assert.equal(
    breakdown.total,
    breakdown.baseAmount + breakdown.cleaningFee + breakdown.serviceFee + breakdown.taxes
  );
});

test('only accepts a server booking response that contains a booking id', () => {
  assert.equal(isAuthoritativeBookingAccepted({ ok: false, booking: { id: 'book-1' } }), false);
  assert.equal(isAuthoritativeBookingAccepted({ ok: true, booking: null }), false);
  assert.equal(isAuthoritativeBookingAccepted({ ok: true, booking: { id: 'book-1' } }), true);
});

test('calculates a refundable stay cancellation before the provider cutoff', () => {
  const result = evaluateStayCancellation({
    totalAmount: 5000,
    checkInAt: '2026-11-10T12:00:00.000Z',
    now: '2026-11-08T12:00:00.000Z',
    cancellationAllowed: true,
    cancellationCutoffMinutes: 1440,
    refundPercent: 80,
    paymentStatus: 'verified',
  });

  assert.deepEqual(result, {
    allowed: true,
    refundAmount: 4000,
    refundPercent: 80,
    refundStatus: 'initiated',
  });
});

test('does not invent a refund for pay-later stays or late cancellations', () => {
  const payLater = evaluateStayCancellation({
    totalAmount: 5000,
    checkInAt: '2026-11-10T12:00:00.000Z',
    now: '2026-11-08T12:00:00.000Z',
    cancellationAllowed: true,
    cancellationCutoffMinutes: 1440,
    refundPercent: 80,
    paymentStatus: 'pay_later',
  });
  const late = evaluateStayCancellation({
    totalAmount: 5000,
    checkInAt: '2026-11-10T12:00:00.000Z',
    now: '2026-11-09T12:01:00.000Z',
    cancellationAllowed: true,
    cancellationCutoffMinutes: 1440,
    refundPercent: 80,
    paymentStatus: 'verified',
  });

  assert.equal(payLater.refundAmount, 0);
  assert.equal(payLater.refundStatus, 'none');
  assert.equal(late.allowed, false);
  assert.equal(late.refundAmount, 0);
});
