import { expect, test, type Browser, type Locator, type Page, type ViewportSize } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  COURSE_ID,
  USERS,
  sessionToken,
  startClassesHarness,
  type ClassesHarness,
} from './classes-e2e-harness';

/**
 * Real browser → real Express → disposable PostgreSQL Classes journey.
 *
 * Every booking response comes from the Express API and PostgreSQL functions.
 * No /api/classes/* response is mocked, stubbed or intercepted with a fixture.
 * Firefox/WebKit run only when their Playwright binaries are installed.
 */

type TestUser = (typeof USERS)[keyof typeof USERS];

const DESKTOP: ViewportSize = { width: 1440, height: 900 };
const VIEWPORTS = [
  { name: 'mobile portrait 390×844', width: 390, height: 844 },
  { name: 'tablet portrait 834×1112', width: 834, height: 1112 },
  { name: 'desktop 1440×900', width: 1440, height: 900 },
];

const tokens = {
  provider: sessionToken(USERS.provider),
  customerA: sessionToken(USERS.customerA),
  customerB: sessionToken(USERS.customerB),
  customerC: sessionToken(USERS.customerC),
  admin: sessionToken(USERS.admin),
  otherProvider: sessionToken(USERS.otherProvider),
};

let harness: ClassesHarness;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  harness = await startClassesHarness();
});

test.afterAll(async () => {
  test.setTimeout(90_000);
  await harness?.stop();
});

function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function authUserFor(user: TestUser) {
  return {
    id: user.authId,
    googleSub: `google-${user.authId}`,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: 'active',
    verified: true,
    city: 'Hyderabad',
    joinedAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    totalBookings: 0,
    totalListings: 0,
    walletBalance: 0,
    authProvider: 'google',
  };
}

async function newPage(
  browser: Browser,
  user: TestUser,
  viewport: ViewportSize = DESKTOP,
): Promise<{ page: Page; pageErrors: string[]; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ token, storedUser }) => {
      try {
        localStorage.setItem('bos_session_token_v1', token);
        localStorage.setItem('bos_google_auth_user_v1', JSON.stringify(storedUser));
      } catch {
        // Ignore storage failures on non-origin documents.
      }
    },
    { token: sessionToken(user), storedUser: authUserFor(user) },
  );
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // The UI origin proxies /api to the real Express server. External resources
  // are blocked so the test cannot depend on the network or a CDN.
  await page.route('**/*', async (route) => {
    const target = new URL(route.request().url());
    if (target.origin === harness.uiUrl) {
      if (target.pathname.startsWith('/api/')) {
        const upstream = await route.fetch({
          url: `${harness.apiUrl}${target.pathname}${target.search}`,
        });
        await route.fulfill({ response: upstream });
      } else {
        await route.continue();
      }
      return;
    }
    await route.abort('blockedbyclient');
  });
  return {
    page,
    pageErrors,
    close: async () => {
      // Let in-flight route handlers finish against their owned API context
      // before disposing the browser context; otherwise a late route.fetch()
      // can fail with "Request context disposed" during cleanup.
      await page.unrouteAll({ behavior: 'wait' });
      await context.close();
    },
  };
}

