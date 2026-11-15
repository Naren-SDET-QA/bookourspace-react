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
  const adminHashBlock = source.slice(
    source.indexOf("hash === 'admin' || hash.startsWith('admin/')"),
    source.indexOf("hash === 'admin' || hash.startsWith('admin/')") + 400
  );
  assert.ok(adminHashBlock.includes('if (!isAdminSession)'), 'admin hash must be guarded by an admin session');
  assert.ok(
    !/hash === 'admin'[\s\S]{0,80}setUserRole\('admin'\);\s*setActiveView\('admin_console'\);/.test(
      source.slice(source.indexOf("hash === 'admin'"), source.indexOf("hash === 'admin'") + 200)
    ),
    'the admin hash must not grant the admin role unconditionally'
  );
});
