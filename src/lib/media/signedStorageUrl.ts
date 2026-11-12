import { supabase, SUPABASE_PROJECT_URL } from '../supabaseClient';

export const MEDIA_URL_TTL_SECONDS = 30 * 60;
const CACHE_SAFETY_MS = 60_000;
const MAX_CACHED_URLS = 300;
const VARIANT_CACHE_MS = 5 * 60 * 1000;
const MAX_RESPONSIVE_VARIANTS = 8;
const ALLOWED_BUCKETS = new Set(['bos-public-media', 'bos-private-documents', 'bos-private-profile-media']);
const INVALID_STORAGE_PATH_CHARACTER = /[?#\\/\u0000-\u001f\u007f]/;

// These hosts are used only by disposable database/security fixtures. They
// are intentionally non-routable and must never be requested by a browser.
// Listing media continues through the normal HTTPS or signed Storage path
// below; this is not a general URL allow/deny list.
const UNAVAILABLE_DEMO_IMAGE_HOSTS = new Set([
  'images.example.com',
  'cdn.example.test',
  'media.example.test',
]);

// Storage paths created only by the disposable E2E/security fixtures. A real
// provider upload always starts with the owner's UUID, never these markers.
const FIXTURE_STORAGE_PATH = /(^|\/)mock(\/|$)|^11111111-2222-4333-8444-555555555555\//i;

export function isKnownUnavailableDemoImageSource(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const base = typeof window === 'undefined' ? 'http://localhost/' : window.location.origin;
    const url = new URL(value.trim(), base);
    return url.protocol === 'https:' && UNAVAILABLE_DEMO_IMAGE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface StorageObjectReference {
  bucket: 'bos-public-media' | 'bos-private-documents' | 'bos-private-profile-media';
  path: string;
}

function decodeStoragePath(rawPath: string): string | null {
  const rawSegments = rawPath.split('/');
  if (!rawSegments.length || rawSegments.some((segment) => !segment)) return null;
  try {
    const segments = rawSegments.map((segment) => decodeURIComponent(segment));
    if (segments.some((segment) => segment === '.' || segment === '..' || INVALID_STORAGE_PATH_CHARACTER.test(segment))) return null;
    const path = segments.join('/');
    return path.length > 512 ? null : path;
  } catch {
    return null;
  }

}

function canonicalStorageReference(bucketValue: string, rawPath: string): string | null {
  let bucket: string;
  try {
    bucket = decodeURIComponent(bucketValue).toLowerCase();
  } catch {
    return null;
  }
  if (!ALLOWED_BUCKETS.has(bucket)) return null;
  const path = decodeStoragePath(rawPath);
  if (!path) return null;
  return `storage://${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Canonical persisted form: storage://<approved-bucket>/<object-path>. */
export function parseStorageObjectReference(value: string): StorageObjectReference | null {
  const match = /^storage:\/\/([^/]+)\/(.+)$/.exec(value);
  if (!match) return null;
  const canonical = canonicalStorageReference(match[1], match[2]);
  if (!canonical) return null;
  const canonicalMatch = /^storage:\/\/([^/]+)\/(.+)$/.exec(canonical);
  if (!canonicalMatch) return null;
  return {
    bucket: canonicalMatch[1] as StorageObjectReference['bucket'],
    path: canonicalMatch[2].split('/').map((segment) => decodeURIComponent(segment)).join('/'),
  };
}

/** Identifies a Supabase Storage object URL without trusting its host. */
export function isSupabaseStorageSource(value: string): boolean {
  if (value.startsWith('storage://')) return parseStorageObjectReference(value) !== null;
  try {
    const url = value.startsWith('/')
      ? new URL(value, SUPABASE_PROJECT_URL)
      : new URL(value);
    return /\/storage\/v1\/object\/(?:public|sign|authenticated|[^/]+)\//.test(url.pathname);
  } catch {
    return false;
  }
}

export function storageReferenceForSource(value: string, projectUrl = SUPABASE_PROJECT_URL): string | null {
  if (value.startsWith('storage://')) {
    const match = /^storage:\/\/([^/]+)\/(.+)$/.exec(value);
    return match ? canonicalStorageReference(match[1], match[2]) : null;
  }
  let url: URL;
  let configuredOrigin: string;
  try {
    configuredOrigin = new URL(projectUrl).origin;
    url = new URL(value, configuredOrigin);
  } catch {
    return null;
  }
  if (!configuredOrigin || url.origin !== configuredOrigin) return null;
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/)
    || url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return canonicalStorageReference(match[1], match[2]);
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

function storageBucketFromPathOrRef(value: string): string {
  const reference = storageReferenceForSource(value);
  if (reference) return parseStorageObjectReference(reference)?.bucket || '';
  if (value.startsWith('storage://')) return '';
  try {
    const url = value.startsWith('/') ? new URL(value, 'https://storage.invalid') : new URL(value);
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\//i)
      || url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\//i);
    return match ? decodeURIComponent(match[1]).toLowerCase() : '';
  } catch {
    return '';
  }
}

/** A private-bucket reference is only renderable by its authorized owner. */
export function isPrivateStorageSource(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const bucket = storageBucketFromPathOrRef(value.trim());
  return bucket === 'bos-private-profile-media' || bucket === 'bos-private-documents';
}

/**
 * A profile image value that may be handed to *another* user's browser.
 * Private profile media is owner-only by policy, so its object path must never
 * reach a public projection: callers get an empty string and render initials
 * instead of a permanently broken `<img>`.
 */
export function publicProfileImageSource(value: unknown): string {
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (!source) return '';
  if (source.startsWith('storage://')) {
    return parseStorageObjectReference(source)?.bucket === 'bos-public-media' ? source : '';
  }
  if (source.startsWith('/storage/v1/object/')) {
    return isPublicImageStorageSource(source) ? source : '';
  }
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return '';
    if (/^\/storage\/v1\/object\//i.test(url.pathname)) {
      return storageBucketFromPathOrRef(source) === 'bos-public-media' && isPublicImageStorageSource(source)
        ? source
        : '';
    }
    return source;
  } catch {
    return '';
  }
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
  if (source.startsWith('/storage/v1/object/')) {
    return isPublicImageStorageSource(source);
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

/**
 * True when a listing image is not one of the disposable fixture sources.
 * The marketplace feed uses this to keep mock/example records out of the
 * customer-visible cards instead of rendering a dummy fallback for them.
 */
export function isUsableListingImageSource(value: unknown): value is string {
  if (!isRenderableListingImageSource(value)) return false;
  if (isKnownUnavailableDemoImageSource(value)) return false;
  if (value.startsWith('/assets/fallbacks/')) return false;
  if (value.startsWith('storage://')) {
    const reference = storageReferenceForSource(value);
    const parsed = reference ? parseStorageObjectReference(reference) : null;
    if (!parsed || FIXTURE_STORAGE_PATH.test(parsed.path)) return false;
  }
  return true;
}

/** The first image a card can actually request, or undefined when only fixture media exists. */
export function firstUsableListingImage(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  return images.find((image) => isUsableListingImageSource(image));
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

type PrivateSignFallback = (reference: string) => Promise<string | null>;

/** Per-runtime cache and in-flight request deduplication; never persists signed URLs. */
export function createSignedStorageUrlResolver(
  storage: SignedUrlStorage,
  now: () => number = Date.now,
  privateSignFallback?: PrivateSignFallback,
) {
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
    const isPrivateBucket = parsed.bucket === 'bos-private-profile-media' || parsed.bucket === 'bos-private-documents';
    const request = storage.from(parsed.bucket).createSignedUrl(parsed.path, MEDIA_URL_TTL_SECONDS)
      .then(async ({ data, error }) => {
        let signedUrl = !error && data?.signedUrl ? data.signedUrl : '';
        if (!signedUrl && isPrivateBucket && privateSignFallback) {
          signedUrl = (await privateSignFallback(reference).catch(() => null)) || '';
        }
        if (!signedUrl) throw new Error('MEDIA_SIGNED_URL_UNAVAILABLE');
        cache.delete(key);
        cache.set(key, { url: signedUrl, expiresAt: now() + MEDIA_URL_TTL_SECONDS * 1000 });
        if (cache.size > MAX_CACHED_URLS) {
          const oldestKey = cache.keys().next().value as string | undefined;
          if (oldestKey) cache.delete(oldestKey);
        }
        return signedUrl;
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

async function requestServerPrivateSignedUrl(reference: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  let token = '';
  try {
    token = window.localStorage.getItem('bos_session_token_v1') || '';
  } catch {
    return null;
  }
  if (!token) return null;
  try {
    const response = await fetch('/api/media/private-sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bos-session-token': token,
      },
      body: JSON.stringify({ reference }),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    return typeof body?.signedUrl === 'string' && body.signedUrl ? body.signedUrl : null;
  } catch {
    return null;
  }
}

const resolveSignedStorageUrl = supabase
  ? createSignedStorageUrlResolver(supabase.storage, Date.now, requestServerPrivateSignedUrl)
  : null;

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
  privateSignFallback?: PrivateSignFallback,
) {
  const resolve = createSignedStorageUrlResolver(storage, now, privateSignFallback);
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
  ? createResponsiveMediaResolver(supabase.storage, lookupReadyImageVariants, Date.now, requestServerPrivateSignedUrl)
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
