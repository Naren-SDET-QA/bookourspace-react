import { LIVE_EDIT_MODULES, type LiveEditModule } from './types';

const MODULE_SET = new Set<string>(LIVE_EDIT_MODULES);

export function isLiveEditModule(value: unknown): value is LiveEditModule {
  return typeof value === 'string' && MODULE_SET.has(value);
}

/**
 * Prefixes are the only stable cross-source signal: the marketplace seeds and
 * the PostgreSQL rows both use them (`pg-`, `class-`, `venue-`, `cat-`/`srv-`,
 * `hotel-`, `movie-`).
 */
const CATEGORY_PREFIXES: Array<{ prefix: string; module: LiveEditModule }> = [
  { prefix: 'pg-', module: 'pg_hostels' },
  { prefix: 'class-', module: 'classes' },
  { prefix: 'venue-', module: 'venues' },
  { prefix: 'cat-', module: 'services' },
  { prefix: 'srv-', module: 'services' },
  { prefix: 'hotel-', module: 'hotel_stay' },
  { prefix: 'movie-', module: 'movies' },
];

const TEXT_HINTS: Array<{ pattern: RegExp; module: LiveEditModule }> = [
  { pattern: /(movie|cinema|multiplex|showtime|imax|4dx)/, module: 'movies' },
  { pattern: /(hotel|resort|stay|homestay|serviced\s+apartment)/, module: 'hotel_stay' },
  { pattern: /(pg|paying\s+guest|hostel|co-?living|dormitory)/, module: 'pg_hostels' },
  { pattern: /(banquet|function\s+hall|convention|venue|lawn|mandapam|auditorium)/, module: 'venues' },
  { pattern: /(class|course|coaching|tuition|academy|institute|training)/, module: 'classes' },
  { pattern: /(service|repair|plumber|electrician|cleaning|carpenter|painter|salon|packers)/, module: 'services' },
];

export interface ModuleInferenceInput {
  categoryId?: unknown;
  subcategory?: unknown;
  entityType?: unknown;
  title?: unknown;
  payload?: Record<string, unknown> | null;
}

/**
 * Resolve which of the six Live Edit modules owns a listing row.
 *
 * `entityType: 'property'` covers both PGs and hotels, so the category prefix
 * and then text hints decide. Returns `null` instead of guessing when no
 * signal matches — Live Edit refuses to edit a listing it cannot classify.
 */
export function inferLiveEditModule(input: ModuleInferenceInput): LiveEditModule | null {
  const payload = input.payload || {};
  const declared = payload.marketSection ?? payload.moduleId ?? payload.module;
  if (isLiveEditModule(declared)) return declared;

  const categoryId = typeof input.categoryId === 'string' ? input.categoryId.trim().toLowerCase() : '';
  if (categoryId === 'pg' || categoryId === 'pg_hostels' || categoryId === 'pg-hostels') return 'pg_hostels';
  if (categoryId === 'classes' || categoryId === 'class' || categoryId === 'course') return 'classes';
  if (categoryId === 'venues' || categoryId === 'venue' || categoryId === 'halls') return 'venues';
  if (categoryId === 'services' || categoryId === 'service') return 'services';
  if (categoryId === 'hotels' || categoryId === 'hotel' || categoryId === 'hotel_stay' || categoryId === 'stays') {
    return 'hotel_stay';
  }
  if (categoryId === 'movies' || categoryId === 'movie' || categoryId === 'cinema') return 'movies';
  for (const entry of CATEGORY_PREFIXES) {
    if (categoryId.startsWith(entry.prefix)) return entry.module;
  }

  const entityType = typeof input.entityType === 'string' ? input.entityType.trim().toLowerCase() : '';
  if (entityType === 'course') return 'classes';
  if (entityType === 'venue') return 'venues';
  if (entityType === 'service') return 'services';
  if (entityType === 'movie') return 'movies';
  if (entityType === 'stay') return 'hotel_stay';

  const haystack = [
    categoryId,
    typeof input.subcategory === 'string' ? input.subcategory : '',
    typeof input.title === 'string' ? input.title : '',
  ]
    .join(' ')
    .toLowerCase();
  for (const hint of TEXT_HINTS) {
    if (hint.pattern.test(haystack)) return hint.module;
  }
  if (entityType === 'property') return null;
  return null;
}

export function categoryMatchesModule(module: LiveEditModule, categoryId: string): boolean {
  if (!categoryId) return false;
  switch (module) {
    case 'pg_hostels':
      return categoryId.startsWith('pg-');
    case 'classes':
      return categoryId.startsWith('class-');
    case 'venues':
      return categoryId.startsWith('venue-');
    case 'services':
      return categoryId.startsWith('cat-') || categoryId.startsWith('srv-');
    case 'hotel_stay':
      return categoryId.startsWith('hotel-');
    case 'movies':
      return categoryId.startsWith('movie-');
    default:
      return false;
  }
}

export function modulesForListings(modules: Array<LiveEditModule | null>): LiveEditModule[] {
  const seen = new Set<LiveEditModule>();
  for (const module of modules) {
    if (module) seen.add(module);
  }
  return LIVE_EDIT_MODULES.filter((module) => seen.has(module));
}
