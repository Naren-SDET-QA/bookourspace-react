/**
 * Admin-controlled per-section style selection.
 * PG       → BookOurSpace Style 1 (classic list) or Style 2
 * Stay     → BookOurSpace Stay 1 or Stay 2
 * Services → Old (listing page) or Triangle style (services app)
 * Persisted in localStorage and applied when each section opens.
 */

export type PgStyle = 'style1' | 'style2' | 'style3';
export type StayStyle = 'old' | 'airbnb' | 'style3';
export type ServicesStyle = 'old' | 'triangle' | 'noddyy';
export type ClassesStyle = 'cards' | 'timetable' | 'style3';
export type VenuesStyle = 'showcase' | 'agenda' | 'style3';
export type MoviesStyle = 'experience' | 'classic' | 'style3';

export interface SectionStyles {
  pg: PgStyle;
  stay: StayStyle;
  services: ServicesStyle;
  classes: ClassesStyle;
  venues: VenuesStyle;
  movies: MoviesStyle;
}

const KEY = 'bos_section_styles_v2';
/** A visitor's explicit Style 1/2/3 choice, kept across navigation and reloads. */
const PREFS_KEY = 'bos_section_style_prefs_v1';
export const SECTION_STYLES_EVENT = 'bos-section-styles-changed';

const VALID_VALUES: Record<keyof SectionStyles, readonly string[]> = {
  pg: ['style1', 'style2', 'style3'],
  stay: ['old', 'airbnb', 'style3'],
  services: ['old', 'triangle', 'noddyy'],
  classes: ['cards', 'timetable', 'style3'],
  venues: ['showcase', 'agenda', 'style3'],
  movies: ['experience', 'classic', 'style3'],
};

function validStyles(input: unknown): Partial<SectionStyles> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const parsed = input as Record<string, unknown>;
  const out: Partial<SectionStyles> = {};
  for (const key of Object.keys(VALID_VALUES) as Array<keyof SectionStyles>) {
    const value = parsed[key];
    if (typeof value === 'string' && VALID_VALUES[key].includes(value)) {
      out[key] = value as never;
    }
  }
  return out;
}

export function loadStylePreferences(): Partial<SectionStyles> {
  try {
    if (typeof localStorage === 'undefined') return {};
    return validStyles(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
  } catch {
    return {};
  }
}

/** Persist one section's explicit choice; it wins over later defaults. */
export function saveStylePreference<K extends keyof SectionStyles>(section: K, value: SectionStyles[K]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const next = { ...loadStylePreferences(), [section]: value };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SECTION_STYLES_EVENT));
  } catch {
    // Storage can be unavailable in private mode; the in-memory state still applies.
  }
}

export type SectionStyleSaveResult = 'published' | 'local-only' | 'failed';

const localPreferencesEnabled = () => import.meta.env?.DEV === true;

function saveLocalCache(next: SectionStyles) {
  if (!localPreferencesEnabled()) return;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  try { window.dispatchEvent(new Event(SECTION_STYLES_EVENT)); } catch { /* no window */ }
}

const DEFAULTS: SectionStyles = {
  // Style 1 is the classic, data-rich layout for every section and is the
  // first view a fresh visitor sees.
  pg: 'style1',
  stay: 'old',
  services: 'old',
  classes: 'cards',
  venues: 'showcase',
  movies: 'experience',
};

export function loadSectionStyles(): SectionStyles {
  const preferences = loadStylePreferences();
  // A browser-local preference may help development, but must never replace a
  // centrally published production design on a device that has stale storage.
  if (!localPreferencesEnabled()) return { ...DEFAULTS, ...preferences };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, ...preferences };
    const parsed = JSON.parse(raw) as Partial<SectionStyles>;
    return {
      pg: parsed.pg === 'style1' || parsed.pg === 'style2' || parsed.pg === 'style3' ? parsed.pg : DEFAULTS.pg,
      stay: parsed.stay === 'old' || parsed.stay === 'airbnb' || parsed.stay === 'style3' ? parsed.stay : DEFAULTS.stay,
      services:
        parsed.services === 'old' || parsed.services === 'triangle' || parsed.services === 'noddyy'
          ? parsed.services
          : DEFAULTS.services,
      classes: parsed.classes === 'timetable' || parsed.classes === 'style3' ? parsed.classes : DEFAULTS.classes,
      venues: parsed.venues === 'agenda' || parsed.venues === 'style3' ? parsed.venues : DEFAULTS.venues,
      movies: parsed.movies === 'classic' || parsed.movies === 'style3' ? parsed.movies : DEFAULTS.movies,
      ...preferences,
    };
  } catch {
    return { ...DEFAULTS, ...preferences };
  }
}

