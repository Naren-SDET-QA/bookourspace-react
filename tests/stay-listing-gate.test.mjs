import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  stayListingUnbookableReason,
  stayProtectedPayloadPatch,
  staySubmitMissing,
} from '../src/lib/stayListingGate.ts';

test('approved active available hotels are bookable', () => {
  assert.equal(stayListingUnbookableReason({
    listingStatus: 'active',
    listingVerified: true,
    ownerVerified: true,
    propertyActive: true,
    payload: { stayLifecycle: 'approved' },
    availableUnits: 2,
  }), null);
});

test('draft, pending and suspended hotels are not bookable', () => {
  assert.equal(stayListingUnbookableReason({
    listingStatus: 'pending_approval',
    propertyActive: false,
    payload: { stayLifecycle: 'draft' },
  }), 'STAY_NOT_APPROVED');
  assert.equal(stayListingUnbookableReason({
    listingStatus: 'active',
    listingVerified: true,
    ownerVerified: true,
    propertyActive: true,
    payload: { stayLifecycle: 'submitted' },
  }), 'STAY_NOT_APPROVED');
  assert.equal(stayListingUnbookableReason({
    listingStatus: 'expired',
    propertyActive: false,
    payload: { stayLifecycle: 'suspended' },
  }), 'STAY_NOT_APPROVED');
});

test('a published stay requires verified owner and explicit property approval', () => {
  const approved = {
    listingStatus: 'active',
    listingVerified: true,
    ownerVerified: true,
    propertyActive: true,
    payload: { stayLifecycle: 'approved' },
    availableUnits: 1,
  };
  assert.equal(stayListingUnbookableReason({ ...approved, ownerVerified: false }), 'STAY_OWNER_NOT_VERIFIED');
  assert.equal(stayListingUnbookableReason({ ...approved, listingVerified: false }), 'STAY_NOT_APPROVED');
  assert.equal(stayListingUnbookableReason({ ...approved, payload: {} }), 'STAY_NOT_APPROVED');
});

test('demo hotels are unbookable by default, and bookable only under the explicit local preview', () => {
  const demo = {
    listingStatus: 'active',
    listingVerified: true,
    ownerVerified: true,
    propertyActive: true,
    payload: { stayLifecycle: 'approved', demo: true },
  };
  assert.equal(stayListingUnbookableReason(demo), 'STAY_DEMO_NOT_BOOKABLE');
  assert.equal(stayListingUnbookableReason({ ...demo, allowDemoBooking: false }), 'STAY_DEMO_NOT_BOOKABLE');
  assert.equal(stayListingUnbookableReason({ ...demo, allowDemoBooking: true }), null);
  // Even with the preview on, every other publication rule still applies.
  assert.equal(stayListingUnbookableReason({ ...demo, listingVerified: false, allowDemoBooking: true }), 'STAY_NOT_APPROVED');
});

test('owners cannot copy protected approval fields into a payload patch', () => {
  const next = stayProtectedPayloadPatch(
    { stayLifecycle: 'submitted', demo: false, review: { action: 'approve' } },
    { stayLifecycle: 'approved', demo: true, isFeatured: true },
  );
  assert.equal(next.stayLifecycle, 'submitted');
  assert.equal(next.demo, false);
  assert.equal(next.isFeatured, false);
  assert.deepEqual(next.review, { action: 'approve' });
});

test('submit requires rooms, units, photos and verification documents', () => {
  const missing = staySubmitMissing({
    name: 'Hotel',
    city: 'Pune',
    basePricePaise: 1000,
    images: [],
    roomCount: 0,
    unitCount: 0,
    documents: [],
  });
  assert.ok(missing.includes('photos'));
  assert.ok(missing.includes('rooms'));
  assert.ok(missing.includes('gst_certificate'));
});
