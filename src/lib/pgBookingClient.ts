import { buildAuthHeaders, getStoredGoogleAuthUser, setStoredAuthoritativeSession } from './supabaseClient';
import { providerContextHeaders } from './providerBusinessContext';

export interface PgRoomType {
  roomTypeId: string;
  name: string;
  occupancyPerBed: number;
  monthlyRentPaise: number;
  securityDepositPaise: number;
  totalBeds: number;
  availableBeds: number;
  amenities: string[];
  beds: Array<{ id: string; label: string }>;
}

export interface PgBooking {
  bookingId: string;
  listingId: string;
  listingTitle: string;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  moveIn: string;
  moveOut: string;
  beds: number;
  amount: number;
  totalDuePaise: number;
  rentPaise: number;
  depositPaise: number;
  cancelledAt?: string | null;
  createdAt?: string;
  party?: string;
}

export interface PgPaymentState {
  bookingId: string;
  bookingStatus: string;
  paymentMode: string;
  paymentStatus: string;
  totalPaise: number;
  rentPaise: number;
  depositPaise: number;
  paymentUtR: string | null;
  refundPaise: number | null;
  intentId: string | null;
  intentStatus: string | null;
  upiUri: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  providerPaymentId: string | null;
  obligation?: { mode?: string; amountPaise?: number; collectedOnline?: boolean } | null;
}

export interface PgPaymentCapabilities {
  database: boolean;
  upi: boolean;
  payAfterService: boolean;
  sandbox: boolean;
  settlementVerification: string;
  razorpay: boolean;
  merchantVpa: string | null;
}

export interface PgCancellationOutcome {
  bookingId: string;
  status: string;
  refundPaise: number;
  refundPolicy: string;
  paymentStatus: string;
  inventoryReleased: boolean;
  error?: string;
}

export class PgBookingClientError extends Error {
  constructor(readonly code: string, readonly status: number, readonly detail: Record<string, unknown> = {}) {
    super(code);
    this.name = 'PgBookingClientError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...buildAuthHeaders(), ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new PgBookingClientError(
      String(body?.error || `HTTP_${response.status}`),
      response.status,
      (body || {}) as Record<string, unknown>,
    );
  }
  return body as T;
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0').slice(-12)}`;
}

export function fetchPgCapabilities(): Promise<PgPaymentCapabilities & { ok: boolean }> {
  return request<PgPaymentCapabilities & { ok: boolean }>('/api/pg/payment-capabilities');
}

export function fetchPgInventory(listingId: string, moveIn: string, months: number, businessId?: string) {
  return request<{
    ok: boolean;
    listingId: string;
    moveIn: string;
    moveOut: string;
    roomTypes: PgRoomType[];
  }>(`/api/pg/listings/${encodeURIComponent(listingId)}/inventory?moveIn=${encodeURIComponent(moveIn)}&months=${months}`, {
    headers: providerContextHeaders(businessId),
  });
}

