/**
 * BookOurSpace module registry.
 *
 * One declarative contract per marketplace module. The registry is data, not
 * behaviour: screens, gateways and admin tooling read it instead of hard-coding
 * module names in several places. Disabling a module changes visibility and
 * capabilities only — no data is ever deleted by a flag.
 *
 * Adding a module means adding an entry here. Nothing else in the app should
 * need to learn its name.
 */

export type ModuleId =
  | 'hotels'
  | 'pg'
  | 'services'
  | 'function_hall'
  | 'classes'
  | 'movies'
  | 'ecommerce';

/** The three redesigned experiences plus their marketplace fallbacks. */
export type ModuleScreenId =
  | 'hotels_stay'
  | 'pg'
  | 'home_services'
  | 'function_halls'
  | 'classes'
  | 'movies';

export type ModuleLayout = 'grid' | 'list';

export interface ModuleConfigField {
  key: 'label' | 'headline' | 'heroImage' | 'layout' | 'maxCategories';
  label: string;
  type: 'text' | 'url' | 'select' | 'number';
  maxLength?: number;
  min?: number;
  max?: number;
  options?: readonly string[];
}

export interface ModulePermissions {
  view: 'public';
  contactOwner: 'module_flag_and_signed_in';
  adminConfig: 'active_admin';
  onlineBooking: 'server_workflow_only';
}

export interface ModuleHealthCheck {
  id: string;
  label: string;
  /** `blocking` failures make the module unavailable; `degraded` only degrades it. */
  severity: 'blocking' | 'degraded';
}

export interface ModuleContract {
  id: ModuleId;
  version: string;
  label: string;
  /** Deep link the section experience answers to, e.g. `#pg`. */
  route: string;
  entryPoints: readonly string[];
  screens: readonly ModuleScreenId[];
  dataServices: readonly string[];
  /** Database objects the module cannot work without. */
  dependsOn: readonly string[];
  config: { fields: readonly ModuleConfigField[] };
  permissions: ModulePermissions;
  healthChecks: readonly ModuleHealthCheck[];
  /** What unmounting the section must release. */
  cleanup: readonly string[];
}

const PRESENTATION_FIELDS: readonly ModuleConfigField[] = [
  { key: 'label', label: 'Module name', type: 'text', maxLength: 60 },
  { key: 'headline', label: 'Customer headline', type: 'text', maxLength: 120 },
  { key: 'heroImage', label: 'Hero image URL', type: 'url', maxLength: 500 },
  { key: 'layout', label: 'Card layout', type: 'select', options: ['grid', 'list'] },
  { key: 'maxCategories', label: 'Categories shown', type: 'number', min: 1, max: 50 },
];

const ADMIN_CONFIG_PERMISSIONS: ModulePermissions = {
  view: 'public',
  contactOwner: 'module_flag_and_signed_in',
  adminConfig: 'active_admin',
  onlineBooking: 'server_workflow_only',
};

const SECTION_CLEANUP: readonly string[] = [
  'Unsubscribe the platform module flag channel',
  'Abort in-flight catalogue requests',
  'Release the owner-contact request guard',
];

