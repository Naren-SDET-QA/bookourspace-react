import React, { useState, useEffect } from 'react';
import SafeImage from './SafeImage';
import {
  Search,
  Bell,
  QrCode,
  LayoutGrid,
  Sun,
  Moon,
  Plus,
  X,
  Mic,
  ShieldCheck,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Users,
  Briefcase,
  MapPin,
  ChevronDown,
} from 'lucide-react';
import { BOSBrandLogo } from './BOSBrandLogo';
import {
  MarketSectionType,
  servicesCategories,
  hotelStayCategories,
  moviesCategories,
} from '../data/servicesStayMoviesData';
import { pg29Categories } from '../data/pgHostelData';
import { classCategories } from '../data/classesData';
import { venue12Categories } from '../data/venueData';
import { AppLanguage, allIndianLanguages } from '../utils/translations';
import { getUILabels } from '../utils/i18nEngine';
import { HomeScreenLayoutStyle } from './ModularSystemEngine';

interface SuperAppBentoHomeHubProps {
  sharedHeader?: React.ReactNode;
  activeMarketSection: MarketSectionType;
  onSelectCategoryAndAdvance: (
    section: MarketSectionType,
    categoryId?: string,
    subcategory?: string
  ) => void;
  currentLang: AppLanguage;
  onChangeLang: (lang: AppLanguage) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenVoiceSearch: () => void;
  onOpenCreate: () => void;
  onOpenNotifications: () => void;
  unreadNotificationsCount: number;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  verifiedOnly: boolean;
  onToggleVerifiedOnly: () => void;
  selectedLocationLabel?: string;
  onOpenLocationSelector?: () => void;
  userRole: 'customer' | 'provider' | 'admin';
  onSelectRole: (role: 'customer' | 'provider' | 'admin') => void;
  userInitials?: string;
  homeScreenStyle: HomeScreenLayoutStyle;
  onChangeHomeScreenStyle: (style: HomeScreenLayoutStyle) => void;
  externalSearchOpen?: boolean;
  onCloseExternalSearch?: () => void;
}

