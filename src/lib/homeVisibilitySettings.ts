/**
 * Admin-controlled home page visibility settings (per city).
 * Persisted in localStorage and applied by the home page renderer.
 */

export interface HomeVisibilitySettings {
  /** Cities where the "Popular Categories" strip is hidden on the home page. */
  popularCategoriesDisabledCities: string[];
}

const KEY = 'bos_home_visibility_v1';
export const HOME_VISIBILITY_EVENT = 'bos-home-visibility-changed';

const DEFAULT_SETTINGS: HomeVisibilitySettings = {
  // Hyderabad is disabled by default per product request.
  popularCategoriesDisabledCities: ['Hyderabad'],
};

function normalizeCity(city: string): string {
  return (city || '').trim().toLowerCase();
}

export function loadHomeVisibility(): HomeVisibilitySettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, popularCategoriesDisabledCities: [...DEFAULT_SETTINGS.popularCategoriesDisabledCities] };
    const parsed = JSON.parse(raw) as Partial<HomeVisibilitySettings>;
    return {
      popularCategoriesDisabledCities: Array.isArray(parsed.popularCategoriesDisabledCities)
        ? parsed.popularCategoriesDisabledCities.map(String)
        : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS, popularCategoriesDisabledCities: [...DEFAULT_SETTINGS.popularCategoriesDisabledCities] };
  }
}

export function saveHomeVisibility(settings: HomeVisibilitySettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
  try {
    window.dispatchEvent(new Event(HOME_VISIBILITY_EVENT));
  } catch {
    /* no window */
  }
}

export function isPopularCategoriesVisible(city: string): boolean {
  const normalized = normalizeCity(city);
  if (!normalized || normalized === 'all' || normalized === 'all cities' || normalized === 'all locations') {
    return true;
  }
  return !loadHomeVisibility().popularCategoriesDisabledCities.some((c) => normalizeCity(c) === normalized);
}

export function setPopularCategoriesVisible(city: string, visible: boolean) {
  const settings = loadHomeVisibility();
  const normalized = normalizeCity(city);
  const next = settings.popularCategoriesDisabledCities.filter((c) => normalizeCity(c) !== normalized);
  if (!visible) next.push(city);
  saveHomeVisibility({ ...settings, popularCategoriesDisabledCities: next });
}
