import React, { useState, useEffect } from 'react';
import BOSRotatingLocationSymbol from './BOSRotatingLocationSymbol';
import BOSOfficialLogo, { BOS_OFFICIAL_LOGO_STATIC } from './BOSOfficialLogo';
import {
  AdminThemeSettings,
  loadAdminThemeSettings,
} from '../utils/adminPresentationStore';

interface BOSBrandLogoProps {
  onClick?: () => void;
  verifiedLabel?: string;
  isVerifiedActive?: boolean;
  onVerifiedClick?: () => void;
  subtitleItems?: string[];
  compact?: boolean;
  overrideTheme?: AdminThemeSettings;
}

/**
 * Official English Brand Lockup for BOS — BookOurSpace
 * Dynamically applies published or previewed Theme Management settings
 * (logo emblem, primary & accent colors, tagline, and 360° globe rotation).
 */
export const BOSBrandLogo: React.FC<BOSBrandLogoProps> = ({
  onClick,
  verifiedLabel = 'VERIFIED',
  isVerifiedActive = false,
  onVerifiedClick,
  subtitleItems,
  compact = false,
  overrideTheme,
}) => {
  const [savedTheme, setSavedTheme] = useState<AdminThemeSettings>(() =>
    loadAdminThemeSettings()
  );

  useEffect(() => {
    const handleSync = (e?: Event) => {
      const customEv = e as CustomEvent<AdminThemeSettings>;
      if (customEv?.detail) {
        setSavedTheme(customEv.detail);
      } else {
        setSavedTheme(loadAdminThemeSettings());
      }
    };
    window.addEventListener('bos-theme-settings-updated', handleSync);
    window.addEventListener('bos-admin-enterprise-updated', handleSync);
    return () => {
      window.removeEventListener('bos-theme-settings-updated', handleSync);
      window.removeEventListener('bos-admin-enterprise-updated', handleSync);
    };
  }, []);

  const activeTheme = overrideTheme || savedTheme;
  const logoSrc =
    activeTheme.brandLogoEmblemUrl ||
    '/assets/optimized/brand-emblem-512.webp';
  const tagline = activeTheme.brandTagline || 'FIND • BOOK • ENJOY';
  const spinGlobe = activeTheme.showGlobeAnimation !== false;
  const useClassicBosLetters = activeTheme.brandLockupStyle === 'classic_bos_letters';
  const useOfficialLogo =
    !useClassicBosLetters &&
    (!activeTheme.brandLogoEmblemUrl ||
      activeTheme.brandLogoEmblemUrl === '/assets/optimized/brand-emblem-512.webp' ||
      activeTheme.brandLogoEmblemUrl === BOS_OFFICIAL_LOGO_STATIC);
  const letterOSrc =
    logoSrc === BOS_OFFICIAL_LOGO_STATIC || logoSrc.includes('bos-logo-lockup')
      ? '/assets/optimized/brand-emblem-512.webp'
      : logoSrc;
  const verifiedControl = (
    <button
      type="button"
      onClick={(e) => {
        if (onVerifiedClick) {
          e.stopPropagation();
          onVerifiedClick();
        }
      }}
      title={
        isVerifiedActive
          ? 'Verified Only Filter Active — Click to Show All'
          : 'Click to Filter Verified Listings Only'
      }
      className={`font-black ${
        compact ? 'text-[6.5px] sm:text-[8.5px] px-1 py-0.25' : 'text-[7px] sm:text-[9px] px-1 sm:px-1.5 py-0.5'
      } rounded-full uppercase tracking-wider border transition-all shrink-0 whitespace-nowrap cursor-pointer ${
        isVerifiedActive
          ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_2px_8px_rgba(16,185,129,0.45)] ring-1 ring-emerald-300/60'
          : 'bg-emerald-50 dark:bg-emerald-950/90 text-[#15803D] dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/80'
      }`}
    >
      {isVerifiedActive ? `✓ ${verifiedLabel}` : verifiedLabel}
    </button>
  );

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-1.5 cursor-pointer select-none min-w-0 group"
      title={`BOS — BookOurSpace (${tagline})`}
    >
      {useClassicBosLetters && (
        <style>{`
          @keyframes bosGlobeRotate360 {
            0% { transform: perspective(500px) rotateY(0deg); }
            50% { transform: perspective(500px) rotateY(180deg) scale(1.06); }
            100% { transform: perspective(500px) rotateY(360deg); }
          }
          .bos-globe-letter-o {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transform-style: preserve-3d;
            animation: bosGlobeRotate360 3.6s linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .bos-globe-letter-o { animation: none; }
          }
        `}</style>
      )}
      {useClassicBosLetters ? (
        <>
          <div
            style={{ borderColor: `${activeTheme.primaryBrandColor}40` }}
            className={`relative flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border-2 shadow-sm px-1.5 py-1 shrink-0 ${
              compact ? 'h-8' : 'h-9 sm:h-10'
            }`}
          >
            <div className="flex items-center font-black tracking-tighter leading-none select-none">
              <span
                style={{ color: activeTheme.primaryBrandColor }}
                className="text-base sm:text-xl font-black"
              >
                B
              </span>
              <span
                style={{ backgroundColor: activeTheme.accentColor }}
                className={`${
                  spinGlobe ? 'bos-globe-letter-o' : 'inline-flex items-center justify-center'
                } mx-0.5 relative w-5 h-5 sm:w-6 sm:h-6 rounded-full p-0.5 shadow-[0_0_10px_rgba(245,158,11,0.55)] ring-1 ring-amber-300`}
              >
                <img
                  src={letterOSrc}
                  alt=""
                  className="w-full h-full object-contain rounded-full bg-white"
                />
              </span>
              <span
                style={{ color: activeTheme.primaryBrandColor }}
                className="text-base sm:text-xl font-black"
              >
                S
              </span>
            </div>
          </div>
          <div className="flex flex-col leading-none min-w-0">
            <span
              className="font-black text-sm sm:text-xl tracking-tight truncate flex items-center"
              translate="no"
            >
              <span className="text-[#0F172A] dark:text-white">Book</span>
              <span
                style={{ color: activeTheme.accentColor }}
                className={`${spinGlobe ? 'bos-globe-letter-o' : ''} inline-flex items-center justify-center font-black mx-[0.5px]`}
              >
                O
              </span>
              <span style={{ color: activeTheme.accentColor }}>ur</span>
              <span style={{ color: activeTheme.primaryBrandColor }}>Space</span>
            </span>
            <span className="mt-1 text-[7px] font-black tracking-wider text-slate-500 uppercase truncate">
              {tagline}
            </span>
          </div>
        </>
      ) : useOfficialLogo ? (
        <BOSOfficialLogo
          animated={spinGlobe}
          className={compact ? 'w-[min(42vw,150px)] sm:w-[150px]' : 'w-[min(54vw,210px)] sm:w-[210px]'}
          alt="BookOurSpace official logo"
        />
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          <BOSRotatingLocationSymbol
            src={logoSrc}
            animate={spinGlobe}
            alt="Custom BookOurSpace brand emblem"
            className={compact ? 'h-7 w-6.5' : 'h-9 w-8'}
          />
          <div className="flex flex-col leading-none min-w-0">
            <span className="font-black tracking-tight whitespace-nowrap" translate="no">
              <span className="text-[#0F172A] dark:text-white">Book</span>
              <span style={{ color: activeTheme.accentColor }}>Our</span>
              <span style={{ color: activeTheme.primaryBrandColor }}>Space</span>
            </span>
            <span className="mt-1 text-[7px] font-black tracking-wider text-slate-500 uppercase truncate">
              {tagline}
            </span>
          </div>
        </div>
      )}
      {verifiedControl}
      {subtitleItems && subtitleItems.length > 0 && (
        <span className="hidden lg:inline text-[10px] text-slate-500 truncate">
          {subtitleItems.join(' • ')}
        </span>
      )}
    </div>
  );
};

