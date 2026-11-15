#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_REF = 'obkfgxjzlscungkhbyvq';
const REGION = 'ap-south-1';

function blocked(message, code = 2) {
  console.error(`BLOCKED: ${message}`);
  process.exit(code);
}

function safeRun(command, args, env, options = {}) {
  return spawnSync(command, args, {
    env,
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function classifyConnectionFailure(result) {
  const detail = `${result.stderr ?? ''}\n${result.error?.message ?? ''}`.toLowerCase();
  if (/password authentication failed|28p01|invalid password/.test(detail)) return 'password authentication failed';
  if (/no route to host|network is unreachable|could not connect|connection timed out|timeout expired|etimedout|ehostunreach|could not translate host name/.test(detail)) {
    return 'network, DNS, or IPv6 connectivity failed';
  }
  if (/certificate|ssl|tls/.test(detail)) return 'TLS negotiation failed';
  return 'PostgreSQL read-only query failed';
}

function parseConnection(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    blocked('connection URI is not a valid PostgreSQL URL; copy it from the Mumbai Dashboard Connect panel.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) blocked('only a PostgreSQL connection URI is accepted.');

  const host = url.hostname.toLowerCase();
  const port = Number(url.port || 5432);
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const direct = host === `db.${PROJECT_REF}.supabase.co` && port === 5432 && user === 'postgres';
  const session = new RegExp(`^aws-[0-9]+-${REGION.replaceAll('-', '\\-')}\\.pooler\\.supabase\\.com$`).test(host)
    && port === 5432
    && user === `postgres.${PROJECT_REF}`;

  if (!direct && !session) {
    blocked('target did not match Mumbai direct connection or Mumbai-region Supavisor session mode; no connection attempted.');
  }
  if (database !== 'postgres') blocked('database name must be postgres.');
  if (!password) blocked('connection URI did not contain a password.');

  return { host, port, user, password, database, mode: direct ? 'direct' : 'session' };
}

const rawUrl = process.env.BOS_MUMBAI_DATABASE_URL;
if (!rawUrl) blocked('hidden connection URI was not provided.', 10);

let connection;
try {
  connection = parseConnection(rawUrl);
} finally {
  // Do not pass the full URI to PostgreSQL tools or leave it in child env.
  delete process.env.BOS_MUMBAI_DATABASE_URL;
}

const pgEnv = {
  ...process.env,
  PGHOST: connection.host,
  PGPORT: String(connection.port),
  PGUSER: connection.user,
  PGPASSWORD: connection.password,
  PGDATABASE: connection.database,
  PGSSLMODE: 'require',
  PGOPTIONS: '-c default_transaction_read_only=on',
  PGAPPNAME: 'bookourspace-mumbai-readonly-preflight',
};
delete pgEnv.BOS_MUMBAI_DATABASE_URL;
connection.password = '';

const readOnlyQuery = `
select json_build_object(
  'database', current_database(),
  'server_version', current_setting('server_version'),
  'tls', coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()), false),
  'auth_users', (select count(*)::int from auth.users),
  'auth_identities', (select count(*)::int from auth.identities),
  'public_tables', (select count(*)::int from pg_tables where schemaname='public'),
  'public_rls_tables', (select count(*)::int from pg_tables t join pg_class c on c.relname=t.tablename where t.schemaname='public' and c.relrowsecurity),
  'public_policies', (select count(*)::int from pg_policies where schemaname='public'),
  'profiles_exists', to_regclass('public.profiles') is not null,
  'migration_history_exists', to_regclass('supabase_migrations.schema_migrations') is not null
)::text;`;

const query = safeRun('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', readOnlyQuery], pgEnv, { timeout: 30_000 });
if (query.status !== 0) {
  const failure = classifyConnectionFailure(query);
  console.error(`FAIL: ${failure}; no hosted data was changed.`);
  process.exit(failure === 'password authentication failed' ? 10 : 1);
}

let remote;
try {
  remote = JSON.parse(query.stdout.trim());
} catch {
  blocked('read-only query returned an unexpected result; no backup was attempted.', 1);
}
if (remote.database !== 'postgres' || remote.tls !== true) blocked('database identity or TLS verification failed.', 1);

console.log(JSON.stringify({
  connection: 'PASS',
  project: PROJECT_REF,
  mode: connection.mode,
  tls: remote.tls,
  database: remote.database,
  serverVersion: remote.server_version,
  authUsers: remote.auth_users,
  authIdentities: remote.auth_identities,
  publicTables: remote.public_tables,
  profilesExists: remote.profiles_exists,
  migrationHistoryExists: remote.migration_history_exists,
}));

const backupRoot = path.join(os.homedir(), 'BookOurSpace_Backups', 'mumbai');
mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
chmodSync(backupRoot, 0o700);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const backupDir = path.join(backupRoot, `${stamp}-connection-preflight`);
mkdirSync(backupDir, { mode: 0o700 });
const dumpPath = path.join(backupDir, 'schema.dump');

const dump = safeRun('pg_dump', ['--format=custom', '--no-owner', '--file', dumpPath], pgEnv, { timeout: 900_000 });
if (dump.status !== 0) {
  console.error(`FAIL: hosted pg_dump failed (exit ${dump.status ?? 'unknown'}); no migrations were run.`);
  process.exit(1);
}
chmodSync(dumpPath, 0o600);

const archive = safeRun('pg_restore', ['--list', dumpPath], process.env, { timeout: 120_000 });
if (archive.status !== 0) blocked('pg_restore could not read the hosted custom-format archive.', 1);
if (!/TABLE DATA auth users\b/.test(archive.stdout) || !/TABLE DATA auth identities\b/.test(archive.stdout)) {
  blocked('hosted archive does not include Auth users and identities data; kept the dump for inspection, no migrations ran.', 1);
}

const countsQuery = `
select json_build_object(
  'public_tables', (select count(*)::int from pg_tables where schemaname='public'),
  'public_rls_tables', (select count(*)::int from pg_tables t join pg_class c on c.relname=t.tablename where t.schemaname='public' and c.relrowsecurity),
  'public_policies', (select count(*)::int from pg_policies where schemaname='public'),
  'auth_users', (select count(*)::int from auth.users),
  'auth_identities', (select count(*)::int from auth.identities)
)::text;`;
const countsResult = safeRun('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', countsQuery], pgEnv, { timeout: 30_000 });
if (countsResult.status !== 0) blocked('read-only catalog counts failed after the backup.', 1);
const counts = JSON.parse(countsResult.stdout.trim());
const createdUtc = new Date().toISOString();
const manifest = [
  `project_ref=${PROJECT_REF}`,
  `connection_mode=${connection.mode}`,
  `created_utc=${createdUtc}`,
  `public_tables=${counts.public_tables}`,
  `rls_tables=${counts.public_rls_tables}`,
  `policies=${counts.public_policies}`,
  `auth_users=${counts.auth_users}`,
  `auth_identities=${counts.auth_identities}`,
].join('\n') + '\n';
writeFileSync(path.join(backupDir, 'manifest.txt'), manifest, { mode: 0o600 });
const digest = createHash('sha256').update(readFileSync(dumpPath)).digest('hex');
writeFileSync(path.join(backupDir, 'SHA256SUMS'), `${digest}  schema.dump\n`, { mode: 0o600 });
chmodSync(backupDir, 0o700);
const sizeBytes = statSync(dumpPath).size;
console.log(JSON.stringify({
  hostedBackup: 'PASS',
  archive: 'custom-format',
  includesAuthUsers: true,
  includesAuthIdentities: true,
  sizeBytes,
  sha256: digest,
  path: backupDir,
}));

const restore = safeRun('bash', ['scripts/verify_backup_restore.sh', backupDir], process.env, { timeout: 900_000 });
writeFileSync(path.join(backupDir, 'restore_verification.log'), `${restore.stdout ?? ''}${restore.stderr ?? ''}`, { mode: 0o600 });
if (restore.status === 0 && /RESTORE VERIFIED/.test(restore.stdout)) {
  console.log(JSON.stringify({ hostedBackupRestore: 'PASS', verifiedAuthUserCount: counts.auth_users, verifiedAuthIdentityCount: counts.auth_identities }));
} else {
  const tail = `${restore.stdout ?? ''}${restore.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n');
  console.error(JSON.stringify({ hostedBackupRestore: 'FAIL', exit: restore.status, diagnostic: tail }));
  console.error(`Backup retained at ${backupDir}; no hosted migration or data write was performed.`);
  process.exit(1);
}
