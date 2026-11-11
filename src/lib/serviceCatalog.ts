/**
 * Dynamic service category contract shared by the Super Admin builder, the
 * server validator and every customer/provider surface.
 *
 * The database repeats the important checks (and applies the medicine hard
 * rules in SQL triggers), but this module is the single TypeScript definition
 * of what a category, a booking field value and a required document mean.
 */

export type ServiceDeliveryKind = 'human_help' | 'medicine_delivery' | 'water_delivery';
export type ServiceBookingType = 'on_demand' | 'scheduled' | 'recurring';
export type ServiceProviderAssignment = 'customer_selects' | 'platform_managed' | 'admin_assigns';
export type ServiceDeliveryMode = 'on_site' | 'home_delivery' | 'pickup' | 'digital';
export type ServiceFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'date'
  | 'phone'
  | 'email'
  | 'document';
export type ServicePricingMode = 'fixed' | 'per_unit' | 'quote';
export type ServiceRecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly';
export type ServiceDocumentStatus = 'pending' | 'verified' | 'rejected';
export type ServiceCredentialType = 'pharmacy_license' | 'professional_license' | 'other';

export const SERVICE_FIELD_TYPES: readonly ServiceFieldType[] = [
  'text', 'textarea', 'number', 'select', 'multiselect', 'checkbox', 'date', 'phone', 'email', 'document',
];
export const SERVICE_DELIVERY_KINDS: readonly ServiceDeliveryKind[] = ['human_help', 'medicine_delivery', 'water_delivery'];
export const SERVICE_BOOKING_TYPES: readonly ServiceBookingType[] = ['on_demand', 'scheduled', 'recurring'];
export const SERVICE_PROVIDER_ASSIGNMENTS: readonly ServiceProviderAssignment[] = [
  'customer_selects', 'platform_managed', 'admin_assigns',
];
export const SERVICE_DELIVERY_MODES: readonly ServiceDeliveryMode[] = ['on_site', 'home_delivery', 'pickup', 'digital'];
export const SERVICE_PRICING_MODES: readonly ServicePricingMode[] = ['fixed', 'per_unit', 'quote'];
export const SERVICE_RECURRENCE_FREQUENCIES: readonly Exclude<ServiceRecurrenceFrequency, 'none'>[] = ['daily', 'weekly', 'monthly'];
export const SERVICE_TOGGLE_KEYS = [
  'gpsTracking', 'liveMap', 'customerOtp', 'prescriptionVerification',
  'documentVerification', 'payment', 'deliveryConfirmation',
] as const;

export interface ServiceCategoryField {
  key: string;
  label: string;
  type: ServiceFieldType;
  required: boolean;
  options?: string[];
  maxLength?: number;
  placeholder?: string;
  helpText?: string;
}

export interface ServiceCategoryDocument {
  key: string;
  label: string;
  required: boolean;
  verificationRequired: boolean;
  acceptedTypes?: string[];
}

export interface ServicePricingConfig {
  mode: ServicePricingMode;
  amount: number;
  currency: 'INR';
  unit: string;
  quantityEnabled: boolean;
  minQuantity: number;
  maxQuantity: number;
}

export interface ServiceRecurringConfig {
  enabled: boolean;
  frequencies: Array<Exclude<ServiceRecurrenceFrequency, 'none'>>;
  defaultFrequency: Exclude<ServiceRecurrenceFrequency, 'none'>;
  maxOccurrences: number;
}

export interface ServiceFeatureToggles {
  gpsTracking: boolean;
  liveMap: boolean;
  customerOtp: boolean;
  prescriptionVerification: boolean;
  documentVerification: boolean;
  payment: boolean;
  deliveryConfirmation: boolean;
}

export interface ServiceApprovalWorkflow {
  requiresProviderAcceptance: boolean;
  requiresDocumentVerification: boolean;
  requiresAdminApproval: boolean;
}

export interface ServiceValidationRules {
  minLeadTimeMinutes: number;
  maxAdvanceDays: number;
  requiresServiceAddress: boolean;
  requiresPhone: boolean;
  notesRequired: boolean;
}

export interface ServiceCategoryConfig {
  schemaVersion: number;
  name: string;
  description: string;
  icon: string;
  imageUrl: string;
  accentColor: string;
  deliveryKind: ServiceDeliveryKind;
  bookingType: ServiceBookingType;
  providerAssignment: ServiceProviderAssignment;
  deliveryModes: ServiceDeliveryMode[];
  pricing: ServicePricingConfig;
  recurring: ServiceRecurringConfig;
  toggles: ServiceFeatureToggles;
  fields: ServiceCategoryField[];
  documents: ServiceCategoryDocument[];
  approvalWorkflow: ServiceApprovalWorkflow;
  validation: ServiceValidationRules;
  legacyCategoryIds: string[];
  /** Forced to true for medicine by the hard-rule applier. */
  requiresLicensedPharmacy: boolean;
}

