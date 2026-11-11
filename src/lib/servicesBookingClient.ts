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
  categoryId: string;
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
  categoryConfigId: string | null;
  categoryConfigVersion: number | null;
  quantity: number;
  recurrenceFrequency: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrenceOccurrences: number | null;
  paymentEnabled: boolean;
  assignmentMode: 'customer_selects' | 'platform_managed' | 'admin_assigns';
  deliveryMode: 'on_site' | 'home_delivery' | 'pickup' | 'digital';
  fieldValues: Record<string, string | number | boolean | string[] | null>;
  documents: Array<{
    id: string;
    documentKey: string;
    reference: string;
    fileName: string | null;
    mimeType: string | null;
    status: 'pending' | 'verified' | 'rejected';
    reviewNote: string | null;
    reviewedAt: string | null;
    createdAt: string;
  }>;
  trackingEnabled: boolean;
  liveMapEnabled: boolean;
  otpEnabled: boolean;
  deliveryConfirmationEnabled: boolean;
  deliveryConfirmedAt: string | null;
  prescriptionStatus: 'not_required' | 'pending' | 'verified' | 'rejected';
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
  categoryConfigId?: string;
  deliveryMode?: 'on_site' | 'home_delivery' | 'pickup' | 'digital';
  quantity?: number;
  recurrence?: { frequency: 'none' | 'daily' | 'weekly' | 'monthly'; occurrences?: number | null } | null;
  fieldValues?: Record<string, string | number | boolean | string[] | null>;
  documents?: Array<{ key: string; reference: string; fileName?: string; mimeType?: string }>;
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

export function confirmServiceDelivery(bookingId: string): Promise<{ booking: ServiceBooking }> {
  return request(`/api/services/bookings/${encodeURIComponent(bookingId)}/confirm-delivery`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function createBookingDeliveryOtp(bookingId: string): Promise<{ code: string }> {
  return request(`/api/services/bookings/${encodeURIComponent(bookingId)}/otp`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function verifyBookingDeliveryOtp(bookingId: string, code: string): Promise<{ verified: boolean }> {
  return request(`/api/services/bookings/${encodeURIComponent(bookingId)}/verify-otp`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
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
    SERVICE_CATEGORY_DISABLED: 'This service category is currently disabled.',
    SERVICE_CATEGORY_NOT_FOUND: 'This service category no longer exists.',
    SERVICE_CATEGORY_LISTING_MISMATCH: 'That listing does not belong to this service category.',
    SERVICE_REQUIRED_FIELDS_MISSING: 'Complete the required booking fields.',
    SERVICE_REQUIRED_DOCUMENTS_MISSING: 'Attach the required documents before booking.',
    SERVICE_UNKNOWN_FIELD: 'One of the submitted fields is not part of this service.',
    SERVICE_UNKNOWN_DOCUMENT: 'One of the submitted documents is not required by this service.',
    SERVICE_INVALID_DOCUMENT_REFERENCE: 'Use a secure storage:// or https:// document reference.',
    SERVICE_DOCUMENT_TYPE_NOT_ALLOWED: 'That document type is not accepted.',
    SERVICE_INVALID_FIELD_VALUE: 'Check the highlighted booking field.',
    SERVICE_INVALID_QUANTITY: 'Choose a quantity within the allowed range.',
    SERVICE_DELIVERY_MODE_NOT_ALLOWED: 'Choose an offered delivery option.',
    SERVICE_INVALID_RECURRENCE: 'Choose fewer recurring deliveries.',
    RECURRING_NOT_AVAILABLE: 'This service does not offer that recurring schedule.',
    SERVICE_LEAD_TIME_NOT_MET: 'Choose a later time. This service needs more notice.',
    SERVICE_DATE_TOO_FAR: 'Choose a date within the booking window.',
    SERVICE_INVALID_AMOUNT: 'The computed amount is outside the allowed range.',
    MEDICINE_PRESCRIPTION_REQUIRED: 'Medicine bookings require a prescription document.',
    LICENSED_PHARMACY_REQUIRED: 'Medicine delivery requires a verified licensed pharmacy.',
    PRESCRIPTION_NOT_VERIFIED: 'The pharmacy must verify the prescription before handover.',
    SERVICE_DOCUMENTS_NOT_VERIFIED: 'Required documents must be verified before this booking can complete.',
    DELIVERY_CONFIRMATION_REQUIRED: 'Confirm the handover before completing this booking.',
    OTP_DISABLED_FOR_SERVICE: 'This service does not use a customer OTP.',
    PAYMENT_DISABLED_FOR_SERVICE: 'This service does not collect payment through BookOurSpace.',
    ADMIN_APPROVAL_REQUIRED: 'An administrator must accept this booking.',
    DELIVERY_CONFIRMATION_NOT_REQUIRED: 'This service does not require a delivery confirmation.',
    OTP_REQUIRED_FOR_CONFIRMATION: 'Verify the customer OTP to confirm this handover.',
    OTP_NOT_FOUND: 'Generate the customer OTP first.',
    OTP_ALREADY_USED: 'That OTP was already used.',
    OTP_EXPIRED: 'That OTP expired. Ask the customer to generate a new one.',
    OTP_ATTEMPTS_EXCEEDED: 'Too many wrong OTP attempts. Ask for a fresh OTP.',
    OTP_INVALID: 'Enter the 6-digit OTP.',
    TRACKING_NOT_ACTIVE: 'Tracking is not active for this booking.',
  };
  return messages[error.code] || `The request failed (${error.code}). Try again.`;
}
