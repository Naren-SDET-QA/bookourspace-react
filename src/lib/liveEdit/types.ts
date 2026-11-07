/**
 * Live Edit domain model.
 *
 * The Live Edit surface is intentionally *data-free*: nothing in this module
 * reads a role from local state, localStorage, a query string or a React
 * context. Authority is resolved from a server-verified Supabase profile (see
 * `authority.ts`) and every write is performed by the existing authenticated
 * server APIs (see `repository.ts`).
 */

export const LIVE_EDIT_MODULES = [
  'pg_hostels',
  'classes',
  'venues',
  'services',
  'hotel_stay',
  'movies',
] as const;

export type LiveEditModule = (typeof LIVE_EDIT_MODULES)[number];

export const LIVE_EDIT_MODULE_LABELS: Record<LiveEditModule, string> = {
  pg_hostels: "PGs & Hostels",
  classes: 'Classes & Courses',
  venues: 'Halls & Venues',
  services: 'Home Services',
  hotel_stay: 'Hotels & Stays',
  movies: 'Movies',
};

export const LIVE_EDIT_MODULE_ICONS: Record<LiveEditModule, string> = {
  pg_hostels: '🛏️',
  classes: '🎓',
  venues: '🏛️',
  services: '🛠️',
  hotel_stay: '🏨',
  movies: '🎬',
};

/** Role after server-side verification. Never supplied by the caller. */
export type LiveEditActorRole = 'provider' | 'admin' | 'super_admin';

export type LiveEditScopeKind = 'platform' | 'assigned' | 'owned';

export type LiveEditListingStatus =
  | 'pending_approval'
  | 'active'
  | 'expired'
  | 'archived'
  | 'rejected';

export type ProviderAvailabilityStatus = 'not_reported' | 'available' | 'unavailable';

/** Availability authored by the listing owner; stored in the listing payload. */
export type LiveEditAvailabilityStatus = 'available' | 'limited' | 'sold_out' | 'not_reported';

export interface LiveEditAvailability {
  status: LiveEditAvailabilityStatus;
  /** Free-text note for customers, e.g. "2 beds left from 1 Dec". */
  note: string;
  /** Latest first bookable date (YYYY-MM-DD) or an empty string. */
  nextAvailableFrom: string;
  /** Units/beds/seats left when the module counts them. `null` = not reported. */
  unitsAvailable: number | null;
}

export interface LiveEditDraftAvailability {
  status: LiveEditAvailabilityStatus;
  note: string;
  nextAvailableFrom: string;
  unitsAvailable: string;
}

export type LiveEditDetailValue = string | number | boolean;

/**
 * Editable projection of one listing (or cinema screen for the Movies module).
 *
 * `price` stays a string on the draft so an empty input can be validated
 * instead of silently becoming `0`.
 */
export interface LiveEditDraft {
  title: string;
  description: string;
  categoryId: string;
  subcategory: string;
  price: string;
  priceUnit: string;
  images: string[];
  facilities: string[];
  availability: LiveEditDraftAvailability;
  details: Record<string, LiveEditDetailValue>;
}

export interface LiveEditListing {
  id: string;
  module: LiveEditModule;
  ownerId: string;
  ownerName?: string;
  title: string;
  description: string;
  categoryId: string;
  subcategory: string;
  entityType: string;
  price: number;
  priceUnit: string;
  images: string[];
  facilities: string[];
  availability: LiveEditAvailability;
  details: Record<string, LiveEditDetailValue>;
  status: LiveEditListingStatus;
  isVerified: boolean;
  providerAvailabilityStatus: ProviderAvailabilityStatus;
  updatedAt: string;
  /** Where the record is persisted. Only authoritative stores may be written. */
  source: 'supabase_listings' | 'server_cinema_store';
  /** The untouched row/cinema screen, used to merge non-edited payload keys. */
  raw: Record<string, unknown>;
}

export interface LiveEditAssignment {
  moduleId: LiveEditModule;
  /** Optional narrowing to specific categories. */
  categoryIds: string[];
  /** Optional narrowing to specific listing ids. */
  listingIds: string[];
}

export type LiveEditAuthorityFailureCode =
  | 'NOT_AUTHENTICATED'
  | 'PROFILE_UNAVAILABLE'
  | 'ACCOUNT_INACTIVE'
  | 'ROLE_NOT_ELIGIBLE'
  | 'SUPER_ADMIN_CHECK_FAILED'
  | 'ASSIGNMENTS_UNAVAILABLE'
  | 'NO_ASSIGNED_CONTENT';

