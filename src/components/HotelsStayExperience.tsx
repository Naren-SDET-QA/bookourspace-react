import React, { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  Check,
  Clock3,
  Heart,
  Home,
  Hotel,
  MapPin,
  Menu,
  MessageCircle,
  Palmtree,
  Phone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trees,
  Users,
  X,
} from 'lucide-react';
import type { ModuleAccess, ModuleFlagRow } from '../server/moduleGate';
import {
  fetchAuthorizedOwnerContact,
  fetchPlatformModuleFlags,
  subscribeToPlatformModuleFlags,
  fetchStayAvailability,
  fetchStayProperties,
  recordAuthorizedOwnerContact,
  STAY_PAGE_SIZE,
} from '../lib/stayDiscoveryData';
import type { StayAvailability, StayProperty } from '../lib/stayDiscoveryData';
import {
  canBookStayOnline,
  canContactOwner,
  isValidListingContactId,
  resolveServicesModuleAccess,
  resolveStayScreenState,
  validateStaySearch,
} from '../lib/servicesStayRules';
import { supabase } from '../lib/supabaseClient';

interface HotelsStayExperienceProps {
  onClose: () => void;
}

type ContactState = 'loading' | 'ready' | 'unavailable' | 'error';

const PROPERTY_TYPES: Array<{ value: string; label: string; icon: React.ElementType }> = [
  { value: 'all', label: 'All stays', icon: BedDouble },
  { value: 'hotel', label: 'Hotels', icon: Hotel },
  { value: 'resort', label: 'Resorts', icon: Palmtree },
  { value: 'homestay', label: 'Homestays', icon: Home },
  { value: 'apartment', label: 'Apartments', icon: Building2 },
  { value: 'villa', label: 'Villas', icon: Trees },
  { value: 'guesthouse', label: 'Guesthouses', icon: Building2 },
];

const AMENITY_FILTERS = ['Wi-Fi', 'Air conditioning', 'Pool', 'Parking'];

function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatRupees(paise: number): string | null {
  if (!Number.isInteger(paise) || paise <= 0) return null;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86_400_000);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

async function runLimited<T, R>(items: readonly T[], limit: number, action: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await action(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function hasAmenity(property: StayProperty, amenity: string): boolean {
  return property.amenities.some((item) => item.toLowerCase().includes(amenity.toLowerCase())) ||
    property.roomTypes.some((room) => room.amenities.some((item) => item.toLowerCase().includes(amenity.toLowerCase())));
}

function PhotoFrame({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#f2f0ee] dark:bg-slate-800 ${className ?? ''}`}>
      {!src && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#a0a0a0]">
          <BedDouble className="h-6 w-6" aria-hidden="true" />
          <span className="text-[11px] font-medium">No photo provided</span>
        </div>
      )}
      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition duration-300 ease-out group-hover:scale-[1.04]"
          onError={(event) => event.currentTarget.remove()}
        />
      )}
    </div>
  );
}

interface StaySearchFormProps {
  destination: string;
  onDestination: (value: string) => void;
  checkIn: string;
  onCheckIn: (value: string) => void;
  checkOut: string;
  onCheckOut: (value: string) => void;
  guests: number;
  onGuests: (value: number) => void;
  today: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  stacked?: boolean;
}

