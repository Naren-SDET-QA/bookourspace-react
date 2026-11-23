/**
 * HTTP surface for the centralized user-management engine.
 *
 * Every admin route below resolves the caller from the signed session, then
 * re-reads the role and account status from Postgres and checks them with the
 * shared engine (`canManageAccess`). A forged local role cannot reach these
 * endpoints, and a suspended administrator loses access immediately.
 *
 * The self-service route (`GET /api/access/me`) answers with the caller's own
 * effective permissions by asking the engine about every action in every
 * category, so the browser never invents a permission.
 */

import type express from 'express';
import { logSafeError } from '../server/safeLogging';
import { ACCESS_CATEGORIES } from './catalog';
import { authorize, canManageAccess, type AccessActor } from './engine';
import { checkPermissionHealth, buildRepairPlan } from './health';
import { AccessControlError, type AccessControlRepository } from './repository';

export interface AccessControlSessionClaims {
  userId?: string | null;
  supabaseUserId?: string | null;
  role?: string | null;
  email?: string | null;
}

export interface AccessControlApiDependencies {
  repository: AccessControlRepository | null;
  verifySession: (request: express.Request) => AccessControlSessionClaims | null;
  env?: NodeJS.ProcessEnv;
}

function noStore(response: express.Response): void {
  response.setHeader('cache-control', 'no-store');
}

function sendError(response: express.Response, error: unknown): void {
  if (error instanceof AccessControlError) {
    response.status(error.status).json({ ok: false, error: error.code, message: error.message });
    return;
  }
  logSafeError('access-control', 'unexpected', error);
  response.status(500).json({ ok: false, error: 'ACCESS_CONTROL_ERROR' });
}

