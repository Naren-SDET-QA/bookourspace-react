import { supabase, SUPABASE_PROJECT_URL } from '../supabaseClient';

export const MEDIA_URL_TTL_SECONDS = 30 * 60;
const CACHE_SAFETY_MS = 60_000;
const MAX_CACHED_URLS = 300;
const VARIANT_CACHE_MS = 5 * 60 * 1000;
const MAX_RESPONSIVE_VARIANTS = 8;
const ALLOWED_BUCKETS = new Set(['bos-public-media', 'bos-private-documents', 'bos-private-profile-media']);

export interface StorageObjectReference {
  bucket: 'bos-public-media' | 'bos-private-documents' | 'bos-private-profile-media';
  path: string;
}

/** Canonical persisted form: storage://<approved-bucket>/<object-path>. */
export function parseStorageObjectReference(value: string): StorageObjectReference | null {
  const match = /^storage:\/\/([^/]+)\/(.+)$/.exec(value);
  if (!match) return null;
  try {
    const bucket = match[1].toLowerCase();
    if (!ALLOWED_BUCKETS.has(bucket) || /[?#\\\u0000-\u001f\u007f]/.test(match[2])) return null;
    const rawSegments = match[2].split('/');
    if (!rawSegments.length || rawSegments.some((segment) => !segment)) return null;
    const segments = rawSegments.map((segment) => decodeURIComponent(segment));
    if (segments.some((segment) => segment === '.' || segment === '..' || /[\\/\u0000-\u001f\u007f]/.test(segment))) return null;
    const path = segments.join('/');
    if (path.length > 512) return null;
    return { bucket: bucket as StorageObjectReference['bucket'], path };
  } catch {
    return null;
  }
}

/** Identifies a Supabase Storage object URL without trusting its host. */
export function isSupabaseStorageSource(value: string): boolean {
  if (value.startsWith('storage://')) return true;
  try {
    return /\/storage\/v1\/object\/(?:public|sign|authenticated)\//.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function storageReferenceForSource(value: string): string | null {
  if (value.startsWith('storage://')) return parseStorageObjectReference(value) ? value : null;
  let url: URL;
  let configuredOrigin: string;
  try {
    url = new URL(value);
    configuredOrigin = new URL(SUPABASE_PROJECT_URL).origin;
  } catch {
    return null;
  }
  if (!configuredOrigin || url.origin !== configuredOrigin) return null;
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  try {
    const bucket = decodeURIComponent(match[1]);
    const path = match[2].split('/').map((segment) => decodeURIComponent(segment)).join('/');
    const reference = `storage://${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
    return parseStorageObjectReference(reference) ? reference : null;
  } catch {
    return null;
  }
}

/** Only the listing-media bucket is valid in an image element. */
export function isPublicImageStorageSource(value: string): boolean {
  const reference = storageReferenceForSource(value);
  return reference ? parseStorageObjectReference(reference)?.bucket === 'bos-public-media' : false;
}

export function isProfileImageStorageSource(value: string): boolean {
  const reference = storageReferenceForSource(value);
  return reference ? parseStorageObjectReference(reference)?.bucket === 'bos-private-profile-media' : false;
}

const LOCAL_LISTING_ASSET = /^\/assets\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** Public listing photos: original HTTPS images, local assets, and ready public Storage refs. */
export function isRenderableListingImageSource(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const source = value.trim();
  if (!source || source !== value) return false;
  if (LOCAL_LISTING_ASSET.test(source) && !source.includes('..')) return true;
  if (source.startsWith('storage://')) {
    return parseStorageObjectReference(source)?.bucket === 'bos-public-media';
  }
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return false;
    if (/\/storage\/v1\/object\//.test(url.pathname)) return isPublicImageStorageSource(source);
    return true;
  } catch {
    return false;
  }
}

/** Values that may be stored on a listing. Signed Storage URLs expire and are not persisted. */
export function isPersistableListingImageSource(value: unknown): value is string {
  if (!isRenderableListingImageSource(value)) return false;
  if (value.startsWith('storage://') || value.startsWith('/assets/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !/\/storage\/v1\/object\//.test(url.pathname);
  } catch {
    return false;
  }
}

function imageCandidateFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    const source = value.trim();
    return isRenderableListingImageSource(source) ? source : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return (
    imageCandidateFromUnknown(record.url)
    || imageCandidateFromUnknown(record.src)
    || imageCandidateFromUnknown(record.image)
    || imageCandidateFromUnknown(record.href)
    || imageCandidateFromUnknown(record.objectPath)
  );
}

/**
 * Collects customer-visible listing photos from the shapes the feed, payload
 * and live-edit forms actually store: string arrays, `{url}` objects, and
 * single `imageUrl` / cover fields.
 */
export function listingImageSources(...bags: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const entry of value) push(entry);
      return;
    }
    const src = imageCandidateFromUnknown(value);
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push(src);
  };
  for (const bag of bags) {
    if (bag == null) continue;
    if (typeof bag === 'string' || Array.isArray(bag)) {
      push(bag);
      continue;
    }
    if (typeof bag === 'object') {
      const record = bag as Record<string, unknown>;
      push(record.images);
      push(record.photos);
      push(record.photo);
      push(record.image);
      push(record.imageUrl);
      push(record.coverImage);
      push(record.cover);
    }
  }
  return out;
}

type SignedUrlStorage = {
  from: (bucket: string) => { createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: Error | null }> };
};

/** Per-runtime cache and in-flight request deduplication; never persists signed URLs. */
export function createSignedStorageUrlResolver(storage: SignedUrlStorage, now: () => number = Date.now) {
  const cache = new Map<string, { url: string; expiresAt: number }>();
  const pending = new Map<string, Promise<string>>();

  const resolve = async (reference: string, forceRefresh = false): Promise<string> => {
    const parsed = parseStorageObjectReference(reference);
    if (!parsed) throw new Error('INVALID_MEDIA_STORAGE_REFERENCE');
    const key = `${parsed.bucket}/${parsed.path}`;
    const cached = cache.get(key);
    if (!forceRefresh && cached && cached.expiresAt - CACHE_SAFETY_MS > now()) return cached.url;
    if (forceRefresh) cache.delete(key);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = storage.from(parsed.bucket).createSignedUrl(parsed.path, MEDIA_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) throw new Error('MEDIA_SIGNED_URL_UNAVAILABLE');
        cache.delete(key);
        cache.set(key, { url: data.signedUrl, expiresAt: now() + MEDIA_URL_TTL_SECONDS * 1000 });
        if (cache.size > MAX_CACHED_URLS) {
          const oldestKey = cache.keys().next().value as string | undefined;
          if (oldestKey) cache.delete(oldestKey);
        }
        return data.signedUrl;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };

  resolve.clear = (reference?: string) => {
    if (!reference) { cache.clear(); return; }
    const parsed = parseStorageObjectReference(reference);
    if (parsed) cache.delete(`${parsed.bucket}/${parsed.path}`);
  };
  return resolve;
}

const resolveSignedStorageUrl = supabase ? createSignedStorageUrlResolver(supabase.storage) : null;

export interface ResponsiveMediaSource {
  src: string;
  srcSet?: string;
}

interface MediaVariantDescriptor {
  path: string;
  width: number;
}

type VariantLookup = (bucket: string, objectPath: string) => Promise<unknown[]>;

function normalizeVariantDescriptors(
  rows: unknown[],
  bucket: string,
  originalPath: string,
): MediaVariantDescriptor[] {
  const seen = new Set<string>();
  const variants: MediaVariantDescriptor[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const candidate = row as { object_path?: unknown; width?: unknown };
    const path = typeof candidate.object_path === 'string' ? candidate.object_path : '';
    const width = Number(candidate.width);
    if (!path || path === originalPath || path.length > 512) continue;
    if (!Number.isInteger(width) || width < 1 || width > 10000) continue;
    if (path.split('/').some((segment) => !segment || segment === '.' || segment === '..' || /[\\\u0000-\u001f\u007f]/.test(segment))) continue;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    if (!parseStorageObjectReference(`storage://${bucket}/${encodedPath}`)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    variants.push({ path, width });
  }
  return variants
    .sort((left, right) => left.width - right.width || left.path.localeCompare(right.path))
    .slice(0, MAX_RESPONSIVE_VARIANTS);
}

/**
 * Resolves a signed original plus signed responsive candidates. Variant paths
 * come from the ready media row; the caller never supplies arbitrary paths.
 */
export function createResponsiveMediaResolver(
  storage: SignedUrlStorage,
  lookupVariants: VariantLookup,
  now: () => number = Date.now,
) {
  const resolve = createSignedStorageUrlResolver(storage, now);
  const variantCache = new Map<string, { variants: MediaVariantDescriptor[]; expiresAt: number }>();
  const variantPending = new Map<string, Promise<MediaVariantDescriptor[]>>();

  const loadVariants = async (bucket: string, objectPath: string, forceRefresh: boolean) => {
    const key = `${bucket}/${objectPath}`;
    const cached = variantCache.get(key);
    if (!forceRefresh && cached && cached.expiresAt > now()) return cached.variants;
    if (forceRefresh) variantCache.delete(key);
    const existing = variantPending.get(key);
    if (existing) return existing;
    const request = lookupVariants(bucket, objectPath)
      .then((rows) => normalizeVariantDescriptors(rows, bucket, objectPath))
      .catch(() => [])
      .then((variants) => {
        variantCache.set(key, { variants, expiresAt: now() + VARIANT_CACHE_MS });
        return variants;
      })
      .finally(() => variantPending.delete(key));
    variantPending.set(key, request);
    return request;
  };

  const resolveResponsive = async (reference: string, forceRefresh = false): Promise<ResponsiveMediaSource> => {
    const parsed = parseStorageObjectReference(reference);
    if (!parsed) throw new Error('INVALID_MEDIA_STORAGE_REFERENCE');
    const src = await resolve(reference, forceRefresh);
    if (parsed.bucket !== 'bos-public-media') return { src };
    const variants = await loadVariants(parsed.bucket, parsed.path, forceRefresh);
    if (!variants.length) return { src };
    const candidates = await Promise.allSettled(
      variants.map(async (variant) => {
        const encodedPath = variant.path.split('/').map(encodeURIComponent).join('/');
        const url = await resolve(`storage://${parsed.bucket}/${encodedPath}`, forceRefresh);
        return `${url} ${variant.width}w`;
      }),
    );
    const srcSet = candidates
      .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
      .map((result) => result.value)
      .join(', ');
    return srcSet ? { src, srcSet } : { src };
  };

  resolveResponsive.clear = (reference?: string) => {
    resolve.clear(reference);
    if (!reference) {
      variantCache.clear();
      return;
    }
    const parsed = parseStorageObjectReference(reference);
    if (parsed) variantCache.delete(`${parsed.bucket}/${parsed.path}`);
  };
  return resolveResponsive;
}

async function lookupReadyImageVariants(bucket: string, objectPath: string): Promise<unknown[]> {
  if (!supabase || bucket !== 'bos-public-media') return [];
  const { data, error } = await supabase
    .from('media_assets')
    .select('variants')
    .eq('bucket_id', bucket)
    .eq('object_path', objectPath)
    .eq('privacy', 'public')
    .eq('processing_status', 'ready')
    .maybeSingle();
  if (error || !data || !Array.isArray(data.variants)) return [];
  return data.variants;
}

const resolveResponsiveMedia = supabase
  ? createResponsiveMediaResolver(supabase.storage, lookupReadyImageVariants)
  : null;

export async function resolveMediaSource(source: string, forceRefresh = false): Promise<string> {
  if (!isSupabaseStorageSource(source)) return source;
  if (!resolveSignedStorageUrl) throw new Error('SUPABASE_STORAGE_NOT_CONFIGURED');
  const reference = storageReferenceForSource(source);
  if (!reference) throw new Error('UNTRUSTED_MEDIA_STORAGE_ORIGIN');
  return resolveSignedStorageUrl(reference, forceRefresh);
}

export async function resolveResponsiveMediaSource(
  source: string,
  forceRefresh = false,
): Promise<ResponsiveMediaSource> {
  if (!isSupabaseStorageSource(source)) return { src: source };
  if (!resolveResponsiveMedia) throw new Error('SUPABASE_STORAGE_NOT_CONFIGURED');
  const reference = storageReferenceForSource(source);
  if (!reference) throw new Error('UNTRUSTED_MEDIA_STORAGE_ORIGIN');
  return resolveResponsiveMedia(reference, forceRefresh);
}

export function invalidateMediaSource(source: string): void {
  const reference = storageReferenceForSource(source);
  if (!reference) return;
  resolveSignedStorageUrl?.clear(reference);
  resolveResponsiveMedia?.clear(reference);
}
