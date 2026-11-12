import type {
  PublicServiceCategory,
  ServiceCategoryAdminView,
  ServiceCategoryVersionView,
  ServiceCredentialType,
  ServiceCredentialView,
  PendingServiceDocumentView,
} from './serviceCatalog';

export class ServiceCatalogApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = 'ServiceCatalogApiError';
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

async function request<T>(path: string, init: RequestInit = {}, cacheBust = false): Promise<T> {
  const token = sessionToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const suffix = cacheBust ? `${path.includes('?') ? '&' : '?'}ts=${Date.now()}` : '';
  const response = await fetch(`${path}${suffix}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new ServiceCatalogApiError(String(payload?.error || 'SERVICE_CATALOG_UNAVAILABLE'), response.status);
  }
  return payload as T;
}

export interface PublicServiceCatalogResponse {
  categories: PublicServiceCategory[];
}

export function fetchPublicServiceCatalog(): Promise<PublicServiceCatalogResponse> {
  return request<PublicServiceCatalogResponse>('/api/service-catalog');
}

export function fetchAdminServiceCatalog(): Promise<{
  actor: { id: string; role: 'admin' | 'super_admin'; displayName: string };
  tenantId: string;
  categories: ServiceCategoryAdminView[];
}> {
  return request('/api/admin/service-catalog', {}, true);
}

export function fetchAdminServiceCategory(categoryId: string): Promise<{
  actor: { id: string; role: 'admin' | 'super_admin'; displayName: string };
  category: ServiceCategoryAdminView;
}> {
  return request(`/api/admin/service-catalog/${encodeURIComponent(categoryId)}`, {}, true);
}

export function saveServiceCategoryDraft(
  categoryId: string,
  config: unknown,
  summary: string,
  expectedVersion: number | null,
): Promise<{ version: ServiceCategoryVersionView }> {
  return request(`/api/admin/service-catalog/${encodeURIComponent(categoryId)}/draft`, {
    method: 'POST',
    body: JSON.stringify({ config, summary, expectedVersion }),
  });
}

export function publishServiceCategory(
  categoryId: string,
  versionId: string,
): Promise<{ version: ServiceCategoryVersionView }> {
  return request(`/api/admin/service-catalog/${encodeURIComponent(categoryId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ versionId }),
  });
}

export function rollbackServiceCategory(
  categoryId: string,
  targetVersionId: string,
): Promise<{ version: ServiceCategoryVersionView }> {
  return request(`/api/admin/service-catalog/${encodeURIComponent(categoryId)}/rollback`, {
    method: 'POST',
    body: JSON.stringify({ targetVersionId }),
  });
}

export function setServiceCategoryEnabled(
  categoryId: string,
  enabled: boolean,
  reason: string,
): Promise<{ categoryId: string; enabled: boolean }> {
  return request(`/api/admin/service-catalog/${encodeURIComponent(categoryId)}/enabled`, {
    method: 'POST',
    body: JSON.stringify({ enabled, reason }),
  });
}

export function fetchServiceCatalogAudit(limit = 100): Promise<{
  audit: Array<{
    id: number;
    tenantId: string;
    categoryId: string;
    versionNumber: number | null;
    actorId: string | null;
    actorRole: string;
    action: string;
    summary: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }>;
}> {
  return request(`/api/admin/service-catalog/audit?limit=${encodeURIComponent(String(limit))}`, {}, true);
}

export interface ServiceVerificationsResponse {
  documents: PendingServiceDocumentView[];
  credentials: ServiceCredentialView[];
}

export function fetchServiceCatalogVerifications(): Promise<ServiceVerificationsResponse> {
  return request('/api/admin/service-catalog/verifications', {}, true);
}

export function reviewServiceDocument(
  documentId: string,
  status: 'verified' | 'rejected',
  note: string,
): Promise<{ document: { documentId: string; bookingId: string; documentKey: string; status: string } }> {
  return request(`/api/admin/service-catalog/documents/${encodeURIComponent(documentId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ status, note }),
  });
}

export function reviewServiceCredential(
  credentialId: string,
  status: 'verified' | 'rejected',
  note: string,
): Promise<{ credential: ServiceCredentialView }> {
  return request(`/api/admin/service-catalog/credentials/${encodeURIComponent(credentialId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ status, note }),
  });
}

export function fetchProviderCredentials(): Promise<{ credentials: ServiceCredentialView[] }> {
  return request('/api/services/provider/credentials', {}, true);
}

export function submitProviderCredential(input: {
  credentialType: ServiceCredentialType;
  licenseNumber: string;
  issuingAuthority?: string;
  expiresOn?: string;
  categoryId?: string;
  documentReference?: string;
}): Promise<{ credential: ServiceCredentialView }> {
  return request('/api/services/provider/credentials', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function serviceCatalogErrorMessage(error: unknown): string {
  const code = error instanceof ServiceCatalogApiError
    ? error.code
    : (error as { code?: string })?.code || 'SERVICE_CATALOG_UNAVAILABLE';
  const messages: Record<string, string> = {
    SERVICE_CATALOG_UNAVAILABLE: 'Service configuration could not be reached. Try again.',
    SERVICE_CATALOG_NOT_CONFIGURED: 'Service configuration needs the PostgreSQL repository.',
    SERVICE_CATALOG_AUTH_REQUIRED: 'Sign in as an administrator to manage services.',
    SERVICE_CATALOG_ADMIN_REQUIRED: 'Administrator access is required.',
    SERVICE_CATALOG_SUPER_ADMIN_REQUIRED: 'Only a Super Admin can save, publish or disable service categories.',
    SERVICE_CATALOG_VERSION_CONFLICT: 'A newer draft exists. Reload the category before saving.',
    SERVICE_CATALOG_INVALID_CONFIG: 'Check the category configuration.',
    SERVICE_CATALOG_INVALID_KEY: 'Category id must be lower_snake_case.',
    SERVICE_CATALOG_REASON_REQUIRED: 'Write a short reason before enabling or disabling.',
    SERVICE_CATALOG_REVIEW_NOTE_REQUIRED: 'Write a review note before deciding.',
    SERVICE_CATALOG_NOT_FOUND: 'That category no longer exists.',
    SERVICE_CATALOG_VERSION_NOT_FOUND: 'That version no longer exists.',
    SERVICE_CATALOG_CONFLICT: 'Another administrator changed this category. Reload and retry.',
    SERVICE_CATALOG_FORBIDDEN: 'This action is not permitted.',
    SERVICE_CATALOG_ACCOUNT_INACTIVE: 'This administrator account is not active.',
  };
  return messages[code] || 'The request could not be completed. Try again.';
}
