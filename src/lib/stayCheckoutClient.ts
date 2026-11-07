import { buildAuthHeaders } from './supabaseClient';

/**
 * Client helpers for the server-authoritative stay checkout.
 *
 * Every amount shown by the UI comes from these responses. Nothing here
 * computes a payable total, and nothing here can mark a payment as verified:
 * that transition only happens in the database after a signed provider event.
 */

export interface StayPaymentCapabilities {
  ok: boolean;
  database: boolean;
  upi: boolean;
  /** Verified UPI QR is available for this merchant account (or local sandbox). */
  upiQr?: boolean;
  /** Local UPI sandbox: the QR points at the configured VPA and settlement is simulated. */
  upiSandbox?: boolean;
  /** Razorpay Checkout is available, and it accepts UPI as a payment method. */
  upiViaCheckout?: boolean;
  razorpay?: boolean;
  razorpayConfigured?: boolean;
  razorpayKeyId?: string | null;
  razorpayTestMode?: boolean;
  payAfterService: boolean;
  sandbox: boolean;
  merchantVpa: string | null;
  settlementVerification: 'signed_sandbox_psp' | 'signed_sandbox_or_razorpay' | 'razorpay_webhook' | 'razorpay_checkout_fetch' | 'unavailable';
}

export interface StayQuote {
  ok: boolean;
  roomTypeId: string;
  roomType: string;
  nights: number;
  units: number;
  basePricePaise: number;
  subtotalPaise?: number;
  cleaningFeePaise?: number;
  serviceFeePaise?: number;
  totalPaise: number;
  /** Property tax computed by PostgreSQL from stay_properties.tax_percent. */
  taxPercent?: number;
  taxesPaise?: number;
  totalWithTaxesPaise?: number;
  taxesSettledAtProperty?: boolean;
  availableUnits: number;
  checkIn: string;
  checkOut: string;
}

export interface StayRequestResult {
  ok: boolean;
  bookingId: string;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  totalPaise: number;
  expiresAt: string | null;
  checkIn: string;
  checkOut: string;
  nights?: number;
  units?: number;
  roomType?: string;
  replayed?: boolean;
}

export interface StayCheckoutResult {
  ok: boolean;
  bookingId: string;
  intentId: string;
  paymentMode: 'upi' | 'pay_after_service' | 'razorpay';
  status: string;
  amountPaise: number;
  upiUri: string | null;
  razorpayOrderId?: string | null;
  razorpayKeyId?: string | null;
  qrImageUrl?: string | null;
  provider?: string;
  expiresAt: string | null;
  checkIn: string;
  checkOut: string;
  nights?: number;
  units?: number;
  roomType?: string;
  listingTitle?: string;
  replayed?: boolean;
  /** The requested UPI QR was unavailable, so a Razorpay order was issued instead. */
  fallbackFromUpi?: boolean;
}

export interface StayIntentStatus {
  ok: boolean;
  intentId: string;
  bookingId: string | null;
  status: 'created' | 'pending' | 'verified' | 'failed' | 'expired' | 'refunded';
  paymentMode: string;
  amountPaise: number;
  paid: boolean;
  refundPaise: number | null;
}

export interface StayBookingRow {
  bookingId: string;
  status: string;
  totalPaise: number;
  checkIn: string;
  checkOut: string;
  propertyName: string;
  roomType: string;
  listingId?: string;
  propertyAddress?: string;
  checkInTime?: string;
  checkOutTime?: string;
  cancellationPolicy?: string;
  cancellationFreeHours?: number;
  paymentStatus?: string;
  paymentMode?: string;
  createdAt?: string;
  reviewed?: boolean;
  canReview?: boolean;
  requestExpiresAt?: string;
  respondedAt?: string;
  paymentIntentId?: string | null;
  intentStatus?: string | null;
  upiUri?: string | null;
  qrImageUrl?: string | null;
  razorpayOrderId?: string | null;
  razorpayKeyId?: string | null;
  intentExpiresAt?: string;
  canCancelRequest?: boolean;
  canSelfCheckIn?: boolean;
  canSelfCheckOut?: boolean;
  paymentDue?: boolean;
}

export interface ApiFailure {
  ok: false;
  error?: string;
  message?: string;
  status?: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T | ApiFailure> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: buildAuthHeaders(init?.headers as Record<string, string> | undefined),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      return {
        ok: false,
        error: body?.error || `HTTP_${response.status}`,
        message: body?.message || 'The request could not be completed.',
        status: response.status,
      };
    }
    return body as T;
  } catch {
    return { ok: false, error: 'NETWORK_ERROR', message: 'The server could not be reached. Nothing was charged.' };
  }
}

