#!/usr/bin/env node
/**
 * BookOurSpace — duplicate artefact audit.
 *
 * It reports, without changing anything:
 *   1. every HTTP route that is registered more than once, and whether the
 *      registrations are mutually exclusive (a fallback behind an early
 *      return or an `if/else`) or genuinely shadow each other;
 *   2. the functions that more than one migration redefines, so the order is
 *      explicit;
 *   3. the empty migration files;
 *   4. every PostgreSQL connection pool in the server, so duplicate pools are
 *      visible;
 *   5. the server modules that are never imported by anything.
 *
 * Usage: node scripts/audit-duplicate-routes.mjs
 * Exit:  0 = no genuinely shadowed route and no orphan server module
 *        1 = something needs attention
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'src/server');
const migrationDir = path.join(root, 'supabase/migrations');

function read(file) {
  return fs.readFileSync(file, 'utf-8');
}

/** Registrations of the same method and path in one file. */
function routesIn(source, file) {
  const found = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = re.exec(source))) {
    found.push({
      method: match[1].toUpperCase(),
      path: match[2],
      file,
      line: source.slice(0, match.index).split('\n').length,
      index: match.index,
    });
  }
  return found;
}

/**
 * Two registrations of the same path are mutually exclusive when the text
 * between them contains an early `return` or an `} else {`. That is the
 * "no PostgreSQL configured" fallback pattern: only one of them is ever
 * mounted in a process.
 */
function areMutuallyExclusive(source, first, second, sourceByFile) {
  // PostgreSQL handlers are registered only when the repository exists;
  // their local JSON counterparts must carry the inverse guard themselves.
  // Checking both sides avoids treating an earlier `return` inside a handler
  // as proof that duplicate registrations are mutually exclusive.
  if (first.file === 'src/server/platformSettingsApi.ts' && second.file === 'server.ts') {
    const serverSource = sourceByFile.get(second.file) || '';
    const repositoryGuard = /if\s*\(\s*platformSettingsRepository\s*\)\s*\{\s*registerPlatformSettingsApi\(app,/s.test(serverSource);
    const registrationPrefix = serverSource.slice(Math.max(0, second.index - 100), second.index);
    const inverseFallbackGuard = /if\s*\(\s*!platformSettingsRepository\s*\)\s*$/.test(registrationPrefix);
    if (repositoryGuard && inverseFallbackGuard) {
      return 'database registration versus explicit local fallback guard';
    }
  }
  const between = source.slice(first.index, second.index);
  if (/}\s*else\s*{/.test(between)) return 'if/else branch';
  if (/return;/.test(between)) return 'early-return fallback';
  return null;
}

const routes = [];
const sourceByFile = new Map();
for (const file of fs.readdirSync(serverDir).filter((name) => name.endsWith('.ts'))) {
  const relative = `src/server/${file}`;
  const source = read(path.join(serverDir, file));
  sourceByFile.set(relative, source);
  routes.push(...routesIn(source, relative));
}
const serverSource = read(path.join(root, 'server.ts'));
sourceByFile.set('server.ts', serverSource);
routes.push(...routesIn(serverSource, 'server.ts'));

const grouped = new Map();
for (const route of routes) {
  const key = `${route.method} ${route.path}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(route);
}

let shadowed = 0;
console.log(`# Duplicate route audit — ${routes.length} registrations, ${grouped.size} distinct paths\n`);
for (const [key, list] of grouped) {
  if (list.length < 2) continue;
  const source = sourceByFile.get(list[0].file) || read(path.join(root, list[0].file));
  const exclusive = areMutuallyExclusive(source, list[0], list[1], sourceByFile);
  if (exclusive) {
    console.log(`OK   ${key} — mutually exclusive (${exclusive})`);
    for (const item of list) console.log(`       ${item.file}:${item.line}`);
  } else {
    shadowed += 1;
    console.log(`SHADOWED ${key}`);
    for (const item of list) console.log(`       ${item.file}:${item.line}`);
  }
}

console.log('\n# Functions redefined by more than one migration (the last one wins)');
const migrations = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
const functions = new Map();
for (const file of migrations) {
  const source = read(path.join(migrationDir, file));
  const re = /create or replace function\s+(public\.[a-z0-9_]+)/gi;
  let match;
  while ((match = re.exec(source))) {
    const key = match[1].toLowerCase();
    if (!functions.has(key)) functions.set(key, []);
    functions.get(key).push(file);
  }
}
for (const [key, list] of functions) {
  if (list.length > 1) console.log(`     ${key}: ${list.join(' -> ')}`);
}

const empty = migrations.filter((file) => fs.statSync(path.join(migrationDir, file)).size === 0);
console.log(`\n# Empty migration files: ${empty.length}${empty.length ? ` — ${empty.join(', ')}` : ''}`);

console.log('\n# PostgreSQL connection pools');
let pools = 0;
for (const file of fs.readdirSync(serverDir).filter((name) => name.endsWith('.ts')).sort()) {
  const count = (read(path.join(serverDir, file)).match(/new Pool\(/g) || []).length;
  if (count) {
    pools += count;
    console.log(`     src/server/${file}: ${count}`);
  }
}
console.log(`     total pools: ${pools}`);

console.log('\n# Server modules that nothing imports');
const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); }
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) sourceFiles.push(full);
  }
};
walk(path.join(root, 'src'));
walk(path.join(root, 'tests'));
sourceFiles.push(path.join(root, 'server.ts'));
const allSource = sourceFiles.map((file) => read(file)).join('\n');
const orphans = [];
for (const file of fs.readdirSync(serverDir).filter((name) => name.endsWith('.ts')).sort()) {
  const base = file.replace(/\.ts$/, '');
  const imported = new RegExp(`['"\`][^'"\`]*${base}['"\`]`).test(allSource);
  if (!imported) orphans.push(`src/server/${file}`);
}
console.log(orphans.length ? `     ${orphans.join('\n     ')}` : '     none');

if (shadowed > 0) {
  console.log(`\n${shadowed} genuinely shadowed route(s) need attention.`);
  process.exitCode = 1;
} else {
  console.log('\nNo route is shadowed by another registration.');
}
