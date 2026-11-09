import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAdminAuthorization } from '../src/server/adminAuthorization.ts';

test('only a signed admin identity is accepted by admin guards', () => {
  assert.equal(hasAdminAuthorization({ userId: 'admin-1', role: 'admin' }), true);
  assert.equal(hasAdminAuthorization({ userId: 'admin-1', role: 'admin' }, 'customer'), false);
  assert.equal(hasAdminAuthorization({ userId: 'admin-1', role: 'admin' }, 'suspended'), false);
  assert.equal(hasAdminAuthorization({ userId: 'admin-1', role: 'admin' }, 'admin'), true);
  assert.equal(hasAdminAuthorization({ userId: 'customer-1', role: 'customer' }), false);
  assert.equal(hasAdminAuthorization({ userId: 'provider-1', role: 'provider' }), false);
  assert.equal(hasAdminAuthorization({ userId: '', role: 'admin' }), false);
  assert.equal(hasAdminAuthorization(null), false);
  assert.equal(hasAdminAuthorization(undefined), false);
});
