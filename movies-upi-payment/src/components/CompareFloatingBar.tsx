import React from 'react';
import {
  X,
  ChevronRight
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import { AppLanguage, getListingTitle } from '../utils/translations';
import { getUILabels } from '../utils/i18nEngine';

interface CompareFloatingBarProps {
  comparedListings: MarketplaceListing[];
  onOpenCompareModal: () => void;
  onRemoveListing: (id: string) => void;
  onClearAll: () => void;
  currentLang?: AppLanguage;
}

export const CompareFloatingBar: React.FC<CompareFloatingBarProps> = ({
  comparedListings,
  onOpenCompareModal,
  onRemoveListing,
  onClearAll,
  currentLang = 'te',
}) => {
  if (comparedListings.length === 0) return null;

  const ui = getUILabels(currentLang);
  const canCompare = comparedListings.length >= 2;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t-2 border-[#2874F0] shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap">

        {/* Left: Compare Title & Selected Thumbnails */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap min-w-0">
          <div className="flex items-center gap-2">
            <span className="bg-[#2874F0] text-white text-xs font-black px-2 py-0.5 rounded-xs uppercase">
              {ui.compare}
            </span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 hidden sm:inline">
              ({comparedListings.length}/3)
            </span>
          </div>

          {/* Selected Item Mini-Cards */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {comparedListings.map((item) => {
              const title = getListingTitle(item, currentLang);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-1.5 pr-2 py-1 rounded-xs text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs group max-w-[130px] sm:max-w-[160px]"
                >
                  <img
                    src={item.images[0] || item.providerAvatar}
                    alt={title}
                    className="w-6 h-6 rounded-xs object-cover shrink-0 border border-slate-200"
                  />
                  <span className="truncate text-[11px]">{title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveListing(item.id);
                    }}
                    className="w-4 h-4 rounded-full hover:bg-rose-500 hover:text-white flex items-center justify-center text-slate-400 transition cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            {/* Empty Slots */}
            {Array.from({ length: 3 - comparedListings.length }).map((_, idx) => (
              <div
                key={idx}
                className="hidden xs:flex items-center justify-center px-3 py-1 rounded-xs border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 text-[11px] font-semibold"
              >
                + {comparedListings.length + idx + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 ml-auto">
          <button
            onClick={onClearAll}
            className="text-xs font-bold text-slate-500 hover:text-rose-600 uppercase tracking-wide cursor-pointer transition-colors"
          >
            {ui.clear}
          </button>

          <button
            onClick={onOpenCompareModal}
            disabled={!canCompare}
            className={`px-6 py-2.5 rounded-xs text-xs sm:text-sm font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md cursor-pointer ${
              canCompare
                ? 'bg-[#FB641B] hover:bg-orange-600 text-white active:scale-95'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>{ui.compare} ({comparedListings.length})</span>
            <ChevronRight className="w-4 h-4 stroke-[3]" />
          </button>
        </div>

      </div>
    </div>
  );
};
