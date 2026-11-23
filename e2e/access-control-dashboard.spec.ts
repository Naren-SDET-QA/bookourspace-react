import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { Client } from 'pg';
import { signInWithLocalDevSession } from './session-cookie-harness';

/**
 * Browser journey for User Management → Access Control.
 *
 * Exercises the real dashboard against the running server and asserts the
 * database outcome of every action. It seeds one disposable customer (whose
 * signup trigger creates View-only grants) and removes it afterwards; no demo
 * account's permissions are changed.
 *
 * Screenshots are written to `e2e-artifacts/`.
 */

const DATABASE_URL =
  process.env.BOS_TEST_DATABASE_URL
  || process.env.BOS_LISTINGS_DATABASE_URL
  || 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';

const SHOTS = 'e2e-artifacts';
const userId = randomUUID();
const email = `e2e-access-${userId.slice(0, 8)}@example.test`;

let db: Client;
let setupError = '';

test.describe.configure({ mode: 'serial' });

async function openConsole(page: Page) {
  await signInWithLocalDevSession(page.context(), { role: 'admin', email: 'demo.admin@bookourspace.local' });
  // Status changes confirm through window.confirm; accept every one.
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('/#admin');
  const accessControlNav = page.getByRole('button', { name: /Access Control/ }).first();
  await expect(accessControlNav).toBeVisible({ timeout: 30_000 });
  await accessControlNav.click();
  await expect(page.getByTestId('admin-access-control')).toBeVisible({ timeout: 20_000 });
}

async function searchAndSelect(page: Page, value: string) {
  const input = page.getByLabel('Search customers and providers');
  await input.fill(value);
  await page.getByTestId('admin-access-control').getByRole('button', { name: 'Search', exact: true }).click();
  const row = page.getByTestId(`account-${userId}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.getByTestId('category-pg')).toBeVisible();
}

async function actionsFor(moduleKey: string): Promise<string[]> {
  const result = await db.query(
    `select allowed_actions from public.customer_module_access where user_id = $1 and module_key = $2`,
    [userId, moduleKey],
  );
  return (result.rows[0]?.allowed_actions as string[] | undefined) || [];
}

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  db = new Client({ connectionString: DATABASE_URL });
  try {
    await db.connect();
    // The auth trigger creates the profile; update it rather than inserting a
    // second row for the same id.
    await db.query(`insert into auth.users (id, email) values ($1,$2)`, [userId, email]);
    await db.query(
      `update public.profiles
          set full_name = 'E2E Access Customer', role = 'customer', account_status = 'active'
        where id = $1`,
      [userId],
    );
  } catch (error) {
    setupError = `local database is unavailable: ${(error as Error).message}`;
  }
});

test.afterAll(async () => {
  if (!db) return;
  await db.query(`delete from public.access_control_repairs where report::text like $1`, [`%${userId}%`]).catch(() => undefined);
  await db.query(`delete from public.access_control_audit where target_user_id = $1`, [userId]).catch(() => undefined);
  await db.query(`delete from auth.users where id = $1`, [userId]).catch(() => undefined);
  await db.end();
});

test.beforeEach(async () => {
  test.skip(Boolean(setupError), setupError);
  // Reset the account state after the revoke/reactivate scenario so serial
  // cases do not turn a later search into an accidental state-leak failure.
  await db.query(`update public.profiles set account_status = 'active' where id = $1`, [userId]);
});

test('search, switch, complete access, view-only and revoke', async ({ page }) => {
  test.skip(Boolean(setupError), setupError);
  await openConsole(page);
  await page.screenshot({ path: `${SHOTS}/access-control-overview.png`, fullPage: true });

  await searchAndSelect(page, email);

  // Signup defaults: View on, every write off.
  await expect(page.getByTestId('action-pg-view')).toHaveAttribute('aria-pressed', 'true');
  for (const action of ['create', 'edit', 'delete', 'approve', 'manage']) {
    await expect(page.getByTestId(`action-pg-${action}`)).toHaveAttribute('aria-pressed', 'false');
  }

  // Grant one switch and save.
  await page.getByTestId('action-pg-create').click();
  await expect(page.getByTestId('save-permissions')).toBeEnabled();
  await page.getByTestId('save-permissions').click();
  await expect(page.getByText('Permissions saved. The change applies on the next request.')).toBeVisible();
  expect((await actionsFor('pg')).sort()).toEqual(['create', 'view']);

  // Complete access to the selected category.
  const [completeResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/complete-access')),
    page.getByTestId('complete-access-selected').click(),
  ]);
  const completeBody = (await completeResponse.json()) as {
    account: { customerGrants: Array<{ category: string; actions: string[] }> };
  };
  expect(completeBody.account.customerGrants.find((grant) => grant.category === 'pg')?.actions.length).toBe(6);
  await expect(page.getByText('Complete access granted to the selected categories.')).toBeVisible();
  expect((await actionsFor('pg')).length).toBe(6);

  // Restore View only.
  await page.getByTestId('restore-view-only').click();
  await expect(page.getByText('View-only access restored.')).toBeVisible();
  expect(await actionsFor('pg')).toEqual(['view']);
  await page.screenshot({ path: `${SHOTS}/access-control-permissions.png`, fullPage: true });

  // Revoke: status change plus grant removal.
  await page.getByTestId('revoke-account').click();
  await expect(page.getByText('Account revoked.')).toBeVisible();
  const blocked = await db.query(`select account_status from public.profiles where id = $1`, [userId]);
  expect(blocked.rows[0].account_status).toBe('blocked');
  expect(await actionsFor('pg')).toEqual([]);

  // Reactivate and restore the dashboard baseline.
  await page.getByTestId('activate-account').click();
  await expect(page.getByText('Account reactivated.')).toBeVisible();
  await page.getByTestId('restore-view-only').click();
  await expect(page.getByText('View-only access restored.')).toBeVisible();
});

test('suspend, reactivate and permission history', async ({ page }) => {
  test.skip(Boolean(setupError), setupError);
  await openConsole(page);
  await searchAndSelect(page, email);

  await page.getByTestId('suspend-account').click();
  await expect(page.getByText('Account suspended.')).toBeVisible();
  const suspended = await db.query(`select account_status from public.profiles where id = $1`, [userId]);
  expect(suspended.rows[0].account_status).toBe('suspended');

  await page.getByTestId('activate-account').click();
  await expect(page.getByText('Account reactivated.')).toBeVisible();

  // History must show the account-level change and the permission edits.
  const history = page.getByTestId('permission-history');
  await expect(history).toContainText('account.suspended');
  await expect(history).toContainText('category_permissions');
});

test('health preview, safe apply and rollback', async ({ page }) => {
  test.skip(Boolean(setupError), setupError);
  await openConsole(page);
  await searchAndSelect(page, email);

  // Remove the account's grants outside the console so the health checker sees
  // a genuinely unverified account.
  await db.query(`delete from public.customer_module_access where user_id = $1`, [userId]);

  await page.getByTestId('recheck-health').click();
  await expect(page.getByText(/has no permission rows/)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('preview-repair').click();
  await expect(page.getByText(/Preview created with \d+ safe operation/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/access-control-health.png`, fullPage: true });

  await page.getByTestId('apply-repair').click();
  await expect(page.getByText(/Repair applied: \d+ operation/)).toBeVisible();
  const applied = await db.query(
    `select allowed_actions, grant_source from public.customer_module_access where user_id = $1`,
    [userId],
  );
  expect(applied.rows.length).toBeGreaterThan(0);
  for (const row of applied.rows) {
    expect(row.allowed_actions).toEqual(['view']);
    expect(row.grant_source).toBe('repair');
  }

  await page.getByTestId('rollback-repair').click();
  await expect(page.getByText(/Repair rolled back: \d+ operation/)).toBeVisible();
  const rolledBack = await db.query(
    `select 1 from public.customer_module_access where user_id = $1`,
    [userId],
  );
  expect(rolledBack.rows.length).toBe(0);
});

