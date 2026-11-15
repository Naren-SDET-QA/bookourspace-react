import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { Server } from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { Pool } from 'pg';

/**
 * Local-only harness for the Hotels & Stays browser journey.
 *
 * It creates a throwaway PostgreSQL cluster in a private temp directory,
 * applies the repository baseline + every migration, seeds local test
 * identities and one stay with published room inventory, then runs the real
 * Express server and serves the built UI.
 *
 * No Supabase, cloud database or payment provider is contacted. The identity is
 * a signed local session token — this is explicitly NOT a hosted Google login.
 */

const REPO_ROOT = process.cwd();
export const TEST_HMAC_SECRET = 'bos-local-stays-browser-e2e-secret';

export const USERS = {
  provider: {
    authId: '5a7b0000-1111-4222-8333-000000000001',
    userId: 'USR-STAY-BROWSER-P',
    email: 'stay.owner.browser@example.test',
    name: 'Stay Owner Browser',
    role: 'provider' as const,
    phone: '+91 90000 20001',
  },
  customerA: {
    authId: '5a7b0000-1111-4222-8333-000000000002',
    userId: 'USR-STAY-BROWSER-A',
    email: 'stay.guest.a@example.test',
    name: 'Guest A Browser',
    role: 'customer' as const,
    phone: '+91 90000 20002',
  },
  customerB: {
    authId: '5a7b0000-1111-4222-8333-000000000003',
    userId: 'USR-STAY-BROWSER-B',
    email: 'stay.guest.b@example.test',
    name: 'Guest B Browser',
    role: 'customer' as const,
    phone: '+91 90000 20003',
  },
  admin: {
    authId: '5a7b0000-1111-4222-8333-000000000004',
    userId: 'USR-STAY-BROWSER-ADMIN',
    email: 'stay.admin.browser@example.test',
    name: 'Stay Admin Browser',
    role: 'admin' as const,
    phone: '+91 90000 20004',
  },
};

export const STAY = {
  listingId: 'stay-e2e-browser-1',
  title: 'E2E Grand Residency & Suites',
  city: 'Hyderabad',
  area: 'Banjara Hills',
  deluxePricePaise: 250_000,
  suitePricePaise: 450_000,
};

