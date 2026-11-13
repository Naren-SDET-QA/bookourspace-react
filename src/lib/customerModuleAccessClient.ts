import { buildAuthHeaders } from './supabaseClient';
import type { CustomerModuleKey } from './customerModuleMeta';

/**
 * Browser client for customer-specific module access.
 *
 * The server is the authority. The customer endpoint returns the signed-in
 * account's effective module keys; the admin endpoints manage grants. Nothing
 * here grants access — an unauthorized module is hidden and its API check is
 * refused server-side.
 */

export interface CustomerModuleGrant {
  moduleKey: CustomerModuleKey;
  expiresAt: string | null;
}

export interface AdminCustomer {
  id: string;
  email: string;
  fullName: string;
  modules: CustomerModuleGrant[];
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function fetchCustomerModules(): Promise<{
  ok: boolean;
  role: string;
  modules: CustomerModuleKey[];
  source?: string;
}> {
  try {
    const response = await fetch('/api/customer/modules', {
      headers: buildAuthHeaders({ accept: 'application/json' }),
      cache: 'no-store',
    });
    const data = await readJson(response);
    if (!response.ok || !data?.ok) {
      return { ok: false, role: data?.role || 'customer', modules: [] };
    }
    return {
      ok: true,
      role: String(data.role || 'customer'),
      modules: Array.isArray(data.modules) ? (data.modules as CustomerModuleKey[]) : [],
      source: typeof data.source === 'string' ? data.source : undefined,
    };
  } catch {
    return { ok: false, role: 'customer', modules: [] };
  }
}

export async function verifyCustomerModule(moduleKey: string): Promise<{ ok: boolean; allowed: boolean; error?: string }> {
  try {
    const response = await fetch('/api/customer/modules/verify', {
      method: 'POST',
      headers: buildAuthHeaders({ 'content-type': 'application/json', accept: 'application/json' }),
      body: JSON.stringify({ moduleKey }),
    });
    const data = await readJson(response);
    return { ok: response.ok && data?.ok === true, allowed: data?.allowed === true, error: data?.error };
  } catch {
    return { ok: false, allowed: false, error: 'NETWORK_ERROR' };
  }
}

export async function fetchAdminCustomerModuleAccess(params: { query?: string; limit?: number; offset?: number } = {}): Promise<{
  ok: boolean;
  customers?: AdminCustomer[];
  total?: number;
  error?: string;
}> {
  const query = new URLSearchParams();
  if (params.query) query.set('q', params.query);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  try {
    const response = await fetch(`/api/admin/customer-module-access${query.toString() ? `?${query.toString()}` : ''}`, {
      headers: buildAuthHeaders({ accept: 'application/json' }),
      cache: 'no-store',
    });
    const data = await readJson(response);
    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.error || 'CUSTOMER_MODULE_ACCESS_UNAVAILABLE' };
    }
    return { ok: true, customers: data.customers, total: data.total };
  } catch {
    return { ok: false, error: 'CUSTOMER_MODULE_ACCESS_UNAVAILABLE' };
  }
}

export async function saveAdminCustomerModuleAccess(userId: string, modules: CustomerModuleGrant[]): Promise<{
  ok: boolean;
  modules?: CustomerModuleGrant[];
  error?: string;
  message?: string;
}> {
  try {
    const response = await fetch(`/api/admin/customer-module-access/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: buildAuthHeaders({ accept: 'application/json' }),
      body: JSON.stringify({ modules }),
    });
    const data = await readJson(response);
    if (!response.ok || !data?.ok) {
      return { ok: false, error: data?.error || 'CUSTOMER_MODULE_ACCESS_UNAVAILABLE', message: data?.message };
    }
    return { ok: true, modules: data.modules };
  } catch {
    return { ok: false, error: 'CUSTOMER_MODULE_ACCESS_UNAVAILABLE' };
  }
}

export async function revokeAdminCustomerModuleAccess(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/admin/customer-module-access/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: buildAuthHeaders({ accept: 'application/json' }),
    });
    const data = await readJson(response);
    return { ok: response.ok && data?.ok === true, error: data?.error };
  } catch {
    return { ok: false, error: 'CUSTOMER_MODULE_ACCESS_UNAVAILABLE' };
  }
}

export async function fetchAdminCustomerModuleAudit(userId: string): Promise<{
  ok: boolean;
  audit?: Array<{ id: string; moduleKey: string; action: string; expiresAt: string | null; createdAt: string; grantedBy: string | null }>;
  error?: string;
}> {
  try {
    const response = await fetch(`/api/admin/customer-module-access/${encodeURIComponent(userId)}/audit`, {
      headers: buildAuthHeaders({ accept: 'application/json' }),
      cache: 'no-store',
    });
    const data = await readJson(response);
    if (!response.ok || !data?.ok) return { ok: false, error: data?.error };
    return { ok: true, audit: data.audit };
  } catch {
    return { ok: false, error: 'CUSTOMER_MODULE_ACCESS_UNAVAILABLE' };
  }
}
