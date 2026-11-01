/**
 * Tests for server-side module gating and stay availability.
 *
 * These run with no database and no network, so they can be executed on every
 * commit. They assert the rules that protect revenue and inventory:
 *
 *   - a module that is missing, unknown, disabled, or malformed is DENIED
 *   - a client cannot enable a module by sending extra/truthy fields
 *   - movie checkout stays closed until a human records approval
 *   - half-open date ranges let the checkout day be resold
 *   - expired holds never block, live holds always do
 *   - prices are integer paise and never derived from client totals
 *
 * Run: npx tsx tests/module-gate-and-inventory.test.mjs
 */

import assert from 'node:assert/strict';

import {
  resolveModuleAccess,
  evaluateCapability,
  validateStayRange,
  rangesOverlap,
  countAvailableUnits,
  isAllocationBlocking,
  nightsBetween,
  quoteStay,
  MODULE_KEYS,
} from '../src/server/moduleGate.ts';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

const NOW = '2026-11-01T09:00:00.000Z';
const TODAY = '2026-11-01';

function flag(overrides = {}) {
  return {
    module_key: 'services',
    is_enabled: true,
    allow_contact_owner: true,
    allow_online_booking: true,
    requires_owner_approval: true,
    booking_approved_at: null,
    ...overrides,
  };
}

console.log('\nModule gating and stay inventory\n');

/* ------------------------- module resolution ------------------------- */

test('unknown module is disabled', () => {
  const access = resolveModuleAccess([flag()], 'teleportation');
  assert.equal(access.enabled, false);
  assert.equal(access.onlineBooking, false);
});

test('missing flag rows deny everything (fail closed)', () => {
  assert.equal(resolveModuleAccess(null, 'hotels').enabled, false);
  assert.equal(resolveModuleAccess([], 'hotels').enabled, false);
  assert.equal(resolveModuleAccess(undefined, 'hotels').onlineBooking, false);
});

test('disabled module denies booking even with booking flags set', () => {
  const access = resolveModuleAccess([flag({ is_enabled: false })], 'hotels');
  assert.equal(access.enabled, false);
  assert.equal(access.onlineBooking, false);
});

test('string "true" is not accepted as a boolean flag', () => {
  const access = resolveModuleAccess(
    [flag({ module_key: 'hotels', is_enabled: 'true', allow_online_booking: 'true' })],
    'hotels'
  );
  assert.equal(access.enabled, false);
  assert.equal(access.onlineBooking, false);
});

test('services default row allows booking', () => {
  const access = resolveModuleAccess([flag()], 'services');
  assert.equal(access.enabled, true);
  assert.equal(access.contactOwner, true);
  assert.equal(access.onlineBooking, true);
});

test('classes row permits contact but not paid enrolment', () => {
  const access = resolveModuleAccess(
    [flag({ module_key: 'classes', allow_online_booking: false, requires_owner_approval: false })],
    'classes'
  );
  assert.equal(access.contactOwner, true);
  assert.equal(access.onlineBooking, false);
  assert.equal(evaluateCapability(access, 'online_booking').code, 'ONLINE_BOOKING_DISABLED');
});

test('movies: discovery allowed, checkout blocked without approval', () => {
  const access = resolveModuleAccess(
    [flag({ module_key: 'movies', allow_online_booking: true, booking_approved_at: null })],
    'movies'
  );
  assert.equal(access.enabled, true);
  assert.equal(access.contactOwner, true);
  assert.equal(access.onlineBooking, false);
  assert.equal(access.reason, 'MOVIE_BOOKING_NOT_APPROVED');
  const gate = evaluateCapability(access, 'online_booking');
  assert.equal(gate.allowed, false);
  assert.equal(gate.status, 403);
});

test('movies: checkout allowed once approval timestamp exists', () => {
  const access = resolveModuleAccess(
    [
      flag({
        module_key: 'movies',
        allow_online_booking: true,
        booking_approved_at: '2026-10-01T00:00:00.000Z',
      }),
    ],
    'movies'
  );
  assert.equal(access.onlineBooking, true);
  assert.equal(evaluateCapability(access, 'online_booking').allowed, true);
});

test('movie checkout stays blocked while admin leaves the flag off', () => {
  const access = resolveModuleAccess(
    [
      flag({
        module_key: 'movies',
        allow_online_booking: false,
        booking_approved_at: '2026-10-01T00:00:00.000Z',
      }),
    ],
    'movies'
  );
  assert.equal(access.onlineBooking, false);
});

test('view capability denied for a disabled module with 404', () => {
  const access = resolveModuleAccess([flag({ module_key: 'ecommerce', is_enabled: false })], 'ecommerce');
  const gate = evaluateCapability(access, 'view');
  assert.equal(gate.allowed, false);
  assert.equal(gate.status, 404);
  assert.equal(gate.code, 'MODULE_DISABLED');
});

test('contact_owner capability respects the per-module switch', () => {
  const access = resolveModuleAccess([flag({ allow_contact_owner: false })], 'services');
  const gate = evaluateCapability(access, 'contact_owner');
  assert.equal(gate.allowed, false);
  assert.equal(gate.status, 403);
  assert.equal(gate.code, 'CONTACT_OWNER_DISABLED');
});

test('every declared module key resolves without throwing', () => {
  for (const key of MODULE_KEYS) {
    const access = resolveModuleAccess([flag({ module_key: key })], key);
    assert.equal(typeof access.enabled, 'boolean');
  }
});

/* ------------------------- date ranges ------------------------- */

