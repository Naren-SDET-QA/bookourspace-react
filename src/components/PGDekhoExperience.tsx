import React, { useEffect, useMemo, useRef, useState } from 'react';
import SafeImage from './SafeImage';
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  Coffee,
  Dumbbell,
  Heart,
  Lock,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tv,
  Users,
  Utensils,
  WashingMachine,
  Wifi,
  Wind,
  X,
  Zap,
  Share2,
  Home,
  ClipboardList,
  User,
} from 'lucide-react';
import { formatINR, pgDekhoCities, pgDekhoListings, type PgDekhoListing } from '../data/pgDekhoData';
import { DEMO_DATA_ENABLED } from '../lib/demoDataPolicy';
import { FreeMap } from './FreeMap';
import type { MarketplaceListing } from '../types/marketplace';
import { PgBookingPanel } from './PgBookingPanel';

interface PgDekhoExperienceProps {
  onClose: () => void;
  onSwitchToOld: () => void;
  /** Render in the page flow under the common header instead of as a full-screen dialog. */
  inline?: boolean;
  /** Approved database listings only; demo preview records are kept separate. */
  listings?: MarketplaceListing[];
  /** Current city selected in the shared app location control. */
  selectedCity?: string;
  /** The shared Style 1/2/3 switcher can replace the built-in two-tab bar. */
  showTabBar?: boolean;
}

/* ------------------------------ Branding ------------------------------ */

function BookOurSpaceLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-black tracking-tight ${className ?? 'text-2xl'}`} translate="no">
      <span className="text-[#1f2937]">Book</span>
      <span className="text-[#2563eb]">Our</span>
      <span className="text-[#1f2937]">Space</span>
    </span>
  );
}

export function PgDekhoTabBar({
  active,
  onOld,
  onNew,
}: {
  active: 'old' | 'pgdekho';
  onOld: () => void;
  onNew: () => void;
}) {
  const base = 'inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition';
  return (
    <div className="flex shrink-0 items-center justify-center border-b border-[#ebebeb] bg-[#f7f7f7] px-4 py-2">
      <div className="inline-flex items-center rounded-full border border-[#dddddd] bg-white p-1 shadow-sm">
        <button type="button" onClick={onOld} className={`${base} ${active === 'old' ? 'bg-[#222222] text-white' : 'text-[#717171] hover:bg-[#f7f7f7]'}`}>
          Style 1
        </button>
        <button type="button" onClick={onNew} className={`${base} ${active === 'pgdekho' ? 'bg-[#2563eb] text-white' : 'text-[#717171] hover:bg-[#f7f7f7]'}`}>
          Style 2
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ Amenity icons ------------------------------ */

const AMENITY_ICONS: Array<[RegExp, React.ElementType]> = [
  [/food|veg|meal|cook/i, Utensils],
  [/wifi|wi-fi|internet/i, Wifi],
  [/laundry|wash/i, WashingMachine],
  [/housekeep|clean/i, Sparkles],
  [/bath|toilet/i, Bath],
  [/ac\b|air condition/i, Wind],
  [/parking/i, Car],
  [/secur|cctv|lock/i, Lock],
  [/power|backup/i, Zap],
  [/ro water|water/i, Wifi],
  [/gym/i, Dumbbell],
  [/tv/i, Tv],
  [/coffee/i, Coffee],
];

function amenityIcon(amenity: string): React.ElementType {
  const found = AMENITY_ICONS.find(([pattern]) => pattern.test(amenity));
  return found ? found[1] : Check;
}

/* ------------------------------ Routing ------------------------------ */

type PgRoute = { name: 'search' } | { name: 'detail'; id: string };

function parseRoute(): PgRoute {
  if (typeof window === 'undefined') return { name: 'search' };
  const hash = window.location.hash.replace(/^#/, '');
  const m = hash.match(/^pg\/pg\/(.+)$/);
  if (m) return { name: 'detail', id: decodeURIComponent(m[1]) };
  return { name: 'search' };
}

function goTo(hash: string) {
  if (typeof window !== 'undefined') window.location.hash = hash;
}

/* ------------------------------ Derived data ------------------------------ */

function distanceKm(l: PgDekhoListing): number {
  const n = l.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return ((n % 90) + 10) / 100;
}

function addressOf(l: PgDekhoListing): string {
  const n = (l.id.charCodeAt(1) % 40) + 12;
  return `No: ${n}, ${l.locality}, ${l.city}, India`;
}

function badgesOf(l: PgDekhoListing): string[] {
  const a = l.amenities.join(' ').toLowerCase();
  const b: string[] = [];
  if (l.amenities.length >= 4) b.push('Fully Furnished');
  if (/security|cctv|lock/.test(a)) b.push('High Security');
  if (/wifi|internet/.test(a)) b.push('Wifi');
  if (/food|meal/.test(a)) b.push('Meals Included');
  if (b.length === 0) b.push('Fully Furnished', 'Wifi');
  return b;
}

function chipsOf(l: PgDekhoListing): string[] {
  const a = l.amenities.map((x) => x.toLowerCase());
  const out: string[] = [l.gender === 'co-living' ? 'Co-living' : l.gender === 'boys' ? 'Boys' : 'Girls'];
  if (l.amenities.length >= 3) out.push('Furnished');
  if (a.some((x) => /parking/.test(x))) out.push('Parking');
  if (a.some((x) => /laundry|wash/.test(x))) out.push('Laundry');
  if (a.some((x) => /ac\b|air condition/.test(x))) out.push('AC');
  return out;
}

function rentOptionsOf(l: PgDekhoListing): Array<{ label: string; rent: number }> {
  return [
    { label: 'Triple', rent: l.rent },
    { label: 'Double', rent: Math.round((l.rent * 1.35) / 10) * 10 },
    { label: 'Single', rent: Math.round((l.rent * 2.1) / 10) * 10 },
  ];
}

function keyInfoOf(l: PgDekhoListing): Array<{ label: string; value: string }> {
  return [
    { label: l.gender === 'boys' ? 'Boys' : l.gender === 'girls' ? 'Girls' : 'Co-living', value: 'Occupancy' },
    { label: 'Bath', value: 'Attached' },
    { label: 'Available From', value: 'Available now' },
    { label: 'Food', value: l.food },
    { label: 'Availability', value: 'Available' },
    { label: 'Title', value: 'Verified' },
    { label: 'Power Backup', value: 'Available' },
    { label: 'Available', value: 'Yes' },
    { label: 'Notice Period', value: '15 Days' },
  ];
}

/* ------------------------------ Search bar ------------------------------ */

interface PgFilters {
  city: string;
  area: string;
  localities: string[];
  query: string;
  gender: string;
  minRent: number;
  maxRent: number;
  verifiedOnly: boolean;
  sortBy: string;
  occupancy: string[];
  food: string[];
  parking: string[];
  premium: string[];
}

const DEFAULT_FILTERS: PgFilters = {
  city: 'all',
  area: '',
  localities: [],
  query: '',
  gender: 'all',
  minRent: 0,
  maxRent: 100000,
  verifiedOnly: false,
  sortBy: 'recommended',
  occupancy: [],
  food: [],
  parking: [],
  premium: [],
};

const POPULAR_AREAS = ['Madhapur', 'Gachibowli', 'Kukatpally', 'Koramangala', 'Whitefield', 'Saket', 'Vadapalani', 'Hinjewadi'];

const PG_AREA_DIRECTORY: Array<{ city: string; areas: string[] }> = [
  { city: 'Hyderabad', areas: ['Madhapur', 'Gachibowli', 'Kukatpally', 'Hitech City', 'Banjara Hills', 'Jubilee Hills', 'Kondapur', 'Ameerpet'] },
  { city: 'Bengaluru', areas: ['Koramangala', 'HSR Layout', 'Whitefield', 'Indiranagar', 'Electronic City', 'Marathahalli'] },
  { city: 'Delhi', areas: ['Saket', 'Laxmi Nagar', 'Karol Bagh', 'Hauz Khas', 'Dwarka'] },
  { city: 'Gurugram', areas: ['Sector 43', 'Udyog Vihar', 'Sohna Road', 'Golf Course Road', 'Cyber City'] },
  { city: 'Noida', areas: ['Sector 62', 'Sector 18', 'Sector 137', 'Sector 15', 'Greater Noida'] },
  { city: 'Pune', areas: ['Hinjewadi', 'Kharadi', 'Kothrud', 'Baner', 'Viman Nagar'] },
  { city: 'Mumbai', areas: ['Andheri East', 'Powai', 'Bandra', 'Thane', 'Navi Mumbai'] },
  { city: 'Chennai', areas: ['Vadapalani', 'Saligramam', 'T. Nagar', 'Adyar', 'Velachery'] },
];

const LOCALITY_OPTIONS = Array.from(
  new Set([...pgDekhoListings.map((l) => l.locality), ...PG_AREA_DIRECTORY.flatMap((g) => g.areas)])
).sort((a, b) => a.localeCompare(b));

function amenitiesOf(l: PgDekhoListing): string[] {
  const a = l.amenities.join(' ').toLowerCase();
  const out: string[] = [];
  if (/ac\b|air condition/.test(a)) out.push('AC');
  if (/wifi|internet/.test(a)) out.push('WiFi');
  if (/food|meal/.test(a)) out.push('Food');
  if (/parking/.test(a)) out.push('Parking');
  if (/laundry/.test(a)) out.push('Laundry');
  if (out.length === 0) out.push('WiFi', 'Food');
  return out;
}

const CITY_COORDS: Record<string, [number, number]> = {
  Hyderabad: [17.385, 78.4867],
  Bengaluru: [12.9716, 77.5946],
  Delhi: [28.6139, 77.209],
  Gurugram: [28.4595, 77.0266],
  Noida: [28.5355, 77.391],
  Pune: [18.5204, 73.8567],
  Mumbai: [19.076, 72.8777],
  Chennai: [13.0827, 80.2707],
};

function coordsOf(l: PgDekhoListing): [number, number] {
  const base = CITY_COORDS[l.city] ?? CITY_COORDS.Hyderabad;
  const seed = l.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return [base[0] + ((seed % 40) - 20) / 1000, base[1] + (((seed * 7) % 40) - 20) / 1000];
}

interface IconGridItem {
  label: string;
  emoji: string;
}

function iconGridOf(l: PgDekhoListing): IconGridItem[] {
  const a = l.amenities.join(' ').toLowerCase();
  return [
    { label: l.gender === 'boys' ? 'Boys' : l.gender === 'girls' ? 'Girls' : 'Co-living', emoji: l.gender === 'boys' ? '♂' : l.gender === 'girls' ? '♀' : '👥' },
    { label: 'Furnished', emoji: '🛋️' },
    { label: /parking/.test(a) ? 'Parking' : 'No Parking', emoji: '🅿️' },
    { label: /laundry/.test(a) ? 'Laundry' : 'No Laundry', emoji: '🧺' },
    { label: /ac\b|air condition/.test(a) ? 'AC' : 'Non-AC', emoji: '❄️' },
  ];
}

function cardsOf(l: PgDekhoListing): string[] {
  const a = l.amenities.join(' ').toLowerCase();
  const out = ['Fully Furnished'];
  if (/food|meal/.test(a)) out.push('Meals Included');
  out.push('High Security');
  if (/wifi|internet/.test(a)) out.push('WiFi');
  return out;
}

function SearchBar({
  city,
  onCity,
  gender,
  onGender,
  minRent,
  maxRent,
  onRentRange,
  onSearch,
}: {
  city: string;
  onCity: (v: string) => void;
  gender: string;
  onGender: (v: string) => void;
  minRent: number;
  maxRent: number;
  onRentRange: (min: number, max: number) => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-2.5 shadow-lg lg:flex-row lg:items-center lg:rounded-full">
      <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3">
        <MapPin className="h-4 w-4 shrink-0 text-[#2563eb]" aria-hidden="true" />
        <span className="sr-only">City</span>
        <select aria-label="PG city" value={city} onChange={(e) => onCity(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none">
          <option value="all">All Cities</option>
          {pgDekhoCities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </label>
      <span className="hidden h-6 w-px bg-[#e5e7eb] lg:block" />
      <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3">
        <Search className="h-4 w-4 shrink-0 text-[#2563eb]" aria-hidden="true" />
        <span className="sr-only">Search location</span>
        <input
          id="pg-search-input"
          placeholder="Search Location"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9ca3af]"
        />
      </label>
      <span className="hidden h-6 w-px bg-[#e5e7eb] lg:block" />
      <label className="flex min-h-11 items-center gap-2 rounded-xl px-3 lg:w-[150px]">
        <Users className="h-4 w-4 shrink-0 text-[#2563eb]" aria-hidden="true" />
        <span className="sr-only">Gender</span>
        <select value={gender} onChange={(e) => onGender(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none">
          <option value="all">Gender</option>
          <option value="boys">Boys</option>
          <option value="girls">Girls</option>
          <option value="co-living">Co-living</option>
        </select>
      </label>
      <span className="hidden h-6 w-px bg-[#e5e7eb] lg:block" />
      <div className="flex min-h-11 items-center gap-2 rounded-xl px-3 lg:w-[260px]">
        <span className="text-[12px] font-black text-[#2563eb]" aria-hidden="true">₹</span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-[58px] shrink-0 text-[9.5px] font-bold text-[#64748b]">₹{minRent.toLocaleString('en-IN')}</span>
            <input
              type="range"
              min={1000}
              max={100000}
              step={500}
              value={minRent}
              onChange={(e) => onRentRange(Math.min(Number(e.target.value), maxRent - 500), maxRent)}
              aria-label="Minimum rent"
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#2563eb]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-[58px] shrink-0 text-[9.5px] font-bold text-[#64748b]">₹{maxRent.toLocaleString('en-IN')}</span>
            <input
              type="range"
              min={1000}
              max={100000}
              step={500}
              value={maxRent}
              onChange={(e) => onRentRange(minRent, Math.max(Number(e.target.value), minRent + 500))}
              aria-label="Maximum rent"
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#2563eb]"
            />
          </div>
        </div>
      </div>
      <button type="button" onClick={onSearch} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#2563eb] px-5 text-sm font-bold text-white transition hover:bg-[#1d4ed8]">
        <Search className="h-4 w-4" aria-hidden="true" /> Search
      </button>
    </div>
  );
}

/* ------------------------------ Filter panel ------------------------------ */

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1.5 text-[13px] text-[#374151]">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-[#2563eb]" />
      {label}
    </label>
  );
}

function FilterPanel({
  filters,
  onChange,
}: {
  filters: PgFilters;
  onChange: (next: Partial<PgFilters>) => void;
}) {
  const [localitySearch, setLocalitySearch] = useState('');
  const toggle = (key: 'occupancy' | 'food' | 'parking' | 'premium', value: string) => {
    const arr = filters[key];
    onChange({ [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] } as Partial<PgFilters>);
  };
  const toggleLocality = (loc: string) => {
    onChange({ localities: filters.localities.includes(loc) ? filters.localities.filter((x) => x !== loc) : [...filters.localities, loc] });
  };
  const visibleLocalities = LOCALITY_OPTIONS.filter((l) => l.toLowerCase().includes(localitySearch.trim().toLowerCase()));
  return (
    <aside className="w-full shrink-0 space-y-5 rounded-2xl border border-[#e5e7eb] bg-white p-4 lg:w-[260px]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold">Filter by</h2>
        <button type="button" onClick={() => onChange(DEFAULT_FILTERS)} className="text-[11px] font-semibold text-[#2563eb]">Clear all</button>
      </div>

      <div>
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#64748b]">Location</h3>
        <div className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#94a3b8]" aria-hidden="true" />
          <input
            value={localitySearch}
            onChange={(e) => setLocalitySearch(e.target.value)}
            placeholder="Search locality"
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#94a3b8]"
          />
        </div>
        {filters.localities.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {filters.localities.map((loc) => (
              <button key={loc} type="button" onClick={() => toggleLocality(loc)} className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-semibold text-[#1d4ed8]">
                {loc} <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto pr-1">
          {visibleLocalities.map((loc) => (
            <CheckRow key={loc} label={loc} checked={filters.localities.includes(loc)} onChange={() => toggleLocality(loc)} />
          ))}
          {visibleLocalities.length === 0 && <p className="py-1 text-[11px] text-[#94a3b8]">No locality found</p>}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#64748b]">Premium / Luxury</h3>
        <CheckRow label="Premium" checked={filters.premium.includes('premium')} onChange={() => toggle('premium', 'premium')} />
        <CheckRow label="Luxury" checked={filters.premium.includes('luxury')} onChange={() => toggle('premium', 'luxury')} />
      </div>

      <div>
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#64748b]">Occupancy</h3>
        {[['single', 'Single Room'], ['double', 'Double Sharing'], ['triple', 'Triple Sharing'], ['flat', 'Flats & Others']].map(([v, l]) => (
          <CheckRow key={v} label={l} checked={filters.occupancy.includes(v)} onChange={() => toggle('occupancy', v)} />
        ))}
      </div>

      <div>
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#64748b]">Food</h3>
        {[['all_meals', 'All meals included'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['no_food', 'No Food']].map(([v, l]) => (
          <CheckRow key={v} label={l} checked={filters.food.includes(v)} onChange={() => toggle('food', v)} />
        ))}
      </div>

      <div>
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#64748b]">Parking</h3>
        {[['bike', 'Bike'], ['car', 'Car'], ['both', 'Both']].map(([v, l]) => (
          <CheckRow key={v} label={l} checked={filters.parking.includes(v)} onChange={() => toggle('parking', v)} />
        ))}
      </div>
    </aside>
  );
}

/* ------------------------------ PG card ------------------------------ */

function PgCard({
  listing,
  onOpen,
}: {
  listing: PgDekhoListing;
  onOpen: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const images = listing.images;
  const badges = cardsOf(listing);
  const grid = iconGridOf(listing);
  const rents = rentOptionsOf(listing);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[#ececec] bg-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition hover:shadow-[0_10px_26px_rgba(253,112,30,0.16)]">
      <div className="relative">
        <button type="button" onClick={onOpen} className="relative block aspect-[16/10] w-full overflow-hidden" aria-label={`View ${listing.name}`}>
          {images.map((src, i) => (
            <SafeImage category="pg" key={src + i} src={src} alt={`${listing.name} photo ${i + 1}`} loading="lazy" className={`absolute inset-0 h-full w-full object-cover transition-opacity ${i === index ? 'opacity-100' : 'opacity-0'}`} onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
          ))}
        </button>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-2.5 py-1 text-[10.5px] font-bold text-white shadow-sm">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verified
        </span>
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <button type="button" onClick={onOpen} aria-label="Share" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#2563eb] shadow-sm"><Share2 className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => setSaved((s) => !s)} aria-pressed={saved} aria-label="Save" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
            <Heart className={`h-4 w-4 ${saved ? 'fill-[#2563eb] text-[#2563eb]' : 'text-[#2563eb]'}`} aria-hidden="true" />
          </button>
        </div>
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
          {images.map((_, i) => (
            <button key={i} type="button" aria-label={`Photo ${i + 1}`} onClick={() => setIndex(i)} className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-white' : 'bg-white/60'}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 text-left">
            <h3 className="truncate text-[15px] font-bold text-[#0f172a]">{listing.name}</h3>
          </button>
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-[#16a34a] px-1.5 py-0.5 text-[11px] font-bold text-white">
            <Star className="h-3 w-3 fill-white" aria-hidden="true" /> {listing.rating.toFixed(1)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#64748b]">{addressOf(listing)}</p>
        <span className="mt-1.5 inline-block w-fit rounded bg-[#eff6ff] px-1.5 py-0.5 text-[10px] font-bold text-[#1d4ed8]">{distanceKm(listing).toFixed(2)} km away</span>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {badges.slice(0, 4).map((b) => (
            <span key={b} className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-2 py-0.5 text-[10px] font-bold text-white">{b}</span>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-5 gap-1">
          {grid.map((g) => (
            <span key={g.label} className="flex flex-col items-center gap-0.5 rounded-lg border border-[#f1f5f9] py-1.5 text-center">
              <span className="text-[15px] leading-none" aria-hidden="true">{g.emoji}</span>
              <span className="text-[9px] font-semibold text-[#475569]">{g.label}</span>
            </span>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1">
          {rents.map((o) => (
            <div key={o.label} className="rounded-lg border border-[#ececec] px-1.5 py-1 text-center">
              <p className="text-[9.5px] text-[#64748b]">{o.label}</p>
              <p className="text-[11.5px] font-bold text-[#111827]">₹{o.rent.toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>

        <button type="button" onClick={onOpen} className="mt-2.5 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg bg-[#2563eb] text-[12.5px] font-bold text-white transition hover:bg-[#1d4ed8]">
          View details <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

/* ------------------------------ Contact modal ------------------------------ */

function ContactModal({ listing, onClose }: { listing: PgDekhoListing; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Contact owner">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold">Contact Owner</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#f3f4f6]"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-[12px] text-[#64748b]">{listing.name} · {listing.locality}, {listing.city}</p>
        {sent ? (
          <div className="mt-4 rounded-xl bg-purple-50 p-4 text-center">
            <Check className="mx-auto h-6 w-6 text-purple-600" />
            <p className="mt-1 text-[13px] font-bold text-purple-700">Enquiry recorded</p>
            <p className="mt-0.5 text-[11px] text-purple-700">This is a demo — no real message is sent and no data is stored.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-[13px] outline-none focus:border-[#2563eb]" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-[13px] outline-none focus:border-[#2563eb]" />
            <button type="button" onClick={() => setSent(true)} className="h-10 w-full rounded-lg bg-[#2563eb] text-[13px] font-bold text-white">Send enquiry</button>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button type="button" className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#2563eb] text-[12px] font-bold text-[#2563eb]"><Phone className="h-3.5 w-3.5" /> Call</button>
          <button type="button" className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#2563eb] text-[12px] font-bold text-[#2563eb]"><Mail className="h-3.5 w-3.5" /> WhatsApp</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Search page ------------------------------ */

function SearchPage({
  filters,
  setFilters,
  onOpen,
  onContact,
  demoMode,
  liveListings,
  onOpenLive,
}: {
  filters: PgFilters;
  setFilters: (next: Partial<PgFilters>) => void;
  onOpen: (l: PgDekhoListing) => void;
  onContact: (l: PgDekhoListing) => void;
  demoMode: boolean;
  liveListings: MarketplaceListing[];
  onOpenLive: (listing: MarketplaceListing) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const results = useMemo(() => {
    let list = (demoMode ? pgDekhoListings : []).filter((l) => {
      if (filters.city && filters.city !== 'all' && l.city !== filters.city) return false;
      if (filters.gender !== 'all' && l.gender !== filters.gender) return false;
      if (l.rent < filters.minRent || l.rent > filters.maxRent) return false;
      if (filters.verifiedOnly && !l.verified) return false;
      const q = filters.query.trim().toLowerCase();
      if (q && !`${l.name} ${l.locality} ${l.city}`.toLowerCase().includes(q)) return false;
      if (filters.area && !l.locality.toLowerCase().includes(filters.area.toLowerCase())) return false;
      if (filters.localities.length && !filters.localities.some((loc) => l.locality.toLowerCase().includes(loc.toLowerCase()))) return false;
      if (filters.occupancy.length) {
        const s = l.sharing.toLowerCase();
        const ok = filters.occupancy.some((o) => o === 'single' ? /single/.test(s) : o === 'double' ? /2|double/.test(s) : o === 'triple' ? /3|triple/.test(s) : /flat|apartment/.test(s));
        if (!ok) return false;
      }
      if (filters.food.length) {
        const f = l.food.toLowerCase();
        const ok = filters.food.some((x) => x === 'all_meals' ? /veg|all/.test(f) : x === 'no_food' ? /self|no food|room only/.test(f) : x === 'breakfast' ? /breakfast/.test(f) : x === 'lunch' ? /lunch/.test(f) : /dinner/.test(f));
        if (!ok) return false;
      }
      if (filters.parking.length && !/parking/.test(l.amenities.join(' ').toLowerCase())) return false;
      if (filters.premium.length) {
        const ok = filters.premium.some((x) => (x === 'premium' ? l.rent >= 12000 : l.rent >= 18000));
        if (!ok) return false;
      }
      return true;
    });
    if (filters.sortBy === 'price_asc') list = [...list].sort((a, b) => a.rent - b.rent);
    if (filters.sortBy === 'price_desc') list = [...list].sort((a, b) => b.rent - a.rent);
    if (filters.sortBy === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [filters, demoMode]);
  const liveResults = useMemo(() => liveListings.filter((listing) => {
    const city = String(listing.location?.city || '').toLowerCase();
    const area = String(listing.location?.area || '').toLowerCase();
    const query = filters.query.trim().toLowerCase();
    if (filters.city !== 'all' && city !== filters.city.toLowerCase()) return false;
    if (filters.gender !== 'all' && !`${listing.categoryId} ${listing.subcategory} ${listing.customFieldValues?.genderPolicy || ''}`.toLowerCase().includes(filters.gender === 'co-living' ? 'co' : filters.gender)) return false;
    if (typeof listing.price === 'number' && (listing.price < filters.minRent || listing.price > filters.maxRent)) return false;
    if (query && !`${listing.title} ${area} ${city}`.toLowerCase().includes(query)) return false;
    if (filters.area && !area.includes(filters.area.toLowerCase())) return false;
    if (filters.localities.length && !filters.localities.some((locality) => area.includes(locality.toLowerCase()))) return false;
    return true;
  }), [liveListings, filters]);

  const cityLabel = filters.localities.length
    ? (filters.localities.length === 1 ? filters.localities[0] : `${filters.localities.length} localities`)
    : filters.area
    ? `${filters.area}${filters.city && filters.city !== 'all' ? `, ${filters.city}` : ''}`
    : (!filters.city || filters.city === 'all' ? 'India' : filters.city);

  const mapPoints = useMemo(
    () => results.map((l) => { const [lat, lng] = coordsOf(l); return { lat, lng, label: l.name }; }),
    [results]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8fafc]">
      <div className="mx-auto max-w-[1200px] px-4 py-4">
        <SearchBar
          city={filters.city}
          onCity={(v) => setFilters({ city: v })}
          gender={filters.gender}
          onGender={(v) => setFilters({ gender: v })}
          minRent={filters.minRent}
          maxRent={filters.maxRent}
          onRentRange={(min, max) => setFilters({ minRent: min, maxRent: max })}
          onSearch={() => { const el = document.getElementById('pg-search-input') as HTMLInputElement | null; setFilters({ query: el?.value ?? '' }); }}
        />

        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {POPULAR_AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setFilters({ area: filters.area === a ? '' : a })}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${filters.area === a ? 'border-[#2563eb] bg-[#2563eb] text-white' : 'border-[#e5e7eb] bg-white text-[#475569] hover:border-[#93c5fd]'}`}
            >
              {a}
            </button>
          ))}
          {filters.area && (
            <button type="button" onClick={() => setFilters({ area: '' })} className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#2563eb] underline">
              Clear
            </button>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <h1 className="text-[20px] font-extrabold text-[#111827]">{results.length} PG in {cityLabel}</h1>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[12px] font-semibold text-[#374151]">
              Verified Properties
              <span className={`relative h-5 w-9 rounded-full transition ${filters.verifiedOnly ? 'bg-[#2563eb]' : 'bg-[#cbd5e1]'}`}>
                <input type="checkbox" checked={filters.verifiedOnly} onChange={(e) => setFilters({ verifiedOnly: e.target.checked })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Verified properties only" />
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${filters.verifiedOnly ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
            </label>
            <select value={filters.sortBy} onChange={(e) => setFilters({ sortBy: e.target.value })} className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2 text-[12px] font-semibold outline-none">
              <option value="recommended">Sort by Recommended</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Rating</option>
            </select>
            <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[12px] font-semibold lg:hidden">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
            </button>
            <button type="button" onClick={() => setShowMap((s) => !s)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold ${showMap ? 'border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]' : 'border-[#e5e7eb] bg-white text-[#475569]'}`}>
              <MapPin className="h-3.5 w-3.5" /> Map
            </button>
          </div>
        </div>

        {showMap && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-2">
            <FreeMap points={mapPoints} className="h-64 w-full rounded-xl" />
            <p className="mt-1 text-center text-[10px] text-[#94a3b8]">Map data © OpenStreetMap contributors · tap a pin to see the PG</p>
          </div>
        )}

        <div className="mt-4 flex gap-4">
          <div className="hidden lg:block">
            <FilterPanel filters={filters} onChange={setFilters} />
          </div>
          <div className="min-w-0 flex-1">
            {liveResults.length > 0 && (
              <section className="mb-4" aria-label="Verified PG listings from the marketplace database">
                <h2 className="mb-2 text-[15px] font-extrabold text-[#111827]">Available PGs &amp; Hostels</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {liveResults.map((listing) => (
                    <article key={listing.id} className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
                      <button type="button" onClick={() => onOpenLive(listing)} aria-label={`View details for ${listing.title}`} className="block w-full text-left">
                        {listing.images[0] ? <SafeImage category="pg" src={listing.images[0]} alt={listing.title} className="aspect-[16/10] w-full object-cover" loading="lazy" /> : <div aria-label="No listing photo provided" className="flex aspect-[16/10] items-center justify-center bg-[#f1f5f9] text-sm text-[#64748b]">No photo provided</div>}
                        <div className="p-3">
                          <h3 className="font-bold text-[#111827]">{listing.title}</h3>
                          <p className="mt-1 text-xs text-[#64748b]">{[listing.location?.area, listing.location?.city].filter(Boolean).join(', ') || 'Location not provided'}</p>
                          <p className="mt-2 text-sm font-extrabold text-[#1d4ed8]">{typeof listing.price === 'number' ? formatINR(listing.price) : 'Rent on request'}{typeof listing.price === 'number' && <span className="text-xs font-semibold text-[#64748b]"> / {listing.priceUnit || 'month'}</span>}</p>
                          <p className="mt-1 text-[11px] text-[#64748b]">Admin-approved provider listing · check dates for live bed availability</p>
                        </div>
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {results.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((l) => (
                  <PgCard key={l.id} listing={l} onOpen={() => onOpen(l)} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-[#e5e7eb] bg-white p-8 text-center">
                <MapPin className="mx-auto h-8 w-8 text-[#2563eb]" />
                <h2 className="mt-2 text-[17px] font-extrabold">{demoMode ? `PGs in ${cityLabel} coming soon` : 'No verified PG listings available'}</h2>
                <p className="mt-1 text-[12px] text-[#64748b]">{demoMode ? 'Preview data is illustrative only. Verified provider listings will appear when connected.' : 'This section will show properties after verified provider listings are connected.'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Explore PGs across India */}
        <section className="mt-8 rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="text-[16px] font-extrabold text-[#0f172a]">Explore PGs across India</h2>
          <p className="mt-0.5 text-[11.5px] text-[#64748b]">Pick a city and area to see verified PGs nearby.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PG_AREA_DIRECTORY.map((group) => (
              <div key={group.city}>
                <h3 className="text-[12px] font-bold text-[#0f172a]">{group.city}</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.areas.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setFilters({ area: a, city: group.city })}
                      className="rounded-md bg-[#f8fafc] px-2 py-1 text-[10.5px] font-medium text-[#475569] transition hover:bg-[#eef2ff] hover:text-[#2563eb]"
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-[90] flex bg-black/40 lg:hidden" onClick={() => setFiltersOpen(false)}>
          <div className="ml-auto h-full w-[85%] max-w-xs overflow-y-auto bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <FilterPanel filters={filters} onChange={setFilters} />
            <button type="button" onClick={() => setFiltersOpen(false)} className="mt-4 h-11 w-full rounded-lg bg-[#2563eb] font-bold text-white">Show {results.length} PGs</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Detail page ------------------------------ */

const DETAIL_TABS = ['Property Details', 'Occupancy', 'Charges', 'Amenities', 'House Rules', 'Location', 'Reviews'];

const TAB_TARGETS: Record<string, string> = {
  'Property Details': 'pg-key-details',
  Occupancy: 'pg-key-details',
  Charges: 'pg-charges',
  Amenities: 'pg-amenities',
  'House Rules': 'pg-rules',
  Location: 'pg-location',
  Reviews: 'pg-reviews',
};

function DetailPage({ listing, onBack, onContact }: { listing: PgDekhoListing; onBack: () => void; onContact: () => void }) {
  const [tab, setTab] = useState('Property Details');
  const goTab = (t: string) => {
    setTab(t);
    const id = TAB_TARGETS[t];
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const similar = pgDekhoListings.filter((l) => l.city === listing.city && l.id !== listing.id).slice(0, 4);
  const images = listing.images.length >= 5 ? listing.images.slice(0, 5) : [...listing.images, ...listing.images, ...listing.images].slice(0, 5);
  return (
    <div className="flex-1 overflow-y-auto bg-[#f8fafc]">
      <div className="mx-auto max-w-[1100px] px-3 py-4 sm:px-4">
        <div className="flex items-center gap-1 text-[11px] text-[#64748b]">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 font-semibold text-[#2563eb]"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
          <span>/</span><span>PG in {listing.city}</span><span>/</span><span className="truncate">{listing.name}</span>
        </div>

        <div className="mt-2 flex gap-1 overflow-x-auto border-b border-[#e5e7eb] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DETAIL_TABS.map((t) => (
            <button key={t} type="button" onClick={() => goTab(t)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-[12px] font-semibold ${tab === t ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-[#64748b]'}`}>{t}</button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="relative overflow-hidden rounded-xl">
            <SafeImage category="pg" src={images[0]} alt={listing.name} className="aspect-[16/10] w-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
            <button type="button" aria-label="View all photos" className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">View all photos</button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-rows-2">
            {images.slice(1, 5).map((src, i) => (
              <div key={i} className="overflow-hidden rounded-lg">
                <SafeImage category="pg" src={src} alt={`${listing.name} photo ${i + 2}`} className="aspect-[16/10] h-full w-full object-cover sm:aspect-auto" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-extrabold text-[#111827]">{listing.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-[12px] text-[#64748b]"><MapPin className="h-3.5 w-3.5" /> {addressOf(listing)}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {badgesOf(listing).map((b) => <span key={b} className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-bold text-[#1d4ed8]">{b}</span>)}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-1 rounded-full border border-[#e5e7eb] bg-white px-3 text-[12px] font-semibold"><Share2 className="h-3.5 w-3.5" /> Share</button>
            <button type="button" className="inline-flex h-9 items-center gap-1 rounded-full border border-[#e5e7eb] bg-white px-3 text-[12px] font-semibold"><Heart className="h-3.5 w-3.5" /> Save</button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            <div id="pg-key-details" className="scroll-mt-24 rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <h2 className="text-[14px] font-extrabold">Key details</h2>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {keyInfoOf(listing).map((row) => (
                  <div key={row.label + row.value} className="flex items-center gap-2 text-[11.5px]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]"><Check className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0"><p className="truncate font-semibold text-[#111827]">{row.label}</p><p className="truncate text-[10px] text-[#64748b]">{row.value}</p></div>
                  </div>
                ))}
              </div>
            </div>

            <div id="pg-charges" className="scroll-mt-24 rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <h2 className="text-[14px] font-extrabold">Room Types &amp; Pricing</h2>
              <div className="mt-2 space-y-2">
                {rentOptionsOf(listing).map((o) => (
                  <div key={o.label} className="flex items-center justify-between rounded-xl border border-[#2563eb]/30 bg-[#eff6ff] px-3 py-2">
                    <div>
                      <p className="text-[11px] font-bold text-[#1d4ed8]">{o.label} Bed</p>
                      <p className="text-[13px] font-extrabold text-[#111827]">{formatINR(o.rent)}<span className="text-[10px] font-semibold text-[#64748b]">/month</span></p>
                      <p className="text-[10px] text-[#64748b]">Deposit: {formatINR(Math.round(o.rent))}</p>
                    </div>
                    <div className="flex gap-1">
                      {['Wifi', 'AC', 'Food', 'Laundry'].map((a) => <span key={a} className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#64748b]">{a}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <h2 className="text-[14px] font-extrabold">About this PG</h2>
              <p className="mt-1.5 text-[12px] leading-5 text-[#4b5563]">{listing.description}</p>
            </div>

            <div id="pg-amenities" className="scroll-mt-24 rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <h2 className="text-[14px] font-extrabold">Amenities</h2>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {listing.amenities.map((a) => {
                  const Icon = amenityIcon(a);
                  return (
                    <span key={a} className="flex flex-col items-center gap-1 rounded-lg border border-[#f1f5f9] py-2 text-center text-[9.5px] font-semibold text-[#475569]">
                      <Icon className="h-4 w-4 text-[#2563eb]" /> {a}
                    </span>
                  );
                })}
              </div>
            </div>

            <div id="pg-rules" className="scroll-mt-24 rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <h2 className="text-[14px] font-extrabold">PG Rules</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {['Guests not allowed', 'No smoking', 'No alcohol', 'Entry after 11 PM needs permission'].map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 rounded-full border border-[#e5e7eb] px-2.5 py-1 text-[11px] font-semibold text-[#374151]"><Check className="h-3 w-3 text-purple-600" /> {r}</span>
                ))}
              </div>
            </div>

            <div id="pg-location" className="scroll-mt-24 rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <h2 className="text-[14px] font-extrabold">Location</h2>
              <div className="mt-2 overflow-hidden rounded-xl">
                <FreeMap
                  points={[{ lat: coordsOf(listing)[0], lng: coordsOf(listing)[1], label: `${listing.name} · ${listing.locality}, ${listing.city}` }]}
                  className="h-56 w-full"
                />
              </div>
              <p className="mt-1.5 text-[10px] text-[#94a3b8]">Map data © OpenStreetMap contributors</p>
            </div>

            <div id="pg-reviews" className="scroll-mt-24 rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <h2 className="text-[14px] font-extrabold">Reviews</h2>
              <div className="mt-2 flex items-center gap-2">
                <span className="flex items-center gap-1 rounded bg-[#16a34a] px-2 py-0.5 text-[12px] font-bold text-white"><Star className="h-3 w-3 fill-white" /> {listing.rating.toFixed(1)}</span>
                <span className="text-[11px] text-[#64748b]">from {listing.reviewCount} reviews</span>
              </div>
              <div className="mt-2 space-y-2">
                {['Good food and clean rooms.', 'Owner is responsive, wifi is fast.', 'Safe and well maintained.'].map((r) => (
                  <p key={r} className="rounded-xl border border-[#f1f5f9] p-2.5 text-[11.5px] text-[#4b5563]">“{r}”</p>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <div className="flex items-center justify-between">
                <div><h2 className="text-[14px] font-extrabold">Show some love!</h2><p className="text-[11px] text-[#64748b]">Let us know how good this PG is.</p></div>
                <button type="button" className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-[12px] font-bold text-white">Write a Review</button>
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">Starts from</p>
              <p className="text-[20px] font-extrabold text-[#2563eb]">{formatINR(listing.rent)}<span className="text-[11px] font-semibold text-[#64748b]">/month</span></p>
              <ul className="mt-2 space-y-1 text-[11.5px] text-[#374151]">
                <li className="flex items-center gap-1.5">{listing.gender === 'boys' ? '♂ For Boys' : listing.gender === 'girls' ? '♀ For Girls' : '👥 Co-living'}</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-purple-600" /> Notice: 15 Days</li>
                <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-purple-600" /> Preferred Bath</li>
              </ul>
              <button type="button" onClick={onContact} className="mt-3 h-10 w-full rounded-lg bg-[#2563eb] text-[13px] font-bold text-white">Contact Owner</button>
              <p className="mt-2 text-center text-[10px] text-[#94a3b8]">Sample preview — no real contact is sent.</p>
            </div>
          </aside>
        </div>

        {similar.length > 0 && (
          <div className="mt-6">
            <h2 className="text-[15px] font-extrabold">Similar PGs in {listing.city}</h2>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {similar.map((s) => (
                <button key={s.id} type="button" onClick={() => goTo(`#pg/pg/${s.id}`)} className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white text-left">
                  <SafeImage category="pg" src={s.images[0]} alt={s.name} className="aspect-[16/10] w-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                  <div className="p-2"><p className="truncate text-[11.5px] font-bold">{s.name}</p><p className="text-[10px] font-semibold text-[#2563eb]">{formatINR(s.rent)}/mo</p></div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Main ------------------------------ */

export function PgDekhoExperience({ onClose, onSwitchToOld, inline = false, listings = [], selectedCity, showTabBar = true }: PgDekhoExperienceProps) {
  const [route, setRoute] = useState<PgRoute>(() => parseRoute());
  const [filters, setFiltersState] = useState<PgFilters>(DEFAULT_FILTERS);
  const [contact, setContact] = useState<PgDekhoListing | null>(null);

  const setFilters = (next: Partial<PgFilters>) => setFiltersState((cur) => ({ ...cur, ...next }));

  useEffect(() => {
    const value = selectedCity?.trim();
    if (value && !['all', 'all cities', 'all locations'].includes(value.toLowerCase())) {
      setFiltersState((current) => ({ ...current, city: value }));
    }
  }, [selectedCity]);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (contact) setContact(null);
      else if (route.name === 'detail') goTo('#pg/search');
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, route, contact]);

  const liveDetailListing = route.name === 'detail' ? listings.find((listing) => listing.id === route.id && listing.status === 'active') : null;
  const detailListing = route.name === 'detail' && DEMO_DATA_ENABLED ? pgDekhoListings.find((l) => l.id === route.id) : null;

  return (
    <div
      className={
        inline
          ? 'w-full bg-white text-[#1f2937]'
          : 'fixed inset-0 z-[71] flex flex-col bg-white text-[#1f2937]'
      }
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label="PG marketplace"
    >
      {showTabBar && <PgDekhoTabBar active="pgdekho" onOld={onSwitchToOld} onNew={() => {}} />}

      {inline ? (
        <div className="border-b border-[#e5e7eb] bg-white">
          <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to all sections"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e7eb] text-[#374151] transition hover:bg-[#eff6ff]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-[15px] font-black text-[#1d4ed8]">PGs &amp; Hostels</span>
            <span className="ml-auto rounded-full bg-[#eff6ff] px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#1d4ed8]">
              <BookOurSpaceLogo className="text-[10px]" />
            </span>
          </div>
        </div>
      ) : (
        <header className="shrink-0 bg-gradient-to-r from-[#2563eb] to-[#3b82f6]">
          <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4">
            <button type="button" onClick={() => goTo('#pg/search')} aria-label="BookOurSpace home" className="flex shrink-0 items-center">
              <span className="rounded-lg bg-white px-2 py-1"><BookOurSpaceLogo className="text-lg" /></span>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" className="hidden rounded-full border border-white/70 px-3 py-1.5 text-[12px] font-bold text-white sm:block">List Your PG</button>
              <button type="button" className="rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-[#2563eb]">Login</button>
            </div>
          </div>
        </header>
      )}

      {route.name === 'detail' && liveDetailListing ? (
        <LivePgDetail listing={liveDetailListing} onBack={() => goTo('#pg/search')} />
      ) : route.name === 'detail' && detailListing ? (
        <DetailPage listing={detailListing} onBack={() => goTo('#pg/search')} onContact={() => setContact(detailListing)} />
      ) : (
        <SearchPage filters={filters} setFilters={setFilters} onOpen={(l) => goTo(`#pg/pg/${l.id}`)} onContact={(l) => setContact(l)} demoMode={DEMO_DATA_ENABLED} liveListings={listings.filter((listing) => listing.status === 'active' && (listing.categoryId.startsWith('pg-') || listing.customFieldValues?.sectionType === 'pg_hostels'))} onOpenLive={(listing) => goTo(`#pg/pg/${encodeURIComponent(listing.id)}`)} />
      )}

      <footer className="shrink-0 border-t border-[#e5e7eb] bg-[#eff6ff] px-4 py-2 text-center text-[10.5px] text-[#64748b]">
        {DEMO_DATA_ENABLED ? 'Sample preview cards are illustrative only. Database listings are separately identified and checked against live inventory.' : 'Only approved provider listings and PostgreSQL-backed availability are shown; payment remains separate.'}
      </footer>

      {contact && <ContactModal listing={contact} onClose={() => setContact(null)} />}
    </div>
  );
}

function LivePgDetail({ listing, onBack }: { listing: MarketplaceListing; onBack: () => void }) {
  const attributes = listing.customFieldValues || {};
  return <main className="min-w-0 flex-1 overflow-y-auto bg-[#f8fafc] px-4 py-4">
    <div className="mx-auto max-w-[1100px]">
      <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#1d4ed8]"><ArrowLeft className="h-4 w-4" /> Back to PGs</button>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <section className="min-w-0 rounded-2xl border border-[#e5e7eb] bg-white p-4">
          {listing.images[0] && <SafeImage category="pg" src={listing.images[0]} alt={listing.title} className="mb-4 aspect-[16/9] w-full rounded-xl object-cover" />}
          <h1 className="text-xl font-extrabold text-[#111827]">{listing.title}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-[#64748b]"><MapPin className="h-4 w-4" />{[listing.location?.area, listing.location?.city].filter(Boolean).join(', ') || 'Location not provided'}</p>
          <p className="mt-2 text-sm text-[#475569]">{listing.description || 'The provider has not added a description.'}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {Object.entries(attributes).filter(([key, value]) => typeof value === 'string' && value.trim() && !/phone|email|contact|address/i.test(key)).slice(0, 8).map(([key, value]) => <div key={key} className="rounded-lg bg-[#f8fafc] p-2"><dt className="text-[10px] font-bold uppercase text-[#64748b]">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="mt-0.5">{String(value)}</dd></div>)}
          </dl>
          <p className="mt-4 text-sm font-bold">{typeof listing.price === 'number' ? `${formatINR(listing.price)} / ${listing.priceUnit || 'month'}` : 'Rent on request'}</p>
          <p className="mt-1 text-xs text-[#64748b]">This price is provider-listed. Bed availability and reservation totals are verified separately by the server.</p>
        </section>
        <PgBookingPanel listingId={listing.id} />
      </div>
    </div>
  </main>;
}
