import type { Request, Response } from 'express';

export const API_ROUTE_NOT_FOUND = 'API_ROUTE_NOT_FOUND';

/**
 * Terminal handler for an `/api` path that matched no registered route.
 *
 * Without it the request falls through to the SPA document, which answers
 * `200 text/html`: a misspelled or retired endpoint looks healthy in
 * monitoring, and the browser reports a JSON parse error instead of a route
 * error. Mount it after every API registration and before the static/SPA
 * handlers; it never shadows a route registered earlier.
 */
export function apiRouteNotFound(_req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).json({
    ok: false,
    error: API_ROUTE_NOT_FOUND,
    message: 'No API route matches this method and path.',
  });
}
