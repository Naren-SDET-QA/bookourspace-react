import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { Client } from 'pg';
import { signInWithLocalDevSession } from './session-cookie-harness';

/**
 * Universal Live Builder — unpublish, from the browser to PostgreSQL.
 *
 * Runs against the isolated Playwright webServer (throwaway PostgreSQL cluster
 * seeded with the demo catalog), never a hosted database. It:
 *   1. signs in as the seeded Super Admin through the local-dev session route;
 *   2. publishes real content through the API so there is something to retract;
 *   3. asserts the Unpublish control exists, requires confirmation, shows a
 *      loading state, reports server errors, and succeeds;
 *   4. proves the public surface stops serving the page (API 404 + no rendered
 *      region) and that republishing from the UI restores it;
 *   5. proves a regular Admin sees the control disabled and is refused 403.
 *
 * Every step writes a screenshot plus a console/network/public-response record
 * to `e2e-artifacts/builder-unpublish/`, so the evidence can be inspected
 * without re-running the suite.
 */

const DATABASE_URL = process.env.BOS_TEST_DATABASE_URL || '';
const PAGE_KEY = 'classes';
const MARKER = 'Unpublish UI probe heading';
const SUPER_EMAIL = 'demo.admin@bookourspace.local';
const REGULAR_EMAIL = 'builder.regular.admin@bookourspace.local';
const REGULAR_ID = '7b1d0000-2222-4222-8222-00000000a001';
const EVIDENCE_DIR = path.resolve(process.cwd(), 'e2e-artifacts', 'builder-unpublish');

type Session = {
  csrfToken: string;
  cookie: string;
  user: { id: string; email: string; name: string; role: string };
};

type Evidence = {
  generatedAt: string;
  pageKey: string;
  marker: string;
  screenshots: string[];
  console: Array<{ type: string; text: string }>;
  api: Array<{ method: string; path: string; status: number }>;
  httpFailures: Array<{ method: string; path: string; status: number }>;
  publicSurface: Record<string, { status: number; body: string }>;
  notes: string[];
};

function newEvidence(): Evidence {
  return {
    generatedAt: new Date().toISOString(),
    pageKey: PAGE_KEY,
    marker: MARKER,
    screenshots: [],
    console: [],
    api: [],
    httpFailures: [],
    publicSurface: {},
    notes: [],
  };
}

function record(page: Page, evidence: Evidence) {
  page.on('console', (message) => {
    // Keep the record bounded; Vite dev chatter is not evidence.
    if (evidence.console.length < 200) evidence.console.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    if (evidence.console.length < 200) evidence.console.push({ type: 'pageerror', text: error.message });
  });
  page.on('response', (response) => {
    const raw = response.url();
    if (raw.startsWith('data:') || raw.includes('/@vite') || raw.includes('/node_modules/.vite')) return;
    const parsed = new URL(raw);
    const entry = {
      method: response.request().method(),
      path: `${parsed.pathname}${parsed.search}`,
      status: response.status(),
    };
    // Every non-2xx response is recorded so an unrelated console 403 cannot be
    // mistaken for a builder failure (or vice versa).
    if (response.status() >= 400 && evidence.httpFailures.length < 100) evidence.httpFailures.push(entry);
    if (!raw.includes('/api/builder/') || evidence.api.length >= 200) return;
    evidence.api.push(entry);
  });
}

async function shot(page: Page, evidence: Evidence, name: string, options: { fullPage?: boolean } = {}) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: options.fullPage ?? false });
  evidence.screenshots.push(path.relative(process.cwd(), file));
}

function saveEvidence(evidence: Evidence, name: string) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, `${name}.json`), JSON.stringify(evidence, null, 2));
}

async function notePublic(evidence: Evidence, request: APIRequestContext, label: string) {
  const response = await request.get(`/api/builder/pages/${PAGE_KEY}`);
  const body = await response.text();
  evidence.publicSurface[label] = { status: response.status(), body: body.slice(0, 600) };
  return { status: response.status(), body };
}

function documentFor(marker: string) {
  return {
    schemaVersion: 1,
    pageKey: PAGE_KEY,
    title: 'Classes',
    module: 'classes',
    description: 'Unpublish browser probe',
    theme: { primaryColor: '#4338CA' },
    navigation: [],
    blocks: [
      {
        id: 'heading_unpublish_probe',
        type: 'heading',
        visible: true,
        props: { text: marker, level: 'h2' },
        style: {},
        children: [],
      },
    ],
  };
}