export function registerAccessControlApi(
  app: express.Express,
  dependencies: AccessControlApiDependencies,
): void {
  const { repository, verifySession } = dependencies;

  const resolveActor = async (request: express.Request): Promise<AccessActor | null> => {
    const claims = verifySession(request);
    const userId = String(claims?.supabaseUserId || claims?.userId || '').trim();
    if (!userId) return null;
    if (!repository) return null;
    return repository.actorFor(userId);
  };

  const requireAdminActor = async (
    request: express.Request,
    response: express.Response,
  ): Promise<AccessActor | null> => {
    const claims = verifySession(request);
    if (!claims) {
      response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return null;
    }
    if (!repository) {
      response.status(503).json({ ok: false, error: 'ACCESS_CONTROL_UNAVAILABLE' });
      return null;
    }
    const actor = await repository.actorFor(String(claims.supabaseUserId || claims.userId || ''));
    if (!canManageAccess(actor)) {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return null;
    }
    return actor;
  };

  // -- signed-in caller's own effective permissions -------------------------
  app.get('/api/access/me', async (request, response) => {
    noStore(response);
    const actor = await resolveActor(request);
    if (!actor) {
      response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (repository) {
      const account = await repository.getAccount(String(actor.userId)).catch(() => null);
      if (account) {
        actor.customerGrants = account.customerGrants.map((grant) => ({
          module_key: grant.category,
          allowed_sections: grant.sections,
          allowed_actions: grant.actions,
          expires_at: grant.expiresAt,
        }));
        // Approval and enablement come from the database, never from the
        // caller: an unapproved business stays refused here too.
        actor.businesses = account.businesses.map((business) => ({
          businessId: business.businessId,
          moduleType: business.moduleType,
          approvalStatus: business.approvalStatus,
          isEnabled: business.isEnabled,
          moduleEnabled: business.moduleEnabled,
          moduleApprovalStatus: business.moduleApprovalStatus,
          memberRole: business.memberRole,
          memberModules: business.allowedModules,
          memberSections: business.sections,
          memberActions: business.actions,
        }));
      }
    }

    const categories = ACCESS_CATEGORIES.map((category) => {
      const allowed = ['view', 'create', 'edit', 'delete', 'approve', 'manage'].filter((action) =>
        authorize(actor, category.key, action).ok,
      );
      return {
        key: category.key,
        label: category.label,
        actions: allowed,
      };
    });
    response.json({
      ok: true,
      role: actor.role,
      accountStatus: actor.accountStatus,
      isSuperAdmin: actor.isSuperAdmin === true,
      categories,
    });
  });

  // -- admin: search accounts ----------------------------------------------
  app.get('/api/admin/access-control/accounts', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    try {
      const result = await repository.listAccounts({
        query: typeof request.query.q === 'string' ? request.query.q : '',
        role: typeof request.query.role === 'string' ? request.query.role : undefined,
        status: typeof request.query.status === 'string' ? request.query.status : undefined,
        limit: Number(request.query.limit) || 25,
        offset: Number(request.query.offset) || 0,
      });
      response.json({ ok: true, ...result });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/access-control/accounts/:userId', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    try {
      response.json({ ok: true, account: await repository.getAccount(String(request.params.userId)) });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.put('/api/admin/access-control/accounts/:userId/permissions', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    const body = (request.body || {}) as { categories?: unknown };
    if (!Array.isArray(body.categories)) {
      response.status(400).json({ ok: false, error: 'CATEGORIES_ARRAY_REQUIRED' });
      return;
    }
    try {
      const account = await repository.setCategoryPermissions(
        actor,
        String(request.params.userId),
        body.categories as Array<{ category: string; actions: string[]; sections?: string[]; expiresAt?: string | null }>,
      );
      response.json({ ok: true, account });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/access-control/accounts/:userId/complete-access', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    const body = (request.body || {}) as { categories?: unknown };
    try {
      const categories = Array.isArray(body.categories) ? body.categories.map(String) : null;
      const account = await repository.grantCompleteAccess(actor, String(request.params.userId), categories);
      response.json({ ok: true, account });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/access-control/accounts/:userId/view-only', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    const body = (request.body || {}) as { categories?: unknown };
    try {
      const categories = Array.isArray(body.categories) ? body.categories.map(String) : null;
      const account = await repository.restoreViewOnly(actor, String(request.params.userId), categories);
      response.json({ ok: true, account });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/access-control/accounts/:userId/status', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    const body = (request.body || {}) as { status?: unknown; reason?: unknown };
    const status = String(body.status || '');
    if (!['active', 'suspended', 'revoked'].includes(status)) {
      response.status(400).json({ ok: false, error: 'INVALID_ACCOUNT_STATUS' });
      return;
    }
    try {
      const account = await repository.setAccountStatus(
        actor,
        String(request.params.userId),
        status as 'active' | 'suspended' | 'revoked',
        typeof body.reason === 'string' ? body.reason : null,
      );
      response.json({ ok: true, account });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/access-control/accounts/:userId/history', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    try {
      const history = await repository.history(String(request.params.userId));
      response.json({ ok: true, history });
    } catch (error) {
      sendError(response, error);
    }
  });

  // -- admin: health and repairs -------------------------------------------
  const currentReport = async () => {
    if (!repository) throw new AccessControlError('ACCESS_CONTROL_UNAVAILABLE', 503);
    const snapshot = await repository.loadHealthSnapshot();
    return checkPermissionHealth(snapshot);
  };

  app.get('/api/admin/access-control/health', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    try {
      const report = await currentReport();
      response.json({ ok: true, report, plan: buildRepairPlan(report) });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/access-control/health/repairs/preview', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    try {
      const report = await currentReport();
      const preview = await repository.createRepair(actor, report);
      response.json({
        ok: true,
        repairId: preview.id,
        status: preview.status,
        report,
        plan: buildRepairPlan(report),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/access-control/health/repairs/:repairId/apply', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    const body = (request.body || {}) as { approveDestructive?: unknown };
    try {
      const result = await repository.applyRepair(actor, String(request.params.repairId), {
        approveDestructive: body.approveDestructive === true,
      });
      response.json({ ok: true, ...result });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/access-control/health/repairs/:repairId/rollback', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    try {
      const result = await repository.rollbackRepair(actor, String(request.params.repairId));
      response.json({ ok: true, ...result });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/access-control/health/repairs', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor || !repository) return;
    try {
      const repairs = await repository.listRepairs(20);
      response.json({ ok: true, repairs });
    } catch (error) {
      sendError(response, error);
    }
  });

  // A category lookup for the console; purely descriptive, never an authority.
  app.get('/api/admin/access-control/catalog', async (request, response) => {
    noStore(response);
    const actor = await requireAdminActor(request, response);
    if (!actor) return;
    response.json({
      ok: true,
      categories: ACCESS_CATEGORIES.map((category) => ({
        key: category.key,
        label: category.label,
        emoji: category.emoji,
        providerModule: category.providerModule,
        active: category.active,
        sections: category.sections,
      })),
    });
  });

}
