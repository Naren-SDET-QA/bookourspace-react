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
  payAfterService: boolean;
  sandbox: boolean;
  merchantVpa: string | null;
  settlementVerification: 'signed_sandbox_psp' | 'unavailable';
}

export interface StayQuote {
  ok: boolean;
  roomTypeId: string;
  roomType: string;
  nights: number;
  units: number;
  basePricePaise: number;
  totalPaise: number;
  availableUnits: number;
  checkIn: string;
  checkOut: string;
}

export interface StayCheckoutResult {
  ok: boolean;
  bookingId: string;
  intentId: string;
  paymentMode: 'upi' | 'pay_after_service';
  status: string;
  amountPaise: number;
  upiUri: string | null;
  expiresAt: string | null;
  checkIn: string;
  checkOut: string;
  nights?: number;
  units?: number;
  roomType?: string;
  listingTitle?: string;
  replayed?: boolean;
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
  paymentMode: 'upi' | 'pay_after_service';
  guestName?: string;
  guestPhone?: string;
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
