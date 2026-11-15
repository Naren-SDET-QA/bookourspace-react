/**
 * Universal Live Builder registry.
 *
 * This file is the single allowlist shared by the admin UI, the API validator
 * and the SQL guard. It is intentionally data-only: a published document can
 * describe approved components, text, image URLs, design tokens and references
 * to approved actions, but it can never carry executable code, arbitrary HTML,
 * SQL or a user-supplied component implementation.
 *
 * Adding a capability means adding an entry here, a matching row in
 * `public.platform_component_registry` (migration) and a renderer case. The SQL
 * guard rejects any block whose type is missing from the registry table, so a
 * server bug alone cannot publish an unknown component.
 */

export const BUILDER_SCHEMA_VERSION = 1;
export const BUILDER_MAX_DOCUMENT_BYTES = 262_144;
export const BUILDER_MAX_BLOCKS = 200;
export const BUILDER_MAX_FIELDS = 60;
export const BUILDER_MAX_RECORD_BYTES = 131_072;

export type BuilderBlockCategory =
  | 'content'
  | 'layout'
  | 'navigation'
  | 'commerce'
  | 'data'
  | 'feedback';

export type BuilderPropKind =
  | 'text'
  | 'longtext'
  | 'url'
  | 'image'
  | 'color'
  | 'number'
  | 'boolean'
  | 'select'
  | 'metric'
  | 'action'
  | 'module'
  | 'entity';

export interface BuilderPropDescriptor {
  key: string;
  label: string;
  kind: BuilderPropKind;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: readonly string[];
  placeholder?: string;
}

export interface BuilderComponentDefinition {
  type: string;
  label: string;
  category: BuilderBlockCategory;
  description: string;
  /** Only `section`, `tabs` and `card` carry children. */
  acceptsChildren?: boolean;
  maxPerPage: number;
  /** Publishing a page containing this component needs Super Admin. */
  superAdminPublish?: boolean;
  props: readonly BuilderPropDescriptor[];
  defaultProps: Readonly<Record<string, string | number | boolean>>;
}

const DESIGN_RADII = ['rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full'] as const;
export const BUILDER_RADII = DESIGN_RADII;
export const BUILDER_SPACING = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16'] as const;
export const BUILDER_ALIGNMENTS = ['left', 'center', 'right'] as const;
export const BUILDER_TOKEN_LIMITS = {
  colors: 8,
  navigation: 24,
  childrenPerBlock: 30,
  depth: 3,
} as const;

export const BUILDER_MODULES = [
  'platform',
  'pg_hostels',
  'classes',
  'venues',
  'services',
  'hotel_stay',
  'movies',
] as const;

export type BuilderModule = (typeof BUILDER_MODULES)[number];

/**
 * Approved workflow actions. They are declarative intents that the client maps
 * to an existing, already-authorized route; the builder never stores a URL
 * that grants a capability or executes code.
 */
export const BUILDER_ACTIONS = [
  'open_provider_onboarding',
  'open_booking',
  'open_inventory',
  'open_reports',
  'open_contact_provider',
  'request_callback',
  'download_statement',
  'refresh_report',
] as const;

export type BuilderAction = (typeof BUILDER_ACTIONS)[number];

