/**
 * Admin-controlled per-section style selection.
 * PG       → BookOurSpace Style 1 (classic list) or Style 2
 * Stay     → BookOurSpace Stay 1 or Stay 2
 * Services → Old (listing page) or Triangle style (services app)
 * Persisted in localStorage and applied when each section opens.
 */

export type PgStyle = 'style1' | 'style2';
export type StayStyle = 'old' | 'airbnb';
export type ServicesStyle = 'old' | 'triangle' | 'noddyy';
export type ClassesStyle = 'cards' | 'timetable';
export type VenuesStyle = 'showcase' | 'agenda';
export type MoviesStyle = 'experience' | 'classic';

export interface SectionStyles {
  pg: PgStyle;
  stay: StayStyle;
  services: ServicesStyle;
  classes: ClassesStyle;
  venues: VenuesStyle;
  movies: MoviesStyle;
}

const KEY = 'bos_section_styles_v2';
export const SECTION_STYLES_EVENT = 'bos-section-styles-changed';

export type SectionStyleSaveResult = 'published' | 'local-only' | 'failed';

const localPreferencesEnabled = () => import.meta.env?.DEV === true;

function saveLocalCache(next: SectionStyles) {
  if (!localPreferencesEnabled()) return;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  try { window.dispatchEvent(new Event(SECTION_STYLES_EVENT)); } catch { /* no window */ }
}

const DEFAULTS: SectionStyles = {
  pg: 'style2',
  stay: 'airbnb',
  services: 'old',
  classes: 'cards',
  venues: 'showcase',
  movies: 'experience',
};

export function loadSectionStyles(): SectionStyles {
  // A browser-local preference may help development, but must never replace a
  // centrally published production design on a device that has stale storage.
  if (!localPreferencesEnabled()) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SectionStyles>;
    return {
      pg: parsed.pg === 'style1' || parsed.pg === 'style2' ? parsed.pg : DEFAULTS.pg,
      stay: parsed.stay === 'old' || parsed.stay === 'airbnb' ? parsed.stay : DEFAULTS.stay,
      services:
        parsed.services === 'old' || parsed.services === 'triangle' || parsed.services === 'noddyy'
          ? parsed.services
          : DEFAULTS.services,
      classes: parsed.classes === 'timetable' ? 'timetable' : DEFAULTS.classes,
      venues: parsed.venues === 'agenda' ? 'agenda' : DEFAULTS.venues,
      movies: parsed.movies === 'classic' ? 'classic' : DEFAULTS.movies,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function applyRemoteSectionStyles(value: unknown): SectionStyles | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<SectionStyles>;
  const next = {
    ...loadSectionStyles(),
    pg: parsed.pg === 'style1' || parsed.pg === 'style2' ? parsed.pg : loadSectionStyles().pg,
    stay: parsed.stay === 'old' || parsed.stay === 'airbnb' ? parsed.stay : loadSectionStyles().stay,
    services: parsed.services === 'old' || parsed.services === 'triangle' || parsed.services === 'noddyy' ? parsed.services : loadSectionStyles().services,
    classes: parsed.classes === 'timetable' ? 'timetable' : 'cards',
    venues: parsed.venues === 'agenda' ? 'agenda' : 'showcase',
    movies: parsed.movies === 'classic' ? 'classic' : 'experience',
  } as SectionStyles;
  saveLocalCache(next);
  return next;
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