test('the console stays usable on a phone viewport', async ({ page }) => {
  test.skip(Boolean(setupError), setupError);
  await page.setViewportSize({ width: 390, height: 844 });
  await openConsole(page);
  await searchAndSelect(page, email);
  await expect(page.getByTestId('action-pg-view')).toBeVisible();
  await expect(page.getByTestId('save-permissions')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, 'access control console must not scroll horizontally on a phone').toBe(false);
  await page.screenshot({ path: `${SHOTS}/access-control-mobile.png`, fullPage: true });
});

test('Super Admin is unrestricted and protected; a provider owner is locked to full access', async ({ page }) => {
  test.skip(Boolean(setupError), setupError);
  await openConsole(page);

  const input = page.getByLabel('Search customers and providers');
  await input.fill('demo.admin@bookourspace.local');
  await page.getByTestId('admin-access-control').getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('[data-testid^="account-"]').first().click();
  await expect(page.getByText(/Super Admin \(unrestricted\)/)).toBeVisible();
  await expect(page.getByTestId('save-permissions')).toBeDisabled();

  await input.fill('demo.host@bookourspace.local');
  await page.getByTestId('admin-access-control').getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('[data-testid^="account-"]').first().click();
  await expect(page.getByText('owner: full access').first()).toBeVisible();
  await expect(page.getByTestId('action-hotels-view')).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/access-control-provider-owner.png`, fullPage: true });

  // A provider account never gains customer-grant editing here.
  await expect(page.getByTestId('category-pg')).toBeVisible();
});