export const BUILDER_COMPONENTS: readonly BuilderComponentDefinition[] = [
  {
    type: 'heading',
    label: 'Heading',
    category: 'content',
    description: 'Page or section heading.',
    maxPerPage: 40,
    props: [
      { key: 'text', label: 'Heading', kind: 'text', required: true, maxLength: 200 },
      { key: 'level', label: 'Level', kind: 'select', options: ['h1', 'h2', 'h3', 'h4'] },
    ],
    defaultProps: { text: 'New heading', level: 'h2' },
  },
  {
    type: 'text',
    label: 'Text',
    category: 'content',
    description: 'Plain text paragraph. Markup is never rendered.',
    maxPerPage: 80,
    props: [
      { key: 'text', label: 'Text', kind: 'longtext', required: true, maxLength: 5000 },
      { key: 'align', label: 'Alignment', kind: 'select', options: BUILDER_ALIGNMENTS },
    ],
    defaultProps: { text: 'Describe this page section.', align: 'left' },
  },
  {
    type: 'image',
    label: 'Image',
    category: 'content',
    description: 'HTTPS image reference with alt text.',
    maxPerPage: 60,
    props: [
      { key: 'src', label: 'Image URL', kind: 'image', required: true, maxLength: 500 },
      { key: 'alt', label: 'Alt text', kind: 'text', required: true, maxLength: 200 },
      { key: 'caption', label: 'Caption', kind: 'text', maxLength: 300 },
    ],
    defaultProps: { src: '', alt: 'BookOurSpace image', caption: '' },
  },
  {
    type: 'hero',
    label: 'Hero banner',
    category: 'content',
    description: 'Headline, subheadline, image and call to action.',
    maxPerPage: 6,
    props: [
      { key: 'badge', label: 'Badge', kind: 'text', maxLength: 80 },
      { key: 'headline', label: 'Headline', kind: 'text', required: true, maxLength: 200 },
      { key: 'subheadline', label: 'Subheadline', kind: 'text', maxLength: 300 },
      { key: 'imageUrl', label: 'Background image', kind: 'image', maxLength: 500 },
      { key: 'ctaLabel', label: 'Button label', kind: 'text', maxLength: 60 },
      { key: 'ctaAction', label: 'Action', kind: 'action' },
    ],
    defaultProps: { badge: '', headline: 'Book with confidence', subheadline: '', imageUrl: '', ctaLabel: 'Explore', ctaAction: 'open_booking' },
  },
  {
    type: 'announcement',
    label: 'Announcement bar',
    category: 'content',
    description: 'Scheduled top announcement text.',
    maxPerPage: 3,
    props: [
      { key: 'text', label: 'Text', kind: 'text', required: true, maxLength: 300 },
      { key: 'link', label: 'Link', kind: 'url', maxLength: 500 },
      { key: 'dismissible', label: 'Dismissible', kind: 'boolean' },
    ],
    defaultProps: { text: 'Verified listings across India', link: '', dismissible: true },
  },
  {
    type: 'badge',
    label: 'Badge',
    category: 'content',
    description: 'Small status badge.',
    maxPerPage: 30,
    props: [
      { key: 'text', label: 'Text', kind: 'text', required: true, maxLength: 60 },
      { key: 'tone', label: 'Tone', kind: 'select', options: ['neutral', 'success', 'warning', 'danger'] },
    ],
    defaultProps: { text: 'Verified', tone: 'success' },
  },
  {
    type: 'button',
    label: 'Button',
    category: 'navigation',
    description: 'Approved action or internal/external HTTPS link.',
    maxPerPage: 40,
    props: [
      { key: 'label', label: 'Label', kind: 'text', required: true, maxLength: 60 },
      { key: 'action', label: 'Approved action', kind: 'action' },
      { key: 'href', label: 'Link', kind: 'url', maxLength: 500 },
      { key: 'variant', label: 'Variant', kind: 'select', options: ['primary', 'secondary', 'ghost'] },
    ],
    defaultProps: { label: 'Continue', action: '', href: '', variant: 'primary' },
  },
  {
    type: 'nav_menu',
    label: 'Navigation menu',
    category: 'navigation',
    description: 'Role-scoped navigation items.',
    maxPerPage: 4,
    props: [
      { key: 'label', label: 'Menu label', kind: 'text', maxLength: 60 },
      { key: 'items', label: 'Items (Label|href per line)', kind: 'longtext', maxLength: 2000 },
    ],
    defaultProps: { label: 'Explore', items: 'Home|/#\nBookings|/#bookings' },
  },
  {
    type: 'section',
    label: 'Section',
    category: 'layout',
    description: 'Container that holds child components.',
    acceptsChildren: true,
    maxPerPage: 40,
    props: [
      { key: 'title', label: 'Section title', kind: 'text', maxLength: 120 },
      { key: 'description', label: 'Description', kind: 'text', maxLength: 300 },
      { key: 'collapsible', label: 'Collapsible', kind: 'boolean' },
    ],
    defaultProps: { title: 'New section', description: '', collapsible: false },
  },
  {
    type: 'tabs',
    label: 'Tabs',
    category: 'layout',
    description: 'Tabbed container; children are grouped by `tab` label.',
    acceptsChildren: true,
    maxPerPage: 10,
    props: [
      { key: 'tabs', label: 'Tabs (one per line)', kind: 'longtext', required: true, maxLength: 500 },
    ],
    defaultProps: { tabs: 'Overview\nDetails' },
  },
  {
    type: 'card',
    label: 'Card',
    category: 'layout',
    description: 'Card with a title, body and optional image.',
    acceptsChildren: true,
    maxPerPage: 60,
    props: [
      { key: 'title', label: 'Title', kind: 'text', required: true, maxLength: 120 },
      { key: 'body', label: 'Body', kind: 'longtext', maxLength: 1000 },
      { key: 'imageUrl', label: 'Image', kind: 'image', maxLength: 500 },
    ],
    defaultProps: { title: 'Card title', body: '', imageUrl: '' },
  },
  {
    type: 'card_grid',
    label: 'Card grid',
    category: 'layout',
    description: 'Grid of cards from an approved listing/entity source.',
    maxPerPage: 10,
    props: [
      { key: 'module', label: 'Module', kind: 'module' },
      { key: 'columns', label: 'Columns', kind: 'number', min: 1, max: 4 },
      { key: 'limit', label: 'Cards shown', kind: 'number', min: 1, max: 24 },
    ],
    defaultProps: { module: 'platform', columns: 3, limit: 6 },
  },
  {
    type: 'gallery',
    label: 'Gallery',
    category: 'content',
    description: 'HTTPS image gallery.',
    maxPerPage: 20,
    props: [
      { key: 'images', label: 'Image URLs (one per line)', kind: 'longtext', required: true, maxLength: 6000 },
      { key: 'columns', label: 'Columns', kind: 'number', min: 1, max: 4 },
    ],
    defaultProps: { images: '', columns: 3 },
  },
  {
    type: 'divider',
    label: 'Divider',
    category: 'layout',
    description: 'Visual separator.',
    maxPerPage: 40,
    props: [{ key: 'label', label: 'Label', kind: 'text', maxLength: 60 }],
    defaultProps: { label: '' },
  },
  {
    type: 'spacer',
    label: 'Spacer',
    category: 'layout',
    description: 'Approved spacing step.',
    maxPerPage: 40,
    props: [{ key: 'size', label: 'Spacing', kind: 'select', options: BUILDER_SPACING }],
    defaultProps: { size: '4' },
  },
  {
    type: 'filter_bar',
    label: 'Filter bar',
    category: 'data',
    description: 'Approved filters over a module listing feed.',
    maxPerPage: 12,
    props: [
      { key: 'module', label: 'Module', kind: 'module' },
      { key: 'filters', label: 'Filters (comma separated)', kind: 'text', maxLength: 300 },
      { key: 'sticky', label: 'Sticky', kind: 'boolean' },
    ],
    defaultProps: { module: 'platform', filters: 'price,area,availability', sticky: false },
  },
  {
    type: 'search_bar',
    label: 'Search bar',
    category: 'data',
    description: 'Search input scoped to a module.',
    maxPerPage: 6,
    props: [
      { key: 'module', label: 'Module', kind: 'module' },
      { key: 'placeholder', label: 'Placeholder', kind: 'text', maxLength: 80 },
    ],
    defaultProps: { module: 'platform', placeholder: 'Search verified listings' },
  },
  {
    type: 'table',
    label: 'Table',
    category: 'data',
    description: 'Read-only table bound to an approved data source.',
    maxPerPage: 10,
    props: [
      { key: 'source', label: 'Source', kind: 'select', options: ['listings', 'bookings', 'providers', 'inventory'] },
      { key: 'columns', label: 'Columns', kind: 'text', maxLength: 300 },
      { key: 'pageSize', label: 'Rows per page', kind: 'number', min: 5, max: 100 },
    ],
    defaultProps: { source: 'listings', columns: 'title,module,status', pageSize: 20 },
  },
  {
    type: 'calendar',
    label: 'Calendar',
    category: 'data',
    description: 'Availability calendar for a module.',
    maxPerPage: 8,
    props: [
      { key: 'module', label: 'Module', kind: 'module' },
      { key: 'mode', label: 'Mode', kind: 'select', options: ['availability', 'readonly'] },
    ],
    defaultProps: { module: 'hotel_stay', mode: 'availability' },
  },
  {
    type: 'form',
    label: 'Form',
    category: 'data',
    description: 'Form container built from approved fields.',
    acceptsChildren: true,
    maxPerPage: 12,
    props: [
      { key: 'title', label: 'Form title', kind: 'text', maxLength: 120 },
      { key: 'submitLabel', label: 'Submit label', kind: 'text', maxLength: 40 },
      { key: 'action', label: 'Approved action', kind: 'action' },
    ],
    defaultProps: { title: 'Enquiry form', submitLabel: 'Submit', action: 'request_callback' },
  },
  {
    type: 'form_field',
    label: 'Form field',
    category: 'data',
    description: 'Field inside a form. Stored as configuration, validated server-side on submit.',
    maxPerPage: 80,
    props: [
      { key: 'name', label: 'Field name', kind: 'text', required: true, maxLength: 60 },
      { key: 'label', label: 'Label', kind: 'text', required: true, maxLength: 120 },
      { key: 'fieldType', label: 'Type', kind: 'select', options: ['text', 'textarea', 'number', 'email', 'phone', 'date', 'select', 'checkbox'] },
      { key: 'required', label: 'Required', kind: 'boolean' },
      { key: 'options', label: 'Options (comma separated)', kind: 'text', maxLength: 400 },
    ],
    defaultProps: { name: 'full_name', label: 'Full name', fieldType: 'text', required: true, options: '' },
  },
  {
    type: 'booking_widget',
    label: 'Booking widget',
    category: 'commerce',
    description: 'Entry point to an existing server-priced booking flow.',
    maxPerPage: 10,
    superAdminPublish: true,
    props: [
      { key: 'module', label: 'Module', kind: 'module' },
      { key: 'mode', label: 'Mode', kind: 'select', options: ['booking', 'enquiry'] },
      { key: 'requireLogin', label: 'Require sign-in', kind: 'boolean' },
    ],
    defaultProps: { module: 'hotel_stay', mode: 'enquiry', requireLogin: true },
  },
  {
    type: 'inventory_widget',
    label: 'Inventory widget',
    category: 'commerce',
    description: 'Read-only availability summary. Never writes inventory.',
    maxPerPage: 10,
    superAdminPublish: true,
    props: [
      { key: 'module', label: 'Module', kind: 'module' },
      { key: 'unitLabel', label: 'Unit label', kind: 'text', maxLength: 40 },
      { key: 'showPrices', label: 'Show prices', kind: 'boolean' },
    ],
    defaultProps: { module: 'pg_hostels', unitLabel: 'beds', showPrices: true },
  },
  {
    type: 'listing_layout',
    label: 'Listing layout',
    category: 'commerce',
    description: 'Layout for a module listing feed.',
    maxPerPage: 6,
    props: [
      { key: 'module', label: 'Module', kind: 'module' },
      { key: 'layout', label: 'Layout', kind: 'select', options: ['grid', 'list'] },
      { key: 'cardFields', label: 'Card fields', kind: 'text', maxLength: 300 },
    ],
    defaultProps: { module: 'platform', layout: 'grid', cardFields: 'title,price,area,availability' },
  },
  {
    type: 'report',
    label: 'Report',
    category: 'data',
    description: 'Dashboard for an approved metric. No arbitrary SQL.',
    maxPerPage: 16,
    superAdminPublish: true,
    props: [
      { key: 'metric', label: 'Metric', kind: 'metric', required: true },
      { key: 'title', label: 'Title', kind: 'text', maxLength: 120 },
      { key: 'range', label: 'Range', kind: 'select', options: ['30d', '90d', '12m'] },
    ],
    defaultProps: { metric: 'listings_by_module', title: 'Listings by module', range: '30d' },
  },
  {
    type: 'workflow_action',
    label: 'Workflow action',
    category: 'commerce',
    description: 'Approved action button; the server still authorizes the action.',
    maxPerPage: 30,
    superAdminPublish: true,
    props: [
      { key: 'action', label: 'Action', kind: 'action', required: true },
      { key: 'label', label: 'Label', kind: 'text', required: true, maxLength: 60 },
      { key: 'confirmation', label: 'Confirmation text', kind: 'text', maxLength: 200 },
    ],
    defaultProps: { action: 'open_booking', label: 'Open bookings', confirmation: '' },
  },
];

