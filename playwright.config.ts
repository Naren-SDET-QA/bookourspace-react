import fs from 'node:fs';
import { chromium, defineConfig, firefox, webkit } from '@playwright/test';

/**
 * Browser E2E configuration.
 *
 * Every installed engine is registered. Chromium is always expected; Firefox
 * and WebKit are added only when their Playwright binaries are present, so a
 * missing engine is reported as BLOCKED instead of failing the run.
 *
 * E2E_BASE_URL points at the running app (default: local dev server).
 */
function engineInstalled(engine: { executablePath: () => string }): boolean {
  try {
    return fs.existsSync(engine.executablePath());
  } catch {
    return false;
  }
}

const projects: Array<{ name: string; use: { browserName: 'chromium' | 'firefox' | 'webkit' } }> = [
  { name: 'chromium', use: { browserName: 'chromium' } },
];
if (engineInstalled(firefox)) projects.push({ name: 'firefox', use: { browserName: 'firefox' } });
if (engineInstalled(webkit)) projects.push({ name: 'webkit', use: { browserName: 'webkit' } });

// Keep Playwright away from the user's normal dev server, which commonly uses
// 4517. The isolated webServer below starts a local-only app on this port.
const localWebPort = process.env.BOS_PLAYWRIGHT_PORT || '4547';
const localViteCacheDir = process.env.BOS_VITE_CACHE_DIR || `/tmp/bookourspace-react-vite-${localWebPort}`;
const localDbPort = process.env.BOS_PLAYWRIGHT_DB_PORT || String(Number(localWebPort) + 10_000);
const localDbDataDir = process.env.BOS_PLAYWRIGHT_DB_DATA_DIR || `/tmp/bookourspace-playwright-db-${localWebPort}`;
const defaultBaseURL = `http://127.0.0.1:${localWebPort}`;
// Trace bundles must be private to one Playwright process. Reusing the default
// directory across sequential/overlapping runs lets a context cleanup race
// with another run's trace writer and produces ENOENT for resources that were
// just moved or removed. Callers may still provide an explicit directory.
const localOutputDir = process.env.BOS_PLAYWRIGHT_OUTPUT_DIR
  || `/tmp/bookourspace-playwright-results-${localWebPort}-${process.pid}`;
const externalBaseURL = process.env.E2E_BASE_URL;
const aiStudioPreview = process.env.BOS_E2E_AI_STUDIO === '1';
// Specs that assert database outcomes must connect to the database the isolated
// webServer actually uses. Without this they fall back to the developer's own
// database and cannot see rows the server just wrote.
const localDatabaseUrl = `postgres://postgres@127.0.0.1:${localDbPort}/bookourspace_dev?sslmode=disable`;
if (!externalBaseURL && !process.env.BOS_TEST_DATABASE_URL) {
  process.env.BOS_TEST_DATABASE_URL = localDatabaseUrl;
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  outputDir: localOutputDir,
  reporter: [['list']],
  use: {
    baseURL: externalBaseURL || defaultBaseURL,
    storageState: {
      cookies: [],
      origins: [{
        origin: new URL(externalBaseURL || defaultBaseURL).origin,
        localStorage: [
          { name: 'bos_entry_choice_v1', value: 'guest' },
          // The E2E harness exercises guest journeys; production defaults this
          // to hidden and only the admin console or BOS_GUEST_LOGIN_ENABLED
          // turns it on.
          { name: 'bos_guest_login_enabled_v1', value: '1' },
        ],
      }],
    },
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
  projects,
  // Start an isolated Express/Vite app on a dedicated port for every local
  // run; never reuse a server owned by another workspace or agent. An explicit
  // E2E_BASE_URL remains caller-owned and is not replaced by a local process.
  webServer: externalBaseURL ? undefined : {
    // The browser suite includes location-directory and stay journeys. The
    // existing local harness seeds both into a throwaway PostgreSQL cluster;
    // this is test infrastructure, not the normal no-PostgreSQL dev preview.
    command: 'npm run dev:local',
    url: defaultBaseURL,
    reuseExistingServer: false,
    // Give the disposable-db trap time to stop its owned cluster before the
    // process group is force-killed. This prevents orphaned test PostgreSQL
    // clusters and preserves the developer's persistent databases.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    // A cold throwaway cluster runs initdb, the full migration chain and the
    // demo seed before the app listens; the old 120s bound failed that boot.
    timeout: 300_000,
    env: {
      ...(process.env.BOS_DEV_DB_DATA_DIR ? { BOS_DEV_DB_DATA_DIR: process.env.BOS_DEV_DB_DATA_DIR } : {}),
      ...(process.env.BOS_DEV_DB_PORT ? { BOS_DEV_DB_PORT: process.env.BOS_DEV_DB_PORT } : {}),
      ...(process.env.BOS_LISTINGS_DATABASE_URL ? { BOS_LISTINGS_DATABASE_URL: process.env.BOS_LISTINGS_DATABASE_URL } : {}),
      PORT: localWebPort,
      BOS_GUEST_LOGIN_ENABLED: 'true',
      // Tests must not inherit the local preview's demo opt-ins from
      // scripts/dev-with-stays-db.sh: demo rows stay hidden and unbookable.
      BOS_STAY_INCLUDE_DEMO: '0',
      BOS_STAY_ALLOW_DEMO_BOOKING: '0',
      BOS_DEV_DB_PORT: localDbPort,
      BOS_DEV_DB_DATA_DIR: localDbDataDir,
      // Pin the app to the throwaway cluster even when `.env.local` names a URL.
      BOS_LISTINGS_DATABASE_URL: localDatabaseUrl,
      BOS_VITE_CACHE_DIR: localViteCacheDir,
      // SafeImage and module smoke tests use clearly labelled local fixtures in
      // the normal harness. The AI Studio preview path must run without demo
      // inventory so it exercises real Storage signing instead.
      VITE_ENABLE_DEMO_DATA: aiStudioPreview ? 'false' : 'true',
      ...(aiStudioPreview ? { AI_STUDIO: 'true', BOS_AI_STUDIO_PREVIEW: '1' } : {}),
      // Keep browser tests stable when another local task is editing source:
      // HMR can replace a lazy module during a journey and reset React state.
      // Vite still serves the current modules; only its websocket reload path
      // is disabled for the lifetime of this isolated test server.
      DISABLE_HMR: 'true',
      // Tests only inspect the Mumbai OAuth URL; they never authenticate. Use
      // a synthetic public key and explicitly target Mumbai so accidental
      // .env credentials cannot be inherited. OAuth tests intercept the auth
      // endpoint and no other Supabase request is made.
      VITE_SUPABASE_URL: 'https://obkfgxjzlscungkhbyvq.supabase.co',
      VITE_SUPABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      VITE_SUPABASE_PUBLISHABLE_KEY: ['sb', 'publishable', '0123456789abcdefghijkl_12345678'].join('_'),
      VITE_SUPABASE_ANON_KEY: '',
      // The builder UI spec signs in through the seeded local profiles. The
      // endpoint is 404 unless this opt-in is set and is never production.
      BOS_LOCAL_DEV_AUTH: '1',
      // Disposable Playwright only: keep auth/me verification independent
      // across the browser matrix without changing production limits.
      BOS_DISPOSABLE_TEST_AUTH_BUDGET: '100',
      BOS_DISPOSABLE_TEST_API_BUDGET: '300',
    },
  },
});
