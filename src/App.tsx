import React, { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import SafeImage, { imageCategoryFor } from './components/SafeImage';
import { BusinessInvitationAccept } from './components/business/BusinessInvitationAccept';
import SiteChrome from './components/SiteChrome';
import {
  Sparkles,
  MapPin,
  CheckCircle2,
  X,
  Wrench,
  Layers,
  Mic,
  ShieldCheck,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Search,
  Check,
  Filter,
  RotateCcw,
  Building,
  Users,
  Calendar,
  Grid,
  Store,
  Clock,
  ExternalLink,
  ChevronDown,
  Globe,
  Bell,
  Sun,
  Moon,
  Tag,
  Phone,
  MessageSquare,
  History,
  Star,
  Wifi,
  WifiOff,
  GraduationCap,
  Laptop,
  Home,
  ArrowLeftRight,
  User,
  Heart,
  Headphones,
  Gift,
  HelpCircle,
  Wallet,
  Sliders,
  Printer,
  Download,
  Pencil
} from 'lucide-react';

import { MarketplaceProvider, useMarketplace } from './context/MarketplaceContext';
import { MarketplaceListing, CustomerAction, EntityType, Booking } from './types/marketplace';
import { ServiceProvider } from './types';
import { customerActionList } from './data/customerActions';
import {
  venue12Categories,
  classCategories,
  pg29Categories,
  servicesCategories,
  hotelStayCategories,
  moviesCategories,
} from './data/moduleCategories';
import type { MarketSectionType } from './data/moduleCategories';
import { playAlertChime } from './utils/audio';
import { canAccessAdminConsole } from './lib/accessControl';
import type { SuperAdminSectionId } from './components/AdminDashboard';
import { applyLivePageOverrides } from './lib/livePageOverrides';
import { applyRemoteSectionStyles, loadSectionStyles, saveStylePreference, SECTION_STYLES_EVENT, type SectionStyles } from './lib/sectionStyleSettings';

/**
 * A deep link such as #classes/style3 must survive the later published-config
 * merge. Re-apply the route style on top of the loaded configuration so a
 * refresh keeps the style the visitor chose.
 */
function applyRouteStyleToSectionStyles(base: SectionStyles): SectionStyles {
  if (typeof window === 'undefined') return base;
  const [section, raw = ''] = window.location.hash.replace('#', '').toLowerCase().split('/');
  const style = raw === '1' || raw === 'style1' ? 1 : raw === '2' || raw === 'style2' ? 2 : raw === '3' || raw === 'style3' ? 3 : 0;
  if (!style) return base;
  // PG and Classes ship only Style 3; a stale #pg/style1 or #classes/style2
  // deep link must not re-enable the retired layouts.
  if (section === 'pg') return { ...base, pg: 'style3' };
  if (section === 'classes') return { ...base, classes: 'style3' };
  if (section === 'venues' || section === 'halls') return { ...base, venues: 'agenda' };
  if (section === 'movies' || section === 'cinema') return { ...base, movies: style === 1 ? 'experience' : style === 2 ? 'classic' : 'style3' };
  return base;
}

const ADMIN_CONSOLE_TABS: { id: SuperAdminSectionId; label: string }[] = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'data_management', label: 'Data Management' },
  { id: 'reports_analytics', label: 'Reports & Analytics' },
  { id: 'analytics_performance', label: 'Analytics' },
  { id: 'user_management', label: 'Users' },
  { id: 'listings_venues', label: 'Listings & Venues' },
  { id: 'stays', label: 'Hotels & Stays' },
  { id: 'movies_showtimes', label: 'Movies & Showtimes' },
  { id: 'bookings_events', label: 'Bookings' },
  { id: 'payment_management', label: 'Payments' },
  { id: 'content_management', label: 'Content' },
  { id: 'theme_management', label: 'Theme' },
  { id: 'ad_management', label: 'Ads' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'audit_logs', label: 'Audit Logs' },
  { id: 'app_settings', label: 'Settings' },
];

// `React.lazy` downloads a chunk as soon as the component is rendered, even
// when that component's `isOpen` prop is false. Keep modal chunks out of the
// cold-start graph, then retain them after first use so closing a modal never
// discards its internal draft state.
function useLazyAfterOpen(open: boolean): boolean {
  const mounted = useRef(open);
  if (open) mounted.current = true;
  return mounted.current;
}

function useIdleReady(enabled: boolean, delayMs = 1000): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    const timer = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [enabled, delayMs]);
  return ready;
}


import { setStoredAuthoritativeSession } from './lib/supabaseClient';
import { fetchAuthAccessConfig, type AuthAccessConfig } from './lib/authAccessClient';
import { isCustomerModuleKey, moduleKeyForSection, sectionForModuleKey, type CustomerModuleKey } from './lib/customerModuleMeta';
import { supabase } from './lib/supabaseClient';
import { SectionErrorBoundary } from './components/SectionErrorBoundary';
import { SkipToContent } from './components/SkipToContent';
import { DEMO_DATA_ENABLED } from './lib/demoDataPolicy';
import { popularAreasList, distanceRadiuses } from './data/filterOptions';

// Route- and modal-specific surfaces stay out of the initial customer bundle.
const CraftoTopServicesBar = lazy(() => import('./components/CraftoTopServicesBar').then((module) => ({ default: module.CraftoTopServicesBar })));
import { LocationSelector, loadPersistedLocation, persistLocation, type SelectedLocation } from './components/LocationSelector';
import { filterListingsByLocation, matchesSelectedLocation } from './lib/locationCityFilter';
import { isPopularCategoriesVisible } from './lib/homeVisibilitySettings';
import { applyRemoteMarketplaceVisibility } from './lib/marketplaceVisibility';
import { fetchInstituteMemberships } from './lib/instituteApi';
import { firstUsableListingImage, isUsableListingImageSource } from './lib/media/signedStorageUrl';
const FlipkartBannerSlider = lazy(() => import('./components/FlipkartBannerSlider').then((module) => ({ default: module.FlipkartBannerSlider })));
const FlipkartFilterSidebar = lazy(() => import('./components/FlipkartFilterSidebar').then((module) => ({ default: module.FlipkartFilterSidebar })));
const TrendingNearMeSection = lazy(() => import('./components/TrendingNearMeSection').then((module) => ({ default: module.TrendingNearMeSection })));
const SectionSpotlightShowcase = lazy(() => import('./components/SectionSpotlightShowcase').then((module) => ({ default: module.SectionSpotlightShowcase })));
const HallsMandapExperience = lazy(() => import('./components/HallsMandapExperience').then((module) => ({ default: module.HallsMandapExperience })));
const VenueDetailModal = lazy(() => import('./components/VenueDetailModal').then((module) => ({ default: module.VenueDetailModal })));
const VenueBookingModal = lazy(() => import('./components/VenueBookingModal').then((module) => ({ default: module.VenueBookingModal })));
const VenueAdminWorkspace = lazy(() => import('./components/VenueAdminWorkspace').then((module) => ({ default: module.VenueAdminWorkspace })));
const MoviesShowtimes = lazy(() => import('./components/MoviesShowtimes').then((module) => ({ default: module.MoviesShowtimes })));
const ServicesDiscoverySection = lazy(() => import('./components/ServicesDiscoverySection').then((module) => ({ default: module.ServicesDiscoverySection })));
const FormerLocalServicesSection = lazy(() => import('./components/FormerLocalServicesSection').then((module) => ({ default: module.FormerLocalServicesSection })));
const HotelsStayExperience = lazy(() => import('./components/HotelsStayExperience').then((module) => ({ default: module.HotelsStayExperience })));
const PGSectionExperience = lazy(() => import('./components/PGSectionExperience').then((module) => ({ default: module.PGSectionExperience })));
import { DemoBookableCard } from './components/demoBooking/DemoBookableCard';
import type { DemoSectionKey } from './components/demoBooking/demoBookableData';
const PgMyBookingsPanel = lazy(() => import('./components/PgBookingPanel').then((module) => ({ default: module.PgMyBookingsPanel })));
import { resolvePublishedPresentation } from './modules/moduleConfigStore';
import type { ModuleConfigResolution } from './modules/registry';
const HomeServicesSection = lazy(() => import('./components/HomeServicesSection').then((module) => ({ default: module.HomeServicesSection })));
const ClassesTimingsExperience = lazy(() => import('./components/ClassesTimingsExperience').then((module) => ({ default: module.ClassesTimingsExperience })));

