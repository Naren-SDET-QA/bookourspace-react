#!/usr/bin/env node
/**
 * Run the unit suite with a real, isolated PostgreSQL.
 *
 * Several suites assert PostgreSQL behaviour (RLS, transactions, repository
 * semantics) and skip themselves when no database is configured. Rather than
 * requiring a developer database, this runner creates a throwaway cluster,
 * applies the baseline schema and every migration from empty, points the suites
 * at it, runs node's test runner, then destroys the cluster.
 *
 * If PostgreSQL tooling is unavailable the suite still runs — the DB-dependent
 * tests skip themselves exactly as before and the reason is printed.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, startDisposablePostgres } from './lib/disposable-postgres.mjs';

const TEST_DIR = path.join(REPO_ROOT, 'tests');
// Optional arguments run a subset (used while diagnosing a single suite).
const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const files = requested.length > 0
  ? requested.map((file) => path.resolve(REPO_ROOT, file))
  : fs
      .readdirSync(TEST_DIR)
      .filter((name) => name.endsWith('.test.mjs'))
      .sort()
      .map((name) => path.join(TEST_DIR, name));

const tsx = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

async function main() {
  let database = null;
  try {
    database = await startDisposablePostgres({
      dirPrefix: 'bos-unit-db.',
      database: 'bookourspace_test',
      log: console.log,
    });
  } catch (error) {
    console.error(`[db] could not start a disposable PostgreSQL: ${error.message}`);
    console.error('[db] database-dependent suites will skip themselves; their reason is printed below.');
  }

  const env = { ...process.env, NODE_ENV: 'test', BOS_PG_URL: '' };
  if (database) {
    env.BOS_LISTINGS_DATABASE_URL = database.url;
    env.BOS_TEST_DATABASE_URL = database.url;
    env.BOS_LOCATION_TEST_DATABASE_URL = database.url;
    // Lets a test build its own database inside this cluster (migration stop
    // points) without needing a second cluster or a developer database.
    const adminUrl = new URL(database.url);
    adminUrl.pathname = '/postgres';
    env.BOS_TEST_PG_ADMIN_URL = adminUrl.toString();
  }

  const cleanup = () => database?.stop();
  process.once('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      cleanup();
      process.exit(130);
    });
  }

  const child = spawn(tsx, ['--test', '--test-concurrency=1', ...files], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env,
  });

  const code = await new Promise((resolve) => {
    child.on('error', (error) => {
      console.error(`[runner] could not start the test runner: ${error.message}`);
      resolve(1);
    });
    child.on('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
  });

  database?.stop();
  process.exitCode = code;
}

await main();
