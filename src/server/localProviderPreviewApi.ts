import type express from 'express';
import { assertPostgresConnectionTarget, isLoopbackHostname } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';

/**
 * Local, console-only sessions for visual verification of a *production build*.
 *
 * A production bundle is only served when NODE_ENV=production, while the normal
 * demo route is hard-disabled in that mode — so neither the provider portal nor
 * the admin console could ever be rendered from a built bundle. These routes
 * close that gap without relaxing production auth:
 *
 *   - each route exists only when its own explicit flag is set
 *     (BOS_LOCAL_PROVIDER_PREVIEW / BOS_LOCAL_ADMIN_PREVIEW), *and*
 *     BOS_POSTGRES_LOCAL_TEST_MODE=true (the flag a loopback production run
 *     already needs) *and* the configured database is a verified loopback
 *     target;
 *   - they answer only to loopback callers whose Host header is loopback, so a
 *     tunnel or a public origin cannot reach them;
 *   - each route can only ever sign one hard-coded seeded profile — the provider
 *     route refuses an admin, the admin route refuses a provider, a customer or
 *     anything else — and nothing here creates users or grants.
 *
 * Any real deployment leaves the flags unset, so both routes answer 404 exactly
 * like the disabled demo route.
 */

/**
 * Seeded provider identity in the local demo catalogue. This is a PG owner with
 * approved pg_hostels businesses, so the portal's default PG workspace has real
 * data instead of a module-less or empty account.
 */
const LOCAL_PREVIEW_PROVIDER_ID = '11111111-1111-4111-8111-111111111111';

/** Seeded administrator in the local demo catalogue (role `admin`). */
const LOCAL_PREVIEW_ADMIN_ID = 'c98705a1-a8e8-48a9-96a4-48ea5a710aa4';

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

const ROUTE = '/api/local-provider-preview/session';
const ADMIN_ROUTE = '/api/local-admin-preview/session';

function normalizeHostname(value?: string | null): string {
  let raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    raw = end === -1 ? raw.slice(1) : raw.slice(1, end);
  } else if (raw.split(':').length === 2) {
    // host:port (a bare IPv6 address has more than one colon).
    raw = raw.split(':')[0];
  }
  return raw.replace(/^::ffff:/, '');
}

function flagEnabled(value: string | undefined): boolean {
  const flag = String(value || '').trim().toLowerCase();
  return flag === '1' || flag === 'true';
}

/** Loopback database plus the flag persistencePolicy already requires for it. */
function isLocalDatabaseTarget(
  environment: Record<string, string | undefined>,
  connectionString: string,
): boolean {
  // Matches the wording persistencePolicy requires for loopback database access
  // under NODE_ENV=production.
  if (String(environment.BOS_POSTGRES_LOCAL_TEST_MODE || '').trim() !== 'true') return false;
  if (!connectionString) return false;
  let databaseHost = '';
  try {
    databaseHost = new URL(connectionString).hostname;
  } catch {
    return false;
  }
  // A remote database is never a local preview, whatever the flags say.
  if (!isLoopbackHostname(databaseHost)) return false;
  try {
    assertPostgresConnectionTarget(connectionString, environment);
  } catch {
    return false;
  }
  return true;
}

/** True only for an explicit, fully local provider preview configuration. */
export function isLocalProviderPreviewEnabled(
  environment: Record<string, string | undefined>,
  connectionString: string,
): boolean {
  if (!flagEnabled(environment.BOS_LOCAL_PROVIDER_PREVIEW)) return false;
  return isLocalDatabaseTarget(environment, connectionString);
}

/**
 * True only for an explicit, fully local admin preview configuration. Admin
 * access needs its own flag, so enabling the provider preview never exposes the
 * admin console.
 */
export function isLocalAdminPreviewEnabled(
  environment: Record<string, string | undefined>,
  connectionString: string,
): boolean {
  if (!flagEnabled(environment.BOS_LOCAL_ADMIN_PREVIEW)) return false;
  return isLocalDatabaseTarget(environment, connectionString);
}

/** Loopback socket plus a loopback Host header: no tunnel, no LAN, no proxy. */
export function isLoopbackPreviewRequest(
  remoteAddress?: string | null,
  hostHeader?: string | null,
): boolean {
  const remote = normalizeHostname(remoteAddress);
  const host = normalizeHostname(hostHeader);
  const remoteIsLoopback = remote === '127.0.0.1' || remote === '::1';
  return remoteIsLoopback && LOOPBACK_HOSTNAMES.has(host);
}

