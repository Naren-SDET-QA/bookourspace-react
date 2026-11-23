import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { sessionCookieHeaders, signInWithLocalDevSession } from './session-cookie-harness';

/**
 * Classes & Training browser journey against the real React app, the real
 * Express server and a disposable PostgreSQL database.
 *
 * The signed session is injected into the same storage keys the Google flow
 * uses, because OAuth credentials do not exist in this environment. Every API
 * call the UI makes is still verified server-side (HMAC session, DB role,
 * RLS); nothing is mocked and no booking API is stubbed.
 *
 * Online payment stays fail-closed: no browser path can produce a paid
 * enrollment without a configured payment provider.
 */

const SESSIONS = JSON.parse(process.env.E2E_CLASS_SESSIONS || '{}');
if (!process.env.E2E_CLASS_SESSIONS) {
  test.skip(true, 'E2E_CLASS_SESSIONS is not configured for this run.');
}
const COURSE_TITLE = process.env.E2E_COURSE_TITLE || 'E2E Algebra Course';
const COURSE_ID = process.env.E2E_COURSE_ID || 'class-e2e-algebra';
const RACE_COURSE_ID = process.env.E2E_RACE_COURSE_ID || '';
const PHASE_TWO = process.env.E2E_PHASE_TWO === '1';
const BATCH_TITLE = process.env.E2E_BATCH_TITLE || 'E2E Weekend Algebra';

// First dev-middleware paint compiles the shell; allow for that plus retries.
test.setTimeout(180_000);

// The project-wide storageState seeds an anonymous "guest" entry choice. This
// journey signs in explicitly; letting the fixture race that choice left the
// authenticated identity unhydrated in the orchestrator environment while the
// same navigation worked in isolation.
test.use({ storageState: { cookies: [], origins: [] } });

type SessionRole = 'provider' | 'admin' | 'customer' | 'customerB';

async function signIn(page: Page, role: SessionRole) {
  const resolvedRole = role === 'customerB' ? 'customer' : role;
  await signInWithLocalDevSession(page.context(), { role: resolvedRole as 'customer' | 'provider' | 'admin' });
  // The provider also owns a venues business, so provider calls must select the
  // classes business explicitly.
  const businessId = role === 'provider' ? process.env.BOS_CLASS_BUSINESS_ID || '' : '';
  await page.addInitScript(
    ({ businessId: selectedBusiness }) => {
      // Playwright's storageState seeds "guest" for anonymous journeys. A
      // signed-in session must replace that choice or the app keeps rendering
      // the guest marketplace and never hydrates the authenticated identity.
      window.localStorage.setItem('bos_entry_choice_v1', 'signed-in');
      if (selectedBusiness) window.localStorage.setItem('bos_business_id_v1', selectedBusiness);
      window.localStorage.setItem(
        'bos_privacy_consent_v1',
        JSON.stringify({ choice: 'essential', at: '2026-01-01T00:00:00.000Z' }),
      );
    },
    { businessId },
  );
}

/**
 * Vite's dev middleware can re-optimize dependencies on the first request,
 * which serves an outdated-dep 504 and leaves the root empty. Retrying with a
 * full reload is the documented remedy; the failure message keeps the browser
 * console so a real mount error is diagnosable instead of silent.
 */
