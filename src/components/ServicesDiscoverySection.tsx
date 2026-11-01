import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Film,
  GraduationCap,
  Hotel,
  House,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { servicesCategories } from '../data/servicesStayMoviesData';
import type { MarketSectionType } from '../data/servicesStayMoviesData';
import { fetchPlatformModuleFlags, subscribeToPlatformModuleFlags } from '../lib/stayDiscoveryData';
import {
  getDiscoverySection,
  resolveServicesModuleAccess,
  ServicesModuleKey,
} from '../lib/servicesStayRules';
import type { ModuleFlagRow } from '../server/moduleGate';

interface ServicesDiscoverySectionProps {
  onClose: () => void;
  onNavigate: (section: MarketSectionType, categoryId?: string) => void;
}

const moduleCards: Array<{
  key: ServicesModuleKey;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  accent: string;
}> = [
  { key: 'hotels', title: 'Hotels & Stays', subtitle: 'Rooms, homes and places to unwind', icon: Hotel, accent: 'from-indigo-600 to-violet-600' },
  { key: 'pg', title: 'PG Accommodation', subtitle: 'Hostels and shared living', icon: House, accent: 'from-emerald-600 to-teal-600' },
  { key: 'function_hall', title: 'Function Halls', subtitle: 'Venues for gatherings and events', icon: Building2, accent: 'from-amber-500 to-orange-600' },
  { key: 'classes', title: 'Classes & Institutes', subtitle: 'Courses, institutes and learning', icon: GraduationCap, accent: 'from-sky-600 to-blue-700' },
  { key: 'movies', title: 'Movies & Cinemas', subtitle: 'Explore films and local screens', icon: Film, accent: 'from-fuchsia-600 to-purple-700' },
  { key: 'services', title: 'Local Services', subtitle: 'Find help for everyday needs', icon: Wrench, accent: 'from-teal-600 to-emerald-700' },
];

export function ServicesDiscoverySection({ onClose, onNavigate }: ServicesDiscoverySectionProps) {
  const [flags, setFlags] = useState<ModuleFlagRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadFlags = async () => {
    setLoading(true);
    setHasError(false);
    try {
      setFlags(await fetchPlatformModuleFlags());
    } catch {
      setFlags(null);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFlags();
    const unsubscribe = subscribeToPlatformModuleFlags(() => { void loadFlags(); });
    return unsubscribe;
  }, []);

  const activeServiceCategories = useMemo(() => servicesCategories, []);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="services-discovery-title">
      <div className="mx-auto min-h-full w-full max-w-7xl px-4 py-5 sm:px-7 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm transition hover:border-violet-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 dark:border-slate-700 dark:bg-slate-900" aria-label="Back to marketplace">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-violet-800 dark:bg-violet-950 dark:text-violet-200">BookOurSpace</span>
        </div>

        <header className="mx-auto max-w-3xl py-10 text-center sm:py-14">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">Find what you need</p>
          <h1 id="services-discovery-title" className="text-3xl font-black tracking-tight sm:text-5xl">One place for the plans you have.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">Explore stays, local providers, learning, venues and entertainment. Availability and actions follow each service’s current settings.</p>
        </header>

        {hasError && (
          <div className="mx-auto mb-7 flex max-w-3xl flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100" role="alert">
            <p>Service availability settings could not be loaded. Categories are kept unavailable until their settings can be confirmed.</p>
            <button type="button" onClick={() => void loadFlags()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-400 px-3 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900"><RefreshCw className="h-4 w-4" /> Try again</button>
          </div>
        )}

        <section aria-label="BookOurSpace services" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moduleCards.map((card) => {
            const access = resolveServicesModuleAccess(flags, card.key);
            const Icon = card.icon;
            const isPending = loading;
            const unavailable = flags === null || !access.enabled;
            return (
              <button
                key={card.key}
                type="button"
                disabled={isPending || unavailable}
                onClick={() => {
                  const section = getDiscoverySection(card.key);
                  if (section) onNavigate(section as MarketSectionType);
                }}
                className="group relative flex min-h-44 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 sm:min-h-48 sm:p-6"
                aria-disabled={isPending || unavailable}
              >
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.accent} text-white shadow-md`}><Icon className="h-6 w-6" /></div>
                <span className="text-lg font-extrabold tracking-tight">{card.title}</span>
                <span className="mt-1 text-sm text-slate-600 dark:text-slate-300">{card.subtitle}</span>
                <span className="mt-4 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>{loading ? 'Checking availability…' : unavailable ? 'Temporarily unavailable' : 'Browse existing listings · actions depend on service settings'}</span>
                  {!loading && access.enabled && <ArrowUpRight className="h-4 w-4 text-violet-700 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-violet-300" />}
                </span>
              </button>
            );
          })}
        </section>

        {!loading && flags && resolveServicesModuleAccess(flags, 'services').enabled && (
          <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800" aria-labelledby="local-services-title">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">Browse by need</p>
                <h2 id="local-services-title" className="mt-1 text-2xl font-black">Local services</h2>
              </div>
              <p className="max-w-lg text-sm text-slate-600 dark:text-slate-300">Choose a service type to see current listings. Listing and booking details are shown by the existing marketplace.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {activeServiceCategories.map((category) => (
                <button key={category.id} type="button" onClick={() => onNavigate('services', category.id)} className="flex min-h-24 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 dark:border-slate-800 dark:bg-slate-900">
                  <span aria-hidden="true" className="text-2xl">{category.emoji}</span>
                  <span className="min-w-0"><span className="block font-bold leading-snug">{category.name}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{category.subcategories.length} service types</span></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading service categories" aria-busy="true">
            {moduleCards.map((card) => <div key={card.key} className="h-44 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800" />)}
          </div>
        )}
      </div>
    </div>
  );
}
