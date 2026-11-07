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
const defaultBaseURL = `http://127.0.0.1:${localWebPort}`;
const externalBaseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: externalBaseURL || defaultBaseURL,
    storageState: {
      cookies: [],
      origins: [{
        origin: new URL(externalBaseURL || defaultBaseURL).origin,
        localStorage: [{ name: 'bos_entry_choice_v1', value: 'guest' }],
      }],
    },
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects,
  // Start an isolated Express/Vite app on a dedicated port for every local
  // run; never reuse a server owned by another workspace or agent. An explicit
  // E2E_BASE_URL remains caller-owned and is not replaced by a local process.
  webServer: externalBaseURL ? undefined : {
    command: 'npm run dev:web',
    url: defaultBaseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...(process.env.BOS_DEV_DB_DATA_DIR ? { BOS_DEV_DB_DATA_DIR: process.env.BOS_DEV_DB_DATA_DIR } : {}),
      ...(process.env.BOS_DEV_DB_PORT ? { BOS_DEV_DB_PORT: process.env.BOS_DEV_DB_PORT } : {}),
      ...(process.env.BOS_LISTINGS_DATABASE_URL ? { BOS_LISTINGS_DATABASE_URL: process.env.BOS_LISTINGS_DATABASE_URL } : {}),
      PORT: localWebPort,
      BOS_VITE_CACHE_DIR: localViteCacheDir,
      // Keep the Vite client enabled; server.ts attaches its websocket to the
      // same Express HTTP server for this isolated test process.
      DISABLE_HMR: 'false',
      // Tests only inspect the Mumbai OAuth URL; they never authenticate. Use
      // a synthetic public key and explicitly target Mumbai so accidental
      // .env credentials cannot be inherited. OAuth tests intercept the auth
      // endpoint and no other Supabase request is made.
      VITE_SUPABASE_URL: 'https://obkfgxjzlscungkhbyvq.supabase.co',
      VITE_SUPABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_0123456789abcdefghijkl_12345678',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});
