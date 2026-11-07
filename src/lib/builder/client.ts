/**
 * Universal Live Builder client.
 *
 * Published configuration is fetched with an ETag and cached per page key so a
 * Web, Android or iOS client keeps rendering the last known good document while
 * offline. Drafts are never cached and never served without an admin session.
 */
import type { NormalizedPageDocument } from './validate';
import type { EntitySchemaDocument } from './registry';
import type { PolicyDocument } from './policies';

export interface PublishedPage {
  pageKey: string;
  versionId: string;
  versionNumber: number;
  status: 'draft' | 'published' | 'superseded_draft';
  document: NormalizedPageDocument;
  summary: string;
  createdAt: string;
  publishedAt: string | null;
}

export interface BuilderIdentity {
  id: string;
  role: 'admin' | 'super_admin';
  displayName: string;
}

export class BuilderClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = 'BuilderClientError';
  }
}

const CACHE_PREFIX = 'bos_builder_page_v1:';
const ETAG_PREFIX = 'bos_builder_etag_v1:';
const CHANNEL = 'bos-builder-updates';
/** Public builder content is presentation-only, but stale pages should not be
 * kept offline forever. A week gives travelling users useful coverage while
 * bounding how long a removed or corrected page can remain visible. */
export const BUILDER_PAGE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function sessionHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem('bos_session_token_v1');
  return token ? { 'x-bos-session-token': token } : {};
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? sessionHeaders() : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new BuilderClientError(
      response.status,
      String(body.error || `BUILDER_HTTP_${response.status}`),
      typeof body.message === 'string' ? body.message : undefined,
    );
  }
  return body as T;
}

