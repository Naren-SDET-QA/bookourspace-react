import React from 'react';
import { ArrowRight, CheckCircle2, MapPin } from 'lucide-react';
import SafeImage from './SafeImage';
import type { AppLanguage } from '../utils/translations';

interface MarketplaceHeroProps {
  currentLang: AppLanguage;
  selectedLocationLabel?: string;
  listingCount: number;
  verifiedListingCount: number;
  heroImage?: string;
  onOpenLocationSelector?: () => void;
  onExplore: () => void;
}

const formatCount = (value: number) => new Intl.NumberFormat('en-IN').format(Math.max(0, value));

export const MarketplaceHero: React.FC<MarketplaceHeroProps> = ({
  currentLang,
  selectedLocationLabel,
  listingCount,
  verifiedListingCount,
  heroImage,
  onOpenLocationSelector,
  onExplore,
}) => {
  const copy = currentLang === 'te'
    ? {
        explore: 'లిస్టింగ్‌లను చూడండి',
        location: 'లొకేషన్ ఎంచుకోండి',
        listings: 'యాక్టివ్ లిస్టింగ్‌లు',
        verified: 'వెరిఫైడ్ లిస్టింగ్‌లు',
        modules: 'మార్కెట్ మాడ్యూల్స్',
        realMedia: 'వాస్తవ లిస్టింగ్ మీడియా',
      }
    : currentLang === 'hi'
    ? {
        explore: 'लिस्टिंग देखें',
        location: 'लोकेशन चुनें',
        listings: 'सक्रिय लिस्टिंग',
        verified: 'वेरिफाइड लिस्टिंग',
        modules: 'मार्केट मॉड्यूल',
        realMedia: 'वास्तविक लिस्टिंग मीडिया',
      }
    : {
        explore: 'Explore listings',
        location: 'Choose location',
        listings: 'Active listings',
        verified: 'Verified listings',
        modules: 'Market modules',
        realMedia: 'Real listing media',
      };

  return (
    <section
      aria-label="BookOurSpace Marketplace"
      className="relative isolate overflow-hidden rounded-[24px] border border-emerald-200/80 bg-[#F0F8EE] px-4 py-5 shadow-[0_12px_32px_-20px_rgba(15,118,110,0.35)] dark:border-emerald-900/70 dark:bg-[#10231F] sm:px-7 sm:py-7"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-emerald-200/60 blur-3xl dark:bg-emerald-800/30" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-1/3 h-36 w-36 rounded-full bg-lime-200/60 blur-3xl dark:bg-lime-900/20" />

      <div className="relative z-10 grid items-center gap-5 sm:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.8fr)] sm:gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onExplore}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-900 px-4 text-xs font-black text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-950 active:scale-[0.98] motion-reduce:transition-none dark:bg-emerald-200 dark:text-emerald-950 dark:hover:bg-emerald-100"
            >
              <span>{copy.explore}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenLocationSelector}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-emerald-400 bg-white/80 px-4 text-xs font-black text-emerald-950 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-950 motion-reduce:transition-none dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              <span className="max-w-[12rem] truncate">{selectedLocationLabel || copy.location}</span>
            </button>
          </div>

          <dl className="mt-5 grid max-w-xl grid-cols-3 gap-2 border-t border-emerald-300/70 pt-4 dark:border-emerald-800/70">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/65 dark:text-emerald-200/65">{copy.listings}</dt>
              <dd className="mt-0.5 text-lg font-black text-emerald-950 dark:text-white">{formatCount(listingCount)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/65 dark:text-emerald-200/65">{copy.verified}</dt>
              <dd className="mt-0.5 text-lg font-black text-emerald-950 dark:text-white">{formatCount(verifiedListingCount)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-emerald-900/65 dark:text-emerald-200/65">{copy.modules}</dt>
              <dd className="mt-0.5 text-lg font-black text-emerald-950 dark:text-white">6</dd>
            </div>
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-[280px] sm:max-w-none">
          <div className="aspect-[4/3] overflow-hidden rounded-[22px] border-4 border-white/90 bg-emerald-900/10 shadow-[0_16px_32px_-18px_rgba(6,78,59,0.55)] dark:border-emerald-100/10">
            {heroImage ? (
              <SafeImage
                category="general"
                src={heroImage}
                alt="Featured BookOurSpace listing"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-emerald-100 via-lime-50 to-white text-center dark:from-emerald-950 dark:via-emerald-900/60 dark:to-slate-900">
                <MapPin className="h-9 w-9 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                <span className="px-5 text-xs font-black text-emerald-950 dark:text-emerald-100">{copy.realMedia}</span>
              </div>
            )}
          </div>
          <div className="absolute -bottom-3 -left-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-black text-emerald-950 shadow-md dark:border-emerald-800 dark:bg-slate-950 dark:text-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
            <span>{copy.realMedia}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
