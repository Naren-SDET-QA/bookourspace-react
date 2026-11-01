import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Plus, 
  X, 
  Check, 
  Globe, 
  Mic,
  Users,
  Briefcase,
  ShieldCheck,
  Building2,
  GraduationCap,
  Sparkles,
  Clock,
  Video,
  MapPin,
  Laptop,
  Home,
  Utensils,
  Wind,
  Store,
  ArrowLeftRight,
  Sun,
  Moon,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ListChecks,
  Wrench,
  Hotel,
  Film,
  Menu,
  PlusCircle,
  Crown,
  LogIn,
  LogOut,
  UserCheck,
  Phone,
  Eye,
  EyeOff,
  Bell,
  LocateFixed
} from 'lucide-react';
import { venue12Categories, VenueCategoryInfo } from '../data/venueData';
import { classCategories, classDeliveryModes, classTimingSlots, ClassCategoryInfo } from '../data/classesData';
import { pg29Categories, PGCategoryInfo } from '../data/pgHostelData';
import {
  MarketSectionType,
  servicesCategories,
  hotelStayCategories,
  moviesCategories,
} from '../data/servicesStayMoviesData';
import { AppLanguage, translations, allIndianLanguages } from '../utils/translations';
import { getUILabels, transliterateLatinToScript } from '../utils/i18nEngine';
import { BOSBrandLogo } from './BOSBrandLogo';
import {
  loadSpotlightSubcategoriesModuleMap,
  toggleSpotlightSubcategoriesForSection,
  ALL_SIX_MARKET_MODULES,
  HomeScreenLayoutStyle,
} from './ModularSystemEngine';
import { useMarketplace } from '../context/MarketplaceContext';
import { UserWalletAndLedgerSection } from './UserWalletAndQuickModals';

interface CraftoTopServicesBarProps {
  activeMarketSection: MarketSectionType;
  onSelectMarketSection: (sec: MarketSectionType) => void;
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
  selectedSubcategory: string;
  onSelectSubcategory: (subcat: string) => void;
  
  // Classes filters
  selectedDeliveryMode?: string;
  onSelectDeliveryMode?: (mode: string) => void;
  selectedTimingSlot?: string;
  onSelectTimingSlot?: (timing: string) => void;
  freeTrialOnly?: boolean;
  onToggleFreeTrialOnly?: (val: boolean) => void;

  // PG filters
  selectedPGGender?: string;
  onSelectPGGender?: (gender: string) => void;
  selectedPGSharing?: string;
  onSelectPGSharing?: (sharing: string) => void;
  selectedPGAC?: string;
  onSelectPGAC?: (ac: string) => void;
  selectedPGFood?: string;
  onSelectPGFood?: (food: string) => void;

  currentLang: AppLanguage;
  onChangeLang: (lang: AppLanguage) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenCreate: () => void;
  onOpenVoiceSearch: () => void;
  userRole?: 'customer' | 'provider' | 'admin';
  onSelectRole?: (role: 'customer' | 'provider' | 'admin') => void;
  activeView?: 'marketplace' | 'provider_portal' | 'admin_console';
  comparedCount?: number;
  onOpenCompareModal?: () => void;
  externalLoginModalOpen?: boolean;
  onExternalLoginModalClose?: () => void;
  selectedArea?: string;
  onSelectArea?: (area: string) => void;
  popularAreas?: string[];
  unreadNotificationsCount?: number;
  onOpenNotifications?: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  verifiedOnly?: boolean;
  onToggleVerifiedOnly?: () => void;
  onBackToHomeHub?: () => void;
  onOpenServicesDiscovery?: () => void;
  homeScreenStyle?: HomeScreenLayoutStyle;
  onChangeHomeScreenStyle?: (style: HomeScreenLayoutStyle) => void;
}