export const MODULE_REGISTRY: readonly ModuleContract[] = [
  {
    id: 'hotels',
    version: '1.0.0',
    label: 'Hotels & Stays',
    route: '#stays',
    entryPoints: ['HotelsStayExperience'],
    screens: ['hotels_stay'],
    dataServices: ['fetchStayProperties', 'fetchStayAvailability', 'fetchAuthorizedOwnerContact'],
    dependsOn: ['platform_module_flags', 'stay_properties', 'stay_room_types', 'stay_availability'],
    config: { fields: PRESENTATION_FIELDS },
    permissions: ADMIN_CONFIG_PERMISSIONS,
    healthChecks: [
      { id: 'flags', label: 'Module flags reachable', severity: 'blocking' },
      { id: 'inventory', label: 'Stay inventory readable', severity: 'blocking' },
      { id: 'availability', label: 'Availability function callable', severity: 'degraded' },
      { id: 'contact', label: 'Owner contact gateway', severity: 'degraded' },
    ],
    cleanup: SECTION_CLEANUP,
  },
  {
    id: 'pg',
    version: '1.0.0',
    label: 'PG Accommodation',
    route: '#pg',
    entryPoints: ['PGSectionExperience'],
    screens: ['pg'],
    dataServices: ['marketplace listings (existing store)', 'fetchAuthorizedOwnerContact'],
    dependsOn: ['platform_module_flags', 'listings'],
    config: { fields: PRESENTATION_FIELDS },
    permissions: ADMIN_CONFIG_PERMISSIONS,
    healthChecks: [
      { id: 'flags', label: 'Module flags reachable', severity: 'blocking' },
      { id: 'listings', label: 'PG listings present in the marketplace store', severity: 'degraded' },
      { id: 'contact', label: 'Owner contact gateway', severity: 'degraded' },
    ],
    cleanup: SECTION_CLEANUP,
  },
  {
    id: 'services',
    version: '1.0.0',
    label: 'Home Services',
    route: '#services',
    entryPoints: ['HomeServicesSection'],
    screens: ['home_services'],
    dataServices: ['marketplace listings (existing store)', 'fetchAuthorizedOwnerContact'],
    dependsOn: ['platform_module_flags', 'listings'],
    config: { fields: PRESENTATION_FIELDS },
    permissions: ADMIN_CONFIG_PERMISSIONS,
    healthChecks: [
      { id: 'flags', label: 'Module flags reachable', severity: 'blocking' },
      { id: 'listings', label: 'Service listings present in the marketplace store', severity: 'degraded' },
      { id: 'contact', label: 'Owner contact gateway', severity: 'degraded' },
    ],
    cleanup: SECTION_CLEANUP,
  },
  {
    id: 'function_hall',
    version: '1.0.0',
    label: 'Function Halls',
    route: '#venues',
    entryPoints: ['CategoryRailStreamExplorer'],
    screens: ['function_halls'],
    dataServices: ['marketplace listings (existing store)'],
    dependsOn: ['platform_module_flags', 'listings'],
    config: { fields: PRESENTATION_FIELDS },
    permissions: ADMIN_CONFIG_PERMISSIONS,
    healthChecks: [{ id: 'flags', label: 'Module flags reachable', severity: 'blocking' }],
    cleanup: SECTION_CLEANUP,
  },
  {
    id: 'classes',
    version: '1.0.0',
    label: 'Classes & Institutes',
    route: '#classes',
    entryPoints: ['CategoryRailStreamExplorer'],
    screens: ['classes'],
    dataServices: ['marketplace listings (existing store)'],
    dependsOn: ['platform_module_flags', 'listings'],
    config: { fields: PRESENTATION_FIELDS },
    permissions: ADMIN_CONFIG_PERMISSIONS,
    healthChecks: [{ id: 'flags', label: 'Module flags reachable', severity: 'blocking' }],
    cleanup: SECTION_CLEANUP,
  },
  {
    id: 'movies',
    version: '1.0.0',
    label: 'Movies & Cinemas',
    route: '#movies',
    entryPoints: ['MoviesShowtimes'],
    screens: ['movies'],
    dataServices: ['marketplace listings (existing store)'],
    dependsOn: ['platform_module_flags', 'listings'],
    config: { fields: PRESENTATION_FIELDS },
    permissions: ADMIN_CONFIG_PERMISSIONS,
    healthChecks: [
      { id: 'flags', label: 'Module flags reachable', severity: 'blocking' },
      { id: 'approval', label: 'Checkout approval recorded', severity: 'degraded' },
    ],
    cleanup: SECTION_CLEANUP,
  },
  {
    id: 'ecommerce',
    version: '1.0.0',
    label: 'Ecommerce',
    route: '',
    entryPoints: [],
    screens: [],
    dataServices: [],
    dependsOn: ['platform_module_flags'],
    config: { fields: PRESENTATION_FIELDS },
    permissions: ADMIN_CONFIG_PERMISSIONS,
    healthChecks: [{ id: 'flags', label: 'Module flags reachable', severity: 'blocking' }],
    cleanup: [],
  },
];

