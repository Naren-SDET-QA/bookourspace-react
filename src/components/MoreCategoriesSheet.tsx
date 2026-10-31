import React from 'react';
import { X, Wrench, Check } from 'lucide-react';
import { LanguageCode } from '../types';

interface MoreCategoriesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentLang: LanguageCode;
  selectedTag: string;
  onSelectTag: (tag: string) => void;
}

// 100% Pure Local Home & Maintenance Services categories (No devotion, no quotes)
const localServiceCategories = [
  'Wall & Texture Painting (పెయింటింగ్ & పుట్టీ)',
  'Vitrified Tiler & Marble (టైల్స్ & మార్బుల్)',
  'Electrical Wiring & MCB (ఎలక్ట్రికల్ & ఇన్వర్టర్)',
  'Docker, Shifting & Porter (సామాన్ల షిఫ్టింగ్ & డాకర్)',
  'Bathroom Plumbing & Motor (ప్లంబింగ్ & మోటార్లు)',
  'AC Repair & Gas Charging (ఏసీ సర్వీసింగ్ & గ్యాస్)',
  'Washing Machine & Fridge (వాషింగ్ మెషిన్ & ఫ్రిజ్)',
  'Carpenter & Woodwork (ఫర్నిచర్ & వుడ్‌వర్క్)',
  'Home Deep Cleaning (డీప్ క్లీనింగ్)',
  'Roof & Terrace Waterproofing (వాటర్‌ప్రూఫింగ్)',
  'Termite & Pest Control (చీడపీడల నివారణ)',
  'Sofa & Mattress Dry Wash (సోఫా క్లీనింగ్)',
  'Water Tank & Sump Clean (వాటర్ ట్యాంక్ క్లీనింగ్)',
  'CCTV Camera Setup (సీసీటీవీ ఇన్స్టాలేషన్)',
  'Welding & Iron Gates (వెల్డింగ్ & గేట్లు)',
  'Glass & Aluminum Works (గ్లాస్ వర్క్స్)',
  'Borewell & Motor Pump (బోర్‌వెల్ మరమ్మత్తులు)',
  'Packers & Tempo Cargo (టెంపో & ప్యాకర్స్)',
  'Balcony Garden Care (తోట సంరక్షణ)'
];

export const MoreCategoriesSheet: React.FC<MoreCategoriesSheetProps> = ({
  isOpen,
  onClose,
  currentLang,
  selectedTag,
  onSelectTag,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
        {/* Grab bar */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              {currentLang === 'te' ? 'అన్ని లోకల్ హోమ్ సర్వీసెస్ (All Local Services)' : 'All Local Home Services'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Select any specialized local service category:
        </p>

        {/* Local Services Category Tags */}
        <div className="flex flex-wrap gap-2 pt-1">
          {localServiceCategories.map((cat, idx) => {
            const isSelected = selectedTag === cat;
            return (
              <button
                key={idx}
                onClick={() => {
                  onSelectTag(isSelected ? '' : cat);
                  onClose();
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1 ${
                  isSelected
                    ? 'bg-[#4A148C] text-white border-[#4A148C] shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 text-amber-300" />}
                <span>{cat}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};
