import { createPublicKey, verify } from 'node:crypto';

export interface GoogleIdentityClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

interface GoogleJwkSet {
  keys?: Array<Record<string, unknown>>;
}

/** Verify the signature and security-critical claims of a Google OIDC ID token. */
export function verifyGoogleIdTokenClaims(
  idToken: string,
  clientId: string,
  jwks: GoogleJwkSet,
  nowSeconds = Math.floor(Date.now() / 1000)
): GoogleIdentityClaims | null {
  if (!idToken || !clientId || !Array.isArray(jwks.keys)) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const key = jwks.keys.find((candidate) =>
      candidate.kid === header.kid && candidate.kty === 'RSA' &&
      (!candidate.use || candidate.use === 'sig') &&
      (!candidate.alg || candidate.alg === 'RS256')
    );
    if (!key) return null;

    const publicKey = createPublicKey({ key, format: 'jwk' });
    const signature = Buffer.from(parts[2], 'base64url');
    const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii');
    if (!verify('RSA-SHA256', signedContent, publicKey, signature)) return null;

    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const expiresAt = Number(claims.exp);
    const issuedAt = Number(claims.iat);
    const notBefore = claims.nbf === undefined ? undefined : Number(claims.nbf);
    const verifiedEmail = claims.email_verified === true || claims.email_verified === 'true';
    if (
      !audience.includes(clientId) ||
      (audience.length > 1 && claims.azp !== clientId) ||
      (claims.azp && claims.azp !== clientId) ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(String(claims.iss)) ||
      !Number.isFinite(expiresAt) || expiresAt <= nowSeconds ||
      !Number.isFinite(issuedAt) || issuedAt > nowSeconds + 60 ||
      (notBefore !== undefined && (!Number.isFinite(notBefore) || notBefore > nowSeconds + 60)) ||
      !verifiedEmail || !String(claims.sub || '').trim() || !String(claims.email || '').trim()
    ) return null;

    return {
      sub: String(claims.sub),
      email: String(claims.email).trim().toLowerCase(),
      name: typeof claims.name === 'string' ? claims.name : undefined,
      picture: typeof claims.picture === 'string' ? claims.picture : undefined,
    };
  } catch {
    return null;
  }
}
