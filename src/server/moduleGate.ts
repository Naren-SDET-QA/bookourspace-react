/**
 * Server-side module gating and stay availability maths.
 *
 * Pure functions only: no database, no network. That is deliberate — these are
 * the rules that decide whether money may be taken, so they must be testable
 * without a live Supabase project (see tests/module-gate-and-inventory.test.mjs).
 *
 * The database is the other half of the guarantee: platform_module_flags gates
 * writes in RPCs, and stay_allocations carries an exclusion constraint that
 * makes overlapping allocations impossible. This module mirrors those rules so
 * the API can answer honestly *before* a write is attempted.
 */

export const MODULE_KEYS = [
  'services',
  'hotels',
  'pg',
  'function_hall',
  'classes',
  'movies',
  'ecommerce',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleFlagRow {
  module_key: string;
  is_enabled: boolean;
  allow_contact_owner: boolean;
  allow_online_booking: boolean;
  requires_owner_approval: boolean;
  booking_approved_at?: string | null;
}

export interface ModuleAccess {
  key: string;
  /** Module is visible at all. */
  enabled: boolean;
  contactOwner: boolean;
  onlineBooking: boolean;
  requiresOwnerApproval: boolean;
  /** Why booking is off, for logs and honest UI copy. Never for authz. */
  reason?: string;
}

export type Capability = 'view' | 'contact_owner' | 'online_booking';

export interface GateResult {
  allowed: boolean;
  status: number;
  code: string;
  message: string;
}

function isTrue(value: unknown): boolean {
  return value === true;
}

/**
 * Resolve a module's effective permissions.
 *
 * Fail closed by design: an unknown module, a missing row, or a malformed
 * payload yields a fully disabled module. A client cannot enable a module by
 * claiming it is enabled — only the database row can.
 */
export function resolveModuleAccess(
  flags: readonly ModuleFlagRow[] | null | undefined,
  key: string
): ModuleAccess {
  const denied: ModuleAccess = {
    key,
    enabled: false,
    contactOwner: false,
    onlineBooking: false,
    requiresOwnerApproval: true,
    reason: 'MODULE_UNKNOWN_OR_DISABLED',
  };

  if (!Array.isArray(flags) || !(MODULE_KEYS as readonly string[]).includes(key)) return denied;

  const row = flags.find((f) => f && f.module_key === key);
  if (!row || !isTrue(row.is_enabled)) return denied;

  const access: ModuleAccess = {
    key,
    enabled: true,
    contactOwner: isTrue(row.allow_contact_owner),
    onlineBooking: isTrue(row.allow_online_booking),
    requiresOwnerApproval: isTrue(row.requires_owner_approval),
  };

  // Movies are discovery-only until a human records approval. This cannot be
  // bypassed by a client flag, and the DB trigger enforces the same rule.
  if (key === 'movies' && (row.booking_approved_at ?? null) === null) {
    access.onlineBooking = false;
    if (isTrue(row.allow_online_booking)) access.reason = 'MOVIE_BOOKING_NOT_APPROVED';
  }

  if (!access.onlineBooking && !access.reason) access.reason = 'ONLINE_BOOKING_DISABLED';

  return access;
}

/** Convert a resolved module into an HTTP-shaped decision for a capability. */
export function evaluateCapability(access: ModuleAccess, capability: Capability): GateResult {
  if (!access.enabled) {
    return {
      allowed: false,
      status: 404,
      code: 'MODULE_DISABLED',
      message: `The ${access.key} module is currently unavailable.`,
    };
  }
  if (capability === 'view') {
    return { allowed: true, status: 200, code: 'OK', message: 'Allowed.' };
  }
  if (capability === 'contact_owner') {
    return access.contactOwner
      ? { allowed: true, status: 200, code: 'OK', message: 'Allowed.' }
      : {
          allowed: false,
          status: 403,
          code: 'CONTACT_OWNER_DISABLED',
          message: 'Owner contact is disabled for this module.',
        };
  }
  if (capability === 'online_booking') {
    return access.onlineBooking
      ? { allowed: true, status: 200, code: 'OK', message: 'Allowed.' }
      : {
          allowed: false,
          status: 403,
          code: access.reason ?? 'ONLINE_BOOKING_DISABLED',
          message:
            access.key === 'movies'
              ? 'Movie ticket checkout is not enabled yet. Discovery is available.'
              : 'Online booking is disabled for this module.',
        };
  }
  return { allowed: false, status: 400, code: 'UNKNOWN_CAPABILITY', message: 'Unknown capability.' };
}

/* ------------------------------------------------------------------ */
/* Stay availability: half-open date ranges, matching the SQL daterange */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 86_400_000;

/** Days since epoch for a YYYY-MM-DD string; throws on a malformed date. */
export function toDayNumber(dateOnly: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error(`INVALID_DATE_FORMAT: expected YYYY-MM-DD, got "${dateOnly}"`);
  }
  const ms = Date.parse(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(ms)) throw new Error(`INVALID_DATE: "${dateOnly}"`);
  return Math.floor(ms / MS_PER_DAY);
}

