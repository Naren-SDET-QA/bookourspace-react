import type { RequestHandler } from 'express';

const DEFAULT_NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost'];
const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Authorization,Content-Type,X-Idempotency-Key,X-Supabase-Access-Token';

export function parseNativeAppOrigins(raw: string | undefined): Set<string> {
  const values = raw === undefined ? DEFAULT_NATIVE_APP_ORIGINS : raw.split(',');
  const origins = new Set<string>();
  for (const value of values) {
    const candidate = value.trim();
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.origin !== 'null' && url.origin === candidate && !url.username && !url.password && !url.search && !url.hash) {
        origins.add(candidate);
      } else if (url.origin === 'null' && /^capacitor:\/\/localhost$/.test(candidate)) {
        origins.add(candidate);
      }
    } catch {
      // Malformed entries are ignored; a malformed allowlist never expands access.
    }
  }
  return origins;
}

export function createNativeAppCorsMiddleware(origins = parseNativeAppOrigins(process.env.BOS_NATIVE_APP_ORIGINS)): RequestHandler {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();

    const requestOrigin = req.get('origin');
    if (!requestOrigin) return next();
    if (!origins.has(requestOrigin)) {
      if (req.method === 'OPTIONS') return res.status(403).end();
      return next();
    }

    res.vary('Origin');
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}
