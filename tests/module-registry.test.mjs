import assert from 'node:assert/strict';

import {
  MODULE_REGISTRY,
  getModule,
  moduleForRoute,
  resolveModuleConfig,
} from '../src/modules/registry.ts';
import {
  evaluateModuleHealth,
  healthSummary,
  withBoundedRetry,
} from '../src/server/moduleHealth.ts';
import { mergeModulesSlice, readModulesSlice, resolvePublishedPresentation } from '../src/modules/moduleConfigStore.ts';

function test(name, callback) {
  try {
    callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

async function testAsync(name, callback) {
  try {
    await callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

const enabled = (moduleKey, overrides = {}) => ({
  module_key: moduleKey,
  is_enabled: true,
  allow_contact_owner: true,
  allow_online_booking: false,
  requires_owner_approval: true,
  booking_approved_at: null,
  ...overrides,
});

console.log('\nmodule registry');

test('every module declares the full contract', () => {
  assert.ok(MODULE_REGISTRY.length >= 7);
  const ids = new Set();
  for (const module of MODULE_REGISTRY) {
    assert.match(module.id, /^[a-z_]+$/);
    assert.match(module.version, /^\d+\.\d+\.\d+$/);
    assert.ok(module.label.length > 0);
    assert.equal(ids.has(module.id), false, `duplicate module id ${module.id}`);
    ids.add(module.id);
    assert.ok(module.permissions.view === 'public');
    assert.ok(module.permissions.contactOwner === 'module_flag_and_signed_in');
    assert.ok(module.permissions.adminConfig === 'active_admin');
    assert.ok(module.config.fields.length >= 3);
    assert.ok(module.healthChecks.length >= 1);
  }
});

test('routes are unique and resolve back to their module', () => {
  const routes = MODULE_REGISTRY.map((module) => module.route).filter(Boolean);
  assert.equal(new Set(routes).size, routes.length);
  assert.equal(moduleForRoute('#pg')?.id, 'pg');
  assert.equal(moduleForRoute('#services')?.id, 'services');
  assert.equal(moduleForRoute('#stays')?.id, 'hotels');
  assert.equal(moduleForRoute('#nope'), null);
  assert.equal(getModule('hotels')?.version, '1.0.0');
  assert.equal(getModule('nope'), null);
});

test('the three redesigned sections are registered against their screens', () => {
  assert.deepEqual(getModule('hotels').screens, ['hotels_stay']);
  assert.deepEqual(getModule('pg').screens, ['pg']);
  assert.deepEqual(getModule('services').screens, ['home_services']);
  assert.deepEqual(getModule('hotels').entryPoints, ['HotelsStayExperience']);
  assert.deepEqual(getModule('pg').entryPoints, ['PGSectionExperience']);
  assert.deepEqual(getModule('services').entryPoints, ['HomeServicesSection']);
});

test('missing config falls back to registry defaults', () => {
  const resolved = resolveModuleConfig('pg', null);
  assert.equal(resolved.values.label, 'PG Accommodation');
  assert.equal(resolved.values.layout, 'grid');
  assert.equal(resolved.values.maxCategories, 12);
  assert.deepEqual(resolved.issues, []);
});

test('invalid config is reported and never blanks the screen', () => {
  const tooLong = resolveModuleConfig('pg', { label: 'x'.repeat(61) });
  assert.equal(tooLong.values.label, 'PG Accommodation');
  assert.equal(tooLong.issues.length, 1);

  const badLayout = resolveModuleConfig('pg', { layout: 'carousel' });
  assert.equal(badLayout.values.layout, 'grid');
  assert.ok(badLayout.issues[0].includes('grid, list'));

  const badUrl = resolveModuleConfig('services', { heroImage: 'javascript:alert(1)' });
  assert.equal(badUrl.values.heroImage, '');
  assert.ok(badUrl.issues[0].includes('https'));

  const badCount = resolveModuleConfig('pg', { maxCategories: 500 });
  assert.equal(badCount.values.maxCategories, 12);

  const ok = resolveModuleConfig('pg', { label: 'PGs in Hyderabad', headline: 'Rooms near work', maxCategories: 8 });
  assert.equal(ok.values.label, 'PGs in Hyderabad');
  assert.equal(ok.values.maxCategories, 8);
  assert.deepEqual(ok.issues, []);
});

test('health fails closed when flags cannot be read', () => {
  const report = evaluateModuleHealth('pg', { flags: null });
  assert.equal(report.status, 'unavailable');
  assert.equal(report.retryable, true);
  assert.ok(report.customerMessage.length > 0);
});

test('health distinguishes disabled from broken', () => {
  const disabled = evaluateModuleHealth('pg', { flags: [enabled('pg', { is_enabled: false })] });
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.retryable, false, 'a deliberate disable must not be retried');

  const healthy = evaluateModuleHealth('pg', { flags: [enabled('pg')], dataReachable: true });
  assert.equal(healthy.status, 'ok');
  assert.equal(healthy.customerMessage, null);

  const degraded = evaluateModuleHealth('pg', { flags: [enabled('pg')], configIssues: ['Label too long.'] });
  assert.equal(degraded.status, 'degraded');

  const noRow = evaluateModuleHealth('hotels', { flags: [enabled('pg')] });
  assert.equal(noRow.status, 'unavailable');

  const dataDown = evaluateModuleHealth('hotels', { flags: [enabled('hotels')], dataReachable: false });
  assert.equal(dataDown.status, 'unavailable');
});

test('unknown modules are unavailable, not silent', () => {
  const report = evaluateModuleHealth('nope', { flags: [] });
  assert.equal(report.status, 'unavailable');
  assert.equal(report.retryable, false);
});

test('health summary counts every state', () => {
  const summary = healthSummary([
    evaluateModuleHealth('pg', { flags: [enabled('pg')] }),
    evaluateModuleHealth('hotels', { flags: [enabled('hotels', { is_enabled: false })] }),
    evaluateModuleHealth('services', { flags: null }),
    evaluateModuleHealth('classes', { flags: [enabled('classes')], configIssues: ['x'] }),
  ]);
  assert.deepEqual(summary, { total: 4, healthy: 1, degraded: 1, disabled: 1, unavailable: 1 });
});

console.log('\nmodule config over live-page-config');

test('only registered module ids survive the slice', () => {
  const slice = readModulesSlice({
    modules: {
      pg: { label: 'PGs', headline: 'Rooms', extra: 'ignored' },
      nope: { label: 'Nope' },
      hotels: { maxCategories: 6 },
    },
  });
  assert.deepEqual(Object.keys(slice).sort(), ['hotels', 'pg']);
  assert.equal(slice.pg.extra, undefined);
  assert.equal(slice.hotels.maxCategories, 6);
});

test('merging preserves unrelated live-page config', () => {
  const merged = mergeModulesSlice({ pages: { home: { visible: true } }, modules: { pg: { label: 'Old' } } }, {
    pg: { label: 'New', headline: 'Fresh' },
  });
  assert.deepEqual(merged.pages, { home: { visible: true } });
  assert.equal(merged.modules.pg.label, 'New');
  assert.equal(merged.modules.pg.headline, 'Fresh');
});

test('customer resolution validates published values', () => {
  const resolved = resolvePublishedPresentation({
    modules: { pg: { label: 'PGs', maxCategories: 0 }, services: { layout: 'weird' } },
  });
  assert.equal(resolved.pg.values.label, 'PGs');
  assert.equal(resolved.pg.values.maxCategories, 12);
  assert.ok(resolved.pg.issues.length > 0);
  assert.equal(resolved.services.values.layout, 'grid');
  assert.ok(resolved.hotels.values.label.length > 0);
});

console.log('\nbounded retry');

await testAsync('retries transient failures then succeeds', async () => {
  const delays = [];
  let calls = 0;
  const result = await withBoundedRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('fetch failed');
      return 'ok';
    },
    { attempts: 3, baseDelayMs: 10, sleep: async (ms) => { delays.push(ms); } },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);
});

await testAsync('does not retry permanent failures', async () => {
  let calls = 0;
  await assert.rejects(
    withBoundedRetry(
      async () => { calls += 1; throw new Error('MODULE_DISABLED'); },
      { attempts: 3, sleep: async () => {} },
    ),
    /MODULE_DISABLED/,
  );
  assert.equal(calls, 1, 'non-transient errors must not be retried');
});

await testAsync('stops at the bounded attempt count', async () => {
  let calls = 0;
  await assert.rejects(
    withBoundedRetry(
      async () => { calls += 1; throw new Error('network timeout'); },
      { attempts: 2, sleep: async () => {} },
    ),
    /network timeout/,
  );
  assert.equal(calls, 2);
});

console.log(process.exitCode ? '\nFAILURES\n' : '\nall registry tests passed\n');
