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

// --- W-07 regression: concurrent verifications must converge -------------

import { shouldReuseIncomingSessionToken } from '../src/lib/sessionTokenReuse.ts';
import {
  shouldAcceptExhaustedReverify,
  MAX_SESSION_RECHECKS,
} from '../src/lib/sessionVerificationGuard.ts';

test('unchanged claims reuse the incoming token instead of re-signing it', () => {
  const claims = { userId: 'USR-P', role: 'provider', providerId: 'prov-1' };
  assert.equal(shouldReuseIncomingSessionToken({ ...claims }, claims), true);
  assert.equal(shouldReuseIncomingSessionToken({ ...claims, role: 'customer' }, claims), false);
  assert.equal(shouldReuseIncomingSessionToken({ ...claims, userId: 'USR-OTHER' }, claims), false);
  assert.equal(shouldReuseIncomingSessionToken({ ...claims, providerId: 'prov-2' }, claims), false);
});

test('an exhausted re-check keeps a verified session for the same identity', () => {
  assert.equal(shouldAcceptExhaustedReverify('USR-P', 'USR-P'), true);
  assert.equal(shouldAcceptExhaustedReverify('USR-P', 'USR-OTHER'), false);
  assert.equal(shouldAcceptExhaustedReverify('USR-P', null), false);
  assert.equal(shouldAcceptExhaustedReverify(undefined, 'USR-P'), false);
});

test('two concurrent verifications of one token converge on an authenticated session', () => {
  // Server now hands the same token back for unchanged claims.
  const original = 'token-original';
  let stored = original;

  const verify = (sent) => {
    const decision = decideVerifiedSessionWrite({
      sentToken: sent,
      currentToken: stored,
      refreshedToken: original, // stable server response
    });
    if (decision.action === 'persist') stored = decision.token;
    return decision.action;
  };

  // Sibling A persists, sibling B was in flight with the same token.
  assert.equal(verify(original), 'persist');
  const second = verify(original);
  assert.notEqual(second, 'unauthenticated');
  assert.equal(stored, original);

  // Even when a sibling still sees a rotated token, the exhausted path
  // accepts the verified identity rather than clearing the session.
  let rechecks = 0;
  let accepted = false;
  for (;;) {
    const decision = decideVerifiedSessionWrite({
      sentToken: 'stale-token',
      currentToken: stored,
      refreshedToken: 'stale-token',
    });
    if (decision.action !== 'reverify') break;
    rechecks += 1;
    if (rechecks >= MAX_SESSION_RECHECKS) {
      accepted = shouldAcceptExhaustedReverify('USR-P', 'USR-P');
      break;
    }
  }
  assert.equal(accepted, true);
  assert.equal(stored, original);
});

test('a valid session hydrates without rotating the stored token', () => {
  const stored = 'token-provider';
  const decision = decideVerifiedSessionWrite({
    sentToken: stored,
    currentToken: stored,
    refreshedToken: stored,
  });
  assert.equal(decision.action, 'persist');
  assert.equal(decision.token, stored);
});

test('an expired session is never turned into an authenticated one', () => {
  // A 401 clears the stored token; no later verification can resurrect it.
  const decision = decideVerifiedSessionWrite({
    sentToken: 'expired-token',
    currentToken: null,
    refreshedToken: null,
  });
  assert.equal(decision.action, 'unauthenticated');
});

test('a revoked session is never rescued by the exhausted re-check path', () => {
  // Revocation returns no verified identity, so the same-identity acceptance
  // cannot fire even when re-checks are exhausted.
  assert.equal(shouldAcceptExhaustedReverify('USR-P', null), false);
  const decision = decideVerifiedSessionWrite({
    sentToken: 'revoked-token',
    currentToken: null,
    refreshedToken: null,
  });
  assert.equal(decision.action, 'unauthenticated');
});

test('a provider deep link cannot open a workspace without a verified provider identity', () => {
  const claims = { userId: '11111111-aaaa-4aaa-8aaa-000000000001', role: 'provider', providerId: 'prov-1' };
  // Unchanged claims keep the session stable across the deep-link navigation.
  assert.equal(shouldReuseIncomingSessionToken({ ...claims }, claims), true);
  // A customer or an absent identity is not accepted as the provider owner.
  assert.equal(shouldAcceptExhaustedReverify('11111111-aaaa-4aaa-8aaa-000000000003', claims.userId), false);
  assert.equal(shouldAcceptExhaustedReverify(null, claims.userId), false);
});
