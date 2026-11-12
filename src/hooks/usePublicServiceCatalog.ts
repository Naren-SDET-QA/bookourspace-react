import { useCallback, useEffect, useState } from 'react';
import { fetchPublicServiceCatalog } from '../lib/serviceCatalogClient';
import {
  normalizePublicServiceCategory,
  type PublicServiceCategory,
} from '../lib/serviceCatalog';

/**
 * Public, published service categories. A failure leaves the caller with the
 * built-in catalog instead of inventing categories.
 */
export function usePublicServiceCatalog() {
  const [categories, setCategories] = useState<PublicServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchPublicServiceCatalog();
      const normalized = (response.categories || [])
        .map(normalizePublicServiceCategory)
        .filter((category): category is PublicServiceCategory => Boolean(category));
      setCategories(normalized);
      setError('');
    } catch (caught) {
      setCategories([]);
      setError(caught instanceof Error ? caught.message : 'SERVICE_CATALOG_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [refresh]);

  return { categories, loading, error, refresh };
}
