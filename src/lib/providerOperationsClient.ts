import { buildAuthHeaders } from './supabaseClient';

export type ProviderPortalOverview = {
  ok: boolean;
  source?: 'postgres';
  fetchedAt: string;
  actor: { role: string; name: string | null };
  stays: {
    metrics: { properties: number; roomTypes: number; units: number; occupiedUnits: number; occupancyPct: number | null; revenue: number; adr: number | null; revpar: number | null };
    properties: Array<{ id: string; name: string; city: string; propertyType: string; isActive: boolean; roomTypes: number; units: number }>;
    bookings: Array<{ id: string; listingTitle: string; guestName: string; status: string; startsOn: string | null; endsOn: string | null; amount: number; paymentStatus: string | null }>;
  };
  services: {
    metrics: { listings: number; requested: number; activeJobs: number; completed: number; settledRevenue: number; pendingClaims: number };
    bookings: Array<{ id: string; bookingRef: string; listingTitle: string; status: string; scheduledDate: string; timeSlot: string; amount: number; paymentStatus: string }>;
  };
};

export class ProviderOperationsError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = 'ProviderOperationsError'; }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: buildAuthHeaders(), credentials: 'include' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new ProviderOperationsError(String(body?.error || `HTTP_${response.status}`), response.status);
  return body as T;
}

export function fetchProviderPortalOverview(): Promise<ProviderPortalOverview> {
  return request('/api/provider-portal/overview');
}
