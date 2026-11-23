import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRemoteSectionStyles, canonicalizeServicesHash, loadSectionStyles, sanitizeServicesReturnHash, saveSectionStyles, saveStylePreference } from '../src/lib/sectionStyleSettings.ts';
import { clearSessionCsrfToken, setSessionCsrfToken } from '../src/lib/sessionCsrf.ts';

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
  // The browser holds only an in-memory CSRF proof now, so the stub installs it
  // the same way the auth flow does.
  setSessionCsrfToken(token);
  try {
    await run(writes);
  } finally {
    clearSessionCsrfToken();
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


test('legacy published defaults open PG as Style 3 and Services as Triangle', () => {
  const applied = applyRemoteSectionStyles({
    pg: 'style2', stay: 'airbnb', services: 'old', classes: 'cards', venues: 'showcase', movies: 'experience',
  });
  assert.equal(applied?.pg, 'style3');
  assert.equal(applied?.stay, 'old');
  assert.equal(applied?.venues, 'agenda');
  assert.equal(applied?.services, 'triangle');
});

test('PG stays Style 3 and Services stay Triangle while other sections keep published choices', () => {
  const applied = applyRemoteSectionStyles({
    pg: 'style2', stay: 'airbnb', services: 'noddyy', classes: 'timetable', venues: 'agenda', movies: 'classic',
  }, 2);
  assert.equal(applied?.pg, 'style3');
  assert.equal(applied?.classes, 'timetable');
  assert.equal(applied?.stay, 'airbnb');
  assert.equal(applied?.services, 'triangle');
  assert.equal(applied?.venues, 'agenda');
  assert.equal(applied?.movies, 'classic');
});

test('Style 3 remains a first-class published choice', () => {
  const applied = applyRemoteSectionStyles({
    pg: 'style3', stay: 'style3', services: 'noddyy', classes: 'style3', venues: 'style3', movies: 'style3',
  }, 2);
  for (const key of ['pg', 'stay', 'classes', 'movies']) assert.equal(applied?.[key], 'style3');
  assert.equal(applied?.venues, 'agenda');
  // Services ships only Style 2; Style 1 and Style 3 are disabled.
  assert.equal(applied?.services, 'triangle');
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
    saveStylePreference('classes', 'style4');
    assert.equal(loadSectionStyles().pg, 'style3');
    assert.equal(loadSectionStyles().classes, 'style4');

    const remote = applyRemoteSectionStyles({
      pg: 'style1', stay: 'old', services: 'old', classes: 'style4', venues: 'showcase', movies: 'experience',
    }, 2);
    assert.equal(remote?.pg, 'style3');
    assert.equal(remote?.classes, 'style4');
    assert.equal(remote?.services, 'triangle');
    assert.equal(remote?.stay, 'old');

    storage.setItem('bos_section_style_prefs_v1', JSON.stringify({ pg: 'not-a-style' }));
    assert.equal(loadSectionStyles().pg, 'style3');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});


test('retired Services hashes and stored Style 1 cannot reopen the old layout', () => {
  assert.equal(sanitizeServicesReturnHash('#services/old'), '#services');
  assert.equal(sanitizeServicesReturnHash('#services/style1'), '#services');
  assert.equal(sanitizeServicesReturnHash('#services/noddyy'), '#services');
  assert.equal(sanitizeServicesReturnHash('#classes/style4'), '#classes/style4');
  assert.equal(sanitizeServicesReturnHash('#classes/old'), '#classes/style4');
  assert.equal(sanitizeServicesReturnHash('#classes/style3'), '#classes/style3');
  assert.equal(sanitizeServicesReturnHash('#stays/old'), '#stays/old');

  const store = new Map();
  store.set('bos_section_styles_v2', JSON.stringify({
    pg: 'style3', stay: 'airbnb', services: 'old', classes: 'style4', venues: 'agenda', movies: 'experience',
  }));
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  let replaced = '';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage,
      dispatchEvent() {},
      location: { hash: '#services/old', pathname: '/', search: '' },
      history: { replaceState(_s, _t, url) { replaced = String(url); } },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { hash: '#services/old', pathname: '/', search: '' },
  });
  try {
    assert.equal(loadSectionStyles().services, 'triangle');
    assert.equal(JSON.parse(store.get('bos_section_styles_v2')).services, 'triangle');
    canonicalizeServicesHash();
    assert.equal(replaced, '/#services');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
    else delete globalThis.location;
  }
});

test('PG and Classes cannot be published or preferred as Style 1/2', async () => {
  let publishedBody = null;
  await withBrowser({
    fetchImpl: async (_url, init) => {
      publishedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ ok: true, okStyles: true }) };
    },
  }, async () => {
    assert.equal(await saveSectionStyles({ ...styles, pg: 'style1', services: 'old', classes: 'style4' }), 'published');
  });
  assert.equal(publishedBody?.styles.pg, 'style3');
  assert.equal(publishedBody?.styles.services, 'triangle');
  assert.equal(publishedBody?.styles.classes, 'style4');

  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage, dispatchEvent() {} } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    saveStylePreference('pg', 'style1');
    saveStylePreference('services', 'old');
    saveStylePreference('classes', 'style4');
    assert.equal(loadSectionStyles().pg, 'style3');
    assert.equal(loadSectionStyles().services, 'triangle');
    assert.equal(loadSectionStyles().classes, 'style4');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});
