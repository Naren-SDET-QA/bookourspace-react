import type { Express, Request, Response } from 'express';
import type { Pool } from 'pg';
import {
  isPrivateStorageSource,
  parseStorageObjectReference,
  storageReferenceForSource,
} from '../lib/media/signedStorageUrl';

export interface PrivateMediaSignActor {
  userId?: string;
  supabaseUserId?: string;
  role?: string;
}

export interface PrivateMediaSignConfig {
  projectUrl: string;
  serverSecretKey: string;
  verifySession: (request: Request) => PrivateMediaSignActor | null;
  pool?: Pool | null;
  fetchImpl?: typeof fetch;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL_SECONDS = 3600;

function serviceHeaders(key: string) {
  return {
    apikey: key,
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function ownerCandidatesForActor(actor: PrivateMediaSignActor): string[] {
  return [actor.supabaseUserId, actor.userId]
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter((value) => UUID.test(value));
}

async function isActiveAdmin(pool: Pool | null | undefined, actor: PrivateMediaSignActor): Promise<boolean> {
  if (actor.role !== 'admin') return false;
  const ids = ownerCandidatesForActor(actor);
  if (!pool || ids.length === 0) return false;
  try {
    const result = await pool.query(
      `select 1 from public.profiles where id = any($1::uuid[]) and role = 'admin' and account_status = 'active' limit 1`,
      [ids],
    );
    return (result.rowCount || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Issues short-lived Storage signed URLs for private owner profile imagery and
 * verification documents only after verifying the caller's signed session and
 * folder ownership (or active Super Admin access for KYC verification docs).
 */
export function registerPrivateMediaSignApi(app: Express, config: PrivateMediaSignConfig): void {
  app.post('/api/media/private-sign', async (request: Request, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    const actor = config.verifySession(request);
    if (!actor) {
      response.status(401).json({ ok: false, error: 'VERIFIED_SESSION_REQUIRED' });
      return;
    }

    const rawSource = String((request.body as any)?.reference || '').trim();
    const canonical = isPrivateStorageSource(rawSource)
      ? storageReferenceForSource(rawSource, config.projectUrl || undefined)
      : null;
    const parsed = canonical ? parseStorageObjectReference(canonical) : null;
    if (!parsed || (parsed.bucket !== 'bos-private-profile-media' && parsed.bucket !== 'bos-private-documents')) {
      response.status(400).json({ ok: false, error: 'INVALID_PRIVATE_MEDIA_REFERENCE' });
      return;
    }

    const pathOwner = parsed.path.split('/')[0]?.trim().toLowerCase() || '';
    const owners = ownerCandidatesForActor(actor);
    const ownsObject = Boolean(pathOwner && owners.includes(pathOwner));
    const adminAllowed = parsed.bucket === 'bos-private-documents' && await isActiveAdmin(config.pool, actor);
    if (!ownsObject && !adminAllowed) {
      response.status(403).json({ ok: false, error: 'PRIVATE_MEDIA_FORBIDDEN' });
      return;
    }

    if (!config.projectUrl || !config.serverSecretKey) {
      response.status(503).json({ ok: false, error: 'PRIVATE_MEDIA_SIGNING_UNAVAILABLE' });
      return;
    }

    const safePath = parsed.path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    const signEndpoint = `${config.projectUrl.replace(/\/+$/, '')}/storage/v1/object/sign/${encodeURIComponent(parsed.bucket)}/${safePath}`;
    try {
      const signResponse = await (config.fetchImpl || fetch)(signEndpoint, {
        method: 'POST',
        headers: serviceHeaders(config.serverSecretKey),
        body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
      });
      const payload = await signResponse.json().catch(() => ({} as Record<string, unknown>));
      const rawSigned = typeof payload?.signedURL === 'string'
        ? payload.signedURL
        : typeof payload?.signedUrl === 'string'
          ? payload.signedUrl
          : '';
      if (!signResponse.ok || !rawSigned) {
        response.status(signResponse.status >= 400 && signResponse.status < 500 ? signResponse.status : 502)
          .json({ ok: false, error: 'MEDIA_SIGNED_URL_UNAVAILABLE' });
        return;
      }
      const signedUrl = rawSigned.startsWith('/')
        ? new URL(`/storage/v1${rawSigned.startsWith('/storage/v1') ? rawSigned.slice('/storage/v1'.length) : rawSigned}`, config.projectUrl).toString()
        : new URL(rawSigned, config.projectUrl).toString();
      response.status(200).json({ ok: true, signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
    } catch {
      response.status(502).json({ ok: false, error: 'MEDIA_SIGNED_URL_UNAVAILABLE' });
    }
  });
}

