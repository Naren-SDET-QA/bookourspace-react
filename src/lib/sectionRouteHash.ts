/**
 * Section deep-link rules used by the hash router, OAuth return, and the
 * location selector. Location updates must never rewrite these hashes or
 * close an open section screen.
 */
import type { MarketSectionType } from '../data/moduleCategories';
import type { ClassesStyle } from './sectionStyleSettings';
import { readTrackingHashToken } from './trackingShare';

const RETIRED_SERVICES_STYLES = new Set([
  'old', '1', 'style1', 'services1',
  'noddyy', '3', 'style3', 'services3',
  'triangle', '2', 'style2', 'services2',
]);

const RETIRED_CLASSES_STYLES = new Set([
  'old', '1', 'style1', 'cards', 'timetable', '2', 'style2',
]);

export type SectionHashDecision =
  | { action: 'login' }
  | { action: 'open'; section: MarketSectionType; classesStyle?: ClassesStyle }
  | { action: 'provider'; normalizePortal1: boolean }
  | { action: 'admin' }
  | { action: 'venue-detail' }
  | { action: 'track'; token: string }
  | { action: 'keep-open' }
  | { action: 'close-sections' };

function normalizeHash(hash: string): string {
  return String(hash || '').replace(/^#/, '').toLowerCase();
}

export function isClearedLocationCity(city: string | null | undefined): boolean {
  const value = String(city || '').trim().toLowerCase();
  return !value || value === 'all' || value === 'all cities' || value === 'all locations';
}

/** Canonical customer hashes. Retired Services segments always become #services. */
export function canonicalizeSectionHash(hash: string): string {
  const trackToken = readTrackingHashToken(hash);
  if (trackToken) return `#track/${trackToken}`;
  const body = normalizeHash(hash);
  if (!body) return '';
  const [section, style = ''] = body.split('/');
  if (section === 'services') return '#services';
  if (section === 'classes') {
    if (style === '3' || style === 'style3') return '#classes/style3';
    if (style === '4' || style === 'style4') return '#classes/style4';
    if (!style) return '#classes';
    if (RETIRED_CLASSES_STYLES.has(style)) return '#classes/style4';
    return '#classes/style4';
  }
  return hash.startsWith('#') ? hash : `#${hash}`;
}

/** OAuth / bookmark return: never restore Services Style 1/3 or retired Classes layouts. */
export function sanitizeUiReturnHash(hash: string): string {
  const body = normalizeHash(hash);
  if (body === 'services' || body.startsWith('services/')) return '#services';
  if (body === 'classes' || body.startsWith('classes/')) return canonicalizeSectionHash(body);
  return hash;
}

export function approvedHashForSection(
  section: MarketSectionType,
  classesStyle: ClassesStyle = 'style4',
): string {
  switch (section) {
    case 'services':
      return '#services';
    case 'classes':
      return classesStyle === 'style3' ? '#classes' : '#classes/style4';
    case 'pg_hostels':
      return '#pg';
    case 'hotel_stay':
      return '#stays';
    case 'venues':
      return '#venues';
    case 'movies':
      return '#movies';
    default:
      return '';
  }
}

function classesStyleFromSegment(style: string): ClassesStyle | undefined {
  if (style === '3' || style === 'style3') return 'style3';
  if (style === '4' || style === 'style4') return 'style4';
  if (!style) return undefined;
  if (RETIRED_CLASSES_STYLES.has(style)) return 'style4';
  return 'style4';
}

/**
 * Decide what the hash router should do.
 *
 * Empty / unknown hashes close curated screens only when the route actually
 * left a section. Re-running the effect (auth hydrate) or a location-only
 * update with the same empty hash must keep the current UI.
 */
export function resolveSectionHashNavigation(
  hash: string,
  previousHash: string | undefined,
): SectionHashDecision {
  const trackToken = readTrackingHashToken(hash);
  if (trackToken) return { action: 'track', token: trackToken };
  const current = normalizeHash(hash);
  const previous = previousHash === undefined ? undefined : normalizeHash(previousHash);
  const hashChanged = previous !== current;
  const [section, style = ''] = current.split('/');

  if (current === 'login') return { action: 'login' };
  if (current === 'pg' || current.startsWith('pg/')) return { action: 'open', section: 'pg_hostels' };
  if (current === 'services' || current.startsWith('services/')) {
    return { action: 'open', section: 'services' };
  }
  if (
    current === 'stays' || current === 'hotels'
    || current.startsWith('stays/') || current.startsWith('hotels/')
  ) {
    return { action: 'open', section: 'hotel_stay' };
  }
  if (current === 'classes' || current.startsWith('classes/')) {
    return { action: 'open', section: 'classes', classesStyle: classesStyleFromSegment(style) };
  }
  if (
    current === 'venues' || current === 'halls'
    || current.startsWith('venues/') || current.startsWith('halls/')
  ) {
    return { action: 'open', section: 'venues' };
  }
  if (
    current === 'movies' || current === 'cinema'
    || current.startsWith('movies/') || current.startsWith('cinema/')
  ) {
    return { action: 'open', section: 'movies' };
  }
  if (
    current === 'provider' || current === 'provider_portal' || current === 'provider_portal1'
    || current.startsWith('provider/')
  ) {
    return { action: 'provider', normalizePortal1: current === 'provider_portal1' };
  }
  if (current === 'admin' || current.startsWith('admin/')) return { action: 'admin' };
  if (current.startsWith('venue-')) return { action: 'venue-detail' };

  if (!hashChanged || previous === undefined) return { action: 'keep-open' };
  return { action: 'close-sections' };
}

export function isRetiredServicesHash(hash: string): boolean {
  const body = normalizeHash(hash);
  const [section, style = ''] = body.split('/');
  return section === 'services' && Boolean(style) && RETIRED_SERVICES_STYLES.has(style);
}
