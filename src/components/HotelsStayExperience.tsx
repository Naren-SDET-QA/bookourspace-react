import React, { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import SafeImage from './SafeImage';
import { getStayStyle, saveStylePreference, styleFromHash, type StayStyle } from '../lib/sectionStyleSettings';
import { SectionStyleTabs, type SectionStyleNumber } from './sectionStyle/SectionStyleTabs';
import { StyleThreeList } from './sectionStyle/StyleThreeList';
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
  fetchStayRoomTypesForListing,
  recordAuthorizedOwnerContact,
  STAY_PAGE_SIZE,
} from '../lib/stayDiscoveryData';
import type { StayProperty } from '../lib/stayDiscoveryData';
import { EMPTY_STAY_FILTERS } from '../lib/stayFilters';
import { searchStays as searchStayListings, toStayProperty } from '../lib/staySearchClient';
import {
  canContactOwner,
  buildProviderContactMessage,
  isValidListingContactId,
  resolveServicesModuleAccess,
  resolveStayScreenState,
  validateStaySearch,
} from '../lib/servicesStayRules';
import { supabase, fetchCurrentAuthSession } from '../lib/supabaseClient';
import { useMarketplace } from '../context/MarketplaceContext';
import { patchStayCheckoutDraft, readStayCheckoutDraft } from '../lib/stayCheckoutDraft';
import { AirbnbIndiaExperience } from './AirbnbIndiaExperience';
import { StayCheckoutPanel } from './StayCheckoutPanel';

