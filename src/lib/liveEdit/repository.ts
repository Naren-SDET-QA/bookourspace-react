import {
  fetchMoviesInventory,
  fetchServerProviderListings,
  saveServerProviderListing,
  updateCinemaScreenConfig,
  type AuthoritativeCinemaScreenConfig,
} from '../supabaseClient';
import { canEditListing } from './authority';
import { liveEditModuleSchema } from './moduleSchemas';
import {
  buildCinemaScreenUpdateInput,
  buildListingUpdateInput,
  draftFromListing,
  listingFromCinemaScreen,
  listingFromRow,
  providerAvailabilityFromStatus,
  type CinemaScreenLike,
  type LiveEditRow,
} from './mapping';
import type {
  LiveEditAuthority,
  LiveEditDraft,
  LiveEditListing,
  LiveEditModule,
  LiveEditSaveResult,
} from './types';
import { changedFieldPaths, validateLiveEditDraft } from './validation';

export interface LiveEditListDepsResult {
  ok: boolean;
  httpStatus: number;
  source?: string;
  listings: LiveEditRow[];
  error?: string;
  message?: string;
}

export interface LiveEditSaveDepsResult {
  ok: boolean;
  httpStatus: number;
  error?: string;
  message?: string;
  source?: string;
  listing?: Record<string, unknown>;
  auditEventId?: string;
}

export interface LiveEditCinemaDepsResult {
  ok: boolean;
  screens: CinemaScreenLike[];
  message?: string;
}

export interface LiveEditRepositoryDeps {
  fetchListings(admin: boolean): Promise<LiveEditListDepsResult>;
  saveListing(listingId: string, body: Record<string, unknown>): Promise<LiveEditSaveDepsResult>;
  fetchCinemaInventory(): Promise<LiveEditCinemaDepsResult>;
  updateCinemaScreen(body: Record<string, unknown>): Promise<LiveEditSaveDepsResult & { screen?: CinemaScreenLike }>;
}

export interface LiveEditRepository {
  list(authority: LiveEditAuthority, module: LiveEditModule): Promise<LiveEditListResult>;
  save(authority: LiveEditAuthority, listing: LiveEditListing, draft: LiveEditDraft): Promise<LiveEditSaveResult>;
  supportsWrites(module: LiveEditModule): boolean;
}

export interface LiveEditListResult {
  ok: boolean;
  source: LiveEditListing['source'] | null;
  listings: LiveEditListing[];
  errorCode?: string;
  message: string;
  blocked: boolean;
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED_SESSION: 'Your session expired. Sign in again before editing.',
  ACTIVE_PROFILE_REQUIRED: 'An active, server-verified profile is required.',
  SESSION_ROLE_MISMATCH: 'The signed session role does not match the current database profile.',
  LISTING_REVIEW_ENDPOINT_REQUIRED: 'Publication is handled by the admin review workflow, not Live Edit.',
  INVALID_LISTING_STATUS: 'The server rejected the listing status.',
  FORBIDDEN_PROVIDER_ROLE_REQUIRED: 'Only an active provider or administrator can edit listings.',
  FORBIDDEN_NOT_LISTING_OWNER: 'You can only edit your own listings.',
  FORBIDDEN_ADMIN_APPROVAL_REQUIRED: 'Publication is handled by the admin review workflow, not Live Edit.',
  FORBIDDEN_VERIFICATION_FIELD: 'Verification and moderation availability are administrator-only fields.',
  POSTGRES_IDENTITY_UNMAPPED: 'This session has no verified Supabase identity, so PostgreSQL writes are blocked.',
  CONCURRENT_MODIFICATION: 'This listing changed after you opened it. Reload before saving.',
  LISTING_NOT_FOUND: 'This listing no longer exists or is no longer visible to your account.',
  MOVIES_MODULE_DISPLAY_ONLY: 'Movie listing writes are refused by the server. Use the cinema screen fields instead.',
  INVALID_LISTING_PRICE: 'The server rejected the price. Review the pricing fields.',
  INVALID_LISTING_FIELDS: 'The server rejected one or more listing fields.',
  INVALID_PROVIDER_AVAILABILITY: 'The server rejected the availability status.',
  LISTING_REPOSITORY_ERROR: 'The PostgreSQL listing repository failed. Nothing was confirmed.',
  PERSISTENCE_NOT_POSTGRES: 'The server is not using PostgreSQL/Supabase persistence. Hosted Live Edit writes are BLOCKED.',
  AUDIT_TABLE_MISSING: 'The audit table is not installed; the save is reported without a confirmed audit event.',
  AUDIT_PERSISTENCE_FAILED: 'The server rolled the change back because its audit event could not be persisted.',
  STORE_PERSISTENCE_FAILED: 'The cinema store could not be persisted; the audit event was rolled back.',
  LISTING_ASSIGNMENT_REQUIRED: 'This listing is outside the modules, categories or listings assigned to this administrator.',
  SUPER_ADMIN_REQUIRED: 'Verification, featured and moderation fields are Super Admin only.',
  INVALID_LISTING_IMAGES: 'Images must be credential-free https:// URLs or storage://bos-public-media object references.',
  INVALID_LISTING_FACILITIES: 'Facilities are invalid.',
  INVALID_LISTING_AVAILABILITY: 'Availability is invalid.',
  INVALID_LISTING_DETAILS: 'One or more module-specific fields are invalid.',
  INVALID_LISTING_CATEGORY: 'The category does not belong to a supported marketplace module.',
  LISTING_MODULE_CHANGE_FORBIDDEN: 'A provider cannot move a listing to another module.',
  FORBIDDEN_CINEMA_SCREEN: 'This cinema screen is not owned by your account or covered by an assignment.',
  SCREEN_TARGET_MISMATCH: 'The screen and listing identifiers do not refer to the same cinema screen.',
  LIVE_EDIT_SECURITY_UNAVAILABLE: 'The PostgreSQL Live Edit security layer is unavailable. No screen was changed.',
  INVALID_CINEMA_FIELDS: 'One or more cinema screen fields are invalid.',
  ACTIVE_PROVIDER_REQUIRED: 'The cinema owner must be an active provider account.',
  CINEMA_SCREEN_NOT_FOUND: 'The cinema screen no longer exists.',
  CINEMA_SCREEN_ID_IMMUTABLE: 'A cinema screen id cannot be changed.',
  CINEMA_LISTING_CHANGE_FORBIDDEN: 'A provider cannot move a screen to another cinema listing.',
};

