/** Match a selected city without treating an unset/All Cities choice as a filter. */
export function matchesSelectedCity(listingCity: string | null | undefined, selectedCity: string | null | undefined): boolean {
  const selected = selectedCity?.trim().toLowerCase();
  if (!selected || selected === 'all' || selected === 'all cities' || selected === 'all locations') return true;
  return Boolean(listingCity?.toLowerCase().includes(selected));
}

export function filterListingsByCity<T extends { location?: { city?: string | null } }>(items: readonly T[], selectedCity: string | null | undefined): T[] {
  if (!selectedCity || ['all', 'all cities', 'all locations'].includes(selectedCity.trim().toLowerCase())) return [...items];
  return items.filter((item) => matchesSelectedCity(item.location?.city, selectedCity));
}

export interface SelectedLocationFilter {
  city?: string | null;
  area?: string | null;
  pincode?: string | null;
}

function isOpenFilter(value: string | null | undefined): boolean {
  const selected = value?.trim().toLowerCase();
  return !selected || selected === 'all' || selected === 'all cities' || selected === 'all locations';
}

/** Match real listing city, area or PIN against the shared location picker. */
export function matchesSelectedLocation(
  location: { city?: string | null; area?: string | null; pincode?: string | null } | undefined,
  selected: SelectedLocationFilter | string | null | undefined,
): boolean {
  const filter: SelectedLocationFilter = typeof selected === 'string' ? { city: selected } : selected || {};
  const needles = [filter.city, filter.area, filter.pincode]
    .map((value) => value?.trim().toLowerCase() || '')
    .filter((value) => value && !isOpenFilter(value));
  if (needles.length === 0) return true;
  const haystack = `${location?.city ?? ''} ${location?.area ?? ''} ${location?.pincode ?? ''}`.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

export function filterListingsByLocation<T extends { location?: { city?: string | null; area?: string | null; pincode?: string | null } }>(
  items: readonly T[],
  selected: SelectedLocationFilter | string | null | undefined,
): T[] {
  return items.filter((item) => matchesSelectedLocation(item.location, selected));
}
