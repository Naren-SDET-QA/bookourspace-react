import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CUSTOMER_MODULE_KEYS,
  effectiveModuleKeysForActor,
  evaluateCustomerModule,
  isGrantActive,
  moduleKeyForSection,
  sectionForModuleKey,
  normalizeCustomerModuleKey,
} from '../src/server/customerModuleAccess.ts';

const FLAGS = [
  { module_key: 'pg', is_enabled: true },
  { module_key: 'hotels', is_enabled: true },
  { module_key: 'services', is_enabled: true },
  { module_key: 'movies', is_enabled: true },
  { module_key: 'classes', is_enabled: true },
  { module_key: 'function_hall', is_enabled: true },
  { module_key: 'ecommerce', is_enabled: false },
];

test('module key and section mapping is one-to-one and shared', () => {
  assert.equal(moduleKeyForSection('pg_hostels'), 'pg');
  assert.equal(moduleKeyForSection('hotel_stay'), 'hotels');
  assert.equal(moduleKeyForSection('services'), 'services');
  assert.equal(moduleKeyForSection('movies'), 'movies');
  assert.equal(moduleKeyForSection('classes'), 'classes');
  assert.equal(moduleKeyForSection('venues'), 'function_hall');
  assert.equal(sectionForModuleKey('pg'), 'pg_hostels');
  assert.equal(normalizeCustomerModuleKey('nope'), null);
  assert.equal(normalizeCustomerModuleKey('pg'), 'pg');
});

test('a grant is live only until its expiry', () => {
  const now = '2026-11-12T23:00:00.000Z';
  assert.equal(isGrantActive({ expires_at: null }, now), true);
  assert.equal(isGrantActive({ expires_at: '2026-11-13T00:00:00.000Z' }, now), true);
  assert.equal(isGrantActive({ expires_at: '2026-11-12T22:00:00.000Z' }, now), false);
  assert.equal(isGrantActive({ expires_at: 'not-a-date' }, now), false);
});

test('customers receive only granted, unexpired, enabled modules', () => {
  const modules = effectiveModuleKeysForActor({
    role: 'customer',
    accountStatus: 'active',
    grants: [
      { module_key: 'pg', expires_at: null },
      { module_key: 'movies', expires_at: '2020-01-01T00:00:00.000Z' }, // expired
      { module_key: 'ecommerce', expires_at: null }, // module disabled
    ],
    moduleFlags: FLAGS,
    nowIso: '2026-11-12T23:00:00.000Z',
  });
  assert.deepEqual(modules, ['pg']);
});

test('providers and admins bypass the allow-list but still respect global flags', () => {
  for (const role of ['provider', 'admin']) {
    const modules = effectiveModuleKeysForActor({
      role,
      accountStatus: 'active',
      grants: [],
      moduleFlags: FLAGS,
      nowIso: '2026-11-12T23:00:00.000Z',
    });
    assert.ok(modules.includes('pg'));
    assert.ok(!modules.includes('ecommerce'), `${role} must not see a disabled module`);
  }
});

test('inactive or unknown roles fail closed', () => {
  assert.deepEqual(
    effectiveModuleKeysForActor({ role: 'customer', accountStatus: 'blocked', grants: [{ module_key: 'pg', expires_at: null }], moduleFlags: FLAGS, nowIso: '2026-11-12T23:00:00.000Z' }),
    [],
  );
  assert.deepEqual(
    effectiveModuleKeysForActor({ role: null, accountStatus: null, grants: [], moduleFlags: FLAGS, nowIso: '2026-11-12T23:00:00.000Z' }),
    [],
  );
});

test('the HTTP gate blocks an unauthorized customer module', () => {
  const input = {
    role: 'customer',
    accountStatus: 'active',
    grants: [{ module_key: 'pg', expires_at: null }],
    moduleFlags: FLAGS,
    nowIso: '2026-11-12T23:00:00.000Z',
  };
  assert.deepEqual(evaluateCustomerModule(input, 'pg'), { allowed: true, status: 200, code: 'OK', message: 'Allowed.' });
  assert.equal(evaluateCustomerModule(input, 'movies').allowed, false);
  assert.equal(evaluateCustomerModule(input, 'movies').status, 403);
  assert.equal(evaluateCustomerModule(input, 'movies').code, 'CUSTOMER_MODULE_NOT_AUTHORIZED');
  assert.equal(evaluateCustomerModule(input, 'unknown').status, 400);
});

test('the module key vocabulary matches the global module gate', () => {
  assert.deepEqual([...CUSTOMER_MODULE_KEYS].sort(), ['classes', 'ecommerce', 'function_hall', 'hotels', 'movies', 'pg', 'services'].sort());
});
