import {
  fetchLocationStates,
  fetchLocationDistricts,
  fetchPopularLocations,
  searchLocationPage,
  type IndiaLocationOption,
  type LocationDistrictOption,
  type LocationStateOption,
} from './locationSearch';

export const LOCATION_SEARCH_DEBOUNCE_MS = 280;
export const LOCATION_SEARCH_LIMIT = 10;

export interface IndiaLocationSuggestion {
  id?: number;
  kind: string;
  name: string;
  state: string;
  district: string;
  mandal: string;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  label: string;
  aliases: string[];
  source: 'directory' | 'curated' | 'geocode' | 'external';
}
export type IndiaStateSuggestion = LocationStateOption;
export type IndiaDistrictSuggestion = LocationDistrictOption;

function fromCatalog(loc: IndiaLocationOption): IndiaLocationSuggestion {
  return {
    id: loc.id,
    kind: loc.kind || loc.type,
    name: loc.name,
    state: loc.state,
    district: loc.district,
    mandal: loc.mandal || '',
    pincode: loc.pincode ?? null,
    lat: loc.lat,
    lng: loc.lng,
    label: loc.label || (loc.name === loc.district ? `${loc.name}, ${loc.state}` : `${loc.name}, ${loc.district}, ${loc.state}`),
    aliases: loc.aliases ?? [],
    source: loc.source === 'geocode' ? 'geocode' : 'directory',
  };
}

/** Catalog autocomplete uses only bounded server queries; no India dataset is bundled in the client. */
export async function searchIndiaLocations(query: string, signal?: AbortSignal): Promise<IndiaLocationSuggestion[]> {
  const needle = query.trim();
  if (needle.length < 2) return [];
  const page = await searchLocationPage({ query: needle.slice(0, 80), signal });
  return page.locations.slice(0, LOCATION_SEARCH_LIMIT).map(fromCatalog);
}

export function debounceMsForQuery(_query: string): number { return LOCATION_SEARCH_DEBOUNCE_MS; }

export async function loadIndiaLocationHome(): Promise<{ states: IndiaStateSuggestion[]; popular: IndiaLocationOption[] }> {
  const [states, popular] = await Promise.all([fetchLocationStates(), fetchPopularLocations()]);
  return { states, popular };
}

export function loadIndiaLocationDistricts(state: string): Promise<IndiaDistrictSuggestion[]> {
  return fetchLocationDistricts(state);
}
