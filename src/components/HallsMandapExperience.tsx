import { useEffect, useMemo, useState } from 'react';
import SafeImage from './SafeImage';
import { Heart, MapPin, SlidersHorizontal, ShieldCheck } from 'lucide-react';
import type { MarketplaceListing } from '../types/marketplace';
import { HALL_VENUE_TYPES } from '../data/hallsVenueTypes';

interface HallsMandapExperienceProps {
  listings: MarketplaceListing[];
  activeType: string;
  onSelectType: (id: string) => void;
  onOpenListing: (listing: MarketplaceListing) => void;
}
type VenueCategory={id:string;label:string;emoji:string;subcategories:string[];active:boolean};

const formatPrice = (listing: MarketplaceListing) =>
  `₹${listing.price.toLocaleString('en-IN')}${listing.priceUnit || ''}`;

export function HallsMandapExperience({ listings, activeType, onSelectType, onOpenListing }: HallsMandapExperienceProps) {
  const [categories,setCategories]=useState<VenueCategory[]>([]);
  const [sortBy, setSortBy] = useState('Recommended');
  const [priceMax, setPriceMax] = useState<'all' | 50000 | 100000 | 200000>('all');
  const [minimumCapacity, setMinimumCapacity] = useState('all');
  const [foodFilter, setFoodFilter] = useState('all');
  const [amenityFilter, setAmenityFilter] = useState('all');
  const [cateringFilter, setCateringFilter] = useState('all');
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(()=>{let live=true;fetch('/api/venues/categories').then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(live)setCategories(Array.isArray(d.categories)?d.categories.filter((c:VenueCategory)=>c.active):[]);}).catch(()=>{if(live)setCategories([]);});return()=>{live=false;};},[]);
  const activeTile = HALL_VENUE_TYPES.find((t) => t.id === activeType) ?? null;
  const activeCategory=categories.find(category=>category.id===activeType)||null;

  const filtered = useMemo(() => {
    let list = [...listings];
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
  }, [listings, activeTile, activeCategory, priceMax, minimumCapacity, foodFilter, amenityFilter, cateringFilter, sortBy]);

  const heading = activeTile ? activeTile.label : activeCategory?.label||'All Venues & Halls';
  const count = filtered.length;

  return (
    <section className="w-full">
      {/* Venue type tiles (Mandap-style) */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {HALL_VENUE_TYPES.map((type) => {
          const active = activeType === type.id;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onSelectType(active ? 'all' : type.id)}
              aria-pressed={active}
              className={`group relative w-[118px] shrink-0 overflow-hidden rounded-2xl border bg-white text-left transition sm:w-[132px] ${
                active ? 'border-[#e11d48] ring-2 ring-rose-200' : 'border-[#f1d4d9] hover:border-[#fda4af]'
              }`}
            >
              <div className="relative h-[70px] w-full overflow-hidden bg-rose-50">
                <SafeImage category="venues"
                  src={type.image}
                  alt={type.label}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                />
                <span className="absolute left-1.5 top-1 text-[14px] leading-none">{type.emoji}</span>
              </div>
              <div className={`px-2 py-1.5 text-[10.5px] font-extrabold leading-tight ${active ? 'text-[#e11d48]' : 'text-[#334155]'}`}>
                {type.label}
              </div>
            </button>
          );
        })}
      </div>

      {categories.length>0&&<div className="mt-3 flex gap-2 overflow-x-auto pb-2" aria-label="Admin-managed venue categories">{categories.map(category=><button key={category.id} type="button" onClick={()=>onSelectType(activeType===category.id?'all':category.id)} aria-pressed={activeType===category.id} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${activeType===category.id?'border-violet-700 bg-violet-700 text-white':'border-violet-100 bg-white text-violet-900'}`}>{category.emoji} {category.label}</button>)}</div>}

      {/* Breadcrumb + heading */}
      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold">
        <span className="text-[#e11d48]">Home</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">{heading}</span>
      </div>
      <h1 className="mt-1 text-[22px] font-black tracking-tight text-slate-900 sm:text-[26px]">
        {heading} <span className="text-slate-500">({count.toLocaleString('en-IN')})</span>
      </h1>
      <p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-600">
        Host large-scale wedding receptions and luxurious events at India&apos;s finest halls and convention centres.
        Every card shows only what the venue listed — sample listings are marked demo.
      </p>

      {/* Filters row */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
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

      {/* Cards */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((listing) => {
          const isSaved = Boolean(saved[listing.id]);
          return (
            <article key={listing.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
              <div className="relative">
                <button type="button" onClick={() => onOpenListing(listing)} className="block aspect-[4/3] w-full overflow-hidden" aria-label={`View ${listing.title}`}>
                  {listing.images[0]?.trim() ? (
                    <SafeImage category="venues"
                      src={listing.images[0]}
                      alt={listing.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-violet-50 px-3 text-center text-xs font-semibold text-violet-700">
                      No venue photo provided
                    </span>
                  )}
                </button>
                {listing.isVerified && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-violet-700 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-sm">
                    <ShieldCheck className="h-3 w-3" /> Verified
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSaved((s) => ({ ...s, [listing.id]: !s[listing.id] }))}
                  aria-label="Save"
                  aria-pressed={isSaved}
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm"
                >
                  <Heart className={`h-4 w-4 ${isSaved ? 'fill-[#e11d48] text-[#e11d48]' : ''}`} />
                </button>
              </div>
              <div className="p-3">
                <h3 className="truncate text-[13px] font-extrabold text-slate-900">{listing.title}</h3>
                <p className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-slate-500">
                  <MapPin className="h-3 w-3 shrink-0" /> {listing.location.area}, {listing.location.city}
                </p>
                <div className="mt-1.5 flex items-end justify-between">
                  <p className="text-[15px] font-black text-slate-900">
                    {formatPrice(listing)}
                  </p>
                  <button type="button" onClick={() => onOpenListing(listing)} className="rounded-lg bg-[#e11d48] px-2.5 py-1 text-[10.5px] font-bold text-white">
                    View
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
