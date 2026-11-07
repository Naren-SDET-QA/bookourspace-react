import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

async function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('every registry deep link has a handler in the app shell', async () => {
  const registry = await read('../src/modules/registry.ts');
  const app = await read('../src/App.tsx');

  const routes = [...registry.matchAll(/route:\s*'#([a-z0-9-]+)'/g)].map((match) => match[1]);
  assert.ok(routes.length >= 6, `expected at least 6 deep links, found ${routes.length}`);

  for (const route of routes) {
    assert.ok(
      app.includes(`hash === '${route}'`),
      `registry deep link "#${route}" has no matching hash handler in src/App.tsx`
    );
  }
});

test('the six marketplace modules are all reachable through a deep link', async () => {
  const registry = await read('../src/modules/registry.ts');
  const routes = [...registry.matchAll(/route:\s*'#([a-z0-9-]+)'/g)].map((match) => match[1]);
  for (const expected of ['pg', 'classes', 'venues', 'services', 'stays', 'movies']) {
    assert.ok(routes.includes(expected), `module deep link "#${expected}" is missing from the registry`);
  }
});
