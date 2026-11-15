import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { assertProductionPersistenceReady } from '../src/server/persistencePolicy.ts';

test('local and test environments may use the isolated JSON compatibility store', () => {
  assert.doesNotThrow(() => assertProductionPersistenceReady({ NODE_ENV: 'development' }));
  assert.doesNotThrow(() => assertProductionPersistenceReady({ NODE_ENV: 'test' }));
});

test('production refuses startup while authoritative JSON persistence is active', () => {
  assert.throws(
    () => assertProductionPersistenceReady({ NODE_ENV: 'production' }),
    /AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION/,
  );
});

test('the production server invokes the JSON persistence guard before opening a listener', async () => {
  const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  const guardIndex = serverSource.indexOf('assertProductionPersistenceReady();');
  const listenIndex = serverSource.indexOf("app.listen(PORT, '0.0.0.0'");
  assert.notEqual(guardIndex, -1);
  assert.ok(guardIndex < listenIndex, 'production guard must run before the HTTP listener');

  const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      BOS_SERVER_HMAC_SECRET: 'isolated-production-guard-test-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Production safety subprocess unexpectedly stayed running.'));
    }, 15_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  assert.equal(exitCode, 1);
  assert.match(output, /AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION/);
  assert.doesNotMatch(output, /Full-Stack Server running/);
});