// Universal marketplace overlays and item surfaces are loaded on demand.
const ListingCard = lazy(() => import('./components/ListingCard').then((module) => ({ default: module.ListingCard })));
const ListingDetailModal = lazy(() => import('./components/ListingDetailModal').then((module) => ({ default: module.ListingDetailModal })));
const ClassCompareModal = lazy(() => import('./components/ClassCompareModal').then((module) => ({ default: module.ClassCompareModal })));
const CompareFloatingBar = lazy(() => import('./components/CompareFloatingBar').then((module) => ({ default: module.CompareFloatingBar })));
const BookingEnquiryModal = lazy(() => import('./components/BookingEnquiryModal').then((module) => ({ default: module.BookingEnquiryModal })));
const ChatModal = lazy(() => import('./components/ChatModal').then((module) => ({ default: module.ChatModal })));
const AdminClassBatchReview = lazy(() => import('./components/AdminClassBatchReview').then((module) => ({ default: module.AdminClassBatchReview })));
const PostListingWizard = lazy(() => import('./components/PostListingWizard').then((module) => ({ default: module.PostListingWizard })));
const ProviderDashboard = lazy(() => import('./components/ProviderDashboard').then((module) => ({ default: module.ProviderDashboard })));
const ProviderOnboardingForm = lazy(() => import('./components/ProviderOnboardingForm').then((module) => ({ default: module.ProviderOnboardingForm })));
const ClassBatchManager = lazy(() => import('./components/ClassBatchManager').then((module) => ({ default: module.ClassBatchManager })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const PaymentModal = lazy(() => import('./components/PaymentModal').then((module) => ({ default: module.PaymentModal })));
const VoiceRegistrationModal = lazy(() => import('./components/VoiceRegistrationModal').then((module) => ({ default: module.VoiceRegistrationModal })));
const VoiceSearchModal = lazy(() => import('./components/VoiceSearchModal').then((module) => ({ default: module.VoiceSearchModal })));
const ReviewSubmissionModal = lazy(() => import('./components/ReviewSubmissionModal').then((module) => ({ default: module.ReviewSubmissionModal })));
const RunningBatchesModal = lazy(() => import('./components/RunningBatchesModal').then((module) => ({ default: module.RunningBatchesModal })));
const SimpleLoginPage = lazy(() => import('./components/SimpleLoginPage').then((module) => ({ default: module.SimpleLoginPage })));
const VenueAgendaView = lazy(() => import('./components/VenueAgendaView').then((module) => ({ default: module.VenueAgendaView })));

const SupabaseAuthModal = lazy(() => import('./components/SupabaseAuthModal').then((module) => ({ default: module.SupabaseAuthModal })));
const BookOurSpaceEntryExperience = lazy(() => import('./components/BookOurSpaceEntryExperience'));
const ProfileScreen = lazy(() => import('./components/ProfileScreen').then((module) => ({ default: module.ProfileScreen })));
import {
  AppLanguage,
  translations,
  getSubcategoryDisplayName,
  subcategoryTranslations,
  getProviderDisplayName,
  getListingTitle,
  getPriceUnitDisplayName
} from './utils/translations';
import {
  getUILabels,
  localizeAreaName
} from './utils/i18nEngine';
import { BOSGlobeLoadingScreen } from './components/BOSBrandLogo';
const PublishedBuilderRegion = lazy(() => import('./components/builder/PublishedBuilderRegion').then((module) => ({ default: module.PublishedBuilderRegion })));
import { SelfHealingBoundary } from './components/SelfHealingBoundary';
import { SectionStyleTabs } from './components/sectionStyle/SectionStyleTabs';
import { StyleThreeList } from './components/sectionStyle/StyleThreeList';
const UserModularTemplateBar = lazy(() => import('./components/ModularSystemEngine').then((module) => ({ default: module.UserModularTemplateBar })));
const DynamicAdminFeaturesShowcase = lazy(() => import('./components/ModularSystemEngine').then((module) => ({ default: module.DynamicAdminFeaturesShowcase })));
import {
  loadModularTemplates,
  saveModularTemplates,
  loadDynamicAdminFeatures,
  saveDynamicAdminFeatures,
  loadSpotlightSubcategoriesModuleMap,
  loadSearchDateRangeModuleMap,
  loadHomeScreenLayoutStyle,
  saveHomeScreenLayoutStyle,
} from './components/ModularSystemStore';
import type {
  ModularTemplateConfig,
  DynamicAdminFeature,
  SpotlightModuleSectionKey,
  HomeScreenLayoutStyle,
} from './components/ModularSystemStore';
const SuperAppBentoHomeHub = lazy(() => import('./components/SuperAppBentoHomeHub').then((module) => ({ default: module.SuperAppBentoHomeHub })));
const CategoryRailStreamExplorer = lazy(() => import('./components/CategoryRailStreamExplorer').then((module) => ({ default: module.CategoryRailStreamExplorer })));
const LiveSponsoredAdsStrip = lazy(() => import('./components/LiveSponsoredAdsStrip').then((module) => ({ default: module.LiveSponsoredAdsStrip })));
const LiveScheduledAnnouncementsBanner = lazy(() => import('./components/AdminAnnouncementsSection').then((module) => ({ default: module.LiveScheduledAnnouncementsBanner })));
const StandaloneBarcodeVerifierHub = lazy(() => import('./components/UniversalBarcode').then((module) => ({ default: module.StandaloneBarcodeVerifierHub })));
import { generateBosBarcodeId, getBarcodePassTitle } from './utils/bookingBarcodes';
const SwipeableBookingCard = lazy(() => import('./components/SwipeableBookingCard').then((module) => ({ default: module.SwipeableBookingCard })));
import {
  loadAdminThemeSettings,
  saveAdminThemeSettings,
  applyThemeSettingsToDocument,
  AdminThemeSettings,
} from './utils/adminPresentationStore';
import type { QuickActionModalType } from './components/UserWalletAndQuickModals';
const QuickActionModals = lazy(() => import('./components/UserWalletAndQuickModals').then((module) => ({ default: module.QuickActionModals })));
const UniversalObjectEditorModal = lazy(() => import('./components/UniversalObjectEditorModal').then((module) => ({ default: module.UniversalObjectEditorModal })));
const LiveAdminPageEditor = lazy(() => import('./components/LiveAdminPageEditor').then((module) => ({ default: module.LiveAdminPageEditor })));
const UniversalLiveBuilder = lazy(() => import('./components/UniversalLiveBuilder').then((module) => ({ default: module.UniversalLiveBuilder })));
const QuickBookChatAssistant = lazy(() => import('./components/QuickBookChatAssistant').then((module) => ({ default: module.QuickBookChatAssistant })));
import { SpotlightModuleTabs } from './components/SpotlightModuleTabs';
import { MarketplaceHero } from './components/MarketplaceHero';
import {
  LivePageEditorConfig,
  EditablePageSectionItem,
  fetchLivePageConfigFromBackend,
  loadPublishedLivePageConfig,
} from './utils/livePageEditorStore';

// Popular cities list
const popularCities = [
  'All Locations',
  'Hyderabad',
  'Bengaluru',
  'Chennai',
  'Mumbai',
  'Delhi NCR',
  'Visakhapatnam',
  'Vijayawada',
  'Pune',
  'Kolkata'
];

/**
 * Presentation-only media preparation. It NEVER removes a listing and never
 * writes to the database. It only:
 *   1. promotes the first real photo when a listing has a mix of real and
 *      dead fixture references, and
 *   2. substitutes an existing catalogue photo for a dead fixture reference
 *      (for example `images.example.com` or a missing `mock/` Storage object).
 *
 * The stored listing stays exactly as the owner/admin left it.
 */
const EXISTING_CATEGORY_PHOTOS: Record<string, string[]> = {
  pg: [
    'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=480&q=80',
    'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=480&q=80',
    'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=480&q=80',
  ],
  classes: [
    'https://images.unsplash.com/photo-1517180102446-f3ece451e9d8?auto=format&fit=crop&w=480&q=80',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=480&q=80',
  ],
  venues: [
    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=480&q=80',
    'https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=480&q=80',
  ],
  services: [
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=480&q=80',
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=480&q=80',
  ],
  stays: [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=480&q=80',
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=480&q=80',
  ],
  movies: [
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=480&q=80',
    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=480&q=80',
  ],
  general: [
    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=480&q=85',
  ],
};

function prepareListingMedia(items: MarketplaceListing[]): MarketplaceListing[] {
  return items.map((item) => {
    const category = imageCategoryFor(`${item.categoryId} ${item.subcategory} ${item.title} ${item.entityType}`);
    const photos = EXISTING_CATEGORY_PHOTOS[category] || EXISTING_CATEGORY_PHOTOS.general;
    // Stable per-listing offset keeps substitute photos varied instead of
    // showing the same catalogue image on every fixture card.
    const photoOffset = Array.from(item.id).reduce((sum, character) => sum + character.charCodeAt(0), 0) % photos.length;
    // A listing with no uploaded photo still gets a real, attractive category
    // photo on every card. The stored listing is not changed.
    if (!Array.isArray(item.images) || item.images.length === 0) {
      return { ...item, images: [photos[photoOffset]] };
    }
    const images = item.images.map((image, index) => (
      isUsableListingImageSource(image) ? image : photos[(photoOffset + index) % photos.length]
    ));
    const first = images.find((image) => isUsableListingImageSource(image)) || photos[0];
    return { ...item, images: [first, ...images.filter((image) => image !== first)] };
  });
}

function MarketplaceAppContent() {
  const {
    listings,
    categories,
    bookings,
    reviews,
    deleteBooking,
    cancelBooking,
    restoreBooking,
    userRole,
    setUserRole,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedEntityType,
    setSelectedEntityType,
    selectedCity,
    setSelectedCity,
    selectedCustomerAction,
    setSelectedCustomerAction,
    verifiedOnly,
    setVerifiedOnly,
    featuredOnly,
    setFeaturedOnly,
    sortBy,
    setSortBy,
    resetFilters,
    addListing,
    updateListing,
    updateListingStatus,
    notifications,
    markNotificationRead,
    clearAllNotifications,
    isOnline,
    isCachedData,
    lastCacheTime,
    syncOfflineCache
  } = useMarketplace();

  // Active top-level view: marketplace, provider portal, or admin console
  const [activeView, setActiveView] = useState<'marketplace' | 'provider_portal' | 'admin_console'>('marketplace');

  // Active Market Section: 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay' | 'movies'
  const [activeMarketSection, setActiveMarketSection] = useState<MarketSectionType>('pg_hostels');
  const [isServicesDiscoveryOpen, setIsServicesDiscoveryOpen] = useState(false);
  const [isFormerLocalServicesOpen, setIsFormerLocalServicesOpen] = useState(false);
  const [formerLocalInitialCategory, setFormerLocalInitialCategory] = useState<string | undefined>(undefined);
  const [isHotelsStayExperienceOpen, setIsHotelsStayExperienceOpen] = useState(false);
  const [isPGSectionOpen, setIsPGSectionOpen] = useState(false);
  const [isHomeServicesOpen, setIsHomeServicesOpen] = useState(false);
  const [isClassesTimingsOpen, setIsClassesTimingsOpen] = useState(false);
  // These screens are mutually exclusive. Keeping the four legacy booleans
  // in sync through one setter prevents a stale section from winning the
  // render precedence after a hash navigation or a page reload.
  const setOpenSection = (section: MarketSectionType | null) => {
    setIsPGSectionOpen(section === 'pg_hostels');
    setIsClassesTimingsOpen(section === 'classes');
    setIsHomeServicesOpen(section === 'services');
    setIsHotelsStayExperienceOpen(section === 'hotel_stay');
  };
  // Published admin presentation (labels/headlines) applied to the section screens.
  const [modulePresentation, setModulePresentation] = useState<Record<string, ModuleConfigResolution>>({});
  const returnSectionAfterStayRef = useRef<MarketSectionType>('pg_hostels');
  const returnSectionAfterPGRef = useRef<MarketSectionType>('pg_hostels');
  const returnSectionAfterServicesRef = useRef<MarketSectionType>('pg_hostels');

  // Section screens are deep-linkable (#pg, #services, #stays) so a section can be
  // shared or opened directly without walking the marketplace carousels.
  const clearSectionHash = () => {
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  };
  // Section screens are deep-linkable; keep the URL hash in sync when a module
  // tab is selected so dependency-driven route re-runs reopen the same screen
  // instead of clearing it or restoring a previously visited section.
  const syncSectionHash = (section: MarketSectionType) => {
    if (typeof window === 'undefined') return;
    const hashForSection: Record<MarketSectionType, string> = {
      pg_hostels: '#pg',
      classes: '#classes',
      venues: '#venues',
      services: '#services',
      hotel_stay: '#stays',
      movies: '#movies',
    };
    const nextHash = hashForSection[section];
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  };
  const previousMarketSectionRef = useRef<MarketSectionType>('pg_hostels');
  const lastAppliedSectionHashRef = useRef<string | null>(null);

  // View Mode: 'grid' vs 'map' (Toggle between Flipkart Product Grid and Live Map Hero)
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  // PG & Hostels specific filters
  const [selectedPGGender, setSelectedPGGender] = useState<string>('all');
  const [selectedPGSharing, setSelectedPGSharing] = useState<string>('all');
  const [selectedPGAC, setSelectedPGAC] = useState<string>('all');
  const [selectedPGFood, setSelectedPGFood] = useState<string>('all');

  // Classes & Courses specific filters
  const [selectedDeliveryMode, setSelectedDeliveryMode] = useState<string>('all');
  const [selectedTimingSlot, setSelectedTimingSlot] = useState<string>('all');
  const [freeTrialOnly, setFreeTrialOnly] = useState<boolean>(false);

  // Subcategory filter state (e.g. "House cleaning", "Bathroom cleaning", "Electrician", "Tap repair", "AC", etc.)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [hallsVenueType, setHallsVenueType] = useState<string>('all');

  // Distance Radius filter state: 'all' | 5 | 10 | 15 km
  const [selectedRadius, setSelectedRadius] = useState<number | 'all'>('all');

  // Price range filter state: 'all' | 'under500' | '500to1000' | 'above1000'
  const [selectedPriceRange, setSelectedPriceRange] = useState<'all' | 'under500' | '500to1000' | 'above1000'>('all');

  // Rating filter state: 'all' | 4.5 | 4.0
  const [selectedRating, setSelectedRating] = useState<'all' | 4.5 | 4.0>('all');

  // Specific Area/Neighborhood in city (e.g. "Madhapur / Hitech City", "Gachibowli", "Kukatpally", etc.)
  const [selectedArea, setSelectedArea] = useState<string>('all');

  // Premium location selector (state → district → city) shared by all modules
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState<boolean>(false);
  const [selectedLocationLabel, setSelectedLocationLabel] = useState<string>('');
  const [selectedPincode, setSelectedPincode] = useState<string | null>(null);
  const sharedSelectedCity = (() => {
    const selected = selectedCity.trim();
    if (!['all', 'all cities', 'all locations'].includes(selected.toLowerCase())) return selected;
    return selectedLocationLabel.split(',')[0]?.trim() || selected;
  })();

  useEffect(() => {
    const saved = loadPersistedLocation();
    if (!saved) return;
    setSelectedLocationLabel(saved.label ?? saved.city);
    setSelectedCity(saved.city);
    if (saved.area && saved.area !== saved.city) setSelectedArea(saved.area);
    if (saved.pincode) setSelectedPincode(saved.pincode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Date-Range Availability Filter State (YYYY-MM-DD)
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [showDateRangePopup, setShowDateRangePopup] = useState<boolean>(false);

  // Hotel Hourly Booking Toggle & Quick Action Modals State
  const [hourlyBookingOnly, setHourlyBookingOnly] = useState<boolean>(false);
  const [activeQuickModal, setActiveQuickModal] = useState<QuickActionModalType>(null);
  const siteChromeReady = useIdleReady(true, 900);
  const [isUniversalEditorOpen, setIsUniversalEditorOpen] = useState<boolean>(false);
  const [isQuickBookOpen, setIsQuickBookOpen] = useState<boolean>(false);
  const [showMoviesClassicGrid, setShowMoviesClassicGrid] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const shouldLoadAuthModal = useLazyAfterOpen(isAuthModalOpen);
  const [isLoginPageOpen, setIsLoginPageOpen] = useState<boolean>(() => window.location.hash.replace('#', '').toLowerCase() === 'login');
  const [authAccessConfig, setAuthAccessConfig] = useState<AuthAccessConfig | null>(null);
  const [isProviderOnboardingOpen, setIsProviderOnboardingOpen] = useState(false);
  const [entryExperience, setEntryExperience] = useState<'loading' | 'welcome' | 'ready'>(() => {
    try {
      const choice = localStorage.getItem('bos_entry_choice_v1');
      return choice === 'guest' || choice === 'signed-in' ? 'ready' : 'welcome';
    } catch {
      return 'welcome';
    }
  });
  const homeEnhancementsReady = useIdleReady(entryExperience === 'ready', 1200);
  const [homeSearchFocused, setHomeSearchFocused] = useState(false);
  const serverAuthReady = useRef(false);
  const [isMapExplorerOpen, setIsMapExplorerOpen] = useState<boolean>(false);
  const { favoriteIds, toggleFavorite, supabaseUser, authUser, authoritativeSessionChecked, isAccountBlocked, blockedReason, logoutGoogleSession, updateUserProfile, customerModules, customerModulesChecked } = useMarketplace();
  // The admin console is a protected route: only a signed-in admin identity may open it.
  const isAdminSession = canAccessAdminConsole(authUser?.role);
  const [instituteAccessChecked, setInstituteAccessChecked] = useState(false);
  const [hasInstituteAccess, setHasInstituteAccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!authUser) { setInstituteAccessChecked(false); setHasInstituteAccess(false); return () => { cancelled = true; }; }
    if (authUser.role !== 'customer') { setInstituteAccessChecked(true); setHasInstituteAccess(false); return () => { cancelled = true; }; }
    setInstituteAccessChecked(false);
    void fetchInstituteMemberships().then((result) => {
      if (cancelled) return;
      const hasAccess = Boolean(result.ok && result.data?.memberships?.length);
      setHasInstituteAccess(hasAccess);
      setInstituteAccessChecked(true);
      if (hasAccess && authoritativeSessionChecked) {
        setUserRole('provider');
        setActiveView('provider_portal');
      }
    });
    return () => { cancelled = true; };
  }, [authUser, authoritativeSessionChecked, setUserRole]);

  // Sections a signed-in customer is allowed to open. Null means "no customer
  // restriction in effect" (guest, provider, admin, or not yet resolved).
  const customerAuthorizedSections = useMemo<MarketSectionType[] | null>(() => {
    if (authUser?.role !== 'customer' || !customerModulesChecked) return null;
    return customerModules
      .filter((key): key is CustomerModuleKey => isCustomerModuleKey(key))
      .map((key) => sectionForModuleKey(key))
      .filter((section): section is MarketSectionType => Boolean(section));
  }, [authUser?.role, customerModules, customerModulesChecked]);

  // Public sign-in switches are administrator-controlled. Fetch once on boot
  // and refresh whenever an admin changes them in another surface.
  useEffect(() => {
    let mounted = true;
    const applyConfig = (config: AuthAccessConfig) => {
      if (!mounted) return;
      setAuthAccessConfig(config);
      try {
        if (config.available && config.guestLoginEnabled) {
          localStorage.setItem('bos_guest_login_enabled_v1', '1');
        } else {
          localStorage.removeItem('bos_guest_login_enabled_v1');
        }
      } catch {
        // Private browsing can disable storage; React still gates the button.
      }
    };
    void fetchAuthAccessConfig().then(applyConfig);
    const refresh = () => {
      void fetchAuthAccessConfig({ force: true }).then(applyConfig);
    };
    window.addEventListener('bos-auth-access-updated', refresh);
    return () => {
      mounted = false;
      window.removeEventListener('bos-auth-access-updated', refresh);
    };
  }, []);

  // Role-based routing on Google OAuth sign-in, logout redirect, & protected route enforcement
  useEffect(() => {
    if (isAccountBlocked && activeView !== 'marketplace') {
      setActiveView('marketplace');
    }
  }, [isAccountBlocked, activeView]);

  // Leaving the console must clear the #admin hash; otherwise the hash router
  // reopens the console on the next render and the admin can never browse the
  // marketplace. The header button acts as the Admin <-> Marketplace toggle.
  const previousActiveViewRef = useRef(activeView);
  useEffect(() => {
    const previous = previousActiveViewRef.current;
    previousActiveViewRef.current = activeView;
    // Only clear the deep link when actually leaving the console; clearing it
    // on first mount would erase a valid /#admin link before auth hydrates.
    if (activeView === 'admin_console' || previous !== 'admin_console') return;
    if (window.location.hash.toLowerCase().startsWith('#admin')) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, [activeView]);

  useEffect(() => {
    if (!authoritativeSessionChecked) return;
    if (activeView === 'admin_console' && !isAdminSession) {
      setActiveView(authUser?.role === 'provider' ? 'provider_portal' : 'marketplace');
    } else if (activeView === 'provider_portal' && (!authUser || (authUser.role === 'customer' && (!instituteAccessChecked || !hasInstituteAccess)))) {
      setActiveView('marketplace');
    }
  }, [authUser, activeView, authoritativeSessionChecked, isAdminSession, instituteAccessChecked, hasInstituteAccess]);

  useEffect(() => {
    if (activeMarketSection === 'hotel_stay' && !isHotelsStayExperienceOpen) {
      returnSectionAfterStayRef.current = previousMarketSectionRef.current === 'hotel_stay'
        ? 'pg_hostels'
        : previousMarketSectionRef.current;
      setOpenSection('hotel_stay');
    }
    previousMarketSectionRef.current = activeMarketSection;
  }, [activeMarketSection, isHotelsStayExperienceOpen]);

  useEffect(() => {
    const applySectionHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      // This effect re-runs when auth/session/module state hydrates. Only an
      // actual hash change may close a section the user just opened from the
      // header; otherwise every hydration would bounce PGs back to the landing.
      const hashChanged = lastAppliedSectionHashRef.current !== hash;
      lastAppliedSectionHashRef.current = hash;
      if (hash === 'login') {
        setIsLoginPageOpen(true);
        return;
      }
      setIsLoginPageOpen(false);
      // Customer-specific module access: a signed-in customer may open only the
      // sections whose module an administrator granted. Providers and admins are
      // not constrained; guests see whatever the global module flags allow.
      const customerModulesSet = new Set(customerModules);
      const customerRestricted = authUser?.role === 'customer' && customerModulesChecked;
      const canEnterSection = (section: MarketSectionType): boolean => {
        if (!customerRestricted) return true;
        const key = moduleKeyForSection(section);
        return key ? customerModulesSet.has(key) : true;
      };
      const blockSection = () => {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        setActiveView('marketplace');
        setOpenSection(null);
        showToast('🔒 This module is not available for your account.');
      };
      const [, rawStyle = ''] = hash.split('/');
      const routeStyleNumber = rawStyle === '1' || rawStyle === 'style1' ? 1
        : rawStyle === '2' || rawStyle === 'style2' ? 2
          : rawStyle === '3' || rawStyle === 'style3' ? 3
            : 0;
      if (hash === 'pg' || hash.startsWith('pg/')) {
        if (!canEnterSection('pg_hostels')) { blockSection(); return; }
        setActiveMarketSection('pg_hostels');
        setOpenSection('pg_hostels');
      } else if (hash === 'services' || hash.startsWith('services/')) {
        if (!canEnterSection('services')) { blockSection(); return; }
        setActiveMarketSection('services');
        setOpenSection('services');
      } else if (hash === 'stays' || hash === 'hotels' || hash.startsWith('stays/') || hash.startsWith('hotels/')) {
        if (!canEnterSection('hotel_stay')) { blockSection(); return; }
        setActiveMarketSection('hotel_stay');
        setOpenSection('hotel_stay');
      } else if (hash === 'classes' || hash.startsWith('classes/')) {
        if (!canEnterSection('classes')) { blockSection(); return; }
        if (routeStyleNumber) {
          setSectionStylesState((previous) => ({ ...previous, classes: 'style3' }));
        }
        setActiveMarketSection('classes');
        setOpenSection('classes');
      } else if (hash === 'venues' || hash === 'halls' || hash.startsWith('venues/') || hash.startsWith('halls/')) {
        if (!canEnterSection('venues')) { blockSection(); return; }
        if (routeStyleNumber) {
          setSectionStylesState((previous) => ({ ...previous, venues: 'agenda' }));
        }
        setActiveMarketSection('venues');
        setOpenSection(null);
      } else if (hash === 'movies' || hash === 'cinema' || hash.startsWith('movies/') || hash.startsWith('cinema/')) {
        if (!canEnterSection('movies')) { blockSection(); return; }
        if (routeStyleNumber) {
          setSectionStylesState((previous) => ({ ...previous, movies: routeStyleNumber === 1 ? 'experience' : routeStyleNumber === 2 ? 'classic' : 'style3' }));
        }
        setActiveMarketSection('movies');
        setOpenSection(null);
      } else if (hash === 'provider' || hash === 'provider_portal' || hash === 'provider_portal1' || hash.startsWith('provider/')) {
        // A URL hash is unauthenticated input and must never grant a role.
        // Signed-out visitors keep the hash so it applies once the session
        // hydrates; a signed-in non-provider is redirected to the marketplace.
        if (!authUser) return;
        if (!['provider', 'admin'].includes(authUser.role) && !(authUser.role === 'customer' && instituteAccessChecked && hasInstituteAccess)) {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
          setActiveView('marketplace');
          return;
        }
        // Older local preview links occasionally appended a trailing `1`.
        // Normalize that harmless alias so the protected provider route loads
        // instead of falling through to the marketplace screen.
        if (hash === 'provider_portal1') {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#provider_portal`);
        }
        setUserRole('provider');
        setActiveView('provider_portal');
        setOpenSection(null);
      } else if (hash === 'admin' || hash.startsWith('admin/')) {
        // A URL hash is unauthenticated input and must never grant a role.
        // Keep the hash while the persisted session is still hydrating or
        // being replaced: erasing it as soon as a stale non-admin identity is
        // observed loses a valid admin deep link before /api/auth/me resolves
        // (for example right after an account switch). The console itself only
        // opens for an admin session, so the retained hash grants nothing.
        if (!authUser) return;
        if (!isAdminSession) {
          setActiveView('marketplace');
          return;
        }
        setUserRole('admin');
        setActiveView('admin_console');
        setOpenSection(null);
      } else if (!hash.startsWith('venue-') && hashChanged) {
        setOpenSection(null);
      }
    };
    applySectionHash();
    window.addEventListener('hashchange', applySectionHash);
    return () => window.removeEventListener('hashchange', applySectionHash);
  }, [isAdminSession, authUser, instituteAccessChecked, hasInstituteAccess, customerModules, customerModulesChecked]);

  // Deep link: #venue-<id> opens the venue detail page directly (shareable links).
  useEffect(() => {
    const applyVenueHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash.startsWith('venue-')) return;
      const id = hash.slice('venue-'.length);
      const venue = listings.find((l) => l.id === id);
      if (venue) {
        setIsPGSectionOpen(false);
        setIsHomeServicesOpen(false);
        setIsClassesTimingsOpen(false);
        setIsHotelsStayExperienceOpen(false);
        setActiveMarketSection('venues');
        setSelectedDetailListing(venue);
      }
    };
    applyVenueHash();
    window.addEventListener('hashchange', applyVenueHash);
    return () => window.removeEventListener('hashchange', applyVenueHash);
  }, [listings]);

  // Deep link: #listing-<id> opens the correct customer details page directly
  // (shareable links). The modal only opens when the listing is resolvable.
  useEffect(() => {
    const applyListingHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (!/^listing[-/]/i.test(hash)) return;
      const id = decodeURIComponent(hash.slice('listing-'.length));
      if (!id) return;
      const target = listings.find((listing: any) => listing.id === id);
      if (!target) return;
      setActiveMarketSection(resolveSectionForCategory(target.categoryId));
      setSelectedDetailListing(target);
    };
    applyListingHash();
    window.addEventListener('hashchange', applyListingHash);
    return () => window.removeEventListener('hashchange', applyListingHash);
  }, [listings]);

  useEffect(() => {
    let mounted = true;
    const bootWindow = window as Window & {
      __bosBootEntryAction?: 'guest' | 'google';
      __bosQuickHomeModule?: string;
      __bosQuickHomeSearch?: string;
      __bosQuickHomeOpenLocation?: boolean;
    };
    const bootAction = bootWindow.__bosBootEntryAction;
    delete bootWindow.__bosBootEntryAction;
    if (bootAction === 'guest') setEntryExperience('ready');
    if (bootAction === 'google') setIsAuthModalOpen(true);
    const applyQuickModule = (section: string) => {
      if (!['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies'].includes(section)) return;
      setActiveMarketSection(section as MarketSectionType);
      setIsBentoLandingActive(false);
      setIsPGSectionOpen(section === 'pg_hostels');
      setIsClassesTimingsOpen(section === 'classes');
      setIsHomeServicesOpen(section === 'services');
      setIsHotelsStayExperienceOpen(section === 'hotel_stay');
    };
    if (bootWindow.__bosQuickHomeModule) applyQuickModule(bootWindow.__bosQuickHomeModule);
    if (typeof bootWindow.__bosQuickHomeSearch === 'string') setSearchQuery(bootWindow.__bosQuickHomeSearch);
    if (bootWindow.__bosQuickHomeOpenLocation) setIsLocationSelectorOpen(true);
    delete bootWindow.__bosQuickHomeModule;
    delete bootWindow.__bosQuickHomeSearch;
    delete bootWindow.__bosQuickHomeOpenLocation;
    const handleBootEntryChoice = (event: Event) => {
      const action = (event as CustomEvent<{ action?: 'guest' | 'google' }>).detail?.action;
      if (action === 'guest') setEntryExperience('ready');
      if (action === 'google') setIsAuthModalOpen(true);
    };
    window.addEventListener('bos-boot-entry-choice', handleBootEntryChoice);
    const handleQuickModule = (event: Event) => {
      const section = (event as CustomEvent<{ section?: string }>).detail?.section;
      if (section) applyQuickModule(section);
    };
    const handleQuickSearch = (event: Event) => {
      const value = (event as CustomEvent<{ value?: string }>).detail?.value;
      if (typeof value === 'string') setSearchQuery(value);
    };
    const handleQuickLocation = () => setIsLocationSelectorOpen(true);
    window.addEventListener('bos-quick-home-module', handleQuickModule);
    window.addEventListener('bos-quick-home-search', handleQuickSearch);
    window.addEventListener('bos-quick-home-location', handleQuickLocation);

    // Session restoration runs in the background; it does not gate the public
    // entry screen or the six-module marketplace.
    void supabase?.auth.getSession().then(({ data }) => {
      if (mounted && data.session?.user) setEntryExperience('ready');
    }).catch(() => {
      // Showing the public welcome screen does not depend on Supabase availability.
    });
    const entryAuthSubscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setEntryExperience('ready');
    }).data.subscription;
    const callbackParams = new URLSearchParams(window.location.search);
    const callbackError = callbackParams.get('error_description') || callbackParams.get('error');
    if (callbackError) {
      if (window.opener) {
        window.opener.postMessage({
          type: 'OAUTH_AUTH_ERROR',
          error: callbackParams.get('error') || 'OAUTH_CALLBACK_ERROR',
          message: callbackError.replace(/[+_]/g, ' '),
        }, window.location.origin);
        window.close();
      } else {
        setIsAuthModalOpen(true);
      }
    }
    const handleOAuthRedirect = (e: Event) => {
      void e;
      let returnTarget = '';
      let returnSection: MarketSectionType = 'pg_hostels';
      let returnHash = '';
      let returnPath = '/';
      try {
        returnTarget = sessionStorage.getItem('bos_profile_after_auth') || '';
        sessionStorage.removeItem('bos_profile_after_auth');
        const savedSection = sessionStorage.getItem('bos_oauth_return_section_v1');
        const allowedSections: MarketSectionType[] = ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies'];
        if (savedSection && allowedSections.includes(savedSection as MarketSectionType)) {
          returnSection = savedSection as MarketSectionType;
        }
        const savedHash = sessionStorage.getItem('bos_oauth_return_hash_v1') || '';
        if (savedHash.startsWith('#') && !savedHash.startsWith('#//')) returnHash = savedHash;
        const savedPath = sessionStorage.getItem('bos_oauth_return_path_v1') || '/';
        if (savedPath.startsWith('/') && !savedPath.startsWith('//') && !savedPath.startsWith('/auth/callback')) {
          returnPath = savedPath;
        }
        const stayDraft = sessionStorage.getItem('bos_stay_checkout_v1');
        if (stayDraft) {
          returnSection = 'hotel_stay';
          if (!returnHash.startsWith('#stays') && !returnHash.startsWith('#hotels')) {
            let stayStyle = '';
            try { stayStyle = String(JSON.parse(stayDraft)?.stayStyle || ''); } catch { stayStyle = ''; }
            returnHash = stayStyle === 'old' ? '#stays/old' : '#stays';
          }
        }
        sessionStorage.removeItem('bos_oauth_return_section_v1');
        sessionStorage.removeItem('bos_oauth_return_hash_v1');
        sessionStorage.removeItem('bos_oauth_return_path_v1');
      } catch {}
      try { localStorage.setItem('bos_entry_choice_v1', 'signed-in'); } catch { /* ignore storage failures */ }
      setEntryExperience('ready');
      setActiveView('marketplace');
      setActiveMarketSection(returnSection);
      setIsServicesDiscoveryOpen(false);
      setIsFormerLocalServicesOpen(false);
      setIsHotelsStayExperienceOpen(returnSection === 'hotel_stay');
      setIsPGSectionOpen(returnSection === 'pg_hostels');
      setIsHomeServicesOpen(returnSection === 'services');
      setIsClassesTimingsOpen(returnSection === 'classes');
      setIsBentoLandingActive(true);
      setActiveBottomTab(returnTarget === 'profile' ? 'profile' : returnTarget === 'bookings' ? 'bookings' : returnTarget === 'favorites' ? 'favorites' : 'home');
      setIsFooterProfileOpen(returnTarget === 'profile');
      setIsMyBookingsOpen(returnTarget === 'bookings');
      if (returnTarget === 'favorites') setActiveQuickModal('favorites');
      window.history.replaceState(null, '', `${returnPath}${returnHash}`);
      if (returnHash) window.dispatchEvent(new HashChangeEvent('hashchange'));
    };
    const handleOAuthLogout = () => {
      try { localStorage.removeItem('bos_entry_choice_v1'); } catch { /* ignore storage failures */ }
      setEntryExperience('ready');
      setActiveView('marketplace');
      setIsBentoLandingActive(true);
      setActiveBottomTab('home');
    };
    window.addEventListener('bos-google-oauth-redirect', handleOAuthRedirect);
    window.addEventListener('bos-google-oauth-logout', handleOAuthLogout);
    return () => {
      mounted = false;
      window.removeEventListener('bos-boot-entry-choice', handleBootEntryChoice);
      window.removeEventListener('bos-quick-home-module', handleQuickModule);
      window.removeEventListener('bos-quick-home-search', handleQuickSearch);
      window.removeEventListener('bos-quick-home-location', handleQuickLocation);
      entryAuthSubscription?.unsubscribe();
      window.removeEventListener('bos-google-oauth-redirect', handleOAuthRedirect);
      window.removeEventListener('bos-google-oauth-logout', handleOAuthLogout);
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;
    serverAuthReady.current = true;
    setEntryExperience('ready');
    try { localStorage.setItem('bos_entry_choice_v1', 'signed-in'); } catch { /* ignore storage failures */ }
  }, [authUser]);

  const todayLocalIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const shiftIsoDays = (baseIso: string, delta: number) => {
    const [y, m, d] = baseIso.split('-').map(Number);
    const dt = new Date(y || 2026, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + delta);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  // Vernacular Multi-Language state: English ('en') default, Telugu ('te'), Hindi ('hi'), etc.
  const [currentLang, setCurrentLang] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem('bos_language');
      if (saved === 'en' || saved === 'te' || saved === 'hi') return saved;
    } catch {}
    return 'en';
  });
  const t = translations[currentLang] || translations.en;
  const ui = getUILabels(currentLang);

  // Modular Self-Healing Templates & Admin Dynamic Features
  const [modularTemplates, setModularTemplates] = useState<ModularTemplateConfig[]>(() =>
    loadModularTemplates()
  );
  const [spotlightModuleMap, setSpotlightModuleMap] = useState<
    Record<SpotlightModuleSectionKey, boolean>
  >(() => loadSpotlightSubcategoriesModuleMap());
  const [dateRangeModuleMap, setDateRangeModuleMap] = useState<
    Record<SpotlightModuleSectionKey, boolean>
  >(() => loadSearchDateRangeModuleMap());
  const [dynamicFeatures, setDynamicFeatures] = useState<DynamicAdminFeature[]>(() =>
    loadDynamicAdminFeatures()
  );
  const [homeScreenStyle, setHomeScreenStyle] = useState<HomeScreenLayoutStyle>(() =>
    loadHomeScreenLayoutStyle()
  );
  const [isBentoLandingActive, setIsBentoLandingActive] = useState<boolean>(
    () => loadHomeScreenLayoutStyle() === 'bento_landing_hub'
  );

  useEffect(() => {
    const syncDynamic = () => {
      setDynamicFeatures(loadDynamicAdminFeatures());
      setModularTemplates(loadModularTemplates());
      setSpotlightModuleMap(loadSpotlightSubcategoriesModuleMap());
      setDateRangeModuleMap(loadSearchDateRangeModuleMap());
      const nextHomeStyle = loadHomeScreenLayoutStyle();
      setHomeScreenStyle(nextHomeStyle);
    };
    const handleHomeStyleChange = (ev: Event) => {
      const customEv = ev as CustomEvent<{ style?: HomeScreenLayoutStyle }>;
      const nextStyle = customEv.detail?.style || loadHomeScreenLayoutStyle();
      setHomeScreenStyle(nextStyle);
      setIsBentoLandingActive(nextStyle === 'bento_landing_hub');
    };
    window.addEventListener('bos-dynamic-schema-updated', syncDynamic);
    window.addEventListener('bos-modular-templates-updated', syncDynamic);
    window.addEventListener('bos-home-style-updated', handleHomeStyleChange);
    return () => {
      window.removeEventListener('bos-dynamic-schema-updated', syncDynamic);
      window.removeEventListener('bos-modular-templates-updated', syncDynamic);
      window.removeEventListener('bos-home-style-updated', handleHomeStyleChange);
    };
  }, []);

  // Live Admin Page Editor State (OTA Synced across Web, Android, iOS)
  const [livePageConfig, setLivePageConfig] = useState<LivePageEditorConfig>(() =>
    loadPublishedLivePageConfig()
  );
  const [isLivePageEditorOpen, setIsLivePageEditorOpen] = useState<boolean>(false);
  const [adminInlineEdit, setAdminInlineEdit] = useState<boolean>(false);
  const [adminSection, setAdminSection] = useState<SuperAdminSectionId>('dashboard');
  const [sectionStyles, setSectionStylesState] = useState<SectionStyles>(() => loadSectionStyles());
  const [isUniversalBuilderOpen, setIsUniversalBuilderOpen] = useState<boolean>(false);

  useEffect(() => {
    const syncSectionStyles = () => setSectionStylesState(loadSectionStyles());
    window.addEventListener(SECTION_STYLES_EVENT, syncSectionStyles);
    return () => window.removeEventListener(SECTION_STYLES_EVENT, syncSectionStyles);
  }, []);

  useEffect(() => {
    setShowMoviesClassicGrid(sectionStyles.movies === 'classic');
  }, [sectionStyles.movies]);

  useEffect(() => {
    if (!homeEnhancementsReady) return;
    let mounted = true;
    const refreshPublishedConfig = () => {
      void fetchLivePageConfigFromBackend()
        .then((result) => {
          if (!mounted) return;
          setLivePageConfig(result.published);
          setModulePresentation(resolvePublishedPresentation(result.published));
          const publishedConfig = result.published as { sectionStyles?: unknown; sectionStylesVersion?: number } | null;
          const applied = publishedConfig?.sectionStyles
            ? applyRemoteSectionStyles(publishedConfig.sectionStyles, publishedConfig.sectionStylesVersion)
            : null;
          if (applied) setSectionStylesState(applyRouteStyleToSectionStyles(applied));
          applyRemoteMarketplaceVisibility((result.published as { visibility?: unknown } | null)?.visibility);
        })
        .catch(() => {
          // Keep the last known local cache/default when the dev backend is unavailable.
        });
    };
    refreshPublishedConfig();
    const publishPoll = window.setInterval(refreshPublishedConfig, 20_000);
    window.addEventListener('bos-live-page-config-refresh', refreshPublishedConfig);
    const handleLivePageSync = (ev: Event) => {
      const customEv = ev as CustomEvent<{ mode: string; config: LivePageEditorConfig }>;
      if (customEv.detail?.config) {
        setLivePageConfig(customEv.detail.config);
      } else {
        setLivePageConfig(loadPublishedLivePageConfig());
      }
      setSpotlightModuleMap(loadSpotlightSubcategoriesModuleMap());
      setDateRangeModuleMap(loadSearchDateRangeModuleMap());
    };
    window.addEventListener('bos-live-page-config-updated', handleLivePageSync);
    return () => {
      mounted = false;
      window.clearInterval(publishPoll);
      window.removeEventListener('bos-live-page-config-refresh', refreshPublishedConfig);
      window.removeEventListener('bos-live-page-config-updated', handleLivePageSync);
    };
  }, [homeEnhancementsReady]);

  // Apply the published inline overrides to every visitor's page. React may
  // re-render the text later, so a debounced observer re-applies them.
  useEffect(() => {
    if (!livePageConfig) return;
    let scheduled: number | undefined;
    const apply = () => {
      try {
        applyLivePageOverrides(livePageConfig, activeMarketSection);
      } catch { /* never break rendering for an override */ }
    };
    apply();
    scheduled = window.setTimeout(apply, 350);
    const observer = new MutationObserver(() => {
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(apply, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(scheduled);
      observer.disconnect();
    };
  }, [livePageConfig, activeMarketSection, activeView]);

  const currentLivePage =
    livePageConfig.pages[activeMarketSection] || livePageConfig.pages.pg_hostels;

  const isPageSectionVisible = (secId: EditablePageSectionItem['id']): boolean => {
    const sec = currentLivePage?.sections?.find((s) => s.id === secId);
    if (secId === 'search_date_range_filter') {
      return Boolean(dateRangeModuleMap[activeMarketSection]) || Boolean(sec?.visible);
    }
    if (secId === 'spotlight_subcategories') {
      return Boolean(spotlightModuleMap[activeMarketSection]) || Boolean(sec?.visible);
    }
    if (sec) return sec.visible;
    return true;
  };

  const isTemplateEnabled = (tplId: string) => {
    if (tplId === 'search_date_range_filter') {
      return Boolean(dateRangeModuleMap[activeMarketSection]);
    }
    if (tplId === 'spotlight_subcategories') {
      return Boolean(spotlightModuleMap[activeMarketSection]);
    }
    const found = modularTemplates.find((m) => m.id === tplId);
    if (tplId === 'category_rail_stream_explorer') {
      return Boolean(found?.enabled);
    }
    if (found) return found.enabled;
    return true;
  };

  const pendingAdminListings = useMemo(
    () => listings.filter((l) => l.status === 'pending_approval'),
    [listings]
  );

  const activePublicListings = useMemo(
    () => listings.filter((l) => l.status === 'active'),
    [listings]
  );

  const resolveSectionForCategory = (catId: string, explicitSection?: unknown): MarketSectionType => {
    if (
      explicitSection === 'pg_hostels' ||
      explicitSection === 'classes' ||
      explicitSection === 'venues' ||
      explicitSection === 'services' ||
      explicitSection === 'hotel_stay' ||
      explicitSection === 'movies'
    ) {
      return explicitSection;
    }
    if (catId.startsWith('pg-')) return 'pg_hostels';
    if (catId.startsWith('class-')) return 'classes';
    if (catId.startsWith('venue-')) return 'venues';
    if (catId.startsWith('hotel-')) return 'hotel_stay';
    if (catId.startsWith('movie-')) return 'movies';
    return 'services';
  };

  const activeSectionValidCategoryIds = useMemo(() => {
    const list =
      activeMarketSection === 'pg_hostels'
        ? pg29Categories
        : activeMarketSection === 'classes'
        ? classCategories
        : activeMarketSection === 'venues'
        ? venue12Categories
        : activeMarketSection === 'services'
        ? servicesCategories
        : activeMarketSection === 'hotel_stay'
        ? hotelStayCategories
        : moviesCategories;
    return new Set(list.map((c) => c.id));
  }, [activeMarketSection]);

  // Voice Search Modal State
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState(false);

  // Compact Filter Dropdown State (Small Icon toggle)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showAllPopularCategories, setShowAllPopularCategories] = useState(false);
  const [isRailStreamExplorerOpen, setIsRailStreamExplorerOpen] = useState<boolean>(() =>
    Boolean(
      loadModularTemplates().find((m) => m.id === 'category_rail_stream_explorer')?.enabled
    )
  );

  const isRailExplorerAdminEnabled = isTemplateEnabled('category_rail_stream_explorer');

  useEffect(() => {
    setIsRailStreamExplorerOpen(isRailExplorerAdminEnabled);
  }, [isRailExplorerAdminEnabled]);

  useEffect(() => {
    setShowAllPopularCategories(false);
  }, [activeMarketSection]);

  // Dark Mode & Enterprise Theme State (synced with Admin Theme Management)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const storedMode = localStorage.getItem('theme_mode');
    if (storedMode === 'dark') return true;
    if (storedMode === 'light') return false;
    const savedTheme = loadAdminThemeSettings();
    if (savedTheme.themeMode === 'dark') return true;
    if (savedTheme.themeMode === 'light') return false;
    return Boolean(
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  });

  useEffect(() => {
    const initialTheme = loadAdminThemeSettings();
    applyThemeSettingsToDocument({
      ...initialTheme,
      themeMode: darkMode ? 'dark' : 'light',
    });

    const handleThemeUpdate = (e?: Event) => {
      const customEv = e as CustomEvent<AdminThemeSettings>;
      const activeTheme = customEv?.detail || loadAdminThemeSettings();
      applyThemeSettingsToDocument(activeTheme);
      const prefersDark =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark =
        activeTheme.themeMode === 'dark' ||
        (activeTheme.themeMode === 'system' && prefersDark);
      setDarkMode(isDark);
    };

    window.addEventListener('bos-theme-settings-updated', handleThemeUpdate);
    window.addEventListener('bos-admin-enterprise-updated', handleThemeUpdate);
    return () => {
      window.removeEventListener('bos-theme-settings-updated', handleThemeUpdate);
      window.removeEventListener('bos-admin-enterprise-updated', handleThemeUpdate);
    };
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
      localStorage.setItem('theme_mode', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
      localStorage.setItem('theme_mode', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const openHelp = () => setActiveQuickModal('help_centre');
    window.addEventListener('bos-open-help', openHelp);
    return () => window.removeEventListener('bos-open-help', openHelp);
  }, []);

  // Modals & Drawers
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);

  const [isPostWizardOpen, setIsPostWizardOpen] = useState(false);
  const [isVoiceRegisterOpen, setIsVoiceRegisterOpen] = useState(false);
  const [selectedDetailListing, setSelectedDetailListing] = useState<MarketplaceListing | null>(null);
  const [bookingListing, setBookingListing] = useState<MarketplaceListing | null>(null);
  const [chatListing, setChatListing] = useState<MarketplaceListing | null>(null);
  const [reviewListing, setReviewListing] = useState<MarketplaceListing | null>(null);
  const [runningBatchesListing, setRunningBatchesListing] = useState<MarketplaceListing | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<'home' | 'search' | 'bookings' | 'favorites' | 'profile' | 'admin'>('home');
  const [isMyBookingsOpen, setIsMyBookingsOpen] = useState(false);
  // A dialog has to be dismissible from the keyboard (WCAG 2.1.2). The My
  // Bookings overlay is a modal dialog, so Escape closes it.
  useEffect(() => {
    if (!isMyBookingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsMyBookingsOpen(false);
      setActiveBottomTab('home');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMyBookingsOpen]);
  const [lastRemovedBooking, setLastRemovedBooking] = useState<Booking | null>(null);
  const [isFooterProfileOpen, setIsFooterProfileOpen] = useState(false);

  // Class / Listing Side-by-Side Comparison State (Up to 3 classes)
  const [comparedListingIds, setComparedListingIds] = useState<string[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  const handleToggleCompare = (listing: MarketplaceListing) => {
    setComparedListingIds((prev) => {
      if (prev.includes(listing.id)) {
        const updated = prev.filter(id => id !== listing.id);
        showToast(currentLang === 'te' ? 'పోలిక నుండి తీసివేయబడింది' : 'Removed from comparison');
        return updated;
      }
      if (prev.length >= 3) {
        showToast(currentLang === 'te'
          ? 'గరిష్టంగా 3 కోర్సులను మాత్రమే ఒకేసారి సరిపోల్చవచ్చు. మరొకటి జోడించడానికి ఒకదాన్ని తీసివేయండి.'
          : 'You can compare up to 3 classes at a time. Remove one to add another.');
        return prev;
      }
      playAlertChime('confirm');
      const updated = [...prev, listing.id];
      showToast(currentLang === 'te'
        ? `⚖️ ${updated.length}/3 కోర్సులు ఎంపికయ్యాయి`
        : `⚖️ ${updated.length}/3 classes selected for comparison`);
      return updated;
    });
  };

  const handleRemoveComparedListing = (id: string) => {
    setComparedListingIds(prev => prev.filter(item => item !== id));
  };

  const handleClearAllCompared = () => {
    setComparedListingIds([]);
    showToast(currentLang === 'te' ? 'పోలిక జాబితా క్లియర్ చేయబడింది' : 'Comparison list cleared');
  };

  // Payment Modal
  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    planName: string;
    amount: number;
    listingTitle?: string;
    defaultOneRupeeTest?: boolean;
  }>({
    isOpen: false,
    planName: 'Pro Specialist',
    amount: 499,
    defaultOneRupeeTest: false
  });

  const showVoiceRegistrationModule = useLazyAfterOpen(isVoiceRegisterOpen);
  const showPostListingModule = useLazyAfterOpen(isPostWizardOpen);
  const showListingDetailModule = useLazyAfterOpen(Boolean(selectedDetailListing) && !selectedDetailListing?.categoryId.startsWith('venue-'));
  const showVenueDetailModule = useLazyAfterOpen(Boolean(selectedDetailListing?.categoryId.startsWith('venue-')));
  const showRunningBatchesModule = useLazyAfterOpen(Boolean(runningBatchesListing));
  const showBookingEnquiryModule = useLazyAfterOpen(Boolean(bookingListing && !bookingListing.categoryId.startsWith('venue-')));
  const showVenueBookingModule = useLazyAfterOpen(Boolean(bookingListing?.categoryId.startsWith('venue-')));
  const showReviewModule = useLazyAfterOpen(Boolean(reviewListing));
  const showChatModule = useLazyAfterOpen(Boolean(chatListing));
  const showPaymentModule = useLazyAfterOpen(paymentModalState.isOpen);
  const showVoiceSearchModule = useLazyAfterOpen(isVoiceSearchOpen);
  const showCompareModule = useLazyAfterOpen(isCompareModalOpen);

  // Toast indicator
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [spotlightHeroSlideIndex, setSpotlightHeroSlideIndex] = useState<number>(0);
  const [isSpotlightPaused, setIsSpotlightPaused] = useState<boolean>(false);
  const [spotlightShowcaseSyncMode, setSpotlightShowcaseSyncMode] = useState<'auto' | MarketSectionType>('auto');

  // Auto-advance Spotlight & Platform Fee showcase one-by-one across all 6 categories
  useEffect(() => {
    if (isSpotlightPaused) return;
    const timer = window.setInterval(() => {
      setSpotlightHeroSlideIndex((prev) => (prev + 1) % 6);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [isSpotlightPaused]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSelectLocation = (loc: SelectedLocation) => {
    setSelectedLocationLabel(loc.label ?? loc.city);
    setSelectedCity(loc.city);
    setSelectedArea(loc.area && loc.area !== loc.city ? loc.area : 'all');
    setSelectedPincode(loc.pincode || null);
    // Google Places content is transient under its usage terms; keep external
    // selections in memory for this session only, never in browser storage.
    persistLocation(loc.source === 'external' ? null : loc);
    showToast(
      currentLang === 'te'
        ? `లొకేషన్: ${loc.label ?? loc.city}`
        : `Location set to ${loc.label ?? loc.city}`
    );
  };

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  // Recently Viewed state with localStorage persistence
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('crafto_recently_viewed_ids');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const handleSelectListing = (listing: MarketplaceListing) => {
    setSelectedDetailListing(listing);
    setRecentlyViewedIds((prev) => {
      const updated = [listing.id, ...prev.filter(id => id !== listing.id)].slice(0, 10);
      try {
        localStorage.setItem('crafto_recently_viewed_ids', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleClearRecentlyViewed = () => {
    setRecentlyViewedIds([]);
    try {
      localStorage.removeItem('crafto_recently_viewed_ids');
    } catch {}
    showToast(currentLang === 'te' ? 'ఇటీవల చూసిన చరిత్ర క్లియర్ చేయబడింది' : 'Viewing history cleared');
  };

  // Resolve recently viewed listings strictly scoped to active section and selected category
  const recentlyViewedListings = useMemo(() => {
    return recentlyViewedIds
      .map(id => listings.find(l => l.id === id))
      .filter((l): l is MarketplaceListing => {
        if (!l || l.status !== 'active') return false;
        const itemSection = resolveSectionForCategory(l.categoryId, l.customFieldValues?.sectionType);
        if (itemSection !== activeMarketSection) return false;
        if (!activeSectionValidCategoryIds.has(l.categoryId)) return false;
        if (selectedCategory !== 'all' && l.categoryId !== selectedCategory) return false;
        return true;
      });
  }, [recentlyViewedIds, listings, activeMarketSection, activeSectionValidCategoryIds, selectedCategory]);

  // Resolve compared listings from current listings store (up to 3 classes)
  const comparedListings = useMemo(() => {
    return comparedListingIds
      .map(id => listings.find(l => l.id === id))
      .filter((l): l is MarketplaceListing => Boolean(l));
  }, [comparedListingIds, listings]);

  // Filter listings: ONLY Admin-approved ('active') listings are displayed in the Marketplace application
  const filteredListings = useMemo(() => {
    const approved = prepareListingMedia(listings).filter((item) => {
      // Strictly require Admin approval ('active') before displaying in the application
      if (item.status !== 'active') {
        return false;
      }

      // Keyword search (Multilingual Telugu, Hindi, English & Provider Matching)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const categoryObj = categories.find(c => c.id === item.categoryId);
        const venueCatObj = venue12Categories.find(c => c.id === item.categoryId);
        const classCatObj = classCategories.find(c => c.id === item.categoryId);
        const pgCatObj = pg29Categories.find(c => c.id === item.categoryId);
        const matchTitle = item.title.toLowerCase().includes(query) || (item.titleTe && item.titleTe.toLowerCase().includes(query));
        const matchDesc = item.description.toLowerCase().includes(query) || (item.descriptionTe && item.descriptionTe.toLowerCase().includes(query));
        const matchProvider = item.providerName.toLowerCase().includes(query) || (item.providerNameTe && item.providerNameTe.toLowerCase().includes(query)) || item.providerPhone.includes(query);
        const matchCatEn = (categoryObj?.name.toLowerCase().includes(query) ?? false) || (venueCatObj?.name.toLowerCase().includes(query) ?? false) || (classCatObj?.name.toLowerCase().includes(query) ?? false) || (pgCatObj?.name.toLowerCase().includes(query) ?? false);
        const matchCatTe = (venueCatObj?.nameTe.toLowerCase().includes(query) ?? false) || (classCatObj?.nameTe.toLowerCase().includes(query) ?? false) || (pgCatObj?.nameTe.toLowerCase().includes(query) ?? false);
        const matchCatHi = (venueCatObj?.nameHi.toLowerCase().includes(query) ?? false) || (classCatObj?.nameHi.toLowerCase().includes(query) ?? false) || (pgCatObj?.nameHi.toLowerCase().includes(query) ?? false);
        const matchSubcatEn = item.subcategory.toLowerCase().includes(query);
        const subcatTe = getSubcategoryDisplayName(item.subcategory, 'te').toLowerCase();
        const subcatHi = getSubcategoryDisplayName(item.subcategory, 'hi').toLowerCase();
        const matchSubcatTe = subcatTe.includes(query);
        const matchSubcatHi = subcatHi.includes(query);
        const matchCity = item.location.city.toLowerCase().includes(query);
        const matchArea = item.location.area.toLowerCase().includes(query);
        const matchEntity = item.entityType.toLowerCase().includes(query);

        // PG & Hostel Specific Synonyms
        const isPGQuery = /pg|hostel|హాస్టల్|పీజీ|coliving|co-living|బాయ్స్|గర్ల్స్|boys|girls|bachelor|student hostel|sharing room|single room|dormitory|dorm|ac pg|food pg|room only/i.test(query) && (item.categoryId.startsWith('pg-') || /pg|hostel|coliving|sharing|dorm/i.test(item.title + item.subcategory));

        // Classes & Courses Specific Synonyms
        const isClassQuery = /class|course|కోర్సు|తరగతి|tuition|ట్యూషన్|coaching|కోచింగ్|training|python|java|upsc|appsc|tspsc|dance|music|yoga|abacus|vedic|gk|neet|jee|degree|school|cbse|icse|ai|react|guitar|kuchipudi|handwriting|spoken english/i.test(query) && (item.categoryId.startsWith('class-') || /class|course|coaching|tuition|academy|training/i.test(item.title + item.subcategory));

        // Venue Specific Keywords & Vernacular Synonyms
        const isVenueQuery = /hall|హాళ్|మండపం|mandapam|కళ్యాణ|marriage|wedding|convention|కన్వెన్షన్|banquet|బాంక్వెట్|ఆడిటోరియం|auditorium|meeting|సమావేశ|గ్రౌండ్|ground|టర్ఫ్|turf|resort|రిసార్ట్|ఫామ్‌హౌస్|farmhouse|functions|stage/i.test(query) && (item.categoryId.startsWith('venue-') || /hall|mandapam|ground|auditorium|resort|function/i.test(item.title + item.subcategory));

        // Vernacular Trade Synonyms
        const isElectricianQuery = /ఎలక్ట్రి|కరెంట్|వైరింగ్|electric/i.test(query) && (item.categoryId === 'cat-2' || /electric|wire|current/i.test(item.subcategory + item.title));
        const isPlumberQuery = /ప్లంబ|పైపు|నల్లా|పంపు|వాటర్|plumb/i.test(query) && (item.categoryId === 'cat-3' || /plumb|pipe|tap|drain/i.test(item.subcategory + item.title));
        const isPainterQuery = /పెయింట్|రంగు|పుట్టీ|paint/i.test(query) && (item.categoryId === 'cat-6' || /paint|wall/i.test(item.subcategory + item.title));
        const isCarpenterQuery = /కార్పెంట|చెక్క|ఫర్నిచర్|carpenter/i.test(query) && (item.categoryId === 'cat-5' || /carpenter|wood/i.test(item.subcategory + item.title));
        const isCleanerQuery = /క్లీన్|శుభ్రం|హౌస్\s*హెల్ప్|clean/i.test(query) && (item.categoryId === 'cat-1' || item.categoryId === 'cat-9' || /clean/i.test(item.subcategory + item.title));
        const isDriverQuery = /డ్రైవర్|కార్|టాక్సీ|వ్యాన్|driver/i.test(query) && (item.categoryId === 'cat-23' || item.categoryId === 'cat-19' || item.categoryId === 'cat-20' || /driver/i.test(item.subcategory + item.title));
        const isRentalQuery = /అద్దె|రెంట్|ఫ్లాట్|ఇల్లు|room|rent/i.test(query) && (item.entityType === 'rental' || item.categoryId === 'cat-26');
        const isTuitionQuery = /ట్యూషన్|స్కూల్|టీచర్|tuition/i.test(query) && (item.categoryId === 'cat-16' || item.categoryId === 'cat-15');
        const isMedicalQuery = /డాక్టర్|నర్సు|వైద్యం|ఆరోగ్యం|nurse|doctor/i.test(query) && item.categoryId === 'cat-13';
        const isTailorQuery = /టైలర్|బట్టలు|కుట్టు|tailor/i.test(query) && item.categoryId === 'cat-32';
        const isCookQuery = /వంట|కుక్|క్యాటరింగ్|cook/i.test(query) && (item.categoryId === 'cat-31' || item.categoryId === 'cat-29');

        const isMatch = matchTitle || matchDesc || matchProvider || matchCatEn || matchCatTe || matchCatHi ||
          matchSubcatEn || matchSubcatTe || matchSubcatHi || matchCity || matchArea || matchEntity ||
          isPGQuery || isClassQuery || isVenueQuery || isElectricianQuery || isPlumberQuery || isPainterQuery || isCarpenterQuery || isCleanerQuery ||
          isDriverQuery || isRentalQuery || isTuitionQuery || isMedicalQuery || isTailorQuery || isCookQuery;

        if (!isMatch) {
          return false;
        }
      }

      // Strict Section & Category List filtering (PGs vs Classes vs Venues vs Services vs Hotel & Stay vs Movies)
      // Each section and category displays ONLY cards belonging to that exact section & category
      const itemSection = resolveSectionForCategory(
        item.categoryId,
        item.customFieldValues?.sectionType
      );
      if (itemSection !== activeMarketSection) {
        return false;
      }
      if (!activeSectionValidCategoryIds.has(item.categoryId)) {
        return false;
      }

      // Class Delivery Mode Filter (Offline, Live Online, Hybrid, 1-on-1, etc.)
      if (selectedDeliveryMode !== 'all') {
        const itemMode = String(item.customFieldValues?.classMode || '').toLowerCase();
        if (selectedDeliveryMode === 'offline' && !/offline|classroom|studio|campus/i.test(itemMode)) {
          return false;
        }
        if (selectedDeliveryMode === 'live_online' && !/online|zoom|meet|teams/i.test(itemMode)) {
          return false;
        }
        if (selectedDeliveryMode === 'hybrid' && !/hybrid/i.test(itemMode)) {
          return false;
        }
        if (selectedDeliveryMode === 'recorded' && !/recorded|video/i.test(itemMode)) {
          return false;
        }
        if (selectedDeliveryMode === 'one_on_one' && !/one|1-on-1|personal/i.test(itemMode)) {
          return false;
        }
        if (selectedDeliveryMode === 'home_tuition' && !/home/i.test(itemMode + item.subcategory)) {
          return false;
        }
        if (selectedDeliveryMode === 'free_govt' && item.price !== 0 && !/govt|free/i.test(String(item.customFieldValues?.providerType || ''))) {
          return false;
        }
      }

      // Timing Slot Filter (Early Morning, Morning, Evening, Night, Weekend)
      if (selectedTimingSlot !== 'all') {
        const itemTiming = String(item.customFieldValues?.timingSlot || item.customFieldValues?.classTimings || '').toLowerCase();
        if (selectedTimingSlot === 'early_morning' && !/early|5:00|6:00|7:00|morning/i.test(itemTiming)) return false;
        if (selectedTimingSlot === 'morning' && !/morning|8:00|9:00|10:00|11:00/i.test(itemTiming)) return false;
        if (selectedTimingSlot === 'afternoon' && !/afternoon|12:00|1:00|2:00|3:00/i.test(itemTiming)) return false;
        if (selectedTimingSlot === 'evening' && !/evening|4:00|5:00|6:00|7:00/i.test(itemTiming)) return false;
        if (selectedTimingSlot === 'night' && !/night|7:00|8:00|9:00|10:00/i.test(itemTiming)) return false;
        if (selectedTimingSlot === 'weekend' && !/weekend|saturday|sunday/i.test(itemTiming)) return false;
        if (selectedTimingSlot === 'weekday' && !/weekday|monday|tuesday|daily/i.test(itemTiming)) return false;
      }

      // Free Trial Demo Only Filter
      if (freeTrialOnly) {
        if (!item.customFieldValues?.freeTrialAvailable || !String(item.customFieldValues.freeTrialAvailable).toLowerCase().includes('yes')) {
          return false;
        }
      }

      // PG Gender Policy Filter (Boys, Girls, Co-Living, Family)
      if (selectedPGGender !== 'all') {
        const genderStr = (String(item.customFieldValues?.genderPolicy || '') + ' ' + item.subcategory + ' ' + item.title).toLowerCase();
        if (selectedPGGender === 'boys' && !/boy|men|bachelor|male/i.test(genderStr)) return false;
        if (selectedPGGender === 'girls' && !/girl|women|female|mahila/i.test(genderStr)) return false;
        if (selectedPGGender === 'coliving' && !/coliving|co-living|mixed/i.test(genderStr)) return false;
        if (selectedPGGender === 'family' && !/family|couple/i.test(genderStr)) return false;
      }

      // PG Sharing Type Filter (Single, 2-Sharing, 3-Sharing, Dormitory)
      if (selectedPGSharing !== 'all') {
        const shareStr = (String(item.customFieldValues?.roomTypesAvailable || '') + ' ' + String(item.customFieldValues?.sharingHighlight || '') + ' ' + item.subcategory).toLowerCase();
        if (selectedPGSharing === 'single' && !/single|private room/i.test(shareStr)) return false;
        if (selectedPGSharing === 'double' && !/2-sharing|double/i.test(shareStr)) return false;
        if (selectedPGSharing === 'triple' && !/3-sharing|triple/i.test(shareStr)) return false;
        if (selectedPGSharing === 'dorm' && !/dorm|bunk|4-sharing|multi/i.test(shareStr)) return false;
      }

      // PG AC Filter (AC vs Non-AC)
      if (selectedPGAC !== 'all') {
        const acStr = (String(item.customFieldValues?.roomTypesAvailable || '') + ' ' + item.title + ' ' + item.subcategory).toLowerCase();
        if (selectedPGAC === 'ac' && !/\bac\b|air condition/i.test(acStr)) return false;
        if (selectedPGAC === 'non_ac' && !/non-ac|non ac/i.test(acStr)) return false;
      }

      // PG Food Option Filter (Food included vs Room only)
      if (selectedPGFood !== 'all') {
        const foodStr = String(item.customFieldValues?.foodIncluded || '').toLowerCase();
        if (selectedPGFood === 'food_included' && !/yes|3 time|food|meal/i.test(foodStr)) return false;
        if (selectedPGFood === 'room_only' && !/no|self|room only|kitchen/i.test(foodStr)) return false;
      }

      // Customer Action Filter (9 explicit user actions)
      if (selectedCustomerAction !== 'all') {
        const actionMeta = customerActionList.find(a => a.id === selectedCustomerAction);
        if (actionMeta) {
          const isCategoryMatch = actionMeta.matchedCategoryIds.includes(item.categoryId);
          const isEntityTypeMatch =
            (selectedCustomerAction === 'apply' && (item.entityType === 'job' || item.categoryId === 'cat-15')) ||
            (selectedCustomerAction === 'rent_something' && item.entityType === 'rental') ||
            (selectedCustomerAction === 'book_space' && (item.categoryId === 'cat-30' || item.categoryId === 'cat-43')) ||
            (selectedCustomerAction === 'request_urgent_help' && (item.categoryId === 'cat-2' || item.categoryId === 'cat-3' || item.categoryId === 'cat-19' || item.categoryId === 'cat-20'));

          if (!isCategoryMatch && !isEntityTypeMatch) {
            return false;
          }
        }
      }

      // Entity type filter
      if (selectedEntityType !== 'all' && item.entityType !== selectedEntityType) {
        return false;
      }

      // Strict Category filter: each category displays ONLY cards with that exact categoryId
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
        return false;
      }

      // Subcategory filter (e.g. "House cleaning", "Bathroom cleaning", "Deep cleaning")
      if (selectedSubcategory !== 'all') {
        const sub = selectedSubcategory.toLowerCase().trim();
        const itemSub = item.subcategory.toLowerCase().trim();
        const matchSubcat = itemSub === sub || itemSub.includes(sub);
        const matchTitle = item.title.toLowerCase().includes(sub);
        if (!matchSubcat && !matchTitle) {
          return false;
        }
      }

      // City / PIN filter from the shared India location picker
      if (!matchesSelectedLocation(item.location, { city: sharedSelectedCity, pincode: selectedPincode })) {
        return false;
      }

      // Area / Locality filter (e.g. "Madhapur / Hitech City", "Gachibowli", "Kukatpally", etc.)
      if (selectedArea !== 'all' && selectedArea !== 'All Areas in City') {
        const cleanArea = selectedArea.split('/')[0].trim().toLowerCase();
        if (!item.location.area.toLowerCase().includes(cleanArea)) {
          return false;
        }
      }

      // Distance Radius filter (e.g. Within 5 km, Within 10 km)
      if (selectedRadius !== 'all') {
        const itemDist = item.distanceKm ?? item.location?.distanceKm ?? 99;
        if (itemDist > selectedRadius) {
          return false;
        }
      }

      // Price Range filter (e.g. Under ₹500, ₹500 - ₹1000, Above ₹1000)
      if (selectedPriceRange !== 'all') {
        if (selectedPriceRange === 'under500' && item.price >= 500) {
          return false;
        }
        if (selectedPriceRange === '500to1000' && (item.price < 500 || item.price > 1000)) {
          return false;
        }
        if (selectedPriceRange === 'above1000' && item.price <= 1000) {
          return false;
        }
      }

      // Rating filter (e.g. 4.5+ ⭐, 4.0+ ⭐)
      if (selectedRating !== 'all') {
        if (item.providerRating < selectedRating) {
          return false;
        }
      }

      // Verified filter
      if (verifiedOnly && !item.isVerified) {
        return false;
      }

      // Featured filter
      if (featuredOnly && !item.isFeatured) {
        return false;
      }

      // Hourly Booking filter for hotel_stay view based on supportsHourly boolean in customFieldValues
      if (activeMarketSection === 'hotel_stay' && hourlyBookingOnly) {
        const supportsHourly = Boolean(
          item.customFieldValues?.supportsHourly ??
            (item.categoryId === 'hotel-hourly' ||
              Boolean(item.customFieldValues?.hourlyPrice) ||
              item.categoryId.startsWith('hotel-'))
        );
        if (!supportsHourly) {
          return false;
        }
      }

      // Date-Range Availability Filter (checks custom availability window, blocked dates, and active bookings overlap)
      if (filterStartDate || filterEndDate) {
        const rangeStart = filterStartDate || filterEndDate;
        const rangeEnd = filterEndDate && filterEndDate >= rangeStart ? filterEndDate : rangeStart;

        const availFrom = item.customFieldValues?.availableFrom
          ? String(item.customFieldValues.availableFrom).slice(0, 10)
          : '';
        const availTo = item.customFieldValues?.availableTo
          ? String(item.customFieldValues.availableTo).slice(0, 10)
          : '';

        if (availFrom && rangeEnd < availFrom) {
          return false;
        }
        if (availTo && rangeStart > availTo) {
          return false;
        }

        // Check explicitly blocked / unavailable dates on the listing
        const rawBlocked = String(
          item.customFieldValues?.unavailableDates ||
            item.customFieldValues?.blockedDates ||
            ''
        );
        if (rawBlocked) {
          const blockedList = rawBlocked
            .split(',')
            .map((s) => s.trim().slice(0, 10))
            .filter(Boolean);
          const hasBlockedOverlap = blockedList.some(
            (bDate) => bDate >= rangeStart && bDate <= rangeEnd
          );
          if (hasBlockedOverlap) {
            return false;
          }
        }

        // Check active bookings overlap for exclusive-date reservations (Venues, Hotels, or booked slots)
        const hasBookingConflict = bookings.some((bk) => {
          if (bk.listingId !== item.id || bk.status === 'cancelled') return false;
          const bkStart = (bk.checkInDate || bk.scheduledDate || '').slice(0, 10);
          const bkEnd = (bk.checkOutDate || bk.scheduledDate || bkStart).slice(0, 10);
          if (!bkStart) return false;
          return bkStart <= rangeEnd && bkEnd >= rangeStart;
        });

        if (hasBookingConflict) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const aPin = a.id === 'cls-durgasoft-hyd' ? 2 : a.id === 'cls-nareshit-hyd' ? 1 : 0;
      const bPin = b.id === 'cls-durgasoft-hyd' ? 2 : b.id === 'cls-nareshit-hyd' ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;

      if (sortBy === 'distance_asc') {
        const distA = a.distanceKm ?? a.location?.distanceKm ?? 99;
        const distB = b.distanceKm ?? b.location?.distanceKm ?? 99;
        return distA - distB;
      }
      if (sortBy === 'featured') {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return b.providerRating - a.providerRating;
      }
      if (sortBy === 'rating') {
        return b.providerRating - a.providerRating;
      }
      if (sortBy === 'price_asc') {
        return a.price - b.price;
      }
      if (sortBy === 'price_desc') {
        return b.price - a.price;
      }
      if (sortBy === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return 0;
    });
    return approved;
  }, [
    listings,
    categories,
    bookings,
    userRole,
    activeMarketSection,
    selectedPGGender,
    selectedPGSharing,
    selectedPGAC,
    selectedPGFood,
    selectedDeliveryMode,
    selectedTimingSlot,
    freeTrialOnly,
    searchQuery,
    selectedCustomerAction,
    selectedEntityType,
    selectedCategory,
    selectedSubcategory,
    selectedRadius,
    selectedPriceRange,
    selectedRating,
    sharedSelectedCity,
    selectedPincode,
    selectedArea,
    filterStartDate,
    filterEndDate,
    verifiedOnly,
    featuredOnly,
    sortBy
  ]);

  useEffect(() => {
    // Keep the lightweight HTML entry usable while the application boots.
    // React owns welcome as soon as it paints, and owns the marketplace once
    // the visitor has chosen Guest or a restored session. Opening Google must
    // not leave production without a welcome surface after the dialog closes.
    const reactOwnsWelcome = entryExperience !== 'ready' && !authUser;
    if (entryExperience === 'ready' || reactOwnsWelcome || isAuthModalOpen) {
      document.getElementById('bos-prelaunch-screen')?.remove();
      document.getElementById('bos-quick-home-shell')?.remove();
    }
  }, [entryExperience, isAuthModalOpen, authUser]);

  // Share the selected header city with experiences that maintain their own
  // category-level filtering and data loading.
  const locationFilteredListings = useMemo(
    () => filterListingsByLocation(prepareListingMedia(listings), { city: sharedSelectedCity, pincode: selectedPincode }),
    [listings, sharedSelectedCity, selectedPincode],
  );

  // Reset all filters including subcategory, distance radius, price, rating, area, date range, PG, and class-specific filters
  const handleResetFilters = () => {
    resetFilters();
    setSelectedSubcategory('all');
    setSelectedRadius('all');
    setSelectedPriceRange('all');
    setSelectedRating('all');
    setSelectedArea('all');
    setSelectedPincode(null);
    setFilterStartDate('');
    setFilterEndDate('');
    setShowDateRangePopup(false);
    setSelectedPGGender('all');
    setSelectedPGSharing('all');
    setSelectedPGAC('all');
    setSelectedPGFood('all');
    setSelectedDeliveryMode('all');
    setSelectedTimingSlot('all');
    setFreeTrialOnly(false);
  };

  // Voice Search Handler (Supports PGs, Classes & Venues in Telugu, Hindi & English)
  const handleVoiceSearchResult = (queryText: string) => {
    setSearchQuery(queryText);
    playAlertChime('confirm');

    const lower = queryText.toLowerCase().trim();
    for (const [subcatKey, trans] of Object.entries(subcategoryTranslations)) {
      if (
        lower.includes(subcatKey.toLowerCase()) ||
        lower.includes(trans.te.toLowerCase()) ||
        lower.includes(trans.hi.toLowerCase())
      ) {
        setSelectedSubcategory(subcatKey);
        showToast(currentLang === 'te' ? `🎙️ "${queryText}" -> ${trans.te}` : `🎙️ "${queryText}"`);
        return;
      }
    }

    // Check PGs & Hostels categories
    for (const pgCat of pg29Categories) {
      if (
        lower.includes(pgCat.name.toLowerCase()) ||
        lower.includes(pgCat.nameTe.toLowerCase()) ||
        lower.includes(pgCat.nameHi.toLowerCase())
      ) {
        setActiveMarketSection('pg_hostels');
        setSelectedCategory(pgCat.id);
        setSelectedSubcategory('all');
        showToast(`🎙️ "${queryText}" -> ${pgCat.nameTe}`);
        return;
      }
      for (const sub of pgCat.subcategories) {
        if (
          lower.includes(sub.en.toLowerCase()) ||
          lower.includes(sub.te.toLowerCase()) ||
          lower.includes(sub.hi.toLowerCase())
        ) {
          setActiveMarketSection('pg_hostels');
          setSelectedCategory(pgCat.id);
          setSelectedSubcategory(sub.en);
          showToast(`🎙️ "${queryText}" -> ${sub.te}`);
          return;
        }
      }
    }

    // Check Classes & Courses categories first
    for (const cCat of classCategories) {
      if (
        lower.includes(cCat.name.toLowerCase()) ||
        lower.includes(cCat.nameTe.toLowerCase()) ||
        lower.includes(cCat.nameHi.toLowerCase())
      ) {
        setActiveMarketSection('classes');
        setSelectedCategory(cCat.id);
        setSelectedSubcategory('all');
        showToast(`🎙️ "${queryText}" -> ${cCat.nameTe}`);
        return;
      }
      for (const sub of cCat.subcategories) {
        if (
          lower.includes(sub.en.toLowerCase()) ||
          lower.includes(sub.te.toLowerCase()) ||
          lower.includes(sub.hi.toLowerCase())
        ) {
          setActiveMarketSection('classes');
          setSelectedCategory(cCat.id);
          setSelectedSubcategory(sub.en);
          showToast(`🎙️ "${queryText}" -> ${sub.te}`);
          return;
        }
      }
    }

    // Check Functional Hall & Venue categories
    for (const vCat of venue12Categories) {
      if (
        lower.includes(vCat.name.toLowerCase()) ||
        lower.includes(vCat.nameTe.toLowerCase()) ||
        lower.includes(vCat.nameHi.toLowerCase())
      ) {
        setActiveMarketSection('venues');
        setSelectedCategory(vCat.id);
        setSelectedSubcategory('all');
        showToast(`🎙️ "${queryText}" -> ${vCat.nameTe}`);
        return;
      }
      for (const sub of vCat.subcategories) {
        if (
          lower.includes(sub.en.toLowerCase()) ||
          lower.includes(sub.te.toLowerCase()) ||
          lower.includes(sub.hi.toLowerCase())
        ) {
          setActiveMarketSection('venues');
          setSelectedCategory(vCat.id);
          setSelectedSubcategory(sub.en);
          showToast(`🎙️ "${queryText}" -> ${sub.te}`);
          return;
        }
      }
    }

    showToast(`🎙️ ${t.voiceSearchingFor} "${queryText}"`);
  };

  // Voice Registration Handler
  const handleVoiceRegisterSuccess = (newProv: ServiceProvider) => {
    setIsVoiceRegisterOpen(false);
    playAlertChime('confirm');

    const tradeCategoryMap: Record<string, { catId: string; subcat: string }> = {
      electrician: { catId: 'cat-2', subcat: 'Electrician' },
      plumber: { catId: 'cat-3', subcat: 'Tap repair' },
      painter: { catId: 'cat-6', subcat: 'House painting' },
      carpenter: { catId: 'cat-5', subcat: 'Furniture making' },
      tiler: { catId: 'cat-7', subcat: 'Tiles' },
      school_driver: { catId: 'cat-23', subcat: 'Car rental / driver' },
      tailor: { catId: 'cat-32', subcat: 'Stitching' },
      docker: { catId: 'cat-24', subcat: 'Loading & Packing' },
      home_nurse: { catId: 'cat-13', subcat: 'Home Nursing' }
    };

    const mapped = tradeCategoryMap[newProv.trade] || { catId: 'cat-2', subcat: 'General Service' };

    // Add as active listing in marketplace
    addListing({
      title: `${newProv.name} - ${newProv.trade.toUpperCase()} (${newProv.locationName.split('(')[0].trim()})`,
      description: `స్థానికంగా ధృవీకరించబడిన నిపుణుడు. వాయిస్ గుర్తింపు మరియు నేరుగా ఫోన్ కాల్ బుకింగ్ అందుబాటులో ఉంది. ప్రాంతం: ${newProv.locationName}.`,
      categoryId: mapped.catId,
      subcategory: mapped.subcat,
      entityType: 'service',
      price: newProv.hourlyRate,
      priceUnit: '/day',
      currency: '₹',
      location: {
        city: 'Hyderabad',
        area: newProv.locationName.split('(')[0].replace(/[\/,\-]/g, '').trim() || 'Madhapur',
        pincode: '500081'
      },
      images: [newProv.avatar],
      providerId: newProv.id,
      providerName: newProv.name,
      providerPhone: newProv.phone,
      providerEmail: `${newProv.trade}@crafto.local`,
      providerAvatar: newProv.avatar,
      providerRating: newProv.rating,
      reviewCount: newProv.reviewCount,
      isVerified: false,
      isFeatured: false,
      status: 'pending_approval',
      customFieldValues: {
        experience: `${newProv.experienceYears} years`,
        emergency24x7: true
      },
      postingPlanId: 'plan-pro',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    });

    // Promote user to provider role and navigate to provider portal while awaiting Admin approval
    setUserRole('provider');
    setActiveView('provider_portal');
    playAlertChime('confirm');

    const successMsg = currentLang === 'te'
      ? `⏳ ${newProv.name} గారి ప్రొవైడర్ అభ్యర్థన అడ్మిన్ ఆమోదం కోసం పంపబడింది! అడ్మిన్ ఆమోదించిన వెంటనే యాప్‌లో కనిపిస్తుంది.`
      : `⏳ ${newProv.name} registered as Provider! Request sent to Admin for review. Once Admin approves, it will display in the application.`;
    showToast(successMsg);
  };

  // Selected Category Objects
  const selectedVenueCategoryObj = venue12Categories.find(c => c.id === selectedCategory);
  const selectedClassCategoryObj = classCategories.find(c => c.id === selectedCategory);
  const selectedPGCategoryObj = pg29Categories.find(c => c.id === selectedCategory);
  const selectedServiceCategoryObj = servicesCategories.find(c => c.id === selectedCategory);
  const selectedHotelCategoryObj = hotelStayCategories.find(c => c.id === selectedCategory);
  const selectedMovieCategoryObj = moviesCategories.find(c => c.id === selectedCategory);

  const navigateFromServicesDiscovery = (section: MarketSectionType, categoryId?: string) => {
    setIsServicesDiscoveryOpen(false);
    setSelectedCategory(categoryId || 'all');
    setSelectedSubcategory('all');
    if (section === 'hotel_stay') {
      returnSectionAfterStayRef.current = activeMarketSection === 'hotel_stay'
        ? 'pg_hostels'
        : activeMarketSection;
      setActiveMarketSection('hotel_stay');
      setOpenSection('hotel_stay');
      return;
    }
    if (section === 'pg_hostels') {
      returnSectionAfterPGRef.current = activeMarketSection === 'pg_hostels'
        ? 'pg_hostels'
        : activeMarketSection;
      setActiveMarketSection('pg_hostels');
      setOpenSection('pg_hostels');
      return;
    }
    if (section === 'services') {
      returnSectionAfterServicesRef.current = activeMarketSection === 'services'
        ? 'pg_hostels'
        : activeMarketSection;
      setActiveMarketSection('services');
      setOpenSection('services');
      return;
    }
    setOpenSection(null);
    setActiveMarketSection(section);
  };

  // Active Area Label for headline
  const activeAreaDisplayName = selectedArea === 'all' || selectedArea === 'All Areas in City'
    ? (sharedSelectedCity === 'All Locations' || sharedSelectedCity === 'All Cities' || sharedSelectedCity === 'all' ? 'All Cities' : sharedSelectedCity)
    : selectedArea;

  const activeCategoryList = activeMarketSection === 'pg_hostels'
    ? pg29Categories
    : activeMarketSection === 'classes'
    ? classCategories
    : activeMarketSection === 'venues'
    ? venue12Categories
    : activeMarketSection === 'services'
    ? servicesCategories
    : activeMarketSection === 'hotel_stay'
    ? hotelStayCategories
    : moviesCategories;

  // Section screens render in the page flow (below the common header) instead of
  // taking over the whole viewport, so the header stays put while content changes.
  // Other top-level views (provider portal, admin console) keep their own content.
  const activeSectionExperience: 'pg_hostels' | 'classes' | 'services' | 'hotel_stay' | 'movies' | null =
    activeView !== 'marketplace'
      ? null
      : isPGSectionOpen
      ? 'pg_hostels'
      : isClassesTimingsOpen
      ? 'classes'
      : isHomeServicesOpen
      ? 'services'
      : isHotelsStayExperienceOpen
      ? 'hotel_stay'
      : activeMarketSection === 'movies'
      ? 'movies'
      : null;

  // Exactly one curated, bookable demo card per module (demo mode only).
  const demoCardSection: DemoSectionKey | null =
    activeSectionExperience === 'pg_hostels' ? 'pg'
    : activeSectionExperience === 'classes' ? 'classes'
    : activeSectionExperience === 'services' ? 'services'
    : activeSectionExperience === 'hotel_stay' ? 'stay'
    : activeSectionExperience === 'movies' ? 'movies'
    : null;

  // Leave any open section screen and return to the landing content.
  const closeSectionScreens = () => {
    setIsPGSectionOpen(false);
    setIsHomeServicesOpen(false);
    setIsClassesTimingsOpen(false);
    setIsHotelsStayExperienceOpen(false);
    // The Movies screen is driven by activeMarketSection, so leaving any
    // section screen must also return the active section to the home default.
    setActiveMarketSection('pg_hostels');
    clearSectionHash();
  };

  const isBentoHomeScreen =
    activeView === 'marketplace' &&
    homeScreenStyle === 'bento_landing_hub' &&
    isBentoLandingActive &&
    !activeSectionExperience;

  const moduleHeaderStateRef = useRef<Partial<Record<MarketSectionType, {
    category: string;
    subcategory: string;
    search: string;
  }>>>({});

  const quickHomeHeader = (
    <header data-testid="universal-marketplace-header" className="sticky top-0 z-40 w-full border-b border-indigo-100 bg-white/95 px-3 py-2 shadow-xs backdrop-blur dark:border-indigo-950 dark:bg-slate-950/95">
      <div className="mx-auto flex max-w-7xl flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => setIsLocationSelectorOpen(true)} className="min-h-10 max-w-[42%] truncate rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200" aria-label="Select city or locality">
            {selectedLocationLabel || 'All Cities'}
          </button>
          <input type="search" value={searchQuery} onFocus={() => setHomeSearchFocused(true)} onBlur={() => setHomeSearchFocused(false)} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search PGs, classes, halls, services, stay, movies..." aria-label="Search PGs, classes, halls, services, stay, movies..." className="min-h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-900 outline-hidden focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
        </div>
        <SpotlightModuleTabs
          activeMarketSection={activeMarketSection}
          compact
          authorizedSections={customerAuthorizedSections}
          onSelectMarketSection={(section) => {
              if (customerAuthorizedSections && !customerAuthorizedSections.includes(section)) {
                showToast('🔒 This module is not available for your account.');
                return;
              }
              moduleHeaderStateRef.current[activeMarketSection] = { category: selectedCategory, subcategory: selectedSubcategory, search: searchQuery };
              const saved = moduleHeaderStateRef.current[section];
              setSelectedCategory(saved?.category ?? 'all');
              setSelectedSubcategory(saved?.subcategory ?? 'all');
              setSearchQuery(saved?.search ?? '');
              setIsBentoLandingActive(false);
              setIsServicesDiscoveryOpen(false);
              setIsPGSectionOpen(section === 'pg_hostels');
              setIsClassesTimingsOpen(section === 'classes');
              setIsHomeServicesOpen(section === 'services');
              setIsHotelsStayExperienceOpen(section === 'hotel_stay');
              if (section === 'pg_hostels') returnSectionAfterPGRef.current = activeMarketSection;
              if (section === 'hotel_stay') returnSectionAfterStayRef.current = activeMarketSection;
              if (section === 'services') returnSectionAfterServicesRef.current = activeMarketSection;
              syncSectionHash(section);
              setActiveMarketSection(section);
          }}
        />
      </div>
    </header>
  );

  const sharedMarketplaceHeader = homeEnhancementsReady && !homeSearchFocused ? (
          <Suspense fallback={quickHomeHeader}>
          <CraftoTopServicesBar
            activeMarketSection={activeMarketSection}
            authorizedSections={customerAuthorizedSections}
            onSelectMarketSection={(sec) => {
              if (customerAuthorizedSections && !customerAuthorizedSections.includes(sec)) {
                showToast('🔒 This module is not available for your account.');
                return;
              }
              moduleHeaderStateRef.current[activeMarketSection] = {
                category: selectedCategory,
                subcategory: selectedSubcategory,
                search: searchQuery,
              };
              const nextModuleState = moduleHeaderStateRef.current[sec];
              setSelectedCategory(nextModuleState?.category ?? 'all');
              setSelectedSubcategory(nextModuleState?.subcategory ?? 'all');
              setSearchQuery(nextModuleState?.search ?? '');
              if (isBentoHomeScreen) setIsBentoLandingActive(false);
              setIsServicesDiscoveryOpen(false);
              if (sec === 'hotel_stay') {
                returnSectionAfterStayRef.current = activeMarketSection === 'hotel_stay'
                  ? 'pg_hostels'
                  : activeMarketSection;
                setIsHotelsStayExperienceOpen(true);
              } else {
                setIsHotelsStayExperienceOpen(false);
              }
              if (sec === 'pg_hostels') {
                returnSectionAfterPGRef.current = activeMarketSection === 'pg_hostels'
                  ? 'pg_hostels'
                  : activeMarketSection;
                setIsPGSectionOpen(true);
              } else {
                setIsPGSectionOpen(false);
              }
              if (sec === 'services') {
                returnSectionAfterServicesRef.current = activeMarketSection === 'services'
                  ? 'pg_hostels'
                  : activeMarketSection;
                setIsHomeServicesOpen(true);
              } else {
                setIsHomeServicesOpen(false);
              }
              if (sec === 'classes') {
                setIsClassesTimingsOpen(true);
              } else {
                setIsClassesTimingsOpen(false);
              }
              syncSectionHash(sec);
              setActiveMarketSection(sec);
              showToast(
                sec === 'pg_hostels'
                  ? currentLang === 'te'
                    ? '🏠 పీజీలు & హాస్టల్స్ బుకింగ్'
                    : '🏠 PGs & Hostels Booking'
                  : sec === 'classes'
                  ? currentLang === 'te'
                    ? '🎓 తరగతులు & కోర్సుల బుకింగ్'
                    : '🎓 Classes & Courses Booking'
                  : sec === 'venues'
                  ? currentLang === 'te'
                    ? '🏛️ ఫంక్షన్ హాల్స్ & వేదికల బుకింగ్'
                    : '🏛️ Functional Hall & Venue Booking'
                  : sec === 'services'
                  ? currentLang === 'te'
                    ? '🛠️ హోమ్ & లోకల్ సర్వీసులు'
                    : '🛠️ Home & Local Services'
                  : sec === 'hotel_stay'
                  ? currentLang === 'te'
                    ? '🏨 హోటల్స్ & స్టే బుకింగ్'
                    : '🏨 Hotel & Stay Booking'
                  : currentLang === 'te'
                  ? '🎬 మూవీస్ & మల్టీప్లెక్స్ షోలు'
                  : '🎬 Movies & Multiplex Booking'
              );
            }}
            selectedCategory={selectedCategory}
            onSelectCategory={(catId) => {
              setSelectedCategory(catId);
              setSelectedSubcategory('all');
              if (isTemplateEnabled('category_rail_stream_explorer')) {
                setIsRailStreamExplorerOpen(true);
              }
              if (catId !== 'all') {
                const pgCat = pg29Categories.find(c => c.id === catId);
                const vCat = venue12Categories.find(c => c.id === catId);
                const cCat = classCategories.find(c => c.id === catId);
                const sCat = servicesCategories.find(c => c.id === catId);
                const hCat = hotelStayCategories.find(c => c.id === catId);
                const mCat = moviesCategories.find(c => c.id === catId);
                const matchedCat = pgCat || vCat || cCat || sCat || hCat || mCat;
                const catName = matchedCat
                  ? currentLang === 'te'
                    ? matchedCat.nameTe
                    : currentLang === 'hi'
                    ? matchedCat.nameHi
                    : matchedCat.name
                  : catId;
                showToast(`${catName} — ${activeAreaDisplayName}`);
              }
            }}
            selectedSubcategory={selectedSubcategory}
            onSelectSubcategory={(subcat) => {
              setSelectedSubcategory(subcat);
              if (subcat !== 'all') {
                showToast(`${subcat} — ${activeAreaDisplayName}`);
              }
            }}
            selectedPGGender={selectedPGGender}
            onSelectPGGender={(g) => {
              setSelectedPGGender(g);
              showToast(`PG Type: ${g}`);
            }}
            selectedPGSharing={selectedPGSharing}
            onSelectPGSharing={(s) => {
              setSelectedPGSharing(s);
              showToast(`Sharing: ${s}`);
            }}
            selectedPGAC={selectedPGAC}
            onSelectPGAC={(ac) => {
              setSelectedPGAC(ac);
              showToast(`AC: ${ac}`);
            }}
            selectedPGFood={selectedPGFood}
            onSelectPGFood={(f) => {
              setSelectedPGFood(f);
              showToast(`Food: ${f}`);
            }}
            selectedDeliveryMode={selectedDeliveryMode}
            onSelectDeliveryMode={(mode) => {
              setSelectedDeliveryMode(mode);
              showToast(`Delivery Mode: ${mode}`);
            }}
            selectedTimingSlot={selectedTimingSlot}
            onSelectTimingSlot={(timing) => {
              setSelectedTimingSlot(timing);
              showToast(`Timing: ${timing}`);
            }}
            freeTrialOnly={freeTrialOnly}
            onToggleFreeTrialOnly={(val) => {
              setFreeTrialOnly(val);
              showToast(val ? '🎁 Free Demo Trial Classes' : 'All Classes');
            }}
            currentLang={currentLang}
            onChangeLang={(lang) => {
              setCurrentLang(lang);
              showToast(lang === 'te' ? 'భాష: తెలుగు' : lang === 'hi' ? 'भाषा: हिंदी' : `Language: ${lang.toUpperCase()}`);
            }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenCreate={() => setIsPostWizardOpen(true)}
            onOpenVoiceSearch={() => setIsVoiceSearchOpen(true)}
            userRole={userRole}
            onSelectRole={(role) => {
              if (isAccountBlocked) {
                setActiveView('marketplace');
                showToast('🚫 Account is suspended or blocked. Protected routes are disabled.');
                return;
              }
              if (role !== 'customer' &&
                  (!authUser || (role === 'admin' ? authUser.role !== 'admin' : !['provider', 'admin'].includes(authUser.role) && !hasInstituteAccess))) {
                setActiveView('marketplace');
                showToast(role === 'admin'
                  ? '🛡️ Protected Route: Only a server-authorized administrator can access the Admin Console.'
                  : '🛡️ Sign in with a server-authorized provider account to access the Provider Portal.');
                return;
              }
              setUserRole(role);
              if (role === 'customer') setActiveView('marketplace');
              else if (role === 'provider') setActiveView('provider_portal');
              else if (role === 'admin') {
                try { window.sessionStorage.removeItem('bos_stay_checkout_v1'); } catch { /* ignore */ }
                window.dispatchEvent(new Event('bos-admin-console-open'));
                setActiveView('admin_console');
              }
            }}
            activeView={activeView}
            comparedCount={comparedListingIds.length}
            onOpenCompareModal={() => setIsCompareModalOpen(true)}
            onOpenGoogleSignIn={() => setIsAuthModalOpen(true)}
            onExitAdminConsole={() => setActiveView('marketplace')}
            externalLoginModalOpen={false}
            selectedArea={selectedArea}
            onSelectArea={(area) => {
              setSelectedArea(area);
              showToast(
                currentLang === 'te'
                  ? `లొకేషన్: ${area}`
                  : `Location set to ${area === 'all' ? 'All Areas in Hyderabad' : area}`
              );
            }}
            popularAreas={popularAreasList}
            selectedLocationLabel={selectedLocationLabel}
            onOpenLocationSelector={() => setIsLocationSelectorOpen(true)}
            unreadNotificationsCount={unreadNotificationsCount}
            onOpenNotifications={() => setShowNotificationsDropdown(true)}
            darkMode={darkMode}
            onToggleDarkMode={() => {
              const nextDark = !darkMode;
              setDarkMode(nextDark);
              const currentTheme = loadAdminThemeSettings();
              const updatedTheme: AdminThemeSettings = {
                ...currentTheme,
                themeMode: nextDark ? 'dark' : 'light',
              };
              saveAdminThemeSettings(updatedTheme);
              applyThemeSettingsToDocument(updatedTheme);
              showToast(nextDark ? '🌙 Dark Mode Enabled' : '☀️ Light Mode Enabled');
            }}
            verifiedOnly={verifiedOnly}
            onToggleVerifiedOnly={() => {
              const nextVerified = !verifiedOnly;
              setVerifiedOnly(nextVerified);
              showToast(
                nextVerified
                  ? currentLang === 'te'
                    ? '✓ వెరిఫైడ్ లిస్టింగ్‌లు మాత్రమే చూపబడుతున్నాయి'
                    : '✓ Showing Verified Listings Only'
                  : currentLang === 'te'
                  ? 'అన్ని లిస్టింగ్‌లు చూపబడుతున్నాయి'
                  : 'Showing All Listings'
              );
            }}
            onBackToHomeHub={
              homeScreenStyle === 'bento_landing_hub' && !isBentoHomeScreen
                ? () => {
                    closeSectionScreens();
                    setIsBentoLandingActive(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                : undefined
            }
            homeScreenStyle={homeScreenStyle}
            onChangeHomeScreenStyle={(nextStyle) => {
              const saved = saveHomeScreenLayoutStyle(nextStyle);
              setHomeScreenStyle(saved);
              setIsBentoLandingActive(saved === 'bento_landing_hub');
              showToast(
                saved === 'bento_landing_hub'
                  ? '📱 Switched to Super-App Bento Home Hub'
                  : '🏪 Switched to Classic Marketplace Home'
              );
            }}
            onOpenServicesDiscovery={() => {
              setOpenSection('services');
            }}
          />
          </Suspense>
  ) : quickHomeHeader;

  return (
    <Suspense fallback={<SectionScreenFallback label="Loading BookOurSpace…" />}>
    <div
      id="bos-main-content"
      tabIndex={-1}
      className={`bos-app-shell ${
        isBentoHomeScreen
          ? 'bos-app-shell-bento min-h-screen overflow-visible pb-20'
          : 'min-h-screen pb-20'
      } w-full max-w-full bg-[#F5F4FB] dark:bg-[#0A0C20] text-slate-900 dark:text-slate-100 transition-colors duration-200 flex flex-col box-border`}
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
    >
      <SkipToContent />
      {/* 360° GLOBE-ROTATING 'O' LOADING SCREEN FOR BOS — BookOurSpace */}
      <BOSGlobeLoadingScreen />

      {entryExperience !== 'ready' && !authUser && !isLoginPageOpen && (
        <Suspense fallback={null}>
          <BookOurSpaceEntryExperience
            mode={entryExperience}
            onDemoSignIn={async (role) => {
              try {
                const response = await fetch('/api/dev/demo-session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data?.ok || !data.sessionToken || !data.user) {
                  window.alert(data?.message || 'The local demo account is not available. Run npm run dev once to seed it.');
                  return;
                }
                setStoredAuthoritativeSession(data.sessionToken, data.user);
                try { localStorage.setItem('bos_entry_choice_v1', 'signed-in'); } catch { /* ignore */ }
                window.location.reload();
              } catch {
                window.alert('The local demo account could not be started.');
              }
            }}
            onGoogleSignIn={() => setIsAuthModalOpen(true)}
            onEmailSignIn={() => {
              setIsLoginPageOpen(true);
              void fetchAuthAccessConfig({ force: true }).then(setAuthAccessConfig).catch(() => {});
            }}
            guestLoginEnabled={authAccessConfig?.guestLoginEnabled === true}
            onContinueAsGuest={() => {
              try { localStorage.setItem('bos_entry_choice_v1', 'guest'); } catch { /* ignore storage failures */ }
              setEntryExperience('ready');
            }}
          />
        </Suspense>
      )}

      {DEMO_DATA_ENABLED && (
        <div
          role="status"
          className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-950"
        >
          DEVELOPMENT DEMO FIXTURES — illustrative listings, prices, ratings, availability and verification labels are not live marketplace data.
        </div>
      )}

      {/* OFFLINE STATUS BANNER (BROWSER CACHE INDICATOR) */}
      {!isOnline && (
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 px-4 py-2 text-xs font-black flex items-center justify-between border-b border-amber-600 shadow-sm animate-in slide-in-from-top-1 z-40">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
            <WifiOff className="w-4 h-4 text-slate-950 shrink-0" />
            <span>
              {currentLang === 'te'
                ? '⚡ ఆఫ్‌లైన్ మోడ్: ఇంటర్నెట్ డిస్‌కనెక్ట్ అయ్యింది. గతంలో లోడ్ చేసిన లిస్టింగ్‌లు బ్రౌజర్ కాష్ నుండి సురక్షితంగా అందుబాటులో ఉన్నాయి.'
                : '⚡ Offline Mode: Internet disconnected. Viewing previously loaded listings from browser cache.'}
            </span>
          </div>
          <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-slate-950 text-amber-300 shrink-0">
            {currentLang === 'te' ? 'కాష్ డేటా' : 'Cached Data'}
          </span>
        </div>
      )}

      {isAccountBlocked && (
        <div className="bg-rose-600 text-white px-4 py-2.5 text-xs font-black flex items-center justify-between border-b border-rose-700 shadow-md z-40">
          <div className="flex items-center gap-2">
            <span>🚫 Account Suspended / Blocked:</span>
            <span>
              {blockedReason ||
                'Your account has been suspended or blocked by an administrator. Protected actions are disabled.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="px-3 py-1 rounded-lg bg-white text-rose-700 text-[11px] font-black cursor-pointer shrink-0"
          >
            Switch Google Account
          </button>
        </div>
      )}

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-20 right-4 z-[60] bg-[#172337] text-white px-5 py-3.5 rounded-xs shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300 border-2 border-[#2874F0]">
          <CheckCircle2 className="w-5 h-5 text-[#FFE500] shrink-0" />
          <span className="text-xs sm:text-sm font-bold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-75 p-1 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SCHEDULED TOP BANNER ANNOUNCEMENTS FROM SUPER ADMIN */}
      {homeEnhancementsReady && !isBentoHomeScreen && (
        <Suspense fallback={null}>
        <LiveScheduledAnnouncementsBanner
          placement="top_banner"
          userRole={userRole}
          currentLang={currentLang}
          activeSection={activeMarketSection}
        />
        </Suspense>
      )}

      {/* SUPER-APP BENTO HOME & LANDING HUB (WHEN ENABLED BY ADMIN & USER IS ON HOME LANDING VIEW) */}
      {isBentoHomeScreen ? (
        <SuperAppBentoHomeHub
          sharedHeader={sharedMarketplaceHeader}
          activeMarketSection={activeMarketSection}
          listingCount={listings.filter((listing) => listing.status === 'active').length}
          verifiedListingCount={listings.filter((listing) => listing.status === 'active' && listing.isVerified).length}
          heroImage={listings.find((listing) => listing.status === 'active' && listing.images?.[0])?.images?.[0]}
          selectedLocationLabel={selectedLocationLabel}
          onOpenLocationSelector={() => setIsLocationSelectorOpen(true)}
          onSelectCategoryAndAdvance={(sec, catId = 'all', subcat = 'all') => {
            setActiveMarketSection(sec);
            setSelectedCategory(catId);
            setSelectedSubcategory(subcat);
            setIsBentoLandingActive(false);
            // Every module opens its own screen directly below the common header.
            setIsPGSectionOpen(sec === 'pg_hostels');
            setIsClassesTimingsOpen(sec === 'classes');
            setIsHomeServicesOpen(sec === 'services');
            setIsHotelsStayExperienceOpen(sec === 'hotel_stay');
            if (isTemplateEnabled('category_rail_stream_explorer')) {
              setIsRailStreamExplorerOpen(true);
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          currentLang={currentLang}
          onChangeLang={(lang) => {
            setCurrentLang(lang);
            showToast(
              lang === 'te'
                ? 'భాష: తెలుగు'
                : lang === 'hi'
                ? 'भाषा: हिंदी'
                : `Language: ${lang.toUpperCase()}`
            );
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenVoiceSearch={() => setIsVoiceSearchOpen(true)}
          onOpenCreate={() => setIsPostWizardOpen(true)}
          onOpenNotifications={() => setShowNotificationsDropdown(true)}
          unreadNotificationsCount={unreadNotificationsCount}
          darkMode={darkMode}
          onToggleDarkMode={() => {
            const nextDark = !darkMode;
            setDarkMode(nextDark);
            const currentTheme = loadAdminThemeSettings();
            const updatedTheme: AdminThemeSettings = {
              ...currentTheme,
              themeMode: nextDark ? 'dark' : 'light',
            };
            saveAdminThemeSettings(updatedTheme);
            applyThemeSettingsToDocument(updatedTheme);
            showToast(nextDark ? '🌙 Dark Mode Enabled' : '☀️ Light Mode Enabled');
          }}
          verifiedOnly={verifiedOnly}
          onToggleVerifiedOnly={() => {
            const nextVerified = !verifiedOnly;
            setVerifiedOnly(nextVerified);
            showToast(
              nextVerified
                ? currentLang === 'te'
                  ? '✓ వెరిఫైడ్ లిస్టింగ్‌లు మాత్రమే చూపబడుతున్నాయి'
                  : '✓ Showing Verified Listings Only'
                : currentLang === 'te'
                ? 'అన్ని లిస్టింగ్‌లు చూపబడుతున్నాయి'
                : 'Showing All Listings'
            );
          }}
          userRole={userRole}
          onSelectRole={(role) => {
            if (isAccountBlocked) {
              setActiveView('marketplace');
              showToast('🚫 Account is suspended or blocked. Protected routes are disabled.');
              return;
            }
            if (role !== 'customer' &&
                (!authUser || (role === 'admin' ? authUser.role !== 'admin' : !['provider', 'admin'].includes(authUser.role)))) {
              setActiveView('marketplace');
              showToast(role === 'admin'
                ? '🛡️ Protected Route: Only a server-authorized administrator can access the Admin Console.'
                : '🛡️ Sign in with a server-authorized provider account to access the Provider Portal.');
              return;
            }
            setUserRole(role);
            if (role === 'customer') setActiveView('marketplace');
            else if (role === 'provider') setActiveView('provider_portal');
            else if (role === 'admin') setActiveView('admin_console');
          }}
          userInitials={
            authUser?.name
              ? authUser.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
              : 'BS'
          }
          homeScreenStyle={homeScreenStyle}
          onChangeHomeScreenStyle={(nextStyle) => {
            const saved = saveHomeScreenLayoutStyle(nextStyle);
            setHomeScreenStyle(saved);
            setIsBentoLandingActive(saved === 'bento_landing_hub');
            showToast(
              saved === 'bento_landing_hub'
                ? '📱 Switched to Super-App Bento Home Hub'
                : '🏪 Switched to Classic Marketplace Home'
            );
          }}
          externalSearchOpen={activeBottomTab === 'search'}
          onCloseExternalSearch={() => setActiveBottomTab('home')}
        />
      ) : (
        <>
          {/* 1. FLIPKART SIGNATURE TOP BAR & CATEGORY RIBBON */}
          {sharedMarketplaceHeader}

          {!activeSectionExperience && (
            <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-6 lg:px-8">
              <MarketplaceHero
                currentLang={currentLang}
                selectedLocationLabel={selectedLocationLabel}
                listingCount={listings.filter((listing) => listing.status === 'active').length}
                verifiedListingCount={listings.filter((listing) => listing.status === 'active' && listing.isVerified).length}
                heroImage={listings.find((listing) => listing.status === 'active' && listing.images?.[0])?.images?.[0]}
                onOpenLocationSelector={() => setIsLocationSelectorOpen(true)}
                onExplore={() => {
                  setActiveMarketSection('pg_hostels');
                  setSelectedCategory('all');
                  setSelectedSubcategory('all');
                  setIsBentoLandingActive(false);
                  setOpenSection('pg_hostels');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}

          {/* HOME-SCREEN CHROME (announcements, spotlight carousel) — hidden while a section screen is open */}
          {!activeSectionExperience && (
            <>
          {/* SCHEDULED BELOW-HEADER ANNOUNCEMENTS FROM SUPER ADMIN */}
          <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 pt-2.5 space-y-2.5">
            {homeEnhancementsReady && <Suspense fallback={null}><LiveScheduledAnnouncementsBanner
              placement="below_header"
              userRole={userRole}
              currentLang={currentLang}
              activeSection={activeMarketSection}
            /></Suspense>}

            {/* 1A. DYNAMIC ONE-BY-ONE SPOTLIGHT DEAL 6-CATEGORY CAROUSEL WITH DISTINCT COLOR PALETTES & MULTI-COLORED FRAMED IMAGERY */}
            {false && (() => {
              const spotlightSlides = [
                {
                  id: 'spot-pg',
                  shortTab: currentLang === 'te' ? '🏠 పీజీలు' : "🏠 PG's",
                  badge: currentLang === 'te' ? 'స్పాట్‌లైట్ • పీజీ & కో-లివింగ్' : "SPOTLIGHT • PG'S & CO-LIVING",
                  headline:
                    currentLang === 'te'
                      ? 'హైదరాబాద్‌లో ప్రీమియం పీజీలు & కో-లివింగ్'
                      : "Premium PG's & Co-Living in Hyderabad",
                  subheadline:
                    currentLang === 'te'
                      ? 'సురక్షితమైనవి • వెరిఫైడ్ • ఏసీ, వైఫై & హోమ్లీ ఫుడ్'
                      : 'Safe • Verified • AC, WiFi & Homely Food Included',
                  priceMain: '₹6,500',
                  priceUnit: '/month',
                  ctaText: currentLang === 'te' ? 'పీజీలు చూడండి →' : "Explore PG's →",
                  image:
                    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=85',
                  framedPhoto:
                    'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=600&q=85',
                  cardGradient: 'from-[#2A1058]/95 via-[#431888]/88 to-[#1B103F]/70',
                  badgeClass: 'from-[#FBBF24] via-[#F59E0B] to-[#FBBF24] text-slate-950',
                  priceBadgeClass: 'from-[#6366F1] via-[#4F46E5] to-[#3730A3] border-indigo-300/40',
                  ctaClass: 'bg-white hover:bg-indigo-50 text-[#2E1065]',
                  targetSection: 'pg_hostels' as MarketSectionType,
                  categoryPills: [
                    { icon: '🏠', iconBg: 'bg-indigo-500 text-white', label: currentLang === 'te' ? 'నేరుగా పీజీ ఓనర్‌కే' : 'Direct PG Owner', toast: '🏠 Book directly with the verified PG owner!' },
                    { icon: '★', iconBg: 'bg-amber-400 text-slate-950', label: currentLang === 'te' ? 'వెరిఫైడ్ పీజీలు' : "Verified PG's", toast: "★ Physically Verified Boys, Girls & Co-Living PG's!" },
                    { icon: '🍽️', iconBg: 'bg-emerald-500 text-white', label: currentLang === 'te' ? 'ఫుడ్ + వైఫై' : 'Homely Food + WiFi', toast: '🍽️ 3-Times Homely Food + High-Speed WiFi PG options!' },
                    { icon: '📅', iconBg: 'bg-purple-500 text-white', label: currentLang === 'te' ? 'ఉచిత పీజీ విజిట్' : 'Free PG Visit', toast: '📅 Schedule a free property visit anytime!' },
                  ],
                },
                {
                  id: 'spot-halls',
                  shortTab: currentLang === 'te' ? '🏛️ ఫంక్షన్ హాల్స్' : '🏛️ Function Halls',
                  badge: currentLang === 'te' ? 'స్పాట్‌లైట్ • ఫంక్షన్ హాల్స్' : 'SPOTLIGHT • FUNCTION HALLS',
                  headline:
                    currentLang === 'te'
                      ? 'రాయల్ ఫంక్షన్ & మ్యారేజ్ హాల్స్'
                      : 'Royal Function & Marriage Halls',
                  subheadline:
                    currentLang === 'te'
                      ? 'ఏసీ బాంక్వెట్ • మ్యారేజ్ హాల్స్ • పార్టీ లాన్స్ • 100-2000 అతిథులు'
                      : 'AC Banquet • Marriage Halls • Party Lawns • 100–2000 Guests',
                  priceMain: '₹25,000',
                  priceUnit: '/event',
                  ctaText: currentLang === 'te' ? 'హాల్స్ చూడండి →' : 'Explore Function Halls →',
                  image:
                    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1000&q=85',
                  framedPhoto:
                    'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=600&q=85',
                  cardGradient: 'from-[#5B0825]/95 via-[#881337]/88 to-[#3B0619]/70',
                  badgeClass: 'from-[#FDE68A] via-[#F59E0B] to-[#FDE68A] text-slate-950',
                  priceBadgeClass: 'from-[#F43F5E] via-[#E11D48] to-[#BE123C] border-rose-300/40',
                  ctaClass: 'bg-white hover:bg-rose-50 text-[#881337]',
                  targetSection: 'venues' as MarketSectionType,
                  categoryPills: [
                    { icon: '🏛️', iconBg: 'bg-rose-500 text-white', label: currentLang === 'te' ? 'ఏసీ కళ్యాణ మండపం' : 'AC Kalyana Mandapam', toast: '🏛️ Grand AC Kalyana Mandapams & Convention Halls!' },
                    { icon: '★', iconBg: 'bg-amber-400 text-slate-950', label: currentLang === 'te' ? 'వెరిఫైడ్ హాల్స్' : 'Verified Venues', toast: '★ 100% Verified AC Banquet & Marriage Halls!' },
                    { icon: '🎉', iconBg: 'bg-pink-500 text-white', label: currentLang === 'te' ? 'స్టేజ్ & డెకర్' : 'Stage & Decor Ready', toast: '🎉 Custom floral stage decor, lighting & valet parking!' },
                    { icon: '📅', iconBg: 'bg-purple-500 text-white', label: currentLang === 'te' ? 'ఉచిత హాల్ విజిట్' : 'Free Venue Visit', toast: '📅 Book a free hall inspection & catering tasting!' },
                  ],
                },
                {
                  id: 'spot-classes',
                  shortTab: currentLang === 'te' ? '🎓 క్లాసులు' : '🎓 Classes',
                  badge: currentLang === 'te' ? 'స్పాట్‌లైట్ • క్లాసులు & కోచింగ్' : 'SPOTLIGHT • CLASSES & COACHING',
                  headline:
                    currentLang === 'te'
                      ? 'టాప్ ఐటీ, ఏఐ & అకాడెమిక్ క్లాసులు'
                      : 'Top IT, AI, Academic & Skill Classes',
                  subheadline:
                    currentLang === 'te'
                      ? 'ఉచిత డెమో • సర్టిఫైడ్ ట్యూటర్లు • ఆన్‌లైన్ & ఆఫ్‌లైన్'
                      : 'Free Live Demo • Certified Tutors • Placement Support',
                  priceMain: '₹1,999',
                  priceUnit: '/course',
                  ctaText: currentLang === 'te' ? 'క్లాసులు చూడండి →' : 'Explore Classes →',
                  image:
                    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1000&q=85',
                  framedPhoto:
                    'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=600&q=85',
                  cardGradient: 'from-[#064E3B]/95 via-[#047857]/88 to-[#042F2E]/70',
                  badgeClass: 'from-[#6EE7B7] via-[#34D399] to-[#10B981] text-slate-950',
                  priceBadgeClass: 'from-[#10B981] via-[#059669] to-[#047857] border-emerald-300/40',
                  ctaClass: 'bg-white hover:bg-emerald-50 text-[#064E3B]',
                  targetSection: 'classes' as MarketSectionType,
                  categoryPills: [
                    { icon: '🎓', iconBg: 'bg-emerald-500 text-white', label: currentLang === 'te' ? 'ఉచిత డెమో క్లాస్' : 'Free Demo Class', toast: '📅 Attend a free live demo class before enrolling!' },
                    { icon: '💻', iconBg: 'bg-teal-500 text-white', label: currentLang === 'te' ? 'ఆన్‌లైన్ & ఆఫ్‌లైన్' : 'Online & Classroom', toast: '💻 Flexible weekend & weekday live batches!' },
                    { icon: '💼', iconBg: 'bg-amber-400 text-slate-950', label: currentLang === 'te' ? 'ప్లేస్‌మెంట్ సపోర్ట్' : 'Placement Track', toast: '💼 Dedicated placement & interview prep batches!' },
                    { icon: '🎸', iconBg: 'bg-cyan-500 text-white', label: currentLang === 'te' ? 'మ్యూజిక్ & డాన్స్' : 'Music, Dance & Arts', toast: '🎸 Explore Guitar, Classical Dance, Yoga & Fitness batches!' },
                  ],
                },
                {
                  id: 'spot-stay',
                  shortTab: currentLang === 'te' ? '🏨 లాడ్జ్ & రిసార్ట్' : '🏨 Lodge, Resort & Stay',
                  badge: currentLang === 'te' ? 'స్పాట్‌లైట్ • లాడ్జ్, రిసార్ట్ & హోమ్‌స్టే' : 'SPOTLIGHT • LODGE, RESORT, STAY & HOMESTAY',
                  headline:
                    currentLang === 'te'
                      ? 'లాడ్జీలు, రిసార్ట్స్, స్టే & హోమ్‌స్టేలు'
                      : 'Lodges, Resorts, Stays & Homestays',
                  subheadline:
                    currentLang === 'te'
                      ? 'అవర్లీ & నైట్ స్టే • పూల్ రిసార్ట్స్ • ఫ్యామిలీ హోమ్‌స్టే'
                      : 'Hourly & Night Stay • Weekend Resorts • Family Homestays',
                  priceMain: '₹799',
                  priceUnit: '/night',
                  ctaText: currentLang === 'te' ? 'స్టే చూడండి →' : 'Explore Lodge & Resort →',
                  image:
                    'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1000&q=85',
                  framedPhoto:
                    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=600&q=85',
                  cardGradient: 'from-[#6B2708]/95 via-[#B45309]/88 to-[#431407]/70',
                  badgeClass: 'from-[#FDE68A] via-[#FBBF24] to-[#F59E0B] text-slate-950',
                  priceBadgeClass: 'from-[#F59E0B] via-[#D97706] to-[#B45309] border-amber-300/40',
                  ctaClass: 'bg-white hover:bg-amber-50 text-[#78350F]',
                  targetSection: 'hotel_stay' as MarketSectionType,
                  categoryPills: [
                    { icon: '🏨', iconBg: 'bg-orange-500 text-white', label: currentLang === 'te' ? 'ఏసీ లాడ్జ్ & రిసార్ట్' : 'AC Lodges & Suites', toast: '🏨 Book AC Lodges & Luxury Suites with instant check-in!' },
                    { icon: '🌴', iconBg: 'bg-amber-400 text-slate-950', label: currentLang === 'te' ? 'పూల్ రిసార్ట్స్' : 'Luxury Pool Resorts', toast: '🌴 Weekend Pool Resorts, Farm Stays & Cottages!' },
                    { icon: '🏡', iconBg: 'bg-emerald-500 text-white', label: currentLang === 'te' ? 'వెరిఫైడ్ హోమ్‌స్టే' : 'Verified Homestays', toast: '🏡 Safe & verified family Homestays & Vacation Villas!' },
                    { icon: '⏱️', iconBg: 'bg-sky-500 text-white', label: currentLang === 'te' ? 'అవర్లీ & నైట్ స్టే' : 'Hourly & Night Stay', toast: '⏱️ Flexible 3hr / 6hr / 12hr Hourly & Full-Night Stays!' },
                  ],
                },
                {
                  id: 'spot-movies',
                  shortTab: currentLang === 'te' ? '🎬 మూవీస్' : '🎬 Movies',
                  badge: currentLang === 'te' ? 'స్పాట్‌లైట్ • మూవీస్ & మల్టీప్లెక్స్' : 'SPOTLIGHT • MOVIES & MULTIPLEXES',
                  headline:
                    currentLang === 'te'
                      ? 'బ్లాక్‌బస్టర్ మూవీస్, ఐమ్యాక్స్ & మల్టీప్లెక్స్'
                      : 'Blockbuster Movies, IMAX & Multiplexes',
                  subheadline:
                    currentLang === 'te'
                      ? '4K డాల్బీ అట్మాస్ • లైవ్ సీట్ సెలెక్షన్ • తక్షణ క్యూఆర్ టికెట్'
                      : '4K Dolby Atmos • Live Seat Map • Private Mini-Theatres',
                  priceMain: '₹150',
                  priceUnit: '/ticket',
                  ctaText: currentLang === 'te' ? 'టికెట్లు బుక్ చేయండి →' : 'Book Movie Tickets →',
                  image:
                    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1000&q=85',
                  framedPhoto:
                    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=85',
                  cardGradient: 'from-[#4A044E]/95 via-[#86198F]/88 to-[#2E0231]/70',
                  badgeClass: 'from-[#F5D0FE] via-[#F0ABFC] to-[#E879F9] text-slate-950',
                  priceBadgeClass: 'from-[#D946EF] via-[#C026D3] to-[#86198F] border-fuchsia-300/40',
                  ctaClass: 'bg-white hover:bg-fuchsia-50 text-[#701A75]',
                  targetSection: 'movies' as MarketSectionType,
                  categoryPills: [
                    { icon: '🎬', iconBg: 'bg-fuchsia-500 text-white', label: currentLang === 'te' ? '4K డాల్బీ & ఐమ్యాక్స్' : '4K Dolby & IMAX', toast: '🎬 Experience 4K Laser Projection & Dolby Atmos sound!' },
                    { icon: '🎟️', iconBg: 'bg-amber-400 text-slate-950', label: currentLang === 'te' ? 'తక్షణ క్యూఆర్ టికెట్' : 'Instant QR Ticket', toast: '🎟️ Direct M-Ticket QR code for paperless theatre entry!' },
                    { icon: '🍿', iconBg: 'bg-rose-500 text-white', label: currentLang === 'te' ? 'విఐపి రిక్లైనర్స్' : 'VIP Recliner Seats', toast: '🍿 Luxury recliner seating with in-seat food delivery!' },
                    { icon: '🛋️', iconBg: 'bg-purple-500 text-white', label: currentLang === 'te' ? 'ప్రైవేట్ మినీ థియేటర్' : 'Private Mini-Theatres', toast: '🛋️ Book Private Birthday & Celebration Screening Rooms!' },
                  ],
                },
                {
                  id: 'spot-services',
                  shortTab: currentLang === 'te' ? '🛠️ సర్వీసులు' : '🛠️ Services',
                  badge: currentLang === 'te' ? 'స్పాట్‌లైట్ • హోమ్ & లోకల్ సర్వీసులు' : 'SPOTLIGHT • HOME & LOCAL SERVICES',
                  headline:
                    currentLang === 'te'
                      ? 'వెరిఫైడ్ హోమ్ & లోకల్ సర్వీసులు'
                      : 'Verified Home & Local Services',
                  subheadline:
                    currentLang === 'te'
                      ? 'ఏసీ రిపేర్ • ప్లంబింగ్ • ఎలక్ట్రీషియన్ • 60 నిమిషాల్లో'
                      : 'AC Repair • Electrician • Cleaning • 60-Min Doorstep Arrival',
                  priceMain: '₹199',
                  priceUnit: '/visit',
                  ctaText: currentLang === 'te' ? 'సర్వీస్ బుక్ చేయండి →' : 'Explore Services →',
                  image:
                    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1000&q=85',
                  framedPhoto:
                    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=85',
                  cardGradient: 'from-[#082F49]/95 via-[#0369A1]/88 to-[#0C192C]/70',
                  badgeClass: 'from-[#7DD3FC] via-[#38BDF8] to-[#0EA5E9] text-slate-950',
                  priceBadgeClass: 'from-[#0EA5E9] via-[#0284C7] to-[#0369A1] border-sky-300/40',
                  ctaClass: 'bg-white hover:bg-sky-50 text-[#0C4A6E]',
                  targetSection: 'services' as MarketSectionType,
                  categoryPills: [
                    { icon: '🛠️', iconBg: 'bg-sky-500 text-white', label: currentLang === 'te' ? 'ఏసీ & అప్లయెన్స్ రిపేర్' : 'AC & Appliance Pro', toast: '🛠️ Expert AC servicing, gas refill & appliance repair!' },
                    { icon: '★', iconBg: 'bg-amber-400 text-slate-950', label: currentLang === 'te' ? 'వెరిఫైడ్ నిపుణులు' : 'Background Verified', toast: '★ Police & ID verified local service professionals!' },
                    { icon: '⚡', iconBg: 'bg-emerald-500 text-white', label: currentLang === 'te' ? '60 నిమిషాల్లో' : '60-Min Doorstep', toast: '⚡ Express 60-minute doorstep technician arrival!' },
                    { icon: '💇‍♀️', iconBg: 'bg-pink-500 text-white', label: currentLang === 'te' ? 'హోమ్ సెలూన్ & క్లీనింగ్' : 'Salon & Deep Cleaning', toast: '💇‍♀️ At-home salon, bridal makeup & deep home cleaning!' },
                  ],
                },
              ];

              const currentSlide =
                spotlightSlides[spotlightHeroSlideIndex % spotlightSlides.length] ||
                spotlightSlides[0];

              return (
                <div
                  onMouseEnter={() => setIsSpotlightPaused(true)}
                  onMouseLeave={() => setIsSpotlightPaused(false)}
                  onTouchStart={() => setIsSpotlightPaused(true)}
                  onTouchEnd={() => setIsSpotlightPaused(false)}
                  className="relative overflow-hidden rounded-3xl bg-slate-950 text-white border border-white/20 shadow-[0_10px_30px_rgba(30,27,75,0.22)] p-4 sm:p-6 transition-all duration-500"
                >
                  {/* Ambient Category Background Photo + Distinct Multi-Color Gradient Overlay */}
                  <SafeImage category="general"
                    key={`hero-img-${currentSlide.id}`}
                    src={currentSlide.image}
                    alt={currentSlide.headline}
                    className="pointer-events-none absolute inset-0 w-full h-full object-cover object-center transition-all duration-700 scale-105"
                  />
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${currentSlide.cardGradient} transition-colors duration-500`}
                  />

                  {/* Top Bar: One-by-One Category Quick Tabs + Prev/Next Controls */}
                  <div className="relative z-20 flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                      {spotlightSlides.map((slideItem, idx) => {
                        const isCurrent =
                          idx === spotlightHeroSlideIndex % spotlightSlides.length;
                        return (
                          <button
                            key={slideItem.id}
                            type="button"
                            onClick={() => setSpotlightHeroSlideIndex(idx)}
                            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black transition-all cursor-pointer border ${
                              isCurrent
                                ? `bg-gradient-to-r ${slideItem.badgeClass} border-white/40 shadow-sm scale-102`
                                : 'bg-black/45 hover:bg-black/70 text-white/85 border-white/20'
                            }`}
                          >
                            {slideItem.shortTab}
                          </button>
                        );
                      })}
                    </div>

                    {/* Prev / Counter / Next */}
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setSpotlightHeroSlideIndex(
                            (prev) =>
                              (prev - 1 + spotlightSlides.length) % spotlightSlides.length
                          )
                        }
                        aria-label="Previous Spotlight Category"
                        className="w-6 h-6 rounded-full bg-black/55 hover:bg-black/80 border border-white/25 text-white flex items-center justify-center cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-xs border border-white/25 text-[10px] font-black text-white">
                        {(spotlightHeroSlideIndex % spotlightSlides.length) + 1}/
                        {spotlightSlides.length}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setSpotlightHeroSlideIndex(
                            (prev) => (prev + 1) % spotlightSlides.length
                          )
                        }
                        aria-label="Next Spotlight Category"
                        className="w-6 h-6 rounded-full bg-black/55 hover:bg-black/80 border border-white/25 text-white flex items-center justify-center cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div
                    key={currentSlide.id}
                    className="relative z-10 grid grid-cols-1 md:grid-cols-12 items-center gap-4 animate-bos-spotlight-next"
                  >
                    {/* Left Column: Distinct Badge, Headline, Category Pills & CTA */}
                    <div className="md:col-span-8 flex flex-col gap-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-gradient-to-r ${currentSlide.badgeClass} text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-xs`}
                        >
                          <span>★</span>
                          <span>{currentSlide.badge}</span>
                        </span>
                      </div>

                      <div className="space-y-1 max-w-xl">
                        <h2 className="text-xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                          {currentSlide.headline}
                        </h2>
                        <p className="text-xs sm:text-sm font-bold text-white/90">
                          {currentSlide.subheadline}
                        </p>
                      </div>

                      {/* Category Feature Pills */}
                      <div className="w-full overflow-hidden py-0.5">
                        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
                          {currentSlide.categoryPills.map((pill) => (
                            <button
                              key={`${currentSlide.id}-${pill.label}`}
                              type="button"
                              onClick={() => {
                                if (activeMarketSection !== currentSlide.targetSection) {
                                  setActiveMarketSection(currentSlide.targetSection);
                                  setSelectedCategory('all');
                                  setSelectedSubcategory('all');
                                }
                                showToast(pill.toast);
                              }}
                              className="shrink-0 inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-xs border border-white/25 hover:border-amber-300/70 text-[11px] sm:text-xs font-extrabold text-white shadow-2xs transition active:scale-95 cursor-pointer"
                            >
                              <span
                                className={`w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full ${pill.iconBg} flex items-center justify-center text-[9px] sm:text-[10px] font-black shrink-0 shadow-2xs`}
                              >
                                {pill.icon}
                              </span>
                              <span className="whitespace-nowrap">{pill.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Bottom Row: Distinct Color Pill CTA Button + 6 Carousel Dots */}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (activeMarketSection !== currentSlide.targetSection) {
                              setActiveMarketSection(currentSlide.targetSection);
                              setSelectedCategory('all');
                              setSelectedSubcategory('all');
                            }
                            const gridEl = document.getElementById('bos-listings-feed-grid');
                            if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className={`px-4 sm:px-5 py-2 rounded-full ${currentSlide.ctaClass} font-black text-xs sm:text-sm shadow-md transition active:scale-95 cursor-pointer flex items-center gap-1.5`}
                        >
                          <span>{currentSlide.ctaText}</span>
                        </button>

                        {/* 6 Carousel Dots */}
                        <div className="flex items-center gap-1.5">
                          {spotlightSlides.map((s, idx) => {
                            const isCurrent =
                              idx === spotlightHeroSlideIndex % spotlightSlides.length;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                title={s.shortTab}
                                aria-label={`Spotlight Slide ${idx + 1}: ${s.shortTab}`}
                                onClick={() => setSpotlightHeroSlideIndex(idx)}
                                className={`h-2 rounded-full transition-all cursor-pointer ${
                                  isCurrent
                                    ? 'w-5 bg-amber-300 shadow-xs'
                                    : 'w-2 bg-white/45 hover:bg-white/75'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Framed Multi-Color Showcase Image with Starting Price & BOS Badge */}
                    <div className="md:col-span-4 flex items-center justify-end">
                      <div
                        onClick={() => {
                          if (activeMarketSection !== currentSlide.targetSection) {
                            setActiveMarketSection(currentSlide.targetSection);
                            setSelectedCategory('all');
                            setSelectedSubcategory('all');
                          }
                        }}
                        className="group/frame relative w-full sm:w-64 md:w-full h-36 sm:h-40 rounded-2xl overflow-hidden border-2 border-white/85 shadow-2xl bg-slate-950 cursor-pointer"
                      >
                        <SafeImage category="general"
                          src={currentSlide.framedPhoto}
                          alt={currentSlide.headline}
                          className="w-full h-full object-cover group-hover/frame:scale-110 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                        {/* Bottom-Left Starting Price Pill */}
                        <div
                          className={`absolute bottom-2.5 left-2.5 px-3 py-1 rounded-xl bg-gradient-to-r ${currentSlide.priceBadgeClass} border text-white shadow-md`}
                        >
                          <div className="text-[8.5px] font-bold uppercase tracking-wider opacity-90 leading-none">
                            Starting
                          </div>
                          <div className="text-sm sm:text-base font-black leading-tight">
                            {currentSlide.priceMain}
                            <span className="text-[10px] font-semibold opacity-90">
                              {currentSlide.priceUnit}
                            </span>
                          </div>
                        </div>

                        {/* Bottom-Right White BOS Seal */}
                        <div className="absolute bottom-2 right-2 w-8 h-8 rounded-2xl bg-white text-slate-950 font-black text-[10px] flex items-center justify-center shadow-lg border border-slate-200">
                          BOS
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
            </>
          )}

          {activeSectionExperience ? (
            /* SECTION SCREEN — rendered in the page flow, directly under the common header */
            <SectionErrorBoundary sectionKey={activeSectionExperience}>
            <section
              className="w-full flex-1 animate-in fade-in duration-150"
              aria-label={`${activeSectionExperience} section`}
            >
              {DEMO_DATA_ENABLED && demoCardSection && selectedCategory === 'all' && (
                <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-6 lg:px-8">
                  <DemoBookableCard section={demoCardSection} />
                </div>
              )}
              {/* Published builder region: presentation only; the live module experience below keeps its booking, inventory and pricing logic. */}
              <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 pt-3">
                <Suspense fallback={null}><PublishedBuilderRegion pageKey={activeSectionExperience} /></Suspense>
              </div>

              {activeSectionExperience === 'pg_hostels' && (
                <Suspense fallback={<SectionScreenFallback label="Loading PGs…" />}>
                  <PGSectionExperience
                    inline
                    style={sectionStyles.pg}
                    listings={locationFilteredListings}
                    selectedCategory={selectedCategory}
                    selectedSubcategory={selectedSubcategory}
                    selectedCity={sharedSelectedCity}
                    moduleLabel={modulePresentation.pg?.values.label}
                    moduleHeadline={modulePresentation.pg?.values.headline}
                    onClose={() => {
                      setIsPGSectionOpen(false);
                      clearSectionHash();
                      setActiveMarketSection(returnSectionAfterPGRef.current);
                      setSelectedCategory('all');
                      setSelectedSubcategory('all');
                    }}
                  />
                </Suspense>
              )}

              {activeSectionExperience === 'classes' && (
                <div data-bos-category-style={`classes-${sectionStyles.classes}`}>
                  <Suspense fallback={<SectionScreenFallback label="Loading classes…" />}>
                    <ClassesTimingsExperience
                      inline
                      style={sectionStyles.classes}
                      listings={locationFilteredListings}
                      onClose={() => {
                        setIsClassesTimingsOpen(false);
                        clearSectionHash();
                      }}
                    />
                  </Suspense>
                </div>
              )}

              {activeSectionExperience === 'services' && (
                <Suspense fallback={<SectionScreenFallback label="Loading services…" />}>
                  <HomeServicesSection
                    inline
                    style={sectionStyles.services}
                    listings={locationFilteredListings}
                    initialCategoryId={selectedCategory === 'all' ? undefined : selectedCategory}
                    moduleLabel={modulePresentation.services?.values.label}
                    moduleHeadline={modulePresentation.services?.values.headline}
                    onClose={() => {
                      setIsHomeServicesOpen(false);
                      clearSectionHash();
                      setActiveMarketSection(returnSectionAfterServicesRef.current);
                      setSelectedCategory('all');
                      setSelectedSubcategory('all');
                    }}
                  />
                </Suspense>
              )}

              {activeSectionExperience === 'hotel_stay' && (
                <Suspense fallback={<SectionScreenFallback label="Loading stays…" />}>
                  <HotelsStayExperience
                    inline
                    style={sectionStyles.stay}
                    stayCategory={selectedCategory}
                    staySubcategory={selectedSubcategory}
                    selectedCity={sharedSelectedCity}
                    onStartHosting={() => setIsPostWizardOpen(true)}
                    onSignIn={() => setIsAuthModalOpen(true)}
                    onClose={() => {
                      setIsHotelsStayExperienceOpen(false);
                      clearSectionHash();
                      setActiveMarketSection(returnSectionAfterStayRef.current);
                      setSelectedCategory('all');
                      setSelectedSubcategory('all');
                    }}
                  />
                </Suspense>
              )}

              {activeSectionExperience === 'movies' && (
                <Suspense fallback={<SectionScreenFallback label="Loading movies…" />}>
                  <MoviesShowtimes inline selectedCity={sharedSelectedCity} style={sectionStyles.movies} />
                </Suspense>
              )}
            </section>
            </SectionErrorBoundary>
          ) : (
            <>
          {/* Main Content Area */}
          <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-4 space-y-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >

        {/* VIEW 1: PROVIDER PORTAL */}
        {activeView === 'provider_portal' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <SelfHealingBoundary moduleId="provider_portal_module" moduleName="Provider Portal & Hub Module">
              <ProviderDashboard
                currentLang={currentLang}
                initialWorkspace={hasInstituteAccess ? 'institute' : 'pg'}
                onSwitchToMarketplace={() => {
                  setActiveView('marketplace');
                  setActiveBottomTab('home');
                  if (['#provider', '#provider_portal', '#provider_portal1'].includes(window.location.hash.toLowerCase())) {
                    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
                  }
                }}
                onOpenPostWizard={() => setIsPostWizardOpen(true)}
                onOpenPaymentModal={(planName, amount) => {
                  setPaymentModalState({
                    isOpen: true,
                    planName,
                    amount
                  });
                }}
                onOpenChatWithCustomer={(_id, _name, _title) => {
                  const sampleListing = listings[0] || null;
                  setChatListing(sampleListing);
                }}
                onSwitchToAdminReview={
                  userRole === 'admin'
                    ? () => {
                        setUserRole('admin');
                        setActiveView('admin_console');
                      }
                    : undefined
                }
              />
              {/* Module workspaces stay available next to the tabbed provider
                  dashboard: courses/batches and venues have no tab of their
                  own. Each gets its own boundary so one failure cannot hide
                  the other workspace. */}
              {userRole === 'provider' && (
                <SelfHealingBoundary moduleId="provider_classes_module" moduleName="Classes Batch Manager">
                  <ClassBatchManager />
                </SelfHealingBoundary>
              )}
            </SelfHealingBoundary>
          </div>
        )}

        {/* VIEW 2: SUPER ADMIN CONSOLE */}
        {activeView === 'admin_console' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h1 className="flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white">
                  <ShieldCheck className="h-5 w-5 text-amber-500" />
                  <span>BookOurSpace Admin Console</span>
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Data management, reports, bookings, payments, users, listings, content, theme and audit — every admin workspace in one console.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('marketplace');
                    setIsLivePageEditorOpen(true);
                  }}
                  className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700"
                >
                  Live Page Editor
                </button>
                <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" role="group" aria-label="Admin workspace toggle">
                  <button
                    type="button"
                    onClick={() => setActiveView('marketplace')}
                    className="rounded-lg px-3 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Marketplace
                  </button>
                  <button
                    type="button"
                    aria-pressed="true"
                    className="rounded-lg bg-indigo-600 px-3 py-1 text-[11px] font-bold text-white"
                  >
                    Admin Console
                  </button>
                </div>
              </div>
            </div>

            {/* Console tab strip: one tap to every admin workspace. */}
            <div className="sticky top-0 z-20 -mx-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-1 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
              <div className="flex min-w-max items-center gap-1.5" role="tablist" aria-label="Admin console sections">
                {ADMIN_CONSOLE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={adminSection === tab.id}
                    onClick={() => {
                      setAdminSection(tab.id);
                      document.getElementById('admin-console-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                      adminSection === tab.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div id="admin-console-workspace" className="scroll-mt-24">
              <Suspense fallback={<p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600" role="status">Loading admin console…</p>}>
                <SelfHealingBoundary moduleId="admin_console_module" moduleName="Super Admin Console Module">
                  <AdminClassBatchReview />
                  <AdminDashboard
                    section={adminSection}
                    onSectionChange={setAdminSection}
                    onApprovedNavigateToApp={(approvedListing) => {
                      const targetSec = resolveSectionForCategory(approvedListing.categoryId);
                      setActiveMarketSection(targetSec);
                      setSelectedCategory('all');
                      setSelectedSubcategory('all');
                      setSearchQuery('');
                      setActiveView('marketplace');
                      playAlertChime('confirm');
                      showToast(`✅ Approved by Admin! "${approvedListing.title}" is now LIVE in the Application!`);
                    }}
                    onOpenLivePageEditor={() => {
                      setActiveView('marketplace');
                      setIsLivePageEditorOpen(true);
                    }}
                  />
                </SelfHealingBoundary>
              </Suspense>
            </div>

            <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <summary className="cursor-pointer text-xs font-black text-slate-700 dark:text-slate-200">
                Venue booking oversight & workspace
              </summary>
              <div className="mt-3">
                <VenueAdminWorkspace />
              </div>
            </details>
          </div>
        )}

        {/* VIEW 3: BOOKOURSPACE MARKETPLACE FEED */}
        {activeView === 'marketplace' && (
          <div
            className="space-y-4 animate-in fade-in duration-200"
            data-bos-category-style={activeMarketSection === 'venues' ? `venues-${sectionStyles.venues}` : undefined}
          >

            {/* ADMIN APPROVAL WORKFLOW BANNER WHEN PROVIDER REQUESTS ARE PENDING (DISPLAY ONLY FOR ADMIN) */}
            {userRole === 'admin' && pendingAdminListings.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase">
                    <Clock className="w-3 h-3" />
                    <span>{pendingAdminListings.length} Provider Registration Request(s) Pending Admin Review</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    New provider listing <strong>"{pendingAdminListings[0].title}"</strong> (by {pendingAdminListings[0].providerName}) is awaiting Admin approval before displaying in the application.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      const req = pendingAdminListings[0];
                      const saved = await updateListingStatus(req.id, 'active');
                      if (!saved) {
                        showToast('Listing approval was not saved. Check the Supabase session and try again.');
                        return;
                      }
                      const targetSec = resolveSectionForCategory(req.categoryId);
                      setActiveMarketSection(targetSec);
                      setSelectedCategory('all');
                      setSelectedSubcategory('all');
                      playAlertChime('confirm');
                      showToast(`✅ Admin Approved! "${req.title}" is now displayed in the application!`);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>✅ Admin Approve & Display Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!isAdminSession) {
                        showToast('🛡️ Admin console requires a signed-in administrator account.');
                        return;
                      }
                      setUserRole('admin');
                      setActiveView('admin_console');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#4338CA] hover:bg-indigo-800 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#FFE500]" />
                    <span>Open Admin Review Queue ({pendingAdminListings.length})</span>
                  </button>
                </div>
              </div>
            )}

            {/* AUTHORIZED ADMIN LIVE PAGE EDITOR RIBBON (ONLY SHOWN WHEN ADMIN IS LOGGED IN) */}
            {userRole === 'admin' && (
              <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-purple-950 text-white rounded-2xl p-3 sm:px-4 border border-indigo-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase shrink-0">
                    OTA Live Editor • {livePageConfig.versionId}
                  </span>
                  <span className="text-xs font-bold text-indigo-100 truncate">
                    Editing Customer Page: <strong>{currentLivePage.icon} {currentLivePage.pageName}</strong> — Customize text, banners, section order, colors, categories & forms across Web, Android & iOS.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsLivePageEditorOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-[#FFE500] hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Edit This Page Live</span>
                  </button>
                </div>
              </div>
            )}

            {/* LIVE ADMIN CUSTOM HERO BANNER (IF ENABLED FOR THIS CUSTOMER PAGE; HIDDEN IN MOVIES SO DISTRICT REPLICA HERO TAKES PRIORITY) */}
            {activeMarketSection !== 'movies' && currentLivePage.heroBanner.visible && isPageSectionVisible('custom_page_hero') && (
              <div
                className="rounded-3xl p-5 sm:p-6 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-5 overflow-hidden border border-white/15"
                style={{
                  background: `linear-gradient(135deg, ${currentLivePage.heroBanner.bgColorFrom}, ${currentLivePage.heroBanner.bgColorTo})`,
                }}
              >
                <div className="space-y-2.5 max-w-2xl">
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-black/30 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                    <Sparkles className="w-3 h-3" />
                    <span>{currentLivePage.heroBanner.badgeText}</span>
                  </span>
                  <h2 className="text-lg sm:text-2xl font-black tracking-tight">
                    {currentLivePage.heroBanner.headline}
                  </h2>
                  <p className="text-xs sm:text-sm opacity-90">
                    {currentLivePage.heroBanner.subheadline}
                  </p>
                  <div className="pt-1 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const gridEl = document.getElementById('bos-listings-feed-grid');
                        if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`px-4 py-2 bg-[#FFE500] text-slate-950 text-xs font-black shadow-sm cursor-pointer ${currentLivePage.colors.buttonRadius}`}
                    >
                      {currentLivePage.heroBanner.ctaButtonText}
                    </button>
                    {currentLivePage.heroBanner.secondaryButtonText && (
                      <button
                        type="button"
                        onClick={() => setIsPostWizardOpen(true)}
                        className={`px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white border border-white/30 text-xs font-bold cursor-pointer ${currentLivePage.colors.buttonRadius}`}
                      >
                        {currentLivePage.heroBanner.secondaryButtonText}
                      </button>
                    )}
                  </div>
                </div>
                <SafeImage category="general"
                  src={currentLivePage.heroBanner.imageUrl}
                  alt={currentLivePage.heroBanner.headline}
                  className="w-full md:w-64 h-40 rounded-2xl object-cover shrink-0 border-2 border-white/20 shadow-lg"
                />
              </div>
            )}

            {/* REDESIGNED 4-ITEM FILTER & VOICE BAR (VERIFIED ONLY | FILTERS | SORT | SEARCH BY VOICE) */}
            <div className={`bg-white dark:bg-[#0D1126] rounded-2xl border border-slate-200/90 dark:border-slate-800 p-2 sm:p-2.5 shadow-[0_3px_14px_rgba(15,23,42,0.04)] ${activeMarketSection === 'venues' ? 'hidden' : ''}`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 items-center gap-2">
                {/* 1. Verified Only Button */}
                <button
                  type="button"
                  onClick={() => {
                    const nextVerified = !verifiedOnly;
                    setVerifiedOnly(nextVerified);
                    showToast(
                      nextVerified
                        ? currentLang === 'te'
                          ? '✓ వెరిఫైడ్ లిస్టింగ్‌లు మాత్రమే చూపబడుతున్నాయి'
                          : '✓ Showing Verified Listings Only'
                        : currentLang === 'te'
                        ? 'అన్ని లిస్టింగ్‌లు చూపబడుతున్నాయి'
                        : 'Showing All Listings'
                    );
                  }}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                    verifiedOnly
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_4px_12px_rgba(16,185,129,0.35)]'
                      : 'bg-slate-50/90 dark:bg-[#131836] text-slate-800 dark:text-slate-100 border-slate-200/80 dark:border-slate-700/80 hover:border-purple-300'
                  }`}
                >
                  {verifiedOnly ? (
                    <ShieldCheck className="w-4 h-4 text-white shrink-0" />
                  ) : darkMode ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                  )}
                  <span className="truncate">{t.verifiedOnly}</span>
                  {verifiedOnly && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                </button>

                {/* 2. Filters Drawer Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                    showFilterDropdown || selectedRadius !== 'all' || selectedPriceRange !== 'all' || selectedRating !== 'all'
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-[#4C1D95] dark:text-purple-200 border-purple-400 dark:border-purple-600 shadow-2xs'
                      : 'bg-slate-50/90 dark:bg-[#131836] text-slate-800 dark:text-slate-100 border-slate-200/80 dark:border-slate-700/80 hover:border-purple-300'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4 text-[#4338CA] dark:text-indigo-400 shrink-0" />
                  <span className="truncate">{currentLang === 'te' ? 'ఫిల్టర్లు' : 'Filters'}</span>
                  {(selectedRadius !== 'all' || selectedPriceRange !== 'all' || selectedRating !== 'all') && (
                    <span className="w-4 h-4 rounded-full bg-[#5B21B6] text-white text-[10px] flex items-center justify-center font-black">
                      {[selectedRadius !== 'all', selectedPriceRange !== 'all', selectedRating !== 'all'].filter(Boolean).length}
                    </span>
                  )}
                </button>

                {/* 3. Sort Selector Pill */}
                <div className="relative w-full flex items-center justify-center px-3 py-2 rounded-xl bg-slate-50/90 dark:bg-[#131836] border border-slate-200/80 dark:border-slate-700/80 hover:border-purple-300 transition">
                  <ArrowUpDown className="w-4 h-4 text-[#4338CA] dark:text-indigo-400 shrink-0 mr-1.5 pointer-events-none" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    aria-label="Sort Listings"
                    className="bg-transparent font-extrabold text-slate-800 dark:text-slate-100 text-xs outline-hidden cursor-pointer text-center appearance-none pr-2"
                  >
                    <option value="distance_asc" className="bg-white dark:bg-slate-900">
                      {currentLang === 'te' ? 'సార్ట్: దగ్గరగా' : 'Sort: Nearest'}
                    </option>
                    <option value="rating" className="bg-white dark:bg-slate-900">
                      {currentLang === 'te' ? 'సార్ట్: టాప్ రేటింగ్' : 'Sort: Top Rated'}
                    </option>
                    <option value="price_asc" className="bg-white dark:bg-slate-900">
                      {currentLang === 'te' ? 'సార్ట్: తక్కువ ధర' : 'Sort: Price Low'}
                    </option>
                    <option value="price_desc" className="bg-white dark:bg-slate-900">
                      {currentLang === 'te' ? 'సార్ట్: ఎక్కువ ధర' : 'Sort: Price High'}
                    </option>
                    <option value="newest" className="bg-white dark:bg-slate-900">
                      {currentLang === 'te' ? 'సార్ట్: కొత్తవి' : 'Sort: Newest'}
                    </option>
                  </select>
                </div>

                {/* 4. Search by Voice Gold Pill */}
                <button
                  type="button"
                  onClick={() => setIsVoiceSearchOpen(true)}
                  className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-[#FBBF24] via-[#F59E0B] to-[#FBBF24] hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-[0_3px_10px_rgba(245,158,11,0.35)] transition active:scale-95 cursor-pointer"
                >
                  <Mic className="w-4 h-4 text-slate-950 shrink-0" />
                  <span className="truncate">
                    {currentLang === 'te' ? 'వాయిస్ సెర్చ్' : 'Search by voice'}
                  </span>
                </button>
              </div>

              {/* Secondary Contextual Row: Admin-Controlled Date-Range Filter Pill, Hotel Hourly Booking Toggle, or Reset */}
              {(isTemplateEnabled('search_date_range_filter') ||
                activeMarketSection === 'hotel_stay' ||
                selectedRadius !== 'all' ||
                selectedPriceRange !== 'all' ||
                selectedRating !== 'all' ||
                verifiedOnly ||
                Boolean(filterStartDate || filterEndDate)) && (
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  {isTemplateEnabled('search_date_range_filter') && (
                    <button
                      type="button"
                      onClick={() => setShowDateRangePopup((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition border cursor-pointer ${
                        filterStartDate || filterEndDate
                          ? 'bg-[#4A148C] text-white border-[#4A148C] shadow-xs'
                          : showDateRangePopup
                          ? 'bg-purple-100 dark:bg-purple-950/70 text-[#4A148C] dark:text-purple-200 border-purple-400'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                      }`}
                    >
                      <Calendar className={`w-3.5 h-3.5 ${filterStartDate || filterEndDate ? 'text-amber-300' : 'text-purple-600 dark:text-purple-400'}`} />
                      <span>
                        {filterStartDate
                          ? `${filterStartDate}${filterEndDate && filterEndDate !== filterStartDate ? ` → ${filterEndDate}` : ''}`
                          : currentLang === 'te'
                          ? '📅 తేదీ ఎంచుకోండి (Dates)'
                          : '📅 Select Dates'}
                      </span>
                      {(filterStartDate || filterEndDate) && (
                        <X
                          className="w-3 h-3 ml-0.5 hover:text-amber-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilterStartDate('');
                            setFilterEndDate('');
                          }}
                        />
                      )}
                    </button>
                  )}

                  {activeMarketSection === 'hotel_stay' && (
                    <button
                      type="button"
                      onClick={() => setHourlyBookingOnly((prev) => !prev)}
                      className={`px-3 py-1 rounded-xl font-extrabold text-[11px] flex items-center gap-1.5 shadow-xs transition cursor-pointer border ${
                        hourlyBookingOnly
                          ? 'bg-amber-500 text-slate-950 border-amber-600 ring-2 ring-amber-300'
                          : 'bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-100'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {currentLang === 'te'
                          ? '⚡ గంటల వారీ బుకింగ్ (Hourly Booking)'
                          : '⚡ Hourly Booking'}
                      </span>
                    </button>
                  )}

                  {(selectedRadius !== 'all' ||
                    selectedPriceRange !== 'all' ||
                    selectedRating !== 'all' ||
                    verifiedOnly ||
                    Boolean(filterStartDate || filterEndDate)) && (
                    <button
                      onClick={handleResetFilters}
                      className="ml-auto text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-bold flex items-center gap-1 transition px-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{t.clearFilters}</span>
                    </button>
                  )}
                </div>
              )}

              {/* INLINE DATE-RANGE AVAILABILITY FILTER BAR (OPENS WHEN USER CLICKS "📅 Select Dates") */}
              {isTemplateEnabled('search_date_range_filter') && showDateRangePopup && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5 animate-in slide-in-from-top-1 duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#4A148C] dark:text-purple-300">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {currentLang === 'te'
                          ? 'తేదీల వారీగా అందుబాటులో ఉన్న లిస్టింగ్‌లను ఫిల్టర్ చేయండి (Check-in → Check-out):'
                          : 'Filter Listings by Date-Range Availability (Check-in → Check-out):'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        {
                          label: currentLang === 'te' ? 'ఈరోజు' : 'Today',
                          start: todayLocalIso,
                          end: todayLocalIso,
                        },
                        {
                          label: currentLang === 'te' ? 'రేపు' : 'Tomorrow',
                          start: shiftIsoDays(todayLocalIso, 1),
                          end: shiftIsoDays(todayLocalIso, 2),
                        },
                        {
                          label: currentLang === 'te' ? 'ఈ వారాంతం (2 రాత్రులు)' : 'Weekend (2 Nights)',
                          start: shiftIsoDays(todayLocalIso, 2),
                          end: shiftIsoDays(todayLocalIso, 4),
                        },
                        {
                          label: currentLang === 'te' ? 'వచ్చే 7 రోజులు' : 'Next 7 Days',
                          start: todayLocalIso,
                          end: shiftIsoDays(todayLocalIso, 7),
                        },
                      ].map((preset) => {
                        const isPresetActive =
                          filterStartDate === preset.start && filterEndDate === preset.end;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setFilterStartDate(preset.start);
                              setFilterEndDate(preset.end);
                            }}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                              isPresetActive
                                ? 'bg-[#4A148C] text-white border-[#4A148C]'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-400'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end bg-purple-50/60 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-purple-200/80 dark:border-slate-700">
                    <div>
                      <label className="text-[10px] font-black uppercase text-purple-900 dark:text-purple-300 block mb-1">
                        {currentLang === 'te' ? '🟢 ప్రారంభ / చెక్-ఇన్ తేదీ:' : '🟢 Start / Check-in Date:'}
                      </label>
                      <input
                        type="date"
                        min={todayLocalIso}
                        value={filterStartDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFilterStartDate(val);
                          if (val && (!filterEndDate || filterEndDate < val)) {
                            setFilterEndDate(shiftIsoDays(val, 1));
                          }
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-purple-300 dark:border-slate-600 rounded-xl px-2.5 py-1.5 text-xs font-black text-slate-900 dark:text-white outline-hidden focus:border-[#4A148C] cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-indigo-900 dark:text-indigo-300 block mb-1">
                        {currentLang === 'te' ? '🔴 ముగింపు / చెక్-అవుట్ తేదీ:' : '🔴 End / Check-out Date:'}
                      </label>
                      <input
                        type="date"
                        min={filterStartDate || todayLocalIso}
                        value={filterEndDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFilterEndDate(val);
                          if (val && !filterStartDate) {
                            setFilterStartDate(val);
                          }
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-indigo-300 dark:border-slate-600 rounded-xl px-2.5 py-1.5 text-xs font-black text-slate-900 dark:text-white outline-hidden focus:border-indigo-600 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      {(filterStartDate || filterEndDate) && (
                        <button
                          type="button"
                          onClick={() => {
                            setFilterStartDate('');
                            setFilterEndDate('');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold cursor-pointer"
                        >
                          {currentLang === 'te' ? 'తేదీలు క్లియర్' : 'Clear Dates'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowDateRangePopup(false)}
                        className="flex-1 px-3.5 py-1.5 rounded-xl bg-[#4A148C] hover:bg-purple-800 text-white text-xs font-black cursor-pointer"
                      >
                        {currentLang === 'te' ? '✓ వర్తించు' : '✓ Apply Dates'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* EXPANDABLE FILTER SELECTION PANEL (APPEARS WHEN FILTERS BUTTON IS CLICKED) */}
              {showFilterDropdown && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5 animate-in slide-in-from-top-1 duration-150">
                  {/* Distance Row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1 min-w-[85px] shrink-0">
                      <Clock className="w-3.5 h-3.5 text-purple-600" />
                      <span>{t.distance}:</span>
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      <button
                        onClick={() => setSelectedRadius('all')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedRadius === 'all'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                        }`}
                      >
                        {t.distanceAll}
                      </button>
                      <button
                        onClick={() => setSelectedRadius(5)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedRadius === 5
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                        }`}
                      >
                        📍 {t.within5km}
                      </button>
                      <button
                        onClick={() => setSelectedRadius(10)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedRadius === 10
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                        }`}
                      >
                        📍 {t.within10km}
                      </button>
                      <button
                        onClick={() => setSelectedRadius(15)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedRadius === 15
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                        }`}
                      >
                        📍 {t.within15km}
                      </button>
                    </div>
                  </div>

                  {/* Price Row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1 min-w-[85px] shrink-0">
                      <Tag className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{t.price}:</span>
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      <button
                        onClick={() => setSelectedPriceRange('all')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedPriceRange === 'all'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        {t.priceAll}
                      </button>
                      <button
                        onClick={() => setSelectedPriceRange('under500')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedPriceRange === 'under500'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        {t.under500}
                      </button>
                      <button
                        onClick={() => setSelectedPriceRange('500to1000')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedPriceRange === '500to1000'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        {t.price500to1000}
                      </button>
                      <button
                        onClick={() => setSelectedPriceRange('above1000')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedPriceRange === 'above1000'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        {t.above1000}
                      </button>
                    </div>
                  </div>

                  {/* Rating Row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1 min-w-[85px] shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>{t.rating}:</span>
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      <button
                        onClick={() => setSelectedRating('all')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedRating === 'all'
                            ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs font-black'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                        }`}
                      >
                        {t.ratingAll}
                      </button>
                      <button
                        onClick={() => setSelectedRating(4.5)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedRating === 4.5
                            ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs font-black'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                        }`}
                      >
                        {t.rating45Plus}
                      </button>
                      <button
                        onClick={() => setSelectedRating(4.0)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border cursor-pointer ${
                          selectedRating === 4.0
                            ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs font-black'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                        }`}
                      >
                        {t.rating40Plus}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <button
                      onClick={() => setShowFilterDropdown(false)}
                      className="px-3.5 py-1 bg-[#4A148C] hover:bg-purple-800 text-white rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer"
                    >
                      {currentLang === 'te' ? 'పూర్తయింది (వర్తించు)' : 'Done'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* BLINKIT / FLIPKART / ZEPTO / CLASSCONNECT CATEGORY RAIL & STREAM EXPLORER LAYOUT (ADMIN ENABLE/DISABLE • DEFAULT DISABLED) */}
            {isTemplateEnabled('category_rail_stream_explorer') &&
              (isRailStreamExplorerOpen ? (
                <CategoryRailStreamExplorer
                  activeMarketSection={activeMarketSection}
                  onSelectMarketSection={(sec) => {
                    if (customerAuthorizedSections && !customerAuthorizedSections.includes(sec)) {
                      showToast('🔒 This module is not available for your account.');
                      return;
                    }
                    setIsBentoLandingActive(false);
                    if (sec === 'services') {
                      returnSectionAfterServicesRef.current = activeMarketSection === 'services'
                        ? 'pg_hostels'
                        : activeMarketSection;
                    }
                    if (sec === 'pg_hostels') {
                      returnSectionAfterPGRef.current = activeMarketSection === 'pg_hostels'
                        ? 'pg_hostels'
                        : activeMarketSection;
                    }
                    if (sec === 'hotel_stay') {
                      returnSectionAfterStayRef.current = activeMarketSection === 'hotel_stay'
                        ? 'pg_hostels'
                        : activeMarketSection;
                    }
                    setActiveMarketSection(sec);
                    // The rail is a marketplace shell, not a module screen. Open
                    // the selected module in the same page flow as the common
                    // header; venues and movies stay in the marketplace grid.
                    setOpenSection(sec === 'venues' || sec === 'movies' ? null : sec);
                    setSelectedCategory('all');
                    setSelectedSubcategory('all');
                  }}
                  selectedCategory={selectedCategory}
                  onSelectCategory={(catId) => setSelectedCategory(catId)}
                  selectedSubcategory={selectedSubcategory}
                  onSelectSubcategory={(subcat) => setSelectedSubcategory(subcat)}
                  selectedPGGender={selectedPGGender}
                  onSelectPGGender={(g) => setSelectedPGGender(g)}
                  listings={filteredListings}
                  currentLang={currentLang}
                  verifiedOnly={verifiedOnly}
                  onToggleVerifiedOnly={() => setVerifiedOnly(!verifiedOnly)}
                  sortBy={sortBy}
                  onChangeSortBy={(s) => setSortBy(s)}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onOpenVoiceSearch={() => setIsVoiceSearchOpen(true)}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={toggleFavorite}
                  comparedListingIds={comparedListingIds}
                  onToggleCompare={(id) => {
                    const listing = filteredListings.find((item) => item.id === id);
                    if (listing) handleToggleCompare(listing);
                  }}
                  onSelectListing={handleSelectListing}
                  onBookNow={(l) => setBookingListing(l)}
                  onEnquire={(l) => setChatListing(l)}
                  onOpenRunningBatches={(l) => setRunningBatchesListing(l)}
                  onBackToHomeHub={
                    homeScreenStyle === 'bento_landing_hub'
                      ? () => {
                          setIsBentoLandingActive(true);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      : undefined
                  }
                  onSwitchToClassicFeed={() => setIsRailStreamExplorerOpen(false)}
                  isSpotlightSubcategoriesEnabled={isPageSectionVisible('spotlight_subcategories')}
                  onNotify={(msg) => showToast(msg)}
                />
              ) : (
                <div className="flex items-center justify-between bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/80 rounded-2xl px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs font-black text-[#1E1B4B] dark:text-white">
                    <span>⚡</span>
                    <span>
                      {currentLang === 'te'
                        ? 'క్విక్-కామర్స్ కేటగిరీ రైల్ & స్ట్రీమ్ ఎక్స్‌ప్లోరర్ అందుబాటులో ఉంది'
                        : 'Want Blinkit / Zepto style Category Rail & Stream Explorer navigation?'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRailStreamExplorerOpen(true)}
                    className="px-3 py-1 rounded-xl bg-[#5B21B6] hover:bg-purple-800 text-white text-xs font-black shadow-2xs cursor-pointer shrink-0"
                  >
                    {currentLang === 'te' ? 'రైల్ వ్యూ తెరువు' : 'Open Rail & Stream View'}
                  </button>
                </div>
              ))}

            {/* REDESIGNED HOME SCREEN SHOWCASE SECTIONS (DYNAMIC ONE-BY-ONE SPOTLIGHT 3-CARDS + INTERACTIVE MAP BANNER + POPULAR CATEGORIES) */}
            {(() => {
              const spotlightRotationSequence: {
                section: MarketSectionType;
                labelEn: string;
                labelTe: string;
                chipLabel: string;
                accentBadge: string;
                activeChipClass: string;
                containerTintClass: string;
                cardAccentBorder: string;
                curatedImages: string[];
              }[] = [
                {
                  section: 'pg_hostels',
                  labelEn: "PG's & Co-Living",
                  labelTe: 'పీజీలు & కో-లివింగ్',
                  chipLabel: "🏠 PG's",
                  accentBadge: 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white',
                  activeChipClass: 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-500 shadow-xs',
                  containerTintClass: 'from-indigo-50/75 via-white to-violet-50/65 dark:from-indigo-950/35 dark:via-[#0D1126] dark:to-violet-950/30 border-indigo-200/80 dark:border-indigo-800/70',
                  cardAccentBorder: 'hover:border-indigo-500 dark:hover:border-indigo-400',
                  curatedImages: [
                    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=700&q=85',
                  ],
                },
                {
                  section: 'venues',
                  labelEn: 'Function & Marriage Halls',
                  labelTe: 'ఫంక్షన్ & మ్యారేజ్ హాల్స్',
                  chipLabel: '🏛️ Function Halls',
                  accentBadge: 'bg-gradient-to-r from-rose-600 to-pink-600 text-white',
                  activeChipClass: 'bg-gradient-to-r from-rose-600 to-pink-600 text-white border-rose-500 shadow-xs',
                  containerTintClass: 'from-rose-50/75 via-white to-pink-50/65 dark:from-rose-950/35 dark:via-[#0D1126] dark:to-pink-950/30 border-rose-200/80 dark:border-rose-800/70',
                  cardAccentBorder: 'hover:border-rose-500 dark:hover:border-rose-400',
                  curatedImages: [
                    'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=700&q=85',
                  ],
                },
                {
                  section: 'classes',
                  labelEn: 'Classes & Coaching',
                  labelTe: 'క్లాసులు & కోచింగ్',
                  chipLabel: '🎓 Classes',
                  accentBadge: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white',
                  activeChipClass: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-xs',
                  containerTintClass: 'from-emerald-50/75 via-white to-teal-50/65 dark:from-emerald-950/35 dark:via-[#0D1126] dark:to-teal-950/30 border-emerald-200/80 dark:border-emerald-800/70',
                  cardAccentBorder: 'hover:border-emerald-500 dark:hover:border-emerald-400',
                  curatedImages: [
                    'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=700&q=85',
                  ],
                },
                {
                  section: 'hotel_stay',
                  labelEn: 'Lodges, Resorts & Homestays',
                  labelTe: 'లాడ్జీలు, రిసార్ట్స్ & హోమ్‌స్టే',
                  chipLabel: '🏨 Lodge & Resort (Stay)',
                  accentBadge: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white',
                  activeChipClass: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-500 shadow-xs',
                  containerTintClass: 'from-amber-50/75 via-white to-orange-50/65 dark:from-amber-950/35 dark:via-[#0D1126] dark:to-orange-950/30 border-amber-200/80 dark:border-amber-800/70',
                  cardAccentBorder: 'hover:border-amber-500 dark:hover:border-amber-400',
                  curatedImages: [
                    'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=85',
                  ],
                },
                {
                  section: 'services',
                  labelEn: 'Home & Local Services',
                  labelTe: 'హోమ్ & లోకల్ సర్వీసులు',
                  chipLabel: '🛠️ Services',
                  accentBadge: 'bg-gradient-to-r from-sky-600 to-blue-600 text-white',
                  activeChipClass: 'bg-gradient-to-r from-sky-600 to-blue-600 text-white border-sky-500 shadow-xs',
                  containerTintClass: 'from-sky-50/75 via-white to-cyan-50/65 dark:from-sky-950/35 dark:via-[#0D1126] dark:to-cyan-950/30 border-sky-200/80 dark:border-sky-800/70',
                  cardAccentBorder: 'hover:border-sky-500 dark:hover:border-sky-400',
                  curatedImages: [
                    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=700&q=85',
                    'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=700&q=85',
                  ],
                },
              ];

              const currentAutoSpotMeta =
                spotlightRotationSequence[
                  spotlightHeroSlideIndex % spotlightRotationSequence.length
                ] || spotlightRotationSequence[0];

              const effectiveSpotlightSection: MarketSectionType =
                spotlightShowcaseSyncMode === 'auto' || spotlightShowcaseSyncMode === 'movies'
                  ? currentAutoSpotMeta.section
                  : spotlightShowcaseSyncMode;

              const effectiveSpotlightMeta =
                spotlightRotationSequence.find(
                  (m) => m.section === effectiveSpotlightSection
                ) || currentAutoSpotMeta;

              const sectionDisplayName =
                currentLang === 'te'
                  ? effectiveSpotlightMeta.labelTe
                  : effectiveSpotlightMeta.labelEn;

              const sectionSpecificPool = listings.filter(
                (l) =>
                  l.status === 'active' &&
                  resolveSectionForCategory(
                    l.categoryId,
                    l.customFieldValues?.sectionType
                  ) === effectiveSpotlightSection
              );

              const topFeaturedThree = (
                sectionSpecificPool.filter((l) => l.isFeatured).length >= 3
                  ? sectionSpecificPool.filter((l) => l.isFeatured)
                  : sectionSpecificPool.length > 0
                  ? sectionSpecificPool
                  : filteredListings
              ).slice(0, 3);

              // Custom SVG Vector Icon renderer for each Popular Category across all 6 market sections
              const renderPopularCategoryVectorIcon = (
                catId: string,
                section: MarketSectionType
              ): React.ReactNode => {
                const iconClass = 'w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2] shrink-0';
                switch (catId) {
                  // PG & Hostels Categories
                  case 'pg-students':
                  case 'class-academic':
                  case 'venue-education':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  case 'pg-professionals':
                  case 'class-professional':
                  case 'venue-corporate':
                  case 'hotel-corporate':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <rect x="2" y="7" width="20" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 12h20" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  case 'pg-boys':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <circle cx="10" cy="14" r="5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19 5l-5.4 5.4M15 5h4v4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  case 'pg-girls':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <circle cx="12" cy="9" r="5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 14v7M9 18h6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  case 'pg-coliving':
                  case 'hotel-couple':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  case 'pg-college-hostels':
                  case 'class-govtexams':
                  case 'venue-govt':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2L2 7h20L12 2z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  // Classes Categories
                  case 'class-software':
                  case 'srv-cctv':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <rect x="3" y="4" width="18" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 20h20M10 9l-2 2 2 2M14 9l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  case 'class-languages':
                  case 'venue-political':
                  case 'movie-standup':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  case 'class-music':
                  case 'movie-single':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    );
                  case 'class-dance':
                  case 'class-fitness':
                  case 'venue-sports':
                  case 'class-sports':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15l4-4 4 4 4-4M6 19h12" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  // Venues Categories
                  case 'venue-marriage':
                  case 'venue-birthday':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="M12 2L15 8l6 .9-4.3 4.2 1 6-5.7-3-5.7 3 1-6L3 8.9 9 8l3-6z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  // Services Categories
                  case 'cat-4':
                  case 'cat-5':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  case 'cat-1':
                  case 'cat-6':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  case 'cat-2':
                  case 'cat-3':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  // Hotels & Stays
                  case 'hotel-budget':
                  case 'hotel-luxury':
                  case 'hotel-service-apt':
                  case 'hotel-resorts':
                  case 'hotel-hourly':
                  case 'hotel-homestay':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  // Movies
                  case 'movie-multiplex':
                  case 'movie-imax':
                  case 'movie-telugu':
                  case 'movie-panindia':
                  case 'movie-hollywood':
                  case 'movie-private':
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <rect x="2" y="3" width="20" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                  default:
                    if (section === 'pg_hostels') {
                      return (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
                          <polyline points="9 22 9 12 15 12 15 22" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      );
                    }
                    if (section === 'classes') {
                      return (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                          <path d="M22 10v6M2 10l10-5 10 5-10 5z" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      );
                    }
                    if (section === 'venues') {
                      return (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                          <path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2L2 7h20L12 2z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      );
                    }
                    if (section === 'services') {
                      return (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      );
                    }
                    if (section === 'hotel_stay') {
                      return (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                          <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      );
                    }
                    return (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass}>
                        <rect x="2" y="3" width="20" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7 3v18M17 3v18" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    );
                }
              };

              // Category-specific curated imagery & theme tones keyed by category ID from activeMarketSection config
              const CATEGORY_VISUAL_THEMES: Record<
                string,
                {
                  image: string;
                  bgTone: string;
                  badgeGradient: string;
                  shortLabelEn?: string;
                  shortLabelTe?: string;
                  pgGenderFilter?: 'all' | 'boys' | 'girls' | 'coliving';
                }
              > = {
                // PG & Hostels (`pg29Categories`)
                'pg-students': {
                  image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-indigo-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-indigo-600 to-blue-600',
                  shortLabelEn: 'Students PGs',
                  shortLabelTe: 'స్టూడెంట్ పీజీలు',
                  pgGenderFilter: 'all',
                },
                'pg-professionals': {
                  image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-amber-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-amber-500 to-orange-600',
                  shortLabelEn: 'Working Professionals',
                  shortLabelTe: 'వర్కింగ్ ప్రొఫెషనల్స్',
                  pgGenderFilter: 'all',
                },
                'pg-boys': {
                  image: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-sky-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-sky-600 to-indigo-600',
                  shortLabelEn: 'Boys PGs',
                  shortLabelTe: 'బాయ్స్ పీజీలు',
                  pgGenderFilter: 'boys',
                },
                'pg-girls': {
                  image: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-pink-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-pink-600 to-rose-600',
                  shortLabelEn: 'Girls PGs',
                  shortLabelTe: 'గర్ల్స్ పీజీలు',
                  pgGenderFilter: 'girls',
                },
                'pg-coliving': {
                  image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-purple-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-purple-600 to-violet-600',
                  shortLabelEn: 'Co-Living',
                  shortLabelTe: 'కో-లివింగ్',
                  pgGenderFilter: 'coliving',
                },
                'pg-college-hostels': {
                  image: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-emerald-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-emerald-600 to-teal-600',
                  shortLabelEn: 'College & Univ. Nearby',
                  shortLabelTe: 'కాలేజ్ & వర్సిటీ దగ్గర',
                  pgGenderFilter: 'all',
                },
                // Classes (`classCategories`)
                'class-academic': {
                  image: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-indigo-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-indigo-600 to-blue-600',
                },
                'class-govtexams': {
                  image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-amber-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-amber-600 to-orange-600',
                },
                'class-software': {
                  image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-purple-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-purple-600 to-indigo-600',
                },
                'class-languages': {
                  image: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-emerald-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-emerald-600 to-teal-600',
                },
                'class-music': {
                  image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-rose-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-rose-600 to-pink-600',
                },
                'class-dance': {
                  image: 'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-pink-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-fuchsia-600 to-pink-600',
                },
                // Venues (`venue12Categories`)
                'venue-marriage': {
                  image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-rose-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-rose-600 to-amber-600',
                },
                'venue-govt': {
                  image: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-indigo-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-indigo-600 to-slate-700',
                },
                'venue-political': {
                  image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-amber-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-amber-600 to-red-600',
                },
                'venue-corporate': {
                  image: 'https://images.unsplash.com/photo-1431540015161-0bf868a2d407?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-sky-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-sky-600 to-indigo-600',
                },
                'venue-education': {
                  image: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-purple-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-purple-600 to-indigo-600',
                },
                'venue-religious': {
                  image: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-orange-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-orange-600 to-amber-600',
                },
                // Services (`servicesCategories`)
                'cat-4': {
                  image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-sky-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-sky-600 to-blue-600',
                },
                'cat-5': {
                  image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-amber-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-amber-600 to-orange-600',
                },
                'cat-1': {
                  image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-emerald-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-emerald-600 to-teal-600',
                },
                'cat-2': {
                  image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-yellow-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-amber-500 to-yellow-600',
                },
                'cat-3': {
                  image: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-indigo-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-blue-600 to-indigo-600',
                },
                'cat-6': {
                  image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-pink-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-pink-600 to-purple-600',
                },
                // Hotels & Stay (`hotelStayCategories`)
                'hotel-budget': {
                  image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-indigo-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-indigo-600 to-blue-600',
                },
                'hotel-luxury': {
                  image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-amber-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-amber-500 to-orange-600',
                },
                'hotel-service-apt': {
                  image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-emerald-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-emerald-600 to-teal-600',
                },
                'hotel-resorts': {
                  image: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-sky-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-teal-600 to-cyan-600',
                },
                'hotel-hourly': {
                  image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-purple-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-purple-600 to-indigo-600',
                },
                'hotel-couple': {
                  image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-rose-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-rose-600 to-pink-600',
                },
                // Movies (`moviesCategories`)
                'movie-multiplex': {
                  image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-purple-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-purple-600 to-indigo-600',
                },
                'movie-imax': {
                  image: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-indigo-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-indigo-600 to-blue-600',
                },
                'movie-single': {
                  image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-amber-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-amber-600 to-orange-600',
                },
                'movie-telugu': {
                  image: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-rose-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-rose-600 to-red-600',
                },
                'movie-panindia': {
                  image: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-emerald-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-emerald-600 to-teal-600',
                },
                'movie-hollywood': {
                  image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80',
                  bgTone: 'bg-sky-50/90 dark:bg-[#131836]',
                  badgeGradient: 'from-sky-600 to-blue-600',
                },
              };

              const fallbackBgTones = [
                'bg-indigo-50/90 dark:bg-[#131836]',
                'bg-amber-50/90 dark:bg-[#131836]',
                'bg-rose-50/90 dark:bg-[#131836]',
                'bg-pink-50/90 dark:bg-[#131836]',
                'bg-purple-50/90 dark:bg-[#131836]',
                'bg-emerald-50/90 dark:bg-[#131836]',
              ];

              const fallbackBadgeGradients = [
                'from-indigo-600 to-purple-600',
                'from-amber-500 to-orange-600',
                'from-rose-600 to-pink-600',
                'from-emerald-600 to-teal-600',
                'from-sky-600 to-indigo-600',
                'from-purple-600 to-fuchsia-600',
              ];

              // Admin-controlled per-city visibility (Popular Categories can be hidden per city)
              const visibilityCity =
                sharedSelectedCity && sharedSelectedCity !== 'All Cities' && sharedSelectedCity !== 'All Locations' && sharedSelectedCity !== 'all'
                  ? sharedSelectedCity
                  : (selectedLocationLabel?.split(',')[0]?.trim() || 'Hyderabad');
              const showPopularCategories = isPopularCategoriesVisible(visibilityCity);

              // Dynamically build Popular Categories from current market section config (`activeCategoryList`)
              const dynamicCategoriesSource = showAllPopularCategories
                ? activeCategoryList
                : activeCategoryList.slice(0, 6);

              const popularVisualCards = dynamicCategoriesSource.map((cat, idx) => {
                const theme = CATEGORY_VISUAL_THEMES[cat.id];
                const matchingCategoryListing = listings.find(
                  (l) => l.status === 'active' && l.categoryId === cat.id && l.images?.[0]
                );
                const resolvedLabel =
                  currentLang === 'te'
                    ? theme?.shortLabelTe || cat.nameTe
                    : currentLang === 'hi'
                    ? cat.nameHi
                    : theme?.shortLabelEn || cat.name;

                return {
                  id: cat.id,
                  emoji: cat.emoji || '✨',
                  vectorIcon: renderPopularCategoryVectorIcon(cat.id, activeMarketSection),
                  label: resolvedLabel,
                  subCount: cat.subcategories?.length || 4,
                  image:
                    theme?.image ||
                    matchingCategoryListing?.images?.[0] ||
                    topFeaturedThree[idx % Math.max(1, topFeaturedThree.length)]?.images?.[0] ||
                    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=400&q=80',
                  bgTone: theme?.bgTone || fallbackBgTones[idx % fallbackBgTones.length],
                  badgeGradient:
                    theme?.badgeGradient ||
                    fallbackBadgeGradients[idx % fallbackBadgeGradients.length],
                  isActive: selectedCategory === cat.id,
                  onSelect: () => {
                    if (selectedCategory === cat.id) {
                      setSelectedCategory('all');
                      setSelectedSubcategory('all');
                      if (activeMarketSection === 'pg_hostels') {
                        setSelectedPGGender('all');
                      }
                    } else {
                      setSelectedCategory(cat.id);
                      setSelectedSubcategory('all');
                      if (activeMarketSection === 'pg_hostels') {
                        setSelectedPGGender(theme?.pgGenderFilter || 'all');
                      }
                    }
                  },
                };
              });

              return (
                <div className="space-y-4">
                  {/* 1. DYNAMIC ONE-BY-ONE SPOTLIGHT 3-CARD SHOWCASE WITH DISTINCT CATEGORY COLORS & CURATED IMAGERY */}
                  {false && topFeaturedThree.length > 0 && (
                    <div
                      onMouseEnter={() => setIsSpotlightPaused(true)}
                      onMouseLeave={() => setIsSpotlightPaused(false)}
                      className={`bg-gradient-to-r ${effectiveSpotlightMeta.containerTintClass} rounded-3xl border p-3.5 sm:p-4 shadow-xs space-y-3 transition-colors duration-500`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div
                          key={`spot-title-${effectiveSpotlightSection}`}
                          className="animate-bos-spotlight-next flex flex-wrap items-center gap-2"
                        >
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-2xs ${effectiveSpotlightMeta.accentBadge}`}
                          >
                            {effectiveSpotlightMeta.chipLabel}
                          </span>
                          <h2 className="text-sm sm:text-base font-black text-[#1E1B4B] dark:text-white flex items-center gap-1.5">
                            <span className="text-base sm:text-lg">🔥</span>
                            <span>
                              {currentLang === 'te'
                                ? `హైదరాబాద్‌లో స్పాట్‌లైట్ ${sectionDisplayName}`
                                : `Spotlight ${sectionDisplayName} in Hyderabad`}
                            </span>
                          </h2>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (activeMarketSection !== effectiveSpotlightSection) {
                              setActiveMarketSection(effectiveSpotlightSection);
                              setSelectedCategory('all');
                              setSelectedSubcategory('all');
                            }
                            const gridEl = document.getElementById('bos-listings-feed-grid');
                            if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="text-xs font-extrabold text-[#4338CA] dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{currentLang === 'te' ? 'అన్నీ చూడండి' : 'See All'}</span>
                          <span>→</span>
                        </button>
                      </div>

                      {/* One-by-One Color-Coded Category Switcher Pills for Spotlight Showcase */}
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        <button
                          type="button"
                          onClick={() => setSpotlightShowcaseSyncMode('auto')}
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black transition cursor-pointer border ${
                            spotlightShowcaseSyncMode === 'auto'
                              ? 'bg-[#5B21B6] text-white border-[#5B21B6] shadow-2xs'
                              : 'bg-white/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          🔄 Auto One-by-One
                        </button>
                        {spotlightRotationSequence.map((rotItem, rIdx) => {
                          const isSelected =
                            effectiveSpotlightSection === rotItem.section;
                          return (
                            <button
                              key={rotItem.section}
                              type="button"
                              onClick={() => {
                                setSpotlightShowcaseSyncMode(rotItem.section);
                                setSpotlightHeroSlideIndex(rIdx);
                              }}
                              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black transition cursor-pointer border ${
                                isSelected
                                  ? rotItem.activeChipClass
                                  : 'bg-white/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                              }`}
                            >
                              {rotItem.chipLabel}
                            </button>
                          );
                        })}
                      </div>

                      <div
                        key={`spot-grid-${effectiveSpotlightSection}`}
                        className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-bos-spotlight-next"
                      >
                        {topFeaturedThree.map((item, cardIdx) => {
                          const isFav = favoriteIds.includes(item.id);
                          const displayTitle = getListingTitle(item, currentLang);
                          const rawUnit =
                            currentLang === 'te'
                              ? item.priceUnitTe || item.priceUnit
                              : item.priceUnit;
                          const unitLabel = getPriceUnitDisplayName(rawUnit, currentLang);
                          const areaLabel = item.location?.area
                            ? `${item.location.area.split('/')[0].trim()}, ${item.location.city || 'Hyderabad'}`
                            : 'Madhapur, Hyderabad';

                          const chips: string[] = [];
                          if (effectiveSpotlightSection === 'pg_hostels') {
                            const acText = String(item.customFieldValues?.roomTypesAvailable || item.title).toLowerCase();
                            chips.push(acText.includes('non-ac') ? 'Non-AC' : 'AC');
                            chips.push('WiFi');
                            chips.push('Food');
                          } else if (effectiveSpotlightSection === 'venues') {
                            chips.push('AC Hall');
                            chips.push('Valet Parking');
                            chips.push('Direct Owner');
                          } else if (effectiveSpotlightSection === 'classes') {
                            chips.push('Free Demo');
                            chips.push('Certified');
                            chips.push('Live Batch');
                          } else if (effectiveSpotlightSection === 'hotel_stay') {
                            chips.push('Lodge/Resort');
                            chips.push('Homestay');
                            chips.push('Instant Stay');
                          } else if (effectiveSpotlightSection === 'movies') {
                            chips.push('4K Dolby');
                            chips.push('Instant QR');
                            chips.push('IMAX/VIP');
                          } else {
                            chips.push(item.subcategory.split(' ')[0] || 'Verified');
                            chips.push('60-Min');
                            chips.push('Warranty');
                          }

                          const cardImage =
                            effectiveSpotlightMeta.curatedImages[
                              cardIdx % effectiveSpotlightMeta.curatedImages.length
                            ] ||
                            item.images[0] ||
                            'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=600&q=80';

                          return (
                            <div
                              key={`featured-top-${effectiveSpotlightSection}-${item.id}`}
                              style={{ animationDelay: `${cardIdx * 65}ms` }}
                              onClick={() => handleSelectListing(item)}
                              className={`animate-bos-card-cascade group rounded-2xl bg-white dark:bg-[#131836] border border-slate-200/90 dark:border-slate-800 ${effectiveSpotlightMeta.cardAccentBorder} overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between`}
                            >
                              {/* Card Image with Top-Left Category Color Badge & Top-Right Heart Button */}
                              <div className="relative h-36 sm:h-40 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                                <SafeImage category="general"
                                  src={cardImage}
                                  alt={displayTitle}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />
                                <div className="absolute top-2.5 left-2.5 flex items-center gap-1">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 shadow-xs ${effectiveSpotlightMeta.accentBadge}`}
                                  >
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>Verified</span>
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nowFav = toggleFavorite(item.id);
                                    showToast(
                                      nowFav
                                        ? '❤️ Added to My Favorites'
                                        : 'Removed from My Favorites'
                                    );
                                  }}
                                  aria-label="Toggle Favorite"
                                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-sm hover:scale-105 transition cursor-pointer"
                                >
                                  <Heart
                                    className={`w-4 h-4 ${
                                      isFav
                                        ? 'text-rose-500 fill-rose-500'
                                        : 'text-indigo-900 dark:text-slate-200'
                                    }`}
                                  />
                                </button>
                              </div>

                              {/* Card Body */}
                              <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                                <div className="space-y-1">
                                  <h3 className="text-xs sm:text-sm font-black text-[#1E1B4B] dark:text-white line-clamp-1 group-hover:text-[#5B21B6] dark:group-hover:text-purple-300">
                                    {displayTitle}
                                  </h3>
                                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    <MapPin className="w-3 h-3 text-[#4338CA] dark:text-indigo-400 shrink-0" />
                                    <span className="truncate">{areaLabel}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black flex items-center gap-0.5">
                                      <span>★</span>
                                      <span>{item.providerRating}</span>
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-400">
                                      ({item.reviewCount})
                                    </span>
                                  </div>
                                </div>

                                <div className="pt-1 space-y-2">
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-sm sm:text-base font-black text-slate-950 dark:text-white">
                                      {item.currency}
                                      {item.price.toLocaleString('en-IN')}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                      {unitLabel.startsWith('/') ? unitLabel : `/${unitLabel}`}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {chips.map((chip) => (
                                        <span
                                          key={chip}
                                          className="px-2 py-0.5 rounded-md bg-indigo-50/90 dark:bg-slate-800 text-[#312E81] dark:text-slate-300 border border-indigo-100 dark:border-slate-700 text-[10px] font-extrabold"
                                        >
                                          {chip}
                                        </span>
                                      ))}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectListing(item);
                                      }}
                                      aria-label="Open Listing"
                                      className={`w-7 h-7 rounded-full ${effectiveSpotlightMeta.accentBadge} flex items-center justify-center shadow-xs shrink-0 hover:scale-105 transition cursor-pointer`}
                                    >
                                      <ChevronRight className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 1.5 FESTIVE LIMITED PERIOD OFFER BANNER */}
                  {false && (
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#D97706] text-white p-4 sm:px-6 sm:py-4.5 shadow-md border border-purple-400/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] text-amber-200">
                        🎁 LIMITED PERIOD OFFER • {effectiveSpotlightMeta.chipLabel}
                      </span>
                      <h3 className="text-lg sm:text-2xl font-black tracking-tight text-[#FDE68A] leading-tight">
                        {currentLang === 'te'
                          ? `వెరిఫైడ్ ${sectionDisplayName} బుక్ చేయండి`
                          : `Book Verified ${sectionDisplayName}`}
                      </h3>
                      <p className="text-xs sm:text-sm font-bold text-white/95">
                        {currentLang === 'te'
                          ? 'మీ మొదటి డైరెక్ట్ బుకింగ్‌పై ₹150 క్యాష్‌బ్యాక్ పొందండి'
                          : 'Get ₹150 Cashback on your first direct owner booking in Hyderabad'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const gridEl = document.getElementById('bos-listings-feed-grid');
                        if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="self-start sm:self-center shrink-0 px-5 py-2.5 rounded-full bg-white hover:bg-amber-50 text-[#4C1D95] font-black text-xs sm:text-sm shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>{currentLang === 'te' ? 'ఇప్పుడే బుక్ చేయండి' : 'Book Now'}</span>
                      <span>→</span>
                    </button>
                  </div>
                  )}

                  {/* 2. "FIND PG'S NEAR YOU — VIEW ON INTERACTIVE MAP" BANNER */}
                  {false && (
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#F0FDF4] via-white to-[#EEF2FF] dark:from-[#161233] dark:via-[#1C183E] dark:to-[#102338] border border-slate-200/90 dark:border-purple-500/30 p-3.5 sm:px-5 sm:py-4 shadow-xs">
                    {/* Stylized map roads grid background on right */}
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-35 dark:opacity-25"
                      style={{
                        backgroundImage:
                          'linear-gradient(to right, rgba(99,102,241,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(16,185,129,0.18) 1px, transparent 1px)',
                        backgroundSize: '22px 22px',
                      }}
                    />

                    <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 dark:bg-purple-500/20 border border-emerald-400/40 dark:border-purple-400/40 flex items-center justify-center shrink-0">
                          <MapPin className="w-6 h-6 text-emerald-600 dark:text-purple-400 fill-emerald-500/20" />
                        </div>
                        <div>
                          <h3 className="text-sm sm:text-base font-black text-[#1E1B4B] dark:text-white leading-tight">
                            {currentLang === 'te'
                              ? `మీ దగ్గరలోని ${sectionDisplayName} కనుగొనండి`
                              : `Find ${sectionDisplayName} near you`}
                          </h3>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                            {currentLang === 'te'
                              ? 'ఇంటరాక్టివ్ మ్యాప్‌లో చూడండి'
                              : 'View on interactive map'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 ml-auto">
                        <button
                          type="button"
                          onClick={() => setIsMapExplorerOpen((prev) => !prev)}
                          className="px-4 py-2 rounded-full bg-gradient-to-r from-[#5B21B6] to-[#7C3AED] hover:from-[#4C1D95] hover:to-[#6D28D9] text-white text-xs font-black flex items-center gap-1.5 shadow-[0_4px_14px_rgba(109,40,217,0.4)] transition active:scale-95 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>
                            {isMapExplorerOpen
                              ? currentLang === 'te'
                                ? 'మ్యాప్ మూసివేయి'
                                : 'Hide Map'
                              : currentLang === 'te'
                              ? 'మ్యాప్ చూడండి'
                              : 'View Map'}
                          </span>
                        </button>

                        <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-[11px] font-black text-slate-800 dark:text-amber-300 shadow-2xs">
                          <MapPin className="w-3 h-3 text-orange-500" />
                          <span>{sectionDisplayName}</span>
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedArea('Madhapur / Hitech City');
                            setSelectedRadius(5);
                            showToast('📍 Showing listings within 5 km of your location');
                          }}
                          title="Filter within 5 km"
                          className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[#4338CA] dark:text-indigo-400 shadow-2xs hover:scale-105 transition cursor-pointer"
                        >
                          <span className="text-sm leading-none">🎯</span>
                        </button>
                      </div>
                    </div>

                    {/* Expandable Interactive Area Map Explorer */}
                    {isMapExplorerOpen && (
                      <div className="relative z-10 mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-2.5 animate-in fade-in duration-150">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-black text-[#1E1B4B] dark:text-white">
                            🗺️ Select a Hyderabad Neighborhood Pin ({filteredListings.length} active {sectionDisplayName}):
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedArea('all');
                              setSelectedRadius('all');
                            }}
                            className="text-[11px] font-bold text-[#4338CA] dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            Reset Area Pin
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                          {popularAreasList.slice(0, 10).map((area) => {
                            const isPinActive = selectedArea === area;
                            return (
                              <button
                                key={area}
                                type="button"
                                onClick={() => {
                                  setSelectedArea(area);
                                  showToast(`📍 Map Pin: ${area}`);
                                }}
                                className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0 border transition cursor-pointer ${
                                  isPinActive
                                    ? 'bg-[#5B21B6] text-white border-[#5B21B6] shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-purple-400'
                                }`}
                              >
                                <MapPin className="w-3 h-3 text-orange-500 shrink-0" />
                                <span>{area === 'All Areas in City' ? 'All Hyderabad' : area}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {/* 3. "⭐ POPULAR CATEGORIES" DYNAMIC VISUAL STRIP WITH CUSTOM VECTOR ICONS & EMOJIS */}
                  {showPopularCategories && (
                  <div className="bg-white/90 dark:bg-[#0D1126] rounded-3xl border border-slate-200/80 dark:border-slate-800/90 p-3.5 sm:p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <h2 className="text-sm sm:text-base font-black text-[#1E1B4B] dark:text-white flex items-center gap-1.5">
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                          <span>
                            {currentLang === 'te' ? 'పాపులర్ కేటగిరీలు' : 'Popular Categories'}
                          </span>
                        </h2>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/80 dark:border-indigo-800/70 text-[10px] font-black text-[#4338CA] dark:text-indigo-300">
                          {sectionDisplayName} • {activeCategoryList.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        {selectedCategory !== 'all' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategory('all');
                              setSelectedSubcategory('all');
                              if (activeMarketSection === 'pg_hostels') {
                                setSelectedPGGender('all');
                              }
                            }}
                            className="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[11px] font-extrabold text-rose-600 dark:text-rose-300 cursor-pointer"
                          >
                            {currentLang === 'te' ? 'క్లియర్' : 'Reset'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (activeCategoryList.length > 6) {
                              setShowAllPopularCategories((prev) => !prev);
                            } else {
                              const gridEl = document.getElementById('bos-listings-feed-grid');
                              if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth' });
                            }
                          }}
                          className="text-xs font-extrabold text-[#4338CA] dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>
                            {activeCategoryList.length > 6
                              ? showAllPopularCategories
                                ? currentLang === 'te'
                                  ? 'టాప్ 6 చూపించు'
                                  : 'Show Top 6'
                                : currentLang === 'te'
                                ? `అన్నీ చూడండి (${activeCategoryList.length})`
                                : `See All (${activeCategoryList.length})`
                              : currentLang === 'te'
                              ? 'అన్నీ చూడండి'
                              : 'See All'}
                          </span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                      {popularVisualCards.map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => {
                            card.onSelect();
                            if (isTemplateEnabled('category_rail_stream_explorer')) {
                              setIsRailStreamExplorerOpen(true);
                            }
                            const railEl =
                              document.getElementById('bos-category-rail-stream-explorer') ||
                              document.getElementById('bos-listings-feed-grid');
                            if (railEl) railEl.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className={`group relative rounded-2xl overflow-hidden border transition-all p-1.5 flex flex-col items-center text-center cursor-pointer ${
                            card.isActive
                              ? 'border-[#5B21B6] dark:border-purple-400 ring-2 ring-[#5B21B6]/30 dark:ring-purple-400/40 bg-purple-50/95 dark:bg-[#1E1B4B] shadow-md -translate-y-0.5'
                              : `border-slate-200/80 dark:border-slate-800 hover:border-purple-400 dark:hover:border-purple-500 ${card.bgTone} shadow-2xs hover:shadow-md hover:-translate-y-0.5`
                          }`}
                        >
                          {/* Category Photo Container with Custom Vector Icon + Emoji Overlay Badge */}
                          <div className="relative w-full h-16 sm:h-20 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 mb-1.5">
                            <SafeImage category="general"
                              src={card.image}
                              alt={card.label}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-950/10 to-transparent" />

                            {/* Top-Left Custom Vector Icon + Emoji Pill */}
                            <span
                              className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-lg bg-gradient-to-r ${card.badgeGradient} text-white shadow-xs flex items-center gap-1 border border-white/25`}
                            >
                              {card.vectorIcon}
                              <span className="text-[11px] leading-none">{card.emoji}</span>
                            </span>

                            {/* Top-Right Active Checkmark or Subcategory Count Pill */}
                            {card.isActive ? (
                              <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            ) : (
                              <span className="absolute bottom-1 right-1.5 px-1.5 py-0.2 rounded-md bg-black/55 backdrop-blur-xs text-white text-[9px] font-extrabold">
                                {card.subCount}+
                              </span>
                            )}
                          </div>

                          {/* Category Title with Emoji + Vector Recognition */}
                          <div className="w-full flex items-center justify-center gap-1 px-0.5 py-0.5">
                            <span className="text-xs leading-none shrink-0">{card.emoji}</span>
                            <span
                              className={`text-[11px] font-black leading-tight line-clamp-2 ${
                                card.isActive
                                  ? 'text-[#5B21B6] dark:text-amber-300'
                                  : 'text-[#1E1B4B] dark:text-slate-100'
                              }`}
                            >
                              {card.label}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              );
            })()}

            {/* QUICK ACTION BUTTONS ROW (ADMIN ENABLE/DISABLE • DEFAULT HIDDEN) */}
            {isTemplateEnabled('quick_action_pills_bar') && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">

                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs hover:bg-slate-50 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    {supabaseUser
                      ? supabaseUser.email
                      : currentLang === 'te'
                      ? 'సైన్ ఇన్ / ఖాతా'
                      : 'Sign In / Account'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveQuickModal('favorites')}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs hover:bg-rose-50 cursor-pointer"
                >
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                  <span>
                    {currentLang === 'te' ? 'నా ఫేవరెట్స్' : 'My Favorites'} ({favoriteIds.length})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveQuickModal('wallet')}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs hover:bg-indigo-50 cursor-pointer"
                >
                  <Wallet className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    {currentLang === 'te' ? 'వాలెట్ & లెడ్జర్' : 'Wallet & Ledger'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveQuickModal('support')}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs hover:bg-emerald-50 cursor-pointer"
                >
                  <Headphones className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{currentLang === 'te' ? 'సపోర్ట్ (24/7)' : 'Support'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveQuickModal('refer_earn')}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs hover:bg-amber-50 cursor-pointer"
                >
                  <Gift className="w-3.5 h-3.5 text-amber-500" />
                  <span>
                    {currentLang === 'te' ? 'రిఫర్ & ₹500 గెలుచుకోండి' : 'Refer & Earn ₹500'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveQuickModal('help_centre')}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs hover:bg-purple-50 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
                  <span>{currentLang === 'te' ? 'హెల్ప్ సెంటర్' : 'Help Centre'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsUniversalEditorOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-black flex items-center gap-1.5 shrink-0 shadow-xs hover:from-indigo-700 hover:to-purple-700 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>
                    {currentLang === 'te'
                      ? '🧩 యూనివర్సల్ ఆబ్జెక్ట్ ఎడిటర్'
                      : '🧩 Universal Object Editor'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = modularTemplates.map((t) =>
                      t.id === 'barcode_verifier_hub' ? { ...t, enabled: !t.enabled } : t
                    );
                    saveModularTemplates(next);
                    setModularTemplates(next);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer ${
                    isTemplateEnabled('barcode_verifier_hub')
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>🏷️</span>
                  <span>
                    {currentLang === 'te' ? 'పాస్ వెరిఫైయర్' : 'Pass Verifier'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowNotificationsDropdown(true)}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-black flex items-center gap-1.5 shrink-0 shadow-2xs hover:bg-slate-50 cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-500" />
                  <span>
                    {currentLang === 'te' ? 'అలర్ట్స్' : 'Alerts'}
                    {unreadNotificationsCount > 0 ? ` (${unreadNotificationsCount})` : ''}
                  </span>
                </button>
              </div>
            )}

            {/* INDEPENDENT MODULES & TEMPLATES CUSTOMIZER BAR (ADMIN ENABLE/DISABLE • DEFAULT HIDDEN) */}
            {isTemplateEnabled('independent_modules_bar') && (
              <SelfHealingBoundary moduleId="modular_template_bar" moduleName="Independent Modules & Templates Bar">
                <Suspense fallback={null}>
                <UserModularTemplateBar
                  templates={modularTemplates}
                  onUpdateTemplates={(next) => {
                    saveModularTemplates(next);
                    setModularTemplates(next);
                  }}
                  onOpenAdminBuilder={() => {
                    if (!isAdminSession) {
                      showToast('🛡️ Admin console requires a signed-in administrator account.');
                      return;
                    }
                    setUserRole('admin');
                    setActiveView('admin_console');
                  }}
                />
                </Suspense>
              </SelfHealingBoundary>
            )}

            {/* STANDALONE BARCODE PASS & TICKET VERIFIER HUB MODULE */}
            {isTemplateEnabled('barcode_verifier_hub') && (
              <SelfHealingBoundary
                moduleId="barcode_verifier_hub"
                moduleName="Standalone Barcode Pass & Ticket Verifier"
                onDisableModule={(id) => {
                  const next = modularTemplates.map((m) =>
                    m.id === id ? { ...m, enabled: false } : m
                  );
                  saveModularTemplates(next);
                  setModularTemplates(next);
                }}
              >
                <Suspense fallback={<p className="text-xs text-slate-500" role="status">Loading barcode verification…</p>}>
                  <StandaloneBarcodeVerifierHub
                    sampleCodes={[
                      ...bookings.slice(0, 3).map((bk) => ({
                        code: generateBosBarcodeId('TKT', `${bk.listingId}-${bk.id}`, activeMarketSection),
                        title: `${bk.listingTitle} (${bk.customerName})`,
                        section: activeMarketSection,
                      })),
                      ...filteredListings.slice(0, 3).map((l) => ({
                        code: generateBosBarcodeId('BOS', l.id, l.categoryId),
                        title: l.title,
                        section: l.categoryId,
                      })),
                    ]}
                  />
                </Suspense>
              </SelfHealingBoundary>
            )}

            {/* ADMIN NO-CODE DRAG & DROP CUSTOM FEATURES SHOWCASE MODULE */}
            {isTemplateEnabled('dynamic_admin_widgets') && (
              <SelfHealingBoundary
                moduleId="dynamic_admin_widgets"
                moduleName="Admin Drag & Drop Custom Features"
                onDisableModule={(id) => {
                  const next = modularTemplates.map((m) =>
                    m.id === id ? { ...m, enabled: false } : m
                  );
                  saveModularTemplates(next);
                  setModularTemplates(next);
                }}
              >
                <Suspense fallback={null}>
                <DynamicAdminFeaturesShowcase
                  features={dynamicFeatures}
                  activeSection={activeMarketSection}
                  onUpdateFeatureValue={(id, value) => {
                    const updated = dynamicFeatures.map((f) =>
                      f.id === id ? { ...f, value } : f
                    );
                    setDynamicFeatures(updated);
                    saveDynamicAdminFeatures(updated);
                  }}
                />
                </Suspense>
              </SelfHealingBoundary>
            )}

            {/* CUSTOM / UNDEFINED PLUG-AND-PLAY TEMPLATE SLOTS (WHEN ENABLED) */}
            {modularTemplates
              .filter((tpl) => tpl.isUndefinedTemplate && tpl.enabled)
              .map((tpl) => (
                <SelfHealingBoundary
                  key={tpl.id}
                  moduleId={tpl.id}
                  moduleName={tpl.name}
                  onDisableModule={(id) => {
                    const next = modularTemplates.map((m) =>
                      m.id === id ? { ...m, enabled: false } : m
                    );
                    saveModularTemplates(next);
                    setModularTemplates(next);
                  }}
                >
                  <div className="bg-gradient-to-r from-indigo-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{tpl.icon || '📦'}</span>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                          {tpl.customTitle || tpl.name}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {tpl.customContent ||
                            'Independent custom plug-and-play module slot enabled and synced.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = modularTemplates.map((m) =>
                          m.id === tpl.id ? { ...m, enabled: false } : m
                        );
                        saveModularTemplates(next);
                        setModularTemplates(next);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Disable Slot
                    </button>
                  </div>
                </SelfHealingBoundary>
              ))}

            {/* LIVE SPONSORED ADS & PUBLISHED ADMIN CAMPAIGNS STRIP */}
            {homeEnhancementsReady && activeMarketSection !== 'movies' && (
              <SelfHealingBoundary moduleId="live_sponsored_ads" moduleName="Sponsored Campaigns Strip">
                <Suspense fallback={null}>
                <LiveSponsoredAdsStrip
                  activeMarketSection={activeMarketSection}
                  onSelectQuery={(q) => setSearchQuery(q)}
                  onSelectSection={(sec) => {
                    if (
                      sec === 'pg_hostels' ||
                      sec === 'classes' ||
                      sec === 'venues' ||
                      sec === 'services' ||
                      sec === 'hotel_stay' ||
                      sec === 'movies'
                    ) {
                      setActiveMarketSection(sec);
                      setSelectedCategory('all');
                      setSelectedSubcategory('all');
                    }
                  }}
                />
                </Suspense>
              </SelfHealingBoundary>
            )}

            {/* ACTIVE FILTER STATUS STRIP (ADMIN ENABLE/DISABLE • DEFAULT HIDDEN) */}
            {isTemplateEnabled('active_filter_status_strip') && (selectedCategory !== 'all' || selectedSubcategory !== 'all' || selectedRadius !== 'all' || selectedPriceRange !== 'all' || selectedRating !== 'all' || selectedArea !== 'all' || Boolean(filterStartDate || filterEndDate) || searchQuery || selectedPGGender !== 'all' || selectedPGSharing !== 'all' || selectedPGAC !== 'all' || selectedPGFood !== 'all' || selectedDeliveryMode !== 'all' || selectedTimingSlot !== 'all' || freeTrialOnly) && (
              <div className="p-2.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-purple-900 dark:text-purple-300">{t.activeFilter}</span>

                  {(filterStartDate || filterEndDate) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 font-black text-emerald-900 dark:text-emerald-200 text-[11px]">
                      <Calendar className="w-3 h-3 text-emerald-600" />
                      <span>
                        {filterStartDate || filterEndDate}
                        {filterEndDate && filterEndDate !== filterStartDate ? ` → ${filterEndDate}` : ''}
                      </span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => {
                          setFilterStartDate('');
                          setFilterEndDate('');
                        }}
                      />
                    </span>
                  )}

                  {selectedCategory !== 'all' && (selectedPGCategoryObj || selectedVenueCategoryObj || selectedClassCategoryObj) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 font-bold text-purple-800 dark:text-purple-200 text-[11px]">
                      <span>{selectedPGCategoryObj ? selectedPGCategoryObj.emoji : selectedClassCategoryObj ? selectedClassCategoryObj.emoji : selectedVenueCategoryObj?.emoji}</span>
                      <span>
                        {selectedPGCategoryObj
                          ? (currentLang === 'te' ? selectedPGCategoryObj.nameTe : selectedPGCategoryObj.name)
                          : selectedClassCategoryObj
                          ? (currentLang === 'te' ? selectedClassCategoryObj.nameTe : selectedClassCategoryObj.name)
                          : selectedVenueCategoryObj
                          ? (currentLang === 'te' ? selectedVenueCategoryObj.nameTe : selectedVenueCategoryObj.name)
                          : selectedCategory}
                      </span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => {
                          setSelectedCategory('all');
                          setSelectedSubcategory('all');
                        }}
                      />
                    </span>
                  )}

                  {selectedSubcategory !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 font-bold text-amber-900 dark:text-amber-200 text-[11px]">
                      <span>{getSubcategoryDisplayName(selectedSubcategory, currentLang)}</span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => setSelectedSubcategory('all')}
                      />
                    </span>
                  )}

                  {selectedPGGender !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-pink-100 dark:bg-pink-950/70 border border-pink-300 dark:border-pink-700 font-bold text-pink-900 dark:text-pink-200 text-[11px]">
                      <span>Type: {selectedPGGender}</span>
                      <X className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500" onClick={() => setSelectedPGGender('all')} />
                    </span>
                  )}

                  {selectedPGSharing !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/70 border border-cyan-300 dark:border-cyan-700 font-bold text-cyan-900 dark:text-cyan-200 text-[11px]">
                      <span>Room: {selectedPGSharing}</span>
                      <X className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500" onClick={() => setSelectedPGSharing('all')} />
                    </span>
                  )}

                  {selectedPGAC !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/70 border border-blue-300 dark:border-blue-700 font-bold text-blue-900 dark:text-blue-200 text-[11px]">
                      <span>AC: {selectedPGAC}</span>
                      <X className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500" onClick={() => setSelectedPGAC('all')} />
                    </span>
                  )}

                  {selectedPGFood !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 font-bold text-emerald-900 dark:text-emerald-200 text-[11px]">
                      <span>Food: {selectedPGFood}</span>
                      <X className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500" onClick={() => setSelectedPGFood('all')} />
                    </span>
                  )}

                  {selectedDeliveryMode !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/70 border border-indigo-300 dark:border-indigo-700 font-bold text-indigo-900 dark:text-indigo-200 text-[11px]">
                      <span>Mode: {selectedDeliveryMode}</span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => setSelectedDeliveryMode('all')}
                      />
                    </span>
                  )}

                  {selectedTimingSlot !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/70 border border-sky-300 dark:border-sky-700 font-bold text-sky-900 dark:text-sky-200 text-[11px]">
                      <span>Timing: {selectedTimingSlot}</span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => setSelectedTimingSlot('all')}
                      />
                    </span>
                  )}

                  {freeTrialOnly && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 font-bold text-emerald-900 dark:text-emerald-200 text-[11px]">
                      <span>🎁 Free Trial Demo</span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => setFreeTrialOnly(false)}
                      />
                    </span>
                  )}

                  {selectedRadius !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 border border-purple-300 dark:border-purple-700 font-bold text-purple-900 dark:text-purple-200 text-[11px]">
                      <Clock className="w-3 h-3 text-purple-600" />
                      <span>{selectedRadius === 5 ? t.within5km : selectedRadius === 10 ? t.within10km : t.within15km}</span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => setSelectedRadius('all')}
                      />
                    </span>
                  )}

                  {selectedPriceRange !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 font-bold text-emerald-900 dark:text-emerald-200 text-[11px]">
                      <Tag className="w-3 h-3 text-emerald-600" />
                      <span>{selectedPriceRange === 'under500' ? t.under500 : selectedPriceRange === '500to1000' ? t.price500to1000 : t.above1000}</span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => setSelectedPriceRange('all')}
                      />
                    </span>
                  )}

                  {selectedRating !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 font-bold text-amber-900 dark:text-amber-200 text-[11px]">
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      <span>{selectedRating === 4.5 ? t.rating45Plus : t.rating40Plus}</span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => setSelectedRating('all')}
                      />
                    </span>
                  )}

                  {selectedArea !== 'all' && selectedArea !== 'All Areas in City' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 border border-blue-300 dark:border-blue-700 font-bold text-blue-900 dark:text-blue-200 text-[11px]">
                      <MapPin className="w-3 h-3 text-blue-600" />
                      <span>{selectedArea}</span>
                      <X
                        className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500"
                        onClick={() => setSelectedArea('all')}
                      />
                    </span>
                  )}

                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 font-medium text-[11px]">
                      <span>"{searchQuery}"</span>
                      <X className="w-3 h-3 cursor-pointer hover:text-red-500" onClick={() => setSearchQuery('')} />
                    </span>
                  )}
                </div>

                <button
                  onClick={handleResetFilters}
                  className="text-rose-600 dark:text-rose-400 font-bold hover:underline flex items-center gap-1 text-[11px]"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{t.clearFilters}</span>
                </button>
              </div>
            )}


            {/* UNIVERSAL BUILDER — PUBLISHED CONFIGURABLE REGION (presentation only; live listing/booking logic stays in the feed below) */}
            {homeEnhancementsReady && <Suspense fallback={null}><PublishedBuilderRegion pageKey={activeMarketSection} /></Suspense>}

            {/* SCHEDULED SPOTLIGHT STRIP ANNOUNCEMENTS */}
            {homeEnhancementsReady && <Suspense fallback={null}><LiveScheduledAnnouncementsBanner
              placement="spotlight_strip"
              userRole={userRole}
              currentLang={currentLang}
              activeSection={activeMarketSection}
            /></Suspense>}

            {/* SPOTLIGHT SHOWCASE (3-image animated banner) — REMOVED per product request */}

            {/* SCHEDULED SECTION CARD ANNOUNCEMENTS */}
            {homeEnhancementsReady && <Suspense fallback={null}><LiveScheduledAnnouncementsBanner
              placement="section_card"
              userRole={userRole}
              currentLang={currentLang}
              activeSection={activeMarketSection}
            /></Suspense>}

            {/* 4. VENUE TRENDING NEAR ME SECTION (SHOWN FOR FUNCTIONAL HALLS & VENUES) */}
            {activeMarketSection === 'venues' && isTemplateEnabled('trending_near_me') && (
              <SelfHealingBoundary moduleId="trending_near_me" moduleName="Trending Near Me">
                <TrendingNearMeSection
                  listings={filteredListings}
                  currentLang={currentLang}
                  onSelectListing={handleSelectListing}
                  onBookListing={(item) => setBookingListing(item)}
                  onRateListing={(item) => setReviewListing(item)}
                />
              </SelfHealingBoundary>
            )}

            {/* 4B. BOOKOURSPACE MOVIES — app-style "Movies in <city>" screen with language pills, date chips and showtime cards. */}
            {activeMarketSection === 'movies' && (
              <Suspense fallback={<p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600" role="status">Loading movies…</p>}>
                <SelfHealingBoundary moduleId="district_movies_section" moduleName="BookOurSpace Movies Section">
                  <MoviesShowtimes inline selectedCity={sharedSelectedCity} style={sectionStyles.movies} />
                </SelfHealingBoundary>
              </Suspense>
            )}

            {/* LISTINGCARD SEARCH RESULTS VIEW — DATE-RANGE AVAILABILITY FILTER & RESULTS HEADER (ADMIN ENABLE/DISABLE • PRESENT DISABLED) */}
            {isPageSectionVisible('search_date_range_filter') && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-purple-200/80 dark:border-slate-800 p-3 sm:p-4 shadow-xs space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  {/* Left: Search Results Title & Live Availability Count */}
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/70 text-[#4A148C] dark:text-purple-300 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                          {currentLang === 'te'
                            ? 'అందుబాటులో ఉన్న లిస్టింగ్‌లు & తేదీల ఫిల్టర్'
                            : currentLang === 'hi'
                            ? 'उपलब्ध लिस्टिंग और तिथि-सीमा फ़िल्टर'
                            : 'Search Results & Date-Range Availability Filter'}
                        </h2>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                          {filteredListings.length}{' '}
                          {currentLang === 'te'
                            ? 'అందుబాటులో ఉన్నాయి'
                            : currentLang === 'hi'
                            ? 'उपलब्ध'
                            : 'Available'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {filterStartDate || filterEndDate
                          ? currentLang === 'te'
                            ? `ఎంచుకున్న తేదీలు: ${filterStartDate || filterEndDate} → ${filterEndDate || filterStartDate}`
                            : `Showing listings available from ${filterStartDate || filterEndDate} to ${filterEndDate || filterStartDate}`
                          : currentLang === 'te'
                          ? 'చెక్-ఇన్ మరియు చెక్-అవుట్ తేదీలను ఎంచుకుని అందుబాటులో ఉన్న హాళ్లు, హోటళ్లు & సర్వీసులను చూడండి'
                          : 'Filter listings by check-in & check-out date range availability'}
                      </p>
                    </div>
                  </div>

                  {/* Right: Quick Date-Range Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      {
                        label: currentLang === 'te' ? 'ఈరోజు' : currentLang === 'hi' ? 'आज' : 'Today',
                        start: todayLocalIso,
                        end: todayLocalIso,
                      },
                      {
                        label: currentLang === 'te' ? 'రేపు' : currentLang === 'hi' ? 'कल' : 'Tomorrow',
                        start: shiftIsoDays(todayLocalIso, 1),
                        end: shiftIsoDays(todayLocalIso, 2),
                      },
                      {
                        label:
                          currentLang === 'te'
                            ? 'ఈ వారాంతం (2 రాత్రులు)'
                            : currentLang === 'hi'
                            ? 'वीकेंड (2 रातें)'
                            : 'Weekend (2 Nights)',
                        start: shiftIsoDays(todayLocalIso, 2),
                        end: shiftIsoDays(todayLocalIso, 4),
                      },
                      {
                        label:
                          currentLang === 'te'
                            ? 'వచ్చే 7 రోజులు'
                            : currentLang === 'hi'
                            ? 'अगले 7 दिन'
                            : 'Next 7 Days',
                        start: todayLocalIso,
                        end: shiftIsoDays(todayLocalIso, 7),
                      },
                    ].map((preset) => {
                      const isPresetActive =
                        filterStartDate === preset.start && filterEndDate === preset.end;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setFilterStartDate(preset.start);
                            setFilterEndDate(preset.end);
                          }}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition border cursor-pointer ${
                            isPresetActive
                              ? 'bg-[#4A148C] text-white border-[#4A148C] shadow-2xs'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-400'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Date Range Inputs Row */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="sm:col-span-5">
                    <label className="text-[10px] font-black uppercase text-purple-900 dark:text-purple-300 block mb-1">
                      {currentLang === 'te'
                        ? '🟢 ప్రారంభ / చెక్-ఇన్ తేదీ (From Date)'
                        : currentLang === 'hi'
                        ? '🟢 चेक-इन / प्रारंभ तिथि'
                        : '🟢 Check-in / Start Date'}
                    </label>
                    <input
                      type="date"
                      min={todayLocalIso}
                      value={filterStartDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilterStartDate(val);
                        if (val && (!filterEndDate || filterEndDate < val)) {
                          setFilterEndDate(shiftIsoDays(val, 1));
                        }
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-purple-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-black text-slate-900 dark:text-white outline-hidden focus:border-[#4A148C] cursor-pointer"
                    />
                  </div>

                  <div className="sm:col-span-5">
                    <label className="text-[10px] font-black uppercase text-indigo-900 dark:text-indigo-300 block mb-1">
                      {currentLang === 'te'
                        ? '🔴 ముగింపు / చెక్-అవుట్ తేదీ (To Date)'
                        : currentLang === 'hi'
                        ? '🔴 चेक-आउट / समाप्ति तिथि'
                        : '🔴 Check-out / End Date'}
                    </label>
                    <input
                      type="date"
                      min={filterStartDate || todayLocalIso}
                      value={filterEndDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilterEndDate(val);
                        if (val && !filterStartDate) {
                          setFilterStartDate(val);
                        }
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-black text-slate-900 dark:text-white outline-hidden focus:border-indigo-600 cursor-pointer"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center gap-1.5">
                    {filterStartDate || filterEndDate ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterStartDate('');
                          setFilterEndDate('');
                        }}
                        className="w-full px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-black flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{currentLang === 'te' ? 'క్లియర్' : 'Clear'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterStartDate(todayLocalIso);
                          setFilterEndDate(shiftIsoDays(todayLocalIso, 1));
                        }}
                        className="w-full px-3 py-1.5 rounded-xl bg-[#4A148C] hover:bg-purple-800 text-white text-xs font-black flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{currentLang === 'te' ? 'ఈరోజు' : 'Set Dates'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* LISTINGS FEED GRID (SHOWN FOR ALL SECTIONS, OR WHEN CLASSIC CARDS TOGGLED ON IN MOVIES) */}
            {/* HALLS — MANDAP-STYLE VENUE TYPES, FILTERS & CARDS */}
            {activeMarketSection === 'venues' && (
              <div className="mb-3">
                {false && <DemoBookableCard section="venues" className="mb-3" />}
                {sectionStyles.venues === 'style3' ? (
                  <div className="mx-auto max-w-5xl px-1 py-4">
                    <StyleThreeList
                      label="Venues style 3 list"
                      items={locationFilteredListings
                        .filter((l) => l.categoryId.startsWith('venue-'))
                        .map((listing) => ({
                          id: listing.id,
                          title: listing.title,
                          subtitle: [listing.subcategory, listing.location?.area, listing.location?.city].filter(Boolean).join(' · '),
                          meta: [listing.providerName, listing.priceUnit].filter(Boolean).join(' · '),
                          price: `${!listing.currency || listing.currency === 'INR' ? '₹' : listing.currency}${Number(listing.price || 0).toLocaleString('en-IN')}`,
                          image: listing.images?.[0] || null,
                          badge: listing.isVerified ? 'Verified' : undefined,
                          onClick: () => handleSelectListing(listing),
                        }))}
                      emptyLabel="No venues match these filters."
                    />
                  </div>
                ) : (
                  <>
                    <HallsMandapExperience
                      listings={locationFilteredListings.filter((l) => l.categoryId.startsWith('venue-'))}
                      activeType={hallsVenueType}
                      onSelectType={setHallsVenueType}
                      onOpenListing={handleSelectListing}
                      selectedCategory={selectedCategory}
                    />
                  </>
                )}
              </div>
            )}

            {isTemplateEnabled('listings_grid') && activeMarketSection !== 'movies' && !(activeMarketSection === 'venues' && (sectionStyles.venues === 'agenda' || sectionStyles.venues === 'style3')) && (
              filteredListings.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="w-14 h-14 bg-purple-50 dark:bg-purple-950/50 rounded-2xl mx-auto flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <Search className="w-7 h-7" />
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    {t.noResultsTitle}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {t.noResultsDesc}
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedArea('all');
                        setSelectedRadius('all');
                        setSelectedPriceRange('all');
                        setSelectedRating('all');
                        setFilterStartDate('');
                        setFilterEndDate('');
                      }}
                      className="px-4 py-2 rounded-xl bg-[#4A148C] text-white font-bold text-xs shadow-sm"
                    >
                      {t.resetAll}
                    </button>
                  </div>
                </div>
              ) : (
                <div id="bos-listings-feed-grid" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {filteredListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      currentLang={currentLang}
                      selectedDateRange={
                        filterStartDate
                          ? { startDate: filterStartDate, endDate: filterEndDate || filterStartDate }
                          : undefined
                      }
                      onSelect={(l) => handleSelectListing(l)}
                      onBookNow={(l) => setBookingListing(l)}
                      onEnquire={(l) => setChatListing(l)}
                      onRateReview={(l) => setReviewListing(l)}
                      onOpenRunningBatches={(l) => setRunningBatchesListing(l)}
                      isCompared={comparedListingIds.includes(listing.id)}
                      onToggleCompare={handleToggleCompare}
                    />
                  ))}
                </div>
              )
            )}

            {/* RECENTLY VIEWED SECTION (PERSISTENT HORIZONTAL CAROUSEL) */}
            {isTemplateEnabled('recently_viewed') && recentlyViewedListings.length > 0 && (
              <div className="pt-6 pb-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center text-purple-700 dark:text-purple-300">
                      <History className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{ui.recentlyViewed}</span>
                        <span className="text-[11px] font-extrabold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                          {recentlyViewedListings.length}
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {ui.recentlyViewedSub}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleClearRecentlyViewed}
                    className="text-xs font-bold text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{ui.clear}</span>
                  </button>
                </div>

                {/* Horizontal Cards Scrollable Row */}
                <div className="flex items-stretch gap-3 overflow-x-auto pb-3 pt-1 no-scrollbar -mx-1 px-1">
                  {recentlyViewedListings.map((item) => {
                    const itemDist = item.distanceKm ?? item.location?.distanceKm ?? 2.5;
                    const itemTitle = getListingTitle(item, currentLang);
                    const rawProv = currentLang === 'te' ? (item.providerNameTe || item.providerName) : item.providerName;
                    const itemProvider = getProviderDisplayName(rawProv, currentLang, itemDist);
                    const rawUnit = currentLang === 'te' ? (item.priceUnitTe || item.priceUnit) : item.priceUnit;
                    const itemPriceUnit = getPriceUnitDisplayName(rawUnit, currentLang);
                    const itemSubcat = getSubcategoryDisplayName(item.subcategory, currentLang);

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectListing(item)}
                        className="group shrink-0 w-64 sm:w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-purple-400 dark:hover:border-purple-600 rounded-2xl p-3 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                      >
                        <div className="flex gap-3">
                          <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                            <SafeImage category="general"
                              src={item.images[0] || 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=300&q=80'}
                              alt={itemTitle}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <span className="absolute bottom-1 left-1 right-1 text-[9px] font-black bg-black/75 text-white px-1 py-0.2 rounded-xs truncate text-center">
                              📍 {itemDist} km
                            </span>
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                              {itemSubcat}
                            </span>
                            <h4 className="text-xs font-black text-slate-900 dark:text-white line-clamp-1 group-hover:text-purple-600 transition-colors">
                              {itemTitle}
                            </h4>
                            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">
                              {itemProvider}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span>{item.providerRating}</span>
                              <span className="text-slate-400">({item.reviewCount})</span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2.5 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                          <div className="font-black text-slate-900 dark:text-white text-xs">
                            {item.currency}{item.price.toLocaleString('en-IN')}
                            <span className="text-[10px] font-normal text-slate-400">{itemPriceUnit}</span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBookingListing(item);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#4A148C] text-white font-extrabold text-[10px] hover:bg-purple-900 transition-colors"
                          >
                            {t.bookNow}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}

            </motion.div>
          </AnimatePresence>

      </main>

      {/* SCHEDULED FOOTER ANNOUNCEMENTS */}
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 mt-4">
        {homeEnhancementsReady && <Suspense fallback={null}><LiveScheduledAnnouncementsBanner
          placement="footer_notice"
          userRole={userRole}
          currentLang={currentLang}
          activeSection={activeMarketSection}
        /></Suspense>}
      </div>

      {/* DESKTOP / SECONDARY LINKS FOOTER */}
      <footer className="mt-10 pb-24 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-5 text-xs text-slate-500 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#4338CA] text-[#FFE500] flex items-center justify-center font-black text-[10px]">
              <span>BOS</span>
            </div>
            <span className="font-extrabold text-slate-900 dark:text-white">
              {ui.brandName} — {ui.pgs}, {ui.classes}, {ui.functionHalls}, {ui.services}, {ui.stay} & {ui.movies}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold">
            <button onClick={() => setIsVoiceRegisterOpen(true)} className="hover:text-[#4338CA] cursor-pointer">
              🎙️ {t.voiceJoin}
            </button>
            <button onClick={() => setIsPostWizardOpen(true)} className="hover:text-[#4338CA] cursor-pointer">
              {ui.postFree}
            </button>
            <button onClick={() => setActiveView('provider_portal')} className="hover:text-[#4338CA] cursor-pointer">
              {ui.providerHub}
            </button>
            {userRole === 'admin' && (
              <button onClick={() => setActiveView('admin_console')} className="hover:text-[#4338CA] cursor-pointer">
                {ui.adminConsole} {pendingAdminListings.length > 0 ? `(${pendingAdminListings.length})` : ''}
              </button>
            )}
          </div>
        </div>
      </footer>
            </>
          )}
        </>
      )}

      {isFooterProfileOpen && createPortal((
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-50 pt-[env(safe-area-inset-top)] pb-[calc(56px+env(safe-area-inset-bottom))]" role="region" aria-label="Profile">
          <Suspense fallback={<div className="p-6 text-center text-sm text-slate-600">Loading profile…</div>}>
            <ProfileScreen
              user={authUser ? {
                id: authUser.id,
                name: authUser.name || supabaseUser?.user_metadata?.full_name || 'BookOurSpace user',
                email: authUser.email || supabaseUser?.email || '',
                avatarUrl: supabaseUser?.user_metadata?.avatar_url || supabaseUser?.user_metadata?.picture || authUser.avatarUrl,
                role: authUser.role,
                googleConnected: authUser.authProvider === 'google' || supabaseUser?.app_metadata?.provider === 'google',
                emailVerified: Boolean(supabaseUser?.email_confirmed_at),
                verified: false,
                bio: typeof supabaseUser?.user_metadata?.bio === 'string' ? supabaseUser.user_metadata.bio : '',
                phone: authUser.phone || '',
              } : null}
              currentLang={currentLang}
              reviews={reviews}
              onSignIn={() => {
                try { sessionStorage.setItem('bos_profile_after_auth', 'profile'); } catch {}
                setIsAuthModalOpen(true);
              }}
              onSelectLanguage={(language) => {
                setCurrentLang(language);
                try { localStorage.setItem('bos_language', language); } catch {}
              }}
              onBookings={() => { setIsFooterProfileOpen(false); setActiveBottomTab('bookings'); setIsMyBookingsOpen(true); }}
              onSaved={() => { setIsFooterProfileOpen(false); setActiveBottomTab('favorites'); setActiveQuickModal('favorites'); }}
              onBusiness={() => {
                setIsFooterProfileOpen(false);
                if (authUser && ['provider', 'admin'].includes(authUser.role)) setActiveView('provider_portal');
                else if (authUser?.role === 'customer') setIsProviderOnboardingOpen(true);
                else showToast('Sign in with Google to register a business profile.');
              }}
              onSignOut={async () => { await logoutGoogleSession(); }}
              onSaveProfile={async (values) => {
                const result = await updateUserProfile({ fullName: values.fullName, phone: values.phone, bio: values.bio });
                return result.ok && result.persisted === 'profile';
              }}
              onHelp={() => { setIsFooterProfileOpen(false); setActiveQuickModal('help_centre'); }}
              onContactSupport={() => { window.location.href = 'mailto:support@bookourspace.in?subject=BookOurSpace%20Support'; }}
              onAiSupport={() => { setIsFooterProfileOpen(false); setIsQuickBookOpen(true); }}
              onFeedback={() => { window.location.href = 'mailto:support@bookourspace.in?subject=BookOurSpace%20Feedback%20or%20Complaint'; }}
              onRequestAccountClosure={async () => {
                const { data } = await supabase?.auth.getSession() || { data: { session: null } };
                const accessToken = data.session?.access_token;
                if (!accessToken) return false;
                const response = await fetch('/api/account/close', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
                if (!response.ok) return false;
                try { await logoutGoogleSession(); } finally { setIsFooterProfileOpen(false); }
                return true;
              }}
              onClose={() => { setIsFooterProfileOpen(false); setActiveBottomTab('home'); }}
            />
          </Suspense>
        </div>
      ), document.body)}

      {/* STICKY BOTTOM NAVIGATION FOOTER */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 w-full max-w-full overflow-hidden bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200/90 dark:border-slate-800 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] box-border"
        style={{ height: 'calc(56px + env(safe-area-inset-bottom))' }}
      >
        <div className={`max-w-md sm:max-w-2xl mx-auto h-[56px] px-1.5 sm:px-6 grid ${isAdminSession ? 'grid-cols-6' : 'grid-cols-5'} items-center`}>
          {/* 1. Home */}
          <button
            type="button"
            onClick={() => {
              setActiveBottomTab('home');
              setActiveView('marketplace');
              closeSectionScreens();
              if (homeScreenStyle === 'bento_landing_hub') {
                setIsBentoLandingActive(true);
              }
              setIsMyBookingsOpen(false);
              setIsFooterProfileOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-1 cursor-pointer group min-w-0"
          >
            <Home
              className={`w-4.5 h-4.5 sm:w-5 sm:h-5 transition-transform duration-200 ${
                activeBottomTab === 'home'
                  ? 'text-[#3730A3] fill-[#3730A3] scale-105'
                  : 'text-slate-500 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            />
            <span
              className={`text-[10px] sm:text-xs tracking-tight leading-none truncate max-w-full ${
                activeBottomTab === 'home'
                  ? 'font-black text-[#3730A3] dark:text-indigo-400'
                  : 'font-bold text-slate-600 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            >
              {ui.home}
            </span>
            {activeBottomTab === 'home' && (
              <span className="mt-0.5 w-8 h-0.5 sm:h-1 rounded-full bg-[#3730A3] dark:bg-indigo-400" />
            )}
          </button>

          {/* 2. Search */}
          <button
            type="button"
            onClick={() => {
              setActiveBottomTab((prev) => (prev === 'search' ? 'home' : 'search'));
              setActiveView('marketplace');
              setIsMyBookingsOpen(false);
              setIsFooterProfileOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
              if (!isBentoHomeScreen) {
                const searchInput = document.querySelector<HTMLInputElement>('input[type="text"], input[type="search"]');
                if (searchInput) {
                  searchInput.focus();
                } else {
                  setIsVoiceSearchOpen(true);
                }
              }
            }}
            className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-1 cursor-pointer group min-w-0"
          >
            <Search
              className={`w-4.5 h-4.5 sm:w-5 sm:h-5 transition-transform duration-200 ${
                activeBottomTab === 'search'
                  ? 'text-[#3730A3] stroke-[2.5] scale-105'
                  : 'text-slate-500 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            />
            <span
              className={`text-[10px] sm:text-xs tracking-tight leading-none truncate max-w-full ${
                activeBottomTab === 'search'
                  ? 'font-black text-[#3730A3] dark:text-indigo-400'
                  : 'font-bold text-slate-600 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            >
              {ui.search}
            </span>
            {activeBottomTab === 'search' && (
              <span className="mt-0.5 w-8 h-0.5 sm:h-1 rounded-full bg-[#3730A3] dark:bg-indigo-400" />
            )}
          </button>

          {/* 3. My Bookings */}
          <button
            type="button"
            onClick={() => {
              if (!authUser) {
                try { sessionStorage.setItem('bos_profile_after_auth', 'bookings'); } catch {}
                setIsAuthModalOpen(true);
                return;
              }
              setActiveBottomTab('bookings');
              setIsFooterProfileOpen(false);
              setIsMyBookingsOpen(true);
            }}
            className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-1 cursor-pointer group min-w-0"
          >
            <div className="relative">
              <Calendar
                className={`w-4.5 h-4.5 sm:w-5 sm:h-5 transition-transform duration-200 ${
                  activeBottomTab === 'bookings'
                    ? 'text-[#3730A3] stroke-[2.5] scale-105'
                    : 'text-slate-500 dark:text-slate-400 group-hover:text-[#3730A3]'
                }`}
              />
              {bookings.length > 0 && (
                <span className="absolute -top-1.5 -right-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-rose-500 text-white text-[8px] sm:text-[9px] font-black flex items-center justify-center shadow-2xs">
                  {bookings.length}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] sm:text-xs tracking-tight leading-none truncate max-w-full ${
                activeBottomTab === 'bookings'
                  ? 'font-black text-[#3730A3] dark:text-indigo-400'
                  : 'font-bold text-slate-600 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            >
              {ui.myBookings}
            </span>
            {activeBottomTab === 'bookings' && (
              <span className="mt-0.5 w-8 h-0.5 sm:h-1 rounded-full bg-[#3730A3] dark:bg-indigo-400" />
            )}
          </button>

          {/* 4. My Favorites */}
          <button
            type="button"
            onClick={() => {
              if (!authUser) {
                try { sessionStorage.setItem('bos_profile_after_auth', 'favorites'); } catch {}
                setIsAuthModalOpen(true);
                return;
              }
              setActiveBottomTab('favorites');
              setIsMyBookingsOpen(false);
              setIsFooterProfileOpen(false);
              setActiveQuickModal('favorites');
            }}
            className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-1 cursor-pointer group min-w-0"
          >
            <div className="relative">
              <Heart
                className={`w-4.5 h-4.5 sm:w-5 sm:h-5 transition-transform duration-200 ${
                  activeBottomTab === 'favorites'
                    ? 'text-rose-500 fill-rose-500 scale-105'
                    : 'text-slate-500 dark:text-slate-400 group-hover:text-rose-500'
                }`}
              />
              {favoriteIds.length > 0 && (
                <span className="absolute -top-1.5 -right-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-rose-500 text-white text-[8px] sm:text-[9px] font-black flex items-center justify-center shadow-2xs">
                  {favoriteIds.length}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] sm:text-xs tracking-tight leading-none truncate max-w-full ${
                activeBottomTab === 'favorites'
                  ? 'font-black text-[#3730A3] dark:text-indigo-400'
                  : 'font-bold text-slate-600 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            >
              {currentLang === 'te' ? 'నా ఫేవరెట్స్' : 'My Favorites'}
            </span>
            {activeBottomTab === 'favorites' && (
              <span className="mt-0.5 w-8 h-0.5 sm:h-1 rounded-full bg-[#3730A3] dark:bg-indigo-400" />
            )}
          </button>

          {/* 5. Profile */}
          <button
            type="button"
            onClick={() => {
              setActiveBottomTab('profile');
              setIsMyBookingsOpen(false);
              setIsFooterProfileOpen(true);
            }}
            className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-1 cursor-pointer group min-w-0"
          >
            <User
              className={`w-4.5 h-4.5 sm:w-5 sm:h-5 transition-transform duration-200 ${
                activeBottomTab === 'profile'
                  ? 'text-[#3730A3] stroke-[2.5] scale-105'
                  : 'text-slate-500 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            />
            <span
              className={`text-[10px] sm:text-xs tracking-tight leading-none truncate max-w-full ${
                activeBottomTab === 'profile'
                  ? 'font-black text-[#3730A3] dark:text-indigo-400'
                  : 'font-bold text-slate-600 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            >
              {ui.profile}
            </span>
            {activeBottomTab === 'profile' && (
              <span className="mt-0.5 w-8 h-0.5 sm:h-1 rounded-full bg-[#3730A3] dark:bg-indigo-400" />
            )}
          </button>
          {isAdminSession && <button
            type="button"
            data-testid="admin-console-tab"
            aria-current={activeView === 'admin_console' ? 'page' : undefined}
            onClick={async () => {
              if (!isAdminSession) {
                // Local development: one tap to the seeded admin profile.
                if (import.meta.env.DEV || import.meta.env.VITE_BOS_LOCAL_DEV_AUTH === '1') {
                  try {
                    const response = await fetch('/api/auth/local-dev/session', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ role: 'admin' }),
                    });
                    const data = await response.json().catch(() => ({}));
                    if (response.ok && data?.sessionToken) {
                      window.localStorage.setItem('bos_session_token_v1', String(data.sessionToken));
                      window.location.hash = '#admin';
                      window.location.reload();
                      return;
                    }
                  } catch { /* fall through to the sign-in modal */ }
                }
                setIsAuthModalOpen(true);
                return;
              }
              setActiveBottomTab('admin');
              setIsMyBookingsOpen(false);
              setIsFooterProfileOpen(false);
              try { window.sessionStorage.removeItem('bos_stay_checkout_v1'); } catch { /* ignore */ }
              window.dispatchEvent(new Event('bos-admin-console-open'));
              setActiveView('admin_console');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="relative flex flex-col items-center justify-center gap-0.5 py-1 px-1 cursor-pointer group min-w-0"
          >
            <ShieldCheck
              className={`w-4.5 h-4.5 sm:w-5 sm:h-5 transition-transform duration-200 ${
                activeBottomTab === 'admin' || activeView === 'admin_console'
                  ? 'text-[#3730A3] scale-105'
                  : 'text-slate-500 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            />
            <span
              className={`text-[10px] sm:text-xs tracking-tight leading-none truncate max-w-full ${
                activeBottomTab === 'admin' || activeView === 'admin_console'
                  ? 'font-black text-[#3730A3] dark:text-indigo-400'
                  : 'font-bold text-slate-600 dark:text-slate-400 group-hover:text-[#3730A3]'
              }`}
            >
              Admin
            </span>
            {(activeBottomTab === 'admin' || activeView === 'admin_console') && (
              <span className="mt-0.5 w-8 h-0.5 sm:h-1 rounded-full bg-[#3730A3] dark:bg-indigo-400" />
            )}
          </button>}
        </div>
      </nav>

      {/* MY BOOKINGS MODAL (OPENS WHEN USER TAPS "నా బుకింగ్స్" IN BOTTOM FOOTER) */}
      {isMyBookingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#4338CA] text-white flex items-center justify-center font-black">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {currentLang === 'te' ? 'నా బుకింగ్స్ (My Bookings)' : 'My Bookings & Visits'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {currentLang === 'te'
                      ? `మొత్తం ${bookings.length} బుకింగ్‌లు అందుబాటులో ఉన్నాయి`
                      : `Showing ${bookings.length} scheduled bookings`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMyBookingsOpen(false);
                  setActiveBottomTab('home');
                }}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Swipe Gesture Instruction Banner & Undo Toast */}
            {bookings.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 text-[11px] font-bold text-indigo-900 dark:text-indigo-200">
                <span>
                  {currentLang === 'te'
                    ? '👈 బుకింగ్ రద్దు చేయడానికి లేదా తొలగించడానికి ఎడమవైపు స్వైప్ చేయండి'
                    : '👈 Swipe left on any appointment to Cancel or Delete'}
                </span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-[#4338CA] dark:text-indigo-300 shrink-0">
                  Swipe-to-Delete
                </span>
              </div>
            )}

            {lastRemovedBooking && (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold shadow-md animate-in fade-in slide-in-from-top-2 duration-150">
                <span className="truncate">
                  🗑️ Removed &ldquo;{lastRemovedBooking.listingTitle}&rdquo;
                </span>
                <button
                  type="button"
                  onClick={() => {
                    restoreBooking(lastRemovedBooking);
                    setLastRemovedBooking(null);
                    showToast(
                      currentLang === 'te'
                        ? 'బుకింగ్ పునరుద్ధరించబడింది'
                        : 'Appointment restored'
                    );
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-black shrink-0 cursor-pointer"
                >
                  {currentLang === 'te' ? 'అన్డు (Undo)' : 'Undo'}
                </button>
              </div>
            )}

            <Suspense fallback={<p className="text-xs text-slate-500">Loading PG reservations…</p>}>
              <PgMyBookingsPanel open={isMyBookingsOpen} />
            </Suspense>

            <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
              {bookings.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  {currentLang === 'te'
                    ? 'ఇంకా బుకింగ్‌లు లేవు. ఏదైనా పీజీ, క్లాస్ లేదా ఫంక్షన్ హాల్‌ను బుక్ చేయండి!'
                    : 'No bookings yet. Book any PG, Class, Function Hall, Service, Hotel, or Movie!'}
                </div>
              ) : (
                bookings.map((bk) => {
                  const matchedListing = listings.find((l) => l.id === bk.listingId);
                  const bookingCode = generateBosBarcodeId(
                    'TKT',
                    `${bk.listingId}-${bk.id}`,
                    matchedListing?.categoryId || activeMarketSection
                  );
                  const categoryOrSection = matchedListing?.categoryId || activeMarketSection;
                  return (
                    <SwipeableBookingCard
                      key={bk.id}
                      booking={bk}
                      matchedListing={matchedListing}
                      bookingCode={bookingCode}
                      barcodeLabel={getBarcodePassTitle(categoryOrSection)}
                      moduleTag={categoryOrSection}
                      currentLang={currentLang}
                      onOpenDetails={(listing) => {
                        setIsMyBookingsOpen(false);
                        setActiveBottomTab('home');
                        setSelectedDetailListing(listing);
                      }}
                      onCancelBooking={(targetBk) => {
                        cancelBooking(targetBk.id);
                        showToast(
                          currentLang === 'te'
                            ? `⚠️ "${targetBk.listingTitle}" బుకింగ్ రద్దు చేయబడింది`
                            : `⚠️ Cancelled appointment for "${targetBk.listingTitle}"`
                        );
                      }}
                      onDeleteBooking={(targetBk) => {
                        setLastRemovedBooking(targetBk);
                        deleteBooking(targetBk.id);
                        showToast(
                          currentLang === 'te'
                            ? `🗑️ "${targetBk.listingTitle}" బుకింగ్ తొలగించబడింది`
                            : `🗑️ Removed "${targetBk.listingTitle}" from My Bookings`
                        );
                      }}
                      onDownloadReceipt={(targetBk) => {
                        void import('./utils/gstInvoiceGenerator').then(({ generateBookingGSTReceiptPDF }) =>
                          generateBookingGSTReceiptPDF(targetBk, undefined, 'download'));
                      }}
                      onPrintReceipt={(targetBk) => {
                        void import('./utils/gstInvoiceGenerator').then(({ generateBookingGSTReceiptPDF }) =>
                          generateBookingGSTReceiptPDF(targetBk, undefined, 'print'));
                      }}
                    />
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsMyBookingsOpen(false);
                  setActiveBottomTab('home');
                }}
                className="px-5 py-2 rounded-xl bg-[#4338CA] text-white text-xs font-black cursor-pointer"
              >
                {currentLang === 'te' ? 'మూసివేయండి' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EASY VOICE REGISTRATION & POST MODAL */}
      {showVoiceRegistrationModule && <VoiceRegistrationModal
        isOpen={isVoiceRegisterOpen}
        onClose={() => setIsVoiceRegisterOpen(false)}
        currentLang={currentLang}
        onRegisterSuccess={handleVoiceRegisterSuccess}
      />}

      {/* POST LISTING WIZARD (CUSTOMER -> PROVIDER REGISTRATION & ADMIN REVIEW REQUEST) */}
      {showPostListingModule && <PostListingWizard
        isOpen={isPostWizardOpen}
        onClose={() => setIsPostWizardOpen(false)}
        currentLang={currentLang}
        defaultSection={activeMarketSection}
        defaultCategory={selectedCategory}
        defaultSubcategory={selectedSubcategory}
        onPostSuccess={(newListing) => {
          setUserRole('provider');
          setActiveView('provider_portal');
          playAlertChime('confirm');
          showToast(
            currentLang === 'te'
              ? `⏳ "${newListing.title}" ప్రొవైడర్ అభ్యర్థన అడ్మిన్ సమీక్షకు పంపబడింది! అడ్మిన్ ఆమోదించిన వెంటనే యాప్‌లో కనిపిస్తుంది.`
              : currentLang === 'hi'
              ? `⏳ प्रोवाइडर अनुरोध "${newListing.title}" एडमिन को भेजा गया! एडमिन की मंजूरी के तुरंत बाद यह ऐप में दिखाई देगा।`
              : `⏳ Provider request "${newListing.title}" submitted to Admin! Once Admin reviews & approves, it will display in the application.`
          );
        }}
        onOpenAdminReview={() => {
          if (!isAdminSession) {
            showToast('🛡️ Admin console requires a signed-in administrator account.');
            return;
          }
          setIsPostWizardOpen(false);
          setUserRole('admin');
          setActiveView('admin_console');
          playAlertChime('confirm');
          showToast(
            currentLang === 'te'
              ? '🛡️ అడ్మిన్ కన్సోల్‌కు మారారు — ప్రొవైడర్ దరఖాస్తును దిగువన ఆమోదించండి!'
              : currentLang === 'hi'
              ? '🛡️ एडमिन कंसोल में स्विच किया गया — नीचे प्रोवाइडर अनुरोध को स्वीकृत करें!'
              : '🛡️ Switched to Admin Console — Review & Approve the Provider Request below!'
          );
        }}
      />}

      {/* LISTING DETAIL MODAL */}
      {showVenueDetailModule && selectedDetailListing?.categoryId.startsWith('venue-') ? (
        <VenueDetailModal
          listing={selectedDetailListing}
          onClose={() => setSelectedDetailListing(null)}
          onChat={() => {
            const current = selectedDetailListing;
            setSelectedDetailListing(null);
            setChatListing(current);
          }}
          onRequestAvailability={() => {
            const current = selectedDetailListing;
            setSelectedDetailListing(null);
            setBookingListing(current);
          }}
        />
      ) : showListingDetailModule && selectedDetailListing ? (
        <ListingDetailModal
          listing={selectedDetailListing}
          currentLang={currentLang}
          onClose={() => setSelectedDetailListing(null)}
          onBookNow={(l) => {
            setSelectedDetailListing(null);
            setBookingListing(l);
          }}
          onEnquire={(l) => {
            setSelectedDetailListing(null);
            setChatListing(l);
          }}
        />
      ) : null}

      {/* CURRENT RUNNING BATCHES MODAL (CONFIGURABLE SCHEDULE LINK & ALL-FORMAT IMAGES) */}
      {showRunningBatchesModule && <RunningBatchesModal
        listing={runningBatchesListing}
        onClose={() => setRunningBatchesListing(null)}
        onUpdateBatchUrl={(listingId, newUrl, batchImages) => {
          const target = listings.find((l) => l.id === listingId);
          const nextImages = batchImages ?? target?.batchScheduleImages ?? [];
          updateListing(listingId, {
            runningBatchUrl: newUrl,
            batchScheduleImages: nextImages,
            customFieldValues: {
              ...(target?.customFieldValues || {}),
              runningBatchUrl: newUrl,
            },
          });
          setRunningBatchesListing((prev) =>
            prev && prev.id === listingId
              ? {
                  ...prev,
                  runningBatchUrl: newUrl,
                  batchScheduleImages: nextImages,
                  customFieldValues: {
                    ...prev.customFieldValues,
                    runningBatchUrl: newUrl,
                  },
                }
              : prev
          );
          showToast('✓ Running Batch Schedule Link & Images updated!');
        }}
        onBookBatch={(l) => {
          setBookingListing(l);
        }}
      />}

      {/* UNIVERSAL BOOKING & APPLICATION MODAL */}
      {showBookingEnquiryModule && <BookingEnquiryModal
        listing={bookingListing && !bookingListing.categoryId.startsWith('venue-') ? bookingListing : null}
        currentLang={currentLang}
        initialDateRange={
          filterStartDate
            ? { startDate: filterStartDate, endDate: filterEndDate || filterStartDate }
            : undefined
        }
        onClose={() => setBookingListing(null)}
        onOpenReview={(l) => setReviewListing(l)}
      />}
      {showVenueBookingModule && <VenueBookingModal
        listing={bookingListing?.categoryId.startsWith('venue-') ? bookingListing : null}
        onClose={() => setBookingListing(null)}
      />}

      {/* DYNAMIC REVIEW & RATING SUBMISSION MODAL */}
      {showReviewModule && <ReviewSubmissionModal
        listing={reviewListing}
        isOpen={!!reviewListing}
        currentLang={currentLang}
        onClose={() => setReviewListing(null)}
        onReviewSubmitted={(newRating, newCount) => {
          showToast(
            currentLang === 'te'
              ? `⭐ ధన్యవాదాలు! సగటు రేటింగ్ ${newRating}★ (${newCount} రివ్యూలు) కి అప్‌డేట్ అయింది!`
              : `⭐ Thank you! Average rating updated to ${newRating}★ (${newCount} reviews)!`
          );
        }}
      />}

      {/* CHAT MODAL */}
      {showChatModule && <ChatModal
        listing={chatListing}
        currentLang={currentLang}
        onClose={() => setChatListing(null)}
        onBookNow={(l) => {
          setChatListing(null);
          setBookingListing(l);
        }}
      />}

      {/* PAYMENT & SUBSCRIPTION CHECKOUT MODAL */}
      {showPaymentModule && <PaymentModal
        isOpen={paymentModalState.isOpen}
        planName={paymentModalState.planName}
        amount={paymentModalState.amount}
        listingTitle={paymentModalState.listingTitle}
        defaultOneRupeeTest={paymentModalState.defaultOneRupeeTest}
        onClose={() => setPaymentModalState(prev => ({ ...prev, isOpen: false }))}
        onSuccess={() => {
          showToast(`🎉 Payment & GST Invoice for "${paymentModalState.planName}" verified!`);
        }}
      />}

      {/* VOICE SEARCH MODAL (TELUGU / MULTILINGUAL) */}
      {showVoiceSearchModule && <VoiceSearchModal
        isOpen={isVoiceSearchOpen}
        onClose={() => setIsVoiceSearchOpen(false)}
        onSearch={handleVoiceSearchResult}
        currentLang={currentLang}
      />}

      {/* CLASS & PG COMPARE FLOATING DOCK */}
      {comparedListingIds.length > 0 && <CompareFloatingBar
        comparedListings={comparedListings}
        onOpenCompareModal={() => setIsCompareModalOpen(true)}
        onRemoveListing={handleRemoveComparedListing}
        onClearAll={handleClearAllCompared}
        currentLang={currentLang}
      />}

      {/* SIDE-BY-SIDE CLASS & PG COMPARISON MODAL (UP TO 3 ITEMS) */}
      {showCompareModule && <ClassCompareModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        comparedListings={comparedListings}
        onRemoveListing={handleRemoveComparedListing}
        onClearAll={handleClearAllCompared}
        onSelectListing={handleSelectListing}
        onBookTrial={(l: MarketplaceListing) => {
          setIsCompareModalOpen(false);
          setBookingListing(l);
        }}
        onEnquire={(l: MarketplaceListing) => {
          setIsCompareModalOpen(false);
          setChatListing(l);
        }}
        currentLang={currentLang}
      />}

      {/* QUICK ACTION MODALS (MY FAVORITES, WALLET & LEDGER, SUPPORT, REFER & EARN, HELP CENTRE) */}
      <Suspense fallback={null}>
        {activeQuickModal && (
          <QuickActionModals
            activeModal={activeQuickModal}
            onClose={() => setActiveQuickModal(null)}
            currentLang={currentLang}
            onSelectListing={(l) => setSelectedDetailListing(l)}
            onBookListing={(l) => setBookingListing(l)}
          />
        )}
      </Suspense>

      {/* PLUG-AND-PLAY UNIVERSAL OBJECT EDITOR MODAL */}
      <Suspense fallback={null}>
        {isUniversalEditorOpen && (
          <UniversalObjectEditorModal
            isOpen
            onClose={() => setIsUniversalEditorOpen(false)}
            activeSection={activeMarketSection}
            currentLang={currentLang}
          />
        )}
      </Suspense>

      {/* UNIVERSAL LIVE BUILDER (PAGES, FEATURES, MODULES, REPORTS) */}
      <Suspense fallback={null}>
        {userRole === 'admin' && (
          <UniversalLiveBuilder
            isOpen={isUniversalBuilderOpen}
            onClose={() => setIsUniversalBuilderOpen(false)}
            userRole={userRole}
            onNotify={(message) => showToast(message)}
          />
        )}
      </Suspense>

      {userRole === 'admin' && !isUniversalBuilderOpen && (
        <button
          onClick={() => setIsUniversalBuilderOpen(true)}
          className="fixed bottom-4 left-4 z-[9989] flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-lg hover:bg-slate-800"
          title="Universal Live Builder"
        >
          <Layers className="h-4 w-4" /> Build
        </button>
      )}

      {/* ADMIN INLINE EDIT: one tap puts the live page into element-pick mode. */}
      {isAdminSession && activeView !== 'admin_console' && !isLivePageEditorOpen && (
        <button
          type="button"
          data-testid="admin-inline-edit"
          onClick={() => {
            setAdminInlineEdit(true);
            setIsLivePageEditorOpen(true);
          }}
          className="fixed right-4 top-24 z-[60] inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-slate-950/95 px-4 text-[11px] font-black text-white shadow-xl ring-1 ring-amber-400/70 backdrop-blur transition hover:bg-slate-800"
          title="Show edit controls on every element of this page"
        >
          <Pencil className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          Edit page
        </button>
      )}

      {/* SECURE LIVE ADMIN PAGE EDITOR (OTA SYNC FOR WEB, ANDROID & IOS) */}
      <Suspense fallback={null}>
        {isLivePageEditorOpen && (
          <LiveAdminPageEditor
            userRole={userRole}
            activePageId={activeMarketSection}
            onSelectPageId={(pageId) => {
              setActiveMarketSection(pageId);
              setSelectedCategory('all');
              setSelectedSubcategory('all');
              setActiveView('marketplace');
            }}
            isOpenExternal
            initialInspectMode={adminInlineEdit}
            onCloseExternal={() => {
              setIsLivePageEditorOpen(false);
              setAdminInlineEdit(false);
            }}
            onConfigUpdated={(nextCfg) => setLivePageConfig(nextCfg)}
            onNotify={(msg) => showToast(msg)}
          />
        )}
      </Suspense>

      {/* AI-POWERED QUICK BOOK CHAT ASSISTANT (DISABLED BY DEFAULT) */}
      {isQuickBookOpen && (
        <QuickBookChatAssistant
          isOpen={isQuickBookOpen}
          onOpen={() => setIsQuickBookOpen(true)}
          onClose={() => setIsQuickBookOpen(false)}
          activeFilters={{
            activeMarketSection,
            selectedCity,
            selectedArea,
            selectedCategory,
            selectedSubcategory,
            selectedPriceRange,
            selectedRating,
            verifiedOnly,
            featuredOnly,
            hourlyBookingOnly,
            filterStartDate,
            filterEndDate,
            searchQuery,
            selectedPGGender,
            selectedPGSharing,
            selectedPGAC,
            selectedPGFood,
            selectedDeliveryMode,
            selectedTimingSlot,
          }}
          filteredListings={filteredListings}
          allActiveListings={activePublicListings}
          currentLang={currentLang}
          onInitiateBooking={(selectedListing, prefs, rec) => {
            setIsQuickBookOpen(false);
            if (prefs?.preferredDate && !filterStartDate) {
              setFilterStartDate(prefs.preferredDate);
            }
            if (prefs?.checkOutDate && !filterEndDate) {
              setFilterEndDate(prefs.checkOutDate);
            }
            setBookingListing(selectedListing);
            playAlertChime('confirm');
            showToast(
              currentLang === 'te'
                ? `⚡ AI క్విక్ బుక్: "${selectedListing.title}" (${rec?.matchScore || 96}% మ్యాచ్) బుకింగ్ ఫ్లో ప్రారంభించబడింది!`
                : `⚡ AI Quick Book: Initiated booking flow for "${selectedListing.title}" (${rec?.matchScore || 96}% match)!`
            );
          }}
          onViewListingDetails={(l) => {
            setIsQuickBookOpen(false);
            setSelectedDetailListing(l);
          }}
        />
      )}

      {/* PREMIUM LOCATION SELECTOR (state → district → city) */}
      <LocationSelector
        open={isLocationSelectorOpen}
        onClose={() => setIsLocationSelectorOpen(false)}
        selected={{ city: selectedCity, area: selectedArea, label: selectedLocationLabel || undefined }}
        onSelect={handleSelectLocation}
      />

      {/* SIMPLE FULL-PAGE SIGN-IN */}
      {isLoginPageOpen && (
        <Suspense fallback={null}>
        <SimpleLoginPage
          onClose={() => {
            setIsLoginPageOpen(false);
            if (window.location.hash.toLowerCase() === '#login') {
              window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#stays`);
            }
          }}
          onGoogle={() => {
            setIsLoginPageOpen(false);
            setIsAuthModalOpen(true);
          }}
          config={authAccessConfig}
          onContinueAsGuest={() => {
            try { localStorage.setItem('bos_entry_choice_v1', 'guest'); } catch { /* ignore storage failures */ }
            setEntryExperience('ready');
            setIsLoginPageOpen(false);
            showToast('Browsing as guest. Sign in when you are ready to book or save.');
          }}
          onSignedIn={({ isNewUser, redirectTarget }) => {
            try { localStorage.setItem('bos_entry_choice_v1', 'signed-in'); } catch { /* ignore storage failures */ }
            setEntryExperience('ready');
            setIsLoginPageOpen(false);
            if (window.location.hash.toLowerCase() === '#login') {
              window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#stays`);
            }
            if (redirectTarget) setActiveView(redirectTarget);
            showToast(
              isNewUser
                ? 'Account created and signed in. Welcome to BookOurSpace!'
                : 'Signed in successfully. Welcome back!'
            );
          }}
        />
        </Suspense>
      )}

      {/* SUPABASE AUTHENTICATION MODAL */}
      {shouldLoadAuthModal && <Suspense fallback={null}><SupabaseAuthModal
        isOpen={isAuthModalOpen}
        forceDark={entryExperience !== 'ready'}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={supabaseUser}
        returnSection={activeMarketSection}
        onAuthSuccess={(msg) => showToast(msg)}
        onNavigateView={(target) => setActiveView(target)}
        onOpenEmailSignIn={() => {
          setIsAuthModalOpen(false);
          setIsLoginPageOpen(true);
          void fetchAuthAccessConfig({ force: true }).then(setAuthAccessConfig).catch(() => {});
        }}
      /></Suspense>}

      {isProviderOnboardingOpen && <Suspense fallback={null}><ProviderOnboardingForm
        authUser={authUser ? { name: authUser.name, email: authUser.email, role: authUser.role } : null}
        defaultSection={activeMarketSection}
        onClose={() => setIsProviderOnboardingOpen(false)}
      /></Suspense>}

      {/* LIVE NOTIFICATIONS & ALERTS MODAL */}
      {showNotificationsDropdown && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-[#4338CA] text-white flex items-center justify-center">
                  <Bell className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {currentLang === 'te' ? 'లైవ్ అలర్ట్స్ & నోటిఫికేషన్లు' : 'Live Notifications & Alerts'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {unreadNotificationsCount} unread • {notifications.length} total
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllNotifications}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotificationsDropdown(false)}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No new notifications right now.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className={`p-3 rounded-2xl border transition cursor-pointer ${
                      n.read
                        ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800'
                        : 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        {n.title}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                        {n.time}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      {n.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isServicesDiscoveryOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-[70] grid place-items-center bg-white text-sm font-semibold text-slate-600" role="status">Loading services…</div>}>
          <ServicesDiscoverySection
            onClose={() => setIsServicesDiscoveryOpen(false)}
            onNavigate={navigateFromServicesDiscovery}
            onOpenFarmVillage={(categoryId) => {
              setIsServicesDiscoveryOpen(false);
              setFormerLocalInitialCategory(categoryId);
              setIsFormerLocalServicesOpen(true);
            }}
          />
        </Suspense>
      )}
      {isFormerLocalServicesOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-[72] grid place-items-center bg-white text-sm font-semibold text-slate-600" role="status">Loading Farm & Village services…</div>}>
          <FormerLocalServicesSection initialCategoryId={formerLocalInitialCategory} onClose={() => {
            setIsFormerLocalServicesOpen(false);
            setFormerLocalInitialCategory(undefined);
            setIsServicesDiscoveryOpen(true);
          }} />
        </Suspense>
      )}

      {siteChromeReady && (
        <Suspense fallback={null}>
          <SiteChrome onOpenHelp={() => setActiveQuickModal('help_centre')} />
        </Suspense>
      )}

    </div>
    </Suspense>
  );
}

function SectionScreenFallback({ label }: { label: string }) {
  return (
    <div className="grid min-h-[50vh] w-full place-items-center bg-white text-sm font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400" role="status">
      {label}
    </div>
  );
}

export default function App() {
  return (
    <MarketplaceProvider>
      <MotionConfig reducedMotion="user">
        <BusinessInvitationAccept />
        <MarketplaceAppContent />
      </MotionConfig>
    </MarketplaceProvider>
  );
}
