import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { assertPostgresConnectionTarget } from './persistencePolicy';

const SUPABASE_ROOT_CA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/certs/supabase-root-ca.crt',
);

/**
 * Ensures strict Supabase TLS (`require`/`verify-ca`/`verify-full`) resolves
 * the bundled Supabase Root CA when `sslrootcert` is omitted or points to a
 * relative path outside the current working directory. Never relaxes TLS.
 */
export function resolvePostgresTlsConnectionString(connectionString: string): string {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return connectionString;
  }
  const hostname = parsed.hostname.toLowerCase();
  const isSupabaseHost =
    hostname.endsWith('.supabase.co') || hostname.endsWith('.pooler.supabase.com');
  const sslMode = String(parsed.searchParams.get('sslmode') || '').toLowerCase();
  if (!isSupabaseHost || !['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
    return connectionString;
  }

  const configuredRootCert = String(parsed.searchParams.get('sslrootcert') || '').trim();
  if (configuredRootCert) {
    const resolvedConfigured = path.isAbsolute(configuredRootCert)
      ? configuredRootCert
      : path.resolve(process.cwd(), configuredRootCert);
    if (fs.existsSync(resolvedConfigured)) {
      if (resolvedConfigured === configuredRootCert) return connectionString;
      parsed.searchParams.set('sslrootcert', resolvedConfigured);
      return parsed.toString();
    }
  }

  if (fs.existsSync(SUPABASE_ROOT_CA_PATH)) {
    parsed.searchParams.set('sslrootcert', SUPABASE_ROOT_CA_PATH);
    return parsed.toString();
  }
  return connectionString;
}

/**
 * One PostgreSQL pool for the marketplace domains that share the canonical
 * database selector (`BOS_LISTINGS_DATABASE_URL`).
 *
 * The pool is only created for a target accepted by the shared production
 * persistence policy: loopback databases are for development/test (or an
 * explicit disposable production smoke test) and a remote database must be a
 * TLS production target. No repository opens its own unvalidated pool.
 */

let sharedPool: Pool | null = null;
let sharedConnectionString = '';
let closed = false;

export function isPostgresConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(String(environment.BOS_LISTINGS_DATABASE_URL || '').trim());
}

/**
 * Backwards-compatible loopback-only check. New code should call
 * `assertPostgresConnectionTarget` from the persistence policy so production
 * semantics (TLS remote target) are identical everywhere.
 */
export function assertLoopbackPostgresUrl(connectionString: string): string {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('BOS_LISTINGS_DATABASE_URL_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('BOS_LISTINGS_DATABASE_URL_INVALID');
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('BOS_LISTINGS_DATABASE_MUST_BE_LOOPBACK');
  }
  return connectionString;
}

export function getSharedPostgresPool(
  connectionString: string,
  environment: NodeJS.ProcessEnv = process.env,
): Pool {
  const normalised = resolvePostgresTlsConnectionString(
    assertPostgresConnectionTarget(connectionString, environment),
  );
  if (sharedPool && sharedConnectionString === normalised && !closed) return sharedPool;
  if (sharedPool && !closed) {
    // A different database was configured. The old pool is released.
    void sharedPool.end().catch(() => undefined);
  }
  closed = false;
  sharedConnectionString = normalised;
  sharedPool = new Pool({
    connectionString: normalised,
    max: 8,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: false,
  });
  return sharedPool;
}

const REQUIRED_STAY_RELATIONS = [
  'public.stay_properties',
  'public.stay_room_types',
  'public.listings',
  'public.public_provider_profile_projection',
  'public.reviews',
  'public.platform_module_flags',
] as const;

const REQUIRED_STAY_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ...[
    'id', 'listing_id', 'owner_user_id', 'name', 'property_type', 'place_type', 'city', 'area', 'address',
    'description', 'latitude', 'longitude', 'check_in_time', 'check_out_time', 'tax_percent', 'bedrooms',
    'beds', 'bathrooms', 'max_guests', 'instant_book', 'self_check_in', 'pets_allowed', 'guest_favourite',
    'luxe_verified', 'host_languages', 'accessibility', 'cancellation_policy', 'cancellation_free_hours',
    'amenities', 'cleaning_fee_paise', 'service_fee_bps', 'base_price_paise', 'is_active',
  ].map((column) => ['stay_properties', column] as const),
  ...['id', 'title', 'price', 'price_unit', 'payload', 'status', 'is_verified', 'verified_by']
    .map((column) => ['listings', column] as const),
  ...['id', 'property_id', 'name', 'max_adults', 'max_children', 'base_price_paise', 'amenities', 'bedrooms', 'beds', 'bathrooms', 'is_active']
    .map((column) => ['stay_room_types', column] as const),
  ...['id', 'full_name', 'avatar_url', 'verified'].map((column) => ['public_provider_profile_projection', column] as const),
  ...['listing_id', 'rating', 'customer_name', 'comment', 'created_at', 'payload'].map((column) => ['reviews', column] as const),
  ...['module_key', 'is_enabled'].map((column) => ['platform_module_flags', column] as const),
];

const TRANSIENT_STARTUP_CODES = new Set([
  '08000', '08003', '08006', '57P01', '53300',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
]);

/**
 * The single startup gate for PostgreSQL-backed application routes. It
 * validates configuration before opening the pool, then verifies connectivity
 * and the relations required by public stay discovery before the HTTP listener
 * can accept traffic. Only connectivity errors are retried, with a small
 * bounded delay; schema and configuration errors fail immediately.
 */
