import { useEffect, useState } from 'react';
import { ArrowUp, HelpCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import {
  parsePrivacyConsent,
  parseUtmFromSearch,
  PRIVACY_STORAGE_KEY,
  serializeUtmCampaign,
  shouldShowCookieBanner,
  stripUtmFromSearch,
  UTM_STORAGE_KEY,
  type PrivacyChoice,
} from '../lib/privacyConsent';

function getScrollMetrics() {
  const shell = document.querySelector('.bos-app-shell:not(.bos-app-shell-bento)') as HTMLElement | null;
  if (shell && shell.scrollHeight > shell.clientHeight + 24) {
    return {
      target: shell as HTMLElement | Window,
      top: shell.scrollTop,
      max: Math.max(1, shell.scrollHeight - shell.clientHeight),
    };
  }
  const doc = document.documentElement;
  return {
    target: window as HTMLElement | Window,
    top: window.scrollY || doc.scrollTop,
    max: Math.max(1, doc.scrollHeight - window.innerHeight),
  };
}

function persistConsent(choice: PrivacyChoice, pendingUtm: Record<string, string> | null) {
  try {
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
    if (choice === 'analytics' && pendingUtm) {
      sessionStorage.setItem(UTM_STORAGE_KEY, serializeUtmCampaign(pendingUtm));
    } else {
      sessionStorage.removeItem(UTM_STORAGE_KEY);
    }
  } catch {
    /* private mode */
  }
}

export default function SiteChrome({ onOpenHelp }: { onOpenHelp: () => void }) {
  const isNative = Capacitor.isNativePlatform();
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [pendingUtm, setPendingUtm] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const utm = parseUtmFromSearch(window.location.search);
    if (utm) {
      setPendingUtm(utm);
      const nextSearch = stripUtmFromSearch(window.location.search);
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${nextSearch}${window.location.hash}`);
    }
    try {
      const stored = localStorage.getItem(PRIVACY_STORAGE_KEY);
      setBannerOpen(shouldShowCookieBanner(isNative, stored));
      const consent = parsePrivacyConsent(stored);
      if (consent?.choice === 'analytics' && utm) {
        sessionStorage.setItem(UTM_STORAGE_KEY, serializeUtmCampaign(utm));
      }
    } catch {
      setBannerOpen(!isNative);
    }
  }, [isNative]);

  useEffect(() => {
    const onScroll = () => {
      const { top, max } = getScrollMetrics();
      setProgress(Math.min(100, Math.max(0, (top / max) * 100)));
      setShowTop(top > 420);
    };
    onScroll();
    const shell = document.querySelector('.bos-app-shell:not(.bos-app-shell-bento)');
    shell?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      shell?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const scrollToTop = () => {
    const { target } = getScrollMetrics();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (target === window) window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    else (target as HTMLElement).scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  const choosePrivacy = (choice: PrivacyChoice) => {
    persistConsent(choice, pendingUtm);
    setBannerOpen(false);
  };

  return (
    <>
      <div className="bos-scroll-progress" data-bos-chrome="progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <AnimatePresence initial={false}>
        {showTop && (
          <motion.button
            key="back-to-top"
            type="button"
            className="bos-back-to-top"
            data-bos-chrome="back-to-top"
            onClick={scrollToTop}
            aria-label="Back to top"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            whileTap={{ scale: 0.94 }}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        className="bos-help-fab"
        data-bos-chrome="help"
        onClick={onOpenHelp}
        aria-label="Help and frequently asked questions"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
      >
        <HelpCircle className="h-5 w-5" aria-hidden="true" />
        <span className="hidden sm:inline">Help</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {bannerOpen && (
          <motion.div
            key="privacy-banner"
            className="bos-cookie-banner"
            data-bos-chrome="cookie"
            role="dialog"
            aria-label="Privacy choices"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">Privacy on BookOurSpace</p>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  Essential cookies keep sign-in, bookings and payments working. Optional campaign tags (UTM) stay on this device only if you allow them. Nothing is sold to advertisers.
                </p>
              </div>
              <button type="button" className="rounded-full p-1 text-slate-500" onClick={() => choosePrivacy('essential')} aria-label="Dismiss privacy notice">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => choosePrivacy('essential')} className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-bold dark:border-slate-600">
                Essential only
              </button>
              <button type="button" onClick={() => choosePrivacy('analytics')} className="min-h-10 rounded-xl bg-indigo-700 px-3 text-xs font-black text-white">
                Allow campaign tags
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
