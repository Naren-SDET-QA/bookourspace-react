export type AdminPublishState = 'draft' | 'published';

export interface AdminThemeSettings {
  primaryBrandColor: string;
  accentColor: string;
  surfaceBackgroundLight: string;
  surfaceBackgroundDark: string;
  themeMode: 'light' | 'dark' | 'system';
  brandLogoEmblemUrl: string;
  brandTagline: string;
  showGlobeAnimation: boolean;
  /** official = current BookOurSpace lockup; classic_bos_letters = zip B [rotating O] S badge */
  brandLockupStyle: 'official' | 'classic_bos_letters';
  borderRadiusStyle: 'rounded' | 'sharp' | 'pill';
  compactDensity: boolean;
  presetName: string;
  updatedBy: string;
  updatedAt: string;
  publishState: AdminPublishState;
}

const THEME_SETTINGS_KEY = 'bos_admin_theme_settings_v2';

export const DEFAULT_THEME_SETTINGS: AdminThemeSettings = {
  primaryBrandColor: '#4338CA',
  accentColor: '#EA580C',
  surfaceBackgroundLight: '#FDF6FA',
  surfaceBackgroundDark: '#020617',
  themeMode: 'light',
  brandLogoEmblemUrl: '/assets/optimized/brand-emblem-512.webp',
  brandTagline: 'FIND • BOOK • ENJOY',
  showGlobeAnimation: true,
  brandLockupStyle: 'official',
  borderRadiusStyle: 'rounded',
  compactDensity: false,
  presetName: 'BookOurSpace Signature Indigo & Saffron',
  updatedBy: 'Narendra (Super Admin)',
  updatedAt: '2026-10-28 09:00',
  publishState: 'published',
};

export const loadAdminThemeSettings = (): AdminThemeSettings => {
  try {
    const raw = localStorage.getItem(THEME_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_THEME_SETTINGS, ...JSON.parse(raw) };
  } catch { /* inaccessible or invalid browser storage uses the documented defaults */ }
  return { ...DEFAULT_THEME_SETTINGS };
};

export const saveAdminThemeSettings = (theme: AdminThemeSettings) => {
  try { localStorage.setItem(THEME_SETTINGS_KEY, JSON.stringify(theme)); } catch { /* quota/private-mode */ }
  window.dispatchEvent(new CustomEvent('bos-theme-settings-updated', { detail: theme }));
};

/** Apply the selected Admin theme without importing the full Admin data store into the app shell. */
export const applyThemeSettingsToDocument = (theme: AdminThemeSettings) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--bos-primary', theme.primaryBrandColor);
  root.style.setProperty('--bos-accent', theme.accentColor);
  root.style.setProperty('--bos-surface-light', theme.surfaceBackgroundLight);
  root.style.setProperty('--bos-surface-dark', theme.surfaceBackgroundDark);

  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldBeDark = theme.themeMode === 'dark' || (theme.themeMode === 'system' && prefersDark);
  if (shouldBeDark) {
    root.classList.add('dark');
    try { localStorage.setItem('theme_mode', 'dark'); } catch {}
  } else {
    root.classList.remove('dark');
    try { localStorage.setItem('theme_mode', 'light'); } catch {}
  }

  let styleEl = document.getElementById('bos-enterprise-theme-vars') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'bos-enterprise-theme-vars';
    document.head.appendChild(styleEl);
  }
  const radiusRule = theme.borderRadiusStyle === 'sharp'
    ? '.rounded-3xl, .rounded-2xl, .rounded-xl { border-radius: 6px !important; }'
    : theme.borderRadiusStyle === 'pill'
      ? 'button.rounded-xl, button.rounded-2xl { border-radius: 9999px !important; }'
      : '';
  styleEl.textContent = `
    :root { --bos-primary: ${theme.primaryBrandColor}; --bos-accent: ${theme.accentColor}; --bos-surface-light: ${theme.surfaceBackgroundLight}; --bos-surface-dark: ${theme.surfaceBackgroundDark}; }
    html:not(.dark) body, html:not(.dark) .bg-\\[\\#FDF6FA\\] { background-color: ${theme.surfaceBackgroundLight} !important; }
    html.dark body, html.dark .dark\\:bg-slate-950 { background-color: ${theme.surfaceBackgroundDark} !important; }
    .bg-\\[\\#4338CA\\], .bg-\\[\\#4A148C\\], .bg-\\[\\#3730A3\\] { background-color: ${theme.primaryBrandColor} !important; }
    .text-\\[\\#4338CA\\], .text-\\[\\#3730A3\\] { color: ${theme.primaryBrandColor} !important; }
    .border-\\[\\#4338CA\\] { border-color: ${theme.primaryBrandColor} !important; }
    ${radiusRule}
  `;
};
