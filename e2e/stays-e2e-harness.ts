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
  customerC: {
    authId: '5a7b0000-1111-4222-8333-000000000005',
    userId: 'USR-STAY-BROWSER-C',
    email: 'stay.guest.c@example.test',
    name: 'Guest C Browser',
    role: 'customer' as const,
    phone: '+91 90000 20005',
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
create extension if not exists btree_gist;
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
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

export interface StaysHarness {
  apiUrl: string;
  uiUrl: string;
  connectionString: string;
  propertyId: string;
  deluxeRoomTypeId: string;
  suiteRoomTypeId: string;
  roomTypeIds: Record<string, string>;
  query: (text: string, values?: unknown[]) => Promise<any[]>;
  queryAsUser: (authUserId: string, text: string, values?: unknown[]) => Promise<any[]>;
  approveTestListings: () => Promise<void>;
  restartApi: () => Promise<void>;
  apiOutput: () => string;
  stop: () => Promise<void>;
}

export async function startStaysHarness(options: {
  merchantVpa?: string;
  paymentSandboxSecret?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
} = {}): Promise<StaysHarness> {
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
        // Tests use the current source snapshot without Vite replacing modules
        // mid-journey when another local task edits the worktree.
        DISABLE_HMR: 'true',
        BOS_SERVER_HMAC_SECRET: TEST_HMAC_SECRET,
        BOS_TEST_AUTHORITATIVE_STORE_PATH: storePath,
        BOS_LISTINGS_DATABASE_URL: connectionString,
        // Tests must not inherit a developer's local preview opt-ins: demo rows
        // stay hidden and unbookable by default, exactly as in production.
        BOS_STAY_INCLUDE_DEMO: '0',
        BOS_STAY_ALLOW_DEMO_BOOKING: '0',
        // Payments stay disabled: only signed sandbox settlement can settle money.
        BOS_PAYMENT_SANDBOX: options.paymentSandboxSecret ? '1' : '0',
        BOS_PAYMENT_SANDBOX_SECRET: options.paymentSandboxSecret || '',
        BOS_UPI_MERCHANT_VPA: options.merchantVpa || '',
        BOS_UPI_MERCHANT_NAME: 'BookOurSpace',
        RAZORPAY_KEY_ID: options.razorpayKeyId || '',
        RAZORPAY_KEY_SECRET: options.razorpayKeySecret || '',
        RAZORPAY_WEBHOOK_SECRET: options.razorpayWebhookSecret || '',
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
    // Recent media migrations define Storage policies even though this stay
    // journey never uploads files. Reuse the shared local-only Storage schema
    // stub so the disposable PostgreSQL cluster can apply the full migration
    // chain faithfully without contacting hosted Supabase Storage.
    await psql(['-f', path.join(REPO_ROOT, 'supabase/tests/lib/bos_storage_stub.sql')]);
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
        `update public.profiles
            set role = $2, account_status = 'active', full_name = $3, phone = $4,
                verified = ($2 = 'admin'), is_super_admin = ($2 = 'admin')
          where id = $1`,
        [user.authId, user.role === 'provider' ? 'customer' : user.role, user.name, user.phone],
      );
    }

    await pool.query(
      `insert into public.listings
         (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
       values ($1, $2, $3, 'stay-hotel', '3-Star Business Hotel', 'stay', $4, '/night', 'pending_approval', $5::jsonb)`,
      [
        STAY.listingId,
        USERS.provider.authId,
        STAY.title,
        Math.round(STAY.deluxePricePaise / 100),
        JSON.stringify({
          description: 'Browser-verified stay with published room inventory.',
          stayLifecycle: 'draft',
          demo: false,
          location: { city: STAY.city, area: STAY.area },
          images: [],
          providerName: 'E2E Hospitality',
        }),
      ],
    );

    const property = await pool.query(
      `insert into public.stay_properties
         (listing_id, owner_user_id, name, property_type, place_type, city, area, address,
          latitude, longitude, base_price_paise, check_in_time, check_out_time,
          bedrooms, beds, bathrooms, max_guests, instant_book, self_check_in, pets_allowed,
          guest_favourite, host_languages, accessibility, amenities, tax_percent)
       values ($1, $2, $3, 'hotel', 'entire_home', $4, $5, $6,
               17.412, 78.439, $7, '14:00', '11:00',
               2, 3, 2, 4, true, true, true,
               true, array['English','Hindi'], array['Step-free entrance','Grab bars'],
               array['WiFi','Air conditioning','Kitchen','Free parking','Pool','Breakfast'], 12)
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

    // Additional verified stays so filters can be exercised against real rows.
    const extras = [
      {
        listingId: 'stay-e2e-villa-1', title: 'E2E Palm Pool Villa', category: 'stay-villa',
        subcategory: 'Luxury Villa', propertyType: 'villa', placeType: 'entire_home', city: 'Goa', area: 'Assagao',
        pricePaise: 900_000, bedrooms: 3, beds: 4, bathrooms: 3, maxGuests: 8,
        instant: false, self: true, pets: true, favourite: false, luxe: true,
        languages: ['English', 'French'], accessibility: ['Step-free entrance'],
        amenities: ['WiFi', 'Kitchen', 'Private pool', 'Free parking', 'Washer', 'Balcony'],
        roomName: 'Entire Villa', roomMaxAdults: 6, roomMaxChildren: 2,
        roomAmenities: ['Private pool', 'WiFi', 'Kitchen'], lat: 15.599, lng: 73.779,
      },
      {
        listingId: 'stay-e2e-home-1', title: 'E2E Coorg Coffee Homestay', category: 'stay-homestay',
        subcategory: 'Plantation Homestay', propertyType: 'homestay', placeType: 'private_room', city: 'Coorg', area: 'Madikeri',
        pricePaise: 350_000, bedrooms: 1, beds: 1, bathrooms: 1, maxGuests: 2,
        instant: false, self: false, pets: false, favourite: false, luxe: false,
        languages: ['Kannada', 'Tamil', 'English'],
        accessibility: ['Step-free entrance', 'Accessible parking', 'Shower chair'],
        amenities: ['WiFi', 'Kitchen', 'Breakfast'],
        roomName: 'Estate Room', roomMaxAdults: 2, roomMaxChildren: 0,
        roomAmenities: ['WiFi', 'Breakfast'], lat: 12.424, lng: 75.739,
      },
      {
        listingId: 'stay-e2e-flat-1', title: 'E2E Bandra Sea View Flat', category: 'stay-apartment',
        subcategory: 'Sea View Flat', propertyType: 'flat', placeType: 'entire_home', city: 'Mumbai', area: 'Bandra West',
        pricePaise: 600_000, bedrooms: 2, beds: 2, bathrooms: 2, maxGuests: 4,
        instant: true, self: false, pets: false, favourite: false, luxe: false,
        languages: ['English', 'Marathi'], accessibility: ['Elevator'],
        amenities: ['WiFi', 'Air conditioning', 'Washer', 'Dryer', 'Kitchen'],
        roomName: 'Sea View 2BHK', roomMaxAdults: 4, roomMaxChildren: 0,
        roomAmenities: ['AC', 'WiFi', 'Washer', 'Dryer'], lat: 19.054, lng: 72.822,
      },
      {
        listingId: 'stay-e2e-temple-1', title: 'E2E Ganga Temple Stay', category: 'stay-hotel',
        subcategory: 'Temple Stay', propertyType: 'temple_stay', placeType: 'private_room', city: 'Rishikesh', area: 'Ram Jhula',
        pricePaise: 120_000, bedrooms: 1, beds: 2, bathrooms: 1, maxGuests: 3,
        instant: false, self: false, pets: false, favourite: false, luxe: false,
        languages: ['Hindi'], accessibility: ['Step-free entrance'],
        amenities: ['WiFi', 'Heating'],
        roomName: 'River Room', roomMaxAdults: 2, roomMaxChildren: 1,
        roomAmenities: ['WiFi', 'Heating'], lat: 30.124, lng: 78.315,
      },
    ] as const;

    const extraRoomTypeIds: Record<string, string> = {};
    for (const extra of extras) {
      await pool.query(
        `insert into public.listings
           (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload)
         values ($1, $2, $3, $4, $5, 'stay', $6, '/night', 'pending_approval', $7::jsonb)`,
        [
          extra.listingId,
          USERS.provider.authId,
          extra.title,
          extra.category,
          extra.subcategory,
          Math.round(extra.pricePaise / 100),
          JSON.stringify({
            description: `${extra.title} seeded for filter verification.`,
            stayLifecycle: 'draft',
            demo: false,
            location: { city: extra.city, area: extra.area },
            images: [],
          }),
        ],
      );
      const property = await pool.query(
        `insert into public.stay_properties
           (listing_id, owner_user_id, name, property_type, place_type, city, area, address,
            latitude, longitude, base_price_paise, tax_percent, description, amenities,
            bedrooms, beds, bathrooms, max_guests, instant_book, self_check_in, pets_allowed,
            guest_favourite, luxe_verified, host_languages, accessibility,
            cancellation_policy, cancellation_free_hours)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 12, $12, $13::text[],
                 $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::text[], $24::text[],
                 $25, $26)
         returning id`,
        [
          extra.listingId, USERS.provider.authId, extra.title, extra.propertyType, extra.placeType,
          extra.city, extra.area, `${extra.area}, ${extra.city}`, extra.lat, extra.lng,
          extra.pricePaise, `Seeded ${extra.title}.`, extra.amenities,
          extra.bedrooms, extra.beds, extra.bathrooms, extra.maxGuests,
          extra.instant, extra.self, extra.pets, extra.favourite, extra.luxe,
          extra.languages, extra.accessibility,
          extra.propertyType === 'villa' ? 'strict' : 'moderate',
          extra.propertyType === 'villa' ? 24 : 48,
        ],
      );
      const propertyId = String(property.rows[0].id);
      const room = await pool.query(
        `insert into public.stay_room_types
           (property_id, name, max_adults, max_children, base_price_paise, amenities, bedrooms, beds, bathrooms)
         values ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9)
         returning id`,
        [
          propertyId, extra.roomName, extra.roomMaxAdults, extra.roomMaxChildren,
          extra.pricePaise, extra.roomAmenities, extra.bedrooms, extra.beds, extra.bathrooms,
        ],
      );
      const roomTypeId = String(room.rows[0].id);
      extraRoomTypeIds[extra.listingId] = roomTypeId;
      for (const label of ['1', '2']) {
        await pool.query(`insert into public.stay_units (room_type_id, label) values ($1, $2)`, [roomTypeId, `${extra.listingId}-${label}`]);
      }
    }

    // Seed listings through the same Super Admin approval RPC as the product.
    // Owners begin as Google-authenticated customers; approval changes the
    // authoritative profile role and verified state with durable audit rows.
    const reviewer = await pool.connect();
    try {
      await reviewer.query('begin');
      await reviewer.query(`select set_config('request.jwt.claim.sub', $1, true)`, [USERS.admin.authId]);
      for (const listingId of [STAY.listingId, ...extras.map((extra) => extra.listingId)]) {
        await reviewer.query(`select public.review_stay_listing($1, 'approve', 'Local E2E fixture approved', false)`, [listingId]);
      }
      await reviewer.query('commit');
    } catch (error) {
      await reviewer.query('rollback').catch(() => {});
      throw error;
    } finally {
      reviewer.release();
    }

    // Two verified reviews on the main stay; real rows, never fabricated UI counts.
    await pool.query(
      `insert into public.reviews (id, user_id, listing_id, customer_name, rating, comment)
       values
         ('rev-e2e-stay-1', $1, $2, 'Reviewer One', 5, 'Quiet, clean and exactly as described.'),
         ('rev-e2e-stay-2', $1, $2, 'Reviewer Two', 4, 'Great breakfast and a helpful host.')
       on conflict (id) do nothing`,
      [USERS.customerA.authId, STAY.listingId],
    );

    // The Mumbai flat is fully booked for 1-10 Dec 2026 so availability can be
    // verified as a real filter, not a decorative one.
    await pool.query(
      `insert into public.stay_allocations (unit_id, status, stay_dates, guest_user_id, expires_at)
       select u.id, 'confirmed', daterange((current_date + 30), (current_date + 40), '[)'), null, null
         from public.stay_units u
        where u.room_type_id = $1`,
      [extraRoomTypeIds['stay-e2e-flat-1']],
    );

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
    // Snapshot the build into this harness's owned temp directory. A concurrent
    // build must not replace lazy-loaded chunks halfway through the browser run.
    const isolatedDistDirectory = path.join(tempRoot, 'dist');
    await fs.cp(distDirectory, isolatedDistDirectory, { recursive: true, errorOnExist: true });
    const uiApp = express();
    uiApp.use(express.static(isolatedDistDirectory, { fallthrough: true }));
    uiApp.get('*', (_request, response) => response.sendFile(path.join(isolatedDistDirectory, 'index.html')));
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
      roomTypeIds: extraRoomTypeIds,
      approveTestListings: async () => {
        if (!pool) throw new Error('The E2E database pool is closed.');
        const reviewer = await pool.connect();
        try {
          await reviewer.query('begin');
          await reviewer.query(`select set_config('request.jwt.claim.sub', $1, true)`, [USERS.admin.authId]);
          for (const listingId of [STAY.listingId, ...extras.map((extra) => extra.listingId)]) {
            await reviewer.query(`select public.review_stay_listing($1, 'approve', 'Local E2E fixture reset', false)`, [listingId]);
          }
          await reviewer.query('commit');
        } catch (error) {
          await reviewer.query('rollback').catch(() => {});
          throw error;
        } finally {
          reviewer.release();
        }
      },
      query: async (text: string, values?: unknown[]) => {
        if (!pool) throw new Error('The E2E database pool is closed.');
        const result = await pool.query(text, values);
        return result.rows;
      },
      queryAsUser: async (authUserId: string, text: string, values?: unknown[]) => {
        if (!pool) throw new Error('The E2E database pool is closed.');
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query('set local role authenticated');
          await client.query("select set_config('request.jwt.claim.sub', $1, true)", [authUserId]);
          await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
          const result = await client.query(text, values);
          await client.query('commit');
          return result.rows;
        } catch (error) {
          await client.query('rollback').catch(() => {});
          throw error;
        } finally {
          client.release();
        }
      },
      restartApi: async () => { await stopApi(); await startApi(); },
      apiOutput: () => apiOutput,
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
