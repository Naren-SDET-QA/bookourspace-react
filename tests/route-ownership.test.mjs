import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

test('database platform-settings routes and local compatibility handlers have exclusive owners', () => {
  const output = execFileSync(process.execPath, ['scripts/audit-duplicate-routes.mjs'], {
    encoding: 'utf8',
  });

  assert.match(output, /No route is shadowed by another registration\./);
  assert.doesNotMatch(output, /SHADOWED /);
  for (const route of [
    'GET /api/live-page-config',
    'POST /api/live-page-config/draft',
    'POST /api/live-page-config/publish',
    'POST /api/live-page-config/rollback',
    'GET /api/admin/modules',
    'PUT /api/admin/modules/:moduleKey',
  ]) {
    assert.ok(output.includes(route), `missing audited route ${route}`);
  }
});
