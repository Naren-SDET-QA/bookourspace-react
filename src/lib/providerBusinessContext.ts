import { BUSINESS_MODULE_LABELS, type BusinessMembership } from './businessClient';

/**
 * Provider business-context rules.
 *
 * The provider portal can be opened by a member of one business or of several.
 * The server decides what a business allows (membership row, module access,
 * grants), so this module only decides what the *client* should show and send:
 * which business to select by default, whether the user must choose, and how to
 * present a server refusal. Every request still carries `x-business-id` and the
 * server re-checks it, so nothing here can widen access.
 *
 * Pure functions, no React and no fetch, so the rules are unit tested.
 */

export const BUSINESS_HEADER = 'x-business-id';

export type BusinessContextErrorCode =
  | 'BUSINESS_CONTEXT_REQUIRED'
  | 'BUSINESS_PERMISSIONS_REQUIRED'
  | 'BUSINESS_ACTION_FORBIDDEN'
  | 'BUSINESS_SECTION_FORBIDDEN'
  | 'BUSINESS_ACCESS_DENIED'
  | 'BUSINESS_DATABASE_UNAVAILABLE'
  | 'BUSINESS_CONTEXT_UNAVAILABLE'
  | 'UNAUTHORIZED_SESSION'
  | 'BUSINESS_LIST_UNAVAILABLE'
  | 'NETWORK';

export interface ProviderContextNotice {
  kind: 'select-business' | 'permission' | 'denied' | 'retry' | 'session';
  title: string;
  description: string;
  action: 'select' | 'retry' | 'refresh-memberships' | 'contact-admin' | 'sign-in';
}

/** Raised by the data loaders so the workspace can react to the server code. */
export class ProviderContextError extends Error {
  readonly code: BusinessContextErrorCode;
  constructor(code: string, fallback: BusinessContextErrorCode = 'NETWORK') {
    super(code || fallback);
    this.name = 'ProviderContextError';
    this.code = isBusinessContextErrorCode(code) ? code : fallback;
  }
}

const KNOWN_CODES: readonly BusinessContextErrorCode[] = [
  'BUSINESS_CONTEXT_REQUIRED',
  'BUSINESS_PERMISSIONS_REQUIRED',
  'BUSINESS_ACTION_FORBIDDEN',
  'BUSINESS_SECTION_FORBIDDEN',
  'BUSINESS_ACCESS_DENIED',
  'BUSINESS_DATABASE_UNAVAILABLE',
  'BUSINESS_CONTEXT_UNAVAILABLE',
  'UNAUTHORIZED_SESSION',
  'BUSINESS_LIST_UNAVAILABLE',
  'NETWORK',
];

export function isBusinessContextErrorCode(value: unknown): value is BusinessContextErrorCode {
  return typeof value === 'string' && (KNOWN_CODES as readonly string[]).includes(value);
}

/** A business the member can actually work in right now. */
export function isBusinessOperational(business: BusinessMembership): boolean {
  return business.approval_status === 'approved'
    && business.is_enabled !== false
    && business.module_approval_status === 'approved'
    && business.module_enabled !== false;
}

/**
 * One business is selected automatically; several require an explicit choice.
 * The pick is deterministic: a working PG business first (the portal opens on
 * PG), then any working business, then the first membership so a suspended one
 * is still visible rather than silently swapped.
 */
export function preferredBusinessId(businesses: readonly BusinessMembership[]): string {
  const operational = businesses.filter(isBusinessOperational);
  const pg = operational.find((business) => business.module_type === 'pg_hostels');
  if (pg) return pg.id;
  if (operational[0]) return operational[0].id;
  if (businesses[0]) return businesses[0].id;
  return '';
}

/** Keep a choice only while the server still reports that active membership. */
export function resolveBusinessSelection(
  businesses: readonly BusinessMembership[],
  requestedId: string | null | undefined,
): string {
  const requested = String(requestedId || '').trim();
  if (requested && businesses.some((business) => business.id === requested)) return requested;
  return preferredBusinessId(businesses);
}

