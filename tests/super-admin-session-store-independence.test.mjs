import assert from 'node:assert/strict';
import net from 'node:net';
import { after, before, test } from 'node:test';
import express from 'express';
import { registerPlatformApi } from '../src/server/platformApi.ts';

const ACTOR_ID = 'c1000000-0000-4000-8000-000000000001';
const TARGET_ID = 'c1000000-0000-4000-8000-000000000002';
const CLAIMS = {
  userId: ACTOR_ID,
  supabaseUserId: ACTOR_ID,
  email: 'owner@example.test',
  role: 'admin',
  scope: 'super_admin',
  authProvider: 'google',
  issuedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
};

let server;
let baseUrl;
let savedStoreCalls = 0;

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

before(async () => {
  const app = express();
  app.use(express.json());
  registerPlatformApi(app, {
    verifySession: () => CLAIMS,
    loadStore: () => {
      throw new Error('PERSISTENCE_JSON_STORE_UNAVAILABLE_IN_PRODUCTION:marketplace');
    },
    saveStore: () => {
      savedStoreCalls += 1;
      return true;
    },
    signSession: () => 'super-admin-signed-token',
    hmacSecret: 'test-hmac-secret',
    findBlockedUser: () => null,
    verifySuperAdmin: async () => ({ id: ACTOR_ID, email: CLAIMS.email }),
    manageUserAccess: async () => ({
      id: TARGET_ID,
      email: 'target@example.test',
      role: 'admin',
      account_status: 'active',
      verified: true,
      is_super_admin: false,
    }),
  });
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = await new Promise((resolve) => {
    const listening = app.listen(port, '127.0.0.1', () => resolve(listening));
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('Super Admin session is issued from verified identity without reading the JSON store', async () => {
  const response = await fetch(`${baseUrl}/api/auth/super-admin/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-supabase-access-token': 'verified-google-access-token',
    },
    body: '{}',
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sessionToken, 'super-admin-signed-token');
});

test('Super Admin user action completes when the JSON mirror is unavailable', async () => {
  const response = await fetch(`${baseUrl}/api/super-admin/users/action`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-supabase-access-token': 'verified-google-access-token',
    },
    body: JSON.stringify({
      userId: TARGET_ID,
      action: 'promote',
      reason: 'owner-approved promotion',
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.user.role, 'admin');
  assert.equal(savedStoreCalls, 0, 'the authoritative database action must not depend on the JSON mirror');
});
