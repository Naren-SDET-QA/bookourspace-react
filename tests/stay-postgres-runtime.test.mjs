import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { test } from 'node:test';
import {
  closeSharedPostgresPool,
  getSharedPostgresPool,
  initializePostgresRuntime,
  resolvePostgresTlsConnectionString,
} from '../src/server/postgresPool.ts';
import { registerStaySearchApi } from '../src/server/staySearchApi.ts';

const LOOPBACK = {
  NODE_ENV: 'test',
  BOS_LISTINGS_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/bookourspace_test?sslmode=disable',
};

function initPool({ healthErrors = [], missing = [], missingColumns = [], authError = false } = {}) {
  const calls = { health: 0, end: 0 };
  return {
    calls,
    on() { return this; },
    async query(sql) {
      if (sql.includes('select 1 as healthy')) {
        calls.health += 1;
        if (authError) throw Object.assign(new Error('secret must not escape'), { code: '28P01' });
        if (healthErrors.length) throw healthErrors.shift();
        return { rows: [{ healthy: 1 }] };
      }
      if (sql.includes('to_regclass')) {
        const names = ['stay_properties', 'stay_room_types', 'listings', 'public_provider_profile_projection', 'reviews', 'platform_module_flags'];
        return { rows: names.map((relation_name) => ({ relation_name, relation: missing.includes(relation_name) ? null : `public.${relation_name}` })) };
      }
      if (sql.includes('information_schema.columns')) return { rows: missingColumns.map((column) => ({ table_name: 'stay_properties', column_name: column })) };
      throw new Error('unexpected query');
    },
    async end() { calls.end += 1; },
  };
}

test('PostgreSQL startup requires one canonical URL and rejects invalid target configuration', async () => {
  await assert.rejects(initializePostgresRuntime({ NODE_ENV: 'development' }), /BOS_LISTINGS_DATABASE_URL_REQUIRED/);
  await assert.rejects(initializePostgresRuntime({ ...LOOPBACK, BOS_LISTINGS_DATABASE_URL: 'https://db.example.test' }), /BOS_LISTINGS_DATABASE_URL_INVALID/);
  await assert.rejects(initializePostgresRuntime({ ...LOOPBACK, BOS_PG_URL: 'postgres://127.0.0.1/other' }), /BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL|BOS_LISTINGS_DATABASE_URL_CONFLICT/);
});

test('one canonical database URL reuses one shared pool instead of duplicating initialization', async () => {
  const first = getSharedPostgresPool(LOOPBACK.BOS_LISTINGS_DATABASE_URL, LOOPBACK);
  const second = getSharedPostgresPool(LOOPBACK.BOS_LISTINGS_DATABASE_URL, LOOPBACK);
  assert.equal(first, second);
  await closeSharedPostgresPool();
});

test('Supabase TLS pooler URLs resolve the bundled root CA without weakening verify-full', () => {
  const resolved = resolvePostgresTlsConnectionString(
    'postgresql://postgres.obkfgxjzlscungkhbyvq:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',
  );
  const parsed = new URL(resolved);
  assert.equal(parsed.searchParams.get('sslmode'), 'verify-full');
  assert.match(parsed.searchParams.get('sslrootcert') || '', /supabase\/certs\/supabase-root-ca\.crt$/);
  assert.equal(resolvePostgresTlsConnectionString(LOOPBACK.BOS_LISTINGS_DATABASE_URL), LOOPBACK.BOS_LISTINGS_DATABASE_URL);
});

test('PostgreSQL startup verifies connectivity and required stay schema before serving', async () => {
  const healthy = initPool();
  const pool = await initializePostgresRuntime(LOOPBACK, () => healthy);
  assert.equal(pool, healthy);
  assert.equal(healthy.calls.health, 1);

  const incompatible = initPool({ missing: ['stay_properties'] });
  await assert.rejects(initializePostgresRuntime(LOOPBACK, () => incompatible), /BOS_STAYS_SCHEMA_OUTDATED:stay_properties/);
  assert.equal(incompatible.calls.end, 1);

  const outdatedColumns = initPool({ missingColumns: ['base_price_paise'] });
  await assert.rejects(initializePostgresRuntime(LOOPBACK, () => outdatedColumns), /BOS_STAYS_SCHEMA_OUTDATED:stay_properties\.base_price_paise/);
  assert.equal(outdatedColumns.calls.end, 1);
});

test('startup fails explicitly and safely on invalid credentials or unavailable PostgreSQL', async () => {
  const invalidAuth = initPool({ authError: true });
  await assert.rejects(initializePostgresRuntime(LOOPBACK, () => invalidAuth), /BOS_LISTINGS_DATABASE_AUTHENTICATION_FAILED/);
  assert.equal(invalidAuth.calls.end, 1);

  const unavailable = initPool({ healthErrors: Array.from({ length: 3 }, () => Object.assign(new Error('private connection detail'), { code: 'ECONNREFUSED' })) });
  await assert.rejects(initializePostgresRuntime(LOOPBACK, () => unavailable), /BOS_LISTINGS_DATABASE_UNAVAILABLE/);
  assert.equal(unavailable.calls.health, 3);
  assert.equal(unavailable.calls.end, 1);
});

