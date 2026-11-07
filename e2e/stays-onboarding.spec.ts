import { expect, test } from '@playwright/test';
import {
  STAY,
  USERS,
  sessionToken,
  startStaysHarness,
  type StaysHarness,
} from './stays-e2e-harness';

/**
 * Hotel owner draft/submit + Super Admin review.
 * Unauthorized publish, booking before approval, demo, suspension and
 * concurrent last-unit inventory.
 */

let harness: StaysHarness;
test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.beforeAll(async () => {
  harness = await startStaysHarness({
    merchantVpa: 'bookourspace@upi',
    paymentSandboxSecret: 'e2e-onboard-sandbox-secret-012345',
  });
  await harness.query(
    `update public.profiles set is_super_admin = true where id = $1`,
    [USERS.admin.authId],
  );
});
test.afterAll(async () => { await harness?.stop(); });

function isoPlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function api(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${harness.apiUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

test('customers cannot list host inventory until they own a stay draft', async () => {
  const guest = await api('/api/stays/host/listings', sessionToken(USERS.customerA));
  expect([401, 403]).toContain(guest.status);
});

test('owner Google session creates a draft that cannot be self-approved or booked', async () => {
  const owner = sessionToken(USERS.customerB);
  const created = await api('/api/stays/host/onboard', owner, {
    method: 'POST',
    body: JSON.stringify({ name: 'Onboard Lake Hotel', city: 'Udaipur', area: 'Fateh Sagar', propertyType: 'hotel' }),
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const listingId = created.body.listingId as string;
  expect(listingId).toBeTruthy();
  expect(created.body.stayLifecycle).toBe('draft');
  expect(created.body.status).toBe('pending_approval');

  const selfApprove = await api(`/api/stays/admin/listings/${listingId}/review`, owner, {
    method: 'POST',
    body: JSON.stringify({ action: 'approve', reason: 'I own this hotel' }),
  });
  expect([401, 403]).toContain(selfApprove.status);

  const providerApprove = await api(`/api/stays/admin/listings/${listingId}/review`, sessionToken(USERS.provider), {
    method: 'POST',
    body: JSON.stringify({ action: 'approve', reason: 'Owner trying to publish' }),
  });
  expect(providerApprove.status).toBe(403);

  const search = await api(`/api/stays/search?destination=Udaipur`, sessionToken(USERS.customerA));
  expect(search.body.ok).toBe(true);
  expect((search.body.items || []).some((item: { listingId: string }) => item.listingId === listingId)).toBe(false);

  const rooms = await api(`/api/stays/${listingId}/room-types`, sessionToken(USERS.customerA));
  expect(rooms.body.roomTypes || []).toEqual([]);

  const checkout = await api('/api/stays/checkout', sessionToken(USERS.customerA), {
    method: 'POST',
    body: JSON.stringify({
      listingId,
      roomTypeId: '11111111-1111-4111-8111-111111111111',
      checkIn: isoPlus(10),
      checkOut: isoPlus(12),
      units: 1,
      paymentMode: 'pay_after_service',
      idempotencyKey: `pre-approval-${Date.now()}`,
      guestName: 'Too Early',
      guestPhone: '+919000000011',
    }),
  });
  expect([404, 409]).toContain(checkout.status);
  expect(['STAY_NOT_APPROVED', 'STAY_NOT_ACTIVE', 'LISTING_NOT_FOUND'].includes(checkout.body.error)).toBe(true);

  const incomplete = await api(`/api/stays/host/listings/${listingId}/submit`, owner, { method: 'POST' });
  expect(incomplete.status).toBe(400);
  expect(incomplete.body.error).toBe('STAY_PROFILE_INCOMPLETE');

  const saved = await api('/api/stays/host/properties', owner, {
    method: 'PUT',
    body: JSON.stringify({
      listingId, name: 'Onboard Lake Hotel', city: 'Udaipur', area: 'Fateh Sagar',
      propertyType: 'hotel', placeType: 'entire_home', basePricePaise: 420000,
      taxPercent: 12, bedrooms: 1, beds: 1, bathrooms: 1, maxGuests: 2,
      amenities: ['WiFi'], description: 'Lake-facing boutique hotel.',
    }),
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const propertyId = saved.body.property.id;
  const room = await api('/api/stays/host/room-types', owner, {
    method: 'POST',
    body: JSON.stringify({ propertyId, name: 'Lake View King', maxAdults: 2, maxChildren: 0, basePricePaise: 420000, bedrooms: 1, beds: 1, bathrooms: 1 }),
  });
  expect(room.status).toBe(201);
  const unit = await api('/api/stays/host/units', owner, {
    method: 'POST',
    body: JSON.stringify({ roomTypeId: room.body.roomType.id, label: 'LV-1' }),
  });
  expect(unit.status).toBe(201);
  const docs = await api(`/api/stays/host/listings/${listingId}/documents`, owner, {
    method: 'PUT',
    body: JSON.stringify({
      gstin: '27AABCU9603R1ZN',
      legalName: 'Onboard Lake Hotel LLP',
      images: ['https://cdn.bookourspace.test/stays/onboard-lake.jpg'],
      documents: [
        { kind: 'gst_certificate', reference: 'https://cdn.bookourspace.test/docs/gst.pdf', fileName: 'GST' },
        { kind: 'property_ownership', reference: 'https://cdn.bookourspace.test/docs/own.pdf', fileName: 'Ownership' },
        { kind: 'government_id', reference: 'https://cdn.bookourspace.test/docs/id.pdf', fileName: 'ID' },
      ],
    }),
  });
  expect(docs.status, JSON.stringify(docs.body)).toBe(200);

  const submitted = await api(`/api/stays/host/listings/${listingId}/submit`, owner, { method: 'POST' });
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
  expect(submitted.body.stayLifecycle).toBe('submitted');

  const stillHidden = await api(`/api/stays/search?destination=Udaipur`, sessionToken(USERS.customerA));
  expect((stillHidden.body.items || []).some((item: { listingId: string }) => item.listingId === listingId)).toBe(false);

  const approved = await api(`/api/stays/admin/listings/${listingId}/review`, sessionToken(USERS.admin), {
    method: 'POST',
    body: JSON.stringify({ action: 'approve', reason: 'Documents and inventory verified.' }),
  });
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  expect(approved.body.status).toBe('active');
  expect(approved.body.stayLifecycle).toBe('approved');

  const live = await api(`/api/stays/search?destination=Udaipur`, sessionToken(USERS.customerA));
  expect((live.body.items || []).some((item: { listingId: string }) => item.listingId === listingId)).toBe(true);

  const liveRooms = await api(`/api/stays/${listingId}/room-types`, sessionToken(USERS.customerA));
  const roomTypeId = liveRooms.body.roomTypes[0].id;
  const booked = await api('/api/stays/checkout', sessionToken(USERS.customerA), {
    method: 'POST',
    body: JSON.stringify({
      listingId, roomTypeId, checkIn: isoPlus(20), checkOut: isoPlus(22), units: 1,
      paymentMode: 'pay_after_service', idempotencyKey: `after-approval-${Date.now()}`,
      guestName: 'Approved Guest', guestPhone: '+919000000012',
    }),
  });
  expect(booked.status, JSON.stringify(booked.body)).toBe(201);

  const demo = await api(`/api/stays/admin/listings/${listingId}/review`, sessionToken(USERS.admin), {
    method: 'POST',
    body: JSON.stringify({ action: 'suspend', reason: 'Temporary closure for inspection.', demo: true }),
  });
  expect(demo.status, JSON.stringify(demo.body)).toBe(200);
  expect(demo.body.stayLifecycle).toBe('suspended');

  const hidden = await api(`/api/stays/search?destination=Udaipur`, sessionToken(USERS.customerA));
  expect((hidden.body.items || []).some((item: { listingId: string }) => item.listingId === listingId)).toBe(false);

  const blocked = await api('/api/stays/checkout', sessionToken(USERS.customerA), {
    method: 'POST',
    body: JSON.stringify({
      listingId, roomTypeId, checkIn: isoPlus(30), checkOut: isoPlus(32), units: 1,
      paymentMode: 'pay_after_service', idempotencyKey: `suspended-${Date.now()}`,
      guestName: 'Blocked Guest', guestPhone: '+919000000013',
    }),
  });
  expect([404, 409]).toContain(blocked.status);
  expect(['STAY_NOT_APPROVED', 'STAY_DEMO_NOT_BOOKABLE', 'STAY_NOT_ACTIVE', 'LISTING_NOT_FOUND'].includes(blocked.body.error)).toBe(true);

  const audit = await api(`/api/stays/admin/listings/${listingId}/audit`, sessionToken(USERS.admin));
  expect(audit.status).toBe(200);
  const actions = (audit.body.events || []).map((event: { action: string }) => event.action);
  expect(actions).toContain('approve');
  expect(actions).toContain('submit');
  expect(actions).toContain('suspend');
});

test('Super Admin demo hotels never accept real bookings', async () => {
  const admin = sessionToken(USERS.admin);
  const rows = await harness.query(
    `update public.listings
        set payload = coalesce(payload,'{}'::jsonb) || '{"demo":true,"stayLifecycle":"approved"}'::jsonb
      where id = $1
        and set_config('bos.stay_lifecycle_transition', 'on', true) = 'on'
      returning id, payload->>'demo' as demo`,
    [STAY.listingId],
  );
  expect(rows[0].demo).toBe('true');
  const checkout = await api('/api/stays/checkout', sessionToken(USERS.customerA), {
    method: 'POST',
    body: JSON.stringify({
      listingId: STAY.listingId,
      roomTypeId: harness.deluxeRoomTypeId,
      checkIn: isoPlus(40),
      checkOut: isoPlus(42),
      units: 1,
      paymentMode: 'pay_after_service',
      idempotencyKey: `demo-block-${Date.now()}`,
      guestName: 'Demo Guest',
      guestPhone: '+919000000014',
    }),
  });
  expect(checkout.status).toBe(409);
  expect(checkout.body.error).toBe('STAY_DEMO_NOT_BOOKABLE');
  await harness.query(
    `update public.listings
        set payload = (coalesce(payload,'{}'::jsonb) - 'demo') || '{"stayLifecycle":"approved"}'::jsonb
      where id = $1
        and set_config('bos.stay_lifecycle_transition', 'on', true) = 'on'`,
    [STAY.listingId],
  );
  void admin;
});

test('concurrent holds on the last remaining unit reject the loser', async () => {
  const room = await api('/api/stays/host/room-types', sessionToken(USERS.provider), {
    method: 'POST',
    body: JSON.stringify({
      propertyId: harness.propertyId,
      name: 'Single Inventory Room',
      maxAdults: 2,
      maxChildren: 0,
      basePricePaise: 210000,
      bedrooms: 1,
      beds: 1,
      bathrooms: 1,
    }),
  });
  expect(room.status).toBe(201);
  const unit = await api('/api/stays/host/units', sessionToken(USERS.provider), {
    method: 'POST',
    body: JSON.stringify({ roomTypeId: room.body.roomType.id, label: 'ONLY-1' }),
  });
  expect(unit.status).toBe(201);
  const checkIn = isoPlus(50);
  const checkOut = isoPlus(52);
  const payload = (token: string, key: string) => api('/api/stays/checkout', token, {
    method: 'POST',
    body: JSON.stringify({
      listingId: STAY.listingId,
      roomTypeId: room.body.roomType.id,
      checkIn,
      checkOut,
      units: 1,
      paymentMode: 'pay_after_service',
      idempotencyKey: key,
      guestName: 'Race Guest',
      guestPhone: '+919000000015',
    }),
  });
  const [first, second] = await Promise.all([
    payload(sessionToken(USERS.customerA), `race-a-${Date.now()}`),
    // customerB becomes a provider earlier in this serial spec when the
    // onboarding listing is approved. Keep the inventory race customer-only.
    payload(sessionToken(USERS.customerC), `race-c-${Date.now()}`),
  ]);
  const statuses = [first.status, second.status].sort();
  expect(statuses, JSON.stringify({ first: { status: first.status, error: first.body.error }, second: { status: second.status, error: second.body.error } })).toEqual([201, 409]);
});
