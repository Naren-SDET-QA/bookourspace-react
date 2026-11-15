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

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4500',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects,
});