export interface PublicServiceCategory {
  id: string;
  tenantId: string;
  enabled: boolean;
  versionNumber: number;
  config: ServiceCategoryConfig;
}

export interface ServiceCategoryVersionView {
  versionId: string;
  versionNumber: number;
  status: 'draft' | 'published' | 'superseded_draft';
  config: ServiceCategoryConfig;
  summary: string;
  createdAt: string;
  publishedAt: string | null;
  publishedBy: string | null;
  sourceVersionId: string | null;
}

export interface ServiceCategoryAdminView {
  id: string;
  tenantId: string;
  enabled: boolean;
  currentVersionNumber: number | null;
  published: ServiceCategoryVersionView | null;
  draft: ServiceCategoryVersionView | null;
  versions: ServiceCategoryVersionView[];
  updatedAt: string;
}

export interface ServiceBookingDocumentView {
  id: string;
  documentKey: string;
  reference: string;
  fileName: string | null;
  mimeType: string | null;
  status: ServiceDocumentStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ServiceBookingFieldValues {
  [key: string]: string | number | boolean | string[] | null;
}

export interface ServiceDocumentInput {
  key: string;
  reference: string;
  fileName?: string;
  mimeType?: string;
}

export interface PendingServiceDocumentView {
  id: string;
  bookingId: string;
  bookingRef: string;
  listingTitle: string;
  categoryConfigId: string | null;
  documentKey: string;
  reference: string;
  fileName: string | null;
  mimeType: string | null;
  status: ServiceDocumentStatus;
  createdAt: string;
  customerId: string;
  providerId: string;
}

export interface ServiceCredentialView {
  id: string;
  providerId: string;
  providerName: string | null;
  categoryId: string | null;
  credentialType: ServiceCredentialType;
  licenseNumber: string;
  issuingAuthority: string | null;
  expiresOn: string | null;
  documentReference: string | null;
  status: 'pending' | 'verified' | 'rejected';
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export class ServiceCatalogValidationError extends Error {
  constructor(readonly code: string, message: string = code) {
    super(message);
    this.name = 'ServiceCatalogValidationError';
  }
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{1,39}$/;
const DOCUMENT_REFERENCE_PATTERN = /^(storage:\/\/|https:\/\/)[^\s]+$/i;
const UNSAFE_URL_PATTERN = /^(data|javascript|file|vbscript):/i;
const MEDICINE_PATTERN = /(medicine|pharmacy|prescription|drug)/i;

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion', 'name', 'description', 'icon', 'imageUrl', 'accentColor', 'deliveryKind',
  'bookingType', 'providerAssignment', 'deliveryModes', 'pricing', 'recurring', 'toggles',
  'fields', 'documents', 'approvalWorkflow', 'validation', 'legacyCategoryIds',
  'requiresLicensedPharmacy',
]);

export const DEFAULT_PRESCRIPTION_DOCUMENT: ServiceCategoryDocument = {
  key: 'prescription',
  label: 'Doctor prescription',
  required: true,
  verificationRequired: true,
  acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
};

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function money(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(Math.min(10_000_000, parsed) * 100) / 100;
}

function isSafeHttpsUrl(value: string): boolean {
  if (!value) return true;
  if (value.length > 2048 || !/^https:\/\/[^\s]+$/i.test(value) || UNSAFE_URL_PATTERN.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function stringArray(value: unknown, fallback: string[], allowed?: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || (allowed && !allowed.includes(trimmed)) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result.length ? result : [...fallback];
}

export function isMedicineServiceCategory(categoryId: string, config?: Partial<ServiceCategoryConfig> | null): boolean {
  return MEDICINE_PATTERN.test(categoryId || '')
    || MEDICINE_PATTERN.test(text(config?.name))
    || config?.deliveryKind === 'medicine_delivery'
    || config?.requiresLicensedPharmacy === true;
}

/** Applies the non-negotiable medicine policy. Admin toggles cannot remove it. */
export function applyServiceCategoryHardRules(
  categoryId: string,
  config: ServiceCategoryConfig,
): ServiceCategoryConfig {
  if (!isMedicineServiceCategory(categoryId, config)) return config;
  const documents = Array.isArray(config.documents) ? [...config.documents] : [];
  const index = documents.findIndex((document) => document.key === 'prescription');
  const prescription: ServiceCategoryDocument = {
    ...DEFAULT_PRESCRIPTION_DOCUMENT,
    ...(index >= 0 ? documents[index] : {}),
    key: 'prescription',
    required: true,
    verificationRequired: true,
    acceptedTypes: index >= 0 && documents[index].acceptedTypes?.length
      ? documents[index].acceptedTypes
      : [...DEFAULT_PRESCRIPTION_DOCUMENT.acceptedTypes!],
  };
  if (index >= 0) documents[index] = prescription;
  else documents.push(prescription);
  return {
    ...config,
    deliveryKind: 'medicine_delivery',
    requiresLicensedPharmacy: true,
    toggles: {
      ...config.toggles,
      prescriptionVerification: true,
      documentVerification: true,
    },
    approvalWorkflow: {
      ...config.approvalWorkflow,
      requiresDocumentVerification: true,
    },
    documents,
  };
}

export function createDefaultServiceCategoryConfig(name = 'New service category'): ServiceCategoryConfig {
  return {
    schemaVersion: 1,
    name,
    description: '',
    icon: 'sparkles',
    imageUrl: '',
    accentColor: '#6d28d9',
    deliveryKind: 'human_help',
    bookingType: 'on_demand',
    providerAssignment: 'customer_selects',
    deliveryModes: ['on_site'],
    pricing: {
      mode: 'quote', amount: 0, currency: 'INR', unit: 'per booking',
      quantityEnabled: false, minQuantity: 1, maxQuantity: 10,
    },
    recurring: {
      enabled: false, frequencies: ['weekly'], defaultFrequency: 'weekly', maxOccurrences: 12,
    },
    toggles: {
      gpsTracking: true, liveMap: true, customerOtp: true, prescriptionVerification: false,
      documentVerification: false, payment: true, deliveryConfirmation: true,
    },
    fields: [],
    documents: [],
    approvalWorkflow: {
      requiresProviderAcceptance: true, requiresDocumentVerification: false, requiresAdminApproval: false,
    },
    validation: {
      minLeadTimeMinutes: 30, maxAdvanceDays: 30, requiresServiceAddress: true,
      requiresPhone: true, notesRequired: false,
    },
    legacyCategoryIds: [],
    requiresLicensedPharmacy: false,
  };
}

/**
 * Validates and sanitizes an admin-supplied category. Unknown top-level keys,
 * scripts, inline media and invalid options are rejected rather than ignored.
 */
export function normalizeServiceCategoryConfig(
  categoryId: string,
  input: unknown,
): ServiceCategoryConfig {
  if (!KEY_PATTERN.test(categoryId)) {
    throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_KEY', 'Category id must be lower_snake_case.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_CONFIG', 'Category configuration must be an object.');
  }
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      throw new ServiceCatalogValidationError('SERVICE_CATALOG_UNKNOWN_FIELD', `Unknown category setting: ${key}`);
    }
  }

  const defaults = createDefaultServiceCategoryConfig(text(raw.name, 'New service category'));
  const name = text(raw.name);
  if (name.length < 1 || name.length > 120) {
    throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_NAME', 'Service name must be 1–120 characters.');
  }
  const description = text(raw.description);
  if (description.length > 500) {
    throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_DESCRIPTION', 'Description is limited to 500 characters.');
  }
  const icon = text(raw.icon, defaults.icon);
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(icon)) {
    throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_ICON', 'Choose an approved icon key.');
  }
  const imageUrl = text(raw.imageUrl);
  if (!isSafeHttpsUrl(imageUrl)) {
    throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_IMAGE', 'Only HTTPS images are accepted; inline data is rejected.');
  }
  const accentColor = /^#[0-9a-f]{6}$/i.test(text(raw.accentColor)) ? text(raw.accentColor).toUpperCase() : defaults.accentColor;
  const deliveryKind = SERVICE_DELIVERY_KINDS.includes(raw.deliveryKind as ServiceDeliveryKind)
    ? raw.deliveryKind as ServiceDeliveryKind
    : defaults.deliveryKind;
  const bookingType = SERVICE_BOOKING_TYPES.includes(raw.bookingType as ServiceBookingType)
    ? raw.bookingType as ServiceBookingType
    : defaults.bookingType;
  const providerAssignment = SERVICE_PROVIDER_ASSIGNMENTS.includes(raw.providerAssignment as ServiceProviderAssignment)
    ? raw.providerAssignment as ServiceProviderAssignment
    : defaults.providerAssignment;
  const deliveryModes = stringArray(raw.deliveryModes, defaults.deliveryModes, SERVICE_DELIVERY_MODES) as ServiceDeliveryMode[];

