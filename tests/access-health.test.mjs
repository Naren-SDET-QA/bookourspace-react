import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRepairPlan,
  checkPermissionHealth,
  validateRepairOperation,
} from '../src/permissions/health.ts';

const NOW = '2026-11-19T10:00:00.000Z';

function snapshot(overrides = {}) {
  return {
    nowIso: NOW,
    profiles: [],
    customerGrants: [],
    memberships: [],
    flags: [
      { moduleKey: 'pg', isEnabled: true },
      { moduleKey: 'hotels', isEnabled: true },
      { moduleKey: 'services', isEnabled: true },
      { moduleKey: 'movies', isEnabled: true },
      { moduleKey: 'classes', isEnabled: true },
      { moduleKey: 'function_hall', isEnabled: true },
      { moduleKey: 'ecommerce', isEnabled: false },
    ],
    ...overrides,
  };
}

test('a healthy snapshot produces no findings and no operations', () => {
  const report = checkPermissionHealth(
    snapshot({
      profiles: [{ id: 'c1', email: 'c@example.com', role: 'customer', accountStatus: 'active', isSuperAdmin: false }],
      customerGrants: [
        { userId: 'c1', moduleKey: 'pg', sections: [], actions: ['view'], expiresAt: null },
      ],
    }),
  );
  assert.equal(report.healthy, true);
  assert.deepEqual(report.findings, []);
  const plan = buildRepairPlan(report);
  assert.deepEqual(plan.operations, []);
  assert.equal(plan.requiresApproval, false);
});

test('missing customer permissions are repaired with VIEW-only defaults', () => {
  const report = checkPermissionHealth(
    snapshot({
      profiles: [{ id: 'c1', email: 'c@example.com', role: 'customer', accountStatus: 'active', isSuperAdmin: false }],
    }),
  );
  const finding = report.findings.find((entry) => entry.code === 'MISSING_CUSTOMER_PERMISSIONS');
  assert.ok(finding);
  assert.equal(finding.approvalRequired, false);

  const plan = buildRepairPlan(report);
  const operation = plan.operations.find((entry) => entry.kind === 'insert_view_only_customer_grants');
  assert.ok(operation);
  // Every enabled active category, never the disabled ecommerce one.
  assert.deepEqual(
    [...operation.categories].sort(),
    ['classes', 'function_hall', 'hotels', 'movies', 'pg', 'services'],
  );
  assert.equal(plan.includesElevation, false);
});

test('missing member permissions are repaired only for non-owner members', () => {
  const report = checkPermissionHealth(
    snapshot({
      profiles: [
        { id: 'm1', email: 'm@example.com', role: 'provider', accountStatus: 'active', isSuperAdmin: false },
        { id: 'o1', email: 'o@example.com', role: 'provider', accountStatus: 'active', isSuperAdmin: false },
      ],
      memberships: [
        { businessId: 'b1', userId: 'm1', memberRole: 'staff', memberStatus: 'active', moduleType: 'services', hasGrantRow: false, allowedModules: null, sections: {}, actions: {} },
        { businessId: 'b1', userId: 'o1', memberRole: 'owner', memberStatus: 'active', moduleType: 'services', hasGrantRow: false, allowedModules: null, sections: {}, actions: {} },
      ],
    }),
  );
  const findings = report.findings.filter((entry) => entry.code === 'MISSING_MEMBER_PERMISSIONS');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].userId, 'm1');
  assert.equal(findings[0].repair.kind, 'insert_view_only_member_grant');
});

test('invalid action keys require approval and never widen the grant', () => {
  const report = checkPermissionHealth(
    snapshot({
      profiles: [{ id: 'c1', email: 'c@example.com', role: 'customer', accountStatus: 'active', isSuperAdmin: false }],
      customerGrants: [
        { userId: 'c1', moduleKey: 'pg', sections: [], actions: ['view', 'root'], expiresAt: null },
      ],
    }),
  );
  const finding = report.findings.find((entry) => entry.code === 'INVALID_ACTION_KEY');
  assert.ok(finding);
  assert.equal(finding.approvalRequired, true);
  assert.deepEqual(finding.repair.actions, ['view']);

  const safePlan = buildRepairPlan(report);
  assert.equal(safePlan.operations.some((entry) => entry.kind === 'strip_invalid_customer_actions'), false);
  assert.equal(safePlan.heldOperations.some((entry) => entry.kind === 'strip_invalid_customer_actions'), true);
  assert.equal(safePlan.requiresApproval, true);

  const approved = buildRepairPlan(report, { approveDestructive: true });
  assert.equal(approved.operations.some((entry) => entry.kind === 'strip_invalid_customer_actions'), true);
  assert.equal(approved.includesElevation, false);
});

