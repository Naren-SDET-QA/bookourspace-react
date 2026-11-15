#!/usr/bin/env node
/**
 * Migration manifest generator / verifier.
 *
 * A timestamped migration directory is only safe to apply when every version is
 * unique and the reviewed bytes are pinned. This script:
 *
 *   1. requires every file to be `<14-digit version>_<snake_case>.sql`,
 *   2. refuses duplicate versions (two files sharing a version make apply order
 *      ambiguous and break `supabase db push`),
 *   3. records the baseline + every migration in apply order with sha256,
 *   4. verifies the manifest against the working tree byte-for-byte.
 *
 * Usage:
 *   node supabase/tests/migration_manifest.mjs --write    # regenerate
 *   node supabase/tests/migration_manifest.mjs            # verify (exit 1 on drift)
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDir = path.join(repoRoot, 'supabase/migrations');
const baselinePath = path.join(repoRoot, 'supabase/schema_and_rls.sql');
const profileBackfillPath = path.join(repoRoot, 'supabase/backfill_existing_google_profiles.sql');
const manifestPath = path.join(repoRoot, 'supabase/MIGRATION_MANIFEST.json');
const checksumPath = path.join(repoRoot, 'supabase/migrations.sha256');

function digest(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function build() {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const seen = new Map();
  const migrations = files.map((file, index) => {
    const match = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(file);
    if (!match) {
      throw new Error(`Migration filename is not <14-digit version>_<snake_case>.sql: ${file}`);
    }
    const [, version, name] = match;
    if (seen.has(version)) {
      throw new Error(
        `Duplicate migration version ${version}: "${seen.get(version)}" and "${file}". ` +
          'Renumber one file so apply order is unambiguous.',
      );
    }
    seen.set(version, file);
    const absolute = path.join(migrationsDir, file);
    return {
      order: index + 2,
      version,
      name,
      file: `supabase/migrations/${file}`,
      bytes: readFileSync(absolute).length,
      sha256: digest(absolute),
    };
  });

  if (!existsSync(baselinePath)) throw new Error('Baseline supabase/schema_and_rls.sql is missing');
  if (!existsSync(profileBackfillPath)) throw new Error('Existing-Google-user profile backfill is missing');

  return {
    schemaVersion: 1,
    generatedBy: 'supabase/tests/migration_manifest.mjs',
    applyOrder: 'baseline first, then migrations in ascending 14-digit version order',
    baseline: {
      order: 1,
      file: 'supabase/schema_and_rls.sql',
      bytes: readFileSync(baselinePath).length,
      sha256: digest(baselinePath),
    },
    profileBackfill: {
      file: 'supabase/backfill_existing_google_profiles.sql',
      bytes: readFileSync(profileBackfillPath).length,
      sha256: digest(profileBackfillPath),
    },
    migrationCount: migrations.length,
    migrations,
  };
}

function compare(expected, actual) {
  const problems = [];
  if (expected.migrationCount !== actual.migrationCount) {
    problems.push(`count ${expected.migrationCount} -> ${actual.migrationCount}`);
  }
  const expectedFiles = expected.migrations.map((entry) => entry.file);
  const actualFiles = actual.migrations.map((entry) => entry.file);
  for (const file of expectedFiles) {
    if (!actualFiles.includes(file)) problems.push(`removed ${file}`);
  }
  for (const file of actualFiles) {
    if (!expectedFiles.includes(file)) problems.push(`added ${file}`);
  }
  for (let index = 0; index < actual.migrations.length; index += 1) {
    const entry = actual.migrations[index];
    const previous = expected.migrations[index];
    if (!previous) continue;
    if (
      previous.order !== entry.order ||
      previous.version !== entry.version ||
      previous.name !== entry.name ||
      previous.file !== entry.file ||
      previous.bytes !== entry.bytes ||
      previous.sha256 !== entry.sha256
    ) {
      problems.push(`order or metadata differs at migration position ${index + 1}: ${entry.file}`);
    }
  }
  if (expected.baseline?.sha256 !== actual.baseline.sha256) problems.push('modified baseline schema_and_rls.sql');
  if (expected.profileBackfill?.file !== actual.profileBackfill.file || expected.profileBackfill?.sha256 !== actual.profileBackfill.sha256) {
    problems.push('modified or missing supabase/backfill_existing_google_profiles.sql');
  }
  return problems;
}

const manifest = build();

if (process.argv.includes('--write')) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const checksums = manifest.migrations.map((entry) => `${entry.sha256}  ${entry.file}`).join('\n');
  writeFileSync(checksumPath, `${checksums}\n`);
  console.log(`manifest written: ${manifest.migrationCount} migrations + baseline; checksum inventory refreshed`);
  process.exit(0);
}

if (!existsSync(manifestPath)) {
  console.error(`FAIL manifest missing at supabase/MIGRATION_MANIFEST.json — run with --write`);
  process.exit(1);
}

const problems = compare(JSON.parse(readFileSync(manifestPath, 'utf8')), manifest);
if (!existsSync(checksumPath)) {
  problems.push('migration checksum inventory is missing');
} else {
  const expectedChecksums = manifest.migrations.map((entry) => `${entry.sha256}  ${entry.file}`).join('\n');
  const actualChecksums = readFileSync(checksumPath, 'utf8').trimEnd();
  if (actualChecksums !== expectedChecksums) problems.push('migration checksum inventory drift');
}
if (problems.length > 0) {
  console.error(`FAIL manifest drift:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

console.log(`PASS manifest verified: baseline + ${manifest.migrationCount} migrations, unique versions, sha256 match`);
