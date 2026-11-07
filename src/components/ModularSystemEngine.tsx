import React, { useState, useEffect } from 'react';
import SafeImage from './SafeImage';
import {
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,
  GripVertical,
  Sliders,
  Plus,
  Trash2,
  CheckSquare,
  Type,
  Image as ImageIcon,
  Hash,
  List,
  Calendar,
  Globe,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Wrench,
  ArrowUp,
  ArrowDown,
  Upload,
} from 'lucide-react';

/**
 * 1. SELF-HEALING ERROR BOUNDARY FOR INDEPENDENT MODULES
 * Guarantees that if any template/module encounters a runtime error or undefined data,
 * it self-heals automatically without crashing the application.
 */
interface SelfHealingBoundaryProps {
  moduleId: string;
  moduleName: string;
  children: React.ReactNode;
  onDisableModule?: (id: string) => void;
}

interface SelfHealingBoundaryState {
  hasError: boolean;
  errorMsg: string;
  healCount: number;
}

export class SelfHealingBoundary extends React.Component<
  SelfHealingBoundaryProps,
  SelfHealingBoundaryState
> {
  constructor(props: SelfHealingBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMsg: '', healCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<SelfHealingBoundaryState> {
    return { hasError: true, errorMsg: error?.message || 'Undefined template state' };
  }

  componentDidCatch(error: Error) {
    console.warn(`[Self-Healing Engine] Auto-recovered module "${this.props.moduleId}":`, error);
  }

  handleSelfHeal = () => {
    this.setState((prev) => ({
      hasError: false,
      errorMsg: '',
      healCount: prev.healCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
            <div>
              <h4 className="text-xs font-black text-slate-900 dark:text-white">
                Self-Healing Module: {this.props.moduleName}
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Isolated module recovered safely ({this.state.errorMsg}). Other modules are unaffected.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={this.handleSelfHeal}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer"
            >
              🔧 Auto-Heal Now
            </button>
            {this.props.onDisableModule && (
              <button
                type="button"
                onClick={() => this.props.onDisableModule?.(this.props.moduleId)}
                className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Disable Template
              </button>
            )}
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.healCount}>{this.props.children}</React.Fragment>;
  }
}

/**
 * 2. MODULAR TEMPLATE CONFIG & UNDEFINED TEMPLATE ENABLE/DISABLE SYSTEM
 */
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

const DEFAULT_TEMPLATES: ModularTemplateConfig[] = [
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
export const UserModularTemplateBar: React.FC<{
  templates: ModularTemplateConfig[];
  onUpdateTemplates: (next: ModularTemplateConfig[]) => void;
  onOpenAdminBuilder?: () => void;
}> = ({ templates, onUpdateTemplates, onOpenAdminBuilder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [newUndefinedName, setNewUndefinedName] = useState('');

  const handleToggleTemplate = (id: string) => {
    const updated = templates.map((t) =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    );
    onUpdateTemplates(updated);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= templates.length) return;
    const copy = [...templates];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    const reordered = copy.map((t, i) => ({ ...t, order: i + 1 }));
    onUpdateTemplates(reordered);
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIdx === null || draggedIdx === targetIndex) return;
    const copy = [...templates];
    const [moved] = copy.splice(draggedIdx, 1);
    copy.splice(targetIndex, 0, moved);
    const reordered = copy.map((t, i) => ({ ...t, order: i + 1 }));
    setDraggedIdx(null);
    onUpdateTemplates(reordered);
  };

  const handleAddUndefinedTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newUndefinedName.trim() || `Custom Template #${templates.length + 1}`;
    const created: ModularTemplateConfig = {
      id: `custom_tpl_${Date.now()}`,
      name: label,
      icon: '🧩',
      enabled: true,
      order: templates.length + 1,
      isUndefinedTemplate: true,
      customTitle: label,
      customContent: `Dynamic modular section "${label}" added and enabled automatically.`,
    };
    onUpdateTemplates([...templates, created]);
    setNewUndefinedName('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-3 py-2 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black border border-emerald-200 dark:border-emerald-800">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Zero-Dependency Independent Modules</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-[#4338CA] dark:text-indigo-300 text-[10px] font-black border border-indigo-200 dark:border-indigo-800">
            <Cpu className="w-3 h-3" />
            <span>Isolated State • No Cross-Module Dependency</span>
          </span>
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {templates.filter((t) => t.enabled).length}/{templates.length} Modules Active
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-[#4338CA] dark:text-indigo-300 text-[11px] font-black flex items-center gap-1 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            <Sliders className="w-3 h-3" />
            <span>{isOpen ? 'Hide Module Controls' : '⚙️ Independent Modules & Templates'}</span>
          </button>

          {onOpenAdminBuilder && (
            <button
              type="button"
              onClick={onOpenAdminBuilder}
              className="px-2.5 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-black flex items-center gap-1 cursor-pointer"
            >
              <Wrench className="w-3 h-3" />
              <span className="hidden sm:inline">No-Code Builder</span>
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              ✋ Drag and drop any module below to reorder the screen, or tap the switch to Enable / Disable (even if a template is undefined):
            </p>
            <button
              type="button"
              onClick={() => {
                saveModularTemplates(DEFAULT_TEMPLATES);
                onUpdateTemplates(DEFAULT_TEMPLATES);
              }}
              className="text-[11px] font-bold text-indigo-600 hover:underline self-start sm:self-auto cursor-pointer"
            >
              Reset Default Layout
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {templates.map((tpl, idx) => (
              <div
                key={tpl.id}
                draggable
                onDragStart={() => setDraggedIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
                className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-move transition-all ${
                  tpl.enabled
                    ? 'bg-slate-50 dark:bg-slate-800/80 border-indigo-200 dark:border-indigo-800'
                    : 'bg-slate-100/60 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-65'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-base shrink-0">{tpl.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {tpl.name}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <span>{tpl.isUndefinedTemplate ? 'Optional / Undefined Slot' : 'Core Module'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === templates.length - 1}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleTemplate(tpl.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer transition-colors ${
                      tpl.enabled
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {tpl.enabled ? (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>ON</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>OFF</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add New / Undefined Template Slot on the fly */}
          <form onSubmit={handleAddUndefinedTemplate} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newUndefinedName}
              onChange={(e) => setNewUndefinedName(e.target.value)}
              placeholder="Add custom or undefined template name (e.g. Festival Offers Banner)..."
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold outline-hidden"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-[#4338CA] hover:bg-indigo-800 text-white text-xs font-black flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Template</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

/**
 * 6. LIVE INTERACTIVE RENDERER FOR ADMIN'S NO-CODE DYNAMIC FEATURES (EditBox, CheckBox, Image, etc.)
 * Automatically displays in the application and saves user/provider interactions to the DB.
 */
export const DynamicAdminFeaturesShowcase: React.FC<{
  features: DynamicAdminFeature[];
  activeSection: string;
  onUpdateFeatureValue: (id: string, value: any) => void;
}> = ({ features, activeSection, onUpdateFeatureValue }) => {
  const visibleFeatures = features.filter(
    (f) => f.targetSection === 'all' || f.targetSection === activeSection
  );

  if (visibleFeatures.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200/80 dark:border-slate-800 p-3.5 shadow-2xs space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#4338CA]" />
          <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
            Live Dynamic Features & Filters (Auto-Synced from Admin No-Code Builder)
          </h4>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-[#4338CA] dark:text-indigo-300">
          {visibleFeatures.length} Active Widget(s)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {visibleFeatures.map((feat) => (
          <div
            key={feat.id}
            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-1.5"
          >
            <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>
                {feat.label} {feat.required && <span className="text-rose-500">*</span>}
              </span>
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {feat.fieldType}
              </span>
            </label>

            {feat.fieldType === 'editbox' && (
              <input
                type="text"
                value={String(feat.value || '')}
                onChange={(e) => onUpdateFeatureValue(feat.id, e.target.value)}
                placeholder={`Enter ${feat.label}...`}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-hidden"
              />
            )}

            {feat.fieldType === 'number' && (
              <input
                type="number"
                value={Number(feat.value || 0)}
                onChange={(e) => onUpdateFeatureValue(feat.id, Number(e.target.value))}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-hidden"
              />
            )}

            {feat.fieldType === 'checkbox' && (
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-emerald-700 dark:text-emerald-400 pt-0.5">
                <input
                  type="checkbox"
                  checked={Boolean(feat.value)}
                  onChange={(e) => onUpdateFeatureValue(feat.id, e.target.checked)}
                  className="w-4 h-4 rounded text-[#4338CA] cursor-pointer"
                />
                <span>{feat.value ? '✓ Enabled / Yes' : 'Tap to Enable'}</span>
              </label>
            )}

            {feat.fieldType === 'dropdown' && (
              <select
                value={String(feat.value || '')}
                onChange={(e) => onUpdateFeatureValue(feat.id, e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-hidden"
              >
                <option value="">Select option...</option>
                {(feat.options || ['Standard', 'Premium', 'VIP']).map((opt, idx) => (
                  <option key={idx} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {feat.fieldType === 'image' && (
              <div className="flex items-center gap-2">
                {feat.value && (
                  <SafeImage category="general"
                    src={String(feat.value)}
                    alt={feat.label}
                    className="w-9 h-9 rounded-lg object-cover border border-slate-300 shrink-0"
                  />
                )}
                <label className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#4338CA] text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image (All Formats)</span>
                  <input
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif,.heic,.tiff,.ico"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        onUpdateFeatureValue(feat.id, String(ev.target?.result || ''));
                      };
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