export function needsBusinessChoice(businesses: readonly BusinessMembership[]): boolean {
  return businesses.length > 1;
}

export function businessLabel(business: BusinessMembership | null | undefined): string {
  if (!business) return '';
  const moduleLabel = BUSINESS_MODULE_LABELS[business.module_type] || business.module_type;
  return `${business.name} · ${moduleLabel}`;
}

export function businessApprovalLabel(business: BusinessMembership | null | undefined): string {
  if (!business) return '';
  if (business.approval_status === 'approved' && !isBusinessOperational(business)) {
    return 'module not active';
  }
  return business.approval_status;
}

/** Headers for every provider request. A blank id is omitted, never guessed. */
export function providerContextHeaders(
  businessId: string | null | undefined,
  base: Record<string, string> = {},
): Record<string, string> {
  const selected = String(businessId || '').trim();
  return {
    ...base,
    Accept: 'application/json',
    ...(selected ? { [BUSINESS_HEADER]: selected } : {}),
  };
}

/**
 * Maps a server refusal to the message the provider must see. Returning `null`
 * means "not an authorization problem", so the caller can show its own error.
 */
export function noticeForProviderError(
  code: string | null | undefined,
  context: { hasBusinesses: boolean; businessCount: number } = { hasBusinesses: true, businessCount: 1 },
): ProviderContextNotice | null {
  switch (code) {
    case 'BUSINESS_CONTEXT_REQUIRED':
      return {
        kind: 'select-business',
        title: 'Choose a business to continue',
        description: context.hasBusinesses
          ? 'Your account belongs to more than one business. Pick the one you want to manage; the dashboard only shows that business\'s data.'
          : 'No active business is linked to this account yet. Create a business or accept an invitation to continue.',
        action: context.hasBusinesses ? 'select' : 'refresh-memberships',
      };
    case 'BUSINESS_PERMISSIONS_REQUIRED':
      return {
        kind: 'permission',
        title: 'You do not have permission for this business yet',
        description: 'Your membership is active but no module access has been granted. Ask a business owner or an administrator to enable access for you in User Permissions.',
        action: 'contact-admin',
      };
    case 'BUSINESS_SECTION_FORBIDDEN':
      return {
        kind: 'permission',
        title: 'This section is not enabled for you',
        description: 'Your access is limited to specific sections of this business. Ask a business owner or an administrator if you need this section too.',
        action: 'contact-admin',
      };
    case 'BUSINESS_ACTION_FORBIDDEN':
      return {
        kind: 'permission',
        title: 'You can view this, but not change it',
        description: 'Your access to this business is read-only for this action. Ask a business owner or an administrator for write access.',
        action: 'contact-admin',
      };
    case 'BUSINESS_ACCESS_DENIED':
    case 'BUSINESS_DATABASE_UNAVAILABLE':
      return {
        kind: 'denied',
        title: 'This business is not available to your account',
        description: 'The server refused this business for your membership. Your memberships may have changed in another tab or by an administrator; refresh them to continue.',
        action: 'refresh-memberships',
      };
    case 'UNAUTHORIZED_SESSION':
      return {
        kind: 'session',
        title: 'Your session has expired',
        description: 'Sign in again to load your provider workspace.',
        action: 'sign-in',
      };
    case 'BUSINESS_LIST_UNAVAILABLE':
    case 'NETWORK':
      return {
        kind: 'retry',
        title: 'We could not load your business',
        description: 'The request failed before the server answered. Check your connection and try again.',
        action: 'retry',
      };
    default:
      return null;
  }
}

export interface LatestRequestGuard {
  begin(): number;
  isLatest(token: number): boolean;
}

/**
 * Guards against an older response overwriting a newer one after a business
 * switch: only the most recent request may write to state.
 */
export function createLatestRequestGuard(): LatestRequestGuard {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    isLatest(token: number) {
      return token === latest;
    },
  };
}