test('startup retries transient database failures a bounded number of times', async () => {
  const pool = initPool({
    healthErrors: [
      Object.assign(new Error('temporary'), { code: '08006' }),
      Object.assign(new Error('temporary'), { code: '57P01' }),
    ],
  });
  await initializePostgresRuntime(LOOPBACK, () => pool);
  assert.equal(pool.calls.health, 3);
});

function makeSearchPool({ rows = [], transientSearchErrors = [], exhausted = 0, moduleEnabled = true } = {}) {
  const state = { connected: 0, released: 0, discarded: 0, active: 0, maxActive: 0, roles: 0, demoGuc: 0, sql: '' };
  const waiters = [];
  return {
    state,
    async connect() {
      if (exhausted > 0) {
        exhausted -= 1;
        throw Object.assign(new Error('pool busy'), { code: '53300' });
      }
      if (state.active >= 8) await new Promise((resolve) => waiters.push(resolve));
      state.connected += 1;
      state.active += 1;
      state.maxActive = Math.max(state.maxActive, state.active);
      return {
        async query(sql, values = []) {
          if (sql === 'SET LOCAL ROLE anon') state.roles += 1;
          if (sql.includes("bos.allow_demo_booking")) state.demoGuc += 1;
          if (sql.includes('platform_module_flags')) return { rows: [{ is_enabled: moduleEnabled }] };
          if (sql.includes('with base as')) {
            state.sql = sql;
            if (transientSearchErrors.length) {
              const error = transientSearchErrors.shift();
              throw error;
            }
            const hostParam = sql.match(/p\.owner_user_id = \$(\d+)::uuid/);
            const requestedHost = hostParam ? values[Number(hostParam[1]) - 1] : null;
            const excludeDemo = sql.includes("coalesce(l.payload->>'demo', 'false') <> 'true'");
            const visible = rows.filter((row) =>
              row.listingStatus === 'active' && row.propertyActive && row.listingVerified &&
              row.verifiedBy && row.stayLifecycle === 'approved' && row.ownerVerified && (!excludeDemo || !row.demo) &&
              (!requestedHost || row.ownerId === requestedHost),
            );
            await new Promise((resolve) => setImmediate(resolve));
            return { rows: [{ total: visible.length, rows: visible.map((row) => ({
              id: row.id,
              listing_id: row.listingId,
              name: row.name,
              property_type: 'hotel',
              place_type: 'entire_home',
              city: row.city,
              payload: {},
              amenities: [],
            })) }] };
          }
          return { rows: [] };
        },
        release(error) {
          state.released += 1;
          if (error) state.discarded += 1;
          state.active -= 1;
          waiters.shift()?.();
        },
      };
    },
  };
}

async function withSearchServer(pool, env = { NODE_ENV: 'test', BOS_LISTINGS_DATABASE_URL: LOOPBACK.BOS_LISTINGS_DATABASE_URL }) {
  const app = express();
  registerStaySearchApi(app, { verifySession: () => null, env, pool });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    async search(query = '') {
      return fetch(`http://127.0.0.1:${address.port}/api/stays/search${query}`);
    },
    async close() { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); },
  };
}

const approved = {
  id: 'prop-1', listingId: 'listing-1', name: 'Verified Stay', city: 'Pune',
  listingStatus: 'active', propertyActive: true, listingVerified: true,
  verifiedBy: 'admin-1', stayLifecycle: 'approved', ownerVerified: true, demo: false,
  ownerId: '11111111-1111-4111-8111-111111111111',
};

test('stay search returns only active, verified, approved, eligible listings as anon', async () => {
  const pool = makeSearchPool({ rows: [
    approved,
    { ...approved, id: 'draft', listingId: 'draft', listingStatus: 'pending_approval' },
    { ...approved, id: 'unverified', listingId: 'unverified', listingVerified: false },
    { ...approved, id: 'unapproved', listingId: 'unapproved', stayLifecycle: 'submitted' },
    { ...approved, id: 'unverified-owner', listingId: 'unverified-owner', ownerVerified: false },
    { ...approved, id: 'demo', listingId: 'demo', demo: true },
  ] });
  const server = await withSearchServer(pool);
  try {
    const response = await server.search();
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.items.map((item) => item.listingId), ['listing-1']);
    assert.equal(pool.state.roles, 1);
    assert.match(pool.state.sql, /l\.status = 'active'/);
    assert.match(pool.state.sql, /l\.is_verified is true/);
    assert.match(pool.state.sql, /l\.payload->>'stayLifecycle' = 'approved'/);
    assert.match(pool.state.sql, /host\.verified is true/);
    // Every card must pass the same hard gates as checkout: one owner for the
    // listing and property, active inventory, and no sold-out inventory.
    assert.match(pool.state.sql, /l\.owner_id = p\.owner_user_id/);
    assert.match(pool.state.sql, /stay_room_types rt_inv/);
    assert.match(pool.state.sql, /stay_units u_inv/);
    assert.match(pool.state.sql, /availability,status/);
  } finally { await server.close(); }
});

