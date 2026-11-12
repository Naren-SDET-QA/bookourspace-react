import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';

/**
 * Function Halls & Venues browser journey against the real React app, the
 * real Express server and a disposable PostgreSQL database.
 *
 * Authentication is a locally minted, HMAC-signed test identity injected into
 * the same storage keys as the Google flow. It is NOT Google OAuth and it is
 * NOT a hosted Supabase session. Every request the UI makes is still verified
 * by the server (HMAC session, PostgreSQL profile role, RLS); no venue booking
 * API is mocked.
 *
 * The online-payment path is a test-only server fixture: the browser can create
 * a Razorpay/UPI intent, but only an HMAC-signed webhook sent by this test can
 * settle it. There is no live PSP call, no client-side payment confirmation and
 * no card/UPI credential collection.
 */

const SESSIONS = JSON.parse(process.env.E2E_VENUE_SESSIONS || '{}');
if (!process.env.E2E_VENUE_SESSIONS) {
  test.skip(true, 'E2E_VENUE_SESSIONS is not configured for this run.');
}
const VENUE_TITLE = process.env.E2E_VENUE_TITLE || 'E2E Owner-Created Function Hall';
const PHASE_TWO = process.env.E2E_PHASE_TWO === '1';
const SANDBOX_SECRET = process.env.E2E_VENUE_SANDBOX_SECRET || '';
const RESTART_REF = process.env.E2E_RESTART_BOOKING_REF || '';
const DISPUTE_RESOLUTION = 'E2E admin resolved the cancellation dispute after reviewing the audit trail.';

type SessionRole = 'provider' | 'admin' | 'customer' | 'customerB';

test.setTimeout(240_000);

let listingId = process.env.E2E_VENUE_LISTING_ID || '';
let bookingId = process.env.E2E_BOOKING_ID || '';
let bookingRef = process.env.E2E_BOOKING_REF || '';
let bookingDate = process.env.E2E_BOOKING_DATE || '';
let blockDate = '';
let rescheduledDate = '';
let paidBookingId = '';
let paidBookingRef = '';
let paidIntentId = '';
let paidRefundPaise = 0;

function futureDate(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function isoAt(date: string, time = '00:00') {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

async function signIn(page: Page, role: SessionRole) {
  const session = SESSIONS[role];
  if (!session?.token || !session?.user) throw new Error(`missing venue E2E session: ${role}`);
  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem('bos_session_token_v1', token);
      window.localStorage.setItem('bos_google_auth_user_v1', user);
    },
    { token: session.token, user: JSON.stringify(session.user) },
  );
}

