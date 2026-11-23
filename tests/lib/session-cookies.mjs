import crypto from 'node:crypto';

/**
 * Test helpers for the HttpOnly cookie session.
 *
 * The application session is a bearer token delivered only as a cookie. A test
 * that holds a token can therefore still authenticate by sending it as a
 * cookie, and must supply the CSRF proof that is derived from it for unsafe
 * methods (exactly what the browser client does).
 */

export function csrfForSession(sessionToken, secret) {
  const signature = String(sessionToken || '').split('.')[1];
  if (!signature) throw new Error('SESSION_TOKEN_INVALID');
  return crypto
    .createHmac('sha256', `${secret}:CSRF_TOKEN_V1`)
    .update(signature)
    .digest('hex');
}

export function sessionCookieHeaders(sessionToken, secret) {
  if (!sessionToken) return {};
  return {
    Cookie: `bos_session=${sessionToken}`,
    'x-bos-csrf': csrfForSession(sessionToken, secret),
  };
}

/** Read the issued session token straight out of a Set-Cookie header. */
export function sessionCookieFromResponse(response) {
  const res = response && response.headers ? response : response?.response;
  const raw = typeof res?.headers?.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res?.headers?.get?.('set-cookie') || ''];
  for (const line of raw) {
    const match = /(?:^|,\s*)bos_session=([^;]*)/.exec(String(line || ''));
    if (match && match[1]) return decodeURIComponent(match[1]);
  }
  return null;
}
