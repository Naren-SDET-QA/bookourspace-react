#!/usr/bin/env node
/**
 * A local stand-in for Supabase Auth, used only by the offline OAuth suite.
 *
 * It serves the two endpoints the application actually calls:
 *   GET  /auth/v1/user      -> the identity currently selected by the test
 *   GET  /auth/v1/settings  -> the enabled providers
 * and a localhost-only control endpoint:
 *   POST /__control         -> choose the identity the next /user call returns
 *
 * It never talks to Supabase, Google or the network. It exists so the OAuth
 * path (Google-only identity, verified e-mail, automatic customer creation,
 * role authority) can be proven without a real sign-in.
 */

import http from 'node:http';

const PORT = Number(process.env.FAKE_SUPABASE_AUTH_PORT || 0);

/** The identity the next /auth/v1/user call returns. */
let current = {
  id: '',
  email: '',
  email_confirmed_at: null,
  app_metadata: {},
  identities: [],
  user_metadata: {},
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const json = (status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
    res.end(payload);
  };

  if (url.pathname === '/__control' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        current = JSON.parse(body || '{}');
        json(200, { ok: true });
      } catch {
        json(400, { ok: false, error: 'INVALID_CONTROL_BODY' });
      }
    });
    return;
  }

  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    if (!current.id) {
      json(401, { message: 'invalid claim: missing sub claim' });
      return;
    }
    json(200, current);
    return;
  }

  if (url.pathname === '/auth/v1/settings' && req.method === 'GET') {
    json(200, { external: { google: true, email: true }, disable_signup: false });
    return;
  }

  json(404, { message: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(`FAKE_SUPABASE_AUTH_PORT=${address.port}\n`);
});
