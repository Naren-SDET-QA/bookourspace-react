import assert from 'node:assert/strict';

import {
  preflightDevelopmentSupabaseConfig,
  resolveSupabaseConfig as resolveRawSupabaseConfig,
} from '../src/lib/supabaseConfig.ts';

function test(name, callback) {
  try {
    callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;
const anonKeyFor = (ref) => jwt({ iss: 'supabase', ref, role: 'anon' });
const publishableKey = 'sb_publishable_abcdefghijklmnopqrstuv_ABCDEFGH';

const hasError = (result, prefix) => result.errors.some((entry) => entry.startsWith(prefix));
const TEST_DEV_PROJECT_ID = 'abcdefghijklmnopqrst';
const TEST_REASSIGNED_PROJECT_ID = 'ezrxykyocgbolpaebnqx';
const resolveFixture = (input = {}) => resolveRawSupabaseConfig({
  ...input,
  ...(input.projectId && input.projectId !== 'local' && input.developmentProjectId === undefined
    ? { developmentProjectId: input.projectId }
    : {}),
});

console.log('Supabase configuration');

test('missing URL and key disables live connections', () => {
  const result = resolveFixture({});
  assert.equal(result.projectId, '');
  assert.equal(result.projectUrl, '');
  assert.equal(result.authCallbackUrl, '');
  assert.equal(result.publishableKey, '');
  assert.equal(result.isConfigured, false);
  assert.deepEqual(result.errors, [], 'nothing was configured, so nothing is misconfigured');
});

test('whitespace-only values are treated as missing', () => {
  const result = resolveFixture({ url: '   ', projectId: '  ', publishableKey: '  ' });
  assert.equal(result.projectUrl, '');
  assert.equal(result.projectId, '');
  assert.equal(result.isConfigured, false);
});

test('key present but URL missing fails clearly', () => {
  const result = resolveFixture({ publishableKey: publishableKey });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectUrl, '');
  assert.equal(result.projectId, '');
  assert.ok(hasError(result, 'MISSING_SUPABASE_URL'));
});

test('project id without a URL is rejected instead of deriving one', () => {
  const result = resolveFixture({
    projectId: 'abcdefghijklmnopqrst',
    publishableKey: publishableKey,
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectUrl, '');
  assert.ok(hasError(result, 'MISSING_SUPABASE_URL'));
});

test('valid explicit development configuration is accepted and normalised', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co/',
    projectId: 'abcdefghijklmnopqrst',
    developmentProjectId: 'abcdefghijklmnopqrst',
    publishableKey: publishableKey,
  });
  assert.equal(result.projectId, 'abcdefghijklmnopqrst');
  assert.equal(result.projectUrl, 'https://abcdefghijklmnopqrst.supabase.co');
  assert.equal(result.authCallbackUrl, 'https://abcdefghijklmnopqrst.supabase.co/auth/v1/callback');
  assert.equal(result.isConfigured, true);
  assert.equal(result.publishableKey, publishableKey);
  assert.deepEqual(result.errors, []);
});

test('development configuration accepts a matching anon JWT', () => {
  const ref = 'zyxwvutsrqponmlkjihg';
  const result = resolveFixture({
    url: `https://${ref}.supabase.co`,
    projectId: ref,
    publishableKey: anonKeyFor(ref),
  });
  assert.equal(result.isConfigured, true);
  assert.equal(result.projectId, ref);
});

test('arbitrary opaque strings are not accepted as publishable keys', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    projectId: 'abcdefghijklmnopqrst',
    publishableKey: 'sb_publishable_not-a-real-key',
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.publishableKey, '');
  assert.ok(hasError(result, 'INVALID_SUPABASE_PUBLISHABLE_KEY'));
});

test('legacy JWT key must have the anon role and a matching hosted project ref', () => {
  const ref = 'abcdefghijklmnopqrst';
  const wrongRole = resolveFixture({
    url: `https://${ref}.supabase.co`,
    projectId: ref,
    publishableKey: jwt({ ref, role: 'authenticated' }),
  });
  const missingRef = resolveFixture({
    url: `https://${ref}.supabase.co`,
    projectId: ref,
    publishableKey: jwt({ role: 'anon' }),
  });
  assert.ok(hasError(wrongRole, 'INVALID_SUPABASE_PUBLISHABLE_KEY'));
  assert.ok(hasError(missingRef, 'INVALID_SUPABASE_PUBLISHABLE_KEY'));
  assert.equal(wrongRole.isConfigured, false);
  assert.equal(missingRef.isConfigured, false);
});