export const BUILDER_COMPONENT_MAP: Readonly<Record<string, BuilderComponentDefinition>> = Object.freeze(
  Object.fromEntries(BUILDER_COMPONENTS.map((component) => [component.type, component])),
);

export function builderComponent(type: string): BuilderComponentDefinition | null {
  return Object.prototype.hasOwnProperty.call(BUILDER_COMPONENT_MAP, type)
    ? BUILDER_COMPONENT_MAP[type]
    : null;
}

// ---------------------------------------------------------------------------
// Entity/module metadata registry
// ---------------------------------------------------------------------------

export const ENTITY_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'money',
  'boolean',
  'date',
  'datetime',
  'select',
  'multiselect',
  'email',
  'phone',
  'url',
  'media',
  'relation',
] as const;

export type EntityFieldType = (typeof ENTITY_FIELD_TYPES)[number];

export const ENTITY_RELATION_TYPES = ['belongs_to', 'has_many'] as const;
export const ENTITY_READ_SCOPES = ['public', 'authenticated', 'admin'] as const;
export const ENTITY_WRITE_SCOPES = ['admin', 'provider_owner'] as const;

export interface EntityFieldDescriptor {
  key: string;
  label: string;
  type: EntityFieldType;
  required: boolean;
  options?: string[];
  relationTarget?: string;
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface EntityRelationDescriptor {
  key: string;
  target: string;
  type: (typeof ENTITY_RELATION_TYPES)[number];
  required: boolean;
}

export interface EntitySchemaDocument {
  schemaVersion: number;
  key: string;
  label: string;
  module: BuilderModule;
  description?: string;
  fields: EntityFieldDescriptor[];
  relations: EntityRelationDescriptor[];
  listView: { columns: string[]; searchFields: string[] };
  permissions: {
    read: (typeof ENTITY_READ_SCOPES)[number];
    write: (typeof ENTITY_WRITE_SCOPES)[number];
  };
  workflow?: { enabled: boolean; statuses: string[]; initialStatus: string };
}

// ---------------------------------------------------------------------------
// Approved metrics (the only queries the report builder can request)
// ---------------------------------------------------------------------------

export interface MetricDefinition {
  id: string;
  label: string;
  description: string;
  dimensions?: readonly string[];
}

export const BUILDER_METRICS: readonly MetricDefinition[] = [
  { id: 'listings_by_module', label: 'Listings by module', description: 'Published listings grouped by marketplace category.' },
  { id: 'providers', label: 'Providers', description: 'Provider accounts grouped by account status and verification.' },
  { id: 'service_bookings', label: 'Service bookings', description: 'Service jobs grouped by status with gross value.' },
  { id: 'refunds', label: 'Refunds', description: 'Refunded or partially refunded service bookings.' },
  { id: 'reviews', label: 'Reviews', description: 'Published customer review ratings.' },
  { id: 'user_growth', label: 'User growth', description: 'New profiles per month by role.' },
  { id: 'module_performance', label: 'Module performance', description: 'Module flags against published listing volume.' },
];

export const BUILDER_METRIC_IDS = BUILDER_METRICS.map((metric) => metric.id);

export function builderMetric(id: string): MetricDefinition | null {
  return BUILDER_METRICS.find((metric) => metric.id === id) ?? null;
}

/** Safe visual tokens the builder is allowed to persist. */
export const BUILDER_THEME_KEYS = [
  'primaryColor',
  'accentColor',
  'background',
  'surface',
  'text',
  'buttonRadius',
  'spacing',
] as const;

export const BUILDER_DEFAULT_THEME = {
  primaryColor: '#4338CA',
  accentColor: '#FFE500',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  text: '#0F172A',
  buttonRadius: 'rounded-xl',
  spacing: '4',
} as const;
