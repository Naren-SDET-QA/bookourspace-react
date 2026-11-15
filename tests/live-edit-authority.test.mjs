import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  authorityModules,
  canEditListing,
  describeAuthority,
  resolveLiveEditAuthority,
} from '../src/lib/liveEdit/authority.ts';

let failures = 0;
function test(name, callback) {
  try {
    callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

async function testAsync(name, callback) {
  try {
    await callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

function deps(overrides = {}) {
  return {
    async getUser() {
      return { id: 'user-1', email: 'person@example.test' };
    },
    async getProfile(userId) {
      return { id: userId, role: 'provider', account_status: 'active', email: 'person@example.test' };
    },
    async isSuperAdmin() {
      return false;
    },
    async getAssignments() {
      return { ok: true, assignments: [] };
    },
    ...overrides,
  };
}

function listing(overrides = {}) {
  return {
    id: 'pg-1',
    module: 'pg_hostels',
    ownerId: 'user-1',
    title: 'PG',
    description: '',
    categoryId: 'pg-luxury',
    subcategory: 'Luxury PG',
    entityType: 'property',
    price: 9000,
    priceUnit: '/month',
    images: [],
    facilities: [],
    availability: { status: 'not_reported', note: '', nextAvailableFrom: '', unitsAvailable: null },
    details: {},
    status: 'active',
    isVerified: false,
    providerAvailabilityStatus: 'not_reported',
    updatedAt: '2026-10-01T00:00:00.000Z',
    source: 'supabase_listings',
    raw: {},
    ...overrides,
  };
}

await (async () => {
  console.log('Live Edit authority');

  await testAsync('no session is denied before any profile read', async () => {
    let profileReads = 0;
    const result = await resolveLiveEditAuthority(
      deps({
        getUser: async () => null,
        getProfile: async () => {
          profileReads += 1;
          return null;
        },
      })
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NOT_AUTHENTICATED');
    assert.equal(profileReads, 0);
  });

  await testAsync('a missing profile fails closed instead of trusting a local role', async () => {
    const result = await resolveLiveEditAuthority(deps({ getProfile: async () => null }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'PROFILE_UNAVAILABLE');
  });

  await testAsync('inactive accounts and customers are refused', async () => {
    const inactive = await resolveLiveEditAuthority(
      deps({ getProfile: async (id) => ({ id, role: 'provider', account_status: 'suspended' }) })
    );
    assert.equal(inactive.ok, false);
    assert.equal(inactive.code, 'ACCOUNT_INACTIVE');

    const customer = await resolveLiveEditAuthority(
      deps({ getProfile: async (id) => ({ id, role: 'customer', account_status: 'active' }) })
    );
    assert.equal(customer.ok, false);
    assert.equal(customer.code, 'ROLE_NOT_ELIGIBLE');
  });

  await testAsync('providers receive owned scope with no moderation powers', async () => {
    const result = await resolveLiveEditAuthority(deps());
    assert.equal(result.ok, true);
    assert.equal(result.scope, 'owned');
    assert.equal(result.actor.role, 'provider');
    assert.equal(result.capabilities.canEditModerationAvailability, false);
    assert.equal(result.capabilities.canEditVerification, false);
    assert.equal(result.capabilities.canEditCinemaScreens, false);
    assert.equal(result.capabilities.canChangePublicationStatus, false);
    assert.deepEqual(authorityModules(result).length, 6);
    assert.equal(describeAuthority(result), 'Provider · own listings');
  });

  await testAsync('a provider may only edit its own listings (server re-checks too)', async () => {
    const result = await resolveLiveEditAuthority(deps());
    assert.equal(canEditListing(result, listing({ ownerId: 'user-1' })).allowed, true);
    const other = canEditListing(result, listing({ ownerId: 'user-2' }));
    assert.equal(other.allowed, false);
    assert.match(other.reason, /own listings/);
    assert.equal(canEditListing(result, listing({ module: 'movies', source: 'server_cinema_store' })).allowed, false);
  });

  await testAsync('a database-verified Super Admin receives platform-wide scope', async () => {
    const result = await resolveLiveEditAuthority(
      deps({
        getProfile: async (id) => ({ id, role: 'admin', account_status: 'active', full_name: 'Root Admin' }),
        isSuperAdmin: async () => true,
      })
    );
    assert.equal(result.ok, true);
    assert.equal(result.scope, 'platform');
    assert.equal(result.actor.role, 'super_admin');
    assert.equal(result.modules, 'all');
    assert.equal(result.capabilities.canEditVerification, true);
    assert.equal(result.capabilities.canEditModerationAvailability, true);
    assert.equal(result.capabilities.canEditCinemaScreens, true);
    assert.equal(canEditListing(result, listing({ ownerId: 'someone-else' })).allowed, true);
    assert.equal(describeAuthority(result), 'Super Admin · platform-wide');
  });

  await testAsync('an admin without the assignment table is BLOCKED, not silently platform-wide', async () => {
    const result = await resolveLiveEditAuthority(
      deps({
        getProfile: async (id) => ({ id, role: 'admin', account_status: 'active' }),
        isSuperAdmin: async () => false,
        getAssignments: async () => ({ ok: false, code: 'TABLE_MISSING', assignments: [] }),
      })
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ASSIGNMENTS_UNAVAILABLE');
    assert.equal(result.blocked, true);
    assert.match(result.message, /blocked/i);
  });

  await testAsync('a failed Super Admin check falls back to assignments (fail closed)', async () => {
    const result = await resolveLiveEditAuthority(
      deps({
        getProfile: async (id) => ({ id, role: 'admin', account_status: 'active' }),
        isSuperAdmin: async () => null,
        getAssignments: async () => ({ ok: true, assignments: [] }),
      })
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NO_ASSIGNED_CONTENT');
  });

  await testAsync('admin assignments narrow modules and categories', async () => {
    const result = await resolveLiveEditAuthority(
      deps({
        getProfile: async (id) => ({ id, role: 'admin', account_status: 'active' }),
        isSuperAdmin: async () => false,
        getAssignments: async () => ({
          ok: true,
          assignments: [{ moduleId: 'venues', categoryIds: ['venue-marriage'], listingIds: [] }],
        }),
      })
    );
    assert.equal(result.ok, true);
    assert.equal(result.scope, 'assigned');
    assert.equal(result.actor.role, 'admin');
    assert.deepEqual(result.modules, ['venues']);
    assert.deepEqual(authorityModules(result), ['venues']);
    assert.equal(result.capabilities.canEditCinemaScreens, false);
    assert.equal(result.capabilities.canEditModerationAvailability, false);

    assert.equal(
      canEditListing(result, listing({ module: 'venues', categoryId: 'venue-marriage' })).allowed,
      true
    );
    assert.equal(
      canEditListing(result, listing({ module: 'venues', categoryId: 'venue-corporate' })).allowed,
      false
    );
    assert.equal(
      canEditListing(result, listing({ module: 'pg_hostels', categoryId: 'pg-luxury' })).allowed,
      false
    );
  });

  await testAsync('listing-level assignments are honoured', async () => {
    const result = await resolveLiveEditAuthority(
      deps({
        getProfile: async (id) => ({ id, role: 'admin', account_status: 'active' }),
        isSuperAdmin: async () => false,
        getAssignments: async () => ({
          ok: true,
          assignments: [{ moduleId: 'classes', categoryIds: [], listingIds: ['class-9'] }],
        }),
      })
    );
    assert.equal(result.ok, true);
    assert.equal(canEditListing(result, listing({ id: 'class-9', module: 'classes', categoryId: 'class-software' })).allowed, true);
    assert.equal(canEditListing(result, listing({ id: 'class-10', module: 'classes', categoryId: 'class-software' })).allowed, false);
  });

  await testAsync('an admin assigned to movies may use cinema screens', async () => {
    const result = await resolveLiveEditAuthority(
      deps({
        getProfile: async (id) => ({ id, role: 'admin', account_status: 'active' }),
        isSuperAdmin: async () => false,
        getAssignments: async () => ({
          ok: true,
          assignments: [{ moduleId: 'movies', categoryIds: [], listingIds: [] }],
        }),
      })
    );
    assert.equal(result.ok, true);
    assert.equal(result.capabilities.canEditCinemaScreens, true);
  });

  test('authority is never granted from a client-supplied role argument', () => {
    // Runtime contract: the resolver only accepts the dependency object. A
    // forged role string cannot be passed as a role parameter because no such
    // parameter exists.
    assert.equal(resolveLiveEditAuthority.length, 1);
    const source = requireSource();
    assert.doesNotMatch(source, /arguments\[1\]/);
    assert.doesNotMatch(source, /params\.role|options\.role|roleFromClient/);
  });

  console.log(failures === 0 ? '\nLive Edit authority checks passed' : `\n${failures} Live Edit authority check(s) failed`);
})();

function requireSource() {
  return readFileSync(new URL('../src/lib/liveEdit/authority.ts', import.meta.url), 'utf8');
}
