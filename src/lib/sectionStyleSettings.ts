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

/** Product decision: PG and Classes ship only the Style 3 experience. */
export const STYLE3_LOCKED_SECTIONS = ['pg', 'classes'] as const;
export function isStyle3Locked(section: keyof SectionStyles): boolean {
  return section === 'pg' || section === 'classes';
}

function applyStyleLocks(value: SectionStyles): SectionStyles {
  // Halls ships only the Style 2 (agenda) experience.
  return { ...value, pg: 'style3', classes: 'style3', venues: 'agenda' };
}

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
    const parsed = validStyles(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
    // A stored Style 1/2 choice is stale for the locked sections.
    if (parsed.pg) parsed.pg = 'style3';
    if (parsed.classes) parsed.classes = 'style3';
    if (parsed.venues) parsed.venues = 'agenda';
    return parsed;
  } catch {
    return {};
  }
}

/** Persist one section's explicit choice; it wins over later defaults. */
export function saveStylePreference<K extends keyof SectionStyles>(section: K, value: SectionStyles[K]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const next = { ...loadStylePreferences(), [section]: section === 'venues' ? 'agenda' : isStyle3Locked(section) ? 'style3' : value };
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
  // PG and Classes are locked to Style 3; the other sections keep Style 1 as
  // their first view for a fresh visitor.
  pg: 'style3',
  stay: 'old',
  services: 'old',
  classes: 'style3',
  venues: 'agenda',
  movies: 'experience',
};

export function loadSectionStyles(): SectionStyles {
  const preferences = loadStylePreferences();
  // A browser-local preference may help development, but must never replace a
  // centrally published production design on a device that has stale storage.
  if (!localPreferencesEnabled()) return applyStyleLocks({ ...DEFAULTS, ...preferences });
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return applyStyleLocks({ ...DEFAULTS, ...preferences });
    const parsed = JSON.parse(raw) as Partial<SectionStyles>;
    return applyStyleLocks({
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
    });
  } catch {
    return applyStyleLocks({ ...DEFAULTS, ...preferences });
  }
}

export function applyRemoteSectionStyles(value: unknown, sectionStylesVersion?: number): SectionStyles | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<SectionStyles> & { sectionStylesVersion?: number };
  // Configs published before the unified Style 1/2/3 switch carried the old
  // defaults (PG Style 2 / Stay Style 2). Stay keeps the one-time legacy
  // mapping; PG/Classes are always forced to Style 3 by applyStyleLocks.
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
  const locked = applyStyleLocks(next);
  saveLocalCache(locked);
  // An explicit visitor choice survives navigation, refresh and later config
  // refreshes; the published style remains the default for everyone else.
  return applyStyleLocks({ ...locked, ...loadStylePreferences() });
}

export async function saveSectionStyles(next: SectionStyles): Promise<SectionStyleSaveResult> {
  // PG and Classes are locked to Style 3. Force the lock before the request so
  // a stale admin form can never publish Style 1/2 for them.
  const locked = applyStyleLocks(next);
  // The API re-verifies the signed session and the database role. Never treat
  // a browser cache write as a published setting.
  try {
    if (typeof window !== 'undefined') {
      const token = window.localStorage.getItem('bos_session_token_v1');
      if (token) {
        const response = await fetch('/api/live-page-config/section-styles', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-bos-session-token': token },
          body: JSON.stringify({ styles: locked }),
          cache: 'no-store',
        });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.ok === true && result?.okStyles === true) {
          saveLocalCache(locked);
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
    saveLocalCache(locked);
    return 'local-only';
  }
  return 'failed';
}

export function getPgStyle(): PgStyle {
  return 'style3';
}

export function getStayStyle(): StayStyle {
  return loadSectionStyles().stay;
}

export function getServicesStyle(): ServicesStyle {
  return loadSectionStyles().services;
}

export function getClassesStyle(): ClassesStyle {
  return 'style3';
}

export function getVenuesStyle(): VenuesStyle {
  return 'agenda';
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
