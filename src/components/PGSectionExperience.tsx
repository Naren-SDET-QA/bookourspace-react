import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import type { MarketplaceListing } from '../types/marketplace';
import {
  filterPgListings,
  formatInr,
  isPgListing,
  pageCount,
  paginate,
  parsePgListing,
  pgGenderLabel,
  resolveSectionState,
  SECTION_PAGE_SIZE,
} from '../lib/sectionExperiences';
import type { PgCard, PgGenderFilter, PgSharingFilter } from '../lib/sectionExperiences';
import { canContactOwner } from '../lib/servicesStayRules';
import { useOwnerContact } from '../lib/useOwnerContact';
import { FilterChip, Pagination, SafeImage, SkeletonGrid, StatePanel } from './sectionChrome';

interface PGSectionExperienceProps {
  listings: MarketplaceListing[];
  isLoading?: boolean;
  /** Published admin label (live-page config). Falls back to the built-in copy. */
  moduleLabel?: string;
  moduleHeadline?: string;
  onClose: () => void;
}

const GENDER_TABS: Array<{ value: PgGenderFilter; label: string }> = [
  { value: 'all', label: 'All PGs' },
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
  { value: 'co-living', label: 'Co-living' },
];

const RENT_BANDS: Array<{ label: string; value: number }> = [
  { label: 'Under ₹5,000', value: 5000 },
  { label: 'Under ₹8,000', value: 8000 },
  { label: 'Under ₹12,000', value: 12000 },
];

const SHARING_OPTIONS: Array<{ value: PgSharingFilter; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: '2', label: '2-sharing' },
  { value: '3', label: '3-sharing' },
  { value: '4', label: '4-sharing' },
];

