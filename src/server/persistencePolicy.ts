/**
 * Production persistence policy.
 *
 * Local development and tests may use the isolated JSON compatibility store.
 * A production process must be pointed at a real PostgreSQL target: no local
 * JSON file is ever authoritative in production, and every repository that
 * serves marketplace data validates the same connection target here.
 *
 * The policy is deliberately strict and fails closed:
 *   - production requires BOS_LISTINGS_DATABASE_URL;
 *   - a remote target must be TLS-enabled (verify-full is the recommended mode);
 *   - a loopback target is refused unless the operator explicitly opts into a
 *     disposable local production smoke test;
 *   - production requires a strong BOS_SERVER_HMAC_SECRET.
 */

export type PersistenceMode = 'json_compat_local' | 'postgres';

export interface PersistencePolicy {
  mode: PersistenceMode;
  postgres: boolean;
  connectionString: string | null;
}

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '::1', '[::1]'];
const TLS_MODES = ['require', 'verify-ca', 'verify-full'];
const MINIMUM_HMAC_SECRET_LENGTH = 32;

export const PERSISTENCE_ERRORS = {
  jsonStoreDisabled: 'AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION',
  invalidUrl: 'BOS_LISTINGS_DATABASE_URL_INVALID',
  loopbackInDevelopment: 'BOS_LISTINGS_DATABASE_MUST_BE_LOOPBACK',
  remoteInDevelopment: 'BOS_LISTINGS_DATABASE_MUST_BE_LOOPBACK',
  tlsRequired: 'PRODUCTION_POSTGRES_TLS_REQUIRED',
  loopbackInProduction: 'PRODUCTION_POSTGRES_LOOPBACK_REQUIRES_TEST_MODE',
  hmacRequired: 'BOS_SERVER_HMAC_SECRET_REQUIRED',
} as const;

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.includes(String(hostname || '').toLowerCase());
}

function parsePostgresUrl(connectionString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(PERSISTENCE_ERRORS.invalidUrl);
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(PERSISTENCE_ERRORS.invalidUrl);
  }
  return parsed;
}

/**
 * Validates one PostgreSQL connection string for the current environment and
 * returns it unchanged. Every repository must call this before opening a pool.
 */
export function assertPostgresConnectionTarget(
  connectionString: string,
  environment: Record<string, string | undefined> = process.env,
): string {
  const parsed = parsePostgresUrl(connectionString);
  const production = environment.NODE_ENV === 'production';

  if (isLoopbackHostname(parsed.hostname)) {
    if (production && environment.BOS_POSTGRES_LOCAL_TEST_MODE !== 'true') {
      throw new Error(PERSISTENCE_ERRORS.loopbackInProduction);
    }
    return connectionString;
  }

  // A remote database is never used outside an explicit production run, so a
  // stray .env cannot make development or tests reach a hosted database.
  if (!production) {
    throw new Error(PERSISTENCE_ERRORS.remoteInDevelopment);
  }

  const sslMode = String(parsed.searchParams.get('sslmode') || '').toLowerCase();
  if (!TLS_MODES.includes(sslMode)) {
    throw new Error(PERSISTENCE_ERRORS.tlsRequired);
  }
  return connectionString;
}

export function resolvePersistencePolicy(
  environment: Record<string, string | undefined> = process.env,
): PersistencePolicy {
  const connectionString = String(environment.BOS_LISTINGS_DATABASE_URL || '').trim();
  if (!connectionString) {
    return { mode: 'json_compat_local', postgres: false, connectionString: null };
  }
  assertPostgresConnectionTarget(connectionString, environment);
  return { mode: 'postgres', postgres: true, connectionString };
}

/**
 * Runs before the listener is opened. In production there is no JSON
 * compatibility fallback: a verified PostgreSQL target plus a durable signing
 * secret are required, otherwise startup fails closed.
 */
export function assertProductionPersistenceReady(
  environment: Record<string, string | undefined> = process.env,
): PersistencePolicy {
  const policy = resolvePersistencePolicy(environment);
  if (environment.NODE_ENV !== 'production') return policy;

  if (!policy.postgres) {
    throw new Error(
      `${PERSISTENCE_ERRORS.jsonStoreDisabled}: configure BOS_LISTINGS_DATABASE_URL with a verified transactional PostgreSQL target before starting the production server.`,
    );
  }

  const hmacSecret = String(environment.BOS_SERVER_HMAC_SECRET || '').trim();
  if (hmacSecret.length < MINIMUM_HMAC_SECRET_LENGTH) {
    throw new Error(
      `${PERSISTENCE_ERRORS.hmacRequired}: BOS_SERVER_HMAC_SECRET must be at least ${MINIMUM_HMAC_SECRET_LENGTH} characters in production.`,
    );
  }

  return policy;
}

/** Runtime guard for the legacy JSON compatibility store. */
export function jsonCompatibilityStoreForbiddenInProduction(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.NODE_ENV === 'production';
}
