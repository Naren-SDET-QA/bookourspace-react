/**
 * Published customer visibility settings. Production reads only the central
 * versioned live-page config. A browser-local preference is available only in
 * Vite development, and is explicitly reported as a preview.
 */
export interface MarketplaceVisibility {
  popularCategoriesDisabledCities: string[];
  disabledSubcategories: string[];
}

export type VisibilitySaveResult = 'published' | 'local-only' | 'failed';

export const MARKETPLACE_VISIBILITY_EVENT = 'bos-marketplace-visibility-changed';
export const HOME_VISIBILITY_EVENT = 'bos-home-visibility-changed';
export const SUBCATEGORY_FLAGS_EVENT = 'bos-subcategory-flags-changed';

const LOCAL_KEY = 'bos-marketplace-visibility-dev-v1';
const DEFAULTS: MarketplaceVisibility = {
  popularCategoriesDisabledCities: ['Hyderabad'],
  disabledSubcategories: [],
};

let published: MarketplaceVisibility | null = null;

function normalizeList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 100))].slice(0, limit);
}

function normalize(value: unknown): MarketplaceVisibility {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<MarketplaceVisibility>
    : {};
  return {
    popularCategoriesDisabledCities: input.popularCategoriesDisabledCities === undefined
      ? [...DEFAULTS.popularCategoriesDisabledCities]
      : normalizeList(input.popularCategoriesDisabledCities, 100),
    disabledSubcategories: normalizeList(input.disabledSubcategories, 300),
  };
}

function isDevelopment(): boolean {
  return import.meta.env?.DEV === true;
}

function readLocal(): MarketplaceVisibility {
  if (!isDevelopment() || typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const value = localStorage.getItem(LOCAL_KEY);
    return value ? { ...DEFAULTS, ...normalize(JSON.parse(value)) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function announce() {
  if (typeof window === 'undefined') return;
  for (const name of [MARKETPLACE_VISIBILITY_EVENT, HOME_VISIBILITY_EVENT, SUBCATEGORY_FLAGS_EVENT]) {
    window.dispatchEvent(new Event(name));
  }
}

export function loadMarketplaceVisibility(): MarketplaceVisibility {
  return published ? { ...published,
    popularCategoriesDisabledCities: [...published.popularCategoriesDisabledCities],
    disabledSubcategories: [...published.disabledSubcategories],
  } : readLocal();
}

/** Apply only the shape served by the published configuration endpoint. */
export function applyRemoteMarketplaceVisibility(value: unknown): MarketplaceVisibility {
  published = { ...DEFAULTS, ...normalize(value) };
  announce();
  return loadMarketplaceVisibility();
}

export async function saveMarketplaceVisibilityPatch(
  patch: Partial<MarketplaceVisibility>,
): Promise<VisibilitySaveResult> {
  const current = loadMarketplaceVisibility();
  const next = normalize({ ...current, ...patch });
  const token = typeof window !== 'undefined'
    ? window.localStorage.getItem('bos_session_token_v1')
    : null;

  if (token) {
    try {
      const response = await fetch('/api/live-page-config/visibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bos-session-token': token },
        body: JSON.stringify({ visibility: patch }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; visibility?: unknown } | null;
      if (!response.ok || result?.ok !== true) return 'failed';
      published = { ...DEFAULTS, ...normalize(result.visibility) };
      announce();
      return 'published';
    } catch {
      // A valid session with a rejected or unreachable API must never be
      // reported as a local or published success.
      return 'failed';
    }
  }

  if (!isDevelopment() || typeof localStorage === 'undefined') return 'failed';
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    published = next;
    announce();
    return 'local-only';
  } catch {
    return 'failed';
  }
}
