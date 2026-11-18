/**
 * Admin-controlled per-section style selection.
 * PG       → BookOurSpace Style 1 (classic list) or Style 2
 * Stay     → BookOurSpace Stay 1 or Stay 2
 * Services → Triangle only (Style 2); Style 1 and Style 3 are disabled.
 * Persisted in localStorage and applied when each section opens.
 */

export type PgStyle = 'style1' | 'style2' | 'style3';
export type StayStyle = 'old' | 'airbnb' | 'style3';
export type ServicesStyle = 'old' | 'triangle' | 'noddyy';
export type ClassesStyle = 'cards' | 'timetable' | 'style3' | 'style4';
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

/** Retired customer hashes that used to open Services Style 1 or Style 3. */
const RETIRED_SERVICES_HASH_STYLES = new Set([
  'old', '1', 'style1', 'services1',
  'noddyy', '3', 'style3', 'services3',
  'triangle', '2', 'style2', 'services2',
]);

/** Product decision: PG and Classes ship only the Style 3 experience. */
export const STYLE3_LOCKED_SECTIONS = ['pg'] as const;
export function isStyle3Locked(section: keyof SectionStyles): boolean {
  return section === 'pg';
}

function applyStyleLocks(value: SectionStyles): SectionStyles {
  // Halls ships only Style 2 (agenda); Services only Style 2 (triangle).
  return { ...value, pg: 'style3', venues: 'agenda', services: 'triangle' };
}

/** Rewrite a stale services=old cache without broadcasting a style-change event. */
function persistLockedServices(next: SectionStyles): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SectionStyles> | null;
      if (parsed && parsed.services && parsed.services !== 'triangle') {
        localStorage.setItem(KEY, JSON.stringify({ ...parsed, ...next, services: 'triangle' }));
      }
    }
    const prefsRaw = localStorage.getItem(PREFS_KEY);
    if (prefsRaw) {
      const prefs = JSON.parse(prefsRaw) as Partial<SectionStyles> | null;
      if (prefs && prefs.services && prefs.services !== 'triangle') {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, services: 'triangle' }));
      }
    }
  } catch {
    // Storage can be unavailable; the in-memory lock still applies.
  }
}

/**
 * Drop retired Services style segments (#services/old, /style1, /noddyy, …)
 * so a bookmark or OAuth return cannot reopen Style 1.
 */
export function canonicalizeServicesHash(): void {
  try {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash.replace(/^#/, '').toLowerCase();
    const [sec, style] = raw.split('/');
    if (sec !== 'services' || !style) return;
    if (!RETIRED_SERVICES_HASH_STYLES.has(style)) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#services`);
  } catch {
    // Hash rewrite is best-effort; the render lock still forces triangle.
  }
}

/** Keep Classes Style 4 and other module hashes; fold Services deep-links to #services. */
export function sanitizeServicesReturnHash(hash: string): string {
  const body = String(hash || '').replace(/^#/, '').toLowerCase();
  if (body === 'services' || body.startsWith('services/')) return '#services';
  if (body === 'classes' || body.startsWith('classes/')) {
    const [, style = ''] = body.split('/');
    // Training E2E uses bare #classes / #classes/style3 for Style 3.
    if (!style) return '#classes';
    if (style === '3' || style === 'style3') return '#classes/style3';
    return '#classes/style4';
  }
  return hash;
}

const VALID_VALUES: Record<keyof SectionStyles, readonly string[]> = {
  pg: ['style1', 'style2', 'style3'],
  stay: ['old', 'airbnb', 'style3'],
  services: ['old', 'triangle', 'noddyy'],
  classes: ['cards', 'timetable', 'style3', 'style4'],
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
    if (parsed.venues) parsed.venues = 'agenda';
    if (parsed.services) parsed.services = 'triangle';
    return parsed;
  } catch {
    return {};
  }
}

/** Persist one section's explicit choice; it wins over later defaults. */
export function saveStylePreference<K extends keyof SectionStyles>(section: K, value: SectionStyles[K]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const next = { ...loadStylePreferences(), [section]: section === 'venues' ? 'agenda' : section === 'services' ? 'triangle' : isStyle3Locked(section) ? 'style3' : value };
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
  services: 'triangle',
  classes: 'style4',
  venues: 'agenda',
  movies: 'experience',
};

export function loadSectionStyles(): SectionStyles {
  const preferences = loadStylePreferences();
  // A browser-local preference may help development, but must never replace a
  // centrally published production design on a device that has stale storage.
  let locked: SectionStyles;
  if (!localPreferencesEnabled()) {
    locked = applyStyleLocks({ ...DEFAULTS, ...preferences });
  } else {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        locked = applyStyleLocks({ ...DEFAULTS, ...preferences });
      } else {
        const parsed = JSON.parse(raw) as Partial<SectionStyles>;
        locked = applyStyleLocks({
          pg: parsed.pg === 'style1' || parsed.pg === 'style2' || parsed.pg === 'style3' ? parsed.pg : DEFAULTS.pg,
          stay: parsed.stay === 'old' || parsed.stay === 'airbnb' || parsed.stay === 'style3' ? parsed.stay : DEFAULTS.stay,
          services:
            parsed.services === 'old' || parsed.services === 'triangle' || parsed.services === 'noddyy'
              ? parsed.services
              : DEFAULTS.services,
          classes: parsed.classes === 'timetable' || parsed.classes === 'style3' || parsed.classes === 'style4' ? parsed.classes : DEFAULTS.classes,
          venues: parsed.venues === 'agenda' || parsed.venues === 'style3' ? parsed.venues : DEFAULTS.venues,
          movies: parsed.movies === 'classic' || parsed.movies === 'style3' ? parsed.movies : DEFAULTS.movies,
          ...preferences,
        });
      }
    } catch {
      locked = applyStyleLocks({ ...DEFAULTS, ...preferences });
    }
  }
  persistLockedServices(locked);
  return locked;
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
    services: 'triangle',
    classes: parsed.classes === 'timetable' || parsed.classes === 'style3' || parsed.classes === 'style4' ? parsed.classes : loadSectionStyles().classes,
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
  return 'triangle';
}

export function getClassesStyle(): ClassesStyle {
  return loadSectionStyles().classes;
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
    if (section === 'services') return null;
    return style || null;
  } catch {
    return null;
  }
}
