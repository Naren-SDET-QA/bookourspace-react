import { Pool } from 'pg';

/**
 * One PostgreSQL pool for the booking domain.
 *
 * The PG booking repository and the PG payment repository used to open their
 * own pool against the same database, which doubled the connections and
 * duplicated the loopback and production guards. They now share a single
 * pool, so the guard and the connection lifecycle live in exactly one place.
 *
 * The pool is only ever created for a loopback database: a booking server must
 * not talk to a remote database that it was not explicitly configured for.
 */

let sharedPool: Pool | null = null;
let sharedConnectionString = '';
let closed = false;

export function isPostgresConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(String(environment.BOS_LISTINGS_DATABASE_URL || '').trim());
}

/**
 * Rejects anything that is not a local PostgreSQL instance and returns the
 * normalised connection string.
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

export function getSharedPostgresPool(connectionString: string): Pool {
  const normalised = assertLoopbackPostgresUrl(connectionString);
  if (sharedPool && sharedConnectionString === normalised && !closed) return sharedPool;
  if (sharedPool && !closed) {
    // A different database was configured. The old pool is released.
    void sharedPool.end().catch(() => undefined);
  }
  closed = false;
  sharedConnectionString = normalised;
  sharedPool = new Pool({ connectionString: normalised, max: 8, connectionTimeoutMillis: 3000 });
  return sharedPool;
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
