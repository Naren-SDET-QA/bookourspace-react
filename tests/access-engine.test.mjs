import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCESS_CATEGORIES,
  ACCESS_ACTIONS,
  COMPLETE_ACCESS_ACTIONS,
  DEFAULT_SIGNUP_ACTIONS,
  activeAccessCategories,
  canonicalCategoryKey,
  categoryForProviderModule,
  getAccessCategory,
  sanitizeActions,
} from '../src/permissions/catalog.ts';
import {
  authorize,
  defaultSignupGrantRows,
  mayModifyPermissionsFor,
  canManageAccess,
} from '../src/permissions/engine.ts';
import { MODULE_REGISTRY } from '../src/modules/registry.ts';

const NOW = '2026-11-19T10:00:00.000Z';

function customer(grants, overrides = {}) {
  return {
    userId: '11111111-1111-4111-8111-111111111111',
    role: 'customer',
    accountStatus: 'active',
    customerGrants: grants,
    ...overrides,
  };
}

function provider(businesses, overrides = {}) {
  return {
    userId: '22222222-2222-4222-8222-222222222222',
    role: 'provider',
    accountStatus: 'active',
    businesses,
    ...overrides,
  };
}

function business(overrides = {}) {
  return {
    businessId: '33333333-3333-4333-8333-333333333333',
    moduleType: 'hotel_stay',
    approvalStatus: 'approved',
    isEnabled: true,
    moduleEnabled: true,
    moduleApprovalStatus: 'approved',
    memberRole: 'owner',
    ...overrides,
  };
}

test('the catalog covers every module in the shared registry', () => {
  const categoryKeys = new Set(ACCESS_CATEGORIES.map((category) => category.key));
  for (const module of MODULE_REGISTRY) {
    const category = ACCESS_CATEGORIES.find((entry) => entry.moduleId === module.id);
    assert.ok(category, `registry module ${module.id} must have an access category`);
    assert.ok(categoryKeys.has(category.key));
  }
  // A future module added to the registry without a customer vocabulary fails
  // here rather than silently bypassing the engine.
  assert.equal(new Set(ACCESS_CATEGORIES.map((category) => category.key)).size, ACCESS_CATEGORIES.length);
});

test('category aliases resolve every discovered marketplace category', () => {
  const expected = {
    hotels: 'hotels',
    hotel_stay: 'hotels',
    stays: 'hotels',
    pg: 'pg',
    pg_hostels: 'pg',
    hostels: 'pg',
    venues: 'function_hall',
    function_halls: 'function_hall',
    classes: 'classes',
    courses: 'classes',
    services: 'services',
    local_services: 'services',
    home_services: 'services',
    water_delivery: 'services',
    'srv-water-delivery': 'services',
    'srv-laundry': 'services',
    movies: 'movies',
    ecommerce: 'ecommerce',
  };
  for (const [alias, canonical] of Object.entries(expected)) {
    assert.equal(canonicalCategoryKey(alias), canonical, `${alias} must resolve to ${canonical}`);
  }
  assert.equal(canonicalCategoryKey('not-a-category'), null);
  assert.equal(canonicalCategoryKey(''), null);
  assert.equal(canonicalCategoryKey(null), null);
});

test('provider modules map back to exactly one category', () => {
  assert.equal(categoryForProviderModule('hotel_stay')?.key, 'hotels');
  assert.equal(categoryForProviderModule('pg_hostels')?.key, 'pg');
  assert.equal(categoryForProviderModule('venues')?.key, 'function_hall');
  assert.equal(categoryForProviderModule('classes')?.key, 'classes');
  assert.equal(categoryForProviderModule('services')?.key, 'services');
  assert.equal(categoryForProviderModule('movies')?.key, 'movies');
  assert.equal(categoryForProviderModule('ecommerce'), null);
});

test('action sanitising refuses unknown keys instead of dropping them', () => {
  assert.deepEqual(sanitizeActions(['view', 'create', 'view']), { ok: true, actions: ['view', 'create'] });
  assert.deepEqual(sanitizeActions([]), { ok: true, actions: [] });
  assert.deepEqual(sanitizeActions(null), { ok: true, actions: [] });
  assert.deepEqual(sanitizeActions(['view', 'superuser']), { ok: false, error: 'INVALID_ACTIONS' });
  assert.deepEqual(sanitizeActions('view'), { ok: false, error: 'INVALID_ACTIONS' });
});

