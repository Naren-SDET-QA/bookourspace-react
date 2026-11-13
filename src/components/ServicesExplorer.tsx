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
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from 'lucide-react';
import { servicesCategories } from '../data/servicesStayMoviesData';
import { MarketplaceListing } from '../types/marketplace';
import {
  buildServicePriceBreakdown,
  filterServiceListings,
} from '../features/services/servicesUtils';
import { ExplorerLayout, explorerLayoutOptions } from '../features/explorer/explorerLayout';
import { serviceSections } from '../data/additionalServiceCategories';
import { ServiceSections } from './ServiceSections';

type ServicesLayout = ExplorerLayout | 'hometriangle';
const servicesLayoutOptions = [...explorerLayoutOptions, {
  id: 'hometriangle' as const, label: 'HomeTriangle-style', description: 'Blue search and service category tiles.',
}];

interface ServicesExplorerProps {
  listings: MarketplaceListing[];
  onSelectListing: (listing: MarketplaceListing) => void;
  onBookListing: (listing: MarketplaceListing, date: string) => void;
  onRegisterProvider?: (categoryId: string) => void;
  currentLang?: string;
}

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', weekday: 'short' }).format(
    new Date(`${date}T12:00:00`)
  );

const serviceDuration = (listing: MarketplaceListing) =>
  String(listing.customFieldValues?.estimatedDuration || listing.customFieldValues?.duration || 'Provider confirms after request');

const ListingMap = lazy(() =>
  import('./ListingMap').then((module) => ({ default: module.ListingMap }))
);

