import type { ReactNode } from 'react';
import SafeImageComponent, { type SafeImageCategory } from './SafeImage';
import { ChevronLeft, ChevronRight, ImageOff, RefreshCw } from 'lucide-react';

/** Shared chrome for the section experiences: photos, states and paging. */

export function SafeImage({
  src,
  alt,
  className,
  accentClass,
  category = 'general',
}: {
  src?: string | null;
  alt: string;
  className?: string;
  accentClass?: string;
  category?: SafeImageCategory;
}) {
  return (
    <div className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${className ?? ''}`}>
      {src ? (
        <SafeImageComponent category={category} src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 ${accentClass ?? 'text-slate-400'}`}>
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          <span className="text-[11px] font-semibold">No photo provided</span>
        </div>
      )}
    </div>
  );
}

export function StatePanel({
  title,
  message,
  actionLabel,
  onAction,
  tone = 'neutral',
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'warning';
}) {
  const palette =
    tone === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';
  return (
    <div className={`flex flex-col items-center gap-3 rounded-3xl border p-8 text-center ${palette}`} role="alert">
      <p className="text-base font-bold">{title}</p>
      <p className="max-w-md text-sm leading-6 opacity-80">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-current px-4 text-sm font-semibold transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> {actionLabel}
        </button>
      )}
    </div>
  );
}

export function SkeletonGrid({ count = 6, heightClass = 'h-64' }: { count?: number; heightClass?: string }) {
  return (
    <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading results">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3">
          <div className={`${heightClass} animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800`} />
          <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
  tone = 'neutral',
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
  tone?: 'neutral' | 'emerald' | 'orange';
}) {
  if (totalPages <= 1) return null;
  const accent =
    tone === 'emerald'
      ? 'hover:border-teal-600 hover:text-teal-700 focus-visible:outline-teal-700 dark:hover:text-teal-300'
      : tone === 'orange'
        ? 'hover:border-orange-500 hover:text-orange-700 focus-visible:outline-orange-600 dark:hover:text-orange-300'
        : 'hover:border-slate-900 focus-visible:outline-slate-900';
  const numbers = Array.from({ length: totalPages }, (_, index) => index).filter(
    (index) => Math.abs(index - page) <= 1 || index === 0 || index === totalPages - 1,
  );

  return (
    <nav className="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, page - 1))}
        disabled={page === 0}
        className={`inline-flex h-10 items-center gap-1 rounded-full border border-slate-300 px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${accent}`}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
      </button>
      {numbers.map((index, position) => {
        const previous = numbers[position - 1];
        const gap = previous !== undefined && index - previous > 1;
        return (
          <span key={index} className="flex items-center gap-2">
            {gap && <span className="px-1 text-sm text-slate-400">…</span>}
            <button
              type="button"
              onClick={() => onChange(index)}
              aria-current={index === page ? 'page' : undefined}
              aria-label={`Page ${index + 1}`}
              className={`h-10 w-10 rounded-full text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                index === page ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : `border border-slate-300 ${accent}`
              }`}
            >
              {index + 1}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        className={`inline-flex h-10 items-center gap-1 rounded-full border border-slate-300 px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${accent}`}
      >
        Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
  activeClass = 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  activeClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        active ? `border-transparent ${activeClass}` : 'border-slate-300 bg-white hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      {children}
    </button>
  );
}
