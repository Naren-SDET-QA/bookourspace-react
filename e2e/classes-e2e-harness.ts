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
 * Local-only harness for the Classes browser journey.
 *
 * It creates a throwaway PostgreSQL cluster in a private temp directory,
 * applies the repository baseline + every migration, seeds identities and one
 * approved course, then runs the real Express server and serves the built UI.
 * Nothing contacts Supabase, a cloud database, or a payment provider.
 */

const REPO_ROOT = process.cwd();
export const TEST_HMAC_SECRET = 'bos-local-class-browser-e2e-secret';

export const USERS = {
  provider: {
    authId: 'cf1d2c33-2222-4222-8222-000000000001',
    userId: 'USR-CLS-BROWSER-P',
    email: 'trainer.browser@example.test',
    name: 'Trainer Browser',
    role: 'provider' as const,
    phone: '+91 90000 10001',
  },
  customerA: {
    authId: 'cf1d2c33-2222-4222-8222-000000000002',
    userId: 'USR-CLS-BROWSER-A',
    email: 'student.a.browser@example.test',
    name: 'Student A',
    role: 'customer' as const,
    phone: '+91 90000 10002',
  },
  customerB: {
    authId: 'cf1d2c33-2222-4222-8222-000000000003',
    userId: 'USR-CLS-BROWSER-B',
    email: 'student.b.browser@example.test',
    name: 'Student B',
    role: 'customer' as const,
    phone: '+91 90000 10003',
  },
  customerC: {
    authId: 'cf1d2c33-2222-4222-8222-000000000004',
    userId: 'USR-CLS-BROWSER-C',
    email: 'student.c.browser@example.test',
    name: 'Student C',
    role: 'customer' as const,
    phone: '+91 90000 10004',
  },
  admin: {
    authId: 'cf1d2c33-2222-4222-8222-000000000005',
    userId: 'USR-CLS-BROWSER-ADMIN',
    email: 'admin.browser@example.test',
    name: 'Admin Browser',
    role: 'admin' as const,
    phone: '+91 90000 10005',
  },
  otherProvider: {
    authId: 'cf1d2c33-2222-4222-8222-000000000006',
    userId: 'USR-CLS-BROWSER-P2',
    email: 'other.trainer.browser@example.test',
    name: 'Other Trainer',
    role: 'provider' as const,
    phone: '+91 90000 10006',
  },
};

