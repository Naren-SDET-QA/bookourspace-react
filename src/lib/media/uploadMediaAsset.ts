import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import type { MediaUploadHandler, MediaUploadResult } from '../../components/UniversalMediaManager';
import type { InspectedMedia } from './inspection';
import { invalidateMediaSource } from './signedStorageUrl';

const SAFE_KEY = /^[a-z0-9][a-z0-9_-]{1,63}$/i;
const extensionByFormat: Record<InspectedMedia['format'], string> = {
  jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif', heic: 'heic', gif: 'gif', svg: 'svg',
  mp4: 'mp4', mov: 'mov', webm: 'webm', mp3: 'mp3', wav: 'wav', aac: 'aac', m4a: 'm4a',
  pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', txt: 'txt',
};

const makeId = () => globalThis.crypto?.randomUUID?.();

async function finalizeMediaAssetOnServer(client: SupabaseClient, assetId: string): Promise<void> {
  const { data, error } = await client.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw new Error('MEDIA_FINALIZATION_REQUIRES_VERIFIED_SESSION');
  const response = await fetch('/api/media/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ id: assetId }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const errorCode = typeof result?.error === 'string' ? result.error : 'MEDIA_FINALIZATION_FAILED';
    throw new Error(errorCode);
  }
}

async function sha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SECURE_MEDIA_CHECKSUM_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * RLS-backed browser upload adapter. The browser can only insert quarantined
 * metadata and private objects. A database function validates the stored
 * object and its derivatives before the asset becomes customer-visible.
 */
