import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACCESS_ACTIONS,
  ACCESS_ACTION_LABELS,
  ACCESS_MODULES,
  ACCESS_MODULE_LABELS,
  MODULE_SECTION_KEYS,
  accessScopeFrom,
  actionGranted,
  describeAccessScope,
  grantedSections,
  moduleGranted,
  permissionGranted,
  providerModuleForPath,
  sanitizeAccessScope,
  sectionGranted,
  sectionKeysFor,
} from '../src/lib/businessAccess.ts';

const root = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function quotedUnion(source, pattern) {
  const match = source.match(pattern);
  assert.ok(match, `catalog drift guard: pattern ${pattern} not found`);
  return Array.from(new Set(Array.from(match[1].matchAll(/'([a-z_]+)'/g)).map((entry) => entry[1])));
}

test('every module exposes a section catalog', () => {
  for (const moduleKey of ACCESS_MODULES) {
    const sections = MODULE_SECTION_KEYS[moduleKey];
    assert.ok(Array.isArray(sections), `${moduleKey} must publish sections`);
    assert.ok(sections.length >= 5, `${moduleKey} needs at least five grantable sections`);
    const keys = sections.map((entry) => entry.key);
    assert.equal(new Set(keys).size, keys.length, `${moduleKey} section keys must be unique`);
    for (const key of keys) assert.match(key, /^[a-z][a-z0-9_]*$/, `${moduleKey}.${key} must be snake_case`);
    for (const entry of sections) assert.ok(entry.label && entry.label.length > 0, `${moduleKey}.${entry.key} needs a label`);
    assert.deepEqual(sectionKeysFor(moduleKey), keys);
  }
});