async function openClasses(page: Page): Promise<void> {
  await page.goto(`${harness.uiUrl}/#classes`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Classes & Training' })).toBeVisible({ timeout: 30_000 });
}

async function api(
  method: string,
  url: string,
  token: string | null,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: any }> {
  const response = await fetch(`${harness.apiUrl}${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

async function createApprovedBatch(
  overrides: Record<string, unknown> = {},
  listingId = COURSE_ID,
): Promise<any> {
  const created = await api('POST', `/api/provider/classes/listings/${listingId}/batches`, tokens.provider, {
    title: `Batch ${Date.now()}`,
    deliveryMode: 'hybrid',
    feeUnit: 'month',
    onlineFee: 4000,
    offlineFee: 5000,
    capacity: 2,
    waitlistCapacity: 0,
    startDate: futureDate(30),
    endDate: futureDate(120),
    daysOfWeek: 'Mon-Fri',
    startTime: '18:00',
    endTime: '20:00',
    timezone: 'Asia/Kolkata',
    durationLabel: '8 weeks',
    area: 'Madhapur',
    facultyName: 'Dr. Meera Rao',
    facultyExperience: '12 years',
    holidays: [{ date: futureDate(40) }],
    exams: [{ date: futureDate(60) }],
    ...overrides,
  });
  expect(created.status, `create batch: ${JSON.stringify(created.data)}`).toBe(201);
  const approved = await api(
    'PATCH',
    `/api/admin/classes/batches/${created.data.batch.id}/review`,
    tokens.admin,
    { decision: 'active', reason: 'Browser E2E calendar and faculty verified' },
  );
  expect(approved.status, `approve batch: ${JSON.stringify(approved.data)}`).toBe(200);
  return created.data.batch;
}

function courseCard(page: Page) {
  return page.getByRole('article').filter({ hasText: 'E2E Algebra Mastery' });
}

async function openCourseDetail(page: Page) {
  await page.getByLabel('Search courses').fill('E2E Algebra Mastery');
  await expect(courseCard(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'View E2E Algebra Mastery' }).click();
  const detail = page.getByTestId('class-detail-modal');
  await expect(detail).toBeVisible({ timeout: 15_000 });
  return detail;
}

async function openEnrollment(page: Page, detail: Locator) {
  await detail.getByRole('button', { name: 'Select batch & enroll' }).click();
  const enrollment = page.getByTestId('class-enrollment-modal');
  await expect(enrollment).toBeVisible({ timeout: 15_000 });
  return enrollment;
}

async function enrollInUi(
  page: Page,
  title: string,
  mode: 'online' | 'offline' = 'offline',
) {
  const detail = await openCourseDetail(page);
  const enrollment = await openEnrollment(page, detail);
  const radio = enrollment.getByRole('radio').filter({ hasText: title });
  await expect(radio).toBeVisible({ timeout: 15_000 });
  await radio.click();
  if (mode === 'online') {
    await enrollment.getByRole('radio', { name: 'online', exact: true }).click();
  }
  await enrollment.getByRole('button', { name: 'Confirm enrollment' }).click();
  return { detail, enrollment };
}

async function noHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${label}: scrollWidth ${overflow.scrollWidth} vs clientWidth ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 2);
}

test('trainer creates a batch, admin approves it, student enrolls, duplicate is refused and cancellation persists', async ({ browser }) => {
  test.setTimeout(180_000);
  // Trainer uses the real provider portal (the app deliberately redirects a
  // provider away from the public marketplace shell).
  const trainer = await newPage(browser, USERS.provider);
  await trainer.page.goto(`${harness.uiUrl}/`, { waitUntil: 'domcontentloaded' });
  const providerHub = trainer.page.getByRole('button', { name: 'Provider Hub', exact: true });
  await expect(providerHub).toBeVisible({ timeout: 30_000 });
  await providerHub.click();
  const trainerPanel = trainer.page.getByTestId('class-batch-manager');
  await expect(trainerPanel).toBeVisible({ timeout: 30_000 });

  await trainerPanel.getByLabel('Course', { exact: true }).selectOption({ label: 'E2E Algebra Mastery' });
  await trainerPanel.getByLabel('Batch title', { exact: true }).fill('Weekday Evening Batch');
  await trainerPanel.getByLabel('Delivery mode', { exact: true }).selectOption('hybrid');
  await trainerPanel.getByLabel('Fee unit', { exact: true }).selectOption('month');
  await trainerPanel.getByLabel('Online fee', { exact: true }).fill('4000');
  await trainerPanel.getByLabel('Offline fee', { exact: true }).fill('5000');
  await trainerPanel.getByLabel('Capacity', { exact: true }).fill('2');
  await trainerPanel.getByLabel('Waitlist capacity', { exact: true }).fill('1');
  await trainerPanel.getByLabel('Start date', { exact: true }).fill(futureDate(30));
  await trainerPanel.getByLabel('End date', { exact: true }).fill(futureDate(120));
  await trainerPanel.getByLabel('Days of week', { exact: true }).fill('Mon-Fri');
  await trainerPanel.getByLabel('Start time', { exact: true }).fill('18:00');
  await trainerPanel.getByLabel('End time', { exact: true }).fill('20:00');
  await trainerPanel.getByLabel('Duration', { exact: true }).fill('8 weeks');
  await trainerPanel.getByLabel('Area', { exact: true }).fill('Madhapur');
  await trainerPanel.getByLabel('Faculty name', { exact: true }).fill('Dr. Meera Rao');
  await trainerPanel.getByLabel('Faculty experience', { exact: true }).fill('12 years');
  await trainerPanel.getByLabel('Holiday dates', { exact: true }).fill(futureDate(40));
  await trainerPanel.getByLabel('Exam dates', { exact: true }).fill(futureDate(60));
  await trainerPanel.getByRole('button', { name: 'Submit batch for admin approval' }).click();

  await expect(trainerPanel.getByTestId('batch-notice')).toContainText('Admin approval');
  const createdCard = trainerPanel.getByTestId('batch-row').filter({ hasText: 'Weekday Evening Batch' });
  await expect(createdCard).toBeVisible();
  await expect(createdCard.getByTestId('batch-status')).toHaveText('pending_approval');
  await expect(createdCard).toContainText('Mon-Fri');
  await expect(createdCard).toContainText('18:00–20:00');
  await expect(createdCard).toContainText('1 holidays · 1 exams');
  await expect(createdCard).toContainText(futureDate(30));
  await expect(createdCard).toContainText(futureDate(120));
  await expect(trainer.pageErrors).toHaveLength(0);
  await trainer.close();

  const pending = await api('GET', `/api/classes/listings/${COURSE_ID}/batches`, null);
  expect(pending.status).toBe(200);
  expect(pending.data.batches, 'an unapproved batch must never be public').toHaveLength(0);
  const providerBatches = await api('GET', '/api/provider/classes/batches', tokens.provider);
  const batchId = providerBatches.data.batches.find((batch: any) => batch.title === 'Weekday Evening Batch')?.id;
  expect(typeof batchId, JSON.stringify(providerBatches.data)).toBe('string');

  // Admin uses the real admin console review queue.
  const admin = await newPage(browser, USERS.admin);
  await admin.page.goto(`${harness.uiUrl}/`, { waitUntil: 'domcontentloaded' });
  const adminConsole = admin.page.locator('footer').getByRole('button', { name: /^Admin\b/i }).first();
  await expect(adminConsole).toBeVisible({ timeout: 30_000 });
  await adminConsole.click();
  const adminPanel = admin.page.getByTestId('admin-class-batch-review');
  await expect(adminPanel).toBeVisible({ timeout: 30_000 });
  const reviewCard = adminPanel.getByTestId('admin-batch-row').filter({ hasText: 'Weekday Evening Batch' });
  await expect(reviewCard.getByTestId('admin-batch-status')).toHaveText('pending_approval');
  await adminPanel.getByLabel('Audit reason', { exact: true }).fill('Faculty and calendar verified');
  await reviewCard.getByRole('button', { name: /Approve & publish/i }).click();
  await expect(adminPanel.getByTestId('admin-batch-notice')).toContainText('published');
  await expect(adminPanel.getByTestId('admin-batch-empty')).toBeVisible();
  await admin.close();

  const publicBatches = await api('GET', `/api/classes/listings/${COURSE_ID}/batches`, null);
  expect(publicBatches.status).toBe(200);
  expect(publicBatches.data.batches).toHaveLength(1);
  expect(publicBatches.data.batches[0].seatsLeft).toBe(2);
  expect(publicBatches.data.batches[0].facultyName).toBe('Dr. Meera Rao');

  const student = await newPage(browser, USERS.customerA);
  await openClasses(student.page);
  await student.page.getByLabel('Search courses').fill('E2E Algebra');
  const card = courseCard(student.page);
  await expect(card).toBeVisible();
  await expect(card).toContainText('1 live batch');
  await expect(card).toContainText('6:00 PM – 8:00 PM');
  await expect(card).toContainText('Hybrid');
  await expect(card).toContainText('Madhapur');
  await expect(card).toContainText('From ₹4,000/month');
  await expect(card).toContainText('2 seats left');

  // Filters are computed from the live PostgreSQL calendar, not demo data.
  await student.page.getByLabel('Mode').selectOption('Online');
  await expect(card).toBeHidden();
  await student.page.getByLabel('Mode').selectOption('Hybrid');
  await expect(card).toBeVisible();
  await student.page.getByLabel('Timing').selectOption('Evening');
  await expect(card).toBeVisible();
  await student.page.getByLabel('Timing').selectOption('Morning');
  await expect(card).toBeHidden();
  await student.page.getByLabel('Timing').selectOption('All');
  await student.page.getByLabel('Fee').selectOption('3k8k');
  await expect(card).toBeVisible();
  await student.page.getByLabel('Fee').selectOption('Free');
  await expect(card).toBeHidden();
  await student.page.getByLabel('Fee').selectOption('All');
  await student.page.getByLabel('Distance').selectOption('Any');
  await student.page.getByLabel('Duration').selectOption('mid');
  await expect(card).toBeVisible();
  await student.page.getByLabel('Duration').selectOption('short');
  await expect(card).toBeHidden();
  await student.page.getByLabel('Duration').selectOption('Any');
  await student.page.getByLabel('Filter by area').fill('Madhapur');
  await expect(card).toBeVisible();
  await student.page.getByLabel('Filter by area').fill('Nowhere');
  await expect(card).toBeHidden();
  await student.page.getByLabel('Filter by area').fill('');

  const detail = await openCourseDetail(student.page);
  await expect(detail).toContainText('Batches & timings');
  await expect(detail).toContainText('Evening · Mon-Fri');
  await expect(detail).toContainText('6:00 PM – 8:00 PM');
  await expect(detail).toContainText('Dr. Meera Rao');
  await expect(detail).toContainText('Seats left: 2');
  await expect(detail).toContainText('8 weeks');

  const enrollment = await openEnrollment(student.page, detail);
  const batchRadio = enrollment.getByRole('radio').filter({ hasText: 'Weekday Evening Batch' });
  await expect(batchRadio).toContainText('2 seats left');
  await enrollment.getByRole('radio', { name: 'online', exact: true }).click();
  await expect(enrollment).toContainText(/online fee/i);
  await expect(enrollment).toContainText(/₹4,000\s*\/\s*month/i);
  await enrollment.getByRole('button', { name: 'Confirm enrollment' }).click();
  await expect(enrollment.getByRole('heading', { name: 'Seat confirmed' })).toBeVisible();
  await expect(enrollment).toContainText('Seat');
  await expect(enrollment).toContainText('#1');
  await expect(enrollment).toContainText(/₹4,000\s*\/\s*month/i);
  await expect(enrollment).toContainText('Pay at institute · obligation recorded');
  await enrollment.getByRole('button', { name: 'Done' }).click();
  await detail.getByRole('button', { name: 'Close', exact: true }).click();

  // Duplicate enrollment is rejected by PostgreSQL, and the UI reports it.
  const duplicateDetail = await openCourseDetail(student.page);
  const duplicateEnrollment = await openEnrollment(student.page, duplicateDetail);
  await duplicateEnrollment.getByRole('button', { name: 'Confirm enrollment' }).click();
  await expect(duplicateEnrollment.getByRole('alert')).toContainText('You are already enrolled in this batch.');
  await duplicateEnrollment.getByRole('button', { name: 'Close enrollment' }).click();
  await duplicateDetail.getByRole('button', { name: 'Close', exact: true }).click();

  await student.page.getByRole('button', { name: 'My classes' }).click();
  const myClasses = student.page.getByRole('dialog', { name: 'My Classes' });
  const enrollmentGroup = myClasses.getByRole('group', { name: 'Enrollment E2E Algebra Mastery' }).filter({ hasText: 'Weekday Evening Batch' });
  await expect(enrollmentGroup).toContainText('confirmed');
  await expect(enrollmentGroup).toContainText(/₹4,000\s*\/\s*month/i);
  await enrollmentGroup.getByRole('button', { name: 'Cancel enrollment' }).click();
  await expect(myClasses).toContainText('Cancellation recorded');
  await expect(myClasses).toContainText('FREE_CANCELLATION_48H');
  await expect(myClasses).toContainText('Refund 100%');
  await expect(enrollmentGroup).toContainText('cancelled');
  await expect(enrollmentGroup).toContainText('Cancelled under FREE_CANCELLATION_48H');

  const stored = await harness.query(
    `select fee_amount, payment_status, status, refund_percent, refund_policy, payment_mode
       from public.class_enrollments
      where batch_id = $1 and student_id = $2`,
    [batchId, USERS.customerA.authId],
  );
  expect(stored).toHaveLength(1);
  expect(Number(stored[0].fee_amount)).toBe(4000);
  expect(stored[0].payment_status).toBe('obligation_recorded');
  expect(stored[0].payment_mode).toBe('pay_at_institute');
  expect(stored[0].status).toBe('cancelled');
  expect(stored[0].refund_percent).toBe(100);
  expect(stored[0].refund_policy).toBe('FREE_CANCELLATION_48H');
  const availability = await harness.query('select * from public.class_batch_availability($1)', [batchId]);
  expect(availability[0].seats_left).toBe(2);

  // Restart Express against the same PostgreSQL data; the cancellation remains.
  await harness.restartApi();
  await student.page.reload({ waitUntil: 'domcontentloaded' });
  await expect(student.page.getByRole('heading', { name: 'Classes & Training' })).toBeVisible({ timeout: 30_000 });
  await student.page.getByRole('button', { name: 'My classes' }).click();
  const myClassesAfterRestart = student.page.getByRole('dialog', { name: 'My Classes' });
  const persistedGroup = myClassesAfterRestart
    .getByRole('group', { name: 'Enrollment E2E Algebra Mastery' })
    .filter({ hasText: 'Weekday Evening Batch' });
  await expect(persistedGroup).toContainText('cancelled');
  expect(student.pageErrors).toHaveLength(0);
  await student.close();
});

test('waitlist ordering is enforced through the browser UI', async ({ browser }) => {
  test.setTimeout(150_000);
  const batch = await createApprovedBatch({
    title: 'Saturday Waitlist Batch',
    capacity: 1,
    waitlistCapacity: 1,
    deliveryMode: 'offline',
    onlineFee: 0,
    offlineFee: 2500,
    startDate: futureDate(20),
    daysOfWeek: 'Sat-Sun',
    startTime: '10:00',
    endTime: '12:00',
    area: 'Secunderabad',
    facultyName: 'Prof. Waitlist',
  });

  const first = await newPage(browser, USERS.customerB);
  await openClasses(first.page);
  const { enrollment: firstEnrollment } = await enrollInUi(first.page, 'Saturday Waitlist Batch', 'offline');
  await expect(firstEnrollment.getByRole('heading', { name: 'Seat confirmed' })).toBeVisible();
  await expect(firstEnrollment).toContainText('#1');
  await expect(firstEnrollment).toContainText(/₹2,500\s*\/\s*month/i);
  await first.close();

  const second = await newPage(browser, USERS.customerC);
  await openClasses(second.page);
  const detail = await openCourseDetail(second.page);
  const enrollment = await openEnrollment(second.page, detail);
  await enrollment.getByRole('radio').filter({ hasText: 'Saturday Waitlist Batch' }).click();
  const waitlistButton = enrollment.getByRole('button', { name: 'Join waitlist' });
  await expect(waitlistButton).toBeVisible();
  await waitlistButton.click();
  await expect(enrollment.getByRole('heading', { name: 'Added to the waitlist' })).toBeVisible();
  await expect(enrollment).toContainText('Waitlist position');
  await expect(enrollment).toContainText('#1');
  await expect(enrollment).toContainText(/₹2,500\s*\/\s*month/i);
  await second.close();

  const third = await newPage(browser, USERS.customerA);
  await openClasses(third.page);
  const fullDetail = await openCourseDetail(third.page);
  const fullEnrollment = await openEnrollment(third.page, fullDetail);
  const fullBatch = fullEnrollment.getByRole('radio').filter({ hasText: 'Saturday Waitlist Batch' });
  await expect(fullBatch).toContainText('Full');
  await expect(fullEnrollment.getByRole('button', { name: 'Confirm enrollment' })).toBeDisabled();
  await third.close();

  const availability = await harness.query('select * from public.class_batch_availability($1)', [batch.id]);
  expect(availability[0].confirmed_count).toBe(1);
  expect(availability[0].waitlist_count).toBe(1);
});

test('forged fees, unauthorized access and the last-seat race are rejected by the real API', async () => {
  test.setTimeout(120_000);
  const forgedBatch = await createApprovedBatch({
    title: 'Forged Fee Batch',
    capacity: 2,
    waitlistCapacity: 0,
    startDate: futureDate(25),
    startTime: '07:00',
    endTime: '09:00',
  });

  const requestId = randomUUID();
  const forged = await api('POST', '/api/classes/enrollments', tokens.customerA, {
    batchId: forgedBatch.id,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId,
    feeAmount: 1,
    paymentStatus: 'verified',
    status: 'confirmed',
    seatSequence: 99,
  });
  expect(forged.status, JSON.stringify(forged.data)).toBe(201);
  expect(Number(forged.data.enrollment.feeAmount)).toBe(5000);
  expect(forged.data.enrollment.paymentStatus).toBe('obligation_recorded');
  expect(Number(forged.data.enrollment.seatSequence)).toBe(1);

  const replay = await api('POST', '/api/classes/enrollments', tokens.customerA, {
    batchId: forgedBatch.id,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId,
  });
  expect(replay.status).toBe(200);
  expect(replay.data.idempotent).toBe(true);

  const duplicate = await api('POST', '/api/classes/enrollments', tokens.customerA, {
    batchId: forgedBatch.id,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  expect(duplicate.status).toBe(409);
  expect(duplicate.data.error).toBe('DUPLICATE_ENROLLMENT');

  const onlineBatch = await createApprovedBatch({
    title: 'Online Payment Fail Batch',
    capacity: 1,
    startDate: futureDate(35),
    startTime: '09:00',
    endTime: '10:00',
  });
  const beforeOnline = await harness.query(
    'select count(*)::int as count from public.class_enrollments where batch_id = $1',
    [onlineBatch.id],
  );
  const online = await api('POST', '/api/classes/enrollments', tokens.customerC, {
    batchId: onlineBatch.id,
    deliveryMode: 'online',
    paymentMode: 'online',
    requestId: randomUUID(),
  });
  expect(online.status).toBe(503);
  expect(online.data.error).toBe('ONLINE_PAYMENT_PROVIDER_NOT_CONFIGURED');
  const afterOnline = await harness.query(
    'select count(*)::int as count from public.class_enrollments where batch_id = $1',
    [onlineBatch.id],
  );
  expect(afterOnline[0].count).toBe(beforeOnline[0].count);

  const anonymous = await api('POST', '/api/classes/enrollments', null, {
    batchId: forgedBatch.id,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  expect(anonymous.status).toBe(401);

  const providerEnroll = await api('POST', '/api/classes/enrollments', tokens.provider, {
    batchId: forgedBatch.id,
    deliveryMode: 'offline',
    paymentMode: 'pay_at_institute',
    requestId: randomUUID(),
  });
  expect(providerEnroll.status).toBe(403);
  expect(providerEnroll.data.error).toBe('FORBIDDEN_ROLE');

  const customerCreate = await api('POST', `/api/provider/classes/listings/${COURSE_ID}/batches`, tokens.customerA, {
    title: 'Unauthorized Batch',
    deliveryMode: 'offline',
    feeUnit: 'month',
    onlineFee: 0,
    offlineFee: 1000,
    capacity: 1,
    waitlistCapacity: 0,
    startDate: futureDate(30),
    daysOfWeek: 'Mon',
    startTime: '10:00',
    endTime: '11:00',
  });
  expect(customerCreate.status).toBe(403);

  const foreignTrainer = await api('POST', `/api/provider/classes/listings/${COURSE_ID}/batches`, tokens.otherProvider, {
    title: 'Foreign Batch',
    deliveryMode: 'offline',
    feeUnit: 'month',
    onlineFee: 0,
    offlineFee: 1000,
    capacity: 1,
    waitlistCapacity: 0,
    startDate: futureDate(30),
    daysOfWeek: 'Mon',
    startTime: '10:00',
    endTime: '11:00',
  });
  expect(foreignTrainer.status).toBe(403);
  expect(foreignTrainer.data.error).toBe('FORBIDDEN_NOT_COURSE_OWNER');

  const foreignCancel = await api(
    'POST',
    `/api/classes/enrollments/${forged.data.enrollment.id}/cancel`,
    tokens.customerC,
    { reason: 'not my enrollment' },
  );
  expect(foreignCancel.status).toBe(403);

  const raceBatch = await createApprovedBatch({
    title: 'Last Seat Race Batch',
    capacity: 1,
    waitlistCapacity: 0,
    startDate: futureDate(28),
    startTime: '11:00',
    endTime: '12:00',
  });
  const race = await Promise.all([
    api('POST', '/api/classes/enrollments', tokens.customerB, {
      batchId: raceBatch.id,
      deliveryMode: 'offline',
      paymentMode: 'pay_at_institute',
      requestId: randomUUID(),
    }),
    api('POST', '/api/classes/enrollments', tokens.customerC, {
      batchId: raceBatch.id,
      deliveryMode: 'offline',
      paymentMode: 'pay_at_institute',
      requestId: randomUUID(),
    }),
  ]);
  expect(race.map((entry) => entry.status).sort()).toEqual([201, 409]);
  const raceAvailability = await harness.query('select * from public.class_batch_availability($1)', [raceBatch.id]);
  expect(raceAvailability[0].confirmed_count).toBe(1);
  expect(raceAvailability[0].seats_left).toBe(0);

  // Client-side row forging is asserted by supabase/tests/class_enrollment_test.sql,
  // where enrollment INSERT is attempted as the authenticated role and rejected.
  const raceRows = await harness.query(
    'select count(*)::int as count from public.class_enrollments where batch_id = $1',
    [raceBatch.id],
  );
  expect(raceRows[0].count).toBe(1);
});

test('the full enrollment and cancellation journey works at mobile, tablet and desktop viewports', async ({ browser }) => {
  test.setTimeout(180_000);
  const students = [USERS.customerA, USERS.customerB, USERS.customerC];
  for (const [index, viewport] of VIEWPORTS.entries()) {
    const title = `Responsive ${viewport.name.split(' ')[0]} Batch`;
    const batch = await createApprovedBatch({
      title,
      capacity: 2,
      waitlistCapacity: 0,
      startDate: futureDate(5 + index),
      startTime: '19:00',
      endTime: '20:30',
      area: 'Gachibowli',
      facultyName: `Prof. ${viewport.name.split(' ')[0]}`,
      facultyExperience: '9 years',
      onlineFee: 3500,
      offlineFee: 4500,
    });

    const student = await newPage(browser, students[index], { width: viewport.width, height: viewport.height });
    await openClasses(student.page);
    await student.page.getByLabel('Search courses').fill('E2E Algebra Mastery');
    const card = courseCard(student.page);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await noHorizontalOverflow(student.page, `${viewport.name} discovery`);

    await student.page.getByRole('button', { name: 'View E2E Algebra Mastery' }).click();
    const detail = student.page.getByTestId('class-detail-modal');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Batches & timings');
    await noHorizontalOverflow(student.page, `${viewport.name} course detail`);
    await detail.getByRole('button', { name: 'Select batch & enroll' }).click();
    const enrollment = student.page.getByTestId('class-enrollment-modal');
    await expect(enrollment).toBeVisible();
    await enrollment.getByRole('radio').filter({ hasText: title }).click();
    await expect(enrollment).toContainText(`Prof. ${viewport.name.split(' ')[0]}`);
    await enrollment.getByRole('radio', { name: 'offline', exact: true }).click();
    await expect(enrollment).toContainText(/₹4,500\s*\/\s*month/i);
    await noHorizontalOverflow(student.page, `${viewport.name} enrollment`);
    await enrollment.getByRole('button', { name: 'Confirm enrollment' }).click();
    await expect(enrollment.getByRole('heading', { name: 'Seat confirmed' })).toBeVisible();
    await expect(enrollment).toContainText(/₹4,500\s*\/\s*month/i);
    await enrollment.getByRole('button', { name: 'Done' }).click();
    await detail.getByRole('button', { name: 'Close', exact: true }).click();

    await student.page.getByRole('button', { name: 'My classes' }).click();
    const myClasses = student.page.getByRole('dialog', { name: 'My Classes' });
    const group = myClasses
      .getByRole('group', { name: 'Enrollment E2E Algebra Mastery' })
      .filter({ hasText: title });
    await expect(group).toContainText('confirmed');
    await noHorizontalOverflow(student.page, `${viewport.name} my classes`);
    await group.getByRole('button', { name: 'Cancel enrollment' }).click();
    await expect(myClasses).toContainText('Cancellation recorded');
    await expect(group).toContainText('cancelled');
    await expect(student.pageErrors).toHaveLength(0);

    const stored = await harness.query(
      `select status, fee_amount, refund_policy
         from public.class_enrollments
        where batch_id = $1 and student_id = $2`,
      [batch.id, students[index].authId],
    );
    expect(stored[0].status).toBe('cancelled');
    expect(Number(stored[0].fee_amount)).toBe(4500);
    expect(stored[0].refund_policy).toBe('FREE_CANCELLATION_48H');
    await student.close();
  }
});
