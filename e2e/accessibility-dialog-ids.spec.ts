import { expect, test, type Page } from '@playwright/test';

/**
 * Regression guard for the duplicate-id / mis-named-dialog class of bug.
 *
 * Two defects motivated it:
 *  - `CustomerLoginExperience` carried `bos-customer-login-title` on both its
 *    hero `<h1>` and its screen-reader `<h2>`, so the sign-in dialog was named
 *    "Book Spaces for Every Occasion" instead of "Sign in or create an account".
 *  - `HomeServicesSection` pointed `aria-labelledby` at a heading that its live
 *    presentation branch never renders, leaving a dangling reference.
 *
 * Each key screen is opened the way a visitor opens it, then audited in the live
 * DOM: no element id may appear twice, every `aria-labelledby` must resolve to
 * exactly one element, and every mounted dialog must take its name from exactly
 * one element inside itself (or carry a non-empty `aria-label`).
 */

type IdAudit = {
  duplicateIds: Array<{ id: string; count: number; elements: string[] }>;
  brokenLabels: Array<{ element: string; references: Array<{ id: string; matches: number }> }>;
  badDialogLabels: Array<{ testid: string | null; labelledby: string; references: Array<{ id: string; matches: number; inside: boolean }> }>;
  namelessDialogs: Array<{ testid: string | null; heading: string | null }>;
  dialogNames: string[];
};

/** Runs in the page. Visibility is a client rect, the same test the browser uses. */
function auditIdsAndDialogs(): IdAudit {
  const visible = (el: Element) => el.getClientRects().length > 0;
  const label = (el: Element) => {
    const testid = (el as HTMLElement).dataset?.testid;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    return `${el.tagName.toLowerCase()}${testid ? `[${testid}]` : ''}${text ? ` "${text}"` : ''}`;
  };

  const byId = new Map<string, Element[]>();
  document.querySelectorAll('[id]').forEach((el) => {
    byId.set(el.id, [...(byId.get(el.id) || []), el]);
  });
  const countOf = (id: string) => (byId.get(id) || []).length;

  const duplicateIds = [...byId.entries()]
    .filter(([, elements]) => elements.length > 1)
    .map(([id, elements]) => ({ id, count: elements.length, elements: elements.map(label) }));

  const brokenLabels: IdAudit['brokenLabels'] = [];
  document.querySelectorAll('[aria-labelledby]').forEach((el) => {
    const references = (el.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => ({ id, matches: countOf(id) }));
    if (references.some((reference) => reference.matches !== 1)) brokenLabels.push({ element: label(el), references });
  });

  const badDialogLabels: IdAudit['badDialogLabels'] = [];
  const namelessDialogs: IdAudit['namelessDialogs'] = [];
  const dialogNames: string[] = [];
  document.querySelectorAll('[role="dialog"], [aria-modal="true"]').forEach((dialog) => {
    if (!visible(dialog)) return;
    const testid = (dialog as HTMLElement).dataset?.testid || null;
    const labelledby = dialog.getAttribute('aria-labelledby') || '';
    const ariaLabel = (dialog.getAttribute('aria-label') || '').trim();

    if (!labelledby) {
      if (!ariaLabel) {
        const heading = dialog.querySelector('h1, h2, h3');
        namelessDialogs.push({ testid, heading: heading ? (heading.textContent || '').trim().slice(0, 60) : null });
      } else {
        dialogNames.push(ariaLabel);
      }
      return;
    }

    const references = labelledby
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => {
        const matches = byId.get(id) || [];
        return { id, matches: matches.length, inside: matches.some((match) => dialog.contains(match)) };
      });
    if (references.some((reference) => reference.matches !== 1 || !reference.inside)) {
      badDialogLabels.push({ testid, labelledby, references });
      return;
    }
    dialogNames.push(
      references
        .map((reference) => (byId.get(reference.id)?.[0]?.textContent || '').replace(/\s+/g, ' ').trim())
        .join(' ')
        .trim(),
    );
  });

  return { duplicateIds, brokenLabels, badDialogLabels, namelessDialogs, dialogNames };
}

const CONSENT = JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' });

/** Guest visit with the privacy banner already answered; no stored entry choice unless asked. */
async function openAsGuest(page: Page, hash: string, entryChoice: 'guest' | null = 'guest'): Promise<void> {
  await page.addInitScript(
    ([choice, consent]) => {
      if (choice) localStorage.setItem('bos_entry_choice_v1', choice);
      else localStorage.removeItem('bos_entry_choice_v1');
      localStorage.setItem('bos_privacy_consent_v1', String(consent));
    },
    [entryChoice, CONSENT],
  );
  await page.goto(`/${hash}`, { waitUntil: 'domcontentloaded' });
}