export const COURSE_ID = 'class-e2e-algebra';

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
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  banned_until timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id));
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
create publication supabase_realtime;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id) on delete restrict,
  name text not null, owner uuid, metadata jsonb, path_tokens text[], created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (bucket_id, name)
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
create policy "Server manages buckets" on storage.buckets for all to service_role using (true) with check (true);
`;

export interface ClassesHarness {
  apiUrl: string;
  uiUrl: string;
  connectionString: string;
  query: (text: string, values?: unknown[]) => Promise<any[]>;
  restartApi: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function startClassesHarness(): Promise<ClassesHarness> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-class-browser-'));
  const markerPath = path.join(tempRoot, '.bos-class-browser-owned');
  await fs.writeFile(markerPath, 'BookOurSpace Classes browser E2E scratch directory\n');

  const pgData = path.join(tempRoot, 'pgdata');
  const postgresLog = path.join(tempRoot, 'postgres.log');
  const storePath = path.join(tempRoot, 'authoritative-store.json');
  const pgPort = await freePort();
  const apiPort = await freePort();
  // Keep embedded Vite isolated from other developer/test processes. A
  // dedicated websocket port prevents the middleware's shared-port fallback.
  const hmrPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const connectionString = `postgres://postgres@127.0.0.1:${pgPort}/bos_classes_e2e?sslmode=disable`;
  const database = 'bos_classes_e2e';

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
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
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
        // Keep the browser journey on a stable document if source files change
        // while the suite is running; HMR can detach controlled form fields.
        DISABLE_HMR: 'true',
        BOS_VITE_HMR_PORT: String(hmrPort),
        BOS_SERVER_HMAC_SECRET: TEST_HMAC_SECRET,
        BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
        BOS_LISTINGS_DATABASE_URL: connectionString,
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
        RAZORPAY_WEBHOOK_SECRET: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    apiChild = child;
    child.stdout?.on('data', (chunk) => { apiOutput += String(chunk); });
    child.stderr?.on('data', (chunk) => { apiOutput += String(chunk); });

    const deadline = Date.now() + 35_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Classes E2E server exited before listening (${child.exitCode})\n${apiOutput.slice(-4000)}`);
      }
      try {
        const response = await fetch(`${apiUrl}/api/auth/me`);
        if (response.status === 401) return;
      } catch {
        // Boot is still in progress.
      }
      await sleep(100);
    }
    throw new Error(`Classes E2E server did not become ready\n${apiOutput.slice(-4000)}`);
  };

  try {
    await command('initdb', ['-D', pgData, '-U', 'postgres', '--auth=trust']);
    await command('pg_ctl', [
      '-D', pgData,
      '-o', `-p ${pgPort} -k /tmp -c listen_addresses=127.0.0.1`,
      '-l', postgresLog,
      '-w', 'start',
    ]);

    await psql(['-c', `drop database if exists ${database}`], 'postgres');
    await psql(['-c', `create database ${database}`], 'postgres');

    const stubsPath = path.join(tempRoot, 'stubs.sql');
    await fs.writeFile(stubsPath, STUBS_SQL);
    await psql(['-f', stubsPath]);
    // Migrations that finalize media assets reference Supabase Storage at
    // function-creation time. Model only its local catalog contract here;
    // the disposable harness never uploads bytes or contacts hosted Storage.
    await psql(['-f', path.join(REPO_ROOT, 'supabase/tests/lib/bos_storage_stub.sql')]);
    await psql(['-f', path.join(REPO_ROOT, 'supabase/schema_and_rls.sql')]);

    const migrationDir = path.join(REPO_ROOT, 'supabase/migrations');
    const migrations = (await fs.readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
    for (const migration of migrations) {
      await psql(['-f', path.join(migrationDir, migration)]);
    }
    // The disposable cluster uses the same anon/authenticated roles as the
    // hosted RLS contract. Grant only the public read surface needed by the
    // real marketplace query; hosted grants/policies are never changed here.
    await psql(['-c', 'grant select on public.listings, public.media_assets to anon, authenticated']);

    pool = new Pool({ connectionString, max: 4 });
    const users = Object.values(USERS);
    for (const user of users) {
      await pool.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ($1, $2, '{}'::jsonb) on conflict (id) do nothing`,
        [user.authId, user.email],
      );
      await pool.query(
        `update public.profiles
            set role = $2, account_status = 'active', full_name = $3, phone = $4
          where id = $1`,
        [user.authId, user.role, user.name, user.phone],
      );
    }

    await pool.query(
      `insert into public.listings
         (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
       values
         ($1, $2, 'E2E Algebra Mastery', 'class-academic', 'Academic', 'course', 5000, 'per course', 'active', $3::jsonb),
         ($4, $2, 'E2E Spoken English', 'class-languages', 'Languages', 'course', 3000, 'per month', 'active', $5::jsonb),
         ($6, $7, 'Foreign Trainer Course', 'class-software', 'Software & IT', 'course', 6000, 'per course', 'active', $8::jsonb)`,
      [
        COURSE_ID,
        USERS.provider.authId,
        JSON.stringify({
          description: 'Browser-verified algebra course with a real trainer calendar.',
          location: { city: 'Hyderabad', area: 'Madhapur' },
          images: [],
          providerName: 'E2E Academy',
        }),
        'class-e2e-english',
        JSON.stringify({
          description: 'Spoken English course.',
          location: { city: 'Hyderabad', area: 'Gachibowli' },
          images: [],
          providerName: 'E2E Academy',
        }),
        'class-e2e-foreign',
        USERS.otherProvider.authId,
        JSON.stringify({
          description: 'Course owned by another trainer.',
          location: { city: 'Hyderabad', area: 'Kukatpally' },
          images: [],
          providerName: 'Other Academy',
        }),
      ],
    );

    // The marketplace auth layer resolves the signed session against its own
    // authoritative user store. Seed the same identities so role-gated provider
    // and admin surfaces open in the real browser.
    const nowIso = new Date().toISOString();
    await fs.writeFile(storePath, JSON.stringify({
      seatLocks: {},
      bookings: [],
      enquiries: [],
      paymentIntents: {},
      usedUtrs: {},
      checkedInPasses: {},
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
      notifications: [],
      notificationCampaigns: [],
      providerListings: {},
      adminModules: {},
      revokedTokens: {},
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
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
      }
      await command('pg_ctl', ['-D', pgData, '-m', 'fast', '-w', 'stop']).catch(() => {});
      const marker = await fs.readFile(markerPath, 'utf8').catch(() => '');
      if (!marker.startsWith('BookOurSpace Classes browser E2E')) {
        throw new Error('Refusing to remove an unowned scratch directory.');
      }
      await fs.rm(tempRoot, { recursive: true, force: true });
    };

    return {
      apiUrl,
      uiUrl,
      connectionString,
      query: async (text: string, values?: unknown[]) => {
        if (!pool) throw new Error('The E2E database pool is closed.');
        const result = await pool.query(text, values);
        return result.rows;
      },
      restartApi: async () => {
        await stopApi();
        await startApi();
      },
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
