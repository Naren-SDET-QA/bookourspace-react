/**
 * Browser client for the server-authoritative Services booking API.
 * Money and booking state always come back from the server; nothing here
 * treats a client action, UPI reference or screenshot as proof of payment.
 */

export interface ServiceBooking {
  id: string;
  bookingRef: string;
  listingId: string;
  listingTitle: string;
  status: 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'rejected';
  paymentMode: 'pay_after_service' | 'upi_qr' | 'upi_intent' | 'razorpay';
  paymentStatus: 'due' | 'declared' | 'settled' | 'refunded' | 'failed' | 'waived';
  scheduledDate: string;
  timeSlot: string;
  amount: number;
  currency: string;
  amountBasis: string;
  serviceAddress: string;
  notes: string | null;
  customerPhone: string;
  createdAt: string;
}

export interface ServicePaymentClaim {
  id: string;
  bookingId: string;
  bookingRef: string;
  method: 'cash' | 'upi' | 'razorpay';
  reference: string | null;
  evidenceNote: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote: string | null;
  createdAt: string;
}

export interface ServiceEarnings {
  completedJobs: number;
  grossAmount: number;
  settledAmount: number;
  outstandingAmount: number;
}

export interface ServicePaymentConfig {
  payAfterService: boolean;
  upi: { enabled: boolean; vpa: string | null; payeeName: string };
  razorpay: { configured: boolean };
}

export class ServiceBookingApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'ServiceBookingApiError';
  }
}

function sessionToken(): string | null {
  try {
    return (
      window.localStorage.getItem('bos_session_token_v1') ||
      window.localStorage.getItem('bos_authoritative_session_token')
    );
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new ServiceBookingApiError(String(payload?.error || 'SERVICE_API_UNAVAILABLE'), response.status);
  }
  return payload as T;
}

export function fetchServicePaymentConfig(): Promise<ServicePaymentConfig> {
  return request<{ ok: true } & ServicePaymentConfig>('/api/services/payment-config');
}

