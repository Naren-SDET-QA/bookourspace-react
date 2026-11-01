import assert from 'node:assert/strict';

import {
  canBookStayOnline,
  canContactOwner,
  getDiscoverySection,
  resolveServicesModuleAccess,
  resolveStayScreenState,
  validateStaySearch,
} from '../src/lib/servicesStayRules.ts';

const baseFlag = {
  module_key: 'hotels',
  is_enabled: true,
  allow_contact_owner: true,
  allow_online_booking: true,
  requires_owner_approval: false,
  booking_approved_at: null,
};

function test(name, callback) {
  try {
    callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

console.log('\nServices discovery and stay rules\n');

test('discovery navigation maps active modules to their existing sections', () => {
  assert.equal(getDiscoverySection('hotels'), 'hotel_stay');
  assert.equal(getDiscoverySection('pg'), 'pg_hostels');
  assert.equal(getDiscoverySection('function_hall'), 'venues');
  assert.equal(getDiscoverySection('classes'), 'classes');
  assert.equal(getDiscoverySection('movies'), 'movies');
  assert.equal(getDiscoverySection('services'), 'services');
  assert.equal(getDiscoverySection('ecommerce'), null);
});

test('module visibility fails closed when flags are missing or disabled', () => {
  assert.equal(resolveServicesModuleAccess(null, 'hotels').enabled, false);
  assert.equal(resolveServicesModuleAccess([{ ...baseFlag, is_enabled: false }], 'hotels').enabled, false);
  assert.equal(resolveServicesModuleAccess([baseFlag], 'hotels').enabled, true);
});

test('owner contact requires enabled contact permission, sign-in and verified channel details', () => {
  const access = resolveServicesModuleAccess([baseFlag], 'hotels');
  const details = { available: true, phone: '+911234567890', whatsapp: null };
  assert.equal(canContactOwner(access, details, true, 'call'), true);
  assert.equal(canContactOwner(access, details, true, 'whatsapp'), false);
  assert.equal(canContactOwner(access, details, false, 'call'), false);
  assert.equal(canContactOwner(access, { ...details, available: false }, true, 'call'), false);
  assert.equal(canContactOwner({ ...access, contactOwner: false }, details, true, 'call'), false);
});

test('stay search rejects missing fields, past dates, invalid calendar dates and reversed ranges', () => {
  const today = '2026-11-01';
  assert.equal(validateStaySearch('', '2026-11-02', '2026-11-03', 2, today).ok, false);
  assert.equal(validateStaySearch('Pune', '', '2026-11-03', 2, today).ok, false);
  assert.equal(validateStaySearch('Pune', '2026-10-31', '2026-11-03', 2, today).ok, false);
  assert.equal(validateStaySearch('Pune', '2026-02-30', '2026-03-02', 2, today).ok, false);
  assert.equal(validateStaySearch('Pune', '2026-11-03', '2026-11-03', 2, today).ok, false);
});

test('stay search accepts a valid future range and bounded guest count', () => {
  assert.deepEqual(validateStaySearch('Pune', '2026-11-02', '2026-11-04', 2, '2026-11-01'), { ok: true });
  assert.equal(validateStaySearch('Pune', '2026-11-02', '2026-11-04', 17, '2026-11-01').ok, false);
});

test('listing screen states cover loading, error, empty and results', () => {
  assert.equal(resolveStayScreenState(true, false, 0), 'loading');
  assert.equal(resolveStayScreenState(false, true, 2), 'error');
  assert.equal(resolveStayScreenState(false, false, 0), 'empty');
  assert.equal(resolveStayScreenState(false, false, 1), 'results');
});

test('online booking stays disabled until the complete backend workflow exists', () => {
  const access = resolveServicesModuleAccess([baseFlag], 'hotels');
  assert.equal(canBookStayOnline(access, true, false), false);
  assert.equal(canBookStayOnline(access, false, true), false);
  assert.equal(canBookStayOnline(access, true, true), true);
});
