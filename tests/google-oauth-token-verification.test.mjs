import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { verifyGoogleIdTokenClaims } from '../src/server/googleIdTokenVerifier.ts';

const clientId = 'bookourspace-test-client.apps.googleusercontent.com';
const now = 1_800_000_000;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-google-key', kty: 'RSA', use: 'sig', alg: 'RS256' };
const jwks = { keys: [jwk] };

function signedToken(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: clientId,
    sub: 'google-user-123',
    email: 'verified@example.com',
    email_verified: true,
    iat: now - 10,
    exp: now + 300,
    ...overrides,
  })).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  return `${input}.${signature}`;
}

test('Google ID token is accepted only with a valid signature and expected audience', () => {
  assert.deepEqual(verifyGoogleIdTokenClaims(signedToken(), clientId, jwks, now), {
    sub: 'google-user-123', email: 'verified@example.com', name: undefined, picture: undefined,
  });
  assert.equal(verifyGoogleIdTokenClaims(signedToken(), 'another-client.apps.googleusercontent.com', jwks, now), null);
});

test('tampered identity claims, expired tokens and unverified email are rejected', () => {
  const valid = signedToken();
  const [header, payload, signature] = valid.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com', aud: clientId, sub: 'attacker',
    email: 'admin@bookourspace.in', email_verified: true, iat: now - 10, exp: now + 300,
  })).toString('base64url');
  assert.equal(verifyGoogleIdTokenClaims(`${header}.${tamperedPayload}.${signature}`, clientId, jwks, now), null);
  assert.equal(verifyGoogleIdTokenClaims(signedToken({ exp: now - 1 }), clientId, jwks, now), null);
  assert.equal(verifyGoogleIdTokenClaims(signedToken({ email_verified: false }), clientId, jwks, now), null);
});

test('tokens signed by a key not in Google JWKS are rejected', () => {
  assert.equal(verifyGoogleIdTokenClaims(signedToken(), clientId, { keys: [] }, now), null);
});