export function createStayRequest(params: {
  listingId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  units?: number;
  paymentMode: 'upi' | 'pay_after_service' | 'razorpay';
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guests?: number;
  guestAddress?: string;
  idempotencyKey: string;
  expiryHours?: number;
}): Promise<StayRequestResult | ApiFailure> {
  return request<StayRequestResult>('/api/stays/requests', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function selfCheckInStayBooking(bookingId: string): Promise<{ ok: boolean; status: string } | ApiFailure> {
  return request(`/api/stays/bookings/${encodeURIComponent(bookingId)}/self-check-in`, { method: 'POST', body: '{}' });
}

export function selfCheckOutStayBooking(bookingId: string): Promise<{ ok: boolean; status: string } | ApiFailure> {
  return request(`/api/stays/bookings/${encodeURIComponent(bookingId)}/self-check-out`, { method: 'POST', body: '{}' });
}

export function fetchStayPaymentCapabilities(): Promise<StayPaymentCapabilities | ApiFailure> {
  return request<StayPaymentCapabilities>('/api/payments/capabilities');
}

export function fetchStayQuote(params: {
  listingId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  units?: number;
}): Promise<StayQuote | ApiFailure> {
  const query = new URLSearchParams({
    roomTypeId: params.roomTypeId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    units: String(params.units || 1),
  });
  return request<StayQuote>(`/api/stays/${encodeURIComponent(params.listingId)}/quote?${query.toString()}`);
}

export interface StayServerRoomType {
  roomTypeId: string;
  name: string;
  basePricePaise: number;
  maxAdults: number;
  totalUnits: number;
  availableUnits: number;
}

/**
 * Server-authoritative room inventory for a stay listing. This is the source of
 * truth when the discovery feed cannot carry room types (store/Postgres feed),
 * so a real listing is never reported as "no inventory" just because the card
 * model omitted it.
 */
export function fetchStayAvailabilityForListing(
  listingId: string,
  checkIn: string,
  checkOut: string,
): Promise<{ ok: true; roomTypes: StayServerRoomType[] } | ApiFailure> {
  const query = new URLSearchParams({ checkIn, checkOut });
  return request<{ ok: true; roomTypes: StayServerRoomType[] }>(
    `/api/stays/${encodeURIComponent(listingId)}/availability?${query.toString()}`,
  );
}

export function createStayCheckout(params: {
  listingId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  units?: number;
  paymentMode: 'upi' | 'pay_after_service' | 'razorpay';
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guests?: number;
  guestAddress?: string;
  idempotencyKey: string;
}): Promise<StayCheckoutResult | ApiFailure> {
  return request<StayCheckoutResult>('/api/stays/checkout', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function fetchStayIntent(intentId: string): Promise<StayIntentStatus | ApiFailure> {
  return request<StayIntentStatus>(`/api/payments/intents/${encodeURIComponent(intentId)}`);
}

export function verifyStayRazorpayPayment(params: {
  intentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ ok: boolean; verified: boolean; status?: string; bookingId?: string } | ApiFailure> {
  return request('/api/stays/payments/razorpay/verify', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function fetchMyStayBookings(): Promise<{ ok: boolean; bookings: StayBookingRow[] } | ApiFailure> {
  return request<{ ok: boolean; bookings: StayBookingRow[] }>('/api/stays/bookings');
}

export function cancelStayBooking(bookingId: string): Promise<
  { ok: boolean; released: boolean; refundPaise: number; refundPolicy: string; note?: string } | ApiFailure
> {
  return request(`/api/stays/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: 'POST' });
}

export function newIdempotencyKey(prefix = 'stay'): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // fall through to the timestamp form
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}


export interface StayBookingQr {
  ok: true;
  bookingId: string;
  token: string;
  expiresAt: string;
  status: string;
  paymentStatus: string;
}

export interface StayReceipt {
  bookingId: string;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  paid: boolean;
  refunded: boolean;
  refundPaise: number;
  duePaise: number;
  paidPaise: number;
  totalPaise: number;
  createdAt: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guests: number;
  cancellationPolicy: string;
  guestAddress?: string;
  hotelName: string;
  address: string;
  roomType: string;
  units: number;
  nights: number;
  basePricePaise: number;
  subtotalPaise: number;
  cleaningFeePaise: number;
  serviceFeePaise: number;
  taxesPaise: number;
  taxPercent: number;
  discountPaise: number;
  breakdownExact: boolean;
  paymentReference: string | null;
  provider: string | null;
  verifiedAt: string | null;
  issuedAt: string;
  invoiceNumber?: string;
  gstin?: string;
  gstLegalName?: string;
  gstSupplierAddress?: string;
  placeOfSupply?: string;
  sacCode?: string;
  taxInvoice?: boolean;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
}

export function fetchStayBookingQr(bookingId: string): Promise<StayBookingQr | ApiFailure> {
  return request(`/api/stays/bookings/${encodeURIComponent(bookingId)}/qr`);
}

export function fetchStayBookingReceipt(bookingId: string): Promise<{ ok: true; receipt: StayReceipt; qrToken: string; qrExpiresAt: string } | ApiFailure> {
  return request(`/api/stays/bookings/${encodeURIComponent(bookingId)}/receipt`);
}

export function scanStayBookingQr(token: string): Promise<{ ok: true; bookingId: string; status: string; propertyName: string; customerName: string; checkIn: string } | ApiFailure> {
  return request('/api/stays/host/bookings/scan', { method: 'POST', body: JSON.stringify({ token }) });
}