function StaySearchForm({
  destination,
  onDestination,
  checkIn,
  onCheckIn,
  checkOut,
  onCheckOut,
  guests,
  onGuests,
  today,
  onSubmit,
  busy,
  stacked = false,
}: StaySearchFormProps) {
  const segment = stacked
    ? 'px-4 py-3 border-b border-[#ebebeb] last:border-b-0 dark:border-slate-800'
    : 'px-5 py-2 border-b border-[#ebebeb] last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 dark:border-slate-800';

  return (
    <form
      onSubmit={onSubmit}
      className={`flex w-full overflow-hidden border border-[#dddddd] bg-white shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900 ${
        stacked ? 'flex-col rounded-2xl' : 'flex-col rounded-2xl sm:h-14 sm:flex-row sm:items-center sm:rounded-full'
      }`}
      role="search"
      aria-label="Search stays by destination, dates and guests"
    >
      <label className={`min-w-0 flex-1 ${segment} ${!stacked ? 'sm:rounded-l-full' : ''}`}>
        <span className="block text-[11px] font-bold text-[#222222] dark:text-slate-100">Where</span>
        <input
          value={destination}
          onChange={(event) => onDestination(event.target.value)}
          placeholder="Search destinations"
          autoComplete="address-level2"
          className="w-full bg-transparent text-sm text-[#222222] outline-none placeholder:font-normal placeholder:text-[#717171] dark:text-slate-100 dark:placeholder:text-slate-400"
        />
      </label>
      <label className={`min-w-0 ${stacked ? '' : 'sm:w-[150px]'} ${segment}`}>
        <span className="block text-[11px] font-bold text-[#222222] dark:text-slate-100">Check in</span>
        <input
          type="date"
          min={today}
          value={checkIn}
          onChange={(event) => onCheckIn(event.target.value)}
          aria-label="Check-in date"
          className="w-full bg-transparent text-sm text-[#717171] outline-none dark:text-slate-300"
        />
      </label>
      <label className={`min-w-0 ${stacked ? '' : 'sm:w-[150px]'} ${segment}`}>
        <span className="block text-[11px] font-bold text-[#222222] dark:text-slate-100">Check out</span>
        <input
          type="date"
          min={checkIn || today}
          value={checkOut}
          onChange={(event) => onCheckOut(event.target.value)}
          aria-label="Check-out date"
          className="w-full bg-transparent text-sm text-[#717171] outline-none dark:text-slate-300"
        />
      </label>
      <label className={`min-w-0 ${stacked ? '' : 'sm:w-[130px]'} ${segment}`}>
        <span className="block text-[11px] font-bold text-[#222222] dark:text-slate-100">Who</span>
        <select
          value={guests}
          onChange={(event) => onGuests(Number(event.target.value))}
          aria-label="Number of guests"
          className="w-full bg-transparent text-sm text-[#717171] outline-none dark:text-slate-300"
        >
          {Array.from({ length: 16 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count} className="text-[#222222]">
              {plural(count, 'guest')}
            </option>
          ))}
        </select>
      </label>
      <div className={stacked ? 'p-2' : 'p-2 shrink-0'}>
        <button
          type="submit"
          disabled={busy}
          className={`inline-flex items-center justify-center gap-2 bg-[#FF385C] font-semibold text-white transition hover:bg-[#E31C5F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF385C] disabled:cursor-not-allowed disabled:opacity-60 ${
            stacked ? 'h-12 w-full rounded-xl' : 'h-10 w-10 rounded-full sm:w-auto sm:px-5'
          }`}
        >
          <Search className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className={stacked ? 'inline' : 'hidden sm:inline'}>Search</span>
        </button>
      </div>
    </form>
  );
}

