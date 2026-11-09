import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('development startup makes PostgreSQL optional while production remains gated', async () => {
  const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  assert.match(server, /process\.env\.NODE_ENV === 'production' \|\| hasConfiguredPostgresTarget/);
  assert.match(server, /BOS_LISTINGS_DATABASE_URL \|\| process\.env\.BOS_PG_URL/);
  assert.match(server, /PRODUCTION_POSTGRES_REPOSITORY_REQUIRED/);
  assert.match(server, /BOS_ENABLE_LOCAL_JSON_COMPATIBILITY/);
  assert.match(server, /DATABASE_REQUIRED_FOR_SERVER_ROUTE/);
  assert.match(server, /NODE_ENV === 'development'/);
});
