import crypto from 'node:crypto';
import type { APIRequestContext, APIResponse, BrowserContext, Page } from '@playwright/test';

/**
 * Test transport for the HttpOnly cookie session.
 *
 * The application session token lives only in the `bos_session` cookie, so a
 * browser test cannot seed it through localStorage any more. These helpers put
 * the same signed value into the context cookie jar (which the browser sends
 * automatically and page script cannot read) and obtain the CSRF proof the
 * server requires on unsafe requests.
 */

export const SESSION_COOKIE_NAME = 'bos_session';
export const CSRF_HEADER_NAME = 'x-bos-csrf';

/** Cookies are host-scoped, so both loopback spellings need the value. */
const LOOPBACK_ORIGINS = ['http://127.0.0.1', 'http://localhost'];

/**
 * CSRF proof for a locally minted test session.
 *
 * Mirrors src/server/sessionCsrfToken.ts: HMAC over the session signature in
 * the CSRF domain. Only call this when the test owns the server secret.
 */
export function csrfTokenFor(sessionToken: string, secret: string): string {
  const parts = String(sessionToken || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('csrfTokenFor needs a two-part signed session token');
  }
  return crypto
    .createHmac('sha256', `${secret}:CSRF_TOKEN_V1`)
    .update(parts[1])
    .digest('hex');
}

/** Read `bos_session` out of one or more joined Set-Cookie header values. */
export function sessionTokenFromSetCookie(header: string | string[] | null | undefined): string | null {
  if (!header) return null;
  const joined = Array.isArray(header) ? header.join(', ') : String(header);
  const match = joined.match(/(?:^|[;,\s])bos_session=([^;,\s]+)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return value ? value : null;
}

export function sessionTokenFromResponse(response: APIResponse): string | null {
  return sessionTokenFromSetCookie(response.headers()['set-cookie']);
}

/**
 * Install a session in a browser context exactly as the sign-in response does.
 * An empty token clears the jar so a follow-up request is genuinely anonymous.
 */
export async function useSessionCookie(context: BrowserContext, token: string | null | undefined): Promise<void> {
  await context.clearCookies();
  if (!token) return;
  await context.addCookies(
    LOOPBACK_ORIGINS.map((origin) => ({
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: new URL(origin).hostname,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
    })),
  );
}

/** Install a signed fixture token without ever placing it in web storage. */
export async function installSignedSessionCookie(
  context: BrowserContext,
  token: string,
  secret: string,
): Promise<void> {
  await useSessionCookie(context, token);
  await context.addInitScript((csrf) => {
    (window as Window & { __bosE2eCsrf?: string }).__bosE2eCsrf = csrf;
  }, csrfTokenFor(token, secret));
}

/** Sign in through the real local-dev endpoint and keep its cookie. */
export async function signInWithLocalDevSession(
  context: BrowserContext,
  body: { role?: 'customer' | 'provider' | 'admin'; email?: string } = {},
): Promise<{ csrfToken: string; role: string; user: Record<string, unknown> }> {
  const response = await context.request.post('/api/auth/local-dev/session', { data: body });
  if (!response.ok()) {
    throw new Error(`local-dev session failed: HTTP ${response.status()} ${await response.text()}`);
  }
  const data = (await response.json()) as { csrfToken?: string; role?: string; user?: Record<string, unknown> };
  if (!data?.csrfToken) throw new Error('local-dev session returned no CSRF token');
  if (sessionTokenFromResponse(response) === null) {
    throw new Error('local-dev session set no session cookie');
  }
  return { csrfToken: data.csrfToken, role: String(data.role || ''), user: data.user || {} };
}

/**
 * CSRF proof for page script that calls the API directly. The app keeps this
 * token in memory; a test page asks the server for it the same way a reload
 * does, from /api/auth/me.
 */
export async function csrfTokenForPage(page: Page): Promise<string> {
  const token = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { headers: { accept: 'application/json' } });
    if (!response.ok) return '';
    const data = (await response.json()) as { csrfToken?: string };
    return String(data?.csrfToken || '');
  });
  if (!token) throw new Error('/api/auth/me returned no CSRF token for this page');
  return token;
}

/** Same proof, for Playwright's request fixture against the shared server. */
export async function csrfTokenForRequest(request: APIRequestContext): Promise<string> {
  const response = await request.get('/api/auth/me');
  if (!response.ok()) throw new Error(`/api/auth/me failed: HTTP ${response.status()}`);
  const data = (await response.json()) as { csrfToken?: string };
  if (!data?.csrfToken) throw new Error('/api/auth/me returned no CSRF token');
  return data.csrfToken;
}

/** Unsafe request headers for a session whose secret this test owns. */
export function csrfHeaders(sessionToken: string, secret: string): Record<string, string> {
  return { [CSRF_HEADER_NAME]: csrfTokenFor(sessionToken, secret) };
}

/** Headers for disposable-harness API calls: cookie auth plus the CSRF proof. */
export function sessionCookieHeaders(
  sessionToken: string,
  secret: string,
  contentType?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
    [CSRF_HEADER_NAME]: csrfTokenFor(sessionToken, secret),
  };
  if (contentType) headers['content-type'] = contentType;
  return headers;
}
