/**
 * Client half of the HttpOnly cookie session.
 *
 * The session token itself never reaches page script: the browser stores it in
 * an HttpOnly cookie. The only credential JavaScript holds is the CSRF token,
 * which is useless on its own and is kept in memory for this document's
 * lifetime. A reload re-fetches it from /api/auth/me, so nothing is ever
 * written to localStorage or sessionStorage.
 */

export const CSRF_HEADER_NAME = 'x-bos-csrf';

let csrfToken: string | null = null;

/** Installed from every authentication response and from /api/auth/me. */
export function setSessionCsrfToken(token: string | null | undefined): void {
  csrfToken = typeof token === 'string' && token.trim() ? token.trim() : null;
}

export function getSessionCsrfToken(): string | null {
  return csrfToken;
}

export function clearSessionCsrfToken(): void {
  csrfToken = null;
}

/**
 * Headers for an authenticated API call. A session cookie is attached by the
 * browser automatically for same-origin requests; only unsafe methods need the
 * CSRF proof.
 */
export function sessionAuthHeaders(): Record<string, string> {
  const token = csrfToken;
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

/** Merge auth headers into a caller supplied header set. */
export function withSessionAuth(headers?: HeadersInit): Record<string, string> {
  const merged: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    merged[key] = value;
  });
  return { ...merged, ...sessionAuthHeaders() };
}
