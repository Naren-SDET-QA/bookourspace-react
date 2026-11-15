import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  STAY,
  USERS,
  sessionToken,
  startStaysHarness,
  type StaysHarness,
} from './stays-e2e-harness';

/**
 * Hotels & Stays — real browser → real Express → disposable PostgreSQL.
 *
 * The signed-in identity is a LOCAL test session token (HMAC-signed by the
 * server). It is explicitly NOT a hosted Google OAuth login: no Supabase, no
 * Google and no payment provider is contacted. The UI origin proxies `/api/*`
 * to the harness Express server so every response is real.
 */

const tokens = {
  customerA: sessionToken(USERS.customerA),
  customerB: sessionToken(USERS.customerB),
  provider: sessionToken(USERS.provider),
  admin: sessionToken(USERS.admin),
};

let harness: StaysHarness;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  harness = await startStaysHarness();
});

test.afterAll(async () => {
  await harness?.stop();
});

async function openApp(browser: Browser, token: string, viewport?: { width: number; height: number }): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext(viewport ? { viewport } : undefined);
  await context.addInitScript(([value]) => {
    try { window.localStorage.setItem('bos_session_token_v1', String(value)); } catch { /* ignore */ }
  }, [token]);
  const page = await context.newPage();
  await page.route('**/*', async (route) => {
    try {
      const target = new URL(route.request().url());
      if (target.origin === harness.uiUrl) {
        if (target.pathname.startsWith('/api/')) {
          const upstream = await route.fetch({ url: `${harness.apiUrl}${target.pathname}${target.search}` });
          await route.fulfill({ response: upstream });
        } else {
          await route.continue();
        }
        return;
      }
      await route.abort('blockedbyclient');
    } catch {
      // The context can close while a proxied request is in flight; that race is
      // not a product failure.
    }
  });
  return { page, context };
}