async function localSession(request: APIRequestContext, email: string): Promise<Session> {
  const response = await request.post('/api/auth/local-dev/session', { data: { role: 'admin', email } });
  expect(response.status(), `local dev session for ${email}: ${await response.text()}`).toBe(200);
  const session = (await response.json()) as Session;
  expect(session.csrfToken).toBeTruthy();
  const cookie = response.headers()['set-cookie']?.match(/(?:^|[,\s])bos_session=([^;\s,]+)/)?.[1];
  expect(cookie, 'local session must set the HttpOnly cookie').toBeTruthy();
  session.cookie = `bos_session=${cookie}`;
  return session;
}

function auth(token: string, cookie?: string) {
  return { 'x-bos-csrf': token, ...(cookie ? { Cookie: cookie } : {}) };
}

/** Create/replace a published version with the probe heading. */
async function publishProbe(request: APIRequestContext, session: Session, marker: string) {
  const detail = await request.get(`/api/builder/pages/${PAGE_KEY}?mode=admin`, { headers: auth(session.csrfToken, session.cookie) });
  expect(detail.status()).toBe(200);
  const state = (await detail.json()) as { versions: Array<{ versionNumber: number }> };
  const expectedVersion = state.versions?.[0]?.versionNumber ?? 0;

  const draft = await request.post(`/api/builder/pages/${PAGE_KEY}/draft`, {
    headers: auth(session.csrfToken, session.cookie),
    data: { document: documentFor(marker), expectedVersion, summary: 'Unpublish UI probe draft' },
  });
  expect(draft.status(), await draft.text()).toBe(200);
  const { page } = (await draft.json()) as { page: { versionId: string } };

  const published = await request.post(`/api/builder/pages/${PAGE_KEY}/publish`, {
    headers: auth(session.csrfToken, session.cookie),
    data: { versionId: page.versionId },
  });
  expect(published.status(), await published.text()).toBe(200);
}

async function openBuilder(
  browser: Browser,
  session: Session,
  evidence: Evidence,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  await signInWithLocalDevSession(context, { role: 'admin', email: session.user.email });
  await context.addInitScript(({ user }) => {
    localStorage.setItem('bos_google_auth_user_v1', JSON.stringify(user));
    localStorage.setItem('bos_entry_choice_v1', 'guest');
    localStorage.setItem('bos_guest_login_enabled_v1', '1');
  }, { user: session.user });

  const page = await context.newPage();
  record(page, evidence);
  await page.goto('/#admin_console', { waitUntil: 'domcontentloaded' });
  await page.getByTitle('Universal Live Builder').click({ timeout: 60_000 });
  await page.getByTestId(`builder-page-${PAGE_KEY}`).click();
  return { page, close: () => context.close() };
}

/**
 * The public surface is decided by PostgreSQL, not by a toast. These rows are
 * the source of truth for "the builder page is live".
 */
async function publishedRows() {
  if (!db) throw new Error('BOS_TEST_DATABASE_URL is required for the DB assertions');
  const { rows } = await db.query(
    `select version_number,
            document->'blocks'->0->'props'->>'text' as heading,
            published_at
       from public.platform_page_versions
      where page_key = $1 and status = 'published'
      order by version_number desc`,
    [PAGE_KEY],
  );
  return rows as Array<{ version_number: string; heading: string | null; published_at: string }>;
}

async function unpublishedVersions() {
  if (!db) throw new Error('BOS_TEST_DATABASE_URL is required for the DB assertions');
  const { rows } = await db.query(
    `select version_number, document->'blocks'->0->'props'->>'text' as heading, published_at, published_by
       from public.platform_page_versions
      where page_key = $1 and status = 'unpublished'
      order by version_number desc`,
    [PAGE_KEY],
  );
  return rows as Array<{ version_number: string; heading: string | null; published_at: string | null; published_by: string | null }>;
}

let superSession: Session;
let regularSession: Session | null = null;
let db: Client | null = null;

