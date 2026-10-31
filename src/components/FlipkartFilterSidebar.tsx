import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Star, 
  ShieldCheck, 
  RotateCcw, 
  Check, 
  Filter, 
  MapPin, 
  Clock, 
  Sparkles,
  Home,
  GraduationCap,
  Building2,
  Utensils,
  Wind,
  Users
} from 'lucide-react';
import { AppLanguage, translations } from '../utils/translations';
import { pg29Categories } from '../data/pgHostelData';
import { classCategories } from '../data/classesData';
import { venue12Categories } from '../data/venueData';
import { popularAreasList } from '../data/comprehensiveListings';

interface FlipkartFilterSidebarProps {
  currentLang?: AppLanguage;
  activeMarketSection: 'pg_hostels' | 'classes' | 'venues';
  onSelectMarketSection: (sec: 'pg_hostels' | 'classes' | 'venues') => void;
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
  selectedSubcategory: string;
  onSelectSubcategory: (subcat: string) => void;
  selectedArea: string;
  onSelectArea: (area: string) => void;
  selectedRadius: number | 'all';
  onSelectRadius: (radius: number | 'all') => void;
  selectedPriceRange: 'all' | 'under500' | '500to1000' | 'above1000';
  onSelectPriceRange: (range: 'all' | 'under500' | '500to1000' | 'above1000') => void;
  selectedRating: number | 'all';
  onSelectRating: (rating: number | 'all') => void;
  verifiedOnly: boolean;
  onToggleVerifiedOnly: (val: boolean) => void;
  // PG Filters
  selectedPGGender: string;
  onSelectPGGender: (gender: string) => void;
  selectedPGSharing: string;
  onSelectPGSharing: (sharing: string) => void;
  selectedPGAC: string;
  onSelectPGAC: (ac: string) => void;
  selectedPGFood: string;
  onSelectPGFood: (food: string) => void;
  // Class Filters
  selectedDeliveryMode: string;
  onSelectDeliveryMode: (mode: string) => void;
  selectedTimingSlot: string;
  onSelectTimingSlot: (slot: string) => void;
  freeTrialOnly: boolean;
  onToggleFreeTrialOnly: (val: boolean) => void;
  onResetFilters: () => void;
}

