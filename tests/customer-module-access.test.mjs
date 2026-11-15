import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  BUSINESS_MODULE_IDS,
  BUSINESS_MODULE_MAP,
  moduleAliasCollisions,
  resolveRequestedModuleName,
} from '../src/modules/businessModuleMap.ts';
import { MODULE_KEYS } from '../src/server/moduleGate.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const PHASE1 = read('supabase/migrations/20261112010000_business_ownership_phase1.sql');
const SERVER = read('server.ts');

/* ------------------------------------------------------------------ */
/* Requirement 8: module mapping is single-sourced and consistent.    */
/* ------------------------------------------------------------------ */

test('canonical business modules are a closed, documented set', () => {
  assert.deepEqual(BUSINESS_MODULE_IDS, ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies']);
  assert.equal(BUSINESS_MODULE_MAP.length, BUSINESS_MODULE_IDS.length);
  for (const entry of BUSINESS_MODULE_MAP) {
    assert.ok(BUSINESS_MODULE_IDS.includes(entry.id), `mapped entry ${entry.id} must be canonical`);
    assert.ok(entry.label, `module ${entry.id} needs a label`);
    assert.ok(entry.platformModuleKey, `module ${entry.id} needs a platform key`);
    assert.ok(entry.registryId, `module ${entry.id} needs a registry id`);
    assert.ok(entry.marketSection, `module ${entry.id} needs a market section`);
  }
});

test('requested audit names resolve unambiguously to canonical modules', () => {
  assert.equal(resolveRequestedModuleName('PG'), 'pg_hostels');
  assert.equal(resolveRequestedModuleName('Properties'), 'hotel_stay');
  assert.equal(resolveRequestedModuleName('Stays'), 'hotel_stay');
  assert.equal(resolveRequestedModuleName('Services'), 'services');
  assert.equal(resolveRequestedModuleName('Movies'), 'movies');
  assert.equal(resolveRequestedModuleName('Institutes'), 'classes');
  assert.equal(resolveRequestedModuleName('Events'), 'venues');
  assert.equal(resolveRequestedModuleName('nonsense'), null);
  assert.equal(resolveRequestedModuleName(''), null);
});

test('module aliases never collide and every platform/registry/section key resolves', () => {
  assert.deepEqual(moduleAliasCollisions(), [], 'no two modules may share an alias');
  const platformKeys = new Set(MODULE_KEYS);
  const marketSections = new Set(['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies']);
  const registryIds = new Set(['hotels', 'pg', 'services', 'function_hall', 'classes', 'movies', 'ecommerce']);
  for (const entry of BUSINESS_MODULE_MAP) {
    assert.ok(platformKeys.has(entry.platformModuleKey), `platform key ${entry.platformModuleKey} is unknown`);
    assert.ok(marketSections.has(entry.marketSection), `market section ${entry.marketSection} is unknown`);
    assert.ok(registryIds.has(entry.registryId), `registry id ${entry.registryId} is unknown`);
  }
});

test('the SQL module check constraint and the canonical set agree', () => {
  for (const module of BUSINESS_MODULE_IDS) {
    assert.ok(PHASE1.includes(`'${module}'`), `phase1 must constrain module ${module}`);
  }
  assert.match(PHASE1, /module_type in \('pg_hostels','classes','venues','services','hotel_stay','movies'\)/);
});

/* ------------------------------------------------------------------ */
/* Requirement 4 + 5: no self-grant; only super admins write access.  */
/* ------------------------------------------------------------------ */

test('only super admins can write business module access (not any admin)', () => {
  const policy = PHASE1.slice(PHASE1.indexOf('"Only super admins write module access"'));
  assert.match(policy, /using \(public\.is_current_user_super_admin\(\)\) with check \(public\.is_current_user_super_admin\(\)\);/);
  assert.doesNotMatch(policy.slice(0, policy.indexOf('using (public.is_current_user_super_admin())')), /is_admin\(\)/);
});

test('privileged business fields are protected by the super-admin guard, not any admin', () => {
  const guard = PHASE1.slice(PHASE1.indexOf('function public.guard_business_privileged_changes'));
  assert.match(guard, /not public\.is_current_user_super_admin\(\)/);
  assert.doesNotMatch(guard, /not public\.is_admin\(\)/);
});

test('customers cannot create a business on behalf of someone else, nor self-approve', () => {
  assert.match(PHASE1, /owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(PHASE1, /"Business owners create their own business"/);
  // Owner membership is created atomically in a 'pending' state, never approved.
  assert.match(PHASE1, /new\.approval_status = 'approved'/);
});

test('non-owner members cannot insert or promote owners', () => {
  assert.match(PHASE1, /role <> 'owner'/);
  assert.match(PHASE1, /"Owners and admins add non-owner members"/);
});

test('the admin access API re-checks is_super_admin from profiles, never the body', () => {
  const api = read('src/server/businessApi.ts');
  assert.match(api, /select is_super_admin from public\.profiles where id = \$1 and role = \$2 and account_status = \$3/);
  assert.match(api, /if \(!admin\.rows\[0\]\?\.is_super_admin\) return void response\.status\(403\)/);
  assert.doesNotMatch(api, /body\?\.is_super_admin/);
});

/* ------------------------------------------------------------------ */
/* Requirement 2 + 3: 403 on unauthorized, and immediate revocation.  */
/* ------------------------------------------------------------------ */

test('provider module APIs reject missing or non-approved business context with 403', () => {
  assert.match(SERVER, /BUSINESS_CONTEXT_REQUIRED/);
  assert.match(SERVER, /BUSINESS_ACCESS_DENIED/);
  // A suspended, revoked, disabled or pending business/module is denied in the
  // same request that uses it — there is no cached or stale grant.
  assert.match(SERVER, /business\.approval_status !== 'approved' \|\| business\.is_enabled !== true \|\| business\.module_enabled !== true \|\| business\.module_approval_status !== 'approved'/);
});

test('business context is re-derived from PostgreSQL on every request', () => {
  // The middleware selects the live business/module rows per request and stores
  // only the derived context on res.locals; it never trusts a client-sent role.
  assert.match(SERVER, /select b\.id, b\.module_type, b\.approval_status, b\.is_enabled,\s*\n?\s*m\.role, a\.enabled as module_enabled, a\.approval_status as module_approval_status/);
  assert.match(SERVER, /res\.locals\.businessContext = business/);
});

test('every provider-owned module prefix is behind the business-context middleware', () => {
  const middleware = SERVER.slice(SERVER.indexOf("app.use(['/api/provider'"), SERVER.indexOf("app.use(['/api/provider'") + 700);
  for (const prefix of [
    '/api/provider',
    '/api/stays/host',
    '/api/movies/screens',
    '/api/services/earnings',
    '/api/services/payment-claims',
    '/api/pg/bookings',
    '/api/services/bookings',
    '/api/venue-bookings',
    '/api/stays/bookings',
  ]) {
    assert.ok(middleware.includes(prefix), `provider prefix ${prefix} must be guarded`);
  }
});

/* ------------------------------------------------------------------ */
/* Requirement 7: guests and customers keep self-access; providers gate. */
/* ------------------------------------------------------------------ */

test('customers keep self-service booking access without a business context', () => {
  // Customer-shared booking prefixes skip the business-context requirement;
  // only provider-only prefixes force the x-business-id gate.
  assert.match(SERVER, /claims\.role === 'customer' && !providerOnly/);
  assert.match(SERVER, /providerOnlyPrefixes = \['\/api\/provider', '\/api\/stays\/host', '\/api\/movies\/screens', '\/api\/services\/earnings', '\/api\/services\/payment-claims'\]/);
  for (const customerPrefix of ['/api/pg/bookings', '/api/services/bookings', '/api/venue-bookings', '/api/stays/bookings']) {
    assert.doesNotMatch(SERVER, new RegExp(`providerOnlyPrefixes = \\[[^\\]]*'${customerPrefix}'`), `${customerPrefix} must stay customer-accessible`);
  }
});

test('guests are rejected (401), never granted a role by a provider route', () => {
  const middleware = SERVER.slice(SERVER.indexOf("app.use(['/api/provider'"), SERVER.indexOf("app.use(['/api/provider'") + 900);
  assert.match(middleware, /UNAUTHORIZED_SESSION/);
  assert.match(middleware, /res\.status\(401\)/);
});

/* ------------------------------------------------------------------ */
/* Requirement 1: navigation never grants a role or module access.    */
/* ------------------------------------------------------------------ */

test('the provider portal refuses customers and signed-out viewers at the UI shell', async () => {
  const { canAccessProviderPortal, protectedViewFallback } = await import('../src/lib/accessControl.ts');
  assert.equal(canAccessProviderPortal('provider'), true);
  assert.equal(canAccessProviderPortal('admin'), true);
  for (const role of ['customer', '', null, undefined, 'guest']) {
    assert.equal(canAccessProviderPortal(role), false, `role ${String(role)} must not open the provider portal`);
  }
  assert.equal(protectedViewFallback('customer'), 'marketplace');
});

test('the provider dashboard only opens protected module data for an approved business', () => {
  const dashboard = read('src/components/ProviderDashboard.tsx');
  // The PG owner dashboard is gated on an approved business; the business
  // switcher labels the selected module, and listings are scoped by module.
  assert.match(dashboard, /approval_status !== 'approved'/);
  assert.match(dashboard, /selectedBusiness\.approval_status === 'approved'/);
  assert.match(dashboard, /BUSINESS_MODULE_LABELS\[business\.module_type\]/);
});
