export interface ModularTemplateConfig {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  order: number;
  isUndefinedTemplate?: boolean;
  customTitle?: string;
  customContent?: string;
}

export const DEFAULT_TEMPLATES: ModularTemplateConfig[] = [
  { id: 'spotlight_subcategories', name: 'స్పాట్లైట్ సబ్-కేటగిరీలు (Spotlight Subcategories — Optional All 6 Modules)', icon: '🌟', enabled: false, order: 1 },
  { id: 'filter_bar', name: 'Smart Filter & Location Bar', icon: '🎛️', enabled: true, order: 2 },
  { id: 'search_date_range_filter', name: 'Search Results & Date-Range Availability Filter', icon: '📅', enabled: false, order: 3 },
  { id: 'spotlight_showcase', name: '3-Image Animated Spotlight', icon: '✨', enabled: true, order: 4 },
  { id: 'barcode_verifier_hub', name: 'Standalone Barcode Pass & Ticket Verifier', icon: '🏷️', enabled: false, order: 5 },
  { id: 'dynamic_admin_widgets', name: 'Admin Drag & Drop Custom Features', icon: '🧩', enabled: false, order: 6 },
  { id: 'undefined_template', name: 'Custom / Undefined Template Slot', icon: '📦', enabled: false, order: 7, isUndefinedTemplate: true, customTitle: 'Custom Plug-and-Play Template Block', customContent: 'This optional template slot was undefined by default and is now enabled! Admin or User can toggle it ON or OFF anytime.' },
  { id: 'trending_near_me', name: 'Trending Near Me Carousel', icon: '🔥', enabled: true, order: 8 },
  { id: 'listings_grid', name: 'Main Marketplace Listings Feed', icon: '🏪', enabled: true, order: 9 },
  { id: 'recently_viewed', name: 'Recently Viewed History', icon: '🕒', enabled: true, order: 10 },
  { id: 'quick_action_pills_bar', name: 'Quick Action Pills Row (Sign In, Favorites, Wallet, Support, Refer & Earn, Help, Object Editor, Pass Verifier, Alerts)', icon: '⚡', enabled: false, order: 11 },
  { id: 'independent_modules_bar', name: 'Zero-Dependency Independent Modules & No-Code Builder Bar', icon: '⚙️', enabled: false, order: 12 },
  { id: 'active_filter_status_strip', name: 'Active Filter Status Strip (Active Filter: Madhapur • Clear All)', icon: '🏷️', enabled: false, order: 13 },
  { id: 'category_rail_stream_explorer', name: 'The Category Rail & Stream Explorer Layout (Blinkit / Flipkart / Zepto Style)', icon: '🛤️', enabled: false, order: 14 },
];

const TEMPLATES_STORAGE_KEY = 'bos_modular_templates_v8';
const SPOTLIGHT_SUBCATEGORIES_MODULES_KEY = 'bos_spotlight_subcategories_all6_v1';
const SEARCH_DATE_RANGE_MODULES_KEY = 'bos_search_date_range_all6_v1';
const HOME_SCREEN_STYLE_STORAGE_KEY = 'bos_home_screen_style_v2';

export type HomeScreenLayoutStyle = 'bento_landing_hub' | 'classic_marketplace';

export function loadHomeScreenLayoutStyle(): HomeScreenLayoutStyle {
  try {
    const raw = localStorage.getItem(HOME_SCREEN_STYLE_STORAGE_KEY);
    if (raw === 'classic_marketplace' || raw === 'bento_landing_hub') {
      return raw;
    }
    // Landing page opens on the marketplace layout so the common header
    // (location + search + 6 section cards) is always the first thing shown.
    return 'classic_marketplace';
  } catch {
    return 'classic_marketplace';
  }
}

export function saveHomeScreenLayoutStyle(
  style: HomeScreenLayoutStyle
): HomeScreenLayoutStyle {
  try {
    localStorage.setItem(HOME_SCREEN_STYLE_STORAGE_KEY, style);
    window.dispatchEvent(
      new CustomEvent('bos-home-style-updated', { detail: { style } })
    );
    window.dispatchEvent(new CustomEvent('bos-modular-templates-updated'));
  } catch {}
  return style;
}

export type SpotlightModuleSectionKey =
  | 'pg_hostels'
  | 'classes'
  | 'venues'
  | 'services'
  | 'hotel_stay'
  | 'movies';

