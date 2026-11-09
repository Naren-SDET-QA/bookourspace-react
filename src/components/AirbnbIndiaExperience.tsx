import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  Map as MapIcon,
  MapPin,
  Menu,
  Search,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react';
import {
  activeFilterChips,
  activeFilterCount,
  applyParams,
  clearStayFilters,
  loadPersistedFilters,
  persistFilters,
  removeFilterChip,
  toSearchParams,
  validateStayDates,
  validatePriceRange,
  localDateInputValue,
  type StayFilters,
} from '../lib/stayFilters';
import {
  searchStays,
  searchStaysByListingIds,
  toStayProperty,
  type StaySearchFailure,
  type StaySearchItem,
} from '../lib/staySearchClient';
import { fetchCurrentAuthSession, supabase } from '../lib/supabaseClient';
import { useMarketplace } from '../context/MarketplaceContext';
import { clearStayCheckoutDraft, patchStayCheckoutDraft, readStayCheckoutDraft } from '../lib/stayCheckoutDraft';
import { StayCard } from './stay/StayCard';
import { StayCheckoutPage } from './stay/StayCheckoutPage';
import { StaySearchBar, type StaySearchValue } from './stay/StaySearchBar';
import { StayCategoryRail, applyStayCategory } from './stay/StayCategoryRail';
import { StayWishlistsPanel } from './stay/StayWishlistsPanel';
import {
  fetchCloudStayWishlistIds,
  loadGuestSavedIds,
  loadGuestSnapshots,
  persistGuestSavedIds,
  persistGuestSnapshots,
  syncCloudStayWishlist,
} from '../lib/stayWishlist';

// Everything below the result grid is opened on demand: the detail page and
// gallery, the filter drawer, trips, the host workspace and the map.
const StayDetail = lazy(() => import('./stay/StayDetail').then((module) => ({ default: module.StayDetail })));
const StayFilterDrawer = lazy(() => import('./stay/StayFilterDrawer').then((module) => ({ default: module.StayFilterDrawer })));
const StayTripsPanel = lazy(() => import('./stay/StayTripsPanel').then((module) => ({ default: module.StayTripsPanel })));
const StayHostWorkspace = lazy(() => import('./stay/StayHostWorkspace').then((module) => ({ default: module.StayHostWorkspace })));

// The map and its tiles are only fetched when the user opens Map view.
const FreeMap = lazy(() => import('./FreeMap').then((module) => ({ default: module.FreeMap })));

interface AirbnbIndiaExperienceProps {
  onClose: () => void;
  onSwitchToOld: () => void;
  /** Render in the page flow under the common header instead of as a full-screen dialog. */
  inline?: boolean;
  /** Opens the host listing wizard in the parent application. */
  onStartHosting?: () => void;
  /** Opens the application's Google sign-in modal. */
  onSignIn?: () => void;
  /** Category chosen in the constant marketplace header. */
  externalCategory?: string;
  externalSubcategory?: string;
  /** City selected in the shared marketplace location control. */
  selectedCity?: string;
}

const HEADER_STAY_FILTERS: Record<string, Partial<StayFilters>> = {
  'hotel-budget': { maxPrice: '10000', minPrice: '' },
  'hotel-luxury': { luxeVerified: true },
  'hotel-service-apt': { propertyTypes: ['apartment'] },
  'hotel-resorts': { propertyTypes: ['resort', 'homestay'] },
  'hotel-homestay': { propertyTypes: ['villa', 'homestay'] },
  'hotel-corporate': { propertyTypes: ['guest_house'] },
  'hotel-hourly': { propertyTypes: ['lodge'] },
  'hotel-couple': { placeTypes: ['entire_home'] },
};

/* --------------------------- BookOurSpace branding -------------------------- */

function BookOurSpaceEmblem({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 text-white shadow-sm ${className ?? 'h-8 w-8'}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[58%] w-[58%]">
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    </span>
  );
}

