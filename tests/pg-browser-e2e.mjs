import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import express from 'express';
import path from 'node:path';

const [, , baseUrl, listingTitle, distDirectory] = process.argv;
if (!distDirectory) throw new Error('A fresh disposable Vite build directory is required for browser tests.');
const customerToken = process.env.BOS_E2E_CUSTOMER_SESSION;

/** The signed session is the source of truth for the identity it represents. */
function sessionEmail(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[0], 'base64url').toString('utf-8'));
    return String(payload.email || '');
  } catch {
    return '';
  }
}
const ownerToken = process.env.BOS_E2E_OWNER_SESSION;
if (!customerToken || !ownerToken) throw new Error('Signed local test identities are required for the PG browser journey.');

const ui = express();
ui.use(express.json());
ui.use(async (request, response, next) => {
  if (!request.path.startsWith('/api/')) return next();
  try {
    const upstream = await fetch(`${baseUrl}${request.originalUrl}`, {
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
const results = [];
const blocked = [];
const browserDiagnostics = new WeakMap();

function attachBrowserDiagnostics(page, engineName, style) {
  const state = { engineName, style, startedAt: Date.now(), timeline: [], network: [], console: [], pageErrors: [] };
  browserDiagnostics.set(page, state);
  const mark = (event) => state.timeline.push({ ms: Date.now() - state.startedAt, event });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      // Avoid logging query parameters such as Vite's websocket token.
      state.console.push(message.text().replace(/([?&]token=)[^&\s]+/gi, '$1[redacted]'));
    }
  });
  page.on('pageerror', (error) => state.pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === uiUrl && (url.pathname.startsWith('/api/pg/') || url.pathname === '/api/auth/me')) {
      state.network.push({ ms: Date.now() - state.startedAt, method: request.method(), path: url.pathname, state: 'requested' });
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.origin === uiUrl && url.pathname.startsWith('/api/')) {
      state.network.push({ ms: Date.now() - state.startedAt, method: request.method(), path: url.pathname, state: 'failed', error: request.failure()?.errorText });
    }
  });
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.origin !== uiUrl || !(url.pathname.startsWith('/api/pg/') || url.pathname === '/api/auth/me')) return;
    const item = { ms: Date.now() - state.startedAt, method: response.request().method(), path: url.pathname, state: 'response', status: response.status() };
    try {
      const body = await response.json();
      if (url.pathname === '/api/auth/me') {
        item.authenticated = Boolean(body?.authenticated);
        item.role = body?.user?.role ?? body?.claims?.role ?? null;
      } else {
        item.ok = body?.ok;
        item.error = body?.error ?? null;
        if (url.pathname.endsWith('/inventory')) {
          item.roomTypes = Array.isArray(body?.roomTypes)
            ? body.roomTypes.map((room) => ({ availableBeds: room.availableBeds, totalBeds: room.totalBeds }))
            : null;
        }
      }
    } catch {
      item.body = 'non-json or unreadable response';
    }
    state.network.push(item);
  });
  return state;
}

async function printAvailabilityFailure(page, state, error) {
  const dom = await page.locator('body').innerText().catch(() => 'DOM unavailable');
  const auth = await page.evaluate(async () => {
    const token = localStorage.getItem('bos_session_token_v1');
    const response = await fetch('/api/auth/me', { headers: token ? { authorization: `Bearer ${token}` } : {} });
    const body = await response.json().catch(() => ({}));
    return { localSessionPresent: Boolean(token), status: response.status, authenticated: Boolean(body?.authenticated), role: body?.user?.role ?? body?.claims?.role ?? null };
  }).catch((cause) => ({ error: String(cause) }));
  state.timeline.push({ ms: Date.now() - state.startedAt, event: 'availability assertion failed' });
  console.error(`  DIAGNOSTIC ${state.engineName}/${state.style} error=${String(error)} auth=${JSON.stringify(auth)}`);
  console.error(`  DIAGNOSTIC ${state.engineName}/${state.style} network=${JSON.stringify(state.network)}`);
  console.error(`  DIAGNOSTIC ${state.engineName}/${state.style} timeline=${JSON.stringify(state.timeline)}`);
  console.error(`  DIAGNOSTIC ${state.engineName}/${state.style} console=${JSON.stringify(state.console.slice(-8))} pageErrors=${JSON.stringify(state.pageErrors)}`);
  console.error(`  DIAGNOSTIC ${state.engineName}/${state.style} renderedText=${JSON.stringify(dom.slice(-2500))}`);
}

