/**
 * PG & Hostels browser journey (Playwright, Chromium).
 *
 * This is a real browser against a real build, talking to the real Express API
 * and the real PostgreSQL database. It proves the customer journey end to end:
 *
 *   discovery → listing → details → live bed availability → reserve → the
 *   money step (UPI intent + QR, still pending provider confirmation) →
 *   My Bookings → the reservation is listed with its money state.
 *
 * It runs at three viewports and fails on horizontal overflow or any uncaught
 * page error.
 *
 * Usage: node tests/pg-browser-journey.e2e.mjs <apiBaseUrl> <distDir> \
 *          <listingTitle> <customerUuid> <sessionSecret>
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import express from 'express';
import path from 'node:path';

const [, , baseUrl, distDirectory, listingTitle, customerUuid, sessionSecret] = process.argv;
if (!distDirectory || !listingTitle || !customerUuid || !sessionSecret) {
  throw new Error('api base url, dist directory, listing title, customer uuid and session secret are required');
}

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'desktop', width: 1440, height: 900 },
];

const sessionToken = (() => {
  const payload = Buffer.from(JSON.stringify({
    userId: `LEGACY-customer-${customerUuid}`,
    supabaseUserId: customerUuid,
    email: 'customer.c@example.test',
    name: 'Browser Customer',
    role: 'customer',
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', `${sessionSecret}:SESSION_TOKEN_V2`).update(payload).digest('hex')}`;
})();

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

async function dismissPrivacyChoices(page) {
  const privacyChoices = page.getByRole('dialog', { name: 'Privacy choices' });
  try {
    await privacyChoices.waitFor({ state: 'visible', timeout: 3000 });
    await privacyChoices.getByRole('button', { name: 'Essential only' }).click();
  } catch {
    // The explicit local essential-only choice is already stored in this context.
  }
}

function assertCheck(name, ok, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`);
    results.push(name);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    const apiCalls = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    // Only the local API is reachable; nothing external is contacted.
    // Only the API calls are intercepted. Intercepting the module scripts as
    // well breaks the dynamic import in Firefox and WebKit.
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        const target = new URL(route.request().url());
        const upstream = await route.fetch({ url: `${baseUrl}${target.pathname}${target.search}` });
        apiCalls.push(`${upstream.status()} ${target.pathname}`);
        await route.fulfill({ response: upstream });
      },
    );
    await page.route(
      (url) => url.origin !== uiUrl && !url.pathname.startsWith('/api/'),
      (route) => route.abort('blockedbyclient'),
    );

    await page.goto(`${uiUrl}/#pg`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Fresh browser contexts start at the welcome screen. Explicitly choose
    // Guest so this journey exercises public discovery as an anonymous user.
    const continueAsGuest = page.getByRole('button', { name: 'Explore Spaces as Guest' });
    if (await continueAsGuest.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)) {
      await continueAsGuest.click();
    }
    await dismissPrivacyChoices(page);

    // -------------------------------------------------- signed-out discovery
    const detailsButton = page
      .getByRole('article', { name: `PG listing ${listingTitle}` })
      .getByRole('button', { name: /^(View & book|View)$/ });
    const listed = await detailsButton.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    assertCheck(`${viewport.name}: the approved PG listing is rendered in the discovery feed`, listed);
    if (!listed) {
      const body = await page.locator('body').innerText().catch(() => '');
      console.error(`      body: ${body.slice(0, 2500)}`);
      console.error(`      api: ${apiCalls.join(', ')}`);
      // A late inventory refresh can still be intercepted when the viewport
    // finishes; unroute before closing so route.fetch cannot outlive the page.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
      continue;
    }

    await detailsButton.click();
    await page.locator('#pg-detail-title').waitFor({ timeout: 15000 });
    const availabilityRegion = page.getByRole('region', { name: 'PG availability and booking' });
    const hasAvailability = await availabilityRegion.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    assertCheck(`${viewport.name}: the PG detail sheet exposes the live availability panel`, hasAvailability);

    if (hasAvailability) {
      await page.getByRole('button', { name: 'Check live availability' }).click();
      const bedText = page.getByText(/available of .* beds/i);
      const bedsVisible = await bedText.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
      assertCheck(`${viewport.name}: real bed availability is read from PostgreSQL`, bedsVisible);
      const gated = await page.getByRole('button', { name: 'Sign in to reserve' }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
      assertCheck(`${viewport.name}: a signed-out visitor cannot reserve a bed`, gated);
    }

    // --------------------------------------------------- signed-in journey
    await page.evaluate(([token, uuid]) => {
      localStorage.setItem('bos_session_token_v1', token);
      localStorage.setItem('bos_google_auth_user_v1', JSON.stringify({
        id: uuid,
        googleSub: uuid,
        name: 'Browser Customer',
        email: 'customer.c@example.test',
        phone: '',
        role: 'customer',
        status: 'active',
        verified: true,
        city: 'Hyderabad',
        joinedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        totalBookings: 0,
        totalListings: 0,
        walletBalance: 0,
      }));
    }, [sessionToken, customerUuid]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.goto(`${uiUrl}/#pg`, { waitUntil: 'domcontentloaded' });
    await dismissPrivacyChoices(page);

    const signedInButton = page
      .getByRole('article', { name: `PG listing ${listingTitle}` })
      .getByRole('button', { name: /^(View & book|View)$/ });
    const signedInListed = await signedInButton.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    assertCheck(`${viewport.name}: the signed-in customer still sees the listing`, signedInListed);
    if (signedInListed) {
      await signedInButton.click();
      await page.getByRole('region', { name: 'PG availability and booking' }).waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: 'Check live availability' }).click();
      await page.getByText(/available of .* beds/i).waitFor({ timeout: 15000 });

      const reserve = page.getByRole('button', { name: 'Reserve beds' });
      const canReserve = await reserve.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
      assertCheck(`${viewport.name}: a signed-in customer can reserve an available bed`, canReserve);
      if (!canReserve) {
        const panelText = await availabilityRegion.innerText().catch(() => '');
        const panelButtons = await availabilityRegion.getByRole('button').allTextContents().catch(() => []);
        console.error(`      booking panel: ${panelText.slice(0, 1200)}`);
        console.error(`      panel buttons: ${panelButtons.join(' | ')}`);
        console.error(`      api: ${apiCalls.slice(-12).join(', ')}`);
      }

      if (canReserve) {
        const bookingResponsePromise = page
          .waitForResponse(
            (response) => response.url().endsWith('/api/pg/bookings') && response.request().method() === 'POST',
            { timeout: 15000 },
          )
          .catch(() => null);
        await reserve.click();
        const bookingResponse = await bookingResponsePromise;
        const bookingPayload = bookingResponse ? await bookingResponse.json().catch(() => ({})) : {};
        const reservationBookingId = String(bookingPayload?.booking?.bookingId || '');
        const reservationRequest = bookingResponse?.request()?.postDataJSON?.() || {};
        assertCheck(`${viewport.name}: the reservation is persisted by the PostgreSQL API`, Boolean(reservationBookingId));
        assertCheck(
          `${viewport.name}: a fresh reservation starts unpaid`,
          String(bookingPayload?.booking?.paymentStatus || '') === 'pay_later',
          JSON.stringify(bookingPayload?.booking || {}).slice(0, 240),
        );
        const paymentHeading = page.getByText(/Payment for reservation/i);
        const paymentShown = await paymentHeading.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
        assertCheck(`${viewport.name}: the payment step is shown after the reservation`, paymentShown);

        if (paymentShown) {
          const upi = page.getByRole('button', { name: 'Pay online with UPI' });
          const upiAvailable = await upi.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
          assertCheck(`${viewport.name}: the UPI payment option is offered`, upiAvailable);
          if (upiAvailable) {
            await upi.click();
            const qr = page.getByLabel('UPI payment QR code');
            const qrVisible = await qr.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
            assertCheck(`${viewport.name}: a UPI QR is rendered for the server-priced amount`, qrVisible);
            const pending = page.getByText(/Waiting for the payment provider/i).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
            assertCheck(`${viewport.name}: the reservation is honestly shown as pending, not paid`, pending);

            if (reservationBookingId) {
              const token = await page.evaluate(() => localStorage.getItem('bos_session_token_v1') || '');
              const auth = { Authorization: `Bearer ${token}` };
              const paymentState = await page.request.get(
                `${baseUrl}/api/pg/bookings/${encodeURIComponent(reservationBookingId)}/payment`,
                { headers: auth },
              );
              const paymentBody = await paymentState.json().catch(() => ({}));
              assertCheck(
                `${viewport.name}: the server reports the payment as pending verification`,
                paymentState.status() === 200 && paymentBody?.paymentStatus === 'pending_verification',
                JSON.stringify(paymentBody).slice(0, 240),
              );

              // A pending payment must block a bare cancellation: the bed is only
              // released once the money is reconciled.
              const blockedCancel = await page.request.post(
                `${baseUrl}/api/pg/bookings/${encodeURIComponent(reservationBookingId)}/cancel`,
                { headers: auth },
              );
              assertCheck(
                `${viewport.name}: a pending-payment reservation cannot be cancelled without a refund`,
                !blockedCancel.ok(),
                `${blockedCancel.status()} ${(await blockedCancel.text()).slice(0, 200)}`,
              );

              // A second, unpaid reservation is cancellable end to end.
              const second = await page.request.post(`${baseUrl}/api/pg/bookings`, {
                headers: auth,
                data: {
                  listingId: reservationRequest.listingId,
                  roomTypeId: reservationRequest.roomTypeId,
                  moveIn: reservationRequest.moveIn,
                  months: 1,
                  beds: 1,
                  occupants: 1,
                  idempotencyKey: `pg-cancel-${viewport.name}-${Date.now()}`,
                },
              });
              const secondBody = await second.json().catch(() => ({}));
              const secondId = String(secondBody?.booking?.bookingId || '');
              assertCheck(`${viewport.name}: a second bed reservation is created for cancellation`, second.status() === 201 && Boolean(secondId), JSON.stringify(secondBody).slice(0, 240));

              if (secondId) {
                const cancelled = await page.request.post(
                  `${baseUrl}/api/pg/bookings/${encodeURIComponent(secondId)}/cancel`,
                  { headers: auth },
                );
                const cancelledBody = await cancelled.json().catch(() => ({}));
                assertCheck(
                  `${viewport.name}: an unpaid reservation cancels and releases its bed`,
                  cancelled.ok() && String(cancelledBody?.booking?.status || cancelledBody?.status || '') === 'cancelled',
                  `${cancelled.status()} ${JSON.stringify(cancelledBody).slice(0, 240)}`,
                );

                const mine = await page.request.get(`${baseUrl}/api/pg/bookings`, { headers: auth });
                const mineBody = await mine.json().catch(() => ({}));
                const persisted = (mineBody.bookings || []).find((booking) => booking.bookingId === secondId);
                assertCheck(
                  `${viewport.name}: the cancellation is persisted in My Bookings`,
                  Boolean(persisted) && persisted.status === 'cancelled',
                  JSON.stringify(persisted || {}).slice(0, 240),
                );
              }
            }
          }
        }
      }
    }

    // ------------------------------------------------------------- hygiene
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assertCheck(`${viewport.name}: no horizontal overflow`, !overflow);
    assertCheck(`${viewport.name}: no uncaught page error`, pageErrors.length === 0, pageErrors.join(' | '));

    // A late inventory refresh can still be intercepted when the viewport
    // finishes; unroute before closing so route.fetch cannot outlive the page.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => uiServer.close(resolve));
}

console.log(`PG browser journey: ${results.length} checks passed, ${failures} failed`);
if (failures) process.exitCode = 1;
