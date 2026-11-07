import { buildAuthHeaders, fetchRlsFavorites, syncRlsFavorite } from './supabaseClient';
import type { StaySearchItem } from './staySearchClient';

/** Cloud rows in public.user_favorites. Guest rows stay in localStorage. */
export const STAY_WISHLIST_PREFIX = 'stay:';
export const GUEST_SAVED_KEY = 'bos_stay_saved_v1';
export const GUEST_SNAPSHOTS_KEY = 'bos_stay_saved_snapshots_v1';

export function stayFavoriteKey(listingId: string): string {
  const id = String(listingId || '').trim();
  if (!id) return '';
  return id.startsWith(STAY_WISHLIST_PREFIX) ? id : `${STAY_WISHLIST_PREFIX}${id}`;
}

export function stayListingIdFromFavorite(key: string): string {
  const value = String(key || '');
  return value.startsWith(STAY_WISHLIST_PREFIX) ? value.slice(STAY_WISHLIST_PREFIX.length) : value;
}

export function loadGuestSavedIds(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GUEST_SAVED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0) : [];
  } catch {
    return [];
  }
}

export function persistGuestSavedIds(ids: string[]): void {
  try {
    window.localStorage.setItem(GUEST_SAVED_KEY, JSON.stringify(ids.slice(0, 80)));
  } catch {
    /* quota */
  }
}

export function loadGuestSnapshots(): StaySearchItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GUEST_SNAPSHOTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is StaySearchItem => item && typeof item.listingId === 'string') : [];
  } catch {
    return [];
  }
}

export function persistGuestSnapshots(items: StaySearchItem[]): void {
  try {
    window.localStorage.setItem(GUEST_SNAPSHOTS_KEY, JSON.stringify(items.slice(0, 80)));
  } catch {
    /* quota */
  }
}

async function fetchHmacStayWishlistIds(): Promise<string[] | null> {
  try {
    const headers = buildAuthHeaders();
    if (!headers.Authorization) return null;
    const response = await fetch('/api/stays/wishlists', { headers: { Accept: 'application/json', ...headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok || !Array.isArray(body.listingIds)) return null;
    return body.listingIds.filter((value: unknown): value is string => typeof value === 'string');
  } catch {
    return null;
  }
}

export async function fetchCloudStayWishlistIds(): Promise<string[] | null> {
  const [hmac, rls] = await Promise.all([fetchHmacStayWishlistIds(), fetchRlsFavorites()]);
  if (!hmac && !rls) return null;
  const merged = new Set<string>();
  for (const id of hmac || []) merged.add(id);
  for (const key of rls || []) {
    if (!String(key).startsWith(STAY_WISHLIST_PREFIX)) continue;
    merged.add(stayListingIdFromFavorite(key));
  }
  return [...merged].filter(Boolean);
}

export async function syncCloudStayWishlist(listingId: string, saved: boolean): Promise<boolean> {
  const key = stayFavoriteKey(listingId);
  if (!key) return false;
  const id = stayListingIdFromFavorite(key);
  let ok = false;
  const rls = await syncRlsFavorite(key, saved);
  if (rls) ok = true;
  try {
    const headers = buildAuthHeaders();
    if (headers.Authorization) {
      const response = await fetch(`/api/stays/wishlists/${encodeURIComponent(id)}`, {
        method: saved ? 'PUT' : 'DELETE',
        headers: { Accept: 'application/json', ...headers },
      });
      if (response.ok) ok = true;
    }
  } catch {
    /* cloud row may still have been written via RLS */
  }
  return ok;
}
