import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeGuestName,
  normalizeGuestEmail,
  normalizeIndianMobile,
  validateGuestDetails,
} from '../src/lib/stayGuestValidation.ts';

test('guest name normalization trims and collapses whitespace', () => {
  assert.equal(normalizeGuestName('  Test   Guest  '), 'Test Guest');
  assert.equal(normalizeGuestName('अनन्या शर्मा'), 'अनन्या शर्मा');
});

test('Indian mobile normalization accepts +91, 91 prefix and leading zero', () => {
  assert.equal(normalizeIndianMobile('9876543210'), '+919876543210');
  assert.equal(normalizeIndianMobile('+91 98765 43210'), '+919876543210');
  assert.equal(normalizeIndianMobile('919876543210'), '+919876543210');
  assert.equal(normalizeIndianMobile('09876543210'), '+919876543210');
  assert.equal(normalizeIndianMobile('12345'), '');
});

test('guest email normalization trims and validates required email', () => {
  assert.equal(normalizeGuestEmail('  Guest@Example.com '), 'guest@example.com');
  assert.equal(validateGuestDetails('Test Guest', '', '9876543210').ok, false);
  assert.equal(validateGuestDetails('Test Guest', 'invalid-email', '9876543210').ok, false);
});

test('valid name and mobile pass', () => {
  const result = validateGuestDetails('Test Guest', 'guest@example.com', '9876543210');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.name, 'Test Guest');
    assert.equal(result.email, 'guest@example.com');
    assert.equal(result.phone, '+919876543210');
  }
});

test('missing or numeric names are rejected', () => {
  assert.equal(validateGuestDetails('', 'guest@example.com', '9876543210').ok, false);
  assert.equal(validateGuestDetails('Guest 123', 'guest@example.com', '9876543210').ok, false);
  assert.equal(validateGuestDetails('A', 'guest@example.com', '9876543210').ok, false);
});

test('invalid mobile numbers are rejected', () => {
  assert.equal(validateGuestDetails('Test Guest', 'guest@example.com', '').ok, false);
  assert.equal(validateGuestDetails('Test Guest', 'guest@example.com', '12345').ok, false);
  assert.equal(validateGuestDetails('Test Guest', 'guest@example.com', '1234567890').ok, false);
  assert.equal(validateGuestDetails('Test Guest', 'guest@example.com', '5876543210').ok, false);
});
