import { useEffect, useState } from 'react';
import { MarketplaceListing, CategoryDef } from '../types/marketplace';

const CACHE_DATA_KEY = 'crafto-marketplace-data-v2';
const LISTINGS_URL = '/api/marketplace/listings';
const CATEGORIES_URL = '/api/marketplace/categories';
const TIMESTAMP_KEY = 'crafto_marketplace_last_cache_time';

/**
 * Clean up any legacy Service Worker script caches so Vite ESM modules are never served with mismatched hashes
 */
export function registerServiceWorker() {
  if (typeof window !== 'undefined') {
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k !== CACHE_DATA_KEY)
              .map((k) => caches.delete(k))
          )
        )
        .catch(() => {});
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
    }
  }
}

/**
 * Saves listings and categories to Browser Cache Storage API and localStorage fallback
 */
export async function saveMarketplaceToCache(
  listings: MarketplaceListing[],
  categories: CategoryDef[]
): Promise<boolean> {
  try {
    const timestamp = new Date().toISOString();

    // 1. Save to LocalStorage
    try {
      localStorage.setItem('crafto_cached_listings_v6', JSON.stringify(listings));
      localStorage.setItem('crafto_cached_categories', JSON.stringify(categories));
      localStorage.setItem(TIMESTAMP_KEY, timestamp);
    } catch (e) {
      console.warn('LocalStorage caching quota error:', e);
    }

    // 2. Save to Browser Cache Storage API
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await caches.open(CACHE_DATA_KEY);

      // Cache listings
      const listingsBlob = new Blob([JSON.stringify(listings)], { type: 'application/json' });
      const listingsResponse = new Response(listingsBlob, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Crafto-Cache-Date': timestamp
        }
      });
      await cache.put(LISTINGS_URL, listingsResponse);

      // Cache categories
      const categoriesBlob = new Blob([JSON.stringify(categories)], { type: 'application/json' });
      const categoriesResponse = new Response(categoriesBlob, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Crafto-Cache-Date': timestamp
        }
      });
      await cache.put(CATEGORIES_URL, categoriesResponse);
    }

    return true;
  } catch (err) {
    console.warn('Failed to cache marketplace data:', err);
    return false;
  }
}

/**
 * Loads cached marketplace data from Browser Cache Storage or localStorage
 */
export async function loadMarketplaceFromCache(): Promise<{
  listings: MarketplaceListing[] | null;
  categories: CategoryDef[] | null;
  cachedAt: string | null;
}> {
  let cachedListings: MarketplaceListing[] | null = null;
  let cachedCategories: CategoryDef[] | null = null;
  let cachedAt: string | null = null;

  // 1. Try Browser Cache Storage API first
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(CACHE_DATA_KEY);
      const listingsRes = await cache.match(LISTINGS_URL);
      if (listingsRes) {
        cachedListings = await listingsRes.json();
        cachedAt = listingsRes.headers.get('X-Crafto-Cache-Date');
      }

      const categoriesRes = await cache.match(CATEGORIES_URL);
      if (categoriesRes) {
        cachedCategories = await categoriesRes.json();
      }
    } catch (e) {
      console.warn('Cache storage match error:', e);
    }
  }

  // 2. Fallback to localStorage if Cache Storage empty
  if (!cachedListings || cachedListings.length === 0) {
    try {
      const stored = localStorage.getItem('crafto_cached_listings_v6') || localStorage.getItem('marketplace_listings_v6');
      if (stored) {
        cachedListings = JSON.parse(stored);
      }
      const storedCats = localStorage.getItem('crafto_cached_categories') || localStorage.getItem('marketplace_categories');
      if (storedCats) {
        cachedCategories = JSON.parse(storedCats);
      }
      cachedAt = localStorage.getItem(TIMESTAMP_KEY);
    } catch (e) {}
  }

  return {
    listings: cachedListings,
    categories: cachedCategories,
    cachedAt: cachedAt || null
  };
}

/**
 * Hook to track browser online/offline connectivity
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
