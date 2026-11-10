import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/server/stayApi.ts', import.meta.url), 'utf8');
const requestRoute = source.slice(source.indexOf("app.post('/api/stays/requests'"));

test('stay request bookability uses the public provider projection under private profile RLS', () => {
  assert.match(requestRoute, /join public\.public_provider_profile_projection owner/);
  assert.doesNotMatch(requestRoute, /join public\.profiles owner/);
});