export function nightsBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

export interface RangeValidation {
  ok: boolean;
  nights: number;
  code?: string;
  message?: string;
}

export function validateStayRange(from: string, to: string, nowIso: string): RangeValidation {
  let fromDay: number;
  let toDay: number;
  try {
    fromDay = toDayNumber(from);
    toDay = toDayNumber(to);
  } catch (error) {
    return {
      ok: false,
      nights: 0,
      code: 'INVALID_DATE_FORMAT',
      message: error instanceof Error ? error.message : 'Invalid date',
    };
  }
  if (toDay <= fromDay) {
    return {
      ok: false,
      nights: 0,
      code: 'INVALID_STAY_RANGE',
      message: 'Check-out must be after check-in.',
    };
  }
  const today = Math.floor(Date.parse(nowIso) / MS_PER_DAY);
  if (fromDay < today) {
    return {
      ok: false,
      nights: toDay - fromDay,
      code: 'CHECK_IN_IN_PAST',
      message: 'Check-in cannot be in the past.',
    };
  }
  return { ok: true, nights: toDay - fromDay };
}

export type AllocationStatus = 'held' | 'confirmed' | 'released' | 'expired';

export interface AllocationRow {
  unit_id: string;
  status: AllocationStatus;
  stay_from: string;
  stay_to: string;
  expires_at?: string | null;
}

/** A hold past expiry no longer blocks, even if the sweep has not run yet. */
export function isAllocationBlocking(row: AllocationRow, nowIso: string): boolean {
  if (row.status === 'confirmed') return true;
  if (row.status !== 'held') return false;
  if (!row.expires_at) return false;
  return Date.parse(row.expires_at) > Date.parse(nowIso);
}

/** Half-open overlap: [aFrom, aTo) vs [bFrom, bTo). */
export function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return toDayNumber(aFrom) < toDayNumber(bTo) && toDayNumber(bFrom) < toDayNumber(aTo);
}

/**
 * Free unit count. Mirrors `stay_availability` in SQL so the API can reject a
 * request without a round trip — the SQL remains the source of truth.
 */
export function countAvailableUnits(
  unitIds: readonly string[],
  allocations: readonly AllocationRow[],
  from: string,
  to: string,
  nowIso: string
): number {
  const blocked = new Set<string>();
  for (const row of allocations) {
    if (!isAllocationBlocking(row, nowIso)) continue;
    if (rangesOverlap(from, to, row.stay_from, row.stay_to)) blocked.add(row.unit_id);
  }
  return unitIds.reduce((free, id) => (blocked.has(id) ? free : free + 1), 0);
}

/** Nights x room rate, integer paise only. Never trust a client-sent total. */
export function quoteStay(
  basePricePaise: number,
  nights: number,
  taxPercent: number
): { subtotalPaise: number; taxPaise: number; totalPaise: number } {
  if (!Number.isInteger(basePricePaise) || basePricePaise < 0) {
    throw new Error('INVALID_PRICE: base price must be a non-negative integer in paise');
  }
  if (!Number.isInteger(nights) || nights <= 0) {
    throw new Error('INVALID_NIGHTS: nights must be a positive integer');
  }
  const subtotalPaise = basePricePaise * nights;
  const taxPaise = Math.round((subtotalPaise * taxPercent) / 100);
  return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
}
