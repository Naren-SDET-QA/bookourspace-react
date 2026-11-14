import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  actionForCustomerRoute,
  customerModuleForPath,
  customerScopeFromGrants,
  customerSectionForPath,
  evaluateCustomerPermission,
  permissionForCustomerRoute,
  sanitizeCustomerGrants,
  strictCustomerDefaults,
} from '../src/server/customerPermissions.ts';
import {
  CUSTOMER_MODULE_KEYS,
  CUSTOMER_MODULE_META,
  CUSTOMER_MODULE_SECTIONS,
  customerSectionKeysFor,
} from '../src/lib/customerModuleMeta.ts';

const server = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

const grant = (module_key, sections = [], actions = []) => ({
  module_key,
  allowed_sections: sections,
  allowed_actions: actions,
});

test('every customer route family maps to its module and section', () => {
  assert.equal(customerModuleForPath('/api/stays/bookings'), 'hotels');
  assert.equal(customerSectionForPath('/api/stays/bookings/b-1/receipt'), 'hotel_stay');
  assert.equal(customerModuleForPath('/api/stays/holds'), 'hotels');
  assert.equal(customerModuleForPath('/api/stays/wishlists'), 'hotels');
  assert.equal(customerModuleForPath('/api/pg/bookings'), 'pg');
  assert.equal(customerSectionForPath('/api/pg/bookings'), 'pg_hostels');
  assert.equal(customerModuleForPath('/api/venue-bookings'), 'function_hall');
  assert.equal(customerSectionForPath('/api/venue-bookings'), 'venues');
  assert.equal(customerModuleForPath('/api/services/bookings'), 'services');
  assert.equal(customerModuleForPath('/api/classes/enrollments'), 'classes');
  assert.equal(customerModuleForPath('/api/movies/showtimes'), null);
});

test('the HTTP method decides the action, with path overrides', () => {
  assert.equal(actionForCustomerRoute('GET', '/api/pg/bookings'), 'view');
  assert.equal(actionForCustomerRoute('POST', '/api/pg/bookings'), 'create');
  assert.equal(actionForCustomerRoute('PUT', '/api/stays/wishlists/l-1'), 'edit');
  assert.equal(actionForCustomerRoute('DELETE', '/api/stays/wishlists/l-1'), 'delete');
  // Cancelling a booking removes the customer's commitment.
  assert.equal(actionForCustomerRoute('POST', '/api/stays/bookings/b-1/cancel'), 'delete');
  assert.equal(actionForCustomerRoute('POST', '/api/classes/enrollments/e-1/cancel'), 'delete');
  // A review is a new record, a payment settles an existing one.
  assert.equal(actionForCustomerRoute('POST', '/api/stays/bookings/b-1/review'), 'create');
  assert.equal(actionForCustomerRoute('POST', '/api/venue-bookings/b-1/payment-intent'), 'edit');
  assert.equal(actionForCustomerRoute('PATCH', '/api/services/bookings/b-1/actions'), 'edit');
  // An unknown method fails closed on the widest action.
  assert.equal(actionForCustomerRoute('TRACE', '/api/pg/bookings'), 'manage');
});

test('an unmapped route keeps its handler authorization', () => {
  assert.equal(permissionForCustomerRoute('GET', '/api/movies/showtimes'), null);
  assert.deepEqual(
    evaluateCustomerPermission({
      role: 'customer',
      grants: [],
      permission: null,
      strictDefaults: true,
    }),
    { ok: true },
  );
});

test('providers and administrators are not constrained by customer grants', () => {
  const permission = permissionForCustomerRoute('POST', '/api/pg/bookings');
  for (const role of ['provider', 'admin', undefined, null]) {
    assert.deepEqual(
      evaluateCustomerPermission({ role, grants: [], permission, strictDefaults: true }),
      { ok: true },
    );
  }
});

test('a customer with no grant rows keeps the legacy contract unless strict', () => {
  const permission = permissionForCustomerRoute('POST', '/api/pg/bookings');
  assert.deepEqual(
    evaluateCustomerPermission({ role: 'customer', grants: [], permission }),
    { ok: true },
  );
  assert.deepEqual(
    evaluateCustomerPermission({ role: 'customer', grants: [], permission, strictDefaults: true }),
    { ok: false, status: 403, error: 'CUSTOMER_PERMISSIONS_REQUIRED' },
  );
  assert.equal(strictCustomerDefaults({ BOS_STRICT_CUSTOMER_DEFAULTS: '1' }), true);
  assert.equal(strictCustomerDefaults({}), false);
});

test('an ungranted module is refused', () => {
  assert.deepEqual(
    evaluateCustomerPermission({
      role: 'customer',
      grants: [grant('pg')],
      permission: permissionForCustomerRoute('GET', '/api/venue-bookings'),
    }),
    { ok: false, status: 403, error: 'CUSTOMER_MODULE_FORBIDDEN' },
  );
});

test('a granted module with empty section and action arrays allows every action', () => {
  for (const [method, url] of [
    ['GET', '/api/pg/bookings'],
    ['POST', '/api/pg/bookings'],
    ['POST', '/api/pg/bookings/b-1/cancel'],
  ]) {
    assert.deepEqual(
      evaluateCustomerPermission({
        role: 'customer',
        grants: [grant('pg')],
        permission: permissionForCustomerRoute(method, url),
      }),
      { ok: true },
    );
  }
});

