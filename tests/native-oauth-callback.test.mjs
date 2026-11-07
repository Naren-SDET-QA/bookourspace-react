import test from 'node:test';
import assert from 'node:assert/strict';
import { NATIVE_AUTH_REDIRECT_URL, parseNativeOAuthCallback } from '../src/mobile/nativeOAuthCallback.ts';

test('native Google OAuth uses the registered app callback URI', () => {
  assert.equal(NATIVE_AUTH_REDIRECT_URL, 'com.bookourspace.app://auth/callback');
  assert.deepEqual(
    parseNativeOAuthCallback(`${NATIVE_AUTH_REDIRECT_URL}?code=one-time-code`),
    { kind: 'code', code: 'one-time-code' },
  );
});

test('native OAuth callback rejects unrelated schemes, hosts, paths, and malformed URLs', () => {
  assert.equal(parseNativeOAuthCallback('https://example.com/auth/callback?code=x'), null);
  assert.equal(parseNativeOAuthCallback('com.bookourspace.app://untrusted/callback?code=x'), null);
  assert.equal(parseNativeOAuthCallback('com.bookourspace.app://auth/other?code=x'), null);
  assert.equal(parseNativeOAuthCallback('not a url'), null);
});

test('native OAuth callback never accepts an error or missing code as a session', () => {
  assert.deepEqual(
    parseNativeOAuthCallback(`${NATIVE_AUTH_REDIRECT_URL}?error=access_denied&error_description=Cancelled`),
    { kind: 'error' },
  );
  assert.deepEqual(parseNativeOAuthCallback(NATIVE_AUTH_REDIRECT_URL), { kind: 'error' });
});
