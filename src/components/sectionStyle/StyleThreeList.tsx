import React from 'react';
import { Building2 } from 'lucide-react';
import SafeImage from '../SafeImage';

export interface StyleThreeListItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  price?: string;
  image?: string | null;
  badge?: string;
  onClick: () => void;
}

/**
 * The shared Style 3 layout: one compact, scannable row per item. Every section
 * maps its own inventory into this list, so the third style stays consistent
 * without duplicating a card system five times.
 */
export function StyleThreeList({
  items,
  label,
  emptyLabel = 'Nothing to show yet.',
}: {
  items: StyleThreeListItem[];
  label: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2" aria-label={label}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={item.onClick}
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#4A148C] hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A148C] dark:border-slate-800 dark:bg-slate-900"
          >
            <span className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
              {item.image ? (
                <SafeImage
                  category="general"
                  src={item.image}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-slate-400">
                  <Building2 className="h-6 w-6" aria-hidden="true" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-black text-slate-900 dark:text-white">{item.title}</span>
                {item.badge && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                    {item.badge}
                  </span>
                )}
              </span>
              {item.subtitle && (
                <span className="mt-0.5 block truncate text-xs text-slate-600 dark:text-slate-300">{item.subtitle}</span>
              )}
              {item.meta && (
                <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{item.meta}</span>
              )}
            </span>
            <span className="shrink-0 text-right">
              {item.price && <span className="block text-sm font-black text-[#4A148C] dark:text-violet-300">{item.price}</span>}
              <span className="mt-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">View →</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default StyleThreeList;
