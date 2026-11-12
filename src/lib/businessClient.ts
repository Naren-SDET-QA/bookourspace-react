import { buildAuthHeaders } from './supabaseClient';

export type BusinessModule = 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay' | 'movies';
export type BusinessRole = 'owner' | 'manager' | 'staff' | 'accountant';

export interface BusinessMembership {
  id: string;
  business_ref: string;
  name: string;
  module_type: BusinessModule;
  approval_status: 'pending' | 'approved' | 'suspended' | 'revoked';
  is_enabled: boolean;
  role: BusinessRole;
  module_enabled: boolean;
  module_approval_status: 'pending' | 'approved' | 'suspended' | 'revoked';
  listing_count: number;
  /** `null` means the member is unrestricted inside this business. */
  allowed_modules?: string[] | null;
  allowed_sections?: Record<string, string[]> | null;
}

export const BUSINESS_MODULE_LABELS: Record<BusinessModule, string> = {
  pg_hostels: 'PG & Hostels',
  classes: 'Classes',
  venues: 'Function Halls',
  services: 'Services',
  hotel_stay: 'Stays',
  movies: 'Movies',
};

export async function fetchBusinesses(): Promise<BusinessMembership[]> {
  const response = await fetch('/api/businesses', {
    headers: { ...buildAuthHeaders(), accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || !Array.isArray(data.businesses)) {
    throw new Error(data?.error || `HTTP_${response.status}`);
  }
  return data.businesses as BusinessMembership[];
}

export async function createBusiness(name: string, moduleType: BusinessModule): Promise<BusinessMembership> {
  const response = await fetch('/api/businesses', {
    method: 'POST',
    headers: buildAuthHeaders({ accept: 'application/json' }),
    body: JSON.stringify({ name, moduleType }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || !data.business) throw new Error(data?.error || `HTTP_${response.status}`);
  return data.business as BusinessMembership;
}

export interface BusinessMember {
  id: string;
  user_id: string;
  role: BusinessRole;
  status: string;
  full_name?: string | null;
  email?: string | null;
  created_at?: string;
  /** `null` means the member is unrestricted inside this business. */
  allowed_modules?: string[] | null;
  allowed_sections?: Record<string, string[]> | null;
}

export interface BusinessMemberAccessPayload {
  allowedModules: string[];
  allowedSections: Record<string, string[]>;
}

/** Set a member's module/section scope, or pass `null` to restore full access. */
export async function setBusinessMemberAccess(
  businessId: string,
  userId: string,
  scope: BusinessMemberAccessPayload | null,
): Promise<void> {
  const response = await fetch(
    `/api/businesses/${encodeURIComponent(businessId)}/members/${encodeURIComponent(userId)}/access`,
    {
      method: scope ? 'PUT' : 'DELETE',
      headers: buildAuthHeaders({ accept: 'application/json' }),
      body: scope ? JSON.stringify(scope) : undefined,
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP_${response.status}`);
}

export async function fetchBusinessMembers(businessId: string): Promise<BusinessMember[]> {
  const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/members`, {
    headers: { ...buildAuthHeaders(), accept: 'application/json' }, cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || !Array.isArray(data.members)) throw new Error(data?.error || `HTTP_${response.status}`);
  return data.members as BusinessMember[];
}

export async function inviteBusinessMember(businessId: string, email: string, role: Exclude<BusinessRole, 'owner'>) {
  const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/invitations`, {
    method: 'POST', headers: buildAuthHeaders({ accept: 'application/json' }),
    body: JSON.stringify({ email, role }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP_${response.status}`);
  return data as { invitation: { email: string; role: string; expires_at: string }; inviteToken?: string };
}

export async function requestOwnershipTransfer(businessId: string, email: string) {
  const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/ownership-transfer`, {
    method: 'POST', headers: buildAuthHeaders({ accept: 'application/json' }),
    body: JSON.stringify({ email }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP_${response.status}`);
  return data as { transfer: { id: string; status: string; expires_at: string }; transferToken?: string };
}
