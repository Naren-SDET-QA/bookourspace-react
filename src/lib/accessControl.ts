/**
 * Client-side role gates for protected screens.
 *
 * These decide *what the UI may render*. They are never an authorization
 * boundary: every admin/provider API re-verifies a signed session server-side
 * (see `src/server/adminAuthorization.ts` and the guards in `server.ts`).
 * A forged local role can therefore open a screen shell, but cannot read or
 * mutate protected data.
 */

export type ViewerRole = string | null | undefined;

/** The admin console is admin-only; absent, guest, customer and provider are refused. */
export function canAccessAdminConsole(role: ViewerRole): boolean {
  return role === 'admin';
}

/** The provider portal is for providers (and admins acting on their behalf). */
export function canAccessProviderPortal(role: ViewerRole): boolean {
  return role === 'provider' || role === 'admin';
}

/**
 * Resolve where a protected view should fall back to when access is refused.
 * Unknown or signed-out viewers always land on the public marketplace.
 */
export function protectedViewFallback(role: ViewerRole): 'marketplace' | 'provider_portal' {
  return role === 'provider' ? 'provider_portal' : 'marketplace';
}
