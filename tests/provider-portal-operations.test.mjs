import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedDispatchTransition, isLocationStale, normalizeOtpCode, validateLocationInput } from '../src/server/serviceDispatchSecurity.ts';
import { buildServiceStartOtpEmail } from '../src/server/resendTransactionalEmails.ts';

test('GPS writes require explicit permission and valid coordinates', () => {
  assert.throws(() => validateLocationInput({ consentGranted: false, latitude: 19, longitude: 73 }), /LOCATION_CONSENT_REQUIRED/);
  assert.throws(() => validateLocationInput({ consentGranted: true, latitude: 91, longitude: 73 }), /INVALID_LOCATION/);
  assert.deepEqual(validateLocationInput({ consentGranted: true, latitude: 19.076, longitude: 72.877, accuracyM: 12 }), { latitude: 19.076, longitude: 72.877, accuracyM: 12 });
});

test('GPS location becomes unavailable when stale, stopped, future-dated or missing', () => {
  const now = Date.parse('2026-11-12T10:00:00.000Z');
  assert.equal(isLocationStale('2026-11-12T09:55:00.000Z', now), false);
  assert.equal(isLocationStale('2026-11-12T09:40:00.000Z', now), true);
  assert.equal(isLocationStale('2026-11-12T09:55:00.000Z', now, undefined, '2026-11-12T09:59:00.000Z'), true);
  assert.equal(isLocationStale(null, now), true);
});

test('dispatch lifecycle permits only forward transitions and OTP input is six digits', () => {
  assert.equal(isAllowedDispatchTransition('requested', 'accepted'), true);
  assert.equal(isAllowedDispatchTransition('accepted', 'assigned'), true);
  assert.equal(isAllowedDispatchTransition('completed', 'started'), false);
  assert.equal(normalizeOtpCode(' 123456 '), '123456');
  assert.throws(() => normalizeOtpCode('12345'), /OTP_CODE_MUST_BE_SIX_DIGITS/);
});

test('service OTP email is an explicit Resend backup and never claims SMS delivery', () => {
  const email = buildServiceStartOtpEmail({ recipient: 'guest@example.com', code: '123456', bookingId: 'booking-1' });
  assert.match(email.text, /not sent by SMS/i);
  assert.equal(email.explicitAuthorization, true);
  assert.match(email.idempotencyKey, /service-start-otp:booking-1:123456/);
});