  const pricingRaw = raw.pricing && typeof raw.pricing === 'object' ? raw.pricing as Record<string, unknown> : {};
  const pricingMode = SERVICE_PRICING_MODES.includes(pricingRaw.mode as ServicePricingMode)
    ? pricingRaw.mode as ServicePricingMode
    : defaults.pricing.mode;
  const pricing: ServicePricingConfig = {
    mode: pricingMode,
    amount: pricingMode === 'quote' ? 0 : money(pricingRaw.amount),
    currency: 'INR',
    unit: text(pricingRaw.unit, defaults.pricing.unit).slice(0, 40),
    quantityEnabled: bool(pricingRaw.quantityEnabled, defaults.pricing.quantityEnabled),
    minQuantity: integer(pricingRaw.minQuantity, 1, 1, 999),
    maxQuantity: integer(pricingRaw.maxQuantity, 10, 1, 999),
  };
  if (pricing.maxQuantity < pricing.minQuantity) pricing.maxQuantity = pricing.minQuantity;

  const recurringRaw = raw.recurring && typeof raw.recurring === 'object' ? raw.recurring as Record<string, unknown> : {};
  const frequencies = stringArray(
    recurringRaw.frequencies,
    defaults.recurring.frequencies,
    SERVICE_RECURRENCE_FREQUENCIES,
  ) as Array<Exclude<ServiceRecurrenceFrequency, 'none'>>;
  const defaultFrequency = frequencies.includes(recurringRaw.defaultFrequency as any)
    ? recurringRaw.defaultFrequency as Exclude<ServiceRecurrenceFrequency, 'none'>
    : frequencies[0];
  const recurring: ServiceRecurringConfig = {
    enabled: bool(recurringRaw.enabled, defaults.recurring.enabled),
    frequencies,
    defaultFrequency,
    maxOccurrences: integer(recurringRaw.maxOccurrences, defaults.recurring.maxOccurrences, 1, 365),
  };