interface HotelsStayExperienceProps {
  onClose: () => void;
  /** Render in the page flow under the common header instead of as a full-screen dialog. */
  inline?: boolean;
  /** Opens the host listing wizard in the parent application. */
  onStartHosting?: () => void;
  /** Opens the application's Google sign-in modal. */
  onSignIn?: () => void;
  /** Header category selection, so the shared Stay ribbon controls the list. */
  stayCategory?: string;
  staySubcategory?: string;
  /** City selected in the shared marketplace header. */
  selectedCity?: string;
  /** Centrally published Style 1/2/3 choice. */
  style?: StayStyle;
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

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
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

function hasAmenity(property: StayProperty, amenity: string): boolean {
  return property.amenities.some((item) => item.toLowerCase().includes(amenity.toLowerCase())) ||
    property.roomTypes.some((room) => room.amenities.some((item) => item.toLowerCase().includes(amenity.toLowerCase())));
}

function PhotoFrame({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#f2f0ee] dark:bg-slate-800 ${className ?? ''}`}>
      <SafeImage
        src={src}
        alt={alt}
        category="stays"
        className="absolute inset-0 h-full w-full object-cover transition duration-300 ease-out group-hover:scale-[1.04]"
        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 48vw, 420px"
      />
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
          className={`inline-flex items-center justify-center gap-2 bg-[#f97316] font-semibold text-white transition hover:bg-[#ea580c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316] disabled:cursor-not-allowed disabled:opacity-60 ${
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

export function HotelsStayExperience({ onClose, inline = false, onStartHosting, onSignIn, stayCategory, staySubcategory, selectedCity = 'All Cities', style }: HotelsStayExperienceProps) {
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
  const { authUser } = useMarketplace();
  const [experienceTab, setExperienceTab] = useState<'old' | 'airbnb' | 'style3'>(() => {
    const routeStyle = styleFromHash('stays') ?? styleFromHash('hotels');
    if (routeStyle === '1' || routeStyle === 'old' || routeStyle === 'stay1') return 'old';
    if (routeStyle === '2' || routeStyle === 'airbnb' || routeStyle === 'stay2') return 'airbnb';
    if (routeStyle === '3' || routeStyle === 'style3' || routeStyle === 'stay3') return 'style3';
    if (style === 'style3') return 'style3';
    if (style === 'airbnb') return 'airbnb';
    if (style === 'old') return 'old';
    return getStayStyle();
  });

  useEffect(() => {
    const onHash = () => {
      const routeStyle = styleFromHash('stays') ?? styleFromHash('hotels');
      if (routeStyle === '1' || routeStyle === 'old' || routeStyle === 'stay1') setExperienceTab('old');
      else if (routeStyle === '2' || routeStyle === 'airbnb' || routeStyle === 'stay2') setExperienceTab('airbnb');
      else if (routeStyle === '3' || routeStyle === 'style3' || routeStyle === 'stay3') setExperienceTab('style3');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Centrally published style changes apply without a reload.
  useEffect(() => {
    if (!style || styleFromHash('stays') || styleFromHash('hotels')) return;
    setExperienceTab(style);
  }, [style]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (authUser) {
        if (alive) setIsAuthenticated(true);
        return;
      }
      const session = await fetchCurrentAuthSession().catch(() => null);
      if (alive) setIsAuthenticated(Boolean(session?.authenticated));
    };
    void refresh();
    const onOauth = () => { void refresh(); };
    window.addEventListener('bos-google-oauth-redirect', onOauth);
    return () => {
      alive = false;
      window.removeEventListener('bos-google-oauth-redirect', onOauth);
    };
  }, [authUser]);

  useEffect(() => {
    if (experienceTab !== 'old') return;
    const draft = readStayCheckoutDraft();
    if (!draft || draft.stayStyle === 'airbnb' || !draft.listingId) return;
    if (draft.checkIn) setCheckIn(draft.checkIn);
    if (draft.checkOut) setCheckOut(draft.checkOut);
    if (draft.guests) setGuests(draft.guests);
  }, [experienceTab]);

  useEffect(() => {
    if (experienceTab !== 'old') return;
    const draft = readStayCheckoutDraft();
    if (!draft || draft.stayStyle === 'airbnb' || !draft.listingId) return;
    if (selectedProperty?.listingId === draft.listingId) return;
    const match = properties.find((row) => row.listingId === draft.listingId);
    if (match) {
      setSelectedProperty(match);
      return;
    }
    if (draft.property && typeof draft.property === 'object' && (draft.property as StayProperty).listingId === draft.listingId) {
      setSelectedProperty(draft.property as StayProperty);
    }
  }, [experienceTab, properties, selectedProperty?.listingId]);

  useEffect(() => {
    if (!selectedProperty || experienceTab !== 'old') return;
    patchStayCheckoutDraft({
      stayStyle: 'old',
      listingId: selectedProperty.listingId,
      property: selectedProperty,
      checkIn,
      checkOut,
      guests,
    });
  }, [experienceTab, selectedProperty, checkIn, checkOut, guests]);

  const access: ModuleAccess = resolveServicesModuleAccess(moduleFlags, 'hotels');
  const selectedStayCity = ['all', 'all cities', 'all locations'].includes(selectedCity.trim().toLowerCase()) ? '' : selectedCity;

  const getStaySearchPage = async (
    filters: { destination: string; checkIn?: string; checkOut?: string; guests?: number; includeUnavailable?: boolean },
    page = 0,
  ) => {
    const result = await searchStayListings({
      ...EMPTY_STAY_FILTERS,
      destination: filters.destination,
      checkIn: filters.checkIn || '',
      checkOut: filters.checkOut || '',
      guests: filters.guests ?? 2,
      includeUnavailable: filters.includeUnavailable ?? false,
    }, { page, pageSize: STAY_PAGE_SIZE });
    if (!result.ok) throw new Error(result.error);
    const rows = result.items.map(toStayProperty);
    const nextAvailability = Object.fromEntries(result.items.flatMap((item) =>
      item.roomTypes.flatMap((room) => typeof room.availableUnits === 'number'
        ? [[room.id, room.availableUnits] as const]
        : []),
    ));
    return { rows, hasMore: result.hasMore, total: result.total, availability: nextAvailability };
  };

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
      const result = await getStaySearchPage({ destination: city }, page);
      setProperties(result.rows);
      setAvailability(result.availability);
      setCurrentPage(page);
      setHasMore(result.hasMore);
    } catch {
      setProperties([]);
      setAvailability({});
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
      const result = await getStaySearchPage({
        destination,
        checkIn: hasSearched ? checkIn : '',
        checkOut: hasSearched ? checkOut : '',
        guests,
        includeUnavailable: !availableOnly,
      }, nextPage);
      setProperties((current) => [...current, ...result.rows]);
      setAvailability((current) => ({ ...current, ...result.availability }));
      setCurrentPage(nextPage);
      setHasMore(result.hasMore);
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
    setDestination(selectedStayCity);
    setHasSearched(false);
    setAvailability({});
    setSelectedProperty((current) => {
      const draft = readStayCheckoutDraft();
      if (draft?.stayStyle !== 'airbnb' && draft?.listingId && current?.listingId === draft.listingId) return current;
      return null;
    });
    void loadProperties(selectedStayCity);
  }, [moduleFlags, access.enabled, selectedStayCity]);

  useEffect(() => {
    if (experienceTab === 'airbnb') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (menuOpen) setMenuOpen(false);
      else if (filtersOpen) setFiltersOpen(false);
      else if (selectedProperty) setSelectedProperty(null);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, selectedProperty, filtersOpen, menuOpen, experienceTab]);

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
    setAvailabilityLoading(Boolean(checkIn && checkOut));
    try {
      const result = await getStaySearchPage({
        destination,
        checkIn,
        checkOut,
        guests,
        // Date searches default to available inventory only. The checkbox can
        // explicitly request unavailable stays on a subsequent refresh.
        includeUnavailable: false,
      });
      setProperties(result.rows);
      setAvailability(result.availability);
      setCurrentPage(0);
      setHasMore(result.hasMore);
      setAvailableOnly(Boolean(checkIn && checkOut));
      setPaginationError(false);
    } catch {
      setProperties([]);
      setAvailability({});
      setError(true);
    } finally {
      setLoading(false);
      setAvailabilityLoading(false);
    }
  };

  const changeAvailabilityFilter = async (checked: boolean) => {
    setAvailableOnly(checked);
    if (!hasSearched || !checkIn || !checkOut) return;
    setLoading(true);
    setAvailabilityError(false);
    try {
      const result = await getStaySearchPage({
        destination,
        checkIn,
        checkOut,
        guests,
        includeUnavailable: !checked,
      });
      setProperties(result.rows);
      setAvailability(result.availability);
      setCurrentPage(0);
      setHasMore(result.hasMore);
    } catch {
      setAvailableOnly(!checked);
      setAvailabilityError(true);
    } finally {
      setLoading(false);
    }
  };

  const openPropertyDetails = async (property: StayProperty) => {
    setSelectedProperty(property);
    if (property.roomTypes.length === 0) {
      void fetchStayRoomTypesForListing(property.listingId).then((roomTypes) => {
        setSelectedProperty((current) => current?.listingId === property.listingId
          ? { ...current, roomTypes }
          : current);
      }).catch(() => {
        // Keep the verified listing visible; the checkout panel independently
        // reports inventory/availability errors and never creates a booking.
      });
    }
    setContactDetails(null);
    setContactMessage('');
    setContactState('loading');
    if (!isValidListingContactId(property.listingId) || !supabase) {
      setContactState('unavailable');
      return;
    }
    try {
      // Prefer the server-verified authoritative session so a local signed test
      // identity works without a hosted Google login.
      const authoritative = await fetchCurrentAuthSession().catch(() => null);
      if (authoritative?.authenticated) {
        setIsAuthenticated(true);
        const details = await fetchAuthorizedOwnerContact(property.listingId);
        if (!details?.available || (!details.phone && !details.whatsapp)) {
          setContactState('unavailable');
          return;
        }
        setContactDetails(details);
        setContactState('ready');
        return;
      }
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
    if (!digits) {
      setContactMessage('The verified contact number is invalid.');
      return;
    }
    if (channel === 'call') window.location.href = `tel:${digits}`;
    else {
      const message = buildProviderContactMessage({
        listingTitle: selectedProperty.name,
        dates: checkIn && checkOut ? `${checkIn} to ${checkOut}` : undefined,
        guests,
        kind: 'availability',
      });
      window.location.href = `https://wa.me/${digits.replace(/^\+/, '')}?text=${encodeURIComponent(message)}`;
    }
  };

  const toggleAmenity = (amenity: string) => setRequiredAmenities((current) =>
    current.includes(amenity) ? current.filter((item) => item !== amenity) : [...current, amenity]
  );

  const toggleSaved = (id: string) => setSavedIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  );

