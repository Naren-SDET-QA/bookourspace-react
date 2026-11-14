import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';

/**
 * Local-only harness for the provider business-context browser journey.
 *
 * It boots the app through the repository's own `scripts/dev-with-stays-db.sh`
 * against a throwaway PostgreSQL cluster on free ports, with
 * `BOS_STRICT_PERMISSION_DEFAULTS=1` and a known session-signing key, then seeds
 * three providers: one member of two businesses, one of a single business, and
 * one with no business at all.
 *
 * Nothing contacts Supabase, a cloud database or a payment provider, and the
 * scratch directory is removed only after an ownership marker is verified.
 */

const REPO_ROOT = process.cwd();
export const TEST_HMAC_SECRET = 'bos-local-provider-context-e2e-secret';

export const AUTH = {
  multi: 'ce1d2c33-3333-4333-8333-000000000001',
  single: 'ce1d2c33-3333-4333-8333-000000000002',
  zero: 'ce1d2c33-3333-4333-8333-000000000003',
  ownerA: 'ce1d2c33-3333-4333-8333-000000000011',
  ownerB: 'ce1d2c33-3333-4333-8333-000000000012',
  ownerS: 'ce1d2c33-3333-4333-8333-000000000013',
} as const;

export const BUSINESS = {
  alpha: { id: 'cdcdcdcd-1111-4111-8111-0000000000a1', name: 'Alpha PG', ref: 'CTX-ALPHA' },
  beta: { id: 'cdcdcdcd-1111-4111-8111-0000000000b1', name: 'Beta PG', ref: 'CTX-BETA' },
  solo: { id: 'cdcdcdcd-1111-4111-8111-0000000000c1', name: 'Solo PG', ref: 'CTX-SOLO' },
} as const;

export const LISTING = {
  alpha: 'Alpha PG Property',
  beta: 'Beta PG Property',
  solo: 'Solo PG Property',
} as const;

export interface ProviderContextHarness {
  url: string;
  connectionString: string;
  query: (text: string, values?: unknown[]) => Promise<any[]>;
  token: (authId: string, role?: 'provider' | 'customer' | 'admin') => string;
  authUser: (authId: string) => Record<string, unknown>;
  stop: () => Promise<void>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address() as net.AddressInfo;
      socket.close(() => resolve(port));
    });
  });
}

const EMAILS: Record<string, string> = {
  [AUTH.multi]: 'multi.business@example.test',
  [AUTH.single]: 'single.business@example.test',
  [AUTH.zero]: 'no.business@example.test',
  [AUTH.ownerA]: 'owner.alpha@example.test',
  [AUTH.ownerB]: 'owner.beta@example.test',
  [AUTH.ownerS]: 'owner.solo@example.test',
};