export async function initializePostgresRuntime(
  environment: NodeJS.ProcessEnv = process.env,
  poolFactory: typeof getSharedPostgresPool = getSharedPostgresPool,
): Promise<Pool> {
  const connectionString = String(environment.BOS_LISTINGS_DATABASE_URL || '').trim();
  const legacyConnectionString = String(environment.BOS_PG_URL || '').trim();
  if (legacyConnectionString && !connectionString) throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
  if (legacyConnectionString && legacyConnectionString !== connectionString) throw new Error('BOS_LISTINGS_DATABASE_URL_CONFLICT');
  if (legacyConnectionString) throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
  if (!connectionString) throw new Error('BOS_LISTINGS_DATABASE_URL_REQUIRED');

  const pool = poolFactory(connectionString, environment);
  pool.on('error', (error: any) => {
    // pg emits idle-client failures outside a request. Record only the
    // allow-listed SQLSTATE/network code; error messages may contain DSNs.
    const code = String(error?.code || 'UNKNOWN').replace(/[^A-Z0-9_]/gi, '').slice(0, 24);
    console.error('[postgres] idle client failure', code || 'UNKNOWN');
  });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await pool.query('select 1 as healthy');
      const result = await pool.query(
        `select required.relation_name, to_regclass('public.' || required.relation_name)::text as relation
           from unnest($1::text[]) as required(relation_name)`,
        [REQUIRED_STAY_RELATIONS.map((relation) => relation.slice('public.'.length))],
      );
      const missing = result.rows.filter((row: any) => !row.relation).map((row: any) => row.relation_name);
      if (missing.length) throw new Error(`BOS_STAYS_SCHEMA_OUTDATED:${missing.join(',')}`);
      const columns = await pool.query(
        `select required.table_name, required.column_name
           from unnest($1::text[], $2::text[]) as required(table_name, column_name)
           left join information_schema.columns existing
             on existing.table_schema = 'public'
            and existing.table_name = required.table_name
            and existing.column_name = required.column_name
          where existing.column_name is null`,
        [REQUIRED_STAY_COLUMNS.map(([table]) => table), REQUIRED_STAY_COLUMNS.map(([, column]) => column)],
      );
      if (columns.rows.length) {
        const missingColumns = columns.rows.map((row: any) => `${row.table_name}.${row.column_name}`);
        throw new Error(`BOS_STAYS_SCHEMA_OUTDATED:${missingColumns.join(',')}`);
      }
      return pool;
    } catch (error: any) {
      lastError = error;
      if (String(error?.message || '').startsWith('BOS_STAYS_SCHEMA_OUTDATED:') || ['42P01', '42703', '42883'].includes(String(error?.code || ''))) {
        await pool.end().catch(() => undefined);
        if (pool === sharedPool) {
          sharedPool = null;
          sharedConnectionString = '';
          closed = true;
        }
        throw error;
      }
      if (attempt < 2 && TRANSIENT_STARTUP_CODES.has(String(error?.code || ''))) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  const rawCode = String((lastError as any)?.code || '');
  const safeCode = rawCode.replace(/[^A-Z0-9_]/gi, '').slice(0, 48);
  await pool.end().catch(() => undefined);
  if (pool === sharedPool) {
    sharedPool = null;
    sharedConnectionString = '';
    closed = true;
  }
  if (['28P01', '28000'].includes(rawCode)) throw new Error('BOS_LISTINGS_DATABASE_AUTHENTICATION_FAILED');
  if (rawCode === '53300') throw new Error('BOS_LISTINGS_DATABASE_POOL_EXHAUSTED');
  if (['42P01', '42703', '42883'].includes(rawCode)) throw new Error('BOS_STAYS_SCHEMA_OUTDATED');
  console.error('[postgres] startup connectivity check failed:', safeCode || 'UNKNOWN');
  throw new Error('BOS_LISTINGS_DATABASE_UNAVAILABLE');
}

/** Releases the shared pool. It is safe to call more than once. */
export async function closeSharedPostgresPool(): Promise<void> {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = null;
  sharedConnectionString = '';
  closed = true;
  await pool.end().catch(() => undefined);
}

/**
 * Resolves ordered `'storage://bos-public-media/...'` references for already
 * selected active public listings using a read-only server transaction. Keeps
 * `anon` column grants on `public.media_assets` restricted while resolving
 * ready media only for verified public listings.
 */
export async function loadApprovedPublicListingMedia(
  client: PoolClient,
  listingIds: string[],
  options: { requireStayApproved?: boolean } = {},
): Promise<Map<string, string[]>> {
  const uniqueIds = [...new Set(listingIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const mediaByListingId = new Map<string, string[]>();
  if (uniqueIds.length === 0) return mediaByListingId;

  const stayGate = options.requireStayApproved
    ? `and l.is_verified is true and l.verified_by is not null and l.payload->>'stayLifecycle' = 'approved'`
    : '';

  await client.query('BEGIN READ ONLY');
  try {
    const { rows } = await client.query(
      `select asset.parent_id as listing_id,
              jsonb_agg(
                'storage://' || asset.bucket_id || '/' || asset.object_path
                order by asset.display_order, asset.created_at, asset.id
              ) as images
         from public.media_assets asset
         join public.listings l
           on l.id = asset.parent_id
          and l.owner_id = asset.owner_id
        where l.id = any($1::text[])
          and l.status = 'active'
          ${stayGate}
          and asset.parent_type = 'provider_listing'
          and asset.bucket_id = 'bos-public-media'
          and asset.privacy = 'public'
          and asset.processing_status = 'ready'
        group by asset.parent_id`,
      [uniqueIds],
    );
    await client.query('COMMIT');
    for (const row of rows) {
      if (row?.listing_id && Array.isArray(row.images)) {
        mediaByListingId.set(
          String(row.listing_id),
          row.images.filter((ref: unknown): ref is string => typeof ref === 'string'),
        );
      }
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original read failure.
    }
    throw error;
  }
  return mediaByListingId;
}