  const togglesRaw = raw.toggles && typeof raw.toggles === 'object' ? raw.toggles as Record<string, unknown> : {};
  const toggles = { ...defaults.toggles };
  for (const toggle of SERVICE_TOGGLE_KEYS) {
    if (typeof togglesRaw[toggle] === 'boolean') toggles[toggle] = togglesRaw[toggle] as boolean;
  }

  const fieldsRaw = Array.isArray(raw.fields) ? raw.fields : defaults.fields;
  if (fieldsRaw.length > 40) {
    throw new ServiceCatalogValidationError('SERVICE_CATALOG_TOO_MANY_FIELDS', 'A category can have at most 40 booking fields.');
  }
  const fields: ServiceCategoryField[] = [];
  const fieldKeys = new Set<string>();
  for (const entry of fieldsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const field = entry as Record<string, unknown>;
    const key = text(field.key);
    const label = text(field.label);
    if (!FIELD_KEY_PATTERN.test(key)) {
      throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_FIELD_KEY', `Field key "${key}" must be lowerCamelCase.`);
    }
    if (fieldKeys.has(key)) {
      throw new ServiceCatalogValidationError('SERVICE_CATALOG_DUPLICATE_FIELD_KEY', `Duplicate field key: ${key}`);
    }
    fieldKeys.add(key);
    if (label.length < 1 || label.length > 120) {
      throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_FIELD_LABEL', `Field "${key}" needs a label.`);
    }
    const type = SERVICE_FIELD_TYPES.includes(field.type as ServiceFieldType)
      ? field.type as ServiceFieldType
      : 'text';
    const options = Array.isArray(field.options)
      ? field.options.filter((option): option is string => typeof option === 'string').map((option) => option.trim()).filter(Boolean).slice(0, 60)
      : undefined;
    if ((type === 'select' || type === 'multiselect') && (!options || !options.length)) {
      throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_FIELD_OPTIONS', `Field "${key}" needs at least one option.`);
    }
    fields.push({
      key,
      label,
      type,
      required: bool(field.required, false),
      ...(options && options.length ? { options: Array.from(new Set(options)) } : {}),
      maxLength: integer(field.maxLength, type === 'textarea' ? 500 : 120, 0, 4000),
      ...(text(field.placeholder) ? { placeholder: text(field.placeholder).slice(0, 160) } : {}),
      ...(text(field.helpText) ? { helpText: text(field.helpText).slice(0, 240) } : {}),
    });
  }

  const documentsRaw = Array.isArray(raw.documents) ? raw.documents : defaults.documents;
  if (documentsRaw.length > 20) {
    throw new ServiceCatalogValidationError('SERVICE_CATALOG_TOO_MANY_DOCUMENTS', 'A category can require at most 20 documents.');
  }
  const documents: ServiceCategoryDocument[] = [];
  const documentKeys = new Set<string>();
  for (const entry of documentsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const document = entry as Record<string, unknown>;
    const key = text(document.key);
    const label = text(document.label);
    if (!FIELD_KEY_PATTERN.test(key)) {
      throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_DOCUMENT_KEY', `Document key "${key}" must be lowerCamelCase.`);
    }
    if (documentKeys.has(key)) {
      throw new ServiceCatalogValidationError('SERVICE_CATALOG_DUPLICATE_DOCUMENT_KEY', `Duplicate document key: ${key}`);
    }
    documentKeys.add(key);
    if (label.length < 1 || label.length > 120) {
      throw new ServiceCatalogValidationError('SERVICE_CATALOG_INVALID_DOCUMENT_LABEL', `Document "${key}" needs a label.`);
    }
    const acceptedTypes = Array.isArray(document.acceptedTypes)
      ? document.acceptedTypes.filter((type): type is string => typeof type === 'string' && /^[a-z]+\/[a-z0-9.+-]+$/i.test(type)).slice(0, 12)
      : [];
    documents.push({
      key,
      label,
      required: bool(document.required, false),
      verificationRequired: bool(document.verificationRequired, false),
      ...(acceptedTypes.length ? { acceptedTypes } : {}),
    });
  }

