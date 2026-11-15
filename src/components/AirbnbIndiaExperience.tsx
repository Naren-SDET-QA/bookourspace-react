import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Bath,
  BedDouble,
  Building2,
  Car,
  Castle,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  DoorOpen,
  Dumbbell,
  Flame,
  Gamepad2,
  Gem,
  Globe,
  Heart,
  Home,
  Lock,
  MapPin,
  Menu,
  Mountain,
  Palmtree,
  Search,
  Share2,
  ShieldCheck,
  Ship,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tractor,
  TreePine,
  Trees,
  Tv,
  User,
  UtensilsCrossed,
  Waves,
  Wifi,
  Wind,
  WashingMachine,
  X,
  Minus,
  Plus,
} from 'lucide-react';
import {
  airbnbCategories,
  airbnbListings,
  type AirbnbListing,
  formatINR,
} from '../data/airbnbIndiaData';
import { DEMO_DATA_ENABLED } from '../lib/demoDataPolicy';
import { fetchStayProperties, type StayProperty } from '../lib/stayDiscoveryData';
import { supabase, fetchCurrentAuthSession } from '../lib/supabaseClient';
import { StayCheckoutPanel } from './StayCheckoutPanel';

interface AirbnbIndiaExperienceProps {
  onClose: () => void;
  onSwitchToOld: () => void;
  /** Render in the page flow under the common header instead of as a full-screen dialog. */
  inline?: boolean;
}

/* --------------------------- BookOurSpace branding -------------------------- */

function BookOurSpaceEmblem({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 text-white shadow-sm ${className ?? 'h-8 w-8'}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[58%] w-[58%]"
      >
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    </span>
  );
}