test('an unknown hosted project is rejected until explicitly designated as development', () => {
  const result = resolveRawSupabaseConfig({
    url: `https://${TEST_DEV_PROJECT_ID}.supabase.co`,
    projectId: TEST_DEV_PROJECT_ID,
    publishableKey: anonKeyFor(TEST_DEV_PROJECT_ID),
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectUrl, '');
  assert.ok(hasError(result, 'SUPABASE_DEVELOPMENT_PROJECT_NOT_ALLOWLISTED'));
});

test('the previously hard-coded project ref is accepted when explicitly designated as development', () => {
  const result = resolveRawSupabaseConfig({
    url: `https://${TEST_REASSIGNED_PROJECT_ID}.supabase.co`,
    projectId: TEST_REASSIGNED_PROJECT_ID,
    developmentProjectId: TEST_REASSIGNED_PROJECT_ID,
    publishableKey: anonKeyFor(TEST_REASSIGNED_PROJECT_ID),
  });
  assert.equal(result.isConfigured, true);
  assert.equal(result.projectId, TEST_REASSIGNED_PROJECT_ID);
  assert.deepEqual(result.errors, []);
});

test('development target must have an explicit project ID', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    developmentProjectId: 'abcdefghijklmnopqrst',
    publishableKey: publishableKey,
  });
  assert.equal(result.isConfigured, false);
  assert.ok(hasError(result, 'MISSING_SUPABASE_PROJECT_ID'));
});

test('invalid URL fails closed without switching to production', () => {
  const result = resolveFixture({
    url: 'https://example.com',
    publishableKey: publishableKey,
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectUrl, '');
  assert.equal(result.projectId, '');
  assert.equal(result.authCallbackUrl, '');
  assert.ok(hasError(result, 'INVALID_SUPABASE_URL'));
});

test('project URL rejects embedded credentials and non-origin paths', () => {
  for (const url of [
    'https://user:pass@abcdefghijklmnopqrst.supabase.co',
    'https://abcdefghijklmnopqrst.supabase.co/rest/v1',
    'https://abcdefghijklmnopqrst.supabase.co?redirect=/admin',
  ]) {
    const result = resolveFixture({ url, publishableKey });
    assert.equal(result.isConfigured, false);
    assert.equal(result.projectUrl, '');
    assert.ok(hasError(result, 'INVALID_SUPABASE_URL'));
  }
});

test('unparseable URL fails closed', () => {
  const result = resolveFixture({ url: 'not-a-url', publishableKey: publishableKey });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectUrl, '');
  assert.ok(hasError(result, 'INVALID_SUPABASE_URL'));
});

test('postgres connection string is rejected as a URL', () => {
  const result = resolveFixture({
    url: 'postgresql://user:pass@db.example.com:5432/postgres',
    publishableKey: publishableKey,
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectUrl, '');
  assert.ok(hasError(result, 'INVALID_SUPABASE_URL'));
});

test('invalid project id fails closed even with a valid URL', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    projectId: 'not a valid ref',
    publishableKey: publishableKey,
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectId, '');
  assert.equal(result.projectUrl, '');
  assert.ok(hasError(result, 'INVALID_SUPABASE_PROJECT_ID'));
});

test('url and project id referring to different projects is rejected', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    projectId: 'zyxwvutsrqponmlkjihg',
    publishableKey: publishableKey,
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectId, '');
  assert.equal(result.projectUrl, '');
  assert.ok(hasError(result, 'SUPABASE_PROJECT_REFERENCE_MISMATCH'));
});

test('key belonging to another project is rejected', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    projectId: 'abcdefghijklmnopqrst',
    publishableKey: anonKeyFor('differentprojectref'),
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectId, '');
  assert.equal(result.projectUrl, '');
  assert.ok(hasError(result, 'SUPABASE_KEY_PROJECT_REFERENCE_MISMATCH'));
});