export function describeLiveEditApiError(code: string | undefined, fallback: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallback;
}

function rejected(errorCode: string, message: string, auditMessage = 'No audit event was written.'): LiveEditSaveResult {
  return {
    status: 'rejected',
    persisted: false,
    errorCode,
    message,
    audit: { status: 'skipped', message: auditMessage },
    verified: false,
  };
}

function isAdminListingScope(authority: LiveEditAuthority): boolean {
  return authority.ok && authority.actor.role !== 'provider';
}

function normalizeAvailability(value: unknown): string {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const units =
    record.unitsAvailable === null || record.unitsAvailable === undefined || record.unitsAvailable === ''
      ? ''
      : String(Number(record.unitsAvailable));
  return JSON.stringify({
    status: String(record.status ?? ''),
    note: String(record.note ?? ''),
    nextAvailableFrom: String(record.nextAvailableFrom ?? ''),
    unitsAvailable: units,
  });
}

function listingPayloadMatches(
  row: LiveEditRow,
  draft: LiveEditDraft,
  module: LiveEditModule
): boolean {
  const payload = row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {};
  const customFields =
    payload.customFieldValues && typeof payload.customFieldValues === 'object'
      ? (payload.customFieldValues as Record<string, unknown>)
      : {};
  if (String(row.title || '') !== draft.title) return false;
  if (Number(row.price) !== Number(draft.price)) return false;
  if (String(row.price_unit || '') !== draft.priceUnit) return false;
  if (String(row.category_id || '') !== draft.categoryId) return false;
  if (String(row.subcategory || '') !== draft.subcategory) return false;
  if (String(payload.description || '') !== draft.description) return false;
  if (JSON.stringify(payload.images || []) !== JSON.stringify(draft.images.filter(Boolean))) return false;
  if (JSON.stringify(payload.facilities || []) !== JSON.stringify(draft.facilities.filter(Boolean))) return false;
  if (normalizeAvailability(payload.availability) !== normalizeAvailability(draft.availability)) return false;
  for (const field of liveEditModuleSchema(module).detailFields) {
    const value = draft.details[field.key];
    if (value === undefined) continue;
    if (String(customFields[field.key] ?? '') !== String(value)) return false;
  }
  return true;
}