  const approvalRaw = raw.approvalWorkflow && typeof raw.approvalWorkflow === 'object'
    ? raw.approvalWorkflow as Record<string, unknown>
    : {};
  const validationRaw = raw.validation && typeof raw.validation === 'object'
    ? raw.validation as Record<string, unknown>
    : {};

  const config: ServiceCategoryConfig = {
    schemaVersion: integer(raw.schemaVersion, 1, 1, 100),
    name,
    description,
    icon,
    imageUrl,
    accentColor,
    deliveryKind,
    bookingType,
    providerAssignment,
    deliveryModes,
    pricing,
    recurring,
    toggles,
    fields,
    documents,
    approvalWorkflow: {
      requiresProviderAcceptance: bool(approvalRaw.requiresProviderAcceptance, true),
      requiresDocumentVerification: bool(approvalRaw.requiresDocumentVerification, false),
      requiresAdminApproval: bool(approvalRaw.requiresAdminApproval, false),
    },
    validation: {
      minLeadTimeMinutes: integer(validationRaw.minLeadTimeMinutes, 30, 0, 10080),
      maxAdvanceDays: integer(validationRaw.maxAdvanceDays, 30, 1, 365),
      requiresServiceAddress: bool(validationRaw.requiresServiceAddress, true),
      requiresPhone: bool(validationRaw.requiresPhone, true),
      notesRequired: bool(validationRaw.notesRequired, false),
    },
    legacyCategoryIds: stringArray(raw.legacyCategoryIds, []),
    requiresLicensedPharmacy: bool(raw.requiresLicensedPharmacy, false),
  };

  return applyServiceCategoryHardRules(categoryId, config);
}

export function normalizePublicServiceCategory(input: unknown): PublicServiceCategory | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const id = text(row.id);
  if (!KEY_PATTERN.test(id)) return null;
  const rawConfig = row.config;
  let config: ServiceCategoryConfig;
  try {
    config = normalizeServiceCategoryConfig(id, rawConfig);
  } catch {
    return null;
  }
  return {
    id,
    tenantId: text(row.tenantId, 'default'),
    enabled: row.enabled !== false,
    versionNumber: integer(row.versionNumber, 1, 1, Number.MAX_SAFE_INTEGER),
    config,
  };
}

export function categoryConfigForListing(
  catalog: readonly PublicServiceCategory[],
  categoryId: string | null | undefined,
): PublicServiceCategory | null {
  if (!categoryId) return null;
  return catalog.find((category) => category.id === categoryId)
    || catalog.find((category) => category.config.legacyCategoryIds.includes(categoryId))
    || null;
}

export function serviceCategoryIconEmoji(icon: string): string {
  const map: Record<string, string> = {
    'heart-handshake': '🤝',
    pill: '💊',
    droplets: '💧',
    wrench: '🛠️',
    sparkles: '✨',
    package: '📦',
    truck: '🚚',
    stethoscope: '🩺',
    'shield-check': '🛡️',
    home: '🏠',
    calendar: '📅',
    repeat: '🔁',
    baby: '👶',
    'graduation-cap': '🎓',
    leaf: '🌿',
    zap: '⚡',
    scissors: '✂️',
    car: '🚗',
    utensils: '🍽️',
    'book-open': '📖',
    'paw-print': '🐾',
    briefcase: '💼',
  };
  return map[icon] || '🛠️';
}

export function computeServiceBookingAmount(
  config: ServiceCategoryConfig,
  listingPrice: number,
  requestedQuantity: unknown,
): { amount: number; quantity: number; basis: string } {
  const quantity = config.pricing.quantityEnabled
    ? integer(requestedQuantity, config.pricing.minQuantity, 1, 999)
    : 1;
  if (config.pricing.quantityEnabled
      && (quantity < config.pricing.minQuantity || quantity > config.pricing.maxQuantity)) {
    throw new ServiceCatalogValidationError(
      'SERVICE_INVALID_QUANTITY',
      `Quantity must be between ${config.pricing.minQuantity} and ${config.pricing.maxQuantity}.`,
    );
  }
  const listingAmount = Number.isFinite(listingPrice) && listingPrice > 0 ? listingPrice : 0;
  let amount: number;
  if (config.pricing.mode === 'quote') {
    amount = listingAmount;
  } else {
    amount = Math.round(config.pricing.amount * quantity * 100) / 100;
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > 9_999_999_999.99) {
    throw new ServiceCatalogValidationError('SERVICE_INVALID_AMOUNT', 'The computed booking amount is out of range.');
  }
  return {
    amount,
    quantity,
    basis: config.pricing.mode === 'quote'
      ? 'provider quote'
      : `${config.pricing.unit || 'per booking'} × ${quantity}`,
  };
}

