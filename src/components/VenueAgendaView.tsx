import React from 'react';
import { ArrowRight, MapPin, Star } from 'lucide-react';
import type { MarketplaceListing } from '../types/marketplace';

/**
 * Agenda-style Venues discovery. This is intentionally a different design from
 * the card grid: one full-width row per venue with a large image, facts and a
 * single clear action, so the admin can switch the whole section's presentation.
 */
export function VenueAgendaView({
  listings,
  onOpen,
}: {
  listings: MarketplaceListing[];
  onOpen: (listing: MarketplaceListing) => void;
}) {
  if (listings.length === 0) return null;
  return (
    <section className="mt-4" aria-label="Venues agenda">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">Venue agenda</h3>
          <p className="text-[11px] text-slate-500">Full-width venue rows — compare capacity, area and price in one scan.</p>
        </div>
        <span className="text-[11px] font-bold text-slate-500">{listings.length} venues</span>
      </div>
      <ol className="space-y-2.5">
        {listings.map((listing, index) => {
          const photo = (listing as any).images?.[0] || (listing as any).imageUrl || (listing as any).photo;
          const price = Number((listing as any).priceFromPaise ?? (listing as any).pricePaise ?? 0);
          const rating = Number((listing as any).rating ?? 0);
          const area = [(listing as any).area, (listing as any).city].filter(Boolean).join(', ');
          return (
            <li key={listing.id}>
              <button
                type="button"
                onClick={() => onOpen(listing)}
                className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-violet-300 hover:shadow-md sm:grid-cols-[140px_1fr_auto] dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="relative block h-20 w-20 overflow-hidden rounded-xl bg-slate-100 sm:h-24 sm:w-full dark:bg-slate-800">
                  {photo ? (
                    <img src={String(photo)} alt={listing.title} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl" aria-hidden="true">🏛️</span>
                  )}
                  <span className="absolute left-1 top-1 rounded-full bg-slate-950/80 px-2 py-0.5 text-[9px] font-black text-white">#{index + 1}</span>
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-black text-slate-900 dark:text-white">{listing.title}</span>
                    {(listing as any).verified && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">VERIFIED</span>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    {area && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{area}</span>}
                    <span>{(listing as any).categoryLabel || listing.categoryId?.replace('venue-', '').replace(/-/g, ' ')}</span>
                    {(listing as any).capacity && <span>Up to {(listing as any).capacity} guests</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {rating > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{rating.toFixed(1)}</span>}
                    {(listing as any).area && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{(listing as any).area}</span>}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {price > 0 && <span className="text-sm font-black text-slate-900 dark:text-white">₹{Math.round(price / 100).toLocaleString('en-IN')}</span>}
                  <span className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2.5 py-1.5 text-[11px] font-bold text-white">View venue <ArrowRight className="h-3 w-3" /></span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