test('a designated development target still rejects a mismatched legacy key', () => {
  const result = resolveRawSupabaseConfig({
    url: `https://${TEST_REASSIGNED_PROJECT_ID}.supabase.co`,
    projectId: TEST_REASSIGNED_PROJECT_ID,
    developmentProjectId: TEST_REASSIGNED_PROJECT_ID,
    publishableKey: anonKeyFor(TEST_DEV_PROJECT_ID),
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.projectUrl, '');
  assert.ok(hasError(result, 'SUPABASE_KEY_PROJECT_REFERENCE_MISMATCH'));
});

test('service-role JWT is refused even when its ref matches', () => {
  const ref = 'abcdefghijklmnopqrst';
  const result = resolveFixture({
    url: `https://${ref}.supabase.co`,
    projectId: ref,
    publishableKey: jwt({ ref, role: 'service_role' }),
  });
  assert.equal(result.isConfigured, false);
  assert.ok(hasError(result, 'SUPABASE_KEY_IS_SERVICE_ROLE'));
});

test('sb_secret_ key is refused', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    projectId: 'abcdefghijklmnopqrst',
    publishableKey: 'sb_secret_abcdefghijklmnop',
  });
  assert.equal(result.isConfigured, false);
  assert.ok(hasError(result, 'SUPABASE_KEY_IS_SECRET_KEY'));
});

test('postgres URL supplied as the key is refused', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    anonKey: 'postgres://user:pass@db.example.com:5432/postgres',
  });
  assert.equal(result.isConfigured, false);
  assert.ok(hasError(result, 'SUPABASE_KEY_IS_DATABASE_URL'));
});

test('missing key disables the client but keeps the explicit target', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    projectId: 'abcdefghijklmnopqrst',
  });
  assert.equal(result.isConfigured, false);
  assert.equal(result.publishableKey, '');
  assert.equal(result.projectUrl, 'https://abcdefghijklmnopqrst.supabase.co');
  assert.ok(hasError(result, 'MISSING_SUPABASE_PUBLISHABLE_KEY'));
});

test('.env.example placeholder key is not treated as configured', () => {
  const result = resolveFixture({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    projectId: 'abcdefghijklmnopqrst',
    publishableKey: 'your-supabase-publishable-or-anon-key',
  });
  assert.equal(result.isConfigured, false);
  assert.ok(hasError(result, 'MISSING_SUPABASE_PUBLISHABLE_KEY'));
});

test('local Supabase stack configuration is accepted', () => {
  const result = resolveFixture({
    url: 'http://127.0.0.1:54321',
    publishableKey: publishableKey,
  });
  assert.equal(result.isConfigured, true);
  assert.equal(result.projectUrl, 'http://127.0.0.1:54321');
  assert.equal(result.projectId, 'local');
  assert.deepEqual(result.errors, []);
});

test('loopback over https is refused', () => {
  const result = resolveFixture({
    url: 'https://127.0.0.1:54321',
    publishableKey: publishableKey,
  });
  assert.equal(result.isConfigured, false);
  assert.ok(hasError(result, 'INVALID_SUPABASE_URL'));
});

test('development preflight requires URL, project ID, development allowlist, and key', () => {
  const result = preflightDevelopmentSupabaseConfig({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    publishableKey,
  });
  assert.equal(result.ok, false);
  assert.ok(hasError(result, 'MISSING_SUPABASE_PROJECT_ID'));
  assert.ok(hasError(result, 'MISSING_SUPABASE_DEVELOPMENT_PROJECT_ID'));
  assert.equal(result.projectUrl, '');
  assert.equal(result.projectId, '');
});

test('development preflight accepts a well-formed hosted dev target without exposing its key', () => {
  const result = preflightDevelopmentSupabaseConfig({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    projectId: 'abcdefghijklmnopqrst',
    developmentProjectId: 'abcdefghijklmnopqrst',
    publishableKey,
  });
  assert.equal(result.ok, true);
  assert.equal(result.projectId, 'abcdefghijklmnopqrst');
  assert.equal(result.projectUrl, 'https://abcdefghijklmnopqrst.supabase.co');
  assert.equal(JSON.stringify(result).includes(publishableKey), false);
});

test('development preflight rejects a local stack and mismatched project identity', () => {
  const local = preflightDevelopmentSupabaseConfig({
    url: 'http://127.0.0.1:54321', projectId: 'local', publishableKey,
  });
  const mismatch = preflightDevelopmentSupabaseConfig({
    url: 'https://abcdefghijklmnopqrst.supabase.co',
    projectId: 'zyxwvutsrqponmlkjihg', publishableKey,
    developmentProjectId: 'abcdefghijklmnopqrst',
  });
  assert.ok(hasError(local, 'HOSTED_DEVELOPMENT_PROJECT_REQUIRED'));
  assert.ok(hasError(mismatch, 'SUPABASE_PROJECT_REFERENCE_MISMATCH'));
  assert.equal(local.ok, false);
  assert.equal(mismatch.ok, false);
});