export const ALL_SIX_MARKET_MODULES: { id: SpotlightModuleSectionKey; label: string; shortLabel: string; emoji: string }[] = [
  { id: 'pg_hostels', label: "PG's & Hostels", shortLabel: 'PGs', emoji: '🏠' },
  { id: 'classes', label: 'Classes & Coaching', shortLabel: 'Classes', emoji: '🎓' },
  { id: 'venues', label: 'Function Halls & Venues', shortLabel: 'Venues', emoji: '🏛️' },
  { id: 'services', label: 'Services', shortLabel: 'Services', emoji: '🛠️' },
  { id: 'hotel_stay', label: 'Stay & Hotels', shortLabel: 'Hotels', emoji: '🏨' },
  { id: 'movies', label: 'Movies', shortLabel: 'Movies', emoji: '🎬' },
];

export function loadSpotlightSubcategoriesModuleMap(): Record<SpotlightModuleSectionKey, boolean> {
  const fallback: Record<SpotlightModuleSectionKey, boolean> = {
    pg_hostels: false,
    classes: false,
    venues: false,
    services: false,
    hotel_stay: false,
    movies: false,
  };
  try {
    const raw = localStorage.getItem(SPOTLIGHT_SUBCATEGORIES_MODULES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      pg_hostels: typeof parsed.pg_hostels === 'boolean' ? parsed.pg_hostels : false,
      classes: typeof parsed.classes === 'boolean' ? parsed.classes : false,
      venues: typeof parsed.venues === 'boolean' ? parsed.venues : false,
      services: typeof parsed.services === 'boolean' ? parsed.services : false,
      hotel_stay: typeof parsed.hotel_stay === 'boolean' ? parsed.hotel_stay : false,
      movies: typeof parsed.movies === 'boolean' ? parsed.movies : false,
    };
  } catch {
    return fallback;
  }
}

export function saveSpotlightSubcategoriesModuleMap(
  mapOrUniformState: Record<SpotlightModuleSectionKey, boolean> | boolean
): Record<SpotlightModuleSectionKey, boolean> {
  const nextMap: Record<SpotlightModuleSectionKey, boolean> =
    typeof mapOrUniformState === 'boolean'
      ? {
          pg_hostels: mapOrUniformState,
          classes: mapOrUniformState,
          venues: mapOrUniformState,
          services: mapOrUniformState,
          hotel_stay: mapOrUniformState,
          movies: mapOrUniformState,
        }
      : {
          pg_hostels: Boolean(mapOrUniformState.pg_hostels),
          classes: Boolean(mapOrUniformState.classes),
          venues: Boolean(mapOrUniformState.venues),
          services: Boolean(mapOrUniformState.services),
          hotel_stay: Boolean(mapOrUniformState.hotel_stay),
          movies: Boolean(mapOrUniformState.movies),
        };

  try {
    localStorage.setItem(SPOTLIGHT_SUBCATEGORIES_MODULES_KEY, JSON.stringify(nextMap));
    void import('../lib/supabaseClient').then(({ upsertRlsModuleConfig }) =>
      upsertRlsModuleConfig(SPOTLIGHT_SUBCATEGORIES_MODULES_KEY, nextMap)
    );
  } catch {}

  const anyEnabled = Object.values(nextMap).some(Boolean);
  const tpls = loadModularTemplates();
  const exists = tpls.some((t) => t.id === 'spotlight_subcategories');
  const updatedTemplates = exists
    ? tpls.map((t) =>
        t.id === 'spotlight_subcategories' ? { ...t, enabled: anyEnabled } : t
      )
    : [
        {
          id: 'spotlight_subcategories',
          name: 'స్పాట్లైట్ సబ్-కేటగిరీలు (Spotlight Subcategories — Optional All 6 Modules)',
          icon: '🌟',
          enabled: anyEnabled,
          order: 1,
        },
        ...tpls,
      ];

  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updatedTemplates));
    window.dispatchEvent(new CustomEvent('bos-dynamic-schema-updated'));
    window.dispatchEvent(new CustomEvent('bos-modular-templates-updated'));
  } catch {}

  return nextMap;
}

export function toggleSpotlightSubcategoriesForSection(
  section: SpotlightModuleSectionKey,
  explicitState?: boolean
): Record<SpotlightModuleSectionKey, boolean> {
  const current = loadSpotlightSubcategoriesModuleMap();
  const nextVal = typeof explicitState === 'boolean' ? explicitState : !current[section];
  const updated: Record<SpotlightModuleSectionKey, boolean> = {
    ...current,
    [section]: nextVal,
  };
  return saveSpotlightSubcategoriesModuleMap(updated);
}