export function normalizeServiceRecurrence(
  config: ServiceCategoryConfig,
  input: { frequency?: unknown; occurrences?: unknown } | null | undefined,
): { frequency: ServiceRecurrenceFrequency; occurrences: number | null } {
  const requested = text(input?.frequency, 'none') as ServiceRecurrenceFrequency;
  if (requested === 'none') {
    return { frequency: 'none', occurrences: null };
  }
  if (!config.recurring.enabled || !config.recurring.frequencies.includes(requested as any)) {
    throw new ServiceCatalogValidationError('RECURRING_NOT_AVAILABLE', 'This service does not offer that recurring schedule.');
  }
  const occurrences = integer(input?.occurrences, config.recurring.maxOccurrences, 1, 365);
  if (occurrences > config.recurring.maxOccurrences) {
    throw new ServiceCatalogValidationError('SERVICE_INVALID_RECURRENCE', `At most ${config.recurring.maxOccurrences} deliveries can be scheduled.`);
  }
  return { frequency: requested, occurrences };
}

export function normalizeServiceBookingFieldValues(
  config: ServiceCategoryConfig,
  values: unknown,
): ServiceBookingFieldValues {
  if (values !== undefined && values !== null && (typeof values !== 'object' || Array.isArray(values))) {
    throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUES', 'Booking field values must be an object.');
  }
  const raw = (values && typeof values === 'object' ? values : {}) as Record<string, unknown>;
  const known = new Set(config.fields.map((field) => field.key));
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      throw new ServiceCatalogValidationError('SERVICE_UNKNOWN_FIELD', `Unknown booking field: ${key}`);
    }
  }
  const result: ServiceBookingFieldValues = {};
  for (const field of config.fields) {
    const value = raw[field.key];
    const missing = value === undefined || value === null || value === ''
      || (Array.isArray(value) && value.length === 0);
    if (missing) {
      if (field.required) {
        throw new ServiceCatalogValidationError('SERVICE_REQUIRED_FIELDS_MISSING', `${field.label} is required.`);
      }
      continue;
    }
    switch (field.type) {
      case 'number': {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUE', `${field.label} must be a number.`);
        }
        result[field.key] = parsed;
        break;
      }
      case 'checkbox':
        if (typeof value !== 'boolean') {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUE', `${field.label} must be yes or no.`);
        }
        result[field.key] = value;
        break;
      case 'select': {
        const selected = text(value);
        if (field.options && !field.options.includes(selected)) {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUE', `${field.label} has an invalid option.`);
        }
        result[field.key] = selected;
        break;
      }
      case 'multiselect': {
        if (!Array.isArray(value)) {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUE', `${field.label} must be a list.`);
        }
        const selected = value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
        if (field.options && selected.some((entry) => !field.options!.includes(entry))) {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUE', `${field.label} has an invalid option.`);
        }
        result[field.key] = Array.from(new Set(selected)).slice(0, 60);
        break;
      }
      case 'date': {
        const date = text(value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUE', `${field.label} must be a valid date.`);
        }
        result[field.key] = date;
        break;
      }
      case 'phone': {
        const phone = text(value);
        if (!/^\+?[0-9][0-9\s().-]{5,22}$/.test(phone)) {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUE', `${field.label} must be a valid phone number.`);
        }
        result[field.key] = phone;
        break;
      }
      case 'email': {
        const email = text(value);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUE', `${field.label} must be a valid email address.`);
        }
        result[field.key] = email;
        break;
      }
      case 'document': {
        const reference = text(value);
        if (!isServiceDocumentReference(reference)) {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_DOCUMENT_REFERENCE', `${field.label} needs a secure document reference.`);
        }
        result[field.key] = reference;
        break;
      }
      default: {
        const stringValue = text(value);
        if (!stringValue) continue;
        const limit = Math.min(4000, Math.max(1, field.maxLength || 2000));
        if (stringValue.length > limit) {
          throw new ServiceCatalogValidationError('SERVICE_INVALID_FIELD_VALUE', `${field.label} is too long.`);
        }
        result[field.key] = stringValue;
        break;
      }
    }
  }
  return result;
}

export function isServiceDocumentReference(value: string): boolean {
  if (!value || value.length < 8 || value.length > 2048) return false;
  if (!DOCUMENT_REFERENCE_PATTERN.test(value)) return false;
  if (UNSAFE_URL_PATTERN.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'storage:';
  } catch {
    return false;
  }
}

