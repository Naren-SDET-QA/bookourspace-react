import { isLiveDeliveryStatus, isTerminalDeliveryStatus, type DeliveryStatus } from './deliveryTracking';

export const TRACKING_TOKEN_BYTES = 32;
export const TRACKING_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;

export function isTrackingTokenFormat(token: string): boolean {
  return TOKEN_PATTERN.test(String(token || ''));
}

export function readTrackingPathToken(pathname: string): string | null {
  const match = /^\/track\/([A-Za-z0-9_-]{40,128})\/?$/.exec(String(pathname || ''));
  return match ? match[1] : null;
}

export function readTrackingHashToken(hash: string): string | null {
  const raw = String(hash || '').replace(/^#/, '');
  const match = /^track\/([A-Za-z0-9_-]{40,128})$/.exec(raw);
  return match ? match[1] : null;
}

export function readPublicTrackingToken(location: { pathname?: string; hash?: string } | null | undefined): string | null {
  if (!location) return null;
  return readTrackingPathToken(location.pathname || '') || readTrackingHashToken(location.hash || '');
}

export function publicTrackingPath(token: string): string {
  if (!isTrackingTokenFormat(token)) throw new Error('TRACKING_TOKEN_INVALID');
  return `/track/${token}`;
}

export function publicTrackingUrl(origin: string, token: string): string {
  const base = String(origin || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('TRACKING_ORIGIN_REQUIRED');
  return `${base}${publicTrackingPath(token)}`;
}

export function trackingUrlContainsSecrets(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://bookourspace.invalid');
    if ([...parsed.searchParams.keys()].length > 0) return true;
    const haystack = `${parsed.pathname}${parsed.hash}`;
    return /(?:lat|lng|lon|coord|booking[_-]?id|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i.test(haystack);
  } catch {
    return true;
  }
}

export function canAccessTrackingLink(input: {
  status: DeliveryStatus;
  revokedAt?: string | null;
  expiresAt?: string | null;
  now?: number;
}): boolean {
  if (input.revokedAt) return false;
  const now = input.now ?? Date.now();
  if (input.expiresAt) {
    const expires = Date.parse(input.expiresAt);
    if (Number.isFinite(expires) && expires <= now) return false;
  }
  if (isTerminalDeliveryStatus(input.status)) return false;
  return isLiveDeliveryStatus(input.status) || input.status === 'requested';
}

export function trackingLinkExpiryIso(now = Date.now(), ttlMs = TRACKING_LINK_TTL_MS): string {
  return new Date(now + ttlMs).toISOString();
}

export function buildTrackingShareMessage(input: {
  bookingRef: string;
  trackingUrl: string;
  statusLabel?: string;
}): string {
  const status = input.statusLabel ? `\nStatus: ${input.statusLabel}` : '';
  return `Track this BookOurSpace booking (${input.bookingRef})${status}\n${input.trackingUrl}`;
}

export function whatsappShareHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message.trim())}`;
}

export function sanitizePublicTrackingSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(['customerId', 'providerId', 'assigneeId', 'assigneeLabel', 'events']);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (blocked.has(key)) continue;
    out[key] = value;
  }
  return out;
}
