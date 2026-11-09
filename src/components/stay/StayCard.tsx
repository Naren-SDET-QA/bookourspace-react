import React, { useState } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import type { StaySearchItem } from '../../lib/staySearchClient';
import { formatInr } from '../../lib/staySearchClient';
import { propertyTypeLabel } from '../../lib/stayFilters';
import SafeImage from '../SafeImage';

export function StayCard({
  item,
  nights,
  displayTotal,
  saved,
  onOpen,
  onSave,
  onShare,
}: {
  item: StaySearchItem;
  nights: number;
  displayTotal: boolean;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = item.images;
  const showTotal = displayTotal && nights > 0;
  const subtotal = item.priceFromPaise * Math.max(0, nights);
  const serviceFee = Math.round((subtotal * Math.max(0, item.serviceFeeBps || 0)) / 10000);
  const preTax = subtotal + Math.max(0, item.cleaningFeePaise || 0) + serviceFee;
  const totals = Math.round(preTax * (1 + Math.max(0, item.taxPercent) / 100));
  const displayPaise = showTotal ? totals : item.priceFromPaise;
  const location = [item.area, item.city].filter(Boolean).join(', ') || 'Location shared after booking';

  return (
    <article className="group min-w-0">
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="relative block aspect-square w-full overflow-hidden rounded-xl bg-[#f2f0ee] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222] dark:bg-slate-800"
          aria-label={`View ${item.name}`}
        >
          {images.length === 0 ? (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Building2 className="h-8 w-8" aria-hidden="true" />
              <span className="px-4 text-center text-xs font-medium">Photos coming soon</span>
            </span>
          ) : (
            images.map((source, index) => (
              <SafeImage
                key={`${source}-${index}`}
                category="stays"
                src={source}
                alt={`${item.name} photo ${index + 1}`}
                loading="lazy"
                sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 380px"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${index === imageIndex ? 'opacity-100' : 'opacity-0'}`}
                onError={(event) => { event.currentTarget.style.opacity = '0'; }}
              />
            ))
          )}

          {images.length > 1 && (
            <span className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5" aria-hidden="true">
              {images.map((_, index) => (
                <span key={index} className={`h-1.5 w-1.5 rounded-full ${index === imageIndex ? 'bg-white' : 'bg-white/60'}`} />
              ))}
            </span>
          )}
        </button>

        {images.length > 1 && (
          <>
            {imageIndex > 0 && (
              <button
                type="button"
                onClick={(event) => { event.preventDefault(); setImageIndex((index) => Math.max(0, index - 1)); }}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#222222] shadow-md transition hover:scale-105 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            {imageIndex < images.length - 1 && (
              <button
                type="button"
                onClick={(event) => { event.preventDefault(); setImageIndex((index) => Math.min(images.length - 1, index + 1)); }}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#222222] shadow-md transition hover:scale-105 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onShare}
          aria-label={`Share ${item.name}`}
          className="absolute left-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/20 transition hover:scale-105 hover:bg-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Share2 className="h-4.5 w-4.5 text-white" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${item.name} from wishlist` : `Save ${item.name} to wishlist`}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Heart className={`h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${saved ? 'fill-[#f97316] text-[#f97316]' : 'fill-black/30 text-white'}`} aria-hidden="true" />
        </button>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center gap-1.5">
          {item.localTestFixture && (
            <span className="inline-flex items-center rounded-md bg-amber-300 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-amber-950 shadow-sm">
              Local E2E test · not live
            </span>
          )}
          {item.guestFavourite && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-[#222222] shadow-sm">
              <Sparkles className="h-3 w-3 text-[#f97316]" aria-hidden="true" /> Guest favourite
            </span>
          )}
          {item.luxeVerified && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#222222] px-2 py-1 text-[11px] font-semibold text-white shadow-sm">
              <Star className="h-3 w-3" aria-hidden="true" /> Luxe
            </span>
          )}
          {item.instantBook && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-[#222222] shadow-sm">
              <Zap className="h-3 w-3 text-[#f97316]" aria-hidden="true" /> Instant Book
            </span>
          )}
          {item.demo && (
            <>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 shadow-sm">
                Sample
              </span>
              {!item.demoBookable && (
                <span className="inline-flex items-center rounded-md bg-amber-900 px-2 py-1 text-[11px] font-semibold text-white shadow-sm">
                  Not bookable
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <button type="button" onClick={onOpen} className="mt-3 block w-full text-left focus-visible:outline-none">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate text-[15px] font-semibold leading-5">{item.name}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[15px] leading-5">
            {item.reviewCount > 0 ? (
              <>
                <Star className="h-3.5 w-3.5 fill-[#222222] dark:fill-slate-100" aria-hidden="true" />
                {item.rating.toFixed(2)}
                <span className="text-[#717171] dark:text-slate-400">({item.reviewCount})</span>
              </>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">New</span>
            )}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[15px] leading-5 text-[#717171] dark:text-slate-400">{propertyTypeLabel(item.propertyType)} · {location}</span>
        <span className="block truncate text-[15px] leading-5 text-[#717171] dark:text-slate-400">
          {item.bedrooms ? `${item.bedrooms} bedroom${item.bedrooms === 1 ? '' : 's'}` : 'Room details'} · {item.beds || '—'} bed{(item.beds || 0) === 1 ? '' : 's'}
        </span>
        <span className="mt-1 flex flex-wrap items-baseline gap-1 text-[15px] leading-5">
          <span className="font-semibold">{formatInr(displayPaise)}</span>
          <span className="text-[#717171] dark:text-slate-400">{showTotal ? `for ${nights} night${nights === 1 ? '' : 's'}` : 'night'}</span>
        </span>
        {nights > 0 && item.availableUnits !== null && (
          <span className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${item.availableUnits > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {item.availableUnits > 0 ? `${item.availableUnits} available for your dates` : 'Sold out for your dates'}
          </span>
        )}
      </button>
    </article>
  );
}
