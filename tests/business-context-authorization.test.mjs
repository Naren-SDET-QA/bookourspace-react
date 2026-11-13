import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  accessScopeFrom,
  evaluateProviderBusinessContext,
  moduleGranted,
  providerModuleForPath,
  selectBusinessContext,
} from '../src/lib/businessAccess.ts';

const server = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

const approvedBusiness = {
  module_type: 'venues',
  approval_status: 'approved',
  is_enabled: true,
  module_enabled: true,
  module_approval_status: 'approved',
  role: 'staff',
  member_modules: null,
};

test('a restricted member cannot use an unauthorized module', () => {
  const restricted = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/venue-bookings',
    business: { ...approvedBusiness, member_modules: ['classes'] },
  });
  assert.deepEqual(restricted, { ok: false, status: 403, error: 'BUSINESS_MODULE_FORBIDDEN' });

  const granted = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/venue-bookings',
    business: { ...approvedBusiness, member_modules: ['venues', 'classes'] },
  });
  assert.deepEqual(granted, { ok: true });

  const unrestricted = accessScopeFrom({ allowed_modules: null });
  assert.equal(moduleGranted(unrestricted, 'venues'), true);
});

test('a member cannot use another business module', () => {
  const mismatch = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/movies/screens/scr-1',
    business: approvedBusiness,
  });
  assert.deepEqual(mismatch, { ok: false, status: 403, error: 'BUSINESS_MODULE_MISMATCH' });

  const ambiguous = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/provider/listings?module=venues',
    business: approvedBusiness,
  });
  assert.deepEqual(ambiguous, { ok: true });

  assert.equal(providerModuleForPath('/api/stays/host/bookings'), 'hotel_stay');
  assert.equal(providerModuleForPath('/api/services/earnings?range=30d'), 'services');
  assert.equal(providerModuleForPath('/api/movies/screens-extra'), null);
  assert.equal(providerModuleForPath('/api/provider-portal/overview'), null);
});

test('module-specific provider routes are mapped and shared listings stay ambiguous', () => {
  assert.equal(providerModuleForPath('/api/provider/pg/listings/lst-1/inventory'), 'pg_hostels');
  assert.equal(providerModuleForPath('/api/provider/venues/lst-1/blocks'), 'venues');
  assert.equal(providerModuleForPath('/api/provider/venue-bookings/abc/reschedule'), 'venues');
  assert.equal(providerModuleForPath('/api/provider/classes/listings/lst-1/batches'), 'classes');
  assert.equal(providerModuleForPath('/api/services/provider/schedule'), 'services');
  assert.equal(providerModuleForPath('/api/services/workers'), 'services');

  assert.equal(providerModuleForPath('/api/provider/listings'), null, 'shared listing surface stays module-agnostic');
  assert.equal(providerModuleForPath('/api/provider/registrations'), null);
  assert.equal(providerModuleForPath('/api/provider-portal/overview'), null);
});

test('shared listing writes validate the listing module against the business', () => {
  const repository = fs.readFileSync(path.join(process.cwd(), 'src/server/providerListingRepository.ts'), 'utf8');
  assert.match(repository, /assertBusinessModuleForListing\(/);
  assert.match(repository, /BUSINESS_MODULE_MISMATCH/);
  assert.match(repository, /select module_type from public\.businesses where id = \$1/);
  assert.match(server, /'\/api\/services\/provider'/);
  assert.match(server, /'\/api\/services\/workers'/);
});

test('multi-business users must supply an explicit business context', () => {
  assert.deepEqual(selectBusinessContext('', ['biz-a', 'biz-b']), {
    ok: false,
    status: 403,
    error: 'BUSINESS_CONTEXT_REQUIRED',
  });
  assert.deepEqual(selectBusinessContext('', ['biz-a']), {
    ok: true,
    businessId: 'biz-a',
    derived: true,
  });
  const explicit = selectBusinessContext('11111111-2222-4333-8444-555555555555', ['biz-a', 'biz-b']);
  assert.deepEqual(explicit, {
    ok: true,
    businessId: '11111111-2222-4333-8444-555555555555',
    derived: false,
  });
  assert.equal(selectBusinessContext('not-a-uuid', ['biz-a', 'biz-b']).ok, false);
  assert.equal(selectBusinessContext('', []).ok, false);
});

test('valid authorized member access is allowed', () => {
  const member = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/venue-bookings',
    business: { ...approvedBusiness, role: 'manager', member_modules: ['venues'] },
  });
  assert.deepEqual(member, { ok: true });

  const owner = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/venue-bookings',
    business: { ...approvedBusiness, role: 'owner', member_modules: ['classes'] },
  });
  assert.deepEqual(owner, { ok: true });

  const noGrantRow = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/venue-bookings',
    business: { ...approvedBusiness, role: 'accountant', member_modules: null },
  });
  assert.deepEqual(noGrantRow, { ok: true });
});

test('admin and suspended-business permissions remain correct', () => {
  assert.deepEqual(
    evaluateProviderBusinessContext({ role: 'admin', path: '/api/movies/screens', business: null }),
    { ok: true },
  );
  assert.deepEqual(
    evaluateProviderBusinessContext({ role: 'provider', path: '/api/venue-bookings', business: null }),
    { ok: false, status: 403, error: 'BUSINESS_ACCESS_DENIED' },
  );
  const suspended = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/venue-bookings',
    business: { ...approvedBusiness, approval_status: 'suspended' },
  });
  assert.deepEqual(suspended, { ok: false, status: 403, error: 'BUSINESS_ACCESS_DENIED' });
  const disabledModule = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/venue-bookings',
    business: { ...approvedBusiness, module_enabled: false },
  });
  assert.deepEqual(disabledModule, { ok: false, status: 403, error: 'BUSINESS_ACCESS_DENIED' });
});

test('the middleware uses the shared policy and loads member scope', () => {
  assert.match(server, /evaluateProviderBusinessContext\(/);
  assert.match(server, /selectBusinessContext\(/);
  assert.match(server, /ma\.allowed_modules as member_modules/);
  assert.match(server, /left join public\.business_member_access ma/);
  assert.match(server, /if \(claims\.role === 'admin'\) return next\(\);/);
});
