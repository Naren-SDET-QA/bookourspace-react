/**
 * Browser client for the centralized user-management API.
 *
 * Nothing here decides access. The server re-verifies the admin session and the
 * shared engine decides every read and write. These helpers only shape requests
 * and surface the server's answer, so a stale or forged client cannot grant
 * itself anything.
 */

import { buildAuthHeaders } from './supabaseClient';

export interface AccessAccountSummary {
  id: string;
  email: string;
  fullName: string;
  role: string;
  accountStatus: string;
  isSuperAdmin: boolean;
  createdAt: string | null;
  categoryCount: number;
  businessCount: number;
}

export interface AccessCustomerGrant {
  category: string;
  label: string;
  sections: string[];
  actions: string[];
  expiresAt: string | null;
  grantSource: string | null;
}

export interface AccessBusinessGrant {
  businessId: string;
  name: string;
  moduleType: string;
  approvalStatus: string;
  isEnabled: boolean;
  moduleEnabled: boolean;
  moduleApprovalStatus: string;
  memberRole: string;
  memberStatus: string;
  category: string | null;
  allowedModules: string[] | null;
  sections: Record<string, string[]>;
  actions: Record<string, string[]>;
}

export interface AccessAccountDetail extends AccessAccountSummary {
  customerGrants: AccessCustomerGrant[];
  businesses: AccessBusinessGrant[];
}

export interface AccessHealthFinding {
  id: string;
  code: string;
  severity: 'info' | 'warning' | 'critical';
  approvalRequired: boolean;
  summary: string;
  userId?: string;
  email?: string;
  businessId?: string;
  categoryKey?: string;
}

export interface AccessHealthReport {
  checkedAt: string;
  healthy: boolean;
  profileCount: number;
  customerGrantCount: number;
  membershipCount: number;
  findings: AccessHealthFinding[];
  countsByCode: Record<string, number>;
  safeRepairCount: number;
  approvalRequiredCount: number;
}

export interface AccessRepairPlan {
  findingIds: string[];
  operations: Array<Record<string, unknown>>;
  heldOperations: Array<Record<string, unknown>>;
  requiresApproval: boolean;
  includesElevation: false;
}

export interface AccessHistoryEntry {
  id: string;
  scope: string;
  category: string;
  action: string;
  createdAt: string;
  expiresAt: string | null;
  actor: string | null;
  reason: string | null;
  sections: string[];
  actions: string[];
}

export interface AccessCatalogCategory {
  key: string;
  label: string;
  emoji: string;
  providerModule: string | null;
  active: boolean;
  sections: Array<{ key: string; label: string }>;
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function request(path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(path, {
    ...init,
    headers: buildAuthHeaders({ accept: 'application/json', ...(init.headers as Record<string, string>) }),
    cache: 'no-store',
  });
  const body = await readJson(response);
  if (!response.ok || body?.ok === false) {
    const error = new Error(body?.message || body?.error || `Request failed (${response.status})`);
    (error as Error & { code?: string; status?: number }).code = body?.error;
    (error as Error & { code?: string; status?: number }).status = response.status;
    throw error;
  }
  return body;
}

export async function fetchAccessAccounts(input: {
  query?: string;
  role?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ accounts: AccessAccountSummary[]; total: number }> {
  const params = new URLSearchParams();
  if (input.query) params.set('q', input.query);
  if (input.role) params.set('role', input.role);
  if (input.status) params.set('status', input.status);
  if (input.limit) params.set('limit', String(input.limit));
  if (input.offset) params.set('offset', String(input.offset));
  const result = await request(`/api/admin/access-control/accounts?${params.toString()}`);
  return { accounts: result.accounts || [], total: Number(result.total) || 0 };
}

export async function fetchAccessAccount(userId: string): Promise<AccessAccountDetail> {
  const result = await request(`/api/admin/access-control/accounts/${encodeURIComponent(userId)}`);
  return result.account as AccessAccountDetail;
}

export async function fetchAccessCatalog(): Promise<AccessCatalogCategory[]> {
  const result = await request('/api/admin/access-control/catalog');
  return (result.categories || []) as AccessCatalogCategory[];
}

export async function saveCategoryPermissions(
  userId: string,
  categories: Array<{ category: string; actions: string[]; sections?: string[]; expiresAt?: string | null }>,
): Promise<AccessAccountDetail> {
  const result = await request(`/api/admin/access-control/accounts/${encodeURIComponent(userId)}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ categories }),
  });
  return result.account as AccessAccountDetail;
}

export async function grantCompleteAccess(
  userId: string,
  categories?: string[] | null,
): Promise<AccessAccountDetail> {
  const result = await request(`/api/admin/access-control/accounts/${encodeURIComponent(userId)}/complete-access`, {
    method: 'POST',
    body: JSON.stringify({ categories: categories ?? null }),
  });
  return result.account as AccessAccountDetail;
}

export async function restoreViewOnly(
  userId: string,
  categories?: string[] | null,
): Promise<AccessAccountDetail> {
  const result = await request(`/api/admin/access-control/accounts/${encodeURIComponent(userId)}/view-only`, {
    method: 'POST',
    body: JSON.stringify({ categories: categories ?? null }),
  });
  return result.account as AccessAccountDetail;
}

export async function setAccountStatus(
  userId: string,
  status: 'active' | 'suspended' | 'revoked',
  reason?: string,
): Promise<AccessAccountSummary> {
  const result = await request(`/api/admin/access-control/accounts/${encodeURIComponent(userId)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, reason: reason ?? null }),
  });
  return result.account as AccessAccountSummary;
}

export async function fetchAccessHistory(userId: string): Promise<AccessHistoryEntry[]> {
  const result = await request(`/api/admin/access-control/accounts/${encodeURIComponent(userId)}/history`);
  return (result.history || []) as AccessHistoryEntry[];
}

export async function fetchAccessHealth(): Promise<{ report: AccessHealthReport; plan: AccessRepairPlan }> {
  const result = await request('/api/admin/access-control/health');
  return { report: result.report as AccessHealthReport, plan: result.plan as AccessRepairPlan };
}

export async function previewRepair(): Promise<{
  repairId: string;
  report: AccessHealthReport;
  plan: AccessRepairPlan;
}> {
  const result = await request('/api/admin/access-control/health/repairs/preview', { method: 'POST' });
  return {
    repairId: String(result.repairId),
    report: result.report as AccessHealthReport,
    plan: result.plan as AccessRepairPlan,
  };
}

export async function applyRepair(
  repairId: string,
  approveDestructive = false,
): Promise<{ id: string; status: string; applied: number; held: number }> {
  return request(`/api/admin/access-control/health/repairs/${encodeURIComponent(repairId)}/apply`, {
    method: 'POST',
    body: JSON.stringify({ approveDestructive }),
  });
}

export async function rollbackRepair(
  repairId: string,
): Promise<{ id: string; status: string; reversed: number }> {
  return request(`/api/admin/access-control/health/repairs/${encodeURIComponent(repairId)}/rollback`, {
    method: 'POST',
  });
}

export async function fetchRepairs(): Promise<
  Array<{
    id: string;
    status: string;
    requiresApproval: boolean;
    approvedDestructive: boolean;
    createdAt: string;
    appliedAt: string | null;
    rolledBackAt: string | null;
  }>
> {
  const result = await request('/api/admin/access-control/health/repairs');
  return result.repairs || [];
}
