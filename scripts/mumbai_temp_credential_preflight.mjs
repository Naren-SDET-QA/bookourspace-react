#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, chmodSync, openSync, renameSync, unlinkSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { connect } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const root = '/Users/aa/Downloads/bookourspace-react';
process.chdir(root);
const password = process.env.BOS_MUMBAI_TEMP_DB_PASSWORD;
delete process.env.BOS_MUMBAI_TEMP_DB_PASSWORD;
const stop = (message, code = 2) => { console.log(message); process.exit(code); };
if (!password) stop('BLOCKED: temporary credential was not supplied.');

const ref = 'obkfgxjzlscungkhbyvq';
let config;
try { config = dotenv.parse(readFileSync('.env')); }
catch { stop('BLOCKED: .env could not be parsed; no connection attempted.'); }
if (config.MUMBAI_PROJECT_REF !== ref) stop('BLOCKED: configured project ref is not the approved Mumbai project.');

const endpoints = [
  { label: 'Direct Connection', kind: 'direct', host: config.MUMBAI_DIRECT_HOST, port: Number(config.MUMBAI_DIRECT_PORT), user: config.MUMBAI_DIRECT_USER, database: 'postgres' },
  { label: 'Session Pooler', kind: 'pooler', host: config.MUMBAI_DB_HOST, port: Number(config.MUMBAI_DB_PORT), user: config.MUMBAI_DB_USER, database: config.MUMBAI_DB_NAME },
];

async function probe(host, port) {
  try {
    const addresses = await lookup(host, { all: true });
    if (!addresses.length) return { dns: false, tcp: false, family: null };
    for (const address of addresses) {
      const tcp = await new Promise(resolve => {
        const socket = connect({ host: address.address, port, family: address.family });
        const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 8000);
        socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
        socket.once('error', () => { clearTimeout(timer); resolve(false); });
      });
      if (tcp) return { dns: true, tcp: true, family: address.family };
    }
    return { dns: true, tcp: false, family: addresses[0].family };
  } catch { return { dns: false, tcp: false, family: null }; }
}

function classify(stderr = '', error) {
  const text = `${stderr} ${error?.message ?? ''}`.toLowerCase();
  if (/28p01|password authentication failed|invalid password/.test(text)) return { kind: 'auth', text: 'SQLSTATE 28P01: password authentication failed' };
  if (/ssl|tls|certificate/.test(text)) return { kind: 'tls', text: 'SSL/TLS negotiation failed' };
  if (/tenant or user not found|no pg_hba|pooler/.test(text)) return { kind: 'routing', text: 'pooler or project/user routing rejected the connection' };
  if (/could not translate host|no route|network is unreachable|timed out|connection refused|could not connect|ehostunreach/.test(text)) return { kind: 'network', text: 'network/DNS/endpoint connectivity failed' };
  return { kind: 'query', text: 'PostgreSQL read-only query failed; raw diagnostic withheld' };
}

const outcomes = [];
for (const endpoint of endpoints) {
  const isMumbai = endpoint.kind === 'direct'
    ? endpoint.host === `db.${ref}.supabase.co` && endpoint.user === 'postgres'
    : /^aws-[0-9]+-ap-south-1\.pooler\.supabase\.com$/.test(endpoint.host ?? '') && endpoint.user === `postgres.${ref}`;
  console.log(`${endpoint.label}: host=${endpoint.host}; username=${endpoint.user}; port=${endpoint.port}; database=${endpoint.database}; SSL=require`);
  if (!isMumbai || endpoint.port !== 5432 || endpoint.database !== 'postgres') {
    console.log(`${endpoint.label}: FAIL — configured target does not match the expected Mumbai connection settings.`);
    outcomes.push({ endpoint, kind: 'target' });
    continue;
  }
  const network = await probe(endpoint.host, endpoint.port);
  console.log(`${endpoint.label} network: DNS=${network.dns ? 'PASS' : 'FAIL'}${network.family ? ` IPv${network.family}` : ''}; TCP=${network.tcp ? 'PASS' : 'FAIL'}`);
  if (!network.dns || !network.tcp) {
    outcomes.push({ endpoint, kind: 'network' });
    console.log(`${endpoint.label}: FAIL — endpoint unreachable.`);
    continue;
  }
  const pgEnv = {
    ...process.env, PGHOST: endpoint.host, PGPORT: String(endpoint.port), PGUSER: endpoint.user,
    PGPASSWORD: password, PGDATABASE: endpoint.database, PGSSLMODE: 'require',
    PGOPTIONS: '-c default_transaction_read_only=on', PGAPPNAME: `bookourspace-mumbai-${endpoint.kind}-temp-check`,
  };
  const sql = "select json_build_object('database',current_database(),'user',current_user,'server_version',current_setting('server_version'),'ssl',coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false),'read_only',current_setting('transaction_read_only'))::text";
  const result = spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    env: pgEnv, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    const failure = classify(result.stderr, result.error);
    console.log(`${endpoint.label} TLS: ${failure.kind === 'auth' ? 'PASS (SSL-required client reached PostgreSQL authentication)' : failure.kind === 'tls' ? 'FAIL' : 'not confirmed'}`);
    console.log(`${endpoint.label}: FAIL — ${failure.text}.`);
    outcomes.push({ endpoint, kind: failure.kind });
    continue;
  }
  let row;
  try { row = JSON.parse(result.stdout.trim()); } catch {}
  const pass = row?.database === 'postgres' && row.user === endpoint.user && row.ssl === true && row.read_only === 'on';
  console.log(`${endpoint.label} read-only SQL: ${pass ? 'PASS' : 'FAIL'}${row ? `; database=${row.database}; user=${row.user}; SSL=${row.ssl}; transaction_read_only=${row.read_only}; server_version=${row.server_version}` : ''}`);
  outcomes.push({ endpoint, kind: pass ? 'pass' : 'query', pass });
}

