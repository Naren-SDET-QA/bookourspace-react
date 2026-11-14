import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  businessApprovalLabel,
  businessLabel,
  createLatestRequestGuard,
  isBusinessOperational,
  needsBusinessChoice,
  noticeForProviderError,
  preferredBusinessId,
  providerContextHeaders,
  resolveBusinessSelection,
} from '../src/lib/providerBusinessContext.ts';
import {
  evaluateProviderBusinessContext,
  permissionForProviderRoute,
  strictPermissionDefaults,
} from '../src/lib/businessAccess.ts';

/**
 * Provider business-context rules: auto-selection, the selector, the
 * `x-business-id` header, stale-response protection and the mapping from a
 * server refusal to the message a provider sees.
 *
 * The authorization half of each case is decided by the real middleware
 * evaluator (`evaluateProviderBusinessContext`), so a UI state can never claim
 * access the server would refuse.
 */

const business = (overrides = {}) => ({
  id: 'biz-a',
  business_ref: 'BIZ-A',
  name: 'Alpha PG',
  module_type: 'pg_hostels',
  approval_status: 'approved',
  is_enabled: true,
  role: 'staff',
  module_enabled: true,
  module_approval_status: 'approved',
  listing_count: 0,
  allowed_modules: ['pg_hostels'],
  allowed_sections: {},
  ...overrides,
});

const evaluate = (row, path = '/api/provider/listings', options = {}) => evaluateProviderBusinessContext({
  role: 'provider',
  path,
  business: row,
  permission: permissionForProviderRoute('GET', path),
  strictDefaults: true,
  ...options,
});

test('1. a single active business is selected automatically', () => {
  const rows = [business()];
  assert.equal(needsBusinessChoice(rows), false);
  assert.equal(preferredBusinessId(rows), 'biz-a');
  assert.equal(resolveBusinessSelection(rows, ''), 'biz-a');
  assert.equal(resolveBusinessSelection(rows, null), 'biz-a');
  assert.equal(businessLabel(rows[0]), 'Alpha PG · PG & Hostels');
  assert.equal(evaluate({ ...business(), member_modules: ['pg_hostels'] }).ok, true);
});

test('2. several businesses require an explicit choice and are all offered', () => {
  const rows = [
    business({ id: 'biz-b', name: 'Beta PG', created: 2 }),
    business({ id: 'biz-a', name: 'Alpha PG', created: 1 }),
  ];
  assert.equal(needsBusinessChoice(rows), true);
  // Deterministic: the first operational PG business in server order.
  assert.equal(preferredBusinessId(rows), 'biz-b');
  assert.equal(businessLabel(rows[0]), 'Beta PG · PG & Hostels');
  assert.deepEqual(rows.map((row) => row.id), ['biz-b', 'biz-a']);
});

test('3. the selected business is sent on every provider request', () => {
  const headers = providerContextHeaders('biz-a', { Authorization: 'Bearer token' });
  assert.equal(headers['x-business-id'], 'biz-a');
  assert.equal(headers.Authorization, 'Bearer token');
  assert.equal(headers.Accept, 'application/json');
  // A blank selection is omitted rather than guessed.
  assert.equal('x-business-id' in providerContextHeaders('', {}), false);
  assert.equal('x-business-id' in providerContextHeaders(undefined, {}), false);
});

test('4. a membership the server no longer reports is not kept selected', () => {
  const remaining = [business({ id: 'biz-a' })];
  // The browser still remembers the revoked business; it must be dropped.
  assert.equal(resolveBusinessSelection(remaining, 'biz-revoked'), 'biz-a');
  const notice = noticeForProviderError('BUSINESS_ACCESS_DENIED', { hasBusinesses: true, businessCount: 1 });
  assert.equal(notice.kind, 'denied');
  assert.equal(notice.action, 'refresh-memberships');
  // A suspended business is not "operational", so it is never auto-selected
  // ahead of a working one, and its label says why.
  const suspended = business({ id: 'biz-s', approval_status: 'suspended' });
  assert.equal(isBusinessOperational(suspended), false);
  assert.equal(businessApprovalLabel(suspended), 'suspended');
  assert.equal(preferredBusinessId([suspended, business({ id: 'biz-a' })]), 'biz-a');
});

