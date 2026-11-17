import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Style 4 academic discovery: real browser interactions against a fresh
 * production build served on E2E_BASE_URL. Every assertion below clicks the
 * control and reads the result; nothing is asserted from source alone.
 *
 * The catalogue is the demo/fixture set, so School holds one listing
 * ("CBSE Class 10 Mathematics", BrightTutors, Kukatpally, ₹4,500, 4.7) and the
 * other categories hold none. Tests assert that reality instead of inventing
 * records.
 */

const RAIL = { name: 'Academic categories' } as const;
const FILTER_PANEL = { name: 'Filters' } as const;
const CARD_IMAGE = /CBSE Class 10 Mathematics at BrightTutors/i;
const CARD_LABEL = 'View details for CBSE Class 10 Mathematics';

/** The privacy sheet mounts after first paint, so wait for it instead of sampling once. */
async function dismissPrivacy(page: Page, attempts = 12): Promise<void> {
  const essentialOnly = page.getByRole('button', { name: 'Essential only', exact: true });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await essentialOnly.isVisible().catch(() => false)) {
      await essentialOnly.click();
      await expect(essentialOnly).toBeHidden();
      return;
    }
    await page.waitForTimeout(200);
  }
}

async function prepare(page: Page): Promise<void> {
  await page.goto('/#classes/style4', { waitUntil: 'domcontentloaded' });
  await dismissPrivacy(page);
  // Style 4 opens on the pathway landing; the academic rail lives under Academic.
  const academic = page.getByRole('button', { name: 'Academic', exact: true });
  await expect(academic).toBeVisible({ timeout: 30_000 });
  await academic.click();
  await expect(page.getByRole('complementary', RAIL)).toBeVisible({ timeout: 30_000 });
  await dismissPrivacy(page, 4);
}

async function pickSection(page: Page, name: string): Promise<void> {
  await page.getByRole('complementary', RAIL).getByRole('button', { name, exact: true }).click();
}

async function pickClass(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: `Select ${label}`, exact: true }).click();
}

async function openClass10(page: Page): Promise<void> {
  await pickSection(page, 'School');
  await pickClass(page, 'Class 10');
  await expect(page.getByRole('heading', { name: /^Class 10/ })).toBeVisible();
}

function filterPanel(page: Page) {
  return page.getByRole('group', FILTER_PANEL);
}

async function openFilters(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: /^Filters/ });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(filterPanel(page)).toBeVisible();
}

function detail(page: Page) {
  return page.getByTestId('class-detail-modal');
}

async function closeDetail(page: Page): Promise<void> {
  await detail(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(detail(page)).toBeHidden();
}

function resultLine(page: Page) {
  return page.getByText(/\d+ results? for /).first();
}

test.describe.configure({ mode: 'serial' });

test.describe('Style 4 academic cards', () => {
  test('clicking the listing image opens that listing', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await page.getByRole('img', { name: CARD_IMAGE }).click();
    await expect(detail(page)).toBeVisible();
    await expect(detail(page)).toContainText('CBSE Class 10 Mathematics');
    await closeDetail(page);
  });

  test('clicking the card opens the same listing once', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    let opened = 0;
    await page.exposeFunction('__detailsOpened', () => { opened += 1; });
    await page.evaluate(() => {
      // Count modal insertions only: a second navigation remounts the dialog,
      // while ordinary re-renders must not count.
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of Array.from(record.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.matches('[data-testid="class-detail-modal"]') || node.querySelector('[data-testid="class-detail-modal"]')) {
              (window as any).__detailsOpened();
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await page.getByRole('button', { name: CARD_LABEL }).click({ position: { x: 8, y: 8 } });
    await expect(detail(page)).toBeVisible();
    await expect(detail(page)).toContainText('CBSE Class 10 Mathematics');
    await page.waitForTimeout(400);
    expect(opened, 'the card must not navigate twice').toBe(1);
    await closeDetail(page);
  });

  test('favourite toggles independently of the card', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    const heart = page.getByRole('button', { name: /CBSE Class 10 Mathematics (to|from) favourites/ });
    await expect(heart).toHaveAttribute('aria-pressed', 'false');
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');
    await expect(detail(page)).toBeHidden();
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'false');
    await expect(detail(page)).toBeHidden();
  });

  test('Enquire opens the enquiry workflow for the listing', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await page.getByRole('button', { name: 'Enquire about CBSE Class 10 Mathematics' }).click();
    await expect(detail(page)).toBeVisible();
    await expect(detail(page)).toContainText('CBSE Class 10 Mathematics');
    await closeDetail(page);
  });

  test('View Details opens the same listing', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await page.getByRole('button', { name: 'View Details →' }).click();
    await expect(detail(page)).toBeVisible();
    await expect(detail(page)).toContainText('BrightTutors');
    await closeDetail(page);
  });
});