export function loadSearchDateRangeModuleMap(): Record<SpotlightModuleSectionKey, boolean> {
  const fallback: Record<SpotlightModuleSectionKey, boolean> = {
    pg_hostels: false,
    classes: false,
    venues: false,
    services: false,
    hotel_stay: false,
    movies: false,
  };
  try {
    const raw = localStorage.getItem(SEARCH_DATE_RANGE_MODULES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      pg_hostels: typeof parsed.pg_hostels === 'boolean' ? parsed.pg_hostels : false,
      classes: typeof parsed.classes === 'boolean' ? parsed.classes : false,
      venues: typeof parsed.venues === 'boolean' ? parsed.venues : false,
      services: typeof parsed.services === 'boolean' ? parsed.services : false,
      hotel_stay: typeof parsed.hotel_stay === 'boolean' ? parsed.hotel_stay : false,
      movies: typeof parsed.movies === 'boolean' ? parsed.movies : false,
    };
  } catch {
    return fallback;
  }
}

export function saveSearchDateRangeModuleMap(
  mapOrUniformState: Record<SpotlightModuleSectionKey, boolean> | boolean
): Record<SpotlightModuleSectionKey, boolean> {
  const nextMap: Record<SpotlightModuleSectionKey, boolean> =
    typeof mapOrUniformState === 'boolean'
      ? {
          pg_hostels: mapOrUniformState,
          classes: mapOrUniformState,
          venues: mapOrUniformState,
          services: mapOrUniformState,
          hotel_stay: mapOrUniformState,
          movies: mapOrUniformState,
        }
      : {
          pg_hostels: Boolean(mapOrUniformState.pg_hostels),
          classes: Boolean(mapOrUniformState.classes),
          venues: Boolean(mapOrUniformState.venues),
          services: Boolean(mapOrUniformState.services),
          hotel_stay: Boolean(mapOrUniformState.hotel_stay),
          movies: Boolean(mapOrUniformState.movies),
        };

  try {
    localStorage.setItem(SEARCH_DATE_RANGE_MODULES_KEY, JSON.stringify(nextMap));
    void import('../lib/supabaseClient').then(({ upsertRlsModuleConfig }) =>
      upsertRlsModuleConfig(SEARCH_DATE_RANGE_MODULES_KEY, nextMap)
    );
  } catch {}

  const anyEnabled = Object.values(nextMap).some(Boolean);
  const tpls = loadModularTemplates();
  const exists = tpls.some((t) => t.id === 'search_date_range_filter');
  const updatedTemplates = exists
    ? tpls.map((t) =>
        t.id === 'search_date_range_filter' ? { ...t, enabled: anyEnabled } : t
      )
    : [
        ...tpls,
        {
          id: 'search_date_range_filter',
          name: 'Search Results & Date-Range Availability Filter',
          icon: '📅',
          enabled: anyEnabled,
          order: 3,
        },
      ];

  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updatedTemplates));
    window.dispatchEvent(new CustomEvent('bos-dynamic-schema-updated'));
    window.dispatchEvent(new CustomEvent('bos-modular-templates-updated'));
  } catch {}

  return nextMap;
}

export function toggleSearchDateRangeForSection(
  section: SpotlightModuleSectionKey,
  explicitState?: boolean
): Record<SpotlightModuleSectionKey, boolean> {
  const current = loadSearchDateRangeModuleMap();
  const nextVal = typeof explicitState === 'boolean' ? explicitState : !current[section];
  const updated: Record<SpotlightModuleSectionKey, boolean> = {
    ...current,
    [section]: nextVal,
  };
  return saveSearchDateRangeModuleMap(updated);
}

export function loadModularTemplates(): ModularTemplateConfig[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TEMPLATES;
    // Self-heal: ensure all default templates exist
    const merged = [...parsed];
    for (const def of DEFAULT_TEMPLATES) {
      if (!merged.some((t) => t && t.id === def.id)) {
        merged.push(def);
      }
    }
    return merged
      .filter(Boolean)
      .map((t, i) => ({
        id: String(t.id || `undefined_template_${i}`),
        name: String(t.name || `Undefined Template (${t.id || i + 1})`),
        icon: String(t.icon || '📦'),
        enabled: Boolean(t.enabled),
        order: typeof t.order === 'number' ? t.order : i + 1,
        isUndefinedTemplate: Boolean(t.isUndefinedTemplate),
        customTitle: t.customTitle,
        customContent: t.customContent,
      }))
      .sort((a, b) => a.order - b.order);
  } catch {
    // Self-heal on corrupt JSON
    localStorage.removeItem(TEMPLATES_STORAGE_KEY);
    return DEFAULT_TEMPLATES;
  }
}