export function createServiceBooking(input: {
  listingId: string;
  scheduledDate: string;
  timeSlot: string;
  serviceAddress: string;
  addressNotes?: string;
  customerPhone: string;
  notes?: string;
  paymentMode: ServiceBooking['paymentMode'];
  idempotencyKey: string;
}): Promise<{ booking: ServiceBooking; idempotent: boolean }> {
  return request('/api/services/bookings', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchServiceBookings(): Promise<{ bookings: ServiceBooking[] }> {
  return request('/api/services/bookings');
}

export function transitionServiceBooking(
  bookingId: string,
  action: 'accept' | 'reject' | 'start' | 'complete' | 'cancel' | 'reschedule',
  body: Record<string, unknown> = {},
): Promise<{ booking: ServiceBooking; idempotent: boolean }> {
  return request(`/api/services/bookings/${encodeURIComponent(bookingId)}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action, ...body }),
  });
}

export function reviewServiceBooking(
  bookingId: string,
  rating: number,
  comment: string,
): Promise<{ review: { id: string; rating: number } }> {
  return request(`/api/services/bookings/${encodeURIComponent(bookingId)}/review`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment }),
  });
}

export function recordServicePaymentClaim(
  bookingId: string,
  input: { method: 'cash' | 'upi'; reference?: string; evidenceNote: string },
): Promise<{ claim: ServicePaymentClaim }> {
  return request(`/api/services/bookings/${encodeURIComponent(bookingId)}/payment-claim`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchServicePaymentClaims(): Promise<{ claims: ServicePaymentClaim[] }> {
  return request('/api/services/payment-claims');
}

export interface ServiceWorkerRecord {
  id: string;
  full_name: string;
  phone: string;
  service_categories: string[];
  service_areas: string[];
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  approved_at: string | null;
}

export function fetchServiceWorkers(): Promise<{ workers: ServiceWorkerRecord[] }> {
  return request('/api/services/workers');
}

export function registerServiceWorker(input: { fullName: string; phone: string; serviceCategories?: string[]; serviceAreas?: string[] }): Promise<{ worker: ServiceWorkerRecord }> {
  return request('/api/services/workers', { method: 'POST', body: JSON.stringify(input) });
}

export function assignServiceWorker(bookingId: string, input: { workerId: string; startsAt: string; endsAt: string }) {
  return request<{ booking: { id: string; status: string; worker_id: string; assigned_at: string } }>(`/api/services/bookings/${encodeURIComponent(bookingId)}/assign-worker`, { method: 'POST', body: JSON.stringify(input) });
}

export function issueServiceStartOtp(bookingId: string, emailBackup = false) {
  return request<{ otp: { code: string; expiresAt: string }; emailBackup?: { ok: boolean; error?: string } | null }>(`/api/services/bookings/${encodeURIComponent(bookingId)}/start-otp`, { method: 'POST', body: JSON.stringify({ emailBackup }) });
}

export function verifyServiceStartOtp(bookingId: string, code: string) {
  return request<{ result: { verified: boolean; reason?: string; attemptsRemaining?: number } }>(`/api/services/bookings/${encodeURIComponent(bookingId)}/verify-start-otp`, { method: 'POST', body: JSON.stringify({ code }) });
}

export function recordServiceWorkerLocation(bookingId: string, input: { latitude: number; longitude: number; accuracyM?: number; consentGranted: true }) {
  return request<{ accepted: boolean; recordedAt: string }>(`/api/services/bookings/${encodeURIComponent(bookingId)}/location`, { method: 'POST', body: JSON.stringify(input) });
}

export function fetchServiceBookingLocation(bookingId: string) {
  return request<{ location: { latitude: number; longitude: number; accuracy_m: number | null; recorded_at: string } | null; stale: boolean }>(`/api/services/bookings/${encodeURIComponent(bookingId)}/location`);
}

export function stopServiceTracking(bookingId: string, reason = 'job_closed') {
  return request<{ tracking: { booking_id: string; stopped_at: string } | null }>(`/api/services/bookings/${encodeURIComponent(bookingId)}/tracking/stop`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function decideServicePaymentClaim(
  claimId: string,
  decision: 'approved' | 'rejected',
  reviewNote: string,
): Promise<{ claim: ServicePaymentClaim; booking: ServiceBooking }> {
  return request(`/api/admin/services/payment-claims/${encodeURIComponent(claimId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, reviewNote }),
  });
}

export function refundServiceBooking(
  bookingId: string,
): Promise<{ booking?: ServiceBooking; refundedPaise?: number; provider?: string; note?: string }> {
  return request(`/api/services/bookings/${encodeURIComponent(bookingId)}/refund`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function fetchServiceEarnings(): Promise<{ earnings: ServiceEarnings }> {
  return request('/api/services/earnings');
}

export function upiIntentUrl(config: ServicePaymentConfig, amount: number, note: string): string | null {
  if (!config.upi.enabled || !config.upi.vpa) return null;
  const params = new URLSearchParams({
    pa: config.upi.vpa,
    pn: config.upi.payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note.slice(0, 50),
  });
  return `upi://pay?${params.toString()}`;
}

export function serviceBookingErrorMessage(error: unknown): string {
  if (!(error instanceof ServiceBookingApiError)) return 'The booking service could not be reached. Try again.';
  const messages: Record<string, string> = {
    UNAUTHORIZED_SESSION: 'Sign in with Google to book this service.',
    VERIFIED_GOOGLE_IDENTITY_REQUIRED: 'Sign in with Google to book this service.',
    SERVICE_SLOT_ALREADY_BOOKED: 'That date and time was just booked by someone else. Choose another slot.',
    SERVICE_LISTING_NOT_AVAILABLE: 'This service is no longer available to book.',
    INVALID_SERVICE_DATE: 'Choose a valid service date.',
    SERVICE_DATE_IN_PAST: 'Choose today or a future date.',
    INVALID_CUSTOMER_PHONE: 'Enter a valid contact phone number.',
    INVALID_SERVICE_ADDRESS: 'Enter the full service address.',
    DUPLICATE_BOOKING_REQUEST: 'This booking was already submitted. Check My bookings before retrying.',
    BOOKING_STATE_CONFLICT: 'This job has already moved to another state. Refresh to see the latest status.',
    CUSTOMER_CANCEL_WINDOW_CLOSED: 'The provider has already started; contact them to cancel.',
    SERVICE_PAYMENT_SETTLEMENT_ADMIN_ONLY: 'Only an administrator can mark a payment settled.',
    REFUND_PROVIDER_NOT_CONFIGURED: 'No trusted refund provider is configured. No refund was issued.',
    PAYMENT_NOT_VERIFIED: 'Only a payment confirmed by the provider can be refunded.',
    COMPLETED_JOB_REFUND_REQUIRES_PROVIDER: 'A completed job needs provider-approved reconciliation.',
    PAYMENT_INTENT_NOT_FOUND: 'No online payment exists for this booking.',
    AUDIT_REASON_REQUIRED: 'Add a written audit reason before approving or rejecting.',
    PAYMENT_EVIDENCE_REQUIRED: 'Add what was collected and how, so an administrator can verify it.',
    PAYMENT_REFERENCE_REQUIRED: 'Enter the UPI reference for a digital payment.',
    PAYMENT_ALREADY_RECORDED: 'A payment is already recorded or awaiting review for this job.',
    REVIEW_ALREADY_SUBMITTED: 'You have already reviewed this booking.',
    SERVICE_API_UNAVAILABLE: 'Service booking is not enabled in this environment.',
  };
  return messages[error.code] || `The request failed (${error.code}). Try again.`;
}