test('signup defaults are VIEW only on every active category', () => {
  assert.deepEqual(DEFAULT_SIGNUP_ACTIONS, ['view']);
  const rows = defaultSignupGrantRows();
  const activeKeys = activeAccessCategories().map((category) => category.key).sort();
  assert.deepEqual(rows.map((row) => row.module_key).sort(), activeKeys);
  for (const row of rows) {
    assert.deepEqual(row.allowed_actions, ['view']);
    assert.deepEqual(row.allowed_sections, []);
  }
  // Complete access is an explicit admin action, never a signup default.
  assert.equal(COMPLETE_ACCESS_ACTIONS.length, ACCESS_ACTIONS.length);
  assert.ok(!DEFAULT_SIGNUP_ACTIONS.includes('create'));
});

test('authorize denies anonymous, inactive, unknown and malformed requests', () => {
  assert.equal(authorize(null, 'pg', 'view').status, 401);
  assert.equal(authorize({}, 'pg', 'view').status, 401);
  assert.equal(
    authorize(customer([], { accountStatus: 'suspended' }), 'pg', 'view', null, NOW).error,
    'ACCOUNT_NOT_ACTIVE',
  );
  assert.equal(authorize(customer([]), 'spaceships', 'view', null, NOW).error, 'UNKNOWN_CATEGORY');
  assert.equal(authorize(customer([]), 'pg', 'launch', null, NOW).error, 'INVALID_ACTION');
  assert.equal(authorize({ userId: 'x', role: 'robot' }, 'pg', 'view').error, 'ROLE_NOT_RECOGNIZED');
});

test('a customer with no grants is unverified and denied, not unrestricted', () => {
  const decision = authorize(customer([]), 'pg', 'view', null, NOW);
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 403);
  assert.equal(decision.error, 'PERMISSIONS_NOT_CONFIGURED');
});

test('every customer action combination is enforced from the stored grant', () => {
  for (const granted of ACCESS_ACTIONS) {
    const actor = customer([{ module_key: 'pg', allowed_sections: [], allowed_actions: [granted] }]);
    for (const requested of ACCESS_ACTIONS) {
      const decision = authorize(actor, 'pg', requested, null, NOW);
      const implied =
        granted === requested
        || granted === 'manage'
        || (requested === 'view' && granted !== 'view');
      assert.equal(
        decision.ok,
        implied,
        `grant "${granted}" -> request "${requested}" should be ${implied ? 'allowed' : 'denied'}`,
      );
      if (!implied) assert.match(decision.error, /CUSTOMER_ACTION_FORBIDDEN/);
    }
  }
});

test('view-only signup defaults allow browsing and deny every write', () => {
  const actor = customer([{ module_key: 'hotels', allowed_sections: [], allowed_actions: ['view'] }]);
  assert.equal(authorize(actor, 'hotels', 'view', null, NOW).ok, true);
  for (const action of ['create', 'edit', 'delete', 'approve', 'manage']) {
    assert.equal(authorize(actor, 'hotels', action, null, NOW).ok, false, `${action} must be denied`);
  }
});

test('category isolation: a grant never leaks into another category', () => {
  const actor = customer([{ module_key: 'pg', allowed_sections: [], allowed_actions: ['manage'] }]);
  assert.equal(authorize(actor, 'pg', 'delete', null, NOW).ok, true);
  for (const other of ['hotels', 'services', 'movies', 'classes', 'function_hall']) {
    const decision = authorize(actor, other, 'view', null, NOW);
    assert.equal(decision.ok, false);
    assert.equal(decision.error, 'CUSTOMER_MODULE_FORBIDDEN');
  }
});

test('an expired grant does not authorize and does not mask a live one', () => {
  const expired = customer([
    { module_key: 'pg', allowed_sections: [], allowed_actions: ['manage'], expires_at: '2026-11-18T00:00:00.000Z' },
  ]);
  const decision = authorize(expired, 'pg', 'view', null, NOW);
  assert.equal(decision.ok, false);
  assert.equal(decision.error, 'PERMISSIONS_NOT_CONFIGURED');

  const mixed = customer([
    { module_key: 'pg', allowed_sections: [], allowed_actions: ['manage'], expires_at: '2026-11-18T00:00:00.000Z' },
    { module_key: 'hotels', allowed_sections: [], allowed_actions: ['view'], expires_at: null },
  ]);
  assert.equal(authorize(mixed, 'hotels', 'view', null, NOW).ok, true);
  assert.equal(authorize(mixed, 'pg', 'view', null, NOW).error, 'CUSTOMER_MODULE_FORBIDDEN');
});

test('a customer cannot mutate a resource they do not own', () => {
  const actor = customer([{ module_key: 'pg', allowed_sections: [], allowed_actions: ['manage'] }]);
  const owned = authorize(actor, 'pg', 'edit', { ownerUserId: actor.userId }, NOW);
  assert.equal(owned.ok, true);
  const foreign = authorize(actor, 'pg', 'edit', { ownerUserId: '99999999-9999-4999-8999-999999999999' }, NOW);
  assert.equal(foreign.ok, false);
  assert.equal(foreign.error, 'RESOURCE_NOT_OWNED');
  // Reading a public record stays allowed.
  assert.equal(
    authorize(actor, 'pg', 'view', { ownerUserId: '99999999-9999-4999-8999-999999999999' }, NOW).ok,
    true,
  );
});

