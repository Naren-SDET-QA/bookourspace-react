/**
 * Client for service availability and server-verified UPI payments.
 *
 * Amounts and slot availability come from the server. Nothing here can mark a
 * payment as paid: a booking only becomes settled after a signed provider
 * callback settles the intent on the server.
 */

export interface ServiceAvailabilitySlot {
  date: string;
  start: string;
  end: string;
  label: string;
  slotKey: string;
  isBooked: boolean;
}

export interface ServiceProviderProfile {
  listingId: string;
  title: string;
  providerName: string;
  categoryId: string;
  subcategory: string;
  price: number;
  priceUnit: string;
  serviceAreas: string[];
  travelRadiusKm: number | null;
  workingDays: number[];
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
  scheduleConfigured: boolean;
}

export interface ServicePaymentIntent {
  ok: boolean;
  intentId: string;
  bookingId: string;
  amount: number;
  status: 'created' | 'pending' | 'verified' | 'failed' | 'expired' | 'refunded';
  upiUri: string;
  expiresAt: string;
  replayed?: boolean;
}

export interface ServicePaymentStatus {
  ok: boolean;
  intentId: string;
  bookingId: string;
  amount: number;
  status: ServicePaymentIntent['status'];
  paid: boolean;
  verifiedAt: string | null;
  refundAmount: number | null;
}

export interface ServiceProviderSchedule {
  workingDays: number[];
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
  serviceAreas: string[];
  travelRadiusKm: number | null;
  configured: boolean;
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
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = sessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(String(payload?.error || 'SERVICE_COMMERCE_UNAVAILABLE'));
    (error as Error & { code?: string; status?: number }).code = String(payload?.error || 'SERVICE_COMMERCE_UNAVAILABLE');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload as T;
}

export function fetchServiceProfile(listingId: string): Promise<{ profile: ServiceProviderProfile }> {
  return request(`/api/services/listings/${encodeURIComponent(listingId)}/profile`);
}

export function fetchServiceAvailability(
  listingId: string,
  from: string,
  to: string = from,
): Promise<{ slots: ServiceAvailabilitySlot[] }> {
  const query = new URLSearchParams({ from, to });
  return request(`/api/services/listings/${encodeURIComponent(listingId)}/availability?${query.toString()}`);
}

export function createServicePaymentIntent(
  bookingId: string,
  idempotencyKey: string,
): Promise<ServicePaymentIntent> {
  return request(`/api/services/bookings/${encodeURIComponent(bookingId)}/payment-intent`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
}

export function fetchServicePaymentStatus(intentId: string): Promise<ServicePaymentStatus> {
  return request(`/api/services/payment-intents/${encodeURIComponent(intentId)}`);
}

export function updateProviderSchedule(input: {
  workingDays: number[];
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
  serviceAreas: string[];
  travelRadiusKm?: number | null;
}): Promise<{ ok: boolean }> {
  return request('/api/services/provider/schedule', { method: 'PUT', body: JSON.stringify(input) });
}

export function fetchProviderSchedule(): Promise<{ schedule: ServiceProviderSchedule | null }> {
  return request('/api/services/provider/schedule');
}

export function blockProviderDate(date: string, reason?: string): Promise<{ ok: boolean }> {
  return request('/api/services/provider/blackouts', {
    method: 'POST',
    body: JSON.stringify({ date, reason }),
  });
}

export function serviceCommerceErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const messages: Record<string, string> = {
    SERVICE_SLOT_UNAVAILABLE: 'That time is outside the provider’s working hours. Pick another slot.',
    SERVICE_DATE_UNAVAILABLE: 'The provider is not available on that date.',
    SERVICE_SLOT_ALREADY_BOOKED: 'That slot was just booked. Pick another time.',
    MERCHANT_VPA_NOT_CONFIGURED: 'Online payment is unavailable right now. Choose pay after service.',
    PAYMENT_CLAIM_PENDING_REVIEW: 'A payment claim is already awaiting administrator review.',
    PAYMENT_ALREADY_SETTLED: 'This booking is already paid.',
    BOOKING_NOT_PAYABLE: 'This booking can no longer be paid online.',
    AUTH_REQUIRED: 'Sign in with Google to continue.',
    UNAUTHORIZED_SESSION: 'Sign in with Google to continue.',
  };
  return messages[code] || 'The request could not be completed. Nothing was charged.';
}

export function newServiceIdempotencyKey(prefix = 'svc-pay'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
