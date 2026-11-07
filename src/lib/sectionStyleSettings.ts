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

export interface SectionStyles {
  pg: PgStyle;
  stay: StayStyle;
  services: ServicesStyle;
}

const KEY = 'bos_section_styles_v2';
export const SECTION_STYLES_EVENT = 'bos-section-styles-changed';

const DEFAULTS: SectionStyles = {
  pg: 'style2',
  stay: 'airbnb',
  services: 'old',
};

export function loadSectionStyles(): SectionStyles {
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
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSectionStyles(next: SectionStyles) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  try {
    window.dispatchEvent(new Event(SECTION_STYLES_EVENT));
  } catch {
    /* no window */
  }
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
