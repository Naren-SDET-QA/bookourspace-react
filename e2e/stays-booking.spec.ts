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

test.beforeEach(async () => {
  await harness?.approveTestListings();
});

async function openApp(browser: Browser, token: string, viewport?: { width: number; height: number }): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext(viewport ? { viewport } : undefined);
  await context.addInitScript(([value]) => {
    try { window.localStorage.setItem('bos_entry_choice_v1', value ? 'signed-in' : 'guest'); } catch { /* ignore */ }
    try {
      if (value) window.localStorage.setItem('bos_session_token_v1', String(value));
      else window.localStorage.removeItem('bos_session_token_v1');
    } catch { /* ignore */ }
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

test('Host API — provider manages owned stay details, rooms, units, blackout and bookings in PostgreSQL', async () => {
  const anonymous = await api('/api/stays/host/listings');
  expect(anonymous.status).toBe(401);
  const customer = await api('/api/stays/host/listings', tokens.customerA);
  expect(customer.status).toBe(403);

  const owned = await api('/api/stays/host/listings', tokens.provider);
  expect(owned.status).toBe(200);
  expect(owned.data.listings.some((row: any) => row.listing_id === STAY.listingId)).toBe(true);
  const detail = await api(`/api/stays/host/listings/${STAY.listingId}`, tokens.provider);
  expect(detail.status).toBe(200);
  expect(detail.data.property.id).toBe(harness.propertyId);

  const propertySave = await api('/api/stays/host/properties', tokens.provider, {
    method: 'PUT', body: JSON.stringify({ listingId: STAY.listingId, name: STAY.title, city: STAY.city, area: STAY.area, address: 'Road No. 12, Banjara Hills',
      propertyType: 'hotel', placeType: 'entire_home', basePricePaise: STAY.deluxePricePaise,
      taxPercent: 12, bedrooms: 2, beds: 3, bathrooms: 2, maxGuests: 4, amenities: ['WiFi'], instantBook: true, selfCheckIn: true, petsAllowed: true }),
  });
  expect(propertySave.status, JSON.stringify(propertySave.data)).toBe(200);
  const roomSave = await api('/api/stays/host/room-types', tokens.provider, {
    method: 'POST', body: JSON.stringify({ propertyId: harness.propertyId, name: 'Host E2E Room', maxAdults: 2,
      maxChildren: 1, basePricePaise: 345_000, bedrooms: 1, beds: 2, bathrooms: 1, amenities: ['WiFi'] }),
  });
  expect(roomSave.status).toBe(201);
  expect(Number(roomSave.data.roomType.base_price_paise)).toBe(345_000);
  const unitSave = await api('/api/stays/host/units', tokens.provider, {
    method: 'POST', body: JSON.stringify({ roomTypeId: roomSave.data.roomType.id, label: 'Host-301', floor: '3' }),
  });
  expect(unitSave.status).toBe(201);
  const blackoutRange = { startsOn: isoPlus(90), endsOn: isoPlus(92) };
  const countBeforeBlock = await harness.query(
    `select count(*)::int as count from public.stay_availability($1::uuid,$2::date,$3::date)`,
    [roomSave.data.roomType.id, blackoutRange.startsOn, blackoutRange.endsOn],
  );
  expect(Number(countBeforeBlock[0].count), 'the newly created unit is the available baseline').toBe(1);
  const block = await api('/api/stays/host/blocks', tokens.provider, {
    method: 'POST', body: JSON.stringify({ unitId: unitSave.data.unit.id, ...blackoutRange, reason: 'Local test maintenance' }),
  });
  expect(block.status).toBe(201);
  expect(block.data.block.is_active).toBe(true);
  const countWhileBlocked = await harness.query(
    `select count(*)::int as count from public.stay_availability($1::uuid,$2::date,$3::date)`,
    [roomSave.data.roomType.id, blackoutRange.startsOn, blackoutRange.endsOn],
  );
  expect(Number(countWhileBlocked[0].count)).toBe(0);
  const restore = await api('/api/stays/host/blocks', tokens.provider, {
    method: 'POST', body: JSON.stringify({ blockId: block.data.block.id, unitId: unitSave.data.unit.id,
      ...blackoutRange, isActive: false }),
  });
  expect(restore.status).toBe(200);
  expect(restore.data.block.is_active).toBe(false);
  const countAfterRestore = await harness.query(
    `select count(*)::int as count from public.stay_availability($1::uuid,$2::date,$3::date)`,
    [roomSave.data.roomType.id, blackoutRange.startsOn, blackoutRange.endsOn],
  );
  expect(Number(countAfterRestore[0].count)).toBe(1);

  const foreign = await api(`/api/stays/host/listings/not-owned-by-provider`, tokens.provider);
  expect(foreign.status).toBe(404);
  const bookings = await api('/api/stays/host/bookings', tokens.provider);
  expect(bookings.status).toBe(200);
  expect(Array.isArray(bookings.data.bookings)).toBe(true);
  expect(JSON.stringify(bookings.data.bookings)).not.toMatch(/guest_phone|guest_email|customer_phone/i);

  // Exercise host cover/order persistence with two ready local media rows.
  // The original fixture payload is restored and the rows are removed below.
  const mediaIds = [randomUUID(), randomUUID()];
  const [listingBefore] = await harness.query(
    `select payload->'images' as images, owner_id from public.listings where id=$1`, [STAY.listingId],
  );
  const mediaOwnerId = String(listingBefore.owner_id);
  const mediaPaths = mediaIds.map(id => `${mediaOwnerId}/stays/provider_listing/${id}/original.jpg`);
  try {
    for (let index = 0; index < mediaIds.length; index += 1) {
      await harness.query(
        `insert into public.media_assets
          (id,owner_id,module_key,parent_type,parent_id,bucket_id,object_path,media_kind,media_format,
           privacy,file_size_bytes,width,height,checksum_sha256,variants,display_order,alt_text,caption,processing_status)
         values ($1,$2,'stays','provider_listing',$3,'bos-public-media',$4,'image','jpeg','public',
                 1000,800,600,$5,'[]'::jsonb,$6,'Stay photo','', 'ready')`,
        [mediaIds[index], mediaOwnerId, STAY.listingId, mediaPaths[index], index ? 'b'.repeat(64) : 'a'.repeat(64), index],
      );
    }
    const order = await api('/api/stays/host/media-order', tokens.provider, {
      method: 'PUT', body: JSON.stringify({ listingId: STAY.listingId, mediaIds: [...mediaIds].reverse() }),
    });
    expect(order.status).toBe(200);
    expect(order.data.images[0]).toBe(`storage://bos-public-media/${mediaPaths[1]}`);
    const orders = await harness.query(`select display_order from public.media_assets where id=any($1::uuid[]) order by display_order`, [[...mediaIds].reverse()]);
    expect(orders.map((row: any) => Number(row.display_order))).toEqual([0, 1]);
  } finally {
    await harness.query(
      `update public.listings set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{images}',$2::jsonb,true) where id=$1`,
      [STAY.listingId, JSON.stringify(listingBefore.images || [])],
    );
    await harness.query(`delete from public.media_assets where id=any($1::uuid[])`, [mediaIds]);
  }

  // Keep the browser journey's disposable inventory stable for subsequent
  // customer tests; deactivate these test rows instead of deleting history.
  const deactivatedRoom = await api('/api/stays/host/room-types', tokens.provider, {
    method: 'POST', body: JSON.stringify({ roomTypeId: roomSave.data.roomType.id, propertyId: harness.propertyId,
      name: 'Host E2E Room', maxAdults: 2, maxChildren: 1, basePricePaise: 345_000,
      bedrooms: 1, beds: 2, bathrooms: 1, isActive: false }),
  });
  expect(deactivatedRoom.status).toBe(200);
  const deactivatedUnit = await api('/api/stays/host/units', tokens.provider, {
    method: 'POST', body: JSON.stringify({ unitId: unitSave.data.unit.id, roomTypeId: roomSave.data.roomType.id,
      label: 'Host-301', floor: '3', isActive: false }),
  });
  expect(deactivatedUnit.status).toBe(200);
});

test('Host browser — provider opens Stay hosting and sees owned PostgreSQL listing', async ({ browser }) => {
  const { page, context } = await openApp(browser, tokens.provider, { width: 390, height: 844 });
  try {
    await page.goto(`${harness.uiUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Provider Hub/i }).click();
    await expect(page.getByText('Provider & Seller Hub')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Stay hosting/i }).click();
    const workspace = page.getByRole('region', { name: 'Stay host workspace' });
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText(STAY.title, { timeout: 20_000 });
    await expect(workspace.getByLabel('Stay listing')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, 'host workspace mobile horizontal overflow').toBe(false);
  } finally {
    await context.close();
  }
});

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
    await expect(dialog.getByRole('button', { name: 'Reserve', exact: true })).toBeEnabled({ timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Reserve', exact: true }).click();
    await expect(dialog).toContainText('Confirm and pay', { timeout: 20_000 });
    await dialog.getByLabel('Guest name').fill('Test Guest');
    await dialog.getByLabel('Guest phone').fill('9876543210');

    const payAfterService = dialog.getByRole('button', { name: /^Pay at (Hotel|property)/i }).first();
    await payAfterService.waitFor({ state: 'visible', timeout: 30_000 });
    await payAfterService.click();
    await expect(payAfterService).toHaveAttribute('aria-pressed', 'true');
    const reserve = dialog.getByRole('button', { name: /^(Confirm Reservation|Reserve with pay after service|Reserve — Pay at Hotel)/i }).first();
    await expect(reserve).toBeEnabled({ timeout: 20_000 });
    await reserve.click();

    await expect(dialog).toContainText('BOOKING CONFIRMED — PAYMENT DUE', { timeout: 30_000 });
    await expect(dialog).toContainText('No online payment was taken');
    await expect(dialog).toContainText(USERS.customerA.email);
    await expect(dialog).toContainText('Guest name:');
    await expect(dialog).toContainText('Mobile:');
    await expect(dialog).toContainText('Price breakdown');
    await expect(dialog.getByAltText('BookOurSpace')).toBeVisible();
    const confirmationQr = dialog.getByTestId('stay-confirmation-qr');
    await expect(confirmationQr).toBeVisible({ timeout: 20_000 });
    await expect(confirmationQr.locator('svg')).toHaveCount(1);

    const bookingId = (await dialog.innerText()).match(/Booking ID\s+(\S+)/)?.[1] || '';
    expect(bookingId).toBeTruthy();

    await dialog.getByRole('button', { name: /My stay bookings/i }).click();
    const trips = page.getByRole('dialog', { name: 'My stays' });
    await expect(trips).toBeVisible({ timeout: 20_000 });
    const bookingRow = trips.getByTestId('stay-booking-row').filter({ hasText: STAY.title });
    await expect(bookingRow).toBeVisible({ timeout: 20_000 });
    await expect(bookingRow).toContainText(/Upcoming|confirmed/i);

    const rows = await harness.query(`select status, booking_id, guest_user_id from public.stay_allocations where booking_id = $1`, [bookingId]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('confirmed');
    expect(rows[0].guest_user_id).toBe(USERS.customerA.authId);
    const bookingFeed = await api('/api/stays/bookings', tokens.customerA);
    expect(bookingFeed.status).toBe(200);
    expect(bookingFeed.data.bookings.map((row: any) => row.bookingId)).toContain(bookingId);

    const cancelBooking = bookingRow.getByRole('button', { name: /^Cancel/ });
    await expect(cancelBooking).toBeEnabled();
    await cancelBooking.click();
    await bookingRow.getByRole('button', { name: 'Yes, cancel', exact: true }).click();
    await expect(trips).toContainText(/cancel|refund/i, { timeout: 20_000 });

    await expect.poll(async () => {
      const after = await harness.query(`select status from public.stay_allocations where booking_id = $1`, [bookingId]);
      return after[0]?.status;
    }, { timeout: 20_000 }).toBe('released');
  } finally {
    // A timed-out assertion may already have closed the BrowserContext. Keep
    // that cleanup race from masking the original booking-flow failure.
    await context.close().catch(() => undefined);
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
      const dates = dialog.locator('input[type="date"]');
      await dates.nth(0).fill(isoPlus(35));
      await dates.nth(1).fill(isoPlus(37));
      await dialog.getByRole('button', { name: 'Reserve', exact: true }).click();
      await expect(dialog.getByRole('button', { name: /^Pay at (Hotel|property)/i }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${viewport.name} horizontal overflow`).toBe(false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    } finally {
      await context.close();
    }
  }
});

test('Stay 1 and Stay 2 — unsigned guest reaches Continue with Google and keeps dates in the checkout draft', async ({ browser }) => {
  const checkIn = isoPlus(25);
  const checkOut = isoPlus(27);

  const { page, context } = await openApp(browser, '', { width: 1280, height: 800 });
  try {
    await page.goto(`${harness.uiUrl}/#stays/airbnb`, { waitUntil: 'domcontentloaded' });
    const card = page.locator(`[aria-label="View ${STAY.title}"]`).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    const stay2 = page.getByRole('dialog');
    await expect(stay2).toBeVisible();
    const stay2Dates = stay2.locator('input[type="date"]');
    await stay2Dates.nth(0).fill(checkIn);
    await stay2Dates.nth(1).fill(checkOut);
    const stay2Reserve = stay2.getByRole('button', { name: 'Reserve', exact: true }).first();
    await expect(stay2Reserve).toBeEnabled({ timeout: 20_000 });
    await stay2Reserve.click();
    await expect(stay2.getByRole('button', { name: 'Continue with Google' }).first()).toBeVisible({ timeout: 20_000 });
    await expect(stay2.getByRole('button', { name: 'Confirm Reservation' })).toHaveCount(0);
    const stay2Draft = await page.evaluate(() => window.sessionStorage.getItem('bos_stay_checkout_v1'));
    expect(stay2Draft).toBeTruthy();
    expect(stay2Draft).toContain(STAY.listingId);
    expect(stay2Draft).toContain(checkIn);
    expect(stay2Draft).toContain(checkOut);
  } finally {
    await context.close().catch(() => undefined);
  }

  const stay1 = await openApp(browser, '', { width: 1280, height: 800 });
  try {
    await stay1.page.goto(`${harness.uiUrl}/#stays/old`, { waitUntil: 'domcontentloaded' });
    await expect(stay1.page.locator('body')).toContainText(STAY.title, { timeout: 30_000 });
    await stay1.page.getByText(STAY.title, { exact: false }).first().click();
    const dialog = stay1.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const dates = dialog.locator('input[type="date"]');
    await dates.nth(0).fill(checkIn);
    await dates.nth(1).fill(checkOut);
    await expect(dialog.getByRole('button', { name: 'Continue with Google' }).first()).toBeVisible({ timeout: 20_000 });
    const stay1Draft = await stay1.page.evaluate(() => window.sessionStorage.getItem('bos_stay_checkout_v1'));
    expect(stay1Draft).toBeTruthy();
    expect(stay1Draft).toContain(STAY.listingId);
    expect(stay1Draft).toContain(checkIn);
    expect(stay1Draft).toContain(checkOut);
  } finally {
    await stay1.context.close().catch(() => undefined);
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
    await dialog.getByLabel('Guest name').fill('Test Guest');
    await dialog.getByLabel('Guest phone').fill('9876543210');
    const payAfterService = dialog.getByRole('button', { name: /^Pay at (Hotel|property)/i }).first();
    await payAfterService.click();
    await expect(payAfterService).toHaveAttribute('aria-pressed', 'true');
    const reserve = dialog.getByRole('button', { name: /^(Confirm Reservation|Reserve with pay after service|Reserve — Pay at Hotel)/i }).first();
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
  expect(
    [a.status, b.status].sort(),
    JSON.stringify({
      first: { status: a.status, error: a.data.error },
      second: { status: b.status, error: b.data.error },
    }),
  ).toEqual([201, 409]);

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
      guestName: 'Test Guest',
      guestPhone: '9876543210',
      idempotencyKey: randomUUID(),
    }),
  });
  expect([503, 502, 409]).toContain(checkout.status);
  await api(`/api/stays/holds/${holdToken}/release`, tokens.customerA, { method: 'POST', body: '{}' });
});

