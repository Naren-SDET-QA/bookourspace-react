import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import type { MarketplaceListing } from '../types/marketplace';
import {
  filterServiceListings,
  isServiceListing,
  pageCount,
  paginate,
  parseServiceListing,
  resolveSectionState,
  serviceCategoryCounts,
} from '../lib/sectionExperiences';
import type { ServiceCard } from '../lib/sectionExperiences';
import { canContactOwner } from '../lib/servicesStayRules';
import { useOwnerContact } from '../lib/useOwnerContact';
import { FilterChip, Pagination, SafeImage, SkeletonGrid, StatePanel } from './sectionChrome';
import { HomeTriangleExperience } from './HomeTriangleExperience';
import { NoddyyExperience } from './NoddyyExperience';
import { ServiceBookingPanel } from './ServiceBookingPanel';
import { ServiceOperationsWorkspace } from './ServiceOperationsWorkspace';
import { ServiceCustomerBookings } from './ServiceCustomerBookings';
import { useMarketplace } from '../context/MarketplaceContext';
import { getServicesStyle, saveStylePreference, styleFromHash, type ServicesStyle } from '../lib/sectionStyleSettings';
import { usePublicServiceCatalog } from '../hooks/usePublicServiceCatalog';
import { categoryConfigForListing, serviceCategoryIconEmoji } from '../lib/serviceCatalog';

interface HomeServicesSectionProps {
  listings: MarketplaceListing[];
  isLoading?: boolean;
  initialCategoryId?: string;
  /** Published admin label (live-page config). Falls back to the built-in copy. */
  moduleLabel?: string;
  moduleHeadline?: string;
  onClose: () => void;
  /** Render in the page flow under the common header instead of as a full-screen dialog. */
  inline?: boolean;
  /** Centrally published Style 1/2/3 choice. */
  style?: ServicesStyle;
}

const PRICE_BANDS: Array<{ label: string; value: number }> = [
  { label: 'Under ₹500', value: 500 },
  { label: 'Under ₹1,000', value: 1000 },
  { label: 'Under ₹5,000', value: 5000 },
];

