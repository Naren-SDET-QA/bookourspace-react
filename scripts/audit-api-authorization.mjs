/**
 * Read-only API authorization inventory.
 *
 * Extracts every route literal registered by the server and classifies how it is
 * authorized, so a review can see which routes are covered by the centralized
 * engine gates, which are admin-guarded, which are deliberately public, and
 * which keep a handler's own check.
 *
 * Usage: node scripts/audit-api-authorization.mjs [--json]
 * It never imports or starts the application and never touches a database.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const PROVIDER_GATES = [
  '/api/provider',
  '/api/stays/host',
  '/api/movies/screens',
  '/api/movies/showtimes',
  '/api/services/earnings',
  '/api/services/payment-claims',
  '/api/services/provider',
  '/api/services/workers',
  '/api/provider-portal',
  '/api/pg/bookings',
  '/api/services/bookings',
  '/api/venue-bookings',
  '/api/stays/bookings',
];

const CUSTOMER_GATES = [
  '/api/stays/bookings',
  '/api/stays/holds',
  '/api/stays/requests',
  '/api/stays/wishlists',
  '/api/pg/bookings',
  '/api/venue-bookings',
  '/api/services/bookings',
  '/api/classes/enrollments',
];

// Public discovery, health, session-establishment and read-only catalogue
// routes. Anything else without a gate is reported as handler-authorized.
const PUBLIC_PREFIXES = [
  '/health',
  '/api/health',
  '/api/ready',
  '/api/live',
  '/api/auth/',
  '/api/live-page-config',
  '/api/modules',
  '/api/marketplace/',
  '/api/locations/',
  '/api/stays/search',
  '/api/stays/listings',
  '/api/movies/inventory',
  '/api/movies/showtimes',
  '/api/ai/quick-book',
];

const METHOD_ROUTE = /app\.(get|post|put|patch|delete|head|options)\(\s*(?:\[([^\]]*)\]|'([^']+)'|"([^"]+)")/g;

function sourceFiles() {
  const serverDir = path.join(root, 'src', 'server');
  const files = [path.join(root, 'server.ts')];
  for (const entry of fs.readdirSync(serverDir)) {
    if (!entry.endsWith('.ts')) continue;
    files.push(path.join(serverDir, entry));
  }
  return files;
}

function routePaths(argument) {
  if (!argument) return [];
  // An array registration captures its inner text with quotes; a single-path
  // registration captures the bare path without them.
  const quoted = Array.from(argument.matchAll(/['"]([^'"]+)['"]/g)).map((match) => match[1]);
  return quoted.length > 0 ? quoted : [argument.trim()];
}

function normalize(routePath) {
  return `/${String(routePath).replace(/^\/+/, '')}`;
}

function matchesPrefix(routePath, prefixes) {
  const value = normalize(routePath);
  return prefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}/`));
}

function classify(method, routePath) {
  const value = normalize(routePath);
  if (value.startsWith('/api/admin/')) return 'admin-guard';
  if (matchesPrefix(value, PROVIDER_GATES)) return 'provider-engine-gate';
  if (matchesPrefix(value, CUSTOMER_GATES)) return 'customer-engine-gate';
  if (value === '/api/seats' || value.startsWith('/api/seats/') || value.startsWith('/api/movies/bookings')) {
    return 'hard-disabled-410';
  }
  if (matchesPrefix(value, PUBLIC_PREFIXES)) return 'public-by-design';
  return 'handler-authorized';
}

const routes = [];
for (const file of sourceFiles()) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  for (const match of source.matchAll(METHOD_ROUTE)) {
    const method = match[1].toUpperCase();
    const argument = match[2] ?? match[3] ?? match[4];
    for (const routePath of routePaths(argument)) {
      routes.push({ method, path: routePath, file: relative, classification: classify(method, routePath) });
    }
  }
}

const deduped = new Map();
for (const route of routes) {
  const key = `${route.method} ${route.path} ${route.file}`;
  deduped.set(key, route);
}

const ordered = Array.from(deduped.values()).sort(
  (a, b) => a.classification.localeCompare(b.classification) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(ordered, null, 2));
  process.exit(0);
}

const counts = {};
for (const route of ordered) counts[route.classification] = (counts[route.classification] || 0) + 1;

console.log(`# API authorization inventory\n`);
console.log(`Routes registered: ${ordered.length}\n`);
for (const [classification, count] of Object.entries(counts).sort()) {
  console.log(`- ${classification}: ${count}`);
}
for (const classification of Object.keys(counts).sort()) {
  if (classification !== 'handler-authorized') continue;
  console.log(`\n## ${classification}\n`);
  for (const route of ordered.filter((entry) => entry.classification === classification)) {
    console.log(`- ${route.method} ${route.path}  (${route.file})`);
  }
}