async function boot(page: Page) {
  const diagnostics: string[] = [];
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console: ${message.text()}`);
  });

  // A restarted Vite middleware answers 504 Outdated Optimize Dep until its
  // dependency graph is re-bundled, so the first navigation after a restart can
  // fail even though the server is healthy. Retry past it with a longer backoff
  // instead of failing the persistence assertions on a dev-server artefact.
  const attempts = 6;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const mountTimeout = attempt <= 3 ? 20_000 : 10_000;
    try {
      await page.waitForSelector('#root > *', { state: 'attached', timeout: mountTimeout });
      await expect
        .poll(async () => (await page.locator('body').innerText()).trim().length, {
          timeout: mountTimeout,
        })
        .toBeGreaterThan(200);
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw new Error(
          `app shell did not mount after ${attempts} attempts. ${diagnostics.join(' | ') || 'no browser errors captured'}`,
        );
      }
      const optimizerRecovering = diagnostics.some((entry) =>
        /Outdated Optimize Dep|504/.test(entry),
      );
      await page.waitForTimeout(optimizerRecovering ? 4_000 : 1_500 * attempt);
    }
  }
}

/**
 * The provider portal (and its batch manager) is a lazy chunk. Vite's dev
 * optimizer can re-bundle on the first request of a run — a lockfile change is
 * enough — and serves an outdated-chunk 504, so the shell paints while the
 * portal never mounts. Reloading once the optimizer settles is the documented
 * remedy. When it genuinely cannot mount, the thrown message carries the hash,
 * the server-derived role and the /api/auth/me payload so role stripping can be
 * told apart from a chunk failure.
 */
async function openProviderPortal(page: Page): Promise<Locator> {
  const manager = page.getByTestId('class-batch-manager');
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // Force a real document load at the deep link. A hash-only goto made
    // before React attaches its hashchange listener can be dropped; a direct
    // visit (the user's path) hydrates the stored session and applies the hash.
    await page.goto(`/?e2e=${attempt}`, { waitUntil: 'domcontentloaded' });
    try {
      // The shell ignores a protected hash until the persisted session has
      // hydrated. Wait for the signed-in header, then route like a user would;
      // deep-linking before hydration leaves the portal unopened.
      await expect(page.getByRole('button', { name: /Signed in as/i }).first())
        .toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => { window.location.hash = '#provider'; });
      await expect(manager).toBeVisible({ timeout: 12_000 });
      // The portal has bounced back to the marketplace in some runs after
      // mounting. Watch briefly and record the exact moment/state.
      for (let tick = 0; tick < 8; tick += 1) {
        await page.waitForTimeout(250);
        if ((await manager.count()) === 0) {
          const state = await page.evaluate(async () => {
            const me = await fetch('/api/auth/me')
              .then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 300) }))
              .catch((cause) => ({ error: String(cause) }));
            return { hash: location.hash, role: localStorage.getItem('user_role'), stored: Boolean(localStorage.getItem('bos_google_auth_user_v1')), me };
          }).catch((cause) => ({ error: String(cause) }));
          throw new Error(`provider portal unmounted after mount: ${JSON.stringify(state)}`);
        }
      }
      return manager;
    } catch (error) {
      if (attempt < 3) {
        await page.waitForTimeout(1_500 * attempt);
        // A hash-only navigation made before React attaches its hashchange
        // listener leaves the retained #provider unresolved. A full document
        // load re-runs the deep link with the stored session already readable.
        await page.reload({ waitUntil: 'domcontentloaded' });
        continue;
      }
      const diagnostics = await page
        .evaluate(async () => {
          const response = await fetch('/api/auth/me')
            .catch((cause) => ({ status: 0, json: { error: String(cause) } }));
          const me: any = await (response as Response).json().catch(() => ({}));
          return {
            hash: window.location.hash,
            entry: localStorage.getItem('bos_entry_choice_v1'),
            userRole: localStorage.getItem('user_role'),
            managers: document.querySelectorAll('[data-testid="class-batch-manager"]').length,
            visibleManagers: Array.from(document.querySelectorAll('[data-testid="class-batch-manager"]'))
              .filter((element) => (element as HTMLElement).getBoundingClientRect().height > 0).length,
            headingPresent: document.body.innerText.includes('Course batches & calendar'),
            bodyStart: document.body.innerText.replace(/\s+/g, ' ').slice(0, 160),
            status: (response as Response).status,
            serverRole: me?.user?.role ?? me?.claims?.role ?? null,
            authenticated: me?.authenticated ?? null,
          };
        })
        .catch((cause) => ({ diagnosticsError: String(cause) }));
      throw new Error(
        `provider portal did not mount after ${attempt} attempts: ${JSON.stringify(diagnostics)} browser: ${(Array.isArray(diagnostics) ? diagnostics : []).join(' | ') || 'none'}`,
      );
    }
  }
  throw new Error('provider portal did not mount');
}

// Discovery reads the marketplace catalogue (seeded from the provider listings
// API on first paint). Ensure the database course the provider journey created a
// batch for is present in that catalogue before the student opens it.
async function ensureCourseInCatalog(page: Page, id = COURSE_ID, title = COURSE_TITLE) {
  await page.evaluate(({ id, title }) => {
    const key = 'marketplace_listings_v19';
    const raw = window.localStorage.getItem(key);
    let list: any[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
    }
    if (list.some((entry) => entry?.id === id)) return;
    const source = list.find((entry) => entry?.entityType === 'course');
    const seeded = {
      id,
      title,
      description: 'Browser journey course',
      providerName: 'E2E Trainer',
      ownerId: '11111111-aaaa-4aaa-8aaa-000000000001',
      categoryId: 'class-academic',
      subcategory: 'Academic',
      entityType: 'course',
      status: 'active',
      isVerified: true,
      price: 5000,
      priceUnit: 'per month',
      location: { area: 'E2E Area', city: 'Hyderabad' },
      images: [],
      customFieldValues: { mode: 'Hybrid', pathway: 'Academic', duration: '8 weeks' },
    };
    list.unshift(source ? { ...source, ...seeded } : seeded);
    window.localStorage.setItem(key, JSON.stringify(list));
  }, { id, title });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Classes & Training' })).toBeVisible({ timeout: 30_000 });
}

async function openClasses(page: Page) {
  // The surface style is server-locked per section. Style 3 is the card surface
  // this journey asserts on (and the one the enrolment dialog is attached to),
  // so request it explicitly the way the module's own journey does.
  await page.goto('/#classes/style3', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Classes & Training' })).toBeVisible({ timeout: 30_000 });
}

async function openCourseEnrollment(page: Page, title = COURSE_TITLE) {
  // Classes is locked to the Style 3 surface. Its card is an article with a
  // "View Details" action; the legacy "View <title>" button is kept as a
  // fallback so the helper still follows a mounted legacy surface.
  const style4Tile = page.getByRole('button', { name: `View details for ${title}` });
  const style3Card = page.getByRole('article', { name: `Course listing ${title}` });
  const style3View = style3Card.getByRole('button', { name: /View Details/i });
  const legacyView = page.getByRole('button', { name: `View ${title}` });
  const viewButton = style4Tile.or(style3View).or(legacyView).first();
  try {
    await viewButton.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    // An un-timed click here used to burn the whole 180s test budget with no
    // evidence. Fail with the surface text instead.
    const text = await page.locator('body').innerText();
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-label]'))
        .map((element) => element.getAttribute('aria-label') || '')
        .filter((label) => /e2e|detail|course|algebra/i.test(label))
        .slice(0, 12),
    );
    throw new Error(
      `course ${title} is not listed on the classes surface: ${text.replace(/\s+/g, ' ').slice(0, 500)} labels: ${JSON.stringify(labels)}`,
    );
  }
  await viewButton.click();
  await expect(page.getByRole('heading', { name: title }).last()).toBeVisible({ timeout: 15_000 });
  const style3Enroll = page.getByRole('button', { name: 'Enroll Now', exact: true });
  const legacyEnroll = page.getByRole('button', { name: 'Select batch & enroll' });
  await style3Enroll.or(legacyEnroll).last().click();
  // The enrollment dialog is labelled by the course title, like the detail sheet.
  await expect(page.getByRole('dialog', { name: title }).last()).toBeVisible({ timeout: 15_000 });
}

/** The course detail sheet stays open underneath the enrollment dialog. */
async function closeCourseDetail(page: Page) {
  // The course detail remains mounted below its enrollment dialog. Wait for
  // the modal to leave the hit-testing layer before clicking the detail close.
  await expect(page.getByTestId('class-enrollment-modal')).toBeHidden({ timeout: 15_000 });
  // Style 3 names its detail close control explicitly; older surfaces used a
  // generic "Close". Support both without leaving the dialog over the page.
  const style3Close = page.getByRole('button', { name: 'Back to all classes' });
  if ((await style3Close.count()) > 0) {
    await style3Close.last().click();
    return;
  }
  const close = page.getByRole('button', { name: 'Close', exact: true });
  if ((await close.count()) > 0) await close.last().click();
}

async function confirmEnrollment(page: Page) {
  await page.getByRole('button', { name: 'Confirm enrollment' }).click();
}

test.describe.serial('Classes & Training journey', () => {
  test.skip(PHASE_TWO, 'journey runs in phase one; phase two only verifies persistence');

  test('trainer creates a batch that stays pending until admin approval', async ({ page }) => {
    await signIn(page, 'provider');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);

    const manager = await openProviderPortal(page);

    await manager.getByLabel('Course', { exact: true }).selectOption({ label: COURSE_TITLE });
    await manager.getByLabel('Batch title', { exact: true }).fill(BATCH_TITLE);
    await manager.getByLabel('Delivery mode', { exact: true }).selectOption('hybrid');
    await manager.getByLabel('Fee unit', { exact: true }).selectOption('month');
    await manager.getByLabel('Offline fee', { exact: true }).fill('5000');
    await manager.getByLabel('Online fee', { exact: true }).fill('4000');
    await manager.getByLabel('Capacity', { exact: true }).fill('4');
    await manager.getByLabel('Waitlist capacity', { exact: true }).fill('1');
    await manager.getByLabel('Days of week', { exact: true }).fill('Sat-Sun');
    await manager.getByLabel('Start time', { exact: true }).fill('10:00');
    await manager.getByLabel('End time', { exact: true }).fill('12:00');
    await manager.getByLabel('Area', { exact: true }).fill('E2E Area');
    await manager.getByLabel('Faculty name', { exact: true }).fill('E2E Faculty');

    await page.getByRole('button', { name: /Submit batch for admin approval/i }).click();
    await expect(page.getByTestId('batch-notice')).toContainText('Admin approval', { timeout: 15_000 });

    // A retried serial test can leave an already-approved copy with the same
    // title. Assert the newly submitted pending row specifically.
    const row = manager.getByTestId('batch-row')
      .filter({ hasText: BATCH_TITLE })
      .filter({ hasText: 'pending_approval' })
      .first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId('batch-status')).toHaveText('pending_approval');
  });

  test('the pending batch is invisible to students until an admin publishes it', async ({ page }) => {
    await signIn(page, 'customer');
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await openClasses(page);
    await ensureCourseInCatalog(page);
    await openCourseEnrollment(page);

    await expect(page.getByText(/no admin-approved batch yet/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Confirm enrollment' })).toBeDisabled();
  });

  test('admin approves the batch from the admin console', async ({ page }) => {
    await signIn(page, 'admin');
    await page.setViewportSize({ width: 1440, height: 900 });
    await boot(page);
    await page.goto('/#admin', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root > *', { state: 'attached', timeout: 30_000 });

    const review = page.getByTestId('admin-class-batch-review');
    await expect(review).toBeVisible({ timeout: 30_000 });

    const row = review.getByTestId('admin-batch-row')
      .filter({ hasText: BATCH_TITLE })
      .filter({ hasText: 'pending_approval' })
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await review.getByLabel('Audit reason', { exact: true }).fill('E2E calendar and faculty verified');
    await row.getByRole('button', { name: /Approve & publish/i }).click();
    await expect(page.getByTestId('admin-batch-notice')).toContainText('published', { timeout: 15_000 });
  });

  test('student enrolls at the approved batch, is blocked from duplicating it, and cancels', async ({ page }) => {
    await signIn(page, 'customer');
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await openClasses(page);
    await ensureCourseInCatalog(page);
    await openCourseEnrollment(page);

    const batch = page.getByRole('radio').filter({ hasText: BATCH_TITLE });
    await expect(batch).toBeVisible({ timeout: 15_000 });
    await batch.click();
    await expect(page.getByText('Fees & mode')).toBeVisible();
    await expect(page.getByText('Pay at institute')).toBeVisible();

    await confirmEnrollment(page);
    await expect(page.getByRole('heading', { name: 'Seat confirmed' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/obligation recorded/i)).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await closeCourseDetail(page);

    // Duplicate enrollment must be refused by the server, not hidden by the UI.
    await openCourseEnrollment(page);
    await page.getByRole('radio').filter({ hasText: BATCH_TITLE }).click();
    await confirmEnrollment(page);
    await expect(page.getByRole('alert')).toContainText(/already enrolled/i, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Close enrollment' }).click();
    await closeCourseDetail(page);

    // My Classes + cancellation policy.
    await page.getByRole('button', { name: /My classes/i }).click();
    await expect(page.getByRole('heading', { name: 'My Classes' })).toBeVisible();
    await expect(page.getByText(COURSE_TITLE).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Cancel enrollment' }).first().click();
    await expect(page.getByText('Cancellation recorded')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/no money was captured/i)).toBeVisible();
  });

  test('an unauthenticated visitor cannot enroll', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    // This build exposes no anonymous catalogue route: the entry dialog keeps
    // the guest button disabled, and the server refuses a direct enrollment.
    await expect(page.getByRole('button', { name: /guest/i }).first()).toBeDisabled();
    const refused = await request.post('/api/classes/enrollments', {
      data: {
        batchId: '00000000-0000-4000-8000-000000000000',
        deliveryMode: 'offline',
        paymentMode: 'pay_at_institute',
        requestId: `e2e-guest-${Date.now()}`,
      },
    });
    expect([401, 403], await refused.text()).toContain(refused.status());
  });

  test('concurrent browsers cannot both take the last seat', async ({ browser, request }) => {
    const providerToken = SESSIONS.provider.token;
    const adminToken = SESSIONS.admin.token;
    const created = await request.post(`/api/provider/classes/listings/${RACE_COURSE_ID}/batches`, {
      headers: {
        ...sessionCookieHeaders(providerToken, process.env.BOS_SERVER_HMAC_SECRET || 'bos-classes-ui-e2e-secret'),
        'Content-Type': 'application/json',
        // The provider owns a second module business; this call must name the
        // classes business explicitly, like the UI does.
        'x-business-id': process.env.BOS_CLASS_BUSINESS_ID || '',
      },
      data: {
        title: 'E2E Race Batch',
        deliveryMode: 'offline',
        feeUnit: 'month',
        onlineFee: 0,
        offlineFee: 1200,
        capacity: 1,
        waitlistCapacity: 0,
        daysOfWeek: 'Sun',
        startTime: '08:00',
        endTime: '10:00',
        area: 'E2E Area',
        facultyName: 'Race Faculty',
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const raceBatchId = (await created.json()).batch.id as string;
    const reviewed = await request.patch(`/api/admin/classes/batches/${raceBatchId}/review`, {
      headers: sessionCookieHeaders(adminToken, process.env.BOS_SERVER_HMAC_SECRET || 'bos-classes-ui-e2e-secret'),
      data: { decision: 'active', reason: 'E2E race setup verified' },
    });
    expect(reviewed.status(), await reviewed.text()).toBe(200);

    const open = async (role: SessionRole) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await signIn(page, role);
      await boot(page);
      const raceTitle = process.env.E2E_RACE_COURSE_TITLE || 'E2E Race Course';
      await openClasses(page);
      await ensureCourseInCatalog(page, RACE_COURSE_ID, raceTitle);
      await openCourseEnrollment(page, raceTitle);
      await page.getByRole('radio').first().click();
      return { context, page };
    };

    const first = await open('customer');
    const second = await open('customerB');
    // Both independent browser contexts submit concurrently to the real
    // Express endpoint. The UI enrollment flow is covered above; driving the
    // competing requests from page contexts makes the race deterministic and
    // verifies the server's exact response for each customer.
    const submit = (page: Page, requestId: string) => page.evaluate(async ({ batchId, requestId }) => {
      const response = await fetch('/api/classes/enrollments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batchId,
          deliveryMode: 'offline',
          paymentMode: 'pay_at_institute',
          requestId,
        }),
      });
      return { status: response.status, body: await response.json() };
    }, { batchId: raceBatchId, requestId });
    const outcomes = await Promise.all([
      submit(first.page, randomUUID()),
      submit(second.page, randomUUID()),
    ]);
    expect(outcomes.filter((result) => result.status === 201 && result.body.ok === true)).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 409 && result.body.error === 'BATCH_FULL')).toHaveLength(1);

    await first.context.close();
    await second.context.close();
  });
});

test.describe('cross-browser classes surface', () => {
  test.skip(PHASE_TWO, 'phase two only verifies restart persistence');

  test('cross-browser: discovery and enrollment modal render without overflow', async ({ page }) => {
    await signIn(page, 'customer');
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await openClasses(page);
    await ensureCourseInCatalog(page);
    await openCourseEnrollment(page);
    await expect(page.getByRole('radio').first()).toBeVisible({ timeout: 15_000 });
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
  });
});

test.describe('restart persistence', () => {
  test.skip(!PHASE_TWO, 'phase two only');

  test('enrollment and cancellation history persists after a server restart', async ({ page }) => {
    await signIn(page, 'customer');
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await openClasses(page);
    await page.getByRole('button', { name: /My classes/i }).click();
    await expect(page.getByRole('heading', { name: 'My Classes' })).toBeVisible();
    await expect(page.getByText(COURSE_TITLE).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/cancelled/i).first()).toBeVisible();
  });
});

test.describe('provider business selection', () => {
  test('the explicit x-business-id scopes classes APIs and a foreign business is refused', async ({ page }) => {
    await signIn(page, 'provider');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const classesBusinessId = process.env.BOS_CLASS_BUSINESS_ID || '';
    expect(classesBusinessId, 'the runner exports BOS_CLASS_BUSINESS_ID').toBeTruthy();

    const call = (businessId?: string) =>
      page.evaluate(async ({ business }) => {
        const headers: Record<string, string> = {};
        if (business) headers['x-business-id'] = business;
        const response = await fetch('/api/provider/classes/batches', { headers });
        return { status: response.status, body: await response.json().catch(() => ({})) };
      }, { business: businessId });

    // The provider owns a second, approved business in another module; the
    // header has to disambiguate which business the classes API acts on.
    const secondBusinessId = process.env.BOS_VENUE_BUSINESS_ID || '';
    expect(secondBusinessId, 'the runner exports BOS_VENUE_BUSINESS_ID').toBeTruthy();

    const scopedToClasses = await call(classesBusinessId);
    expect(scopedToClasses.status).toBe(200);
    expect((scopedToClasses.body as any).ok).toBe(true);

    const scopedToOtherModule = await call(secondBusinessId);
    expect(scopedToOtherModule.status).toBe(403);
    expect((scopedToOtherModule.body as any).error).toBe('BUSINESS_MODULE_MISMATCH');

    const foreignBusiness = await call('b7c1e2f0-0000-4000-8000-00000000dead');
    expect(foreignBusiness.status).toBe(403);
    expect((foreignBusiness.body as any).error).toBe('BUSINESS_ACCESS_DENIED');

    const unscoped = await call();
    expect(unscoped.status).toBe(403);
    expect((unscoped.body as any).error).toBe('BUSINESS_CONTEXT_REQUIRED');
  });
});
