import type { RequestHandler } from 'express';
import { assertLocalHttpUrl } from '../lib/localDemoSafety';

export function localDemoMiddleware(endpoint: string): RequestHandler {
  const url = assertLocalHttpUrl(endpoint);
  return (req, res, next) => {
    // Local catalog may not load remote fonts, maps, OAuth, analytics or payment scripts.
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${url} ${url.replace('http:', 'ws:')}; frame-src 'none'; form-action 'self'; object-src 'none'; base-uri 'self'`);
    if (req.path === '/api/local-demo/status') {
      res.json({ ok: true, mode: 'local-demo', databaseEndpoint: url, paymentsEnabled: false });
      return;
    }
    const movieRead = req.method === 'GET' && ['/api/public/movies', '/api/movies/inventory'].includes(req.path);
    const movieAdmin = req.path.startsWith('/api/admin/movies/');
    if (req.path.startsWith('/api/') && !movieRead && !movieAdmin) {
      res.status(503).json({ ok: false, error: 'LOCAL_DEMO_FLOW_UNAVAILABLE', message: 'This legacy flow is not connected to the isolated Supabase demo. No external action or payment was performed.' });
      return;
    }
    if (req.path.startsWith('/auth/')) {
      res.status(403).send('External authentication is disabled in local catalog mode.');
      return;
    }
    next();
  };
}
