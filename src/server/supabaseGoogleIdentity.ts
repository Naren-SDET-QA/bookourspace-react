import type { VerifiedAuthProvider } from './authIdentity';

export interface VerifiedSupabaseIdentity {
  id: string;
  email: string;
  googleSub: string;
  provider: VerifiedAuthProvider;
  name?: string;
  avatarUrl?: string;
}

/** The historical Google-only verifier keeps its original public shape. */
export interface VerifiedGoogleIdentity {
  id: string;
  email: string;
  googleSub: string;
  name?: string;
  avatarUrl?: string;
}

const SUPABASE_AUTH_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSupabaseAuthUserId(value: string): boolean {
  return SUPABASE_AUTH_UUID_PATTERN.test(value.trim());
}

/** A legacy profile may be linked once; an established link is immutable. */
export function canLinkSupabaseAuthIdentity(existingId: string | undefined, incomingId: string): boolean {
  if (!isValidSupabaseAuthUserId(incomingId)) return false;
  return !existingId || existingId.trim().toLowerCase() === incomingId.trim().toLowerCase();
}

interface VerifySupabaseIdentityInput {
  projectUrl: string;
  publishableKey: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  /** Providers this call site accepts. Defaults to Google and email OTP. */
  allowedProviders?: VerifiedAuthProvider[];
}

function projectProviders(user: any): Set<string> {
  const providers = new Set<string>();
  const appMetadata = user?.app_metadata;
  if (typeof appMetadata?.provider === 'string') providers.add(appMetadata.provider);
  if (Array.isArray(appMetadata?.providers)) {
    for (const provider of appMetadata.providers) {
      if (typeof provider === 'string') providers.add(provider);
    }
  }
  if (Array.isArray(user?.identities)) {
    for (const identity of user.identities) {
      if (typeof identity?.provider === 'string') providers.add(identity.provider);
      if (typeof identity?.identity_data?.provider === 'string') providers.add(identity.identity_data.provider);
    }
  }
  return providers;
}

/**
 * Verify a Supabase access token with Supabase Auth and return a normalised
 * identity only when the provider is explicitly allowed.
 *
 * The email case requires a confirmed email address. Supabase marks an OTP
 * sign-in as confirmed, so an unconfirmed address can never become a session.
 */
