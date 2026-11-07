import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildProviderContactMessage } from '../src/lib/servicesStayRules.ts';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('hotel and venue WhatsApp draft states that it is only a request and payment is at the property', () => {
  const message = buildProviderContactMessage({
    listingTitle: 'Green Valley Stay',
    dates: '2026-12-04 to 2026-12-06',
    guests: 2,
    kind: 'availability',
  });

  assert.match(message, /not a confirmed booking/i);
  assert.match(message, /2026-12-04 to 2026-12-06/);
  assert.match(message, /Guests: 2/);
  assert.match(message, /No room or venue is reserved/i);
  assert.match(message, /Payment is due at the property\/venue/i);
  assert.doesNotMatch(message, /paid|payment confirmed/i);
});

test('other service listing messages ask for terms but do not claim a booking', () => {
  const message = buildProviderContactMessage({
    listingTitle: 'Farm equipment repair',
    customerName: 'A Customer',
    customerPhone: '9000000000',
    kind: 'listing',
  });

  assert.match(message, /Listing enquiry/);
  assert.match(message, /This message does not create a booking/);
  assert.match(message, /arranged directly with you/);
  assert.doesNotMatch(message, /booking confirmed successfully|payment received/i);
});

test('non-movie modal routes to verified owner contact before the atomic booking code', () => {
  const source = read('src/components/BookingEnquiryModal.tsx');
  const submit = source.indexOf('const handleSubmit = async');
  const requestBranch = source.indexOf('if (!isMovie) {', submit);
  const paymentPath = source.indexOf("if (paymentMode === 'pay_qr'", requestBranch);
  assert.ok(submit >= 0 && requestBranch > submit && paymentPath > requestBranch);
  const requestCode = source.slice(requestBranch, paymentPath);

  assert.match(requestCode, /ownerContact\.contact\('whatsapp', message\)/);
  assert.doesNotMatch(requestCode, /createAuthoritativeBookingAtomic|createBooking\(/);
  assert.match(source, /No room or venue is reserved/);
  assert.match(source, /Open WhatsApp to request availability/);
});

test('hotel WhatsApp contact includes the selected dates and guest count', () => {
  const source = read('src/components/HotelsStayExperience.tsx');
  assert.match(source, /dates: checkIn && checkOut \? `\$\{checkIn\} to \$\{checkOut\}`/);
  assert.match(source, /guests,/);
  assert.match(source, /Request availability/);
  assert.match(source, /does not reserve a room or confirm a booking/);
});
