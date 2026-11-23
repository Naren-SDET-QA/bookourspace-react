/**
 * Disposable environment for the universal builder integration test.
 *
 * Owns its whole lifecycle: creates a throwaway PostgreSQL cluster (shared with
 * the unit-test runner via ./disposable-postgres.mjs, so the two cannot drift),
 * seeds the three builder identities, then boots the real Express server on
 * 127.0.0.1 with a synthetic HMAC secret.
 *
 * It never touches Supabase, a hosted database, the developer database on
 * 55442, or any pre-existing server. Cleanup removes only what it created.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, freePort, startDisposablePostgres } from './disposable-postgres.mjs';

export { REPO_ROOT };

export const IDS = {
  superId: '11111111-aaaa-4aaa-8aaa-111111111111',
  adminId: '22222222-aaaa-4aaa-8aaa-222222222222',
  customerId: '33333333-aaaa-4aaa-8aaa-333333333333',
};

function seedSql() {
  const { superId, adminId, customerId } = IDS;
  return `
insert into auth.users (id, email, raw_user_meta_data) values
  ('${superId}', 'super@example.test', '{}'),
  ('${adminId}', 'admin@example.test', '{}'),
  ('${customerId}', 'customer@example.test', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role, account_status) values
  ('${superId}', 'super@example.test', 'Super Admin', 'admin', 'active'),
  ('${adminId}', 'admin@example.test', 'Admin', 'admin', 'active'),
  ('${customerId}', 'customer@example.test', 'Customer', 'customer', 'active')
on conflict (id) do update set role = excluded.role, account_status = 'active';

update public.profiles set is_super_admin = true where id = '${superId}';
update public.profiles set is_super_admin = false where id <> '${superId}';
`;
}

function tail(filePath, lines = 60) {
  try {
    const text = fs.readFileSync(filePath, 'utf8').trimEnd().split('\n');
    return text.slice(-lines).join('\n');
  } catch {
    return '(no server log)';
  }
}

async function waitForServer(baseUrl, child, logPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastState = 'no response';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (code ${child.exitCode}). Log tail:\n${tail(logPath)}`);
    }
    try {
      const registry = await fetch(`${baseUrl}/api/builder/registry`);
      // The builder registry proves the HTTP stack is listening.
      if (registry.status === 200) {
        const health = await fetch(`${baseUrl}/api/health`);
        if (health.status === 200) return;
        lastState = `registry=200 health=${health.status}`;
      } else {
        lastState = `registry=${registry.status}`;
      }
    } catch (error) {
      lastState = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`server at ${baseUrl} never became healthy (last: ${lastState}). Log tail:\n${tail(logPath)}`);
}

export async function startDisposableBuilderEnv({ log = console.log } = {}) {
  const database = await startDisposablePostgres({
    dirPrefix: 'bos-builder-env.',
    database: 'bos_builder_it',
    log,
  });
  const logDir = path.join(database.tmpRoot, 'output');
  const storePath = path.join(database.tmpRoot, 'authoritative-store.json');
  const serverLog = path.join(logDir, 'server.log');
  let server = null;

  function stopSync() {
    try {
      if (server && server.exitCode === null && server.pid) {
        server.kill('SIGTERM');
        // Give the server a moment to release the port before stopping the cluster.
        spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 1200)'], { stdio: 'ignore' });
        server.kill('SIGKILL');
      }
    } catch {
      /* already gone */
    }
    database.stop();
  }

  // Cleanup must also run when an assertion throws.
  process.once('exit', stopSync);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopSync();
      process.exit(130);
    });
  }

  try {
    const databaseUrl = database.url;
    const seedPath = path.join(logDir, 'seed.sql');
    fs.writeFileSync(seedPath, seedSql());
    database.psql(['-d', database.database, '-q', '-v', 'ON_ERROR_STOP=1', '-f', seedPath]);

    const apiPort = await freePort();
    const baseUrl = `http://127.0.0.1:${apiPort}`;
    const secret = `builder-integration-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        seatLocks: {}, bookings: [], enquiries: [], paymentIntents: {}, usedUtrs: {},
        checkedInPasses: {}, users: [], notifications: [], notificationCampaigns: [],
        providerListings: {}, adminModules: {}, revokedTokens: {},
      }),
    );

    const tsx = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
    const logFd = fs.openSync(serverLog, 'a');
    server = spawn(tsx, ['server.ts'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        LC_ALL: 'C',
        LANG: 'C',
        NODE_ENV: 'test',
        PORT: String(apiPort),
        DISABLE_HMR: 'true',
        BOS_PG_URL: '',
        BOS_LISTINGS_DATABASE_URL: databaseUrl,
        BOS_SERVER_HMAC_SECRET: secret,
        BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
        VITE_SUPABASE_URL: 'http://127.0.0.1:1',
        VITE_SUPABASE_PROJECT_ID: 'local',
        VITE_SUPABASE_DEVELOPMENT_PROJECT_ID: 'local',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'your-supabase-publishable-or-anon-key',
        VITE_SUPABASE_ANON_KEY: 'your-supabase-publishable-or-anon-key',
        VITE_ENABLE_DEMO_DATA: 'false',
      },
    });
    fs.closeSync(logFd);

    await waitForServer(baseUrl, server, serverLog, 240_000);
    log(`[env] API healthy at ${baseUrl}`);

    return { baseUrl, secret, ...IDS, stop: stopSync, tmpRoot: database.tmpRoot };
  } catch (error) {
    stopSync();
    throw error;
  }
}