export interface LiveEditAuthorityGrant {
  ok: true;
  actor: {
    userId: string;
    role: LiveEditActorRole;
    email?: string;
    displayName?: string;
  };
  scope: LiveEditScopeKind;
  /** `'all'` only for a verified Super Admin. */
  modules: LiveEditModule[] | 'all';
  assignments: LiveEditAssignment[];
  capabilities: LiveEditCapabilities;
}

export interface LiveEditAuthorityDenied {
  ok: false;
  code: LiveEditAuthorityFailureCode;
  message: string;
  /** True when the refusal is caused by missing hosted database objects. */
  blocked: boolean;
}

export type LiveEditAuthority = LiveEditAuthorityGrant | LiveEditAuthorityDenied;

export interface LiveEditCapabilities {
  scope: LiveEditScopeKind;
  /** Content columns + payload fields. */
  canEditContent: boolean;
  canEditPricing: boolean;
  canEditImages: boolean;
  canEditFacilities: boolean;
  canEditCategories: boolean;
  /** Owner-authored availability (payload). */
  canEditAvailability: boolean;
  /** Admin moderation signal (`provider_availability_status`). */
  canEditModerationAvailability: boolean;
  canEditVerification: boolean;
  /** Cinema screen operations for the Movies module. */
  canEditCinemaScreens: boolean;
  /** Publication stays on the existing review endpoints, never in Live Edit. */
  canChangePublicationStatus: false;
  readOnlyFields: string[];
}

export interface LiveEditFieldErrorMap {
  [fieldPath: string]: string;
}

export interface LiveEditValidationResult {
  ok: boolean;
  errors: LiveEditFieldErrorMap;
  draft: LiveEditDraft;
}

export type LiveEditChangeType =
  | 'listing.update'
  | 'cinema_screen.update'
  | 'cinema_screen.create'
  | 'cinema_screen.owner_assigned'
  | 'cinema_screen.owner_revoked';

export interface LiveEditAuditEventInput {
  action: LiveEditChangeType;
  module: LiveEditModule;
  listingId: string;
  listingTitle: string;
  actorUserId: string;
  actorRole: LiveEditActorRole;
  changedFields: string[];
  occurredAt: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  source:
    | 'live_edit_ui'
    | 'server_listing_trigger'
    | 'server_cinema_api'
    | 'server_cinema_trigger'
    | 'server_cinema_owner_trigger';
}

export interface LiveEditAuditEvent extends LiveEditAuditEventInput {
  id: string;
  summary: string;
}

export type LiveEditSaveStatus = 'saved' | 'rejected';

export interface LiveEditSaveResult {
  status: LiveEditSaveStatus;
  /** True only when the authoritative backend confirmed the write. */
  persisted: boolean;
  listing?: LiveEditListing;
  errorCode?: string;
  message: string;
  audit: {
    status: 'recorded' | 'blocked' | 'skipped';
    message: string;
  };
  /** Read-after-write verification for stores that do not return the row. */
  verified: boolean;
}

export type LiveEditTableStatus = 'ready' | 'missing' | 'unknown';

export interface LiveEditIntegrationStatus {
  checkedAt: string;
  listingsTable: LiveEditTableStatus;
  auditTable: LiveEditTableStatus;
  assignmentsTable: LiveEditTableStatus;
  realtimeListings: LiveEditTableStatus;
  cinemaStore: LiveEditTableStatus;
  blocked: boolean;
  messages: string[];
}

export interface LiveEditListResult {
  ok: boolean;
  source: LiveEditListing['source'] | null;
  listings: LiveEditListing[];
  errorCode?: string;
  message: string;
  blocked: boolean;
}

export type LiveEditFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'select'
  | 'boolean'
  | 'url'
  | 'date'
  | 'time-list'
  | 'tier-pricing';

export interface LiveEditFieldDefinition {
  key: string;
  label: string;
  kind: LiveEditFieldKind;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  help?: string;
  /** Set when this field has no authorized persistence path for the module. */
  blockedReason?: string;
}

export interface LiveEditModuleSchema {
  module: LiveEditModule;
  store: LiveEditListing['source'];
  /** Categories are validated against this prefix when `true`. */
  categoryPrefixes: string[];
  priceUnits: string[];
  detailFields: LiveEditFieldDefinition[];
  facilitySuggestions: string[];
  descriptionMaxLength: number;
  imageLimit: number;
  supportsImages: boolean;
  supportsFacilities: boolean;
  supportsCategories: boolean;
  supportsAvailability: boolean;
  supportsPricing: boolean;
  supportsCinemaScreens: boolean;
  /** Fields that are displayed read-only with an explanation. */
  blockedFields: Partial<Record<'description' | 'images' | 'categories' | 'facilities', string>>;
}
