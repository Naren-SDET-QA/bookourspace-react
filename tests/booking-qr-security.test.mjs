import assert from 'node:assert/strict';
import { test } from 'node:test';
import { issueBookingQr, verifyBookingQr } from '../src/server/bookingQr.ts';

const ENV = { BOS_BOOKING_QR_SECRET: 'isolated-qr-secret-for-tests' };

test('booking QR is opaque, signed, and contains no customer data', () => {
  const issued = issueBookingQr('booking-opaque-1', '2099-01-31', ENV);
  assert.match(issued.token, /^bos1\.[^.]+\.[^.]+$/);
  assert.ok(!issued.token.includes('customer'));
  assert.ok(!issued.token.includes('guest@example'));
  assert.deepEqual(verifyBookingQr(issued.token, ENV)?.b, 'booking-opaque-1');
});

test('booking QR expiry and tamper checks fail closed', () => {
  const expired = issueBookingQr('booking-expired-1', '2000-01-01', ENV);
  assert.equal(verifyBookingQr(expired.token, ENV), null);

  const issued = issueBookingQr('booking-tamper-1', '2099-01-31', ENV);
  const parts = issued.token.split('.');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  const tamperedPayload = Buffer.from(payload.replace('booking-tamper-1', 'booking-other-1')).toString('base64url');
  assert.equal(verifyBookingQr(`bos1.${tamperedPayload}.${parts[2]}`, ENV), null);
  assert.equal(verifyBookingQr(`${issued.token.slice(0, -1)}x`, ENV), null);
});

test('QR verifier requires the configured server secret', () => {
  const issued = issueBookingQr('booking-secret-1', '2099-01-31', ENV);
  assert.equal(verifyBookingQr(issued.token, { BOS_BOOKING_QR_SECRET: 'wrong-secret-for-tests' }), null);
});