test('the catalog matches the sections the workspaces actually render', () => {
  const pg = quotedUnion(read('src', 'components', 'PgProviderWorkspace.tsx'), /type OwnerSection = ([^;]+);/);
  const classes = quotedUnion(read('src', 'components', 'InstituteOwnerDashboard.tsx'), /type Section = ([^;]+);/);
  const stays = quotedUnion(read('src', 'components', 'StaysOwnerAdminDashboard.tsx'), /export type StayOwnerSection = ([^;]+);/);
  const servicesSource = read('src', 'components', 'ServicesProviderDashboard.tsx');
  const services = Array.from(new Set(
    Array.from(servicesSource.matchAll(/\{ key: '([a-z_]+)'/g)).map((entry) => entry[1]),
  ));

  for (const [moduleKey, rendered] of [
    ['pg_hostels', pg],
    ['classes', classes],
    ['hotel_stay', stays],
    ['services', services],
  ]) {
    const catalog = MODULE_SECTION_KEYS[moduleKey].map((entry) => entry.key);
    const missing = rendered.filter((key) => !catalog.includes(key));
    assert.deepEqual(missing, [], `${moduleKey} catalog is missing rendered sections: ${missing.join(', ')}`);
  }
});

test('the action catalog is complete, labelled and stable', () => {
  assert.deepEqual([...ACCESS_ACTIONS], ['view', 'create', 'edit', 'delete', 'approve', 'manage']);
  assert.equal(new Set(ACCESS_ACTIONS).size, ACCESS_ACTIONS.length);
  for (const action of ACCESS_ACTIONS) assert.ok(ACCESS_ACTION_LABELS[action], `${action} needs a label`);
  for (const moduleKey of ACCESS_MODULES) assert.ok(ACCESS_MODULE_LABELS[moduleKey]);
});

test('a stored grant parses sections and actions, and stays unrestricted without modules', () => {
  assert.equal(accessScopeFrom(null), null);
  assert.equal(accessScopeFrom({}), null);
  assert.equal(accessScopeFrom({ allowed_modules: null }), null);

  const scope = accessScopeFrom({
    allowed_modules: ['classes', 'hotel_stay'],
    allowed_sections: { classes: ['students', 'batches'], hotel_stay: [] },
    allowed_actions: { classes: ['view', 'edit'], hotel_stay: ['manage'] },
  });
  assert.deepEqual(scope.allowedModules, ['classes', 'hotel_stay']);
  assert.deepEqual(scope.allowedSections, { classes: ['students', 'batches'] });
  assert.deepEqual(scope.allowedActions, { classes: ['view', 'edit'], hotel_stay: ['manage'] });

  const noActions = accessScopeFrom({ allowed_modules: ['services'] });
  assert.deepEqual(noActions.allowedActions, {});
});

test('modules are deny-by-default once a grant row exists', () => {
  const scope = accessScopeFrom({ allowed_modules: ['classes'] });
  assert.equal(moduleGranted(scope, 'classes'), true);
  assert.equal(moduleGranted(scope, 'pg_hostels'), false);
  assert.equal(moduleGranted(null, 'pg_hostels'), true, 'no grant row keeps legacy full access');
});

test('sections: absent means every section, listed means only those', () => {
  const wide = accessScopeFrom({ allowed_modules: ['classes'] });
  assert.equal(grantedSections(wide, 'classes'), null);
  assert.equal(sectionGranted(wide, 'classes', 'fees'), true);

  const narrow = accessScopeFrom({ allowed_modules: ['classes'], allowed_sections: { classes: ['students'] } });
  assert.equal(sectionGranted(narrow, 'classes', 'students'), true);
  assert.equal(sectionGranted(narrow, 'classes', 'fees'), false);
  assert.equal(sectionGranted(narrow, 'pg_hostels', 'students'), false, 'module gate wins over section');
  assert.equal(sectionGranted(narrow, 'classes', null), true, 'no section asked means module-level check');
});

test('actions: manage implies all, any action implies view, others stay independent', () => {
  const editOnly = accessScopeFrom({ allowed_modules: ['classes'], allowed_actions: { classes: ['edit'] } });
  assert.equal(actionGranted(editOnly, 'classes', 'view'), true);
  assert.equal(actionGranted(editOnly, 'classes', 'edit'), true);
  assert.equal(actionGranted(editOnly, 'classes', 'delete'), false);
  assert.equal(actionGranted(editOnly, 'classes', 'approve'), false);

  const manager = accessScopeFrom({ allowed_modules: ['classes'], allowed_actions: { classes: ['manage'] } });
  for (const action of ACCESS_ACTIONS) assert.equal(actionGranted(manager, 'classes', action), true, action);

  const viewOnly = accessScopeFrom({ allowed_modules: ['classes'], allowed_actions: { classes: ['view'] } });
  assert.equal(actionGranted(viewOnly, 'classes', 'create'), false);
  assert.equal(actionGranted(viewOnly, 'pg_hostels', 'view'), false);

  const noActionGrant = accessScopeFrom({ allowed_modules: ['classes'] });
  assert.equal(actionGranted(noActionGrant, 'classes', 'delete'), true, 'legacy rows keep every action');
  assert.equal(actionGranted(null, 'classes', 'delete'), true);
});

test('permissionGranted combines module, section and action', () => {
  const scope = accessScopeFrom({
    allowed_modules: ['classes'],
    allowed_sections: { classes: ['students', 'attendance'] },
    allowed_actions: { classes: ['view', 'edit'] },
  });
  assert.equal(permissionGranted(scope, { moduleKey: 'classes', sectionKey: 'students', action: 'edit' }), true);
  assert.equal(permissionGranted(scope, { moduleKey: 'classes', sectionKey: 'students', action: 'delete' }), false);
  assert.equal(permissionGranted(scope, { moduleKey: 'classes', sectionKey: 'fees', action: 'view' }), false);
  assert.equal(permissionGranted(scope, { moduleKey: 'pg_hostels', action: 'view' }), false);
  assert.equal(permissionGranted(null, { moduleKey: 'pg_hostels', action: 'manage' }), true);
});

test('sanitizeAccessScope accepts section and action grants', () => {
  const accepted = sanitizeAccessScope({
    allowedModules: ['classes', 'hotel_stay'],
    allowedSections: { classes: ['students', 'fees'], hotel_stay: ['payments'] },
    allowedActions: { classes: ['view', 'edit'], hotel_stay: ['manage'] },
  });
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.scope.allowedModules, ['classes', 'hotel_stay']);
  assert.deepEqual(accepted.scope.allowedSections, { classes: ['students', 'fees'], hotel_stay: ['payments'] });
  assert.deepEqual(accepted.scope.allowedActions, { classes: ['view', 'edit'], hotel_stay: ['manage'] });
});