type PreviewRole = 'provider' | 'admin';

interface PreviewSessionRoute {
  route: string;
  enabled: boolean;
  /** The single profile this route may sign, and the role it must have. */
  profileId: string;
  expectedRole: PreviewRole;
  notSeededError: string;
  notSeededMessage: string;
  googleSub: string;
  providerId: string;
  fallbackName: string;
  fallbackEmail: string;
}

/**
 * One session route. The profile is read, never written: if the seeded account
 * is missing or has the wrong role the route refuses instead of creating one.
 */
function registerPreviewSessionRoute(
  app: express.Express,
  deps: { signSession: (claims: any) => string },
  pool: { query: (text: string, values: unknown[]) => Promise<{ rows: any[] }> },
  config: PreviewSessionRoute,
): void {
  if (!config.enabled) {
    app.post(config.route, (_req, res) => {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    });
    return;
  }

  app.post(config.route, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isLoopbackPreviewRequest(req.socket.remoteAddress, req.headers.host)) {
      res.status(403).json({ ok: false, error: 'LOOPBACK_ONLY' });
      return;
    }
    try {
      const result = await pool.query(
        `select p.id, p.full_name, p.email, p.role, p.account_status, p.city
           from public.profiles p
          where p.id = $1
          limit 1`,
        [config.profileId],
      );
      const profile = result.rows[0];
      // Exactly this seeded role: the provider route can never sign an admin,
      // and the admin route can never sign a provider or a customer.
      if (!profile || profile.role !== config.expectedRole || profile.account_status !== 'active') {
        res.status(409).json({
          ok: false,
          error: config.notSeededError,
          message: config.notSeededMessage,
        });
        return;
      }
      const claims = {
        userId: String(profile.id),
        supabaseUserId: String(profile.id),
        email: String(profile.email || config.fallbackEmail),
        name: String(profile.full_name || config.fallbackName),
        googleSub: config.googleSub,
        phone: '',
        role: config.expectedRole,
        providerId: config.providerId,
        authProvider: 'google' as const,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
      res.json({
        ok: true,
        sessionToken: deps.signSession(claims),
        user: {
          ...claims,
          id: String(profile.id),
          status: 'active',
          verified: true,
          city: String(profile.city || ''),
          avatarUrl: '',
          joinedAt: '2026-01-01',
          lastLoginAt: new Date().toISOString(),
          totalBookings: 0,
          totalListings: 0,
          walletBalance: 0,
        },
      });
    } catch {
      res.status(500).json({ ok: false, error: 'LOCAL_PREVIEW_SESSION_FAILED' });
    }
  });
}

export function registerLocalProviderPreviewApi(
  app: express.Express,
  deps: { signSession: (claims: any) => string; env?: NodeJS.ProcessEnv },
): void {
  const env = deps.env || process.env;
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  const providerEnabled = isLocalProviderPreviewEnabled(env, connectionString);
  const adminEnabled = isLocalAdminPreviewEnabled(env, connectionString);
  const pool = providerEnabled || adminEnabled
    ? getSharedPostgresPool(connectionString, env)
    : null;

  registerPreviewSessionRoute(
    app,
    deps,
    pool as any,
    {
      route: ROUTE,
      enabled: providerEnabled,
      profileId: LOCAL_PREVIEW_PROVIDER_ID,
      expectedRole: 'provider',
      notSeededError: 'LOCAL_PREVIEW_PROVIDER_NOT_SEEDED',
      notSeededMessage: 'Run the local demo seed so the preview provider exists.',
      googleSub: 'local-provider-preview',
      providerId: 'prov-demo-host',
      fallbackName: 'Demo provider',
      fallbackEmail: 'demo.host@bookourspace.local',
    },
  );

  registerPreviewSessionRoute(
    app,
    deps,
    pool as any,
    {
      route: ADMIN_ROUTE,
      enabled: adminEnabled,
      profileId: LOCAL_PREVIEW_ADMIN_ID,
      expectedRole: 'admin',
      notSeededError: 'LOCAL_PREVIEW_ADMIN_NOT_SEEDED',
      notSeededMessage: 'Run the local demo seed so the preview administrator exists.',
      googleSub: 'local-admin-preview',
      providerId: 'prov-local-admin-preview',
      fallbackName: 'Local admin preview',
      fallbackEmail: 'demo.admin@bookourspace.local',
    },
  );
}
