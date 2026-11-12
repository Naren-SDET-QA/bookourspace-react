import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const component = await readFile(new URL('../src/components/ServicesProviderDashboard.tsx', import.meta.url), 'utf8');
const staysComponent = await readFile(new URL('../src/components/StaysOwnerAdminDashboard.tsx', import.meta.url), 'utf8');
const pgCategories = await readFile(new URL('../src/data/moduleCategories.ts', import.meta.url), 'utf8');
const postListingWizard = await readFile(new URL('../src/components/PostListingWizard.tsx', import.meta.url), 'utf8');
const commerceClient = await readFile(new URL('../src/lib/serviceCommerceClient.ts', import.meta.url), 'utf8');
const bookingClient = await readFile(new URL('../src/lib/servicesBookingClient.ts', import.meta.url), 'utf8');

test('services owner workspace exposes real operational sections', () => {
  for (const label of ['Bookings & jobs', 'Workers', 'Schedule', 'Payments', 'Reports', 'Settings']) assert.match(component, new RegExp(label.replace('&', '\\&')));
  assert.match(component, /serviceSections/);
  assert.match(component, /fetchProviderPortalOverview/);
  assert.match(component, /ServiceOperationsWorkspace/);
});

test('services owner actions use server-backed clients', () => {
  assert.match(component, /createServiceWorker/);
  assert.match(component, /updateProviderSchedule/);
  assert.match(component, /blockProviderDate/);
  assert.match(component, /Export CSV/);
  assert.match(commerceClient, /\/api\/services\/provider\/schedule/);
  assert.match(commerceClient, /\/api\/services\/provider\/blackouts/);
  assert.match(bookingClient, /\/api\/services\/workers/);
});

test('owner workspaces render no duplicate nested navigation', () => {
  assert.doesNotMatch(component, /aria-label="Services workspace navigation"/);
  assert.doesNotMatch(staysComponent, /aria-label="Stay owner navigation"/);
  assert.doesNotMatch(staysComponent, /aria-label="Stay owner section"/);
});

test('owner sections are exposed to the shared provider navigation', async () => {
  const provider = await readFile(new URL('../src/components/ProviderDashboard.tsx', import.meta.url), 'utf8');
  assert.match(staysComponent, /export const stayOwnerSections/);
  assert.match(component, /export const serviceSections/);
  assert.match(staysComponent, /section\?: StayOwnerSection/);
  assert.match(component, /section\?: ServiceView/);
  assert.match(provider, /stayOwnerSections/);
  assert.match(provider, /serviceSections/);
  assert.match(provider, /Stay hosting sections/);
  assert.match(provider, /Home services sections/);
  assert.match(provider, /section=\{activeStaySection\}/);
  assert.match(provider, /section=\{activeServiceSection\}/);
});

test('owner controls stay touch-safe at narrow widths', () => {
  for (const source of [component, staysComponent]) assert.match(source, /min-h-1[01]/);
  assert.match(component, /sm:grid-cols-2/);
  assert.match(staysComponent, /sm:grid-cols-3/);
});

test('stays owner workspace exposes responsive operational navigation', () => {
  for (const label of ['Properties', 'Rooms & rates', 'Calendar', 'Reservations', 'Payments', 'Sell PG', 'Reports', 'Settings']) assert.match(staysComponent, new RegExp(label.replace('&', '\\&')));
  assert.match(staysComponent, /export const stayOwnerSections/);
  assert.match(staysComponent, /fetchProviderPortalOverview/);
  assert.match(staysComponent, /HostStayWorkspace/);
  assert.match(staysComponent, /stay-owner-inventory/);
});

test('PG sale workflow uses the authenticated provider listing path', () => {
  assert.match(staysComponent, /categoryId: 'pg-property-sale'/);
  assert.match(staysComponent, /transactionType: 'For Sale'/);
  assert.match(staysComponent, /saveServerProviderListing\(null/);
  assert.match(staysComponent, /pending admin review/);
  assert.match(pgCategories, /id: 'pg-property-sale'/);
  assert.match(postListingWizard, /For the complete property \(sale\)/);
});

test('provider deep links normalize the legacy provider_portal1 alias', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /hash === 'provider_portal1'/);
  assert.match(app, /#provider_portal`/);
});

test('Google profile dialog stays aligned at zoom and narrow heights', async () => {
  const bar = await readFile(new URL('../src/components/CraftoTopServicesBar.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(bar, /data-testid="bos-google-profile-modal"/);
  assert.match(bar, /bos-auth-modal__panel/);
  assert.match(bar, /min-\[420px\]:grid-cols-3/);
  assert.match(css, /\.bos-auth-modal__panel/);
  assert.match(css, /max-block-size: min\(860px/);
});