export function saveModularTemplates(templates: ModularTemplateConfig[]) {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    window.dispatchEvent(new CustomEvent('bos-dynamic-schema-updated'));
    window.dispatchEvent(new CustomEvent('bos-modular-templates-updated'));
    void import('../lib/supabaseClient').then(({ upsertRlsModuleConfig }) =>
      upsertRlsModuleConfig(TEMPLATES_STORAGE_KEY, templates)
    );
  } catch {}
}

/**
 * 3. DYNAMIC ADMIN NO-CODE DRAG & DROP FEATURE DEFINITIONS (Auto-updates UI & DB)
 */
export type DynamicFeatureFieldType = 'editbox' | 'checkbox' | 'image' | 'number' | 'dropdown';

export interface DynamicAdminFeature {
  id: string;
  label: string;
  fieldType: DynamicFeatureFieldType;
  required: boolean;
  targetSection: 'all' | 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay' | 'movies';
  options?: string[];
  value?: any;
  createdAt: string;
}

const DYNAMIC_FEATURES_STORAGE_KEY = 'bos_dynamic_admin_features_v1';

const INITIAL_DYNAMIC_FEATURES: DynamicAdminFeature[] = [
  {
    id: 'feat-verified-id',
    label: 'Instant Aadhaar / Govt ID Verified Check',
    fieldType: 'checkbox',
    required: false,
    targetSection: 'all',
    value: true,
    createdAt: '2026-10-28',
  },
];

export function loadDynamicAdminFeatures(): DynamicAdminFeature[] {
  try {
    const raw = localStorage.getItem(DYNAMIC_FEATURES_STORAGE_KEY);
    if (!raw) return INITIAL_DYNAMIC_FEATURES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_DYNAMIC_FEATURES;
  } catch {
    return INITIAL_DYNAMIC_FEATURES;
  }
}

export function saveDynamicAdminFeatures(features: DynamicAdminFeature[]) {
  try {
    localStorage.setItem(DYNAMIC_FEATURES_STORAGE_KEY, JSON.stringify(features));
    window.dispatchEvent(new CustomEvent('bos-dynamic-schema-updated'));
    void import('../lib/supabaseClient').then(({ upsertRlsModuleConfig }) =>
      upsertRlsModuleConfig(DYNAMIC_FEATURES_STORAGE_KEY, features)
    );
  } catch {}
}

/**
 * 4. MCP (MODEL CONTEXT PROTOCOL) & REST API CONNECTOR REGISTRY
 */
export interface ExternalConnectorItem {
  id: string;
  name: string;
  protocol: 'MCP' | 'REST_API';
  endpointUrl: string;
  method: 'GET' | 'POST' | 'MCP_TOOL_CALL';
  enabled: boolean;
  lastSyncStatus: 'connected' | 'ready' | 'error';
  lastResponsePreview?: string;
}

const CONNECTORS_STORAGE_KEY = 'bos_mcp_rest_connectors_v1';

const DEFAULT_CONNECTORS: ExternalConnectorItem[] = [
  {
    id: 'mcp-global-directory',
    name: 'Global MCP Space & Booking Server',
    protocol: 'MCP',
    endpointUrl: 'mcp://bookourspace.global/v1/tools/listings.sync',
    method: 'MCP_TOOL_CALL',
    enabled: true,
    lastSyncStatus: 'connected',
    lastResponsePreview: '{"protocol":"mcp/1.0","tools":["bos.search_listings","bos.book_space","bos.verify_provider"],"status":"healthy"}',
  },
  {
    id: 'rest-partner-feed',
    name: 'Partner PG, Classes & Halls REST API',
    protocol: 'REST_API',
    endpointUrl: 'https://api.bookourspace.in/v1/listings/live-feed',
    method: 'GET',
    enabled: true,
    lastSyncStatus: 'connected',
    lastResponsePreview: '{"status":200,"syncedListings":72,"gstEngine":"active","selfHealing":true}',
  },
];

export function loadExternalConnectors(): ExternalConnectorItem[] {
  try {
    const raw = localStorage.getItem(CONNECTORS_STORAGE_KEY);
    if (!raw) return DEFAULT_CONNECTORS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CONNECTORS;
  } catch {
    return DEFAULT_CONNECTORS;
  }
}

export function saveExternalConnectors(items: ExternalConnectorItem[]) {
  try {
    localStorage.setItem(CONNECTORS_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

/**
 * 5. USER-FACING & ADMIN QUICK TEMPLATE CUSTOMIZER BAR
 * Allows any user (even non-technical) to enable/disable any template (including undefined templates)
 * and reorder modules via Drag-and-Drop or 1-tap Up/Down buttons.
 */
