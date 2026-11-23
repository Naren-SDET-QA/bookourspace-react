/**
 * Origin resolution for OAuth redirects.
 *
 * The callback URL handed to an identity provider decides where the provider
 * sends the user (and its authorization code). It must never be derived from a
 * caller-controlled `Host` header: a spoofed Host would make the provider
 * redirect to an attacker origin. Production therefore uses the explicitly
 * configured `APP_URL` only, and a process without one refuses the request.
 *
 * Local development keeps working on a loopback origin, which is the only host
 * a developer machine can serve and cannot be reached by a remote attacker.
 */

export const AUTH_ORIGIN_ERRORS = {
  unconfigured: 'AUTH_ORIGIN_UNCONFIGURED',
  invalid: 'AUTH_ORIGIN_INVALID',
} as const;

export interface AuthOriginInput {
  appUrl?: string;
  protocol?: string;
  host?: string;
  nodeEnv?: string;
}

export type AuthOriginResult =
  | { ok: true; origin: string; source: 'app-url' | 'loopback-development' }
  | { ok: false; error: string; message: string };

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** True when a Host value (optionally with a port) names this machine only. */
export function isLoopbackHost(host: string): boolean {
  const value = String(host || '').trim().toLowerCase();
  if (!value) return false;
  const withoutPort = value.startsWith('[')
    ? value.slice(0, value.indexOf(']') + 1)
    : value.split(':')[0];
  return LOOPBACK_HOSTS.has(withoutPort);
}

export function resolveAuthOrigin(input: AuthOriginInput): AuthOriginResult {
  const appUrl = String(input.appUrl || '').trim();
  const production = String(input.nodeEnv || '') === 'production';

  if (appUrl) {
    let parsed: URL;
    try {
      parsed = new URL(appUrl);
    } catch {
      return {
        ok: false,
        error: AUTH_ORIGIN_ERRORS.invalid,
        message: 'APP_URL is not an absolute URL; OAuth sign-in is unavailable.',
      };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        ok: false,
        error: AUTH_ORIGIN_ERRORS.invalid,
        message: 'APP_URL must use http or https; OAuth sign-in is unavailable.',
      };
    }
    if (production && parsed.protocol !== 'https:') {
      return {
        ok: false,
        error: AUTH_ORIGIN_ERRORS.invalid,
        message: 'APP_URL must use https in production; OAuth sign-in is unavailable.',
      };
    }
    return { ok: true, origin: parsed.origin, source: 'app-url' };
  }

  // No configured origin. A production process must never fall back to the
  // request's Host header, because that header is caller-controlled.
  if (production) {
    return {
      ok: false,
      error: AUTH_ORIGIN_ERRORS.unconfigured,
      message: 'APP_URL must be configured before OAuth sign-in is available.',
    };
  }

  const host = String(input.host || '').trim();
  if (!host || !isLoopbackHost(host)) {
    return {
      ok: false,
      error: AUTH_ORIGIN_ERRORS.unconfigured,
      message: 'Set APP_URL to an absolute origin; sign-in callbacks never follow the request Host header.',
    };
  }
  const protocol = String(input.protocol || '').trim() === 'https' ? 'https' : 'http';
  return { ok: true, origin: `${protocol}://${host}`, source: 'loopback-development' };
}

/** The OAuth callback URL for a resolved origin. */
export function authCallbackUrl(origin: string): string {
  return `${String(origin).replace(/\/+$/, '')}/auth/callback`;
}
