import {
  HOME_VISIBILITY_EVENT,
  loadMarketplaceVisibility,
  saveMarketplaceVisibilityPatch,
  type VisibilitySaveResult,
} from './marketplaceVisibility';

export interface HomeVisibilitySettings {
  popularCategoriesDisabledCities: string[];
}

export { HOME_VISIBILITY_EVENT };

function normalizeCity(city: string): string {
  return (city || '').trim().toLowerCase();
}

export function loadHomeVisibility(): HomeVisibilitySettings {
  return { popularCategoriesDisabledCities: loadMarketplaceVisibility().popularCategoriesDisabledCities };
}

export function isPopularCategoriesVisible(city: string): boolean {
  const normalized = normalizeCity(city);
  if (!normalized || normalized === 'all' || normalized === 'all cities' || normalized === 'all locations') return true;
  return !loadHomeVisibility().popularCategoriesDisabledCities.some((candidate) => normalizeCity(candidate) === normalized);
}

export async function setPopularCategoriesVisible(city: string, visible: boolean): Promise<VisibilitySaveResult> {
  const normalized = normalizeCity(city);
  if (!normalized) return 'failed';
  const current = loadHomeVisibility().popularCategoriesDisabledCities;
  const next = current.filter((candidate) => normalizeCity(candidate) !== normalized);
  if (!visible) next.push(city.trim());
  return saveMarketplaceVisibilityPatch({ popularCategoriesDisabledCities: next });
}
