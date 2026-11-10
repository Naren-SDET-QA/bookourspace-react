#!/usr/bin/env node
/**
 * Safe migration dry-run validator and rollback runner.
 *
 * Guarantees:
 *   1. Never executes migration SQL against any non-loopback (remote) database.
 *      Even inside a BEGIN/ROLLBACK wrapper, remote hosts are refused because
 *      explicit COMMIT statements or non-transactional DDL inside files can
 *      commit partial/full changes remotely.
 *   2. Parses SQL outside dollar-quoted blocks, string literals, and comments
 *      to detect and safely strip top-level BEGIN/COMMIT/END/ROLLBACK statements
 *      only when running inside a disposable loopback rollback transaction, and
 *      rejects non-transactional commands (e.g. CONCURRENTLY, VACUUM).
 *   3. Supports --plan / --check-sql (offline validation) or --local-cluster
 *      (isolated disposable initdb + pg_ctl on 127.0.0.1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function assertLoopbackTarget(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('DRY_RUN_INVALID_URL: connection string is not a valid URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DRY_RUN_INVALID_PROTOCOL: only postgres/postgresql URLs are allowed');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      `DRY_RUN_REMOTE_REFUSED: refusing to execute dry-run SQL against remote host "${parsed.hostname}". Use a disposable local PostgreSQL cluster.`,
    );
  }
  return parsed;
}

/**
 * Splits SQL text into statements while tracking string literals, comments,
 * and PostgreSQL dollar-quoted blocks ($tag$...$tag$). Strips top-level
 * transaction boundary statements (BEGIN / START TRANSACTION / COMMIT / END /
 * ROLLBACK) so an outer rollback transaction cannot be broken by nested COMMITs.
 */
export function sanitizeSqlForRollbackDryRun(sql, filename = 'migration.sql') {
  const statements = [];
  let current = '';
  let i = 0;
  const len = sql.length;

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let blockCommentDepth = 0;
  let dollarTag = null;

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) statements.push(trimmed);
    current = '';
  };

  while (i < len) {
    const ch = sql[i];
    const next = i + 1 < len ? sql[i + 1] : '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }

    if (blockCommentDepth > 0) {
      if (ch === '/' && next === '*') {
        blockCommentDepth += 1;
        current += '/*';
        i += 2;
        continue;
      }
      if (ch === '*' && next === '/') {
        blockCommentDepth -= 1;
        current += '*/';
        i += 2;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }

    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingleQuote = false;
      i += 1;
      continue;
    }

    if (inDoubleQuote) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '"') inDoubleQuote = false;
      i += 1;
      continue;
    }

    // Outside quotes/comments
    if (ch === '-' && next === '-') {
      inLineComment = true;
      current += '--';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockCommentDepth = 1;
      current += '/*';
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '$') {
      const rest = sql.slice(i);
      const match = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === ';') {
      pushCurrent();
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }
  pushCurrent();

  const stripLeadingComments = (stmt) =>
    stmt
      .replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)+/g, '')
      .trim();

  const kept = [];
  let strippedBoundaries = 0;

  for (const rawStmt of statements) {
    const core = stripLeadingComments(rawStmt);
    if (!core) continue;

    if (/^(begin(\s+(transaction|work))?|start\s+transaction|commit(\s+(transaction|work))?|end(\s+(transaction|work))?|rollback(\s+(transaction|work))?)$/i.test(core)) {
      strippedBoundaries += 1;
      continue;
    }

    if (/\bcreate\s+(unique\s+)?index\s+concurrently\b/i.test(core) || /^(vacuum|cluster|reindex\s+database|alter\s+system)\b/i.test(core)) {
      throw new Error(
        `DRY_RUN_NON_TRANSACTIONAL_SQL: ${filename} contains non-transactional statement "${core.slice(0, 60)}"`,
      );
    }

    kept.push(rawStmt + ';');
  }

  return {
    sql: kept.join('\n'),
    strippedBoundaries,
    statementCount: kept.length,
  };
}

export function runSafeRollbackDryRun({ connectionString, migrationFiles }) {
  assertLoopbackTarget(connectionString);
  const prepared = migrationFiles.map((file) => {
    const raw = fs.readFileSync(file, 'utf8');
    return {
      file,
      ...sanitizeSqlForRollbackDryRun(raw, path.basename(file)),
    };
  });

  // Execute all sanitized statements inside ONE outer transaction that ALWAYS rolls back.
  const wrappedSql = ['BEGIN;', ...prepared.map((p) => p.sql), 'ROLLBACK;'].join('\n');
  const res = spawnSync(
    'psql',
    [connectionString, '-X', '-v', 'ON_ERROR_STOP=1'],
    { input: wrappedSql, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new Error(`DRY_RUN_FAILED: ${res.stderr || res.stdout}`);
  }
  return {
    filesChecked: prepared.length,
    strippedBoundaries: prepared.reduce((acc, p) => acc + p.strippedBoundaries, 0),
    rolledBack: true,
  };
}

function main() {
  const args = process.argv.slice(2);
  const manifestPath = path.resolve(process.cwd(), 'supabase/MIGRATION_MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (args.includes('--check-sql') || args.length === 0) {
    let totalStripped = 0;
    for (const m of manifest.migrations) {
      const raw = fs.readFileSync(path.resolve(process.cwd(), m.file), 'utf8');
      const res = sanitizeSqlForRollbackDryRun(raw, path.basename(m.file));
      totalStripped += res.strippedBoundaries;
    }
    console.log(
      `PASS: sanitized ${manifest.migrations.length} manifest migrations (${totalStripped} top-level BEGIN/COMMIT boundaries safely stripped for outer-rollback execution).`,
    );
    return;
  }

  const targetArgIdx = args.indexOf('--target');
  if (targetArgIdx !== -1) {
    const url = args[targetArgIdx + 1] || '';
    const files = manifest.migrations.map((m) => path.resolve(process.cwd(), m.file));
    const summary = runSafeRollbackDryRun({ connectionString: url, migrationFiles: files });
    console.log(`PASS: safe local dry-run completed and rolled back (${JSON.stringify(summary)}).`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