export function normalizeServiceBookingDocuments(
  config: ServiceCategoryConfig,
  documents: unknown,
): ServiceDocumentInput[] {
  if (documents !== undefined && documents !== null && !Array.isArray(documents)) {
    throw new ServiceCatalogValidationError('SERVICE_INVALID_DOCUMENTS', 'Documents must be a list.');
  }
  const requirements = new Map(config.documents.map((document) => [document.key, document]));
  const seen = new Set<string>();
  const result: ServiceDocumentInput[] = [];
  for (const entry of (Array.isArray(documents) ? documents : [])) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const key = text(row.key);
    const requirement = requirements.get(key);
    if (!requirement) {
      throw new ServiceCatalogValidationError('SERVICE_UNKNOWN_DOCUMENT', `Unknown document: ${key}`);
    }
    if (seen.has(key)) {
      throw new ServiceCatalogValidationError('SERVICE_DUPLICATE_DOCUMENT', `Duplicate document: ${key}`);
    }
    const reference = text(row.reference);
    if (!isServiceDocumentReference(reference)) {
      throw new ServiceCatalogValidationError('SERVICE_INVALID_DOCUMENT_REFERENCE', `${requirement.label} needs a secure document reference.`);
    }
    const mimeType = text(row.mimeType);
    if (mimeType && requirement.acceptedTypes?.length && !requirement.acceptedTypes.includes(mimeType)) {
      throw new ServiceCatalogValidationError('SERVICE_DOCUMENT_TYPE_NOT_ALLOWED', `${requirement.label} does not accept ${mimeType}.`);
    }
    seen.add(key);
    result.push({
      key,
      reference,
      ...(text(row.fileName) ? { fileName: text(row.fileName).slice(0, 200) } : {}),
      ...(mimeType ? { mimeType: mimeType.slice(0, 120) } : {}),
    });
  }
  for (const requirement of config.documents) {
    if (requirement.required && !seen.has(requirement.key)) {
      throw new ServiceCatalogValidationError('SERVICE_REQUIRED_DOCUMENTS_MISSING', `${requirement.label} is required.`);
    }
  }
  return result;
}

export function assertServiceBookingWindow(
  config: ServiceCategoryConfig,
  scheduledDate: string,
  timeSlot: string,
  now = new Date(),
): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    throw new ServiceCatalogValidationError('INVALID_SERVICE_DATE', 'Choose a valid service date.');
  }
  const today = now.toISOString().slice(0, 10);
  if (scheduledDate < today) {
    throw new ServiceCatalogValidationError('SERVICE_DATE_IN_PAST', 'Choose today or a future date.');
  }
  const maxDate = new Date(now.getTime() + config.validation.maxAdvanceDays * 86_400_000).toISOString().slice(0, 10);
  if (scheduledDate > maxDate) {
    throw new ServiceCatalogValidationError('SERVICE_DATE_TOO_FAR', `Bookings open ${config.validation.maxAdvanceDays} days ahead.`);
  }
  if (scheduledDate === today) {
    const match = /^(\d{1,2}):(\d{2})/.exec(timeSlot.trim());
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (Number.isFinite(hours) && Number.isFinite(minutes)) {
        const slot = new Date(now);
        slot.setHours(hours, minutes, 0, 0);
        if (slot.getTime() < now.getTime() + config.validation.minLeadTimeMinutes * 60_000) {
          throw new ServiceCatalogValidationError(
            'SERVICE_LEAD_TIME_NOT_MET',
            `This service needs at least ${config.validation.minLeadTimeMinutes} minutes of notice.`,
          );
        }
      }
    }
  }
}

