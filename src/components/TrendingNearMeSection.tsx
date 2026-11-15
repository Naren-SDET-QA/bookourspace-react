import React, { useRef } from 'react';
import SafeImage from './SafeImage';
import { 
  Flame, 
  Star, 
  MapPin, 
  Phone, 
  ShieldCheck, 
  ChevronLeft, 
  ChevronRight, 
  Calendar
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import {
  AppLanguage,
  translations,
  getSubcategoryDisplayName,
  getListingTitle,
  getProviderDisplayName,
  getPriceUnitDisplayName
} from '../utils/translations';
import { getUILabels, localizeAreaName } from '../utils/i18nEngine';
import { venue12Categories } from '../data/venueData';

interface TrendingNearMeSectionProps {
  listings: MarketplaceListing[];
  currentLang: AppLanguage;
  onSelectListing: (listing: MarketplaceListing) => void;
  onBookListing: (listing: MarketplaceListing) => void;
  onRateListing?: (listing: MarketplaceListing) => void;
}

export const TrendingNearMeSection: React.FC<TrendingNearMeSectionProps> = ({
  listings,
  currentLang,
  onSelectListing,
  onBookListing,
  onRateListing,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const t = translations[currentLang] || translations.te;
  const ui = getUILabels(currentLang);

  const trendingListings = React.useMemo(() => {
    const within5km = listings.filter((item) => {
      if (item.status !== 'active') return false;
      const dist = item.distanceKm ?? item.location?.distanceKm ?? 99;
      return dist <= 5;
    });

    let candidates = within5km;
    if (candidates.length < 4) {
      candidates = listings.filter((item) => {
        if (item.status !== 'active') return false;
        const dist = item.distanceKm ?? item.location?.distanceKm ?? 99;
        return dist <= 7.5;
      });
    }

    return candidates.sort((a, b) => {
      if (b.providerRating !== a.providerRating) {
        return b.providerRating - a.providerRating;
      }
      return b.reviewCount - a.reviewCount;
    }).slice(0, 10);
  }, [listings]);

  if (trendingListings.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -320 : 320;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section className="bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 dark:from-amber-950/20 dark:via-purple-950/20 dark:to-indigo-950/20 p-4 sm:p-5 rounded-3xl border border-amber-300/40 dark:border-amber-700/30 shadow-xs space-y-3">
      
      {/* Section Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 flex items-center justify-center shadow-md shrink-0">
            <Flame className="w-5 h-5 fill-current animate-pulse text-amber-950" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{ui.spotlight} • {t.within5km}</span>
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {ui.topRatedChoice}
            </p>
          </div>
        </div>

        {/* Scroll Arrows */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-2xs active:scale-90 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-2xs active:scale-90 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontally Scrollable Cards Container */}
      <div 
        ref={scrollContainerRef}
        className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-2 pt-1 scroll-smooth"
      >
        {trendingListings.map((item) => {
          const dist = item.distanceKm ?? item.location?.distanceKm ?? 1.5;
          const subcatDisplay = getSubcategoryDisplayName(item.subcategory, currentLang);
          const venueCat = venue12Categories.find(c => c.id === item.categoryId);
          const displayTitle = getListingTitle(item, currentLang);
          const rawProv = currentLang === 'te' ? (item.providerNameTe || item.providerName) : item.providerName;
          const displayProvider = getProviderDisplayName(rawProv, currentLang, dist);
          const rawUnit = currentLang === 'te' ? (item.priceUnitTe || item.priceUnit) : item.priceUnit;
          const displayUnit = getPriceUnitDisplayName(rawUnit, currentLang);
          const localizedArea = localizeAreaName(item.location.area, currentLang);

          return (
            <div
              key={item.id}
              onClick={() => onSelectListing(item)}
              className="w-[270px] sm:w-[290px] shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between overflow-hidden group"
            >
              {/* Card Image Banner */}
              <div className="relative h-32 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <SafeImage category="general"
                  src={item.images[0] || 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=600&q=80'}
                  alt={displayTitle}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />

                {/* Distance Badge with Live Ping */}
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur-md text-white text-[10px] font-black flex items-center gap-1 shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <MapPin className="w-2.5 h-2.5 text-amber-400" />
                  <span>{dist.toFixed(1)} {ui.km}</span>
                </div>

                {/* Trending Rank Pill */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onRateListing) {
                      onRateListing(item);
                    } else {
                      onSelectListing(item);
                    }
                  }}
                  className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-black flex items-center gap-1 shadow-md transition-transform hover:scale-105 active:scale-95 cursor-pointer z-10"
                >
                  <Star className="w-3 h-3 fill-current text-slate-950" />
                  <span>{item.providerRating.toFixed(1)}</span>
                </button>

                {/* Verified Pro Pill */}
                {item.isVerified && (
                  <div className="absolute bottom-2 left-2.5 px-2 py-0.5 rounded-full bg-emerald-600/90 text-white text-[9px] font-bold flex items-center gap-1 backdrop-blur-xs">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    <span>{ui.verifiedBadge}</span>
                  </div>
                )}
              </div>

              {/* Card Details */}
              <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center gap-1 text-[10px] text-purple-700 dark:text-purple-300 font-bold uppercase tracking-wider">
                    <span>{venueCat?.emoji || '🏛️'}</span>
                    <span className="truncate">{subcatDisplay}</span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-slate-400 font-medium truncate">{localizedArea}</span>
                  </div>

                  <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white line-clamp-1 mt-0.5 group-hover:text-[#4A148C] dark:group-hover:text-amber-400 transition-colors">
                    {displayTitle}
                  </h4>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                    <span className="font-medium truncate max-w-[140px]">
                      {displayProvider}
                    </span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold shrink-0">
                      {item.reviewCount} {t.reviews}
                    </span>
                  </div>
                </div>

                {/* Price & 1-Tap Action Buttons */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block leading-none">{t.price}</span>
                    <span className="font-black text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {item.currency}{item.price.toLocaleString('en-IN')} <span className="text-[10px] font-medium text-slate-400">{displayUnit}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`tel:${item.providerPhone}`}
                      className="p-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-[#4A148C] dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition shadow-2xs"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>

                    <button
                      type="button"
                      onClick={() => onBookListing(item)}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#4A148C] to-purple-700 hover:from-purple-900 hover:to-purple-800 text-white font-black text-[11px] flex items-center gap-1 shadow-xs active:scale-95 transition"
                    >
                      <Calendar className="w-3 h-3 text-amber-300" />
                      <span>{t.bookNow}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
