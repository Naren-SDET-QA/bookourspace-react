import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  AdminThemeSettings,
  loadAdminThemeSettings,
} from '../utils/adminEnterpriseStore';

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
    '/assets/aistudio/Blue-letter_logo_with_orange_map-pin_emblem_14d3b883.png';
  const tagline = activeTheme.brandTagline || 'FIND • BOOK • ENJOY';
  const spinGlobe = activeTheme.showGlobeAnimation !== false;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 cursor-pointer select-none min-w-0 group"
      title={`BOS — BookOurSpace (${tagline})`}
    >
      <style>{`
        @keyframes bosGlobeRotate360 {
          0% {
            transform: perspective(500px) rotateY(0deg);
          }
          50% {
            transform: perspective(500px) rotateY(180deg) scale(1.06);
          }
          100% {
            transform: perspective(500px) rotateY(360deg);
          }
        }
        .bos-globe-letter-o {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transform-style: preserve-3d;
          animation: bosGlobeRotate360 3.6s linear infinite;
        }
      `}</style>

      {/* B [360° Rotating Globe O] S Emblem Badge */}
      <div
        style={{ borderColor: `${activeTheme.primaryBrandColor}40` }}
        className={`relative flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border-2 shadow-2xs shrink-0 transition-all ${
          compact ? 'h-6.5 sm:h-8 px-1 sm:px-1.5 py-0.5' : 'h-8 sm:h-10 px-1.5 py-0.5'
        }`}
      >
        <div className="flex items-center font-black tracking-tighter leading-none select-none">
          {/* Left Letter B */}
          <span
            style={{ color: activeTheme.primaryBrandColor }}
            className={`${compact ? 'text-[11px] sm:text-base' : 'text-xs sm:text-lg'} font-black drop-shadow-2xs`}
          >
            B
          </span>

          {/* Middle Letter O — Rotates 360 Degrees Like a Globe */}
          <span
            style={{
              backgroundColor: activeTheme.accentColor,
            }}
            className={`${
              spinGlobe ? 'bos-globe-letter-o' : 'inline-flex items-center justify-center'
            } mx-0.5 relative ${
              compact ? 'w-3 h-3 sm:w-4.5 sm:h-4.5' : 'w-3.5 h-3.5 sm:w-5 sm:h-5'
            } rounded-full p-0.5 shadow-[0_0_8px_rgba(245,158,11,0.5)] ring-1 ring-amber-300 shrink-0`}
          >
            <img
              src={logoSrc}
              alt="O"
              className="w-full h-full object-contain rounded-full bg-white"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  '/assets/aistudio/Blue-letter_logo_with_orange_map-pin_emblem_14d3b883.png';
              }}
            />
          </span>

          {/* Right Letter S */}
          <span
            style={{ color: activeTheme.primaryBrandColor }}
            className={`${compact ? 'text-[11px] sm:text-base' : 'text-xs sm:text-lg'} font-black drop-shadow-2xs`}
          >
            S
          </span>
        </div>
      </div>

      {/* English Brand Name: BookOurSpace + VERIFIED Pill + Single-Line Tagline */}
      <div className="flex flex-col justify-center leading-none min-w-0">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap min-w-0">
          <span
            className={`font-black ${
              compact ? 'text-[12px] sm:text-base' : 'text-[13px] sm:text-lg'
            } tracking-tight whitespace-nowrap shrink-0 flex items-center`}
            translate="no"
          >
            <span className="text-[#0F172A] dark:text-white">Book</span>
            <span style={{ color: activeTheme.accentColor }}>Our</span>
            <span
              style={{ color: activeTheme.primaryBrandColor }}
              className="dark:text-purple-300"
            >
              Space
            </span>
          </span>

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
        </div>

        {subtitleItems && subtitleItems.length > 0 ? (
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-[#64748B] dark:text-slate-400 font-bold tracking-tight mt-0.5 truncate">
            <span
              style={{ color: activeTheme.accentColor }}
              className="text-[9px] font-black tracking-widest uppercase mr-1"
            >
              {tagline}
            </span>
            <span className="text-slate-300">|</span>
            {subtitleItems.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span style={{ color: activeTheme.accentColor }}>•</span>}
                <span
                  className={
                    idx === subtitleItems.length - 1
                      ? 'text-[#0F172A] dark:text-slate-200 font-black'
                      : ''
                  }
                >
                  {item}
                </span>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div
            className={`${
              compact ? 'text-[6px] sm:text-[8px] tracking-[0.06em]' : 'text-[6.5px] sm:text-[8.5px] tracking-[0.08em]'
            } sm:tracking-[0.14em] font-black text-[#64748B] dark:text-slate-400 uppercase mt-0.5 whitespace-nowrap truncate`}
          >
            {tagline}
          </div>
        )}
      </div>
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
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(25);
  const [statusText, setStatusText] = useState(
    'Self-Healing Modular Engine & 360° Globe Ready...'
  );
  const theme = loadAdminThemeSettings();

  useEffect(() => {
    const t1 = setTimeout(() => setProgress(70), 300);
    const t2 = setTimeout(() => setProgress(100), 650);
    const t3 = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 950);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

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
      <style>{`
        @keyframes globeSpin360Splash {
          0% {
            transform: perspective(700px) rotateY(0deg) rotateZ(0deg) scale(1);
          }
          50% {
            transform: perspective(700px) rotateY(180deg) rotateZ(8deg) scale(1.12);
          }
          100% {
            transform: perspective(700px) rotateY(360deg) rotateZ(0deg) scale(1);
          }
        }
        .splash-globe-o {
          display: inline-flex;
          transform-style: preserve-3d;
          animation: globeSpin360Splash 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>

      {/* Center Brand Card with Overlaying 360° Rotating Globe */}
      <div className="relative mb-5 flex items-center justify-center">
        <div className="absolute -inset-6 rounded-full bg-gradient-to-r from-blue-500/20 via-orange-500/30 to-indigo-500/20 blur-2xl animate-pulse" />

        {/* Giant B - [360° Globe O] - S Lockup */}
        <div className="relative bg-white/95 rounded-3xl px-7 py-5 shadow-2xl border-2 border-amber-400/60 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <span
              style={{ color: theme.primaryBrandColor }}
              className="text-5xl sm:text-6xl font-black"
            >
              B
            </span>

            {/* Middle Letter O Rotating 360 Degrees Like a 3D Globe */}
            <div
              style={{ backgroundColor: theme.accentColor }}
              className="splash-globe-o w-16 h-16 sm:w-20 sm:h-20 rounded-full p-1 shadow-[0_0_30px_rgba(234,88,12,0.65)] flex items-center justify-center ring-4 ring-orange-400/30"
            >
              <img
                src={
                  theme.brandLogoEmblemUrl ||
                  '/assets/aistudio/Blue-letter_logo_with_orange_map-pin_emblem_14d3b883.png'
                }
                alt="BOS Rotating Globe O"
                className="w-full h-full object-contain rounded-full bg-white"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    '/assets/aistudio/Blue-letter_logo_with_orange_map-pin_emblem_14d3b883.png';
                }}
              />
            </div>

            <span
              style={{ color: theme.primaryBrandColor }}
              className="text-5xl sm:text-6xl font-black"
            >
              S
            </span>
          </div>

          {/* English Brand Name */}
          <div
            className="text-2xl sm:text-3xl font-black tracking-tight flex items-center"
            translate="no"
          >
            <span className="text-[#0F172A]">Book</span>
            <span style={{ color: theme.accentColor }} className="splash-globe-o mx-0.5">
              O
            </span>
            <span style={{ color: theme.accentColor }}>ur</span>
            <span style={{ color: theme.primaryBrandColor }}>Space</span>
          </div>

          <div className="text-[11px] font-black tracking-[0.25em] text-slate-600 uppercase">
            {theme.brandTagline || 'FIND • BOOK • ENJOY'}
          </div>
        </div>
      </div>

      {/* Self-Healing Modular Status Bar */}
      <div className="w-64 sm:w-80 bg-slate-800/80 h-2 rounded-full overflow-hidden border border-slate-700 mb-2">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-amber-400 to-emerald-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>{statusText}</span>
      </div>
    </div>
  );
};