async function expectVisibleDialogs(page: Page, timeout = 30_000): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter((el) => el.getClientRects().length > 0).length),
      { timeout },
    )
    .toBeGreaterThan(0);
}

/** The whole guard: unique ids, resolvable label references, named dialogs. */
async function expectAccessibleScreen(page: Page, label: string, { expectDialog = true } = {}): Promise<void> {
  // A cold lazy chunk can unmount the boot shell a beat before the React
  // dialog mounts, so settle on a visible dialog before auditing.
  if (expectDialog) await expectVisibleDialogs(page);
  const audit = await page.evaluate(auditIdsAndDialogs);
  expect(audit.duplicateIds, `duplicate element ids on ${label}`).toEqual([]);
  expect(audit.brokenLabels, `aria-labelledby references that do not resolve to one element on ${label}`).toEqual([]);
  expect(audit.badDialogLabels, `dialogs not named by exactly one element inside themselves on ${label}`).toEqual([]);
  expect(audit.namelessDialogs, `dialogs with no accessible name on ${label}`).toEqual([]);
  if (expectDialog) expect(audit.dialogNames.length, `${label} should show a dialog`).toBeGreaterThan(0);
}

test.describe('accessible ids and dialog names on key screens', () => {
  test('first-visit entry sheet', async ({ page }) => {
    await openAsGuest(page, '', null);
    await expect(page.getByTestId('bookourspace-welcome')).toBeVisible({ timeout: 30_000 });
    await expectVisibleDialogs(page);
    await expectAccessibleScreen(page, 'first-visit entry');
    // The sign-in sheet itself must be named by its own title, not the hero copy.
    await expect(page.getByRole('dialog', { name: 'Sign in or create an account' })).toBeVisible();
    await expect(page.locator('#bos-customer-login-title')).toHaveCount(1);
  });

  test('#login route', async ({ page }) => {
    await openAsGuest(page, '#login', null);
    const sheet = page.getByRole('dialog', { name: 'Sign in or create an account' });
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#bos-customer-login-title')).toHaveCount(1);
    await expectAccessibleScreen(page, '#login');
  });

  test('services screen has unique ids and no dangling label reference', async ({ page }) => {
    await openAsGuest(page, '#services');
    await expect(page.locator('section[aria-label="services section"]')).toBeVisible({ timeout: 45_000 });
    // The section shell mounts before the lazy services experience, so wait for a
    // control that only exists inside it: auditing the shell would prove nothing.
    await expect(page.getByRole('button', { name: /my service bookings/i }).first()).toBeVisible({ timeout: 45_000 });
    // The services presentation renders inline, so no dialog is expected here;
    // what must hold is that every id is unique and every label reference resolves.
    await expectAccessibleScreen(page, 'services', { expectDialog: false });
  });

  test('classes detail and enrollment dialogs', async ({ page }) => {
    await openAsGuest(page, '#classes/style3');
    await expect(page.locator('[data-bos-category-style^="classes-"]')).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: /^View\b/ }).first().click();
    await expect(page.getByTestId('class-detail-modal')).toBeVisible({ timeout: 30_000 });
    await expectAccessibleScreen(page, 'classes detail');

    // Selecting a batch opens the enrollment sheet; on demo data the same
    // action can surface the demo enquiry preview instead, and both are dialogs
    // this guard must cover.
    await page.getByRole('button', { name: /select batch & enroll/i }).first().click();
    await expect(
      page.getByTestId('class-enrollment-modal').or(page.getByRole('dialog', { name: 'Demo enquiry preview' })).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expectAccessibleScreen(page, 'classes enrollment');
  });

  test('venue detail dialog', async ({ page }) => {
    await openAsGuest(page, '#venues');
    await page.getByRole('button', { name: 'View Details', exact: true }).first().click({ timeout: 30_000 });
    await expect(page.locator('#venue-detail-title')).toBeVisible({ timeout: 30_000 });
    await expectVisibleDialogs(page);
    await expectAccessibleScreen(page, 'venue detail');
  });

  test('PG detail dialog', async ({ page }) => {
    await openAsGuest(page, '#pg');
    const view = page.getByRole('button', { name: /^View\b/ }).first();
    await expect(view).toBeVisible({ timeout: 45_000 });
    await view.click();
    await expect(page.locator('#pg-style3-detail-title, #pg-detail-title')).toBeVisible({ timeout: 30_000 });
    await expectVisibleDialogs(page);
    await expectAccessibleScreen(page, 'PG detail');
  });

  test('stay detail dialog', async ({ page }) => {
    await openAsGuest(page, '#stays');
    const card = page.locator('article').filter({ has: page.getByRole('button') }).first();
    await expect(card).toBeVisible({ timeout: 45_000 });
    await card.getByRole('button').first().click();
    await expectVisibleDialogs(page);
    await expectAccessibleScreen(page, 'stay detail');
  });
});
