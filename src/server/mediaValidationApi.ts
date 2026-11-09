import type { Express, Request, Response } from 'express';
import { assertVariantVisualQuality, inspectServerImage } from './mediaImageInspection';
import { verifySupabaseGoogleIdentity } from './supabaseGoogleIdentity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type MediaAsset = {
  id: string;
  owner_id: string;
  parent_type: string;
  parent_id: string | null;
  bucket_id: string;
  privacy: 'public' | 'private';
  object_path: string;
  media_kind: string;
  media_format: string;
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  checksum_sha256: string | null;
  variants: Array<{ object_path: string; width: number; height: number; mime_type: string; file_size_bytes: number }>;
  processing_status: string;
};

interface MediaValidationConfig {
  projectUrl: string;
  publishableKey: string;
  serverSecretKey: string;
  fetchImpl?: typeof fetch;
}

function tokenFrom(request: Request): string {
  return String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function serviceHeaders(key: string) {
  // New Supabase sb_secret_ keys are opaque API keys, not JWTs. They belong in
  // apikey only; the legacy service_role JWT remains accepted as a bearer.
  return {
    apikey: key,
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
    Accept: 'application/json',
  };
}

function objectUrl(projectUrl: string, bucket: string, path: string): string {
  const safePath = path.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${projectUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${safePath}`;
}

function assertOwnedObjectPath(path: string, ownerId: string): void {
  if (typeof path !== 'string' || !path.startsWith(`${ownerId}/`) || path.length > 512 ||
      path.includes('\\') || path.includes('//') || /(^|\/)\.\.?($|\/)|[\u0000-\u001f\u007f]/.test(path)) {
    throw Object.assign(new Error('MEDIA_OBJECT_PATH_INVALID'), { statusCode: 422 });
  }
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string, key: string, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: { ...serviceHeaders(key), ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error('MEDIA_BACKEND_REQUEST_FAILED');
  return await response.json() as T;
}

async function inspectObject(config: MediaValidationConfig, bucket: string, path: string) {
  const response = await (config.fetchImpl || fetch)(objectUrl(config.projectUrl, bucket, path), {
    headers: serviceHeaders(config.serverSecretKey),
  });
  if (!response.ok) throw new Error('MEDIA_QUARANTINE_OBJECT_UNAVAILABLE');
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, inspection: await inspectServerImage(bytes) };
}

async function validateAndFinalize(config: MediaValidationConfig, request: Request): Promise<void> {
  const fetchImpl = config.fetchImpl || fetch;
  const identity = await verifySupabaseGoogleIdentity({
    projectUrl: config.projectUrl,
    publishableKey: config.publishableKey,
    accessToken: tokenFrom(request),
    fetchImpl,
  });
  if (!identity) throw Object.assign(new Error('VERIFIED_GOOGLE_SESSION_REQUIRED'), { statusCode: 401 });

  const id = String((request.body as any)?.id || '').trim();
  if (!UUID.test(id)) throw Object.assign(new Error('MEDIA_ASSET_ID_INVALID'), { statusCode: 400 });
  const assetUrl = new URL(`${config.projectUrl}/rest/v1/media_assets`);
  assetUrl.search = new URLSearchParams({
    select: 'id,owner_id,parent_type,parent_id,bucket_id,privacy,object_path,media_kind,media_format,file_size_bytes,width,height,checksum_sha256,variants,processing_status',
    id: `eq.${id}`,
    limit: '1',
  }).toString();
  const assets = await fetchJson<MediaAsset[]>(fetchImpl, assetUrl.toString(), config.serverSecretKey);
  const asset = assets[0];
  if (!asset || asset.owner_id.toLowerCase() !== identity.id.toLowerCase()) {
    throw Object.assign(new Error('MEDIA_ASSET_NOT_FOUND'), { statusCode: 404 });
  }
  const profileSlot = asset.parent_type === 'profile_avatar'
    ? 'avatar'
    : asset.parent_type === 'profile_cover'
      ? 'cover'
      : null;
  const profileMedia = profileSlot !== null;
  if (profileMedia && (asset.bucket_id !== 'bos-private-profile-media' || asset.privacy !== 'private' || asset.parent_id?.toLowerCase() !== identity.id.toLowerCase())) {
    throw Object.assign(new Error('PROFILE_MEDIA_CONTEXT_MISMATCH'), { statusCode: 403 });
  }
  if (asset.processing_status !== 'ready' && (asset.processing_status !== 'quarantined' || asset.bucket_id !== (profileMedia ? 'bos-private-profile-media' : 'bos-public-media') || asset.media_kind !== 'image')) {
    throw Object.assign(new Error('MEDIA_ASSET_NOT_FINALIZABLE'), { statusCode: 409 });
  }
  assertOwnedObjectPath(asset.object_path, identity.id);
  const profileUrl = new URL(`${config.projectUrl}/rest/v1/profiles`);
  profileUrl.search = new URLSearchParams({ select: 'id,role,account_status', id: `eq.${identity.id}`, limit: '1' }).toString();
  const profiles = await fetchJson<Array<{ id: string; role: string; account_status: string }>>(fetchImpl, profileUrl.toString(), config.serverSecretKey);
  const profile = profiles[0];
  if (!profile || profile.account_status !== 'active' || (!profileMedia && !['provider', 'admin'].includes(profile.role))) {
    throw Object.assign(new Error('MEDIA_FINALIZATION_REQUIRES_ACTIVE_PROVIDER'), { statusCode: 403 });
  }

  if (asset.processing_status === 'ready') {
    if (profileMedia) await setProfileMedia(config, identity.id, asset.id, profileSlot!);
    return;
  }

  const originalObject = await inspectObject(config, asset.bucket_id, asset.object_path);
  const original = originalObject.inspection;
  if (original.bytes !== Number(asset.file_size_bytes) || original.format !== asset.media_format || original.sha256 !== asset.checksum_sha256) {
    throw Object.assign(new Error('MEDIA_ORIGINAL_METADATA_MISMATCH'), { statusCode: 422 });
  }
  if (asset.width && Number(asset.width) !== original.width) throw Object.assign(new Error('MEDIA_ORIGINAL_WIDTH_MISMATCH'), { statusCode: 422 });
  if (asset.height && Number(asset.height) !== original.height) throw Object.assign(new Error('MEDIA_ORIGINAL_HEIGHT_MISMATCH'), { statusCode: 422 });

  const seenChecksums = new Set([original.sha256]);
  if (!Array.isArray(asset.variants) || asset.variants.length > 10) throw Object.assign(new Error('MEDIA_VARIANT_METADATA_INVALID'), { statusCode: 422 });
  for (const variant of asset.variants) {
    assertOwnedObjectPath(variant?.object_path, identity.id);
    if (!variant || !['image/webp', 'image/avif'].includes(variant.mime_type) ||
        !Number.isSafeInteger(variant.file_size_bytes) || variant.file_size_bytes <= 0 || variant.file_size_bytes >= original.bytes) {
      throw Object.assign(new Error('MEDIA_VARIANT_METADATA_INVALID'), { statusCode: 422 });
    }
    const variantObject = await inspectObject(config, asset.bucket_id, variant.object_path);
    const inspected = variantObject.inspection;
    if (inspected.mimeType !== variant.mime_type || inspected.width !== variant.width || inspected.height !== variant.height ||
        inspected.bytes !== variant.file_size_bytes || inspected.width > original.width || inspected.height > original.height ||
        seenChecksums.has(inspected.sha256)) {
      throw Object.assign(new Error('MEDIA_VARIANT_CONTENT_MISMATCH'), { statusCode: 422 });
    }
    await assertVariantVisualQuality(originalObject.bytes, variantObject.bytes);
    seenChecksums.add(inspected.sha256);
  }

  const finalized = await fetchImpl(`${config.projectUrl}/rest/v1/rpc/finalize_media_asset_server`, {
    method: 'POST',
    headers: { ...serviceHeaders(config.serverSecretKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_asset_id: asset.id,
      p_owner_id: identity.id,
      p_sha256: original.sha256,
      p_width: original.width,
      p_height: original.height,
    }),
  });
  if (!finalized.ok) throw new Error('MEDIA_FINALIZATION_FAILED');
  if (profileMedia) await setProfileMedia(config, identity.id, asset.id, profileSlot!);
}

async function setProfileMedia(config: MediaValidationConfig, ownerId: string, assetId: string, slot: 'avatar' | 'cover') {
  const response = await (config.fetchImpl || fetch)(`${config.projectUrl}/rest/v1/rpc/set_profile_media_asset_server`, {
    method: 'POST',
    headers: { ...serviceHeaders(config.serverSecretKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_asset_id: assetId, p_owner_id: ownerId, p_slot: slot }),
  });
  if (!response.ok) throw new Error('PROFILE_MEDIA_ATTACH_FAILED');
}

/** Register a server-only byte inspection endpoint. It stays fail-closed until
 * a non-frontend Supabase service key and the paired service-only migration
 * are deployed. No service credential is returned to the browser. */
export function registerMediaValidationApi(app: Express, config: MediaValidationConfig): void {
  app.post('/api/media/finalize', async (request: Request, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (!config.projectUrl || !config.publishableKey || !config.serverSecretKey) {
      response.status(503).json({ ok: false, error: 'MEDIA_VALIDATION_SERVER_NOT_CONFIGURED' });
      return;
    }
    try {
      await validateAndFinalize(config, request);
      response.status(200).json({ ok: true, processingStatus: 'ready' });
    } catch (error) {
      const statusCode = Number((error as any)?.statusCode);
      const safeCode = String((error as any)?.message || 'MEDIA_VALIDATION_FAILED')
        .replace(/[^A-Z0-9_]/g, '').slice(0, 80) || 'MEDIA_VALIDATION_FAILED';
      response.status(statusCode >= 400 && statusCode < 500 ? statusCode : 422)
        .json({ ok: false, error: safeCode });
    }
  });
}