function DetailList({ title, rows }: { title: string; rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) return null;
  return (
    <section className="border-t border-slate-200 py-6 dark:border-slate-800">
      <h3 className="mb-3 text-base font-extrabold">{title}</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{row.label}</dt>
            <dd className="mt-1 text-sm leading-6">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PGSectionExperience({ listings, isLoading = false, moduleLabel, moduleHeadline, onClose }: PGSectionExperienceProps) {
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [gender, setGender] = useState<PgGenderFilter>('all');
  const [sharing, setSharing] = useState<PgSharingFilter>('all');
  const [maxRent, setMaxRent] = useState<number | null>(null);
  const [foodOnly, setFoodOnly] = useState(false);
  const [attachedBathOnly, setAttachedBathOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<PgCard | null>(null);
  const owner = useOwnerContact('pg');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(queryInput), 250);
    return () => clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    setPage(0);
  }, [query, gender, sharing, maxRent, foodOnly, attachedBathOnly]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selected) setSelected(null);
      else if (filtersOpen) setFiltersOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, selected, filtersOpen]);

  const cards = useMemo(
    () => listings.filter(isPgListing).filter((listing) => listing.status === 'active').map(parsePgListing),
    [listings],
  );

  const filtered = useMemo(
    () => filterPgListings(cards, { query, gender, sharing, maxRent, foodOnly, attachedBathOnly }),
    [cards, query, gender, sharing, maxRent, foodOnly, attachedBathOnly],
  );

  const totalPages = pageCount(filtered.length);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const visible = paginate(filtered, safePage);
  const state = resolveSectionState(isLoading, false, filtered.length);
  const activeFilterCount =
    (sharing !== 'all' ? 1 : 0) + (maxRent !== null ? 1 : 0) + (foodOnly ? 1 : 0) + (attachedBathOnly ? 1 : 0);

  const resetFilters = () => {
    setSharing('all');
    setMaxRent(null);
    setFoodOnly(false);
    setAttachedBathOnly(false);
  };

  const openDetails = (card: PgCard) => {
    setSelected(card);
    void owner.open(card.id);
  };

  const canCall = selected ? canContactOwner(owner.access, owner.details, owner.isSignedIn, 'call') : false;
  const canWhatsapp = selected ? canContactOwner(owner.access, owner.details, owner.isSignedIn, 'whatsapp') : false;
  const contactNote = !owner.access.enabled
    ? 'Owner contact is unavailable until this service is enabled.'
    : !owner.access.contactOwner
      ? 'Owner contact is disabled for this service right now.'
      : owner.message;

  return (
    <div className="fixed inset-0 z-[71] flex flex-col overflow-y-auto bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="pg-section-title">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700 dark:hover:bg-slate-800"
            aria-label="Back to marketplace"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-lg font-black tracking-tight">
            BookOurSpace <span className="text-teal-700 dark:text-teal-400">PGs</span>
          </span>
          <span className="ml-auto hidden rounded-full bg-teal-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800 sm:block dark:bg-teal-950 dark:text-teal-200">
            {moduleLabel || 'Owner-listed accommodation'}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-6">
        <div className="rounded-3xl bg-gradient-to-br from-teal-50 via-emerald-50 to-white p-6 sm:p-9 dark:from-teal-950/40 dark:via-emerald-950/30 dark:to-slate-950">
          <h1 id="pg-section-title" className="text-3xl font-black tracking-tight sm:text-4xl">
            {moduleHeadline || 'Find a PG that fits your month.'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Search by locality, then filter by rent, sharing and food. Every card shows only what the owner listed — no
            brokerage claims, no invented ratings.
          </p>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="pg-search" className="sr-only">
                Locality, city or PG name
              </label>
              <div className="flex min-h-12 flex-1 items-center gap-2 px-3">
                <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  id="pg-search"
                  type="search"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  placeholder="Try ‘Madhapur’, ‘KPHB’ or a PG name"
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                />
                {queryInput && (
                  <button type="button" onClick={() => setQueryInput('')} aria-label="Clear search" className="rounded-full p-1 text-slate-400 hover:text-slate-700">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="PG gender">
                {GENDER_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={gender === tab.value}
                    onClick={() => setGender(tab.value)}
                    className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                      gender === tab.value ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-950 dark:text-teal-300' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300 px-4 text-sm font-semibold transition hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
            {activeFilterCount > 0 && <span className="rounded-full bg-teal-700 px-1.5 text-[11px] font-bold text-white">{activeFilterCount}</span>}
          </button>
          {maxRent !== null && <FilterChip active onClick={() => setMaxRent(null)} activeClass="bg-teal-700 text-white">{RENT_BANDS.find((band) => band.value === maxRent)?.label ?? 'Rent'}<X className="h-3 w-3" aria-hidden="true" /></FilterChip>}
          {foodOnly && <FilterChip active onClick={() => setFoodOnly(false)} activeClass="bg-teal-700 text-white">Food included<X className="h-3 w-3" aria-hidden="true" /></FilterChip>}
          {attachedBathOnly && <FilterChip active onClick={() => setAttachedBathOnly(false)} activeClass="bg-teal-700 text-white">Attached bath<X className="h-3 w-3" aria-hidden="true" /></FilterChip>}
          {sharing !== 'all' && <FilterChip active onClick={() => setSharing('all')} activeClass="bg-teal-700 text-white">{SHARING_OPTIONS.find((option) => option.value === sharing)?.label}<X className="h-3 w-3" aria-hidden="true" /></FilterChip>}
          {activeFilterCount > 0 && (
            <button type="button" onClick={resetFilters} className="text-xs font-semibold underline decoration-slate-400 underline-offset-4 hover:text-teal-700">
              Clear all
            </button>
          )}
        </div>

        {filtersOpen && (
          <section className="mt-4 grid gap-6 rounded-2xl border border-slate-200 p-5 sm:grid-cols-2 dark:border-slate-800" aria-label="PG filters">
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Monthly rent</h2>
              <div className="flex flex-wrap gap-2">
                {RENT_BANDS.map((band) => (
                  <FilterChip key={band.value} active={maxRent === band.value} onClick={() => setMaxRent(maxRent === band.value ? null : band.value)} activeClass="bg-teal-700 text-white">
                    {band.label}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Sharing type</h2>
              <div className="flex flex-wrap gap-2">
                {SHARING_OPTIONS.map((option) => (
                  <FilterChip key={option.value} active={sharing === option.value} onClick={() => setSharing(sharing === option.value ? 'all' : option.value)} activeClass="bg-teal-700 text-white">
                    {option.label}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Facilities</h2>
              <div className="flex flex-wrap gap-2">
                <FilterChip active={foodOnly} onClick={() => setFoodOnly(!foodOnly)} activeClass="bg-teal-700 text-white">
                  <Utensils className="h-3.5 w-3.5" aria-hidden="true" /> Food included
                </FilterChip>
                <FilterChip active={attachedBathOnly} onClick={() => setAttachedBathOnly(!attachedBathOnly)} activeClass="bg-teal-700 text-white">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Attached bathroom
                </FilterChip>
              </div>
            </div>
            <div className="flex items-end">
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                Food and bathroom filters use the owner’s own listed details. Listings without that information stay out
                of the filtered results.
              </p>
            </div>
          </section>
        )}

        <div className="mt-8 flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300" role="status" aria-live="polite">
            {state === 'results' ? `${filtered.length} PG${filtered.length === 1 ? '' : 's'} match your filters` : state === 'loading' ? 'Loading PGs…' : 'No PGs to show'}
          </p>
          {totalPages > 1 && <p className="text-xs text-slate-500">Page {safePage + 1} of {totalPages}</p>}
        </div>

        <div className="mt-4">
          {state === 'loading' && <SkeletonGrid count={6} heightClass="aspect-[4/3]" />}
          {state === 'empty' && (
            <StatePanel
              title="No PGs match these filters"
              message={cards.length === 0 ? 'No PG listings are published in this marketplace yet.' : 'Try a wider rent band, another sharing type, or a different locality.'}
              actionLabel={cards.length > 0 ? 'Clear filters' : undefined}
              onAction={cards.length > 0 ? resetFilters : undefined}
            />
          )}
          {state === 'results' && (
            <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((card) => (
                <article key={card.id} className="group">
                  <button
                    type="button"
                    onClick={() => openDetails(card)}
                    className="block w-full rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
                    aria-label={`View details for ${card.title}`}
                  >
                    <div className="relative">
                      <SafeImage src={card.photo} alt={card.title} className="aspect-[4/3] rounded-2xl" />
                      {card.verified && (
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-teal-800 shadow-sm">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verified
                        </span>
                      )}
                      {card.bedsAvailable !== null && card.bedsAvailable > 0 && (
                        <span className="absolute right-3 top-3 rounded-full bg-slate-900/85 px-2.5 py-1 text-[11px] font-bold text-white">
                          {card.bedsAvailable} bed{card.bedsAvailable === 1 ? '' : 's'} listed free
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <h2 className="text-sm font-bold leading-5">{card.title}</h2>
                      <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-200">
                        {pgGenderLabel(card.gender)}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {[card.locality, card.city].filter(Boolean).join(', ') || 'Location not provided'}
                    </p>
                    <p className="mt-2 text-sm">
                      <span className="font-extrabold">{formatInr(card.rentRupees) ?? 'Rent on request'}</span>
                      {card.rentRupees !== null && <span className="text-slate-500 dark:text-slate-400">{card.rentUnit}</span>}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{card.subcategory}</p>
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} tone="emerald" />
      </main>

      {selected && (
        <div className="fixed inset-0 z-[72] overflow-y-auto bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="pg-detail-title">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mx-auto flex max-w-4xl items-center gap-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 px-4 text-sm font-semibold transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All PGs
              </button>
              <span className="ml-auto text-xs font-semibold text-slate-500">{selected.photoCount} photo{selected.photoCount === 1 ? '' : 's'}</span>
            </div>
          </header>

          <div className="mx-auto max-w-4xl px-4 pb-20 pt-6">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <SafeImage src={selected.photos[0] ?? null} alt={selected.title} className="aspect-[16/10] rounded-2xl" />
              <div className="grid gap-2 sm:grid-rows-2">
                {[1, 2].map((index) => (
                  <SafeImage
                    key={index}
                    src={selected.photos[index] ?? null}
                    alt={selected.photos[index] ? `${selected.title} photo ${index + 1}` : 'No additional photo'}
                    className="aspect-[16/10] rounded-2xl sm:aspect-auto"
                  />
                ))}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 id="pg-detail-title" className="text-2xl font-black tracking-tight sm:text-3xl">{selected.title}</h1>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {[selected.locality, selected.city].filter(Boolean).join(', ') || 'Location not provided'}
                  <span aria-hidden="true">·</span>
                  {selected.subcategory}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black">{formatInr(selected.rentRupees) ?? 'Rent on request'}</p>
                {selected.rentRupees !== null && <p className="text-xs text-slate-500 dark:text-slate-400">per month</p>}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-200">
                {pgGenderLabel(selected.gender)} only{selected.gender === 'co-living' ? '' : ''}
              </span>
              {selected.genderPolicy && (
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">{selected.genderPolicy}</span>
              )}
              {selected.verified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 px-3 py-1 text-xs font-bold text-teal-800 dark:border-teal-800 dark:text-teal-200">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verified listing
                </span>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Rent & deposit</p>
                <p className="mt-1 text-sm font-semibold">{formatInr(selected.rentRupees) ?? 'Rent on request'}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{selected.deposit ?? 'Security deposit not listed'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Sharing</p>
                <p className="mt-1 text-sm">{selected.sharingText || 'Sharing options not listed'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Beds</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  {selected.bedsAvailable !== null ? `${selected.bedsAvailable} listed free by the owner` : 'Availability not listed'}
                </p>
              </div>
            </div>

            <section className="border-t border-slate-200 py-6 dark:border-slate-800">
              <h2 className="mb-2 text-base font-extrabold">About this PG</h2>
              <p className="whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-300">{selected.description || 'The owner has not added a description yet.'}</p>
            </section>

            <DetailList title="Facilities" rows={selected.facilities} />
            <DetailList title="House rules" rows={selected.rules} />

            <section className="border-t border-slate-200 py-6 dark:border-slate-800">
              <h2 className="mb-2 text-base font-extrabold">Owner</h2>
              <p className="text-sm font-semibold">{selected.providerName || 'Owner details not listed'}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Phone numbers are shared only through BookOurSpace’s authorised contact flow, never in the listing.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void owner.contact('call')}
                  disabled={!canCall || owner.busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-700 px-5 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" /> Call owner
                </button>
                <button
                  type="button"
                  onClick={() => void owner.contact('whatsapp')}
                  disabled={!canWhatsapp || owner.busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-teal-700 px-5 text-sm font-bold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 dark:text-teal-300 dark:hover:bg-teal-950"
                >
                  WhatsApp owner
                </button>
              </div>
              {(owner.state === 'loading' || contactNote) && (
                <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400" role="status">
                  {owner.state === 'loading' ? 'Checking owner contact permissions…' : contactNote}
                </p>
              )}
              <p className="mt-4 rounded-2xl border border-slate-200 p-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Online booking is not enabled for PGs. Rent, deposit and move-in dates are agreed directly with the owner —
                BookOurSpace does not take payments here.
              </p>
            </section>

            <div className="flex flex-wrap gap-2">
              {selected.facilities.map((facility) => (
                <span key={facility.label} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <Check className="h-3 w-3 text-teal-700" aria-hidden="true" /> {facility.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
