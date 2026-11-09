import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Home & Local Services browser journey (customer → provider → admin).
 *
 * Drives the real React app against the real Express server and a disposable
 * PostgreSQL database created by supabase/tests/run_services_ui_e2e.sh. The
 * harness seeds three real bookings through the server API, one of them with a
 * provider-verified UPI settlement, then this spec drives the browser:
 *
 *   customer cancels a booking in "My service bookings" →
 *   provider accepts/starts/completes another in "My service jobs" →
 *   admin refunds the verified payment in "Service oversight" →
 *   server restart → every state is still there.
 *
 * Sessions are locally signed test sessions injected into the storage the Google
 * flow uses; every request is still authorised by the server (HMAC session + DB
 * role + RLS). No Google OAuth session and no live payment provider is used.
 */

const sessions = JSON.parse(process.env.E2E_SERVICE_SESSIONS || '{}');
const listingTitle = process.env.E2E_SERVICE_LISTING_TITLE || 'E2E AC Repair';
const jobDate = String(process.env.E2E_SERVICE_JOB_DATE || '');
const cancelDate = String(process.env.E2E_SERVICE_CANCEL_DATE || '');
const refundRef = String(process.env.E2E_SERVICE_REFUND_REF || '').trim();
const phaseTwo = process.env.E2E_PHASE_TWO === '1';

type Person = { token: string; user: Record<string, unknown> };

