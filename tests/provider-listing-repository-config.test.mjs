import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderListingRepository } from '../src/server/providerListingRepository.ts';

test('listing repository stays unconfigured when no local database URL is supplied', () => {
  assert.equal(ProviderListingRepository.fromEnvironment({ NODE_ENV: 'test' }), null);
});

test('listing repository accepts loopback or an explicit TLS Supabase development target', async () => {
  const repository = ProviderListingRepository.fromEnvironment({
    NODE_ENV: 'test',
    BOS_LISTINGS_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/bos_test',
  });
  assert.ok(repository instanceof ProviderListingRepository);
  await repository.close();

  assert.throws(
    () => ProviderListingRepository.fromEnvironment({
      NODE_ENV: 'test',
      BOS_LISTINGS_DATABASE_URL: 'postgres://localhost.example.invalid/bos_test',
    }),
    /BOS_DEVELOPMENT_POSTGRES_TARGET_NOT_ALLOWLISTED/,
  );
  const developmentRepository = ProviderListingRepository.fromEnvironment({
    NODE_ENV: 'development',
    BOS_LISTINGS_DATABASE_URL:
      'postgresql://postgres:placeholder@db.obkfgxjzlscungkhbyvq.supabase.co:5432/postgres?sslmode=verify-full',
    BOS_ALLOW_REMOTE_DEVELOPMENT_DATABASE: '1',
    BOS_DEVELOPMENT_DATABASE_PROJECT_ID: 'obkfgxjzlscungkhbyvq',
  });
  assert.ok(developmentRepository instanceof ProviderListingRepository);
  await developmentRepository.close();
  assert.throws(
    () => ProviderListingRepository.fromEnvironment({
      NODE_ENV: 'development',
      BOS_LISTINGS_DATABASE_URL: 'https://127.0.0.1/bos_test',
    }),
    /BOS_LISTINGS_DATABASE_URL_INVALID/,
  );
});

test('production accepts a TLS remote PostgreSQL target and refuses an insecure one', async () => {
  assert.throws(
    () => ProviderListingRepository.fromEnvironment({
      NODE_ENV: 'production',
      BOS_LISTINGS_DATABASE_URL: 'postgres://db.example.test/bos_test',
    }),
    /PRODUCTION_POSTGRES_TLS_REQUIRED/,
  );
  const repository = ProviderListingRepository.fromEnvironment({
    NODE_ENV: 'production',
    BOS_LISTINGS_DATABASE_URL: 'postgres://bos@db.example.test/bos_test?sslmode=verify-full',
  });
  assert.ok(repository instanceof ProviderListingRepository);
  await repository.close();
});

test('production refuses a loopback repository unless a disposable local run is explicit', () => {
  assert.throws(
    () => ProviderListingRepository.fromEnvironment({
      NODE_ENV: 'production',
      BOS_LISTINGS_DATABASE_URL: 'postgres://127.0.0.1/bos_test',
    }),
    /PRODUCTION_POSTGRES_LOOPBACK_REQUIRES_TEST_MODE/,
  );
  const repository = ProviderListingRepository.fromEnvironment({
    NODE_ENV: 'production',
    BOS_LISTINGS_DATABASE_URL: 'postgres://127.0.0.1/bos_test',
    BOS_POSTGRES_LOCAL_TEST_MODE: 'true',
  });
  assert.ok(repository instanceof ProviderListingRepository);
});

test('legacy BOS_PG_URL cannot select a second database source', () => {
  assert.throws(
    () => ProviderListingRepository.fromEnvironment({
      NODE_ENV: 'test',
      BOS_PG_URL: 'postgres://127.0.0.1/legacy_db',
    }),
    /BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL/,
  );
  assert.throws(
    () => ProviderListingRepository.fromEnvironment({
      NODE_ENV: 'test',
      BOS_LISTINGS_DATABASE_URL: 'postgres://127.0.0.1/canonical_db',
      BOS_PG_URL: 'postgres://127.0.0.1/another_db',
    }),
    /BOS_LISTINGS_DATABASE_URL_CONFLICT/,
  );
  assert.throws(
    () => ProviderListingRepository.fromEnvironment({
      NODE_ENV: 'test',
      BOS_LISTINGS_DATABASE_URL: 'postgres://127.0.0.1/canonical_db',
      BOS_PG_URL: 'postgres://127.0.0.1/canonical_db',
    }),
    /BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL/,
  );
});
