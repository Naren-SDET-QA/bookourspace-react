/**
 * Express adapter for the shared authorization engine.
 *
 * Routes never compare roles themselves: they describe the category, action and
 * resource, and this middleware makes the single engine call. Returning `null`
 * from the resolver means "this path is not governed here", which is how the
 * public marketplace and health endpoints stay open; it is never a silent allow
 * for a path that names a category.
 */

import type express from 'express';
import {
  authorize,
  type AccessActor,
  type AccessDecision,
  type AccessResource,
} from './engine';

export interface AuthorizationContext {
  actor: AccessActor | null;
  /** `null` means the path is not mapped to a category. */
  category: string | null;
  action: string;
  resource?: AccessResource | null;
}

export type AuthorizationResolver = (
  request: express.Request,
) => AuthorizationContext | null | Promise<AuthorizationContext | null>;

export interface AuthorizationMiddlewareOptions {
  /** Set false to deny instead of skipping an unmapped path. */
  allowUnmapped?: boolean;
}

/**
 * Build a middleware that authorizes one request.
 *
 * On success the decision is exposed as `res.locals.accessDecision` so a handler
 * can log the reason without recomputing it.
 */
export function createAuthorizationMiddleware(
  resolve: AuthorizationResolver,
  options: AuthorizationMiddlewareOptions = {},
): express.RequestHandler {
  return async (request, response, next) => {
    let context: AuthorizationContext | null;
    try {
      context = await resolve(request);
    } catch {
      response.status(503).json({ ok: false, error: 'ACCESS_CONTROL_UNAVAILABLE' });
      return;
    }

    if (!context || !context.category) {
      if (options.allowUnmapped === false) {
        response.status(403).json({ ok: false, error: 'ACCESS_CATEGORY_REQUIRED' });
        return;
      }
      next();
      return;
    }

    const decision: AccessDecision = authorize(
      context.actor,
      context.category,
      context.action,
      context.resource ?? null,
    );
    if (!decision.ok) {
      response.status(decision.status).json({
        ok: false,
        error: decision.error,
        category: decision.category,
      });
      return;
    }
    (response.locals as Record<string, unknown>).accessDecision = decision;
    next();
  };
}

/** Admin-only gate for the user-management API. */
export function createAdminAccessMiddleware(
  resolveActor: (request: express.Request) => Promise<AccessActor | null>,
): express.RequestHandler {
  return async (request, response, next) => {
    let actor: AccessActor | null = null;
    try {
      actor = await resolveActor(request);
    } catch {
      response.status(503).json({ ok: false, error: 'ACCESS_CONTROL_UNAVAILABLE' });
      return;
    }
    if (!actor) {
      response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (!(actor.isSuperAdmin === true || actor.role === 'admin') || (actor.accountStatus || 'active') !== 'active') {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }
    (response.locals as Record<string, unknown>).accessActor = actor;
    next();
  };
}