async function pageFor(browser: Browser, key: 'customer' | 'provider' | 'admin') {
  const person = sessions[key] as Person | undefined;
  if (!person?.token) throw new Error(`missing ${key} session in E2E_SERVICE_SESSIONS`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(
    ([token, user]) => {
      try {
        window.localStorage.setItem('bos_session_token_v1', String(token));
        window.localStorage.setItem('bos_google_auth_user_v1', String(user));
        window.localStorage.setItem('bos_entry_choice_v1', 'signed-in');
        window.localStorage.setItem(
          'bos_privacy_consent_v1',
          JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' }),
        );
        // Select the classic services experience (the curated hub is display-only).
        window.localStorage.setItem(
          'bos_section_styles_v2',
          JSON.stringify({ pg: 'style2', stay: 'airbnb', services: 'old' }),
        );
      } catch {
        /* storage unavailable */
      }
    },
    [person.token, JSON.stringify(person.user)],
  );
  const page = await context.newPage();
  return { context, page };
}

async function openServices(page: Page) {
  // The section has two experiences. The curated "triangle" hub is display-only,
  // so the bookable/operations surfaces live in the classic experience selected
  // by bos_section_styles_v2 (seeded before React boots, in pageFor).
  await page.goto('/#services', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#root > *', { timeout: 30_000 });
  await page.waitForFunction(() => document.body.innerText.trim().length > 200, { timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'services section' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /professional for the job at hand/i })).toBeVisible();
  if (!(await page.getByRole('button', { name: 'My service bookings' }).isVisible().catch(() => false))) {
    const allServices = page.getByRole('button', { name: /^All Services$/i }).first();
    if (await allServices.isVisible().catch(() => false)) await allServices.click();
    await page.waitForTimeout(1_000);
  }
}

function bookingCard(page: Page, marker: string) {
  return page.locator('article', { hasText: marker }).first();
}

// NOTE: do not configure serial mode at file level. The harness filters the
// restart assertion with --grep, and a file-level serial group makes Playwright
// skip the remaining test when an earlier one is filtered out — which silently
// turned the persistence phase into "1 skipped".
test.setTimeout(180_000);

test('customer cancels, provider completes and admin refunds a verified payment', async ({ browser }) => {
  // The harness seeds these booking fixtures before the first browser phase;
  // execute the lifecycle journey before restart, then verify persistence in phase two.
  const hasSeededFixtures = Boolean(jobDate && cancelDate && refundRef);
  test.skip(!hasSeededFixtures, 'the lifecycle journey requires seeded booking fixtures');
  expect(jobDate, 'harness must pass the completed booking date').not.toBe('');
  expect(cancelDate, 'harness must pass the cancellable booking date').not.toBe('');
  expect(refundRef, 'harness must seed a verified-payment booking').not.toBe('');

  // ---- customer: cancel one booking from My service bookings ----
  const customer = await pageFor(browser, 'customer');
  const customerPageEvents: string[] = [];
  customer.page.on('framenavigated', (frame) => {
    if (frame === customer.page.mainFrame()) customerPageEvents.push(`navigation:${frame.url()}`);
  });
  customer.page.on('pageerror', (error) => customerPageEvents.push(`pageerror:${error.message}`));
  await customer.page.evaluate(() => {
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') sessionStorage.setItem('bos-e2e-escape-seen', 'true');
    }, true);
  });
  await openServices(customer.page);
  await customer.page.getByRole('button', { name: 'My service bookings' }).click();
  const customerBookingsDialog = customer.page.getByRole('dialog', { name: 'My service bookings' });
  await expect(customerBookingsDialog).toBeVisible();
  await expect(customerBookingsDialog.getByRole('heading', { name: 'My service bookings' })).toBeVisible();

  const cancellable = bookingCard(customer.page, cancelDate);
  await expect(cancellable).toBeVisible({ timeout: 25_000 });
  await cancellable.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(customer.page.getByRole('status').filter({ hasText: 'cancelled' })).toBeVisible({ timeout: 25_000 });
  await expect(bookingCard(customer.page, cancelDate).getByText('cancelled', { exact: true }))
    .toBeVisible({ timeout: 20_000 });

  // ---- provider: accept → start → complete the other booking ----
  const provider = await pageFor(browser, 'provider');
  await openServices(provider.page);
  await provider.page.getByRole('button', { name: 'My service jobs' }).click();
  await expect(provider.page.getByRole('heading', { name: 'Provider Service Jobs' })).toBeVisible();

  const job = bookingCard(provider.page, jobDate);
  await expect(job).toBeVisible({ timeout: 25_000 });
  await job.getByRole('button', { name: 'Accept job' }).click();
  await expect(job.getByText('accepted', { exact: true })).toBeVisible({ timeout: 20_000 });
  await job.getByRole('button', { name: 'Start service' }).click();
  await expect(job.getByText('in progress', { exact: true })).toBeVisible({ timeout: 20_000 });
  await job.getByRole('button', { name: 'Mark completed' }).click();
  await expect(job.getByText('completed', { exact: true })).toBeVisible({ timeout: 20_000 });
  await provider.context.close();

  // ---- customer: the completed job is visible, the cancelled one stayed cancelled ----
  const escapeSeen = await customer.page.evaluate(() => sessionStorage.getItem('bos-e2e-escape-seen') || 'false');
  // The disposable Vite harness may full-reload existing tabs while it warms a
  // newly opened module. Reopen the transient overlay if that happened; the
  // persisted booking state remains the subject of this assertion.
  if (!(await customerBookingsDialog.isVisible().catch(() => false))) {
    const reopenBookings = customer.page.getByRole('button', { name: 'My service bookings' });
    await expect(reopenBookings, `customer page lost both the bookings dialog and its reopen action; escape=${escapeSeen}; url=${customer.page.url()} events=${customerPageEvents.join('|')}`)
      .toBeVisible({ timeout: 10_000 });
    await reopenBookings.click();
    await expect(customerBookingsDialog).toBeVisible({ timeout: 10_000 });
  }
  await expect(customerBookingsDialog, `customer bookings dialog closed unexpectedly; escape=${escapeSeen}; url=${customer.page.url()} events=${customerPageEvents.join('|')}`)
    .toBeVisible({ timeout: 5_000 });
  await customerBookingsDialog.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(bookingCard(customer.page, jobDate).getByText('completed', { exact: true }))
    .toBeVisible({ timeout: 25_000 });
  await expect(bookingCard(customer.page, cancelDate).getByText('cancelled', { exact: true }))
    .toBeVisible();
  await customer.context.close();

  // ---- admin: refund the provider-verified payment from Service oversight ----
  const admin = await pageFor(browser, 'admin');
  await openServices(admin.page);
  // A second copy can be rendered in the responsive Admin region. The first
  // is the primary entry point; assert the destination heading below.
  await admin.page.getByRole('button', { name: 'Service oversight' }).first().click();
  await expect(admin.page.getByRole('heading', { name: 'Services Admin Oversight' })).toBeVisible();

  const refundable = bookingCard(admin.page, refundRef);
  await expect(refundable).toBeVisible({ timeout: 25_000 });
  await refundable.getByRole('button', { name: 'Refund verified payment' }).click();
  await expect(admin.page.getByRole('status').filter({ hasText: 'Refund recorded' })).toBeVisible({ timeout: 25_000 });
  await expect(bookingCard(admin.page, refundRef).getByText('refunded', { exact: true }))
    .toBeVisible({ timeout: 20_000 });
  await admin.context.close();
});

test.describe('after the server restart', () => {
  test.skip(!phaseTwo, 'phase two runs only after the harness restarts the server');

  test('persists completed, cancelled and refunded service bookings', async ({ browser }) => {
    const customer = await pageFor(browser, 'customer');
    await openServices(customer.page);
    await customer.page.getByRole('button', { name: 'My service bookings' }).click();
    await expect(customer.page.getByRole('heading', { name: 'My service bookings' })).toBeVisible();

    const completed = bookingCard(customer.page, jobDate);
    await expect(completed).toBeVisible({ timeout: 25_000 });
    await expect(completed.getByText('completed', { exact: true })).toBeVisible();

    const cancelled = bookingCard(customer.page, cancelDate);
    await expect(cancelled).toBeVisible();
    await expect(cancelled.getByText('cancelled', { exact: true })).toBeVisible();
    await customer.context.close();

    const admin = await pageFor(browser, 'admin');
    await openServices(admin.page);
    await admin.page.getByRole('button', { name: 'Service oversight' }).first().click();
    const refunded = bookingCard(admin.page, refundRef);
    await expect(refunded).toBeVisible({ timeout: 25_000 });
    await expect(refunded.getByText('refunded', { exact: true })).toBeVisible();
    await admin.context.close();
  });
});
