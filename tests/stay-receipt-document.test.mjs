import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRAND_NAME, BRAND_SUPPORT, BRAND_TAGLINE, buildStayReceiptMailtoUrl } from '../src/lib/stayReceiptPdf.ts';

test('branded email composer contains booking facts but excludes private address and QR data', () => {
  const receipt = {
    bookingId: 'stay-0123456789abcdef0123456789abcdef',
    hotelName: 'Test Hotel', guestName: 'Test Guest', guestEmail: 'guest@example.test', guestPhone: '+919876543210',
    checkIn: '2026-12-10', checkOut: '2026-12-12', roomType: 'Deluxe', units: 1, guests: 2, nights: 2,
    cancellationPolicy: 'moderate', paymentMode: 'pay_after_service', paymentStatus: 'not_due',
    taxesPaise: 500, discountPaise: 0, totalPaise: 10500, paidPaise: 0, duePaise: 10500,
    guestAddress: 'Private home address',
  };
  const url = buildStayReceiptMailtoUrl(receipt);
  assert.ok(url.startsWith('mailto:guest%40example.test?'));
  const body = decodeURIComponent(url);
  assert.match(body, /BookOurSpace — Find · Book · Enjoy/);
  assert.match(body, /Booking ID: stay-/);
  assert.match(body, /Cancellation policy: moderate/);
  assert.doesNotMatch(body, /Private home address|bos1\.|identity document/i);
});


test('booking document brand identity is fixed and present in the document builder', () => {
  assert.equal(BRAND_NAME, 'BookOurSpace');
  assert.match(BRAND_TAGLINE, /^FIND\s+\u2022\s+BOOK\s+\u2022\s+ENJOY$/);
  assert.equal(BRAND_SUPPORT, 'support@bookourspace.in');
});
