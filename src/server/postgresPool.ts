import { Pool } from 'pg';
import { assertPostgresConnectionTarget } from './persistencePolicy';

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
  const normalised = assertPostgresConnectionTarget(connectionString, environment);
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

  const code = String((lastError as any)?.code || '');
  await pool.end().catch(() => undefined);
  if (pool === sharedPool) {
    sharedPool = null;
    sharedConnectionString = '';
    closed = true;
  }
  if (['28P01', '28000'].includes(code)) throw new Error('BOS_LISTINGS_DATABASE_AUTHENTICATION_FAILED');
  if (code === '53300') throw new Error('BOS_LISTINGS_DATABASE_POOL_EXHAUSTED');
  if (['42P01', '42703', '42883'].includes(code)) throw new Error('BOS_STAYS_SCHEMA_OUTDATED');
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