function BookOurSpaceWordmark({ className }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className ?? 'text-xl'}`} translate="no">
      <span className="text-[#0F172A] dark:text-white">Book</span>
      <span className="text-orange-500">Our</span>
      <span className="text-indigo-600 dark:text-indigo-300">Space</span>
    </span>
  );
}

/* ------------------------------ Tab switcher ------------------------------ */

export function ExperienceTabBar({
  active,
  onOld,
  onAirbnb,
}: {
  active: 'old' | 'airbnb';
  onOld: () => void;
  onAirbnb: () => void;
}) {
  const base =
    'inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition';
  return (
    <div className="flex shrink-0 items-center justify-center border-b border-[#ebebeb] bg-[#f7f7f7] px-4 py-2">
      <div className="inline-flex items-center rounded-full border border-[#dddddd] bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={onOld}
          className={`${base} ${active === 'old' ? 'bg-[#222222] text-white' : 'text-[#717171] hover:bg-[#f7f7f7]'}`}
        >
          Stay 1
        </button>
        <button
          type="button"
          onClick={onAirbnb}
          className={`${base} ${active === 'airbnb' ? 'bg-[#f97316] text-white' : 'text-[#717171] hover:bg-[#f7f7f7]'}`}
        >
          <BookOurSpaceEmblem className="h-4 w-4 rounded-[5px]" /> Stay 2
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ Category rail ----------------------------- */

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  trending: Flame,
  omg: Sparkles,
  pools: Waves,
  beach: Palmtree,
  islands: Palmtree,
  cabins: TreePine,
  tiny_homes: Home,
  lakefront: Waves,
  houseboats: Ship,
  luxe: Gem,
  amazing_views: Mountain,
  treehouses: Trees,
  national_parks: Trees,
  farms: Tractor,
  mansions: Building2,
  castles: Castle,
  rooms: DoorOpen,
  play: Gamepad2,
};

/* ------------------------------ Listing card ------------------------------ */

function ListingCard({
  listing,
  saved,
  isReal = false,
  onSave,
  onOpen,
  onShare,
}: {
  listing: AirbnbListing;
  saved: boolean;
  isReal?: boolean;
  onSave: () => void;
  onOpen: () => void;
  onShare: () => void;
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = listing.images;

  return (
    <article className="group">
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="relative block aspect-square w-full overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222]"
          aria-label={`View ${listing.title}`}
        >
          {images.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 via-white to-slate-200 text-slate-500">
              <Building2 className="h-8 w-8" aria-hidden="true" />
              <span className="px-4 text-center text-xs font-medium">Photos coming soon</span>
            </div>
          )}
          {images.map((src, index) => (
            <img
              key={src + index}
              src={src}
              alt={`${listing.title} photo ${index + 1}`}
              loading="lazy"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                index === imageIndex ? 'opacity-100' : 'opacity-0'
              }`}
              onError={(event) => {
                event.currentTarget.style.opacity = '0';
              }}
            />
          ))}

          {/* Carousel dots */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
              {images.map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full transition-all ${
                    index === imageIndex ? 'w-1.5 bg-white' : 'w-1.5 bg-white/60'
                  }`}
                />
              ))}
            </div>
          )}
        </button>

        {/* Sibling controls keep interactive buttons out of the photo button. */}
        {images.length > 1 && (
          <>
            {imageIndex > 0 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setImageIndex((i) => i - 1);
                }}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md transition hover:scale-105 group-hover:flex"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {imageIndex < images.length - 1 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setImageIndex((i) => i + 1);
                }}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md transition hover:scale-105 group-hover:flex"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onShare}
          aria-label={`Share ${listing.title}`}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-105"
        >
          <Share2 className="h-5 w-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
        </button>

        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          className="absolute left-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-105"
        >
          <Heart
            className={`h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${
              saved ? 'fill-[#f97316] text-[#f97316]' : 'fill-black/25 text-white'
            }`}
          />
        </button>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 block w-full text-left focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-[15px] font-semibold leading-5 text-[#222222]">
            {listing.title}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1 text-[15px] leading-5 text-[#222222]">
            {isReal && listing.rating <= 0 ? (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">New</span>
            ) : (
              <>
                <Star className="h-3.5 w-3.5 fill-[#222222]" />
                {listing.rating.toFixed(2)}
              </>
            )}
          </span>
        </div>
        <p className="truncate text-[15px] leading-5 text-[#717171]">{listing.distance}</p>
        <p className="truncate text-[15px] leading-5 text-[#717171]">{listing.dates}</p>
        <p className="mt-1 flex items-baseline gap-1 text-[15px] leading-5 text-[#222222]">
          <span className="font-semibold">{formatINR(listing.pricePerNight)}</span>
          <span className="text-[#222222]">night</span>
        </p>
        {isReal ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            <Check className="h-3 w-3" aria-hidden="true" />
            Verified stay · bookable
          </p>
        ) : (
          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Sample listing
          </p>
        )}
      </button>
    </article>
  );
}

/* ------------------------------- Search bar ------------------------------- */

function AirbnbSearchBar({ onSearch }: { onSearch: () => void }) {
  const [where, setWhere] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);

  return (
    <div className="flex h-14 w-full max-w-[850px] items-center overflow-hidden rounded-full border border-[#dddddd] bg-white shadow-sm transition hover:shadow-md">
      <label className="flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-center rounded-l-full px-6 transition hover:bg-[#ebebeb]">
        <span className="text-xs font-bold text-[#222222]">Where</span>
        <input
          value={where}
          onChange={(event) => setWhere(event.target.value)}
          placeholder="Search destinations"
          className="w-full bg-transparent text-sm text-[#717171] outline-none placeholder:text-[#717171]"
        />
      </label>
      <div className="h-6 w-px shrink-0 bg-[#dddddd]" />
      <label className="hidden h-full cursor-pointer flex-col justify-center px-4 transition hover:bg-[#ebebeb] sm:flex">
        <span className="text-xs font-bold text-[#222222]">Check in</span>
        <input
          type="date"
          value={checkIn}
          onChange={(event) => setCheckIn(event.target.value)}
          className="w-[110px] bg-transparent text-sm text-[#717171] outline-none"
        />
      </label>
      <div className="hidden h-6 w-px shrink-0 bg-[#dddddd] sm:block" />
      <label className="hidden h-full cursor-pointer flex-col justify-center px-4 transition hover:bg-[#ebebeb] sm:flex">
        <span className="text-xs font-bold text-[#222222]">Check out</span>
        <input
          type="date"
          value={checkOut}
          onChange={(event) => setCheckOut(event.target.value)}
          className="w-[110px] bg-transparent text-sm text-[#717171] outline-none"
        />
      </label>
      <div className="hidden h-6 w-px shrink-0 bg-[#dddddd] sm:block" />
      <label className="hidden h-full cursor-pointer flex-col justify-center px-4 transition hover:bg-[#ebebeb] md:flex">
        <span className="text-xs font-bold text-[#222222]">Who</span>
        <span className="text-sm text-[#717171]">{guests} guests</span>
      </label>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Search"
        className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-white transition hover:bg-[#ea580c]"
      >
        <Search className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ------------------------------ Filter modal ------------------------------ */

const FILTER_TYPES = [
  { id: 'any', label: 'Any type' },
  { id: 'entire', label: 'Entire place' },
  { id: 'private', label: 'Private room' },
  { id: 'shared', label: 'Shared room' },
];

const FILTER_AMENITIES = [
  'Wifi',
  'Kitchen',
  'Pool',
  'Free parking',
  'Air conditioning',
  'Beach access',
  'Fireplace',
  'Mountain view',
  'Lake view',
  'Garden',
  'Balcony',
  'Housekeeping',
];

interface StayFilters {
  type: string;
  minPrice: string;
  maxPrice: string;
  bedrooms: number;
  beds: number;
  baths: number;
  amenities: string[];
  instantBook: boolean;
}

const EMPTY_FILTERS: StayFilters = {
  type: 'any',
  minPrice: '',
  maxPrice: '',
  bedrooms: 0,
  beds: 0,
  baths: 0,
  amenities: [],
  instantBook: false,
};

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-base text-[#222222]">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={`Decrease ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b0b0b0] text-[#717171] transition hover:border-[#222222] disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-6 text-center text-base">{value === 0 ? 'Any' : value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`Increase ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b0b0b0] text-[#717171] transition hover:border-[#222222]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FilterModal({
  filters,
  onChange,
  onClose,
  resultCount,
}: {
  filters: StayFilters;
  onChange: (next: StayFilters) => void;
  onClose: () => void;
  resultCount: number;
}) {
  const [draft, setDraft] = useState<StayFilters>(filters);
  const [activeSection, setActiveSection] = useState('type');

  const sections = [
    { id: 'type', label: 'Type of place' },
    { id: 'price', label: 'Price range' },
    { id: 'rooms', label: 'Rooms and beds' },
    { id: 'amenities', label: 'Amenities' },
    { id: 'booking', label: 'Booking options' },
  ];

  const toggleAmenity = (amenity: string) =>
    setDraft((current) => ({
      ...current,
      amenities: current.amenities.includes(amenity)
        ? current.amenities.filter((a) => a !== amenity)
        : [...current.amenities, amenity],
    }));

  const activeCount =
    (draft.type !== 'any' ? 1 : 0) +
    (draft.minPrice || draft.maxPrice ? 1 : 0) +
    (draft.bedrooms || draft.beds || draft.baths ? 1 : 0) +
    draft.amenities.length +
    (draft.instantBook ? 1 : 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-white text-[#222222]" role="dialog" aria-modal="true" aria-label="Filters">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#ebebeb] px-6">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-[#f7f7f7]"
          aria-label="Close filters"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold">Filters</h2>
        <div className="w-9" />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-64 shrink-0 overflow-y-auto border-r border-[#ebebeb] p-6 md:block">
          <ul className="space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`block w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition ${
                    activeSection === section.id ? 'bg-[#f7f7f7]' : 'hover:bg-[#f7f7f7]'
                  }`}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {/* Type of place */}
          {activeSection === 'type' && (
            <div>
              <h3 className="text-xl font-semibold">Type of place</h3>
              <p className="mt-1 text-sm text-[#717171]">Search rooms, entire homes, or any type of place.</p>
              <div className="mt-6 space-y-3">
                {FILTER_TYPES.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, type: type.id }))}
                    className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
                      draft.type === type.id ? 'border-[#222222]' : 'border-[#dddddd] hover:border-[#222222]'
                    }`}
                  >
                    <div>
                      <p className="text-base font-medium">{type.label}</p>
                    </div>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        draft.type === type.id ? 'border-[#222222] bg-[#222222] text-white' : 'border-[#b0b0b0]'
                      }`}
                    >
                      {draft.type === type.id && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Price range */}
          {activeSection === 'price' && (
            <div>
              <h3 className="text-xl font-semibold">Price range</h3>
              <p className="mt-1 text-sm text-[#717171]">Nightly prices before fees and taxes.</p>
              <div className="mt-6 flex items-center gap-4">
                <label className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-[#717171]">Minimum</span>
                  <div className="flex h-12 items-center overflow-hidden rounded-xl border border-[#b0b0b0] focus-within:border-[#222222]">
                    <span className="px-3 text-[#717171]">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={draft.minPrice}
                      onChange={(event) => setDraft((d) => ({ ...d, minPrice: event.target.value }))}
                      placeholder="0"
                      className="h-full w-full bg-transparent text-base outline-none"
                    />
                  </div>
                </label>
                <span className="pt-6 text-[#717171]">–</span>
                <label className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-[#717171]">Maximum</span>
                  <div className="flex h-12 items-center overflow-hidden rounded-xl border border-[#b0b0b0] focus-within:border-[#222222]">
                    <span className="px-3 text-[#717171]">₹</span>
                    <input
                      type="number"
                      min="0"
                      value={draft.maxPrice}
                      onChange={(event) => setDraft((d) => ({ ...d, maxPrice: event.target.value }))}
                      placeholder="Any"
                      className="h-full w-full bg-transparent text-base outline-none"
                    />
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Rooms and beds */}
          {activeSection === 'rooms' && (
            <div>
              <h3 className="text-xl font-semibold">Rooms and beds</h3>
              <div className="mt-6 divide-y divide-[#ebebeb]">
                <Counter label="Bedrooms" value={draft.bedrooms} onChange={(next) => setDraft((d) => ({ ...d, bedrooms: next }))} />
                <Counter label="Beds" value={draft.beds} onChange={(next) => setDraft((d) => ({ ...d, beds: next }))} />
                <Counter label="Bathrooms" value={draft.baths} onChange={(next) => setDraft((d) => ({ ...d, baths: next }))} />
              </div>
            </div>
          )}

          {/* Amenities */}
          {activeSection === 'amenities' && (
            <div>
              <h3 className="text-xl font-semibold">Amenities</h3>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {FILTER_AMENITIES.map((amenity) => {
                  const active = draft.amenities.includes(amenity);
                  return (
                    <button
                      key={amenity}
                      type="button"
                      onClick={() => toggleAmenity(amenity)}
                      aria-pressed={active}
                      className={`flex items-center justify-between rounded-xl border p-4 text-left text-sm font-medium transition ${
                        active ? 'border-[#222222]' : 'border-[#dddddd] hover:border-[#222222]'
                      }`}
                    >
                      <span>{amenity}</span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                          active ? 'border-[#222222] bg-[#222222] text-white' : 'border-[#b0b0b0]'
                        }`}
                      >
                        {active && <Check className="h-4 w-4" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Booking options */}
          {activeSection === 'booking' && (
            <div>
              <h3 className="text-xl font-semibold">Booking options</h3>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, instantBook: !d.instantBook }))}
                  className="flex w-full items-center justify-between border-b border-[#ebebeb] py-4"
                >
                  <div className="pr-6 text-left">
                    <p className="text-base font-medium">Instant Book</p>
                    <p className="mt-0.5 text-sm text-[#717171]">Book without waiting for host approval.</p>
                  </div>
                  <span
                    className={`relative h-8 w-14 shrink-0 rounded-full transition ${draft.instantBook ? 'bg-[#222222]' : 'bg-[#b0b0b0]'}`}
                  >
                    <span
                      className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${draft.instantBook ? 'left-7' : 'left-1'}`}
                    />
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-[#ebebeb] px-6 py-4">
        <button
          type="button"
          onClick={() => setDraft(EMPTY_FILTERS)}
          className="text-sm font-semibold underline underline-offset-2"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(draft);
            onClose();
          }}
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#222222] px-6 text-base font-semibold text-white transition hover:bg-black"
        >
          Show {resultCount} stays
          {activeCount > 0 && <span className="text-white/70">({activeCount})</span>}
        </button>
      </footer>
    </div>
  );
}

/* ----------------------------- Detail modal ------------------------------- */

const AMENITY_ICONS: Array<[RegExp, React.ElementType]> = [
  [/pool|swim/i, Waves],
  [/wifi|wi-fi/i, Wifi],
  [/kitchen|cook/i, UtensilsCrossed],
  [/parking|car/i, Car],
  [/air condition|ac\b/i, Wind],
  [/beach|sea/i, Palmtree],
  [/fireplace|wood/i, Flame],
  [/view/i, Mountain],
  [/garden|lawn|farm/i, Trees],
  [/balcony|deck|patio|rooftop/i, Home],
  [/housekeep|chef|caretaker|driver/i, User],
  [/breakfast|meal/i, Coffee],
  [/gym/i, Dumbbell],
  [/tv/i, Tv],
  [/washer|laundry/i, WashingMachine],
  [/lock|security/i, Lock],
];

function amenityIcon(amenity: string): React.ElementType {
  const found = AMENITY_ICONS.find(([pattern]) => pattern.test(amenity));
  return found ? found[1] : Check;
}

function ListingDetailModal({
  listing,
  saved,
  stayProperty = null,
  isAuthenticated = false,
  onSave,
  onClose,
}: {
  listing: AirbnbListing;
  saved: boolean;
  stayProperty?: StayProperty | null;
  isAuthenticated?: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [nights, setNights] = useState(5);
  const [guests, setGuests] = useState(2);
  const toIso = (date: Date) => date.toISOString().slice(0, 10);
  const [checkIn, setCheckIn] = useState(() => toIso(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [checkOut, setCheckOut] = useState(() => toIso(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)));

  const cleaningFee = Math.round(listing.pricePerNight * 0.12);
  const serviceFee = Math.round(listing.pricePerNight * nights * 0.14);
  const total = listing.pricePerNight * nights + cleaningFee + serviceFee;

  const highlights = [
    { icon: User, label: `${listing.guests} guests` },
    { icon: BedDouble, label: `${listing.bedrooms} bedrooms` },
    { icon: BedDouble, label: `${listing.beds} beds` },
    { icon: Bath, label: `${listing.baths} baths` },
  ];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-white text-[#222222]" role="dialog" aria-modal="true" aria-label={listing.title}>
      <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#ebebeb] bg-white/95 px-6 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-2 rounded-full px-2 text-sm font-semibold transition hover:bg-[#f7f7f7]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to stays
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold underline underline-offset-2"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button
            type="button"
            onClick={onSave}
            className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold underline underline-offset-2"
          >
            <Heart className={`h-4 w-4 ${saved ? 'fill-[#f97316] text-[#f97316]' : ''}`} /> Save
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-6 pb-20 pt-6">
        <h1 className="text-[26px] font-semibold leading-tight">{listing.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Star className="h-4 w-4 fill-[#222222]" /> {listing.rating.toFixed(2)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="underline">{listing.reviewCount} reviews</span>
          <span aria-hidden="true">·</span>
          {listing.superhost && <span className="inline-flex items-center gap-1"><Award className="h-4 w-4" /> Superhost</span>}
          {listing.superhost && <span aria-hidden="true">·</span>}
          <span className="inline-flex items-center gap-1 text-[#222222]">
            <MapPin className="h-4 w-4" /> {listing.location.toLowerCase().includes('india') ? listing.location : `${listing.location}, India`}
          </span>
        </div>

        {stayProperty ? (
          <div role="note" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">Verified stay.</span> Live inventory — availability and the
              payable total are confirmed by the server before any hold, booking or payment.
            </span>
          </div>
        ) : (
          <div role="note" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">Sample listing.</span> This stay is shown for preview
              only — it is not a real offer and cannot be booked or paid for.
            </span>
          </div>
        )}

        {/* Photo gallery */}
        <div className="mt-5 grid grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl">
          <button
            type="button"
            className="col-span-2 row-span-2 overflow-hidden"
            aria-label="Show all photos"
          >
            {listing.images.length > 0 ? (
              <img src={listing.images[0]} alt={`${listing.title} main`} className="h-full w-full object-cover transition hover:scale-[1.02]" loading="lazy" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 via-white to-slate-200 text-slate-500">
                <Building2 className="h-10 w-10" aria-hidden="true" />
                <span className="text-sm font-medium">Photos coming soon</span>
              </div>
            )}
          </button>
          {listing.images.slice(1, 5).map((src, index) => (
            <div key={index} className="overflow-hidden">
              <img src={src} alt={`${listing.title} photo ${index + 2}`} className="h-full w-full object-cover transition hover:scale-[1.02]" loading="lazy" />
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="min-w-0">
            {/* Host */}
            <div className="flex items-start justify-between gap-4 border-b border-[#ebebeb] pb-6">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">
                  {listing.type} hosted by {listing.host}
                </h2>
                <p className="mt-1 text-sm text-[#717171]">
                  {listing.guests} guests · {listing.bedrooms} bedrooms · {listing.beds} beds · {listing.baths} baths
                </p>
              </div>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f7f7f7] text-lg font-bold text-[#717171]">
                {listing.host.trim().slice(0, 1).toUpperCase()}
              </div>
            </div>

            {/* Superhost + highlights */}
            {listing.superhost && (
              <div className="flex items-start gap-4 border-b border-[#ebebeb] py-6">
                <Award className="mt-1 h-6 w-6 shrink-0 text-[#f97316]" />
                <div>
                  <p className="font-semibold">{listing.host} is a Superhost</p>
                  <p className="mt-0.5 text-sm text-[#717171]">
                    Superhosts are experienced, highly rated hosts who are committed to providing great stays.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-[#ebebeb] py-6 sm:grid-cols-4">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex flex-col gap-2">
                    <Icon className="h-6 w-6" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Description */}
            <div className="border-b border-[#ebebeb] py-6">
              <p className="text-[15px] leading-6">{listing.description}</p>
            </div>

            {/* Amenities */}
            <div className="border-b border-[#ebebeb] py-6">
              <h3 className="text-xl font-semibold">What this place offers</h3>
              <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {listing.amenities.map((amenity) => {
                  const Icon = amenityIcon(amenity);
                  return (
                    <li key={amenity} className="flex items-center gap-3 text-[15px]">
                      <Icon className="h-6 w-6 shrink-0" />
                      <span>{amenity}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Location */}
            <div className="border-b border-[#ebebeb] py-6">
              <h3 className="text-xl font-semibold">Where you'll be</h3>
              <p className="mt-2 flex items-center gap-2 text-[15px]">
                <MapPin className="h-5 w-5" /> {listing.location}, India
              </p>
              <div className="mt-4 flex h-64 items-center justify-center overflow-hidden rounded-2xl bg-[#f7f7f7]">
                <img src={listing.images[listing.images.length - 1]} alt={`Map area of ${listing.location}`} className="h-full w-full object-cover" loading="lazy" />
              </div>
            </div>

            {/* House rules / safety */}
            <div className="py-6">
              <h3 className="text-xl font-semibold">Things to know</h3>
              <div className="mt-5 grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="font-semibold">House rules</p>
                  <p className="mt-1 text-sm text-[#717171]">Check-in after 2:00 PM</p>
                  <p className="text-sm text-[#717171]">Checkout before 11:00 AM</p>
                </div>
                <div>
                  <p className="font-semibold">Health & safety</p>
                  <p className="mt-1 text-sm text-[#717171]">BookOurSpace health &amp; safety practices apply</p>
                </div>
                <div>
                  <p className="font-semibold">Cancellation policy</p>
                  <p className="mt-1 text-sm text-[#717171]">Free cancellation for 48 hours</p>
                </div>
              </div>
            </div>
          </div>

          {/* Price card */}
          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-[#dddddd] p-6 shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[22px] font-semibold">{formatINR(listing.pricePerNight)}</span>
                <span className="text-[15px]">night</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-sm">
                <Star className="h-3.5 w-3.5 fill-[#222222]" />
                <span className="font-semibold">{listing.rating.toFixed(2)}</span>
                <span aria-hidden="true">·</span>
                <span className="underline">{listing.reviewCount} reviews</span>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-[#b0b0b0]">
                <div className="grid grid-cols-2 divide-x divide-[#b0b0b0]">
                  <label className="px-3 py-2.5">
                    <span className="block text-[11px] font-bold uppercase tracking-wide">Check-in</span>
                    <input
                      type="date"
                      value={checkIn}
                      min={toIso(new Date())}
                      onChange={(event) => setCheckIn(event.target.value)}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </label>
                  <label className="px-3 py-2.5">
                    <span className="block text-[11px] font-bold uppercase tracking-wide">Check-out</span>
                    <input
                      type="date"
                      value={checkOut}
                      min={checkIn}
                      onChange={(event) => setCheckOut(event.target.value)}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-between border-t border-[#b0b0b0] px-3 py-2.5">
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-wide">Guests</span>
                    <span className="text-sm">{guests} guests</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="Decrease guests" className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b0b0b0] text-[#717171] hover:border-[#222222]">
                      <Minus className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setGuests((g) => Math.min(16, g + 1))} aria-label="Increase guests" className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b0b0b0] text-[#717171] hover:border-[#222222]">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {stayProperty ? (
                <div className="mt-4">
                  <StayCheckoutPanel
                    property={stayProperty}
                    checkIn={checkIn}
                    checkOut={checkOut}
                    guests={guests}
                    isAuthenticated={isAuthenticated}
                  />
                </div>
              ) : (
                <>
                  <button type="button" className="mt-4 h-12 w-full cursor-not-allowed rounded-lg bg-[#f97316]/70 text-base font-semibold text-white">
                    Reserve
                  </button>
                  <p className="mt-2 text-center text-sm text-[#717171]">Sample listing — booking and payment are disabled in this preview.</p>
                </>
              )}

              <div className="mt-5 space-y-2 border-t border-[#ebebeb] pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="underline">{formatINR(listing.pricePerNight)} × {nights} nights</span>
                  <span>{formatINR(listing.pricePerNight * nights)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="underline">Cleaning fee</span>
                  <span>{formatINR(cleaningFee)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="underline">BookOurSpace service fee</span>
                  <span>{formatINR(serviceFee)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 font-semibold">
                  <span>Total before taxes</span>
                  <span>{formatINR(total)}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Main component ---------------------------- */

const FOOTER_COLUMNS: Array<{ title: string; links: string[] }> = [
  {
    title: 'Support',
    links: ['Help Centre', 'BOS Protect', 'Anti-discrimination', 'Disability support', 'Cancellation options', 'Report neighbourhood concern'],
  },
  {
    title: 'Hosting',
    links: ['BookOurSpace your home', 'BOS Protect for Hosts', 'Hosting resources', 'Community forum', 'Hosting responsibly'],
  },
  {
    title: 'BookOurSpace',
    links: ['Newsroom', 'New features', 'Careers', 'Investors', 'Gift cards'],
  },
];

export function AirbnbIndiaExperience({ onClose, onSwitchToOld, inline = false }: AirbnbIndiaExperienceProps) {
  const [activeCategory, setActiveCategory] = useState('trending');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<StayFilters>(EMPTY_FILTERS);
  const [displayTotalBeforeTaxes, setDisplayTotalBeforeTaxes] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [detailListing, setDetailListing] = useState<AirbnbListing | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Real, bookable stays come from the verified inventory feed. Sample rows are
  // only a fallback for local demo mode and are never treated as bookable.
  const [realProperties, setRealProperties] = useState<StayProperty[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchStayProperties({ destination: '', page: 0 })
      .then((rows) => { if (alive) setRealProperties(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setRealProperties([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadSession = async () => {
      try {
        // The authoritative session (server-verified HMAC token) is the source
        // of truth; a hosted Google session is not required for local E2E.
        const session = await fetchCurrentAuthSession();
        if (session.authenticated) {
          if (alive) setIsAuthenticated(true);
          return;
        }
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        if (alive) setIsAuthenticated(Boolean(data?.user));
      } catch {
        // Signed out is a valid state.
      }
    };
    void loadSession();
    return () => { alive = false; };
  }, []);

  const realListings = useMemo<AirbnbListing[]>(() => realProperties.map((property) => {
    const fromPaise = property.basePricePaise > 0 ? Math.round(property.basePricePaise / 100) : 0;
    const price = fromPaise || Math.round(Number(property.listingPriceAmount || 0));
    return {
      id: property.listingId,
      title: property.name || 'Verified stay',
      type: property.propertyType || 'Stay',
      category: 'trending',
      location: [property.area, property.city].filter(Boolean).join(', ') || 'India',
      distance: '',
      dates: '',
      rating: 0,
      reviewCount: 0,
      pricePerNight: price,
      host: '',
      hostYears: 0,
      superhost: false,
      guests: 2,
      bedrooms: 1,
      beds: 1,
      baths: 1,
      description: property.description || '',
      amenities: property.amenities || [],
      images: property.images || [],
    };
  }), [realProperties]);

  const propertyByListingId = useMemo(() => {
    const map = new Map<string, StayProperty>();
    for (const property of realProperties) map.set(property.listingId, property);
    return map;
  }, [realProperties]);

  const catalog = realListings.length > 0 ? realListings : (DEMO_DATA_ENABLED ? airbnbListings : []);

  const toggleSaved = (id: string) =>
    setSavedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const shareListing = (listing: AirbnbListing) => {
    const url = `${window.location.origin}${window.location.pathname}#stays/${listing.id}`;
    void navigator.clipboard?.writeText(url).catch(() => {});
  };

  const filteredListings = useMemo(() => {
    return catalog.filter((listing) => {
      if (activeCategory !== 'trending' && listing.category !== activeCategory) return false;
      if (filters.type !== 'any' && filters.type !== 'entire' && filters.type === 'private') {
        if (!/private/i.test(listing.type)) return false;
      }
      if (filters.type === 'entire' && !/entire/i.test(listing.type)) return false;
      if (filters.type === 'shared' && !/shared/i.test(listing.type)) return false;
      if (filters.minPrice && listing.pricePerNight < Number(filters.minPrice)) return false;
      if (filters.maxPrice && listing.pricePerNight > Number(filters.maxPrice)) return false;
      if (filters.bedrooms && listing.bedrooms < filters.bedrooms) return false;
      if (filters.beds && listing.beds < filters.beds) return false;
      if (filters.baths && listing.baths < filters.baths) return false;
      if (filters.amenities.some((amenity) => !listing.amenities.some((a) => a.toLowerCase().includes(amenity.toLowerCase())))) {
        return false;
      }
      return true;
    });
  }, [activeCategory, filters, catalog]);

  const activeCategoryLabel =
    airbnbCategories.find((c) => c.id === activeCategory)?.label ?? 'Stays';

  const scrollRail = (direction: number) => {
    railRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (detailListing) setDetailListing(null);
      else if (filtersOpen) setFiltersOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, detailListing, filtersOpen]);

  return (
    <div
      className={
        inline
          ? 'w-full bg-white text-[#222222]'
          : 'fixed inset-0 z-[71] flex flex-col bg-white text-[#222222]'
      }
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label="BookOurSpace style stays"
    >
      {!inline && <ExperienceTabBar active="airbnb" onOld={onSwitchToOld} onAirbnb={() => {}} />}

      {/* Header */}
      <header className="shrink-0 border-b border-[#ebebeb] bg-white">
        <div
          className={
            inline
              ? 'mx-auto flex h-14 max-w-[1760px] items-center gap-3 px-4 sm:px-6 lg:px-10'
              : 'mx-auto flex h-20 max-w-[1760px] items-center gap-3 px-6 lg:px-10'
          }
        >
          {inline ? (
            <>
              <button
                type="button"
                onClick={onClose}
                aria-label="Back to all sections"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ebebeb] text-[#222222] transition hover:bg-[#f7f7f7]"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="text-[15px] font-black text-[#f97316]">BookOurSpace Stays</span>
            </>
          ) : (
            <button type="button" onClick={onClose} aria-label="BookOurSpace home" className="flex shrink-0 items-center gap-2">
              <BookOurSpaceEmblem className="h-8 w-8" />
              <span className="hidden sm:block"><BookOurSpaceWordmark className="text-xl" /></span>
            </button>
          )}

          <div className="hidden flex-1 justify-center px-4 md:flex">
            <AirbnbSearchBar onSearch={() => setFiltersOpen(true)} />
          </div>

          {!inline && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button type="button" className="hidden rounded-full px-4 py-2.5 text-sm font-semibold transition hover:bg-[#f7f7f7] lg:block">
                List your space
              </button>
              <button type="button" aria-label="Choose language" className="hidden h-10 w-10 items-center justify-center rounded-full transition hover:bg-[#f7f7f7] sm:flex">
                <Globe className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex h-12 items-center gap-3 rounded-full border border-[#dddddd] pl-3 pr-1 transition hover:shadow-md"
                aria-label="Main menu"
              >
                <Menu className="h-4 w-4" />
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#717171] text-white">
                  <User className="h-4 w-4" />
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="md:hidden">
          <div className="px-4 pb-4">
            <AirbnbSearchBar onSearch={() => setFiltersOpen(true)} />
          </div>
        </div>

        {/* Category rail */}
        <div className="relative border-t border-[#ebebeb]">
          <button
            type="button"
            onClick={() => scrollRail(-1)}
            aria-label="Scroll categories left"
            className="absolute left-0 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#dddddd] bg-white shadow-sm sm:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div ref={railRef} className="flex items-center gap-8 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:px-10">
            {airbnbCategories.map((category) => {
              const Icon = CATEGORY_ICONS[category.id] ?? Home;
              const active = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  aria-pressed={active}
                  className={`flex shrink-0 flex-col items-center gap-2 border-b-2 pb-3 pt-4 text-xs font-medium transition ${
                    active
                      ? 'border-[#222222] text-[#222222]'
                      : 'border-transparent text-[#717171] hover:border-[#dddddd] hover:text-[#222222]'
                  }`}
                >
                  <Icon className={`h-6 w-6 ${active ? '' : 'opacity-70'}`} />
                  <span className={`whitespace-nowrap ${active ? 'font-semibold' : ''}`}>{category.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => scrollRail(1)}
            aria-label="Scroll categories right"
            className="absolute right-0 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#dddddd] bg-white shadow-sm sm:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1760px] px-6 pb-16 lg:px-10">
          <div role="note" className="mt-5 flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 font-medium">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {realListings.length > 0
                  ? <><span className="font-semibold">Live verified stays.</span> Availability, holds and payment are confirmed by the server — open a stay to book it.</>
                  : DEMO_DATA_ENABLED
                    ? <><span className="font-semibold">Sample preview.</span> These listings are for demonstration only and are not real offers — no booking, reservation, or payment is created from this screen.</>
                    : <><span className="font-semibold">Verified stay feed unavailable.</span> No provider listings are connected to this style yet. Search controls are a preview only; no stays, prices, or availability are being represented as live.</>}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <h1 className="text-lg font-semibold">
                {filteredListings.length}{DEMO_DATA_ENABLED && realListings.length === 0 ? '+' : ''} {activeCategoryLabel} stays
              </h1>
              <p className="text-sm text-[#717171]">Stays in India for the dates you searched</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#dddddd] px-4 text-sm font-semibold transition hover:border-[#222222]"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </button>
              <button
                type="button"
                onClick={() => setDisplayTotalBeforeTaxes((v) => !v)}
                className="inline-flex h-11 items-center gap-3 rounded-xl border border-[#dddddd] px-4 text-sm font-semibold transition hover:border-[#222222]"
              >
                <span className="hidden sm:inline">Display total before taxes</span>
                <span className="sm:hidden">Total before taxes</span>
                <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${displayTotalBeforeTaxes ? 'bg-[#222222]' : 'bg-[#b0b0b0]'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${displayTotalBeforeTaxes ? 'left-[22px]' : 'left-0.5'}`} />
                </span>
              </button>
            </div>
          </div>

          {filteredListings.length === 0 ? (
            <div className="mx-auto max-w-md rounded-2xl border border-[#ebebeb] px-6 py-16 text-center">
              <p className="text-lg font-semibold">No exact matches</p>
              <p className="mt-2 text-sm text-[#717171]">{DEMO_DATA_ENABLED ? 'Try changing your filters or removing some of them.' : 'There are no verified stays available in this style. Use the Hotels & Stays search when its verified listing feed is connected.'}</p>
              <button
                type="button"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setActiveCategory('trending');
                }}
                className="mt-5 inline-flex h-11 items-center rounded-lg bg-[#222222] px-5 text-sm font-semibold text-white"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  saved={savedIds.includes(listing.id)}
                  isReal={propertyByListingId.has(listing.id)}
                  onSave={() => toggleSaved(listing.id)}
                  onOpen={() => setDetailListing(listing)}
                  onShare={() => shareListing(listing)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-[#ebebeb] bg-[#f7f7f7]">
          <div className="mx-auto max-w-[1760px] px-6 py-10 lg:px-10">
            <div className="grid gap-8 sm:grid-cols-3">
              {FOOTER_COLUMNS.map((column) => (
                <div key={column.title}>
                  <h3 className="text-sm font-semibold">{column.title}</h3>
                  <ul className="mt-3 space-y-2">
                    {column.links.map((link) => (
                      <li key={link}>
                        <a href="#" className="text-sm text-[#222222] hover:underline">{link}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[#dddddd] pt-6 text-sm">
              <p className="text-[#222222]">© 2026 BookOurSpace, Inc.</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <button type="button" className="flex items-center gap-1 font-semibold hover:underline">
                  <Globe className="h-4 w-4" /> English (IN)
                </button>
                <button type="button" className="flex items-center gap-1 font-semibold hover:underline">
                  ₹ INR
                </button>
                <span className="hidden items-center gap-4 sm:flex">
                  <a href="#" className="hover:underline">Privacy</a>
                  <span aria-hidden="true">·</span>
                  <a href="#" className="hover:underline">Terms</a>
                  <span aria-hidden="true">·</span>
                  <a href="#" className="hover:underline">Sitemap</a>
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {filtersOpen && (
        <FilterModal
          filters={filters}
          onChange={setFilters}
          onClose={() => setFiltersOpen(false)}
          resultCount={filteredListings.length}
        />
      )}

      {detailListing && (
        <ListingDetailModal
          listing={detailListing}
          saved={savedIds.includes(detailListing.id)}
          stayProperty={propertyByListingId.get(detailListing.id) ?? null}
          isAuthenticated={isAuthenticated}
          onSave={() => toggleSaved(detailListing.id)}
          onClose={() => setDetailListing(null)}
        />
      )}
    </div>
  );
}
