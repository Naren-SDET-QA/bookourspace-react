import type { NextFunction, Request, Response } from 'express';

/** Default every API response to non-cacheable; public read routes must opt in explicitly. */
export function apiNoStoreByDefault(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}