export function createMediaUploadHandler(
  moduleKey: string,
  parentType: string,
  parentId?: string,
  client: SupabaseClient | null = supabase,
  finalizeAsset: (client: SupabaseClient, assetId: string) => Promise<void> = finalizeMediaAssetOnServer,
): MediaUploadHandler {
  if (!SAFE_KEY.test(moduleKey) || !SAFE_KEY.test(parentType) || (parentId !== undefined && (!parentId.trim() || parentId.length > 128 || /[\u0000-\u001f\u007f]/.test(parentId)))) {
    throw new Error('MEDIA_UPLOAD_CONTEXT_INVALID');
  }
  return async (file, details): Promise<MediaUploadResult> => {
    if (!client) throw new Error('SUPABASE_STORAGE_NOT_CONFIGURED');
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw new Error('MEDIA_UPLOAD_REQUIRES_VERIFIED_SESSION');
    const profileImage = parentType === 'profile_avatar' || parentType === 'profile_cover';
    const publicMedia = ['image', 'video', 'audio'].includes(details.inspected.kind);
    const bucket = profileImage ? 'bos-private-profile-media' : publicMedia ? 'bos-public-media' : 'bos-private-documents';
    const privacy = profileImage || !publicMedia ? 'private' : 'public';
    if (profileImage && (details.inspected.kind !== 'image' || parentId !== auth.user.id)) {
      throw new Error('PROFILE_MEDIA_OWNER_CONTEXT_REQUIRED');
    }
    const sourceFile = details.processedImage?.original ?? file;
    const checksum = await sha256(sourceFile);
    const db = client as any;
    details.onProgress(5);

    // Deduplication is scoped to the verified owner and the same listing context.
    let duplicateQuery = db.from('media_assets')
      .select('id, object_path, media_kind, file_size_bytes, width, height, duration_ms, checksum_sha256, variants, privacy, processing_status')
      .eq('owner_id', auth.user.id)
      .eq('module_key', moduleKey)
      .eq('parent_type', parentType)
      .eq('bucket_id', bucket)
      .eq('checksum_sha256', checksum);
    duplicateQuery = parentId ? duplicateQuery.eq('parent_id', parentId) : duplicateQuery.is('parent_id', null);
    const existing = await duplicateQuery.maybeSingle();
    if (existing.error) throw new Error('MEDIA_DEDUPLICATION_CHECK_FAILED');
    if (existing.data) {
      if (!['quarantined', 'ready'].includes(existing.data.processing_status)) {
        throw new Error('MEDIA_DUPLICATE_NOT_REUSABLE');
      }
      if (existing.data.processing_status === 'quarantined') {
        await finalizeAsset(client, existing.data.id);
      }
      const variants: Array<{ object_path?: string }> = Array.isArray(existing.data.variants)
        ? existing.data.variants as Array<{ object_path?: string }>
        : [];
      const objectReference = `storage://${bucket}/${existing.data.object_path}`;
      invalidateMediaSource(objectReference);
      return {
        id: existing.data.id,
        objectPath: objectReference,
        mediaType: details.inspected,
        fileSizeBytes: existing.data.file_size_bytes,
        width: existing.data.width ?? undefined,
        height: existing.data.height ?? undefined,
        durationMs: existing.data.duration_ms ?? undefined,
        checksumSha256: existing.data.checksum_sha256 ?? undefined,
        variantPaths: variants
          .map((variant) => variant.object_path)
          .filter((path): path is string => Boolean(path))
          .map((path) => `storage://${bucket}/${path}`),
        access: privacy,
      };
    }

    const id = makeId();
    if (!id) throw new Error('SECURE_MEDIA_ID_UNAVAILABLE');
    const basePath = `${auth.user.id}/${moduleKey}/${parentType}/${id}`;
    const originalPath = `${basePath}/original-${checksum.slice(0, 16)}.${extensionByFormat[details.inspected.format]}`;
    const variants = publicMedia && details.processedImage
      ? details.processedImage.variants
        .filter((variant) => variant.mimeType === 'image/webp' || variant.mimeType === 'image/avif')
        .map((variant) => ({
          file: variant.file,
          path: `${basePath}/w${variant.width}-${checksum.slice(0, 16)}.${variant.mimeType === 'image/avif' ? 'avif' : 'webp'}`,
          width: variant.width,
          height: variant.height,
          mime_type: variant.mimeType,
        }))
      : [];

    const objects = [
      ...variants,
      { file: sourceFile, path: originalPath, width: null, height: null, mime_type: details.inspected.mimeType },
    ];
    const variantMetadata: Array<{ object_path: string; width: number; height: number; mime_type: string; file_size_bytes: number }> = [];
    for (let index = 0; index < objects.length; index += 1) {
      const object = objects[index];
      const { error } = await client.storage.from(bucket).upload(object.path, object.file, {
        cacheControl: '3600', contentType: object.mime_type, upsert: false,
      });
      if (error) {
        // The buckets intentionally deny client delete. A partial upload must be cleaned by an audited server job.
        throw new Error(index === 0 ? 'MEDIA_STORAGE_UPLOAD_FAILED' : 'MEDIA_STORAGE_PARTIAL_UPLOAD_REQUIRES_AUDITED_CLEANUP');
      }
      if (object.width && object.height) variantMetadata.push({
        object_path: object.path, width: object.width, height: object.height,
        mime_type: object.mime_type, file_size_bytes: object.file.size,
      });
      details.onProgress(Math.round(10 + ((index + 1) / objects.length) * 75));
    }

    const dimensions = details.processedImage;
    const inserted = await db.from('media_assets').insert({
      id,
      owner_id: auth.user.id,
      module_key: moduleKey,
      parent_type: parentType,
      parent_id: parentId ?? null,
      bucket_id: bucket,
      object_path: originalPath,
      media_kind: details.inspected.kind,
      media_format: details.inspected.format,
      privacy,
      file_size_bytes: sourceFile.size,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      checksum_sha256: checksum,
      variants: variantMetadata,
      display_order: details.displayOrder,
      alt_text: details.altText.slice(0, 500),
      caption: details.caption.slice(0, 1000),
      processing_status: 'quarantined',
    }).select('id').single();
    if (inserted.error || !inserted.data) throw new Error('MEDIA_METADATA_PERSISTENCE_FAILED_REQUIRES_AUDITED_CLEANUP');

    details.onProgress(90);
    await finalizeAsset(client, id);

    details.onProgress(100);
    const objectReference = `storage://${bucket}/${originalPath}`;
    invalidateMediaSource(objectReference);
    return {
      id,
      objectPath: objectReference,
      mediaType: details.inspected,
      fileSizeBytes: sourceFile.size,
      width: dimensions?.width,
      height: dimensions?.height,
      checksumSha256: checksum,
      variantPaths: variantMetadata.map((variant) => `storage://${bucket}/${variant.object_path}`),
      access: privacy,
    };
  };
}