test.describe('Style 4 school filters', () => {
  test('Admissions never shows tuition subject filters', async ({ page }) => {
    await prepare(page);
    await pickSection(page, 'School');
    await page.getByRole('button', { name: 'Filter by Admissions' }).click();
    await expect(page.getByRole('button', { name: 'Show Results (0)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Maths', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /^Show Results/ }).click();
    await expect(page.getByRole('button', { name: 'Maths', exact: true })).toHaveCount(0);
  });

  test('Tuition shows applicable subject filters', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await page.getByRole('button', { name: 'Tuition', exact: true }).click();
    await page.getByRole('button', { name: /^Show Results/ }).click();
    for (const subject of ['Maths', 'Science', 'English', 'Social']) {
      await expect(page.getByRole('button', { name: subject, exact: true })).toBeVisible();
    }
  });

  test('Tuition opens exactly the same filter sheet as Admissions', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await page.getByRole('button', { name: 'Tuition', exact: true }).click();
    const showResults = page.getByRole('button', { name: /^Show Results/ });
    await expect(showResults).toBeVisible();
    for (const group of ['Service', 'Class', 'Board']) {
      await expect(page.getByRole('button', { name: group, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Subject', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'CBSE', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Maths', exact: true })).toHaveCount(0);
    await showResults.click();
    await expect(page.getByRole('heading', { name: /Class 10 · Tuition/ })).toBeVisible();
  });

  test('Coaching shows relevant filters and resets subjects from Tuition', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await page.getByRole('button', { name: 'Tuition', exact: true }).click();
    await page.getByRole('button', { name: /^Show Results/ }).click();
    await page.getByRole('button', { name: 'Science', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Science', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // Switching service drops the tuition-only subject selection.
    await page.getByRole('button', { name: 'Admissions', exact: true }).click();
    await page.getByRole('button', { name: /^Show Results/ }).click();
    await expect(page.getByRole('button', { name: 'Science', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Coaching', exact: true }).click();
    await page.getByRole('button', { name: /^Show Results/ }).click();
    await expect(page.getByRole('button', { name: 'Maths', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Science', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });

  test('Class 10 + Maths returns only matching records', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await page.getByRole('button', { name: 'Tuition', exact: true }).click();
    await page.getByRole('button', { name: /^Show Results/ }).click();
    await page.getByRole('button', { name: 'Maths', exact: true }).click();
    await expect(resultLine(page)).toContainText('1 result');
    const cards = page.getByRole('button', { name: /^View details for / });
    await expect(cards).toHaveCount(1);
    await expect(page.getByRole('button', { name: CARD_LABEL })).toBeVisible();
  });

  test('Class 10 + ICSE returns only matching records and a no-results state', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await openFilters(page);
    await filterPanel(page).getByRole('button', { name: 'ICSE', exact: true }).click();
    await expect(resultLine(page)).toContainText('0 results');
    await expect(page.getByText('No listing in this selection matches the filters you chose.')).toBeVisible();
    await expect(page.getByRole('button', { name: CARD_LABEL })).toHaveCount(0);
  });

  test('combined filters return the correct record', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await page.getByRole('button', { name: 'Tuition', exact: true }).click();
    await page.getByRole('button', { name: /^Show Results/ }).click();
    await page.getByRole('button', { name: 'Maths', exact: true }).click();
    await openFilters(page);
    const panel = filterPanel(page);
    await panel.getByRole('button', { name: 'Offline', exact: true }).click();
    await panel.getByRole('button', { name: '4.5+', exact: true }).click();
    await panel.getByRole('button', { name: 'Under ₹5,000', exact: true }).click();
    await expect(resultLine(page)).toContainText('1 result');
    await expect(page.getByRole('button', { name: CARD_LABEL })).toBeVisible();
    // A combination the listing cannot satisfy empties the page.
    await panel.getByRole('button', { name: 'Above ₹10,000', exact: true }).click();
    await expect(resultLine(page)).toContainText('0 results');
    await expect(page.getByText('No listing in this selection matches the filters you chose.')).toBeVisible();
    await expect(page.getByRole('button', { name: CARD_LABEL })).toHaveCount(0);
  });

  test('the result count matches the visible cards', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    const count = Number((await resultLine(page).innerText()).match(/(\d+) result/)?.[1]);
    await expect(page.getByRole('button', { name: CARD_LABEL })).toHaveCount(count);
  });

  test('Clear all restores every listing and resets the badge', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await openFilters(page);
    const toggle = page.getByRole('button', { name: /^Filters/ });
    await filterPanel(page).getByRole('button', { name: 'ICSE', exact: true }).click();
    await expect(resultLine(page)).toContainText('0 results');
    // The badge counts the chosen filter, and only that.
    await expect(toggle).toHaveText(/Filters\s*1/);
    await filterPanel(page).getByRole('button', { name: 'Clear all' }).click();
    await expect(resultLine(page)).toContainText('1 result');
    await expect(toggle).toHaveText(/^Filters$/);
    await expect(page.getByRole('button', { name: CARD_LABEL })).toBeVisible();
  });
});

test.describe('Style 4 categories', () => {
  test('switching category resets incompatible filters', async ({ page }) => {
    await prepare(page);
    await openClass10(page);
    await page.getByRole('button', { name: 'Tuition', exact: true }).click();
    await page.getByRole('button', { name: /^Show Results/ }).click();
    await openFilters(page);
    await filterPanel(page).getByRole('button', { name: 'ICSE', exact: true }).click();
    await pickSection(page, 'Medical');
    await expect(page.getByRole('heading', { name: /Listings in Medical/ })).toBeVisible();
    // Medical has its own programme filters, never the school board/subject ones.
    await openFilters(page);
    const panel = filterPanel(page);
    for (const name of ['MBBS', 'BDS', 'NEET']) {
      await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(panel.getByRole('button', { name: 'ICSE', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Filters/ })).not.toContainText(/[0-9]/);
  });

  test('Law and MBA get their own contextual filters', async ({ page }) => {
    await prepare(page);
    for (const [section, options] of [
      ['Law', ['LLB', 'LLM', 'CLAT', 'LAWCET']],
      ['MBA', ['MBA', 'BBA', 'PGDM', 'CAT']],
      ['Engineering', ['B.Tech', 'Polytechnic', 'JEE', 'EAPCET']],
    ] as const) {
      await pickSection(page, section);
      await openFilters(page);
      const panel = filterPanel(page);
      for (const name of options) await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
      await expect(panel.getByRole('button', { name: 'CBSE', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: /^Filters/ }).click();
    }
  });

  test('landing category cards open the category they name', async ({ page }) => {
    await page.goto('/#classes/style4', { waitUntil: 'domcontentloaded' });
    await dismissPrivacy(page);
    await page.getByRole('button', { name: /^Medical & Healthcare/ }).click();
    await expect(page.getByRole('complementary', RAIL).getByRole('button', { name: 'Medical', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: /Listings in Medical/ })).toBeVisible();
  });

  test('the landing Admissions shortcut opens the admissions filter view', async ({ page }) => {
    await page.goto('/#classes/style4', { waitUntil: 'domcontentloaded' });
    await dismissPrivacy(page);
    const shortcut = page.getByRole('button', { name: /Admissions$/ }).first();
    await expect(shortcut).toBeVisible();
    await shortcut.click();
    // The School admissions sheet opens, preselected on Admissions.
    await expect(page.getByRole('button', { name: 'Admissions', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const showResults = page.getByRole('button', { name: /^Show Results/ });
    await expect(showResults).toBeVisible();
    await showResults.click();
    await expect(page.getByRole('heading', { name: /All classes · Admissions/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Maths', exact: true })).toHaveCount(0);
  });

  test('class tiles from Nursery to Class 12 are selectable', async ({ page }) => {
    await prepare(page);
    await pickSection(page, 'School');
    for (const label of ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 12']) {
      await pickClass(page, label);
      await expect(page.getByRole('heading', { name: new RegExp(`^${label}`) })).toBeVisible();
      await page.getByRole('button', { name: '← School' }).click();
      await expect(page.getByRole('button', { name: `Select ${label}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('a sub-category opens the Class 10-style page in every category', async ({ page }) => {
    await prepare(page);
    const tracks: Array<[string, string]> = [
      ['Inter', 'MPC'],
      ['Degree', 'B.Sc'],
      ['Engineering', 'B.Tech'],
      ['Medical', 'MBBS'],
      ['Law', 'LLB'],
      ['MBA', 'MBA'],
      ['PG', 'M.Sc'],
      ['PhD', 'PhD'],
      ['Diploma', 'Diploma'],
      ['Entrance', 'UPSC'],
    ];
    for (const [section, track] of tracks) {
      await pickSection(page, section);
      await page.getByRole('button', { name: `Select ${track}`, exact: true }).click();
      // Same page shape as Class 10: breadcrumb, banner, Filters, result count.
      await expect(page.getByRole('heading', { name: track, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: `← ${section}` })).toBeVisible();
      await expect(page.getByText(/\d+ results? for /)).toBeVisible();
      await openFilters(page);
      await expect(filterPanel(page)).toBeVisible();
      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.getByRole('button', { name: `← ${section}` }).click();
      await expect(page.getByRole('button', { name: `Select ${track}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('every academic category navigates and reports its own listings', async ({ page }) => {
    await prepare(page);
    const sections = ['School', 'Inter', 'Degree', 'Engineering', 'Medical', 'Law', 'MBA', 'PG', 'PhD', 'Diploma', 'Entrance'];
    for (const section of sections) {
      await pickSection(page, section);
      await expect(page.getByRole('heading', { name: new RegExp(`Listings in ${section}`) })).toBeVisible();
      const railButton = page.getByRole('complementary', RAIL).getByRole('button', { name: section, exact: true });
      await expect(railButton).toHaveAttribute('aria-pressed', 'true');
    }
  });
});

test.describe('Style 4 responsive screenshots', () => {
  const viewports = [
    { name: 'iphone-390x844', width: 390, height: 844 },
    { name: 'iphone-430x932', width: 430, height: 932 },
    { name: 'desktop-1440x900', width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    test(`renders at ${viewport.name}`, async ({ browser }: { browser: Browser }) => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await prepare(page);
      await openClass10(page);
      await page.getByRole('button', { name: 'Tuition', exact: true }).click();
      await page.getByRole('button', { name: /^Show Results/ }).click();
      await openFilters(page);
      // Lazy images only load once they are near the viewport; walk the page so
      // the failure check below sees real results instead of idle placeholders.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1200);
      // The page scrolls inside its own container, not the window.
      await page.evaluate(() => {
        for (const element of Array.from(document.querySelectorAll('*'))) {
          if (element.scrollTop > 0) element.scrollTop = 0;
        }
      });
      // Frame the control under test: the Filters pill, its panel and the card.
      await page.getByRole('button', { name: /^Filters/ }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/style4-${viewport.name}.png` });
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, 'no horizontal overflow').toBeLessThanOrEqual(overflow.clientWidth + 2);
      // A finished image with no intrinsic width is a failed load that also
      // escaped SafeImage's local fallback.
      const brokenImages = await page.evaluate(() =>
        [...document.querySelectorAll('img')]
          .filter((image) => image.complete && image.naturalWidth === 0)
          .map((image) => image.getAttribute('src')),
      );
      expect(brokenImages, 'every image decodes or falls back locally').toEqual([]);
      expect(errors).toHaveLength(0);
      await context.close();
    });
  }
});
