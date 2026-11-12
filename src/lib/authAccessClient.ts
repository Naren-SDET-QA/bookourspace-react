/**
 * Public sign-in configuration, controlled by the administrator.
 *
 * The server is the only authority: a missing or failed config response hides
 * guest browsing and the email option rather than guessing. The response is
 * cached for a short time in memory only (not localStorage) so a stale flag
 * cannot survive a tab for long.
 */

import { buildAuthHeaders } from './supabaseClient';

export interface AuthAccessConfig {
  /** False when the API could not be reached, so the UI can avoid claiming an admin disabled sign-in. */
  available: boolean;
  guestLoginEnabled: boolean;
  emailOtpEnabled: boolean;
  googleLoginEnabled: boolean;
  emailOtpConfigured: boolean;
  googleConfigured: boolean;
}

export const DEFAULT_AUTH_ACCESS_CONFIG: AuthAccessConfig = {
  available: false,
  guestLoginEnabled: false,
  emailOtpEnabled: false,
  googleLoginEnabled: false,
  emailOtpConfigured: false,
  googleConfigured: false,
};

const CACHE_TTL_MS = 30_000;
let cached: { at: number; config: AuthAccessConfig } | null = null;
let inFlight: Promise<AuthAccessConfig> | null = null;

function normalize(payload: any): AuthAccessConfig {
  return {
    available: true,
    guestLoginEnabled: payload?.guestLoginEnabled === true,
    emailOtpEnabled: payload?.emailOtpEnabled === true,
    googleLoginEnabled: payload?.googleLoginEnabled === true,
    emailOtpConfigured: payload?.emailOtpConfigured === true,
    googleConfigured: payload?.googleConfigured === true,
  };
}

export async function fetchAuthAccessConfig(options: { force?: boolean } = {}): Promise<AuthAccessConfig> {
  const now = Date.now();
  if (!options.force && cached && now - cached.at < CACHE_TTL_MS) return cached.config;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch('/api/auth/config', {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return cached?.config || DEFAULT_AUTH_ACCESS_CONFIG;
      const data = await response.json().catch(() => null);
      if (!data || data.ok !== true) return cached?.config || DEFAULT_AUTH_ACCESS_CONFIG;
      const config = normalize(data);
      cached = { at: Date.now(), config };
      return config;
    } catch {
      return cached?.config || DEFAULT_AUTH_ACCESS_CONFIG;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function invalidateAuthAccessConfigCache(): void {
  cached = null;
}

export interface AdminAuthAccessSettings extends AuthAccessConfig {
  updatedAt: string | null;
}

export async function fetchAdminAuthAccessSettings(): Promise<{
  ok: boolean;
  settings?: AdminAuthAccessSettings;
  error?: string;
}> {
  try {
    const response = await fetch('/api/admin/auth-settings', {
      headers: buildAuthHeaders({ accept: 'application/json' }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !data.settings) {
      return { ok: false, error: data?.error || 'AUTH_SETTINGS_UNAVAILABLE' };
    }
    return {
      ok: true,
      settings: {
        ...normalize(data.settings),
        updatedAt: typeof data.settings.updatedAt === 'string' ? data.settings.updatedAt : null,
      },
    };
  } catch {
    return { ok: false, error: 'AUTH_SETTINGS_UNAVAILABLE' };
  }
}

export async function saveAdminAuthAccessSettings(
  patch: Partial<Pick<AuthAccessConfig, 'guestLoginEnabled' | 'emailOtpEnabled' | 'googleLoginEnabled'>>
): Promise<{ ok: boolean; settings?: AdminAuthAccessSettings; error?: string; message?: string }> {
  try {
    const response = await fetch('/api/admin/auth-settings', {
      method: 'PUT',
      headers: buildAuthHeaders({ accept: 'application/json' }),
      body: JSON.stringify(patch),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !data.settings) {
      return {
        ok: false,
        error: data?.error || 'AUTH_SETTINGS_UNAVAILABLE',
        message: data?.message,
      };
    }
    invalidateAuthAccessConfigCache();
    return {
      ok: true,
      settings: {
        ...normalize(data.settings),
        updatedAt: typeof data.settings.updatedAt === 'string' ? data.settings.updatedAt : null,
      },
    };
  } catch {
    return { ok: false, error: 'AUTH_SETTINGS_UNAVAILABLE', message: 'Sign-in settings could not be saved.' };
  }
}
