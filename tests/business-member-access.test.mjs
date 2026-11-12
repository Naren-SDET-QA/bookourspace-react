import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  accessScopeFrom,
  describeAccessScope,
  grantedSections,
  moduleGranted,
  sanitizeAccessScope,
} from '../src/lib/businessAccess.ts';

const root = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('members without a grant row stay unrestricted', () => {
  assert.equal(accessScopeFrom(null), null);
  assert.equal(accessScopeFrom({}), null);
  assert.equal(accessScopeFrom({ allowed_modules: null }), null);
  const unrestricted = accessScopeFrom({ allowed_modules: null, allowed_sections: { hotel_stay: ['payments'] } });
  assert.equal(unrestricted, null);
  assert.equal(moduleGranted(unrestricted, 'pg_hostels'), true);
  assert.equal(grantedSections(unrestricted, 'hotel_stay'), null);
});

test('a grant limits modules and sections', () => {
  const scope = accessScopeFrom({ allowed_modules: ['hotel_stay'], allowed_sections: { hotel_stay: ['reservations', 'payments'] } });
  assert.deepEqual(scope.allowedModules, ['hotel_stay']);
  assert.equal(moduleGranted(scope, 'hotel_stay'), true);
  assert.equal(moduleGranted(scope, 'pg_hostels'), false);
  assert.deepEqual(grantedSections(scope, 'hotel_stay'), ['reservations', 'payments']);
  assert.equal(grantedSections(scope, 'services'), null);
});

test('an empty section list inside a granted module means every section', () => {
  const scope = accessScopeFrom({ allowed_modules: ['hotel_stay'], allowed_sections: { hotel_stay: [] } });
  assert.deepEqual(scope.allowedSections, {});
  assert.equal(grantedSections(scope, 'hotel_stay'), null);
});

test('grant payloads are validated, not silently widened', () => {
  assert.equal(sanitizeAccessScope({ allowedModules: [] }).error, 'NO_MODULES');
  assert.equal(sanitizeAccessScope({ allowedModules: ['not_a_module'] }).error, 'INVALID_MODULES');
  assert.equal(sanitizeAccessScope({}).error, 'INVALID_MODULES');
  assert.equal(sanitizeAccessScope({ allowedModules: ['hotel_stay'], allowedSections: { hotel_stay: ['nope'] } }).error, 'INVALID_SECTIONS');
  assert.equal(sanitizeAccessScope({ allowedModules: ['hotel_stay'], allowedSections: ['payments'] }).error, 'INVALID_SECTIONS');

  const accepted = sanitizeAccessScope({
    allowedModules: ['hotel_stay', 'hotel_stay', 'services'],
    allowedSections: { hotel_stay: ['payments', 'payments'], pg_hostels: ['overview'], services: [] },
  });
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.scope.allowedModules, ['hotel_stay', 'services']);
  assert.deepEqual(accepted.scope.allowedSections, { hotel_stay: ['payments'] });
});

test('access summaries stay readable', () => {
  assert.equal(describeAccessScope(null), 'Full access');
  assert.equal(describeAccessScope(accessScopeFrom({ allowed_modules: ['pg_hostels'] })), 'PG & Hostels');
  assert.equal(
    describeAccessScope(accessScopeFrom({ allowed_modules: ['hotel_stay'], allowed_sections: { hotel_stay: ['payments', 'reports'] } })),
    'Stays (2 sections)',
  );
});

test('the API and the portal both honour the shared policy', () => {
  const api = read('src/server/businessApi.ts');
  const portal = read('src/components/ProviderDashboard.tsx');
  const shell = read('src/components/ProviderPortalShell.tsx');
  const stays = read('src/components/StaysOwnerAdminDashboard.tsx');

  assert.match(api, /sanitizeAccessScope\(request\.body\)/);
  assert.match(api, /OWNER_ACCESS_CANNOT_BE_RESTRICTED/);
  assert.match(api, /ONLY_OWNER_CAN_RESTRICT_MANAGER/);
  assert.match(api, /business\.member_access_changed/);
  assert.match(api, /business_member_access/);

  assert.match(portal, /const allowedPortalModules: ProviderPortalModule\[\]/);
  assert.match(portal, /allowedModules=\{allowedPortalModules\}/);
  assert.match(portal, /sections=\{\(staySectionKeys as StayOwnerSection\[\] \| null\) \|\| undefined\}/);
  assert.match(shell, /allowedModules\?: ProviderPortalModule\[\]/);
  assert.match(shell, /NAV\.filter\(\(item\) => allowedModules\.includes\(item\.key\)\)/);
  assert.match(stays, /const canSee = \(key: StayOwnerSection\)/);
});

test('the grant migration protects owners and scopes RLS', () => {
  const migration = read('supabase/migrations/20261112340000_business_member_access.sql');
  assert.match(migration, /create table if not exists public\.business_member_access/);
  assert.match(migration, /OWNER_ACCESS_CANNOT_BE_RESTRICTED/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /create policy "Members read their own access scope"/);
  assert.match(migration, /allowed_modules <@ array\['pg_hostels','classes','venues','services','hotel_stay','movies'\]/);
});