test('unknown categories and orphans are reported as approval-required deletions', () => {
  const report = checkPermissionHealth(
    snapshot({
      profiles: [
        { id: 'c1', email: 'c@example.com', role: 'customer', accountStatus: 'active', isSuperAdmin: false },
        { id: 'a1', email: 'a@example.com', role: 'admin', accountStatus: 'active', isSuperAdmin: true },
      ],
      customerGrants: [
        { userId: 'c1', moduleKey: 'teleport', sections: [], actions: ['view'], expiresAt: null },
        { userId: 'c1', moduleKey: 'pg', sections: [], actions: ['view'], expiresAt: null },
        { userId: 'a1', moduleKey: 'pg', sections: [], actions: ['view'], expiresAt: null },
      ],
    }),
  );
  const unknown = report.findings.find((entry) => entry.code === 'UNKNOWN_CATEGORY_REFERENCE');
  assert.ok(unknown);
  assert.equal(unknown.repair.kind, 'delete_customer_grant');
  assert.equal(unknown.repair.moduleKey, 'teleport');

  const orphan = report.findings.find((entry) => entry.code === 'ORPHANED_ASSIGNMENT');
  assert.ok(orphan);
  assert.equal(orphan.userId, 'a1');

  const safePlan = buildRepairPlan(report);
  assert.equal(safePlan.operations.length, 0);
  assert.equal(safePlan.heldOperations.length, 2);
});

test('expired grants are safe to remove and suspended accounts are flagged', () => {
  const report = checkPermissionHealth(
    snapshot({
      profiles: [
        { id: 'c1', email: 'c@example.com', role: 'customer', accountStatus: 'active', isSuperAdmin: false },
        { id: 'c2', email: 's@example.com', role: 'customer', accountStatus: 'suspended', isSuperAdmin: false },
      ],
      customerGrants: [
        { userId: 'c1', moduleKey: 'pg', sections: [], actions: ['view'], expiresAt: '2026-01-01T00:00:00.000Z' },
        { userId: 'c2', moduleKey: 'pg', sections: [], actions: ['view'], expiresAt: null },
      ],
    }),
  );
  assert.ok(report.findings.some((entry) => entry.code === 'EXPIRED_PERMISSION_GRANT'));
  assert.ok(report.findings.some((entry) => entry.code === 'SUSPENDED_ACCOUNT_WITH_GRANTS'));
  const plan = buildRepairPlan(report);
  assert.ok(plan.operations.some((entry) => entry.kind === 'delete_expired_customer_grant'));
});

test('invalid roles are reported without an automatic repair', () => {
  const report = checkPermissionHealth(
    snapshot({
      profiles: [{ id: 'x1', email: 'x@example.com', role: 'ghost', accountStatus: 'active', isSuperAdmin: false }],
    }),
  );
  const finding = report.findings.find((entry) => entry.code === 'INVALID_ROLE');
  assert.ok(finding);
  assert.equal(finding.repair, null);
  assert.equal(finding.severity, 'critical');
});

test('invalid member modules and member actions are detected', () => {
  const report = checkPermissionHealth(
    snapshot({
      profiles: [{ id: 'm1', email: 'm@example.com', role: 'provider', accountStatus: 'active', isSuperAdmin: false }],
      memberships: [
        {
          businessId: 'b1',
          userId: 'm1',
          memberRole: 'manager',
          memberStatus: 'active',
          moduleType: 'services',
          hasGrantRow: true,
          allowedModules: ['services', 'wormhole'],
          sections: {},
          actions: { services: ['view', 'teleport'] },
        },
      ],
    }),
  );
  assert.ok(report.findings.some((entry) => entry.code === 'INVALID_MEMBER_MODULE'));
  assert.ok(report.findings.some((entry) => entry.code === 'INVALID_ACTION_KEY'));
});

test('repair operations are validated and cannot smuggle an elevation', () => {
  assert.deepEqual(
    validateRepairOperation({ kind: 'insert_view_only_customer_grants', userId: 'u1', categories: ['pg', 'hotels'] }),
    { ok: true },
  );
  assert.equal(
    validateRepairOperation({ kind: 'insert_view_only_customer_grants', userId: 'u1', categories: ['nope'] }).ok,
    false,
  );
  assert.equal(
    validateRepairOperation({ kind: 'insert_view_only_member_grant', businessId: 'b', userId: 'u', moduleKey: 'wormhole' }).ok,
    false,
  );
  assert.equal(
    validateRepairOperation({
      kind: 'strip_invalid_customer_actions',
      userId: 'u',
      moduleKey: 'pg',
      actions: ['view', 'root'],
    }).ok,
    false,
  );
});
