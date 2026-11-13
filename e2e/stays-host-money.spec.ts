import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  STAY,
  USERS,
  sessionToken,
  startStaysHarness,
  type StaysHarness,
} from './stays-e2e-harness';

/**
 * Host money actions in Chromium: real owner session → Express → PostgreSQL.
 * Covers offline property payment (collected_offline) and UPI settlement
 * approval (verified). Guest check-in/check-out is intentionally not exercised.
 */

let harness: StaysHarness;
test.describe.configure({ mode: 'serial' });

function isoPlus(days: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

async function openApp(browser: Browser, token: string): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
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
      /* context closed mid-flight */
    }
  });
  return { page, context };
}

async function closeApp(context: BrowserContext): Promise<void> {
  await context.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);
  await context.close().catch(() => undefined);
}

async function api(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${harness.apiUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function createBooking(token: string, checkIn: string, checkOut: string, mode: 'pay_after_service' | 'upi') {
  const rooms = await api(`/api/stays/${STAY.listingId}/room-types`, token);
  const roomTypeId = rooms.body.roomTypes[0].id;
  return api('/api/stays/checkout', token, {
    method: 'POST',
    body: JSON.stringify({
      listingId: STAY.listingId,
      roomTypeId,
      checkIn,
      checkOut,
      units: 1,
      paymentMode: mode,
      idempotencyKey: `host-money-${mode}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      guestName: 'Money Guest',
      guestPhone: '+919000000011',
    }),
  });
}

async function openBookings(page: Page) {
  await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menuitem', { name: 'Host workspace' }).click();
  const dialog = page.getByRole('dialog', { name: 'Host workspace' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.getByLabel('Choose a stay listing').selectOption({ label: STAY.title });
  await dialog.getByRole('button', { name: /^Bookings/ }).click();
  return dialog;
}

test.describe('host money actions', () => {
  test.describe('with owner manual settlement enabled for this suite', () => {
    test.beforeAll(async () => {
      harness = await startStaysHarness({
        merchantVpa: 'bookourspace@upi',
        paymentSandboxSecret: 'e2e-host-money-sandbox-secret-0123',
        allowOwnerManualSettlement: true,
      });
    });
    test.afterAll(async () => { await harness?.stop(); });

    test('host records offline property payment in the browser and PostgreSQL stores collected_offline', async ({ browser }) => {
      const guest = sessionToken(USERS.customerA);
      const created = await createBooking(guest, isoPlus(10), isoPlus(11), 'pay_after_service');
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const bookingId = created.body.bookingId as string;

      const { page, context } = await openApp(browser, sessionToken(USERS.provider));
      try {
        const dialog = await openBookings(page);
        await expect(dialog).toContainText('Money Guest', { timeout: 20_000 });
        await dialog.getByRole('button', { name: 'Record property payment' }).first().click();
        await expect(dialog).toContainText('Payment recorded as collected at the property.', { timeout: 20_000 });
      } finally {
        await page.goto('about:blank').catch(() => undefined);
        await closeApp(context);
      }

      const stored = await harness.query(`select payment_status from public.bookings where id = $1`, [bookingId]);
      expect(stored[0].payment_status).toBe('collected_offline');
    });

    test('host approves UPI settlement in the browser and PostgreSQL stores verified with an audit event', async ({ browser }) => {
      const guest = sessionToken(USERS.customerA);
      const created = await createBooking(guest, isoPlus(12), isoPlus(13), 'upi');
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const bookingId = created.body.bookingId as string;


      const { page, context } = await openApp(browser, sessionToken(USERS.provider));
      try {
        const dialog = await openBookings(page);
        await expect(dialog).toContainText('Money Guest', { timeout: 20_000 });
        await dialog.getByRole('button', { name: 'Approve settlement' }).first().click();
        await expect(dialog).toContainText('Settlement manually approved and recorded with an audit event.', { timeout: 20_000 });
      } finally {
        await page.goto('about:blank').catch(() => undefined);
        await closeApp(context);
      }

      const state = await harness.query(
        `select b.payment_status, i.status as intent_status, i.provider
           from public.bookings b join public.payment_intents i on i.booking_id = b.id
          where b.id = $1`,
        [bookingId],
      );
      expect(state[0].payment_status).toBe('verified');
      expect(state[0].intent_status).toBe('verified');
      expect(state[0].provider).toBe('manual_approval');

      const events = await harness.query(
        `select event_type from public.payment_provider_events
          where intent_id = (select id from public.payment_intents where booking_id = $1)`,
        [bookingId],
      );
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('payment.captured');
    });
  });

  test.describe('without owner manual settlement', () => {
    test.beforeAll(async () => {
      harness = await startStaysHarness({
        merchantVpa: 'bookourspace@upi',
        paymentSandboxSecret: 'e2e-host-money-sandbox-secret-0123',
        allowOwnerManualSettlement: false,
      });
    });
    test.afterAll(async () => { await harness?.stop(); });

    test('non-admin host cannot approve manual settlement when BOS_ALLOW_OWNER_MANUAL_SETTLEMENT is unset', async ({ browser }) => {
      const guest = sessionToken(USERS.customerA);
      const created = await createBooking(guest, isoPlus(14), isoPlus(15), 'upi');
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const bookingId = created.body.bookingId as string;


      const { page, context } = await openApp(browser, sessionToken(USERS.provider));
      try {
        const dialog = await openBookings(page);
        await expect(dialog).toContainText('Money Guest', { timeout: 20_000 });
        const approve = dialog.getByRole('button', { name: 'Approve settlement' }).first();
        await expect(approve).toBeVisible({ timeout: 20_000 });
        await approve.click();
        await expect(dialog).toContainText('MANUAL_APPROVAL_FORBIDDEN', { timeout: 20_000 });
      } finally {
        await page.goto('about:blank').catch(() => undefined);
        await closeApp(context);
      }

      const state = await harness.query(`select payment_status from public.bookings where id = $1`, [bookingId]);
      expect(state[0].payment_status).toBe('pending_verification');
      const events = await harness.query(
        `select count(*)::int as n from public.payment_provider_events e
           join public.payment_intents i on i.id = e.intent_id where i.booking_id = $1`,
        [bookingId],
      );
      expect(events[0].n).toBe(0);
    });
  });
});