export const SuperAppBentoHomeHub: React.FC<SuperAppBentoHomeHubProps> = ({
  sharedHeader,
  onSelectCategoryAndAdvance,
  currentLang,
  onChangeLang,
  searchQuery,
  onSearchChange,
  onOpenVoiceSearch,
  onOpenCreate,
  onOpenNotifications,
  unreadNotificationsCount,
  darkMode,
  onToggleDarkMode,
  verifiedOnly,
  onToggleVerifiedOnly,
  selectedLocationLabel,
  onOpenLocationSelector,
  userRole,
  onSelectRole,
  userInitials = 'BS',
  homeScreenStyle,
  onChangeHomeScreenStyle,
  externalSearchOpen = false,
  onCloseExternalSearch,
}) => {
  const [showMoreCategoriesDrawer, setShowMoreCategoriesDrawer] = useState(false);
  const [showQuickMenuDrawer, setShowQuickMenuDrawer] = useState(false);
  const [activeMoreTab, setActiveMoreTab] = useState<MarketSectionType>('pg_hostels');
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [isHeroPaused, setIsHeroPaused] = useState(false);

  const heroSpotlightSlides: {
    id: string;
    shortTab: string;
    badge: string;
    title: string;
    subtitle: string;
    priceTag: string;
    priceSub: string;
    cta: string;
    image: string;
    framedPhoto: string;
    photoTag: string;
    cardGradient: string;
    badgeClass: string;
    priceBadgeClass: string;
    ctaClass: string;
    section: MarketSectionType;
    categoryId: string;
    promoChoiceTop: string;
    promoChoiceBottom: string;
    pills: {
      id: string;
      icon: string;
      iconBg: string;
      label: string;
      section: MarketSectionType;
      cat: string;
    }[];
  }[] = [
    {
      id: 'slide-pg',
      shortTab: "🏠 PG's",
      badge: "SPOTLIGHT • PG'S & CO-LIVING",
      title: "Premium PG's in Hyderabad",
      subtitle: 'Safe • Verified • AC, WiFi & Homely Food',
      priceTag: '₹6,500',
      priceSub: '/month',
      cta: "Explore PG's →",
      image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=85',
      framedPhoto: 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=500&q=85',
      photoTag: '★ Verified PG',
      cardGradient: 'from-[#2A1058]/95 via-[#431888]/88 to-[#1B103F]/75',
      badgeClass: 'from-[#FBBF24] via-[#F59E0B] to-[#FBBF24] text-slate-950',
      priceBadgeClass: 'from-[#6366F1] via-[#4F46E5] to-[#3730A3] border-indigo-300/40',
      ctaClass: 'bg-white hover:bg-indigo-50 text-[#2E1065]',
      section: 'pg_hostels',
      categoryId: 'pg-students',
      promoChoiceTop: "PG's @ ₹6,500 / mo",
      promoChoiceBottom: 'Boys, Girls & Co-Living Stays',
      pills: [
        { id: 'pg-p1', icon: '🏠', iconBg: 'bg-indigo-500 text-white', label: 'Direct PG Owner', section: 'pg_hostels', cat: 'pg-professionals' },
        { id: 'pg-p2', icon: '★', iconBg: 'bg-amber-400 text-slate-950', label: "Verified PG's", section: 'pg_hostels', cat: 'pg-coliving' },
        { id: 'pg-p3', icon: '🍽️', iconBg: 'bg-emerald-500 text-white', label: '3x Homely Food', section: 'pg_hostels', cat: 'pg-students' },
        { id: 'pg-p4', icon: '⚡', iconBg: 'bg-pink-500 text-white', label: 'AC & 5G WiFi', section: 'pg_hostels', cat: 'pg-girls' },
      ],
    },
    {
      id: 'slide-halls',
      shortTab: '🏛️ Function Halls',
      badge: 'SPOTLIGHT • FUNCTION HALLS',
      title: 'Royal Function & Marriage Halls',
      subtitle: 'AC Banquet • Convention • Wedding Lawns',
      priceTag: '₹25,000',
      priceSub: '/event',
      cta: 'Explore Halls →',
      image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=85',
      framedPhoto: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=500&q=85',
      photoTag: '★ Royal Venue',
      cardGradient: 'from-[#5B0825]/95 via-[#881337]/88 to-[#3B0619]/75',
      badgeClass: 'from-[#FDE68A] via-[#F59E0B] to-[#FDE68A] text-slate-950',
      priceBadgeClass: 'from-[#F43F5E] via-[#E11D48] to-[#BE123C] border-rose-300/40',
      ctaClass: 'bg-white hover:bg-rose-50 text-[#881337]',
      section: 'venues',
      categoryId: 'venue-marriage',
      promoChoiceTop: 'Marriage & Banquet Halls @ ₹25,000',
      promoChoiceBottom: '100 to 2000+ Guests • Valet Parking',
      pills: [
        { id: 'hl-p1', icon: '🏛️', iconBg: 'bg-rose-500 text-white', label: 'AC Kalyana Mandapam', section: 'venues', cat: 'venue-marriage' },
        { id: 'hl-p2', icon: '★', iconBg: 'bg-amber-400 text-slate-950', label: 'Verified Venues', section: 'venues', cat: 'venue-birthday' },
        { id: 'hl-p3', icon: '🎉', iconBg: 'bg-pink-500 text-white', label: 'Stage & Decor Ready', section: 'venues', cat: 'venue-corporate' },
        { id: 'hl-p4', icon: '📅', iconBg: 'bg-purple-500 text-white', label: 'Instant Date Lock', section: 'venues', cat: 'venue-marriage' },
      ],
    },
    {
      id: 'slide-classes',
      shortTab: '🎓 Classes',
      badge: 'SPOTLIGHT • CLASSES & COACHING',
      title: 'Top IT, AI & Academic Classes',
      subtitle: 'Certified Tutors • Free Demo • Placement Help',
      priceTag: '₹1,999',
      priceSub: '/course',
      cta: 'Explore Classes →',
      image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=85',
      framedPhoto: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=500&q=85',
      photoTag: '★ Free Demo',
      cardGradient: 'from-[#064E3B]/95 via-[#047857]/88 to-[#042F2E]/75',
      badgeClass: 'from-[#6EE7B7] via-[#34D399] to-[#10B981] text-slate-950',
      priceBadgeClass: 'from-[#10B981] via-[#059669] to-[#047857] border-emerald-300/40',
      ctaClass: 'bg-white hover:bg-emerald-50 text-[#064E3B]',
      section: 'classes',
      categoryId: 'class-software',
      promoChoiceTop: 'IT, AI & Academic Batches @ ₹1,999',
      promoChoiceBottom: 'Free Live Demo + Placement Track',
      pills: [
        { id: 'cl-p1', icon: '🎓', iconBg: 'bg-emerald-500 text-white', label: 'Free Demo Class', section: 'classes', cat: 'class-software' },
        { id: 'cl-p2', icon: '💻', iconBg: 'bg-teal-500 text-white', label: 'Online & Offline', section: 'classes', cat: 'class-academic' },
        { id: 'cl-p3', icon: '💼', iconBg: 'bg-amber-400 text-slate-950', label: 'Placement Support', section: 'classes', cat: 'class-software' },
        { id: 'cl-p4', icon: '🎸', iconBg: 'bg-cyan-500 text-white', label: 'Music, Dance & Arts', section: 'classes', cat: 'class-languages' },
      ],
    },
    {
      id: 'slide-stay',
      shortTab: '🏨 Lodge & Resort',
      badge: 'SPOTLIGHT • LODGE, RESORT & HOMESTAY',
      title: 'Lodges, Resorts & Homestays',
      subtitle: 'Hourly Stay • Pool Resorts • Cozy Homestays',
      priceTag: '₹799',
      priceSub: '/night',
      cta: 'Explore Stays →',
      image: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=85',
      framedPhoto: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=500&q=85',
      photoTag: '★ Pool & Villas',
      cardGradient: 'from-[#6B2708]/95 via-[#B45309]/88 to-[#431407]/75',
      badgeClass: 'from-[#FDE68A] via-[#FBBF24] to-[#F59E0B] text-slate-950',
      priceBadgeClass: 'from-[#F59E0B] via-[#D97706] to-[#B45309] border-amber-300/40',
      ctaClass: 'bg-white hover:bg-amber-50 text-[#78350F]',
      section: 'hotel_stay',
      categoryId: 'hotel-budget',
      promoChoiceTop: 'Lodges, Resorts & Homestays @ ₹799',
      promoChoiceBottom: 'Hourly & Night Stay • Instant Check-In',
      pills: [
        { id: 'st-p1', icon: '🏨', iconBg: 'bg-orange-500 text-white', label: 'AC Lodges & Suites', section: 'hotel_stay', cat: 'hotel-budget' },
        { id: 'st-p2', icon: '🌴', iconBg: 'bg-amber-400 text-slate-950', label: 'Luxury Pool Resorts', section: 'hotel_stay', cat: 'hotel-resorts' },
        { id: 'st-p3', icon: '🏡', iconBg: 'bg-emerald-500 text-white', label: 'Family Homestays', section: 'hotel_stay', cat: 'hotel-homestay' },
        { id: 'st-p4', icon: '⚡', iconBg: 'bg-sky-500 text-white', label: '3Hr/6Hr Hourly Stay', section: 'hotel_stay', cat: 'hotel-hourly' },
      ],
    },
    {
      id: 'slide-movies',
      shortTab: '🎬 Movies',
      badge: 'SPOTLIGHT • MOVIES & MULTIPLEXES',
      title: 'Blockbuster Movies, IMAX & Shows',
      subtitle: '4K Dolby Atmos • VIP Recliners • Instant QR',
      priceTag: '₹150',
      priceSub: '/ticket',
      cta: 'Book Tickets →',
      image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=85',
      framedPhoto: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=500&q=85',
      photoTag: '★ IMAX & 4K',
      cardGradient: 'from-[#4A044E]/95 via-[#86198F]/88 to-[#2E0231]/75',
      badgeClass: 'from-[#F5D0FE] via-[#F0ABFC] to-[#E879F9] text-slate-950',
      priceBadgeClass: 'from-[#D946EF] via-[#C026D3] to-[#86198F] border-fuchsia-300/40',
      ctaClass: 'bg-white hover:bg-fuchsia-50 text-[#701A75]',
      section: 'movies',
      categoryId: 'movie-multiplex',
      promoChoiceTop: 'IMAX & Multiplex Tickets @ ₹150',
      promoChoiceBottom: 'VIP Recliners & Private Mini-Theatres',
      pills: [
        { id: 'mv-p1', icon: '🎬', iconBg: 'bg-fuchsia-500 text-white', label: '4K Dolby & IMAX', section: 'movies', cat: 'movie-imax' },
        { id: 'mv-p2', icon: '🎟️', iconBg: 'bg-amber-400 text-slate-950', label: 'Instant QR Ticket', section: 'movies', cat: 'movie-multiplex' },
        { id: 'mv-p3', icon: '🍿', iconBg: 'bg-rose-500 text-white', label: 'Recliner Lounges', section: 'movies', cat: 'movie-single' },
        { id: 'mv-p4', icon: '🎂', iconBg: 'bg-purple-500 text-white', label: 'Private Screening Pod', section: 'movies', cat: 'movie-private' },
      ],
    },
    {
      id: 'slide-services',
      shortTab: '🛠️ Services',
      badge: 'SPOTLIGHT • HOME & LOCAL SERVICES',
      title: 'Verified Home & Local Services',
      subtitle: 'AC Repair • Plumbing • Cleaning • 60-Min Arrival',
      priceTag: '₹199',
      priceSub: '/visit',
      cta: 'Book Service →',
      image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=900&q=85',
      framedPhoto: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=500&q=85',
      photoTag: '★ 60-Min Pro',
      cardGradient: 'from-[#082F49]/95 via-[#0369A1]/88 to-[#0C192C]/75',
      badgeClass: 'from-[#7DD3FC] via-[#38BDF8] to-[#0EA5E9] text-slate-950',
      priceBadgeClass: 'from-[#0EA5E9] via-[#0284C7] to-[#0369A1] border-sky-300/40',
      ctaClass: 'bg-white hover:bg-sky-50 text-[#0C4A6E]',
      section: 'services',
      categoryId: 'cat-1',
      promoChoiceTop: 'Express Home Services @ ₹199',
      promoChoiceBottom: 'AC Repair, Cleaning & Salon at Home',
      pills: [
        { id: 'sv-p1', icon: '🛠️', iconBg: 'bg-sky-500 text-white', label: 'AC & Appliance Pro', section: 'services', cat: 'cat-1' },
        { id: 'sv-p2', icon: '★', iconBg: 'bg-amber-400 text-slate-950', label: 'Verified Specialists', section: 'services', cat: 'cat-2' },
        { id: 'sv-p3', icon: '⚡', iconBg: 'bg-emerald-500 text-white', label: '60-Min Doorstep', section: 'services', cat: 'cat-3' },
        { id: 'sv-p4', icon: '💇‍♀️', iconBg: 'bg-pink-500 text-white', label: 'Home Salon & Cleaning', section: 'services', cat: 'cat-4' },
      ],
    },
  ];

  // Auto-advance Spotlight & Platform Fee showcase one-by-one every 3.5 seconds
  useEffect(() => {
    if (isHeroPaused) return;
    const timer = window.setInterval(() => {
      setActiveHeroSlide((prev) => (prev + 1) % heroSpotlightSlides.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [isHeroPaused, heroSpotlightSlides.length]);

  const currentHero = heroSpotlightSlides[activeHeroSlide] || heroSpotlightSlides[0];

  const ui = getUILabels(currentLang);

  const moreSectionCategories =
    activeMoreTab === 'pg_hostels'
      ? pg29Categories
      : activeMoreTab === 'classes'
      ? classCategories
      : activeMoreTab === 'venues'
      ? venue12Categories
      : activeMoreTab === 'services'
      ? servicesCategories
      : activeMoreTab === 'hotel_stay'
      ? hotelStayCategories
      : moviesCategories;

  return (
    <div className="min-h-[calc(100dvh-56px)] w-full max-w-full overflow-visible bg-white dark:bg-[#0A0C20] text-slate-900 dark:text-white transition-colors duration-200 flex flex-col box-border select-none">
      {/* 1. CLEAN MOBILE-FITTED TOP HEADER BAR (NO DUPLICATE TOP SEARCH ICON — SEARCH IS IN BOTTOM NAV) */}
      {sharedHeader ?? (
      <header className="relative z-30 shrink-0 w-full bg-white/95 dark:bg-[#0A0C20]/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/80 px-3 sm:px-5 py-1.5 box-border">
        <div className="max-w-md sm:max-w-3xl mx-auto w-full flex items-center justify-between gap-1.5 min-w-0">
          {/* Left: BOS Brand Logo with 360° Rotating Middle 'O' & Interactive VERIFIED Pill */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <BOSBrandLogo
              compact
              verifiedLabel={ui.verifiedBadge}
              isVerifiedActive={verifiedOnly}
              onVerifiedClick={onToggleVerifiedOnly}
              onClick={() => setShowMoreCategoriesDrawer(false)}
            />
            <button
              type="button"
              onClick={() => onOpenLocationSelector?.()}
              aria-label="Select city or locality"
              className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-purple-300 bg-purple-50 px-3 py-1 text-[11.5px] font-extrabold text-[#5B21B6] shadow-sm transition hover:border-[#7C3AED] hover:bg-purple-100 dark:border-purple-500/40 dark:bg-purple-500/15 dark:text-purple-300"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{selectedLocationLabel || 'All Cities'}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>

          {/* Right: Compact Action Icons (4-Dot Grid, QR/Post, Dark Mode, Bell with Red Badge, User Initials) */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* 4-Dot All Categories Hub Trigger */}
            <button
              type="button"
              onClick={() => setShowMoreCategoriesDrawer((prev) => !prev)}
              title="All Categories & Services Hub"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#0F3CC9] dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            >
              <LayoutGrid className="w-4 h-4 fill-current" />
            </button>

            {/* QR / Post Free Action Icon */}
            <button
              type="button"
              onClick={onOpenCreate}
              title="Post Free Listing / QR Registration"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#0F3CC9] dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            >
              <QrCode className="w-4 h-4 stroke-[2.2]" />
            </button>

            {/* Dark / Light Theme Toggle */}
            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-pressed={darkMode}
              aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#0F3CC9] dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {/* Notification Bell with Red Count Pill */}
            <button
              type="button"
              onClick={onOpenNotifications}
              title="Notifications & Alerts"
              className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#0F3CC9] dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            >
              <Bell className="w-4 h-4 fill-current" />
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 rounded-full bg-red-600 text-white text-[8px] font-black flex items-center justify-center shadow-2xs">
                {unreadNotificationsCount > 0 ? unreadNotificationsCount : 8}
              </span>
            </button>

            {/* User Initials Circle Badge */}
            <button
              type="button"
              onClick={() => setShowQuickMenuDrawer((prev) => !prev)}
              title="Account, Role Portal & Home Screen Style"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#E5F1F8] dark:bg-indigo-950 text-[#0F4C81] dark:text-indigo-200 font-black text-[10px] sm:text-xs flex items-center justify-center border border-sky-200/80 dark:border-indigo-700 shadow-2xs cursor-pointer shrink-0"
            >
              {userInitials}
            </button>
          </div>
        </div>

        {/* Bottom-Nav Triggered Search Overlay Bar */}
        {externalSearchOpen && (
          <div className="max-w-md sm:max-w-3xl mx-auto pt-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#17133A] rounded-full px-3 py-1 border border-slate-200 dark:border-indigo-500/40">
              <Search className="w-3.5 h-3.5 text-[#0F3CC9] dark:text-indigo-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    onCloseExternalSearch?.();
                    onSelectCategoryAndAdvance('pg_hostels', 'all');
                  }
                }}
                placeholder="Search PGs, classes, halls, services, stay, movies..."
                className="w-full bg-transparent text-xs font-semibold text-slate-900 dark:text-white outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onOpenVoiceSearch}
                className="w-6 h-6 rounded-full bg-[#0F3CC9] text-white flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Mic className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onCloseExternalSearch?.();
                  onSelectCategoryAndAdvance('pg_hostels', 'all');
                }}
                className="px-2.5 py-0.5 rounded-full bg-[#0F3CC9] text-white text-[10px] font-black shrink-0 cursor-pointer"
              >
                Go
              </button>
              <button
                type="button"
                onClick={() => onCloseExternalSearch?.()}
                className="p-0.5 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                title="Close Search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Quick Account, Role & Admin Home Screen Style Drawer */}
        {showQuickMenuDrawer && (
          <div className="absolute right-3 top-11 z-50 w-[calc(100vw-24px)] max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-3 space-y-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
              <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                Quick Controls &amp; Admin Home Style
              </span>
              <button
                type="button"
                onClick={() => setShowQuickMenuDrawer(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Admin Home Screen Style Selector */}
            <div className="p-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/70 space-y-1.5">
              <div className="flex items-center gap-1.5 font-black text-indigo-950 dark:text-indigo-200 text-[10.5px]">
                <Sliders className="w-3 h-3 text-indigo-600" />
                <span>Admin Home Screen Layout Style:</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeHomeScreenStyle('bento_landing_hub')}
                  className={`py-1.5 px-2 rounded-xl font-black text-[10.5px] border text-center cursor-pointer transition ${
                    homeScreenStyle === 'bento_landing_hub'
                      ? 'bg-[#0F3CC9] text-white border-[#0F3CC9] shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  📱 MyJio Super-App Hub
                </button>
                <button
                  type="button"
                  onClick={() => onChangeHomeScreenStyle('classic_marketplace')}
                  className={`py-1.5 px-2 rounded-xl font-black text-[10.5px] border text-center cursor-pointer transition ${
                    homeScreenStyle === 'classic_marketplace'
                      ? 'bg-[#0F3CC9] text-white border-[#0F3CC9] shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  🏪 Classic Marketplace
                </button>
              </div>
            </div>

            {/* Portal Role Switcher */}
            <div>
              <div className="text-[9.5px] font-black uppercase text-slate-400 mb-1">
                Switch Portal Mode
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'customer', label: 'Customer', icon: Users },
                  { id: 'provider', label: 'Provider', icon: Briefcase },
                  { id: 'admin', label: 'Admin', icon: ShieldCheck },
                ].map((r) => {
                  const RIcon = r.icon;
                  const active = userRole === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        onSelectRole(r.id as 'customer' | 'provider' | 'admin');
                        setShowQuickMenuDrawer(false);
                      }}
                      className={`p-1.5 rounded-xl border text-[10.5px] font-black flex flex-col items-center gap-0.5 cursor-pointer ${
                        active
                          ? 'bg-[#0F3CC9] text-white border-[#0F3CC9]'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <RIcon className="w-3.5 h-3.5" />
                      <span>{r.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language + Post Free */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <select
                value={currentLang}
                onChange={(e) => onChangeLang(e.target.value as AppLanguage)}
                className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-black text-xs outline-hidden cursor-pointer"
              >
                {allIndianLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setShowQuickMenuDrawer(false);
                  onOpenCreate();
                }}
                className="px-3 py-1.5 rounded-xl bg-[#0F3CC9] text-white font-black text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-amber-300" />
                <span>Post Free</span>
              </button>
            </div>
          </div>
        )}
      </header>
      )}

      {/* MAIN MOBILE-LOCKED SUPER-APP BODY (FITS 100% WITHIN VIEWPORT WITH ZERO VERTICAL OR HORIZONTAL SCROLL) */}
      <div className="max-w-md sm:max-w-3xl mx-auto w-full flex-1 min-h-0 px-3 sm:px-5 py-1.5 sm:py-2.5 flex flex-col justify-between gap-1.5 sm:gap-2.5 overflow-visible box-border">
        {/* 2. TOP SPOTLIGHT HERO CARD — REMOVED (banner animation disabled per product request) */}
        {false && (
        <div
          onMouseEnter={() => setIsHeroPaused(true)}
          onMouseLeave={() => setIsHeroPaused(false)}
          onTouchStart={() => setIsHeroPaused(true)}
          onTouchEnd={() => setIsHeroPaused(false)}
          onClick={() => onSelectCategoryAndAdvance(currentHero.section, currentHero.categoryId)}
          className="shrink-0 group relative w-full overflow-hidden rounded-[20px] bg-slate-900 text-white border border-white/20 dark:border-indigo-500/40 px-3 py-2 sm:p-3.5 shadow-sm cursor-pointer transition-all duration-500 hover:shadow-md box-border"
        >
          {/* Ambient Category Background Photo + Distinct Multi-Color Gradient Overlay */}
          <SafeImage category="general"
            key={`bg-${currentHero.id}`}
            src={currentHero.image}
            alt={currentHero.title}
            className="pointer-events-none absolute inset-0 w-full h-full object-cover object-center transition-all duration-700 scale-105"
          />
          <div
            className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${currentHero.cardGradient} transition-colors duration-500`}
          />

          {/* Top-Right Prev / Slide Counter / Next Controls */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-2.5 z-20 flex items-center gap-1"
          >
            <button
              type="button"
              onClick={() =>
                setActiveHeroSlide(
                  (prev) => (prev - 1 + heroSpotlightSlides.length) % heroSpotlightSlides.length
                )
              }
              aria-label="Previous Spotlight"
              className="w-4.5 h-4.5 rounded-full bg-black/55 hover:bg-black/80 border border-white/25 text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="px-1.5 py-0.5 rounded-full bg-black/55 backdrop-blur-xs border border-white/20 text-[8.5px] font-black text-white">
              {activeHeroSlide + 1}/{heroSpotlightSlides.length}
            </span>
            <button
              type="button"
              onClick={() =>
                setActiveHeroSlide((prev) => (prev + 1) % heroSpotlightSlides.length)
              }
              aria-label="Next Spotlight"
              className="w-4.5 h-4.5 rounded-full bg-black/55 hover:bg-black/80 border border-white/25 text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div
            key={currentHero.id}
            className="relative z-10 flex items-center justify-between gap-2.5 animate-bos-spotlight-next"
          >
            {/* Left Content Column */}
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              {/* Row A: Distinct Color Spotlight Badge */}
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span
                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r ${currentHero.badgeClass} text-[8px] sm:text-[9.5px] font-black uppercase tracking-wider shadow-2xs`}
                >
                  <span>★</span>
                  <span>{currentHero.badge}</span>
                </span>
              </div>

              {/* Row B: Headline & Subtitle */}
              <div className="min-w-0">
                <h2 className="text-[13px] sm:text-lg font-black text-white leading-tight tracking-tight truncate">
                  {currentHero.title}
                </h2>
                <p className="text-[9.5px] sm:text-xs font-semibold text-white/90 truncate">
                  {currentHero.subtitle}
                </p>
              </div>

              {/* Row C: Category Highlight Pills */}
              <div className="w-full overflow-hidden py-0.5">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {currentHero.pills.map((badge) => (
                    <button
                      key={badge.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCategoryAndAdvance(badge.section, badge.cat);
                      }}
                      className="shrink-0 inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full bg-black/45 hover:bg-black/75 backdrop-blur-xs border border-white/25 text-[8.5px] sm:text-[10px] font-extrabold text-white transition cursor-pointer"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-full ${badge.iconBg} flex items-center justify-center text-[8px] font-black shrink-0 shadow-2xs`}
                      >
                        {badge.icon}
                      </span>
                      <span className="whitespace-nowrap">{badge.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Row D: CTA Button + 6 Category Indicator Dots */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCategoryAndAdvance(currentHero.section, currentHero.categoryId);
                  }}
                  className={`px-3 py-0.5 sm:px-3.5 sm:py-1 rounded-full ${currentHero.ctaClass} font-black text-[9.5px] sm:text-xs shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1 shrink-0`}
                >
                  <span>{currentHero.cta}</span>
                </button>

                <div className="flex items-center gap-1">
                  {heroSpotlightSlides.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      title={s.shortTab}
                      aria-label={`Slide ${idx + 1}: ${s.shortTab}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveHeroSlide(idx);
                      }}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === activeHeroSlide
                          ? 'w-4 bg-amber-300 shadow-2xs'
                          : 'w-1.5 bg-white/45 hover:bg-white/75'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Right Framed Colorful Showcase Image + Price Pill + BOS Emblem */}
            <div className="relative shrink-0 w-28 h-21 sm:w-40 sm:h-26 rounded-2xl overflow-hidden border-2 border-white/80 shadow-lg bg-slate-950 mt-3 sm:mt-2">
              <SafeImage category="general"
                src={currentHero.framedPhoto}
                alt={currentHero.shortTab}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />

              {/* Bottom-Left Starting Price Pill */}
              <span
                className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-lg bg-gradient-to-r ${currentHero.priceBadgeClass} border text-white text-[8px] sm:text-[9.5px] font-black leading-none shadow-sm`}
              >
                {currentHero.priceTag}
                <span className="text-[7px] font-bold opacity-90">{currentHero.priceSub}</span>
              </span>

              {/* Bottom-Right White BOS Seal */}
              <span className="absolute bottom-1 right-1 w-5.5 h-5.5 sm:w-6.5 sm:h-6.5 rounded-xl bg-white text-slate-950 font-black text-[7px] sm:text-[8px] flex items-center justify-center shadow-md border border-slate-200">
                BOS
              </span>
            </div>
          </div>
        </div>
        )}

        {/* 3. ROUNDED SOFT-LAVENDER SUPER-APP BENTO CONTAINER (2 WIDE + 8 SQUARE CARDS, FLEX-SCALED FOR ZERO SCROLL) */}
        <div className="flex-1 min-h-0 w-full rounded-[22px] bg-[#EAEEF8] dark:bg-[#131836] px-2.5 py-1.5 sm:p-3.5 shadow-2xs border border-indigo-100/80 dark:border-indigo-900/50 flex flex-col justify-between overflow-hidden box-border">
          {/* Top Center Pill Handle Indicator */}
          <div className="w-10 h-1 rounded-full bg-[#CBD2E1] dark:bg-slate-700 mx-auto mb-1 shrink-0" />

          {/* Top Row: 2 Wide Featured Bento Cards */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-1.5 sm:mb-2.5 shrink-0">
            {/* Wide Card 1: PG's & Hostels */}
            <button
              type="button"
              onClick={() => onSelectCategoryAndAdvance('pg_hostels', 'pg-students')}
              className="group bg-white dark:bg-[#1C2247] hover:bg-indigo-50/50 dark:hover:bg-[#232A56] rounded-2xl p-2 sm:p-3 flex items-center justify-between gap-1.5 text-left shadow-[0_2px_8px_rgba(15,23,42,0.04)] border border-white dark:border-indigo-500/20 transition-all active:scale-98 cursor-pointer min-w-0 overflow-hidden"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-base font-black text-slate-950 dark:text-white leading-tight truncate">
                  PG&apos;s
                </div>
                <div className="text-[9px] sm:text-xs font-semibold text-slate-500 dark:text-slate-300 mt-0.5 truncate">
                  Hostels &amp; Co-Living
                </div>
              </div>
              <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-indigo-950 dark:to-purple-900/60 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <span className="text-lg sm:text-2xl leading-none">🏠</span>
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#0F3CC9] text-white text-[7px] font-black flex items-center justify-center">
                  ✓
                </span>
              </div>
            </button>

            {/* Wide Card 2: Classes & Courses */}
            <button
              type="button"
              onClick={() => onSelectCategoryAndAdvance('classes', 'class-software')}
              className="group bg-white dark:bg-[#1C2247] hover:bg-indigo-50/50 dark:hover:bg-[#232A56] rounded-2xl p-2 sm:p-3 flex items-center justify-between gap-1.5 text-left shadow-[0_2px_8px_rgba(15,23,42,0.04)] border border-white dark:border-indigo-500/20 transition-all active:scale-98 cursor-pointer min-w-0 overflow-hidden"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-base font-black text-slate-950 dark:text-white leading-tight truncate">
                  Classes
                </div>
                <div className="text-[9px] sm:text-xs font-semibold text-slate-500 dark:text-slate-300 mt-0.5 truncate">
                  IT, Academic &amp; AI
                </div>
              </div>
              <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-red-50 to-amber-100 dark:from-rose-950 dark:to-amber-900/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <span className="text-lg sm:text-2xl leading-none">🎓</span>
                <span className="absolute -top-1 -right-1 px-1 rounded bg-red-600 text-white text-[6px] font-black uppercase">
                  LIVE
                </span>
              </div>
            </button>
          </div>

          {/* Rows 2 & 3: 4x2 Square Icon Cards Grid */}
          <div className="grid grid-cols-4 grid-rows-2 gap-1.5 sm:gap-2.5 flex-1 min-h-0">
            {[
              {
                id: 'bento-halls',
                label: 'Halls',
                emoji: '🏛️',
                badge: '',
                bgTone: 'from-amber-50 to-orange-100/80 dark:from-amber-950/60 dark:to-orange-900/40',
                onClick: () => onSelectCategoryAndAdvance('venues', 'venue-marriage'),
              },
              {
                id: 'bento-services',
                label: 'Services',
                emoji: '🛠️',
                badge: 'LIVE',
                bgTone: 'from-emerald-50 to-teal-100/80 dark:from-emerald-950/60 dark:to-teal-900/40',
                onClick: () => onSelectCategoryAndAdvance('services', 'srv-electrician'),
              },
              {
                id: 'bento-stay',
                label: 'Stay',
                emoji: '🏨',
                badge: '',
                bgTone: 'from-rose-50 to-pink-100/80 dark:from-rose-950/60 dark:to-pink-900/40',
                onClick: () => onSelectCategoryAndAdvance('hotel_stay', 'hotel-luxury'),
              },
              {
                id: 'bento-movies',
                label: 'Movies',
                emoji: '🎬',
                badge: 'NEW',
                bgTone: 'from-purple-50 to-indigo-100/80 dark:from-purple-950/60 dark:to-indigo-900/40',
                onClick: () => onSelectCategoryAndAdvance('movies', 'movie-tollywood'),
              },
              {
                id: 'bento-student-pg',
                label: 'Student PG',
                emoji: '🎒',
                badge: '',
                bgTone: 'from-sky-50 to-blue-100/80 dark:from-sky-950/60 dark:to-blue-900/40',
                onClick: () => onSelectCategoryAndAdvance('pg_hostels', 'pg-students'),
              },
              {
                id: 'bento-coding-ai',
                label: 'IT & AI',
                emoji: '💻',
                badge: 'HOT',
                bgTone: 'from-indigo-50 to-blue-100/80 dark:from-indigo-950/60 dark:to-blue-900/40',
                onClick: () => onSelectCategoryAndAdvance('classes', 'class-software'),
              },
              {
                id: 'bento-coliving',
                label: 'Co-Living',
                emoji: '🛋️',
                badge: '',
                bgTone: 'from-fuchsia-50 to-pink-100/80 dark:from-fuchsia-950/60 dark:to-pink-900/40',
                onClick: () => onSelectCategoryAndAdvance('pg_hostels', 'pg-coliving'),
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="group bg-white dark:bg-[#1C2247] hover:bg-indigo-50/50 dark:hover:bg-[#232A56] rounded-xl sm:rounded-2xl py-1 px-1 sm:p-2.5 flex flex-col items-center justify-center gap-0.5 sm:gap-1 shadow-[0_2px_8px_rgba(15,23,42,0.04)] border border-white dark:border-indigo-500/20 transition-all active:scale-95 cursor-pointer min-w-0 overflow-hidden"
              >
                <div
                  className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${item.bgTone} flex items-center justify-center group-hover:scale-105 transition-transform shrink-0`}
                >
                  <span className="text-base sm:text-xl leading-none">{item.emoji}</span>
                  {item.badge && (
                    <span className="absolute -top-1 -right-1 px-1 py-0.1 rounded bg-red-600 text-white text-[5.5px] font-black uppercase tracking-wider shadow-2xs">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[9.5px] sm:text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-tight text-center whitespace-nowrap truncate w-full">
                  {item.label}
                </span>
              </button>
            ))}

            {/* 8th Card: "More" with Blue 4-Square + Icon */}
            <button
              type="button"
              onClick={() => setShowMoreCategoriesDrawer(true)}
              className="group bg-white dark:bg-[#1C2247] hover:bg-indigo-50/50 dark:hover:bg-[#232A56] rounded-xl sm:rounded-2xl py-1 px-1 sm:p-2.5 flex flex-col items-center justify-center gap-0.5 sm:gap-1 shadow-[0_2px_8px_rgba(15,23,42,0.04)] border border-white dark:border-indigo-500/20 transition-all active:scale-95 cursor-pointer min-w-0 overflow-hidden"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-50/80 dark:bg-indigo-950/80 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                <div className="grid grid-cols-2 gap-1 text-[#2563EB] dark:text-blue-400">
                  <span className="w-2 h-2 rounded-[2.5px] border-2 border-current" />
                  <span className="w-2 h-2 rounded-[2.5px] border-2 border-current" />
                  <span className="w-2 h-2 rounded-[2.5px] border-2 border-current" />
                  <Plus className="w-2.5 h-2.5 stroke-[3] -m-0.25" />
                </div>
              </div>
              <span className="text-[9.5px] sm:text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-tight text-center whitespace-nowrap w-full">
                More
              </span>
            </button>
          </div>
        </div>

        {/* 4. BOTTOM PROMOTIONAL CARDS STRIP (DYNAMIC ONE-BY-ONE CATEGORY UPDATE) */}
        <div className="shrink-0 grid grid-cols-12 gap-2 sm:gap-3 w-full overflow-hidden">
          {/* Left Wide VIP Verified Offer Card (8 cols) */}
          <div
            onClick={() => onSelectCategoryAndAdvance(currentHero.section, currentHero.categoryId)}
            className="col-span-8 min-w-0 relative overflow-hidden rounded-[20px] bg-gradient-to-br from-[#2B0407] via-[#4E0910] to-[#1A0204] text-white px-2.5 pt-1.5 pb-0 sm:p-3.5 shadow-2xs border border-amber-500/30 cursor-pointer group flex flex-col justify-between box-border"
          >
            <div className="relative z-10 flex flex-col items-center text-center w-full min-w-0">
              <span className="text-[7px] sm:text-[9px] font-black uppercase tracking-[0.12em] text-amber-200/95 truncate max-w-full">
                LIMITED PERIOD OFFER • {currentHero.shortTab.toUpperCase()}
              </span>
              <h3 className="text-[11px] sm:text-lg font-black tracking-tight bg-gradient-to-r from-[#FDE68A] via-[#F59E0B] to-[#FDE68A] bg-clip-text text-transparent leading-tight whitespace-nowrap max-w-full truncate">
                VIP VERIFIED SPACES
              </h3>
              <p className="text-[8px] sm:text-xs font-semibold text-white/90 truncate max-w-full">
                of your choice in Hyderabad
              </p>

              {/* Phone Mockup Frame with 2 Dynamic Gold Choice Pills */}
              <div
                key={`promo-${currentHero.id}`}
                className="mt-1 w-full max-w-[195px] rounded-t-xl bg-black/65 border-t-2 border-x-2 border-amber-500/50 px-1.5 pt-1 pb-1 space-y-0.5 shadow-inner animate-bos-spotlight-next"
              >
                <div className="py-0.5 px-2 rounded-full bg-gradient-to-r from-[#B45309] via-[#D97706] to-[#B45309] text-white font-black text-[7.5px] sm:text-[10px] tracking-wide truncate">
                  {currentHero.promoChoiceTop}
                </div>
                <div className="text-[6px] font-black uppercase text-amber-300 leading-none">OR</div>
                <div className="py-0.5 px-2 rounded-full bg-gradient-to-r from-[#92400E] via-[#B45309] to-[#78350F] text-amber-100 font-black text-[7.5px] sm:text-[10px] tracking-wide truncate">
                  {currentHero.promoChoiceBottom}
                </div>
              </div>
            </div>
          </div>

          {/* Right Vertical Promo Card (4 cols) */}
          <div
            onClick={() => onSelectCategoryAndAdvance(currentHero.section, currentHero.categoryId)}
            className="col-span-4 min-w-0 relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[#FDE68A]/55 via-[#FEF3C7] to-[#FDE68A]/80 dark:from-[#292012] dark:via-[#362813] dark:to-[#1F170B] border border-amber-300/70 dark:border-amber-700/40 p-1.5 sm:p-3 flex flex-col items-center justify-between text-center shadow-2xs cursor-pointer group box-border"
          >
            <div className="text-[7.5px] sm:text-[10px] font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider truncate max-w-full">
              DIRECT UPI
            </div>

            <div className="w-7.5 h-7.5 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform my-0.5 shrink-0">
              <span className="w-4.5 h-4.5 sm:w-6 sm:h-6 rounded-full bg-white text-orange-600 font-black text-[10px] sm:text-sm flex items-center justify-center">
                ₹
              </span>
            </div>

            <div className="min-w-0 w-full space-y-0.5 overflow-hidden">
              <div className="text-[8.5px] sm:text-xs font-black text-slate-900 dark:text-white leading-tight truncate">
                {currentHero.priceTag}
              </div>
              <div className="text-[7px] sm:text-[9.5px] font-bold text-slate-600 dark:text-amber-200/80 truncate">
                100% Direct
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ALL CATEGORIES & SUBCATEGORIES SHEET (OPENS WHEN USER CLICKS "MORE" OR 4-DOT GRID ICON) */}
      {showMoreCategoriesDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white dark:bg-[#11152E] w-full max-w-3xl rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
            <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0F3CC9] dark:text-amber-400" />
                <h3 className="text-xs sm:text-base font-black text-slate-900 dark:text-white">
                  All Categories — Tap Any Category to Open Rail &amp; Stream Explorer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreCategoriesDrawer(false)}
                className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 6 Section Tabs inside Modal */}
            <div className="px-4 pt-2.5 pb-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {[
                { id: 'pg_hostels' as MarketSectionType, label: "PG's & Hostels", emoji: '🏠' },
                { id: 'classes' as MarketSectionType, label: 'Classes', emoji: '🎓' },
                { id: 'venues' as MarketSectionType, label: 'Halls & Venues', emoji: '🏛️' },
                { id: 'services' as MarketSectionType, label: 'Services', emoji: '🛠️' },
                { id: 'hotel_stay' as MarketSectionType, label: 'Stay & Hotels', emoji: '🏨' },
                { id: 'movies' as MarketSectionType, label: 'Movies', emoji: '🎬' },
              ].map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveMoreTab(sec.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap flex items-center gap-1.5 border transition cursor-pointer ${
                    activeMoreTab === sec.id
                      ? 'bg-[#0F3CC9] text-white border-[#0F3CC9] shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span>{sec.emoji}</span>
                  <span>{sec.label}</span>
                </button>
              ))}
            </div>

            {/* Category Cards Grid */}
            <div className="p-3.5 sm:p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowMoreCategoriesDrawer(false);
                  onSelectCategoryAndAdvance(activeMoreTab, 'all');
                }}
                className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-left flex items-center justify-between gap-2 cursor-pointer hover:bg-indigo-100"
              >
                <div>
                  <div className="text-xs font-black text-indigo-950 dark:text-white">
                    Explore All in Rail View
                  </div>
                  <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                    Category Rail &amp; Stream Explorer
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-indigo-600 shrink-0" />
              </button>

              {moreSectionCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setShowMoreCategoriesDrawer(false);
                    onSelectCategoryAndAdvance(activeMoreTab, cat.id);
                  }}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-left flex items-center gap-2.5 transition cursor-pointer"
                >
                  <span className="text-xl shrink-0">{cat.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {cat.name}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {cat.subcategories?.length || 4} streams
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
