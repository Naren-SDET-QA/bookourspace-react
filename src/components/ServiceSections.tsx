import React from 'react';
import { servicesCategories } from '../data/servicesStayMoviesData';
import { serviceSections } from '../data/additionalServiceCategories';
import type { MarketplaceListing } from '../types/marketplace';

interface Props {
  listings: MarketplaceListing[];
  activeSection: string;
  selectedCategory: string;
  isTelugu: boolean;
  homeStyle: boolean;
  onSection: (id: string) => void;
  onCategory: (id: string) => void;
}

export function ServiceSections({ listings, activeSection, selectedCategory, isTelugu, homeStyle, onSection, onCategory }: Props) {
  const section = serviceSections.find((item) => item.id === activeSection);
  const categories = servicesCategories.filter((category) => !section || section.categoryIds.some((id) => id === category.id));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Service sections">
        {[{ id: 'all', label: 'All sections', labelTe: 'అన్ని విభాగాలు', emoji: '✨' }, ...serviceSections].map((item) => (
          <button key={item.id} type="button" aria-pressed={activeSection === item.id} onClick={() => onSection(item.id)} className={`rounded-full border px-4 py-2.5 text-sm font-semibold ${activeSection === item.id ? (homeStyle ? 'border-blue-600 bg-blue-600 text-white' : 'border-rose-600 bg-rose-600 text-white') : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
            {item.emoji} {isTelugu ? item.labelTe : item.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5" aria-label="Explore service categories">
        {categories.map((category) => {
          const count = listings.filter((listing) => listing.categoryId === category.id && listing.status === 'active').length;
          return (
            <button type="button" key={category.id} aria-pressed={selectedCategory === category.id} onClick={() => onCategory(category.id)} className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border bg-white px-3 py-4 text-center dark:bg-slate-900 ${selectedCategory === category.id ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-200 hover:border-blue-400 dark:border-slate-700'}`}>
              <span className="text-3xl" aria-hidden="true">{category.emoji}</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{isTelugu ? category.nameTe : category.name}</span>
              <span className="text-[11px] text-slate-500">{count > 0 ? `${count} providers` : 'Providers welcome'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