test('a resource naming another category cannot be reached by ID swap', () => {
  const actor = customer([{ module_key: 'pg', allowed_sections: [], allowed_actions: ['manage'] }]);
  const decision = authorize(actor, 'pg', 'edit', { category: 'hotels' }, NOW);
  assert.equal(decision.ok, false);
  assert.equal(decision.error, 'RESOURCE_CONTEXT_MISMATCH');
});

test('administrators and Super Admin are unrestricted while active', () => {
  const admin = { userId: 'admin', role: 'admin', accountStatus: 'active' };
  for (const category of ACCESS_CATEGORIES.map((entry) => entry.key)) {
    assert.equal(authorize(admin, category, 'manage', null, NOW).ok, true);
  }
  assert.equal(authorize(admin, 'pg', 'manage', null, NOW).reason, 'ADMIN');
  const superAdmin = { ...admin, isSuperAdmin: true };
  assert.equal(authorize(superAdmin, 'ecommerce', 'approve', null, NOW).reason, 'SUPER_ADMIN');
  assert.equal(
    authorize({ ...superAdmin, accountStatus: 'suspended' }, 'pg', 'view', null, NOW).error,
    'ACCOUNT_NOT_ACTIVE',
  );
});

test('a provider owner keeps full control of an approved business', () => {
  const actor = provider([business()]);
  for (const action of ACCESS_ACTIONS) {
    assert.equal(authorize(actor, 'hotels', action, null, NOW).ok, true, action);
  }
  assert.equal(authorize(actor, 'hotels', 'manage', null, NOW).reason, 'PROVIDER_OWNER');
});

test('an unapproved, disabled or cross-category business is refused', () => {
  assert.equal(authorize(provider([business({ approvalStatus: 'pending' })]), 'hotels', 'view', null, NOW).ok, false);
  assert.equal(authorize(provider([business({ isEnabled: false })]), 'hotels', 'view', null, NOW).ok, false);
  assert.equal(authorize(provider([business({ moduleEnabled: false })]), 'hotels', 'view', null, NOW).ok, false);
  const crossCategory = authorize(provider([business()]), 'pg', 'view', null, NOW);
  assert.equal(crossCategory.ok, false);
  assert.equal(crossCategory.error, 'BUSINESS_ACCESS_DENIED');
});

test('a business member is bounded by module, section and action', () => {
  const member = provider([
    business({
      memberRole: 'manager',
      memberModules: ['hotel_stay'],
      memberActions: { hotel_stay: ['view', 'edit'] },
    }),
  ]);
  assert.equal(authorize(member, 'hotels', 'view', null, NOW).ok, true);
  assert.equal(authorize(member, 'hotels', 'edit', null, NOW).ok, true);
  assert.equal(authorize(member, 'hotels', 'delete', null, NOW).error, 'BUSINESS_ACTION_FORBIDDEN');

  const moduleDenied = provider([
    business({ memberRole: 'staff', memberModules: [], memberActions: {} }),
  ]);
  assert.equal(authorize(moduleDenied, 'hotels', 'view', null, NOW).error, 'BUSINESS_MODULE_FORBIDDEN');
});

test('a provider cannot act on another business', () => {
  const actor = provider([business()]);
  const decision = authorize(
    actor,
    'hotels',
    'edit',
    { businessId: '44444444-4444-4444-8444-444444444444' },
    NOW,
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.error, 'BUSINESS_ACCESS_DENIED');
});

test('self-elevation and Super Admin protection are enforced', () => {
  const admin = { userId: 'admin-1', role: 'admin', accountStatus: 'active' };
  const superAdmin = { ...admin, isSuperAdmin: true };

  assert.equal(mayModifyPermissionsFor(admin, { userId: 'admin-1' }).error, 'SELF_PERMISSION_EDIT');
  assert.equal(mayModifyPermissionsFor(admin, { userId: 'user-2' }).ok, true);
  assert.equal(
    mayModifyPermissionsFor(admin, { userId: 'admin-2', isSuperAdmin: true }).error,
    'SUPER_ADMIN_PROTECTED',
  );
  assert.equal(mayModifyPermissionsFor(superAdmin, { userId: 'admin-2', isSuperAdmin: true }).ok, true);
  assert.equal(mayModifyPermissionsFor({ userId: 'u', role: 'customer' }, { userId: 'user-2' }).ok, false);
  assert.equal(canManageAccess({ ...admin, accountStatus: 'suspended' }), false);
  assert.equal(canManageAccess(superAdmin), true);
});
