/**
 * PG & Hostels browser journey across three identities: customer, owner and
 * administrator — against the real Express API, the real PostgreSQL database
 * and the real production build in Chromium, Firefox and WebKit.
 *
 * The journey proves:
 *   customer  discovery → details → live availability → reserve → UPI intent
 *             and QR → My Bookings → open a dispute → read the invoice
 *   owner     sees the customer's reservation → reads the dispute → declares
 *             money collected at the property
 *   admin     opens the PG operations console → sees the reservation → moves
 *             the dispute under review and resolves it → the audit trail shows
 *             the action
 *   customer  sees the resolution on the reservation
 *
 * Usage: node tests/pg-admin-browser-journey.e2e.mjs <apiBase> <distDir> \
 *          <listingTitle> <customerUuid> <ownerUuid> <adminUuid> <secret> \
 *          [engine] [viewport]
 */

import crypto from 'node:crypto';
import { chromium, firefox, webkit } from 'playwright';
import express from 'express';
import path from 'node:path';

const [, , baseUrl, distDirectory, listingTitle, customerUuid, ownerUuid, adminUuid, sessionSecret, engineName = 'chromium', viewportName = 'mobile'] = process.argv;
if (![baseUrl, distDirectory, listingTitle, customerUuid, ownerUuid, adminUuid, sessionSecret].every(Boolean)) {
  throw new Error('api base, dist directory, listing title, customer/owner/admin UUIDs and the session secret are required');
}
const ENGINES = { chromium, firefox, webkit };
const browserType = ENGINES[engineName];
if (!browserType) throw new Error(`unknown browser engine: ${engineName}`);
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 },
};
const viewport = VIEWPORTS[viewportName] || VIEWPORTS.mobile;