  const selectedAvailableUnit = selectedProperty?.roomTypes.some((room) => (availability[room.id] ?? 0) > 0) ?? false;
  const selectedPrice = selectedProperty
    ? selectedProperty.roomTypes.length
      ? formatRupees(selectedProperty.basePricePaise)
      : selectedProperty.listingPriceAmount !== undefined
        ? formatINR(selectedProperty.listingPriceAmount)
        : null
    : null;

  const changeStayStyle = (value: SectionStyleNumber) => {
    const next = value === 1 ? 'old' : value === 2 ? 'airbnb' : 'style3';
    saveStylePreference('stay', next);
    setExperienceTab(next);
    window.location.hash = `stays/${next === 'old' ? 'style1' : next === 'airbnb' ? 'style2' : 'style3'}`;
  };

  if (experienceTab === 'airbnb') {
    return (
      <>
        <SectionStyleTabs active={2} onChange={changeStayStyle} label="Stay display style" className="border-b border-[#ebebeb] bg-white" />
        <AirbnbIndiaExperience inline={inline} selectedCity={selectedStayCity} externalCategory={stayCategory} externalSubcategory={staySubcategory} onClose={onClose} onSwitchToOld={() => { setExperienceTab('old'); window.location.hash = 'stays/old'; }} onStartHosting={onStartHosting} onSignIn={onSignIn} />
      </>
    );
  }