export function sessionToken(user: typeof USERS[keyof typeof USERS]): string {
  const payload = Buffer.from(JSON.stringify({
    userId: user.userId,
    supabaseUserId: user.authId,
    email: user.email,
    name: user.name,
    googleSub: `google-${user.authId}`,
    phone: user.phone,
    role: user.role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 2 * 60 * 60_000,
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', `${TEST_HMAC_SECRET}:SESSION_TOKEN_V2`)
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
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

async function command(bin: string, args: string[], cwd = REPO_ROOT): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr || stdout}`));
    });
  });
}

const STUBS_SQL = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid,
    nullif(current_setting('test.uid', true), '')::uuid
  ) $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'role', ''),
    nullif(current_setting('test.role', true), ''),
    'authenticated'
  ) $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
`;

export interface StaysHarness {
  apiUrl: string;
  uiUrl: string;
  connectionString: string;
  propertyId: string;
  deluxeRoomTypeId: string;
  suiteRoomTypeId: string;
  query: (text: string, values?: unknown[]) => Promise<any[]>;
  restartApi: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function startStaysHarness(): Promise<StaysHarness> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-stays-browser-'));
  const markerPath = path.join(tempRoot, '.bos-stays-browser-owned');
  await fs.writeFile(markerPath, 'BookOurSpace Stays browser E2E scratch directory\n');

  const pgData = path.join(tempRoot, 'pgdata');
  const postgresLog = path.join(tempRoot, 'postgres.log');
  const storePath = path.join(tempRoot, 'authoritative-store.json');
  const pgPort = await freePort();
  const apiPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const database = 'bos_stays_e2e';
  const connectionString = `postgres://postgres@127.0.0.1:${pgPort}/${database}?sslmode=disable`;

  const psql = (args: string[], db = database) =>
    command('psql', ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', ...args]);

  let apiChild: ChildProcess | null = null;
  let apiOutput = '';
  let uiServer: Server | null = null;
  let pool: Pool | null = null;

  const stopApi = async () => {
    const child = apiChild;
    if (!child || child.exitCode !== null) return;
    apiChild = null;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  };

  const startApi = async () => {
    apiOutput = '';
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(apiPort),
        BOS_SERVER_HMAC_SECRET: TEST_HMAC_SECRET,
        BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
        BOS_LISTINGS_DATABASE_URL: connectionString,
        // Payments stay disabled: only signed sandbox settlement can settle money.
        BOS_PAYMENT_SANDBOX: '0',
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
        RAZORPAY_WEBHOOK_SECRET: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    apiChild = child;
    child.stdout?.on('data', (chunk) => { apiOutput += String(chunk); });
    child.stderr?.on('data', (chunk) => { apiOutput += String(chunk); });

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Stays E2E server exited before listening (${child.exitCode})\n${apiOutput.slice(-4000)}`);
      }
      try {
        const response = await fetch(`${apiUrl}/api/auth/me`);
        if (response.status === 401) return;
      } catch { /* booting */ }
      await sleep(100);
    }
    throw new Error(`Stays E2E server did not become ready\n${apiOutput.slice(-4000)}`);
  };

  try {
    await command('initdb', ['-D', pgData, '-U', 'postgres', '--auth=trust']);
    await command('pg_ctl', ['-D', pgData, '-o', `-p ${pgPort} -k /tmp -c listen_addresses=127.0.0.1`, '-l', postgresLog, '-w', 'start']);

    await psql(['-c', `drop database if exists ${database}`], 'postgres');
    await psql(['-c', `create database ${database}`], 'postgres');

    const stubsPath = path.join(tempRoot, 'stubs.sql');
    await fs.writeFile(stubsPath, STUBS_SQL);
    await psql(['-f', stubsPath]);
    await psql(['-f', path.join(REPO_ROOT, 'supabase/schema_and_rls.sql')]);

    const migrationDir = path.join(REPO_ROOT, 'supabase/migrations');
    const migrations = (await fs.readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
    for (const migration of migrations) {
      await psql(['-f', path.join(migrationDir, migration)]);
    }

    pool = new Pool({ connectionString, max: 4 });
    const users = Object.values(USERS);
    for (const user of users) {
      await pool.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ($1, $2, '{}'::jsonb) on conflict (id) do nothing`,
        [user.authId, user.email],
      );
      await pool.query(
        `update public.profiles set role = $2, account_status = 'active', full_name = $3, phone = $4 where id = $1`,
        [user.authId, user.role, user.name, user.phone],
      );
    }

    await pool.query(
      `insert into public.listings
         (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
       values ($1, $2, $3, 'stay-hotel', '3-Star Business Hotel', 'stay', $4, '/night', 'active', $5::jsonb)`,
      [
        STAY.listingId,
        USERS.provider.authId,
        STAY.title,
        Math.round(STAY.deluxePricePaise / 100),
        JSON.stringify({
          description: 'Browser-verified stay with published room inventory.',
          location: { city: STAY.city, area: STAY.area },
          images: [],
          providerName: 'E2E Hospitality',
        }),
      ],
    );

    const property = await pool.query(
      `insert into public.stay_properties
         (listing_id, owner_user_id, name, property_type, city, area, address, base_price_paise, check_in_time, check_out_time)
       values ($1, $2, $3, 'hotel', $4, $5, $6, $7, '14:00', '11:00')
       returning id`,
      [STAY.listingId, USERS.provider.authId, STAY.title, STAY.city, STAY.area, 'Road No. 12, Banjara Hills', STAY.deluxePricePaise],
    );
    const propertyId = String(property.rows[0].id);

    const deluxe = await pool.query(
      `insert into public.stay_room_types (property_id, name, max_adults, max_children, base_price_paise, amenities)
       values ($1, 'Deluxe King Room', 2, 0, $2, array['AC','WiFi','Breakfast'])
       returning id`,
      [propertyId, STAY.deluxePricePaise],
    );
    const suite = await pool.query(
      `insert into public.stay_room_types (property_id, name, max_adults, max_children, base_price_paise, amenities)
       values ($1, 'Executive Suite', 3, 0, $2, array['AC','WiFi','Breakfast','Lounge access'])
       returning id`,
      [propertyId, STAY.suitePricePaise],
    );
    const deluxeRoomTypeId = String(deluxe.rows[0].id);
    const suiteRoomTypeId = String(suite.rows[0].id);

    for (const label of ['101', '102']) {
      await pool.query(`insert into public.stay_units (room_type_id, label) values ($1, $2)`, [deluxeRoomTypeId, label]);
    }
    await pool.query(`insert into public.stay_units (room_type_id, label) values ($1, '201')`, [suiteRoomTypeId]);

    const nowIso = new Date().toISOString();
    await fs.writeFile(storePath, JSON.stringify({
      seatLocks: {}, bookings: [], enquiries: [], paymentIntents: {}, usedUtrs: {}, checkedInPasses: {},
      users: users.map((user) => ({
        id: user.userId,
        supabaseUserId: user.authId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        ...(user.role === 'provider' ? { providerId: `prov-${user.authId.slice(0, 8)}` } : {}),
        googleSub: `google-${user.authId}`,
        avatarUrl: '',
        authProvider: 'google',
        verified: true,
        kycDocument: '',
        accountStatus: 'active',
        city: 'Hyderabad',
        joinedAt: nowIso,
        lastLoginAt: nowIso,
        listingsCount: 0,
        bookingsCount: 0,
        totalSpentOrEarned: 0,
        permissions: user.role === 'admin' ? ['*'] : user.role === 'provider' ? ['listings:write'] : [],
        publishState: 'published',
      })),
      notifications: [], notificationCampaigns: [], providerListings: {}, adminModules: {}, revokedTokens: {},
    }, null, 2));

    await startApi();

    const distDirectory = path.join(REPO_ROOT, 'dist');
    try {
      await fs.access(path.join(distDirectory, 'index.html'));
    } catch {
      throw new Error('dist/index.html is missing. Run `npm run build` before the browser journey.');
    }
    const uiApp = express();
    uiApp.use(express.static(distDirectory, { fallthrough: true }));
    uiApp.get('*', (_request, response) => response.sendFile(path.join(distDirectory, 'index.html')));
    const startedUiServer = await new Promise<ReturnType<typeof uiApp.listen>>((resolve, reject) => {
      const server = uiApp.listen(0, '127.0.0.1', () => resolve(server));
      server.once('error', reject);
    });
    uiServer = startedUiServer;
    const uiUrl = `http://127.0.0.1:${(startedUiServer.address() as net.AddressInfo).port}`;

    const stop = async () => {
      await stopApi();
      const closeableUiServer = uiServer;
      if (closeableUiServer) {
        await new Promise<void>((resolve) => closeableUiServer.close(() => resolve()));
        uiServer = null;
      }
      if (pool) { await pool.end().catch(() => {}); pool = null; }
      await command('pg_ctl', ['-D', pgData, '-m', 'fast', '-w', 'stop']).catch(() => {});
      const marker = await fs.readFile(markerPath, 'utf8').catch(() => '');
      if (!marker.startsWith('BookOurSpace Stays browser E2E')) {
        throw new Error('Refusing to remove an unowned scratch directory.');
      }
      await fs.rm(tempRoot, { recursive: true, force: true });
    };

    return {
      apiUrl,
      uiUrl,
      connectionString,
      propertyId,
      deluxeRoomTypeId,
      suiteRoomTypeId,
      query: async (text: string, values?: unknown[]) => {
        if (!pool) throw new Error('The E2E database pool is closed.');
        const result = await pool.query(text, values);
        return result.rows;
      },
      restartApi: async () => { await stopApi(); await startApi(); },
      stop,
    };
  } catch (error) {
    const postgresTail = await fs.readFile(postgresLog, 'utf8').catch(() => '');
    await stopApi();
    if (uiServer) await new Promise<void>((resolve) => uiServer?.close(() => resolve()));
    if (pool) await pool.end().catch(() => {});
    await command('pg_ctl', ['-D', pgData, '-m', 'fast', '-w', 'stop']).catch(() => {});
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    throw new Error(`${(error as Error).message}\npostgres log:\n${postgresTail.slice(-4000)}`);
  }
}