export function readCachedPage(pageKey: string): { page: PublishedPage; cachedAt: number } | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(CACHE_PREFIX + pageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { page: PublishedPage; cachedAt: number };
    const age = Date.now() - parsed?.cachedAt;
    if (!parsed?.page?.document || !Number.isFinite(parsed.cachedAt) || age < 0 || age > BUILDER_PAGE_CACHE_MAX_AGE_MS) {
      store.removeItem(CACHE_PREFIX + pageKey);
      store.removeItem(ETAG_PREFIX + pageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function cachePublishedPage(page: PublishedPage): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(CACHE_PREFIX + page.pageKey, JSON.stringify({ page, cachedAt: Date.now() }));
  } catch {
    /* A full quota must never break rendering. */
  }
}

export interface PublishedPageResult {
  page: PublishedPage;
  source: 'network' | 'cache';
  offline: boolean;
}

/**
 * Fetch a published page. A 304 reuses the cached copy; a network failure
 * falls back to cache (marked offline) and only throws when nothing is cached.
 */
export async function fetchPublishedPage(pageKey: string, signal?: AbortSignal): Promise<PublishedPageResult> {
  const cached = readCachedPage(pageKey);
  const etag = storage()?.getItem(ETAG_PREFIX + pageKey) ?? '';
  try {
    const response = await fetch(`/api/builder/pages/${encodeURIComponent(pageKey)}`, {
      signal,
      headers: etag ? { 'if-none-match': etag } : undefined,
    });
    if (response.status === 304 && cached) {
      return { page: cached.page, source: 'cache', offline: false };
    }
    if (!response.ok) {
      // Transient server/rate-limit responses may still use a recent published
      // snapshot. Client errors (especially 404) must not resurrect old pages.
      if ((response.status >= 500 || response.status === 429) && cached) {
        return { page: cached.page, source: 'cache', offline: true };
      }
      if (response.status === 404) {
        storage()?.removeItem(CACHE_PREFIX + pageKey);
        storage()?.removeItem(ETAG_PREFIX + pageKey);
      }
      throw new BuilderClientError(response.status, `BUILDER_PAGE_${response.status}`);
    }
    const body = (await response.json()) as { page: PublishedPage };
    cachePublishedPage(body.page);
    const nextEtag = response.headers.get('etag');
    if (nextEtag) storage()?.setItem(ETAG_PREFIX + pageKey, nextEtag);
    return { page: body.page, source: 'network', offline: false };
  } catch (error) {
    if (error instanceof BuilderClientError) throw error;
    if (cached) return { page: cached.page, source: 'cache', offline: true };
    throw new BuilderClientError(0, 'BUILDER_OFFLINE_NO_CACHE');
  }
}

export async function fetchBuilderRegistry(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/api/builder/registry');
}

export interface AdminPageState {
  actor: BuilderIdentity;
  published: PublishedPage | null;
  draft: PublishedPage | null;
  versions: PublishedPage[];
}

export async function fetchAdminPage(pageKey: string): Promise<AdminPageState> {
  return request<AdminPageState>(`/api/builder/pages/${encodeURIComponent(pageKey)}?mode=admin`, {}, true);
}

export async function fetchAdminPages(): Promise<{
  actor: BuilderIdentity;
  pages: Array<{ pageKey: string; published: PublishedPage | null; draft: PublishedPage | null; versionCount: number }>;
}> {
  return request('/api/builder/pages', {}, true);
}

export async function savePageDraft(
  pageKey: string,
  document: NormalizedPageDocument,
  expectedVersion: number,
  summary: string,
): Promise<PublishedPage> {
  const body = await request<{ page: PublishedPage }>(
    `/api/builder/pages/${encodeURIComponent(pageKey)}/draft`,
    { method: 'POST', body: JSON.stringify({ document, expectedVersion, summary }) },
    true,
  );
  return body.page;
}

export async function publishPage(pageKey: string, versionId: string): Promise<PublishedPage> {
  const body = await request<{ page: PublishedPage }>(
    `/api/builder/pages/${encodeURIComponent(pageKey)}/publish`,
    { method: 'POST', body: JSON.stringify({ versionId }) },
    true,
  );
  cachePublishedPage(body.page);
  broadcastPublishedUpdate(pageKey, body.page.versionNumber);
  return body.page;
}

export async function rollbackPage(pageKey: string, targetVersionId: string): Promise<PublishedPage> {
  const body = await request<{ page: PublishedPage }>(
    `/api/builder/pages/${encodeURIComponent(pageKey)}/rollback`,
    { method: 'POST', body: JSON.stringify({ targetVersionId }) },
    true,
  );
  cachePublishedPage(body.page);
  broadcastPublishedUpdate(pageKey, body.page.versionNumber);
  return body.page;
}

export async function fetchEntities(): Promise<Array<Record<string, unknown>>> {
  const body = await request<{ entities: Array<Record<string, unknown>> }>('/api/builder/entities', {}, true);
  return body.entities;
}

export async function fetchEntity(entityKey: string): Promise<{
  published: { key: string; schema: EntitySchemaDocument; versionNumber: number } | null;
  draft: { versionId: string; versionNumber: number; schema: EntitySchemaDocument; summary: string } | null;
  versions: Array<Record<string, unknown>>;
}> {
  return request(`/api/builder/entities/${encodeURIComponent(entityKey)}?mode=admin`, {}, true);
}

export async function saveEntityDraft(
  entityKey: string,
  schema: EntitySchemaDocument,
  expectedVersion: number,
  summary: string,
): Promise<Record<string, unknown>> {
  const body = await request<{ version: Record<string, unknown> }>(
    `/api/builder/entities/${encodeURIComponent(entityKey)}/draft`,
    { method: 'POST', body: JSON.stringify({ schema, expectedVersion, summary }) },
    true,
  );
  return body.version;
}

export async function publishEntity(entityKey: string, versionId: string): Promise<Record<string, unknown>> {
  const body = await request<{ version: Record<string, unknown> }>(
    `/api/builder/entities/${encodeURIComponent(entityKey)}/publish`,
    { method: 'POST', body: JSON.stringify({ versionId }) },
    true,
  );
  return body.version;
}

export async function rollbackEntity(entityKey: string, targetVersionId: string): Promise<Record<string, unknown>> {
  const body = await request<{ version: Record<string, unknown> }>(
    `/api/builder/entities/${encodeURIComponent(entityKey)}/rollback`,
    { method: 'POST', body: JSON.stringify({ targetVersionId }) },
    true,
  );
  return body.version;
}

export async function fetchPolicies(): Promise<PolicyDocument> {
  const body = await request<{ policies: PolicyDocument }>('/api/admin/policies', {}, true);
  return body.policies;
}

export async function savePolicies(policies: PolicyDocument): Promise<PolicyDocument> {
  const body = await request<{ policies: PolicyDocument }>(
    '/api/admin/policies',
    { method: 'PUT', body: JSON.stringify({ policies }) },
    true,
  );
  return body.policies;
}

export async function fetchRecords(entityKey: string): Promise<Array<Record<string, unknown>>> {
  const body = await request<{ records: Array<Record<string, unknown>> }>(
    `/api/builder/entities/${encodeURIComponent(entityKey)}/records`,
    {},
    true,
  );
  return body.records;
}

export async function saveRecord(
  entityKey: string,
  data: Record<string, unknown>,
  recordId?: string,
): Promise<Record<string, unknown>> {
  const body = await request<{ record: Record<string, unknown> }>(
    `/api/builder/entities/${encodeURIComponent(entityKey)}/records`,
    { method: 'POST', body: JSON.stringify({ data, recordId }) },
    true,
  );
  return body.record;
}

export async function archiveRecord(entityKey: string, recordId: string): Promise<void> {
  await request(
    `/api/builder/entities/${encodeURIComponent(entityKey)}/records/${encodeURIComponent(recordId)}/archive`,
    { method: 'POST', body: '{}' },
    true,
  );
}

export async function fetchReport(metric: string): Promise<{
  metric: string;
  generatedAt: string;
  rows: Array<Record<string, unknown>>;
}> {
  const body = await request<{ report: { metric: string; generatedAt: string; rows: Array<Record<string, unknown>> } }>(
    `/api/builder/reports/${encodeURIComponent(metric)}`,
    {},
    true,
  );
  return body.report;
}

export async function fetchAudit(): Promise<Array<Record<string, unknown>>> {
  const body = await request<{ entries: Array<Record<string, unknown>> }>('/api/builder/audit', {}, true);
  return body.entries;
}

// ---------------------------------------------------------------------------
// Live update fan-out
// ---------------------------------------------------------------------------

let channel: BroadcastChannel | null = null;

function ensureChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL);
  return channel;
}

