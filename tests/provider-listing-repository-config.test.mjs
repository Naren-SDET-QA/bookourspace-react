import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderListingRepository } from '../src/server/providerListingRepository.ts';

test('listing repository stays unconfigured when no local database URL is supplied', () => {
  assert.equal(ProviderListingRepository.fromEnvironment({ NODE_ENV: 'test' }), null);
});

test('listing repository accepts only a loopback PostgreSQL target', async () => {
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
    /BOS_LISTINGS_DATABASE_MUST_BE_LOOPBACK/,
  );
  assert.throws(
    () => ProviderListingRepository.fromEnvironment({
      NODE_ENV: 'development',
      BOS_LISTINGS_DATABASE_URL: 'https://127.0.0.1/bos_test',
    }),
    /BOS_LISTINGS_DATABASE_URL_INVALID/,
  );
});

test('listing repository cannot be enabled in production even with a loopback URL', () => {
  assert.throws(
    () => ProviderListingRepository.fromEnvironment({
      NODE_ENV: 'production',
      BOS_LISTINGS_DATABASE_URL: 'postgres://127.0.0.1/bos_test',
    }),
    /BOS_LISTINGS_POSTGRES_REPOSITORY_LOCAL_ONLY/,
  );
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
