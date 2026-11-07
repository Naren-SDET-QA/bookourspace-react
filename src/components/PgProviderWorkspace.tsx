import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BedDouble, RefreshCw } from 'lucide-react';
import { buildAuthHeaders } from '../lib/supabaseClient';
import { PgBookingPanel, PgMyBookingsPanel } from './PgBookingPanel';

type ProviderPgListing = {
  id: string;
  title: string;
  categoryId?: string;
  category_id?: string;
  entityType?: string;
};

async function loadProviderPgListings(): Promise<ProviderPgListing[]> {
  const response = await fetch('/api/provider/listings', {
    headers: { ...buildAuthHeaders(), Accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || !Array.isArray(data.listings)) {
    throw new Error(data?.error || `HTTP_${response.status}`);
  }
  return data.listings.filter((listing: ProviderPgListing) => {
    const categoryId = String(listing.categoryId || listing.category_id || '').toLowerCase();
    return categoryId.startsWith('pg-') || categoryId === 'cat-26';
  });
}

export default function PgProviderWorkspace() {
  const [listings, setListings] = useState<ProviderPgListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setListings(await loadProviderPgListings());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PG_PROVIDER_LISTINGS_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="space-y-5" aria-label="PG and Hostel provider workspace">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
        <div className="flex items-start gap-3">
          <BedDouble className="mt-0.5 h-5 w-5 shrink-0 text-violet-700 dark:text-violet-300" />
          <div>
            <h3 className="font-black text-slate-900 dark:text-white">PG &amp; Hostel inventory</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              Add or edit room types and beds, review PostgreSQL availability, and manage resident bookings. Only listings returned for your authenticated provider account appear here.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-violet-300 bg-white px-3 text-xs font-bold text-violet-800 disabled:opacity-50 dark:bg-slate-900 dark:text-violet-200">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh listings
        </button>
      </header>

      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" />{error.replaceAll('_', ' ').toLowerCase()}</p>}
      {loading && <p role="status" className="text-sm text-slate-500">Loading your PG and Hostel listings…</p>}
      {!loading && !error && listings.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <h4 className="font-bold text-slate-800 dark:text-slate-100">No PG or Hostel listings yet</h4>
          <p className="mt-1 text-sm text-slate-500">Create a PG or Hostel listing first. Once it appears in your provider listings, room and bed inventory can be managed here.</p>
        </div>
      )}

      {listings.map((listing) => (
        <article key={listing.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid={`provider-pg-listing-${listing.id}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-extrabold text-slate-900 dark:text-white">{listing.title}</h4>
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase text-violet-800 dark:bg-violet-950 dark:text-violet-200">{listing.categoryId || listing.category_id}</span>
          </div>
          <PgBookingPanel listingId={listing.id} />
        </article>
      ))}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 text-base font-black text-slate-900 dark:text-white">Resident bookings and payment status</h3>
        <PgMyBookingsPanel open />
      </section>
    </section>
  );
}