test('5. a member without a grant is told permissions are required', () => {
  const decision = evaluate({ ...business(), member_modules: null });
  assert.deepEqual(decision, { ok: false, status: 403, error: 'BUSINESS_PERMISSIONS_REQUIRED' });
  const notice = noticeForProviderError('BUSINESS_PERMISSIONS_REQUIRED');
  assert.equal(notice.kind, 'permission');
  assert.equal(notice.action, 'contact-admin');
  assert.match(notice.description, /User Permissions/);
});

test('6. a valid grant opens the workspace', () => {
  assert.equal(evaluate({ ...business(), member_modules: ['pg_hostels'], member_sections: {}, member_actions: {} }).ok, true);
  assert.equal(evaluate({ ...business(), member_modules: ['pg_hostels'], member_sections: null, member_actions: null }).ok, true);
});

test('7. one business\'s grant never authorizes another business or module', () => {
  // A grant recorded for the PG business, evaluated against a stays business.
  const crossModule = evaluate(
    { ...business({ module_type: 'hotel_stay' }), member_modules: ['pg_hostels'] },
    '/api/stays/host/properties',
  );
  assert.deepEqual(crossModule, { ok: false, status: 403, error: 'BUSINESS_MODULE_FORBIDDEN' });

  // Section/action grants stay inside their module: a bookings-only member of
  // the PG business cannot reach the calendar section.
  const crossSection = evaluate(
    { ...business(), member_modules: ['pg_hostels'], member_sections: { pg_hostels: ['calendar'] }, member_actions: { pg_hostels: ['view'] } },
    '/api/pg/bookings',
  );
  assert.deepEqual(crossSection, { ok: false, status: 403, error: 'BUSINESS_SECTION_FORBIDDEN' });

  // And a business the server says is not approved is denied outright.
  assert.deepEqual(
    evaluate({ ...business({ approval_status: 'pending' }) }),
    { ok: false, status: 403, error: 'BUSINESS_ACCESS_DENIED' },
  );
});

test('8. no memberships gives a clear onboarding state', () => {
  assert.equal(preferredBusinessId([]), '');
  assert.equal(resolveBusinessSelection([], 'anything'), '');
  assert.equal(needsBusinessChoice([]), false);
  const notice = noticeForProviderError('BUSINESS_CONTEXT_REQUIRED', { hasBusinesses: false, businessCount: 0 });
  assert.equal(notice.kind, 'select-business');
  assert.equal(notice.action, 'refresh-memberships');
  assert.match(notice.description, /Create a business or accept an invitation/);
});

test('9. a stale response for the previous business cannot win', () => {
  const guard = createLatestRequestGuard();
  const forBusinessA = guard.begin();
  const forBusinessB = guard.begin(); // the user switched while A was in flight
  assert.equal(guard.isLatest(forBusinessA), false);
  assert.equal(guard.isLatest(forBusinessB), true);
  const later = guard.begin();
  assert.equal(guard.isLatest(forBusinessB), false);
  assert.equal(guard.isLatest(later), true);
});

test('10. the single-business provider flow is unchanged', () => {
  // With the flag off, the legacy implicit access still applies.
  const legacy = evaluateProviderBusinessContext({
    role: 'provider',
    path: '/api/provider/listings',
    business: { ...business(), member_modules: null },
    permission: permissionForProviderRoute('GET', '/api/provider/listings'),
    strictDefaults: false,
  });
  assert.deepEqual(legacy, { ok: true });
  // Owners are never restricted by a grant row.
  assert.deepEqual(evaluate({ ...business({ role: 'owner' }), member_modules: null }), { ok: true });
  // The flags are read from the environment, not hard-coded.
  assert.equal(strictPermissionDefaults({ BOS_STRICT_PERMISSION_DEFAULTS: '1' }), true);
  assert.equal(strictPermissionDefaults({}), false);
});
