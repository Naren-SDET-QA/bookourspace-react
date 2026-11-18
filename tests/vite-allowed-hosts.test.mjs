import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createServer as createViteServer } from 'vite';
import {
  CLOUDFLARE_QUICK_TUNNEL_HOST,
  VITE_ALLOWED_HOSTS,
  hasLeadingDotHostWildcard,
  isUnrestrictedViteAllowedHosts,
} from '../src/server/viteAllowedHosts.ts';

const VITE_CONFIG_SOURCE = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const SERVER_SOURCE = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const CURRENT_LOCATION_SOURCE = readFileSync(new URL('../src/lib/currentLocation.ts', import.meta.url), 'utf8');
const DEVICE_LOCATION_SOURCE = readFileSync(new URL('../src/hooks/useDeviceLocation.ts', import.meta.url), 'utf8');

function requestWithHost(port, host, path = '/') {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: { Host: host, Accept: 'text/html' },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function withViteAllowedHosts(allowedHosts, run) {
  const vite = await createViteServer({
    configFile: false,
    logLevel: 'silent',
    server: {
      middlewareMode: true,
      allowedHosts,
      hmr: false,
      watch: null,
    },
    appType: 'custom',
  });
  const httpServer = createServer((req, res) => {
    vite.middlewares(req, res, () => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('bookourspace-ok');
    });
  });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await run(port);
  } finally {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
    await vite.close();
  }
}

test('Vite extra allowed hosts are the exact Cloudflare Quick Tunnel hostname only', () => {
  assert.equal(CLOUDFLARE_QUICK_TUNNEL_HOST, 'propecia-currencies-dublin-attacks.trycloudflare.com');
  assert.deepEqual([...VITE_ALLOWED_HOSTS], [CLOUDFLARE_QUICK_TUNNEL_HOST]);
  assert.equal(isUnrestrictedViteAllowedHosts(VITE_ALLOWED_HOSTS), false);
  assert.equal(hasLeadingDotHostWildcard(VITE_ALLOWED_HOSTS), false);
  assert.equal(VITE_ALLOWED_HOSTS.includes('.trycloudflare.com'), false);
});

test('vite.config.ts and Express Vite middleware use the exact allowlist', () => {
  assert.match(VITE_CONFIG_SOURCE, /from '\.\/src\/server\/viteAllowedHosts'/);
  assert.match(VITE_CONFIG_SOURCE, /allowedHosts:\s*\[\.\.\.VITE_ALLOWED_HOSTS\]/);
  assert.equal(/allowedHosts:\s*true/.test(VITE_CONFIG_SOURCE), false);
  assert.equal(VITE_CONFIG_SOURCE.includes('.trycloudflare.com'), false);

  assert.match(SERVER_SOURCE, /from '\.\/src\/server\/viteAllowedHosts'/);
  assert.match(SERVER_SOURCE, /allowedHosts:\s*\[\.\.\.VITE_ALLOWED_HOSTS\]/);
  assert.equal(/allowedHosts:\s*true/.test(SERVER_SOURCE), false);
  assert.equal(SERVER_SOURCE.includes('allowedHosts: true'), false);
});

test('Vite host check blocks the Cloudflare tunnel hostname until it is allowlisted', async () => {
  await withViteAllowedHosts([], async (port) => {
    const blocked = await requestWithHost(port, CLOUDFLARE_QUICK_TUNNEL_HOST);
    assert.equal(blocked.status, 403);
    assert.match(blocked.body, /Blocked request/);
    assert.match(blocked.body, /not allowed/);
  });
});

test('Vite host check allows the exact Cloudflare hostname, localhost, and LAN IPs', async () => {
  await withViteAllowedHosts([...VITE_ALLOWED_HOSTS], async (port) => {
    const tunnel = await requestWithHost(port, CLOUDFLARE_QUICK_TUNNEL_HOST);
    assert.equal(tunnel.status, 200);
    assert.equal(tunnel.body, 'bookourspace-ok');
    assert.equal(/Blocked request/.test(tunnel.body), false);

    const localhost = await requestWithHost(port, 'localhost');
    assert.equal(localhost.status, 200);
    assert.equal(localhost.body, 'bookourspace-ok');

    const loopback = await requestWithHost(port, '127.0.0.1');
    assert.equal(loopback.status, 200);

    const lan = await requestWithHost(port, '192.168.31.56');
    assert.equal(lan.status, 200);
    assert.equal(lan.body, 'bookourspace-ok');
  });
});

test('Vite host check still rejects other Cloudflare and foreign hostnames', async () => {
  await withViteAllowedHosts([...VITE_ALLOWED_HOSTS], async (port) => {
    const otherTunnel = await requestWithHost(port, 'other-random-words.trycloudflare.com');
    assert.equal(otherTunnel.status, 403);
    assert.match(otherTunnel.body, /Blocked request/);

    const foreign = await requestWithHost(port, 'evil.example');
    assert.equal(foreign.status, 403);
    assert.match(foreign.body, /Blocked request/);
  });
});

test('HTTPS tunnel origin is a secure context and geolocation remains same-origin', () => {
  assert.equal(new URL(`https://${CLOUDFLARE_QUICK_TUNNEL_HOST}/`).protocol, 'https:');
  assert.match(SERVER_SOURCE, /Permissions-Policy.*geolocation=\(self\)/);
  assert.match(CURRENT_LOCATION_SOURCE, /window\.isSecureContext/);
  assert.match(DEVICE_LOCATION_SOURCE, /window\.isSecureContext/);
});
