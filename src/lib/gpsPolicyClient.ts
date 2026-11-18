export class GpsPolicyApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'GpsPolicyApiError';
  }
}

function sessionToken(): string | null {
  try {
    return (
      window.localStorage.getItem('bos_session_token_v1')
      || window.localStorage.getItem('bos_authoritative_session_token')
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
  const response = await fetch(path, { ...init, headers, credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new GpsPolicyApiError(String(payload?.error || 'GPS_POLICY_UNAVAILABLE'), response.status);
  }
  return payload as T;
}

export interface GpsAdminCategoryRow {
  id: string;
  name: string;
  catalogEnabled: boolean;
  gpsTracking: boolean;
  liveMap: boolean;
  source: 'catalog' | 'admin_override' | 'listing_category';
}

export interface GpsAdminPolicy {
  globalEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  categories: GpsAdminCategoryRow[];
  manualTest: {
    customerEmail: string;
    providerEmail: string;
    adminEmail: string;
    bookingId: string;
    listingTitle: string;
    categoryId: string;
    bookingRef: string | null;
    bookingStatus: string | null;
    seeded: boolean;
  };
}

export function fetchAdminGpsPolicy(): Promise<GpsAdminPolicy> {
  return request<GpsAdminPolicy>('/api/admin/gps-tracking');
}

export function saveAdminGpsGlobal(globalEnabled: boolean): Promise<GpsAdminPolicy> {
  return request<GpsAdminPolicy>('/api/admin/gps-tracking', {
    method: 'PUT',
    body: JSON.stringify({ globalEnabled }),
  });
}

export async function fetchAdminGpsCapacity(): Promise<Record<string, unknown>> {
  const payload = await request<{ ok: true; capacity: Record<string, unknown> }>('/api/admin/gps-tracking/capacity');
  return payload.capacity || {};
}

export function saveAdminCategoryGps(
  categoryId: string,
  gpsTracking: boolean,
  liveMap = gpsTracking,
): Promise<GpsAdminPolicy> {
  return request<GpsAdminPolicy>('/api/admin/gps-tracking', {
    method: 'PUT',
    body: JSON.stringify({ categoryId, gpsTracking, liveMap }),
  });
}
