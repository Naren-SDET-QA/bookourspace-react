#!/usr/bin/env node
// Read-only Mumbai connection / identity preflight.
//
// This helper NEVER takes a database dump. A plaintext hosted dump is not an
// allowed backup path: it is limited to a read-only identity, TLS, catalog and
// Auth user/identity verification. Use the encrypted, restore-verified path:
//   bash supabase/tests/backup_production_readonly.sh <archive-directory>
import { spawnSync } from 'node:child_process';

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
if (typeof remote.auth_users !== 'number' || typeof remote.auth_identities !== 'number') {
  blocked('Auth identity verification failed: auth.users/auth.identities were not readable. No backup or migration was attempted.', 1);
}
console.log(JSON.stringify({
  connection: 'PASS',
  project: PROJECT_REF,
  mode: connection.mode,
  tls: remote.tls,
  database: remote.database,
  serverVersion: remote.server_version,
  authUsers: remote.auth_users,
  authIdentities: remote.auth_identities,
  authIdentityVerified: true,
  publicTables: remote.public_tables,
  profilesExists: remote.profiles_exists,
  migrationHistoryExists: remote.migration_history_exists,
  hostedBackup: 'NOT_TAKEN',
  reason: 'A preflight never writes an unencrypted dump. Use the encrypted, Auth-verified backup path.',
  encryptedBackupCommand: 'bash supabase/tests/backup_production_readonly.sh <archive-directory>',
}));

// A connection preflight deliberately stops here. It must never create a
// plaintext hosted dump: every hosted backup path requires OpenPGP encryption
// and Auth user/identity preservation checks. Those checks live in
// supabase/tests/backup_production_readonly.sh and run_dev_backup.sh.
console.error('NEXT: run the encrypted, Auth-verified hosted backup path:');
console.error('  BOS_BACKUP_AUTHORIZED=backup-only BOS_PROD_REF_CONFIRM=' + PROJECT_REF);
console.error('  BOS_BACKUP_GPG_RECIPIENT=<owner-fingerprint> BOS_PRODUCTION_DATABASE_URL=...');
console.error('  bash supabase/tests/backup_production_readonly.sh <archive-directory>');