export function broadcastPublishedUpdate(pageKey: string, versionNumber: number): void {
  ensureChannel()?.postMessage({ type: 'page-published', pageKey, versionNumber, at: Date.now() });
}

export interface BuilderUpdate {
  pageKey: string;
  versionNumber: number;
}

/**
 * Subscribe to published-page changes. Web/desktop use BroadcastChannel; other
 * tabs also receive a storage event. Native shells revalidate on resume via
 * `visibilitychange`, which covers a backgrounded WebView.
 */
export function subscribePublishedUpdates(onUpdate: (update: BuilderUpdate) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: MessageEvent) => {
    const data = event.data as { type?: string; pageKey?: string; versionNumber?: number };
    if (data?.type === 'page-published' && data.pageKey && typeof data.versionNumber === 'number') {
      onUpdate({ pageKey: data.pageKey, versionNumber: data.versionNumber });
    }
  };
  const storageListener = (event: StorageEvent) => {
    if (event.key?.startsWith(CACHE_PREFIX)) {
      const pageKey = event.key.slice(CACHE_PREFIX.length);
      const cached = readCachedPage(pageKey);
      if (cached) onUpdate({ pageKey, versionNumber: cached.page.versionNumber });
    }
  };
  const resumeListener = () => {
    if (document.visibilityState === 'visible') onUpdate({ pageKey: '*', versionNumber: 0 });
  };
  const ch = ensureChannel();
  ch?.addEventListener('message', listener);
  window.addEventListener('storage', storageListener);
  document.addEventListener('visibilitychange', resumeListener);
  return () => {
    ch?.removeEventListener('message', listener);
    window.removeEventListener('storage', storageListener);
    document.removeEventListener('visibilitychange', resumeListener);
  };
}

export function platformLabel(): 'web' | 'android' | 'ios' {
  const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = capacitor?.getPlatform?.();
  if (platform === 'android') return 'android';
  if (platform === 'ios') return 'ios';
  return 'web';
}