export function applyRemoteSectionStyles(value: unknown, sectionStylesVersion?: number): SectionStyles | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<SectionStyles> & { sectionStylesVersion?: number };
  // Configs published before the unified Style 1/2/3 switch carried the old
  // defaults (PG Style 2 / Stay Style 2). Treat those as Style 1 once, so every
  // existing install opens with the classic layouts. A config republished by
  // the new Admin carries sectionStylesVersion: 2 and is respected verbatim.
  const legacyDefaults = (sectionStylesVersion ?? parsed.sectionStylesVersion) !== 2;
  const next = {
    ...loadSectionStyles(),
    pg: legacyDefaults && parsed.pg === 'style2'
      ? 'style1'
      : parsed.pg === 'style1' || parsed.pg === 'style2' || parsed.pg === 'style3' ? parsed.pg : loadSectionStyles().pg,
    stay: legacyDefaults && parsed.stay === 'airbnb'
      ? 'old'
      : parsed.stay === 'old' || parsed.stay === 'airbnb' || parsed.stay === 'style3' ? parsed.stay : loadSectionStyles().stay,
    services: parsed.services === 'old' || parsed.services === 'triangle' || parsed.services === 'noddyy' ? parsed.services : loadSectionStyles().services,
    classes: parsed.classes === 'timetable' || parsed.classes === 'style3' ? parsed.classes : 'cards',
    venues: parsed.venues === 'agenda' || parsed.venues === 'style3' ? parsed.venues : 'showcase',
    movies: parsed.movies === 'classic' || parsed.movies === 'style3' ? parsed.movies : 'experience',
  } as SectionStyles;
  saveLocalCache(next);
  // An explicit visitor choice survives navigation, refresh and later config
  // refreshes; the published style remains the default for everyone else.
  return { ...next, ...loadStylePreferences() };
}

export async function saveSectionStyles(next: SectionStyles): Promise<SectionStyleSaveResult> {
  // The API re-verifies the signed session and the database role. Never treat
  // a browser cache write as a published setting.
  try {
    if (typeof window !== 'undefined') {
      const token = window.localStorage.getItem('bos_session_token_v1');
      if (token) {
        const response = await fetch('/api/live-page-config/section-styles', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-bos-session-token': token },
          body: JSON.stringify({ styles: next }),
          cache: 'no-store',
        });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.ok === true && result?.okStyles === true) {
          saveLocalCache(next);
          return 'published';
        }
        // An explicit authorization or validation failure must never turn into
        // a device-local success message in development.
        return 'failed';
      }
    }
  } catch {
    // In development, allow an explicit local preview when PostgreSQL is not
    // configured. This result is distinct from a published server setting.
  }
  if (localPreferencesEnabled()) {
    saveLocalCache(next);
    return 'local-only';
  }
  return 'failed';
}

export function getPgStyle(): PgStyle {
  return loadSectionStyles().pg;
}

export function getStayStyle(): StayStyle {
  return loadSectionStyles().stay;
}

export function getServicesStyle(): ServicesStyle {
  return loadSectionStyles().services;
}

export function getClassesStyle(): ClassesStyle {
  return loadSectionStyles().classes;
}

export function getVenuesStyle(): VenuesStyle {
  return loadSectionStyles().venues;
}

export function getMoviesStyle(): MoviesStyle {
  return loadSectionStyles().movies;
}

/** Read a style segment from a route like #pg/style2 or #stays/airbnb. */
export function styleFromHash(section: 'pg' | 'stays' | 'hotels' | 'services'): string | null {
  try {
    const hash = window.location.hash.replace('#', '').toLowerCase();
    const [sec, style] = hash.split('/');
    if (sec !== section) return null;
    return style || null;
  } catch {
    return null;
  }
}