/**
 * Triggers the global 360° Globe-Rotating Brand Loading Overlay for any asynchronous operation
 * (data fetching, payment processing, invoice generation, sync operations).
 */
export function triggerGlobalGlobeLoader(
  statusLabel = 'Synchronizing Self-Healing Modular Data...',
  durationMs = 700
) {
  try {
    window.dispatchEvent(
      new CustomEvent('bos-global-globe-loader', {
        detail: { statusLabel, durationMs },
      })
    );
  } catch {
    // ignore
  }
}

/**
 * Full-Screen / Global Async Loading Experience where the brand name is displayed in the center
 * with an overlaying globe icon rotating 360 degrees while self-healing modules or async operations run.
 */
export const BOSGlobeLoadingScreen: React.FC<{
  onComplete?: () => void;
}> = ({ onComplete }) => {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(25);
  const [statusText, setStatusText] = useState(
    'Self-Healing Modular Engine & 360° Globe Ready...'
  );

  useEffect(() => {
    let timer1: ReturnType<typeof setTimeout> | null = null;
    let timer2: ReturnType<typeof setTimeout> | null = null;
    const handleGlobalAsync = (ev: Event) => {
      const customEv = ev as CustomEvent<{ statusLabel?: string; durationMs?: number }>;
      const label =
        customEv?.detail?.statusLabel ||
        'Processing Asynchronous Operation...';
      const duration = Math.min(Math.max(customEv?.detail?.durationMs || 650, 300), 2500);
      setStatusText(label);
      setProgress(35);
      setVisible(true);
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
      timer1 = setTimeout(() => setProgress(95), Math.round(duration * 0.55));
      timer2 = setTimeout(() => {
        setProgress(100);
        setVisible(false);
      }, duration);
    };
    window.addEventListener('bos-global-globe-loader', handleGlobalAsync);
    return () => {
      window.removeEventListener('bos-global-globe-loader', handleGlobalAsync);
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md text-white flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-150">
      {/* Centered official lockup; animation is part of the supplied logo frames. */}
      <div className="relative mb-5 flex items-center justify-center">
        <div className="rounded-3xl bg-white/95 p-4 shadow-2xl border-2 border-amber-400/60">
          <BOSOfficialLogo animated loading="eager" className="w-[min(82vw,400px)]" />
        </div>
      </div>

      {/* Self-Healing Modular Status Bar */}
      <div className="w-64 sm:w-80 bg-slate-800/80 h-2 rounded-full overflow-hidden border border-slate-700 mb-2">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-amber-400 to-emerald-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="text-xs font-bold text-amber-300">{statusText}</div>
    </div>
  );
};
