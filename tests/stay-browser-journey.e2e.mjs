/**
 * Stay host money actions browser journey (Playwright, Chromium).
 *
 * Real browser against a real build, the real Express API and the real
 * PostgreSQL database, proving the host side of the money flow end to end:
 *
 *   customer books pay-at-property -> host records the property payment ->
 *   host checks the guest in and out -> a UPI booking whose settlement the
 *   host approves manually.
 *
 * Usage: node tests/stay-browser-journey.e2e.mjs <apiBaseUrl> <distDir> \
 *          <providerUuid> <customerUuid> <sessionSecret>
 */

import crypto from 'node:crypto';
import { chromium } from 'playwright';
import express from 'express';
import path from 'node:path';

const [, , baseUrl, distDirectory, providerUuid, customerUuid, sessionSecret] = process.argv;
if (!distDirectory || !providerUuid || !customerUuid || !sessionSecret) {
  throw new Error('api base url, dist directory, provider uuid, customer uuid and session secret are required');
}

const LISTING = 'lst-stay-1';
const ROOM = '11111111-0000-4000-8000-000000000001';

function signSession(user) {
  const payload = Buffer.from(JSON.stringify({
    ...user,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3_600_000,
  }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', `${sessionSecret}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

const customerToken = signSession({
  userId: 'USR-CUST-A', supabaseUserId: customerUuid,
  email: 'customer.a@example.test', name: 'Customer A', role: 'customer',
});
const providerToken = signSession({
  userId: 'USR-PROVIDER', supabaseUserId: providerUuid,
  email: 'provider.stay@example.test', name: 'Stay Provider', role: 'provider',
});

const isoDaysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const ui = express();
ui.use(express.static(path.resolve(distDirectory), { fallthrough: true }));
ui.get('*', (_request, response) => response.sendFile(path.join(path.resolve(distDirectory), 'index.html')));
const uiServer = await new Promise((resolve, reject) => {
  const server = ui.listen(0, '127.0.0.1', () => resolve(server));
  server.once('error', reject);
});
const uiUrl = `http://127.0.0.1:${uiServer.address().port}`;

const browser = await chromium.launch({ headless: true });
const results = [];
let failures = 0;

function assertCheck(name, ok, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`);
    results.push(name);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function hostBookings() {
  const response = await fetch(`${baseUrl}/api/stays/host/bookings`, {
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  const body = await response.json().catch(() => ({}));
  return body.bookings || [];
}

try {
  // Two real reservations: one pay-at-property, one UPI still unverified.
  const today = isoDaysFromNow(0);
  const payLater = await fetch(`${baseUrl}/api/stays/checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId: LISTING, roomTypeId: ROOM,
      checkIn: today, checkOut: isoDaysFromNow(2), units: 1,
      paymentMode: 'pay_after_service', guestName: 'Browser Guest',
      guestPhone: '9876543210', idempotencyKey: `stay-browser-later-${Date.now()}`,
    }),
  });
  const payLaterBody = await payLater.json().catch(() => ({}));
  const payLaterId = String(payLaterBody.bookingId || '');
  assertCheck('stay: a pay-at-property reservation is created for the host to collect', payLater.status === 201 && Boolean(payLaterId), `${payLater.status} ${JSON.stringify(payLaterBody).slice(0, 240)}`);

  const upi = await fetch(`${baseUrl}/api/stays/checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId: LISTING, roomTypeId: ROOM,
      checkIn: isoDaysFromNow(3), checkOut: isoDaysFromNow(5), units: 1,
      paymentMode: 'upi', guestName: 'Browser Guest',
      guestPhone: '9876543210', idempotencyKey: `stay-browser-upi-${Date.now()}`,
    }),
  });
  const upiBody = await upi.json().catch(() => ({}));
  const upiId = String(upiBody.bookingId || '');
  assertCheck('stay: a UPI reservation awaits settlement for the host to approve', upi.status === 201 && Boolean(upiId), `${upi.status} ${JSON.stringify(upiBody).slice(0, 240)}`);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const target = new URL(route.request().url());
      const upstream = await route.fetch({ url: `${baseUrl}${target.pathname}${target.search}` });
      await route.fulfill({ response: upstream });
    },
  );
  await page.route(
    (url) => url.origin !== uiUrl && !url.pathname.startsWith('/api/'),
    (route) => route.abort('blockedbyclient'),
  );
  await page.addInitScript((token) => {
    localStorage.setItem('bos_entry_choice_v1', 'guest');
    localStorage.setItem('bos_privacy_consent_v1', JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' }));
    localStorage.setItem('bos_session_token_v1', token);
  }, providerToken);

  const authHydrated = page
    .waitForResponse((response) => response.url().endsWith('/api/auth/me'), { timeout: 20000 })
    .catch(() => null);
  // The host workspace lives in the Airbnb layout (AirbnbIndiaExperience),
  // which the router mounts for the stays/airbnb hash.
  await page.goto(`${uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await authHydrated;

  // The header opens the same workspace for any authenticated role.
  const hostLink = page.getByRole('button', { name: 'Become a host' });
  const hostLinkVisible = await hostLink.waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
  if (hostLinkVisible) await hostLink.scrollIntoViewIfNeeded().catch(() => {});
  assertCheck('stay: the provider can open the host workspace', hostLinkVisible);
  if (!hostLinkVisible) {
    const body = await page.locator('body').innerText().catch(() => '');
    const labels = await page.evaluate(() => [...document.querySelectorAll('button')]
      .map((button) => button.getAttribute('aria-label') || button.textContent?.trim())
      .filter(Boolean).slice(0, 120)).catch(() => []);
    console.error(`      stay body: ${body.replace(/\s+/g, ' ').slice(0, 700)}`);
    console.error(`      stay buttons: ${labels.join(' | ')}`);
  }

  if (hostLinkVisible) {
    await hostLink.click();
    // The workspace opens on the Inventory tab; switch to Bookings.
    const bookingsTab = page.getByRole('button', { name: /^Bookings \(/ });
    if (await bookingsTab.waitFor({ timeout: 30000 }).then(() => true).catch(() => false)) {
      await bookingsTab.click();
    }
    const payLaterRow = page.locator('li').filter({ hasText: today }).first();
    await payLaterRow.waitFor({ timeout: 30000 });

    // ---- record property payment (collect), then check in and out
    const collect = payLaterRow.getByRole('button', { name: 'Record property payment' });
    const collectVisible = await collect.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    assertCheck('stay: the pay-at-property booking offers Record property payment', collectVisible);
    if (collectVisible) {
      await collect.click();
      const notice = page.getByText(/Payment recorded as collected at the property/i);
      const recorded = await notice.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
      assertCheck('stay: recording the property payment is confirmed in the UI', recorded);
      const afterCollect = (await hostBookings()).find((booking) => booking.booking_id === payLaterId);
      assertCheck('stay: the collection is persisted as collected_offline', afterCollect?.payment_status === 'collected_offline', JSON.stringify(afterCollect || {}).slice(0, 240));
    }

    const checkIn = payLaterRow.getByRole('button', { name: 'Check in', exact: true });
    const checkInVisible = await checkIn.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    assertCheck('stay: the collected booking offers Check in', checkInVisible);
    if (checkInVisible) {
      await checkIn.click();
      const checkedIn = await page.getByText(/Guest checked in\./i).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
      assertCheck('stay: checking the guest in is confirmed in the UI', checkedIn);
      const afterCheckIn = (await hostBookings()).find((booking) => booking.booking_id === payLaterId);
      assertCheck('stay: the check-in is persisted as checked_in', afterCheckIn?.status === 'checked_in', JSON.stringify(afterCheckIn || {}).slice(0, 200));

      const checkOut = payLaterRow.getByRole('button', { name: 'Check out', exact: true });
      const checkOutVisible = await checkOut.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
      assertCheck('stay: the checked-in guest offers Check out', checkOutVisible);
      if (checkOutVisible) {
        await checkOut.click();
        const completed = await page.getByText(/Stay completed\. The guest can now review\./i).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
        assertCheck('stay: checking the guest out is confirmed in the UI', completed);
        const afterCheckOut = (await hostBookings()).find((booking) => booking.booking_id === payLaterId);
        assertCheck('stay: the check-out is persisted as completed', afterCheckOut?.status === 'completed', JSON.stringify(afterCheckOut || {}).slice(0, 200));
      }
    }

    // ---- approve the online settlement for the UPI booking
    const upiRow = page.locator('li').filter({ hasText: isoDaysFromNow(3) }).first();
    const approve = upiRow.getByRole('button', { name: 'Approve settlement' });
    const approveVisible = await approve.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    assertCheck('stay: the unverified UPI booking offers Approve settlement', approveVisible);
    if (approveVisible) {
      await approve.click();
      const approved = await page.getByText(/Settlement manually approved/i).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
      assertCheck('stay: approving the settlement is confirmed in the UI', approved);
      const afterApprove = (await hostBookings()).find((booking) => booking.booking_id === upiId);
      assertCheck('stay: the approved settlement is persisted as verified', afterApprove?.payment_status === 'verified', JSON.stringify(afterApprove || {}).slice(0, 200));
    }

    assertCheck('stay: no uncaught page error in the host workspace', pageErrors.length === 0, pageErrors.join(' | '));
  }

  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolve) => uiServer.close(resolve));
}

console.log(`Stay browser journey: ${results.length} checks passed, ${failures} failed`);
if (failures) process.exitCode = 1;