export function sessionToken(authId: string, role: 'provider' | 'customer' | 'admin' = 'provider'): string {
  const payload = Buffer.from(JSON.stringify({
    userId: `USR-${authId.slice(0, 8)}`,
    supabaseUserId: authId,
    email: EMAILS[authId] || `${authId}@example.test`,
    name: `Provider ${authId.slice(-1)}`,
    googleSub: `google-${authId}`,
    phone: '+91 90000 20000',
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 2 * 60 * 60_000,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', `${TEST_HMAC_SECRET}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function authUser(authId: string) {
  return {
    id: `USR-${authId.slice(0, 8)}`,
    supabaseUserId: authId,
    name: `Provider ${authId.slice(-1)}`,
    email: EMAILS[authId] || `${authId}@example.test`,
    phone: '+91 90000 20000',
    role: 'provider',
    googleSub: `google-${authId}`,
    avatarUrl: '',
    authProvider: 'google',
    verified: true,
    kycDocument: '',
    accountStatus: 'active',
    city: 'Hyderabad',
    joinedAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    listingsCount: 0,
    bookingsCount: 0,
    totalSpentOrEarned: 0,
    permissions: ['listings:write'],
    publishState: 'published',
  };
}

async function seedBusinesses(query: ProviderContextHarness['query']) {
  const insertUser = async (authId: string) => {
    await query('insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3::jsonb) on conflict (id) do nothing', [
      authId, EMAILS[authId], '{}',
    ]);
    await query("update public.profiles set role='provider', account_status='active', full_name=$2 where id=$1", [
      authId, `Provider ${authId.slice(-1)}`,
    ]);
  };
  for (const authId of Object.values(AUTH)) await insertUser(authId);

  const insertBusiness = async (id: string, ref: string, name: string, owner: string) => {
    await query(
      `insert into public.businesses (id, business_ref, name, module_type, owner_user_id, approval_status)
       values ($1,$2,$3,'pg_hostels',$4,'approved') on conflict (id) do nothing`,
      [id, ref, name, owner],
    );
  };
  await insertBusiness(BUSINESS.alpha.id, BUSINESS.alpha.ref, BUSINESS.alpha.name, AUTH.ownerA);
  await insertBusiness(BUSINESS.beta.id, BUSINESS.beta.ref, BUSINESS.beta.name, AUTH.ownerB);
  await insertBusiness(BUSINESS.solo.id, BUSINESS.solo.ref, BUSINESS.solo.name, AUTH.ownerS);

  // Multi-business provider: granted on Alpha, deliberately not granted on Beta.
  await query(
    `insert into public.business_members (business_id, user_id, role, status, accepted_at) values
       ($1,$2,'staff','active',now()), ($3,$2,'staff','active',now()), ($4,$5,'staff','active',now())
     on conflict (business_id, user_id) do nothing`,
    [BUSINESS.alpha.id, AUTH.multi, BUSINESS.beta.id, BUSINESS.solo.id, AUTH.single],
  );
  await query(
    `insert into public.business_member_access (business_id, user_id, allowed_modules, allowed_sections, allowed_actions)
     values ($1,$2,array['pg_hostels'],'{}'::jsonb,'{}'::jsonb), ($3,$4,array['pg_hostels'],'{}'::jsonb,'{}'::jsonb)
     on conflict (business_id, user_id) do nothing`,
    [BUSINESS.alpha.id, AUTH.multi, BUSINESS.solo.id, AUTH.single],
  );

  const listing = async (id: string, title: string, owner: string, businessId: string) => {
    await query(
      `insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, business_id)
       values ($1,$2,$3,'pg-hostel','PG','listing',9000,'per month','active',$4::jsonb,$5)
       on conflict (id) do nothing`,
      [id, owner, title, JSON.stringify({ description: 'Context fixture PG.', location: { city: 'Hyderabad', area: 'Madhapur' }, images: [] }), businessId],
    );
  };
  await listing('ctx-listing-alpha', LISTING.alpha, AUTH.ownerA, BUSINESS.alpha.id);
  await listing('ctx-listing-beta', LISTING.beta, AUTH.ownerB, BUSINESS.beta.id);
  await listing('ctx-listing-solo', LISTING.solo, AUTH.ownerS, BUSINESS.solo.id);
}

export async function startProviderContextHarness(): Promise<ProviderContextHarness> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-provider-context-'));
  await fs.writeFile(path.join(tempRoot, '.bos-provider-context-owned'), 'BookOurSpace provider context E2E\n');
  const markerPath = path.join(tempRoot, '.bos-provider-context-owned');
  const dataDir = path.join(tempRoot, 'db');
  const appUrlPort = await freePort();
  const dbPort = await freePort();

  const child: ChildProcess = spawn('bash', ['scripts/dev-with-stays-db.sh'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      // initdb/pg_ctl abort on macOS when the locale is unset or invalid
      // ("postmaster became multithreaded during startup").
      LC_ALL: 'en_US.UTF-8',
      LANG: 'en_US.UTF-8',
      PORT: String(appUrlPort),
      BOS_DEV_DB_PORT: String(dbPort),
      BOS_DEV_DB_DATA_DIR: dataDir,
      BOS_SERVER_HMAC_SECRET: TEST_HMAC_SECRET,
      BOS_STRICT_PERMISSION_DEFAULTS: '1',
      BOS_TEST_AUTHORITATIVE_STORE_PATH: path.join(tempRoot, 'authoritative-store.json'),
      DISABLE_HMR: 'true',
      NODE_ENV: 'development',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      RAZORPAY_WEBHOOK_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk) => { output += String(chunk); });
  child.stderr?.on('data', (chunk) => { output += String(chunk); });

  const url = `http://127.0.0.1:${appUrlPort}`;
  const connectionString = `postgres://postgres@127.0.0.1:${dbPort}/bookourspace_dev?sslmode=disable`;
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    const marker = await fs.readFile(markerPath, 'utf8').catch(() => '');
    if (!marker.startsWith('BookOurSpace provider context')) {
      throw new Error('Refusing to remove an unowned scratch directory.');
    }
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  };

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
      throw new Error(`Provider context harness exited before listening (${child.exitCode})\n${output.slice(-4000)}`);
    }
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) break;
    } catch {
      // still booting (initdb, migrations, demo seed, Vite)
    }
    await sleep(250);
  }
  if (Date.now() >= deadline) {
    await stop().catch(() => {});
    throw new Error(`Provider context harness did not become ready\n${output.slice(-4000)}`);
  }

  const pool = new Pool({ connectionString, max: 3 });
  const query = async (text: string, values?: unknown[]) => (await pool.query(text, values as any[])).rows;

  try {
    await seedBusinesses(query);
  } catch (error) {
    await pool.end().catch(() => {});
    await stop().catch(() => {});
    throw error;
  }

  return {
    url,
    connectionString,
    query,
    token: sessionToken,
    authUser,
    stop: async () => {
      await pool.end().catch(() => {});
      await stop();
    },
  };
}
