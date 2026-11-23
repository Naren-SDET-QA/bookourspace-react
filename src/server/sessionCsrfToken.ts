import crypto from 'node:crypto';

/**
 * The CSRF token is derived from the presented session signature instead of
 * being stored separately. It therefore rotates whenever the session changes,
 * needs no server-side state (so it survives a restart), and reveals nothing
 * that could be used to forge a session.
 */
export const CSRF_HMAC_DOMAIN = 'CSRF_TOKEN_V1';

export function deriveCsrfToken(sessionToken: string, secret: string): string | null {
  const parts = String(sessionToken || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return crypto
    .createHmac('sha256', `${secret}:${CSRF_HMAC_DOMAIN}`)
    .update(parts[1])
    .digest('hex');
}

/** Constant-time comparison for two hex tokens. */
export function csrfTokensMatch(provided: string | undefined | null, expected: string | null): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided), 'utf-8');
  const b = Buffer.from(String(expected), 'utf-8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
