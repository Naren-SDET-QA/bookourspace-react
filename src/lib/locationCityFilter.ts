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
