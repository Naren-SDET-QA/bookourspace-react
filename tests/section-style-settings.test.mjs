import assert from 'node:assert/strict';
import test from 'node:test';
import { saveSectionStyles } from '../src/lib/sectionStyleSettings.ts';

const styles = {
  pg: 'style2',
  stay: 'airbnb',
  services: 'old',
  classes: 'timetable',
  venues: 'agenda',
  movies: 'experience',
};

async function withBrowser({ token = 'test-session', fetchImpl }, run) {
  const previous = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    fetch: Object.getOwnPropertyDescriptor(globalThis, 'fetch'),
  };
  const writes = [];
  const storage = {
    getItem: (key) => key === 'bos_session_token_v1' ? token : null,
    setItem: (key, value) => writes.push([key, value]),
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage, dispatchEvent() {} } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  if (fetchImpl) Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchImpl });
  try {
    await run(writes);
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('server authorization rejection is not reported as a local preview save', async () => {
  await withBrowser({ fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'BUILDER_SUPER_ADMIN_REQUIRED' }) }) }, async (writes) => {
    assert.equal(await saveSectionStyles(styles), 'failed');
    assert.deepEqual(writes, []);
  });
});

test('only an acknowledged server publication is reported as published', async () => {
  await withBrowser({ fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, okStyles: true }) }) }, async (writes) => {
    assert.equal(await saveSectionStyles(styles), 'published');
    // Production builds do not persist the published value in browser storage.
    assert.deepEqual(writes, []);
  });
});

test('missing server identity fails closed outside a development preview', async () => {
  await withBrowser({ token: null }, async (writes) => {
    assert.equal(await saveSectionStyles(styles), 'failed');
    assert.deepEqual(writes, []);
  });
});
