import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  STAY,
  USERS,
  sessionToken,
  startStaysHarness,
  type StaysHarness,
} from './stays-e2e-harness';

/**
 * Host workspace: real owner session → Express → PostgreSQL.
 * Inventory edits, check-in/checkout, offline collection and review guards.
 */

let harness: StaysHarness;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  harness = await startStaysHarness({
    merchantVpa: 'bookourspace@upi',
    paymentSandboxSecret: 'e2e-host-sandbox-secret-012345',
  });
});
test.afterAll(async () => { await harness?.stop(); });

function isoPlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
    } catch { /* context closed mid-flight */ }
  });
  return { page, context };
}

async function api(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${harness.apiUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

function safeSqlStates(output: string): string[] {
  return [...new Set([...output.matchAll(/\bcode: '([A-Z0-9]{5})'/g)].map((match) => match[1]))];
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
      idempotencyKey: `host-e2e-${mode}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      guestName: 'Host Guest',
      guestPhone: '+919000000009',
    }),
  });
}

test('host workspace is owner-only', async () => {
  const guest = sessionToken(USERS.customerA);
  const response = await api('/api/stays/host/listings', guest);
  expect([401, 403]).toContain(response.status);
});

test('host edits room pricing and the public search immediately reflects it', async ({ browser }) => {
  const { page, context } = await openApp(browser, sessionToken(USERS.provider));
  try {
    await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.getByRole('menuitem', { name: 'Host workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'Host workspace' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText('Stay details');
    await dialog.getByLabel('Choose a stay listing').selectOption({ label: STAY.title });
    await expect(dialog).toContainText(STAY.title);

    const priceInput = dialog.getByLabel('Nightly price rupees Deluxe King Room');
    await expect(priceInput).toBeVisible({ timeout: 20_000 });
    await priceInput.fill('2600');
    await dialog.getByRole('button', { name: 'Save room' }).first().click();
    await expect(dialog).toContainText('Room type updated.', { timeout: 20_000 });

    const rooms = await harness.query(
      `select rt.base_price_paise from public.stay_room_types rt join public.stay_properties p on p.id = rt.property_id where p.listing_id = $1 order by rt.base_price_paise limit 1`,
      [STAY.listingId],
    );
    expect(Number(rooms[0].base_price_paise)).toBe(260000);

    const search = await api('/api/stays/search?destination=Hyderabad', sessionToken(USERS.customerA));
    expect(search.body.ok, JSON.stringify(search.body)).toBe(true);
    expect(search.body.items[0].priceFromPaise).toBe(260000);
  } finally {
    await context.close();
  }
});

test('host checks a guest in, collects payment, checks out and the guest reviews once', async ({ browser }) => {
  const guest = sessionToken(USERS.customerA);
  const created = await createBooking(guest, isoPlus(0), isoPlus(1), 'pay_after_service');
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const bookingId = created.body.bookingId as string;
  expect(bookingId).toBeTruthy();

  const { page, context } = await openApp(browser, sessionToken(USERS.provider));
  try {
    await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.getByRole('menuitem', { name: 'Host workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'Host workspace' });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByLabel('Choose a stay listing').selectOption({ label: STAY.title });
    await dialog.getByRole('button', { name: /^Bookings/ }).click();
    await expect(dialog).toContainText('Host Guest', { timeout: 20_000 });

    await dialog.getByRole('button', { name: 'Check in', exact: true }).first().click();
    await expect(dialog).toContainText('Guest checked in.', { timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: 'Record property payment' }).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Record property payment' }).first().click();
    await expect(dialog).toContainText('Payment recorded as collected at the property.', { timeout: 20_000 });

    await dialog.getByRole('button', { name: 'Check out' }).first().click();
    await expect(dialog).toContainText('Stay completed.', { timeout: 20_000 });

    const stored = await harness.query(`select status, payment_status from public.bookings where id = $1`, [bookingId]);
    expect(stored[0].status).toBe('completed');
    expect(stored[0].payment_status).toBe('collected_offline');

    const review = await api(`/api/stays/bookings/${bookingId}/review`, guest, {
      method: 'POST',
      body: JSON.stringify({ rating: 5, comment: 'The host made check-in effortless and the room was spotless.' }),
    });
    expect(review.status).toBe(201);
    const duplicate = await api(`/api/stays/bookings/${bookingId}/review`, guest, {
      method: 'POST',
      body: JSON.stringify({ rating: 4, comment: 'A second review must be rejected by the database.' }),
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe('ALREADY_REVIEWED');

    const publicReviews = await api(`/api/stays/${STAY.listingId}/reviews`, guest);
    expect(publicReviews.body.reviewCount).toBe(3);
  } finally {
    await page.goto('about:blank').catch(() => undefined);
    await context.close();
  }
});

test('manual online settlement is refused for an owner and recorded for an admin', async () => {
  const guest = sessionToken(USERS.customerA);
  const created = await createBooking(guest, isoPlus(2), isoPlus(4), 'upi');
  expect(created.status).toBe(201);
  const bookingId = created.body.bookingId as string;

  const owner = await api(`/api/stays/host/bookings/${bookingId}/action`, sessionToken(USERS.provider), {
    method: 'POST',
    body: JSON.stringify({ action: 'approve_online' }),
  });
  expect(owner.status).toBe(403);
  expect(owner.body.error).toBe('MANUAL_APPROVAL_FORBIDDEN');

  const admin = await api(`/api/stays/host/bookings/${bookingId}/action`, sessionToken(USERS.admin), {
    method: 'POST',
    body: JSON.stringify({ action: 'approve_online' }),
  });
  expect(admin.status, JSON.stringify({ status: admin.status, error: admin.body.error, sqlStates: safeSqlStates(harness.apiOutput()) })).toBe(200);
  expect(admin.body.paymentStatus).toBe('verified');

  const state = await harness.query(
    `select b.payment_status, i.status as intent_status, i.provider, a.status as allocation_status
       from public.bookings b
       join public.payment_intents i on i.booking_id = b.id
       join public.stay_allocations a on a.booking_id = b.id
      where b.id = $1`,
    [bookingId],
  );
  expect(state[0].payment_status).toBe('verified');
  expect(state[0].intent_status).toBe('verified');
  expect(state[0].provider).toBe('manual_approval');
  expect(state[0].allocation_status).toBe('confirmed');

  const events = await harness.query(
    `select event_type, amount_paise, processed_at from public.payment_provider_events where intent_id = (select id from public.payment_intents where booking_id = $1)`,
    [bookingId],
  );
  expect(events).toHaveLength(1);
  expect(events[0].event_type).toBe('payment.captured');
  expect(Number(events[0].amount_paise)).toBe(created.body.amountPaise);
  expect(events[0].processed_at).toBeTruthy();
});

test('request-to-book holds inventory, host approves, guest self checks in and out', async ({ browser }) => {
  const guest = sessionToken(USERS.customerA);
  const villaRoom = harness.roomTypeIds['stay-e2e-villa-1'];
  expect(villaRoom).toBeTruthy();
  const request = await api('/api/stays/requests', guest, {
    method: 'POST',
    body: JSON.stringify({
      listingId: 'stay-e2e-villa-1', roomTypeId: villaRoom,
      checkIn: isoPlus(0), checkOut: isoPlus(1), units: 1,
      paymentMode: 'pay_after_service', idempotencyKey: `request-${Date.now()}`,
      guestName: 'Request Guest', guestPhone: '+919000000010',
    }),
  });
  expect(request.status).toBe(201);
  expect(request.body.status).toBe('pending_approval');
  expect(request.body.totalPaise).toBeGreaterThan(0);
  const bookingId = request.body.bookingId as string;

  const pending = await harness.query(`select status, payment_status from public.bookings where id = $1`, [bookingId]);
  expect(pending[0].status).toBe('pending_approval');
  expect(pending[0].payment_status).toBe('not_due');

  const { page, context } = await openApp(browser, sessionToken(USERS.provider));
  try {
    await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.getByRole('menuitem', { name: 'Host workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'Host workspace' });
    await dialog.getByLabel('Choose a stay listing').selectOption({ label: 'E2E Palm Pool Villa' });
    await dialog.getByRole('button', { name: /^Bookings/ }).click();
    await expect(dialog).toContainText('Request Guest', { timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Approve request' }).first().click();
    await expect(dialog).toContainText('Request approved', { timeout: 20_000 });
  } finally {
    await context.close();
  }

  const approved = await harness.query(`select status, payment_status from public.bookings where id = $1`, [bookingId]);
  expect(approved[0].status).toBe('confirmed');
  expect(approved[0].payment_status).toBe('pay_later');

  const { page: guestPage, context: guestContext } = await openApp(browser, guest);
  try {
    await guestPage.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
    await guestPage.getByRole('button', { name: 'My stays', exact: true }).first().click();
    const trips = guestPage.getByRole('dialog', { name: 'My stays' });
    await expect(trips).toContainText('E2E Palm Pool Villa', { timeout: 20_000 });
    await trips.getByRole('button', { name: 'Self check-in' }).first().click();
    await expect(trips).toContainText('You are checked in', { timeout: 20_000 });
    await trips.getByRole('button', { name: 'Self check-out' }).first().click();
    await expect(trips).toContainText('Checkout complete', { timeout: 20_000 });
  } finally {
    await guestContext.close();
  }
  const completed = await harness.query(`select status from public.bookings where id = $1`, [bookingId]);
  expect(completed[0].status).toBe('completed');

  const review = await api(`/api/stays/bookings/${bookingId}/review`, guest, {
    method: 'POST',
    body: JSON.stringify({ rating: 5, comment: 'Self check-in was verified and the host approved quickly.' }),
  });
  expect(review.status).toBe(201);
});

test('request rejection, expiry and cancellation release the held unit', async () => {
  const guest = sessionToken(USERS.customerA);
  const owner = sessionToken(USERS.provider);
  const villaRoom = harness.roomTypeIds['stay-e2e-villa-1'];
  const create = (key: string, days: number) => api('/api/stays/requests', guest, {
    method: 'POST',
    body: JSON.stringify({
      listingId: 'stay-e2e-villa-1', roomTypeId: villaRoom,
      checkIn: isoPlus(days), checkOut: isoPlus(days + 2), units: 1,
      paymentMode: 'pay_after_service', idempotencyKey: key,
      guestName: 'Lifecycle Guest', guestPhone: '+919000000011',
    }),
  });

  const rejected = await create(`reject-${Date.now()}`, 30);
  const rejectAction = await api(`/api/stays/host/bookings/${rejected.body.bookingId}/action`, owner, {
    method: 'POST', body: JSON.stringify({ action: 'reject_request' }),
  });
  expect(rejectAction.status).toBe(200);
  let state = await harness.query(`select b.status, a.status as alloc from public.bookings b join public.stay_allocations a on a.booking_id=b.id where b.id=$1`, [rejected.body.bookingId]);
  expect(state[0].status).toBe('rejected');
  expect(state[0].alloc).toBe('released');

  const expired = await create(`expire-${Date.now()}`, 34);
  await harness.query(`update public.bookings set request_expires_at = now() - interval '1 minute' where id = $1`, [expired.body.bookingId]);
  await api('/api/stays/host/bookings', owner);
  state = await harness.query(`select b.status, a.status as alloc from public.bookings b join public.stay_allocations a on a.booking_id=b.id where b.id=$1`, [expired.body.bookingId]);
  expect(state[0].status).toBe('expired');
  expect(state[0].alloc).toBe('released');

  const cancelled = await create(`cancel-${Date.now()}`, 38);
  const cancelAction = await api(`/api/stays/bookings/${cancelled.body.bookingId}/cancel`, guest, { method: 'POST', body: '{}' });
  expect(cancelAction.status).toBe(200);
  state = await harness.query(`select b.status, a.status as alloc from public.bookings b join public.stay_allocations a on a.booking_id=b.id where b.id=$1`, [cancelled.body.bookingId]);
  expect(state[0].status).toBe('cancelled');
  expect(state[0].alloc).toBe('released');
});

test('cleaning and service fees are computed by PostgreSQL and charged in the total', async () => {
  const owner = sessionToken(USERS.provider);
  const guest = sessionToken(USERS.customerA);
  const save = await api('/api/stays/host/properties', owner, {
    method: 'PUT',
    body: JSON.stringify({
      listingId: 'stay-e2e-villa-1', name: 'E2E Palm Pool Villa', city: 'Goa',
      propertyType: 'villa', placeType: 'entire_home', basePricePaise: 900000,
      taxPercent: 12, cleaningFeePaise: 50000, serviceFeeBps: 500,
      bedrooms: 3, beds: 4, bathrooms: 3, maxGuests: 8, instantBook: false,
      amenities: ['WiFi'], hostLanguages: ['english'], accessibility: ['step_free_entrance'],
    }),
  });
  expect(save.status, JSON.stringify(save.body)).toBe(200);
  const room = harness.roomTypeIds['stay-e2e-villa-1'];
  const quote = await api(`/api/stays/stay-e2e-villa-1/quote?roomTypeId=${room}&checkIn=${isoPlus(60)}&checkOut=${isoPlus(62)}&units=1`, guest);
  expect(quote.status).toBe(200);
  expect(quote.body.subtotalPaise).toBe(1800000);
  expect(quote.body.cleaningFeePaise).toBe(50000);
  expect(quote.body.serviceFeePaise).toBe(90000);
  expect(quote.body.taxesPaise).toBe(232800);
  expect(quote.body.totalPaise).toBe(2172800);

  const checkout = await api('/api/stays/checkout', guest, {
    method: 'POST',
    body: JSON.stringify({
      listingId: 'stay-e2e-villa-1', roomTypeId: room,
      checkIn: isoPlus(64), checkOut: isoPlus(66), units: 1,
      paymentMode: 'pay_after_service', idempotencyKey: `fees-${Date.now()}`,
      guestName: 'Fee Guest', guestPhone: '+919000000012',
    }),
  });
  expect(checkout.status).toBe(201);
  expect(checkout.body.amountPaise).toBe(2172800);
  const stored = await harness.query(`select total_paise, payload from public.bookings where id=$1`, [checkout.body.bookingId]);
  expect(Number(stored[0].total_paise)).toBe(2172800);
  expect(Number(stored[0].payload.cleaningFeePaise)).toBe(50000);
  expect(Number(stored[0].payload.serviceFeePaise)).toBe(90000);
  expect(Number(stored[0].payload.taxesPaise)).toBe(232800);
});

test('public host profile exposes verified fields and active stays only', async () => {
  const response = await api(`/api/stays/hosts/${USERS.provider.authId}`, sessionToken(USERS.customerA));
  expect(response.status).toBe(200);
  expect(response.body.host.name).toBe(USERS.provider.name);
  expect(response.body.host.verified).toBe(true);
  expect(response.body.host.activeStays).toBeGreaterThanOrEqual(5);
  expect(Array.isArray(response.body.listings)).toBe(true);
  expect(JSON.stringify(response.body)).not.toMatch(/customer_phone|email|business_phone/i);
});

test('guest sends a request from the detail panel and opens the host profile', async ({ browser }) => {
  const { page, context } = await openApp(browser, sessionToken(USERS.customerA));
  try {
    await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
    await page.locator('button[aria-label="View E2E Palm Pool Villa"]').first().click();
    const detail = page.getByRole('dialog').first();
    await expect(detail).toContainText('Verified stay.');
    const dates = detail.locator('input[type="date"]');
    await dates.nth(0).fill(isoPlus(70));
    await dates.nth(1).fill(isoPlus(72));
    await detail.getByRole('button', { name: 'Reserve', exact: true }).click();
    await expect(detail).toContainText('Confirm and pay');
    await detail.getByLabel('Guest name').fill('Test Guest');
    await detail.getByLabel('Guest phone').fill('9876543210');
    const requestButton = detail.getByRole('button', { name: 'Request to book' });
    await expect(requestButton).toBeEnabled({ timeout: 20_000 });
    await requestButton.click();
    await expect(detail).toContainText('Request sent to the host', { timeout: 20_000 });
    await expect(detail).toContainText('No payment was taken');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.locator('button[aria-label="View E2E Grand Residency & Suites"]').first().click();
    const hotel = page.getByRole('dialog').first();
    await hotel.getByRole('button', { name: 'View host profile' }).click();
    const profile = page.getByRole('dialog', { name: 'Host profile' });
    await expect(profile).toContainText('Verified host', { timeout: 20_000 });
    await expect(profile).toContainText('Stays hosted by', { timeout: 20_000 });
    await expect(profile).toContainText('E2E Grand Residency & Suites');
    const body = await profile.innerText();
    expect(body).not.toMatch(/@example|phone|email/i);
  } finally {
    await context.close().catch(() => undefined);
  }
});
