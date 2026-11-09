import type { Express, Request, Response } from 'express';
import { verifySupabaseGoogleIdentity } from './supabaseGoogleIdentity';

type Config = { projectUrl: string; publishableKey: string; serverSecretKey: string; fetchImpl?: typeof fetch };
const headers = (key: string) => ({
  apikey: key,
  ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
  'Content-Type': 'application/json',
});

function bearer(request: Request): string {
  return String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function authTime(accessToken: string): number | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    return Number.isFinite(Number(parsed.auth_time)) ? Number(parsed.auth_time) : null;
  } catch { return null; }
}

export function registerAccountClosureApi(app: Express, config: Config): void {
  app.post('/api/account/close', async (request: Request, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (!config.projectUrl || !config.publishableKey || !config.serverSecretKey) {
      response.status(503).json({ ok: false, error: 'ACCOUNT_CLOSURE_NOT_CONFIGURED' });
      return;
    }
    const accessToken = bearer(request);
    const verified = await verifySupabaseGoogleIdentity({
      projectUrl: config.projectUrl, publishableKey: config.publishableKey, accessToken, fetchImpl: config.fetchImpl,
    }).catch(() => null);
    const issuedAt = authTime(accessToken);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!verified || issuedAt === null || issuedAt < nowSeconds - 600 || issuedAt > nowSeconds + 60) {
      response.status(401).json({ ok: false, error: 'RECENT_GOOGLE_AUTHENTICATION_REQUIRED' });
      return;
    }
    try {
      const result = await (config.fetchImpl || fetch)(`${config.projectUrl}/rest/v1/rpc/close_account_server`, {
        method: 'POST',
        headers: headers(config.serverSecretKey),
        body: JSON.stringify({
          p_owner_id: verified.id,
          p_auth_time: new Date(issuedAt * 1000).toISOString(),
          p_request_id: String(request.get('x-request-id') || '').slice(0, 128) || null,
        }),
      });
      if (!result.ok) {
        const message = await result.text().catch(() => '');
        const forbidden = /SUPER_ADMIN_CLOSURE_REQUIRES_SEPARATE_REVIEW/.test(message);
        response.status(forbidden ? 403 : 409).json({
          ok: false,
          error: forbidden ? 'SUPER_ADMIN_CLOSURE_REQUIRES_SEPARATE_REVIEW' : 'ACCOUNT_CLOSURE_REJECTED',
        });
        return;
      }
      response.status(200).json({ ok: true });
    } catch {
      response.status(503).json({ ok: false, error: 'ACCOUNT_CLOSURE_SERVICE_UNAVAILABLE' });
    }
  });
}
