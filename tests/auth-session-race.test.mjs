import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  decideVerifiedSessionWrite,
  verifiedResponseStillApplies,
} from '../src/lib/sessionVerificationGuard.ts';

/**
 * A verified `/api/auth/me` response may only be persisted while the browser
 * still holds the session that was verified. Otherwise an in-flight response
 * for a previous account can overwrite a newer sign-in.
 */

test('an unchanged session persists the refreshed token from the server', () => {
  assert.deepEqual(
    decideVerifiedSessionWrite({
      sentToken: 'session-a',
      currentToken: 'session-a',
      refreshedToken: 'session-a-renewed',
    }),
    { action: 'persist', token: 'session-a-renewed' },
  );
});

test('an unchanged session keeps the original token when the server does not re-mint one', () => {
  assert.deepEqual(
    decideVerifiedSessionWrite({ sentToken: 'session-a', currentToken: 'session-a' }),
    { action: 'persist', token: 'session-a' },
  );
  assert.deepEqual(
    decideVerifiedSessionWrite({ sentToken: 'session-a', currentToken: 'session-a', refreshedToken: '   ' }),
    { action: 'persist', token: 'session-a' },
  );
});

test('a session replaced during verification is re-verified instead of overwritten', () => {
  assert.deepEqual(
    decideVerifiedSessionWrite({ sentToken: 'customer-session', currentToken: 'owner-session' }),
    { action: 'reverify' },
  );
});

test('signing out during verification never restores the old session', () => {
  assert.deepEqual(
    decideVerifiedSessionWrite({ sentToken: 'customer-session', currentToken: null }),
    { action: 'unauthenticated' },
  );
});

test('an empty or whitespace token is never treated as current', () => {
  assert.deepEqual(
    decideVerifiedSessionWrite({ sentToken: '', currentToken: 'owner-session' }),
    { action: 'reverify' },
  );
  assert.deepEqual(
    decideVerifiedSessionWrite({ sentToken: 'owner-session', currentToken: '   ' }),
    { action: 'unauthenticated' },
  );
});

test('a blocked-account response only applies to the session that produced it', () => {
  assert.equal(verifiedResponseStillApplies('blocked-session', 'blocked-session'), true);
  assert.equal(verifiedResponseStillApplies('blocked-session', 'new-session'), false);
  assert.equal(verifiedResponseStillApplies('blocked-session', null), false);
  assert.equal(verifiedResponseStillApplies('', 'new-session'), false);
});

test('the session verification request uses the write guard', async () => {
  const source = await readFile(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export async function fetchCurrentAuthSession');
  assert.ok(start > 0, 'fetchCurrentAuthSession must exist');
  const end = source.indexOf('export async function logoutAuthoritativeSession', start);
  const body = source.slice(start, end > start ? end : undefined);
  assert.match(body, /decideVerifiedSessionWrite\(/);
  assert.match(body, /verifiedResponseStillApplies\(/);
  assert.match(body, /setStoredAuthoritativeSession\(decision\.token/);
  // The stale response must never write storage directly before the guard.
  assert.doesNotMatch(body, /setStoredAuthoritativeSession\(data\.sessionToken/);
});
