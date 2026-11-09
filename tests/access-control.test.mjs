import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canAccessAdminConsole,
  canAccessProviderPortal,
  protectedViewFallback,
} from '../src/lib/accessControl.ts';

test('admin console is reachable only by an admin role', () => {
  assert.equal(canAccessAdminConsole('admin'), true);
  for (const role of ['customer', 'provider', 'super_admin', 'ADMIN', '', null, undefined, 'Admin ']) {
    assert.equal(canAccessAdminConsole(role), false, `role ${String(role)} must not open the admin console`);
  }
});

test('provider portal excludes customers and signed-out viewers', () => {
  assert.equal(canAccessProviderPortal('provider'), true);
  assert.equal(canAccessProviderPortal('admin'), true);
  for (const role of ['customer', '', null, undefined, 'guest']) {
    assert.equal(canAccessProviderPortal(role), false);
  }
});

test('refused protected views fall back without granting a role', () => {
  assert.equal(protectedViewFallback('provider'), 'provider_portal');
  assert.equal(protectedViewFallback('admin'), 'marketplace');
  assert.equal(protectedViewFallback('customer'), 'marketplace');
  assert.equal(protectedViewFallback(null), 'marketplace');
  assert.equal(protectedViewFallback(undefined), 'marketplace');
});

test('a hash deep link cannot manufacture an admin role', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const adminStart = source.indexOf("hash === 'admin' || hash.startsWith('admin/')");
  assert.ok(adminStart > 0, 'the admin hash branch must exist');
  // Slice to the branch boundary instead of a fixed character window so a
  // descriptive comment can never hide (or accidentally satisfy) the guard.
  const adminEnd = source.indexOf("} else if (!hash.startsWith('venue-'))", adminStart);
  assert.ok(adminEnd > adminStart, 'the admin hash branch must end before the fallback branch');
  const adminHashBlock = source.slice(adminStart, adminEnd);

  const guardIndex = adminHashBlock.indexOf('if (!isAdminSession)');
  assert.ok(guardIndex > 0, 'admin hash must be guarded by an admin session');

  // The role and console view may only be granted after the guard, never as an
  // unconditional side effect of the hash itself.
  const beforeGuard = adminHashBlock.slice(0, guardIndex);
  assert.ok(
    !/setUserRole\('admin'\)/.test(beforeGuard),
    'the admin hash must not grant the admin role before the session guard'
  );
  assert.ok(
    !/setActiveView\('admin_console'\)/.test(beforeGuard),
    'the admin hash must not open the console before the session guard'
  );
});