export const CraftoTopServicesBar: React.FC<CraftoTopServicesBarProps> = ({
  activeMarketSection = 'pg_hostels',
  onSelectMarketSection,
  selectedCategory,
  onSelectCategory,
  selectedSubcategory,
  onSelectSubcategory,
  selectedDeliveryMode = 'all',
  onSelectDeliveryMode,
  selectedTimingSlot = 'all',
  onSelectTimingSlot,
  freeTrialOnly = false,
  onToggleFreeTrialOnly,
  selectedPGGender = 'all',
  onSelectPGGender,
  selectedPGSharing = 'all',
  onSelectPGSharing,
  selectedPGAC = 'all',
  onSelectPGAC,
  selectedPGFood = 'all',
  onSelectPGFood,
  currentLang,
  onChangeLang,
  searchQuery,
  onSearchChange,
  onOpenCreate,
  onOpenVoiceSearch,
  userRole = 'customer',
  onSelectRole,
  activeView = 'marketplace',
  comparedCount = 0,
  onOpenCompareModal,
  externalLoginModalOpen = false,
  onExternalLoginModalClose,
  selectedArea = 'all',
  onSelectArea,
  popularAreas = [
    'All Areas in City',
    'Madhapur',
    'Hitech City',
    'Gachibowli',
    'Kukatpally',
    'Kondapur',
    'Ameerpet',
    'Jubilee Hills',
    'Banjara Hills',
    'Secunderabad',
    'Dilsukhnagar',
  ],
  unreadNotificationsCount = 0,
  onOpenNotifications,
  darkMode = false,
  onToggleDarkMode,
  verifiedOnly = false,
  onToggleVerifiedOnly,
  onBackToHomeHub,
  onOpenServicesDiscovery,
  homeScreenStyle = 'bento_landing_hub',
  onChangeHomeScreenStyle,
}) => {
  const {
    authUser,
    isAccountBlocked,
    blockedReason,
    loginWithGoogle,
    logoutGoogleSession,
  } = useMarketplace();

  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const isLoginModalVisible = showLoginModal || externalLoginModalOpen;
  const closeLoginModal = () => {
    setShowLoginModal(false);
    onExternalLoginModalClose?.();
  };
  const [loggedInUser, setLoggedInUser] = useState<{
    name: string;
    phone: string;
    avatar: string;
    isLoggedIn: boolean;
  }>({
    name: authUser?.name || 'NARENDRA',
    phone: authUser?.phone || '98480 12345',
    avatar:
      authUser?.avatarUrl ||
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    isLoggedIn: Boolean(authUser),
  });
  const [loginEmailInput, setLoginEmailInput] = useState(authUser?.email || 'monapatisravya28@gmail.com');
  const [loginNameInput, setLoginNameInput] = useState(authUser?.name || 'NARENDRA');
  const [loginPhoneInput, setLoginPhoneInput] = useState(authUser?.phone || '98480 12345');
  const [loginSelectedRole, setLoginSelectedRole] = useState<'customer' | 'provider' | 'admin'>(
    authUser?.role || userRole || 'customer'
  );
  const [oauthAuthError, setOauthAuthError] = useState<string | null>(null);
  const [oauthAuthSuccess, setOauthAuthSuccess] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  React.useEffect(() => {
    if (authUser) {
      setLoggedInUser({
        name: authUser.name,
        phone: authUser.phone || '98480 12345',
        avatar:
          authUser.avatarUrl ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        isLoggedIn: true,
      });
      setLoginEmailInput(authUser.email);
      setLoginNameInput(authUser.name);
      setLoginPhoneInput(authUser.phone || '98480 12345');
      setLoginSelectedRole(authUser.role);
    }
  }, [authUser]);

  const [showMoreChecklist, setShowMoreChecklist] = useState(false);
  const [categoryZoom, setCategoryZoom] = useState<number>(1);
  const [subcategoryZoom, setSubcategoryZoom] = useState<number>(1);
  const [showSubcategorySpotlightGrid, setShowSubcategorySpotlightGrid] = useState(false);

  // Optional Enable / Disable state for స్పాట్లైట్ సబ్-కేటగిరీలు (Spotlight Subcategories) across all 6 modules
  const [spotlightModuleMap, setSpotlightModuleMap] = useState(() =>
    loadSpotlightSubcategoriesModuleMap()
  );

  const isSpotlightSubcategoriesEnabled = Boolean(
    spotlightModuleMap[activeMarketSection]
  );

  // User Enable / Disable individual subcategories inside స్పాట్లైట్ సబ్-కేటగిరీలు
  const [disabledSubcategoryKeys, setDisabledSubcategoryKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bos_disabled_spotlight_subcategories_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    const syncSpotlightSubcatToggle = () => {
      setSpotlightModuleMap(loadSpotlightSubcategoriesModuleMap());
    };
    window.addEventListener('bos-modular-templates-updated', syncSpotlightSubcatToggle);
    window.addEventListener('bos-dynamic-schema-updated', syncSpotlightSubcatToggle);
    window.addEventListener('bos-live-page-config-updated', syncSpotlightSubcatToggle);
    return () => {
      window.removeEventListener('bos-modular-templates-updated', syncSpotlightSubcatToggle);
      window.removeEventListener('bos-dynamic-schema-updated', syncSpotlightSubcatToggle);
      window.removeEventListener('bos-live-page-config-updated', syncSpotlightSubcatToggle);
    };
  }, []);

  const handleToggleSpotlightSubcategoriesBar = (nextState?: boolean) => {
    const targetState =
      typeof nextState === 'boolean' ? nextState : !isSpotlightSubcategoriesEnabled;
    const nextMap = toggleSpotlightSubcategoriesForSection(activeMarketSection, targetState);
    setSpotlightModuleMap(nextMap);
  };

  const handleToggleSingleSubcategoryEnabled = (subKey: string) => {
    setDisabledSubcategoryKeys((prev) => {
      const next = prev.includes(subKey)
        ? prev.filter((k) => k !== subKey)
        : [...prev, subKey];
      try {
        localStorage.setItem('bos_disabled_spotlight_subcategories_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const [checkedCategoriesBySection, setCheckedCategoriesBySection] = useState<
    Record<MarketSectionType, string[]>
  >({
    pg_hostels: [],
    classes: [],
    venues: [],
    services: [],
    hotel_stay: [],
    movies: [],
  });

  const t = translations[currentLang] || translations.te;
  const ui = getUILabels(currentLang);

  const isPG = activeMarketSection === 'pg_hostels';
  const isClasses = activeMarketSection === 'classes';
  const isVenues = activeMarketSection === 'venues';
  const isServices = activeMarketSection === 'services';
  const isHotelStay = activeMarketSection === 'hotel_stay';
  const isMovies = activeMarketSection === 'movies';
  
  const activePGCat = isPG ? pg29Categories.find(c => c.id === selectedCategory) : null;
  const activeClassCat = isClasses ? classCategories.find(c => c.id === selectedCategory) : null;
  const activeVenueCat = isVenues ? venue12Categories.find(c => c.id === selectedCategory) : null;
  const activeServiceCat = isServices ? servicesCategories.find(c => c.id === selectedCategory) : null;
  const activeHotelCat = isHotelStay ? hotelStayCategories.find(c => c.id === selectedCategory) : null;
  const activeMovieCat = isMovies ? moviesCategories.find(c => c.id === selectedCategory) : null;

  const allSectionCategories: (PGCategoryInfo | ClassCategoryInfo | VenueCategoryInfo)[] = isPG
    ? pg29Categories
    : isClasses
    ? classCategories
    : isVenues
    ? venue12Categories
    : isServices
    ? servicesCategories
    : isHotelStay
    ? hotelStayCategories
    : moviesCategories;

  const currentCheckedIds = checkedCategoriesBySection[activeMarketSection] || [];

  // When the user selects checkboxes in the "More" option, ONLY those selected categories display in the category section
  const displayedCategories =
    currentCheckedIds.length > 0
      ? allSectionCategories.filter((cat) => currentCheckedIds.includes(cat.id))
      : allSectionCategories;

  const handleToggleChecklistCategory = (catId: string) => {
    setCheckedCategoriesBySection((prev) => {
      const currentList = prev[activeMarketSection] || [];
      const exists = currentList.includes(catId);
      const nextList = exists
        ? currentList.filter((id) => id !== catId)
        : [...currentList, catId];
      return {
        ...prev,
        [activeMarketSection]: nextList,
      };
    });
  };

  const handleSelectAllChecklist = () => {
    setCheckedCategoriesBySection((prev) => ({
      ...prev,
      [activeMarketSection]: allSectionCategories.map((c) => c.id),
    }));
  };

  const handleClearChecklist = () => {
    setCheckedCategoriesBySection((prev) => ({
      ...prev,
      [activeMarketSection]: [],
    }));
  };

  const handleZoomIn = () => {
    setCategoryZoom((prev) => {
      const next = Math.min(1.5, Number((prev + 0.1).toFixed(2)));
      setSubcategoryZoom(next);
      return next;
    });
  };

  const handleZoomOut = () => {
    setCategoryZoom((prev) => {
      const next = Math.max(0.7, Number((prev - 0.1).toFixed(2)));
      setSubcategoryZoom(next);
      return next;
    });
  };

  const handleCategoryClick = (catId: string) => {
    if (selectedCategory === catId) {
      onSelectCategory('all');
      onSelectSubcategory('all');
    } else {
      onSelectCategory(catId);
      onSelectSubcategory('all');
    }
  };

  const getCategoryTitle = (cat: PGCategoryInfo | ClassCategoryInfo | VenueCategoryInfo) => {
    if (currentLang === 'te') return transliterateLatinToScript(cat.nameTe, 'te');
    if (currentLang === 'hi') return transliterateLatinToScript(cat.nameHi, 'hi');
    if (currentLang === 'en') return cat.name;
    return transliterateLatinToScript(cat.name, currentLang);
  };

  const getSubcategoryLabel = (sub: { en: string; te: string; hi: string }) => {
    if (currentLang === 'te') return transliterateLatinToScript(sub.te, 'te');
    if (currentLang === 'hi') return transliterateLatinToScript(sub.hi, 'hi');
    if (currentLang === 'en') return sub.en;
    return transliterateLatinToScript(sub.en, currentLang);
  };

  // Curated or category-specific subcategories so Subcategory bar + Zoom is ALWAYS available
  const activeSubcategoryItems = React.useMemo(() => {
    const activeCatObj =
      activePGCat ||
      activeClassCat ||
      activeVenueCat ||
      activeServiceCat ||
      activeHotelCat ||
      activeMovieCat;
    if (activeCatObj) {
      return activeCatObj.subcategories.map((sub: any, idx: number) => ({
        en: typeof sub === 'string' ? sub : sub.en,
        te: typeof sub === 'string' ? sub : sub.te,
        hi: typeof sub === 'string' ? sub : sub.hi,
        catId: activeCatObj.id,
        catEmoji: activeCatObj.emoji,
        catName: getCategoryTitle(activeCatObj),
        isSpotlight: idx < 3,
      }));
    }

    // When "All" category is selected, surface top high-demand subcategories across displayed categories
    const flattened: {
      en: string;
      te: string;
      hi: string;
      catId: string;
      catEmoji: string;
      catName: string;
      isSpotlight: boolean;
    }[] = [];
    const seen = new Set<string>();

    displayedCategories.forEach((cat, catIdx) => {
      cat.subcategories.slice(0, 2).forEach((sub: any, subIdx: number) => {
        const en = typeof sub === 'string' ? sub : sub.en;
        if (!seen.has(en)) {
          seen.add(en);
          flattened.push({
            en,
            te: typeof sub === 'string' ? sub : sub.te,
            hi: typeof sub === 'string' ? sub : sub.hi,
            catId: cat.id,
            catEmoji: cat.emoji,
            catName: getCategoryTitle(cat),
            isSpotlight: catIdx < 4 && subIdx === 0,
          });
        }
      });
    });
    return flattened;
  }, [
    activePGCat,
    activeClassCat,
    activeVenueCat,
    activeServiceCat,
    activeHotelCat,
    activeMovieCat,
    displayedCategories,
    currentLang,
  ]);

  return (
    <header className="w-full relative z-30 transition-colors duration-200 bg-gradient-to-b from-[#F5F3FF] via-[#FFFFFF] to-[#F8FAFC] dark:from-[#0E0B29] dark:via-[#120F33] dark:to-[#0A0C20] text-[#0F172A] dark:text-white border-b border-indigo-100/80 dark:border-indigo-950/80 shadow-[0_4px_20px_-4px_rgba(79,70,229,0.08)]">
      {/* Decorative Top Wave / Skyline Accent Strip matching Light & Dark screenshots */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[#4338CA] via-[#7C3AED] to-[#F97316]" />

      {/* 1. TOP BRAND + LOCATION BAR + ROUNDED SEARCH + 6 SECTION CARDS */}
      <div className="px-2.5 sm:px-6 pt-2 pb-2 relative">
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          {/* Row 1: BOSBrandLogo (Left, with 360° Rotating Middle O & Interactive VERIFIED Pill) + Clean Non-Overlapping Right Actions */}
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 shrink-0">
              {onBackToHomeHub && (
                <button
                  type="button"
                  onClick={onBackToHomeHub}
                  title="Back to Super-App Home Hub"
                  className="w-7 h-7 sm:w-auto sm:h-auto sm:px-2.5 sm:py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/90 hover:bg-indigo-100 text-[#4338CA] dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 font-black text-[10px] sm:text-xs flex items-center justify-center gap-1 shrink-0 cursor-pointer transition"
                >
                  <span>←</span>
                  <span className="hidden sm:inline">Home Hub</span>
                </button>
              )}
              <BOSBrandLogo
                compact
                onClick={() => {
                  if (onBackToHomeHub) {
                    onBackToHomeHub();
                  } else {
                    onSelectCategory('all');
                    onSelectSubcategory('all');
                  }
                }}
                verifiedLabel={ui.verifiedBadge}
                isVerifiedActive={verifiedOnly}
                onVerifiedClick={onToggleVerifiedOnly}
              />
            </div>

            {/* Right Actions: Language (md+) + Post Free + Theme Toggle + Notification Bell + Hamburger Menu */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Language Switcher (Desktop/Tablet) */}
              <div className="hidden md:flex items-center gap-1 bg-white dark:bg-[#17133A] px-2.5 py-1.5 rounded-full border border-slate-200/90 dark:border-indigo-500/30 shadow-2xs">
                <Globe className="w-3.5 h-3.5 text-[#5B21B6] dark:text-indigo-400 shrink-0" />
                <select
                  value={currentLang}
                  onChange={(e) => onChangeLang(e.target.value as AppLanguage)}
                  aria-label="Select Language"
                  className="bg-transparent text-[#0F172A] dark:text-white font-black text-[11px] outline-hidden cursor-pointer"
                >
                  {allIndianLanguages.map((lang) => (
                    <option
                      key={lang.code}
                      value={lang.code}
                      className="bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white"
                    >
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* + Post Free Button (Compact Circle on Mobile so BookOurSpace Never Truncates, Full Pill on sm+) */}
              <button
                type="button"
                onClick={() => onOpenCreate()}
                title="Post Free Listing"
                className="bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#5B21B6] hover:from-[#5B21B6] hover:to-[#4C1D95] text-white w-7 h-7 sm:w-auto sm:h-auto sm:px-3.5 sm:py-1.5 rounded-full font-black text-xs flex items-center justify-center gap-1 shadow-[0_4px_12px_rgba(109,40,217,0.35)] transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#FACC15] stroke-[3] shrink-0" />
                <span className="whitespace-nowrap hidden sm:inline">
                  {ui.postFreeShort.replace(/^\+\s*/, '')}
                </span>
              </button>

              {/* Dark / Light Mode Toggle */}
              {onToggleDarkMode && (
                <button
                  type="button"
                  onClick={onToggleDarkMode}
                  title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-white dark:bg-[#17133A] border border-slate-200/90 dark:border-indigo-500/40 flex items-center justify-center text-slate-700 dark:text-amber-300 hover:border-[#7C3AED] shadow-2xs transition shrink-0 cursor-pointer"
                >
                  {darkMode ? (
                    <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#5B21B6]" />
                  )}
                </button>
              )}

              {/* Notification Bell with Red Unread Dot (matching reference screenshots) */}
              <button
                type="button"
                onClick={() => onOpenNotifications?.()}
                title="Notifications & Alerts"
                className="relative w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-white dark:bg-[#17133A] border border-slate-200/90 dark:border-indigo-500/40 flex items-center justify-center text-slate-800 dark:text-white hover:border-[#7C3AED] shadow-2xs transition shrink-0 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2]" />
                <span className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-1 ring-white dark:ring-[#17133A]" />
                {unreadNotificationsCount > 0 && (
                  <span className="sr-only">{unreadNotificationsCount} unread notifications</span>
                )}
              </button>

              {/* Hamburger Menu Button */}
              <button
                type="button"
                onClick={() => setShowHamburgerMenu((prev) => !prev)}
                className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center shadow-2xs transition-colors shrink-0 cursor-pointer ${
                  showHamburgerMenu
                    ? 'bg-[#5B21B6] text-white border-[#5B21B6]'
                    : 'bg-white dark:bg-[#17133A] text-[#0F172A] dark:text-white border-slate-200/90 dark:border-indigo-500/40 hover:bg-indigo-50 dark:hover:bg-slate-800'
                }`}
                title="Open All Sections & Quick Menu"
              >
                {showHamburgerMenu ? (
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.4]" />
                ) : (
                  <Menu className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.2]" />
                )}
              </button>
            </div>
          </div>

          {/* Row 2: Location Pill Bar (`📍 Hyderabad ▾ | 🎯 Use current location`) + Desktop Search */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-center">
            {/* Location Bar Pill matching reference screenshots without overlapping select arrow */}
            <div className="lg:col-span-5 flex items-center justify-between gap-2 bg-white dark:bg-[#17133A]/95 border border-slate-200/90 dark:border-indigo-500/30 rounded-full px-3 sm:px-3.5 py-1.5 sm:py-2 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
              <div className="relative flex items-center gap-1 min-w-0 max-w-[140px] sm:max-w-[210px]">
                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6D28D9] dark:text-purple-400 fill-[#6D28D9]/15 shrink-0" />
                <select
                  value={selectedArea}
                  onChange={(e) => onSelectArea?.(e.target.value)}
                  aria-label="Select City or Locality in Hyderabad"
                  className="w-full appearance-none bg-transparent text-slate-900 dark:text-white font-extrabold text-xs sm:text-sm outline-hidden cursor-pointer truncate pr-4"
                >
                  <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    Hyderabad
                  </option>
                  {popularAreas.map((area) => (
                    <option
                      key={area}
                      value={area}
                      className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      {area === 'All Areas in City' ? 'Hyderabad' : area}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300 pointer-events-none absolute right-0" />
              </div>

              <span className="h-4 w-[1px] bg-slate-200 dark:bg-indigo-500/30 shrink-0" />

              <button
                type="button"
                onClick={() => {
                  const nextArea = selectedArea === 'Madhapur' ? 'Hitech City' : 'Madhapur';
                  onSelectArea?.(nextArea);
                }}
                className="flex items-center gap-1 text-[11px] sm:text-xs font-extrabold text-[#6D28D9] dark:text-purple-300 hover:text-[#4C1D95] dark:hover:text-purple-200 shrink-0 cursor-pointer"
              >
                <LocateFixed className="w-3.5 h-3.5 text-[#6D28D9] dark:text-purple-400 shrink-0" />
                <span className="whitespace-nowrap">
                  {currentLang === 'te' ? 'ప్రస్తుత లొకేషన్' : 'Use current location'}
                </span>
              </button>
            </div>

            {/* Rounded Pill Search Bar with Circular Purple Microphone Button matching screenshots */}
            <div className="lg:col-span-7 w-full">
              <div className="relative flex items-center bg-white dark:bg-[#17133A]/95 rounded-full border border-slate-200/90 dark:border-indigo-500/30 focus-within:border-[#6D28D9] focus-within:ring-2 focus-within:ring-purple-500/20 shadow-[0_2px_12px_rgba(15,23,42,0.05)] pl-4 pr-1.5 py-1 transition-all">
                <Search className="w-4 h-4 text-[#6D28D9] dark:text-purple-400 stroke-[2.5] shrink-0 mr-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={
                    currentLang === 'te'
                      ? 'పీజీలు, క్లాసులు, హాళ్లు, సర్వీసులు, హోటళ్లు, సినిమాలు వెతకండి...'
                      : 'Search PGs, classes, halls, services, stay, movies...'
                  }
                  className="w-full bg-transparent text-[#0F172A] dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 pr-2 py-1.5 text-xs sm:text-sm font-semibold outline-hidden"
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer mr-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenVoiceSearch}
                  title="Search by Voice"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-[#7C3AED] via-[#6D28D9] to-[#4F46E5] hover:from-[#6D28D9] hover:to-[#4338CA] text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(109,40,217,0.45)] transition-transform active:scale-95 cursor-pointer"
                >
                  <Mic className="w-4 h-4 stroke-[2.3]" />
                </button>
              </div>
            </div>
          </div>

          {/* Hamburger Quick Menu Drawer */}
          {showHamburgerMenu && (
            <div className="w-full sm:w-80 sm:ml-auto bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-3.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-[#5B21B6] dark:text-indigo-300">
                  {ui.menuTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setShowHamburgerMenu(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Action Buttons inside Hamburger Menu: + Post Free & Verified Only */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowHamburgerMenu(false);
                    onOpenCreate();
                  }}
                  className="py-2 px-3 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#4F46E5] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>{ui.postFreeShort}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onToggleVerifiedOnly?.();
                    setShowHamburgerMenu(false);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border cursor-pointer ${
                    verifiedOnly
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>{verifiedOnly ? '✓ Verified On' : 'Verified Only'}</span>
                </button>
              </div>

              {/* Admin Home Screen Layout Style Selector inside Hamburger Menu */}
              {onChangeHomeScreenStyle && (
                <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/70 space-y-1.5">
                  <div className="text-[10px] font-black uppercase text-indigo-900 dark:text-indigo-200">
                    Home &amp; Landing Page Style (Admin)
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onChangeHomeScreenStyle('bento_landing_hub');
                        onBackToHomeHub?.();
                        setShowHamburgerMenu(false);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-black border cursor-pointer ${
                        homeScreenStyle === 'bento_landing_hub'
                          ? 'bg-[#5B21B6] text-white border-[#5B21B6]'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      📱 Super-App Bento Hub
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChangeHomeScreenStyle('classic_marketplace');
                        setShowHamburgerMenu(false);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-black border cursor-pointer ${
                        homeScreenStyle === 'classic_marketplace'
                          ? 'bg-[#5B21B6] text-white border-[#5B21B6]'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      🏪 Classic Marketplace
                    </button>
                  </div>
                </div>
              )}

              {/* Role Portal Switcher (Customer / Provider / Super Admin) */}
              <div>
                <div className="text-[10px] font-black uppercase text-slate-400 mb-1.5">
                  Switch Portal Mode
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'customer', label: 'Customer', icon: Users },
                    { id: 'provider', label: 'Provider', icon: Briefcase },
                    { id: 'admin', label: 'Admin', icon: ShieldCheck },
                  ].map((r) => {
                    const RIcon = r.icon;
                    const isCurrentRole = userRole === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          onSelectRole?.(r.id as 'customer' | 'provider' | 'admin');
                          setShowHamburgerMenu(false);
                        }}
                        className={`p-2 rounded-xl border text-[11px] font-black flex flex-col items-center gap-1 cursor-pointer ${
                          isCurrentRole
                            ? 'bg-[#5B21B6] text-white border-[#5B21B6]'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <RIcon className="w-3.5 h-3.5" />
                        <span>{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* All 6 Sections Quick Jump */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'pg_hostels', emoji: '🏠', label: ui.secPG },
                  { id: 'classes', emoji: '🎓', label: ui.secClasses },
                  { id: 'venues', emoji: '🏛️', label: ui.secVenues },
                  { id: 'services', emoji: '🛠️', label: ui.secServices },
                  { id: 'hotel_stay', emoji: '🏨', label: ui.secStay },
                  { id: 'movies', emoji: '🎬', label: ui.secMovies },
                ].map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => {
                      onSelectMarketSection(sec.id as MarketSectionType);
                      onSelectCategory('all');
                      onSelectSubcategory('all');
                      setShowHamburgerMenu(false);
                    }}
                    className={`p-2 rounded-xl border text-left text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                      activeMarketSection === sec.id
                        ? 'bg-[#5B21B6] text-white border-[#5B21B6]'
                        : 'bg-slate-50 dark:bg-slate-800 text-[#0F172A] dark:text-white border-slate-200 dark:border-slate-700 hover:bg-indigo-50'
                    }`}
                  >
                    <span>{sec.emoji}</span>
                    <span className="truncate">{sec.label}</span>
                  </button>
                ))}
              </div>

              {/* Language, Login & Compare Controls inside Hamburger Menu */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 flex-1">
                  <Globe className="w-3.5 h-3.5 text-[#5B21B6]" />
                  <select
                    value={currentLang}
                    onChange={(e) => onChangeLang(e.target.value as AppLanguage)}
                    className="bg-transparent text-[#0F172A] dark:text-white font-black text-xs outline-hidden cursor-pointer w-full"
                  >
                    {allIndianLanguages.map((lang) => (
                      <option
                        key={lang.code}
                        value={lang.code}
                        className="bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white"
                      >
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowHamburgerMenu(false);
                    setShowLoginModal(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-[#5B21B6] dark:text-indigo-300 font-black text-xs flex items-center gap-1 cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Profile</span>
                </button>

                {onOpenCompareModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowHamburgerMenu(false);
                      onOpenCompareModal();
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-[#5B21B6] dark:text-indigo-300 font-black text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>{ui.compareLabel} ({comparedCount})</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Row 4: 6 MARKET SECTION ICON CARDS (PG's • Classes • Halls • Services • Stay • Movies) matching Light & Dark screenshots */}
          <div className="grid grid-cols-6 gap-1 sm:gap-2.5 pt-0.5 w-full">
            {[
              {
                id: 'pg_hostels' as MarketSectionType,
                emoji: '🏠',
                label: currentLang === 'en' ? "PG's" : ui.secPGShort,
                lightBg: 'bg-[#EEF2FF] border-[#C7D2FE]/80',
              },
              {
                id: 'classes' as MarketSectionType,
                emoji: '🎓',
                label: currentLang === 'en' ? 'Classes' : ui.secClassesShort,
                lightBg: 'bg-[#EFF6FF] border-[#BFDBFE]/80',
              },
              {
                id: 'venues' as MarketSectionType,
                emoji: '🏛️',
                label: currentLang === 'en' ? 'Halls' : ui.secVenuesShort,
                lightBg: 'bg-[#FFF7ED] border-[#FED7AA]/80',
              },
              {
                id: 'services' as MarketSectionType,
                emoji: '🛠️',
                label: currentLang === 'en' ? 'Services' : ui.secServicesShort,
                lightBg: 'bg-[#ECFDF5] border-[#A7F3D0]/80',
              },
              {
                id: 'hotel_stay' as MarketSectionType,
                emoji: '🏨',
                label: currentLang === 'en' ? 'Stay' : ui.secStayShort,
                lightBg: 'bg-[#FFF1F2] border-[#FECDD3]/80',
              },
              {
                id: 'movies' as MarketSectionType,
                emoji: '🎬',
                label: currentLang === 'en' ? 'Movies' : ui.secMoviesShort,
                lightBg: 'bg-[#F5F3FF] border-[#DDD6FE]/80',
              },
            ].map((tab) => {
              const isActive = activeMarketSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (activeMarketSection !== tab.id) {
                      onSelectMarketSection(tab.id);
                      onSelectCategory('all');
                      onSelectSubcategory('all');
                    }
                  }}
                  className={`group py-1.5 sm:py-2.5 px-0.5 sm:px-3 rounded-2xl transition-all duration-200 flex flex-col items-center justify-center gap-1 cursor-pointer border min-w-0 overflow-hidden ${
                    isActive
                      ? 'bg-gradient-to-b from-[#7C3AED] via-[#6D28D9] to-[#4338CA] text-white border-[#8B5CF6] shadow-[0_8px_20px_-4px_rgba(109,40,217,0.55)] ring-2 ring-purple-300/80 dark:ring-purple-500/70 scale-[1.01]'
                      : `${tab.lightBg} dark:bg-[#161336]/90 dark:border-indigo-500/25 text-slate-900 dark:text-slate-100 hover:scale-[1.01] hover:border-[#6D28D9]/50 shadow-2xs`
                  }`}
                >
                  <span className="text-lg sm:text-2xl leading-none drop-shadow-2xs transition-transform duration-200 group-hover:scale-110">
                    {tab.emoji}
                  </span>
                  <span
                    className={`text-[9px] sm:text-xs font-extrabold leading-tight tracking-tighter sm:tracking-tight whitespace-nowrap ${
                      isActive ? 'text-white' : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
          {onOpenServicesDiscovery && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onOpenServicesDiscovery}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-violet-200 bg-white px-4 text-xs font-extrabold text-violet-800 shadow-xs transition hover:border-violet-400 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 dark:border-violet-900 dark:bg-slate-900 dark:text-violet-200 dark:hover:bg-violet-950"
              >
                <span aria-hidden="true">✦</span>
                <span>Explore all services</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* LOGIN / PROFILE MODAL (OPENS WHEN USER CLICKS PROFILE TAB IN BOTTOM FOOTER) */}
      {isLoginModalVisible && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#FFFFFF] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#4338CA] text-white flex items-center justify-center font-black">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#0F172A] dark:text-white">
                    {currentLang === 'te'
                      ? 'బుక్‌అవర్‌స్పేస్ Google OAuth లాగిన్ & ప్రొఫైల్'
                      : 'BookOurSpace Google OAuth Login & Profile'}
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    {currentLang === 'te'
                      ? 'Google ఖాతా ద్వారా ఆటో-రిజిస్ట్రేషన్ & రోల్ ఆధారిత లాగిన్'
                      : 'Google-only OAuth • Auto-Registration for New Users • Role-Based Routing'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLoginModal}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isAccountBlocked && (
              <div className="p-3 rounded-2xl bg-rose-100 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold">
                ⚠️ Account Suspended / Blocked: {blockedReason || 'Your account has been suspended by an administrator. Access is denied.'}
              </div>
            )}

            {oauthAuthError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold">
                {oauthAuthError}
              </div>
            )}

            {oauthAuthSuccess && (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                {oauthAuthSuccess}
              </div>
            )}

            <div className="space-y-3">
              {/* Google OAuth Popup Button + Verified Badge */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      <Check className="w-3 h-3" />
                      {authUser ? `Google Verified (${authUser.role.toUpperCase()})` : 'Google-Only OAuth'}
                    </span>
                    {authUser && (
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                        {authUser.email}
                      </span>
                    )}
                  </div>
                  {authUser && (
                    <button
                      type="button"
                      onClick={async () => {
                        await logoutGoogleSession();
                        setOauthAuthSuccess('Signed out of Google session.');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 text-[11px] font-black flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      Sign Out
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  disabled={oauthLoading}
                  onClick={async () => {
                    setOauthAuthError(null);
                    setOauthAuthSuccess(null);
                    try {
                      const resp = await fetch(`/api/auth/google/url?role=${encodeURIComponent(loginSelectedRole)}`);
                      const data = await resp.json();
                      if (data?.url) {
                        window.open(
                          data.url,
                          'bos_google_oauth_popup',
                          'width=540,height=680,menubar=no,toolbar=no,location=yes,status=no'
                        );
                      }
                    } catch {
                      setOauthAuthError('Could not open Google OAuth popup. Use the Google Email field below.');
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 text-xs font-black text-slate-900 dark:text-white flex items-center justify-center gap-2.5 shadow-2xs cursor-pointer"
                >
                  <Globe className="w-4 h-4 text-[#4285F4]" />
                  <span>Continue with Google OAuth Popup</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-black text-[#0F172A] dark:text-slate-200 mb-1">
                    Google Email *
                  </label>
                  <input
                    type="email"
                    value={loginEmailInput}
                    onChange={(e) => setLoginEmailInput(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-xs font-bold text-[#0F172A] dark:text-white outline-hidden focus:border-[#4338CA]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[#0F172A] dark:text-slate-200 mb-1">
                    {currentLang === 'te' ? 'మీ పేరు (Your Name)' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    value={loginNameInput}
                    onChange={(e) => setLoginNameInput(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-xs font-bold text-[#0F172A] dark:text-white outline-hidden focus:border-[#4338CA]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[#0F172A] dark:text-slate-200 mb-1">
                    {currentLang === 'te' ? 'మొబైల్ నంబర్' : 'Mobile Number'}
                  </label>
                  <div className="flex items-center rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 px-3 py-2.5">
                    <Phone className="w-3.5 h-3.5 text-[#4338CA] mr-1.5 shrink-0" />
                    <input
                      type="tel"
                      value={loginPhoneInput}
                      onChange={(e) => setLoginPhoneInput(e.target.value)}
                      placeholder="98480 12345"
                      className="w-full bg-transparent text-xs font-bold text-[#0F172A] dark:text-white outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Role Switcher inside Profile Modal */}
              <div className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800">
                <div className="text-[10px] font-black uppercase text-[#64748B] mb-1.5">
                  {currentLang === 'te' ? 'రోల్ మార్చండి (Switch Mode)' : 'Account Role & Portal Routing'}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginSelectedRole('customer');
                      onSelectRole?.('customer');
                    }}
                    className={`p-2 rounded-xl text-[11px] font-black border flex flex-col items-center gap-1 cursor-pointer ${
                      loginSelectedRole === 'customer'
                        ? 'bg-[#EEF2FF] text-[#4338CA] border-[#4338CA]'
                        : 'bg-[#F8FAFC] dark:bg-slate-800 text-[#0F172A] dark:text-slate-200 border-[#E2E8F0] dark:border-slate-700'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-[#4338CA]" />
                    <span>{currentLang === 'te' ? 'కస్టమర్' : 'Customer'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginSelectedRole('provider');
                      onSelectRole?.('provider');
                    }}
                    className={`p-2 rounded-xl text-[11px] font-black border flex flex-col items-center gap-1 cursor-pointer ${
                      loginSelectedRole === 'provider'
                        ? 'bg-[#EEF2FF] text-[#15803D] border-[#15803D]'
                        : 'bg-[#F8FAFC] dark:bg-slate-800 text-[#0F172A] dark:text-slate-200 border-[#E2E8F0] dark:border-slate-700'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5 text-[#15803D]" />
                    <span>{currentLang === 'te' ? 'ప్రొవైడర్' : 'Provider'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginSelectedRole('admin');
                      onSelectRole?.('admin');
                    }}
                    className={`p-2 rounded-xl text-[11px] font-black border flex flex-col items-center gap-1 cursor-pointer ${
                      loginSelectedRole === 'admin'
                        ? 'bg-[#EEF2FF] text-[#F59E0B] border-[#F59E0B]'
                        : 'bg-[#F8FAFC] dark:bg-slate-800 text-[#0F172A] dark:text-slate-200 border-[#E2E8F0] dark:border-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#F59E0B]" />
                    <span>{currentLang === 'te' ? 'అడ్మిన్' : 'Admin'}</span>
                  </button>
                </div>
              </div>

              {/* Saved Listings (Favorites) & User Wallet / Ledger inside Profile */}
              <ProfileSavedAndWalletPanel currentLang={currentLang} />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeLoginModal}
                className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                {currentLang === 'te' ? 'రద్దు' : 'Close'}
              </button>
              <button
                type="button"
                disabled={oauthLoading}
                onClick={async () => {
                  setOauthAuthError(null);
                  setOauthAuthSuccess(null);
                  setOauthLoading(true);
                  const res = await loginWithGoogle({
                    email: loginEmailInput.trim().toLowerCase() || 'customer@gmail.com',
                    name: loginNameInput.trim() || 'NARENDRA',
                    phone: loginPhoneInput.trim() || '98480 12345',
                    requestedRole: 'customer',
                    allowRoleChange: false,
                  });
                  setOauthLoading(false);
                  if (!res.ok) {
                    setOauthAuthError(res.message || 'Google login failed. Account may be blocked.');
                    return;
                  }
                  if (res.user) {
                    setLoggedInUser((prev) => ({
                      ...prev,
                      name: res.user!.name.toUpperCase(),
                      phone: res.user!.phone || '98480 12345',
                      isLoggedIn: true,
                    }));
                    onSelectRole?.(res.user.role);
                  }
                  closeLoginModal();
                }}
                className="px-5 py-2 rounded-xl bg-[#4338CA] hover:bg-indigo-800 text-white text-xs font-black shadow-md cursor-pointer"
              >
                {oauthLoading
                  ? 'Signing in with Google...'
                  : currentLang === 'te'
                  ? 'Google తో లాగిన్ & సేవ్'
                  : 'Sign In / Auto-Register with Google'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. HORIZONTAL CATEGORY PILLS STRIP (`All PGs`, `Students PGs`, `Working Professionals`, `Boys`, `Girls`, `Co-Living`, + More Checklist) */}
      <div className="bg-transparent relative">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 pb-2 pt-0.5">
          <div className="flex items-center justify-between gap-2">
            {/* Horizontal Scrollable Pill Categories matching reference screenshots */}
            <div
              style={{ zoom: categoryZoom }}
              className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1 flex-1 min-w-0"
            >
              {/* "All PGs / All Courses / All Venues / All Services / All Hotels / All Movies" Pill */}
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('all');
                  onSelectSubcategory('all');
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap border transition-all shrink-0 cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-gradient-to-r from-[#6D28D9] to-[#4F46E5] text-white border-[#6D28D9] shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                    : 'bg-white dark:bg-[#17133A]/90 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-indigo-500/30 hover:border-[#6D28D9]'
                }`}
              >
                {isPG
                  ? ui.allPGs
                  : isClasses
                  ? ui.allCourses
                  : isVenues
                  ? ui.allVenues
                  : isServices
                  ? ui.allServices
                  : isHotelStay
                  ? ui.allHotels
                  : ui.allMovies}
              </button>

              {/* Individual Horizontal Category Pills */}
              {displayedCategories.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                const catTitle = getCategoryTitle(cat);

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryClick(cat.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#6D28D9] to-[#4F46E5] text-white border-[#6D28D9] font-extrabold shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                        : 'bg-white dark:bg-[#17133A]/90 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-indigo-500/30 hover:border-[#6D28D9] hover:text-[#5B21B6] dark:hover:text-white'
                    }`}
                  >
                    <span className="text-xs leading-none">{cat.emoji}</span>
                    <span>{catTitle}</span>
                  </button>
                );
              })}

              {/* "More" Option with Line Check Box Trigger */}
              <button
                type="button"
                onClick={() => setShowMoreChecklist((prev) => !prev)}
                className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap border transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                  showMoreChecklist || currentCheckedIds.length > 0
                    ? 'bg-[#5B21B6] text-white border-[#5B21B6]'
                    : 'bg-white dark:bg-[#17133A]/90 text-[#5B21B6] dark:text-indigo-300 border-slate-200/90 dark:border-indigo-500/30 hover:border-[#5B21B6]'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>
                  {currentCheckedIds.length > 0
                    ? `${ui.moreLabel} (${currentCheckedIds.length})`
                    : ui.moreLabel}
                </span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Right Compact Zoom - / + Controls (Desktop/Tablet only so mobile pills never overlap) */}
            <div className="hidden md:flex items-center gap-1 shrink-0 pl-1">
              {userRole === 'admin' && !isSpotlightSubcategoriesEnabled && (
                <button
                  type="button"
                  onClick={() => handleToggleSpotlightSubcategoriesBar(true)}
                  title="Admin Quick Toggle: Enable Spotlight Subcategories for this section"
                  className="px-2 py-1 rounded-full bg-amber-100 hover:bg-emerald-600 text-amber-950 hover:text-white border border-amber-300 text-[9px] font-black flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>Spotlight Subcats: OFF</span>
                </button>
              )}
              <div className="flex items-center gap-0.5 bg-white dark:bg-[#17133A] border border-slate-200 dark:border-indigo-500/30 rounded-full px-1 py-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={categoryZoom <= 0.7}
                  title="Zoom Out Categories (-)"
                  className="w-4 h-4 rounded-full flex items-center justify-center text-slate-700 dark:text-white hover:bg-indigo-50 dark:hover:bg-indigo-900/50 disabled:opacity-40 cursor-pointer"
                >
                  <ZoomOut className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={categoryZoom >= 1.5}
                  title="Zoom In Categories (+)"
                  className="w-4 h-4 rounded-full flex items-center justify-center text-slate-700 dark:text-white hover:bg-indigo-50 dark:hover:bg-indigo-900/50 disabled:opacity-40 cursor-pointer"
                >
                  <ZoomIn className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Line Check Box Panel when "More" is clicked */}
          {showMoreChecklist && (
            <div className="mt-2 bg-[#FFFFFF] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 rounded-2xl shadow-lg p-3 sm:p-4 z-50 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center justify-between gap-2 flex-wrap pb-2.5 mb-2.5 border-b border-[#E2E8F0] dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-[#4338CA]" />
                  <span className="text-xs sm:text-sm font-black text-[#0F172A] dark:text-white">
                    {currentLang === 'te'
                      ? 'కేటగిరీల ఎంపిక (ఎంచుకున్నవి మాత్రమే పైన కనిపిస్తాయి)'
                      : 'Select Categories to Display (Checked items only will show in Category Bar)'}
                  </span>
                  {currentCheckedIds.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#EEF2FF] text-[#4338CA] border border-[#4338CA]/30">
                      {currentCheckedIds.length} Selected
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllChecklist}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#EEF2FF] text-[#4338CA] hover:bg-[#4338CA] hover:text-[#FFFFFF] transition-colors cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearChecklist}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:text-[#0F172A] transition-colors cursor-pointer"
                  >
                    Show All (Reset)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMoreChecklist(false)}
                    className="px-3 py-1 rounded-lg text-[11px] font-black bg-[#4338CA] text-[#FFFFFF] hover:bg-[#3730A3] transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Done</span>
                  </button>
                </div>
              </div>

              {/* Line-by-line Check Box List */}
              <div className="max-h-64 overflow-y-auto pr-1 divide-y divide-[#E2E8F0] dark:divide-slate-800">
                {allSectionCategories.map((cat) => {
                  const isChecked = currentCheckedIds.includes(cat.id);
                  const catTitle = getCategoryTitle(cat);

                  return (
                    <label
                      key={cat.id}
                      className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors select-none ${
                        isChecked
                          ? 'bg-[#EEF2FF] dark:bg-indigo-950/40 text-[#4338CA] font-black'
                          : 'hover:bg-[#F8FAFC] dark:hover:bg-slate-800/60 text-[#0F172A] dark:text-slate-200 font-semibold'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleChecklistCategory(cat.id)}
                          className="w-4 h-4 rounded border-[#E2E8F0] text-[#4338CA] accent-[#4338CA] cursor-pointer shrink-0"
                        />
                        <span className="text-base shrink-0">{cat.emoji}</span>
                        <span className="text-xs sm:text-sm truncate">{catTitle}</span>
                        {currentLang !== 'en' && (
                          <span className="text-[11px] text-[#64748B] font-normal truncate hidden sm:inline">
                            ({cat.name})
                          </span>
                        )}
                      </div>

                      {isChecked && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#FCE7F3] text-[#0F172A] border border-[#4338CA]/30 shrink-0">
                          Visible
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. SUBCATEGORIES HORIZONTAL RIBBON (స్పాట్లైట్ సబ్-కేటగిరీలు) WITH USER ENABLE / DISABLE TOGGLE */}
          {isSpotlightSubcategoriesEnabled && (
            <div className="mt-1.5 pt-1.5 border-t border-[#E2E8F0] dark:border-slate-800">
              <div className="flex items-center justify-between gap-1 sm:gap-2">
                {/* Left Label + Subcategory Scrollable Strip with Dynamic Zoom */}
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                  <div className="flex items-center gap-1 shrink-0 bg-[#EEF2FF] dark:bg-indigo-950/60 border border-[#4338CA]/20 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl">
                    <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#F59E0B] fill-current" />
                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-tight text-[#4338CA] dark:text-indigo-300">
                      {activePGCat ||
                      activeClassCat ||
                      activeVenueCat ||
                      activeServiceCat ||
                      activeHotelCat ||
                      activeMovieCat
                        ? `${ui.subcategoriesLabel}:`
                        : `${ui.spotlightSubcategories}:`}
                    </span>
                  </div>

                  {/* Zoomable Subcategory Strip (Shows only Enabled Subcategories) */}
                  <div
                    style={{ zoom: subcategoryZoom }}
                    className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5 flex-1"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectSubcategory('all')}
                      className={`group relative px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-black border transition-all duration-300 shrink-0 cursor-pointer hover:scale-110 hover:-translate-y-0.5 hover:z-20 ${
                        selectedSubcategory === 'all'
                          ? 'bg-[#4338CA] text-[#FFFFFF] border-[#4338CA] shadow-[0_4px_12px_rgba(67,56,202,0.35)]'
                          : 'bg-[#FFFFFF] dark:bg-slate-800 text-[#0F172A] dark:text-slate-200 border-[#E2E8F0] dark:border-slate-700 hover:bg-[#FCE7F3] hover:text-[#0F172A] hover:border-[#4338CA]'
                      }`}
                    >
                      {ui.allLabel}
                    </button>

                    {activeSubcategoryItems
                      .filter((item) => !disabledSubcategoryKeys.includes(item.en))
                      .map((item) => {
                        const subLabel = getSubcategoryLabel(item);
                        const subKey = item.en;
                        const isSubSelected = selectedSubcategory === subKey;

                        return (
                          <button
                            key={`${item.catId}-${subKey}`}
                            type="button"
                            onClick={() => {
                              if (selectedSubcategory === subKey) {
                                onSelectSubcategory('all');
                              } else {
                                if (selectedCategory === 'all') {
                                  onSelectCategory(item.catId);
                                }
                                onSelectSubcategory(subKey);
                              }
                            }}
                            className={`group relative px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] border transition-all duration-300 shrink-0 cursor-pointer flex items-center gap-1 hover:scale-110 hover:-translate-y-1 hover:z-20 hover:shadow-[0_8px_16px_-4px_rgba(67,56,202,0.3),0_2px_0_0_#4338CA] ${
                              isSubSelected
                                ? 'bg-[#4338CA] text-[#FFFFFF] border-[#4338CA] font-black ring-2 ring-[#FCE7F3] shadow-[0_6px_14px_rgba(67,56,202,0.35)]'
                                : item.isSpotlight
                                ? 'bg-gradient-to-r from-[#FFFFFF] via-[#FCE7F3]/50 to-[#EEF2FF] dark:from-slate-800 dark:to-indigo-950/60 text-[#0F172A] dark:text-white border-[#4338CA]/40 font-extrabold hover:bg-[#FCE7F3] hover:border-[#4338CA]'
                                : 'bg-[#FFFFFF] dark:bg-slate-800 text-[#64748B] dark:text-slate-300 border-[#E2E8F0] dark:border-slate-700 font-bold hover:bg-[#FCE7F3] hover:text-[#0F172A] hover:font-black hover:border-[#4338CA]'
                            }`}
                          >
                            <span className="text-[11px] leading-none">{item.catEmoji}</span>
                            <span>{subLabel}</span>
                            {item.isSpotlight && (
                              <span
                                className={`text-[8px] sm:text-[9px] font-black uppercase px-1 py-0.2 rounded-full ${
                                  isSubSelected
                                    ? 'bg-[#F59E0B] text-[#0F172A]'
                                    : 'bg-[#FCE7F3] text-[#4338CA] border border-[#4338CA]/30'
                                }`}
                              >
                                {ui.hotBadge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Right Controls in Subcategory Section: Spotlight Subcategories Drawer + Direct ON/OFF Disable Switch */}
                <div className="flex items-center gap-1 shrink-0 pl-1 sm:pl-2 border-l border-[#E2E8F0] dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowSubcategorySpotlightGrid((prev) => !prev)}
                    className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-xl text-[9px] sm:text-[10px] font-black border transition-all flex items-center gap-0.5 sm:gap-1 cursor-pointer ${
                      showSubcategorySpotlightGrid
                        ? 'bg-[#4338CA] text-white border-[#4338CA] shadow-xs'
                        : 'bg-[#FCE7F3] text-[#4338CA] border-[#4338CA]/30 hover:bg-[#4338CA] hover:text-[#FFFFFF]'
                    }`}
                  >
                    <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#F59E0B] fill-current" />
                    <span className="hidden md:inline">
                      {ui.spotlightSubcategories}
                    </span>
                    {showSubcategorySpotlightGrid ? (
                      <ChevronUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    ) : (
                      <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    )}
                  </button>

                  {/* 1-Tap Disable స్పాట్లైట్ సబ్-కేటగిరీలు Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleSpotlightSubcategoriesBar(false)}
                    title="Disable స్పాట్లైట్ సబ్-కేటగిరీలు"
                    className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-xl bg-emerald-50 hover:bg-rose-600 text-emerald-800 hover:text-white border border-emerald-300 hover:border-rose-600 text-[9px] sm:text-[10px] font-black flex items-center gap-0.5 transition-colors cursor-pointer"
                  >
                    <EyeOff className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">ON</span>
                  </button>
                </div>
              </div>

              {/* Expandable Zoomed Subcategory Spotlight Matrix Drawer with Individual Enable/Disable Checkboxes */}
              {showSubcategorySpotlightGrid && (
                <div className="mt-2 bg-gradient-to-br from-[#FFFFFF] via-[#FCE7F3]/35 to-[#EEF2FF]/60 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 border border-[#4338CA]/30 rounded-2xl p-3 sm:p-4 shadow-xl animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap pb-2.5 mb-3 border-b border-[#E2E8F0] dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-[#4338CA] text-[#FFFFFF] flex items-center justify-center shadow-xs">
                        <Sparkles className="w-4 h-4 text-[#F59E0B] fill-current" />
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-black text-[#0F172A] dark:text-white">
                            {ui.spotlightSubcategories} — Optional Across All 6 Modules
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-100 text-[#4338CA] border border-[#4338CA]/30">
                            {ALL_SIX_MARKET_MODULES.map((m) => m.emoji).join(' ')} All 6 Synced
                          </span>
                        </div>
                        <p className="text-[10px] text-[#64748B] dark:text-slate-400 font-semibold">
                          Admin & users can enable or disable Spotlight Subcategories uniformly across all 6 modules (PG&apos;s, Classes, Venues, Services, Stay, Movies) or toggle individual subcategories below.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {disabledSubcategoryKeys.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setDisabledSubcategoryKeys([]);
                            try {
                              localStorage.removeItem('bos_disabled_spotlight_subcategories_v1');
                            } catch {}
                          }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-600 text-white cursor-pointer"
                        >
                          Enable All ({disabledSubcategoryKeys.length} Disabled)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleSpotlightSubcategoriesBar(false)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1 cursor-pointer"
                      >
                        <EyeOff className="w-3 h-3" />
                        <span>Disable {ui.spotlightSubcategories}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSubcategory('all');
                          setShowSubcategorySpotlightGrid(false);
                        }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#FFFFFF] text-[#64748B] border border-[#E2E8F0] hover:text-[#0F172A] cursor-pointer"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSubcategorySpotlightGrid(false)}
                        className="px-3 py-1 rounded-lg text-[10px] font-black bg-[#4338CA] text-[#FFFFFF] hover:bg-indigo-800 cursor-pointer flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Close</span>
                      </button>
                    </div>
                  </div>

                  <div
                    style={{ zoom: subcategoryZoom }}
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-64 overflow-y-auto pr-1"
                  >
                    {activeSubcategoryItems.map((item) => {
                      const subLabel = getSubcategoryLabel(item);
                      const isSubSelected = selectedSubcategory === item.en;
                      const isSubEnabled = !disabledSubcategoryKeys.includes(item.en);

                      return (
                        <div
                          key={`grid-${item.catId}-${item.en}`}
                          className={`p-2.5 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between gap-1.5 ${
                            !isSubEnabled
                              ? 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-55'
                              : isSubSelected
                              ? 'bg-[#4338CA] text-[#FFFFFF] border-[#4338CA] shadow-md'
                              : item.isSpotlight
                              ? 'bg-[#FCE7F3]/80 dark:bg-indigo-950/60 text-[#0F172A] dark:text-white border-[#4338CA]/40 hover:bg-[#FCE7F3]'
                              : 'bg-[#FFFFFF] dark:bg-slate-800 text-[#0F172A] dark:text-slate-200 border-[#E2E8F0] dark:border-slate-700 hover:bg-[#EEF2FF] hover:border-[#4338CA]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-base">{item.catEmoji}</span>
                            <label
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-white/90 text-slate-900 border border-slate-200 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isSubEnabled}
                                onChange={() => handleToggleSingleSubcategoryEnabled(item.en)}
                                className="w-3 h-3 accent-[#4338CA] cursor-pointer"
                              />
                              <span>{isSubEnabled ? 'ON' : 'OFF'}</span>
                            </label>
                          </div>
                          <button
                            type="button"
                            disabled={!isSubEnabled}
                            onClick={() => {
                              if (selectedCategory === 'all') {
                                onSelectCategory(item.catId);
                              }
                              onSelectSubcategory(item.en);
                              setShowSubcategorySpotlightGrid(false);
                            }}
                            className="text-left cursor-pointer disabled:cursor-not-allowed"
                          >
                            <div className="font-black text-xs leading-snug line-clamp-2">
                              {subLabel}
                            </div>
                            <div
                              className={`text-[10px] font-semibold truncate mt-0.5 ${
                                isSubSelected ? 'text-indigo-200' : 'text-[#64748B] dark:text-slate-400'
                              }`}
                            >
                              {item.catName}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </header>
  );
};

const ProfileSavedAndWalletPanel: React.FC<{ currentLang: AppLanguage }> = ({
  currentLang,
}) => {
  const { listings, favoriteIds, toggleFavorite } = useMarketplace();
  const [activeTab, setActiveTab] = useState<'wallet' | 'favorites'>('wallet');

  const savedListings = listings.filter((l) => favoriteIds.includes(l.id));

  return (
    <div className="pt-3 border-t border-[#E2E8F0] dark:border-slate-800 space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('wallet')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer ${
            activeTab === 'wallet'
              ? 'bg-[#4338CA] text-white border-[#4338CA]'
              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
          }`}
        >
          💳 {currentLang === 'te' ? 'వాలెట్ & లెడ్జర్' : 'User Wallet & Ledger'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('favorites')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer ${
            activeTab === 'favorites'
              ? 'bg-rose-600 text-white border-rose-600'
              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
          }`}
        >
          ❤️ {currentLang === 'te' ? 'సేవ్ చేసినవి (Saved)' : 'Saved Listings'} (
          {savedListings.length})
        </button>
      </div>

      {activeTab === 'wallet' ? (
        <UserWalletAndLedgerSection currentLang={currentLang} />
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {savedListings.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-center text-xs text-slate-500 font-bold">
              {currentLang === 'te'
                ? 'ఇంకా ఏ లిస్టింగ్‌లను సేవ్ చేయలేదు. కార్డ్‌పై ❤️ నొక్కండి.'
                : 'No saved listings yet. Tap the ❤️ heart icon on any card to save it here.'}
            </div>
          ) : (
            savedListings.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-2.5 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={item.images?.[0]}
                    alt={item.title}
                    className="w-11 h-11 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 dark:text-white truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] font-bold text-indigo-600">
                      ₹{item.price.toLocaleString('en-IN')} • {item.location.area}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFavorite(item.id)}
                  className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 text-[10px] font-black shrink-0 cursor-pointer hover:bg-rose-200"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

