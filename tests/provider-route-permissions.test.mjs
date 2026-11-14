import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACTION_FOR_METHOD,
  actionForProviderRoute,
  evaluateProviderBusinessContext,
  permissionForProviderRoute,
  sectionForProviderPath,
  strictPermissionDefaults,
} from '../src/lib/businessAccess.ts';

const server = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

const approvedBusiness = {
  module_type: 'classes',
  approval_status: 'approved',
  is_enabled: true,
  module_enabled: true,
  module_approval_status: 'approved',
  role: 'staff',
};

test('an owner is never restricted by section or action grants', () => {
  const decision = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/provider/classes/enrollments',
    business: {
      ...approvedBusiness,
      role: 'owner',
      member_modules: [],
      member_sections: { classes: ['batches'] },
      member_actions: { classes: ['view'] },
    },
    permission: permissionForProviderRoute('DELETE', '/api/provider/classes/enrollments/enr-1'),
  });
  assert.deepEqual(decision, { ok: true });
});

test('an administrator bypasses the whole provider gate', () => {
  assert.deepEqual(
    evaluateProviderBusinessContext({
      role: 'admin',
      path: '/api/provider/classes/enrollments',
      business: null,
      permission: permissionForProviderRoute('DELETE', '/api/provider/classes/enrollments/enr-1'),
      strictDefaults: true,
    }),
    { ok: true },
  );
});

test('a member without a grant row keeps legacy access unless strict defaults are on', () => {
  const legacy = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/provider/classes/enrollments',
    business: { ...approvedBusiness, member_modules: null },
    permission: permissionForProviderRoute('PATCH', '/api/provider/classes/enrollments/enr-1'),
  });
  assert.deepEqual(legacy, { ok: true });

  const strict = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/provider/classes/enrollments',
    business: { ...approvedBusiness, member_modules: null },
    permission: permissionForProviderRoute('PATCH', '/api/provider/classes/enrollments/enr-1'),
    strictDefaults: true,
  });
  assert.deepEqual(strict, { ok: false, status: 403, error: 'BUSINESS_PERMISSIONS_REQUIRED' });
});

test('a granted module still denies a section the member was not given', () => {
  const decision = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/provider/classes/enrollments',
    business: {
      ...approvedBusiness,
      member_modules: ['classes'],
      member_sections: { classes: ['batches'] },
      member_actions: { classes: ['view', 'edit'] },
    },
    permission: permissionForProviderRoute('GET', '/api/provider/classes/enrollments'),
  });
  assert.deepEqual(decision, { ok: false, status: 403, error: 'BUSINESS_SECTION_FORBIDDEN' });
});

test('a granted section still denies an action the member was not given', () => {
  const business = {
    ...approvedBusiness,
    member_modules: ['classes'],
    member_sections: { classes: ['students'] },
    member_actions: { classes: ['view'] },
  };
  const view = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/provider/classes/enrollments',
    business,
    permission: permissionForProviderRoute('GET', '/api/provider/classes/enrollments'),
  });
  assert.deepEqual(view, { ok: true });

  const remove = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/provider/classes/enrollments',
    business,
    permission: permissionForProviderRoute('DELETE', '/api/provider/classes/enrollments/enr-1'),
  });
  assert.deepEqual(remove, { ok: false, status: 403, error: 'BUSINESS_ACTION_FORBIDDEN' });
});

test('manage implies every action and any action implies view', () => {
  const manager = {
    ...approvedBusiness,
    member_modules: ['classes'],
    member_sections: { classes: ['students', 'batches'] },
    member_actions: { classes: ['manage'] },
  };
  for (const [method, url] of [
    ['GET', '/api/provider/classes/enrollments'],
    ['POST', '/api/provider/classes/batches'],
    ['DELETE', '/api/provider/classes/enrollments/enr-1'],
  ]) {
    assert.deepEqual(
      evaluateProviderBusinessContext({
        role: 'provider',
        path: url,
        business: manager,
        permission: permissionForProviderRoute(method, url),
      }),
      { ok: true },
      `${method} ${url}`,
    );
  }

  const editor = { ...manager, member_actions: { classes: ['edit'] } };
  assert.deepEqual(
    evaluateProviderBusinessContext({
      role: 'provider',
      path: '/api/provider/classes/enrollments',
      business: editor,
      permission: permissionForProviderRoute('GET', '/api/provider/classes/enrollments'),
    }),
    { ok: true },
    'edit implies view',
  );
});

test('routes without a mapped section stay module-gated only', () => {
  assert.deepEqual(
    evaluateProviderBusinessContext({
      role: 'provider',
      path: '/api/provider/listings/listing-1',
      business: { ...approvedBusiness, member_modules: ['classes'], member_actions: { classes: ['view'] } },
      permission: null,
    }),
    { ok: true },
  );
});

