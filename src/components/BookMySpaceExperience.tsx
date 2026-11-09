import React, { useEffect, useState } from 'react';
import SafeImage from './SafeImage';
import {
  Bell,
  ChevronDown,
  Heart,
  Home,
  LogIn,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import {
  bmsCities,
  bmsFeaturedCategories,
  bmsPopularSpaces,
  bmsPromos,
  bmsQuickCategories,
} from '../data/bookMySpaceData';

interface BookMySpaceExperienceProps {
  onClose: () => void;
  onSwitchToOld: () => void;
}

/* ------------------------------ Tab bar ------------------------------ */

export function BmsTabBar({
  active,
  onOld,
  onNew,
}: {
  active: 'old' | 'bms';
  onOld: () => void;
  onNew: () => void;
}) {
  const base = 'inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition';
  return (
    <div className="flex shrink-0 items-center justify-center border-b border-[#ebebeb] bg-[#f7f7f7] px-4 py-2">
      <div className="inline-flex items-center rounded-full border border-[#dddddd] bg-white p-1 shadow-sm">
        <button type="button" onClick={onOld} className={`${base} ${active === 'old' ? 'bg-[#222222] text-white' : 'text-[#717171] hover:bg-[#f7f7f7]'}`}>
          Old
        </button>
        <button type="button" onClick={onNew} className={`${base} ${active === 'bms' ? 'bg-[#4F46E5] text-white' : 'text-[#717171] hover:bg-[#f7f7f7]'}`}>
          BookMySpace
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ Brand mark ------------------------------ */

function BookMySpaceWordmark({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className ?? ''}`}
      translate="no"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
        <Home className="h-5 w-5 text-[#4F46E5]" aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className="bg-gradient-to-r from-[#0F172A] via-[#8B5CF6] to-[#2563EB] bg-clip-text text-[17px] font-black tracking-tight text-transparent"
          style={{ WebkitBackgroundClip: 'text' }}
        >
          BookMySpace
        </span>
        <span className="mt-0.5 text-[9.5px] font-semibold tracking-wide text-[#64748b]">Find · Book · Experience</span>
      </span>
    </span>
  );
}

/* ------------------------------ Main component ------------------------------ */

export function BookMySpaceExperience({ onClose, onSwitchToOld }: BookMySpaceExperienceProps) {
  const [location, setLocation] = useState('Hyderabad');
  const [locationSub, setLocationSub] = useState('India');
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<string[]>([]);

  const toggleSaved = (id: string) =>
    setSaved((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const filteredSpaces = bmsPopularSpaces.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${s.name} ${s.category} ${s.area}`.toLowerCase().includes(q);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showLocationSheet) setShowLocationSheet(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, showLocationSheet]);

  return (
    <div className="fixed inset-0 z-[71] flex flex-col bg-[#f7f7fa] text-[#0f172a]" role="dialog" aria-modal="true" aria-label="BookMySpace home">
      <BmsTabBar active="bms" onOld={onSwitchToOld} onNew={() => {}} />

      {/* Top bar */}
      <header className="shrink-0 border-b border-[#e2e8f0] bg-white">
        <div className="mx-auto flex h-14 max-w-[640px] items-center justify-between gap-2 px-4">
          <button type="button" onClick={() => setShowLocationSheet(true)} className="flex min-w-0 items-center gap-1.5 rounded-xl px-1 py-1 text-left">
            <MapPin className="h-[22px] w-[22px] shrink-0 text-[#3F51B5]" aria-hidden="true" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14.5px] font-extrabold leading-tight">{location}</span>
              <span className="truncate text-[10.5px] text-[#64748b]">{locationSub}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[#64748b]" aria-hidden="true" />
          </button>

          <BookMySpaceWordmark />

          <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#0f172a] transition hover:bg-[#f1f5f9]">
              <Bell className="h-[26px] w-[26px]" aria-hidden="true" />
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">3</span>
            </button>
            <button type="button" className="inline-flex h-[38px] items-center gap-1.5 rounded-full bg-[#EEF2FF] px-3 text-[13px] font-extrabold text-[#3F51B5] transition hover:bg-[#e0e7ff]">
              <LogIn className="h-4 w-4" aria-hidden="true" /> Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[640px] px-4 pb-16" style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f6f3ff 100%)' }}>
          {/* Sample banner */}
          <div role="note" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span><span className="font-semibold">Sample preview.</span> Spaces, prices and ratings are simulated for demonstration only.</span>
          </div>

          {/* Hero */}
          <div className="pt-4 text-center">
            <h1 className="text-[27px] font-black leading-[1.1] tracking-[-0.6px]">
              Discover{' '}
              <span className="bg-gradient-to-r from-[#2563EB] via-[#4F46E5] to-[#7C3AED] bg-clip-text text-transparent" style={{ WebkitBackgroundClip: 'text' }}>Spaces</span>
              <br />
              <span className="bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#D946EF] bg-clip-text text-transparent" style={{ WebkitBackgroundClip: 'text' }}>for Every Moment</span>
            </h1>
            <p className="mt-1.5 text-[12.5px] font-medium text-[#64748b]">Book Halls, Classes, PGs, Hotels, Events and more...</p>
          </div>

          {/* Search bar */}
          <div className="mt-4 flex items-center rounded-[30px] border border-[#E2E8F0] bg-white px-4 py-3 shadow-[0_4px_14px_rgba(0,0,0,0.05)]">
            <Search className="h-[22px] w-[22px] shrink-0 text-[#2563EB]" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search halls, classes, PGs, hotels..."
              className="ml-2.5 min-w-0 flex-1 bg-transparent text-[13.5px] font-medium outline-none placeholder:text-[#94A3B8]"
            />
            <SlidersHorizontal className="h-5 w-5 shrink-0 text-[#1E293B]" aria-hidden="true" />
          </div>

          {/* Featured categories */}
          <div className="mt-6 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {bmsFeaturedCategories.map((cat) => (
              <button key={cat.id} type="button" className="group relative w-[200px] shrink-0 overflow-hidden rounded-2xl text-left">
                <SafeImage category="venues" src={cat.image} alt={cat.title} loading="lazy" className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.04]" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                  <p className="text-[15px] font-bold leading-tight">{cat.title}</p>
                  <p className="text-[11px] text-white/80">{cat.subtitle}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Quick categories */}
          <div className="mt-6">
            <h2 className="text-[15px] font-bold text-[#0f172a]">Browse by category</h2>
            <div className="mt-3 grid grid-cols-4 gap-3">
              {bmsQuickCategories.map((cat) => (
                <button key={cat.id} type="button" className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#e2e8f0] bg-white px-2 py-3 text-center transition hover:border-[#8B5CF6]">
                  <span className="text-[26px]" aria-hidden="true">{cat.emoji}</span>
                  <span className="text-[12px] font-semibold text-[#1e293b]">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Promos */}
          <div className="mt-6 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {bmsPromos.map((promo) => (
              <button key={promo.id} type="button" className="group relative w-[240px] shrink-0 overflow-hidden rounded-2xl text-left">
                <SafeImage category="venues" src={promo.image} alt={promo.title} loading="lazy" className="aspect-[16/9] w-full object-cover transition duration-300 group-hover:scale-[1.04]" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                  <p className="text-[14px] font-bold leading-tight">{promo.title}</p>
                  <p className="text-[11px] text-white/80">{promo.subtitle}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Popular spaces */}
          <div className="mt-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[#0f172a]">Popular spaces near {location}</h2>
              <button type="button" className="text-[13px] font-semibold text-[#3F51B5] hover:underline">View all</button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredSpaces.map((space) => (
                <article key={space.id} className="group">
                  <div className="relative overflow-hidden rounded-2xl">
                    <SafeImage category="venues" src={space.image} alt={space.name} loading="lazy" className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.04]" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                    <button
                      type="button"
                      onClick={() => toggleSaved(space.id)}
                      aria-pressed={saved.includes(space.id)}
                      aria-label={saved.includes(space.id) ? 'Remove from saved' : 'Save space'}
                      className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-105"
                    >
                      <Heart className={`h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${saved.includes(space.id) ? 'fill-[#FF7043] text-[#FF7043]' : 'fill-black/25 text-white'}`} />
                    </button>
                  </div>
                  <div className="mt-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[14.5px] font-bold leading-5">{space.name}</h3>
                      <p className="truncate text-[12.5px] text-[#64748b]">{space.category} · {space.area}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold">
                      <Star className="h-3.5 w-3.5 fill-[#FF7043] text-[#FF7043]" /> {space.rating.toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px]">
                    <span className="font-extrabold text-[#3F51B5]">₹{space.price}</span>
                    <span className="text-[#64748b]"> {space.unit}</span>
                  </p>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-700">
                    <Sparkles className="h-3 w-3" aria-hidden="true" /> Sample
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Location sheet */}
      {showLocationSheet && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40" role="dialog" aria-modal="true" aria-label="Select location" onClick={() => setShowLocationSheet(false)}>
          <div className="w-full max-w-[640px] rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Select Location &amp; Search Area</h2>
              <button type="button" onClick={() => setShowLocationSheet(false)} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f5f9]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <button type="button" className="mt-3 flex w-full items-center gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-left text-[14px] font-semibold text-[#3F51B5]">
              <MapPin className="h-[18px] w-[18px]" aria-hidden="true" /> Search All India Towns, Mandals &amp; PIN Codes
            </button>
            <p className="mt-4 text-[13px] font-bold text-[#0f172a]">Popular Areas:</p>
            <div className="mt-1 max-h-[50vh] overflow-y-auto">
              {bmsCities.map((city) => {
                const short = city.split(' (').shift()!;
                const selected = location === short;
                return (
                  <button
                    key={city}
                    type="button"
                    onClick={() => { setLocation(short); setLocationSub('India'); setShowLocationSheet(false); }}
                    className="flex w-full items-center gap-2 py-2.5 text-left text-[14px] text-[#1e293b]"
                  >
                    {selected ? (
                      <span className="text-[#3F51B5]">✓</span>
                    ) : (
                      <MapPin className="h-4 w-4 text-[#94a3b8]" aria-hidden="true" />
                    )}
                    {city}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