test('empty database results return an empty PostgreSQL result, never fixture/demo fallback', async () => {
  const pool = makeSearchPool();
  const server = await withSearchServer(pool, { ...LOOPBACK, BOS_STAY_INCLUDE_DEMO: '0' });
  try {
    const response = await server.search();
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.source, 'postgresql');
    assert.deepEqual(body.items, []);
    assert.equal(body.fixtures, false);
    assert.equal(body.liveInventory, true);
  } finally { await server.close(); }
});

test('demo inventory appears only when the local preview both includes and allows booking it', async () => {
  const demoRow = { ...approved, id: 'demo-1', listingId: 'demo-1', demo: true };

  const defaultPool = makeSearchPool({ rows: [demoRow] });
  const defaultServer = await withSearchServer(defaultPool);
  try {
    const body = await (await defaultServer.search()).json();
    assert.deepEqual(body.items, []);
    assert.equal(body.fixtures, false);
    assert.equal(defaultPool.state.demoGuc, 0, 'production-style searches never enable demo booking');
  } finally { await defaultServer.close(); }

  // Including demo rows without allowing their booking would advertise cards
  // that checkout must refuse; the feed now hides them instead.
  const includeOnlyPool = makeSearchPool({ rows: [demoRow] });
  const includeOnlyServer = await withSearchServer(includeOnlyPool, { ...LOOPBACK, BOS_STAY_INCLUDE_DEMO: '1' });
  try {
    const body = await (await includeOnlyServer.search()).json();
    assert.deepEqual(body.items, [], 'an unbookable demo card must never be listed');
    assert.equal(includeOnlyPool.state.demoGuc, 0, 'no demo GUC when demo booking is refused');
  } finally { await includeOnlyServer.close(); }

  const previewPool = makeSearchPool({ rows: [demoRow] });
  const previewServer = await withSearchServer(previewPool, {
    ...LOOPBACK, BOS_STAY_INCLUDE_DEMO: '1', BOS_STAY_ALLOW_DEMO_BOOKING: '1',
  });
  try {
    const body = await (await previewServer.search()).json();
    assert.equal(body.fixtures, true);
    assert.deepEqual(body.items.map((item) => item.listingId), ['demo-1']);
    assert.equal(body.items[0].demoBookable, true);
    assert.equal(previewPool.state.demoGuc, 1, 'the search read path uses the same demo gate as checkout');
  } finally { await previewServer.close(); }
});

test('transient disconnect and pool exhaustion recover once without leaking clients', async () => {
  const pool = makeSearchPool({
    rows: [approved],
    transientSearchErrors: [Object.assign(new Error('connection reset'), { code: '08006' })],
    exhausted: 1,
  });
  const server = await withSearchServer(pool);
  try {
    const response = await server.search();
    assert.equal(response.status, 200);
    assert.equal(pool.state.connected, 2);
    assert.equal(pool.state.released, 2);
    assert.equal(pool.state.discarded, 1);
    assert.equal(pool.state.active, 0);
  } finally { await server.close(); }
});

test('persistent pool exhaustion returns a retryable 503 and acquires no leaked clients', async () => {
  const pool = makeSearchPool({ exhausted: 4 });
  const server = await withSearchServer(pool);
  try {
    const response = await server.search();
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error, 'STAY_SEARCH_DATABASE_UNAVAILABLE');
    assert.equal(pool.state.connected, 0);
    assert.equal(pool.state.active, 0);
  } finally { await server.close(); }
});

test('concurrent searches are bounded by the PostgreSQL pool and release every client', async () => {
  const pool = makeSearchPool({ rows: [approved] });
  const server = await withSearchServer(pool);
  try {
    const responses = await Promise.all(Array.from({ length: 12 }, () => server.search()));
    assert.ok(responses.every((response) => response.status === 200));
    assert.ok(pool.state.maxActive <= 8);
    assert.equal(pool.state.active, 0);
    assert.equal(pool.state.released, 12);
  } finally { await server.close(); }
});

test('requesting a listing owned by another host returns no data under anon access', async () => {
  const pool = makeSearchPool({ rows: [approved] });
  const server = await withSearchServer(pool);
  try {
    const response = await server.search('?hostId=22222222-2222-4222-8222-222222222222');
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.items, []);
    assert.equal(pool.state.roles, 1);
    assert.match(pool.state.sql, /p\.owner_user_id = \$\d+::uuid/);
  } finally { await server.close(); }
});

test('module state read failure is closed, not treated as enabled', async () => {
  const pool = makeSearchPool({ moduleEnabled: false });
  const server = await withSearchServer(pool);
  try {
    const response = await server.search();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'MODULE_DISABLED');
  } finally { await server.close(); }
});

test('no configured PostgreSQL path registers no demo or fixture response', async () => {
  const app = express();
  registerStaySearchApi(app, { verifySession: () => null, env: { NODE_ENV: 'test' } });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/stays/search`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error, 'STAY_SEARCH_UNAVAILABLE');
    assert.match(body.message, /PostgreSQL repository/);
    assert.equal(body.items, undefined);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
