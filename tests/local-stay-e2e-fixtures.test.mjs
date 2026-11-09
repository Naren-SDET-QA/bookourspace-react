import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertLocalStayE2EFixtureTarget,
  LOCAL_STAY_E2E_FIXTURES,
} from '../src/server/localStayE2EFixtures.ts';

const local = 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';
const env = { NODE_ENV: 'development', BOS_LOCAL_STAY_E2E_SEED: 'true', BOS_DEV_DB_PORT: '55440' };

test('local stay fixture seeding requires explicit opt-in and refuses production', () => {
  assert.throws(() => assertLocalStayE2EFixtureTarget(local, { ...env, BOS_LOCAL_STAY_E2E_SEED: undefined }), /OPT_IN_REQUIRED/);
  assert.throws(() => assertLocalStayE2EFixtureTarget(local, { ...env, NODE_ENV: 'production' }), /OPT_IN_REQUIRED/);
});

test('local stay fixture seeding rejects hosted, wrong database, and wrong port targets', () => {
  assert.throws(() => assertLocalStayE2EFixtureTarget('postgres://user@db.example.test:55440/bookourspace_dev', env), /MUST_BE_LOOPBACK/);
  assert.throws(() => assertLocalStayE2EFixtureTarget('postgres://postgres@127.0.0.1:55440/postgres', env), /DATABASE_ID_MISMATCH/);
  assert.throws(() => assertLocalStayE2EFixtureTarget('postgres://postgres@127.0.0.1:5432/bookourspace_dev', env), /DATABASE_ID_MISMATCH/);
});

test('fixture catalog is a small, explicitly test-only set with no demo-booking bypass', () => {
  assert.equal(LOCAL_STAY_E2E_FIXTURES.length, 3);
  assert.equal(new Set(LOCAL_STAY_E2E_FIXTURES.map((fixture) => fixture.listingId)).size, 3);
  for (const fixture of LOCAL_STAY_E2E_FIXTURES) {
    assert.match(fixture.title, /^LOCAL TEST ONLY · /);
    assert.ok(fixture.pricePaise > 0);
    assert.ok(fixture.maxGuests > 0);
  }
});
