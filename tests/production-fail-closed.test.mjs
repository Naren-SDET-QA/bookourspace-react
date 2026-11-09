import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import express from 'express';
import { test } from 'node:test';
import { registerPlatformApi } from '../src/server/platformApi.ts';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

test('production marketplace listings fail closed without PostgreSQL', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const app = express();
  registerPlatformApi(app, {
    verifySession: () => null,
    loadStore: () => {
      throw new Error('JSON_STORE_MUST_NOT_BE_READ_IN_PRODUCTION');
    },
    saveStore: () => {
      throw new Error('JSON_STORE_MUST_NOT_BE_WRITTEN_IN_PRODUCTION');
    },
    signSession: () => '',
    hmacSecret: 'a'.repeat(64),
    findBlockedUser: () => null,
    providerListingRepository: null,
  });
  const { server, origin } = await listen(app);
  try {
    const response = await fetch(`${origin}/api/marketplace/listings`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'LISTING_REPOSITORY_UNAVAILABLE');
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'listings'), false);
    const detail = await fetch(`${origin}/api/marketplace/listings/any-id`);
    const detailBody = await detail.json();
    assert.equal(detail.status, 503);
    assert.equal(detailBody.error, 'LISTING_REPOSITORY_UNAVAILABLE');
  } finally {
    process.env.NODE_ENV = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('/api/health fails closed when PostgreSQL is not attached', async () => {
  const port = String(18000 + Math.floor(Math.random() * 1000));
  const child = spawn('npx', ['tsx', 'server.ts'], {
    cwd: new URL('..', import.meta.url),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      BOS_LISTINGS_DATABASE_URL: '',
      BOS_PG_URL: '',
      PORT: port,
      BOS_TEST_RATE_LIMIT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const started = Date.now();
  try {
    let response;
    while (Date.now() - started < 20_000) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/api/health`);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    assert.ok(response, output.slice(-500));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.error, 'DATABASE_UNAVAILABLE');
    const live = await fetch(`http://127.0.0.1:${port}/health/live`);
    const liveBody = await live.json();
    assert.equal(live.status, 200);
    assert.equal(liveBody.ok, true);
    assert.equal(liveBody.probe, 'liveness');
    assert.equal(liveBody.service, 'bookourspace-api');
    const ready = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(ready.status, 503);
    assert.equal(/postgres:\/\/|password=/i.test(JSON.stringify(body) + JSON.stringify(liveBody) + output), false);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.on('exit', resolve));
  }
});

test('production Node refuses to listen without PostgreSQL or HTTPS APP_URL', async () => {
  const hmac = 'a'.repeat(64);
  async function spawnServer(env) {
    const child = spawn('npx', ['tsx', 'server.ts'], {
      cwd: new URL('..', import.meta.url),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'production',
        BOS_LISTINGS_DATABASE_URL: '',
        BOS_PG_URL: '',
        BOS_SERVER_HMAC_SECRET: hmac,
        PORT: '0',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const code = await new Promise((resolve) => child.on('exit', resolve));
    return { code, output };
  }

  const missingUrl = await spawnServer({ APP_URL: 'https://api.bookourspace.test' });
  assert.notEqual(missingUrl.code, 0);
  assert.match(missingUrl.output, /AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION|BOS_LISTINGS_DATABASE_URL_REQUIRED/);
  assert.equal(/postgres:\/\/|postgresql:\/\/|password=/i.test(missingUrl.output), false);

  const httpUrl = await spawnServer({
    APP_URL: 'http://api.bookourspace.test',
    BOS_LISTINGS_DATABASE_URL: 'postgresql://postgres@127.0.0.1:1/postgres',
    BOS_POSTGRES_LOCAL_TEST_MODE: 'true',
  });
  assert.notEqual(httpUrl.code, 0);
  assert.match(httpUrl.output, /PRODUCTION_APP_URL_HTTPS_REQUIRED|BOS_LISTINGS_DATABASE_UNAVAILABLE|PRODUCTION_POSTGRES_LOOPBACK/);
  assert.equal(/password=/i.test(httpUrl.output), false);
});
