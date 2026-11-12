/**
 * Server-side identity vocabulary shared by every protected module.
 *
 * `authProvider` describes how a Supabase Auth identity was proven, not which
 * company issued it. Google OAuth and a Supabase email OTP both produce a
 * verified Supabase user with an immutable UUID, an email address and a
 * server-checked session. Every module that used to require `google` should
 * accept either provider; the session token itself is still minted only by
 * this server after it re-verifies the Supabase access token.
 */
export type VerifiedAuthProvider = 'google' | 'email';

const SUPABASE_AUTH_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVerifiedAuthProvider(value: unknown): value is VerifiedAuthProvider {
  return value === 'google' || value === 'email';
}

export function isSupabaseAuthUuid(value: unknown): value is string {
  return typeof value === 'string' && SUPABASE_AUTH_UUID_PATTERN.test(value.trim());
}

/**
 * True only for a server-signed session that carries a provider this server
 * verified and a real Supabase Auth UUID. The database RPCs repeat the same
 * check through `auth.uid()`, so a forged claim cannot become a row.
 */
export type VerifiedSupabaseIdentityClaim = {
  authProvider: VerifiedAuthProvider;
  supabaseUserId: string;
};

export function hasVerifiedSupabaseIdentity<
  T extends { authProvider?: string | null; supabaseUserId?: string | null } | null | undefined,
>(identity: T): identity is T & VerifiedSupabaseIdentityClaim {
  return Boolean(
    identity &&
      isVerifiedAuthProvider(identity.authProvider) &&
      isSupabaseAuthUuid(identity.supabaseUserId)
  );
}

/** Human-readable provider used in honest sign-in copy and safe logs. */
export function authProviderLabel(provider: VerifiedAuthProvider): string {
  return provider === 'google' ? 'Google' : 'email one-time code';
}
