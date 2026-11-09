export interface IndiaLocationOption {
  id: number;
  name: string;
  district: string;
  state: string;
  stateCode: string;
  type: 'state' | 'district' | 'mandal' | 'city' | 'town' | 'village' | 'pincode' | string;
  kind?: string;
  mandal?: string;
  pincode?: string | null;
  lat: number | null;
  lng: number | null;
  popular?: boolean;
  aliases?: string[];
  label?: string;
  source?: 'directory' | 'curated' | 'geocode';
}

export interface LocationStateOption { name: string; code: string; districts: number }
export interface LocationDistrictOption { name: string; locations: number }
export interface LocationPage { locations: IndiaLocationOption[]; nextOffset: number | null }
export interface ExternalLocationSuggestion { placeId: string; text: string; mainText: string; secondaryText: string }
export interface ExternalResolvedLocation {
  city: string;
  area: string;
  state: string;
  label: string;
  lat: number;
  lng: number;
  placeId: string;
  source: 'external';
}

const CACHE_TTL_MS = 60_000;
const MAX_CACHE = 64;
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const pendingRequests = new Map<string, Promise<unknown>>();

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers || {}) },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'LOCATION_SEARCH_FAILED');
  return result as T;
}

function cachedRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    responseCache.delete(key);
    responseCache.set(key, cached);
    return Promise.resolve(cached.value as T);
  }
  if (cached) responseCache.delete(key);
  const pending = pendingRequests.get(key);
  if (pending) return pending as Promise<T>;
  const request = load().then((value) => {
    responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    while (responseCache.size > MAX_CACHE) responseCache.delete(responseCache.keys().next().value!);
    return value;
  }).finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, request);
  return request;
}

function pageUrl(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  return `/api/locations/search?${search.toString()}`;
}

export function locationKey(location: Pick<IndiaLocationOption, 'name' | 'state' | 'district'>): string {
  return `${location.name}|${location.state}|${location.district}`.toLocaleLowerCase('en-IN');
}

export function labelOf(location: Pick<IndiaLocationOption, 'name' | 'district' | 'state'>): string {
  return location.name === location.district ? `${location.name}, ${location.state}` : `${location.name}, ${location.district}, ${location.state}`;
}

export function fetchPopularLocations(): Promise<IndiaLocationOption[]> {
  return cachedRequest('popular:v1', async () => {
    const result = await requestJson<{ locations: IndiaLocationOption[] }>('/api/locations/popular');
    return result.locations;
  });
}

export function fetchLocationStates(): Promise<LocationStateOption[]> {
  return cachedRequest('states:v1', async () => {
    const result = await requestJson<{ states: LocationStateOption[] }>('/api/locations/states');
    return result.states;
  });
}

export function fetchLocationDistricts(state: string): Promise<LocationDistrictOption[]> {
  const key = `districts:${state.toLocaleLowerCase('en-IN')}`;
  return cachedRequest(key, async () => {
    const result = await requestJson<{ districts: LocationDistrictOption[] }>(`/api/locations/districts?state=${encodeURIComponent(state)}`);
    return result.districts;
  });
}

export function searchLocationPage(input: {
  query?: string;
  state?: string;
  district?: string;
  offset?: number;
  signal?: AbortSignal;
}): Promise<LocationPage> {
  const url = pageUrl({ q: input.query, state: input.state, district: input.district, offset: input.offset || 0 });
  const key = `search:${url}`;
  return cachedRequest(key, async () => {
    const result = await requestJson<{ locations: IndiaLocationOption[]; nextOffset: number | null }>(url, { signal: input.signal });
    return { locations: result.locations, nextOffset: result.nextOffset };
  });
}

export async function nearestCatalogLocation(latitude: number, longitude: number): Promise<IndiaLocationOption> {
  const result = await requestJson<{ location: IndiaLocationOption }>('/api/locations/nearest', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude }),
  });
  return result.location;
}

export async function fetchExternalLocationSuggestions(input: string, sessionToken: string): Promise<ExternalLocationSuggestion[]> {
  const result = await requestJson<{ places: ExternalLocationSuggestion[] }>('/api/locations/external/autocomplete', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, sessionToken }),
  });
  return result.places;
}

export async function resolveExternalLocation(placeId: string, sessionToken: string): Promise<ExternalResolvedLocation> {
  const result = await requestJson<{ location: ExternalResolvedLocation }>('/api/locations/external/resolve', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeId, sessionToken }),
  });
  return result.location;
}

/** Unit-test hooks for bounded memory usage; no browser storage is involved. */
export function clearLocationSearchCacheForTests(): void {
  responseCache.clear();
  pendingRequests.clear();
}

export function locationSearchCacheSizeForTests(): number { return responseCache.size; }