test('API — signed-in Google email, guest name and mobile are required and validated server-side', async () => {
  const base = {
    listingId: STAY.listingId,
    roomTypeId: harness.deluxeRoomTypeId,
    checkIn: isoPlus(80),
    checkOut: isoPlus(82),
    units: 1,
    paymentMode: 'pay_after_service',
  };
  const missing = await api('/api/stays/checkout', tokens.customerA, {
    method: 'POST', body: JSON.stringify({ ...base, idempotencyKey: randomUUID() }),
  });
  expect(missing.status).toBe(400);
  expect(missing.data.error).toBe('INVALID_GUEST_DETAILS');

  const emailMismatch = await api('/api/stays/checkout', tokens.customerA, {
    method: 'POST',
    body: JSON.stringify({ ...base, guestName: 'Test Guest', guestEmail: 'someone-else@example.test', guestPhone: '9876543210', idempotencyKey: randomUUID() }),
  });
  expect(emailMismatch.status).toBe(403);
  expect(emailMismatch.data.error).toBe('GUEST_EMAIL_MISMATCH');

  const badMobile = await api('/api/stays/checkout', tokens.customerA, {
    method: 'POST',
    body: JSON.stringify({ ...base, guestName: 'Test Guest', guestPhone: '12345', idempotencyKey: randomUUID() }),
  });
  expect(badMobile.status).toBe(400);
  expect(badMobile.data.error).toBe('INVALID_GUEST_DETAILS');

  const unauthenticated = await api('/api/stays/checkout', '', {
    method: 'POST',
    body: JSON.stringify({ ...base, guestName: 'Test Guest', guestPhone: '9876543210', idempotencyKey: randomUUID() }),
  });
  expect(unauthenticated.status).toBe(401);
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
