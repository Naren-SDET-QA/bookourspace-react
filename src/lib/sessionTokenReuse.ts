/**
 * A verified `/api/auth/me` read must not mint a new session token when the
 * claims it would contain are identical to the incoming token's claims.
 *
 * Re-signing on every read made concurrent verifications invalidate each
 * other: sibling A wrote the token it was handed, sibling B's in-flight
 * response no longer matched storage, and the client's re-check loop ended in
 * a local 409 that cleared a genuinely valid session.
 */
export interface SessionClaimsLike {
  userId?: string;
  role?: string;
  providerId?: string;
}

export function shouldReuseIncomingSessionToken(
  nextClaims: SessionClaimsLike,
  originalClaims: SessionClaimsLike,
): boolean {
  return String(nextClaims.userId || '') === String(originalClaims.userId || '')
    && String(nextClaims.role || '') === String(originalClaims.role || '')
    && String(nextClaims.providerId || '') === String(originalClaims.providerId || '');
}
