/**
 * Source-level guards for the customer module access feature.
 *
 * These keep the security shape from silently regressing: the migration must
 * keep customers from self-granting, the admin surface must exist, and the
 * client must filter modules + block direct section URLs.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('the migration protects grant rows and provides an authoritative RPC', async () => {
  const migration = await read('supabase/migrations/20261112230000_customer_module_access.sql');
  assert.match(migration, /create table if not exists public\.customer_module_access/);
  assert.match(migration, /create table if not exists public\.customer_module_access_audit/);
  assert.match(migration, /Customers read their own module access/);
  assert.match(migration, /Admins manage customer module access/);
  assert.match(migration, /effective_customer_module_keys/);
  assert.match(migration, /has_customer_module_access/);
  // There must be no customer insert policy for the grant table.
  assert.doesNotMatch(migration, /for insert to authenticated\s+using \(auth\.uid\(\) = user_id\)/i);
});

test('the admin console exposes a Customer Module Access section', async () => {
  const dashboard = await read('src/components/AdminDashboard.tsx');
  assert.match(dashboard, /customer_module_access/);
  assert.match(dashboard, /Customer Module Access/);
  const component = await read('src/components/AdminCustomerModuleAccess.tsx');
  assert.match(component, /saveAdminCustomerModuleAccess/);
  assert.match(component, /revokeAdminCustomerModuleAccess/);
  assert.match(component, /Audit history/);
  assert.match(component, /CUSTOMER_VISIBLE_MODULE_KEYS/);
});

test('the customer surface filters modules and blocks direct section URLs', async () => {
  const app = await read('src/App.tsx');
  assert.match(app, /customerAuthorizedSections/);
  assert.match(app, /canEnterSection/);
  assert.match(app, /This module is not available for your account/);
  assert.match(app, /authorizedSections=\{customerAuthorizedSections\}/);

  const tabs = await read('src/components/SpotlightModuleTabs.tsx');
  assert.match(tabs, /authorizedSections/);
  const header = await read('src/components/CraftoTopServicesBar.tsx');
  assert.match(header, /authorizedSections/);
});

test('the shared module meta maps every customer-facing section', async () => {
  const meta = await read('src/lib/customerModuleMeta.ts');
  assert.match(meta, /pg_hostels/);
  assert.match(meta, /hotel_stay/);
  assert.match(meta, /function_hall/);
  assert.match(meta, /section: 'venues'/);
  assert.match(meta, /moduleKeyForSection/);
});
