import React from 'react';
import {
  Palette,
  Layers,
  Zap,
  Package,
  Wrench,
  Hammer,
  Sparkles,
  Trees,
  Bus,
  BookOpen,
  Scissors,
  FlaskConical,
  Printer,
  HeartHandshake,
  Stethoscope,
  UserCheck,
  Siren,
  Activity,
  TestTube2,
  Pill,
  CheckCircle2,
  Home,
  GraduationCap,
  Hospital,
  ChevronRight,
  Wind,
  Tv,
  ShieldAlert,
  Droplets
} from 'lucide-react';
import { ServiceItem, ServiceType, LanguageCode } from '../types';
import { serviceCatalog } from '../data/mockData';
import { translations } from '../utils/translations';

interface ServiceCategoryGridProps {
  currentLang: LanguageCode;
  selectedCategory: 'all' | 'home' | 'school' | 'hospital';
  onSelectCategory: (cat: 'all' | 'home' | 'school' | 'hospital') => void;
  selectedTrade: ServiceType | 'all';
  onSelectTrade: (trade: ServiceType | 'all') => void;
  onQuickBookService?: (service: ServiceItem) => void;
}

// Icon dictionary
const iconComponents: Record<string, React.ElementType> = {
  Palette,
  Layers,
  Zap,
  Package,
  Wrench,
  Hammer,
  Sparkles,
  Trees,
  Wind,
  Tv,
  ShieldAlert,
  Droplets,
  Bus,
  BookOpen,
  Scissors,
  FlaskConical,
  Printer,
  HeartHandshake,
  Stethoscope,
  UserCheck,
  Siren,
  Activity,
  TestTube2,
  Pill,
};

export const ServiceCategoryGrid: React.FC<ServiceCategoryGridProps> = ({
  currentLang,
  selectedCategory,
  onSelectCategory,
  selectedTrade,
  onSelectTrade,
  onQuickBookService
}) => {
  const t = translations[currentLang];

  const homeServices = serviceCatalog.filter(s => s.category === 'home');
  const schoolServices = serviceCatalog.filter(s => s.category === 'school');
  const hospitalServices = serviceCatalog.filter(s => s.category === 'hospital');

  const getTranslatedTitle = (key: string): string => {
    return (t as unknown as Record<string, string>)[key] || key;
  };

  const renderServiceCard = (item: ServiceItem) => {
    const IconComp = iconComponents[item.icon] || Zap;
    const isSelected = selectedTrade === item.id;
    const title = getTranslatedTitle(item.titleKey);

    return (
      <button
        key={item.id}
        onClick={() => onSelectTrade(isSelected ? 'all' : item.id)}
        className={`group relative text-left p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between h-full ${
          isSelected
            ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-600 ring-2 ring-purple-500/30 shadow-md transform -translate-y-0.5'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-sm'
        }`}
      >
        <div>
          {/* Top row: High contrast icon + badge */}
          <div className="flex items-center justify-between mb-2.5">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 shadow-xs"
              style={{
                backgroundColor: `${item.iconColor}18`,
                color: item.iconColor,
                borderColor: `${item.iconColor}40`,
                borderWidth: '1px'
              }}
            >
              <IconComp className="w-5 h-5 stroke-[2.2]" />
            </div>

            {item.popularTradeBadge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
                {item.popularTradeBadge}
              </span>
            )}
          </div>

          {/* Title with balanced text */}
          <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm line-clamp-1 group-hover:text-purple-700 dark:group-hover:text-purple-300">
            {title}
          </h4>

          {/* Description */}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {item.descriptionKey}
          </p>
        </div>

        {/* Bottom row: Rate & Action indicator */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">
            {item.defaultRate}
          </span>
          <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${
            isSelected ? 'text-purple-600 dark:text-purple-400 font-bold' : 'text-slate-400 group-hover:text-purple-600'
          }`}>
            {isSelected ? 'Selected' : 'Find'}
            <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </button>
    );
  };

  return (
    <section className="space-y-6">
      {/* Category selector pills for rapid jumping */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => onSelectCategory('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedCategory === 'all'
              ? 'bg-[#4A148C] text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <span>{t.allCategories}</span>
        </button>

        <button
          onClick={() => onSelectCategory('home')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedCategory === 'home'
              ? 'bg-[#4A148C] text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <Home className="w-3.5 h-3.5 text-amber-500" />
          <span>{t.homeServicesTitle}</span>
        </button>

        <button
          onClick={() => onSelectCategory('school')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedCategory === 'school'
              ? 'bg-[#4A148C] text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
          <span>{t.schoolServicesTitle}</span>
        </button>

        <button
          onClick={() => onSelectCategory('hospital')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedCategory === 'hospital'
              ? 'bg-[#4A148C] text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
          }`}
        >
          <Hospital className="w-3.5 h-3.5 text-emerald-500" />
          <span>{t.hospitalServicesTitle}</span>
        </button>
      </div>

      {/* 1. HOME SERVICES SECTION */}
      {(selectedCategory === 'all' || selectedCategory === 'home') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Home className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg tracking-tight">
                {t.homeServicesTitle}
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Painter · Tiler · Docker · Electrician & Plumber
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {homeServices.map(renderServiceCard)}
          </div>
        </div>
      )}

      {/* 2. SCHOOL SERVICES SECTION */}
      {(selectedCategory === 'all' || selectedCategory === 'school') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                <GraduationCap className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg tracking-tight">
                {t.schoolServicesTitle}
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Bus Driver · Tutor · Uniform Tailor · Lab Tech
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
            {schoolServices.map(renderServiceCard)}
          </div>
        </div>
      )}

      {/* 3. HOSPITAL SERVICES SECTION */}
      {(selectedCategory === 'all' || selectedCategory === 'hospital') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <Hospital className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg tracking-tight">
                {t.hospitalServicesTitle}
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Home Nurse · Patient Attendant · Ambulance · Physio
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
            {hospitalServices.map(renderServiceCard)}
          </div>
        </div>
      )}
    </section>
  );
};
