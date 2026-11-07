import React, { useEffect, useMemo, useState } from 'react';
import {
  Accessibility,
  Check,
  Globe2,
  Home,
  Languages,
  Minus,
  Plus,
  Sparkles,
  Star,
  Wallet,
  Wifi,
  X,
} from 'lucide-react';
import {
  ACCESSIBILITY_OPTIONS,
  AMENITY_OPTIONS,
  LANGUAGE_OPTIONS,
  PLACE_TYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  activeFilterCount,
  clearStayFilters,
  toSearchParams,
  type StayFilters,
} from '../../lib/stayFilters';
import { searchStays } from '../../lib/staySearchClient';

const SECTIONS = [
  { id: 'recommended', label: 'Recommended', icon: Sparkles },
  { id: 'place', label: 'Place type', icon: Home },
  { id: 'price', label: 'Price', icon: Wallet },
  { id: 'rooms', label: 'Rooms and beds', icon: Home },
  { id: 'amenities', label: 'Amenities', icon: Wifi },
  { id: 'booking', label: 'Booking options', icon: Check },
  { id: 'standout', label: 'Standout', icon: Star },
  { id: 'property', label: 'Property type', icon: Home },
  { id: 'accessibility', label: 'Accessibility', icon: Accessibility },
  { id: 'languages', label: 'Host language', icon: Languages },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 border-b border-[#ebebeb] py-4 text-left last:border-b-0 dark:border-slate-800"
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-[#717171] dark:text-slate-400">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-[#f97316]' : 'bg-[#b0b0b0]'}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

function Counter({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#ebebeb] py-4 last:border-b-0 dark:border-slate-800">
      <div>
        <p className="text-[15px] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-sm text-[#717171] dark:text-slate-400">{hint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={`Decrease ${label}`}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#b0b0b0] text-[#717171] transition hover:border-[#222222] disabled:opacity-30 dark:border-slate-600"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <span aria-live="polite" className="w-10 text-center text-[15px] font-semibold">{value === 0 ? 'Any' : `${value}+`}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(20, value + 1))}
          aria-label={`Increase ${label}`}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#b0b0b0] text-[#717171] transition hover:border-[#222222] dark:border-slate-600"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${
        active
          ? 'border-[#222222] bg-[#f7f7f7] dark:border-white dark:bg-slate-800'
          : 'border-[#dddddd] text-[#222222] hover:border-[#222222] dark:border-slate-600 dark:text-slate-200'
      }`}
    >
      {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </button>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-xs font-semibold text-[#717171] dark:text-slate-400">{label}</span>
      <div className="flex h-12 items-center overflow-hidden rounded-xl border border-[#b0b0b0] focus-within:border-[#222222] dark:border-slate-600">
        <span aria-hidden="true" className="pl-3 text-[#717171]">₹</span>
        <input
          id={id}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ''))}
          placeholder={placeholder}
          className="h-full w-full bg-transparent px-2 text-[15px] outline-none dark:text-slate-100"
        />
      </div>
    </label>
  );
}

export function StayFilterDrawer({
  open,
  filters,
  onApply,
  onClose,
}: {
  open: boolean;
  filters: StayFilters;
  onApply: (next: StayFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<StayFilters>(filters);
  const [section, setSection] = useState<SectionId>('recommended');
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const [draftTotal, setDraftTotal] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [countFailed, setCountFailed] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(filters);
      setDraftTotal(null);
      setCountFailed(false);
    }
  }, [open, filters]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const draftKey = useMemo(() => toSearchParams(draft).toString(), [draft]);
  const priceError = useMemo(() => {
    const min = draft.minPrice ? Number(draft.minPrice) : null;
    const max = draft.maxPrice ? Number(draft.maxPrice) : null;
    if (min !== null && max !== null && min > max) return 'The minimum price cannot exceed the maximum price.';
    return '';
  }, [draft.minPrice, draft.maxPrice]);

  useEffect(() => {
    if (!open || priceError) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCounting(true);
      setCountFailed(false);
      const result = await searchStays(draft, { pageSize: 1, signal: controller.signal });
      if (controller.signal.aborted) return;
      setCounting(false);
      if (result.ok) setDraftTotal(result.total);
      else {
        setDraftTotal(null);
        if (result.error !== 'ABORTED') setCountFailed(true);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // draftKey is the canonical, order-stable form of every filter above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftKey, priceError]);

  const count = activeFilterCount(draft);
  const toggle = <K extends keyof StayFilters>(key: K, value: StayFilters[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const toggleInArray = (key: 'amenities' | 'accessibility' | 'languages' | 'propertyTypes', value: string) =>
    setDraft((current) => {
      const list = current[key];
      return {
        ...current,
        [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
      };
    });

  const togglePlaceType = (value: StayFilters['placeTypes'][number]) =>
    setDraft((current) => ({
      ...current,
      placeTypes: current.placeTypes.includes(value)
        ? current.placeTypes.filter((item) => item !== value)
        : [...current.placeTypes, value],
    }));

  if (!open) return null;

  const amenities = showAllAmenities ? AMENITY_OPTIONS : AMENITY_OPTIONS.slice(0, 10);
  const languages = showAllLanguages ? LANGUAGE_OPTIONS : LANGUAGE_OPTIONS.slice(0, 8);

  const heading = SECTIONS.find((entry) => entry.id === section)?.label || 'Filters';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stay-filter-heading"
        className="flex h-[94vh] w-full max-w-[980px] flex-col overflow-hidden rounded-t-2xl bg-white text-[#222222] shadow-2xl sm:h-[86vh] sm:rounded-2xl dark:bg-slate-950 dark:text-slate-100"
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#ebebeb] px-4 sm:px-6 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[#f7f7f7] dark:hover:bg-slate-800"
            aria-label="Close filters"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <h2 id="stay-filter-heading" className="text-base font-semibold">Filters</h2>
          <div className="w-10" />
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav aria-label="Filter sections" className="shrink-0 border-b border-[#ebebeb] px-2 py-2 sm:w-60 sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-4 sm:py-5 dark:border-slate-800">
            <ul className="flex gap-1 overflow-x-auto sm:block sm:space-y-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SECTIONS.map((entry) => {
                const Icon = entry.icon;
                const active = section === entry.id;
                return (
                  <li key={entry.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSection(entry.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition sm:w-full ${
                        active ? 'bg-[#f7f7f7] font-semibold dark:bg-slate-800' : 'hover:bg-[#f7f7f7] dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {entry.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
            <h3 className="text-[20px] font-semibold">{heading}</h3>

            {section === 'recommended' && (
              <div className="mt-4">
                <p className="text-sm text-[#717171] dark:text-slate-400">The amenities guests ask for most.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { id: 'kitchen', label: 'Kitchen' },
                    { id: 'wifi', label: 'Wi-Fi' },
                    { id: 'parking', label: 'Free parking' },
                    { id: 'petsAllowed', label: 'Pets allowed' },
                    { id: 'airconditioning', label: 'AC' },
                    { id: 'washer', label: 'Washing machine' },
                  ].map((entry) => (
                    entry.id === 'petsAllowed' ? (
                      <Chip
                        key={entry.id}
                        label={entry.label}
                        active={draft.petsAllowed}
                        onClick={() => toggle('petsAllowed', !draft.petsAllowed)}
                      />
                    ) : (
                      <Chip
                        key={entry.id}
                        label={entry.label}
                        active={draft.amenities.includes(entry.id)}
                        onClick={() => toggleInArray('amenities', entry.id)}
                      />
                    )
                  ))}
                  <Chip
                    label="1+ bathrooms"
                    active={draft.bathrooms >= 1}
                    onClick={() => toggle('bathrooms', draft.bathrooms >= 1 ? 0 : 1)}
                  />
                </div>
                <div className="mt-8 rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-[#f97316]" aria-hidden="true" /> Guest favourites</p>
                  <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Stays rated highly by guests and reviewed by the BookOurSpace team.</p>
                  <div className="mt-3">
                    <Chip
                      label="Guest favourite"
                      active={draft.guestFavourite}
                      onClick={() => toggle('guestFavourite', !draft.guestFavourite)}
                    />
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Star className="h-4 w-4 text-[#f97316]" aria-hidden="true" /> Luxe</p>
                  <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Only stays whose host has completed Luxe verification appear here.</p>
                  <div className="mt-3">
                    <Chip
                      label="Luxe"
                      active={draft.luxeVerified}
                      onClick={() => toggle('luxeVerified', !draft.luxeVerified)}
                    />
                  </div>
                </div>
              </div>
            )}

            {section === 'place' && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-[#717171] dark:text-slate-400">Search rooms, an entire home, or any type of place.</p>
                {[{ id: 'any', label: 'Any type', description: 'Rooms and entire homes' }, ...PLACE_TYPE_OPTIONS.map((option) => ({ id: option.id, label: option.label, description: option.description }))].map((option) => {
                  const active = option.id === 'any' ? draft.placeTypes.length === 0 : draft.placeTypes.includes(option.id as StayFilters['placeTypes'][number]);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        if (option.id === 'any') toggle('placeTypes', []);
                        else togglePlaceType(option.id as StayFilters['placeTypes'][number]);
                      }}
                      aria-pressed={active}
                      className={`flex w-full items-start justify-between gap-4 rounded-xl border p-4 text-left transition ${active ? 'border-[#222222] dark:border-white' : 'border-[#dddddd] hover:border-[#222222] dark:border-slate-700'}`}
                    >
                      <span>
                        <span className="block text-[15px] font-medium">{option.label}</span>
                        <span className="mt-0.5 block text-sm text-[#717171] dark:text-slate-400">{option.description}</span>
                      </span>
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${active ? 'border-[#222222] bg-[#222222] text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-[#b0b0b0]'}`}>
                        {active && <Check className="h-4 w-4" aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {section === 'price' && (
              <div className="mt-4">
                <p className="text-sm text-[#717171] dark:text-slate-400">Filter by what you pay per night, or by the total for the whole trip. Taxes and fees are shown at checkout.</p>
                <div className="mt-4 inline-flex rounded-full border border-[#dddddd] p-1 dark:border-slate-700">
                  {(['nightly', 'total'] as const).map((basis) => (
                    <button
                      key={basis}
                      type="button"
                      onClick={() => toggle('priceBasis', basis)}
                      aria-pressed={draft.priceBasis === basis}
                      className={`h-9 rounded-full px-4 text-sm font-semibold transition ${draft.priceBasis === basis ? 'bg-[#222222] text-white dark:bg-white dark:text-slate-900' : 'text-[#717171]'}`}
                    >
                      {basis === 'nightly' ? 'Nightly price' : 'Trip total'}
                    </button>
                  ))}
                </div>
                <div className="mt-5 flex items-start gap-3">
                  <NumberField id="stay-filter-min-price" label="Minimum" value={draft.minPrice} onChange={(next) => toggle('minPrice', next)} placeholder="0" />
                  <span aria-hidden="true" className="pt-7 text-[#717171]">–</span>
                  <NumberField id="stay-filter-max-price" label="Maximum" value={draft.maxPrice} onChange={(next) => toggle('maxPrice', next)} placeholder="Any" />
                </div>
                {priceError && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{priceError}</p>}
                {draft.priceBasis === 'total' && !draft.checkIn && (
                  <p className="mt-3 text-sm text-[#717171] dark:text-slate-400">Add dates to use the trip total. Until then the nightly price is used.</p>
                )}
              </div>
            )}

            {section === 'rooms' && (
              <div className="mt-4">
                <p className="text-sm text-[#717171] dark:text-slate-400">Only stays with at least this many bedrooms, beds and bathrooms.</p>
                <div className="mt-2">
                  <Counter label="Bedrooms" value={draft.bedrooms} onChange={(next) => toggle('bedrooms', next)} />
                  <Counter label="Beds" value={draft.beds} onChange={(next) => toggle('beds', next)} />
                  <Counter label="Bathrooms" value={draft.bathrooms} onChange={(next) => toggle('bathrooms', next)} />
                </div>
              </div>
            )}

            {section === 'amenities' && (
              <div className="mt-4">
                <p className="text-sm text-[#717171] dark:text-slate-400">Every selected amenity must be available at the property or in the room.</p>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {amenities.map((amenity) => {
                    const active = draft.amenities.includes(amenity.id);
                    return (
                      <button
                        key={amenity.id}
                        type="button"
                        onClick={() => toggleInArray('amenities', amenity.id)}
                        aria-pressed={active}
                        className={`flex min-h-[48px] items-center justify-between gap-3 rounded-xl border px-4 text-left text-sm font-medium transition ${active ? 'border-[#222222] bg-[#f7f7f7] dark:border-white dark:bg-slate-800' : 'border-[#dddddd] hover:border-[#222222] dark:border-slate-700'}`}
                      >
                        {amenity.label}
                        {active && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllAmenities((value) => !value)}
                  className="mt-4 text-sm font-semibold underline underline-offset-2"
                >
                  {showAllAmenities ? 'Show fewer amenities' : `Show all ${AMENITY_OPTIONS.length} amenities`}
                </button>
              </div>
            )}

            {section === 'booking' && (
              <div className="mt-4">
                <Switch checked={draft.instantBook} onChange={(next) => toggle('instantBook', next)} label="Instant Book" description="Book without waiting for host approval." />
                <Switch checked={draft.selfCheckIn} onChange={(next) => toggle('selfCheckIn', next)} label="Self check-in" description="Check yourself in with a lockbox or keypad." />
                <Switch checked={draft.petsAllowed} onChange={(next) => toggle('petsAllowed', next)} label="Pets allowed" description="Hosts who welcome assistance animals are always shown." />
              </div>
            )}

            {section === 'standout' && (
              <div className="mt-4">
                <Switch checked={draft.guestFavourite} onChange={(next) => toggle('guestFavourite', next)} label="Guest favourite" description="The most loved stays, based on ratings and reviews." />
                <Switch checked={draft.luxeVerified} onChange={(next) => toggle('luxeVerified', next)} label="Luxe" description="Verified Luxe homes with premium design and service." />
              </div>
            )}

            {section === 'property' && (
              <div className="mt-4">
                <p className="text-sm text-[#717171] dark:text-slate-400">Choose one or more property types.</p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PROPERTY_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleInArray('propertyTypes', option.id)}
                      aria-pressed={draft.propertyTypes.includes(option.id)}
                      className={`flex min-h-[48px] items-center justify-between gap-2 rounded-xl border px-4 text-left text-sm font-medium transition ${draft.propertyTypes.includes(option.id) ? 'border-[#222222] bg-[#f7f7f7] dark:border-white dark:bg-slate-800' : 'border-[#dddddd] hover:border-[#222222] dark:border-slate-700'}`}
                    >
                      {option.label}
                      {draft.propertyTypes.includes(option.id) && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {section === 'accessibility' && (
              <div className="mt-4">
                <p className="text-sm text-[#717171] dark:text-slate-400">Only show stays that have every selected feature.</p>
                <div className="mt-4 space-y-1">
                  {ACCESSIBILITY_OPTIONS.map((option) => (
                    <label key={option.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-[15px] hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                      <input
                        type="checkbox"
                        checked={draft.accessibility.includes(option.id)}
                        onChange={() => toggleInArray('accessibility', option.id)}
                        className="h-5 w-5 accent-[#f97316]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {section === 'languages' && (
              <div className="mt-4">
                <p className="text-sm text-[#717171] dark:text-slate-400">Show stays where the host speaks any of these languages.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {languages.map((language) => (
                    <Chip
                      key={language.id}
                      label={language.label}
                      active={draft.languages.includes(language.id)}
                      onClick={() => toggleInArray('languages', language.id)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllLanguages((value) => !value)}
                  className="mt-4 text-sm font-semibold underline underline-offset-2"
                >
                  {showAllLanguages ? 'Show fewer languages' : `Show all ${LANGUAGE_OPTIONS.length} languages`}
                </button>
                <p className="mt-6 flex items-start gap-2 rounded-xl bg-[#f7f7f7] p-3 text-xs leading-5 text-[#717171] dark:bg-slate-900 dark:text-slate-400">
                  <Globe2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Host languages are published by the host. We do not infer a language from the property’s location.
                </p>
              </div>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#ebebeb] px-4 py-3 sm:px-6 sm:py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => { setDraft(clearStayFilters(filters)); setDraftTotal(null); }}
            className="min-h-[44px] text-sm font-semibold underline underline-offset-2"
          >
            Clear all
          </button>
          <button
            type="button"
            disabled={Boolean(priceError)}
            onClick={() => { onApply(draft); onClose(); }}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#222222] px-6 text-[15px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {counting ? (
              <>Counting stays…</>
            ) : countFailed ? (
              <>Show stays</>
            ) : (
              <>Show {draftTotal ?? '—'} {draftTotal === 1 ? 'stay' : 'stays'}{count > 0 ? ` (${count})` : ''}</>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