test('sanitizeAccessScope never trusts an unknown or malformed grant', () => {
  assert.deepEqual(
    sanitizeAccessScope({ allowedModules: ['classes'], allowedActions: { classes: ['admin'] } }),
    { ok: false, error: 'INVALID_ACTIONS' },
  );
  assert.deepEqual(
    sanitizeAccessScope({ allowedModules: ['classes'], allowedActions: { classes: 'view' } }),
    { ok: false, error: 'INVALID_ACTIONS' },
  );
  assert.deepEqual(
    sanitizeAccessScope({ allowedModules: ['classes'], allowedActions: ['view'] }),
    { ok: false, error: 'INVALID_ACTIONS' },
  );
  assert.deepEqual(
    sanitizeAccessScope({ allowedModules: ['unknown_module'] }),
    { ok: false, error: 'INVALID_MODULES' },
  );
  assert.deepEqual(
    sanitizeAccessScope({ allowedModules: [] }),
    { ok: false, error: 'NO_MODULES' },
  );
  assert.deepEqual(
    sanitizeAccessScope({ allowedModules: ['classes'], allowedSections: { classes: ['payments'] } }),
    { ok: false, error: 'INVALID_SECTIONS' },
  );
});

test('sanitizeAccessScope drops inert grants and stores "everything" by omission', () => {
  const everything = sanitizeAccessScope({
    allowedModules: ['classes'],
    allowedSections: { classes: MODULE_SECTION_KEYS.classes.map((entry) => entry.key) },
    allowedActions: { classes: [...ACCESS_ACTIONS] },
  });
  assert.equal(everything.ok, true);
  assert.deepEqual(everything.scope.allowedSections, {}, 'all sections is stored as absent');
  assert.deepEqual(everything.scope.allowedActions, {}, 'all actions is stored as absent');

  const inert = sanitizeAccessScope({
    allowedModules: ['classes'],
    allowedSections: { pg_hostels: ['dashboard'] },
    allowedActions: { pg_hostels: ['manage'] },
  });
  assert.equal(inert.ok, true);
  assert.deepEqual(inert.scope.allowedSections, {});
  assert.deepEqual(inert.scope.allowedActions, {});
});

test('sanitizeAccessScope keeps customer/provider scopes independent', () => {
  const first = sanitizeAccessScope({ allowedModules: ['classes'], allowedActions: { classes: ['view'] } });
  const second = sanitizeAccessScope({ allowedModules: ['services'], allowedActions: { services: ['manage'] } });
  assert.deepEqual(first.scope.allowedModules, ['classes']);
  assert.deepEqual(second.scope.allowedModules, ['services']);
  assert.deepEqual(first.scope.allowedActions, { classes: ['view'] });
  assert.deepEqual(second.scope.allowedActions, { services: ['manage'] });
});

test('describeAccessScope reports sections and actions without leaking keys', () => {
  assert.equal(describeAccessScope(null), 'Full access');
  const scope = accessScopeFrom({
    allowed_modules: ['classes', 'hotel_stay'],
    allowed_sections: { classes: ['students'] },
    allowed_actions: { classes: ['view'], hotel_stay: ['view', 'edit'] },
  });
  const summary = describeAccessScope(scope);
  assert.match(summary, /Classes \(1 sections, 1 actions\)/);
  assert.match(summary, /Stays \(2 actions\)/);
  assert.match(describeAccessScope(accessScopeFrom({ allowed_modules: [] })), /No modules/);
});

test('every provider route prefix still resolves to a catalogued module', () => {
  for (const [prefix, moduleKey] of [
    ['/api/stays/host/properties', 'hotel_stay'],
    ['/api/movies/screens', 'movies'],
    ['/api/venue-bookings/quote', 'venues'],
    ['/api/pg/bookings/123', 'pg_hostels'],
    ['/api/provider/classes', 'classes'],
    ['/api/services/provider', 'services'],
  ]) {
    assert.equal(providerModuleForPath(prefix), moduleKey, prefix);
    assert.ok(ACCESS_MODULES.includes(moduleKey));
  }
});