  return (
    <div
      className={
        inline
          ? 'w-full bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100'
          : 'fixed inset-0 z-[71] flex flex-col bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100'
      }
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-labelledby="stays-title"
    >
      {!inline && (
      <header className="shrink-0 border-b border-[#ebebeb] bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex h-16 max-w-[1760px] items-center gap-3 px-4 sm:h-20 sm:px-6 lg:px-10">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#222222] transition hover:bg-[#f7f7f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316] dark:text-slate-100 dark:hover:bg-slate-800"
            aria-label="Back to all sections"
          >
            <ArrowLeft className="h-5 w-5" />
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
              className="flex h-10 items-center gap-2 rounded-full border border-[#dddddd] pr-2 pl-3 transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316] dark:border-slate-700"
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
      )}

      <SectionStyleTabs
        active={experienceTab === 'old' ? 1 : 3}
        onChange={changeStayStyle}
        label="Stay display style"
        className="border-b border-[#ebebeb] bg-white"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1760px] px-4 pb-16 sm:px-6 lg:px-10">
          {/* Inline section: the stay search lives in the content instead of a branded page header */}
          {inline && (
            <div className="pt-4">
              <button
                type="button"
                onClick={onClose}
                className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#f97316] hover:underline"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All sections
              </button>
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
          )}