export const ServicesExplorer: React.FC<ServicesExplorerProps> = ({
  listings,
  onSelectListing,
  onBookListing,
  onRegisterProvider,
  currentLang = 'en',
}) => {
  const isTelugu = currentLang === 'te';
  const today = useMemo(() => toIsoDate(new Date()), []);
  const [area, setArea] = useState('Hyderabad');
  const [serviceDate, setServiceDate] = useState(today);
  const [households, setHouseholds] = useState(1);
  const [categoryId, setCategoryId] = useState('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minimumRating, setMinimumRating] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [page, setPage] = useState(1);
  const [selectedService, setSelectedService] = useState<MarketplaceListing | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [layout, setLayout] = useState<ServicesLayout>('airbnb');
  const [sectionId, setSectionId] = useState('all');
  const isAirbnbLayout = layout === 'airbnb';
  const isHomeStyle = layout === 'hometriangle';
  const activeSection = serviceSections.find((section) => section.id === sectionId);
  const selectedCategory = servicesCategories.find((category) => category.id === categoryId);

  const chooseCategory = (id: string) => {
    setCategoryId(id);
    setPage(1);
  };

  const result = useMemo(
    () =>
      filterServiceListings(listings, {
        query: area,
        categoryId,
        verifiedOnly,
        minimumRating,
        page,
        pageSize: 8,
        categoryIds: activeSection?.categoryIds,
      }),
    [listings, area, categoryId, verifiedOnly, minimumRating, page, activeSection]
  );
  const price = selectedService ? buildServicePriceBreakdown(selectedService) : null;

  const chooseService = (listing: MarketplaceListing) => {
    setSelectedService(listing);
    setGalleryIndex(0);
  };

  const performSearch = () => {
    setPage(1);
    document.getElementById('bos-services-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const labels = {
    title: isTelugu ? 'మీ ఇంటి కోసం నమ్మకమైన సేవలు.' : 'Trusted help for your home.',
    subtitle: isTelugu
      ? 'వెరిఫైడ్ స్థానిక ప్రొవైడర్లను ఒకే చోట కనుగొని, తేదీని ఎంచుకుని సురక్షితంగా అభ్యర్థన పంపండి.'
      : 'Find verified local providers, choose a date, and send a secure booking request in one simple flow.',
    where: isTelugu ? 'ఎక్కడ / Where' : 'Where',
    when: isTelugu ? 'ఎప్పుడు / When' : 'When',
    who: isTelugu ? 'మీ ఇల్లు / Your home' : 'Your home',
    search: isTelugu ? 'వెతకండి / Search' : 'Search',
    filters: isTelugu ? 'ఫిల్టర్లు / Filters' : 'Filters',
    list: isTelugu ? 'జాబితా / List' : 'List',
    map: isTelugu ? 'మ్యాప్ / Map' : 'Map',
    all: isTelugu ? 'అన్ని సేవలు / All services' : 'All services',
    request: isTelugu ? 'సురక్షిత అభ్యర్థన కొనసాగించండి' : 'Continue to secure request',
  };

  return (
    <section className="space-y-7" aria-labelledby="services-explorer-title">
      <div className={`overflow-hidden rounded-[28px] border text-slate-900 dark:text-white ${isHomeStyle ? 'border-blue-100 bg-gradient-to-br from-white via-white to-blue-50 dark:border-blue-900 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950' : isAirbnbLayout ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950' : 'border-sky-200 bg-sky-50/70 dark:border-sky-900/70 dark:bg-slate-950'}`}>
        <div className="px-5 pb-5 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
          <div className={`space-y-2 ${isHomeStyle ? 'mx-auto max-w-2xl py-7 text-center' : 'max-w-2xl'}`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
              <ShieldCheck className="h-3.5 w-3.5" /> BookOurSpace Services · సేవలు
            </div>
            <h2 id="services-explorer-title" className="text-2xl font-black tracking-tight sm:text-4xl">
              {isHomeStyle ? (isTelugu ? 'మీ ఇంటి కోసం స్థానిక నిపుణులను బుక్ చేయండి' : 'Local professionals. A home well cared for.') : labels.title}
            </h2>
            <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">{labels.subtitle}</p>
          </div>

          <div className="mt-5 flex w-fit max-w-full flex-wrap rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900" role="group" aria-label="Choose services layout">
            {servicesLayoutOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={layout === option.id}
                onClick={() => setLayout(option.id)}
                title={option.description}
                className={`rounded-full px-3 py-2 text-[11px] font-black transition ${layout === option.id ? (option.id === 'airbnb' ? 'bg-[#FF385C] text-white' : 'bg-sky-600 text-white') : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {option.id === 'classic' ? 'Classic' : option.id === 'hometriangle' ? 'HomeTriangle-style' : 'Airbnb-inspired'}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-2 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:rounded-full">
            <div className="grid gap-2 sm:grid-cols-[1.25fr_1fr_0.8fr_auto] sm:items-end">
              <label className="min-w-0 rounded-2xl border border-slate-200 px-3 py-2.5 dark:border-slate-700 sm:rounded-full">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <Search className="h-3.5 w-3.5" /> {labels.where}
                </span>
                <input
                  value={area}
                  onChange={(event) => {
                    setArea(event.target.value);
                    setPage(1);
                  }}
                  placeholder="City, area or service"
                  className="mt-1 w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400 dark:text-white"
                  aria-label="Search services by city, area, or service"
                />
              </label>
              <label className="rounded-2xl border border-slate-200 px-3 py-2.5 dark:border-slate-700 sm:rounded-full">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" /> {labels.when}
                </span>
                <input
                  type="date"
                  min={today}
                  value={serviceDate}
                  onChange={(event) => setServiceDate(event.target.value || today)}
                  className="mt-1 w-full bg-transparent text-sm font-bold outline-none dark:text-white"
                  aria-label="Preferred service date"
                />
              </label>
              <div className="rounded-2xl border border-slate-200 px-3 py-2.5 dark:border-slate-700 sm:rounded-full">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <Users className="h-3.5 w-3.5" /> {labels.who}
                </span>
                <div className="mt-1 flex items-center justify-between gap-2 text-sm font-bold">
                  <span>{households} {households === 1 ? 'home' : 'homes'}</span>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => setHouseholds((value) => Math.max(1, value - 1))} className="rounded-full border border-slate-200 p-1 dark:border-slate-600" aria-label="Decrease homes"><Minus className="h-3 w-3" /></button>
                    <button type="button" onClick={() => setHouseholds((value) => Math.min(10, value + 1))} className="rounded-full border border-slate-200 p-1 dark:border-slate-600" aria-label="Increase homes"><Plus className="h-3 w-3" /></button>
                  </span>
                </div>
              </div>
              <button type="button" onClick={performSearch} className={`flex h-[58px] items-center justify-center gap-2 rounded-full px-5 text-sm font-black text-white ${isHomeStyle ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#FF385C] hover:bg-rose-700'}`}>
                <Search className="h-4 w-4" /> {labels.search}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ServiceSections
        listings={listings}
        activeSection={sectionId}
        selectedCategory={categoryId}
        isTelugu={isTelugu}
        homeStyle={isHomeStyle}
        onSection={(id) => { setSectionId(id); chooseCategory('all'); }}
        onCategory={chooseCategory}
      />

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Service categories">
        <button type="button" onClick={() => { setCategoryId('all'); setPage(1); }} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-4 py-2.5 text-left transition ${categoryId === 'all' ? 'border-[#FF385C] bg-[#FF385C] text-white shadow-md' : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'}`}>
          <span className="text-base">✨</span><span className="text-xs font-black">{labels.all}</span>
        </button>
        {servicesCategories.filter((category) => !activeSection || activeSection.categoryIds.some((id) => id === category.id)).map((category) => (
          <button key={category.id} type="button" onClick={() => { setCategoryId(category.id); setPage(1); }} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-4 py-2.5 text-left transition ${categoryId === category.id ? 'border-[#FF385C] bg-rose-50 text-rose-800 shadow-md dark:bg-rose-950/50 dark:text-rose-100' : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'}`}>
            <span className="text-base">{category.emoji}</span><span className="text-xs font-black">{isTelugu ? `${category.nameTe} / ${category.name}` : category.name}</span>
          </button>
        ))}
      </div>

      <div id="bos-services-results" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FF385C]">{area || 'Nearby'} services</p>
            <h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">{selectedCategory?.name || activeSection?.label || 'Services'} · {result.total} providers</h3>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black ${filtersOpen || verifiedOnly || minimumRating > 0 ? 'border-[#FF385C] bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-100' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'}`}><SlidersHorizontal className="h-4 w-4" /> {labels.filters}</button>
            <div className="flex rounded-full border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              <button type="button" onClick={() => setViewMode('list')} className={`rounded-full px-3 py-1.5 text-xs font-black ${viewMode === 'list' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500'}`}>{labels.list}</button>
              <button type="button" onClick={() => setViewMode('map')} className={`rounded-full px-3 py-1.5 text-xs font-black ${viewMode === 'map' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500'}`}>{labels.map}</button>
            </div>
          </div>
        </div>

        {filtersOpen && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50/70 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
            <Filter className="h-3.5 w-3.5 text-rose-700 dark:text-rose-200" />
            <button type="button" onClick={() => { setVerifiedOnly((value) => !value); setPage(1); }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${verifiedOnly ? 'border-[#FF385C] bg-[#FF385C] text-white' : 'border-rose-200 bg-white text-rose-800 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-200'}`}>Verified only</button>
            {[0, 4, 4.5].map((rating) => <button key={rating} type="button" onClick={() => { setMinimumRating(rating); setPage(1); }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${minimumRating === rating ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-rose-200 bg-white text-rose-800 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-200'}`}>{rating === 0 ? 'Any rating' : `${rating}+ stars`}</button>)}
          </div>
        )}

        {viewMode === 'map' && (
          <Suspense fallback={<div className="h-72 animate-pulse rounded-3xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />}>
            <ListingMap
              listings={result.items}
              onSelectListing={chooseService}
              label={isTelugu ? 'సేవల మ్యాప్ / Services map' : 'Services map'}
            />
          </Suspense>
        )}

        {result.items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="text-3xl" aria-hidden="true">{selectedCategory?.emoji || '🛠️'}</div>
            <h4 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">{selectedCategory ? `No ${selectedCategory.name.toLowerCase()} providers available here yet` : 'No services match those filters'}</h4>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Try another area or filter. Local providers can register their service for review.</p>
            {onRegisterProvider && <button type="button" onClick={() => onRegisterProvider(categoryId)} className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Register a local provider</button>}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((listing) => <ServiceCard key={listing.id} listing={listing} layout={layout} onOpen={() => chooseService(listing)} onBook={() => onBookListing(listing, serviceDate)} />)}
          </div>
        )}

        {result.total > 8 && <div className="flex items-center justify-center gap-3 pt-2"><button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-full border border-slate-200 bg-white p-2 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900" aria-label="Previous services"><ChevronLeft className="h-4 w-4" /></button><span className="text-xs font-black text-slate-500">Page {page}</span><button type="button" disabled={!result.hasNextPage} onClick={() => setPage((value) => value + 1)} className="rounded-full border border-slate-200 bg-white p-2 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900" aria-label="Next services"><ChevronRight className="h-4 w-4" /></button></div>}
      </div>

      {selectedService && price && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <div className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white shadow-2xl dark:bg-slate-900 sm:rounded-[28px]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#FF385C]">BookOurSpace Services</p><h3 className="mt-1 max-w-[70vw] truncate text-base font-black text-slate-900 dark:text-white">{selectedService.title}</h3></div><button type="button" onClick={() => setSelectedService(null)} className="rounded-full bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300" aria-label="Close service details"><X className="h-4 w-4" /></button></div>
            <div className="grid gap-5 p-5 md:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-3xl bg-slate-100 dark:bg-slate-800"><img src={selectedService.images[galleryIndex] || selectedService.images[0]} alt={selectedService.title} className="h-64 w-full object-cover sm:h-80" />{selectedService.images.length > 1 && <><button type="button" onClick={() => setGalleryIndex((value) => (value - 1 + selectedService.images.length) % selectedService.images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white" aria-label="Previous service image"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => setGalleryIndex((value) => (value + 1) % selectedService.images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white" aria-label="Next service image"><ChevronRight className="h-4 w-4" /></button></>}</div>
                <div className="flex gap-2 overflow-x-auto">{selectedService.images.map((image, index) => <button key={`${image}-${index}`} type="button" onClick={() => setGalleryIndex(index)} className={`h-14 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${galleryIndex === index ? 'border-[#FF385C]' : 'border-transparent'}`} aria-label={`Open service image ${index + 1}`}><img src={image} alt="" className="h-full w-full object-cover" /></button>)}</div>
                <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">{selectedService.subcategory}</span>{selectedService.isVerified && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">Verified provider</span>}</div><h4 className="mt-2 text-xl font-black leading-tight text-slate-900 dark:text-white">{selectedService.title}</h4><p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-slate-500"><MapPin className="h-3.5 w-3.5" /> {selectedService.location.area}</p><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedService.description}</p></div>
                <div className="grid gap-2 sm:grid-cols-3">{['Verified provider profile', 'Choose a preferred date', 'Final availability checked server-side'].map((item) => <div key={item} className="rounded-2xl bg-slate-50 p-3 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><CircleCheck className="mb-1 h-4 w-4 text-emerald-600" /> {item}</div>)}</div>
              </div>
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Your service request</p><p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{formatDate(serviceDate)} · {households} {households === 1 ? 'home' : 'homes'}</p><p className="mt-1 text-xs font-bold text-slate-500">Expected duration: {serviceDuration(selectedService)}</p><button type="button" onClick={() => setSelectedService(null)} className="mt-3 text-xs font-black text-[#FF385C]">Edit search</button></div>
                <div className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-center justify-between"><p className="text-sm font-black text-slate-900 dark:text-white">Price breakdown</p><span className="text-[10px] font-bold text-emerald-600">Provider pricing</span></div><div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300"><ServicePriceRow label={`${selectedService.priceUnit === 'Fixed' ? 'Service price' : `Starting at ${selectedService.priceUnit}`}`} value={price.baseAmount} /><ServicePriceRow label="BookOurSpace service fee" value={price.platformFee} /><ServicePriceRow label="Applicable taxes" value={price.taxes} /><div className="border-t border-slate-100 pt-2 dark:border-slate-800"><ServicePriceRow label="Total before secure request" value={price.total} strong /></div></div><p className="mt-3 text-[10px] leading-4 text-slate-500">The provider and server validate availability, final scope, and payment status before confirmation.</p></div>
                <button type="button" onClick={() => { setSelectedService(null); onBookListing(selectedService, serviceDate); }} className="w-full rounded-2xl bg-[#FF385C] px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700 dark:shadow-none">{labels.request}</button>
                <button type="button" onClick={() => { setSelectedService(null); onSelectListing(selectedService); }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-700 dark:border-slate-800 dark:text-slate-200">Open full service details</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const ServicePriceRow: React.FC<{ label: string; value: number; strong?: boolean }> = ({ label, value, strong }) => <div className={`flex items-center justify-between gap-3 ${strong ? 'text-sm font-black text-slate-900 dark:text-white' : ''}`}><span>{label}</span><span>₹{value.toLocaleString('en-IN')}</span></div>;

const ServiceCard: React.FC<{ listing: MarketplaceListing; layout: ServicesLayout; onOpen: () => void; onBook: () => void }> = ({ listing, layout, onOpen, onBook }) => {
  const [liked, setLiked] = useState(false);
  const price = buildServicePriceBreakdown(listing);
  return (
    <article className={`group overflow-hidden transition hover:-translate-y-0.5 ${layout === 'classic' ? 'rounded-3xl border border-sky-100 bg-white p-3 shadow-[0_10px_28px_rgba(14,165,233,0.08)] dark:border-sky-900/50 dark:bg-slate-900' : 'rounded-2xl bg-transparent'}`}>
      <div className="relative cursor-pointer" onClick={onOpen}><img src={listing.images[0]} alt={listing.title} className={`w-full rounded-2xl object-cover transition duration-500 group-hover:scale-[1.02] ${layout === 'classic' ? 'h-48' : 'h-56'}`} /><span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black text-slate-700 shadow-sm">{listing.subcategory}</span><button type="button" onClick={(event) => { event.stopPropagation(); setLiked((value) => !value); }} aria-label={liked ? 'Remove from favorites' : 'Save service to favorites'} className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-slate-700 shadow-sm"><Heart className={`h-4 w-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} /></button>{listing.isFeatured && <span className="absolute bottom-3 left-3 rounded-full bg-[#FFE500] px-2.5 py-1 text-[10px] font-black text-slate-900">Guest favourite</span>}</div>
      <div className="space-y-2.5 px-1 pt-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="line-clamp-2 text-sm font-black leading-5 text-slate-900 dark:text-white">{listing.title}</h4><p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-slate-500"><MapPin className="h-3 w-3" /> {listing.location.area}</p></div><span className="flex shrink-0 items-center gap-1 text-xs font-black text-slate-700 dark:text-slate-200"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {listing.providerRating.toFixed(1)}</span></div><p className="line-clamp-1 text-xs text-slate-500">{listing.providerName} · {serviceDuration(listing)}</p><div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800"><div><span className="text-base font-black text-slate-900 dark:text-white">₹{price.baseAmount.toLocaleString('en-IN')}</span><span className="text-[11px] font-bold text-slate-500"> {listing.priceUnit}</span><p className="mt-0.5 text-[10px] text-slate-500">₹{price.total.toLocaleString('en-IN')} before confirmation</p></div><button type="button" onClick={onBook} className={`rounded-full px-3.5 py-2 text-[11px] font-black text-white transition ${layout === 'classic' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-[#FF385C] hover:bg-rose-700'}`}>Request</button></div></div>
    </article>
  );
};