/** Retry the first Vite dev-middleware paint; a real mount error is surfaced. */
async function boot(page: Page) {
  const diagnostics: string[] = [];
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console: ${message.text()}`);
  });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('#root > *', { state: 'attached', timeout: 20_000 });
      await expect
        .poll(async () => (await page.locator('body').innerText()).trim().length, { timeout: 20_000 })
        .toBeGreaterThan(200);
      return;
    } catch (error) {
      if (attempt === 3) {
        throw new Error(
          `app shell did not mount after 3 attempts. ${diagnostics.join(' | ') || 'no browser errors captured'}`,
        );
      }
      await page.waitForTimeout(1_500);
    }
  }
}

async function openVenueAdminWorkspace(page: Page) {
  const disclosure = page
    .locator('details')
    .filter({ hasText: 'Venue booking oversight & workspace' })
    .first();
  await expect(disclosure).toBeVisible();
  const isOpen = await disclosure.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) await disclosure.locator(':scope > summary').click();
  await expect(disclosure.getByRole('heading', { name: 'Venue booking oversight' })).toBeVisible({ timeout: 45_000 });
}

async function openVenue(page: Page) {
  if ((await page.getByRole('dialog').count()) > 0) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await page.goto('/#venues', { waitUntil: 'domcontentloaded' });
  const venueHeading = page.getByRole('heading', { name: /^All Venues & Halls/ });
  const venueSection = page.locator('section').filter({ has: venueHeading }).last();
  const venueCard = venueSection.locator('article').filter({ hasText: VENUE_TITLE }).last();
  const view = venueCard.getByRole('button', { name: `View and book ${VENUE_TITLE}` });
  await expect(view).toBeVisible({ timeout: 45_000 });
  await view.click();
  await expect(page.getByRole('dialog', { name: VENUE_TITLE }).last()).toBeVisible({ timeout: 20_000 });
}

async function openBooking(page: Page) {
  await openVenue(page);
  const detail = page.getByRole('dialog', { name: VENUE_TITLE }).last();
  await detail.getByRole('button', { name: 'Book Hall', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: VENUE_TITLE }).last();
  await expect(dialog.getByRole('heading', { name: 'Choose date and time' })).toBeVisible({ timeout: 20_000 });
  return dialog;
}

async function fillSlot(page: Page, dialog: ReturnType<Page['getByRole']>, date: string, start = '10:00', end = '12:00') {
  await dialog.getByLabel('Event date').fill(date);
  await dialog.getByLabel('End date').fill(date);
  await dialog.getByLabel('Start time').fill(start);
  await dialog.getByLabel('End time').fill(end);
  await dialog.getByLabel(/Expected guests/).fill('120');
  await dialog.getByRole('button', { name: 'Check price' }).click();
  await expect(page.getByRole('heading', { name: 'Server price breakdown' })).toBeVisible({ timeout: 20_000 });
}

async function myBookings(page: Page): Promise<any[]> {
  return page.evaluate(async () => {
    const token = window.localStorage.getItem('bos_session_token_v1') || '';
    const response = await fetch('/api/venue-bookings?scope=mine', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
    return data.bookings || [];
  });
}

async function providerListings(page: Page): Promise<any[]> {
  return page.evaluate(async () => {
    const token = window.localStorage.getItem('bos_session_token_v1') || '';
    const response = await fetch('/api/provider/listings', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
    return data.listings || [];
  });
}

function bearer(role: SessionRole) {
  return { Authorization: `Bearer ${SESSIONS[role].token}`, 'content-type': 'application/json' };
}

async function sandboxWebhook(
  request: APIRequestContext,
  event: {
    eventId: string;
    intentId: string;
    bookingId: string;
    eventType: 'payment.captured' | 'payment.failed' | 'refund.processed';
    providerReference: string;
    amountPaise: number;
  },
) {
  const raw = JSON.stringify(event);
  const signature = createHmac('sha256', SANDBOX_SECRET).update(raw).digest('hex');
  return request.post('/api/venue-payments/sandbox/webhook', {
    headers: { 'content-type': 'application/json', 'x-bos-sandbox-signature': signature },
    data: raw,
  });
}

async function calendarDay(owner: Page, date: string, state: 'available' | 'blocked' | 'reserved') {
  for (let step = 0; step < 3; step += 1) {
    const day = owner.getByRole('button', { name: new RegExp(`^${date} ${state}$`) });
    if ((await day.count()) > 0) {
      await expect(day.first()).toBeVisible();
      return;
    }
    await owner.getByRole('button', { name: 'Next month' }).click();
  }
  await expect(owner.getByRole('button', { name: new RegExp(`^${date} ${state}$`) })).toBeVisible();
}

test.describe.serial('Function Halls authenticated browser journey', () => {
  test.skip(PHASE_TWO, 'the full journey runs once; phase two verifies restart persistence only');

  test('owner creates a venue listing through the provider wizard and it stays pending', async ({ page, browser }) => {
    await signIn(page, 'provider');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    await page.goto('/#provider', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Provider & Seller Hub' })).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: /Register as Provider & Submit Listing Request/i }).click();
    await expect(page.getByText('1. Select Application Section')).toBeVisible({ timeout: 20_000 });

    const sectionPicker = page.getByText('1. Select Application Section').locator('xpath=following-sibling::div[1]');
    await sectionPicker.getByRole('button', { name: /Function Hall/ }).click();
    const categoryPicker = page
      .getByText(/2\. Choose Provider Category/)
      .locator('xpath=following-sibling::div[1]');
    await categoryPicker.getByRole('button', { name: /Function Halls/ }).click();

    await page.getByRole('button', { name: 'Continue to Step 2' }).click();
    await page.getByText(/Listing Title \*/).locator('..').locator('input').fill(VENUE_TITLE);
    await page
      .getByText(/Description & Scope \*/)
      .locator('..')
      .locator('textarea')
      .fill('Owner-created function hall used by the authenticated browser journey.');
    await page.getByText(/Price \(₹\) \*/).locator('..').locator('input').fill('5000');
    await page.getByRole('button', { name: 'Continue to Step 3' }).click();
    await page.getByText('City *', { exact: true }).locator('..').locator('input').fill('Hyderabad');
    await page.getByText('Area / Locality *', { exact: true }).locator('..').locator('input').fill('E2E Test District');
    await page.getByText('Pincode', { exact: true }).locator('..').locator('input').fill('500081');
    await page.getByRole('button', { name: 'Continue to Step 4' }).click();
    await page.getByRole('button', { name: 'Submit for Admin review' }).click();

    await expect(page.getByText('Status: Pending Admin Approval')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Provider Registration & Request Form Sent to Admin/i)).toBeVisible();

    const listings = await providerListings(page);
    const created = listings.find((item) => item.title === VENUE_TITLE);
    expect(created, 'the provider listing endpoint must expose the pending PostgreSQL row').toBeTruthy();
    expect(created.status).toBe('pending_approval');
    expect(created.entityType).toBe('venue');
    listingId = created.id;

    const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const customerPage = await customerContext.newPage();
    await signIn(customerPage, 'customer');
    await customerPage.goto('/#venues', { waitUntil: 'domcontentloaded' });
    await expect(customerPage.getByRole('button', { name: 'View and book E2E Function Hall' }).last()).toBeVisible({
      timeout: 45_000,
    });
    await expect(customerPage.getByRole('button', { name: `View and book ${VENUE_TITLE}` })).toHaveCount(0);
    await customerContext.close();
  });

  test('admin approves the pending venue and keeps category auditing', async ({ page }) => {
    await signIn(page, 'admin');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    await page.goto('/#admin', { waitUntil: 'domcontentloaded' });
    // Target the primary Admin Console heading; the detailed dashboard label
    // is rendered as a separate non-heading status label below it.
    await expect(page.getByRole('heading', { name: 'BookOurSpace Admin Console' }).first()).toBeVisible({
      timeout: 45_000,
    });

    // Scope to the Admin sidebar: other page content can contain the same
    // wording, and clicking a shortcut with that label does not select the
    // Moderation section.
    const adminNavigation = page.getByRole('complementary').getByRole('navigation');
    await adminNavigation.getByRole('button', { name: /Listings & Venues/ }).click();
    const listingSearch = page.getByLabel('Search listings');
    await expect(listingSearch).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Marketplace listings' })).toBeVisible({ timeout: 30_000 });
    await listingSearch.fill(VENUE_TITLE);
    const row = page.locator('article').filter({ hasText: VENUE_TITLE }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText('pending_approval');
    await row.getByRole('button', { name: 'Approve listing' }).click();
    await expect(page.getByText('Admin review saved as active.')).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText('active');

    // This workspace is intentionally collapsed by default to keep the Admin
    // Console compact; open it through the real disclosure control.
    await openVenueAdminWorkspace(page);
    await page.getByText(/Admin-managed venue categories/).click();
    const categoryId = `venue-browser-${Date.now().toString(36)}`;
    await page.getByLabel('Category ID').fill(categoryId);
    await page.getByLabel('Label').fill('Browser Test Hall');
    await page.getByLabel('Subcategories, one per line').fill('Browser function hall');
    await page.getByRole('button', { name: 'Save category' }).click();
    await expect(page.getByText('Venue category saved and audit recorded.')).toBeVisible({ timeout: 20_000 });
  });

  test('owner configures server-authoritative rates, buffers and approval', async ({ page }) => {
    await signIn(page, 'provider');
    await page.setViewportSize({ width: 834, height: 1112 });
    await boot(page);
    await page.goto('/#provider', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Function hall bookings' })).toBeVisible({ timeout: 45_000 });

    const owner = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Function hall bookings' }) }).first();
    const venueSelect = owner.locator('select').first();
    await expect(venueSelect.locator('option').filter({ hasText: VENUE_TITLE })).toHaveCount(1, { timeout: 20_000 });
    await venueSelect.selectOption({ label: VENUE_TITLE });

    await owner.getByLabel('Capacity', { exact: true }).fill('300');
    await owner.getByLabel('Hourly ₹', { exact: true }).fill('5000');
    await owner.getByLabel('Half-day ₹', { exact: true }).fill('15000');
    await owner.getByLabel('Full-day ₹', { exact: true }).fill('24000');
    await owner.getByLabel('Deposit ₹', { exact: true }).fill('500');
    await owner.getByLabel('Tax %', { exact: true }).fill('5');
    await owner.getByLabel('Setup buffer min', { exact: true }).fill('30');
    await owner.getByLabel('Cleanup buffer min', { exact: true }).fill('45');
    await owner.getByRole('button', { name: 'Save booking settings' }).click();
    await expect(owner.getByText('Saved to PostgreSQL.')).toBeVisible({ timeout: 20_000 });
    await expect(owner.getByLabel('Setup buffer min', { exact: true })).toHaveValue('30');
    await expect(owner.getByLabel('Cleanup buffer min', { exact: true })).toHaveValue('45');
  });

  test('customer searches, gets a server quote, books and opens My Bookings', async ({ page }) => {
    await signIn(page, 'customer');
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    const dialog = await openBooking(page);
    bookingDate = futureDate(10);
    await fillSlot(page, dialog, bookingDate);
    await dialog.getByRole('button', { name: 'Request booking' }).click();
    await expect(dialog.getByText('Reservation recorded')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/due at the venue and is not marked paid/i)).toBeVisible();

    const confirmation = await dialog.getByText(/Reference BOS-V-/).innerText();
    bookingRef = confirmation.match(/BOS-V-[A-Z0-9]+/)?.[0] || '';
    expect(bookingRef).toBeTruthy();

    const mineResponse = page.waitForResponse((response) => response.url().includes('/api/venue-bookings?scope=mine'));
    await dialog.getByRole('button', { name: 'My Bookings', exact: true }).click();
    await mineResponse;
    await expect(page.getByRole('heading', { name: 'My Bookings' })).toBeVisible();
    const article = page.locator('article').filter({ hasText: bookingRef });
    await expect(article).toBeVisible();
    await expect(article).toContainText('pending owner');
    await expect(article.getByRole('button', { name: 'Cancel reservation' })).toBeVisible();

    const mine = await myBookings(page);
    const created = mine.find((item) => item.bookingRef === bookingRef);
    expect(created).toBeTruthy();
    expect(created.paymentStatus).toBe('obligation_recorded');
    expect(created.totalPaise).toBeGreaterThan(500000);
    bookingId = created.id;
  });

  test('owner sees the reservation, blocks calendar dates and reschedules through the UI', async ({ page }) => {
    await signIn(page, 'provider');
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    const initialCalendarLoad = page.waitForResponse((response) =>
      response.url().includes('/calendar?') && response.ok(),
    );
    await page.goto('/#provider', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Function hall bookings' })).toBeVisible({ timeout: 45_000 });
    const owner = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Function hall bookings' }) }).first();
    await owner.locator('select').first().selectOption({ label: VENUE_TITLE });
    await initialCalendarLoad;

    const card = owner.locator('article').filter({ hasText: bookingRef }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('pending owner');
    await calendarDay(page, bookingDate, 'reserved');

    blockDate = futureDate(3);
    const blockPanel = owner.getByRole('heading', { name: /Block calendar time/ }).locator('..');
    await blockPanel.getByLabel('From', { exact: true }).fill(`${blockDate}T09:00`);
    await blockPanel.getByLabel('To', { exact: true }).fill(`${blockDate}T13:00`);
    await blockPanel.getByLabel('Reason', { exact: true }).fill('Browser maintenance block');
    await blockPanel.getByRole('button', { name: 'Add block' }).click();
    await expect(owner.getByText('Saved to PostgreSQL.')).toBeVisible({ timeout: 20_000 });
    await expect(owner.getByText(/Browser maintenance block/)).toBeVisible();
    const blockCalendarLoad = page.waitForResponse((response) =>
      response.url().includes('/calendar?') && response.ok(),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Function hall bookings' })).toBeVisible({ timeout: 45_000 });
    const blockOwner = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Function hall bookings' }) }).first();
    await blockOwner.locator('select').first().selectOption({ label: VENUE_TITLE });
    await blockCalendarLoad;
    await calendarDay(page, blockDate, 'blocked');

    rescheduledDate = futureDate(12);
    const [newStart, newEnd] = await card.locator('input[type="datetime-local"]').all();
    await newStart.fill(`${rescheduledDate}T10:00`);
    await newEnd.fill(`${rescheduledDate}T12:00`);
    await card.getByRole('button', { name: 'Reschedule' }).click();
    await expect(owner.getByText('Saved to PostgreSQL.')).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText(dateLabel(rescheduledDate));
    const refreshedCalendarLoad = page.waitForResponse((response) =>
      response.url().includes('/calendar?') && response.ok(),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Function hall bookings' })).toBeVisible({ timeout: 45_000 });
    const refreshedOwner = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Function hall bookings' }) }).first();
    await refreshedOwner.locator('select').first().selectOption({ label: VENUE_TITLE });
    await refreshedCalendarLoad;
    await calendarDay(page, rescheduledDate, 'reserved');
  });

  test('customer cancels the rescheduled booking and opens a dispute through My Bookings', async ({ page }) => {
    await signIn(page, 'customer');
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    const dialog = await openBooking(page);
    await dialog.getByRole('button', { name: 'My Bookings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'My Bookings' })).toBeVisible();
    const article = page.locator('article').filter({ hasText: bookingRef });
    await expect(article).toBeVisible({ timeout: 20_000 });
    await article.getByRole('button', { name: 'Cancel reservation' }).click();
    await expect(article).toContainText('cancelled', { timeout: 20_000 });

    await article.getByLabel(`Dispute reason for ${bookingRef}`).fill('The cancellation refund has not appeared in my account.');
    await article.getByRole('button', { name: 'Open dispute' }).click();
    await expect(article.getByText('open', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(article).toContainText('The cancellation refund has not appeared');

    const mine = await myBookings(page);
    const cancelled = mine.find((item) => item.id === bookingId);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.disputes.some((dispute: any) => dispute.status === 'open')).toBe(true);
  });

  test('admin resolves the customer dispute with an audited resolution', async ({ page }) => {
    await signIn(page, 'admin');
    await page.setViewportSize({ width: 1280, height: 900 });
    await boot(page);
    await page.goto('/#admin', { waitUntil: 'domcontentloaded' });
    await openVenueAdminWorkspace(page);
    const resolutionInput = page.getByLabel(`Resolution for ${bookingRef}`);
    await expect(resolutionInput).toBeVisible({ timeout: 20_000 });
    await resolutionInput.fill(DISPUTE_RESOLUTION);
    await page.getByRole('button', { name: 'Resolve dispute' }).click();
    await expect(page.getByText('Dispute resolved and appended to the booking audit history.')).toBeVisible({
      timeout: 20_000,
    });
    const adminBooking = page.locator('article').filter({ hasText: bookingRef }).filter({ hasText: 'cancelled' }).first();
    await expect(adminBooking).toBeVisible({ timeout: 20_000 });
    await adminBooking.getByText('Audit history').click();
    await expect(adminBooking.getByText(/dispute_resolved/)).toBeVisible({ timeout: 20_000 });
    await expect(adminBooking.getByText(DISPUTE_RESOLUTION)).toBeVisible();
  });

  test('Razorpay and UPI sandbox settlements require signed webhooks and support refund retry', async ({ page, request }) => {
    expect(SANDBOX_SECRET.length).toBeGreaterThanOrEqual(16);
    await signIn(page, 'customer');
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);

    const razorpayDate = futureDate(45);
    let dialog = await openBooking(page);
    await fillSlot(page, dialog, razorpayDate, '14:00', '16:00');
    await dialog.getByRole('radio', { name: /Razorpay sandbox/ }).check();
    await dialog.getByRole('button', { name: 'Request booking' }).click();
    await expect(dialog.getByText(/Sandbox intent /)).toBeVisible({ timeout: 20_000 });
    const intentText = await dialog.getByText(/Sandbox intent /).innerText();
    paidIntentId = intentText.match(/Sandbox intent\s+([0-9a-f-]{36})/)?.[1] || '';
    expect(paidIntentId).toBeTruthy();
    paidBookingRef = (await dialog.getByText(/Reference BOS-V-/).innerText()).match(/BOS-V-[A-Z0-9]+/)?.[0] || '';
    expect(paidBookingRef).toBeTruthy();

    const mine = await myBookings(page);
    const paid = mine.find((item) => item.bookingRef === paidBookingRef);
    expect(paid).toBeTruthy();
    paidBookingId = paid.id;
    expect(paid.paymentStatus).toBe('awaiting_verification');
    expect(paid.status).toBe('pending_payment');

    const mismatch = await request.post(`/api/venue-bookings/${paidBookingId}/payment-intent`, {
      headers: bearer('customer'),
      data: { provider: 'upi_webhook' },
    });
    expect(mismatch.status()).toBe(409);

    const captureEvent = {
      eventId: `sandbox-pay-${randomUUID()}`,
      intentId: paidIntentId,
      bookingId: paidBookingId,
      eventType: 'payment.captured' as const,
      providerReference: `sandbox-payment-${randomUUID()}`,
      amountPaise: paid.totalPaise,
    };
    const capture = await sandboxWebhook(request, captureEvent);
    expect(capture.status()).toBe(200);
    expect((await capture.json()).eventType).toBe('payment.captured');
    const retry = await sandboxWebhook(request, captureEvent);
    expect(retry.status(), 'a duplicate signed provider event is idempotent').toBe(200);

    await dialog.getByRole('button', { name: 'Refresh status' }).click();
    await expect(dialog.getByText('Payment verified by server')).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: 'My Bookings', exact: true }).click();
    const paidArticle = page.locator('article').filter({ hasText: paidBookingRef });
    await expect(paidArticle).toContainText('verified');
    await paidArticle.getByRole('button', { name: 'Cancel reservation' }).click();
    await expect(paidArticle).toContainText('refund pending', { timeout: 20_000 });

    const cancelled = (await myBookings(page)).find((item) => item.id === paidBookingId);
    expect(cancelled.paymentStatus).toBe('refund_pending');
    paidRefundPaise = Number(cancelled.refundPaise);
    expect(paidRefundPaise).toBeGreaterThan(0);
    const refundEvent = {
      eventId: `sandbox-refund-${randomUUID()}`,
      intentId: paidIntentId,
      bookingId: paidBookingId,
      eventType: 'refund.processed' as const,
      providerReference: `sandbox-refund-${randomUUID()}`,
      amountPaise: paidRefundPaise,
    };
    const refund = await sandboxWebhook(request, refundEvent);
    expect(refund.status()).toBe(200);
    const refundRetry = await sandboxWebhook(request, refundEvent);
    expect(refundRetry.status(), 'the signed refund callback is retry-safe').toBe(200);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(paidArticle).toContainText('refunded', { timeout: 20_000 });

    // UPI is a separate channel. Its intent is bound to the booking too.
    const upiDate = futureDate(50);
    // Give the second channel a fresh browser page so prior My Bookings and
    // cancellation overlays cannot leave stale modal state between flows.
    const upiPage = await page.context().newPage();
    await signIn(upiPage, 'customer');
    await upiPage.setViewportSize({ width: 390, height: 844 });
    await boot(upiPage);
    const upiDialog = await openBooking(upiPage);
    await fillSlot(upiPage, upiDialog, upiDate, '17:00', '19:00');
    await upiDialog.getByRole('radio', { name: /UPI sandbox/ }).check();
    await upiDialog.getByRole('button', { name: 'Request booking' }).click();
    await expect(upiDialog.getByText(/Sandbox intent /)).toBeVisible({ timeout: 20_000 });
    const upiIntentText = await upiDialog.getByText(/Sandbox intent /).innerText();
    const upiIntentId = upiIntentText.match(/Sandbox intent\s+([0-9a-f-]{36})/)?.[1] || '';
    const upiRef = (await upiDialog.getByText(/Reference BOS-V-/).innerText()).match(/BOS-V-[A-Z0-9]+/)?.[0] || '';
    expect(upiIntentId).toBeTruthy();
    expect(upiRef).toBeTruthy();
    const upiBooking = (await myBookings(page)).find((item) => item.bookingRef === upiRef);
    expect(upiBooking, 'the UPI booking must be readable from PostgreSQL').toBeTruthy();
    expect(upiBooking.paymentMode).toBe('upi');
    const wrongRazorpay = await request.post(`/api/venue-bookings/${upiBooking.id}/payment-intent`, {
      headers: bearer('customer'),
      data: { provider: 'razorpay' },
    });
    expect(wrongRazorpay.status()).toBe(409);
    const upiCapture = await sandboxWebhook(request, {
      eventId: `sandbox-upi-${randomUUID()}`,
      intentId: upiIntentId,
      bookingId: upiBooking.id,
      eventType: 'payment.captured',
      providerReference: `sandbox-upi-${randomUUID()}`,
      amountPaise: upiBooking.totalPaise,
    });
    expect(upiCapture.status()).toBe(200);
    await upiDialog.getByRole('button', { name: 'Refresh status' }).click();
    await expect(upiDialog.getByText('Payment verified by server')).toBeVisible({ timeout: 20_000 });
    expect((await myBookings(page)).find((item) => item.id === upiBooking.id).paymentStatus).toBe('verified');
  });

  test('Chromium mobile/tablet surface keeps the booking UI usable', async ({ page }) => {
    await signIn(page, 'customer');
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    const dialog = await openBooking(page);
    await expect(dialog.getByLabel('Event date')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 834, height: 1112 });
    await expect(dialog.getByRole('heading', { name: 'Choose date and time' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test('persists venue, approval, cancellation, dispute and owner block after a server restart', async ({ page, browser }) => {
    test.skip(!PHASE_TWO, 'restart persistence runs after the harness restarts Express');
    expect(RESTART_REF).toBeTruthy();
    await signIn(page, 'customer');
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    const dialog = await openBooking(page);
    await dialog.getByRole('button', { name: 'My Bookings', exact: true }).click();
    const article = page.locator('article').filter({ hasText: RESTART_REF });
    await expect(article).toBeVisible({ timeout: 20_000 });
    await expect(article).toContainText('cancelled');
    await expect(article).toContainText('resolved');
    await expect(article).toContainText('E2E admin resolved the cancellation dispute');

    const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const owner = await ownerContext.newPage();
    await signIn(owner, 'provider');
    await boot(owner);
    await owner.goto('/#provider', { waitUntil: 'domcontentloaded' });
    await expect(owner.getByRole('heading', { name: 'Function hall bookings' })).toBeVisible({ timeout: 45_000 });
    const workspace = owner.locator('section').filter({ has: owner.getByRole('heading', { name: 'Function hall bookings' }) }).first();
    await workspace.locator('select').first().selectOption({ label: VENUE_TITLE });
    await expect(workspace.getByText(RESTART_REF).first()).toBeVisible({ timeout: 20_000 });
    await expect(owner.getByText(/Browser maintenance block/)).toBeVisible();
    await expect(owner.getByRole('button', { name: /^\d{4}-\d{2}-\d{2} blocked$/ }).first()).toBeVisible();
    await ownerContext.close();

    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const admin = await adminContext.newPage();
    await signIn(admin, 'admin');
    await boot(admin);
    await admin.goto('/#admin', { waitUntil: 'domcontentloaded' });
    await openVenueAdminWorkspace(admin);
    const adminBooking = admin.locator('article').filter({ hasText: RESTART_REF }).filter({ hasText: 'cancelled' }).first();
    await expect(adminBooking).toBeVisible({ timeout: 20_000 });
    await adminBooking.getByText('Audit history').click();
    await expect(adminBooking.getByText(DISPUTE_RESOLUTION)).toBeVisible({ timeout: 20_000 });
    await adminContext.close();
});