function isoPlus(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function api(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${harness.apiUrl}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

test('Style 2 — signed-in local customer reserves, sees My Bookings, cancels, inventory releases', async ({ browser }) => {
  const { page, context } = await openApp(browser, tokens.customerA);
  try {
    await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });

    const card = page.locator(`[aria-label="View ${STAY.title}"]`).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Verified stay.');

    const dateInputs = dialog.locator('input[type="date"]');
    await dateInputs.nth(0).fill(isoPlus(20));
    await dateInputs.nth(1).fill(isoPlus(22));

    await expect(dialog).toContainText(/Deluxe King Room|room type|ROOM TYPE/i, { timeout: 20_000 });
    // Inventory metadata can render before the server's date-specific quote.
    // Do not try to submit while the authoritative quote request is pending.
    await expect(dialog).toContainText(/\d+ rooms? free/i, { timeout: 20_000 });

    const payAfterService = dialog.getByRole('button', { name: /^Pay after service/i }).first();
    await payAfterService.waitFor({ state: 'visible', timeout: 30_000 });
    await payAfterService.click();
    await expect(payAfterService).toHaveAttribute('aria-pressed', 'true');
    const reserve = dialog.getByRole('button', { name: /^Reserve with pay after service/i }).first();
    await expect(reserve).toBeEnabled({ timeout: 20_000 });
    await reserve.click();

    await expect(dialog).toContainText('Room reserved — payment due at the property', { timeout: 30_000 });
    await expect(dialog).toContainText('No online payment was taken');

    const bookingId = (await dialog.innerText()).match(/Booking\s+(\S+)/)?.[1] || '';
    expect(bookingId).toBeTruthy();

    await dialog.getByRole('button', { name: /My stay bookings/i }).click();
    await expect(dialog).toContainText(STAY.title, { timeout: 20_000 });
    await expect(dialog).toContainText(/confirmed/);

    const rows = await harness.query(`select status, booking_id from public.stay_allocations where booking_id = $1`, [bookingId]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('confirmed');

    await dialog.getByRole('button', { name: /^Cancel$/ }).first().click();
    await expect(dialog).toContainText(/cancel|refund/i, { timeout: 20_000 });

    await expect.poll(async () => {
      const after = await harness.query(`select status from public.stay_allocations where booking_id = $1`, [bookingId]);
      return after[0]?.status;
    }, { timeout: 20_000 }).toBe('released');
  } finally {
    await context.close();
  }
});

test('Style 2 — mobile and tablet viewports reach the same booking panel without overflow', async ({ browser }) => {
  for (const viewport of [
    { name: 'mobile 390×844', width: 390, height: 844 },
    { name: 'tablet 834×1112', width: 834, height: 1112 },
  ]) {
    const { page, context } = await openApp(browser, tokens.customerA, viewport);
    try {
      await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
      const card = page.locator(`[aria-label="View ${STAY.title}"]`).first();
      await expect(card, viewport.name).toBeVisible({ timeout: 30_000 });
      await card.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: /^Pay after service/i }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${viewport.name} horizontal overflow`).toBe(false);
    } finally {
      await context.close();
    }
  }
});

test('Style 1 — signed-in customer reserves with pay after service, views booking, cancels, and releases inventory', async ({ browser }) => {
  const { page, context } = await openApp(browser, tokens.customerA);
  try {
    await page.goto(`${harness.uiUrl}/#stays/old`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(STAY.title, { timeout: 30_000 });
    await page.getByText(STAY.title, { exact: false }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const dateInputs = dialog.locator('input[type="date"]');
    await dateInputs.nth(0).fill(isoPlus(30));
    await dateInputs.nth(1).fill(isoPlus(32));
    await expect(dialog).toContainText('2 room types', { timeout: 20_000 });
    await expect(dialog).toContainText(/\d+ rooms? free/i, { timeout: 20_000 });

    // Online payment is not enabled in this local harness. Exercise the real
    // supported pay-at-property booking without claiming money was collected.
    const payAfterService = dialog.getByRole('button', { name: /^Pay after service/i }).first();
    await payAfterService.click();
    await expect(payAfterService).toHaveAttribute('aria-pressed', 'true');
    const reserve = dialog.getByRole('button', { name: /^Reserve with pay after service/i }).first();
    await expect(reserve).toBeEnabled({ timeout: 20_000 });
    await reserve.click();
    await expect(dialog).toContainText('Room reserved — payment due at the property', { timeout: 30_000 });
    await expect(dialog).toContainText('No online payment was taken');

    const bookingId = (await dialog.innerText()).match(/Booking\s+(\S+)/)?.[1] || '';
    expect(bookingId).toBeTruthy();
    const before = await harness.query(`select payment_status, status from public.bookings where id = $1`, [bookingId]);
    expect(before).toHaveLength(1);
    expect(before[0].payment_status).toBe('pay_later');

    await dialog.getByRole('button', { name: /My stay bookings/i }).click();
    await expect(dialog).toContainText(STAY.title, { timeout: 20_000 });
    await dialog.getByRole('button', { name: /^Cancel$/ }).first().click();
    await expect(dialog).toContainText(/cancel|refund/i, { timeout: 20_000 });
    await expect.poll(async () => {
      const after = await harness.query(`select status from public.stay_allocations where booking_id = $1`, [bookingId]);
      return after[0]?.status;
    }, { timeout: 20_000 }).toBe('released');
  } finally {
    await context.close();
  }
});

test('API — unauthenticated and foreign access is rejected', async () => {
  const anonymous = await api('/api/stays/bookings');
  expect(anonymous.status).toBe(401);

  const range = { checkIn: isoPlus(40), checkOut: isoPlus(42) };
  const hold = await api(`/api/stays/${STAY.listingId}/holds`, tokens.customerA, {
    method: 'POST', body: JSON.stringify({ roomTypeId: harness.deluxeRoomTypeId, ...range }),
  });
  expect(hold.status).toBe(201);
  const holdToken = hold.data.holds?.[0]?.holdToken;
  expect(holdToken).toBeTruthy();

  const foreign = await api(`/api/stays/holds/${holdToken}/confirm`, tokens.customerB, {
    method: 'POST', body: JSON.stringify({ bookingId: 'not-mine' }),
  });
  expect([403, 404, 409]).toContain(foreign.status);

  await api(`/api/stays/holds/${holdToken}/release`, tokens.customerA, { method: 'POST', body: '{}' });
});

test('API — unpaid confirm is refused and concurrent holds never double-book', async () => {
  const range = { checkIn: isoPlus(50), checkOut: isoPlus(52) };
  const hold = await api(`/api/stays/${STAY.listingId}/holds`, tokens.customerA, {
    method: 'POST', body: JSON.stringify({ roomTypeId: harness.deluxeRoomTypeId, ...range }),
  });
  expect(hold.status).toBe(201);
  const holdToken = hold.data.holds[0].holdToken;

  // A real booking that the payment provider has NOT verified must never
  // consume inventory.
  const unpaidBookingId = `unpaid-${Date.now()}`;
  await harness.query(
    `insert into public.bookings
       (id, user_id, listing_id, listing_title, provider_id, customer_name, customer_phone,
        scheduled_date, scheduled_time, amount, status, payment_status)
     values ($1, $2, $3, $4, $5, 'Guest A', '+919000000000', $6, 'nightly', 5000, 'pending', 'pay_later')`,
    [unpaidBookingId, USERS.customerA.authId, STAY.listingId, STAY.title, `prov-${USERS.provider.authId.slice(0, 8)}`, isoPlus(50)],
  );
  const unpaid = await api(`/api/stays/holds/${holdToken}/confirm`, tokens.customerA, {
    method: 'POST', body: JSON.stringify({ bookingId: unpaidBookingId }),
  });
  expect(unpaid.status).toBe(409);
  expect(unpaid.data.error).toBe('PAYMENT_NOT_VERIFIED');

  await api(`/api/stays/holds/${holdToken}/release`, tokens.customerA, { method: 'POST', body: '{}' });

  const suiteRange = { checkIn: isoPlus(60), checkOut: isoPlus(62) };
  const [a, b] = await Promise.all([
    api(`/api/stays/${STAY.listingId}/holds`, tokens.customerA, { method: 'POST', body: JSON.stringify({ roomTypeId: harness.suiteRoomTypeId, ...suiteRange }) }),
    api(`/api/stays/${STAY.listingId}/holds`, tokens.customerB, { method: 'POST', body: JSON.stringify({ roomTypeId: harness.suiteRoomTypeId, ...suiteRange }) }),
  ]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);

  const winner = a.status === 201 ? a : b;
  await api(`/api/stays/holds/${winner.data.holds[0].holdToken}/release`, a.status === 201 ? tokens.customerA : tokens.customerB, {
    method: 'POST', body: '{}',
  });
});

test('API — unconfigured online payment stays disabled (no fake success)', async () => {
  const range = { checkIn: isoPlus(70), checkOut: isoPlus(72) };
  const hold = await api(`/api/stays/${STAY.listingId}/holds`, tokens.customerA, {
    method: 'POST', body: JSON.stringify({ roomTypeId: harness.deluxeRoomTypeId, ...range }),
  });
  expect(hold.status).toBe(201);
  const holdToken = hold.data.holds[0].holdToken;

  const checkout = await api('/api/stays/checkout', tokens.customerA, {
    method: 'POST',
    body: JSON.stringify({
      listingId: STAY.listingId,
      roomTypeId: harness.deluxeRoomTypeId,
      ...range,
      units: 1,
      paymentMode: 'upi',
      idempotencyKey: randomUUID(),
    }),
  });
  expect([503, 502, 409]).toContain(checkout.status);
  await api(`/api/stays/holds/${holdToken}/release`, tokens.customerA, { method: 'POST', body: '{}' });
});

test('API — availability and pricing are server-authoritative; invalid dates rejected', async () => {
  const publicRooms = await api(`/api/stays/${STAY.listingId}/room-types`);
  expect(publicRooms.status).toBe(200);
  expect(publicRooms.data.roomTypes).toHaveLength(2);
  expect(publicRooms.data.roomTypes.map((room: any) => room.name)).toContain('Deluxe King Room');

  const availability = await api(`/api/stays/${STAY.listingId}/availability?checkIn=${isoPlus(80)}&checkOut=${isoPlus(82)}`, tokens.customerA);
  expect(availability.status).toBe(200);
  const room = availability.data.roomTypes.find((entry: any) => entry.roomTypeId === harness.deluxeRoomTypeId);
  expect(room).toBeTruthy();
  expect(room.totalUnits).toBe(2);
  expect(room.availableUnits).toBeGreaterThan(0);
  expect(room.basePricePaise).toBe(STAY.deluxePricePaise);

  const badDates = await api(`/api/stays/${STAY.listingId}/availability?checkIn=${isoPlus(90)}&checkOut=${isoPlus(88)}`, tokens.customerA);
  expect(badDates.status).toBe(400);
});

test('API — bookings survive an API restart', async () => {
  const before = await api('/api/stays/bookings', tokens.customerA);
  expect(before.status).toBe(200);
  const countBefore = before.data.bookings.length;

  await harness.restartApi();

  const after = await api('/api/stays/bookings', tokens.customerA);
  expect(after.status).toBe(200);
  expect(after.data.bookings.length).toBe(countBefore);
});
