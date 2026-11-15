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

// Give this repository its own local app process so E2E tests do not depend
// on a separately started dev server or collide with the sibling web app.
const localWebPort = process.env.BOS_PLAYWRIGHT_PORT || '4557';
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
  webServer: externalBaseURL ? undefined : {
    command: 'npm run dev',
    url: defaultBaseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...(process.env.BOS_DEV_DB_DATA_DIR ? { BOS_DEV_DB_DATA_DIR: process.env.BOS_DEV_DB_DATA_DIR } : {}),
      ...(process.env.BOS_DEV_DB_PORT ? { BOS_DEV_DB_PORT: process.env.BOS_DEV_DB_PORT } : {}),
      PORT: localWebPort,
      DISABLE_HMR: 'false',
      // OAuth tests only inspect routing and intercept the authorize endpoint.
      // Use a synthetic publishable key and never inherit local environment secrets.
      VITE_SUPABASE_URL: 'https://obkfgxjzlscungkhbyvq.supabase.co',
      VITE_SUPABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_0123456789abcdefghijkl_12345678',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});
