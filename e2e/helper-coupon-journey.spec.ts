import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { signInWithLocalDevSession } from './session-cookie-harness';

/**
 * SEC-04 browser contract for the Human Help coupon journey.
 *
 * The point of this spec is what the browser does *not* send: the discount is
 * priced on the server, so the coupon requests must carry only the booking
 * inputs (`code`, `durationId`, `helpers`, `bookingId`) and no money. The
 * journey is presentation-only — no payment is collected and no booking row is
 * created — so this runs without enabling payments or inventing a workflow.
 *
 * A disposable customer is created per run, so a retry is never blocked by the
 * one-redemption-per-user rule from the previous attempt.
 */

const DATABASE_URL =
  process.env.BOS_TEST_DATABASE_URL
  || process.env.BOS_LISTINGS_DATABASE_URL
  || 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';

const userId = randomUUID();
const email = `e2e-coupon-${userId.slice(0, 8)}@example.test`;

let db: Client | undefined;
let setupError = '';

test.beforeAll(async () => {
  db = new Client({ connectionString: DATABASE_URL });
  try {
    await db.connect();
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [userId, email]);
    await db.query(
      `update public.profiles
          set full_name = 'E2E Coupon Customer', role = 'customer', account_status = 'active'
        where id = $1`,
      [userId],
    );
  } catch (error) {
    setupError = `local database is unavailable: ${(error as Error).message}`;
  }
});

test.beforeEach(async () => {
  // Keep retries independent: the coupon may be redeemed only once per user.
  await db?.query('delete from public.coupon_redemptions where user_id = $1', [userId]).catch(() => undefined);
});

test.afterAll(async () => {
  if (!db) return;
  await db.query('delete from public.coupon_redemptions where user_id = $1', [userId]).catch(() => undefined);
  await db.query('delete from auth.users where id = $1', [userId]).catch(() => undefined);
  await db.end();
});

test('the coupon journey sends booking inputs only and shows the server discount', async ({ page }) => {
  test.skip(Boolean(setupError), setupError);
  await signInWithLocalDevSession(page.context(), { role: 'customer', email });

  const validateBodies: Array<Record<string, unknown>> = [];
  const redeemBodies: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().includes('/api/coupons/')) return;
    let body: Record<string, unknown> = {};
    try {
      body = (request.postDataJSON() as Record<string, unknown>) ?? {};
    } catch {
      return;
    }
    if (request.url().endsWith('/api/coupons/validate')) validateBodies.push(body);
    if (request.url().endsWith('/api/coupons/redeem')) redeemBodies.push(body);
  });

  // The services section mounts the triangle home that owns the Human Help tile.
  await page.goto('/#services', { waitUntil: 'domcontentloaded' });
  const helperTile = page.getByRole('button', { name: /Human Help/ }).first();
  await expect(helperTile).toBeVisible({ timeout: 30_000 });
  await helperTile.click();

  // Step 1 — describe. The address is the only field that gates Continue.
  await page.getByPlaceholder('House / street / area').fill('12 E2E Street, Hyderabad');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2 — book (defaults: 2 hours, 1 helper → ₹239.00).
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3 — plan. No GPS or assigned helper is required to reach review.
  await page.getByRole('button', { name: /Continue to Review/ }).click();

  // Step 4 — review: the coupon is validated by the server.
  const couponInput = page.locator('#helper-coupon');
  await expect(couponInput).toBeVisible();
  await couponInput.fill('HELPER10');
  const validated = page.waitForResponse((response) =>
    response.url().endsWith('/api/coupons/validate') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect((await validated).status()).toBe(200);
  await expect(page.getByText('Applied on ₹239.00: ₹23.90 off')).toBeVisible();

  expect(validateBodies).toHaveLength(1);
  expect(Object.keys(validateBodies[0]).sort()).toEqual(['code', 'durationId', 'helpers']);
  expect(validateBodies[0]).toEqual({ code: 'HELPER10', durationId: '2', helpers: 1 });

  // Confirm redeems the server-priced discount and moves to the confirmation.
  const redeemed = page.waitForResponse((response) =>
    response.url().endsWith('/api/coupons/redeem') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /Confirm Booking/ }).click();
  expect((await redeemed).status()).toBe(200);
  await expect(page.getByText('Booking confirmed.')).toBeVisible();

  expect(redeemBodies).toHaveLength(1);
  expect(Object.keys(redeemBodies[0]).sort()).toEqual(['bookingId', 'code', 'durationId', 'helpers']);
  expect(redeemBodies[0]).toMatchObject({ code: 'HELPER10', durationId: '2', helpers: 1 });
  expect(String(redeemBodies[0].bookingId)).toMatch(/^BOS-\d{4}-\d{4}$/);

  // The stored redemption is the server's own calculation, not the browser's.
  const { rows } = await db!.query(
    `select booking_id, subtotal::text as subtotal, discount::text as discount
       from public.coupon_redemptions where user_id = $1`,
    [userId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].booking_id).toBe(redeemBodies[0].bookingId);
  expect(Number(rows[0].subtotal)).toBe(239);
  expect(Number(rows[0].discount)).toBe(23.9);
});