export function HotelsStayExperience({ onClose }: HotelsStayExperienceProps) {
  const today = useMemo(() => localDateInputValue(), []);
  const [moduleFlags, setModuleFlags] = useState<ModuleFlagRow[] | null>(null);
  const [moduleLoading, setModuleLoading] = useState(true);
  const [moduleError, setModuleError] = useState(false);
  const [properties, setProperties] = useState<StayProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [destination, setDestination] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);
  const [propertyType, setPropertyType] = useState('all');
  const [maxNightlyPrice, setMaxNightlyPrice] = useState('');
  const [requiredAmenities, setRequiredAmenities] = useState<string[]>([]);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [validationMessage, setValidationMessage] = useState('');
  const [selectedProperty, setSelectedProperty] = useState<StayProperty | null>(null);
  const [contactDetails, setContactDetails] = useState<{ phone?: string | null; whatsapp?: string | null; available: boolean; disclaimer?: string } | null>(null);
  const [contactState, setContactState] = useState<ContactState>('unavailable');
  const [contactMessage, setContactMessage] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const access: ModuleAccess = resolveServicesModuleAccess(moduleFlags, 'hotels');

  const loadModules = async () => {
    setModuleLoading(true);
    setModuleError(false);
    try {
      setModuleFlags(await fetchPlatformModuleFlags());
    } catch {
      setModuleFlags(null);
      setModuleError(true);
    } finally {
      setModuleLoading(false);
    }
  };

  const loadProperties = async (city: string, page = 0) => {
    setLoading(true);
    setError(false);
    try {
      const rows = await fetchStayProperties({ destination: city, page });
      setProperties(rows);
      setCurrentPage(page);
      setHasMore(rows.length === STAY_PAGE_SIZE);
    } catch {
      setProperties([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreProperties = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setPaginationError(false);
    try {
      const nextPage = currentPage + 1;
      const rows = await fetchStayProperties({ destination, page: nextPage });
      setProperties((current) => [...current, ...rows]);
      setCurrentPage(nextPage);
      setHasMore(rows.length === STAY_PAGE_SIZE);
    } catch {
      setPaginationError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadModules();
    const unsubscribe = subscribeToPlatformModuleFlags(() => { void loadModules(); });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!moduleFlags || !access.enabled) {
      setProperties([]);
      setLoading(false);
      return;
    }
    void loadProperties('');
  }, [moduleFlags, access.enabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (menuOpen) setMenuOpen(false);
      else if (filtersOpen) setFiltersOpen(false);
      else if (selectedProperty) setSelectedProperty(null);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, selectedProperty, filtersOpen, menuOpen]);

  const visibleProperties = useMemo(() => properties.filter((property) => {
    if (propertyType !== 'all' && property.propertyType !== propertyType) return false;
    if (maxNightlyPrice) {
      const maximumPaise = Number(maxNightlyPrice) * 100;
      if (!Number.isFinite(maximumPaise) || property.basePricePaise > maximumPaise) return false;
    }
    if (requiredAmenities.some((amenity) => !hasAmenity(property, amenity))) return false;
    const compatibleRooms = property.roomTypes.filter((room) => room.maxAdults + room.maxChildren >= guests);
    if (hasSearched && compatibleRooms.length === 0) return false;
    if (availableOnly && (!hasSearched || !compatibleRooms.some((room) => (availability[room.id] ?? 0) > 0))) return false;
    return true;
  }), [properties, propertyType, maxNightlyPrice, requiredAmenities, guests, hasSearched, availableOnly, availability]);

  const isLoading = moduleLoading || loading || availabilityLoading;
  const screenState = resolveStayScreenState(isLoading, moduleError || error, visibleProperties.length);
  const nights = nightsBetween(checkIn, checkOut);
  const activeFilterCount = (maxNightlyPrice ? 1 : 0) + requiredAmenities.length + (availableOnly ? 1 : 0);

  const searchStays = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateStaySearch(destination, checkIn, checkOut, guests, localDateInputValue());
    if (!validation.ok) {
      setValidationMessage(validation.message);
      return;
    }
    setValidationMessage('');
    setHasSearched(true);
    setAvailability({});
    setAvailabilityError(false);
    setError(false);
    setLoading(true);
    setAvailabilityLoading(false);
    let matched: StayProperty[];
    try {
      matched = await fetchStayProperties({ destination });
      setProperties(matched);
      setCurrentPage(0);
      setHasMore(matched.length === STAY_PAGE_SIZE);
      setPaginationError(false);
    } catch {
      setProperties([]);
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(false);
    const roomTypes = matched.flatMap((property) => property.roomTypes)
      .filter((room) => room.maxAdults + room.maxChildren >= guests);
    setAvailabilityLoading(true);
    try {
      const results = await runLimited(roomTypes, 5, (room) => fetchStayAvailability(room.id, checkIn, checkOut));
      setAvailability(Object.fromEntries(results.map((result: StayAvailability) => [result.roomTypeId, result.freeUnitCount])));
    } catch {
      setAvailabilityError(true);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const openPropertyDetails = async (property: StayProperty) => {
    setSelectedProperty(property);
    setContactDetails(null);
    setContactMessage('');
    setContactState('loading');
    setIsAuthenticated(false);
    if (!isValidListingContactId(property.listingId) || !supabase) {
      setContactState('unavailable');
      return;
    }
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const signedIn = Boolean(authData.user);
      setIsAuthenticated(signedIn);
      const details = await fetchAuthorizedOwnerContact(property.listingId);
      if (!details?.available || (!details.phone && !details.whatsapp)) {
        setContactState('unavailable');
        return;
      }
      setContactDetails(details);
      setContactState('ready');
      if (!signedIn) setContactMessage('Sign in to contact this owner.');
    } catch {
      setContactState('error');
    }
  };

  const contactOwner = async (channel: 'call' | 'whatsapp') => {
    if (!selectedProperty || !contactDetails || !canContactOwner(access, contactDetails, isAuthenticated, channel)) return;
    const phone = channel === 'call' ? contactDetails.phone : contactDetails.whatsapp;
    if (!phone) return;
    setContactBusy(true);
    setContactMessage('');
    const recorded = await recordAuthorizedOwnerContact(selectedProperty.listingId, channel).catch(() => false);
    setContactBusy(false);
    if (!recorded) {
      setContactMessage('We could not record this contact request. Please try again later.');
      return;
    }
    const digits = phone.replace(/[^0-9+]/g, '');
    if (channel === 'call') window.location.href = `tel:${digits}`;
    else window.location.href = `https://wa.me/${digits.replace(/^\+/, '')}`;
  };

  const toggleAmenity = (amenity: string) => setRequiredAmenities((current) =>
    current.includes(amenity) ? current.filter((item) => item !== amenity) : [...current, amenity]
  );

  const toggleSaved = (id: string) => setSavedIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );

  const selectedAvailableUnit = selectedProperty?.roomTypes.some((room) => (availability[room.id] ?? 0) > 0) ?? false;
  const onlineBookingReady = canBookStayOnline(access, selectedAvailableUnit, false);
  const selectedPrice = selectedProperty ? formatRupees(selectedProperty.basePricePaise) : null;

  return (
    <div className="fixed inset-0 z-[71] flex flex-col bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="stays-title">
      <header className="shrink-0 border-b border-[#ebebeb] bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex h-16 max-w-[1760px] items-center gap-3 px-4 sm:h-20 sm:px-6 lg:px-10">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#222222] transition hover:bg-[#f7f7f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF385C] dark:text-slate-100 dark:hover:bg-slate-800"
            aria-label="Back to marketplace"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex shrink-0 items-center gap-1.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF385C]"
            aria-label="BookOurSpace home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF385C] text-sm font-black text-white">B</span>
            <span className="hidden text-xl font-extrabold tracking-tight text-[#FF385C] sm:block">bookourspace</span>
          </button>

          <div className="mx-auto hidden w-full max-w-[850px] px-4 md:block">
            <StaySearchForm
              destination={destination}
              onDestination={setDestination}
              checkIn={checkIn}
              onCheckIn={setCheckIn}
              checkOut={checkOut}
              onCheckOut={setCheckOut}
              guests={guests}
              onGuests={setGuests}
              today={today}
              onSubmit={searchStays}
              busy={moduleLoading || !access.enabled || loading || availabilityLoading}
            />
          </div>

          <div className="relative ml-auto shrink-0 md:ml-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex h-10 items-center gap-2 rounded-full border border-[#dddddd] pr-2 pl-3 transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF385C] dark:border-slate-700"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#717171] text-[11px] font-bold text-white">BS</span>
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-[#ebebeb] bg-white py-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <button type="button" role="menuitem" onClick={() => { setFiltersOpen(true); setMenuOpen(false); }} className="block w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                  Filters
                </button>
                <button type="button" role="menuitem" onClick={() => { void loadModules(); setMenuOpen(false); }} className="block w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                  Refresh availability
                </button>
                <div className="my-1 border-t border-[#ebebeb] dark:border-slate-800" />
                <button type="button" role="menuitem" onClick={onClose} className="block w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                  Back to marketplace
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-3 md:hidden">
          <StaySearchForm
            stacked
            destination={destination}
            onDestination={setDestination}
            checkIn={checkIn}
            onCheckIn={setCheckIn}
            checkOut={checkOut}
            onCheckOut={setCheckOut}
            guests={guests}
            onGuests={setGuests}
            today={today}
            onSubmit={searchStays}
            busy={moduleLoading || !access.enabled || loading || availabilityLoading}
          />
        </div>

        {access.enabled && (
          <nav aria-label="Property types" className="mx-auto max-w-[1760px] px-4 sm:px-6 lg:px-10">
            <ul className="flex gap-8 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {PROPERTY_TYPES.map((type) => {
                const Icon = type.icon;
                const active = propertyType === type.value;
                return (
                  <li key={type.value} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setPropertyType(type.value)}
                      aria-pressed={active}
                      className={`flex flex-col items-center gap-1.5 border-b-2 pb-2.5 pt-3 text-xs font-semibold transition ${
                        active
                          ? 'border-[#222222] text-[#222222] dark:border-white dark:text-white'
                          : 'border-transparent text-[#717171] hover:text-[#222222] hover:opacity-100 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="h-6 w-6" aria-hidden="true" />
                      <span className="whitespace-nowrap">{type.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1760px] px-4 pb-16 sm:px-6 lg:px-10">
          {validationMessage && (
            <p role="alert" className="mt-4 rounded-xl border border-[#FF385C]/30 bg-[#FF385C]/5 px-4 py-3 text-sm font-medium text-[#c81e42]">
              {validationMessage}
            </p>
          )}

          {moduleError && (
            <div role="alert" className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <p>Stay availability settings could not be confirmed, so search is paused.</p>
              <button type="button" onClick={() => void loadModules()} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-400 px-3 font-semibold">
                <RefreshCw className="h-4 w-4" /> Try again
              </button>
            </div>
          )}

          {!moduleLoading && moduleFlags && !access.enabled && (
            <div role="status" className="mx-auto mt-16 max-w-md rounded-2xl border border-[#ebebeb] p-8 text-center dark:border-slate-800">
              <h2 className="text-xl font-semibold">Hotels &amp; Stays is unavailable</h2>
              <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">The marketplace setting currently has this module switched off.</p>
            </div>
          )}

          {access.enabled && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3 py-6">
                <div>
                  <h1 id="stays-title" className="text-[22px] font-semibold leading-tight sm:text-[26px]">
                    {destination.trim() ? `Stays in ${destination.trim()}` : 'Available stays'}
                  </h1>
                  <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">
                    {hasSearched
                      ? `${plural(visibleProperties.length, 'place')} for ${plural(guests, 'guest')}${nights ? ` · ${plural(nights, 'night')}` : ''}`
                      : `${plural(visibleProperties.length, 'place')} across BookOurSpace`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((open) => !open)}
                  aria-expanded={filtersOpen}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dddddd] px-4 text-sm font-semibold transition hover:border-[#222222] dark:border-slate-700 dark:hover:border-slate-500"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#222222] px-1.5 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">{activeFilterCount}</span>
                  )}
                </button>
              </div>

              {filtersOpen && (
                <section aria-label="Filters" className="mb-8 rounded-2xl border border-[#ebebeb] p-5 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">Filter by</h2>
                    {(activeFilterCount > 0 || availableOnly) && (
                      <button
                        type="button"
                        onClick={() => { setMaxNightlyPrice(''); setRequiredAmenities([]); setAvailableOnly(false); }}
                        className="text-sm font-semibold underline"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="mt-5 grid gap-6 sm:grid-cols-3">
                    <div>
                      <label htmlFor="stay-max-price" className="block text-sm font-semibold">Nightly price</label>
                      <p className="mt-0.5 text-xs text-[#717171]">Maximum per night, in rupees</p>
                      <input
                        id="stay-max-price"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={maxNightlyPrice}
                        onChange={(event) => setMaxNightlyPrice(event.target.value)}
                        placeholder="No limit"
                        className="mt-2 h-11 w-full rounded-lg border border-[#b0b0b0] px-3 text-sm outline-none focus:border-[#222222] dark:border-slate-600 dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Amenities</p>
                      <p className="mt-0.5 text-xs text-[#717171]">Rooms and property must include these</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {AMENITY_FILTERS.map((amenity) => {
                          const active = requiredAmenities.includes(amenity);
                          return (
                            <button
                              key={amenity}
                              type="button"
                              onClick={() => toggleAmenity(amenity)}
                              aria-pressed={active}
                              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
                                active
                                  ? 'border-[#222222] bg-[#f7f7f7] dark:border-white dark:bg-slate-800'
                                  : 'border-[#dddddd] text-[#717171] dark:border-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                              {amenity}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Availability</p>
                      <p className="mt-0.5 text-xs text-[#717171]">Only show stays with a free room for your dates</p>
                      <label className={`mt-2 inline-flex items-center gap-2 text-sm font-medium ${!hasSearched ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={availableOnly}
                          disabled={!hasSearched || availabilityLoading || availabilityError}
                          onChange={(event) => setAvailableOnly(event.target.checked)}
                          className="h-4 w-4 accent-[#FF385C]"
                        />
                        Available for selected dates
                      </label>
                      {!hasSearched && <p className="mt-1 text-xs text-[#717171]">Choose dates and search first.</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="mt-6 h-11 rounded-lg bg-[#222222] px-5 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-slate-900"
                  >
                    Show {plural(visibleProperties.length, 'place')}
                  </button>
                </section>
              )}

              {availabilityError && (
                <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  Date availability could not be confirmed. Stays remain visible, but are not shown as open for these dates.
                </div>
              )}

              {screenState === 'loading' && (
                <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label="Loading stays" aria-busy="true">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
                    <div key={item} className="animate-pulse">
                      <div className="aspect-square rounded-xl bg-[#ebebeb] dark:bg-slate-800" />
                      <div className="mt-3 h-4 w-3/4 rounded bg-[#ebebeb] dark:bg-slate-800" />
                      <div className="mt-2 h-3 w-1/2 rounded bg-[#ebebeb] dark:bg-slate-800" />
                    </div>
                  ))}
                </div>
              )}

              {screenState === 'error' && (
                <div role="alert" className="mx-auto max-w-md rounded-2xl border border-[#ebebeb] p-8 text-center dark:border-slate-800">
                  <h3 className="text-lg font-semibold">Stay information could not be loaded</h3>
                  <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">We couldn’t confirm current listings or dates. Please try again.</p>
                  <button type="button" onClick={() => void loadProperties(destination)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-[#222222] px-5 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
                    <RefreshCw className="h-4 w-4" /> Reload listings
                  </button>
                </div>
              )}

              {screenState === 'empty' && (
                <div role="status" className="mx-auto max-w-md rounded-2xl border border-[#ebebeb] px-6 py-12 text-center dark:border-slate-800">
                  <MapPin className="mx-auto h-7 w-7 text-[#717171]" aria-hidden="true" />
                  <h3 className="mt-3 text-lg font-semibold">No exact matches</h3>
                  <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">
                    Try changing your dates, removing a filter, or searching a different destination. We don’t fill this list with sample stays.
                  </p>
                </div>
              )}

              {screenState === 'results' && (
                <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {visibleProperties.map((property) => {
                    const compatibleRooms = property.roomTypes.filter((room) => room.maxAdults + room.maxChildren >= guests);
                    const availableRooms = compatibleRooms.filter((room) => (availability[room.id] ?? 0) > 0);
                    const freeUnits = availableRooms.reduce((sum, room) => sum + (availability[room.id] ?? 0), 0);
                    const isKnownUnavailable = hasSearched && compatibleRooms.length > 0 && !availabilityError && !availabilityLoading && availableRooms.length === 0;
                    const price = formatRupees(property.basePricePaise);
                    const isSaved = savedIds.includes(property.id);
                    const total = price && nights ? formatRupees(property.basePricePaise * nights) : null;
                    return (
                      <article key={property.id} className="group">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => void openPropertyDetails(property)}
                            className="block w-full overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222]"
                            aria-label={`View ${property.name}`}
                          >
                            <PhotoFrame
                              src={property.images[0]}
                              alt={`${property.name} in ${property.city || 'an unlisted city'}`}
                              className="aspect-square w-full"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleSaved(property.id)}
                            aria-pressed={isSaved}
                            aria-label={isSaved ? `Remove ${property.name} from saved` : `Save ${property.name}`}
                            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222]"
                          >
                            <Heart
                              className={`h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${isSaved ? 'fill-[#FF385C] text-[#FF385C]' : 'fill-black/25 text-white'}`}
                              aria-hidden="true"
                            />
                          </button>
                          {hasSearched && !availabilityLoading && !availabilityError && compatibleRooms.length > 0 && (
                            <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${
                              isKnownUnavailable ? 'bg-[#222222]/90 text-white' : 'bg-white text-[#222222]'
                            }`}>
                              {isKnownUnavailable ? 'Sold out for these dates' : `${freeUnits} left for your dates`}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void openPropertyDetails(property)}
                          className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222]"
                        >
                          <h3 className="mt-3 truncate text-[15px] font-semibold leading-5">{property.name}</h3>
                          <p className="truncate text-[15px] leading-5 text-[#717171] dark:text-slate-400">
                            {[property.area, property.city].filter(Boolean).join(', ') || 'Location not provided'}
                          </p>
                          <p className="mt-0.5 truncate text-[15px] leading-5 text-[#717171] dark:text-slate-400">
                            {property.amenities.length ? property.amenities.slice(0, 3).join(' · ') : property.propertyType}
                          </p>
                          <p className="mt-1 flex flex-wrap items-baseline gap-1 text-[15px] leading-5">
                            {price ? (
                              <>
                                <span className="font-semibold">{price}</span>
                                <span className="text-[#717171] dark:text-slate-400">night</span>
                                {total && (
                                  <>
                                    <span className="text-[#717171] dark:text-slate-400">·</span>
                                    <span className="font-semibold">{total}</span>
                                    <span className="text-[#717171] dark:text-slate-400">for {plural(nights, 'night')}</span>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-[#717171] dark:text-slate-400">Price not provided</span>
                            )}
                          </p>
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}

              {screenState === 'results' && hasMore && (
                <div className="mt-12 flex flex-col items-center gap-3">
                  {paginationError && <p role="alert" className="text-sm text-rose-600">More stays could not be loaded. Please try again.</p>}
                  <button
                    type="button"
                    onClick={() => void loadMoreProperties()}
                    disabled={loadingMore}
                    className="h-11 rounded-lg border border-[#222222] px-5 text-sm font-semibold transition hover:bg-[#f7f7f7] disabled:cursor-wait disabled:opacity-60 dark:border-white dark:hover:bg-slate-800"
                  >
                    {loadingMore ? 'Loading more stays…' : paginationError ? 'Retry loading stays' : 'Show more stays'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedProperty && (
        <div
          className="fixed inset-0 z-[80] overflow-y-auto bg-white dark:bg-slate-950"
          role="presentation"
        >
          <section role="dialog" aria-modal="true" aria-labelledby="stay-detail-title" className="min-h-full bg-white dark:bg-slate-950">
            <div className="sticky top-0 z-10 border-b border-[#ebebeb] bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
              <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => setSelectedProperty(null)}
                  className="inline-flex h-9 items-center gap-2 rounded-full px-2 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to stays
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProperty(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-[#f7f7f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222] dark:hover:bg-slate-800"
                  aria-label="Close property details"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mx-auto max-w-[1120px] px-4 pb-20 pt-6 sm:px-6">
              <h2 id="stay-detail-title" className="text-[22px] font-semibold leading-tight sm:text-[26px]">{selectedProperty.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-semibold capitalize">{selectedProperty.propertyType}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[#717171] dark:text-slate-400">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {[selectedProperty.address, selectedProperty.area, selectedProperty.city].filter(Boolean).join(', ') || 'Location not provided'}
                </span>
              </div>

              <div className="mt-5">
                <PhotoFrame
                  src={selectedProperty.images[0]}
                  alt={`${selectedProperty.name} property`}
                  className="aspect-[4/3] w-full rounded-2xl sm:aspect-[2/1]"
                />
                <p className="mt-2 text-xs text-[#717171] dark:text-slate-400">
                  One listing photo · BookOurSpace stores a single photo per stay to keep listing records small.
                </p>
              </div>

              <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ebebeb] pb-6 dark:border-slate-800">
                    <div>
                      <h3 className="text-xl font-semibold">Stay with BookOurSpace</h3>
                      <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">
                        {selectedProperty.roomTypes.length
                          ? `${plural(selectedProperty.roomTypes.length, 'room type')} · up to ${plural(Math.max(...selectedProperty.roomTypes.map((room) => room.maxAdults + room.maxChildren)), 'guest')} per room`
                          : 'Room inventory not published for this stay'}
                      </p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#ebebeb] text-base font-bold text-[#717171] dark:border-slate-700">
                      {selectedProperty.name.trim().slice(0, 1).toUpperCase() || 'B'}
                    </div>
                  </div>

                  {selectedProperty.description && (
                    <div className="border-b border-[#ebebeb] py-6 dark:border-slate-800">
                      <p className="text-[15px] leading-6 text-[#222222] dark:text-slate-200">{selectedProperty.description}</p>
                    </div>
                  )}

                  <div className="border-b border-[#ebebeb] py-6 dark:border-slate-800">
                    <h3 className="text-lg font-semibold">What this place offers</h3>
                    {selectedProperty.amenities.length ? (
                      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                        {selectedProperty.amenities.map((amenity) => (
                          <li key={amenity} className="flex items-center gap-3 text-[15px]">
                            <Check className="h-5 w-5 shrink-0 text-[#222222] dark:text-slate-200" aria-hidden="true" />
                            <span>{amenity}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">The owner has not listed amenities for this stay.</p>
                    )}
                    {(selectedProperty.checkInTime || selectedProperty.checkOutTime) && (
                      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#717171] dark:text-slate-400">
                        {selectedProperty.checkInTime && (
                          <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" aria-hidden="true" /> Check-in from {selectedProperty.checkInTime}</span>
                        )}
                        {selectedProperty.checkOutTime && (
                          <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" aria-hidden="true" /> Check-out by {selectedProperty.checkOutTime}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="border-b border-[#ebebeb] py-6 dark:border-slate-800">
                    <h3 className="text-lg font-semibold">Rooms</h3>
                    {selectedProperty.roomTypes.length ? (
                      <ul className="mt-4 divide-y divide-[#ebebeb] dark:divide-slate-800">
                        {selectedProperty.roomTypes.map((room) => {
                          const free = availability[room.id];
                          return (
                            <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                              <div className="min-w-0">
                                <p className="text-[15px] font-semibold">{room.name}</p>
                                <p className="mt-0.5 flex items-center gap-1 text-sm text-[#717171] dark:text-slate-400">
                                  <Users className="h-3.5 w-3.5" aria-hidden="true" /> Up to {plural(room.maxAdults + room.maxChildren, 'guest')}
                                </p>
                                {hasSearched && typeof free === 'number' && (
                                  <p className={`mt-1 text-xs font-semibold ${free > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {free > 0 ? `${free} available for your dates` : 'No units free for your dates'}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-[15px] font-semibold">{formatRupees(room.basePricePaise) || 'Price not provided'}</p>
                                <p className="text-xs text-[#717171] dark:text-slate-400">per night</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">Room inventory has not been provided for this listing.</p>
                    )}
                  </div>

                  <div className="py-6">
                    <h3 className="text-lg font-semibold">Contact the owner</h3>
                    <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">
                      Contact details appear only when the owner has consented and verified them.
                    </p>
                    {contactState === 'loading' && <p className="mt-3 text-sm text-[#717171]" aria-busy="true">Checking owner consent and verified contact details…</p>}
                    {contactState === 'unavailable' && <p className="mt-3 text-sm text-[#717171] dark:text-slate-400">Owner contact is unavailable for this listing. No unverified contact details are shown.</p>}
                    {contactState === 'error' && <p role="alert" className="mt-3 text-sm text-rose-600">Owner contact could not be confirmed. Please try again later.</p>}
                    {contactMessage && <p role="status" className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">{contactMessage}</p>}
                    {contactDetails && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {canContactOwner(access, contactDetails, isAuthenticated, 'call') && (
                          <button
                            type="button"
                            disabled={contactBusy}
                            onClick={() => void contactOwner('call')}
                            className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#222222] px-4 text-sm font-semibold transition hover:bg-[#f7f7f7] disabled:opacity-50 dark:border-white dark:hover:bg-slate-800"
                          >
                            <Phone className="h-4 w-4" aria-hidden="true" /> Call owner
                          </button>
                        )}
                        {canContactOwner(access, contactDetails, isAuthenticated, 'whatsapp') && (
                          <button
                            type="button"
                            disabled={contactBusy}
                            onClick={() => void contactOwner('whatsapp')}
                            className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#222222] px-4 text-sm font-semibold transition hover:bg-[#f7f7f7] disabled:opacity-50 dark:border-white dark:hover:bg-slate-800"
                          >
                            <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp owner
                          </button>
                        )}
                      </div>
                    )}
                    {contactDetails?.disclaimer && <p className="mt-3 text-xs leading-5 text-[#717171] dark:text-slate-400">{contactDetails.disclaimer}</p>}
                    {contactDetails && !isAuthenticated && <p className="mt-3 text-xs text-[#717171] dark:text-slate-400">Sign in to record and open an owner contact request.</p>}
                    <p className="mt-3 text-xs text-[#717171] dark:text-slate-400">Contacting an owner is an enquiry only. It does not reserve a room or confirm a booking.</p>
                  </div>
                </div>

                <aside className="lg:sticky lg:top-24">
                  <div className="rounded-2xl border border-[#dddddd] p-6 shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:border-slate-700">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[22px] font-semibold">{selectedPrice || 'Price not provided'}</span>
                      {selectedPrice && <span className="text-[15px] text-[#717171] dark:text-slate-400">night</span>}
                    </div>

                    <div className="mt-4 overflow-hidden rounded-lg border border-[#b0b0b0] dark:border-slate-600">
                      <div className="grid grid-cols-2 divide-x divide-[#b0b0b0] dark:divide-slate-600">
                        <label className="px-3 py-2">
                          <span className="block text-[11px] font-bold uppercase tracking-wide">Check in</span>
                          <input type="date" min={today} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} aria-label="Check-in date" className="w-full bg-transparent text-sm outline-none dark:text-slate-200" />
                        </label>
                        <label className="px-3 py-2">
                          <span className="block text-[11px] font-bold uppercase tracking-wide">Check out</span>
                          <input type="date" min={checkIn || today} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} aria-label="Check-out date" className="w-full bg-transparent text-sm outline-none dark:text-slate-200" />
                        </label>
                      </div>
                      <div className="border-t border-[#b0b0b0] px-3 py-2 dark:border-slate-600">
                        <label className="block">
                          <span className="block text-[11px] font-bold uppercase tracking-wide">Guests</span>
                          <select value={guests} onChange={(event) => setGuests(Number(event.target.value))} aria-label="Number of guests" className="w-full bg-transparent text-sm outline-none dark:text-slate-200">
                            {Array.from({ length: 16 }, (_, index) => index + 1).map((count) => (
                              <option key={count} value={count} className="text-[#222222]">{plural(count, 'guest')}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    {hasSearched && nights > 0 ? (
                      <p className="mt-3 text-sm text-[#717171] dark:text-slate-400" role="status">
                        {selectedAvailableUnit ? 'A room is free for these dates.' : 'No room is free for these dates.'}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-[#717171] dark:text-slate-400">Choose dates and search to check live availability.</p>
                    )}

                    <button
                      type="button"
                      disabled={!onlineBookingReady}
                      aria-disabled={!onlineBookingReady}
                      aria-describedby="stay-booking-disabled-reason"
                      className="mt-4 h-12 w-full cursor-not-allowed rounded-lg bg-[#FF385C]/40 text-base font-semibold text-white"
                    >
                      Reserve
                    </button>
                    <p id="stay-booking-disabled-reason" className="mt-2 text-center text-xs text-[#717171] dark:text-slate-400">
                      Online booking is not enabled yet.
                    </p>

                    <div className="mt-5 space-y-2 border-t border-[#ebebeb] pt-4 text-sm dark:border-slate-800">
                      {selectedPrice && nights > 0 ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="underline">{selectedPrice} × {plural(nights, 'night')}</span>
                            <span>{formatRupees(selectedProperty.basePricePaise * nights)}</span>
                          </div>
                          <div className="flex items-center justify-between font-semibold">
                            <span>Total before taxes</span>
                            <span>{formatRupees(selectedProperty.basePricePaise * nights)}</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-[#717171] dark:text-slate-400">Select dates to see a price breakdown.</p>
                      )}
                    </div>

                    <div className="mt-4 rounded-xl bg-[#f7f7f7] p-3 text-xs leading-5 text-[#717171] dark:bg-slate-800 dark:text-slate-300">
                      Date inventory can be checked, but this app does not yet connect a stay hold to verified payment and booking confirmation. No booking or payment will be started here.
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