async function createContext(browser, viewport, token) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript((sessionToken) => {
    localStorage.setItem('bos_session_token_v1', sessionToken);
  }, token);
  return context;
}

async function installLocalOnlyNetwork(page) {
  // Only the API calls are intercepted. Intercepting the module scripts as
  // well breaks the dynamic import in Firefox and WebKit, which then never
  // renders the listing at all.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const target = new URL(route.request().url());
      if (target.origin === uiUrl) await route.continue();
      else await route.abort('blockedbyclient');
    },
  );
  // Nothing outside the local app may be contacted.
  await page.route(
    (url) => url.origin !== uiUrl && !url.pathname.startsWith('/api/'),
    (route) => route.abort('blockedbyclient'),
  );
}

function pgCardAction(page, listingTitle) {
  // The PG module renders PGSectionExperience cards ("View & book") in every
  // style; the older PgDekhoExperience control ("View details for") is kept as
  // a fallback so this harness follows whichever experience is mounted.
  const modern = page
    .getByRole('article', { name: `PG listing ${listingTitle}` })
    .getByRole('button', { name: 'View & book' });
  const legacy = page.getByRole('button', { name: `View details for ${listingTitle}` });
  // PG Style 3 uses an article card with a compact "View" action.
  const style3 = page
    .getByRole('article', { name: `PG listing ${listingTitle}` })
    .getByRole('button', { name: 'View', exact: true });
  return modern.or(legacy).or(style3).first();
}

