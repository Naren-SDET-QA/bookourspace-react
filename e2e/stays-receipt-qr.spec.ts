import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import {
  STAY,
  USERS,
  sessionToken,
  startStaysHarness,
  type StaysHarness,
} from './stays-e2e-harness';

const tokens = {
  customer: sessionToken(USERS.customerA),
  otherCustomer: sessionToken(USERS.customerB),
  provider: sessionToken(USERS.provider),
};

let harness: StaysHarness;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  harness = await startStaysHarness();
});
test.afterAll(async () => {
  await harness?.stop();
});

function isoPlus(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function api(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${harness.apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function createBooking(days: number, mode: 'pay_after_service' | 'upi' = 'pay_after_service') {
  const rooms = await api(`/api/stays/${STAY.listingId}/room-types`);
  const roomTypeId = rooms.body.roomTypes[0].id;
  return api('/api/stays/checkout', tokens.customer, {
    method: 'POST',
    body: JSON.stringify({
      listingId: STAY.listingId,
      roomTypeId,
      checkIn: isoPlus(days),
      checkOut: isoPlus(days + 2),
      units: 1,
      paymentMode: mode,
      guestName: 'Receipt Guest',
      guestEmail: USERS.customerA.email,
      guestPhone: '9876543210',
      guests: 2,
      guestAddress: 'Private local test address',
      idempotencyKey: `receipt-${mode}-${days}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });
}

async function openApp(browser: Browser, token: string): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(([value]) => {
    try { window.localStorage.setItem('bos_session_token_v1', String(value)); } catch { /* ignore */ }
  }, [token]);
  const page = await context.newPage();
  await page.route('**/*', async (route) => {
    try {
      const target = new URL(route.request().url());
      if (target.origin === harness.uiUrl) {
        if (target.pathname.startsWith('/api/')) {
          // Bound the proxy: an upstream that never answers would otherwise
          // hang this handler, which close() waits on via unrouteAll.
          let proxyTimer: ReturnType<typeof setTimeout> | undefined;
          const upstream = await Promise.race([
            route.fetch({ url: `${harness.apiUrl}${target.pathname}${target.search}` }),
            new Promise<never>((_resolve, reject) => {
              proxyTimer = setTimeout(
                () => reject(Object.assign(new Error('API_PROXY_TIMEOUT'), { code: 'API_PROXY_TIMEOUT' })),
                30_000,
              );
            }),
          ]).finally(() => { if (proxyTimer) clearTimeout(proxyTimer); });
          await route.fulfill({ response: upstream });
        } else await route.continue();
        return;
      }
      await route.abort('blockedbyclient');
    } catch (error) {
    if ((error as { code?: string })?.code === 'API_PROXY_TIMEOUT') {
      await route.abort('timedout').catch(() => undefined);
      return;
    }
      /* closing race */
    }
  });
  return { page, context };
}

test('QR is server-issued, scoped to the booking, and cannot be replayed after check-in', async () => {
  const created = await createBooking(120);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const bookingId = created.body.bookingId as string;

  const qr = await api(`/api/stays/bookings/${bookingId}/qr`, tokens.customer);
  expect(qr.status).toBe(200);
  expect(qr.body.token).toMatch(/^bos1\./);
  const payload = JSON.parse(Buffer.from(String(qr.body.token).split('.')[1], 'base64url').toString('utf-8'));
  expect(payload.b).toBe(bookingId);
  expect(JSON.stringify(payload)).not.toMatch(/Receipt Guest|9876543210|@/);

  const invalid = await api('/api/stays/host/bookings/scan', tokens.provider, {
    method: 'POST', body: JSON.stringify({ token: 'bos1.invalid.signature' }),
  });
  expect(invalid.status).toBe(400);
  expect(invalid.body.error).toBe('QR_INVALID');

  const tooEarly = await api('/api/stays/host/bookings/scan', tokens.provider, {
    method: 'POST', body: JSON.stringify({ token: qr.body.token }),
  });
  expect(tooEarly.status).toBe(409);
  expect(tooEarly.body.error).toBe('TOO_EARLY');
});

test('host scan verifies a today booking, checks in once, and rejects replay', async () => {
  const created = await createBooking(0);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const bookingId = created.body.bookingId as string;
  const qr = await api(`/api/stays/bookings/${bookingId}/qr`, tokens.customer);
  expect(qr.status).toBe(200);

  const scanned = await api('/api/stays/host/bookings/scan', tokens.provider, {
    method: 'POST', body: JSON.stringify({ token: qr.body.token }),
  });
  expect(scanned.status, JSON.stringify(scanned.body)).toBe(200);
  expect(scanned.body.bookingId).toBe(bookingId);
  expect(scanned.body.status).toBe('checked_in');

  const replay = await api('/api/stays/host/bookings/scan', tokens.provider, {
    method: 'POST', body: JSON.stringify({ token: qr.body.token }),
  });
  expect(replay.status).toBe(409);
  expect(replay.body.error).toBe('ALREADY_CHECKED_IN');
});

test('receipt is unpaid-safe, itemized, downloadable as a real PDF, and exposes the QR in My Trips', async ({ browser }) => {
  const created = await createBooking(130);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const bookingId = created.body.bookingId as string;

  const receipt = await api(`/api/stays/bookings/${bookingId}/receipt`, tokens.customer);
  expect(receipt.status).toBe(200);
  expect(receipt.body.receipt.paid).toBe(false);
  expect(receipt.body.receipt.duePaise).toBeGreaterThan(0);
  expect(receipt.body.receipt.totalPaise).toBeGreaterThan(0);
  expect(receipt.body.receipt.hotelName).toBeTruthy();
  expect(receipt.body.receipt.guestEmail).toBe(USERS.customerA.email);
  expect(receipt.body.receipt.guests).toBe(2);
  expect(receipt.body.receipt.cancellationPolicy).toBeTruthy();
  expect(receipt.body.receipt.taxInvoice).toBe(false);
  expect(receipt.body.receipt.gstin).toBe('');
  expect(receipt.body.receipt.guestAddress).toBeUndefined();
  expect(receipt.body.qrToken).toMatch(/^bos1\./);
  const ownerContact = await harness.queryAsUser(USERS.customerA.authId,
    'select guest_email, guest_address from public.stay_booking_guest_contacts where booking_id=$1', [bookingId]);
  expect(ownerContact).toEqual([{ guest_email: USERS.customerA.email, guest_address: 'Private local test address' }]);
  const otherContact = await harness.queryAsUser(USERS.customerB.authId,
    'select guest_email, guest_address from public.stay_booking_guest_contacts where booking_id=$1', [bookingId]);
  expect(otherContact).toEqual([]);
  await expect(harness.queryAsUser(USERS.customerA.authId,
    'update public.stay_booking_guest_contacts set guest_address=$1 where booking_id=$2', ['unauthorized rewrite', bookingId]))
    .rejects.toMatchObject({ code: '42501' });

  const hostBookings = await api('/api/stays/host/bookings', tokens.provider);
  expect(JSON.stringify(hostBookings.body)).not.toContain(USERS.customerA.email);
  expect(JSON.stringify(hostBookings.body)).not.toContain('Private local test address');
  const privateViewer = await api(`/api/stays/bookings/${bookingId}/receipt`, USERS.customerB ? sessionToken(USERS.customerB) : undefined);
  expect(privateViewer.status).toBe(404);

  const { page, context } = await openApp(browser, tokens.customer);
  try {
    await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /My stays/i }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /My stays/i }).first().click();
    const trips = page.getByRole('dialog', { name: 'My stays' });
    await expect(trips).toBeVisible({ timeout: 20_000 });

    const row = trips.getByTestId('stay-booking-row').filter({ hasText: STAY.title }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: /Receipt \/ PDF/i }).click();
    const receiptDialog = page.getByRole('dialog', { name: 'Booking receipt' });
    await expect(receiptDialog).toBeVisible({ timeout: 20_000 });
    await expect(receiptDialog).toContainText(/BOOKING CONFIRMED — PAYMENT DUE|BOOKING CONFIRMATION/);
    await expect(receiptDialog).toContainText(USERS.customerA.email);
    await expect(receiptDialog).toContainText('Cancellation:');
    expect(await receiptDialog.locator('img[alt="BookOurSpace"]').evaluate((image) => (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(receiptDialog.locator('canvas')).toHaveCount(1);

    const downloadPromise = page.waitForEvent('download');
    await receiptDialog.getByRole('button', { name: /Download PDF/i }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const bytes = await fs.readFile(path);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5_000);
    expect(download.suggestedFilename()).toContain(bookingId);

    // Print opens the PDF blob with window.open(..., 'noopener,noreferrer'). Those
    // flags sever the opener link, so Playwright never reports a popup event. Spy on
    // window.open in the page instead: it proves the print action produced a blob URL
    // with the hardened features, without weakening the production security setting.
    await page.evaluate(() => {
      const w = window as unknown as { __printOpenCalls: unknown[][] };
      w.__printOpenCalls = [];
      const original = window.open.bind(window);
      window.open = ((...args: Parameters<typeof window.open>) => {
        w.__printOpenCalls.push(args as unknown[]);
        return original(...args);
      }) as typeof window.open;
    });
    await receiptDialog.getByRole('button', { name: /^Print$/ }).click();
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { __printOpenCalls: unknown[][] }).__printOpenCalls.length)).toBe(1);
    const printCall = await page.evaluate(() =>
      (window as unknown as { __printOpenCalls: unknown[][] }).__printOpenCalls[0]);
    expect(printCall[0]).toMatch(/^blob:/);
    expect(printCall[1]).toBe('_blank');
    expect(printCall[2]).toBe('noopener,noreferrer');

    await receiptDialog.getByRole('button', { name: 'Close receipt', exact: true }).click();
    const qrButton = row.getByRole('button', { name: /Booking QR/i });
    await qrButton.click();
    await expect(row.getByTestId('booking-qr')).toHaveCount(1);
  } finally {
    await context.close();
  }
});
