import React from 'react';
import { 
  X, 
  Check, 
  Star, 
  MapPin, 
  ShieldCheck, 
  Clock, 
  Users, 
  Video, 
  Building2, 
  Laptop, 
  Zap, 
  Calendar, 
  Award, 
  BookOpen, 
  ArrowLeftRight, 
  Phone, 
  Sparkles, 
  FileText,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import { 
  AppLanguage, 
  translations, 
  getListingTitle, 
  getProviderDisplayName, 
  getPriceUnitDisplayName 
} from '../utils/translations';

interface ClassCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  comparedListings: MarketplaceListing[];
  onRemoveListing: (id: string) => void;
  onClearAll: () => void;
  onSelectListing: (listing: MarketplaceListing) => void;
  onBookTrial: (listing: MarketplaceListing) => void;
  onEnquire: (listing: MarketplaceListing) => void;
  currentLang?: AppLanguage;
}

export const ClassCompareModal: React.FC<ClassCompareModalProps> = ({
  isOpen,
  onClose,
  comparedListings,
  onRemoveListing,
  onClearAll,
  onSelectListing,
  onBookTrial,
  onEnquire,
  currentLang = 'te',
}) => {
  if (!isOpen) return null;

  const t = translations[currentLang] || translations.te;

  // Helper to extract course mode
  const getCourseMode = (item: MarketplaceListing) => {
    const rawTag = item.customFieldValues?.modeTag;
    if (rawTag === 'fast_track' || rawTag === 'online' || rawTag === 'offline' || rawTag === 'hybrid') {
      return rawTag;
    }
    const modeStr = String(item.customFieldValues?.classMode || '').toLowerCase();
    const titleStr = item.title.toLowerCase();
    if (/fast\s*track|crash|intensive/i.test(modeStr + titleStr)) return 'fast_track';
    if (/hybrid/i.test(modeStr)) return 'hybrid';
    if (/online|zoom|meet|teams/i.test(modeStr)) return 'online';
    return 'offline';
  };

  const getModeBadge = (mode: string) => {
    switch (mode) {
      case 'fast_track':
        return {
          label: 'Fast Track (Crash)',
          labelTe: 'ఫాస్ట్ ట్రాక్ (క్రాష్)',
          badgeClass: 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border-cyan-400',
          icon: Zap
        };
      case 'online':
        return {
          label: 'Live Online (Zoom/Meet)',
          labelTe: 'లైవ్ ఆన్‌లైన్ (Zoom)',
          badgeClass: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-400',
          icon: Video
        };
      case 'hybrid':
        return {
          label: 'Hybrid (Campus + Online)',
          labelTe: 'హైబ్రిడ్ (క్లాస్‌రూమ్ + ఆన్‌లైన్)',
          badgeClass: 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-400',
          icon: Laptop
        };
      default:
        return {
          label: 'Offline Classroom',
          labelTe: 'ఆఫ్‌లైన్ క్లాస్‌రూమ్',
          badgeClass: 'bg-purple-500/20 text-purple-800 dark:text-purple-300 border-purple-400',
          icon: Building2
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-purple-950 via-[#4A148C] to-indigo-950 text-white p-4 sm:p-5 flex items-center justify-between border-b border-purple-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-purple-950 flex items-center justify-center font-black shadow-md shrink-0">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-xl font-black tracking-tight">
                  {currentLang === 'te' 
                    ? 'కోర్సుల ముఖాముఖి పోలిక పట్టిక (Side-by-Side Comparison)' 
                    : currentLang === 'hi' 
                    ? 'पाठ्यक्रम तुलना तालिका (Side-by-Side Comparison)' 
                    : 'Class & Course Side-by-Side Comparison Table'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-white/20 text-amber-300 border border-white/20">
                  {comparedListings.length} / 3 {currentLang === 'te' ? 'ఎంపిక' : 'Selected'}
                </span>
              </div>
              <p className="text-xs text-purple-200 mt-0.5">
                {currentLang === 'te'
                  ? 'సమయాలు, ఫీజు, బ్యాచ్ పరిమాణం, డెలివరీ మోడ్ మరియు అధ్యాపకుల అనుభవాన్ని సులభంగా సరిపోల్చి ఉత్తమ కోర్సును ఎంచుకోండి.'
                  : 'Compare batch timings, fees, class capacity, mode, faculty experience, and free demo options to make the right choice.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {comparedListings.length > 0 && (
              <button
                onClick={onClearAll}
                className="hidden sm:inline-flex px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200 transition"
              >
                {currentLang === 'te' ? 'అన్నీ తీసివేయి' : 'Clear All'}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
              title="Close Comparison"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Table Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-6">
          {comparedListings.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 mx-auto flex items-center justify-center">
                <ArrowLeftRight className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {currentLang === 'te' ? 'పోల్చడానికి కోర్సులు ఏవీ ఎంపిక చేయలేదు' : 'No classes selected for comparison'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {currentLang === 'te'
                  ? 'లిస్టింగ్‌ల వద్ద ఉన్న "సరిపోల్చండి (Compare)" బటన్‌ను క్లిక్ చేసి గరిష్టంగా 3 కోర్సులను ఎంచుకోండి.'
                  : 'Click the "Compare" checkbox on any course card to add up to 3 classes and compare their complete specifications.'}
              </p>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-2xl bg-[#4A148C] text-white font-bold text-xs shadow-md"
              >
                {currentLang === 'te' ? 'కోర్సులను అన్వేషించండి' : 'Browse Classes'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Responsive Side-by-Side Comparison Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
                {comparedListings.map((item, index) => {
                  const mode = getCourseMode(item);
                  const modeBadge = getModeBadge(mode);
                  const distKm = item.distanceKm ?? item.location?.distanceKm ?? 2.5;
                  const itemTitle = getListingTitle(item, currentLang);
                  const providerName = getProviderDisplayName(item.providerNameTe || item.providerName, currentLang, distKm);
                  const priceUnit = getPriceUnitDisplayName(item.priceUnitTe || item.priceUnit, currentLang);

                  return (
                    <div 
                      key={item.id}
                      className="bg-white dark:bg-slate-950 border-2 border-purple-200 dark:border-purple-900/60 rounded-3xl p-4 sm:p-5 shadow-lg flex flex-col justify-between relative hover:border-purple-500 transition-all"
                    >
                      {/* Column Card Top Ribbon */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-100 text-[#4A148C] dark:bg-purple-950 dark:text-purple-300">
                          {currentLang === 'te' ? `ఎంపిక #${index + 1}` : `Class Option #${index + 1}`}
                        </span>

                        <button
                          onClick={() => onRemoveListing(item.id)}
                          className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950 text-slate-500 hover:text-rose-600 flex items-center justify-center transition"
                          title="Remove from compare"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Course Header: Photo + Title + Faculty */}
                      <div className="pt-3 space-y-3">
                        <div className="relative h-36 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-pointer" onClick={() => onSelectListing(item)}>
                          <img
                            src={item.images[0] || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80'}
                            alt={itemTitle}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 left-2">
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-[#4A148C] text-white shadow-xs">
                              {item.subcategory}
                            </span>
                          </div>
                          <div className="absolute bottom-2 right-2">
                            <span className="text-xs font-black px-2 py-0.5 rounded-md bg-black/80 text-amber-300 backdrop-blur-xs">
                              {item.price === 0 ? '100% FREE' : `₹${item.price.toLocaleString('en-IN')}${priceUnit}`}
                            </span>
                          </div>
                        </div>

                        <div>
                          <h3 
                            onClick={() => onSelectListing(item)}
                            className="text-sm font-black text-slate-900 dark:text-white line-clamp-2 hover:text-[#4A148C] cursor-pointer"
                          >
                            {itemTitle}
                          </h3>
                        </div>

                        {/* Faculty Profile Lockup */}
                        <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                          <img
                            src={item.providerAvatar}
                            alt={providerName}
                            className="w-10 h-10 rounded-full object-cover border-2 border-purple-500 shrink-0 bg-slate-200"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{providerName}</span>
                              {item.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                            </div>
                            <span className="text-[10px] text-purple-700 dark:text-purple-300 font-semibold block truncate">
                              {String(item.customFieldValues?.experience || item.customFieldValues?.facultyTitle || 'Verified Specialist')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Side-by-Side Detailed Rows */}
                      <div className="mt-4 space-y-2.5 text-xs">
                        
                        {/* 1. Mode of Delivery */}
                        <div className="p-2.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/60">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                            🔄 {currentLang === 'te' ? 'తరగతి విధానం (Mode)' : 'Delivery Mode'}
                          </span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider border flex items-center gap-1 ${modeBadge.badgeClass}`}>
                              <modeBadge.icon className="w-3 h-3" />
                              <span>{currentLang === 'te' ? modeBadge.labelTe : modeBadge.label}</span>
                            </span>
                          </div>
                        </div>

                        {/* 2. Batch Timings & Schedule */}
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                            ⏰ {currentLang === 'te' ? 'బ్యాచ్ సమయాలు & రోజులు' : 'Batch Timings & Days'}
                          </span>
                          <span className="font-extrabold text-slate-900 dark:text-white mt-0.5 block">
                            {String(item.customFieldValues?.timingHighlight || item.customFieldValues?.classTimings || 'Flexible Schedule')}
                          </span>
                          {item.customFieldValues?.daysOfWeek && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                              📅 {String(item.customFieldValues.daysOfWeek)}
                            </span>
                          )}
                        </div>

                        {/* 3. Pricing & Installments */}
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                            💰 {currentLang === 'te' ? 'కోర్సు ఫీజు & వాయిదాలు' : 'Fee Structure & Installments'}
                          </span>
                          <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {item.price === 0 ? '100% Free / Government' : `₹${item.price.toLocaleString('en-IN')} ${priceUnit}`}
                          </div>
                          <span className="text-[10px] text-slate-600 dark:text-slate-400 block mt-0.5">
                            {String(item.customFieldValues?.feeStructure || item.customFieldValues?.installmentOption || 'No EMI')}
                          </span>
                        </div>

                        {/* 4. Batch Capacity & Seats Left */}
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                            👥 {currentLang === 'te' ? 'బ్యాచ్ పరిమాణం & ఖాళీలు' : 'Batch Size & Available Seats'}
                          </span>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {String(item.customFieldValues?.batchCapacity || '15')} {currentLang === 'te' ? 'విద్యార్థులు' : 'Students'}
                            </span>
                            <span className="font-black text-rose-600 dark:text-rose-400 text-[11px] bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
                              🔥 {String(item.customFieldValues?.seatsRemaining || '3')} {currentLang === 'te' ? 'సీట్లు మిగిలి ఉన్నాయి' : 'seats left'}
                            </span>
                          </div>
                        </div>

                        {/* 5. Free Trial & Demo */}
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                            🎁 {currentLang === 'te' ? 'ఉచిత డెమో క్లాస్' : 'Free Trial / Demo Class'}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.customFieldValues?.freeTrialAvailable && String(item.customFieldValues.freeTrialAvailable).toLowerCase().includes('yes') ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{currentLang === 'te' ? 'అందుబాటులో ఉంది (1st Class Free)' : 'Available (1 Free Demo)'}</span>
                              </span>
                            ) : (
                              <span className="text-slate-500 font-medium">
                                {currentLang === 'te' ? 'డెమో లేదు' : 'No Free Demo'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 6. Course Duration */}
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                            ⏱️ {currentLang === 'te' ? 'కాలవ్యవధి & వయస్సు' : 'Duration & Age Group'}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">
                            {String(item.customFieldValues?.courseDuration || '3 Months')} • {String(item.customFieldValues?.ageGroup || 'All Ages')}
                          </span>
                        </div>

                        {/* 7. Study Materials & Certificate */}
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                            📜 {currentLang === 'te' ? 'సర్టిఫికేషన్ & మెటీరియల్స్' : 'Certificate & Materials'}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block text-[11px]">
                            {String(item.customFieldValues?.certificateProvided || 'Certificate on Completion')}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                            📚 {String(item.customFieldValues?.studyMaterials || 'Study Materials Included')}
                          </span>
                        </div>

                        {/* 8. Location & Distance */}
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                            📍 {currentLang === 'te' ? 'ప్రాంతం & వేదిక' : 'Location & Campus'}
                          </span>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {item.location.area}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-600">
                              {distKm} km {t.away}
                            </span>
                          </div>
                          {item.customFieldValues?.deliveryPlatform && (
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium block mt-0.5">
                              💻 {String(item.customFieldValues.deliveryPlatform)}
                            </span>
                          )}
                        </div>

                        {/* 9. Ratings & Reviews */}
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                            ⭐ {currentLang === 'te' ? 'రేటింగ్ & రివ్యూలు' : 'Rating & Reviews'}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="flex items-center text-amber-500 font-black">
                              <Star className="w-3.5 h-3.5 fill-current" />
                              <span className="ml-1">{item.providerRating}</span>
                            </div>
                            <span className="text-slate-400 font-normal">
                              ({item.reviewCount} {t.reviews})
                            </span>
                          </div>
                        </div>

                      </div>

                      {/* Column Bottom Action Buttons */}
                      <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                        <button
                          onClick={() => {
                            onBookTrial(item);
                            onClose();
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer text-center"
                        >
                          🎁 {currentLang === 'te' ? 'ఉచిత డెమో బుక్ చేయండి' : 'Book Free Trial Demo'}
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              onEnquire(item);
                              onClose();
                            }}
                            className="flex-1 py-1.5 px-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition text-center cursor-pointer"
                          >
                            💬 {t.chat}
                          </button>

                          <button
                            onClick={() => {
                              onSelectListing(item);
                              onClose();
                            }}
                            className="flex-1 py-1.5 px-2 rounded-xl bg-[#4A148C] hover:bg-purple-800 text-white text-xs font-bold transition text-center cursor-pointer shadow-xs"
                          >
                            {currentLang === 'te' ? 'వివరాలు' : 'Full Details'}
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}

                {/* Empty Slot Placeholder if user selected < 3 classes */}
                {comparedListings.length < 3 && (
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                      <span className="text-xl font-black">+</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                        {currentLang === 'te' ? 'మరో కోర్సును జోడించండి' : 'Add Another Class'}
                      </h4>
                      <p className="text-xs text-slate-500 max-w-xs mt-1">
                        {currentLang === 'te'
                          ? `మీరు గరిష్టంగా 3 కోర్సులను పక్కపక్కనే సరిపోల్చవచ్చు (ఇంకా ${3 - comparedListings.length} ఖాళీ ఉంది).`
                          : `You can compare up to 3 classes side-by-side (${3 - comparedListings.length} slot available).`}
                      </p>
                    </div>
                    <button
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 font-bold text-xs hover:bg-purple-50 dark:hover:bg-purple-950 transition cursor-pointer"
                    >
                      {currentLang === 'te' ? '+ జాబితా నుండి ఎంచుకోండి' : '+ Select from Classes'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Modal Sticky Bottom Bar */}
        <div className="p-3 sm:px-6 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{currentLang === 'te' ? 'ధృవీకరించబడిన అధ్యాపకులు & ప్రత్యక్ష తరగతులు' : '100% Verified Faculty & Live Classes Guarantee'}</span>
          </span>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#4A148C] text-white font-bold text-xs shadow-xs hover:bg-purple-800 transition cursor-pointer"
          >
            {currentLang === 'te' ? 'పూర్తయింది' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
