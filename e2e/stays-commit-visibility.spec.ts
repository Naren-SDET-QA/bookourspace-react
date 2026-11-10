import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  STAY,
  USERS,
  sessionToken,
  startStaysHarness,
  type StaysHarness,
} from './stays-e2e-harness';

/**
 * Read-after-write regression guard for the host inventory API.
 *
 * Every mutation below is followed immediately by a read issued on another
 * pooled connection. A route that answers before its COMMIT (the old
 * `handle` shape) lets that read observe the pre-write snapshot: the quote
 * returns a stale cleaning fee and the listing detail misses the room, unit,
 * document or media order that was just acknowledged.
 */

let harness: StaysHarness;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  harness = await startStaysHarness({
    merchantVpa: 'bookourspace@upi',
    paymentSandboxSecret: 'e2e-commit-sandbox-secret-012345',
  });
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

test('host writes are readable by the very next request', async () => {
  await harness.approveTestListings();
  const owner = sessionToken(USERS.provider);
  const guest = sessionToken(USERS.customerA);

  // Property pricing → public quote, repeated so a pre-COMMIT response cannot
  // hide behind lucky scheduling.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const cleaningFeePaise = 40_000 + attempt * 1_000;
    const save = await api('/api/stays/host/properties', owner, {
      method: 'PUT',
      body: JSON.stringify({
        listingId: STAY.listingId, name: STAY.title, city: STAY.city,
        propertyType: 'hotel', placeType: 'entire_home', basePricePaise: 900_000,
        taxPercent: 12, cleaningFeePaise, serviceFeeBps: 500,
        bedrooms: 3, beds: 4, bathrooms: 3, maxGuests: 8, instantBook: false,
        amenities: ['WiFi'], hostLanguages: ['english'], accessibility: ['step_free_entrance'],
      }),
    });
    expect(save.status, JSON.stringify(save.body)).toBe(200);
    expect(Number(save.body.property.cleaning_fee_paise), `save ${attempt}`).toBe(cleaningFeePaise);
    const quote = await api(
      `/api/stays/${STAY.listingId}/quote?roomTypeId=${harness.deluxeRoomTypeId}&checkIn=${isoPlus(70)}&checkOut=${isoPlus(72)}&units=1`,
      guest,
    );
    expect(quote.status, JSON.stringify(quote.body)).toBe(200);
    expect(quote.body.cleaningFeePaise, `immediate quote after save ${attempt}`).toBe(cleaningFeePaise);
    // Pricing comes from the room type, so the service fee is 5% of subtotal.
    expect(quote.body.serviceFeePaise).toBe(Math.round(quote.body.subtotalPaise * 0.05));
  }

  // Onboarding → the draft must exist for the next request.
  const title = `E2E Commit Visibility ${Date.now()}`;
  const onboarded = await api('/api/stays/host/onboard', owner, {
    method: 'POST',
    body: JSON.stringify({ title, name: title, city: 'Pune', propertyType: 'hotel' }),
  });
  expect(onboarded.status, JSON.stringify(onboarded.body)).toBe(201);
  const listingId = String(onboarded.body.listingId || '');
  expect(listingId).not.toBe('');
  const created = await api(`/api/stays/host/listings/${listingId}`, owner);
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  expect(created.body.listing.id).toBe(listingId);
  expect(created.body.listing.stayLifecycle).toBe('draft');

  // Property details → immediate detail read.
  const property = await api('/api/stays/host/properties', owner, {
    method: 'PUT',
    body: JSON.stringify({
      listingId, name: 'E2E Commit Villa', city: 'Pune', propertyType: 'villa',
      placeType: 'entire_home', basePricePaise: 750_000, taxPercent: 12,
      cleaningFeePaise: 25_000, serviceFeeBps: 300,
      bedrooms: 2, beds: 2, bathrooms: 2, maxGuests: 4,
    }),
  });
  expect(property.status, JSON.stringify(property.body)).toBe(200);
  const propertyId = String(property.body.property.id);
  const afterProperty = await api(`/api/stays/host/listings/${listingId}`, owner);
  expect(afterProperty.body.property.name).toBe('E2E Commit Villa');
  expect(Number(afterProperty.body.property.cleaning_fee_paise)).toBe(25_000);

  // Room type → immediate detail read.
  const room = await api('/api/stays/host/room-types', owner, {
    method: 'POST',
    body: JSON.stringify({
      propertyId, name: 'E2E Commit Room', maxAdults: 2, maxChildren: 0,
      basePricePaise: 750_000, bedrooms: 1, beds: 2, bathrooms: 1,
    }),
  });
  expect(room.status, JSON.stringify(room.body)).toBe(201);
  const roomTypeId = String(room.body.roomType.id);
  const afterRoom = await api(`/api/stays/host/listings/${listingId}`, owner);
  expect((afterRoom.body.roomTypes || []).map((row: { id: string }) => row.id)).toContain(roomTypeId);

  // Unit → immediate detail read.
  const unit = await api('/api/stays/host/units', owner, {
    method: 'POST',
    body: JSON.stringify({ roomTypeId, label: 'E2E-101' }),
  });
  expect(unit.status, JSON.stringify(unit.body)).toBe(201);
  const afterUnit = await api(`/api/stays/host/listings/${listingId}`, owner);
  const roomAfterUnit = (afterUnit.body.roomTypes || []).find((row: { id: string }) => row.id === roomTypeId);
  expect((roomAfterUnit?.units || []).map((row: { label: string }) => row.label)).toContain('E2E-101');

  // Verification documents and photos → immediate detail read.
  const documents = ['gst_certificate', 'property_ownership', 'government_id'].map((kind, index) => ({
    kind, reference: `https://example.test/commit-${index}.pdf`, fileName: `commit-${index}.pdf`,
  }));
  const savedDocuments = await api(`/api/stays/host/listings/${listingId}/documents`, owner, {
    method: 'PUT',
    body: JSON.stringify({ documents, images: ['https://example.test/commit-photo.jpg'] }),
  });
  expect(savedDocuments.status, JSON.stringify(savedDocuments.body)).toBe(200);
  const afterDocuments = await api(`/api/stays/host/listings/${listingId}`, owner);
  expect((afterDocuments.body.listing.verificationDocuments || []).map((doc: { kind: string }) => doc.kind))
    .toEqual(expect.arrayContaining(['gst_certificate', 'property_ownership', 'government_id']));

  // Media order → immediate detail read.
  const mediaIds = [randomUUID(), randomUUID()];
  const mediaPaths = mediaIds.map((id) => `${USERS.provider.authId}/stays/provider_listing/${id}/original.jpg`);
  try {
    for (let index = 0; index < mediaIds.length; index += 1) {
      await harness.query(
        `insert into public.media_assets
          (id,owner_id,module_key,parent_type,parent_id,bucket_id,object_path,media_kind,media_format,
           privacy,file_size_bytes,width,height,checksum_sha256,variants,display_order,alt_text,caption,processing_status)
         values ($1,$2,'stays','provider_listing',$3,'bos-public-media',$4,'image','jpeg','public',
                 1000,800,600,$5,'[]'::jsonb,$6,'Commit photo','', 'ready')`,
        [mediaIds[index], USERS.provider.authId, listingId, mediaPaths[index], index ? 'b'.repeat(64) : 'a'.repeat(64), index],
      );
    }
    const reversed = [...mediaIds].reverse();
    const ordered = await api('/api/stays/host/media-order', owner, {
      method: 'PUT',
      body: JSON.stringify({ listingId, mediaIds: reversed }),
    });
    expect(ordered.status, JSON.stringify(ordered.body)).toBe(200);
    const afterMedia = await api(`/api/stays/host/listings/${listingId}`, owner);
    expect((afterMedia.body.media || []).map((row: { id: string }) => row.id)).toEqual(reversed);
  } finally {
    await harness.query(`delete from public.media_assets where id=any($1::uuid[])`, [mediaIds]);
  }

  // Submission → immediate lifecycle read.
  const submitted = await api(`/api/stays/host/listings/${listingId}/submit`, owner, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
  const afterSubmit = await api(`/api/stays/host/listings/${listingId}`, owner);
  expect(afterSubmit.body.listing.stayLifecycle).toBe('submitted');
  expect(afterSubmit.body.listing.status).toBe('pending_approval');
});