function BookOurSpaceWordmark({ className }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className ?? 'text-xl'}`} translate="no">
      <span className="text-[#0F172A] dark:text-white">Book</span>
      <span className="text-orange-500">Our</span>
      <span className="text-indigo-600 dark:text-indigo-300">Space</span>
    </span>
  );
}

export function ExperienceTabBar({
  active,
  onOld,
  onAirbnb,
}: {
  active: 'old' | 'airbnb';
  onOld: () => void;
  onAirbnb: () => void;
}) {
  const base = 'inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition';
  return (
    <div className="flex shrink-0 items-center justify-center border-b border-[#ebebeb] bg-[#f7f7f7] px-4 py-2">
      <div className="inline-flex items-center rounded-full border border-[#dddddd] bg-white p-1 shadow-sm">
        <button type="button" onClick={onOld} className={`${base} ${active === 'old' ? 'bg-[#222222] text-white' : 'text-[#717171] hover:bg-[#f7f7f7]'}`}>
          Stay 1
        </button>
        <button type="button" onClick={onAirbnb} className={`${base} ${active === 'airbnb' ? 'bg-[#f97316] text-white' : 'text-[#717171] hover:bg-[#f7f7f7]'}`}>
          <BookOurSpaceEmblem className="h-4 w-4 rounded-[5px]" /> Stay 2
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- Rail ---------------------------------- */

const INSPIRATION_CITIES = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Goa', 'Jaipur', 'Pune', 'Chennai', 'Kochi', 'Udaipur', 'Kolkata', 'Manali',
];





const FOOTER_LINKS: Array<{ label: string; hash: string }> = [
  { label: 'Paying guest', hash: '#pg' },
  { label: 'Classes', hash: '#classes' },
  { label: 'Venues', hash: '#venues' },
  { label: 'Services', hash: '#services' },
  { label: 'Movies', hash: '#movies' },
];

function locationFilters(): StayFilters {
  try {
    const sf = new URLSearchParams(window.location.search).get('sf');
    if (sf) return applyParams(new URLSearchParams(sf));
  } catch {
    /* fall through */
  }
  return loadPersistedFilters(window.sessionStorage);
}

function syncLocation(filters: StayFilters) {
  try {
    const url = new URL(window.location.href);
    const value = toSearchParams(filters).toString();
    if (value) url.searchParams.set('sf', value);
    else url.searchParams.delete('sf');
    window.history.replaceState(window.history.state, '', url);
  } catch {
    /* URL sync is a convenience, never the source of truth */
  }
}

/* ------------------------------ Main component ---------------------------- */

function StayRail({
  title,
  subtitle,
  items,
  nights,
  displayTotal,
  savedIds,
  onOpen,
  onSave,
  onShare,
}: {
  title: string;
  subtitle: string;
  items: StaySearchItem[];
  nights: number;
  displayTotal: boolean;
  savedIds: string[];
  onOpen: (item: StaySearchItem) => void;
  onSave: (item: StaySearchItem) => void;
  onShare: (item: StaySearchItem) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  if (items.length === 0) return null;
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight text-[#222222] dark:text-white">{title} <span aria-hidden="true">→</span></h2>
          <p className="mt-0.5 text-xs text-[#717171] dark:text-slate-400">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => scroller.current?.scrollBy({ left: -640, behavior: 'smooth' })} aria-label={`Scroll ${title} left`} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dddddd] bg-white text-[#222222] transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => scroller.current?.scrollBy({ left: 640, behavior: 'smooth' })} aria-label={`Scroll ${title} right`} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dddddd] bg-white text-[#222222] transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div ref={scroller} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <div key={item.id} className="w-[76vw] max-w-[280px] shrink-0 snap-start sm:w-[280px]">
            <StayCard
              item={item}
              nights={nights}
              displayTotal={displayTotal}
              saved={savedIds.includes(item.listingId)}
              onOpen={() => onOpen(item)}
              onSave={() => onSave(item)}
              onShare={() => onShare(item)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function AirbnbIndiaExperience({
  onClose,
  onSwitchToOld,
  inline = false,
  onStartHosting,
  onSignIn,
  externalCategory,
  externalSubcategory,
  selectedCity,
}: AirbnbIndiaExperienceProps) {
  const [filters, setFilters] = useState<StayFilters>(() => {
    const initial = locationFilters();
    return selectedCity?.trim() ? { ...initial, destination: selectedCity.trim() } : initial;
  });
  const [items, setItems] = useState<StaySearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<StaySearchFailure | null>(null);
  const [validation, setValidation] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tripsOpen, setTripsOpen] = useState(false);
  const [mapView, setMapView] = useState(false);
  const [detail, setDetail] = useState<StaySearchItem | null>(null);
  const [showAllGrid, setShowAllGrid] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutDraft, setCheckoutDraft] = useState<{ item: StaySearchItem; checkIn: string; checkOut: string; guests: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayTotal, setDisplayTotal] = useState<boolean>(() => {
    try { return window.localStorage.getItem('bos_stay_display_total_v1') === '1'; } catch { return false; }
  });
  const [guestSavedIds, setGuestSavedIds] = useState<string[]>(() => loadGuestSavedIds());
  const [cloudSavedIds, setCloudSavedIds] = useState<string[] | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionRole, setSessionRole] = useState<'customer' | 'provider' | 'admin' | null>(null);
  const { authUser } = useMarketplace();
  const [hostOpen, setHostOpen] = useState(false);
  const [wishlistsOpen, setWishlistsOpen] = useState(false);
  const [savedSnapshots, setSavedSnapshots] = useState<StaySearchItem[]>(() => loadGuestSnapshots());
  const [cloudSnapshots, setCloudSnapshots] = useState<StaySearchItem[]>([]);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 4000);
  };

  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  // Session: HMAC is authoritative (local E2E + Google). Re-read after OAuth so
  // a popup sign-in does not leave checkout stuck on "Continue with Google".
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        if (authUser) {
          if (!alive) return;
          setIsAuthenticated(true);
          setSessionRole((authUser.role as 'customer' | 'provider' | 'admin') || 'customer');
          return;
        }
        const session = await fetchCurrentAuthSession();
        if (session.authenticated) {
          if (!alive) return;
          setIsAuthenticated(true);
          setSessionRole((session.user?.role as 'customer' | 'provider' | 'admin') || 'customer');
          return;
        }
        if (!supabase) {
          if (alive) setIsAuthenticated(false);
          return;
        }
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        setIsAuthenticated(Boolean(data?.user));
        if (data?.user) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
          if (alive && profile?.role) setSessionRole(profile.role as 'customer' | 'provider' | 'admin');
        }
      } catch {
        if (alive && !authUser) setIsAuthenticated(false);
      }
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
    if (!isAuthenticated) {
      setCloudSavedIds(null);
      setCloudSnapshots([]);
      return;
    }
    let alive = true;
    void fetchCloudStayWishlistIds().then((ids) => {
      if (!alive) return;
      setCloudSavedIds(ids || []);
    });
    return () => { alive = false; };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!cloudSavedIds?.length) {
      setCloudSnapshots([]);
      return;
    }
    let alive = true;
    void searchStaysByListingIds(cloudSavedIds).then((result) => {
      if (!alive || !result.ok) return;
      setCloudSnapshots(result.items);
    });
    return () => { alive = false; };
  }, [cloudSavedIds]);

  const savedIds = isAuthenticated && cloudSavedIds ? cloudSavedIds : guestSavedIds;

  // Keep the shared header's Stay category ribbon and the list in sync.
  useEffect(() => {
    if (!externalCategory) return;
    if (externalCategory === 'all') {
      setFilters((current) => ({
        ...current,
        propertyTypes: [],
        luxeVerified: false,
        minPrice: '',
        maxPrice: '',
      }));
      return;
    }
    const patch = HEADER_STAY_FILTERS[externalCategory];
    if (!patch) return;
    setFilters((current) => ({
      ...current,
      propertyTypes: [],
      luxeVerified: false,
      minPrice: '',
      maxPrice: '',
      ...patch,
    }));
  }, [externalCategory]);

  const filtersKey = useMemo(() => toSearchParams(filters).toString(), [filters]);
  const curatedGroups = useMemo(() => {
    const groups = new Map<string, StaySearchItem[]>();
    for (const item of items) {
      const city = (item.city || item.area || '').trim();
      if (!city) continue;
      const group = groups.get(city) || [];
      group.push(item);
      groups.set(city, group);
    }
    return [...groups.entries()]
      .filter(([, group]) => group.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 4)
      .map(([city, group]) => ({ city, items: group }));
  }, [items]);

  const curatedMode = !loading && !failure && !mapView && !showAllGrid
    && activeFilterCount(filters) === 0 && items.length >= 4;



  useEffect(() => {
    const closeCheckoutForConsole = () => {
      setCheckoutOpen(false);
      setCheckoutDraft(null);
      clearStayCheckoutDraft();
    };
    const onHash = () => {
      if (window.location.hash.startsWith('#admin') || window.location.hash.startsWith('#provider')) closeCheckoutForConsole();
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('bos-admin-console-open', closeCheckoutForConsole);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('bos-admin-console-open', closeCheckoutForConsole);
    };
  }, []);

  useEffect(() => {
    try {
      if (window.location.hash.startsWith('#admin') || window.location.hash.startsWith('#provider')) return;
      const draft = readStayCheckoutDraft();
      const item = draft?.item as StaySearchItem | undefined;
      if (!item?.id) return;
      setDetail(item);
      setCheckoutDraft({ item, checkIn: draft?.checkIn || '', checkOut: draft?.checkOut || '', guests: draft?.guests || 2 });
      setCheckoutOpen(true);
    } catch { /* ignore malformed drafts */ }
  }, []);

  useEffect(() => {
    const city = selectedCity?.trim();
    if (!city) return;
    setFilters((current) => current.destination === city ? current : { ...current, destination: city });
  }, [selectedCity]);

  useEffect(() => {
    // While a stay detail or checkout page is open, late filter writes must not
    // replace the URL: browsers/embeds can treat that as a navigation and
    // remount the section, closing the booking flow.
    if (detail || checkoutOpen) return;
    persistFilters(window.sessionStorage, filters);
    syncLocation(filters);
  }, [filtersKey, filters, detail, checkoutOpen]);

  useEffect(() => {
    const onPop = () => setFilters(locationFilters());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure(null);
    const run = async () => {
      const result = await searchStays(filters, { page: 0, pageSize: 24, signal: controller.signal });
      if (controller.signal.aborted) return;
      setLoading(false);
      if (result.ok) {
        setItems(result.items);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setPage(0);
      } else {
        setItems([]);
        setTotal(0);
        setHasMore(false);
        setFailure(result);
      }
    };
    void run();
    return () => controller.abort();
    // `filtersKey` is the canonical serialization of every filter value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, reloadToken]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const result = await searchStays(filters, { page: page + 1, pageSize: 24 });
    setLoadingMore(false);
    if (result.ok) {
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !seen.has(item.id))];
      });
      setTotal(result.total);
      setHasMore(result.hasMore);
      setPage((value) => value + 1);
    } else {
      showToast(result.message || 'More stays could not be loaded.');
    }
  };

  const updateFilters = (next: StayFilters) => {
    const dateError = validateStayDates(next, localDateInputValue());
    if (dateError) {
      setValidation(dateError);
      return;
    }
    const priceError = validatePriceRange(next);
    if (priceError) {
      setValidation(priceError);
      return;
    }
    setValidation('');
    setFilters(next);
  };

  const submitSearch = (value: StaySearchValue) => {
    const next: StayFilters = {
      ...filters,
      destination: value.destination,
      checkIn: value.checkIn,
      checkOut: value.checkOut,
      guests: value.guests,
      petsAllowed: value.petsAllowed,
    };
    const dateError = validateStayDates(next, localDateInputValue());
    if (dateError) { setValidation(dateError); return; }
    setValidation('');
    setFilters(next);
  };

  const toggleSaved = (id: string, snapshot?: StaySearchItem) => {
    const currentlySaved = savedIds.includes(id);
    const nextSaved = !currentlySaved;
    if (isAuthenticated) {
      setCloudSavedIds((current) => {
        const base = current || [];
        return nextSaved ? [...new Set([id, ...base])] : base.filter((value) => value !== id);
      });
      void syncCloudStayWishlist(id, nextSaved).then((ok) => {
        if (!ok) showToast('Wishlist could not be synced to your account. Try signing in again.');
      });
      return;
    }
    setGuestSavedIds((current) => {
      const next = nextSaved ? [...new Set([id, ...current])] : current.filter((value) => value !== id);
      persistGuestSavedIds(next);
      return next;
    });
    setSavedSnapshots((current) => {
      const next = nextSaved
        ? snapshot
          ? [snapshot, ...current.filter((item) => item.listingId !== snapshot.listingId)]
          : current
        : current.filter((item) => item.listingId !== id);
      persistGuestSnapshots(next);
      return next;
    });
  };

  const toggleDisplayTotal = () => {
    setDisplayTotal((current) => {
      const next = !current;
      try { window.localStorage.setItem('bos_stay_display_total_v1', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const shareStay = async (item: StaySearchItem) => {
    try {
      const url = new URL(window.location.href);
      url.hash = '#stays';
      url.searchParams.set('sf', toSearchParams({ ...filters }).toString());
      const shareData = { title: item.name, text: `${item.name} on BookOurSpace`, url: url.toString() };
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url.toString());
      showToast('Link copied to the clipboard.');
    } catch {
      showToast('This stay could not be shared. Copy the page URL instead.');
    }
  };



  const chips = activeFilterChips(filters);
  const filterCount = activeFilterCount(filters);
  const nights = (() => {
    if (!filters.checkIn || !filters.checkOut) return 0;
    const start = Date.parse(`${filters.checkIn}T00:00:00Z`);
    const end = Date.parse(`${filters.checkOut}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.round((end - start) / 86_400_000);
  })();
  const mapPoints = useMemo(
    () => items.filter((item) => {
      const lat = Number(item.latitude);
      const lng = Number(item.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98;
    }).map((item) => ({
      lat: Number(item.latitude),
      lng: Number(item.longitude),
      label: `${item.name} · ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(item.priceFromPaise / 100)}`,
      price: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(item.priceFromPaise / 100),
    })),
    [items]
  );
  const wishlistItems = useMemo(() => {
    const byId = new Map<string, StaySearchItem>();
    for (const item of [...cloudSnapshots, ...savedSnapshots, ...items]) byId.set(item.listingId, item);
    return savedIds.map((id) => byId.get(id)).filter((item): item is StaySearchItem => Boolean(item));
  }, [savedIds, savedSnapshots, cloudSnapshots, items]);
  const mappedItems = useMemo(
    () => items.filter((item) => {
      const lat = Number(item.latitude);
      const lng = Number(item.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98;
    }),
    [items]
  );

  const resultHeading = filters.destination.trim()
    ? `Stays in ${filters.destination.trim()}`
    : 'Available stays in India';

  return (
    <div
      className={inline ? 'w-full bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100' : 'fixed inset-0 z-[71] flex flex-col overflow-y-auto bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100'}
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label="BookOurSpace stays"
    >
      <header className="relative z-30 border-b border-[#ebebeb] bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className={`mx-auto flex max-w-[1760px] items-center gap-3 px-4 sm:px-6 lg:px-10 ${inline ? 'h-16' : 'h-20'}`}>
          {inline ? (
            <>
              <button
                type="button"
                onClick={onClose}
                aria-label="Back to all sections"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ebebeb] transition hover:bg-[#f7f7f7] dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="shrink-0 text-[15px] font-black text-[#f97316]">BookOurSpace Stays</span>
            </>
          ) : (
            <button type="button" onClick={onClose} aria-label="BookOurSpace home" className="flex shrink-0 items-center gap-2">
              <BookOurSpaceEmblem className="h-8 w-8" />
              <span className="hidden sm:block"><BookOurSpaceWordmark className="text-xl" /></span>
            </button>
          )}

          <div className="hidden min-w-0 flex-1 justify-center px-4 md:flex">
            <StaySearchBar onSearch={submitSearch} busy={loading} initial={{ destination: filters.destination, checkIn: filters.checkIn, checkOut: filters.checkOut, guests: filters.guests, petsAllowed: filters.petsAllowed }} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {(onStartHosting || sessionRole === 'provider' || sessionRole === 'customer' || sessionRole === 'admin') && (
              <button
                type="button"
                onClick={() => { if (sessionRole === 'provider' || sessionRole === 'customer' || sessionRole === 'admin') setHostOpen(true); else onStartHosting?.(); }}
                className="hidden min-h-[40px] items-center rounded-full px-4 text-sm font-semibold transition hover:bg-[#f7f7f7] lg:inline-flex dark:hover:bg-slate-800"
              >
                Become a host
              </button>
            )}
            <button
              type="button"
              onClick={() => setWishlistsOpen(true)}
              className="hidden min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-semibold transition hover:bg-[#f7f7f7] sm:inline-flex dark:hover:bg-slate-800"
            >
              <Heart className="h-4 w-4" aria-hidden="true" /> Wishlists
            </button>
            <button
              type="button"
              onClick={() => setTripsOpen(true)}
              className="hidden min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-semibold transition hover:bg-[#f7f7f7] md:inline-flex dark:hover:bg-slate-800"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> Trips
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Main menu"
                className="flex h-11 items-center gap-2 rounded-full border border-[#dddddd] pl-3 pr-1 transition hover:shadow-md dark:border-slate-700"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#717171] text-white">
                  <User className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-[#ebebeb] bg-white py-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <button type="button" role="menuitem" onClick={() => { setWishlistsOpen(true); setMenuOpen(false); }} className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                    Wishlists
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setTripsOpen(true); setMenuOpen(false); }} className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                    Trips
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setFiltersOpen(true); setMenuOpen(false); }} className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                    Filters
                  </button>
                  {(onStartHosting || sessionRole === 'provider' || sessionRole === 'customer' || sessionRole === 'admin') && (
                    <button type="button" role="menuitem" onClick={() => { if (sessionRole === 'provider' || sessionRole === 'customer' || sessionRole === 'admin') setHostOpen(true); else onStartHosting?.(); setMenuOpen(false); }} className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                      {sessionRole === 'provider' || sessionRole === 'admin' || sessionRole === 'customer' ? 'Host workspace' : 'List your space'}
                    </button>
                  )}
                  {sessionRole === 'provider' && onStartHosting && (
                    <button type="button" role="menuitem" onClick={() => { onStartHosting(); setMenuOpen(false); }} className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                      Add a new listing
                    </button>
                  )}
                  <button type="button" role="menuitem" onClick={onSwitchToOld} className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                    Switch to Stay 1 layout
                  </button>
                  <div className="my-1 border-t border-[#ebebeb] dark:border-slate-800" />
                  <button type="button" role="menuitem" onClick={onClose} className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
                    Back to marketplace
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 pb-3 md:hidden">
          <StaySearchBar onSearch={submitSearch} busy={loading} initial={{ destination: filters.destination, checkIn: filters.checkIn, checkOut: filters.checkOut, guests: filters.guests, petsAllowed: filters.petsAllowed }} />
        </div>
      </header>

      <StayCategoryRail
        filters={filters}
        onSelect={(category) => {
          setShowAllGrid(false);
          setMapView(false);
          updateFilters(applyStayCategory(filters, category));
        }}
      />

      <div className="mx-auto w-full max-w-[1760px] flex-1 px-4 pb-16 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div>
            <h1 className="text-[20px] font-semibold leading-tight sm:text-[24px]">{resultHeading}</h1>
            <p className="mt-0.5 text-sm text-[#717171] dark:text-slate-400">
              {loading
                ? 'Searching available stays…'
                : `${total} stay${total === 1 ? '' : 's'}${filters.checkIn && filters.checkOut ? ` for ${filters.guests} guest${filters.guests === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'}` : ' across BookOurSpace'}`}
            </p>
            {items.some((item) => item.demo) && (
              <p role="note" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Local fixture listings. These are not live Mumbai inventory or production bookings.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-[#dddddd] p-1 dark:border-slate-700" role="group" aria-label="Result view">
              <button
                type="button"
                onClick={() => setMapView(false)}
                aria-pressed={!mapView}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${!mapView ? 'bg-[#222222] text-white dark:bg-white dark:text-slate-900' : 'text-[#717171]'}`}
              >
                <BedDouble className="h-4 w-4" aria-hidden="true" /> List
              </button>
              <button
                type="button"
                onClick={() => setMapView(true)}
                aria-pressed={mapView}
                disabled={mapPoints.length === 0}
                title={mapPoints.length === 0 ? 'No stays in this result set have a published location' : undefined}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition disabled:opacity-40 ${mapView ? 'bg-[#222222] text-white dark:bg-white dark:text-slate-900' : 'text-[#717171]'}`}
              >
                <MapIcon className="h-4 w-4" aria-hidden="true" /> Map
              </button>
            </div>
            <button
              type="button"
              onClick={toggleDisplayTotal}
              aria-pressed={displayTotal}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#dddddd] px-3.5 text-sm font-semibold transition hover:border-[#222222] dark:border-slate-700"
            >
              <span className="hidden sm:inline">Display total before taxes</span>
              <span className="sm:hidden">Total</span>
              <span aria-hidden="true" className={`relative h-5 w-9 shrink-0 rounded-full transition ${displayTotal ? 'bg-[#f97316]' : 'bg-[#b0b0b0]'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${displayTotal ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
            </button>
            <select
              value={filters.sort ?? 'recommended'}
              onChange={(event) => updateFilters({ ...filters, sort: event.target.value as StayFilters['sort'] })}
              aria-label="Sort results"
              className="min-h-[40px] rounded-full border border-[#dddddd] bg-white px-3 text-sm font-semibold outline-none dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="recommended">Recommended</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="rating">Top rated</option>
            </select>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#dddddd] px-4 text-sm font-semibold transition hover:border-[#222222] dark:border-slate-700"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filters
              {filterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#222222] px-1.5 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">{filterCount}</span>
              )}
            </button>
          </div>
        </div>

        {validation && (
          <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {validation}
          </p>
        )}

        {chips.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Selected filters">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => updateFilters(removeFilterChip(filters, chip))}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#dddddd] bg-white px-3 text-xs font-semibold transition hover:border-[#222222] dark:border-slate-700 dark:bg-slate-900"
                aria-label={`Remove filter ${chip.label}`}
              >
                {chip.label}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => updateFilters(clearStayFilters(filters))}
              className="min-h-[36px] px-2 text-xs font-semibold underline underline-offset-2"
            >
              Clear all
            </button>
          </div>
        )}

        {failure && (
          <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <MapPin className="mx-auto h-7 w-7" aria-hidden="true" />
            <h2 className="mt-2 text-lg font-semibold">
              {failure.error === 'MODULE_DISABLED' ? 'Hotels & Stays is unavailable' : 'Stays could not be loaded'}
            </h2>
            <p className="mt-1 text-sm">{failure.message}</p>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              className="mt-4 min-h-[44px] rounded-xl border border-amber-400 px-4 text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        {!failure && loading && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading stays">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
              <div key={item} className="animate-pulse">
                <div className="aspect-square rounded-xl bg-[#ebebeb] dark:bg-slate-800" />
                <div className="mt-3 h-4 w-3/4 rounded bg-[#ebebeb] dark:bg-slate-800" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[#ebebeb] dark:bg-slate-800" />
                <div className="mt-2 h-3 w-1/3 rounded bg-[#ebebeb] dark:bg-slate-800" />
              </div>
            ))}
          </div>
        )}

        {!failure && !loading && items.length === 0 && (
          <div className="mx-auto max-w-lg rounded-2xl border border-[#ebebeb] px-6 py-14 text-center dark:border-slate-800">
            <Search className="mx-auto h-8 w-8 text-[#717171]" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">No exact matches</h2>
            <p className="mt-2 text-sm text-[#717171] dark:text-slate-400">
              Try a different destination, fewer guests, or remove a filter. We only show stays that are published and available — never sample listings.
            </p>
            <button
              type="button"
              onClick={() => updateFilters(clearStayFilters())}
              className="mt-5 min-h-[44px] rounded-xl bg-[#222222] px-5 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
            >
              Clear filters
            </button>
          </div>
        )}

        {!failure && !loading && items.length > 0 && !mapView && curatedMode && (
          <div className="space-y-10">
            {curatedGroups.map((group) => (
              <StayRail
                key={group.city}
                title={`Popular homes in ${group.city}`}
                subtitle={`${group.items.length} verified stay${group.items.length === 1 ? '' : 's'} in ${group.city}`}
                items={group.items}
                nights={nights}
                displayTotal={displayTotal}
                savedIds={savedIds}
                onOpen={setDetail}
                onSave={(item) => toggleSaved(item.listingId, item)}
                onShare={(item) => void shareStay(item)}
              />
            ))}
            <StayRail
              title="Top-rated stays across India"
              subtitle="Guest-favourite homes, villas and boutique stays"
              items={[...items].sort((a, b) => b.rating - a.rating).slice(0, 8)}
              nights={nights}
              displayTotal={displayTotal}
              savedIds={savedIds}
              onOpen={setDetail}
              onSave={(item) => toggleSaved(item.listingId, item)}
              onShare={(item) => void shareStay(item)}
            />
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setShowAllGrid(true)}
                className="min-h-[46px] rounded-xl border border-[#222222] px-6 text-sm font-semibold text-[#222222] transition hover:bg-[#f7f7f7] dark:border-white dark:text-white dark:hover:bg-slate-800"
              >
                Show all {total} stays
              </button>
            </div>
          </div>
        )}

        {!failure && !loading && items.length > 0 && !mapView && !curatedMode && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <StayCard
                key={item.id}
                item={item}
                nights={nights}
                displayTotal={displayTotal}
                saved={savedIds.includes(item.listingId)}
                onOpen={() => setDetail(item)}
                onSave={() => toggleSaved(item.listingId, item)}
                onShare={() => void shareStay(item)}
              />
            ))}
          </div>
        )}

        {!failure && !loading && items.length > 0 && mapView && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="order-2 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:order-1">
              {mappedItems.map((item) => (
                <StayCard
                  key={item.id}
                  item={item}
                  nights={nights}
                  displayTotal={displayTotal}
                  saved={savedIds.includes(item.listingId)}
                  onOpen={() => setDetail(item)}
                  onSave={() => toggleSaved(item.listingId, item)}
                  onShare={() => void shareStay(item)}
                />
              ))}
            </div>
            <div className="order-1 lg:order-2 lg:sticky lg:top-40 lg:h-[calc(100vh-13rem)]">
              <Suspense fallback={<div className="h-[52vh] w-full animate-pulse rounded-2xl bg-[#ebebeb] lg:h-full dark:bg-slate-800" aria-label="Loading map" />}>
                <FreeMap
                  points={mapPoints}
                  zoom={11}
                  className="h-[52vh] w-full overflow-hidden rounded-2xl border border-[#ebebeb] lg:h-full dark:border-slate-800"
                  ariaLabel="Map of stay locations"
                  onSelect={(index) => {
                    const item = mappedItems[index];
                    if (item) setDetail(item);
                  }}
                />
              </Suspense>
              <p className="mt-2 text-xs text-[#717171] dark:text-slate-400">
                Approximate locations. Exact addresses are shared after a confirmed booking.
              </p>
            </div>
          </div>
        )}

        {!failure && !loading && hasMore && (
          <div className="mt-12 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="min-h-[44px] rounded-xl border border-[#222222] px-6 text-sm font-semibold transition hover:bg-[#f7f7f7] disabled:opacity-60 dark:border-white dark:hover:bg-slate-800"
            >
              {loadingMore ? 'Loading more stays…' : 'Show more stays'}
            </button>
          </div>
        )}
      </div>

      <footer className="border-t border-[#ebebeb] bg-[#f7f7f7] pb-28 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-[1760px] px-4 pt-10 sm:px-6 lg:px-10">
          <h2 className="text-lg font-semibold">Inspiration for future getaways</h2>
          <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Jump to a city. This only changes the search filter — no extra database rows.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {INSPIRATION_CITIES.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => { setShowAllGrid(true); updateFilters({ ...filters, destination: city }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="rounded-full border border-[#dddddd] bg-white px-3 py-1.5 text-sm font-medium hover:border-[#222222] dark:border-slate-700 dark:bg-slate-900"
              >
                {city}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto grid max-w-[1760px] gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4 sm:px-6 lg:px-10">
          <div>
            <p className="text-sm font-semibold">BookOurSpace Stays</p>
            <p className="mt-2 max-w-xs text-sm text-[#717171] dark:text-slate-400">
              Verified homes, hotels and homestays across India. Every reservation is confirmed by the server before it exists.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Explore</p>
            <ul className="mt-3 space-y-2">
              {FOOTER_LINKS.map((link) => (
                <li key={link.hash}>
                  <a href={link.hash} className="text-sm text-[#222222] hover:underline dark:text-slate-200">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Your account</p>
            <ul className="mt-3 space-y-2">
              <li><button type="button" onClick={() => setTripsOpen(true)} className="text-sm hover:underline">My stays</button></li>
              <li><button type="button" onClick={() => setFiltersOpen(true)} className="text-sm hover:underline">Search filters</button></li>
              {onStartHosting && <li><button type="button" onClick={onStartHosting} className="text-sm hover:underline">List your space</button></li>}
              {sessionRole === 'provider' && <li><button type="button" onClick={() => setHostOpen(true)} className="text-sm hover:underline">Host workspace</button></li>}
              {onSignIn && <li><button type="button" onClick={onSignIn} className="text-sm hover:underline">Sign in or create an account</button></li>}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Booking safety</p>
            <ul className="mt-3 space-y-2 text-sm text-[#717171] dark:text-slate-400">
              <li>Server-side price and availability checks</li>
              <li>Double-booking prevented by the database</li>
              <li>Payments verified by the provider</li>
              <li>Pay at the property where offered</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[#dddddd] px-4 py-4 text-xs text-[#717171] sm:px-6 lg:px-10 dark:border-slate-800 dark:text-slate-400">
          © 2026 BookOurSpace. Prices in Indian Rupees (INR). No Airbnb branding or assets are used.
        </div>
      </footer>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[120] max-w-[92vw] -translate-x-1/2 rounded-xl bg-[#222222] px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
          {toast}
        </div>
      )}

      {filtersOpen && (
        <Suspense fallback={null}>
          <StayFilterDrawer
            open={filtersOpen}
            filters={filters}
            onApply={updateFilters}
            onClose={() => setFiltersOpen(false)}
          />
        </Suspense>
      )}

      {detail && !checkoutOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-[95] grid place-items-center bg-white dark:bg-slate-950"><span className="text-sm text-[#717171]">Loading stay…</span></div>}>
        <StayDetail
          item={detail}
          filters={filters}
          isAuthenticated={isAuthenticated}
          saved={savedIds.includes(detail.listingId)}
          onSave={() => toggleSaved(detail.listingId, detail)}
          onClose={() => { setDetail(null); }}
          onReserve={() => {
            try { window.sessionStorage.removeItem('bos_stay_booking_result_v1'); } catch { /* ignore */ }
            const draft = { item: detail, checkIn: filters.checkIn, checkOut: filters.checkOut, guests: filters.guests };
            setCheckoutDraft(draft);
            patchStayCheckoutDraft({
              stayStyle: 'airbnb',
              listingId: detail.listingId,
              item: detail,
              checkIn: filters.checkIn,
              checkOut: filters.checkOut,
              guests: filters.guests,
            });
            setCheckoutOpen(true);
          }}
          onPickDates={(checkIn, checkOut) => updateFilters({ ...filters, checkIn, checkOut })}
          onGuestChange={(guests) => updateFilters({ ...filters, guests })}
          onOpenTrips={() => setTripsOpen(true)}
          onShare={() => void shareStay(detail)}
          onToast={showToast}
          onSignIn={onSignIn}
        />
        </Suspense>
      )}

      {detail && checkoutOpen && (
        <StayCheckoutPage
          property={toStayProperty(detail)}
          checkIn={checkoutDraft?.checkIn || filters.checkIn}
          checkOut={checkoutDraft?.checkOut || filters.checkOut}
          guests={checkoutDraft?.guests || filters.guests}
          isAuthenticated={isAuthenticated}
          requestMode={!detail.instantBook}
          cancellationPolicy={detail.cancellationPolicy}
          onClose={() => {
            setCheckoutOpen(false);
            setCheckoutDraft(null);
            clearStayCheckoutDraft();
          }}
          onSignIn={onSignIn}
          onBooked={() => showToast('Reservation created. Open My trips to see it.')}
          onRequested={() => showToast('Request sent to the host. No payment was taken.')}
          onViewTrips={() => { setCheckoutOpen(false); setTripsOpen(true); }}
        />
      )}

      {tripsOpen && (
        <Suspense fallback={null}>
          <StayTripsPanel
            open={tripsOpen}
            isAuthenticated={isAuthenticated}
            onClose={() => setTripsOpen(false)}
            onSignIn={onSignIn}
          />
        </Suspense>
      )}

      {hostOpen && (
        <Suspense fallback={null}>
          <StayHostWorkspace
            open={hostOpen}
            role={sessionRole}
            onClose={() => setHostOpen(false)}
            onStartHosting={onStartHosting}
            onSignIn={onSignIn}
          />
        </Suspense>
      )}

      {wishlistsOpen && (
        <StayWishlistsPanel
          items={wishlistItems}
          nights={nights}
          displayTotal={displayTotal}
          onOpen={(item) => { setWishlistsOpen(false); setDetail(item); }}
          onSave={(listingId) => toggleSaved(listingId)}
          onShare={(item) => void shareStay(item)}
          onClose={() => setWishlistsOpen(false)}
        />
      )}

      {!failure && !loading && items.length > 0 && !detail && !checkoutOpen && !tripsOpen && !wishlistsOpen && (
        <button
          type="button"
          onClick={() => setMapView((open) => !open)}
          disabled={!mapView && mapPoints.length === 0}
          className="fixed bottom-28 left-1/2 z-[80] inline-flex min-h-[48px] -translate-x-1/2 items-center gap-2 rounded-full bg-[#222222] px-5 text-sm font-semibold text-white shadow-lg dark:bg-white dark:text-slate-900"
        >
          <MapIcon className="h-4 w-4" aria-hidden="true" />
          {mapView ? 'Show list' : 'Show map'}
        </button>
      )}
    </div>
  );
}
