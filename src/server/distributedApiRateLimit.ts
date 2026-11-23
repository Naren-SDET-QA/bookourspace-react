import { createHmac } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import { normalizeClientAddress } from './trustProxy';

export interface DistributedRateLimitOptions {
  pool: Pick<Pool, 'query'> | null;
  hmacSecret: string;
  enabled: boolean;
}

type RateLimitPolicy = { limit: number; windowSeconds: number };

// `route` is the aggregated bucket path (`/api/auth`, `/api/bookings`, …), not
// the full request path, so these patterns must match the prefix exactly. A
// pattern requiring a trailing slash would silently fall through to the generic
// budget and the stricter limit would never be enforced.
function policyFor(route: string): RateLimitPolicy {
  // The Playwright web server owns a disposable database and sets this explicit
  // test-only budget so one browser matrix cannot poison the next SEC-02 case.
  // It is ignored in production; the production budget remains 12/minute.
  const disposableAuthBudget = Number(process.env.BOS_DISPOSABLE_TEST_AUTH_BUDGET || '0');
  if (route === '/api/auth') {
    return disposableAuthBudget > 12 && process.env.NODE_ENV !== 'production'
      ? { limit: disposableAuthBudget, windowSeconds: 60 }
      : { limit: 12, windowSeconds: 60 };
  }
  const disposableApiBudget = Number(process.env.BOS_DISPOSABLE_TEST_API_BUDGET || '0');
  if (disposableApiBudget > 0 && process.env.NODE_ENV !== 'production') {
    return { limit: disposableApiBudget, windowSeconds: 60 };
  }
  if (/^\/api\/(?:payments|refunds|bookings|seats|stays)$/.test(route)) {
    return { limit: 30, windowSeconds: 60 };
  }
  if (/^\/api\/(?:admin|super-admin)$/.test(route)) return { limit: 30, windowSeconds: 60 };
  if (route === '/api/builder') return { limit: 30, windowSeconds: 60 };
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
    const policy = policyFor(route);
    // req.ip is resolved by Express from the exact trusted-proxy hop count set
    // in configureTrustProxy(): on Cloud Run that is the one address appended
    // by the Google front end, and any client-supplied X-Forwarded-For prefix is
    // ignored. Without a trusted proxy the socket address is used, so forwarded
    // headers can neither create extra buckets nor escape the current one.
    const address = normalizeClientAddress(req.ip || req.socket?.remoteAddress);
    if (!address) {
      // A request whose client address cannot be resolved must not share an
      // 'unknown' bucket with every other caller; fail closed instead.
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ ok: false, error: 'RATE_LIMIT_SERVICE_UNAVAILABLE' });
    }
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
