import test from 'node:test';
import assert from 'node:assert/strict';
import { authCallbackUrl, isLoopbackHost, resolveAuthOrigin } from '../src/server/authOrigin.ts';

/**
 * SEC-07 regression coverage: the OAuth callback origin is configuration, never
 * the caller-supplied Host header.
 */

test('a configured APP_URL is used and normalized to its origin', () => {
  assert.deepEqual(
    resolveAuthOrigin({ appUrl: 'https://bookourspace.in/app/', host: 'evil.example', nodeEnv: 'production' }),
    { ok: true, origin: 'https://bookourspace.in', source: 'app-url' },
  );
  assert.equal(authCallbackUrl('https://bookourspace.in'), 'https://bookourspace.in/auth/callback');
  assert.equal(authCallbackUrl('https://bookourspace.in/'), 'https://bookourspace.in/auth/callback');
});

test('production refuses a spoofed Host when APP_URL is missing', () => {
  const result = resolveAuthOrigin({ host: 'attacker.example', protocol: 'https', nodeEnv: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'AUTH_ORIGIN_UNCONFIGURED');
});

test('production refuses a non-https APP_URL', () => {
  const result = resolveAuthOrigin({ appUrl: 'http://bookourspace.in', nodeEnv: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'AUTH_ORIGIN_INVALID');
});

test('a malformed APP_URL is rejected instead of being guessed', () => {
  for (const value of ['not a url', 'javascript:alert(1)', 'ftp://bookourspace.in']) {
    const result = resolveAuthOrigin({ appUrl: value, nodeEnv: 'production' });
    assert.equal(result.ok, false, `${value} must be refused`);
    assert.equal(result.error, 'AUTH_ORIGIN_INVALID');
  }
});

test('development may use a loopback Host but never a foreign one', () => {
  assert.deepEqual(
    resolveAuthOrigin({ host: 'localhost:3010', protocol: 'http', nodeEnv: 'development' }),
    { ok: true, origin: 'http://localhost:3010', source: 'loopback-development' },
  );
  assert.deepEqual(
    resolveAuthOrigin({ host: '127.0.0.1:3010', protocol: 'http', nodeEnv: 'development' }),
    { ok: true, origin: 'http://127.0.0.1:3010', source: 'loopback-development' },
  );
  const spoofed = resolveAuthOrigin({ host: 'attacker.example', protocol: 'https', nodeEnv: 'development' });
  assert.equal(spoofed.ok, false);
  assert.equal(spoofed.error, 'AUTH_ORIGIN_UNCONFIGURED');
});

test('loopback detection accepts bracketed IPv6 with a port only', () => {
  assert.equal(isLoopbackHost('localhost'), true);
  assert.equal(isLoopbackHost('localhost:3010'), true);
  assert.equal(isLoopbackHost('[::1]:3010'), true);
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('localhost.attacker.example'), false);
  assert.equal(isLoopbackHost('attacker.example'), false);
  assert.equal(isLoopbackHost(''), false);
});
