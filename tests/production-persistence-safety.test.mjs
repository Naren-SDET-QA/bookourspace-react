import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  assertProductionPersistenceReady,
  resolvePersistencePolicy,
} from '../src/server/persistencePolicy.ts';

const PRODUCTION_TLS_URL =
  'postgres://bos_user:placeholder@db.bookourspace.example:5432/bos?sslmode=verify-full';
const PRODUCTION_HMAC = 'a'.repeat(64);

test('local and test environments may use the isolated JSON compatibility store', () => {
  assert.doesNotThrow(() => assertProductionPersistenceReady({ NODE_ENV: 'development' }));
  assert.doesNotThrow(() => assertProductionPersistenceReady({ NODE_ENV: 'test' }));
  assert.equal(resolvePersistencePolicy({ NODE_ENV: 'test' }).mode, 'json_compat_local');
});

test('production refuses startup while no PostgreSQL target is configured', () => {
  assert.throws(
    () => assertProductionPersistenceReady({ NODE_ENV: 'production' }),
    /AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION/,
  );
});

test('production requires a strong HMAC signing secret', () => {
  assert.throws(
    () =>
      assertProductionPersistenceReady({
        NODE_ENV: 'production',
        BOS_LISTINGS_DATABASE_URL: PRODUCTION_TLS_URL,
        BOS_SERVER_HMAC_SECRET: 'too-short',
      }),
    /BOS_SERVER_HMAC_SECRET_REQUIRED/,
  );
});

test('production refuses a loopback target unless a local test run is explicit', () => {
  assert.throws(
    () =>
      assertProductionPersistenceReady({
        NODE_ENV: 'production',
        BOS_LISTINGS_DATABASE_URL: 'postgres://postgres@127.0.0.1:5432/bos',
        BOS_SERVER_HMAC_SECRET: PRODUCTION_HMAC,
      }),
    /PRODUCTION_POSTGRES_LOOPBACK_REQUIRES_TEST_MODE/,
  );

  assert.doesNotThrow(() =>
    assertProductionPersistenceReady({
      NODE_ENV: 'production',
      BOS_LISTINGS_DATABASE_URL: 'postgres://postgres@127.0.0.1:5432/bos',
      BOS_SERVER_HMAC_SECRET: PRODUCTION_HMAC,
      BOS_POSTGRES_LOCAL_TEST_MODE: 'true',
    }),
  );
});

test('production refuses a remote PostgreSQL target without TLS', () => {
  assert.throws(
    () =>
      assertProductionPersistenceReady({
        NODE_ENV: 'production',
        BOS_LISTINGS_DATABASE_URL: 'postgres://user:placeholder@db.example.test:5432/bos',
        BOS_SERVER_HMAC_SECRET: PRODUCTION_HMAC,
      }),
    /PRODUCTION_POSTGRES_TLS_REQUIRED/,
  );
});

test('production accepts a verified TLS PostgreSQL target and a strong secret', () => {
  const policy = assertProductionPersistenceReady({
    NODE_ENV: 'production',
    BOS_LISTINGS_DATABASE_URL: PRODUCTION_TLS_URL,
    BOS_SERVER_HMAC_SECRET: PRODUCTION_HMAC,
  });
  assert.equal(policy.mode, 'postgres');
  assert.equal(policy.postgres, true);
});

test('development and test reject remote databases without an explicit project allowlist', () => {
  assert.throws(
    () =>
      assertProductionPersistenceReady({
        NODE_ENV: 'test',
        BOS_LISTINGS_DATABASE_URL: PRODUCTION_TLS_URL,
      }),
    /BOS_DEVELOPMENT_POSTGRES_TARGET_NOT_ALLOWLISTED/,
  );
});

test('development accepts only the allowlisted Supabase project over TLS', () => {
  const developmentUrl =
    'postgresql://postgres:placeholder@db.obkfgxjzlscungkhbyvq.supabase.co:5432/postgres?sslmode=verify-full';
  const policy = assertProductionPersistenceReady({
    NODE_ENV: 'development',
    BOS_LISTINGS_DATABASE_URL: developmentUrl,
    BOS_ALLOW_REMOTE_DEVELOPMENT_DATABASE: '1',
    BOS_DEVELOPMENT_DATABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
  });
  assert.equal(policy.mode, 'postgres');
  assert.equal(policy.postgres, true);

  const poolerUrl =
    'postgresql://postgres.obkfgxjzlscungkhbyvq:placeholder@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
  const poolerPolicy = assertProductionPersistenceReady({
    NODE_ENV: 'development',
    BOS_LISTINGS_DATABASE_URL: poolerUrl,
    BOS_ALLOW_REMOTE_DEVELOPMENT_DATABASE: '1',
    BOS_DEVELOPMENT_DATABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
  });
  assert.equal(poolerPolicy.mode, 'postgres');
  assert.equal(poolerPolicy.postgres, true);

  assert.throws(
    () =>
      assertProductionPersistenceReady({
        NODE_ENV: 'development',
        BOS_LISTINGS_DATABASE_URL: poolerUrl.replace('postgres.obkfgxjzlscungkhbyvq', 'postgres.otherproject'),
        BOS_ALLOW_REMOTE_DEVELOPMENT_DATABASE: '1',
        BOS_DEVELOPMENT_DATABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      }),
    /BOS_DEVELOPMENT_POSTGRES_TARGET_NOT_ALLOWLISTED/,
  );

  assert.throws(
    () =>
      assertProductionPersistenceReady({
        NODE_ENV: 'development',
        BOS_LISTINGS_DATABASE_URL: poolerUrl.replace('sslmode=verify-full', 'sslmode=disable'),
        BOS_ALLOW_REMOTE_DEVELOPMENT_DATABASE: '1',
        BOS_DEVELOPMENT_DATABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      }),
    /BOS_DEVELOPMENT_POSTGRES_TLS_REQUIRED/,
  );

  assert.throws(
    () =>
      assertProductionPersistenceReady({
        NODE_ENV: 'development',
        BOS_LISTINGS_DATABASE_URL: developmentUrl.replace('sslmode=verify-full', 'sslmode=disable'),
        BOS_ALLOW_REMOTE_DEVELOPMENT_DATABASE: '1',
        BOS_DEVELOPMENT_DATABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      }),
    /BOS_DEVELOPMENT_POSTGRES_TLS_REQUIRED/,
  );

  assert.throws(
    () =>
      assertProductionPersistenceReady({
        NODE_ENV: 'development',
        BOS_LISTINGS_DATABASE_URL: developmentUrl.replace(
          'db.obkfgxjzlscungkhbyvq.supabase.co',
          'db.other-project.supabase.co',
        ),
        BOS_ALLOW_REMOTE_DEVELOPMENT_DATABASE: '1',
        BOS_DEVELOPMENT_DATABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
      }),
    /BOS_DEVELOPMENT_POSTGRES_TARGET_NOT_ALLOWLISTED/,
  );
});

test('the production server invokes the persistence guard before opening a listener', async () => {
  const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  const guardIndex = serverSource.indexOf('assertProductionPersistenceReady();');
  const listenIndex = serverSource.indexOf("httpServer.listen(PORT, '0.0.0.0'");
  assert.notEqual(guardIndex, -1);
  assert.notEqual(listenIndex, -1);
  assert.ok(guardIndex < listenIndex, 'production guard must run before the HTTP listener');

  const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      BOS_SERVER_HMAC_SECRET: 'isolated-production-guard-test-secret-0123456789',
      BOS_LISTINGS_DATABASE_URL: '',
      BOS_POSTGRES_LOCAL_TEST_MODE: '',
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
