/**
 * Disposable, isolated PostgreSQL for the test suites.
 *
 * Creates a throwaway cluster in a temporary directory, applies the
 * Supabase-compatible stubs, the baseline schema and every migration, and
 * returns a connection string. It never touches Supabase, a hosted database,
 * the developer database on 55442, or any pre-existing server.
 *
 * Ownership is tracked with a marker file so cleanup removes only a directory
 * this process created.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

const OWNERSHIP_MARKER = 'BookOurSpace disposable PostgreSQL environment';
const SHELL_ENV = { ...process.env, LC_ALL: 'C', LANG: 'C' };

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: SHELL_ENV, ...options });
  if (result.error) throw new Error(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status}):\n${detail}`);
  }
  return result;
}

/**
 * Reuse the Supabase stubs the repository's own shell harness already
 * maintains (auth roles, auth.uid/auth.role, storage schema, pgcrypto,
 * supabase_realtime) so the harnesses cannot drift apart.
 */
function readStubSql() {
  const harness = path.join(REPO_ROOT, 'supabase', 'tests', 'run_universal_builder_e2e.sh');
  const lines = fs.readFileSync(harness, 'utf8').split('\n');
  const start = lines.findIndex((line) => /<<'SQL'/.test(line));
  if (start === -1) throw new Error('could not locate the Supabase stub heredoc in the shell harness');
  const end = lines.indexOf('SQL', start + 1);
  if (end === -1) throw new Error('could not locate the end of the Supabase stub heredoc');
  return lines.slice(start + 1, end).join('\n');
}

export async function waitForCluster(pgPort, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = spawnSync(
      'psql',
      ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', '-tAc', 'select 1'],
      { encoding: 'utf8', env: SHELL_ENV },
    );
    if (probe.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`disposable PostgreSQL on 127.0.0.1:${pgPort} did not accept connections in time`);
}

export function migrationNames() {
  return fs
    .readdirSync(path.join(REPO_ROOT, 'supabase', 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

/**
 * Build a second database inside the same disposable cluster, stopped at a
 * given migration, so a test can insert genuine pre-migration state and then
 * replay the remaining chain over it.
 *
 * The chain always starts from empty (stubs + baseline + migrations), which is
 * exactly what the disposable cluster does; the stop point only pauses it.
 */
export async function provisionStagedDatabase({ adminUrl, database, stopBefore, log = () => {} }) {
  if (!/^[a-z_][a-z0-9_]{0,48}$/.test(String(database || ''))) {
    throw new Error(`unsafe database name: ${database}`);
  }
  const parsed = new URL(adminUrl);
  const port = String(parsed.port);
  const psql = (args) => run('psql', ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', ...args]);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-staged.'));
  const names = migrationNames();

  psql(['-d', 'postgres', '-tAc', `create database ${database}`]);
  try {
    const stubPath = path.join(workDir, 'stubs.sql');
    fs.writeFileSync(stubPath, readStubSql());
    psql(['-d', database, '-q', '-v', 'ON_ERROR_STOP=1', '-f', stubPath]);
    psql([
      '-d', database, '-q', '-v', 'ON_ERROR_STOP=1',
      '-f', path.join(REPO_ROOT, 'supabase', 'schema_and_rls.sql'),
    ]);
    const staged = names.filter((name) => name < stopBefore);
    const remaining = names.filter((name) => name >= stopBefore);
    const apply = (list) => {
      for (const name of list) {
        psql([
          '-d', database, '-q', '-v', 'ON_ERROR_STOP=1',
          '-f', path.join(REPO_ROOT, 'supabase', 'migrations', name),
        ]);
      }
    };
    apply(staged);
    log(`[db] staged ${database}: ${staged.length} applied, ${remaining.length} held back at ${stopBefore}`);
    return {
      url: `postgres://postgres@127.0.0.1:${port}/${database}?sslmode=disable`,
      applyRemaining: () => apply(remaining),
      drop: () => {
        psql(['-d', 'postgres', '-tAc', `drop database if exists ${database} with (force)`]);
        fs.rmSync(workDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    psql(['-d', 'postgres', '-tAc', `drop database if exists ${database} with (force)`]);
    fs.rmSync(workDir, { recursive: true, force: true });
    throw error;
  }
}

export async function startDisposablePostgres({
  dirPrefix = 'bos-pg-env.',
  database = 'bookourspace_test',
  log = () => {},
} = {}) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), dirPrefix));
  fs.writeFileSync(path.join(tmpRoot, '.bos-pg-owned'), OWNERSHIP_MARKER);
  const pgData = path.join(tmpRoot, 'pgdata');
  const logDir = path.join(tmpRoot, 'output');
  fs.mkdirSync(logDir, { recursive: true });

  const pgPort = await freePort();
  const url = `postgres://postgres@127.0.0.1:${pgPort}/${database}?sslmode=disable`;
  let stopped = false;

  const psql = (args, options = {}) =>
    run('psql', ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', ...args], options);

  function stop() {
    if (stopped) return;
    stopped = true;
    if (fs.existsSync(path.join(pgData, 'PG_VERSION'))) {
      spawnSync('pg_ctl', ['-D', pgData, '-m', 'immediate', '-w', 'stop'], {
        encoding: 'utf8',
        env: SHELL_ENV,
      });
    }
    const marker = path.join(tmpRoot, '.bos-pg-owned');
    try {
      const stillOurs =
        fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === OWNERSHIP_MARKER;
      const parent = path.dirname(tmpRoot);
      if (
        stillOurs &&
        parent === path.resolve(os.tmpdir()) &&
        path.basename(tmpRoot).startsWith(dirPrefix)
      ) {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    } catch {
      /* leave the directory rather than risk deleting something else */
    }
  }

  try {
    log(`[db] disposable cluster in ${tmpRoot}`);
    run('initdb', ['-D', pgData, '-U', 'postgres', '--auth=trust']);
    run('pg_ctl', [
      '-D', pgData,
      '-o', `-p ${pgPort} -k /tmp -c listen_addresses=127.0.0.1`,
      '-l', path.join(logDir, 'postgres.log'),
      'start',
    ]);
    await waitForCluster(pgPort);

    psql(['-d', 'postgres', '-tAc', `create database ${database}`]);

    const stubPath = path.join(logDir, 'stubs.sql');
    fs.writeFileSync(stubPath, readStubSql());
    psql(['-d', database, '-q', '-v', 'ON_ERROR_STOP=1', '-f', stubPath]);
    psql([
      '-d', database, '-q', '-v', 'ON_ERROR_STOP=1',
      '-f', path.join(REPO_ROOT, 'supabase', 'schema_and_rls.sql'),
    ]);

    const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations');
    const migrations = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
    for (const name of migrations) {
      psql(['-d', database, '-q', '-v', 'ON_ERROR_STOP=1', '-f', path.join(migrationsDir, name)]);
    }
    log(`[db] baseline + ${migrations.length} migrations applied on 127.0.0.1:${pgPort}/${database}`);

    return { url, port: pgPort, database, tmpRoot, psql, stop, migrationCount: migrations.length };
  } catch (error) {
    stop();
    throw error;
  }
}
