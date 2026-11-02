import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const modalSource = readFileSync(new URL('./BookingEnquiryModal.tsx', import.meta.url), 'utf8');

test('booking modal keeps one stay date range and one preferred time selector', () => {
  assert.equal(
    modalSource.includes('HOTEL_STAY SPECIFIC CHECK-IN & CHECK-OUT DATE-TIME PICKER'),
    false,
    'the duplicate hotel date-time picker should not be rendered',
  );
  assert.equal(
    modalSource.includes('Choose Preferred Time Slot'),
    true,
    'the preferred check-in slot selector should remain available',
  );
  assert.equal(
    modalSource.includes('requestSubmit()'),
    true,
    'verified payment should advance into the booking submission flow',
  );
});