export function HomeServicesSection({ listings, isLoading = false, initialCategoryId, moduleLabel, moduleHeadline, onClose, inline = false, style }: HomeServicesSectionProps) {
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId && initialCategoryId !== 'all' ? initialCategoryId : 'all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [quoteOnly, setQuoteOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ServiceCard | null>(null);
  const [bookingTarget, setBookingTarget] = useState<ServiceCard | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [customerBookingsOpen, setCustomerBookingsOpen] = useState(false);
  const { authUser, supabaseProfile } = useMarketplace();
  const { categories: serviceCatalog } = usePublicServiceCatalog();
  const viewerRole = ((supabaseProfile?.role || authUser?.role || 'customer') as 'customer' | 'provider' | 'admin');
  const canManageJobs = viewerRole === 'provider' || viewerRole === 'admin';
  const [experienceTab, setExperienceTab] = useState<'old' | 'triangle' | 'noddyy'>(() => {
    const routeStyle = styleFromHash('services');
    if (routeStyle === '1' || routeStyle === 'old' || routeStyle === 'services1') return 'old';
    if (routeStyle === '2' || routeStyle === 'triangle' || routeStyle === 'services2') return 'triangle';
    if (routeStyle === '3' || routeStyle === 'noddyy' || routeStyle === 'services3') return 'noddyy';
    if (style) return style;
    return getServicesStyle();
  });

  useEffect(() => {
    const onHash = () => {
      const routeStyle = styleFromHash('services');
      if (routeStyle === '1' || routeStyle === 'old' || routeStyle === 'services1') setExperienceTab('old');
      else if (routeStyle === '2' || routeStyle === 'triangle' || routeStyle === 'services2') setExperienceTab('triangle');
      else if (routeStyle === '3' || routeStyle === 'noddyy' || routeStyle === 'services3') setExperienceTab('noddyy');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Centrally published style changes apply without a reload.
  useEffect(() => {
    if (!style || styleFromHash('services')) return;
    setExperienceTab(style);
  }, [style]);
  const owner = useOwnerContact('services');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(queryInput), 250);
    return () => clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    setPage(0);
  }, [query, categoryId, verifiedOnly, quoteOnly, maxPrice]);

  useEffect(() => {
    if (experienceTab === 'triangle' || experienceTab === 'noddyy') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selected) setSelected(null);
      else if (filtersOpen) setFiltersOpen(false);
      else if (customerBookingsOpen) setCustomerBookingsOpen(false);
      else if (workspaceOpen) setWorkspaceOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, selected, filtersOpen, customerBookingsOpen, workspaceOpen, experienceTab]);

  const cards = useMemo(
    () => listings
      .filter(isServiceListing)
      .filter((listing) => listing.status === 'active')
      .map(parseServiceListing)
      .map((card) => {
        const configured = categoryConfigForListing(serviceCatalog, card.categoryId);
        return configured
          ? {
              ...card,
              categoryName: configured.config.name,
              categoryEmoji: serviceCategoryIconEmoji(configured.config.icon),
            }
          : card;
      }),
    [listings, serviceCatalog],
  );

  const categories = useMemo(() => {
    const known = serviceCategoryCounts(cards);
    const dynamic = serviceCatalog
      .filter((category) => !known.some((entry) => entry.id === category.id))
      .map((category) => ({
        id: category.id,
        name: category.config.name,
        emoji: serviceCategoryIconEmoji(category.config.icon),
        count: cards.filter((card) => card.categoryId === category.id
          || category.config.legacyCategoryIds.includes(card.categoryId)).length,
      }));
    return [...known, ...dynamic];
  }, [cards, serviceCatalog]);
  const filtered = useMemo(
    () => filterServiceListings(cards, { query, categoryId, verifiedOnly, maxPrice, quoteOnly }),
    [cards, query, categoryId, verifiedOnly, maxPrice, quoteOnly],
  );

  const totalPages = pageCount(filtered.length);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const visible = paginate(filtered, safePage);
  const state = resolveSectionState(isLoading, false, filtered.length);
  const activeFilterCount = (categoryId !== 'all' ? 1 : 0) + (verifiedOnly ? 1 : 0) + (quoteOnly ? 1 : 0) + (maxPrice !== null ? 1 : 0);

  const resetFilters = () => {
    setCategoryId('all');
    setVerifiedOnly(false);
    setQuoteOnly(false);
    setMaxPrice(null);
  };

  const openDetails = (card: ServiceCard) => {
    setSelected(card);
    void owner.open(card.id);
  };

  const canCall = selected ? canContactOwner(owner.access, owner.details, owner.isSignedIn, 'call') : false;
  const canWhatsapp = selected ? canContactOwner(owner.access, owner.details, owner.isSignedIn, 'whatsapp') : false;
  const contactNote = !owner.access.enabled
    ? 'Provider contact is unavailable until this service is enabled.'
    : !owner.access.contactOwner
      ? 'Provider contact is disabled for this service right now.'
      : owner.message;

  const switchTo = (tab: 'old' | 'triangle' | 'noddyy') => {
    saveStylePreference('services', tab);
    setExperienceTab(tab);
    window.location.hash = `services/${tab}`;
  };

  return (
    <div
      className={
        inline
          ? 'w-full bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100'
          : 'fixed inset-0 z-[71] flex flex-col overflow-y-auto bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100'
      }
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-labelledby="services-section-title"
    >
      {/* Persistent experience switcher — always visible so the Noddyy
          Helper-On-Demand clone is reachable from every services view. */}
      <div className="flex shrink-0 items-center justify-center border-b border-[#ebebeb] bg-[#f7f7f7] px-4 py-2">
        <div className="inline-flex items-center rounded-full border border-[#dddddd] bg-white p-1 shadow-sm">
          {([
            ['old', 'Style 1'],
            ['triangle', 'Style 2'],
            ['noddyy', 'Style 3'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={experienceTab === value}
              onClick={() => switchTo(value)}
              className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition ${
                experienceTab === value
                  ? 'bg-[#222222] text-white'
                  : 'text-[#717171] hover:bg-[#f7f7f7]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {experienceTab === 'triangle' ? (
        <HomeTriangleExperience
          inline={inline}
          onClose={onClose}
          onSwitchToOld={() => switchTo('old')}
        />
      ) : experienceTab === 'noddyy' ? (
        <NoddyyExperience
          inline={inline}
          onClose={onClose}
          onSwitchToOld={() => switchTo('old')}
        />
      ) : (
        <>
      <header
        className={
          inline
            ? 'border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'
            : 'sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95'
        }
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:border-slate-700 dark:hover:bg-slate-800"
            aria-label="Back to all sections"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-base font-black tracking-tight">
            {inline ? (
              <span className="text-orange-600 dark:text-orange-400">Services</span>
            ) : (
              <>
                BookOurSpace <span className="text-orange-600 dark:text-orange-400">Services</span>
              </>
            )}
          </span>
          <span className="ml-auto hidden rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-orange-800 sm:block dark:bg-orange-950 dark:text-orange-200">
            {moduleLabel || 'Home & local help'}
          </span>
          {canManageJobs && (
            <button
              type="button"
              onClick={() => setWorkspaceOpen(true)}
              className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-violet-300 px-3 text-[11px] font-bold text-violet-800 transition hover:bg-violet-50 sm:ml-0 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950"
            >
              {viewerRole === 'admin' ? 'Service oversight' : 'My service jobs'}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-6">
        <div className="rounded-3xl bg-gradient-to-br from-orange-50 via-amber-50 to-white p-6 sm:p-9 dark:from-orange-950/40 dark:via-amber-950/20 dark:to-slate-950">
          <h1 id="services-section-title" className="text-3xl font-black tracking-tight sm:text-4xl">
            {moduleHeadline || 'Hire a professional for the job at hand.'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Pick a category or search by service and locality. Prices show only where providers listed them; everything else
            asks for a quote from the provider.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className="flex min-h-12 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <label htmlFor="service-search" className="sr-only">Service, provider or locality</label>
              <input
                id="service-search"
                type="search"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Try ‘AC repair’, ‘deep cleaning’ or ‘Madhapur’"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
              />
              {queryInput && (
                <button type="button" onClick={() => setQueryInput('')} aria-label="Clear search" className="rounded-full p-1 text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-300 px-5 text-sm font-bold transition hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:border-slate-700"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
              {activeFilterCount > 0 && <span className="rounded-full bg-orange-600 px-1.5 text-[11px] font-bold text-white">{activeFilterCount}</span>}
            </button>
          </div>
        </div>

        <section className="mt-8" aria-labelledby="service-categories-title">
          <div className="flex items-end justify-between gap-3">
            <h2 id="service-categories-title" className="text-lg font-extrabold">Browse by category</h2>
            {categoryId !== 'all' && (
              <button type="button" onClick={() => setCategoryId('all')} className="text-xs font-semibold underline decoration-slate-400 underline-offset-4 hover:text-orange-700">
                Clear category
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(categoryId === category.id ? 'all' : category.id)}
                aria-pressed={categoryId === category.id}
                disabled={category.count === 0}
                className={`flex min-h-24 flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:opacity-45 ${
                  categoryId === category.id
                    ? 'border-orange-600 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/40'
                    : 'border-slate-200 bg-white hover:border-orange-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <span aria-hidden="true" className="text-xl">{category.emoji}</span>
                <span className="text-xs font-bold leading-4">{category.name}</span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {category.count === 0 ? 'No listings yet' : `${category.count} listing${category.count === 1 ? '' : 's'}`}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-7 flex flex-wrap items-center gap-2">
          {maxPrice !== null && (
            <FilterChip active onClick={() => setMaxPrice(null)} activeClass="bg-orange-600 text-white">
              {PRICE_BANDS.find((band) => band.value === maxPrice)?.label ?? 'Price'}<X className="h-3 w-3" aria-hidden="true" />
            </FilterChip>
          )}
          {verifiedOnly && (
            <FilterChip active onClick={() => setVerifiedOnly(false)} activeClass="bg-orange-600 text-white">
              Verified only<X className="h-3 w-3" aria-hidden="true" />
            </FilterChip>
          )}
          {quoteOnly && (
            <FilterChip active onClick={() => setQuoteOnly(false)} activeClass="bg-orange-600 text-white">
              Quote on request<X className="h-3 w-3" aria-hidden="true" />
            </FilterChip>
          )}
          {activeFilterCount > 0 && (
            <button type="button" onClick={resetFilters} className="text-xs font-semibold underline decoration-slate-400 underline-offset-4 hover:text-orange-700">
              Clear all
            </button>
          )}
        </div>

        {filtersOpen && (
          <section className="mt-4 grid gap-6 rounded-2xl border border-slate-200 p-5 sm:grid-cols-2 dark:border-slate-800" aria-label="Service filters">
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Listed price</h2>
              <div className="flex flex-wrap gap-2">
                {PRICE_BANDS.map((band) => (
                  <FilterChip key={band.value} active={maxPrice === band.value} onClick={() => setMaxPrice(maxPrice === band.value ? null : band.value)} activeClass="bg-orange-600 text-white">
                    {band.label}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Provider</h2>
              <div className="flex flex-wrap gap-2">
                <FilterChip active={verifiedOnly} onClick={() => setVerifiedOnly(!verifiedOnly)} activeClass="bg-orange-600 text-white">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified providers
                </FilterChip>
                <FilterChip active={quoteOnly} onClick={() => setQuoteOnly(!quoteOnly)} activeClass="bg-orange-600 text-white">
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> Quote on request
                </FilterChip>
              </div>
            </div>
          </section>
        )}

        <div className="mt-8 flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300" role="status" aria-live="polite">
            {state === 'results'
              ? `${filtered.length} service${filtered.length === 1 ? '' : 's'} available`
              : state === 'loading'
                ? 'Loading services…'
                : 'No services to show'}
          </p>
          {totalPages > 1 && <p className="text-xs text-slate-500">Page {safePage + 1} of {totalPages}</p>}
        </div>

        <div className="mt-4">
          {state === 'loading' && <SkeletonGrid count={6} heightClass="aspect-[4/3]" />}
          {state === 'empty' && (
            <StatePanel
              title="No services match these filters"
              message={cards.length === 0 ? 'No home-service listings are published in this marketplace yet.' : 'Try another category, a wider price band, or clear the verified filter.'}
              actionLabel={cards.length > 0 ? 'Clear filters' : undefined}
              onAction={cards.length > 0 ? resetFilters : undefined}
            />
          )}
          {state === 'results' && (
            <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((card) => (
                <article key={card.id}>
                  <button
                    type="button"
                    onClick={() => openDetails(card)}
                    className="block w-full rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
                    aria-label={`View details for ${card.title}`}
                  >
                    <div className="relative">
                      <SafeImage category="services" src={card.photo} alt={card.title} className="aspect-[4/3] rounded-2xl" />
                      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-orange-800 shadow-sm">
                        {card.categoryEmoji} {card.categoryName}
                      </span>
                      {card.verified && (
                        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-slate-900/85 px-2.5 py-1 text-[11px] font-bold text-white">
                          <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Verified
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 text-sm font-bold leading-5">{card.title}</h2>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {[card.locality, card.city].filter(Boolean).join(', ') || 'Service area not listed'}
                    </p>
                    <p className="mt-2 text-sm font-extrabold">{card.priceLabel}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="truncate">{card.providerName || 'Provider details not listed'}</span>
                      {card.rating !== null && (
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                          {card.rating.toFixed(1)} ({card.reviewCount})
                        </span>
                      )}
                    </div>
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} tone="orange" />

        <section className="mt-14 grid gap-3 border-t border-slate-200 pt-8 sm:grid-cols-3 dark:border-slate-800" aria-label="How BookOurSpace handles services">
          {[
            ['Listed by providers', 'Prices, scope and service areas come from the provider’s own listing.'],
            ['Contact stays gated', 'Owner contact opens only for signed-in customers when the service allows it.'],
            ['Online booking is off', 'Payment and checkout stay disabled until the booking workflow is verified.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Check className="h-4 w-4 text-orange-600" aria-hidden="true" /> {title}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{body}</p>
            </div>
          ))}
        </section>
      </main>

      {selected && (
        <div className="fixed inset-0 z-[72] overflow-y-auto bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="service-detail-title">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mx-auto flex max-w-4xl items-center gap-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="All services"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-semibold transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All services
              </button>
              <span className="ml-auto text-xs font-semibold text-slate-500">{selected.photoCount} photo{selected.photoCount === 1 ? '' : 's'}</span>
            </div>
          </header>

          <div className="mx-auto max-w-4xl px-4 pb-20 pt-6">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <SafeImage category="services" src={selected.photos[0] ?? null} alt={selected.title} className="aspect-[16/10] rounded-2xl" />
              <div className="grid gap-2 sm:grid-rows-2">
                {[1, 2].map((index) => (
                  <SafeImage
                    key={index}
                    category="services"
                    src={selected.photos[index] ?? null}
                    alt={selected.photos[index] ? `${selected.title} photo ${index + 1}` : 'No additional photo'}
                    className="aspect-[16/10] rounded-2xl sm:aspect-auto"
                  />
                ))}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700 dark:text-orange-300">
                  {selected.categoryEmoji} {selected.categoryName}
                </p>
                <h1 id="service-detail-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{selected.title}</h1>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {[selected.locality, selected.city].filter(Boolean).join(', ') || 'Service area not listed'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black">{selected.priceLabel}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{selected.quoteOnly ? 'Provider quotes this job' : 'Listed by the provider'}</p>
              </div>
            </div>

            <section className="mt-6 border-t border-slate-200 py-6 dark:border-slate-800">
              <h2 className="mb-2 text-base font-extrabold">Scope of work</h2>
              <p className="whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-300">{selected.description || 'The provider has not added a description yet.'}</p>
            </section>

            {selected.highlights.length > 0 && (
              <section className="border-t border-slate-200 py-6 dark:border-slate-800">
                <h2 className="mb-3 text-base font-extrabold">Listed details</h2>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {selected.highlights.map((row) => (
                    <div key={row.label} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                      <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{row.label}</dt>
                      <dd className="mt-1 text-sm leading-6">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section className="border-t border-slate-200 py-6 dark:border-slate-800">
              <h2 className="mb-2 text-base font-extrabold">Provider</h2>
              <p className="text-sm font-semibold">{selected.providerName || 'Provider details not listed'}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                {selected.verified && (
                  <span className="inline-flex items-center gap-1 font-bold text-orange-700 dark:text-orange-300">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified provider
                  </span>
                )}
                {selected.rating !== null ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
                    {selected.rating.toFixed(1)} from {selected.reviewCount} reviews
                  </span>
                ) : (
                  <span>No reviews recorded yet</span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void owner.contact('call')}
                  disabled={!canCall || owner.busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" /> {selected.quoteOnly ? 'Request a quote' : 'Call provider'}
                </button>
                <button
                  type="button"
                  onClick={() => void owner.contact('whatsapp')}
                  disabled={!canWhatsapp || owner.busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-orange-600 px-5 text-sm font-bold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 dark:text-orange-300 dark:hover:bg-orange-950"
                >
                  Message on WhatsApp
                </button>
              </div>
              {(owner.state === 'loading' || contactNote) && (
                <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400" role="status">
                  {owner.state === 'loading' ? 'Checking provider contact permissions…' : contactNote}
                </p>
              )}
              {viewerRole === 'customer' ? (
                <button
                  type="button"
                  onClick={() => setBookingTarget(selected)}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-violet-700 px-5 text-sm font-extrabold text-white shadow-lg shadow-violet-900/20 transition hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                >
                  Book this service
                </button>
              ) : (
                <p className="mt-4 rounded-2xl border border-slate-200 p-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  {viewerRole === 'provider'
                    ? 'This is a provider listing. Open My service jobs to manage assigned bookings; customer booking is not offered on your own listing.'
                    : 'Administrators manage service bookings and payment verification in Service oversight.'}
                </p>
              )}
              <p className="mt-3 rounded-2xl border border-slate-200 p-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Bookings are requested first and must be accepted by the provider. Cash or UPI paid after the service is recorded
                as a claim and only counts as settled after administrator verification.
              </p>
            </section>
          </div>
        </div>
      )}

      {bookingTarget && (
        <ServiceBookingPanel
          listing={{ id: bookingTarget.id, title: bookingTarget.title, providerName: bookingTarget.providerName }}
          categoryConfig={categoryConfigForListing(serviceCatalog, bookingTarget.categoryId)}
          onClose={() => setBookingTarget(null)}
        />
      )}

      {workspaceOpen && (
        <ServiceOperationsWorkspace
          role={viewerRole === 'admin' ? 'admin' : 'provider'}
          onClose={() => setWorkspaceOpen(false)}
        />
      )}

      {viewerRole === 'customer' && !customerBookingsOpen && (
        <button
          type="button"
          onClick={() => setCustomerBookingsOpen(true)}
          className="fixed bottom-4 right-4 z-[70] inline-flex min-h-12 items-center gap-2 rounded-full bg-violet-700 px-5 text-sm font-bold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-800"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          My service bookings
        </button>
      )}

      {customerBookingsOpen && (
        <ServiceCustomerBookings onClose={() => setCustomerBookingsOpen(false)} />
      )}
        </>
      )}
    </div>
  );
}