function screenMatches(screen: CinemaScreenLike, draft: LiveEditDraft): boolean {
  const name = String(screen.cinemaName || screen.cinemaTitle || '');
  const screenName = String(screen.screenName || '');
  const showtimes = Array.isArray(screen.showtimes) ? screen.showtimes.map(String) : [];
  const expectedShowtimes = String(draft.details.showtimes ?? '')
    .split(/[,\n;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const format = String(screen.projectionFormat || screen.format || '');
  const sound = String(screen.soundFormat || screen.soundSystem || '');
  const cutoff = Number(screen.cancellationCutoffMins ?? screen.cancellationCutoffMinutes ?? 0);
  const expectedTiers = String(draft.details.tierPricing ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [tierName, price] = line.split('=');
      return { name: (tierName || '').trim(), price: Number((price || '').replace(/[₹\s]/g, '')) };
    });
  const actualTiers = Array.isArray(screen.tiers) ? screen.tiers : [];
  return (
    name === draft.title.trim() &&
    screenName === draft.subcategory.trim() &&
    format === String(draft.details.format ?? '') &&
    sound === String(draft.details.soundSystem ?? '') &&
    showtimes.length === expectedShowtimes.length &&
    expectedShowtimes.every((entry) => showtimes.includes(entry)) &&
    cutoff === Number(draft.details.cancellationCutoffMinutes ?? 0) &&
    Number(screen.refundPercent ?? 0) === Number(draft.details.refundPercent ?? 0) &&
    (screen.fnbDeliveryEnabled === true) === (draft.details.fnbDeliveryEnabled === true) &&
    expectedTiers.every((tier) =>
      actualTiers.some(
        (candidate) =>
          String(candidate.name || '').toLowerCase() === tier.name.toLowerCase() &&
          Number(candidate.price) === tier.price
      )
    )
  );
}

export interface CreateLiveEditRepositoryOptions {
  deps: LiveEditRepositoryDeps;
}

/**
 * Repository over the existing authenticated server APIs.
 *
 * A save is only reported as persisted after:
 *   1. the server returns success, and
 *   2. a fresh read confirms the new values, and
 *   3. the persistence source is PostgreSQL/Supabase (listings) or the
 *      server-authoritative cinema store (movies).
 * No optimistic success is ever surfaced.
 */
export function createLiveEditRepository(options: CreateLiveEditRepositoryOptions): LiveEditRepository {
  const { deps } = options;
  const writeSources = new Map<LiveEditModule, boolean>();

  async function list(
    authority: LiveEditAuthority,
    module: LiveEditModule
  ): Promise<LiveEditListResult> {
    if (!authority.ok) {
      return {
        ok: false,
        source: null,
        listings: [],
        errorCode: authority.code,
        message: authority.message,
        blocked: authority.blocked,
      };
    }
    if (module === 'movies') {
      if (!authority.capabilities.canEditCinemaScreens) {
        return {
          ok: false,
          source: null,
          listings: [],
          errorCode: 'CINEMA_SCREEN_SCOPE_REQUIRED',
          message: 'Cinema screen operations require Super Admin or Movies assignment.',
          blocked: false,
        };
      }
      const inventory = await deps.fetchCinemaInventory();
      if (!inventory.ok) {
        return {
          ok: false,
          source: null,
          listings: [],
          errorCode: 'CINEMA_INVENTORY_UNAVAILABLE',
          message: inventory.message || 'The cinema screen inventory could not be loaded.',
          blocked: true,
        };
      }
      writeSources.set(module, true);
      return {
        ok: true,
        source: 'server_cinema_store',
        listings: inventory.screens.map((screen) => listingFromCinemaScreen(screen)),
        message: `Loaded ${inventory.screens.length} cinema screen${inventory.screens.length === 1 ? '' : 's'}.`,
        blocked: false,
      };
    }

    const response = await deps.fetchListings(isAdminListingScope(authority));
    if (!response.ok) {
      const code = response.error || `HTTP_${response.httpStatus}`;
      return {
        ok: false,
        source: null,
        listings: [],
        errorCode: code,
        message: describeLiveEditApiError(code, response.message || 'Listings could not be loaded.'),
        blocked: response.httpStatus === 0 || response.httpStatus >= 500,
      };
    }
    if (response.source !== 'postgres') {
      writeSources.set(module, false);
      return {
        ok: false,
        source: null,
        listings: [],
        errorCode: 'PERSISTENCE_NOT_POSTGRES',
        message: describeLiveEditApiError('PERSISTENCE_NOT_POSTGRES', 'PostgreSQL persistence is unavailable.'),
        blocked: true,
      };
    }

    const listings: LiveEditListing[] = [];
    for (const row of response.listings) {
      const listing = listingFromRow(row);
      if (!listing || listing.module !== module) continue;
      if (!canEditListing(authority, listing).allowed) continue;
      listings.push(listing);
    }
    writeSources.set(module, true);
    return {
      ok: true,
      source: 'supabase_listings',
      listings,
      message: `Loaded ${listings.length} editable listing${listings.length === 1 ? '' : 's'}.`,
      blocked: false,
    };
  }

  async function saveListing(
    authority: LiveEditAuthority,
    listing: LiveEditListing,
    draft: LiveEditDraft
  ): Promise<LiveEditSaveResult> {
    if (!authority.ok) {
      return rejected(authority.code, authority.message);
    }
    const permission = canEditListing(authority, listing);
    if (!permission.allowed) {
      return rejected('FORBIDDEN_NOT_LISTING_OWNER', permission.reason || 'You cannot edit this listing.');
    }
    const validation = validateLiveEditDraft(listing.module, draft);
    if (!validation.ok) {
      return rejected('VALIDATION_FAILED', 'Fix the highlighted fields before saving.');
    }
    const originalDraft = draftFromListing(listing);
    const changedFields = changedFieldPaths(originalDraft, validation.draft);
    if (changedFields.length === 0) {
      return rejected('NO_CHANGES', 'There are no changes to save.');
    }

    // Preflight: never send a write to a non-PostgreSQL fallback store.
    const preflight = await deps.fetchListings(isAdminListingScope(authority));
    if (!preflight.ok || preflight.source !== 'postgres') {
      writeSources.set(listing.module, false);
      return rejected(
        'PERSISTENCE_NOT_POSTGRES',
        describeLiveEditApiError('PERSISTENCE_NOT_POSTGRES', 'PostgreSQL persistence is unavailable.'),
        'The write was not attempted, so no audit event exists.'
      );
    }
    const currentRow = preflight.listings.find((row) => String(row.id) === listing.id);
    if (!currentRow) {
      return rejected('LISTING_NOT_FOUND', describeLiveEditApiError('LISTING_NOT_FOUND', 'Listing not found.'));
    }

    const body = buildListingUpdateInput(validation.draft, listing, authority.capabilities);
    const response = await deps.saveListing(listing.id, body);
    if (!response.ok) {
      const code = response.error || `HTTP_${response.httpStatus}`;
      return rejected(code, describeLiveEditApiError(code, response.message || 'The server did not confirm the save.'));
    }

    // Read-after-write verification, including the persistence source.
    const verification = await deps.fetchListings(isAdminListingScope(authority));
    if (!verification.ok || verification.source !== 'postgres') {
      return rejected(
        'PERSISTENCE_NOT_CONFIRMED',
        'The server responded, but PostgreSQL persistence could not be confirmed. Nothing is shown as saved.'
      );
    }
    const savedRow = verification.listings.find((row) => String(row.id) === listing.id);
    if (!savedRow || !listingPayloadMatches(savedRow, validation.draft, listing.module)) {
      return rejected(
        'PERSISTENCE_NOT_CONFIRMED',
        'The server responded, but the saved values were not found on re-read. Nothing is shown as saved.'
      );
    }
    const savedListing = listingFromRow(savedRow);
    if (!savedListing) {
      return rejected('PERSISTENCE_NOT_CONFIRMED', 'The saved listing could not be re-read.');
    }
    if (authority.capabilities.canEditModerationAvailability) {
      const expected = providerAvailabilityFromStatus(validation.draft.availability.status);
      if (savedListing.providerAvailabilityStatus !== expected) {
        return rejected(
          'PERSISTENCE_NOT_CONFIRMED',
          'The server responded, but the moderation availability flag was not updated on re-read. Nothing is shown as saved.'
        );
      }
    }

    const auditEventId = response.auditEventId;
    const audit = auditEventId
      ? {
          status: 'recorded' as const,
          message: `Audit event ${auditEventId} was recorded by the server in the same transaction.`,
        }
      : {
          status: 'blocked' as const,
          message:
            'The server confirmed the listing change but did not return an audit event id; audit is treated as BLOCKED.',
        };

    return {
      status: 'saved',
      persisted: true,
      listing: savedListing,
      message: 'Listing changes saved and confirmed by the server.',
      audit,
      verified: true,
    };
  }

  async function saveCinemaScreen(
    authority: LiveEditAuthority,
    listing: LiveEditListing,
    draft: LiveEditDraft
  ): Promise<LiveEditSaveResult> {
    if (!authority.ok) {
      return rejected(authority.code, authority.message);
    }
    const permission = canEditListing(authority, listing);
    if (!permission.allowed) {
      return rejected('FORBIDDEN_CINEMA_SCOPE', permission.reason || 'You cannot edit this cinema screen.');
    }
    const validation = validateLiveEditDraft('movies', draft);
    if (!validation.ok) {
      return rejected('VALIDATION_FAILED', 'Fix the highlighted fields before saving.');
    }
    const originalDraft = draftFromListing(listing);
    const changedFields = changedFieldPaths(originalDraft, validation.draft);
    if (changedFields.length === 0) {
      return rejected('NO_CHANGES', 'There are no changes to save.');
    }

    const preflight = await deps.fetchCinemaInventory();
    if (!preflight.ok) {
      return rejected('CINEMA_INVENTORY_UNAVAILABLE', preflight.message || 'Cinema inventory is unavailable.');
    }
    const current = preflight.screens.find((screen) => String(screen.screenId || screen.id) === listing.id);
    if (!current) {
      return rejected('CINEMA_SCREEN_NOT_FOUND', 'This cinema screen is no longer present.');
    }

    const body = buildCinemaScreenUpdateInput(validation.draft, listing);
    const response = await deps.updateCinemaScreen(body);
    if (!response.ok) {
      const code = response.error || `HTTP_${response.httpStatus}`;
      return rejected(code, describeLiveEditApiError(code, response.message || 'The cinema screen was not updated.'));
    }

    const verification = await deps.fetchCinemaInventory();
    const saved = verification.screens.find(
      (screen) => String(screen.screenId || screen.id) === listing.id
    );
    if (!verification.ok || !saved || !screenMatches(saved, validation.draft)) {
      return rejected(
        'PERSISTENCE_NOT_CONFIRMED',
        'The server responded, but the cinema screen changes were not found on re-read. Nothing is shown as saved.'
      );
    }
    const savedListing = listingFromCinemaScreen(saved);

    const auditEventId = response.auditEventId;
    const audit = auditEventId
      ? {
          status: 'recorded' as const,
          message: `Audit event ${auditEventId} was recorded by the server in the same transaction.`,
        }
      : {
          status: 'blocked' as const,
          message:
            'The server confirmed the cinema screen change but did not return an audit event id; audit is treated as BLOCKED.',
        };

    return {
      status: 'saved',
      persisted: true,
      listing: savedListing,
      message: 'Cinema screen changes saved and confirmed by the server.',
      audit,
      verified: true,
    };
  }

  return {
    list,
    async save(authority, listing, draft) {
      if (!authority.ok) {
        return rejected(authority.code, authority.message);
      }
      return listing.source === 'server_cinema_store'
        ? saveCinemaScreen(authority, listing, draft)
        : saveListing(authority, listing, draft);
    },
    supportsWrites(module) {
      return writeSources.get(module) === true;
    },
  };
}

/** Production dependencies: the same authenticated endpoints the app already uses. */
export function createServerBackedLiveEditDeps(): LiveEditRepositoryDeps {
  return {
    async fetchListings(admin) {
      const response = await fetchServerProviderListings(admin);
      const data = response.data as {
        source?: string;
        error?: string;
        message?: string;
      };
      return {
        ok: response.ok,
        httpStatus: response.httpStatus,
        source: data.source,
        listings: response.listings as unknown as LiveEditRow[],
        error: data.error,
        message: data.message,
      };
    },
    async saveListing(listingId, body) {
      const response = await saveServerProviderListing(listingId, body);
      const data = response.data as {
        ok?: boolean;
        error?: string;
        message?: string;
        source?: string;
        listing?: Record<string, unknown>;
        auditEventId?: string;
      };
      return {
        ok: response.ok,
        httpStatus: response.httpStatus,
        error: data.error,
        message: data.message,
        source: data.source,
        listing: data.listing,
        auditEventId: data.auditEventId,
      };
    },
    async fetchCinemaInventory() {
      const response = await fetchMoviesInventory();
      return {
        ok: response.ok,
        screens: response.screens as unknown as CinemaScreenLike[],
        message: response.ok ? undefined : 'The cinema inventory endpoint did not return a usable response.',
      };
    },
    async updateCinemaScreen(body) {
      const response = await updateCinemaScreenConfig(
        body as unknown as Partial<AuthoritativeCinemaScreenConfig> & { id: string }
      );
      return {
        ok: response.ok,
        httpStatus: response.status,
        error: response.error,
        message: response.message,
        auditEventId: response.auditEventId,
        screen: response.screen as unknown as CinemaScreenLike | undefined,
      };
    },
  };
}
