import { useEffect, useMemo, useState } from 'react';
import SafeImage from './SafeImage';
import { ArrowRight, ArrowUpDown, Check, Heart, MapPin, Phone, Search, SlidersHorizontal, ShieldCheck, Star, Users, X } from 'lucide-react';
import type { MarketplaceListing } from '../types/marketplace';
import { HALL_VENUE_TYPES } from '../data/hallsVenueTypes';
import { initialVenueListings } from '../data/venueData';
import { DEMO_DATA_ENABLED } from '../lib/demoDataPolicy';
import { BOS_CALL_HREF } from '../lib/contactNumbers';

interface HallsMandapExperienceProps {
  listings: MarketplaceListing[];
  activeType: string;
  onSelectType: (id: string) => void;
  onOpenListing: (listing: MarketplaceListing) => void;
  selectedCategory?: string;
}
type VenueCategory={id:string;label:string;emoji:string;subcategories:string[];active:boolean};

const formatPrice = (listing: MarketplaceListing) =>
  `₹${listing.price.toLocaleString('en-IN')} ${listing.priceUnit || ''}`.trim();

export function HallsMandapExperience({ listings, activeType, onSelectType, onOpenListing, selectedCategory = 'all' }: HallsMandapExperienceProps) {
  const [categories,setCategories]=useState<VenueCategory[]>([]);
  const [sortBy, setSortBy] = useState('Recommended');
  const [priceMax, setPriceMax] = useState<'all' | 50000 | 100000 | 200000>('all');
  const [minimumCapacity, setMinimumCapacity] = useState('all');
  const [foodFilter, setFoodFilter] = useState('all');
  const [amenityFilter, setAmenityFilter] = useState('all');
  const [cateringFilter, setCateringFilter] = useState('all');
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [venueTypeFilters, setVenueTypeFilters] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState(300000);
  const [guestRange, setGuestRange] = useState('all');
  const [foodTypes, setFoodTypes] = useState<string[]>([]);

  useEffect(()=>{let live=true;fetch('/api/venues/categories').then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(live)setCategories(Array.isArray(d.categories)?d.categories.filter((c:VenueCategory)=>c.active):[]);}).catch(()=>{if(live)setCategories([]);});return()=>{live=false;};},[]);
  const activeTile = HALL_VENUE_TYPES.find((t) => t.id === activeType) ?? null;
  const activeCategory=categories.find(category=>category.id===activeType)||null;

  const allListings = useMemo(() => {
    if (!DEMO_DATA_ENABLED) return listings;
    // The database fixture named "Mock Venue Image" has no overview or
    // amenities. In demo mode, show the fully populated demo halls instead.
    const realListings = listings.filter((listing) => !/^mock\b/i.test(listing.title.trim()));
    const existing = new Set(realListings.map((listing) => listing.id));
    return [...realListings, ...initialVenueListings.filter((listing) => !existing.has(listing.id))];
  }, [listings]);

  const filtered = useMemo(() => {
    let list = [...allListings];
    const search = searchTerm.trim().toLowerCase();
    if (search) {
      list = list.filter((listing) => `${listing.title} ${listing.location.area} ${listing.location.city} ${listing.subcategory}`.toLowerCase().includes(search));
    }
    if (venueTypeFilters.length > 0) {
      list = list.filter((listing) => {
        const haystack = `${listing.title} ${listing.subcategory} ${listing.categoryId}`.toLowerCase();
        return venueTypeFilters.some((type) => {
          if (type === 'banquet') return /banquet|kalyana|mandapam|venue-marriage/.test(haystack);
          if (type === 'lawn') return /lawn|garden|mandap/.test(haystack);
          if (type === 'convention') return /convention|conference|expo/.test(haystack);
          return /meeting|board.?room/.test(haystack);
        });
      });
    }
    if (maxPrice < 300000) {
      list = list.filter((listing) => listing.price <= maxPrice);
    }
    if (guestRange !== 'all') {
      list = list.filter((listing) => {
        const raw = String(listing.customFieldValues?.capacity ?? listing.customFieldValues?.seatingCapacity ?? '');
        const capacity = Number(raw.match(/\d[\d,]*/)?.[0]?.replaceAll(',', '') || 0);
        if (guestRange === 'under100') return capacity > 0 && capacity < 100;
        if (guestRange === '100-250') return capacity >= 100 && capacity <= 250;
        if (guestRange === '250-500') return capacity > 250 && capacity <= 500;
        if (guestRange === '500-1000') return capacity > 500 && capacity <= 1000;
        return capacity > 1000;
      });
    }
    if (foodTypes.length > 0) {
      list = list.filter((listing) => {
        const policy = String(listing.customFieldValues?.cateringPolicy ?? '').toLowerCase();
        const title = listing.title.toLowerCase();
        return foodTypes.some((type) => {
          if (type === 'veg') return /veg/.test(policy) && !/non.?veg/.test(policy);
          if (type === 'nonveg') return /non.?veg/.test(policy) || /non.?veg/.test(title);
          return /outside/.test(policy);
        });
      });
    }
    if (selectedCategory !== 'all') {
      list = list.filter((listing) => listing.categoryId === selectedCategory);
    }
    if (activeTile) {
      list = list.filter((l) => activeTile.categoryIds.includes(l.categoryId));
    } else if(activeCategory) {
      list=list.filter(listing=>listing.categoryId===activeCategory.id);
    }
    if (priceMax !== 'all') {
      list = list.filter((l) => l.price <= priceMax);
    }
    if (minimumCapacity !== 'all') {
      const minimum = Number(minimumCapacity);
      list = list.filter((listing) => {
        const raw = String(listing.customFieldValues?.capacity ?? listing.customFieldValues?.seatingCapacity ?? '');
        const capacity = Number(raw.match(/\d[\d,]*/)?.[0]?.replaceAll(',', '') || 0);
        return capacity >= minimum;
      });
    }
    if (foodFilter !== 'all') {
      list = list.filter((listing) => {
        const policy = String(listing.customFieldValues?.cateringPolicy ?? '').toLowerCase();
        return foodFilter === 'vegetarian'
          ? /vegetarian|veg only/.test(policy)
          : foodFilter === 'outside'
            ? /outside catering/.test(policy)
            : /in.house/.test(policy);
      });
    }
    if (amenityFilter !== 'all') {
      list = list.filter((listing) => {
        const fields = listing.customFieldValues || {};
        const ac = String(fields.acType ?? fields.acHallType ?? '').toLowerCase();
        const parking = String(fields.parkingCapacity ?? '').trim();
        const power = String(fields.powerBackup ?? fields.guestRooms ?? '').trim();
        return amenityFilter === 'ac' ? /air.?condition|\bac\b/.test(ac) && !/non.?ac/.test(ac)
          : amenityFilter === 'parking' ? Boolean(parking)
            : Boolean(power);
      });
    }
    if (cateringFilter !== 'all') {
      list = list.filter((listing) => {
        const policy = String(listing.customFieldValues?.cateringPolicy ?? '').toLowerCase();
        return cateringFilter === 'outside' ? /outside catering/.test(policy)
          : cateringFilter === 'in_house' ? /in.house/.test(policy)
            : /included/.test(policy);
      });
    }
    if (sortBy === 'Price: Low to High') list.sort((a, b) => a.price - b.price);
    if (sortBy === 'Price: High to Low') list.sort((a, b) => b.price - a.price);
    return list;
  }, [allListings, selectedCategory, activeTile, activeCategory, priceMax, minimumCapacity, foodFilter, amenityFilter, cateringFilter, sortBy, searchTerm, venueTypeFilters, maxPrice, guestRange, foodTypes]);

  const heading = activeTile ? activeTile.label : activeCategory?.label||'All Venues & Halls';

  return (
    <section className="w-full">

      {/* Heading */}
      <h1 className="mt-3 text-[22px] font-black tracking-tight text-slate-900 sm:text-[26px]">
        {heading}
      </h1>
      <p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-600">
        Host large-scale wedding receptions and luxurious events at India&apos;s finest halls and convention centres.
        Every card shows only what the venue listed — sample listings are marked demo.
      </p>

      {/* Filters row */}
      <div id="hall-filters" className="mt-3 hidden flex-wrap items-center gap-1.5 sm:flex">
        <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600">
          <SlidersHorizontal className="h-3 w-3" />
        </span>
        <label className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700">
          <span className="hidden sm:inline">Sort by</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none">
            <option>Recommended</option>
            <option>Price: Low to High</option>
            <option>Price: High to Low</option>
          </select>
        </label>
        <button type="button" onClick={() => onSelectType('all')} aria-label="Clear venue type filter" className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e11d48] bg-rose-50 px-2.5 text-[11px] font-bold text-[#e11d48]">
          {activeTile ? 'Clear venue type' : 'All types'}
        </button>
        <label className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700">
          Price range
          <select value={String(priceMax)} onChange={(e) => setPriceMax(e.target.value === 'all' ? 'all' : Number(e.target.value) as 50000 | 100000 | 200000)} className="bg-transparent text-[11px] font-bold outline-none">
            <option value="all">Any</option>
            <option value="50000">Up to ₹50k</option>
            <option value="100000">Up to ₹1L</option>
            <option value="200000">Up to ₹2L</option>
          </select>
        </label>
        <label className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700">
          Capacity
          <select value={minimumCapacity} onChange={(event) => setMinimumCapacity(event.target.value)} className="max-w-24 bg-transparent text-[11px] font-bold outline-none">
            <option value="all">Any</option><option value="100">100+ guests</option><option value="250">250+ guests</option><option value="500">500+ guests</option><option value="1000">1,000+ guests</option>
          </select>
        </label>
        <label className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700">
          Food
          <select value={foodFilter} onChange={(event) => setFoodFilter(event.target.value)} className="max-w-28 bg-transparent text-[11px] font-bold outline-none">
            <option value="all">Any</option><option value="vegetarian">Vegetarian</option><option value="outside">Outside catering</option><option value="in_house">In-house</option>
          </select>
        </label>
        <label className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700">
          Amenities
          <select value={amenityFilter} onChange={(event) => setAmenityFilter(event.target.value)} className="max-w-28 bg-transparent text-[11px] font-bold outline-none">
            <option value="all">Any</option><option value="ac">AC</option><option value="parking">Parking listed</option><option value="power">Power backup listed</option>
          </select>
        </label>
        <label className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700">
          Catering
          <select value={cateringFilter} onChange={(event) => setCateringFilter(event.target.value)} className="max-w-28 bg-transparent text-[11px] font-bold outline-none">
            <option value="all">Any</option><option value="outside">Outside allowed</option><option value="in_house">In-house</option><option value="included">Included</option>
          </select>
        </label>
      </div>

      {/* Mobile search, filters and sort */}
      <div className="mt-3 flex items-center gap-2 sm:hidden">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Hyderabad, Area or Venue" className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-slate-800 outline-none placeholder:text-slate-400 dark:text-white" />
        </label>
        <button type="button" onClick={() => setFilterOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-violet-200 bg-white px-2.5 text-[11px] font-black text-violet-800 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-200">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          {(venueTypeFilters.length + foodTypes.length + (guestRange !== 'all' ? 1 : 0) + (maxPrice < 300000 ? 1 : 0)) > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-700 px-1 text-[9px] text-white">{venueTypeFilters.length + foodTypes.length + (guestRange !== 'all' ? 1 : 0) + (maxPrice < 300000 ? 1 : 0)}</span>
          )}
        </button>
        <label className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="bg-transparent text-[10px] font-bold outline-none">
            <option>Recommended</option><option>Price: Low to High</option><option>Price: High to Low</option>
          </select>
        </label>
      </div>

      {filterOpen && (
        <div className="fixed inset-0 z-[130] bg-slate-950/45 sm:hidden" role="presentation" onClick={() => setFilterOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Hall filters" onClick={(event) => event.stopPropagation()} className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Filters</h2>
              <button type="button" onClick={() => setFilterOpen(false)} aria-label="Close filters" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <section>
                <h3 className="flex items-center gap-2 text-[13px] font-black text-slate-900 dark:text-white"><ShieldCheck className="h-4 w-4" /> Venue Type</h3>
                <div className="mt-2 space-y-2">
                  {[['banquet', 'Banquet Hall'], ['lawn', 'Marriage Garden / Lawn'], ['convention', 'Convention Hall'], ['meeting', 'Meeting Room']].map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={venueTypeFilters.includes(value)} onChange={() => setVenueTypeFilters((prev) => prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value])} className="h-4 w-4 rounded border-slate-300 accent-violet-700" />
                      {label}
                    </label>
                  ))}
                </div>
              </section>

              <section className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="text-[13px] font-black text-slate-900 dark:text-white">₹ Price (per day)</h3>
                <input type="range" min={0} max={300000} step={10000} value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} className="mt-3 w-full accent-violet-700" aria-label="Maximum price per day" />
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500"><span>₹0</span><span>₹{maxPrice.toLocaleString('en-IN')}+</span></div>
              </section>

              <section className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="flex items-center gap-2 text-[13px] font-black text-slate-900 dark:text-white"><Users className="h-4 w-4" /> Guests</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[['all', 'Any'], ['under100', '< 100'], ['100-250', '100 – 250'], ['250-500', '250 – 500'], ['500-1000', '500 – 1,000'], ['1000+', '> 1,000']].map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setGuestRange(value)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${guestRange === value ? 'border-violet-700 bg-violet-700 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{label}</button>
                  ))}
                </div>
              </section>

              <section className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="text-[13px] font-black text-slate-900 dark:text-white">Food</h3>
                <div className="mt-2 space-y-2">
                  {[['veg', 'Veg'], ['nonveg', 'Non-Veg'], ['outside', 'Outside Caterers Allowed']].map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={foodTypes.includes(value)} onChange={() => setFoodTypes((prev) => prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value])} className="h-4 w-4 rounded border-slate-300 accent-violet-700" />
                      {label}
                    </label>
                  ))}
                </div>
              </section>
              <button type="button" onClick={() => { setVenueTypeFilters([]); setFoodTypes([]); setGuestRange('all'); setMaxPrice(300000); setSearchTerm(''); }} className="mt-5 w-full rounded-lg border border-slate-200 py-2 text-[11px] font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">Clear all</button>
            </div>
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              <button type="button" onClick={() => setFilterOpen(false)} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-700 text-sm font-black text-white">Show {filtered.length} Results</button>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((listing) => {
          const isSaved = Boolean(saved[listing.id]);
          const fields = listing.customFieldValues || {};
          const capacity = String(fields.capacity ?? fields.seatingCapacity ?? '').match(/\d[\d,]*/)?.[0];
          const tags = [
            fields.acType || fields.acHallType ? 'AC Hall' : '',
            fields.parkingCapacity ? 'Parking' : '',
            capacity ? `${capacity} guests` : '',
          ].filter(Boolean).slice(0, 3);
          return (
            <article key={listing.id} className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950">
              <div className="relative">
                <button type="button" onClick={() => onOpenListing(listing)} className="block aspect-[16/10] w-full overflow-hidden" aria-label={`View and book ${listing.title}`}>
                  {listing.images[0]?.trim() ? (
                    <SafeImage category="venues"
                      src={listing.images[0]}
                      alt={listing.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-violet-50 px-3 text-center text-xs font-semibold text-violet-700">
                      No venue photo provided
                    </span>
                  )}
                </button>
                {listing.isVerified && (
                  <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[#e11d48] px-2.5 py-1 text-[10px] font-extrabold text-white shadow-sm">
                    <ShieldCheck className="h-3 w-3" /> Verified
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSaved((s) => ({ ...s, [listing.id]: !s[listing.id] }))}
                  aria-label={`${isSaved ? 'Remove' : 'Save'} ${listing.title}`}
                  aria-pressed={isSaved}
                  className="absolute right-2.5 top-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm transition hover:scale-105"
                >
                  <Heart className={`h-4 w-4 ${isSaved ? 'fill-[#e11d48] text-[#e11d48]' : ''}`} />
                </button>
              </div>
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-[14px] font-black leading-[1.3] text-slate-900 dark:text-white">{listing.title}</h3>
                  {listing.providerRating > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black text-slate-900 dark:text-white">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" /> {listing.providerRating.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1 truncate text-[10.5px] font-semibold text-slate-500">
                  <MapPin className="h-3 w-3 shrink-0" /> {listing.location.area}, {listing.location.city}
                </p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                    <Users className="h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden="true" />
                    <span className="truncate">{capacity ? `Up to ${capacity} Guests` : 'Capacity on request'}</span>
                  </span>
                  <p className="shrink-0 text-[15px] font-black text-slate-900 dark:text-white">
                    {formatPrice(listing)}
                  </p>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <a href={BOS_CALL_HREF} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-violet-300 bg-white text-[11px] font-black text-violet-800 transition hover:bg-violet-50 dark:border-violet-700 dark:bg-slate-900 dark:text-violet-200">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call Owner
                  </a>
                  <button type="button" onClick={() => onOpenListing(listing)} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl bg-violet-700 text-[11px] font-black text-white transition hover:bg-violet-800">
                    View Details <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-[13px] font-bold text-slate-800">No venues match these filters</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Try a different venue type or price range.</p>
        </div>
      )}
    </section>
  );
}