          {validationMessage && (
            <p role="alert" className="mt-4 rounded-xl border border-[#f97316]/30 bg-[#f97316]/5 px-4 py-3 text-sm font-medium text-[#c2410c]">
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
                        onClick={() => { setMaxNightlyPrice(''); setRequiredAmenities([]); void changeAvailabilityFilter(false); }}
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
                          onChange={(event) => void changeAvailabilityFilter(event.target.checked)}
                          className="h-4 w-4 accent-[#f97316]"
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

              {experienceTab === 'style3' && screenState === 'results' && (
                <StyleThreeList
                  label="Stays style 3 list"
                  items={visibleProperties.map((property) => ({
                    id: property.id,
                    title: property.name,
                    subtitle: [property.propertyType, [property.area, property.city].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
                    meta: property.roomTypes.length ? `${property.roomTypes.length} room type${property.roomTypes.length === 1 ? '' : 's'} · ${property.checkInTime} check-in` : 'Room details on request',
                    price: formatRupees(property.basePricePaise) ?? undefined,
                    image: property.images[0] || null,
                    badge: property.demo ? 'Sample' : property.localTestFixture ? 'Test' : undefined,
                    onClick: () => void openPropertyDetails(property),
                  }))}
                  emptyLabel="No stays match these filters."
                />
              )}

              {screenState === 'results' && experienceTab !== 'style3' && (
                <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {visibleProperties.map((property) => {
                    const compatibleRooms = property.roomTypes.filter((room) => room.maxAdults + room.maxChildren >= guests);
                    const availableRooms = compatibleRooms.filter((room) => (availability[room.id] ?? 0) > 0);
                    const freeUnits = availableRooms.reduce((sum, room) => sum + (availability[room.id] ?? 0), 0);
                    const isKnownUnavailable = hasSearched && compatibleRooms.length > 0 && !availabilityError && !availabilityLoading && availableRooms.length === 0;
                    const hasRoomInventory = property.roomTypes.length > 0;
                    const price = hasRoomInventory
                      ? formatRupees(property.basePricePaise)
                      : property.listingPriceAmount !== undefined
                        ? formatINR(property.listingPriceAmount)
                        : null;
                    const isSaved = savedIds.includes(property.id);
                    const total = hasRoomInventory && price && nights ? formatRupees(property.basePricePaise * nights) : null;
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
                              className={`h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${isSaved ? 'fill-[#f97316] text-[#f97316]' : 'fill-black/25 text-white'}`}
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
                                <span className="text-[#717171] dark:text-slate-400">{hasRoomInventory ? 'night' : property.listingPriceUnit || 'listed price'}</span>
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
                      Contact details appear only when the owner has consented and verified them. Ask about your selected dates; payment is made at the property after the owner confirms.
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
                            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Request availability
                          </button>
                        )}
                      </div>
                    )}
                    {contactDetails?.disclaimer && <p className="mt-3 text-xs leading-5 text-[#717171] dark:text-slate-400">{contactDetails.disclaimer}</p>}
                    {contactDetails && !isAuthenticated && <p className="mt-3 text-xs text-[#717171] dark:text-slate-400">Sign in to record and open an owner contact request.</p>}
                    <p className="mt-3 text-xs text-[#717171] dark:text-slate-400">WhatsApp opens a draft for you to review and send. This is an enquiry only: it does not reserve a room or confirm a booking. Pay at the property only after the owner confirms.</p>
                  </div>
                </div>

                <aside className="lg:sticky lg:top-24">
                  <div className="rounded-2xl border border-[#dddddd] p-6 shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:border-slate-700">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[22px] font-semibold">{selectedPrice || 'Price not provided'}</span>
                      {selectedPrice && <span className="text-[15px] text-[#717171] dark:text-slate-400">{selectedProperty?.roomTypes.length ? 'night' : selectedProperty?.listingPriceUnit || 'listed price'}</span>}
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

                    {hasSearched && nights > 0 && selectedProperty?.roomTypes.length ? (
                      <p className="mt-3 text-sm text-[#717171] dark:text-slate-400" role="status">
                        {selectedAvailableUnit ? 'A room is free for these dates.' : 'No room is free for these dates.'}
                      </p>
                    ) : selectedProperty && selectedProperty.roomTypes.length === 0 ? (
                      <p className="mt-3 text-sm text-[#717171] dark:text-slate-400" role="status">Room inventory is not published, so dates and availability cannot be confirmed here.</p>
                    ) : (
                      <p className="mt-3 text-sm text-[#717171] dark:text-slate-400">Choose dates and search to check live availability.</p>
                    )}

                    <button
                      type="button"
                      disabled={!canContactOwner(access, contactDetails, isAuthenticated, 'whatsapp') || contactBusy}
                      aria-disabled={!canContactOwner(access, contactDetails, isAuthenticated, 'whatsapp') || contactBusy}
                      aria-describedby="stay-request-policy"
                      onClick={() => void contactOwner('whatsapp')}
                      className="mt-4 h-12 w-full rounded-lg bg-[#f97316] text-base font-semibold text-white transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Request availability on WhatsApp
                    </button>
                    <p id="stay-request-policy" className="mt-2 text-center text-xs text-[#717171] dark:text-slate-400">
                      This opens a draft for you to review and send. It does not reserve a room. Pay at the property only after the owner confirms.
                    </p>

                    <div className="mt-5 space-y-2 border-t border-[#ebebeb] pt-4 text-sm dark:border-slate-800">
                      {selectedPrice && selectedProperty?.roomTypes.length && nights > 0 ? (
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
                        <p className="text-[#717171] dark:text-slate-400">{selectedProperty?.roomTypes.length ? 'Select dates to see a price breakdown.' : 'A per-night total is unavailable without published room pricing and inventory.'}</p>
                      )}
                    </div>

                    <StayCheckoutPanel
                      property={selectedProperty}
                      checkIn={checkIn}
                      checkOut={checkOut}
                      guests={guests}
                      isAuthenticated={isAuthenticated}
                      onSignIn={onSignIn}
                    />

                    <div className="mt-4 rounded-xl bg-[#f7f7f7] p-3 text-xs leading-5 text-[#717171] dark:bg-slate-800 dark:text-slate-300">
                      A reservation is only created after the server confirms a room for your dates. A UPI payment counts as paid only after the payment provider confirms settlement.
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
