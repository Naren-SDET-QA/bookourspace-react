import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
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
  await adminPage.getByRole('heading', { name: 'BookOurSpace Super Admin Console' }).waitFor({ timeout: 45_000 });
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
  await inventoryEditor.getByLabel('Occupants per bed').fill('1');
  await inventoryEditor.getByLabel('Bed labels, comma-separated').fill('E2E Bed 1, E2E Bed 2');
  await inventoryEditor.getByRole('button', { name: 'Save inventory' }).click();
  await detail.getByRole('status').filter({ hasText: 'Availability now comes from PostgreSQL' }).waitFor({ timeout: 20_000 });
  console.log('PASS owner creates two beds and server pricing through the PG inventory UI');

  // Separate customer reserves, records Pay Later, cancels, and releases inventory.
  customerContext = await contextWithSession(customerToken, { width: 390, height: 844 });
  const customerPage = await customerContext.newPage();
  await gotoMarketplace(customerPage, '/#pg/style1');
  await customerPage.locator('#pg-search').fill(listingTitle);
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
  await adminContext?.close();
  await browser?.close();
  uiServer.closeAllConnections?.();
  await new Promise((resolve) => uiServer.close(resolve));
}
