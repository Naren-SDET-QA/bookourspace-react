import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const platformApi = fs.readFileSync(path.join(root, 'src/server/platformSettingsApi.ts'), 'utf8');
const routes = [
  ['GET', '/api/live-page-config', "app.get('/api/live-page-config'"],
  ['POST', '/api/live-page-config/draft', "app.post('/api/live-page-config/draft'"],
  ['POST', '/api/live-page-config/publish', "app.post('/api/live-page-config/publish'"],
  ['POST', '/api/live-page-config/rollback', "app.post('/api/live-page-config/rollback'"],
  ['GET', '/api/admin/modules', "app.get('/api/admin/modules'"],
  ['PUT', '/api/admin/modules/:moduleKey', "app.put('/api/admin/modules/:moduleKey'"],
];

test('PostgreSQL and local JSON platform settings routes have one startup owner', () => {
  assert.match(server, /if\s*\(platformSettingsRepository\)\s*\{\s*registerPlatformSettingsApi\(app,/s);
  for (const [, , route] of routes) {
    assert.ok(platformApi.includes(route), `PostgreSQL handler missing: ${route}`);
    const fallbackIndex = server.indexOf(route);
    assert.notEqual(fallbackIndex, -1, `local compatibility handler missing: ${route}`);
    const guardStart = server.lastIndexOf('if (!platformSettingsRepository)', fallbackIndex);
    assert.ok(guardStart >= 0, `local handler lacks inverse repository guard: ${route}`);
    assert.ok(fallbackIndex - guardStart < 100, `fallback guard is detached from route: ${route}`);
  }

  const report = execFileSync(process.execPath, ['scripts/audit-duplicate-routes.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(report, /No route is shadowed by another registration\./);
  for (const [method, route] of routes) {
    assert.match(report, new RegExp(`OK\\s+${method} ${route.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')} — mutually exclusive`));
  }
});