test.beforeAll(async ({ request }) => {
  superSession = await localSession(request, SUPER_EMAIL);
  await publishProbe(request, superSession, MARKER);

  expect(DATABASE_URL, 'the Playwright config exports BOS_TEST_DATABASE_URL').toBeTruthy();
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, $2, '{}'::jsonb) on conflict (id) do nothing`,
    [REGULAR_ID, REGULAR_EMAIL],
  );
  await db.query(
    `update public.profiles
        set full_name = 'Regular Builder Admin', role = 'admin', is_super_admin = false,
            account_status = 'active', verified = true
      where id = $1`,
    [REGULAR_ID],
  );
  const { rowCount } = await db.query('select 1 from public.profiles where id = $1', [REGULAR_ID]);
  if (rowCount === 1) regularSession = await localSession(request, REGULAR_EMAIL);
});

test.afterAll(async () => {
  if (db) {
    await db.query('delete from public.profiles where id = $1', [REGULAR_ID]).catch(() => {});
    await db.query('delete from auth.users where id = $1', [REGULAR_ID]).catch(() => {});
    await db.end().catch(() => {});
  }
});

test('Super Admin publishes, confirms, unpublishes, loses public content and republishes', async ({ browser, request }) => {
  const evidence = newEvidence();

  // The published document is really served before the retraction.
  const before = await request.get(`/api/builder/pages/${PAGE_KEY}`);
  expect(before.status()).toBe(200);
  expect(await before.text()).toContain(MARKER);
  evidence.publicSurface.before = { status: before.status(), body: (await notePublic(evidence, request, 'before')).body.slice(0, 600) };
  // Publishing does not demote earlier published rows; public reads serve the
  // newest one, so assert on that row (and that it is the one showing MARKER).
  const liveBefore = await publishedRows();
  expect(liveBefore.length).toBeGreaterThanOrEqual(1);
  expect(liveBefore[0].heading).toBe(MARKER);

  const { page, close } = await openBuilder(browser, superSession, evidence);
  try {
    await expect(page.getByText(/Super Admin/).first()).toBeVisible();
    const unpublish = page.getByTestId('unpublish-page');
    await expect(unpublish).toBeEnabled();
    await expect(unpublish).toHaveAttribute('title', '');
    await expect(page.getByTestId('builder-document-state')).toContainText('(published)');
    await shot(page, evidence, '01-super-admin-toolbar');

    // Confirmation is required; cancel leaves the page published.
    await unpublish.click();
    const confirmation = page.getByTestId('unpublish-confirmation');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toHaveAttribute('role', 'alertdialog');
    await expect(confirmation).toContainText('offline for every visitor');
    await expect(confirmation).toContainText(`v${liveBefore[0].version_number}`);
    await shot(page, evidence, '02-confirmation-dialog');
    await page.getByTestId('cancel-unpublish').click();
    await expect(confirmation).toHaveCount(0);
    expect((await request.get(`/api/builder/pages/${PAGE_KEY}`)).status()).toBe(200);
    evidence.notes.push('cancel left the page published (public GET still 200)');

    // A server failure is surfaced, and the page stays published.
    await page.route(`**/api/builder/pages/${PAGE_KEY}/unpublish`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'UNPUBLISH_PROBE_FAILURE' }) }),
    );
    await unpublish.click();
    await page.getByTestId('confirm-unpublish').click();
    await expect(page.getByTestId('builder-error')).toContainText('UNPUBLISH_PROBE_FAILURE');
    await expect(unpublish).toBeEnabled();
    await shot(page, evidence, '03-error-state');
    await page.unroute(`**/api/builder/pages/${PAGE_KEY}/unpublish`);
    expect((await request.get(`/api/builder/pages/${PAGE_KEY}`)).status()).toBe(200);
    expect((await publishedRows()).length).toBeGreaterThanOrEqual(1);
    evidence.notes.push('500 from the server surfaced as UNPUBLISH_PROBE_FAILURE and left the page published');

    // Loading state: the toolbar control is disabled while the request is in flight.
    await page.route(`**/api/builder/pages/${PAGE_KEY}/unpublish`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    await unpublish.click();
    const confirmButton = page.getByTestId('confirm-unpublish');
    await confirmButton.click();
    await expect(unpublish).toBeDisabled();
    await expect(confirmButton).toHaveCount(0);
    await shot(page, evidence, '04-loading-state');
    await expect(page.getByTestId('builder-status')).toContainText('Unpublished v');
    await shot(page, evidence, '05-success-status');
    await page.unroute(`**/api/builder/pages/${PAGE_KEY}/unpublish`);

    // The editor still owns the document (so republishing is possible) and the
    // page list reflects the retired page.
    await expect(page.getByTestId(`builder-page-${PAGE_KEY}`)).toContainText('unpublished');
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    await expect(unpublish).toBeDisabled();
    // Regression: the preview header used to derive its label from the draft
    // alone, so it kept saying "(published)" after the page was retracted.
    await expect(page.getByTestId('builder-document-state')).toContainText('(unpublished)');
    await expect(page.getByTestId('builder-document-state')).not.toContainText('(published)');
    await shot(page, evidence, '06-admin-unpublished');

    // Public surface: API 404, no rendered builder region, and — the source of
    // truth — no published row left for the page in PostgreSQL. The retired
    // document stays in history as an audited 'unpublished' version.
    const gone = await notePublic(evidence, request, 'afterUnpublish');
    expect(gone.status).toBe(404);
    expect(await publishedRows()).toHaveLength(0);
    const retired = await unpublishedVersions();
    expect(retired.length).toBeGreaterThanOrEqual(1);
    expect(retired[0].heading).toBe(MARKER);
    expect(retired[0].published_at).toBeNull();
    expect(retired[0].published_by).toBeNull();

    // A hash-only change keeps the SPA (and the open builder) mounted, so load a
    // real public document before asserting the rendered page lost the content.
    await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Close builder')).toHaveCount(0);
    await expect(page.locator(`[data-builder-page="${PAGE_KEY}"]`)).toHaveCount(0);
    await expect(page.getByText(MARKER)).toHaveCount(0);
    await shot(page, evidence, '07-public-after-unpublish');

    // Reload the admin surface: the unpublished state survives a reload.
    await page.goto('/#admin_console', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTitle('Universal Live Builder').click({ timeout: 60_000 });
    await expect(page.getByTestId(`builder-page-${PAGE_KEY}`)).toContainText('unpublished');
    await page.getByTestId(`builder-page-${PAGE_KEY}`).click();
    await expect(page.getByTestId('unpublish-page')).toBeDisabled();
    await expect(page.getByTestId('builder-status')).toHaveCount(0);
    await expect(page.getByTestId('builder-document-state')).toContainText('(unpublished)');
    await expect(page.getByTestId('builder-document-state')).not.toContainText('(published)');
    await shot(page, evidence, '08-admin-reload-unpublished');
    evidence.notes.push('unpublished state persisted across a full page reload');

    // Republish from the UI.
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByTestId('builder-status')).toContainText('Draft saved');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('builder-status')).toContainText('Published v');
    await expect(page.getByTestId('builder-document-state')).toContainText('(published)');
    await shot(page, evidence, '09-republished-status');

    const after = await request.get(`/api/builder/pages/${PAGE_KEY}`);
    expect(after.status()).toBe(200);
    expect(await after.text()).toContain(MARKER);
    await notePublic(evidence, request, 'republished');
    const liveAfter = await publishedRows();
    expect(liveAfter.length).toBeGreaterThanOrEqual(1);
    expect(liveAfter[0].heading).toBe(MARKER);
    expect(liveAfter[0].published_at).toBeTruthy();

    // The public page renders the marker again after a reload.
    await page.goto('/#classes', { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(`[data-builder-page="${PAGE_KEY}"]`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(MARKER).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, evidence, '10-public-republished');
  } finally {
    await close();
    saveEvidence(evidence, 'super-admin-run');
  }
});

test('regular Admin sees a disabled unpublish control and is refused 403', async ({ browser, request }) => {
  test.skip(!regularSession, 'regular admin fixture unavailable (no local database URL)');
  const session = regularSession as Session;
  const evidence = newEvidence();

  const refused = await request.post(`/api/builder/pages/${PAGE_KEY}/unpublish`, {
    headers: auth(session.csrfToken, session.cookie),
    data: {},
  });
  expect(refused.status()).toBe(403);
  const refusal = (await refused.json()) as { error: string };
  expect(refusal.error).toBe('BUILDER_SUPER_ADMIN_REQUIRED');
  evidence.publicSurface.refusedDirectly = { status: refused.status(), body: JSON.stringify(refusal) };
  // Bypassing the UI does not change the database.
  const stillLive = await publishedRows();
  expect(stillLive.length).toBeGreaterThanOrEqual(1);
  expect(stillLive[0].heading).toBe(MARKER);
  expect((await notePublic(evidence, request, 'afterRegularAdminAttempt')).status).toBe(200);
  evidence.notes.push('direct POST /unpublish as a regular Admin: 403 BUILDER_SUPER_ADMIN_REQUIRED, page still published');

  const { page, close } = await openBuilder(browser, session, evidence);
  try {
    await expect(page.getByText(/Admin · /).first()).toBeVisible();
    await expect(page.getByText(/Super Admin/)).toHaveCount(0);
    const unpublish = page.getByTestId('unpublish-page');
    await expect(unpublish).toBeVisible();
    await expect(unpublish).toBeDisabled();
    await expect(unpublish).toHaveAttribute('title', 'Super Admin required');
    await shot(page, evidence, '11-regular-admin-disabled');
    // The disabled control cannot open the confirmation, even by force.
    await unpublish.click({ force: true }).catch(() => {});
    await expect(page.getByTestId('unpublish-confirmation')).toHaveCount(0);
    expect((await request.get(`/api/builder/pages/${PAGE_KEY}`)).status()).toBe(200);
  } finally {
    await close();
    saveEvidence(evidence, 'regular-admin-run');
  }
});
