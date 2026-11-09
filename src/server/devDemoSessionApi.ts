import type express from 'express';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';

/**
 * Local-development-only demo identities.
 *
 * This route exists so the seed catalog can be exercised end to end without a
 * hosted Google project. It is hard-disabled in production, requires the demo
 * opt-in, requires a loopback database, and can only sign the two seeded demo
 * accounts. It never creates users or elevates roles.
 */
export function registerDevDemoSessionApi(
  app: express.Express,
  deps: { signSession: (claims: any) => string; env?: NodeJS.ProcessEnv },
): void {
  const env = deps.env || process.env;
  const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
  const enabled =
    env.NODE_ENV !== 'production'
    && env.VITE_ENABLE_DEMO_DATA === 'true'
    && Boolean(connectionString);

  if (!enabled) {
    app.post('/api/dev/demo-session', (_req, res) => {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    });
    return;
  }
  try {
    assertPostgresConnectionTarget(connectionString, env);
  } catch {
    app.post('/api/dev/demo-session', (_req, res) => {
      res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    });
    return;
  }

  const pool = getSharedPostgresPool(connectionString, env);
  const IDS = {
    host: 'a11a0000-1111-4111-8111-000000000001',
    guest: 'a11a0000-1111-4111-8111-000000000002',
  } as const;

  app.post('/api/dev/demo-session', async (req, res) => {
    const role = req.body?.role === 'host' ? 'host' : req.body?.role === 'guest' ? 'guest' : '';
    if (!role) {
      res.status(400).json({ ok: false, error: 'INVALID_ROLE' });
      return;
    }
    try {
      const result = await pool.query(
        `select p.id, p.full_name, p.email, p.role, p.account_status, p.city, p.verified
           from public.profiles p
          where p.id = $1
          limit 1`,
        [IDS[role]],
      );
      const profile = result.rows[0];
      const expectedRole = role === 'host' ? 'provider' : 'customer';
      if (!profile || profile.role !== expectedRole || profile.account_status !== 'active') {
        res.status(409).json({ ok: false, error: 'DEMO_PROFILE_NOT_SEEDED', message: 'Run npm run dev once to seed the local demo stays database.' });
        return;
      }
      const claims = {
        userId: String(profile.id),
        supabaseUserId: String(profile.id),
        email: String(profile.email || `demo.${role}@bookourspace.local`),
        name: String(profile.full_name || `Demo ${role}`),
        googleSub: `demo-${role}`,
        phone: '',
        role: expectedRole,
        ...(expectedRole === 'provider' ? { providerId: `prov-demo-${role}` } : {}),
        authProvider: 'google' as const,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
      const sessionToken = deps.signSession(claims);
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        sessionToken,
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
      res.status(500).json({ ok: false, error: 'DEMO_SESSION_FAILED' });
    }
  });
}
