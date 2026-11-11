import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

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
const RACE_COURSE_ID = process.env.E2E_RACE_COURSE_ID || '';
const PHASE_TWO = process.env.E2E_PHASE_TWO === '1';
const BATCH_TITLE = process.env.E2E_BATCH_TITLE || 'E2E Weekend Algebra';

// First dev-middleware paint compiles the shell; allow for that plus retries.
test.setTimeout(180_000);

type SessionRole = 'provider' | 'admin' | 'customer' | 'customerB';

async function signIn(page: Page, role: SessionRole) {
  const session = SESSIONS[role];
  if (!session?.token || !session?.user) throw new Error(`missing E2E session for ${role}`);
  await page.addInitScript(
    ({ token, user }) => {
      window.localStorage.setItem('bos_session_token_v1', token);
      window.localStorage.setItem('bos_google_auth_user_v1', user);
    },
    { token: session.token, user: JSON.stringify(session.user) },
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
    await page.goto('/#provider', { waitUntil: 'domcontentloaded' });
    try {
      await expect(manager).toBeVisible({ timeout: 12_000 });
      return manager;
    } catch (error) {
      if (attempt < 3) {
        await page.waitForTimeout(1_500 * attempt);
        continue;
      }
      const diagnostics = await page
        .evaluate(async () => {
          const me: any = await fetch('/api/auth/me')
            .then((response) => response.json())
            .catch((cause) => ({ error: String(cause) }));
          return {
            hash: window.location.hash,
            serverRole: me?.user?.role ?? me?.claims?.role ?? null,
            authenticated: me?.authenticated ?? null,
          };
        })
        .catch((cause) => ({ diagnosticsError: String(cause) }));
      throw new Error(
        `provider portal did not mount after ${attempt} attempts: ${JSON.stringify(diagnostics)}`,
      );
    }
  }
  throw new Error('provider portal did not mount');
}

async function openClasses(page: Page) {
  await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Classes & Training' })).toBeVisible({ timeout: 30_000 });
}

async function openCourseEnrollment(page: Page, title = COURSE_TITLE) {
  // Classes is locked to the Style 3 surface. Its card is an article with a
  // "View Details" action; the legacy "View <title>" button is kept as a
  // fallback so the helper still follows a mounted legacy surface.
  const style3Card = page.getByRole('article', { name: `Course listing ${title}` });
  const style3View = style3Card.getByRole('button', { name: /View Details/i });
  const legacyView = page.getByRole('button', { name: `View ${title}` });
  await style3View.or(legacyView).first().click();
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

  test('an unauthenticated visitor cannot enroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await openClasses(page);
    await openCourseEnrollment(page);
    await page.getByRole('radio').first().click();
    await confirmEnrollment(page);
    await expect(page.getByRole('alert')).toContainText(/sign in with google/i, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Close enrollment' }).click();
    await closeCourseDetail(page);
  });

  test('concurrent browsers cannot both take the last seat', async ({ browser, request }) => {
    const providerToken = SESSIONS.provider.token;
    const adminToken = SESSIONS.admin.token;
    const created = await request.post(`/api/provider/classes/listings/${RACE_COURSE_ID}/batches`, {
      headers: { Authorization: `Bearer ${providerToken}`, 'Content-Type': 'application/json' },
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
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      data: { decision: 'active', reason: 'E2E race setup verified' },
    });
    expect(reviewed.status(), await reviewed.text()).toBe(200);

    const open = async (role: SessionRole) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await signIn(page, role);
      await boot(page);
      await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Classes & Training' })).toBeVisible({ timeout: 30_000 });
      const raceTitle = process.env.E2E_RACE_COURSE_TITLE || 'E2E Race Course';
      const raceCard = page.getByRole('article', { name: `Course listing ${raceTitle}` });
      await raceCard.getByRole('button', { name: /View Details/i }).click();
      await expect(page.getByRole('heading', { name: raceTitle }).last()).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Enroll Now', exact: true }).click();
      await expect(page.getByRole('dialog', { name: raceTitle }).last()).toBeVisible({ timeout: 15_000 });
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
      const token = localStorage.getItem('bos_session_token_v1') || '';
      const response = await fetch('/api/classes/enrollments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
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