function sessionToken(userId, role, email) {
  const payload = Buffer.from(JSON.stringify({
    userId: `LEGACY-${role}-${userId}`,
    supabaseUserId: userId,
    email,
    name: `Browser ${role}`,
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', `${sessionSecret}:SESSION_TOKEN_V2`).update(payload).digest('hex')}`;
}

const customerToken = sessionToken(customerUuid, 'customer', 'customer.browser@example.test');
const ownerToken = sessionToken(ownerUuid, 'provider', 'owner.browser@example.test');
const adminToken = sessionToken(adminUuid, 'admin', 'admin.browser@example.test');

const ui = express();
ui.use(express.static(path.resolve(distDirectory), { fallthrough: true }));
ui.get('*', (_request, response) => response.sendFile(path.join(path.resolve(distDirectory), 'index.html')));
const uiServer = await new Promise((resolve, reject) => {
  const server = ui.listen(0, '127.0.0.1', () => resolve(server));
  server.once('error', reject);
});
const uiUrl = `http://127.0.0.1:${uiServer.address().port}`;

const browser = await browserType.launch({ headless: true });
const results = [];
let failures = 0;
const apiCalls = [];

function assertCheck(name, ok, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`);
    results.push(name);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Opens a fresh page for an identity.
 *
 * A fresh page is used instead of a reload because Firefox reports the module
 * requests that a reload cancels as "error loading dynamically imported
 * module", which is a test artefact rather than an application defect.
 */
async function openAs(context, token, userId, role) {
  const page = await context.newPage();
  const pageErrors = [];
  const badResponses = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  // Only the API calls are intercepted. Intercepting the module scripts as
  // well breaks the dynamic import in Firefox and WebKit.
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const target = new URL(route.request().url());
      const upstream = await route.fetch({ url: `${baseUrl}${target.pathname}${target.search}` });
      let detail = '';
      if (target.pathname.includes('/inventory')) {
        detail = ` :: ${(await upstream.text()).slice(0, 400)}`;
      } else if (target.pathname === '/api/auth/me') {
        detail = ` :: ${(await upstream.text()).slice(0, 200)}`;
      }
      apiCalls.push(`${upstream.status()} ${target.pathname}${target.search}${detail}`);
      await route.fulfill({ response: upstream });
    },
  );
  await page.route(
    (url) => url.origin !== uiUrl && !url.pathname.startsWith('/api/'),
    (route) => route.abort('blockedbyclient'),
  );
  await page.goto(`${uiUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // The application shows a full-screen brand splash while it boots. It has
  // to be gone before anything can be clicked.
  await page.waitForFunction(() => {
    const overlays = Array.from(document.querySelectorAll('div.fixed'))
      .filter((element) => String(element.className || '').includes('z-[100]'));
    return overlays.length === 0;
  }, { timeout: 45000 }).catch(() => undefined);
  await page.evaluate(([sessionTokenValue, uuid, roleName]) => {
    localStorage.setItem('bos_session_token_v1', sessionTokenValue);
    localStorage.setItem('bos_google_auth_user_v1', JSON.stringify({
      id: uuid,
      googleSub: uuid,
      name: `Browser ${roleName}`,
      email: `${roleName}.browser@example.test`,
      phone: '',
      role: roleName,
      status: 'active',
      verified: true,
      city: 'Hyderabad',
      joinedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      totalBookings: 0,
      totalListings: 0,
      walletBalance: 0,
    }));
  }, [token, userId, role]);
  return { page, pageErrors, badResponses };
}

async function closePage(page) {
  // Ignore requests still in flight when a journey reaches its terminal state.
  // Playwright otherwise reports route.fetch callbacks against a disposed
  // context as an uncaught TargetClosedError after the assertions already pass.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
}

async function openMyBookings(page) {
  const trigger = page.getByRole('button', { name: /bookings/i }).last();
  await trigger.waitFor({ timeout: 20000 });
  await trigger.click();
  await page.getByRole('heading', { name: /my bookings/i }).waitFor({ timeout: 20000 });
}

async function signIn(page, token, userId, role) {
  if (page.url() === 'about:blank') {
    await page.goto(`${uiUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  await page.evaluate(([sessionTokenValue, uuid, roleName]) => {
    localStorage.setItem('bos_session_token_v1', sessionTokenValue);
    localStorage.setItem('bos_google_auth_user_v1', JSON.stringify({
      id: uuid,
      googleSub: uuid,
      name: `Browser ${roleName}`,
      email: `${roleName}.browser@example.test`,
      phone: '',
      role: roleName,
      status: 'active',
      verified: true,
      city: 'Hyderabad',
      joinedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      totalBookings: 0,
      totalListings: 0,
      walletBalance: 0,
    }));
  }, [token, userId, role]);
}

try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });

  // ------------------------------------------------------------- customer
  {
    const { page, pageErrors, badResponses } = await openAs(context, customerToken, customerUuid, 'customer');
    await page.goto(`${uiUrl}/#pg`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const detailsButton = page.getByRole('button', { name: `View details for ${listingTitle}` });
    assertCheck('customer: the approved PG listing is rendered', await detailsButton.waitFor({ timeout: 45000 }).then(() => true).catch(() => false));
    await detailsButton.click();
    await page.getByRole('region', { name: 'PG availability and booking' }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Check live availability' }).click();
    await page.getByText(/available of .* beds/i).waitFor({ timeout: 20000 });
    const reserve = page.getByRole('button', { name: 'Reserve beds' });
    const reservable = await reserve.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    assertCheck('customer: a bed can be reserved', reservable,
      reservable ? '' : `body=${(await page.locator('body').innerText().catch(() => '')).slice(0, 900)}`);
    await reserve.click();
    await page.getByText(/Payment for reservation/i).waitFor({ timeout: 25000 });
    assertCheck('customer: the payment step is shown', true);
    const upi = page.getByRole('button', { name: 'Pay online with UPI' });
    assertCheck('customer: the UPI option is offered', await upi.waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
    await upi.click();
    assertCheck('customer: a UPI QR is rendered', await page.getByLabel('UPI payment QR code').waitFor({ timeout: 25000 }).then(() => true).catch(() => false));
    assertCheck('customer: the reservation is honestly pending, not paid',
      await page.getByText(/Waiting for the payment provider/i).waitFor({ timeout: 15000 }).then(() => true).catch(() => false));

    // A second reservation that is paid at the property. It lets the owner
    // declare a cash collection, which is only allowed when no online payment
    // is open.
    const secondReserve = page.getByRole('button', { name: 'Reserve beds' });
    const secondReservable = await secondReserve.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    assertCheck('customer: a second bed can be reserved', secondReservable,
      secondReservable ? '' : `body=${(await page.locator('body').innerText().catch(() => '')).slice(0, 900)} api=${apiCalls.join(' | ')}`);
    await secondReserve.click();
    await page.getByText(/Payment for reservation/i).waitFor({ timeout: 25000 });
    const payAtProperty = page.getByRole('button', { name: 'Pay at the property' });
    assertCheck('customer: pay at the property is offered as a separate choice',
      await payAtProperty.waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
    await payAtProperty.click();
    assertCheck('customer: pay at the property is recorded as an obligation',
      await page.getByText(/Pay .* directly to the owner/i).waitFor({ timeout: 20000 }).then(() => true).catch(() => false));

    await openMyBookings(page);
    assertCheck('customer: the reservation is listed in My Bookings',
      await page.getByRole('region', { name: 'PG bookings' }).waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    const pendingCard = page.getByRole('article').filter({ hasText: 'Payment pending confirmation' }).first();
    await pendingCard.getByRole('button', { name: 'Payment details' }).click();
    assertCheck('customer: a server-backed invoice is shown',
      await page.getByText(/^Invoice BOS-PG-/).waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    assertCheck('customer: the invoice states that the payment is not confirmed',
      await page.getByText(/A payment was started but the provider has not confirmed/i).waitFor({ timeout: 15000 }).then(() => true).catch(() => false));

    const disputeReason = page.getByLabel(/Reason \(at least 10 characters\)/);
    await disputeReason.scrollIntoViewIfNeeded();
    await disputeReason.fill('The bed shown in the listing was already occupied when we arrived.');
    await page.getByRole('button', { name: 'Open dispute' }).click();
    assertCheck('customer: the dispute is opened and shown with its status',
      await page.getByText(/Bed not available/i).waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    assertCheck('customer: the dispute is recorded as open',
      await page.getByText(/^open$/i).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false));

    // ------------------------------------------------- accessibility basics
    const unnamedControls = await page.evaluate(() => {
      const scope = document.querySelector('[aria-label="PG availability and booking"]');
      if (!scope) return ['the availability panel is missing'];
      const missing = [];
      for (const element of scope.querySelectorAll('input, select, textarea, button')) {
        const label = element.getAttribute('aria-label')
          || (element.getAttribute('id') && scope.querySelector(`label[for="${element.getAttribute('id')}"]`)?.textContent)
          || (element.closest('label')?.textContent || '')
          || element.textContent
          || element.getAttribute('placeholder')
          || element.getAttribute('title')
          || '';
        if (!String(label).trim()) missing.push(`${element.tagName.toLowerCase()}[${element.getAttribute('type') || ''}]`);
      }
      return missing;
    });
    assertCheck('every control in the PG panel has an accessible name', unnamedControls.length === 0, unnamedControls.join(', '));

    const modalScroll = await page.evaluate(() => {
      const region = document.querySelector('[aria-label="PG bookings"]');
      if (!region) return { found: false };
      // Find the element that actually scrolls the dialog content.
      let scrollable = region;
      while (scrollable && scrollable.scrollHeight <= scrollable.clientHeight + 1) {
        const parent = scrollable.parentElement;
        if (!parent) break;
        scrollable = parent;
      }
      if (!scrollable) return { found: false };
      scrollable.scrollTop = 240;
      return {
        found: true,
        scrollable: scrollable.scrollHeight > scrollable.clientHeight,
        moved: scrollable.scrollTop > 0,
        height: scrollable.scrollHeight,
        view: scrollable.clientHeight,
      };
    });
    assertCheck('the My Bookings modal is reachable by scrolling on a small viewport',
      modalScroll.found && modalScroll.scrollable && modalScroll.moved, JSON.stringify(modalScroll));

    await page.keyboard.press('Escape');
    const modalClosed = await page.getByRole('heading', { name: /my bookings/i }).waitFor({ timeout: 5000 }).then(() => false).catch(() => true);
    assertCheck('Escape closes the My Bookings overlay', modalClosed);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assertCheck(`no horizontal overflow at ${viewportName} ${viewport.width}x${viewport.height}`, !overflow);
    assertCheck('no uncaught page error during the customer journey', pageErrors.length === 0,
      `${pageErrors.join(' | ')}${badResponses.length ? ` :: http ${badResponses.join(' | ')}` : ''}`);
    await closePage(page);
  }

  // ---------------------------------------------------------------- owner
  {
    const { page, pageErrors, badResponses } = await openAs(context, ownerToken, ownerUuid, 'provider');
    await page.goto(`${uiUrl}/#pg`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await openMyBookings(page);
    assertCheck('owner: the customer reservation is visible to the owner',
      await page.getByRole('region', { name: 'PG bookings' }).waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    const ownerPendingCard = page.getByRole('article').filter({ hasText: 'Payment pending confirmation' }).first();
    await ownerPendingCard.getByRole('button', { name: 'Payment details' }).click();
    assertCheck('owner: the dispute raised by the customer is visible',
      await page.getByText(/Bed not available/i).waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    const propertyCard = page.getByRole('article').filter({ hasText: 'Pay at property' }).first();
    await propertyCard.getByRole('button', { name: 'Payment details' }).click();
    const declareButton = page.getByRole('button', { name: /Declare .* collected/i });
    const declareVisible = await declareButton.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    assertCheck('owner: the offline collection declaration is offered', declareVisible,
      declareVisible ? '' : `body=${(await page.locator('body').innerText().catch(() => '')).slice(-1200)} api=${apiCalls.join(' | ')} http=${badResponses.join(' | ')}`);
    if (declareVisible) {
      await page.getByLabel(/Reference \(receipt or UTR\)/).fill('BROWSER-CASH-4410');
      await page.getByLabel('Note').fill('Cash collected at the property on the move-in day.');
      await declareButton.click();
      assertCheck('owner: the collection declaration is recorded for administrator approval',
        await page.getByText(/An administrator has to approve/i).waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    }
    assertCheck('no uncaught page error during the owner journey', pageErrors.length === 0,
      `${pageErrors.join(' | ')}${badResponses.length ? ` :: http ${badResponses.join(' | ')}` : ''}`);
    await closePage(page);
  }

  // ---------------------------------------------------------------- admin
  {
    const { page, pageErrors, badResponses } = await openAs(context, adminToken, adminUuid, 'admin');
    await page.goto(`${uiUrl}/#admin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // The PG administrator section is linked from the PG & Hostels part of
    // the administrator console, not only from the super administrator page.
    // The administrator console is a large surface, so the wait is generous:
    // slower engines render it later, not differently.
    const pgSectionButton = page.getByRole('button', { name: /PGs & Hostels/ }).first();
    const hasPgSection = await pgSectionButton.waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
    if (hasPgSection) {
      await pgSectionButton.click();
      assertCheck('admin: the PG & Hostels administrator section opens the operations workspace',
        await page.getByText(/PG & Hostel Operations/i).first().waitFor({ timeout: 45000 }).then(() => true).catch(() => false));
    } else {
      const headings = await page.locator('h1, h2, h3').allTextContents().catch(() => []);
      assertCheck('admin: the PG & Hostels administrator section is linked from the console', false,
        `the section entry was not found; headings=${JSON.stringify(headings).slice(0, 400)}`);
    }

    const adminRegion = page.getByRole('region', { name: 'PG and hostel administration' });
    assertCheck('admin: the PG operations console is reachable', await adminRegion.waitFor({ timeout: 60000 }).then(() => true).catch(() => false));
    const row = adminRegion.getByRole('row').filter({ hasText: listingTitle }).first();
    assertCheck('admin: the reservation is listed in the PG operations table',
      await row.waitFor({ timeout: 25000 }).then(() => true).catch(() => false));
    assertCheck('admin: the operations table shows the reservation money state',
      await adminRegion.getByText(/pending verification/i).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false));

    const elevate = adminRegion.getByRole('button', { name: /Request super administrator session/i });
    if (!(await elevate.isVisible().catch(() => false))) {
      const buttons = await adminRegion.getByRole('button').allTextContents().catch(() => []);
      console.log(`      admin buttons: ${JSON.stringify(buttons).slice(0, 600)}`);
      console.log(`      rows: ${JSON.stringify(await adminRegion.getByRole('row').allTextContents().catch(() => [])).slice(0, 800)}`);
    }
    if (await elevate.isVisible().catch(() => false)) {
      await elevate.click();
      await adminRegion.getByText(/Super administrator session granted/i).waitFor({ timeout: 20000 }).catch(() => {});
    }
    assertCheck('admin: the super administrator session is granted for money operations',
      await adminRegion.getByText(/Super administrator/i).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false));

    const resolveButton = adminRegion.getByRole('button', { name: 'Resolve dispute' }).first();
    assertCheck('admin: the dispute can be resolved from the console',
      await resolveButton.waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    await resolveButton.click();
    await page.getByLabel(/Reason \(recorded in the audit trail\)/).fill('The bed was occupied; the owner credited the full deposit to the customer.');
    await page.getByRole('button', { name: 'Confirm' }).click();
    assertCheck('admin: the resolution is recorded',
      await page.getByText(/Dispute resolved and the resolution recorded/i).waitFor({ timeout: 25000 }).then(() => true).catch(() => false));
    await adminRegion.getByText(/Administrator audit trail/i).click();
    assertCheck('admin: the audit trail shows the administrator actions',
      await adminRegion.getByText(/dispute_resolved/i).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
    assertCheck('no uncaught page error during the admin journey', pageErrors.length === 0,
      `${pageErrors.join(' | ')}${badResponses.length ? ` :: http ${badResponses.join(' | ')}` : ''}`);
    await closePage(page);
  }

  // ------------------------------------------- a customer is refused the console
  {
    const { page, pageErrors } = await openAs(context, customerToken, customerUuid, 'customer');
    await page.goto(`${uiUrl}/#admin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const consoleVisible = await page.getByRole('region', { name: 'PG and hostel administration' })
      .waitFor({ timeout: 6000 }).then(() => true).catch(() => false);
    assertCheck('a customer cannot reach the administrator PG console', !consoleVisible);
    assertCheck('no uncaught page error for a customer visiting the admin route', pageErrors.length === 0, pageErrors.join(' | '));
    await closePage(page);
  }

  // ------------------------------------------------ customer sees the result
  {
    const { page, pageErrors, badResponses } = await openAs(context, customerToken, customerUuid, 'customer');
    await page.goto(`${uiUrl}/#pg`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await openMyBookings(page);
    const finalCard = page.getByRole('article').filter({ hasText: 'Payment pending confirmation' }).first();
    await finalCard.getByRole('button', { name: 'Payment details' }).click();
    assertCheck('customer: the resolution is visible on the reservation',
      await page.getByText(/Resolution: The bed was occupied/i).waitFor({ timeout: 25000 }).then(() => true).catch(() => false));
    assertCheck('no uncaught page error during the final customer journey', pageErrors.length === 0,
      `${pageErrors.join(' | ')}${badResponses.length ? ` :: http ${badResponses.join(' | ')}` : ''}`);
    await closePage(page);
  }

  await context.close();
} finally {
  await browser.close();
  await new Promise((resolve) => uiServer.close(resolve));
}

console.log(`PG admin browser journey (${engineName}, ${viewportName}): ${results.length} checks passed, ${failures} failed`);
if (failures) process.exitCode = 1;