test('a section-limited grant refuses the section it does not name', () => {
  assert.deepEqual(
    evaluateCustomerPermission({
      role: 'customer',
      grants: [grant('hotels', ['hotel_stay'])],
      permission: permissionForCustomerRoute('GET', '/api/stays/bookings'),
    }),
    { ok: true },
  );
  assert.deepEqual(
    evaluateCustomerPermission({
      role: 'customer',
      // A storable but unrenderable section key must not widen access.
      grants: [grant('hotels', ['properties'])],
      permission: permissionForCustomerRoute('GET', '/api/stays/bookings'),
    }),
    { ok: false, status: 403, error: 'CUSTOMER_SECTION_FORBIDDEN' },
  );
});

test('an action-limited grant refuses the action it does not name', () => {
  const viewOnly = [grant('pg', [], ['view'])];
  assert.deepEqual(
    evaluateCustomerPermission({
      role: 'customer',
      grants: viewOnly,
      permission: permissionForCustomerRoute('GET', '/api/pg/bookings'),
    }),
    { ok: true },
  );
  assert.deepEqual(
    evaluateCustomerPermission({
      role: 'customer',
      grants: viewOnly,
      permission: permissionForCustomerRoute('POST', '/api/pg/bookings'),
    }),
    { ok: false, status: 403, error: 'CUSTOMER_ACTION_FORBIDDEN' },
  );
});

test('manage implies the write actions and any action implies view', () => {
  const manage = [grant('services', [], ['manage'])];
  for (const [method, url] of [
    ['POST', '/api/services/bookings'],
    ['DELETE', '/api/services/bookings'],
    ['POST', '/api/services/bookings/b-1/cancel'],
  ]) {
    assert.deepEqual(
      evaluateCustomerPermission({
        role: 'customer',
        grants: manage,
        permission: permissionForCustomerRoute(method, url),
      }),
      { ok: true },
    );
  }
  const createOnly = [grant('classes', [], ['create'])];
  assert.deepEqual(
    evaluateCustomerPermission({
      role: 'customer',
      grants: createOnly,
      permission: permissionForCustomerRoute('GET', '/api/classes/enrollments'),
    }),
    { ok: true },
  );
});

test('the scope builder only records modules that were actually granted', () => {
  const scope = customerScopeFromGrants([grant('pg', ['pg_hostels'], ['view'])]);
  assert.deepEqual(scope, {
    allowedModules: ['pg'],
    allowedSections: { pg: ['pg_hostels'] },
    allowedActions: { pg: ['view'] },
  });
  assert.equal(customerScopeFromGrants([]), null);
  assert.equal(customerScopeFromGrants(null), null);
});

test('grant payloads with unknown keys are refused, not silently dropped', () => {
  assert.deepEqual(
    sanitizeCustomerGrants({ moduleKey: 'pg', sections: ['pg_hostels'], actions: ['view'] }),
    { ok: true, sections: ['pg_hostels'], actions: ['view'] },
  );
  assert.deepEqual(
    sanitizeCustomerGrants({ moduleKey: 'pg', sections: ['properties'] }),
    { ok: false, error: 'INVALID_SECTIONS' },
  );
  assert.deepEqual(
    sanitizeCustomerGrants({ moduleKey: 'pg', actions: ['publish'] }),
    { ok: false, error: 'INVALID_ACTIONS' },
  );
  assert.deepEqual(sanitizeCustomerGrants({ moduleKey: 'pg', sections: 'all' }), {
    ok: false,
    error: 'INVALID_SECTIONS',
  });
});

test('the customer section catalog matches the rendered marketplace sections', () => {
  for (const key of CUSTOMER_MODULE_KEYS) {
    const expected = CUSTOMER_MODULE_META[key].section;
    const keys = customerSectionKeysFor(key);
    assert.ok(keys, `missing section catalog for ${key}`);
    assert.deepEqual(keys, expected ? [expected] : []);
    assert.equal(CUSTOMER_MODULE_SECTIONS[key].length, expected ? 1 : 0);
  }
  assert.equal(customerSectionKeysFor('not-a-module'), null);
});

test('the server wires the customer gate into the shared booking routes', () => {
  assert.match(server, /permissionForCustomerRoute\(req\.method, req\.originalUrl\)/);
  assert.match(server, /strictCustomerDefaults\(process\.env\)/);
  assert.match(server, /to_jsonb\(cma\) -> 'allowed_actions'/);
  for (const route of [
    '/api/pg/bookings',
    '/api/venue-bookings',
    '/api/services/bookings',
    '/api/classes/enrollments',
    '/api/stays/bookings',
  ]) {
    assert.ok(server.includes(`'${route}'`), `server gate is missing ${route}`);
  }
});

test('the admin API exposes copy, reset and history', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/server/customerModuleAccess.ts'),
    'utf8',
  );
  assert.match(source, /app\.post\('\/api\/admin\/permissions\/copy'/);
  assert.match(source, /app\.post\('\/api\/admin\/permissions\/:userId\/reset'/);
  assert.match(source, /app\.get\('\/api\/admin\/permissions\/:userId\/history'/);
  assert.match(source, /supportsSectionActions/);
  assert.match(source, /PERMISSION_SCHEMA_NOT_READY/);
});
