/** Fail-closed role predicate shared by the server admin route guards. */
export interface AdminSessionClaims {
  userId?: string | null;
  role?: string | null;
}

export function hasAdminAuthorization(
  claims: AdminSessionClaims | null | undefined,
  currentRole: string | null | undefined = claims?.role
): boolean {
  return Boolean(claims?.userId?.trim()) && claims?.role === 'admin' && currentRole === 'admin';
}
