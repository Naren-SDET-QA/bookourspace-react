import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildStayDetailContent } from './stayDetails';

const listing = {
  id: 'stay-detail-test',
  title: 'Verdant Haven',
  description: 'A furnished home with a kitchen, Wi-Fi, smart TV and free parking.',
  categoryId: 'hotel-homestay',
  subcategory: 'Luxury Home Stay',
  entityType: 'property' as const,
  price: 3504,
  priceUnit: '/day',
  currency: '₹',
  location: { city: 'Hyderabad', area: 'Hitech City', distanceKm: 2.4 },
  images: ['home.jpg'],
  providerId: 'host-1',
  providerName: 'Ram | HappyNest Homestay',
  providerPhone: '9848011999',
  providerEmail: 'host@example.com',
  providerAvatar: 'host.jpg',
  providerRating: 5,
  reviewCount: 7,
  isVerified: true,
  isFeatured: true,
  status: 'active' as const,
  customFieldValues: {
    sectionType: 'hotel_stay',
    guestCapacityEn: '5 Guests',
    roomSpecLineEn: '2 Bedrooms • 2 Beds • 2 Bathrooms',
    breakfastIncluded: 'Complimentary breakfast',
    houseRules: 'No smoking inside\nOnly registered guests may stay',
    securityDeposit: '₹1,500 refundable deposit',
    checkInTime: '02:00 PM',
    checkOutTime: '12:00 PM',
  },
  postingPlanId: 'plan-pro',
  viewsCount: 0,
  enquiriesCount: 0,
  createdAt: '2026-11-01',
  expiresAt: '2026-12-31',
  reported: false,
};

test('stay detail content exposes the Airbnb-style sections from listing data', () => {
  const content = buildStayDetailContent(listing, 'en');

  assert.equal(content.guestSummary, '5 Guests');
  assert.equal(content.roomSummary, '2 Bedrooms • 2 Beds • 2 Bathrooms');
  assert.ok(content.amenities.some((item) => item.label === 'Kitchen'));
  assert.ok(content.amenities.some((item) => item.label === 'Wi-Fi'));
  assert.deepEqual(content.houseRules, ['No smoking inside', 'Only registered guests may stay']);
  assert.equal(content.securityDeposit, '₹1,500 refundable deposit');
  assert.equal(content.checkIn, '02:00 PM');
  assert.equal(content.checkOut, '12:00 PM');
});