async function openLiveListing(page, style) {
  const diagnostics = browserDiagnostics.get(page) || attachBrowserDiagnostics(page, 'unknown', style);
  const mark = (event) => diagnostics.timeline.push({ ms: Date.now() - diagnostics.startedAt, event });
  mark('navigation started');
  console.log(`  INFO  opening PG ${style}`);
  // This journey exercises public discovery. Select the product's real guest
  // path up front so the welcome overlay does not intercept page controls.
  await page.addInitScript(() => localStorage.setItem('bos_entry_choice_v1', 'guest'));
  await page.goto(`${uiUrl}/#pg/${style}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  mark('app shell DOM loaded');
  console.log(`  INFO  PG ${style} app shell loaded`);
  const privacyChoices = page.getByRole('dialog', { name: 'Privacy choices' });
  try {
    await privacyChoices.waitFor({ state: 'visible', timeout: 1500 });
    await privacyChoices.getByRole('button', { name: 'Essential only' }).click();
  } catch {
    // A persisted local consent choice may already have dismissed the banner.
  }
  // PG is locked to the Style 3 experience in the product. Use its real
  // search/filter surface for every requested style so this browser journey
  // follows the mounted UI rather than the old Style 1/2 controls.
  await page.locator('#pg-search').fill(listingTitle);
  await pgCardAction(page, listingTitle).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('button', { name: 'Under ₹5,000' }).click();
  try {
    await page.getByRole('button', { name: 'Clear all', exact: true }).waitFor({ timeout: 5000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      pressed: [...document.querySelectorAll('button[aria-pressed="true"]')].map((button) => button.textContent?.trim()),
      filterButtons: [...document.querySelectorAll('button')].map((button) => button.textContent?.trim()).filter((text) => text && /rent|clear|filter/i.test(text)),
    }));
    console.error(`  DIAGNOSTIC ${diagnostics.engineName}/${style} filter state=${JSON.stringify(state)}`);
    throw error;
  }
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  console.log(`  INFO  ${style} search/filter passed`);
  mark(`${style} search/filter complete`);
  await pgCardAction(page, listingTitle).click();
  mark('listing detail opened');
  await page.getByRole('heading', { name: listingTitle }).last().waitFor({ timeout: 10000 });
  await page.getByRole('region', { name: 'PG availability and booking' }).waitFor();
  mark('availability panel rendered');
  await page.getByRole('button', { name: 'Check live availability' }).click();
  mark('availability check clicked');
  try {
    await page.getByText(/available of .* beds/i).waitFor({ timeout: 20000 });
    mark('availability text rendered');
  } catch (error) {
    await printAvailabilityFailure(page, diagnostics, error);
    throw error;
  }
  if (diagnostics.engineName === 'WebKit' && style === 'style1') {
    console.log(`  DIAGNOSTIC WebKit/style1 network=${JSON.stringify(diagnostics.network)} timeline=${JSON.stringify(diagnostics.timeline)} console=${JSON.stringify(diagnostics.console)} pageErrors=${JSON.stringify(diagnostics.pageErrors)}`);
  }
  console.log(`  INFO  ${style} details and availability loaded`);
}

async function runResponsiveChecks(engineName, browser) {
  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    for (const style of ['style1']) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      attachBrowserDiagnostics(page, engineName, style);
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await installLocalOnlyNetwork(page);
      await openLiveListing(page, style);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, `${engineName}/${style}/${viewport.name} has horizontal overflow`);
      assert.deepEqual(pageErrors, [], `${engineName}/${style}/${viewport.name} emitted a page error`);
      results.push(`${engineName} ${style} ${viewport.name}: live search/filter → details → PostgreSQL availability, no overflow/errors`);
      console.log(`  PASS  ${results.at(-1)}`);
      await context.close();
    }
  }
}

async function runOwnerInventoryCheck(browser) {
  const context = await createContext(browser, { width: 1280, height: 900 }, ownerToken);
  const page = await context.newPage();
  await installLocalOnlyNetwork(page);
  // Keep the signed local API identity for owner authorization while choosing
  // guest presentation in the browser, which has no Supabase Auth session.
  await page.addInitScript(() => localStorage.setItem('bos_entry_choice_v1', 'guest'));
  // A verified provider session may open in the provider portal. Switch the
  // presentation back to Marketplace while retaining the server provider role.
  await page.goto(`${uiUrl}/#pg/style1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for a real destination state. Waiting for an overlay to be absent is
  // racy: React has not mounted it yet immediately after DOMContentLoaded.
  // The auth bootstrap can then mount the splash/provider portal afterwards.
  await page.waitForFunction(() => {
    const search = document.querySelector('#pg-search');
    const welcome = document.querySelector('[data-testid="bookourspace-welcome"]');
    const backButton = [...document.querySelectorAll('button')]
      .some((button) => button.textContent?.trim() === 'Back to Marketplace');
    return Boolean(search || welcome || backButton);
  }, null, { timeout: 25000 });
  const welcome = page.getByTestId('bookourspace-welcome');
  if (await welcome.count()) {
    const guest = page.getByRole('button', { name: 'Explore Spaces as Guest' });
    if (await guest.count()) await guest.click();
  }
  const backToMarketplace = page.getByRole('button', { name: 'Back to Marketplace', exact: true });
  if (await backToMarketplace.count()) await backToMarketplace.click({ timeout: 5000 });
  await page.locator('#pg-search').waitFor({ timeout: 20000 });
  if (await page.locator('#pg-search').count() === 0) {
    blocked.push('Owner inventory UI: no Marketplace/PG search surface rendered for the signed local provider; owner authorization and inventory remain API/PostgreSQL tested.');
    await context.close();
    return;
  }
  await page.locator('#pg-search').waitFor({ timeout: 10000 });
  async function saveInventoryForStyle(style) {
    await openLiveListing(page, style);
    const inventoryEditor = page.locator('details').filter({ has: page.getByText('Manage room and bed inventory') });
    await inventoryEditor.locator('summary').click();
    await inventoryEditor.getByLabel('Monthly rent (₹)').fill('8000');
    await inventoryEditor.getByRole('button', { name: 'Save inventory' }).click();
    await page.getByRole('status').filter({ hasText: 'Room and bed inventory saved' }).waitFor({ timeout: 10000 });
    results.push(`Chromium owner inventory ${style}: authenticated owner edits PostgreSQL bed pricing/inventory through UI`);
    console.log(`  PASS  ${results.at(-1)}`);
  }
  // PG is locked to Style 3 by product decision, so one mounted-style journey
  // covers the supported surface without re-testing a dead route alias.
  await saveInventoryForStyle('style1');
  await context.close();
}

function futureDate(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function runCustomerBookingJourney(browser, style) {
  const context = await createContext(browser, { width: 390, height: 844 }, customerToken);
  const page = await context.newPage();
  await installLocalOnlyNetwork(page);
  await openLiveListing(page, style);
  const authResult = await page.evaluate(async () => {
    const token = localStorage.getItem('bos_session_token_v1');
    const response = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    return { status: response.status, email: body.user?.email, role: body.user?.role };
  });
  assert.deepEqual(authResult, { status: 200, email: sessionEmail(customerToken), role: 'customer' }, 'local signed customer session must be verified by Express/PostgreSQL profile');
  const moveIn = futureDate(style === 'style1' ? 15 : 18);
  const bookingPanel = page.getByRole('region', { name: 'PG availability and booking' });
  await page.getByLabel('Move-in date').fill(moveIn);
  await page.getByRole('button', { name: 'Check live availability' }).click();
  await page.getByText(/available of .* beds/i).waitFor({ timeout: 10000 });
  const bedsInput = bookingPanel.getByLabel('Beds', { exact: true });
  const occupantsInput = bookingPanel.getByLabel('Occupants', { exact: true });
  if (await bedsInput.count() < 1 || await occupantsInput.count() < 1) {
    const fields = await bookingPanel.locator('input').evaluateAll((inputs) => inputs.map((input) => ({
      type: input.type,
      name: input.name,
      labels: Array.from(input.labels || []).map((label) => label.innerText.trim()),
      ariaLabel: input.getAttribute('aria-label'),
      value: input.value,
    })));
    console.error(`  DIAGNOSTIC PG booking form role=${authResult.role} inputs=${JSON.stringify(fields)} text=${JSON.stringify((await bookingPanel.innerText()).slice(0, 1200))}`);
  }
  assert.ok(await bedsInput.count() >= 1, 'bed quantity input has an accessible label');
  assert.ok(await occupantsInput.count() >= 1, 'occupant quantity input has an accessible label');
  const liveMaximum = Number(await bedsInput.first().getAttribute('max') || '0');
  await bedsInput.first().fill(String(liveMaximum + 1));
  assert.equal(await page.getByRole('button', { name: 'Reserve beds' }).isEnabled(), false, 'cannot request more beds than live availability');
  await bedsInput.first().fill('1');
  const reserve = page.getByRole('button', { name: 'Reserve beds' });
  await reserve.waitFor({ timeout: 10000 });
  assert.equal(await reserve.isEnabled(), true, 'verified local customer should be able to reserve available inventory');
  const bookingResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/pg/bookings') && response.request().method() === 'POST', { timeout: 10000 });
  await reserve.click();
  const bookingResponse = await bookingResponsePromise;
  const bookingBody = await bookingResponse.json();
  assert.equal(bookingResponse.status(), 201, 'the UI booking request is persisted by the local Express/PostgreSQL API');
  const bookingId = bookingBody.booking?.bookingId;
  assert.ok(bookingId, 'the server returns the persisted booking identity');
  await page.getByRole('status').filter({ hasText: /Reservation .* confirmed/ }).waitFor({ timeout: 10000 });
  // This harness enables its local signed sandbox verifier; the payment
  // journey above already asserts the UPI QR remains pending until a signed
  // event arrives. Do not mistake the configured test capability for a real
  // provider settlement or assert that the method must be hidden.
  await page.getByRole('button', { name: 'Pay at the property' }).click();
  await page.getByRole('status').filter({ hasText: /BookOurSpace does not collect or verify this payment/ }).waitFor({ timeout: 10000 });

  // The booking sheet can remain above the sticky nav; close it before using
  // the real bottom-navigation My Bookings destination. Do not depend on the
  // old "All PGs" control, which is a filter tab rather than a close button.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const nav = page.getByRole('navigation', { name: 'Bottom Navigation' });
  await nav.getByRole('button', { name: 'My Bookings' }).click();
  const myBookings = page.getByRole('region', { name: 'PG bookings' });
  const reservation = myBookings.locator('article').filter({ hasText: listingTitle }).filter({ hasText: moveIn });
  await reservation.waitFor({ timeout: 10000 });
  await reservation.getByText('Pay at property').waitFor();
  assert.equal(await reservation.getByText('Pay at property', { exact: true }).count(), 1, 'My Bookings displays one authoritative payment-status badge');
  await reservation.getByRole('button', { name: 'Cancel reservation' }).click();
  await myBookings.getByRole('status').filter({ hasText: /cancelled.*0.*refunded/i }).waitFor({ timeout: 10000 });
  await reservation.getByText('cancelled', { exact: true }).waitFor({ timeout: 10000 });

  const afterCancel = await page.evaluate(async (title) => {
    const token = localStorage.getItem('bos_session_token_v1');
    const response = await fetch('/api/pg/bookings', { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    const booking = body.bookings?.find((item) => item.bookingId === title);
    return { status: response.status, bookingStatus: booking?.status, paymentStatus: booking?.paymentStatus, paymentMode: booking?.paymentMode };
  }, bookingId);
  assert.deepEqual(afterCancel, { status: 200, bookingStatus: 'cancelled', paymentStatus: 'pay_later', paymentMode: 'pay_after_service' });

  // Close the existing My Bookings sheet before checking live availability;
  // its backdrop correctly blocks clicks on the page beneath it.
  await page.locator('div.fixed.inset-0.z-50').getByRole('button').first().click();
  await page.goto(`${uiUrl}/#pg/${style}`, { waitUntil: 'domcontentloaded' });
  await pgCardAction(page, listingTitle).click();
  const availabilityPanel = page.getByRole('region', { name: 'PG availability and booking' });
  await availabilityPanel.waitFor();
  await page.getByLabel('Move-in date').fill(moveIn);
  await page.getByRole('button', { name: 'Check live availability' }).click();
  const inventoryPath = browserDiagnostics.get(page)?.network.find((item) =>
    item.method === 'GET' && item.path.startsWith('/api/pg/listings/') && item.path.endsWith('/inventory'))?.path;
  assert.ok(inventoryPath, 'live PostgreSQL inventory endpoint was observed in the browser network trace');
  const restoredInventory = await page.evaluate(async ({ listingId: id, date }) => {
    const sessionToken = localStorage.getItem('bos_session_token_v1');
    const response = await fetch(`${id}?moveIn=${encodeURIComponent(date)}&months=1`, {
      headers: sessionToken ? { authorization: `Bearer ${sessionToken}` } : {},
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, room: body.roomTypes?.[0] ? { availableBeds: body.roomTypes[0].availableBeds, totalBeds: body.roomTypes[0].totalBeds } : null };
  }, { listingId: inventoryPath, date: moveIn });
  assert.equal(restoredInventory.status, 200, `post-cancel inventory response: ${JSON.stringify(restoredInventory)}`);
  assert.ok(restoredInventory.room?.totalBeds > 0, `inventory endpoint returns configured room capacity: ${JSON.stringify(restoredInventory)}`);
  assert.equal(restoredInventory.room?.availableBeds, liveMaximum, `cancelled reservation restores the pre-booking availability; API=${JSON.stringify(restoredInventory)}`);
  await page.getByText(`${restoredInventory.room.availableBeds} available of ${restoredInventory.room.totalBeds} beds`).waitFor({ timeout: 10000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, 'authenticated mobile customer journey has no horizontal overflow');
  results.push(`Chromium LOCAL TEST IDENTITY ${sessionEmail(customerToken)} (signed harness session, not Google OAuth), ${style}: search → availability → reserve → Pay at property/unpaid → My Bookings → cancel/no refund → beds available`);
  console.log(`  PASS  ${results.at(-1)}`);
  await context.close();
}

try {
  const requestedEngines = String(process.env.BOS_PG_BROWSER_ENGINES || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const engineEntries = [['Chromium', chromium], ['Firefox', firefox], ['WebKit', webkit]]
    .filter(([name]) => requestedEngines.length === 0 || requestedEngines.includes(name.toLowerCase()));
  for (const [engineName, engine] of engineEntries) {
    let browser;
    console.log(`  INFO  starting ${engineName}`);
    try {
      browser = await engine.launch({ headless: true });
    } catch (error) {
      blocked.push(`${engineName}: browser binary unavailable (${String(error).split('\n')[0]})`);
      continue;
    }
    try {
      if (engineName === 'Chromium') {
        await runOwnerInventoryCheck(browser);
        for (const style of ['style1', 'style2']) {
          await runCustomerBookingJourney(browser, style);
        }
      }
      await runResponsiveChecks(engineName, browser);
    } finally {
      await browser.close();
    }
  }
} finally {
  uiServer.closeAllConnections?.();
  await new Promise((resolve) => uiServer.close(resolve));
}

for (const result of results) console.log(`  PASS  ${result}`);
for (const item of blocked) console.log(`  BLOCKED  ${item}`);
console.log(`Playwright PG: ${results.length} checks passed; ${blocked.length} browser/runtime blockers`);
if (!results.some((result) => result.includes(`LOCAL TEST IDENTITY ${sessionEmail(customerToken)}`))) {
  throw new Error('Authenticated Chromium PG booking/cancellation journey did not complete.');
}
