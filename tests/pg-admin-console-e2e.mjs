import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Actual Admin console browser journey against the throwaway PostgreSQL server
 * owned by run_pg_integration.sh. Authentication is a signed local fixture;
 * this does not exercise Google OAuth or a hosted Supabase project.
 */
const [, , apiBase, sessionSecret, customerId, applicantId, adminId, distDirectory] = process.argv;
if (![apiBase, sessionSecret, customerId, applicantId, adminId, distDirectory].every(Boolean)) {
  throw new Error('Expected API base, local session secret, customer/applicant/admin UUIDs, and fresh Vite build directory.');
}

function session(userId, email, role) {
  const payload = Buffer.from(JSON.stringify({
    userId: `LOCAL-${role}`,
    supabaseUserId: userId,
    email,
    name: `Local ${role}`,
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60 * 60 * 1000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', `${sessionSecret}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

const customerToken = session(customerId, 'customer@example.test', 'customer');
const applicantToken = session(applicantId, 'customer.b@example.test', 'customer');
const adminToken = session(adminId, 'admin@example.test', 'admin');
const businessName = `Browser PG Provider ${crypto.randomUUID().slice(0, 8)}`;
const listingTitle = `Browser Approved PG ${crypto.randomUUID().slice(0, 8)}`;
const listingId = `pg-admin-${crypto.randomUUID()}`;

const ui = express();
ui.use(express.json());
ui.use(async (request, response, next) => {
  if (!request.path.startsWith('/api/')) return next();
  try {
    const upstream = await fetch(`${apiBase}${request.originalUrl}`, {
      method: request.method,
      headers: {
        accept: request.get('accept') || 'application/json',
        ...(request.get('content-type') ? { 'content-type': request.get('content-type') } : {}),
        ...(request.get('authorization') ? { authorization: request.get('authorization') } : {}),
      },
      ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: JSON.stringify(request.body ?? {}) }),
    });
    response.status(upstream.status);
    response.type(upstream.headers.get('content-type') || 'application/json');
    response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    response.status(502).json({ ok: false, error: 'LOCAL_E2E_API_PROXY_FAILED' });
  }
});
ui.use(express.static(path.resolve(distDirectory), { fallthrough: true }));
ui.get('*', (_request, response) => response.sendFile(path.join(path.resolve(distDirectory), 'index.html')));
const uiServer = await new Promise((resolve, reject) => {
  const server = ui.listen(0, '127.0.0.1', () => resolve(server));
  server.once('error', reject);
});
const uiUrl = `http://127.0.0.1:${uiServer.address().port}`;
let browser;
let customerContext;
let applicantContext;
let adminContext;
let providerContext;

async function contextWithSession(token, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((value) => localStorage.setItem('bos_session_token_v1', value), token);
  return context;
}

async function assertApi(page, route, method, token, body) {
  return page.evaluate(async ({ route, method, token, body }) => {
    const response = await fetch(route, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { route, method, token, body });
}

async function gotoMarketplace(page, hash) {
  await page.goto(`${uiUrl}/${hash}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#root > *', { state: 'attached', timeout: 30_000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Loading BookOurSpace'), null, { timeout: 30_000 }).catch(() => undefined);
}

function futureDate(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

try {
  browser = await chromium.launch({ headless: true });

  // Customer-facing provider application form.
  applicantContext = await contextWithSession(applicantToken);
  const applicantPage = await applicantContext.newPage();
  await gotoMarketplace(applicantPage, '');
  await applicantPage.getByTitle('Post Free Listing').click();
  const applicationDialog = applicantPage.getByRole('dialog', { name: 'Register your business' });
  await applicationDialog.waitFor({ timeout: 20_000 });
  await applicationDialog.getByLabel('Provider module').selectOption('pg_hostels');
  await applicationDialog.getByLabel('Business name').fill(businessName);
  await applicationDialog.getByLabel('Business contact phone').fill('+91 90000 55667');
  await applicationDialog.getByLabel('City').fill('E2E Test City');
  await applicationDialog.getByLabel('Area / locality').fill('Browser Test Area');
  await applicationDialog.getByRole('button', { name: 'Submit provider application' }).click();
  await applicationDialog.getByRole('status').filter({ hasText: 'Pending administrator review.' }).waitFor({ timeout: 20_000 });
  console.log('PASS provider submits a PG application in the real customer UI');

  // Admin activates the applicant using the actual Super Admin console.
  adminContext = await contextWithSession(adminToken);
  const adminPage = await adminContext.newPage();
  await gotoMarketplace(adminPage, '');
  await adminPage.getByTitle('Open All Sections & Quick Menu').click();
  await adminPage.getByRole('banner').getByRole('button', { name: 'Admin', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'BookOurSpace Admin Console' }).waitFor({ timeout: 45_000 });

  // Exercise the protected management workspace across the same responsive
  // widths as the public marketplace. These are real local Admin fixtures;
  // the API and PostgreSQL authorization remain in the loop.
  const protectedWidths = [320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920];
  const protectedSections = [
    'User Management', 'Payment Management', 'Ad Management', 'Analytics & Performance',
    'Reports & Analytics', 'Theme Management', 'Integrations', 'Data Management',
    'Announcements & Status', 'Dashboard Overview', 'Content Management', 'Listings & Venues',
    'PGs & Hostels', 'Bookings & Events', 'Feature Management', 'Audit Logs & Trail',
    'Notifications Mgmt', 'App Settings & Audit',
  ];
  const adminMenu = adminPage.locator('aside').filter({ hasText: 'Super Admin Menu' });
  const screenshotDirectory = process.env.BOS_E2E_SCREENSHOT_DIR;
  if (screenshotDirectory) fs.mkdirSync(screenshotDirectory, { recursive: true });
  for (const width of protectedWidths) {
    await adminPage.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    const layout = await adminPage.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      consoleVisible: Boolean(document.querySelector('h1')),
    }));
    assert.ok(layout.consoleVisible, `Admin console remains rendered at ${width}px`);
    assert.ok(layout.document <= layout.viewport + 2,
      `Admin console has no horizontal page overflow at ${width}px (${layout.document}/${layout.viewport})`);
    if (screenshotDirectory && [390, 820, 1440].includes(width)) {
      await adminPage.screenshot({
        path: path.join(screenshotDirectory, `admin-${width}.png`),
        fullPage: true,
      });
    }
    for (const section of protectedSections) {
      const sectionButton = adminMenu.getByRole('button', { name: new RegExp(`^${section}`) }).first();
      // At narrow widths the sticky marketplace header can cover the admin
      // sidebar's top edge when Playwright aligns a target to the viewport
      // boundary. Center it before clicking so this responsive regression
      // checks the button itself rather than a sticky-header hit-test race.
      await sectionButton.evaluate((button) => button.scrollIntoView({ block: 'center', inline: 'nearest' }));
      await sectionButton.click();
      const sectionLayout = await adminPage.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        bodyTextLength: document.body.innerText.trim().length,
      }));
      assert.ok(sectionLayout.bodyTextLength > 200,
        `${section} remains rendered at ${width}px`);
      assert.ok(sectionLayout.document <= sectionLayout.viewport + 2,
        `${section} has no horizontal page overflow at ${width}px (${sectionLayout.document}/${sectionLayout.viewport})`);
    }
  }
  await adminPage.setViewportSize({ width: 1440, height: 900 });
  await adminPage.getByRole('button', { name: /Listings & Venues/ }).click();
  const registrations = adminPage.getByRole('region', { name: 'Provider applications' });
  const registration = registrations.locator('article').filter({ hasText: businessName });
  await registration.waitFor({ timeout: 30_000 });
  await registration.getByRole('button', { name: 'Activate provider' }).click();
  await adminPage.getByRole('status').filter({ hasText: 'Provider access was activated in PostgreSQL' }).waitFor({ timeout: 20_000 });
  console.log('PASS Admin console activates provider application through server-authorized action');

  // The server issues a refreshed provider session from the persisted profile.
  const refreshed = await assertApi(applicantPage, '/api/auth/me', 'GET', applicantToken);
  assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
  assert.equal(refreshed.body?.user?.role, 'provider');
  assert.ok(refreshed.body?.sessionToken);
  await applicantPage.evaluate((token) => localStorage.setItem('bos_session_token_v1', token), refreshed.body.sessionToken);

  const created = await assertApi(applicantPage, '/api/provider/listings', 'POST', refreshed.body.sessionToken, {
    id: listingId,
    requestId: crypto.randomUUID(),
    categoryId: 'pg-boys',
    subcategory: 'Single Sharing',
    entityType: 'pg',
    title: listingTitle,
    price: 8000,
    priceUnit: 'per month',
    payload: { location: { city: 'E2E Test City', area: 'Browser Test Area' } },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body?.listing?.status, 'pending_approval');
  console.log('PASS activated owner creates a pending PG listing through the real API');

  // Listing publication is a separate explicit Admin console action.
  await adminPage.getByRole('button', { name: 'Dashboard Overview' }).click();
  await adminPage.getByRole('button', { name: /Listings & Venues/ }).click();
  const listingRow = adminPage.locator('article').filter({ hasText: listingTitle });
  await listingRow.waitFor({ timeout: 30_000 });
  await listingRow.getByRole('button', { name: 'Approve listing' }).click();
  await adminPage.getByRole('status').filter({ hasText: 'Admin review saved as active' }).waitFor({ timeout: 20_000 });
  const publicListing = await assertApi(adminPage, `/api/marketplace/listings/${encodeURIComponent(listingId)}`, 'GET', adminToken);
  assert.equal(publicListing.status, 200, JSON.stringify(publicListing.body));
  console.log('PASS Admin console approves listing; the listing then appears on the public feed');

  // The owner can now reach the same PostgreSQL editor directly from the
  // authenticated provider portal, without navigating the customer catalogue.
  providerContext = await contextWithSession(refreshed.body.sessionToken);
  const providerPage = await providerContext.newPage();
  await gotoMarketplace(providerPage, '');
  await providerPage.getByRole('button', { name: /Provider Hub/ }).click();
  await providerPage.getByRole('heading', { name: /Provider & Seller Hub/ }).waitFor({ timeout: 20_000 });
  await providerPage.getByTestId('provider-pg-inventory-tab').click();
  const providerPgCard = providerPage.getByTestId(`provider-pg-listing-${listingId}`);
  await providerPgCard.waitFor({ timeout: 20_000 });
  const providerInventoryEditor = providerPgCard.locator('details').filter({ has: providerPage.getByText('Manage room and bed inventory') });
  await providerInventoryEditor.locator('summary').click();
  await providerInventoryEditor.getByRole('button', { name: 'Add room type' }).click();
  await providerInventoryEditor.getByLabel('Room / sharing type').fill('Provider Portal Twin Sharing');
  await providerInventoryEditor.getByLabel('Monthly rent (₹)').fill('9000');
  await providerInventoryEditor.getByLabel('Security deposit (₹)').fill('12000');
  await providerInventoryEditor.getByLabel('Occupants per bed').fill('2');
  await providerInventoryEditor.getByLabel('Bed labels, comma-separated').fill('Portal Bed A, Portal Bed B');
  await providerInventoryEditor.getByRole('button', { name: 'Create room type' }).click();
  await providerPgCard.getByRole('status').filter({ hasText: 'Availability now comes from PostgreSQL' }).waitFor({ timeout: 20_000 });
  await providerPgCard.getByText('Provider Portal Twin Sharing', { exact: true }).waitFor();
  await providerInventoryEditor.getByLabel('Room type to edit').selectOption({ label: 'Provider Portal Twin Sharing · 2 bed(s)' });
  await providerInventoryEditor.getByLabel('Monthly rent (₹)').fill('9500');
  await providerInventoryEditor.getByRole('button', { name: 'Save inventory' }).click();
  await providerPgCard.getByRole('status').filter({ hasText: 'Availability now comes from PostgreSQL' }).waitFor({ timeout: 20_000 });
  const updatedProviderInventory = await assertApi(
    providerPage,
    `/api/pg/listings/${encodeURIComponent(listingId)}/inventory?moveIn=${futureDate(30)}&months=1`,
    'GET',
    refreshed.body.sessionToken,
  );
  assert.equal(updatedProviderInventory.status, 200, JSON.stringify(updatedProviderInventory.body));
  assert.equal(updatedProviderInventory.body?.roomTypes?.[0]?.monthlyRentPaise, 950000);
  await providerPgCard.getByLabel('Move-in date').fill(futureDate(30));
  await providerPgCard.getByRole('button', { name: 'Check live availability' }).click();
  await providerPgCard.getByText('2 available of 2 beds', { exact: false }).waitFor({ timeout: 20_000 });
  const providerBlocks = providerPgCard.getByRole('region', { name: 'Block PG bed dates' });
  await providerBlocks.waitFor({ timeout: 20_000 });
  const blockStart = futureDate(90);
  await providerBlocks.getByLabel('Bed to block').selectOption({ label: 'Provider Portal Twin Sharing · Portal Bed A' });
  await providerBlocks.getByLabel('Block start date').fill(blockStart);
  await providerBlocks.getByLabel('Block end date').fill(futureDate(92));
  await providerBlocks.getByLabel('Block reason').fill('Maintenance test');
  await providerBlocks.getByRole('button', { name: 'Block dates' }).click();
  await providerBlocks.getByText(/Portal Bed A.*Maintenance test/).waitFor({ timeout: 15_000 });
  const availabilityWhileBlocked = await assertApi(
    providerPage,
    `/api/pg/listings/${encodeURIComponent(listingId)}/inventory?moveIn=${blockStart}&months=1`,
    'GET',
    refreshed.body.sessionToken,
  );
  assert.equal(availabilityWhileBlocked.body?.roomTypes?.[0]?.availableBeds, 1);
  await providerBlocks.getByRole('button', { name: 'Remove date block for Portal Bed A' }).click();
  await providerBlocks.getByText('No active date blocks.').waitFor({ timeout: 15_000 });
  const availabilityAfterRestore = await assertApi(
    providerPage,
    `/api/pg/listings/${encodeURIComponent(listingId)}/inventory?moveIn=${blockStart}&months=1`,
    'GET',
    refreshed.body.sessionToken,
  );
  assert.equal(availabilityAfterRestore.body?.roomTypes?.[0]?.availableBeds, 2);
  console.log('PASS provider portal blocks and restores bed dates through PostgreSQL with customer availability updates');
  console.log('PASS provider portal loads only actor-owned PG listings, creates/edits rooms and beds, and reads live availability from PostgreSQL');

  // Provider configures actual bed inventory through the PG owner controls.
  await applicantPage.reload({ waitUntil: 'domcontentloaded' });
  await gotoMarketplace(applicantPage, `/#pg/style1`);
  const backToMarketplace = applicantPage.getByRole('button', { name: 'Back to Marketplace', exact: true });
  if (await backToMarketplace.count()) await backToMarketplace.click();
  if (!(await applicantPage.locator('#pg-search').count())) {
    await applicantPage.evaluate(() => { window.location.hash = 'home'; });
    await applicantPage.waitForTimeout(100);
    await applicantPage.evaluate(() => { window.location.hash = 'pg/style1'; });
  }
  const search = applicantPage.locator('#pg-search');
  await search.waitFor({ timeout: 20_000 });
  await search.fill(listingTitle);
  await applicantPage.getByRole('button', { name: `View details for ${listingTitle}` }).click();
  const detail = applicantPage.getByRole('region', { name: 'PG availability and booking' });
  await detail.waitFor();
  const inventoryEditor = detail.locator('details').filter({ has: applicantPage.getByText('Manage room and bed inventory') });
  await inventoryEditor.locator('summary').click();
  await inventoryEditor.getByLabel('Room / sharing type').fill('E2E Single Bed');
  await inventoryEditor.getByLabel('Monthly rent (₹)').fill('8000');
  await inventoryEditor.getByLabel('Security deposit (₹)').fill('16000');
  // Keep this field at the already reviewed value (2). Changing occupancy is
  // a material change and correctly returns the listing to Super Admin
  // review; this journey is testing price/bed inventory after approval.
  await inventoryEditor.getByLabel('Occupants per bed').fill('2');
  await inventoryEditor.getByLabel('Bed labels, comma-separated').fill('E2E Bed 1, E2E Bed 2');
  await inventoryEditor.getByRole('button', { name: 'Save inventory' }).click();
  await detail.getByRole('status').filter({ hasText: 'Availability now comes from PostgreSQL' }).waitFor({ timeout: 20_000 });
  console.log('PASS owner creates two beds and server pricing through the PG inventory UI');

  // Separate customer reserves, records Pay Later, cancels, and releases inventory.
  customerContext = await contextWithSession(customerToken, { width: 390, height: 844 });
  const customerPage = await customerContext.newPage();
  await gotoMarketplace(customerPage, '/#pg/style1');
  const customerFeed = await assertApi(customerPage, '/api/marketplace/listings', 'GET', customerToken);
  const customerListing = customerFeed.body?.listings?.find((listing) => listing.id === listingId);
  assert.equal(customerFeed.status, 200, JSON.stringify(customerFeed.body));
  if (!customerListing) {
    const databaseProbe = spawnSync('psql', [
      '-h', '127.0.0.1', '-p', String(process.env.BOS_TEST_PGPORT || ''), '-U', 'postgres', '-d', String(process.env.BOS_TEST_PGDB || ''),
      '-At', '-v', 'ON_ERROR_STOP=1', '-c',
      `select json_build_object('status',status,'categoryId',category_id,'anonSelect',has_table_privilege('anon','public.listings','select')) from public.listings where id='${listingId}'`,
    ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: '' } });
    console.error('PG customer listing diagnostic:', JSON.stringify({
      sqlExit: databaseProbe.status,
      sqlRow: databaseProbe.stdout.trim(),
      sqlError: databaseProbe.stderr.trim(),
      feed: customerFeed.body?.listings?.map((listing) => ({ id: listing.id, title: listing.title, status: listing.status, categoryId: listing.categoryId })),
    }));
  }
  assert.ok(customerListing, `approved listing missing from customer PostgreSQL feed: ${JSON.stringify(customerFeed.body?.listings?.map((listing) => ({ id: listing.id, title: listing.title, status: listing.status, categoryId: listing.categoryId })))}`);
  await customerPage.locator('#pg-search').fill(listingTitle);
  await customerPage.getByRole('button', { name: `View details for ${listingTitle}` }).waitFor({ timeout: 20_000 });
  await customerPage.getByRole('button', { name: `View details for ${listingTitle}` }).click();
  const customerDetail = customerPage.getByRole('region', { name: 'PG availability and booking' });
  await customerDetail.waitFor();
  await customerPage.getByLabel('Move-in date').fill(futureDate(20));
  await customerPage.getByRole('button', { name: 'Check live availability' }).click();
  await customerPage.getByText('2 available of 2 beds').waitFor({ timeout: 15_000 });
  await customerPage.getByRole('button', { name: 'Reserve beds' }).click();
  await customerDetail.getByRole('status').filter({ hasText: /Reservation .* confirmed/ }).waitFor({ timeout: 20_000 });
  await customerPage.getByRole('button', { name: 'Pay at the property' }).click();
  await customerPage.getByRole('status').filter({ hasText: 'does not collect or verify this payment' }).waitFor({ timeout: 10_000 });
  await customerPage.getByRole('dialog').getByRole('button', { name: 'All PGs', exact: true }).click();
  await customerPage.getByRole('navigation', { name: 'Bottom Navigation' }).getByRole('button').nth(2).click();
  const bookings = customerPage.getByRole('region', { name: 'PG bookings' });
  const reservation = bookings.locator('article').filter({ hasText: listingTitle });
  await reservation.waitFor({ timeout: 15_000 });
  await reservation.getByRole('button', { name: 'Cancel reservation' }).click();
  await bookings.getByRole('status').filter({ hasText: /cancelled.*0.*refunded/i }).waitFor({ timeout: 15_000 });
  console.log('PASS customer books unpaid, sees My Bookings, cancels without a refund claim');

  const providerBookings = providerPage.getByRole('region', { name: 'PG bookings' });
  await providerBookings.getByRole('button', { name: 'Refresh', exact: true }).click();
  const ownerReservation = providerBookings.locator('article').filter({ hasText: listingTitle });
  await ownerReservation.waitFor({ timeout: 15_000 });
  await ownerReservation.getByText('cancelled', { exact: true }).waitFor({ timeout: 15_000 });
  console.log('PASS provider portal refreshes and displays its PostgreSQL-backed resident booking lifecycle');

  await customerPage.goto(`${uiUrl}/#pg/style1`, { waitUntil: 'domcontentloaded' });
  await customerPage.locator('#pg-search').fill(listingTitle);
  await customerPage.getByRole('button', { name: `View details for ${listingTitle}` }).click();
  const availability = customerPage.getByRole('region', { name: 'PG availability and booking' });
  await customerPage.getByLabel('Move-in date').fill(futureDate(20));
  await customerPage.getByRole('button', { name: 'Check live availability' }).click();
  await customerPage.getByText('2 available of 2 beds').waitFor({ timeout: 15_000 });
  console.log('PASS cancellation returns both beds to live PostgreSQL availability');
} finally {
  await customerContext?.close();
  await applicantContext?.close();
  await providerContext?.close();
  await adminContext?.close();
  await browser?.close();
  uiServer.closeAllConnections?.();
  await new Promise((resolve) => uiServer.close(resolve));
}