export const CONFIGURED_MODULE_IDS: readonly ModuleId[] = ['hotels', 'pg', 'services'];

export function getModule(id: string): ModuleContract | null {
  return MODULE_REGISTRY.find((module) => module.id === id) ?? null;
}

export function moduleForRoute(hash: string): ModuleContract | null {
  const normalised = hash.startsWith('#') ? hash : `#${hash}`;
  return MODULE_REGISTRY.find((module) => module.route && module.route === normalised) ?? null;
}

export type ModuleConfigValues = Partial<Record<ModuleConfigField['key'], string | number>>;

export interface ResolvedModuleConfigValues {
  label: string;
  headline: string;
  heroImage: string;
  layout: string;
  maxCategories: number;
}

export interface ModuleConfigResolution {
  values: ResolvedModuleConfigValues;
  issues: string[];
  usedDefaults: boolean;
}

function defaultFor(module: ModuleContract, key: ModuleConfigField['key']): string | number {
  if (key === 'label') return module.label;
  if (key === 'headline') return '';
  if (key === 'heroImage') return '';
  if (key === 'layout') return 'grid';
  return 12;
}

/**
 * Validate published presentation settings against the registry schema.
 * Anything unusable falls back to the module's own defaults, so a bad admin
 * value can never blank a customer screen.
 */
export function resolveModuleConfig(
  id: string,
  published: ModuleConfigValues | null | undefined
): ModuleConfigResolution {
  const module = getModule(id);
  if (!module) {
    return {
      values: { label: '', headline: '', heroImage: '', layout: 'grid', maxCategories: 12 },
      issues: [`Unknown module "${id}".`],
      usedDefaults: true,
    };
  }

  const issues: string[] = [];
  const values = {
    label: String(defaultFor(module, 'label')) as string,
    headline: String(defaultFor(module, 'headline')) as string,
    heroImage: String(defaultFor(module, 'heroImage')) as string,
    layout: String(defaultFor(module, 'layout')) as string,
    maxCategories: Number(defaultFor(module, 'maxCategories')),
  };
  let usedDefaults = false;

  for (const field of module.config.fields) {
    const raw = published?.[field.key];
    if (raw === undefined || raw === null || raw === '') continue;

    if (field.type === 'number') {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric) || numeric < (field.min ?? 0) || numeric > (field.max ?? 1000)) {
        issues.push(`${field.label} must be between ${field.min ?? 0} and ${field.max ?? 1000}.`);
        usedDefaults = true;
        continue;
      }
      values.maxCategories = Math.floor(numeric);
      continue;
    }

    const text = String(raw).trim();
    if (field.maxLength && text.length > field.maxLength) {
      issues.push(`${field.label} is longer than ${field.maxLength} characters.`);
      usedDefaults = true;
      continue;
    }
    if (field.type === 'url' && text && !/^https:\/\/\S+$/i.test(text)) {
      issues.push(`${field.label} must be an https URL.`);
      usedDefaults = true;
      continue;
    }
    if (field.type === 'select') {
      if (!field.options?.includes(text)) {
        issues.push(`${field.label} must be one of ${field.options?.join(', ')}.`);
        usedDefaults = true;
        continue;
      }
      values.layout = text;
      continue;
    }
    if (field.key === 'label') values.label = text;
    if (field.key === 'headline') values.headline = text;
    if (field.key === 'heroImage') values.heroImage = text;
  }

  return { values, issues, usedDefaults };
}
