import { expect, test, type Page } from '@playwright/test';

/**
 * Mobile regression suite — 375×812, 390×844 and 430×932.
 *
 * Every check here failed on the tree before this suite existed:
 *
 *  - the privacy choices dialog was centred with `left: 50%; transform:
 *    translateX(-50%)`, while the motion wrapper animates `y`. The inline
 *    transform from the animation replaced the stylesheet transform, so the
 *    panel began at the 50% line and ran past the right edge, clipping its
 *    close button and "Allow campaign tags" action on every phone width;
 *  - the primary navigation opener was a 28×28 hit area on phones.
 *
 * The overflow check is scoped to in-flow content: fixed overlays are judged by
 * their own bounding box in the dialog tests instead, so an intentional
 * slide-in animation cannot masquerade as a layout defect.
 */

const VIEWPORTS = [
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
];

const MODULE_ROUTES = ['#pg', '#classes', '#venues', '#services', '#stays', '#movies'];

async function boot(page: Page, hash: string) {
  await page.goto(hash === '/' ? '/' : `/${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('universal-marketplace-header')).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => (await page.locator('body').innerText()).trim().length, { timeout: 30_000 })
    .toBeGreaterThan(200);
}

/** Taps the first in-flow control whose label matches, then waits for it to go. */
async function dismissPrivacy(page: Page) {
  const banner = page.locator('[data-bos-chrome="cookie"]');
  if (!(await banner.isVisible().catch(() => false))) return;
  await page.getByRole('button', { name: 'Essential only', exact: true }).click();
  await expect(banner).toBeHidden();
}

for (const viewport of VIEWPORTS) {
  test.describe(`mobile ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('privacy choices fit the viewport and every action is reachable', async ({ page }) => {
      await boot(page, '/');
      const banner = page.locator('[data-bos-chrome="cookie"]');
      await expect(banner).toBeVisible({ timeout: 20_000 });

      const box = await banner.boundingBox();
      expect(box, 'privacy dialog has a box').not.toBeNull();
      expect(box!.x, 'left edge inside the viewport').toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width, 'right edge inside the viewport')
        .toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y, 'top edge inside the viewport').toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height, 'bottom edge inside the viewport')
        .toBeLessThanOrEqual(viewport.height + 1);

      // Every action must be inside the panel and large enough to tap.
      for (const action of [
        page.getByRole('button', { name: 'Dismiss privacy notice' }),
        page.getByRole('button', { name: 'Essential only', exact: true }),
        page.getByRole('button', { name: 'Allow campaign tags' }),
      ]) {
        const actionBox = await action.boundingBox();
        expect(actionBox, 'privacy action has a box').not.toBeNull();
        expect(actionBox!.x).toBeGreaterThanOrEqual(box!.x - 1);
        expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
        expect(actionBox!.height, 'privacy action is tappable').toBeGreaterThanOrEqual(32);
      }

      await page.getByRole('button', { name: 'Essential only', exact: true }).click();
      await expect(banner).toBeHidden();
    });

    test('primary navigation is a 44px target and its menu fits', async ({ page }) => {
      await boot(page, '/');
      await dismissPrivacy(page);

      const menuAction = page.locator('.bos-header-menu-action');
      await expect(menuAction).toBeVisible();
      const trigger = await menuAction.boundingBox();
      expect(trigger!.width, 'menu trigger width').toBeGreaterThanOrEqual(44);
      expect(trigger!.height, 'menu trigger height').toBeGreaterThanOrEqual(44);

      await menuAction.click();
      const menu = page.locator('#bos-mobile-menu');
      await expect(menu).toBeVisible();
      const menuBox = await menu.boundingBox();
      expect(menuBox, 'menu has a box').not.toBeNull();
      expect(menuBox!.x).toBeGreaterThanOrEqual(-1);
      expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    });

    test('layout is stable while the page loads (CLS budget)', async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number; __shifts: number[] };
        w.__cls = 0;
        w.__shifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
            if (entry.hadRecentInput) continue;
            w.__cls += entry.value;
            w.__shifts.push(entry.value);
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });

      await boot(page, '/');
      await dismissPrivacy(page);

      // The header is above-the-fold chrome: it must keep its height once the
      // first paint has happened. It used to be lazily mounted 1.2s late and
      // grew from 105px to 280px, moving the whole page down.
      const header = page.getByTestId('universal-marketplace-header');
      const initialHeight = (await header.boundingBox())?.height ?? 0;
      expect(initialHeight).toBeGreaterThan(0);

      await page.waitForTimeout(2500);

      const afterHeight = (await header.boundingBox())?.height ?? 0;
      expect(Math.abs(afterHeight - initialHeight), 'header height after load')
        .toBeLessThanOrEqual(2);

      const measured = await page.evaluate(() => {
        const w = window as unknown as { __cls: number; __shifts: number[] };
        return { cls: Number((w.__cls ?? 0).toFixed(4)), worst: Math.max(0, ...(w.__shifts ?? [0])) };
      });

      // 0.1 is the "good" Core Web Vitals boundary. The measured value before
      // the header fix was 0.28; the remaining shift is the announcement rail
      // inserting its own content, so the budget leaves headroom for that.
      expect(measured.cls, `cumulative layout shift (worst single shift ${measured.worst.toFixed(4)})`)
        .toBeLessThanOrEqual(0.1);
    });

    for (const route of MODULE_ROUTES) {
      test(`${route} has no in-flow horizontal overflow`, async ({ page }) => {
        await boot(page, route);
        await dismissPrivacy(page);

        const report = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const clipped: string[] = [];
          // An element inside a fixed overlay, or one clipped by an ancestor,
          // cannot widen the document: a decorative SVG deliberately drawn
          // past its frame is not a layout defect. The scroll-width assertion
          // below stays the authoritative page-level check.
          const containedAncestor = (element: Element): boolean => {
            let node: Element | null = element;
            while (node) {
              const style = getComputedStyle(node);
              if (style.position === 'fixed') return true;
              if (/(hidden|clip)/.test(style.overflowX)) return true;
              node = node.parentElement;
            }
            return false;
          };
          const scrollableAncestor = (element: Element): boolean => {
            let node: Element | null = element.parentElement;
            while (node) {
              const style = getComputedStyle(node);
              if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 2) return true;
              node = node.parentElement;
            }
            return false;
          };
          for (const element of Array.from(document.querySelectorAll('body *'))) {
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.right <= width + 2 && rect.left >= -2) continue;
            if (containedAncestor(element) || scrollableAncestor(element)) continue;
            const name = element.tagName.toLowerCase();
            const text = (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
            clipped.push(`${name} "${text}" [${Math.round(rect.left)}..${Math.round(rect.right)}]`);
            if (clipped.length >= 6) break;
          }
          return {
            clipped,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: width,
          };
        });

        expect(report.scrollWidth, 'document scroll width').toBeLessThanOrEqual(report.clientWidth + 2);
        expect(report.clipped, `in-flow elements past the viewport: ${report.clipped.join(' | ')}`).toHaveLength(0);
      });
    }
  });
}
