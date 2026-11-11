import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('PG owner dashboard is a BookOurSpace-branded, grouped workspace', () => {
  const dashboard = source('src/components/pg/PgOwnerDashboard.tsx');
  const provider = source('src/components/ProviderDashboard.tsx');
  assert.match(provider, /pg_owner/);
  assert.match(provider, /<PgOwnerDashboard/);
  for (const label of ['Dashboard', 'Dues', 'Collections', 'Expenses', 'Disputes', 'Leads', 'Bookings', 'Tenants', 'Staff', 'Rooms & Beds', 'Properties', 'Listings', 'Complaints', 'Requests', 'Food menu', 'Notices', 'Reviews', 'Community', 'Reports', 'Plan & billing', 'Settings']) {
    assert.match(dashboard, new RegExp(label.replace(/[&]/g, '\\&')), label);
  }
  assert.match(dashboard, /BookOurSpace/);
  assert.doesNotMatch(dashboard, /OnlyPGs|onlypgs/i);
  assert.match(dashboard, /PgProviderWorkspace/);
  assert.match(dashboard, /PgMyBookingsPanel/);
});

test('PG owner dashboard does not invent tenant or money counts', () => {
  const dashboard = source('src/components/pg/PgOwnerDashboard.tsx');
  assert.match(dashboard, /confirmedBookings\.reduce/);
  assert.match(dashboard, /money\(0\)/);
  assert.match(dashboard, /No tenants yet/);
  assert.match(dashboard, /No expenses recorded/);
});