export function createPgBooking(input: {
  listingId: string;
  roomTypeId: string;
  moveIn: string;
  months: number;
  beds: number;
  occupants: number;
  idempotencyKey: string;
}) {
  return request<{ ok: boolean; booking: PgBooking }>('/api/pg/bookings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchPgBookings(businessId?: string): Promise<{ ok: boolean; bookings: PgBooking[] }> {
  return request('/api/pg/bookings', { headers: providerContextHeaders(businessId) });
}

export function fetchPgPaymentState(bookingId: string): Promise<PgPaymentState & { ok: boolean }> {
  return request(`/api/pg/bookings/${encodeURIComponent(bookingId)}/payment`);
}

export function createPgPaymentIntent(bookingId: string, paymentMode: 'upi' | 'pay_after_service', idempotencyKey: string) {
  return request<{
    ok: boolean;
    bookingId: string;
    intentId: string | null;
    paymentMode: string;
    status: string;
    amountPaise: number;
    upiUri: string | null;
    expiresAt: string | null;
    replayed: boolean;
  }>(`/api/pg/bookings/${encodeURIComponent(bookingId)}/payment-intent`, {
    method: 'POST',
    body: JSON.stringify({ paymentMode, idempotencyKey }),
  });
}

export async function cancelPgBooking(bookingId: string): Promise<PgCancellationOutcome> {
  try {
    const result = await request<{ ok: boolean; booking: PgCancellationOutcome }>(
      `/api/pg/bookings/${encodeURIComponent(bookingId)}/cancel`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    return result.booking;
  } catch (cause) {
    // A paid reservation is not cancellable on its own: the refund has to be
    // reconciled by the provider first. The server states the exact quote.
    if (cause instanceof PgBookingClientError && cause.code === 'PG_REFUND_REQUIRED') {
      return {
        bookingId,
        status: 'cancellation_pending',
        refundPaise: Number(cause.detail.refundPaise || 0),
        refundPolicy: String(cause.detail.refundPolicy || ''),
        paymentStatus: String(cause.detail.paymentStatus || 'verified'),
        inventoryReleased: false,
        error: 'PG_REFUND_REQUIRED',
      };
    }
    throw cause;
  }
}

export function ownerPgBookingAction(bookingId: string, action: 'check_in' | 'check_out') {
  return request<{ ok: boolean; booking: { bookingId: string; status: string } }>(
    `/api/provider/pg/bookings/${encodeURIComponent(bookingId)}/${action}`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function adminPgBookingAdjustment(bookingId: string, action: string, reason: string) {
  return request<{ ok: boolean; booking: { bookingId: string; status: string } }>(
    `/api/admin/pg/bookings/${encodeURIComponent(bookingId)}/adjust`,
    { method: 'POST', body: JSON.stringify({ action, reason }) },
  );
}

export function fetchPgAudit(bookingId: string): Promise<{ ok: boolean; events: Array<{ id: number; action: string; reason: string; actorRole: string; createdAt: string }> }> {
  return request(`/api/pg/bookings/${encodeURIComponent(bookingId)}/audit-trail`);
}

const FRIENDLY: Record<string, string> = {
  PG_BOOKING_NOT_FOUND: 'That reservation no longer exists.',
  PG_BOOKING_NOT_OWNED: 'This reservation belongs to another account.',
  PG_BOOKING_NOT_PAYABLE: 'This reservation cannot be paid any more.',
  PG_BOOKING_ALREADY_PAID: 'This reservation is already paid.',
  PG_INSUFFICIENT_BEDS: 'Those beds were just taken. Pick fewer beds or another date.',
  PG_INVENTORY_NOT_CONFIGURED: 'The owner has not published bed inventory yet.',
  PG_BOOKING_DISABLED: 'Online booking is currently disabled for PGs and hostels.',
  PG_PAYMENT_PENDING: 'A payment for this reservation is still open. It has to be resolved before it can be cancelled.',
  PG_CANCELLATION_CLOSED: 'This reservation can no longer be cancelled online.',
  PG_BOOKING_NOT_CANCELLABLE: 'This reservation is not in a cancellable state.',
  PG_CHECK_IN_NOT_OPEN: 'Check-in opens on the move-in day.',
  PG_CHECK_OUT_NOT_OPEN: 'Check-out opens on the move-out day.',
  MERCHANT_VPA_NOT_CONFIGURED: 'Online payment is unavailable right now. Pay the owner directly at move-in.',
  VERIFIED_GOOGLE_IDENTITY_REQUIRED: 'Sign in with Google to continue.',
  CUSTOMER_ROLE_REQUIRED: 'Only a customer account can reserve a bed.',
  FORBIDDEN_ROLE: 'Your account is not allowed to do that.',
  ADMIN_REQUIRED: 'Only an administrator can do that.',
  ACTIVE_PROFILE_REQUIRED: 'Your account is not active.',
  PG_PAYMENTS_POSTGRES_UNAVAILABLE: 'Reservations are unavailable: the booking database is not configured.',
  INVALID_PAYMENT_MODE: 'Choose either UPI or pay at the property.',
  MISSING_IDEMPOTENCY_KEY: 'The request could not be identified. Please try again.',
  IDEMPOTENCY_CONFLICT: 'This request was already used with different details.',
};

export function pgErrorMessage(cause: unknown): string {
  if (cause instanceof PgBookingClientError) {
    return FRIENDLY[cause.code] || cause.code.replaceAll('_', ' ').toLowerCase();
  }
  if (cause instanceof Error) return cause.message;
  return 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// Administrator operations, disputes, claims and invoices
// ---------------------------------------------------------------------------

export type PgDisputeCategory =
  | 'payment_not_received'
  | 'duplicate_charge'
  | 'refund_delay'
  | 'bed_unavailable'
  | 'terms_not_honoured'
  | 'other';

export interface PgDispute {
  id: string;
  bookingId: string;
  openedBy: string;
  openerRole: string;
  category: PgDisputeCategory;
  reason: string;
  evidence: Array<{ kind?: string; reference?: string; note?: string }>;
  amountInDisputePaise: number | null;
  status: 'open' | 'under_review' | 'resolved' | 'rejected';
  resolution: string | null;
  refundApprovedPaise: number | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface PgClaim {
  id: string;
  bookingId: string;
  claimedBy: string;
  method: string;
  reference: string;
  note: string | null;
  amountPaise: number;
  evidence: Array<{ kind?: string; reference?: string; note?: string }>;
  status: 'pending' | 'approved' | 'rejected';
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface PgInvoice {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  kind: 'booking_invoice' | 'payment_receipt' | 'refund_receipt';
  status: 'unpaid' | 'payment_pending' | 'paid' | 'collected_offline' | 'refunded' | 'cancelled';
  listingTitle: string;
  currency: string;
  rentPaise: number;
  depositPaise: number;
  taxPaise: number;
  taxPercent: number;
  taxApplied: boolean;
  totalPaise: number;
  providerPaidPaise: number;
  offlineCollectedPaise: number;
  refundPaise: number;
  provider: string | null;
  providerPaymentId: string | null;
  issuedAt: string;
}

export interface PgAdminBooking {
  bookingId: string;
  listingId: string;
  listingTitle: string;
  customerUserId: string;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  paymentUtR: string | null;
  rentPaise: number;
  depositPaise: number;
  waivedPaise: number;
  totalPaise: number;
  refundPaise: number;
  moveIn: string;
  moveOut: string;
  createdAt: string;
  intentId: string | null;
  intentStatus: string | null;
  disputeId: string | null;
  disputeStatus: string | null;
  claimId: string | null;
  claimStatus: string | null;
  invoiceNumber: string | null;
}

export interface PgAdminAuditEvent {
  id: number;
  bookingId: string | null;
  action: string;
  reason: string;
  detail: Record<string, unknown>;
  actorRole: string;
  createdAt: string;
}

export function fetchPgAdminBookings(limit = 100): Promise<{ ok: boolean; bookings: PgAdminBooking[] }> {
  return request(`/api/admin/pg/bookings?limit=${limit}`);
}

export function fetchPgAdminAudit(bookingId?: string, limit = 100): Promise<{ ok: boolean; events: PgAdminAuditEvent[] }> {
  const search = new URLSearchParams({ limit: String(limit) });
  if (bookingId) search.set('bookingId', bookingId);
  return request(`/api/admin/pg/audit?${search.toString()}`);
}

export function waivePgFee(bookingId: string, amountPaise: number, reason: string) {
  return request<{ ok: boolean; booking: Record<string, unknown> }>(
    `/api/admin/pg/bookings/${encodeURIComponent(bookingId)}/waive-fee`,
    { method: 'POST', body: JSON.stringify({ amountPaise, reason }) },
  );
}

export function approvePgRefund(bookingId: string, amountPaise: number, reason: string) {
  return request<{ ok: boolean; booking: Record<string, unknown> }>(
    `/api/admin/pg/bookings/${encodeURIComponent(bookingId)}/approve-refund`,
    { method: 'POST', body: JSON.stringify({ amountPaise, reason }) },
  );
}

export function openPgDispute(
  bookingId: string,
  input: { category: PgDisputeCategory; reason: string; evidence?: unknown[]; amountInDisputePaise?: number | null },
) {
  return request<{ ok: boolean; dispute: PgDispute }>(`/api/pg/bookings/${encodeURIComponent(bookingId)}/disputes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchPgDisputes(bookingId: string): Promise<{ ok: boolean; disputes: PgDispute[] }> {
  return request(`/api/pg/bookings/${encodeURIComponent(bookingId)}/disputes`);
}

export function reviewPgDispute(disputeId: string, note: string) {
  return request(`/api/admin/pg/disputes/${encodeURIComponent(disputeId)}/review`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}

export function resolvePgDispute(
  disputeId: string,
  input: { resolution: string; refundPaise?: number | null; reject?: boolean },
) {
  return request(`/api/admin/pg/disputes/${encodeURIComponent(disputeId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function submitPgPaymentClaim(
  bookingId: string,
  input: { method: string; reference: string; note: string; amountPaise: number; evidence?: unknown[] },
) {
  return request<{ ok: boolean; claim: PgClaim }>(
    `/api/provider/pg/bookings/${encodeURIComponent(bookingId)}/payment-claim`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function decidePgPaymentClaim(claimId: string, decision: 'approved' | 'rejected', note: string) {
  return request(`/api/admin/pg/claims/${encodeURIComponent(claimId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, note }),
  });
}

export function fetchPgInvoice(bookingId: string, kind: PgInvoice['kind'] = 'booking_invoice') {
  return request<{ ok: boolean; invoice: PgInvoice; taxPercent: number }>(
    `/api/pg/bookings/${encodeURIComponent(bookingId)}/invoice?kind=${kind}`,
  );
}

export function fetchPgInvoices(bookingId: string): Promise<{ ok: boolean; invoices: PgInvoice[] }> {
  return request(`/api/pg/bookings/${encodeURIComponent(bookingId)}/invoices`);
}

/**
 * The server issues the super-administrator scope only for a verified Google
 * administrator session. Nothing is asserted by the browser.
 */
export async function requestPgSuperAdminSession(): Promise<string> {
  const response = await fetch('/api/auth/super-admin/session', {
    method: 'POST',
    headers: { ...buildAuthHeaders() },
    body: JSON.stringify({}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.sessionToken) {
    throw new PgBookingClientError(String(body?.error || 'SUPER_ADMIN_SESSION_UNAVAILABLE'), response.status, body || {});
  }
  const sessionToken = String(body.sessionToken);
  setStoredAuthoritativeSession(sessionToken, getStoredGoogleAuthUser());
  return sessionToken;
}