export function serviceCatalogErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code
    || (error instanceof Error ? error.message : '')
    || 'SERVICE_CATALOG_UNAVAILABLE';
  const messages: Record<string, string> = {
    SERVICE_CATALOG_UNAVAILABLE: 'Service configuration is unavailable right now.',
    SERVICE_CATALOG_NOT_CONFIGURED: 'Service configuration requires the PostgreSQL repository.',
    SERVICE_CATALOG_AUTH_REQUIRED: 'Sign in as an administrator to manage service categories.',
    SERVICE_CATALOG_ADMIN_REQUIRED: 'Only an administrator can review service documents and licences.',
    SERVICE_CATALOG_SUPER_ADMIN_REQUIRED: 'Only a Super Admin can create, publish or disable service categories.',
    SERVICE_CATALOG_NOT_FOUND: 'That service category no longer exists.',
    SERVICE_CATALOG_VERSION_NOT_FOUND: 'That configuration version no longer exists.',
    SERVICE_CATALOG_VERSION_CONFLICT: 'Another administrator saved a newer draft. Reload before saving.',
    SERVICE_CATALOG_INVALID_CONFIG: 'The category configuration is invalid.',
    SERVICE_CATALOG_INVALID_KEY: 'Category id must be lower_snake_case.',
    SERVICE_CATALOG_INVALID_NAME: 'Enter a service name between 1 and 120 characters.',
    SERVICE_CATALOG_INVALID_ICON: 'Choose an approved icon key.',
    SERVICE_CATALOG_INVALID_IMAGE: 'Use an HTTPS image URL. Inline data is not stored.',
    SERVICE_CATALOG_INVALID_PRICING: 'Check the pricing mode, amount and currency.',
    SERVICE_CATALOG_INVALID_QUANTITY: 'Check the minimum and maximum quantity.',
    SERVICE_CATALOG_INVALID_FIELD_KEY: 'Field keys must be lowerCamelCase.',
    SERVICE_CATALOG_DUPLICATE_FIELD_KEY: 'Two booking fields share the same key.',
    SERVICE_CATALOG_INVALID_FIELD_OPTIONS: 'Select fields need at least one option.',
    SERVICE_CATALOG_INVALID_DOCUMENT_KEY: 'Document keys must be lowerCamelCase.',
    SERVICE_CATALOG_INVALID_DOCUMENT_LABEL: 'Every document needs a label.',
    SERVICE_CATALOG_DUPLICATE_DOCUMENT_KEY: 'Two documents share the same key.',
    SERVICE_CATALOG_REASON_REQUIRED: 'Write a short audit reason before enabling or disabling a category.',
    SERVICE_CATALOG_REVIEW_NOTE_REQUIRED: 'Write a review note so the decision is auditable.',
    SERVICE_REQUIRED_FIELDS_MISSING: 'Complete the required booking fields.',
    SERVICE_REQUIRED_DOCUMENTS_MISSING: 'Attach the required documents before booking.',
    SERVICE_UNKNOWN_FIELD: 'One of the submitted booking fields is not part of this service.',
    SERVICE_UNKNOWN_DOCUMENT: 'One of the submitted documents is not required by this service.',
    SERVICE_INVALID_DOCUMENT_REFERENCE: 'Use a secure storage:// or https:// document reference.',
    SERVICE_DOCUMENT_TYPE_NOT_ALLOWED: 'That document type is not accepted for this requirement.',
    SERVICE_DELIVERY_MODE_NOT_ALLOWED: 'Choose one of the delivery options offered for this service.',
    SERVICE_INVALID_FIELD_VALUE: 'Check the highlighted booking field.',
    SERVICE_INVALID_QUANTITY: 'Choose a quantity within the allowed range.',
    SERVICE_INVALID_AMOUNT: 'The computed amount is outside the allowed range.',
    RECURRING_NOT_AVAILABLE: 'This service does not offer that recurring schedule.',
    SERVICE_INVALID_RECURRENCE: 'Choose fewer recurring deliveries.',
    SERVICE_LEAD_TIME_NOT_MET: 'Choose a later time. This service needs more notice.',
    SERVICE_DATE_TOO_FAR: 'Choose a date within the booking window.',
    SERVICE_DATE_IN_PAST: 'Choose today or a future date.',
    SERVICE_CATEGORY_DISABLED: 'This service category is disabled.',
    MEDICINE_PRESCRIPTION_REQUIRED: 'Medicine bookings require a prescription document.',
    LICENSED_PHARMACY_REQUIRED: 'Medicine delivery requires a verified licensed pharmacy.',
    PRESCRIPTION_NOT_VERIFIED: 'A pharmacist must verify the prescription before handover.',
    SERVICE_DOCUMENTS_NOT_VERIFIED: 'Required documents must be verified before this booking can complete.',
    DELIVERY_CONFIRMATION_REQUIRED: 'Confirm delivery before completing this booking.',
    SERVICE_BOOKING_CONFIG_IMMUTABLE: 'The service configuration on a booking cannot be changed after it is placed.',
    PAYMENT_DISABLED_FOR_SERVICE: 'This service does not collect payment through BookOurSpace.',
    OTP_DISABLED_FOR_SERVICE: 'This service does not use a customer OTP.',
    ADMIN_APPROVAL_REQUIRED: 'This service requires an administrator to accept the booking.',
    SERVICE_CATALOG_INVALID_DELIVERY_MODES: 'Choose at least one delivery option.',
    SERVICE_CATALOG_INVALID_TOGGLES: 'Feature toggles must be on or off.',
    SERVICE_CATALOG_INVALID_RECURRING: 'Check the recurring schedule settings.',
    SERVICE_CATALOG_INVALID_APPROVAL: 'Check the approval workflow settings.',
    SERVICE_CATALOG_INVALID_VALIDATION: 'Check the lead time and booking window.',
    SERVICE_CATALOG_TOO_MANY_FIELDS: 'A category can have at most 40 booking fields.',
    SERVICE_CATALOG_TOO_MANY_DOCUMENTS: 'A category can have at most 20 required documents.',
    SERVICE_CATALOG_CONFIG_TOO_LARGE: 'The category configuration is too large.',
    SERVICE_CATALOG_VERSION_IMMUTABLE: 'Published configuration versions are immutable.',
    SERVICE_CATALOG_TENANT_MISMATCH: 'That configuration belongs to another tenant.',
    SERVICE_CATALOG_INVALID_REVIEW_STATUS: 'Review decisions must be verified or rejected.',
  };
  return messages[code] || messages.SERVICE_CATALOG_UNAVAILABLE;
}
