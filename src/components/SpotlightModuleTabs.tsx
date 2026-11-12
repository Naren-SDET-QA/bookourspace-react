import React, { useCallback, useRef } from 'react';
import type { MarketSectionType } from '../data/moduleCategories';

export interface SpotlightModuleTab {
  id: MarketSectionType;
  emoji: string;
  label: string;
  shortLabel: string;
  accent: string;
  surface: string;
}

export const SPOTLIGHT_MODULE_TABS: SpotlightModuleTab[] = [
  {
    id: 'pg_hostels',
    emoji: '🏠',
    label: "PG's & Hostels",
    shortLabel: "PG's",
    accent: 'from-indigo-600 to-violet-600',
    surface: 'bg-indigo-50/90 border-indigo-200 dark:bg-indigo-950/50 dark:border-indigo-800',
  },
  {
    id: 'classes',
    emoji: '🎓',
    label: 'Classes & Courses',
    shortLabel: 'Classes',
    accent: 'from-emerald-600 to-teal-600',
    surface: 'bg-emerald-50/90 border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800',
  },
  {
    id: 'venues',
    emoji: '🏛️',
    label: 'Halls & Venues',
    shortLabel: 'Halls',
    accent: 'from-amber-500 to-orange-600',
    surface: 'bg-amber-50/90 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800',
  },
  {
    id: 'services',
    emoji: '🛠️',
    label: 'Home Services',
    shortLabel: 'Services',
    accent: 'from-sky-600 to-blue-600',
    surface: 'bg-sky-50/90 border-sky-200 dark:bg-sky-950/50 dark:border-sky-800',
  },
  {
    id: 'hotel_stay',
    emoji: '🏨',
    label: 'Hotels & Stay',
    shortLabel: 'Stay',
    accent: 'from-rose-600 to-pink-600',
    surface: 'bg-rose-50/90 border-rose-200 dark:bg-rose-950/50 dark:border-rose-800',
  },
  {
    id: 'movies',
    emoji: '🎬',
    label: 'Movies & Events',
    shortLabel: 'Movies',
    accent: 'from-fuchsia-600 to-purple-600',
    surface: 'bg-fuchsia-50/90 border-fuchsia-200 dark:bg-fuchsia-950/50 dark:border-fuchsia-800',
  },
];

interface SpotlightModuleTabsProps {
  activeMarketSection: MarketSectionType;
  onSelectMarketSection: (section: MarketSectionType) => void;
  labels?: Partial<Record<MarketSectionType, string>>;
  compact?: boolean;
  /** When provided, only these sections are shown (customer module access). */
  authorizedSections?: MarketSectionType[] | null;
}

export const SpotlightModuleTabs: React.FC<SpotlightModuleTabsProps> = ({
  activeMarketSection,
  onSelectMarketSection,
  labels,
  compact = false,
  authorizedSections = null,
}) => {
  const visibleTabs = authorizedSections
    ? SPOTLIGHT_MODULE_TABS.filter((tab) => authorizedSections.includes(tab.id))
    : SPOTLIGHT_MODULE_TABS;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusTab = useCallback((index: number) => {
    if (visibleTabs.length === 0) return;
    const nextIndex = (index + visibleTabs.length) % visibleTabs.length;
    const nextTab = visibleTabs[nextIndex];
    tabRefs.current[nextIndex]?.focus();
    onSelectMarketSection(nextTab.id);
  }, [onSelectMarketSection, visibleTabs]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTab(SPOTLIGHT_MODULE_TABS.length - 1);
    }
  };

  return (
    <nav
      role="tablist"
      aria-label="Marketplace modules"
      className={compact
        ? 'flex gap-1.5 overflow-x-auto no-scrollbar'
        : 'relative grid grid-cols-6 gap-1 sm:gap-2.5 pt-0.5 w-full'}
    >
      {visibleTabs.map((tab, index) => {
        const isActive = activeMarketSection === tab.id;
        const label = labels?.[tab.id] || (compact ? tab.shortLabel : tab.label);
        return (
          <button
            key={tab.id}
            ref={(node) => { tabRefs.current[index] = node; }}
            type="button"
            aria-selected={isActive}
            aria-pressed={isActive}
            aria-current={isActive ? 'page' : undefined}
            tabIndex={isActive ? 0 : -1}
            data-testid={`market-section-${tab.id}`}
            onClick={() => onSelectMarketSection(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              'group relative min-w-0 overflow-hidden border font-extrabold transition-[transform,box-shadow,background-color,border-color] duration-200',
              'motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700',
              compact
                ? 'min-h-10 shrink-0 rounded-lg px-3 text-xs'
                : 'rounded-2xl px-0.5 py-1.5 sm:px-3 sm:py-2.5',
              isActive
                ? `bg-gradient-to-b ${tab.accent} border-transparent text-white shadow-[0_8px_20px_-4px_rgba(79,70,229,0.38)] ring-2 ring-indigo-300/80 dark:ring-indigo-500/70`
                : `${tab.surface} text-slate-900 shadow-2xs hover:border-indigo-400/70 hover:shadow-md dark:text-slate-100`,
            ].join(' ')}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-1/4 top-0 h-0.5 rounded-full bg-white/90 shadow-[0_0_14px_rgba(255,255,255,0.9)]"
              />
            )}
            <span className="relative flex items-center justify-center gap-1 sm:gap-1.5">
              <span aria-hidden="true" className="text-base leading-none sm:text-xl">
                {tab.emoji}
              </span>
              <span className="truncate text-[9px] leading-tight tracking-tight sm:text-xs">
                {label}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
};
