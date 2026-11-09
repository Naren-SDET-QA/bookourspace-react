/**
 * Guards the browser session write-back performed after `/api/auth/me`.
 *
 * The server answers with a refreshed session token, and the client persists it
 * so a role/provider change made by an administrator takes effect without a
 * re-login. That write-back is only safe while the browser still holds the same
 * session that was verified. A verification request can be in flight while the
 * stored session changes (sign-out, sign-in as another account, an OAuth popup
 * completing, or another tab writing the shared localStorage). Writing the
 * stale response would then restore the previous user's token and identity.
 *
 * The rules are deliberately fail-closed:
 *   - the session disappeared during verification → stay signed out;
 *   - the session changed during verification → re-verify, never overwrite;
 *   - the session is unchanged → persist the refreshed token (or the original
 *     when the server did not re-mint one).
 */

export interface VerifiedSessionWriteInput {
  /** Token that was attached to the verification request. */
  sentToken: string;
  /** Token in storage when the response arrived (null when signed out). */
  currentToken: string | null;
  /** Re-minted token from the response, when the server returned one. */
  refreshedToken?: string | null;
}

export type VerifiedSessionWrite =
  | { action: 'persist'; token: string }
  | { action: 'reverify' }
  | { action: 'unauthenticated' };

export function decideVerifiedSessionWrite(input: VerifiedSessionWriteInput): VerifiedSessionWrite {
  const sentToken = String(input.sentToken || '').trim();
  const currentToken = typeof input.currentToken === 'string' ? input.currentToken.trim() : null;
  if (!currentToken) return { action: 'unauthenticated' };
  if (!sentToken || currentToken !== sentToken) return { action: 'reverify' };
  const refreshed = typeof input.refreshedToken === 'string' ? input.refreshedToken.trim() : '';
  return { action: 'persist', token: refreshed || sentToken };
}

/**
 * The same comparison also decides whether a fail-closed response (a blocked
 * account) may still clear storage. A response that belongs to a session the
 * browser no longer holds must never sign the current user out.
 */
export function verifiedResponseStillApplies(sentToken: string, currentToken: string | null): boolean {
  if (!currentToken) return false;
  return String(sentToken || '').trim() === currentToken.trim();
}
