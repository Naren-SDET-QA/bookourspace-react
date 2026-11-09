import React from 'react';
import { 
  Wrench, 
  Calendar, 
  Building, 
  FileText, 
  KeyRound, 
  MapPin, 
  FileSpreadsheet, 
  Repeat, 
  AlertTriangle,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { CustomerAction } from '../types/marketplace';
import { customerActionList, CustomerActionMeta } from '../data/customerActions';

interface CustomerActionBarProps {
  selectedAction: CustomerAction;
  onSelectAction: (action: CustomerAction) => void;
}

const actionIcons: Record<string, React.ElementType> = {
  Wrench,
  Calendar,
  Building,
  FileText,
  KeyRound,
  MapPin,
  FileSpreadsheet,
  Repeat,
  AlertTriangle
};

export const CustomerActionBar: React.FC<CustomerActionBarProps> = ({
  selectedAction,
  onSelectAction,
}) => {
  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#4A148C] text-amber-300 flex items-center justify-center font-bold text-xs shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
              What do you want to do today?
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Select an intent to browse verified providers & listings
            </p>
          </div>
        </div>

        {selectedAction !== 'all' && (
          <button
            onClick={() => onSelectAction('all')}
            className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline"
          >
            Show All
          </button>
        )}
      </div>

      {/* 9 Customer Actions Grid / Scroll Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {/* "All" Card */}
        <button
          onClick={() => onSelectAction('all')}
          className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between ${
            selectedAction === 'all'
              ? 'bg-[#4A148C] text-white border-[#4A148C] shadow-md ring-2 ring-purple-500/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-purple-300'
          }`}
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
              Overview
            </span>
            <div className="font-black text-xs sm:text-sm mt-0.5">
              All 44 Categories
            </div>
          </div>
          <p className="text-[10px] mt-2 text-slate-400 dark:text-slate-400 line-clamp-1">
            Browse full marketplace
          </p>
        </button>

        {customerActionList.map((action) => {
          const Icon = actionIcons[action.iconName] || Wrench;
          const isSelected = selectedAction === action.id;
          const isUrgent = action.id === 'request_urgent_help';

          return (
            <button
              key={action.id}
              onClick={() => onSelectAction(isSelected ? 'all' : action.id)}
              className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group ${
                isSelected
                  ? isUrgent
                    ? 'bg-red-600 text-white border-red-600 shadow-md ring-2 ring-red-400/40'
                    : 'bg-[#4A148C] text-white border-[#4A148C] shadow-md ring-2 ring-purple-500/30'
                  : isUrgent
                  ? 'bg-red-50/60 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 hover:border-red-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-xs'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${
                    isSelected 
                      ? 'bg-white/20 text-white' 
                      : isUrgent 
                      ? 'bg-red-500 text-white' 
                      : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                  }`}>
                    <Icon className="w-4 h-4 stroke-[2.2]" />
                  </div>

                  {isUrgent && (
                    <span className="text-[9px] font-black uppercase tracking-wider bg-red-600 text-white px-1.5 py-0.5 rounded-full animate-pulse">
                      Urgent
                    </span>
                  )}
                </div>

                <div className={`font-black text-xs sm:text-sm tracking-tight ${
                  isSelected ? 'text-white' : 'text-slate-900 dark:text-white'
                }`}>
                  {action.label}
                </div>
              </div>

              <div className="mt-2 pt-1.5 border-t border-slate-100/20 dark:border-slate-800/20">
                <p className={`text-[10px] line-clamp-1 ${
                  isSelected ? 'text-purple-200' : 'text-slate-500 dark:text-slate-400'
                }`}>
                  {action.examples}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
