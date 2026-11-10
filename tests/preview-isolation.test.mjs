import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isDemoDataEnabled } from '../src/lib/demoDataPolicy.ts';

const SERVER_SOURCE = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

test('preview mode never clears or rewrites the configured database variables', () => {
  for (const variable of ['BOS_LISTINGS_DATABASE_URL', 'BOS_PG_URL']) {
    assert.equal(
      SERVER_SOURCE.includes(`delete process.env.${variable}`),
      false,
      `${variable} must survive a failed database initialization`,
    );
    assert.equal(
      new RegExp(`process\\.env\\.${variable}\\s*=[^=]`).test(SERVER_SOURCE),
      false,
      `${variable} must never be reassigned at runtime`,
    );
  }
});

test('preview mode is explicitly fenced out of Cloud Run', () => {
  assert.match(SERVER_SOURCE, /const aiStudioPreview = !process\.env\.K_SERVICE/);
  assert.match(SERVER_SOURCE, /BOS_AI_STUDIO_PREVIEW === '1'/);
});

test('Cloud Run cannot enter the preview/demo fallback even when preview flags are set', async () => {
  // Run the local tsx CLI directly: `npx` resolves packages over the network on
  // a cold runner and can block forever instead of starting the server.
  const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: new URL('..', import.meta.url),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'production',
      K_SERVICE: 'bookourspace-api',
      AI_STUDIO: 'true',
      BOS_AI_STUDIO_PREVIEW: '1',
      BOS_LISTINGS_DATABASE_URL: '',
      BOS_PG_URL: '',
      BOS_SERVER_HMAC_SECRET: 'a'.repeat(64),
      APP_URL: 'https://api.bookourspace.test',
      PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    // Bound the wait so a server that never exits fails this test with its
    // output instead of stalling the whole CI job until the job timeout.
    const deadline = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`server did not exit within 60s: ${output.slice(-2000)}`));
    }, 60_000);
    child.once('exit', (exitCode) => {
      clearTimeout(deadline);
      resolve(exitCode);
    });
  });

  assert.notEqual(code, 0, 'production on Cloud Run must not listen');
  assert.match(
    output,
    /AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION|BOS_LISTINGS_DATABASE_URL_REQUIRED/,
  );
  assert.equal(/demo mode without server persistence/i.test(output), false);
});

test('demo data stays gated behind an explicit flag and a development or preview build', () => {
  assert.equal(isDemoDataEnabled({}), false);
  assert.equal(isDemoDataEnabled({ VITE_ENABLE_DEMO_DATA: 'true' }), false);
  assert.equal(isDemoDataEnabled({ DEV: true }), false);
  assert.equal(isDemoDataEnabled({ DEV: true, VITE_ENABLE_DEMO_DATA: 'true' }), true);
  assert.equal(
    isDemoDataEnabled({ VITE_ENABLE_DEMO_DATA: 'true', VITE_AI_STUDIO_DEMO: 'true' }),
    true,
  );
  assert.equal(isDemoDataEnabled({ VITE_ENABLE_DEMO_DATA: 'TRUE', DEV: true }), false);
});

test('the build never forces demo data on, so AI Studio serves real data by default', () => {
  const viteSource = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.equal(viteSource.includes('aiStudioDefines'), false);
  assert.equal(
    /'import\.meta\.env\.VITE_ENABLE_DEMO_DATA':\s*JSON\.stringify/.test(viteSource),
    false,
    'VITE_ENABLE_DEMO_DATA must never be injected by the build',
  );
  assert.equal(
    /'import\.meta\.env\.VITE_AI_STUDIO_DEMO':\s*JSON\.stringify/.test(viteSource),
    false,
    'VITE_AI_STUDIO_DEMO must never be injected by the build',
  );
  // An unconfigured preview build therefore renders real (possibly empty) data.
  assert.equal(isDemoDataEnabled({}), false);
  assert.equal(isDemoDataEnabled({ VITE_AI_STUDIO_DEMO: 'true' }), false);
});
