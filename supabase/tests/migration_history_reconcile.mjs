#!/usr/bin/env node
/**
 * Reconcile a hosted migration history against the pinned local manifest.
 *
 * A hosted apply is only safe when the remote history is a prefix of the local
 * apply order: every applied version exists locally, nothing local is missing
 * from the remote prefix, and no remote version is unknown or out of order.
 * Anything else is drift and must be resolved before `supabase db push`.
 *
 * Usage:
 *   node supabase/tests/migration_history_reconcile.mjs --remote <history.json>
 *   node supabase/tests/migration_history_reconcile.mjs --remote <history.json> --allow-drift
 *   node supabase/tests/migration_history_reconcile.mjs --self-test
 *
 * <history.json> is either
 *   [{"version": "20261101000000", "name": "..."}, ...]      (supabase migration list --json)
 * or {"migrations": [...]} / {"applied": ["20261101000000", ...]}.
 *
 * Exit codes: 0 = reconcilable, 1 = drift/unknown/out-of-order, 2 = bad input.
 * This tool never contacts Supabase and never changes anything.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(HERE, '..', 'MIGRATION_MANIFEST.json');

function parseArgs(argv) {
  const args = { remote: null, allowDrift: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--remote') args.remote = argv[++index] ?? null;
    else if (arg === '--allow-drift') args.allowDrift = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node supabase/tests/migration_history_reconcile.mjs --remote <history.json> [--allow-drift] | --self-test');
      process.exit(0);
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function normalise(history) {
  const list = Array.isArray(history)
    ? history
    : history?.migrations ?? history?.applied ?? null;
  if (!Array.isArray(list)) throw new Error('history must be an array or {migrations|applied: []}');
  return list.map((entry) => {
    if (typeof entry === 'string') return { version: entry.trim() };
    if (entry && typeof entry.version === 'string') {
      return { version: entry.version.trim(), name: entry.name ?? entry.version };
    }
    throw new Error(`unrecognised history entry: ${JSON.stringify(entry)}`);
  });
}

export function reconcile(manifest, history) {
  const localOrder = manifest.migrations.map((migration) => migration.version);
  const localSet = new Set(localOrder);
  const remoteVersions = normalise(history).map((entry) => entry.version);

  const duplicates = remoteVersions.filter((version, index) => remoteVersions.indexOf(version) !== index);
  const unknown = remoteVersions.filter((version) => !localSet.has(version));
  const remotePrefix = remoteVersions.filter((version) => localSet.has(version));
  const expectedPrefix = localOrder.slice(0, remotePrefix.length);
  const outOfOrder = remotePrefix.filter((version, index) => version !== expectedPrefix[index]);
  const applied = new Set(remotePrefix);
  const missingOnRemote = localOrder.filter((version) => !applied.has(version));

  const drift = duplicates.length + unknown.length + outOfOrder.length > 0;
  return {
    ok: !drift,
    drift,
    duplicates: [...new Set(duplicates)],
    unknown: [...new Set(unknown)],
    outOfOrder: [...new Set(outOfOrder)],
    appliedCount: applied.size,
    pending: missingOnRemote,
    pendingCount: missingOnRemote.length,
    nextVersion: missingOnRemote[0] ?? null,
  };
}

async function selfTest() {
  const manifest = { migrations: [
    { version: '20260101000000' },
    { version: '20260102000000' },
    { version: '20260103000000' },
  ] };

  const clean = reconcile(manifest, ['20260101000000', '20260102000000']);
  const empty = reconcile(manifest, []);
  const unknown = reconcile(manifest, ['20260101000000', '20260109000000']);
  const reordered = reconcile(manifest, ['20260102000000', '20260101000000']);
  const duplicate = reconcile(manifest, ['20260101000000', '20260101000000']);

  const cases = [
    ['clean prefix', clean.ok && clean.pendingCount === 1 && clean.nextVersion === '20260103000000'],
    ['empty history applies from the top', empty.ok && empty.pendingCount === 3 && empty.nextVersion === '20260101000000'],
    ['unknown remote version is drift', !unknown.ok && unknown.unknown.length === 1],
    ['out-of-order remote history is drift', !reordered.ok && reordered.outOfOrder.length > 0],
    ['duplicate remote version is drift', !duplicate.ok && duplicate.duplicates.length === 1],
  ];
  let failed = 0;
  for (const [label, passed] of cases) {
    console.log(`    ${passed ? 'PASS' : 'FAIL'} ${label}`);
    if (!passed) failed += 1;
  }
  console.log(failed === 0 ? 'ALL RECONCILIATION SELF-TESTS PASSED' : `${failed} SELF-TEST(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest();
  if (!args.remote) {
    console.error('missing --remote <history.json> (or use --self-test)');
    process.exit(2);
  }
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const history = JSON.parse(await readFile(args.remote, 'utf8'));
  const result = reconcile(manifest, history);

  console.log(`manifest: ${manifest.migrations.length} migrations (sha256 pinned)`);
  console.log(`remote:   ${result.appliedCount} applied, ${result.pendingCount} pending`);
  if (result.duplicates.length) console.log(`duplicates:  ${result.duplicates.join(', ')}`);
  if (result.unknown.length) console.log(`unknown:     ${result.unknown.join(', ')}`);
  if (result.outOfOrder.length) console.log(`out of order: ${result.outOfOrder.join(', ')}`);
  if (result.drift) {
    console.error('RECONCILIATION FAILED: hosted history is not a prefix of the local apply order');
    if (!args.allowDrift) process.exit(1);
    console.warn('continuing because --allow-drift was passed');
    return;
  }
  console.log(`next version: ${result.nextVersion ?? 'none — fully applied'}`);
  console.log('RECONCILIATION PASSED: remote history is a clean prefix; safe to plan the pending apply');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`FAILED: ${error.message}`);
    process.exit(2);
  });
}
