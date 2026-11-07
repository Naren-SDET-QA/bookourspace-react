import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_POLICIES,
  PolicyValidationError,
  normalizePolicies,
} from '../src/lib/builder/policies.ts';

test('policy defaults are complete and stable', () => {
  const policies = normalizePolicies({});
  assert.deepEqual(policies, DEFAULT_POLICIES);
  assert.ok(policies.payment.methods.includes('upi'));
  assert.ok(policies.reports.metrics.length >= 1);
});

test('missing groups fall back to defaults without erasing known settings', () => {
  const policies = normalizePolicies({ payment: { refundWindowDays: 14 } });
  assert.equal(policies.payment.refundWindowDays, 14);
  assert.deepEqual(policies.inventory, DEFAULT_POLICIES.inventory);
  assert.deepEqual(policies.roles, DEFAULT_POLICIES.roles);
  assert.deepEqual(policies.reports, DEFAULT_POLICIES.reports);
});

test('unknown policy groups and keys are rejected', () => {
  assert.throws(() => normalizePolicies({ pricing: {} }), (error) => error.code === 'POLICY_INVALID');
  assert.throws(
    () => normalizePolicies({ payment: { capture: 'always' } }),
    (error) => error instanceof PolicyValidationError && error.code === 'POLICY_INVALID',
  );
  assert.throws(
    () => normalizePolicies({ roles: { superuserSections: ['movies'] } }),
    (error) => error.code === 'POLICY_INVALID',
  );
});

test('policy ranges and enums fail closed', () => {
  assert.throws(() => normalizePolicies({ payment: { depositDisplayPercent: 101 } }), (error) => error.code === 'POLICY_INVALID');
  assert.throws(() => normalizePolicies({ payment: { settlementCycle: 'instant' } }), (error) => error.code === 'POLICY_INVALID');
  assert.throws(() => normalizePolicies({ inventory: { holdMinutes: 0 } }), (error) => error.code === 'POLICY_INVALID');
  assert.throws(() => normalizePolicies({ reports: { defaultRange: 'all-time' } }), (error) => error.code === 'POLICY_INVALID');
});

test('method, section and metric lists only accept approved values', () => {
  assert.throws(() => normalizePolicies({ payment: { methods: ['cash'] } }), (error) => error.code === 'POLICY_INVALID');
  assert.throws(() => normalizePolicies({ roles: { customerSections: ['admin_console'] } }), (error) => error.code === 'POLICY_INVALID');
  assert.throws(() => normalizePolicies({ reports: { metrics: ['raw_sql'] } }), (error) => error.code === 'POLICY_INVALID');
  assert.throws(() => normalizePolicies({ payment: { methods: [] } }), (error) => error.code === 'POLICY_INVALID');
});

test('empty lists in role scopes are allowed but duplicate values are collapsed', () => {
  const policies = normalizePolicies({
    roles: { customerSections: [], providerSections: ['provider_portal', 'provider_portal'] },
  });
  assert.deepEqual(policies.roles.customerSections, []);
  assert.deepEqual(policies.roles.providerSections, ['provider_portal']);
});

test('policy numbers are rounded to two decimals and never become NaN', () => {
  const policies = normalizePolicies({ inventory: { overbookingBuffer: 2.345 } });
  assert.equal(policies.inventory.overbookingBuffer, 2.35);
  assert.throws(() => normalizePolicies({ inventory: { overbookingBuffer: Number.NaN } }), (error) => error.code === 'POLICY_INVALID');
});
