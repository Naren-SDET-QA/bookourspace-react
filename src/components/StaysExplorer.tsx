import React, { lazy, Suspense, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Filter,
  Heart,
  MapPin,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import { useMarketplace } from '../context/MarketplaceContext';
import {
  buildStayPriceBreakdown,
  filterStayListings,
  getStayTypeForListing,
  stayTypeOptions,
  StaySearchFilters,
  StayTypeId,
} from '../features/stays/staysUtils';
import { ExplorerLayout, explorerLayoutOptions } from '../features/explorer/explorerLayout';

interface StaysExplorerProps {
  listings: MarketplaceListing[];
  onSelectListing: (listing: MarketplaceListing) => void;
  onBookListing: (listing: MarketplaceListing) => void;
  currentLang?: string;
}

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDate = (date: string, days: number) => {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return toIsoDate(parsed);
};

const nightsBetween = (checkIn: string, checkOut: string) => {
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
    new Date(`${date}T12:00:00`)
  );

const capacityFor = (listing: MarketplaceListing) => {
  const value = String(
    listing.customFieldValues?.guestCapacityEn || listing.customFieldValues?.guestCapacity || '2'
  );
  return Number(value.match(/\d+(?:\.\d+)?/)?.[0] || 2);
};

const ListingMap = lazy(() =>
  import('./ListingMap').then((module) => ({ default: module.ListingMap }))
);

const stayTypeLabel = (listing: MarketplaceListing) =>
  stayTypeOptions.find((option) => option.id === getStayTypeForListing(listing))?.label || 'Stay';

export const StaysExplorer: React.FC<StaysExplorerProps> = ({
  listings,
  onSelectListing,
  onBookListing,
  currentLang = 'en',
}) => {
  const isTelugu = currentLang === 'te';
  const labels = {
    where: isTelugu ? 'ఎక్కడ / Where' : 'Where',
    checkIn: isTelugu ? 'చెక్-ఇన్ / Check in' : 'Check in',
    checkOut: isTelugu ? 'చెక్-అవుట్ / Check out' : 'Check out',
    search: isTelugu ? 'వెతకండి / Search' : 'Search',
    guests: isTelugu ? 'అతిథులు' : 'guests',
    night: isTelugu ? 'రాత్రి' : 'night',
    nights: isTelugu ? 'రాత్రులు' : 'nights',
    allStays: isTelugu ? 'అన్ని స్టేస్ / All stays' : 'All stays',
    filters: isTelugu ? 'ఫిల్టర్లు / Filters' : 'Filters',
    list: isTelugu ? 'జాబితా / List' : 'List',
    map: isTelugu ? 'మ్యాప్ / Map' : 'Map',
    propertyDetails: isTelugu ? 'ఆస్తి వివరాలు / Property details' : 'Property details',
    priceBreakdown: isTelugu ? 'ధర విభజన / Price breakdown' : 'Price breakdown',
    continueBooking: isTelugu ? 'సురక్షిత బుకింగ్ కొనసాగించండి' : 'Continue to secure booking',
    reserve: isTelugu ? 'రిజర్వ్ / Reserve' : 'Reserve',
  };
  const today = useMemo(() => toIsoDate(new Date()), []);
  const [destination, setDestination] = useState('Hyderabad');
  const [checkIn, setCheckIn] = useState(shiftDate(today, 1));
  const [checkOut, setCheckOut] = useState(shiftDate(today, 2));
  const [guests, setGuests] = useState(2);
  const [stayType, setStayType] = useState<StayTypeId>('all');
  const [minimumRating, setMinimumRating] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedStay, setSelectedStay] = useState<MarketplaceListing | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [roomChoice, setRoomChoice] = useState('provider_tariff');
  const [layout, setLayout] = useState<ExplorerLayout>('airbnb');
  const isAirbnbLayout = layout === 'airbnb';

  const filters: StaySearchFilters = {
    query: destination.trim(),
    stayType,
    guests,
    minimumRating,
    page,
    pageSize: 6,
  };
  const result = useMemo(
    () => filterStayListings(listings, filters),
    [listings, destination, stayType, guests, minimumRating, page]
  );
  const nights = nightsBetween(checkIn, checkOut);
  const selectedPrice = selectedStay ? buildStayPriceBreakdown(selectedStay, nights) : null;

  const selectStay = (listing: MarketplaceListing) => {
    setSelectedStay(listing);
    setGalleryIndex(0);
    setRoomChoice('provider_tariff');
  };

  const searchStays = () => {
    setPage(1);
    document.getElementById('bos-stays-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updateCheckIn = (value: string) => {
    setCheckIn(value);
    if (!checkOut || checkOut <= value) setCheckOut(shiftDate(value, 1));
  };

  return (
    <section className="space-y-7" aria-labelledby="stays-explorer-title">
      <div className={`overflow-hidden rounded-[28px] border text-slate-900 shadow-[0_14px_40px_rgba(15,23,42,0.08)] dark:text-white ${isAirbnbLayout ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950' : 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-900/70 dark:bg-slate-950'}`}>
        <div className="relative px-5 pb-5 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
          <div className="relative max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
              <CircleCheck className="h-3.5 w-3.5" /> BookOurSpace Stays · స్టేస్
            </div>
            <h2 id="stays-explorer-title" className="text-2xl font-black tracking-tight sm:text-4xl dark:text-white">
              {isTelugu ? 'మీ తదుపరి బసను కనుగొనండి.' : 'Find your next stay.'}
            </h2>
            <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {isTelugu
                ? 'వెరిఫైడ్ ప్రొవైడర్ల నుంచి హోటల్స్, హోమ్ స్టేస్, ఫ్లాట్స్ మరియు ప్రైవేట్ రిట్రీట్స్.'
                : 'Hotels, home stays, furnished flats and private retreats from verified providers. Compare the full stay cost before you send a booking request.'}
            </p>
          </div>

          <div className="mt-5 inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900" role="group" aria-label="Choose stays layout">
            {explorerLayoutOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLayout(option.id)}
                title={option.description}
                className={`rounded-full px-3 py-2 text-[11px] font-black transition ${layout === option.id ? (option.id === 'airbnb' ? 'bg-[#FF385C] text-white' : 'bg-indigo-600 text-white') : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {option.id === 'classic' ? 'Classic' : 'Airbnb-inspired'}
              </button>
            ))}
          </div>

          <div className="relative mt-6 rounded-[24px] border border-slate-200 bg-white p-2 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:rounded-full sm:p-2">
            <div className="grid gap-2 sm:grid-cols-[1.25fr_1fr_1fr_auto] sm:items-end">
              <label className="min-w-0 rounded-2xl border border-slate-200 px-3 py-2.5 dark:border-slate-700 sm:rounded-full">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <Search className="h-3.5 w-3.5" /> {labels.where}
                </span>
                <input
                  value={destination}
                  onChange={(event) => {
                    setDestination(event.target.value);
                    setPage(1);
                  }}
                  placeholder="City, area or property"
                  className="mt-1 w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400 dark:text-white"
                  aria-label="Search stays by city, area, or property"
                />
              </label>
              <label className="rounded-2xl border border-slate-200 px-3 py-2.5 dark:border-slate-700 sm:rounded-full">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" /> {labels.checkIn}
                </span>
                <input
                  type="date"
                  min={today}
                  value={checkIn}
                  onChange={(event) => updateCheckIn(event.target.value)}
                  className="mt-1 w-full bg-transparent text-sm font-bold outline-none dark:text-white"
                  aria-label="Check-in date"
                />
              </label>
              <label className="rounded-2xl border border-slate-200 px-3 py-2.5 dark:border-slate-700 sm:rounded-full">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" /> {labels.checkOut}
                </span>
                <input
                  type="date"
                  min={shiftDate(checkIn, 1)}
                  value={checkOut}
                  onChange={(event) => setCheckOut(event.target.value)}
                  className="mt-1 w-full bg-transparent text-sm font-bold outline-none dark:text-white"
                  aria-label="Check-out date"
                />
              </label>
              <button
                type="button"
                onClick={searchStays}
                className="flex h-[58px] items-center justify-center gap-2 rounded-full bg-[#FF385C] px-5 text-sm font-black text-white transition hover:bg-rose-700 active:scale-[0.98]"
              >
                <Search className="h-4 w-4" /> {labels.search}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
              <span className="flex items-center gap-2 font-bold text-slate-600 dark:text-slate-200">
                <Users className="h-4 w-4 text-[#FF385C]" /> {guests} {labels.guests} · {nights} {nights === 1 ? labels.night : labels.nights}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGuests((current) => Math.max(1, current - 1))}
                  className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  aria-label="Decrease guests"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setGuests((current) => Math.min(20, current + 1))}
                  className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  aria-label="Increase guests"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Stay types">
        <button
          type="button"
          onClick={() => {
            setStayType('all');
            setPage(1);
          }}
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-4 py-2.5 text-left transition ${
            stayType === 'all'
              ? 'border-[#FF385C] bg-[#FF385C] text-white shadow-md'
              : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
          }`}
        >
          <span className="mr-1 inline text-base">✨</span>
          <span className="inline text-xs font-black">{labels.allStays}</span>
        </button>
        {stayTypeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setStayType(option.id);
              setPage(1);
            }}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-4 py-2.5 text-left transition ${
              stayType === option.id
                ? 'border-[#FF385C] bg-rose-50 text-rose-800 shadow-md dark:bg-rose-950/50 dark:text-rose-100'
                : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            <span className="mr-1 inline text-base">{option.emoji}</span>
            <span className="inline text-xs font-black">{isTelugu ? `${option.teLabel} / ${option.label}` : option.label}</span>
          </button>
        ))}
      </div>

      <div id="bos-stays-results" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FF385C]">{destination} stays</p>
            <h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">
              {result.total} spaces available to explore
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black ${
                filtersOpen || minimumRating > 0
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200'
                  : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" /> {labels.filters}
            </button>
            <div className="flex rounded-full border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`rounded-full px-3 py-1.5 text-xs font-black ${viewMode === 'list' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500'}`}
              >
                {labels.list}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`rounded-full px-3 py-1.5 text-xs font-black ${viewMode === 'map' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500'}`}
              >
                {labels.map}
              </button>
            </div>
          </div>
        </div>

        {filtersOpen && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/30">
            <span className="mr-1 flex items-center gap-1.5 text-xs font-black text-indigo-900 dark:text-indigo-100">
              <Filter className="h-3.5 w-3.5" /> Guest rating
            </span>
            {[0, 4, 4.5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => {
                  setMinimumRating(rating);
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                  minimumRating === rating
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-indigo-200 bg-white text-indigo-800 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-200'
                }`}
              >
                {rating === 0 ? 'Any rating' : `${rating}+ stars`}
              </button>
            ))}
          </div>
        )}

        {viewMode === 'map' && (
          <Suspense fallback={<div className="h-72 animate-pulse rounded-3xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />}>
            <ListingMap
              listings={result.items}
              onSelectListing={selectStay}
              label={isTelugu ? 'స్టేస్ మ్యాప్ / Stays map' : 'Stays map'}
            />
          </Suspense>
        )}

        {result.items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl dark:bg-indigo-950/50">🏡</div>
            <h4 className="mt-3 text-base font-black text-slate-900 dark:text-white">No stays match those filters</h4>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">Try another area, lower the guest rating, or choose All stays.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.items.map((listing) => (
              <StayCard
                key={listing.id}
                listing={listing}
                nights={nights}
                currentLang={currentLang}
                layout={layout}
                onOpen={() => selectStay(listing)}
                onBook={() => onBookListing(listing)}
              />
            ))}
          </div>
        )}

        {result.total > 6 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-full border border-slate-200 bg-white p-2 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900"
              aria-label="Previous stays"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-black text-slate-500">Page {page}</span>
            <button
              type="button"
              disabled={!result.hasNextPage}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-full border border-slate-200 bg-white p-2 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900"
              aria-label="Next stays"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {selectedStay && selectedPrice && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white shadow-2xl dark:bg-slate-900 sm:rounded-[28px]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">{labels.propertyDetails}</p>
                <h3 className="mt-1 max-w-[70vw] truncate text-base font-black text-slate-900 dark:text-white">{selectedStay.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStay(null)}
                className="rounded-full bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                aria-label="Close property details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-3xl bg-slate-100 dark:bg-slate-800">
                  <img
                    src={selectedStay.images[galleryIndex] || selectedStay.images[0]}
                    alt={selectedStay.title}
                    className="h-64 w-full object-cover sm:h-80"
                  />
                  {selectedStay.images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setGalleryIndex((current) => (current - 1 + selectedStay.images.length) % selectedStay.images.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white"
                        aria-label="Previous gallery image"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGalleryIndex((current) => (current + 1) % selectedStay.images.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white"
                        aria-label="Next gallery image"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <span className="absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-1 text-[10px] font-black text-white">
                    {galleryIndex + 1} / {selectedStay.images.length} photos
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto">
                  {selectedStay.images.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => setGalleryIndex(index)}
                      className={`h-14 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${galleryIndex === index ? 'border-indigo-600' : 'border-transparent'}`}
                      aria-label={`Open gallery image ${index + 1}`}
                    >
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200">{stayTypeLabel(selectedStay)}</span>
                    {selectedStay.isVerified && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">Verified provider</span>}
                  </div>
                  <h4 className="mt-2 text-xl font-black leading-tight text-slate-900 dark:text-white">{selectedStay.title}</h4>
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-slate-500"><MapPin className="h-3.5 w-3.5" /> {selectedStay.location.area}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedStay.description}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {['Provider-managed inventory', 'Secure booking validation', 'Transparent price before pay'].map((label) => (
                    <div key={label} className="rounded-2xl bg-slate-50 p-3 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <CircleCheck className="mb-1 h-4 w-4 text-emerald-600" /> {label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Your stay</p>
                      <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{formatDate(checkIn)} – {formatDate(checkOut)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{guests} {labels.guests} · {nights} {labels.nights}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedStay(null)} className="text-xs font-black text-indigo-600">Edit</button>
                  </div>
                  <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                    <p className="text-[10px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-200">Room / flat selection</p>
                    <label className="mt-2 flex cursor-pointer items-start gap-2">
                      <input type="radio" name="stay-room" value="provider_tariff" checked={roomChoice === 'provider_tariff'} onChange={() => setRoomChoice('provider_tariff')} className="mt-0.5 accent-indigo-600" />
                      <span><span className="block text-xs font-black text-slate-800 dark:text-slate-100">{String(selectedStay.customFieldValues?.roomSpecLineEn || selectedStay.subcategory)}</span><span className="mt-0.5 block text-[11px] text-slate-500">Provider tariff · capacity up to {capacityFor(selectedStay)} guests</span></span>
                    </label>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-slate-900 dark:text-white">{labels.priceBreakdown}</p>
                    <span className="text-[10px] font-bold text-emerald-600">No hidden fees</span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <PriceRow label={`₹${selectedPrice.nightlyRate.toLocaleString('en-IN')} × ${nights} nights`} value={selectedPrice.baseAmount} />
                    <PriceRow label="Cleaning & housekeeping" value={selectedPrice.cleaningFee} />
                    <PriceRow label="BookOurSpace service fee" value={selectedPrice.serviceFee} />
                    <PriceRow label="Applicable hospitality taxes" value={selectedPrice.taxes} />
                    <div className="border-t border-slate-100 pt-2 dark:border-slate-800"><PriceRow label="Total before secure booking" value={selectedPrice.total} strong /></div>
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-slate-500">Final availability, amount, and payment status are verified server-side when you continue.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStay(null);
                    onBookListing(selectedStay);
                  }}
                  className="w-full rounded-2xl bg-[#E11D48] px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700 dark:shadow-none"
                >
                  {labels.continueBooking}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStay(null);
                    onSelectListing(selectedStay);
                  }}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-700 dark:border-slate-800 dark:text-slate-200"
                >
                  {isTelugu ? 'పూర్తి ప్రాపర్టీ వివరాలు' : 'Open full property details'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const PriceRow: React.FC<{ label: string; value: number; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`flex items-center justify-between gap-3 ${strong ? 'text-sm font-black text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
    <span>{label}</span><span>₹{value.toLocaleString('en-IN')}</span>
  </div>
);

const StayCard: React.FC<{
  listing: MarketplaceListing;
  nights: number;
  currentLang: string;
  layout: ExplorerLayout;
  onOpen: () => void;
  onBook: () => void;
}> = ({ listing, nights, currentLang, layout, onOpen, onBook }) => {
  const { favoriteIds, toggleFavorite } = useMarketplace();
  const liked = favoriteIds.includes(listing.id);
  const price = buildStayPriceBreakdown(listing, nights);
  const isTelugu = currentLang === 'te';
  const stayOption = stayTypeOptions.find((option) => option.id === getStayTypeForListing(listing));
  return (
    <article className={`group overflow-hidden transition hover:-translate-y-0.5 ${layout === 'classic' ? 'rounded-3xl border border-indigo-100 bg-white p-3 shadow-[0_10px_28px_rgba(79,70,229,0.08)] dark:border-indigo-900/50 dark:bg-slate-900' : 'rounded-2xl bg-transparent'}`}>
      <div className="relative cursor-pointer" onClick={onOpen}>
        <img src={listing.images[0]} alt={listing.title} className={`w-full object-cover transition duration-500 group-hover:scale-[1.02] ${layout === 'classic' ? 'h-48 rounded-2xl' : 'h-56 rounded-2xl'}`} />
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black text-slate-700 shadow-sm">{isTelugu ? `${stayOption?.teLabel || 'స్టే'} / ${stayTypeLabel(listing)}` : stayTypeLabel(listing)}</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite(listing.id);
          }}
          aria-label={liked ? 'Remove from favorites' : 'Save stay to favorites'}
          aria-pressed={liked}
          className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-slate-700 shadow-sm"
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
        </button>
        {listing.isFeatured && <span className="absolute bottom-3 left-3 rounded-full bg-[#FFE500] px-2.5 py-1 text-[10px] font-black text-slate-900">Guest favorite</span>}
      </div>
      <div className="space-y-2.5 px-1 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="line-clamp-2 text-sm font-black leading-5 text-slate-900 dark:text-white">{listing.title}</h4>
            <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-slate-500"><MapPin className="h-3 w-3" /> {listing.location.area}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-xs font-black text-slate-700 dark:text-slate-200"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {listing.providerRating.toFixed(1)}</span>
        </div>
        <p className="line-clamp-1 text-xs text-slate-500">{String(listing.customFieldValues?.roomSpecLineEn || listing.subcategory)}</p>
        <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div><span className="text-base font-black text-slate-900 dark:text-white">₹{price.nightlyRate.toLocaleString('en-IN')}</span><span className="text-[11px] font-bold text-slate-500"> / night</span><p className="mt-0.5 text-[10px] text-slate-500">₹{price.total.toLocaleString('en-IN')} total · {nights} nights</p></div>
          <button type="button" onClick={onBook} className={`rounded-full px-3.5 py-2 text-[11px] font-black text-white transition ${layout === 'classic' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-[#FF385C] hover:bg-rose-700'}`}>{isTelugu ? 'రిజర్వ్ / Reserve' : 'Reserve'}</button>
        </div>
      </div>
    </article>
  );
};

