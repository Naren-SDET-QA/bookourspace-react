import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRemoteSectionStyles, loadSectionStyles, saveSectionStyles, saveStylePreference } from '../src/lib/sectionStyleSettings.ts';

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


test('legacy published defaults open as Style 1', () => {
  const applied = applyRemoteSectionStyles({
    pg: 'style2', stay: 'airbnb', services: 'old', classes: 'cards', venues: 'showcase', movies: 'experience',
  });
  assert.equal(applied?.pg, 'style1');
  assert.equal(applied?.stay, 'old');
  assert.equal(applied?.classes, 'cards');
  assert.equal(applied?.venues, 'showcase');
});

test('a republished configuration keeps admin Style 2/3 choices', () => {
  const applied = applyRemoteSectionStyles({
    pg: 'style2', stay: 'airbnb', services: 'noddyy', classes: 'timetable', venues: 'agenda', movies: 'classic',
  }, 2);
  assert.equal(applied?.pg, 'style2');
  assert.equal(applied?.stay, 'airbnb');
  assert.equal(applied?.services, 'noddyy');
  assert.equal(applied?.classes, 'timetable');
  assert.equal(applied?.venues, 'agenda');
  assert.equal(applied?.movies, 'classic');
});

test('Style 3 remains a first-class published choice', () => {
  const applied = applyRemoteSectionStyles({
    pg: 'style3', stay: 'style3', services: 'noddyy', classes: 'style3', venues: 'style3', movies: 'style3',
  }, 2);
  for (const key of ['pg', 'stay', 'classes', 'venues', 'movies']) assert.equal(applied?.[key], 'style3');
  assert.equal(applied?.services, 'noddyy');
});


test('an explicit style choice survives reloads and later remote configs', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage, dispatchEvent() {} } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    saveStylePreference('pg', 'style3');
    saveStylePreference('classes', 'timetable');
    assert.equal(loadSectionStyles().pg, 'style3');
    assert.equal(loadSectionStyles().classes, 'timetable');

    const remote = applyRemoteSectionStyles({
      pg: 'style1', stay: 'old', services: 'old', classes: 'cards', venues: 'showcase', movies: 'experience',
    }, 2);
    assert.equal(remote?.pg, 'style3');
    assert.equal(remote?.classes, 'timetable');
    assert.equal(remote?.stay, 'old');

    storage.setItem('bos_section_style_prefs_v1', JSON.stringify({ pg: 'not-a-style' }));
    assert.equal(loadSectionStyles().pg, 'style1');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});