test('check-out must be after check-in', () => {
  assert.equal(validateStayRange('2026-11-10', '2026-11-10', NOW).code, 'INVALID_STAY_RANGE');
  assert.equal(validateStayRange('2026-11-12', '2026-11-10', NOW).code, 'INVALID_STAY_RANGE');
});

test('past check-in is rejected', () => {
  assert.equal(validateStayRange('2026-10-01', '2026-10-03', NOW).code, 'CHECK_IN_IN_PAST');
});

test('valid range reports nights', () => {
  const r = validateStayRange('2026-11-10', '2026-11-13', NOW);
  assert.equal(r.ok, true);
  assert.equal(r.nights, 3);
  assert.equal(nightsBetween('2026-11-10', '2026-11-13'), 3);
});

test('malformed dates are rejected, not coerced', () => {
  assert.equal(validateStayRange('10/11/2026', '2026-11-13', NOW).code, 'INVALID_DATE_FORMAT');
});

test('half-open overlap: checkout day is reusable', () => {
  // A stays 10th-12th (leaves on the 12th); B arrives on the 12th.
  assert.equal(rangesOverlap('2026-11-10', '2026-11-12', '2026-11-12', '2026-11-14'), false);
  // Same-day turnover is legal in both directions.
  assert.equal(rangesOverlap('2026-11-12', '2026-11-14', '2026-11-10', '2026-11-12'), false);
});

test('overlap detected when nights genuinely collide', () => {
  assert.equal(rangesOverlap('2026-11-10', '2026-11-12', '2026-11-11', '2026-11-13'), true);
  // Fully contained.
  assert.equal(rangesOverlap('2026-11-10', '2026-11-20', '2026-11-12', '2026-11-13'), true);
});

/* ------------------------- availability ------------------------- */

const UNITS = ['u1', 'u2', 'u3'];

test('all units free when nothing is allocated', () => {
  assert.equal(countAvailableUnits(UNITS, [], '2026-11-10', '2026-11-12', NOW), 3);
});

test('confirmed stay removes exactly one unit', () => {
  const allocations = [
    { unit_id: 'u1', status: 'confirmed', stay_from: '2026-11-10', stay_to: '2026-11-12' },
  ];
  assert.equal(countAvailableUnits(UNITS, allocations, '2026-11-10', '2026-11-12', NOW), 2);
});

test('confirmed stay on non-overlapping dates blocks nothing', () => {
  const allocations = [
    { unit_id: 'u1', status: 'confirmed', stay_from: '2026-12-01', stay_to: '2026-12-05' },
  ];
  assert.equal(countAvailableUnits(UNITS, allocations, '2026-11-10', '2026-11-12', NOW), 3);
});

test('live hold blocks, expired hold does not', () => {
  const live = [
    {
      unit_id: 'u1',
      status: 'held',
      stay_from: '2026-11-10',
      stay_to: '2026-11-12',
      expires_at: '2026-11-01T09:10:00.000Z',
    },
  ];
  assert.equal(isAllocationBlocking(live[0], NOW), true);
  assert.equal(countAvailableUnits(UNITS, live, '2026-11-10', '2026-11-12', NOW), 2);

  const stale = [{ ...live[0], expires_at: '2026-11-01T08:59:00.000Z' }];
  assert.equal(isAllocationBlocking(stale[0], NOW), false);
  assert.equal(countAvailableUnits(UNITS, stale, '2026-11-10', '2026-11-12', NOW), 3);
});

test('released and expired rows never block', () => {
  const rows = [
    { unit_id: 'u1', status: 'released', stay_from: '2026-11-10', stay_to: '2026-11-12' },
    { unit_id: 'u2', status: 'expired', stay_from: '2026-11-10', stay_to: '2026-11-12' },
  ];
  assert.equal(countAvailableUnits(UNITS, rows, '2026-11-10', '2026-11-12', NOW), 3);
});

test('hold without expiry is not treated as blocking', () => {
  const row = { unit_id: 'u1', status: 'held', stay_from: '2026-11-10', stay_to: '2026-11-12' };
  assert.equal(isAllocationBlocking(row, NOW), false);
});

test('two units blocked leaves one sellable', () => {
  const rows = [
    { unit_id: 'u1', status: 'confirmed', stay_from: '2026-11-10', stay_to: '2026-11-12' },
    {
      unit_id: 'u2',
      status: 'held',
      stay_from: '2026-11-11',
      stay_to: '2026-11-13',
      expires_at: '2026-11-01T09:05:00.000Z',
    },
  ];
  assert.equal(countAvailableUnits(UNITS, rows, '2026-11-10', '2026-11-12', NOW), 1);
});

/* ------------------------- pricing ------------------------- */

test('quote multiplies nights and applies tax in paise', () => {
  const q = quoteStay(450000, 2, 12);
  assert.equal(q.subtotalPaise, 900000);
  assert.equal(q.taxPaise, 108000);
  assert.equal(q.totalPaise, 1008000);
});

test('quote rejects non-integer or negative money', () => {
  assert.throws(() => quoteStay(-1, 2, 12), /INVALID_PRICE/);
  assert.throws(() => quoteStay(1000.5, 2, 12), /INVALID_PRICE/);
  assert.throws(() => quoteStay(1000, 0, 12), /INVALID_NIGHTS/);
});

test('zero-rated tax still returns a coherent total', () => {
  const q = quoteStay(100000, 1, 0);
  assert.equal(q.taxPaise, 0);
  assert.equal(q.totalPaise, 100000);
});

/* ------------------------- summary ------------------------- */

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passed` +
    (failed.length ? `, ${failed.length} FAILED\n` : '\n')
);
process.exitCode = failed.length ? 1 : 0;
