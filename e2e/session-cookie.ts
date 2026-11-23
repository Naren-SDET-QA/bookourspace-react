import crypto from 'node:crypto';
import type { BrowserContext } from '@playwright/test';

/** Browser-E2E equivalent of the production HttpOnly cookie transport. */
export function csrfForSession(token: string, secret: string): string {
  const signature = String(token).split('.')[1];
  if (!signature) throw new Error('SESSION_TOKEN_INVALID');
  return crypto.createHmac('sha256', `${secret}:CSRF_TOKEN_V1`).update(signature).digest('hex');
}

export function sessionCookieHeaders(token: string | undefined, secret: string): Record<string, string> {
  if (!token) return {};
  return { Cookie: `bos_session=${token}`, 'x-bos-csrf': csrfForSession(token, secret) };
}

export async function installSessionCookie(
  context: BrowserContext,
  origin: string,
  token: string,
  secret: string,
): Promise<void> {
  const url = new URL(origin);
  await context.addCookies([{ name: 'bos_session', value: token, domain: url.hostname, path: '/', httpOnly: true }]);
  // The page cannot read the HttpOnly session. The CSRF proof is deliberately
  // exposed to page code by the normal /api/auth/me response and is not a
  // bearer credential; this init hook mirrors that bootstrap for local tests.
  await context.addInitScript((csrf) => {
    (window as Window & { __bosE2eCsrf?: string }).__bosE2eCsrf = csrf;
  }, csrfForSession(token, secret));
}
