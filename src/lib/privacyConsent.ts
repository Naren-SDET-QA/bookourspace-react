export const PRIVACY_STORAGE_KEY = 'bos_privacy_consent_v1';
export const UTM_STORAGE_KEY = 'bos_utm_campaign_v1';
export const UTM_PARAM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export type PrivacyChoice = 'essential' | 'analytics';
export type PrivacyConsent = { choice: PrivacyChoice; at: string };
export type UtmCampaign = Partial<Record<(typeof UTM_PARAM_KEYS)[number], string>> & { capturedAt: string };

export function parsePrivacyConsent(raw: string | null | undefined): PrivacyConsent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PrivacyConsent;
    if (parsed?.choice === 'essential' || parsed?.choice === 'analytics') {
      return { choice: parsed.choice, at: typeof parsed.at === 'string' ? parsed.at : '' };
    }
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

export function shouldShowCookieBanner(isNativeWebView: boolean, stored: string | null | undefined): boolean {
  if (isNativeWebView) return false;
  return parsePrivacyConsent(stored) == null;
}

export function parseUtmFromSearch(search: string): Record<string, string> | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const utm: Record<string, string> = {};
  for (const key of UTM_PARAM_KEYS) {
    const value = params.get(key)?.trim();
    if (value) utm[key] = value.slice(0, 180);
  }
  return Object.keys(utm).length ? utm : null;
}

export function stripUtmFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const key of UTM_PARAM_KEYS) params.delete(key);
  const next = params.toString();
  return next ? `?${next}` : '';
}

export function serializeUtmCampaign(utm: Record<string, string>, capturedAt = new Date().toISOString()): string {
  return JSON.stringify({ ...utm, capturedAt } satisfies UtmCampaign);
}