if (outcomes.some(result => result.kind === 'auth')) stop('STOP: authentication failed (SQLSTATE 28P01). No retry, .env update, or backup performed.', 10);
if (outcomes.some(result => ['target', 'tls', 'routing', 'query'].includes(result.kind))) stop('STOP: a target, TLS, routing, or SQL check failed. No .env update or backup performed.', 11);
const session = outcomes.find(result => result.endpoint.kind === 'pooler' && result.pass);
if (!session) stop('STOP: Session Pooler did not pass; .env was not updated.', 12);

const encoded = JSON.stringify(password);
if (dotenv.parse(`MUMBAI_DB_PASSWORD=${encoded}`).MUMBAI_DB_PASSWORD !== password) {
  stop('STOP: temporary password cannot be represented losslessly in dotenv syntax; .env unchanged.', 13);
}
const envPath = path.resolve('.env');
const original = readFileSync(envPath, 'utf8');
let replacements = 0;
const updated = original.split(/(?<=\n)/).map(line => {
  const ending = line.endsWith('\n') ? '\n' : '';
  const body = ending ? line.slice(0, -1) : line;
  const match = body.match(/^(\s*(?:export\s+)?MUMBAI_DB_PASSWORD\s*=\s*).*$/);
  if (!match) return line;
  replacements++;
  return `${match[1]}${encoded}${ending}`;
}).join('');
if (replacements !== 1 || dotenv.parse(updated).MUMBAI_DB_PASSWORD !== password) {
  stop('STOP: .env password assignment is ambiguous or failed dotenv round-trip; file unchanged.', 14);
}

const backupDirectory = path.join(os.homedir(), 'BookOurSpace_Backups', 'env');
mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
chmodSync(backupDirectory, 0o700);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const envBackup = path.join(backupDirectory, `.env.before-temp-mumbai-${stamp}.bak`);
writeFileSync(envBackup, original, { mode: 0o600, flag: 'wx' });
chmodSync(envBackup, 0o600);
const fileMode = statSync(envPath).mode & 0o777;
const tempPath = `${envPath}.temp-password.tmp`;
try {
  const fd = openSync(tempPath, 'wx', fileMode);
  writeFileSync(fd, updated, 'utf8');
  chmodSync(tempPath, fileMode);
  renameSync(tempPath, envPath);
} catch {
  try { unlinkSync(tempPath); } catch {}
  stop('FAIL: secure .env update failed; protected pre-update backup retained.', 15);
}
if (dotenv.parse(readFileSync(envPath, 'utf8')).MUMBAI_DB_PASSWORD !== password) {
  stop('FAIL: post-update dotenv verification failed; protected pre-update backup retained.', 16);
}
console.log(`PASS: .env updated and dotenv-verified; protected backup=${envBackup}; password not displayed.`);

// The approved backup script performs read-only SQL, pg_dump, archive inspection,
// checksums, and an isolated local restore. No hosted writes or migrations occur.
const verified = outcomes.find(result => result.endpoint.kind === 'direct' && result.pass) ?? session;
const endpoint = verified.endpoint;
const uri = new URL(`postgresql://${encodeURIComponent(endpoint.user)}:${encodeURIComponent(password)}@${endpoint.host}:${endpoint.port}/${encodeURIComponent(endpoint.database)}`);
uri.searchParams.set('sslmode', 'require');
const childEnv = { ...process.env, BOS_MUMBAI_DATABASE_URL: uri.toString() };
const backup = spawnSync('node', ['scripts/mumbai_connection_backup_preflight.mjs'], {
  cwd: root, env: childEnv, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 2 * 1024 * 1024,
});
if (backup.stdout) process.stdout.write(backup.stdout);
if (backup.stderr) process.stderr.write(backup.stderr);
if (backup.status !== 0) stop(`FAIL: approved backup preflight did not complete (exit ${backup.status ?? 'unknown'}); no migrations run.`, 20);
console.log('MIGRATIONS: NOT RUN. Separate hosted-installation approval is still required.');