export const FlipkartFilterSidebar: React.FC<FlipkartFilterSidebarProps> = ({
  currentLang = 'te',
  activeMarketSection,
  onSelectMarketSection,
  selectedCategory,
  onSelectCategory,
  selectedSubcategory,
  onSelectSubcategory,
  selectedArea,
  onSelectArea,
  selectedRadius,
  onSelectRadius,
  selectedPriceRange,
  onSelectPriceRange,
  selectedRating,
  onSelectRating,
  verifiedOnly,
  onToggleVerifiedOnly,
  selectedPGGender,
  onSelectPGGender,
  selectedPGSharing,
  onSelectPGSharing,
  selectedPGAC,
  onSelectPGAC,
  selectedPGFood,
  onSelectPGFood,
  selectedDeliveryMode,
  onSelectDeliveryMode,
  selectedTimingSlot,
  onSelectTimingSlot,
  freeTrialOnly,
  onToggleFreeTrialOnly,
  onResetFilters,
}) => {
  const t = translations[currentLang] || translations.te;

  // Accordion sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    section: true,
    assured: true,
    price: true,
    rating: true,
    distance: true,
    locality: true,
    pgFilters: true,
    classFilters: true,
  });

  const toggleSection = (sec: string) => {
    setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  const isPG = activeMarketSection === 'pg_hostels';
  const isClasses = activeMarketSection === 'classes';

  return (
    <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xs shadow-xs text-slate-800 dark:text-slate-200">
      
      {/* 1. Header: "Filters" + "CLEAR ALL" in Flipkart Blue */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#2874F0]" />
          <span className="font-black text-sm uppercase tracking-wide text-slate-900 dark:text-white">
            {currentLang === 'te' ? 'ఫిల్టర్లు' : 'Filters'}
          </span>
        </div>
        <button
          onClick={onResetFilters}
          className="text-xs font-black text-[#2874F0] hover:underline uppercase tracking-wide transition-colors cursor-pointer"
        >
          {currentLang === 'te' ? 'అన్నీ క్లియర్' : 'CLEAR ALL'}
        </button>
      </div>

      {/* 2. SpaceAssured / F-Assured Section (Flipkart Signature) */}
      <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
        <label className="flex items-center justify-between cursor-pointer select-none">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => onToggleVerifiedOnly(e.target.checked)}
              className="w-4 h-4 rounded-xs text-[#2874F0] focus:ring-[#2874F0] border-slate-300 dark:border-slate-700 cursor-pointer"
            />
            <div className="flex items-center gap-1 bg-[#2874F0] text-white px-2 py-0.5 rounded-xs font-black text-[11px] italic shadow-2xs">
              <span>Space</span>
              <span className="text-[#FFE500]">Assured</span>
              <Check className="w-3 h-3 text-[#FFE500] stroke-[3]" />
            </div>
          </div>
          <span className="text-[10px] text-slate-500 font-semibold">100% Verified</span>
        </label>
      </div>

      {/* 3. Section Switcher (PGs & Hostels vs Classes vs Venues) */}
      <div className="border-b border-slate-100 dark:border-slate-800">
        <div 
          onClick={() => toggleSection('section')}
          className="p-3 flex items-center justify-between font-bold text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <span className="uppercase text-[11px] font-black tracking-wider text-slate-500">
            {currentLang === 'te' ? 'ప్రధాన విభాగం' : 'CATEGORIES'}
          </span>
          {openSections.section ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>

        {openSections.section && (
          <div className="p-3 pt-0 space-y-1 text-xs">
            <button
              onClick={() => onSelectMarketSection('pg_hostels')}
              className={`w-full text-left px-2.5 py-1.5 rounded-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                activeMarketSection === 'pg_hostels'
                  ? 'bg-blue-50 text-[#2874F0] font-black'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <Home className="w-3.5 h-3.5 text-[#2874F0]" />
                <span>🏠 {currentLang === 'te' ? 'పీజీలు & హాస్టల్స్ (29)' : 'PGs & Hostels (29)'}</span>
              </span>
              {activeMarketSection === 'pg_hostels' && <Check className="w-3.5 h-3.5 text-[#2874F0]" />}
            </button>

            <button
              onClick={() => onSelectMarketSection('classes')}
              className={`w-full text-left px-2.5 py-1.5 rounded-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                activeMarketSection === 'classes'
                  ? 'bg-blue-50 text-[#2874F0] font-black'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <GraduationCap className="w-3.5 h-3.5 text-[#2874F0]" />
                <span>🎓 {currentLang === 'te' ? 'క్లాసెస్ & కోర్సులు (15)' : 'Classes & Courses (15)'}</span>
              </span>
              {activeMarketSection === 'classes' && <Check className="w-3.5 h-3.5 text-[#2874F0]" />}
            </button>

            <button
              onClick={() => onSelectMarketSection('venues')}
              className={`w-full text-left px-2.5 py-1.5 rounded-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                activeMarketSection === 'venues'
                  ? 'bg-blue-50 text-[#2874F0] font-black'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-[#2874F0]" />
                <span>🏛️ {currentLang === 'te' ? 'ఫంక్షన్ హాళ్ళు & వేదికలు (12)' : 'Venues & Halls (12)'}</span>
              </span>
              {activeMarketSection === 'venues' && <Check className="w-3.5 h-3.5 text-[#2874F0]" />}
            </button>
          </div>
        )}
      </div>

      {/* 4. PG & Hostels Specific Facets (Gender, Sharing, AC, Food) */}
      {isPG && (
        <div className="border-b border-slate-100 dark:border-slate-800">
          <div 
            onClick={() => toggleSection('pgFilters')}
            className="p-3 flex items-center justify-between font-bold text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <span className="uppercase text-[11px] font-black tracking-wider text-slate-500">
              {currentLang === 'te' ? 'పీజీ స్పెసిఫికేషన్స్' : 'PG & ROOM DETAILS'}
            </span>
            {openSections.pgFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>

          {openSections.pgFilters && (
            <div className="p-3 pt-0 space-y-3 text-xs">
              {/* Gender / Accommodation */}
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase text-slate-400">Gender / Occupant</div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'boys', label: 'Boys / Men' },
                    { id: 'girls', label: 'Girls / Women' },
                    { id: 'coliving', label: 'Co-Living' },
                  ].map((g) => (
                    <button
                      key={g.id}
                      onClick={() => onSelectPGGender(g.id)}
                      className={`px-2 py-1 text-[11px] rounded-xs font-bold border text-center transition-all cursor-pointer ${
                        selectedPGGender === g.id
                          ? 'bg-[#2874F0] text-white border-[#2874F0] shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Room Sharing */}
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase text-slate-400">Room Sharing</div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { id: 'all', label: 'Any Sharing' },
                    { id: 'single', label: 'Single Private' },
                    { id: 'double', label: '2 Sharing' },
                    { id: 'triple', label: '3 Sharing' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onSelectPGSharing(s.id)}
                      className={`px-2 py-1 text-[11px] rounded-xs font-bold border text-center transition-all cursor-pointer ${
                        selectedPGSharing === s.id
                          ? 'bg-[#2874F0] text-white border-[#2874F0] shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AC Option */}
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase text-slate-400">Cooling / AC</div>
                <div className="flex gap-1.5">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'ac', label: 'AC Rooms' },
                    { id: 'nonac', label: 'Non-AC' },
                  ].map((ac) => (
                    <button
                      key={ac.id}
                      onClick={() => onSelectPGAC(ac.id)}
                      className={`flex-1 px-2 py-1 text-[11px] rounded-xs font-bold border text-center transition-all cursor-pointer ${
                        selectedPGAC === ac.id
                          ? 'bg-[#2874F0] text-white border-[#2874F0] shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {ac.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Food Option */}
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase text-slate-400">Food & Meals</div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { id: 'all', label: 'Any' },
                    { id: 'food_included', label: 'Food Included' },
                    { id: 'veg', label: 'Pure Veg' },
                    { id: 'self_cooking', label: 'Self Cooking' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onSelectPGFood(f.id)}
                      className={`px-2 py-1 text-[11px] rounded-xs font-bold border text-center transition-all cursor-pointer ${
                        selectedPGFood === f.id
                          ? 'bg-[#2874F0] text-white border-[#2874F0] shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Classes Specific Facets (Delivery Mode, Timing, Free Trial) */}
      {isClasses && (
        <div className="border-b border-slate-100 dark:border-slate-800">
          <div 
            onClick={() => toggleSection('classFilters')}
            className="p-3 flex items-center justify-between font-bold text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <span className="uppercase text-[11px] font-black tracking-wider text-slate-500">
              {currentLang === 'te' ? 'తరగతి వివరాలు' : 'CLASS MODE & TIMINGS'}
            </span>
            {openSections.classFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>

          {openSections.classFilters && (
            <div className="p-3 pt-0 space-y-3 text-xs">
              {/* Delivery Mode */}
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase text-slate-400">Delivery Mode</div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { id: 'all', label: 'All Modes' },
                    { id: 'offline', label: '🏫 Offline' },
                    { id: 'online', label: '💻 Online' },
                    { id: 'hybrid', label: '🔄 Hybrid' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onSelectDeliveryMode(m.id)}
                      className={`px-2 py-1 text-[11px] rounded-xs font-bold border text-center transition-all cursor-pointer ${
                        selectedDeliveryMode === m.id
                          ? 'bg-[#2874F0] text-white border-[#2874F0] shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Free Trial Demo Toggle */}
              <label className="flex items-center gap-2 p-2 rounded-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={freeTrialOnly}
                  onChange={(e) => onToggleFreeTrialOnly(e.target.checked)}
                  className="w-4 h-4 rounded-xs text-emerald-600 focus:ring-emerald-500 border-emerald-400 cursor-pointer"
                />
                <span className="text-xs font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                  🎁 <span>Free Demo Trial Available</span>
                </span>
              </label>

              {/* Timing Slot */}
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase text-slate-400">Batch Timing</div>
                <div className="space-y-1">
                  {[
                    { id: 'all', label: 'All Times' },
                    { id: 'morning', label: 'Morning (8:00 AM - 12:00 PM)' },
                    { id: 'evening', label: 'Evening (4:00 PM - 7:00 PM)' },
                    { id: 'weekend', label: 'Weekend Batches' },
                  ].map((tSlot) => (
                    <button
                      key={tSlot.id}
                      onClick={() => onSelectTimingSlot(tSlot.id)}
                      className={`w-full px-2 py-1 text-[11px] rounded-xs font-bold border text-left transition-all cursor-pointer ${
                        selectedTimingSlot === tSlot.id
                          ? 'bg-[#2874F0] text-white border-[#2874F0] shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {tSlot.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. Customer Ratings (Flipkart Classic Green Stars) */}
      <div className="border-b border-slate-100 dark:border-slate-800">
        <div 
          onClick={() => toggleSection('rating')}
          className="p-3 flex items-center justify-between font-bold text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <span className="uppercase text-[11px] font-black tracking-wider text-slate-500">
            {currentLang === 'te' ? 'కస్టమర్ రేటింగ్' : 'CUSTOMER RATINGS'}
          </span>
          {openSections.rating ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>

        {openSections.rating && (
          <div className="p-3 pt-0 space-y-1.5 text-xs">
            <label 
              onClick={() => onSelectRating('all')}
              className="flex items-center gap-2 cursor-pointer select-none hover:text-[#2874F0]"
            >
              <input
                type="radio"
                name="rating_filter"
                checked={selectedRating === 'all'}
                onChange={() => onSelectRating('all')}
                className="w-3.5 h-3.5 text-[#2874F0]"
              />
              <span className="text-xs">All Ratings</span>
            </label>

            <label 
              onClick={() => onSelectRating(4.5)}
              className="flex items-center gap-2 cursor-pointer select-none hover:text-[#2874F0]"
            >
              <input
                type="radio"
                name="rating_filter"
                checked={selectedRating === 4.5}
                onChange={() => onSelectRating(4.5)}
                className="w-3.5 h-3.5 text-[#2874F0]"
              />
              <span className="inline-flex items-center gap-1 bg-[#388E3C] text-white px-1.5 py-0.2 rounded-xs font-bold text-[10px]">
                <span>4.5★</span>
              </span>
              <span className="text-xs">& above</span>
            </label>

            <label 
              onClick={() => onSelectRating(4.0)}
              className="flex items-center gap-2 cursor-pointer select-none hover:text-[#2874F0]"
            >
              <input
                type="radio"
                name="rating_filter"
                checked={selectedRating === 4.0}
                onChange={() => onSelectRating(4.0)}
                className="w-3.5 h-3.5 text-[#2874F0]"
              />
              <span className="inline-flex items-center gap-1 bg-[#388E3C] text-white px-1.5 py-0.2 rounded-xs font-bold text-[10px]">
                <span>4.0★</span>
              </span>
              <span className="text-xs">& above</span>
            </label>
          </div>
        )}
      </div>

      {/* 7. Price Filter */}
      <div className="border-b border-slate-100 dark:border-slate-800">
        <div 
          onClick={() => toggleSection('price')}
          className="p-3 flex items-center justify-between font-bold text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <span className="uppercase text-[11px] font-black tracking-wider text-slate-500">
            {currentLang === 'te' ? 'ధర / ఫీజు' : 'PRICE RANGE'}
          </span>
          {openSections.price ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>

        {openSections.price && (
          <div className="p-3 pt-0 space-y-1 text-xs">
            {[
              { id: 'all', label: 'All Prices' },
              { id: 'under500', label: 'Under ₹500 (or ₹5,000/mo)' },
              { id: '500to1000', label: '₹500 - ₹1,000 (or ₹5k - ₹10k/mo)' },
              { id: 'above1000', label: 'Above ₹1,000 (or ₹10,000+/mo)' },
            ].map((p) => (
              <label 
                key={p.id}
                onClick={() => onSelectPriceRange(p.id as any)}
                className="flex items-center gap-2 cursor-pointer select-none py-1 hover:text-[#2874F0]"
              >
                <input
                  type="radio"
                  name="price_filter"
                  checked={selectedPriceRange === p.id}
                  onChange={() => onSelectPriceRange(p.id as any)}
                  className="w-3.5 h-3.5 text-[#2874F0]"
                />
                <span className="text-xs">{p.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 8. Distance Radius Filter */}
      <div className="border-b border-slate-100 dark:border-slate-800">
        <div 
          onClick={() => toggleSection('distance')}
          className="p-3 flex items-center justify-between font-bold text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <span className="uppercase text-[11px] font-black tracking-wider text-slate-500">
            {currentLang === 'te' ? 'దూరం (పరిధి)' : 'DISTANCE RADIUS'}
          </span>
          {openSections.distance ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>

        {openSections.distance && (
          <div className="p-3 pt-0 space-y-1 text-xs">
            {[
              { id: 'all', label: 'Any Distance' },
              { id: 5, label: '📍 Within 5 km' },
              { id: 10, label: '📍 Within 10 km' },
              { id: 15, label: '📍 Within 15 km' },
            ].map((d) => (
              <label 
                key={String(d.id)}
                onClick={() => onSelectRadius(d.id as any)}
                className="flex items-center gap-2 cursor-pointer select-none py-1 hover:text-[#2874F0]"
              >
                <input
                  type="radio"
                  name="distance_filter"
                  checked={selectedRadius === d.id}
                  onChange={() => onSelectRadius(d.id as any)}
                  className="w-3.5 h-3.5 text-[#2874F0]"
                />
                <span className="text-xs">{d.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 9. Locality / Area Selector */}
      <div>
        <div 
          onClick={() => toggleSection('locality')}
          className="p-3 flex items-center justify-between font-bold text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <span className="uppercase text-[11px] font-black tracking-wider text-slate-500">
            {currentLang === 'te' ? 'ప్రాంతం / లొకేషన్' : 'LOCALITY / AREA'}
          </span>
          {openSections.locality ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>

        {openSections.locality && (
          <div className="p-3 pt-0">
            <select
              value={selectedArea}
              onChange={(e) => onSelectArea(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xs p-2 text-xs font-bold text-slate-800 dark:text-slate-200 outline-hidden focus:border-[#2874F0] cursor-pointer"
            >
              {popularAreasList.map((area) => (
                <option key={area} value={area}>
                  {area === 'All Areas in City' 
                    ? (currentLang === 'te' ? 'హైదరాబాద్ (అన్ని ఏరియాలు)' : 'All Areas in Hyderabad') 
                    : area}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

    </div>
  );
};
