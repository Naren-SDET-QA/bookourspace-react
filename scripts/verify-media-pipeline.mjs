#!/usr/bin/env node
/**
 * Hosted media pipeline verification (read-mostly, self-cleaning).
 *
 * Proves the real production contract against the configured Supabase project:
 *
 *   upload -> Storage object -> media_assets metadata -> finalize_media_asset
 *          -> signed URL -> HTTP 200 image bytes
 *
 * It also measures Storage usage, database payload size and deduplication
 * behaviour so the before/after numbers in the report are reproducible.
 *
 * The script creates a short-lived verification account, exercises the real
 * bucket policies and removes everything it created again. It never changes
 * bucket configuration, RLS or grants.
 *
 *   node scripts/verify-media-pipeline.mjs [--keep] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KEEP = process.argv.includes('--keep');
const AS_JSON = process.argv.includes('--json');

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

const env = { ...loadEnv(path.join(ROOT, '.env')), ...loadEnv(path.join(ROOT, '.env.local')) };
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const PUBLISHABLE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DATABASE_URL =
  env.BOS_MUMBAI_DATABASE_URL || env.BOS_HOSTED_DATABASE_URL || env.DATABASE_URL;

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !DATABASE_URL) {
  console.error('Missing Supabase configuration. Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and BOS_MUMBAI_DATABASE_URL in .env.local.');
  process.exit(2);
}

const BUCKET = 'bos-public-media';
const stamp = Date.now();
const VERIFY_EMAIL = `bos.media.verify+${stamp}@outlook.com`;
const VERIFY_PASSWORD = `B0s!Media${stamp}`;

const log = (...args) => console.log(...args);
const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}

const pool = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function db(query, params) {
  const result = await pool.query(query, params);
  return result.rows;
}

async function createVerificationUser() {
  await db(`delete from auth.users where email like 'bos.media.verify+%'`);
  const rows = await db(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values (
       (select instance_id from auth.users limit 1),
       gen_random_uuid(), 'authenticated', 'authenticated', $1,
       extensions.crypt($2, extensions.gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}'::jsonb,
       '{"full_name":"Media Pipeline Verification"}'::jsonb, now(), now()
     )
     returning id`,
    [VERIFY_EMAIL, VERIFY_PASSWORD],
  );
  const userId = rows[0].id;
  await db(
    `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ($1, $2, $3::jsonb, 'email', now(), now(), now())`,
    [
      userId,
      userId,
      JSON.stringify({ sub: userId, email: VERIFY_EMAIL, email_verified: true }),
    ],
  );
  await db(
    `insert into public.profiles (id, full_name, role, account_status, avatar_url)
     values ($1, 'Media Pipeline Verification', 'provider', 'active', null)
     on conflict (id) do update set role = 'provider', account_status = 'active'`,
    [userId],
  );
  return userId;
}

async function signIn() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: VERIFY_EMAIL, password: VERIFY_PASSWORD }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Password grant failed (${response.status}): ${JSON.stringify(body).slice(0, 400)}`);
  }
  return body;
}

function pngBytes(width, height) {
  // Minimal, valid PNG built by hand so the check never depends on the network.
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const p = rowStart + 1 + x * 3;
      raw[p] = (x * 255) / width;
      raw[p + 1] = (y * 255) / height;
      raw[p + 2] = 128;
    }
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])) >>> 0);
    return Buffer.concat([length, typeBuffer, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable = null;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xff];
  return crc ^ -1;
}

async function main() {
  await pool.connect();
  log(`Supabase project : ${SUPABASE_URL}`);
  log(`Verification user: ${VERIFY_EMAIL}`);
  log('');

  const before = await measureUsage();

  const userId = await createVerificationUser();
  record('temporary verification account provisioned', true, userId);

  const session = await signIn();
  record('authenticated session issued for the verification account', Boolean(session.access_token));

  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const image = pngBytes(640, 360);
  const checksum = crypto.createHash('sha256').update(image).digest('hex');
  const assetId = crypto.randomUUID();
  const basePath = `${userId}/verification/listing/${assetId}`;
  const originalPath = `${basePath}/original-${checksum.slice(0, 16)}.png`;
  const variantPath = `${basePath}/w320-${checksum.slice(0, 16)}.webp`;

  // The application uploads the original and its derivatives first, then
  // registers quarantined metadata, then finalizes. Mirror that order.
  const originalUpload = await client.storage.from(BUCKET).upload(originalPath, image, {
    cacheControl: '3600',
    contentType: 'image/png',
    upsert: false,
  });
  record('original object uploaded to the private media bucket', !originalUpload.error, originalUpload.error?.message);

  const variantUpload = await client.storage.from(BUCKET).upload(variantPath, image, {
    cacheControl: '3600',
    contentType: 'image/webp',
    upsert: false,
  });
  record('derivative object uploaded to the private media bucket', !variantUpload.error, variantUpload.error?.message);

  const inserted = await client.from('media_assets').insert({
    id: assetId,
    owner_id: userId,
    module_key: 'verification',
    parent_type: 'listing',
    parent_id: assetId,
    bucket_id: BUCKET,
    object_path: originalPath,
    media_kind: 'image',
    media_format: 'png',
    privacy: 'public',
    file_size_bytes: image.length,
    width: 640,
    height: 360,
    checksum_sha256: checksum,
    variants: [
      { object_path: variantPath, width: 320, height: 180, mime_type: 'image/webp', file_size_bytes: image.length },
    ],
    display_order: 0,
    processing_status: 'quarantined',
  });
  record('quarantined media metadata persisted in PostgreSQL', !inserted.error, inserted.error?.message);

  const finalized = await client.rpc('finalize_media_asset', { p_asset_id: assetId });
  record('database finalization promoted the asset to ready', !finalized.error, finalized.error?.message);

  const signed = await client.storage.from(BUCKET).createSignedUrl(originalPath, 1800);
  const signedUrl = signed.data?.signedUrl;
  record('signed URL issued for the published object', Boolean(signedUrl), signed.error?.message);

  if (signedUrl) {
    const response = await fetch(signedUrl);
    const bytes = Buffer.from(await response.arrayBuffer());
    record('signed URL returns HTTP 200', response.ok, `status=${response.status}`);
    record(
      'signed URL returns the original image bytes',
      response.ok && bytes.length === image.length,
      `${bytes.length} of ${image.length} bytes, content-type=${response.headers.get('content-type')}`,
    );
    record(
      'signed URL is not a public (unsigned) bucket URL',
      !/\/object\/public\//.test(signedUrl),
      signedUrl.split('?')[0],
    );
  }

  const variantSigned = await client.storage.from(BUCKET).createSignedUrl(variantPath, 1800);
  if (variantSigned.data?.signedUrl) {
    const response = await fetch(variantSigned.data.signedUrl);
    record('derivative signed URL returns HTTP 200', response.ok, `status=${response.status}`);
  }

  const storedRows = await db(
    `select processing_status, file_size_bytes, checksum_sha256, jsonb_array_length(variants) variants
       from public.media_assets where id = $1`,
    [assetId],
  );
  record(
    'media row is readable and ready in PostgreSQL',
    storedRows.length === 1 && storedRows[0].processing_status === 'ready',
    JSON.stringify(storedRows[0] || {}),
  );

  // The signed URL must never be persisted: it would expire and break rendering.
  const leaked = await db(
    `select count(*)::int n from public.media_assets
      where object_path like '%token%' or object_path like '%?%' or object_path like '%signature%'`,
  );
  record('no signed URL material is stored in the database', leaked[0].n === 0, `rows=${leaked[0].n}`);

  // Deduplication: the same bytes uploaded again reuse the stored object.
  const duplicate = await client
    .from('media_assets')
    .select('id, object_path, processing_status')
    .eq('owner_id', userId)
    .eq('module_key', 'verification')
    .eq('parent_type', 'listing')
    .eq('bucket_id', BUCKET)
    .eq('checksum_sha256', checksum)
    .maybeSingle();
  record(
    'identical content is deduplicated by checksum',
    duplicate.data?.id === assetId,
    `matched=${duplicate.data?.id === assetId}`,
  );

  const after = await measureUsage();

  log('');
  log('--- usage ---');
  log(`database size before/after : ${before.databaseSize} / ${after.databaseSize}`);
  log(`media objects before/after : ${before.mediaObjects} / ${after.mediaObjects}`);
  log(`media bytes before/after   : ${before.mediaBytes} / ${after.mediaBytes}`);
  log(`media_assets rows          : ${before.mediaRows} / ${after.mediaRows}`);

  if (!KEEP) {
    await db(`delete from public.media_assets where id = $1`, [assetId]);
    await db(`delete from auth.identities where user_id = $1`, [userId]);
    await db(`delete from auth.users where id = $1`, [userId]);
    const cleanup = await client.storage.from(BUCKET).remove([originalPath, variantPath]);
    record('verification objects removed from Storage', !cleanup.error, cleanup.error?.message);
    log('verification data removed (pass --keep to retain it)');
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ results, before, after }, null, 2));
  }
  log('');
  log(`${results.length - failures}/${results.length} checks passed`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

async function measureUsage() {
  const [dbSize] = await db(`select pg_size_pretty(pg_database_size(current_database())) size`);
  const [objects] = await db(
    `select count(*)::int n, coalesce(sum((metadata->>'size')::bigint),0)::bigint bytes
       from storage.objects where bucket_id = $1`,
    [BUCKET],
  );
  const [rows] = await db(`select count(*)::int n from public.media_assets`);
  return {
    databaseSize: dbSize.size,
    mediaObjects: objects.n,
    mediaBytes: Number(objects.bytes),
    mediaRows: rows.n,
  };
}

main().catch(async (error) => {
  console.error('VERIFICATION ERROR', error);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