export async function verifySupabaseAppIdentity(
  input: VerifySupabaseIdentityInput
): Promise<VerifiedSupabaseIdentity | null> {
  const projectUrl = input.projectUrl.trim().replace(/\/+$/, '');
  const publishableKey = input.publishableKey.trim();
  const accessToken = input.accessToken.trim();
  const allowed = new Set<VerifiedAuthProvider>(input.allowedProviders || ['google', 'email']);
  if (!projectUrl || !publishableKey || accessToken.length < 20 || accessToken.length > 8192) return null;

  let userUrl: URL;
  try {
    userUrl = new URL(`${projectUrl}/auth/v1/user`);
  } catch {
    return null;
  }
  if (userUrl.protocol !== 'https:' && userUrl.hostname !== 'localhost' && userUrl.hostname !== '127.0.0.1') return null;

  const fetchImpl = input.fetchImpl || fetch;
  try {
    const response = await fetchImpl(userUrl, {
      method: 'GET',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return null;
    const user: any = await response.json();
    const id = typeof user?.id === 'string' ? user.id.trim() : '';
    const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
    const emailVerified = Boolean(user?.email_confirmed_at || user?.email_verified === true);
    // Anonymous Supabase sessions have no verified email identity and must
    // never be exchangeable for an application session.
    if (user?.is_anonymous === true) return null;
    const isSupabaseAuthUuid = isValidSupabaseAuthUserId(id);
    if (!isSupabaseAuthUuid || !emailVerified || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

    const providers = projectProviders(user);
    const provider: VerifiedAuthProvider | null = allowed.has('google') && providers.has('google')
      ? 'google'
      : allowed.has('email') && providers.has('email')
        ? 'email'
        : null;
    if (!provider) return null;

    const googleIdentity = Array.isArray(user?.identities)
      ? user.identities.find((identity: any) => identity?.provider === 'google')
      : null;
    const identityData = googleIdentity?.identity_data || {};
    const userMetadata = user?.user_metadata || {};
    const nameValue = identityData.full_name || identityData.name || userMetadata.full_name || userMetadata.name;
    const avatarValue = identityData.avatar_url || identityData.picture || userMetadata.avatar_url || userMetadata.picture;
    const googleSub = provider === 'google' && typeof identityData.sub === 'string' && identityData.sub.trim()
      ? identityData.sub.trim()
      : `email-${id}`;

    return {
      id,
      email,
      googleSub,
      provider,
      ...(typeof nameValue === 'string' && nameValue.trim() ? { name: nameValue.trim() } : {}),
      ...(typeof avatarValue === 'string' && avatarValue.trim() ? { avatarUrl: avatarValue.trim() } : {}),
    };
  } catch {
    return null;
  }
}

/** Verify a Supabase access token with Supabase Auth and require a Google identity. */
export async function verifySupabaseGoogleIdentity(
  input: Omit<VerifySupabaseIdentityInput, 'allowedProviders'>
): Promise<VerifiedGoogleIdentity | null> {
  const identity = await verifySupabaseAppIdentity({ ...input, allowedProviders: ['google'] });
  if (!identity || identity.provider !== 'google') return null;
  return {
    id: identity.id,
    email: identity.email,
    googleSub: identity.googleSub,
    ...(identity.name ? { name: identity.name } : {}),
    ...(identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
  };
}

/** Verify a Supabase access token that was produced by an email one-time code. */
export async function verifySupabaseEmailIdentity(
  input: Omit<VerifySupabaseIdentityInput, 'allowedProviders'>
): Promise<VerifiedSupabaseIdentity | null> {
  const identity = await verifySupabaseAppIdentity({ ...input, allowedProviders: ['email'] });
  return identity && identity.provider === 'email' ? identity : null;
}

async function callSupabaseRpc<T>(input: {
  projectUrl: string;
  publishableKey: string;
  accessToken: string;
  functionName: string;
  body?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<T | null> {
  const projectUrl = input.projectUrl.trim().replace(/\/+$/, '');
  const publishableKey = input.publishableKey.trim();
  const accessToken = input.accessToken.trim();
  if (!projectUrl || !publishableKey || accessToken.length < 20 || accessToken.length > 8192) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(`${projectUrl}/rest/v1/rpc/${encodeURIComponent(input.functionName)}`);
  } catch {
    return null;
  }
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') return null;
  try {
    const response = await (input.fetchImpl || fetch)(endpoint, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input.body || {}),
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

/** Verify Google identity and consult the protected profile row for current Super Admin scope. */
export async function verifySupabaseSuperAdmin(input: {
  projectUrl: string;
  publishableKey: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<VerifiedGoogleIdentity | null> {
  const identity = await verifySupabaseGoogleIdentity(input);
  if (!identity) return null;
  const isSuperAdmin = await callSupabaseRpc<boolean>({
    ...input,
    functionName: 'is_current_user_super_admin',
  });
  return isSuperAdmin === true ? identity : null;
}

/** Executes privileged user changes using the caller's verified JWT. The RPC checks actor authority and writes its audit row atomically. */
export async function manageSupabaseUserAccess(input: {
  projectUrl: string;
  publishableKey: string;
  accessToken: string;
  targetUserId: string;
  action: 'promote' | 'demote' | 'set_provider' | 'suspend' | 'activate' | 'block' | 'require_verification' | 'verify' | 'unverify';
  reason: string;
  expectedActorUserId?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ id: string; email: string; role: string; account_status: string; verified: boolean; is_super_admin: boolean } | null> {
  if (!isValidSupabaseAuthUserId(input.targetUserId) || input.reason.trim().length < 5) return null;
  const identity = await verifySupabaseGoogleIdentity(input);
  if (!identity || (input.expectedActorUserId && identity.id.toLowerCase() !== input.expectedActorUserId.toLowerCase())) return null;
  const rows = await callSupabaseRpc<Array<{ id: string; email: string; role: string; account_status: string; verified: boolean; is_super_admin: boolean }>>({
    ...input,
    functionName: 'manage_user_access',
    body: { p_target_user_id: input.targetUserId, p_action: input.action, p_reason: input.reason },
  });
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id?.toLowerCase() !== input.targetUserId.toLowerCase()) return null;
  return rows[0];
}

/** List current profile authorization state through the caller's RLS-scoped JWT. */
export async function listSupabaseUserProfiles(input: {
  projectUrl: string;
  publishableKey: string;
  accessToken: string;
  expectedActorUserId?: string;
  fetchImpl?: typeof fetch;
}): Promise<Array<Record<string, unknown>> | null> {
  const identity = await verifySupabaseGoogleIdentity(input);
  if (!identity || (input.expectedActorUserId && identity.id.toLowerCase() !== input.expectedActorUserId.toLowerCase())) return null;
  const currentAdmin = await callSupabaseRpc<boolean>({ ...input, functionName: 'is_current_user_admin' });
  if (currentAdmin !== true) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(`${input.projectUrl.trim().replace(/\/+$/, '')}/rest/v1/profiles`);
    endpoint.search = new URLSearchParams({
      select: 'id,email,full_name,phone,role,account_status,verified,city,created_at',
      order: 'created_at.desc',
      limit: '1000',
    }).toString();
  } catch {
    return null;
  }
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') return null;
  try {
    const response = await (input.fetchImpl || fetch)(endpoint, {
      method: 'GET',
      headers: {
        apikey: input.publishableKey.trim(),
        Authorization: `Bearer ${input.accessToken.trim()}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row.id === 'string') : null;
  } catch {
    return null;
  }
}
