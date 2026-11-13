import React, { useState } from 'react';
import {
  Search,
  ShieldCheck,
  Star,
  Heart,
  MapPin,
  ChevronRight,
  Check,
  Sparkles,
  ArrowUpDown,
  LayoutGrid,
  Rows3,
  ArrowLeft,
  Calendar,
  MessageSquare,
  ArrowLeftRight,
  Mic,
  X,
  RotateCcw,
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import { MarketSectionType, servicesCategories, hotelStayCategories, moviesCategories } from '../data/servicesStayMoviesData';
import { pg29Categories, PGCategoryInfo } from '../data/pgHostelData';
import { classCategories, ClassCategoryInfo } from '../data/classesData';
import { venue12Categories, VenueCategoryInfo } from '../data/venueData';
import {
  AppLanguage,
  getListingTitle,
  getPriceUnitDisplayName,
  getSubcategoryDisplayName,
} from '../utils/translations';
import { transliterateLatinToScript } from '../utils/i18nEngine';

interface CategoryRailStreamExplorerProps {
  activeMarketSection: MarketSectionType;
  onSelectMarketSection: (sec: MarketSectionType) => void;
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
  selectedSubcategory: string;
  onSelectSubcategory: (subcat: string) => void;
  selectedPGGender?: string;
  onSelectPGGender?: (gender: string) => void;
  listings: MarketplaceListing[];
  currentLang: AppLanguage;
  verifiedOnly: boolean;
  onToggleVerifiedOnly: () => void;
  sortBy: string;
  onChangeSortBy: (sort: any) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenVoiceSearch: () => void;
  favoriteIds: string[];
  onToggleFavorite: (id: string) => boolean;
  comparedListingIds: string[];
  onToggleCompare: (id: string) => void;
  onSelectListing: (listing: MarketplaceListing) => void;
  onBookNow: (listing: MarketplaceListing) => void;
  onEnquire: (listing: MarketplaceListing) => void;
  onOpenRunningBatches: (listing: MarketplaceListing) => void;
  onBackToHomeHub?: () => void;
  onSwitchToClassicFeed?: () => void;
  isSpotlightSubcategoriesEnabled?: boolean;
  onNotify?: (msg: string) => void;
}

const SECTION_TABS: {
  id: MarketSectionType;
  emoji: string;
  labelEn: string;
  labelTe: string;
  accent: string;
}[] = [
  {
    id: 'pg_hostels',
    emoji: '🏠',
    labelEn: "PG's & Hostels",
    labelTe: 'పీజీలు & హాస్టల్స్',
    accent: 'from-violet-600 to-indigo-600',
  },
  {
    id: 'classes',
    emoji: '🎓',
    labelEn: 'Classes & Courses',
    labelTe: 'క్లాసులు & కోర్సులు',
    accent: 'from-blue-600 to-indigo-600',
  },
  {
    id: 'venues',
    emoji: '🏛️',
    labelEn: 'Halls & Venues',
    labelTe: 'ఫంక్షన్ హాళ్లు',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    id: 'services',
    emoji: '🛠️',
    labelEn: 'Home Services',
    labelTe: 'లోకల్ సర్వీసులు',
    accent: 'from-emerald-600 to-teal-600',
  },
  {
    id: 'hotel_stay',
    emoji: '🏨',
    labelEn: 'Hotels & Stay',
    labelTe: 'హోటల్స్ & స్టే',
    accent: 'from-rose-600 to-pink-600',
  },
  {
    id: 'movies',
    emoji: '🎬',
    labelEn: 'Movies & Events',
    labelTe: 'మూవీస్ & షోలు',
    accent: 'from-purple-600 to-fuchsia-600',
  },
];

// Curated thumbnail mapping for Category Rail visual cards
const RAIL_CATEGORY_IMAGES: Record<string, string> = {
  'pg-students': 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=300&q=80',
  'pg-professionals': 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=300&q=80',
  'pg-boys': 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=300&q=80',
  'pg-girls': 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=300&q=80',
  'pg-coliving': 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=300&q=80',
  'pg-college-hostels': 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=300&q=80',
  'class-academic': 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=300&q=80',
  'class-software': 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=300&q=80',
  'class-govtexams': 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=300&q=80',
  'class-languages': 'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=300&q=80',
  'class-music': 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=300&q=80',
  'class-dance': 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=300&q=80',
  'venue-marriage': 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=300&q=80',
  'venue-banquet': 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=300&q=80',
  'venue-convention': 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=300&q=80',
  'venue-resort': 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=300&q=80',
  'srv-electrician': 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=300&q=80',
  'srv-plumber': 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=300&q=80',
  'srv-ac-appliance': 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=300&q=80',
  'srv-cleaning': 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=300&q=80',
  'hotel-luxury': 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=300&q=80',
  'hotel-budget': 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=300&q=80',
  'movie-tollywood': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=300&q=80',
  'movie-bollywood': 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=300&q=80',
};

const FALLBACK_RAIL_IMAGES = [
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=300&q=80',
];

export const CategoryRailStreamExplorer: React.FC<CategoryRailStreamExplorerProps> = ({
  activeMarketSection,
  onSelectMarketSection,
  selectedCategory,
  onSelectCategory,
  selectedSubcategory,
  onSelectSubcategory,
  onSelectPGGender,
  listings,
  currentLang,
  verifiedOnly,
  onToggleVerifiedOnly,
  sortBy,
  onChangeSortBy,
  searchQuery,
  onSearchChange,
  onOpenVoiceSearch,
  favoriteIds,
  onToggleFavorite,
  comparedListingIds,
  onToggleCompare,
  onSelectListing,
  onBookNow,
  onEnquire,
  onOpenRunningBatches,
  onBackToHomeHub,
  onSwitchToClassicFeed,
  isSpotlightSubcategoriesEnabled = true,
  onNotify,
}) => {
  const [streamGridCols, setStreamGridCols] = useState<'compact' | 'detailed'>('compact');

  const sectionCategories: (PGCategoryInfo | ClassCategoryInfo | VenueCategoryInfo)[] =
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

  const activeCategoryObj = sectionCategories.find((c) => c.id === selectedCategory) || null;

  const getCategoryDisplayName = (cat: PGCategoryInfo | ClassCategoryInfo | VenueCategoryInfo) => {
    if (currentLang === 'te') return transliterateLatinToScript(cat.nameTe, 'te');
    if (currentLang === 'hi') return transliterateLatinToScript(cat.nameHi, 'hi');
    return cat.name;
  };

  // Subcategory / Stream chips for the right-hand Stream Explorer
  const activeStreamChips = React.useMemo(() => {
    if (activeCategoryObj) {
      return activeCategoryObj.subcategories.map((sub: any) => ({
        en: typeof sub === 'string' ? sub : sub.en,
        label:
          currentLang === 'te'
            ? transliterateLatinToScript(typeof sub === 'string' ? sub : sub.te, 'te')
            : currentLang === 'hi'
            ? transliterateLatinToScript(typeof sub === 'string' ? sub : sub.hi, 'hi')
            : typeof sub === 'string'
            ? sub
            : sub.en,
        emoji: activeCategoryObj.emoji,
        catId: activeCategoryObj.id,
      }));
    }

    // When "All" is selected on the Left Rail, aggregate top streams from each category
    const chips: { en: string; label: string; emoji: string; catId: string }[] = [];
    const seen = new Set<string>();
    sectionCategories.forEach((cat) => {
      cat.subcategories.slice(0, 2).forEach((sub: any) => {
        const en = typeof sub === 'string' ? sub : sub.en;
        if (!seen.has(en)) {
          seen.add(en);
          chips.push({
            en,
            label:
              currentLang === 'te'
                ? transliterateLatinToScript(typeof sub === 'string' ? sub : sub.te, 'te')
                : currentLang === 'hi'
                ? transliterateLatinToScript(typeof sub === 'string' ? sub : sub.hi, 'hi')
                : en,
            emoji: cat.emoji,
            catId: cat.id,
          });
        }
      });
    });
    return chips;
  }, [activeCategoryObj, sectionCategories, currentLang]);

  const currentSectionMeta =
    SECTION_TABS.find((s) => s.id === activeMarketSection) || SECTION_TABS[0];

  const handleSelectRailCategory = (catId: string) => {
    onSelectCategory(catId);
    onSelectSubcategory('all');
    if (activeMarketSection === 'pg_hostels' && onSelectPGGender) {
      if (catId === 'pg-boys') onSelectPGGender('Boys Only');
      else if (catId === 'pg-girls') onSelectPGGender('Girls Only');
      else if (catId === 'pg-coliving') onSelectPGGender('Co-Living (Unisex)');
      else onSelectPGGender('all');
    }
  };

  return (
    <section
      id="bos-category-rail-stream-explorer"
      className="bg-white dark:bg-[#0D1126] rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-[0_6px_28px_rgba(15,23,42,0.06)] overflow-hidden flex flex-col"
    >
      {/* 1. TOP QUICK-COMMERCE NAVIGATION & SECTION SWITCHER BAR */}
      <div className="bg-gradient-to-r from-[#F8FAFC] via-white to-[#F5F3FF] dark:from-[#11152E] dark:via-[#151938] dark:to-[#11152E] border-b border-slate-200/80 dark:border-slate-800 px-2.5 sm:px-4 py-2 space-y-2">
        {/* Top Row: Back to MyJio Hub + Title Badge + Classic View Toggle */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {onBackToHomeHub && (
              <button
                type="button"
                onClick={onBackToHomeHub}
                className="px-2.5 py-1 rounded-full bg-[#0A3D91] hover:bg-blue-800 text-white text-[11px] font-black flex items-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{currentLang === 'te' ? 'హోమ్ హబ్' : 'MyJio Home'}</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#5B21B6] to-[#4338CA] text-white text-xs flex items-center justify-center shadow-2xs shrink-0">
                {currentSectionMeta.emoji}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                    {activeCategoryObj
                      ? getCategoryDisplayName(activeCategoryObj)
                      : currentLang === 'te'
                      ? currentSectionMeta.labelTe
                      : currentSectionMeta.labelEn}
                  </h2>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[9px] font-black shrink-0">
                    {listings.length} {currentLang === 'te' ? 'అందుబాటులో' : 'Live'}
                  </span>
                </div>
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                  {currentLang === 'te'
                    ? 'కేటగిరీ రైల్ & స్ట్రీమ్ ఎక్స్‌ప్లోరర్ • జీరో బ్రోకరేజ్'
                    : 'Category Rail & Stream Explorer • Blinkit / Zepto Quick-Commerce Navigation'}
                </p>
              </div>
            </div>
          </div>

          {/* Right Controls: Grid Density Toggle + Classic Showcase Switch */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setStreamGridCols('compact')}
                title="2-Column Quick-Commerce Stream Cards"
                className={`px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 transition cursor-pointer ${
                  streamGridCols === 'compact'
                    ? 'bg-white dark:bg-slate-900 text-[#5B21B6] dark:text-amber-300 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span className="hidden sm:inline">Stream Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setStreamGridCols('detailed')}
                title="Detailed Full-Width Stream Cards"
                className={`px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 transition cursor-pointer ${
                  streamGridCols === 'detailed'
                    ? 'bg-white dark:bg-slate-900 text-[#5B21B6] dark:text-amber-300 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Rows3 className="w-3 h-3" />
                <span className="hidden sm:inline">Detailed</span>
              </button>
            </div>

            {onSwitchToClassicFeed && (
              <button
                type="button"
                onClick={onSwitchToClassicFeed}
                className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-[#4338CA] dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] sm:text-[11px] font-black cursor-pointer transition"
              >
                {currentLang === 'te' ? 'క్లాసిక్ వ్యూ' : 'Classic View'}
              </button>
            )}
          </div>
        </div>

        {/* Row 2: 6 Section Switcher Tabs (Instant Switch inside Explorer) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {SECTION_TABS.map((sec) => {
            const isSecActive = activeMarketSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  if (activeMarketSection !== sec.id) {
                    onSelectMarketSection(sec.id);
                    onSelectCategory('all');
                    onSelectSubcategory('all');
                  }
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-black whitespace-nowrap flex items-center gap-1.5 border transition cursor-pointer shrink-0 ${
                  isSecActive
                    ? `bg-gradient-to-r ${sec.accent} text-white border-transparent shadow-xs`
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-purple-400'
                }`}
              >
                <span className="text-xs leading-none">{sec.emoji}</span>
                <span>{currentLang === 'te' ? sec.labelTe : sec.labelEn}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. SPLIT-PANE QUICK-COMMERCE BODY: LEFT VERTICAL CATEGORY RAIL + RIGHT STREAM EXPLORER */}
      <div className="flex items-stretch min-h-[540px] max-h-[calc(100dvh-165px)]">
        {/* LEFT PANE: VERTICAL CATEGORY RAIL (BLINKIT / ZEPTO / CLASSCONNECT STYLE) */}
        <aside
          aria-label="Category Rail"
          className="w-[82px] sm:w-[116px] md:w-[148px] shrink-0 bg-[#F4F6FB] dark:bg-[#090D1E] border-r border-slate-200/90 dark:border-slate-800 overflow-y-auto no-scrollbar py-2 select-none"
        >
          <div className="flex flex-col gap-1">
            {/* "All Categories" Top Rail Item */}
            <button
              type="button"
              onClick={() => handleSelectRailCategory('all')}
              className={`group relative w-full py-2 px-1.5 flex flex-col items-center text-center transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-white dark:bg-[#151A36] shadow-2xs'
                  : 'hover:bg-white/60 dark:hover:bg-slate-900/50'
              }`}
            >
              {/* Active Left Vertical Accent Bar */}
              {selectedCategory === 'all' && (
                <span className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full bg-[#5B21B6] dark:bg-amber-400 shadow-[0_0_8px_rgba(91,33,182,0.6)]" />
              )}

              <div
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex flex-col items-center justify-center transition-transform duration-200 mb-1 border ${
                  selectedCategory === 'all'
                    ? 'bg-gradient-to-br from-[#5B21B6] to-[#4338CA] text-white border-purple-400 scale-105 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-800 group-hover:scale-105'
                }`}
              >
                <span className="text-lg sm:text-xl leading-none">{currentSectionMeta.emoji}</span>
                <span className="text-[8px] font-black uppercase tracking-wider mt-0.5 opacity-90">
                  ALL ({sectionCategories.length})
                </span>
              </div>

              <span
                className={`text-[10px] sm:text-[11px] leading-tight line-clamp-2 px-0.5 ${
                  selectedCategory === 'all'
                    ? 'font-black text-[#5B21B6] dark:text-amber-300'
                    : 'font-bold text-slate-700 dark:text-slate-300'
                }`}
              >
                {currentLang === 'te' ? 'అన్ని కేటగిరీలు' : 'All Categories'}
              </span>
            </button>

            {/* Individual Category Rail Items */}
            {sectionCategories.map((cat, idx) => {
              const isSelected = selectedCategory === cat.id;
              const catName = getCategoryDisplayName(cat);
              const railImg =
                RAIL_CATEGORY_IMAGES[cat.id] ||
                FALLBACK_RAIL_IMAGES[idx % FALLBACK_RAIL_IMAGES.length];

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectRailCategory(cat.id)}
                  className={`group relative w-full py-2 px-1.5 flex flex-col items-center text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white dark:bg-[#151A36] shadow-2xs'
                      : 'hover:bg-white/60 dark:hover:bg-slate-900/50'
                  }`}
                >
                  {/* Active Left Vertical Pill Indicator */}
                  {isSelected && (
                    <span className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full bg-[#5B21B6] dark:bg-amber-400 shadow-[0_0_8px_rgba(91,33,182,0.6)]" />
                  )}

                  {/* Category Squircle Thumbnail + Emoji Badge */}
                  <div
                    className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden mb-1 border transition-all duration-200 ${
                      isSelected
                        ? 'border-[#5B21B6] dark:border-amber-400 ring-2 ring-[#5B21B6]/25 dark:ring-amber-400/30 scale-105 shadow-sm'
                        : 'border-slate-200/90 dark:border-slate-800 group-hover:scale-105'
                    }`}
                  >
                    <img
                      src={railImg}
                      alt={catName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/10 to-transparent" />
                    <span className="absolute bottom-0.5 right-1 text-xs sm:text-sm leading-none drop-shadow">
                      {cat.emoji}
                    </span>
                    {isSelected && (
                      <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[#5B21B6] text-white flex items-center justify-center shadow-2xs">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  {/* Category Name */}
                  <span
                    className={`text-[10px] sm:text-[11px] leading-tight line-clamp-2 px-0.5 ${
                      isSelected
                        ? 'font-black text-[#5B21B6] dark:text-amber-300'
                        : 'font-bold text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {catName}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* RIGHT PANE: STREAM EXPLORER (SUBCATEGORY STREAM PILLS + QUICK FILTER BAR + PRODUCT STREAM GRID) */}
        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto bg-white dark:bg-[#0D1126]">
          {/* Sticky Top Stream Filter & Subcategory Chips Header */}
          <div className="sticky top-0 z-20 bg-white/95 dark:bg-[#0D1126]/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/90 px-2.5 sm:px-4 py-2 space-y-2">
            {/* Search & Quick Verified / Sort Strip */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[140px] flex items-center bg-slate-100 dark:bg-[#151A36] rounded-xl px-2.5 py-1 border border-slate-200/80 dark:border-slate-700/80">
                <Search className="w-3.5 h-3.5 text-[#5B21B6] dark:text-indigo-400 mr-1.5 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={
                    activeCategoryObj
                      ? `Search in ${getCategoryDisplayName(activeCategoryObj)}...`
                      : 'Search streams, coaching, PGs, halls...'
                  }
                  className="w-full bg-transparent text-[11px] sm:text-xs font-bold text-slate-900 dark:text-white outline-hidden"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenVoiceSearch}
                  title="Voice Search"
                  className="ml-1 w-6 h-6 rounded-lg bg-[#5B21B6] text-white flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Mic className="w-3 h-3" />
                </button>
              </div>

              {/* Verified Only Quick Pill */}
              <button
                type="button"
                onClick={onToggleVerifiedOnly}
                className={`px-2.5 py-1 rounded-xl text-[10px] sm:text-[11px] font-black flex items-center gap-1 border transition cursor-pointer shrink-0 ${
                  verifiedOnly
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-slate-50 dark:bg-[#151A36] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                <span>{currentLang === 'te' ? 'వెరిఫైడ్' : 'Verified'}</span>
              </button>

              {/* Compact Sort Selector */}
              <div className="flex items-center bg-slate-50 dark:bg-[#151A36] border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1 shrink-0">
                <ArrowUpDown className="w-3 h-3 text-[#5B21B6] dark:text-indigo-400 mr-1 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => onChangeSortBy(e.target.value)}
                  aria-label="Sort Stream Results"
                  className="bg-transparent text-[10px] sm:text-[11px] font-black text-slate-800 dark:text-slate-200 outline-hidden cursor-pointer"
                >
                  <option value="distance_asc" className="bg-white dark:bg-slate-900">
                    Nearest
                  </option>
                  <option value="rating" className="bg-white dark:bg-slate-900">
                    Top Rated
                  </option>
                  <option value="price_asc" className="bg-white dark:bg-slate-900">
                    Price: Low
                  </option>
                  <option value="price_desc" className="bg-white dark:bg-slate-900">
                    Price: High
                  </option>
                </select>
              </div>
            </div>

            {/* Horizontal Stream / Subcategory Chips Bar (When Spotlight Subcategories Enabled or Category Selected) */}
            {(isSpotlightSubcategoriesEnabled || selectedCategory !== 'all') &&
              activeStreamChips.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-[#5B21B6] dark:text-amber-300 shrink-0 pr-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{currentLang === 'te' ? 'స్ట్రీమ్స్:' : 'Streams:'}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelectSubcategory('all')}
                    className={`px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black whitespace-nowrap border transition cursor-pointer shrink-0 ${
                      selectedSubcategory === 'all'
                        ? 'bg-[#5B21B6] text-white border-[#5B21B6] shadow-2xs'
                        : 'bg-slate-50 dark:bg-[#151A36] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-400'
                    }`}
                  >
                    {currentLang === 'te' ? 'అన్నీ (All)' : 'All Streams'}
                  </button>

                  {activeStreamChips.map((chip) => {
                    const isSubActive = selectedSubcategory === chip.en;
                    return (
                      <button
                        key={`${chip.catId}-${chip.en}`}
                        type="button"
                        onClick={() => {
                          if (isSubActive) {
                            onSelectSubcategory('all');
                          } else {
                            if (selectedCategory === 'all') {
                              onSelectCategory(chip.catId);
                            }
                            onSelectSubcategory(chip.en);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold whitespace-nowrap border transition flex items-center gap-1 cursor-pointer shrink-0 ${
                          isSubActive
                            ? 'bg-[#5B21B6] text-white border-[#5B21B6] font-black shadow-2xs'
                            : 'bg-white dark:bg-[#151A36] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-purple-400'
                        }`}
                      >
                        <span className="text-[10px] leading-none">{chip.emoji}</span>
                        <span>{chip.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
          </div>

          {/* STREAM EXPLORER RESULTS GRID */}
          <div className="p-2.5 sm:p-4 flex-1">
            {listings.length === 0 ? (
              <div className="bg-slate-50 dark:bg-[#131836] rounded-2xl p-8 text-center border border-slate-200/80 dark:border-slate-800 space-y-2.5 my-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-[#5B21B6] dark:text-purple-300 flex items-center justify-center mx-auto">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {currentLang === 'te'
                    ? 'ఈ కేటగిరీలో లిస్టింగ్‌లు కనుగొనబడలేదు'
                    : 'No listings match this stream filter'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  {currentLang === 'te'
                    ? 'ఇతర కేటగిరీని ఎంచుకోండి లేదా ఫిల్టర్లను రీసెట్ చేయండి.'
                    : 'Select another category from the left rail or reset active stream filters.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory('all');
                    onSelectSubcategory('all');
                    onSearchChange('');
                  }}
                  className="px-4 py-1.5 rounded-xl bg-[#5B21B6] text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{currentLang === 'te' ? 'అన్నీ చూపించు' : 'Show All in Section'}</span>
                </button>
              </div>
            ) : (
              <div
                className={
                  streamGridCols === 'compact'
                    ? 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3.5'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                }
              >
                {listings.map((item) => {
                  const isFav = favoriteIds.includes(item.id);
                  const isCompared = comparedListingIds.includes(item.id);
                  const displayTitle = getListingTitle(item, currentLang);
                  const rawUnit =
                    currentLang === 'te'
                      ? item.priceUnitTe || item.priceUnit
                      : item.priceUnit;
                  const unitLabel = getPriceUnitDisplayName(rawUnit, currentLang);
                  const subcatLabel = getSubcategoryDisplayName(item.subcategory, currentLang);
                  const areaLabel = item.location?.area
                    ? item.location.area.split('/')[0].trim()
                    : 'Madhapur';
                  const distKm = item.distanceKm ?? item.location?.distanceKm ?? 1.8;

                  // Quick-Commerce Action CTA Label
                  const ctaLabel =
                    activeMarketSection === 'classes'
                      ? currentLang === 'te'
                        ? 'డెమో బుక్'
                        : 'JOIN DEMO'
                      : activeMarketSection === 'pg_hostels'
                      ? currentLang === 'te'
                        ? 'విజిట్ / బుక్'
                        : 'BOOK BED'
                      : activeMarketSection === 'movies'
                      ? currentLang === 'te'
                        ? 'టికెట్లు'
                        : 'TICKETS'
                      : currentLang === 'te'
                      ? 'బుక్ చేయండి'
                      : 'BOOK NOW';

                  return (
                    <article
                      key={`stream-card-${item.id}`}
                      onClick={() => onSelectListing(item)}
                      className="group bg-white dark:bg-[#131836] rounded-2xl border border-slate-200/90 dark:border-slate-800 hover:border-[#5B21B6] dark:hover:border-purple-500 overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
                    >
                      {/* Top Image Area */}
                      <div>
                        <div className="relative h-28 sm:h-36 w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <img
                            src={
                              item.images?.[0] ||
                              'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80'
                            }
                            alt={displayTitle}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent" />

                          {/* Top-Left Verified Pill */}
                          {item.isVerified && (
                            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-emerald-600/95 text-white text-[9px] font-black flex items-center gap-0.5 shadow-2xs">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              <span>Verified</span>
                            </span>
                          )}

                          {/* Top-Right Favorite Heart Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const nowFav = onToggleFavorite(item.id);
                              onNotify?.(
                                nowFav ? '❤️ Added to My Favorites' : 'Removed from My Favorites'
                              );
                            }}
                            aria-label="Favorite"
                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 dark:bg-slate-900/90 flex items-center justify-center shadow-2xs hover:scale-105 transition cursor-pointer"
                          >
                            <Heart
                              className={`w-3.5 h-3.5 ${
                                isFav
                                  ? 'text-rose-500 fill-rose-500'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            />
                          </button>

                          {/* Bottom-Left Rating + Distance Strip */}
                          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black flex items-center gap-0.5 shadow-2xs">
                              <Star className="w-2.5 h-2.5 fill-white" />
                              <span>{item.providerRating}</span>
                              <span className="opacity-85">({item.reviewCount})</span>
                            </span>

                            <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5 text-amber-400" />
                              <span>{distKm} km</span>
                            </span>
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className="p-2.5 sm:p-3 space-y-1">
                          {/* Stream Subcategory Kicker */}
                          <div className="flex items-center justify-between gap-1 text-[9.5px] font-extrabold text-[#5B21B6] dark:text-indigo-300 truncate">
                            <span className="truncate">{subcatLabel}</span>
                            <span className="text-slate-400 dark:text-slate-500 shrink-0">
                              • {areaLabel}
                            </span>
                          </div>

                          {/* Title */}
                          <h3 className="text-[11.5px] sm:text-xs font-black text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-[#5B21B6] dark:group-hover:text-amber-300">
                            {displayTitle}
                          </h3>

                          {/* Provider / Institute / Highlights */}
                          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                            {item.providerName}
                          </p>
                        </div>
                      </div>

                      {/* Bottom Quick-Commerce Price + Action Bar */}
                      <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3 pt-1 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-black text-slate-950 dark:text-white leading-none tabular-nums">
                              {item.currency}
                              {item.price.toLocaleString('en-IN')}
                            </div>
                            <div className="text-[9px] font-semibold text-slate-400 truncate mt-0.5">
                              {unitLabel.startsWith('/') ? unitLabel : `/${unitLabel}`}
                            </div>
                          </div>

                          {/* Blinkit / Zepto Style High-Contrast Action Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBookNow(item);
                            }}
                            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-300 hover:text-white border border-emerald-500/80 text-[10px] sm:text-[11px] font-black tracking-tight shadow-2xs transition active:scale-95 cursor-pointer shrink-0"
                          >
                            {ctaLabel}
                          </button>
                        </div>

                        {/* Secondary Quick Utility Row (Batches / Chat / Compare) */}
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          {activeMarketSection === 'classes' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenRunningBatches(item);
                              }}
                              className="text-[9.5px] font-extrabold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-0.5 cursor-pointer truncate"
                            >
                              <Calendar className="w-2.5 h-2.5 shrink-0" />
                              <span>Batches</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEnquire(item);
                              }}
                              className="text-[9.5px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer truncate"
                            >
                              <MessageSquare className="w-2.5 h-2.5 shrink-0" />
                              <span>Enquire</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleCompare(item.id);
                            }}
                            className={`text-[9.5px] font-extrabold flex items-center gap-0.5 cursor-pointer ${
                              isCompared
                                ? 'text-[#5B21B6] dark:text-amber-300'
                                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                          >
                            <ArrowLeftRight className="w-2.5 h-2.5" />
                            <span>{isCompared ? 'Compared' : 'Compare'}</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
