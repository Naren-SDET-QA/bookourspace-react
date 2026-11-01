import { MODULE_REGISTRY, resolveModuleConfig } from './registry';
import type { ModuleConfigValues } from './registry';

/**
 * Module presentation config over the EXISTING live-page-config backend.
 *
 * The server already stores one JSON document with draft/published/versions and
 * exposes `/api/live-page-config` plus draft/publish endpoints. Module
 * presentation settings live under a `modules` key of that document, so no new
 * table, no migration and no second source of truth is introduced.
 *
 * Drafts stay private: the customer screens read `published` only.
 */

export interface LivePageConfigResponse {
  ok?: boolean;
  published: Record<string, unknown> | null;
  draft?: Record<string, unknown> | null;
  versions?: Array<{ versionId: string; publishedAt: string }>;
}

export type PublishedModuleConfig = Record<string, ModuleConfigValues>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Extract the `modules` slice, keeping only registered module ids. */
export function readModulesSlice(config: unknown): PublishedModuleConfig {
  const modules = asRecord(asRecord(config).modules);
  const result: PublishedModuleConfig = {};
  for (const module of MODULE_REGISTRY) {
    const entry = asRecord(modules[module.id]);
    const values: ModuleConfigValues = {};
    for (const field of module.config.fields) {
      const raw = entry[field.key];
      if (typeof raw === 'string' || typeof raw === 'number') values[field.key] = raw;
    }
    if (Object.keys(values).length > 0) result[module.id] = values;
  }
  return result;
}

export function mergeModulesSlice(
  existing: unknown,
  modules: PublishedModuleConfig
): Record<string, unknown> {
  return { ...asRecord(existing), modules: { ...asRecord(asRecord(existing).modules), ...modules } };
}

/** Customer-facing resolution: invalid values fall back to registry defaults. */
export function resolvePublishedPresentation(config: unknown) {
  const slice = readModulesSlice(config);
  return Object.fromEntries(
    MODULE_REGISTRY.map((module) => [module.id, resolveModuleConfig(module.id, slice[module.id])]),
  ) as Record<string, ReturnType<typeof resolveModuleConfig>>;
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...adminSessionHeaders(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`LIVE_PAGE_CONFIG_${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

function adminSessionHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem('bos_session_token_v1');
  return token ? { 'x-bos-session-token': token } : {};
}

export async function fetchLivePageConfig(): Promise<LivePageConfigResponse> {
  const data = await requestJson('/api/live-page-config');
  return {
    ok: data.ok === true,
    published: (data.published as Record<string, unknown> | null) ?? null,
    draft: (data.draft as Record<string, unknown> | null) ?? null,
    versions: Array.isArray(data.versions) ? (data.versions as LivePageConfigResponse['versions']) : [],
  };
}

/**
 * Save a draft. The server requires the admin role header for both draft and
 * publish; this call is only reachable from the admin console.
 */
export async function saveModuleConfigDraft(
  modules: PublishedModuleConfig,
  options: { actor?: string; role?: string } = {}
): Promise<void> {
  const current = await fetchLivePageConfig();
  const base = current.draft ?? current.published ?? {};
  await requestJson('/api/live-page-config/draft', {
    method: 'POST',
    body: JSON.stringify({
      config: mergeModulesSlice(base, modules),
      pageId: 'modules',
      summary: 'Updated module presentation settings',
      actor: options.actor ?? 'Admin',
    }),
  });
}

export async function publishModuleConfig(
  modules: PublishedModuleConfig,
  options: { actor?: string; role?: string } = {}
): Promise<void> {
  const current = await fetchLivePageConfig();
  const base = current.draft ?? current.published ?? {};
  await requestJson('/api/live-page-config/publish', {
    method: 'POST',
    body: JSON.stringify({
      config: mergeModulesSlice(base, modules),
      pageId: 'modules',
      summary: 'Published module presentation settings',
      actor: options.actor ?? 'Admin',
    }),
  });
}
