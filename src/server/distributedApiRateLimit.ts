import { createHmac } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';

export interface DistributedRateLimitOptions {
  pool: Pick<Pool, 'query'> | null;
  hmacSecret: string;
  enabled: boolean;
}

type RateLimitPolicy = { limit: number; windowSeconds: number };

function policyFor(method: string, pathname: string): RateLimitPolicy {
  if (/^\/api\/auth\//.test(pathname)) return { limit: 12, windowSeconds: 60 };
  if (/^\/api\/(?:payments|refunds|bookings|stays\/(?:holds|checkout)|seats\/hold)/.test(pathname)) {
    return { limit: 30, windowSeconds: 60 };
  }
  if (/^\/api\/(?:admin|super-admin)\//.test(pathname)) return { limit: 30, windowSeconds: 60 };
  if (/^\/api\/builder\//.test(pathname)) return { limit: 30, windowSeconds: 60 };
  return { limit: 120, windowSeconds: 60 };
}

function bucketPath(pathname: string): string {
  // Aggregate at the API resource level so user-controlled IDs/tokens cannot
  // create unlimited buckets to evade the limiter or grow its table.
  return pathname.split('/').slice(0, 3).join('/').slice(0, 128);
}

export function createDistributedApiRateLimitMiddleware(options: DistributedRateLimitOptions) {
  return async function distributedApiRateLimit(req: Request, res: Response, next: NextFunction) {
    if (!options.enabled || !req.path.startsWith('/api/')) return next();
    if (['OPTIONS', 'HEAD'].includes(req.method.toUpperCase())) return next();

    if (!options.pool || options.hmacSecret.length < 32) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ ok: false, error: 'RATE_LIMIT_SERVICE_UNAVAILABLE' });
    }

    const route = bucketPath(req.path);
    const policy = policyFor(req.method.toUpperCase(), route);
    // req.ip uses the socket address unless Express trust proxy is explicitly
    // configured. Deployments behind a proxy must set trust proxy to exact
    // trusted hops; this code does not trust arbitrary X-Forwarded-For values.
    const address = String(req.ip || req.socket.remoteAddress || 'unknown');
    const bucketHash = createHmac('sha256', options.hmacSecret)
      .update(`${address}\0${req.method.toUpperCase()}\0${route}`)
      .digest('hex');

    try {
      const result = await options.pool.query<{ allowed: boolean; retry_after_seconds: number; remaining: number }>(
        'select allowed, retry_after_seconds, remaining from private.consume_api_rate_limit($1, $2, $3)',
        [bucketHash, policy.limit, policy.windowSeconds],
      );
      const row = result.rows[0];
      if (!row || typeof row.allowed !== 'boolean') throw new Error('RATE_LIMIT_RESULT_INVALID');
      res.setHeader('RateLimit-Limit', String(policy.limit));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, row.remaining)));
      res.setHeader('Cache-Control', 'no-store');
      if (!row.allowed) {
        const retryAfter = Math.max(1, Math.min(86400, Number(row.retry_after_seconds) || 1));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ ok: false, error: 'RATE_LIMITED', retryAfterSeconds: retryAfter });
      }
      return next();
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ ok: false, error: 'RATE_LIMIT_SERVICE_UNAVAILABLE' });
    }
  };
}
