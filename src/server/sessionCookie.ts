/**
 * Session cookie transport for the BookOurSpace application session.
 *
 * The session token is a bearer credential. It is delivered to browsers only
 * through an HttpOnly cookie so no page script (and therefore no injected
 * script) can read or exfiltrate it. Every unsafe request additionally has to
 * echo the CSRF token that is derived from the presented session, which stops
 * a cross-site page from driving authenticated state changes with the ambient
 * cookie.
 *
 * The helpers here are pure so the cookie policy and CSRF rules can be tested
 * without an HTTP server.
 */

export const SESSION_COOKIE_NAME = 'bos_session';
export const CSRF_HEADER_NAME = 'x-bos-csrf';
/** Matches the 12 hour application session lifetime. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
export const CSRF_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export type SameSitePolicy = 'Lax' | 'None';

export interface CookiePolicy {
  secure: boolean;
  sameSite: SameSitePolicy;
  path: string;
  domain?: string;
}

/** Methods that cannot change state and therefore need no CSRF proof. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

export function isUnsafeMethod(method: string | undefined): boolean {
  return !SAFE_METHODS.has(String(method || 'GET').toUpperCase());
}

/**
 * Parse a Cookie header. Later duplicates win, which matches browser
 * behaviour when the same name is scoped to different paths.
 */
export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    let value = part.slice(separator + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    cookies[name] = value;
  }
  return cookies;
}

export function readSessionTokenFromCookie(
  header: string | undefined | null,
  name: string = SESSION_COOKIE_NAME,
): string | null {
  const raw = parseCookieHeader(header)[name];
  if (typeof raw !== 'string' || !raw) return null;
  return raw;
}

/**
 * A production browser session must be Secure. The only exception is loopback
 * development over plain HTTP, where Secure cookies are not stored at all.
 */
export function resolveCookiePolicy(params: {
  nodeEnv: string | undefined;
  requestOrigin?: string | null;
  nativeOriginAllowed?: boolean;
}): CookiePolicy {
  const origin = String(params.requestOrigin || '');
  const isLoopbackHttp = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
  const isProduction = params.nodeEnv === 'production';
  if (isProduction && isLoopbackHttp) {
    // A production process that believes it is talking to a browser over
    // loopback is misconfigured; fail closed rather than drop the Secure flag.
    return { secure: true, sameSite: 'Lax', path: '/' };
  }
  // A native app shell sends requests from a different origin, so only there
  // does the cookie need SameSite=None (still Secure and still CSRF-checked).
  if (params.nativeOriginAllowed) {
    return { secure: true, sameSite: 'None', path: '/' };
  }
  return { secure: isProduction || !isLoopbackHttp ? true : false, sameSite: 'Lax', path: '/' };
}

function serialize(
  name: string,
  value: string,
  policy: CookiePolicy,
  maxAgeSeconds: number,
  httpOnly: boolean,
): string {
  const parts = [`${name}=${value}`, `Path=${policy.path}`];
  if (policy.domain) parts.push(`Domain=${policy.domain}`);
  parts.push(`Max-Age=${maxAgeSeconds}`);
  parts.push(`SameSite=${policy.sameSite}`);
  if (httpOnly) parts.push('HttpOnly');
  if (policy.secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializeSessionCookie(
  token: string,
  policy: CookiePolicy,
  maxAgeSeconds: number = SESSION_COOKIE_MAX_AGE_SECONDS,
): string {
  return serialize(SESSION_COOKIE_NAME, token, policy, maxAgeSeconds, true);
}

/** Expires the cookie in the browser and in any intermediate cache. */
export function serializeClearedSessionCookie(policy: CookiePolicy): string {
  return serialize(SESSION_COOKIE_NAME, '', policy, 0, true);
}

/** True when the presented value is a well formed CSRF token. */
export function isWellFormedCsrfToken(value: string | undefined | null): boolean {
  return CSRF_TOKEN_PATTERN.test(String(value || '').trim());
}

/**
 * Endpoints that establish a session cannot present a CSRF token for it yet.
 * They are registered with verified provider credentials instead, so they are
 * exempt from the session CSRF proof.
 */
const SESSION_ESTABLISHING_PATHS = new Set([
  '/auth/google/authenticate',
  '/auth/supabase/authenticate',
  '/auth/email-otp/request',
  '/auth/email-otp/verify',
  '/auth/email-otp/authenticate',
  '/auth/local-dev/session',
]);

export function isSessionEstablishingPath(pathWithinApi: string): boolean {
  const normalized = String(pathWithinApi || '').replace(/\/+$/, '') || '/';
  return SESSION_ESTABLISHING_PATHS.has(normalized);
}

/**
 * Decide whether a request must present a CSRF token.
 *
 * Requests without a session cookie are left to the route's own
 * authentication check: there is no ambient authority to protect.
 */
export function requiresCsrfCheck(
  method: string | undefined,
  pathWithinApi: string,
  hasSessionCookie: boolean,
): boolean {
  if (!hasSessionCookie) return false;
  if (!isUnsafeMethod(method)) return false;
  return !isSessionEstablishingPath(pathWithinApi);
}