test('method maps to the action a route performs', () => {
  assert.equal(ACTION_FOR_METHOD.GET, 'view');
  assert.equal(ACTION_FOR_METHOD.POST, 'create');
  assert.equal(ACTION_FOR_METHOD.PUT, 'edit');
  assert.equal(ACTION_FOR_METHOD.PATCH, 'edit');
  assert.equal(ACTION_FOR_METHOD.DELETE, 'delete');
  assert.equal(actionForProviderRoute('get', '/api/provider/classes'), 'view');
  assert.equal(actionForProviderRoute('PATCH', '/api/provider/classes/batches/1'), 'edit');
  assert.equal(actionForProviderRoute('TRACE', '/api/provider/classes'), 'manage');
});

test('approval and management paths override the HTTP method', () => {
  assert.equal(actionForProviderRoute('POST', '/api/movies/screens/scr-1/approve'), 'approve');
  assert.equal(actionForProviderRoute('POST', '/api/pg/bookings/abc/settle'), 'approve');
  assert.equal(actionForProviderRoute('POST', '/api/admin/classes/batches/b-1/review'), 'approve');
  assert.equal(actionForProviderRoute('POST', '/api/businesses/b-1/members/u-1/access'), 'manage');
  assert.equal(actionForProviderRoute('POST', '/api/businesses/b-1/ownership-transfer'), 'manage');
});

test('section prefixes resolve longest-first for the endpoints that exist', () => {
  assert.equal(sectionForProviderPath('/api/stays/host/properties/p-1'), 'properties');
  assert.equal(sectionForProviderPath('/api/stays/host/listings/l-1'), 'properties');
  assert.equal(sectionForProviderPath('/api/stays/host/room-types'), 'rooms');
  assert.equal(sectionForProviderPath('/api/stays/host/units'), 'rooms');
  assert.equal(sectionForProviderPath('/api/stays/host/blocks'), 'calendar');
  assert.equal(sectionForProviderPath('/api/stays/host/bookings?limit=5'), 'reservations');
  assert.equal(sectionForProviderPath('/api/services/workers/w-1'), 'workers');
  assert.equal(sectionForProviderPath('/api/services/earnings'), 'payments');
  assert.equal(sectionForProviderPath('/api/movies/screens'), 'screens');
  assert.equal(sectionForProviderPath('/api/movies/support'), 'support');
  assert.equal(sectionForProviderPath('/api/venue-bookings/quote'), 'bookings');
  assert.equal(sectionForProviderPath('/api/provider/venues/v-1/blocks'), 'listings');
  assert.equal(sectionForProviderPath('/api/provider/classes/enrollments'), 'students');
  assert.equal(sectionForProviderPath('/api/provider/classes/batches'), 'batches');
  assert.equal(sectionForProviderPath('/api/provider/listings'), null);
});

test('permissionForProviderRoute returns null for shared, module-ambiguous routes', () => {
  assert.equal(permissionForProviderRoute('GET', '/api/provider/listings'), null);
  assert.equal(permissionForProviderRoute('POST', '/api/provider/registrations'), null);
  assert.equal(permissionForProviderRoute('GET', '/api/provider-portal/overview'), null);

  assert.deepEqual(permissionForProviderRoute('PATCH', '/api/provider/classes/enrollments/enr-1'), {
    moduleKey: 'classes',
    action: 'edit',
    sectionKey: 'students',
  });
  assert.deepEqual(permissionForProviderRoute('DELETE', '/api/movies/screens/scr-1'), {
    moduleKey: 'movies',
    action: 'delete',
    sectionKey: 'screens',
  });
});

test('strict defaults are opt-in through the environment only', () => {
  assert.equal(strictPermissionDefaults({}), false);
  assert.equal(strictPermissionDefaults({ BOS_STRICT_PERMISSION_DEFAULTS: '0' }), false);
  assert.equal(strictPermissionDefaults({ BOS_STRICT_PERMISSION_DEFAULTS: 'true' }), false);
  assert.equal(strictPermissionDefaults({ BOS_STRICT_PERMISSION_DEFAULTS: '1' }), true);
});

test('the middleware wires the permission and survives a pre-migration database', () => {
  assert.match(server, /permissionForProviderRoute\(req\.method, req\.originalUrl\)/);
  assert.match(server, /strictDefaults: strictPermissionDefaults\(process\.env\)/);
  assert.match(server, /res\.locals\.providerPermission = permission/);
  // A plain column reference would 500 every provider request when the server is
  // deployed before the allowed_actions migration reaches the database.
  assert.match(server, /to_jsonb\(ma\) -> 'allowed_sections' as member_sections/);
  assert.match(server, /to_jsonb\(ma\) -> 'allowed_actions' as member_actions/);
  assert.doesNotMatch(server, /ma\.allowed_actions as member_actions/);
});
