import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import {
  MarketplaceListing,
  Booking,
  Enquiry,
  Review,
  PaymentTransaction,
  UserRole,
} from '../types/marketplace';
import { ensureListingPriceBreakdown } from '../data/listingPrice';
import { resolveSupabaseEnvironment } from './supabaseConfig';
import { NATIVE_AUTH_REDIRECT_URL } from '../mobile/nativeOAuthCallback';

// Browser and server share one strict resolver. It requires an explicit URL,
// matching project ref, a local development allowlist, and a public key.
// In particular, no project is inferred from an ID and the designated dev
// project is not rejected merely because an older config once called it prod.
const browserSupabaseConfig = resolveSupabaseEnvironment(
  typeof import.meta !== 'undefined' ? import.meta.env : {},
);

export const SUPABASE_CONFIG_ERRORS: string[] = browserSupabaseConfig.errors;
export const SUPABASE_PROJECT_ID = browserSupabaseConfig.projectId;
export const SUPABASE_PROJECT_URL = browserSupabaseConfig.projectUrl;
export const SUPABASE_AUTH_CALLBACK_URL = browserSupabaseConfig.authCallbackUrl;
const rawSupabaseUrl = browserSupabaseConfig.projectUrl;
const rawPublishableKey = browserSupabaseConfig.publishableKey;

if (SUPABASE_CONFIG_ERRORS.length > 0) {
  console.error(`[Supabase Configuration] Browser client disabled: ${SUPABASE_CONFIG_ERRORS.join(' ')}`);
} else if (!browserSupabaseConfig.isConfigured) {
  console.warn('[Supabase Configuration] Live Supabase is disabled. No project is selected implicitly.');
}

export const isSupabaseConfigured: boolean = browserSupabaseConfig.isConfigured;

/**
 * Whether server-side payment verification is available in this build.
 * Kept false by default so the UI never claims a payment was verified
 * unless the deployment explicitly enables the verified gateway.
 */
export const PAYMENT_VERIFICATION_AVAILABLE = false;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawSupabaseUrl, rawPublishableKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        // Native app callbacks arrive through Capacitor's appUrlOpen event and
        // are exchanged explicitly, while the existing browser callback keeps
        // Supabase's automatic URL detection.
        detectSessionInUrl: !Capacitor.isNativePlatform(),
      },
    })
  : null;

export interface SupabaseProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  account_status?: string;
  avatar_url?: string | null;
  cover_url?: string | null;
}

/**
 * Helper to require an authenticated user session before performing RLS write operations.
 */
export async function requireAuthenticatedUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

export async function getCurrentSupabaseSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ============================================================================
// AUTHENTICATION & PROFILE OPERATIONS (RLS PROTECTED)
// ============================================================================

export async function signInWithEmailPassword(email: string, password: string) {
  void email;
  void password;
  throw new Error('Password sign-in is disabled. Use Google Sign-In.');
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  fullName: string,
  role: UserRole = 'customer',
  phone?: string
) {
  void email;
  void password;
  void fullName;
  void role;
  void phone;
  throw new Error('Email registration is disabled. Use Google Sign-In.');
}

export async function signInWithMagicLinkOtp(email: string) {
  void email;
  throw new Error('Email OTP sign-in is disabled. Use Google Sign-In.');
}

export async function signOutSupabase() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function fetchRlsProfile(): Promise<SupabaseProfile | null> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, role, avatar_url, cover_url')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    email: data.email || user.email || '',
    full_name: data.full_name || user.user_metadata?.full_name || 'Marketplace User',
    phone: data.phone || user.user_metadata?.phone || '',
    role: (data.role as UserRole) || 'customer',
    avatar_url: data.avatar_url || null,
    cover_url: data.cover_url || null,
  };
}

export async function upsertRlsProfile(updates: {
  fullName?: string;
  phone?: string;
  bio?: string;
}): Promise<{
  /** The durable RLS-protected profile row. */
  profile: SupabaseProfile | null;
  /** Whether the Google/Supabase account metadata was updated. */
  accountUpdated: boolean;
}> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return { profile: null, accountUpdated: false };

  const nextName = updates.fullName ?? user.user_metadata?.full_name ?? 'Marketplace User';
  const nextPhone = updates.phone ?? user.user_metadata?.phone ?? '';

  const accountUpdate = await supabase.auth.updateUser({
    data: {
      full_name: nextName,
      phone: nextPhone,
      ...(updates.bio !== undefined ? { bio: updates.bio.slice(0, 240) } : {}),
    },
  });
  const accountUpdated = !accountUpdate.error;

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: nextName, phone: nextPhone || null, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id, email, full_name, phone, role, avatar_url, cover_url')
    .maybeSingle();

  if (error) return { profile: null, accountUpdated };
  let profile = data;
  if (!profile) {
    const repaired = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        full_name: nextName,
        phone: nextPhone || null,
      })
      .select('id, email, full_name, phone, role, avatar_url, cover_url')
      .maybeSingle();
    if (repaired.error || !repaired.data) return { profile: null, accountUpdated };
    profile = repaired.data;
  }
  return {
    accountUpdated,
    profile: {
      id: profile.id,
      email: profile.email || user.email || '',
      full_name: profile.full_name,
      phone: profile.phone || '',
      role: profile.role as UserRole,
    },
  };
}

// ============================================================================
// RLS-GOVERNED DATABASE OPERATIONS (AUTHENTICATED ACCESS)
// ============================================================================

export async function fetchRlsListings(): Promise<MarketplaceListing[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, created_at'
    )
    .order('created_at', { ascending: false });

  if (error || !data) {
    return null;
  }

  return data
    .map((row: any) => {
      const base = (row.payload || {}) as MarketplaceListing;
      if (!base.id && !row.id) return null;
      return ensureListingPriceBreakdown({
        ...base,
        id: row.id || base.id,
        title: row.title || base.title,
        categoryId: row.category_id || base.categoryId,
        subcategory: row.subcategory || base.subcategory,
        entityType: row.entity_type || base.entityType,
        price: Number(row.price ?? base.price ?? 0),
        priceUnit: row.price_unit || base.priceUnit,
        status: row.status || base.status || 'active',
      });
    })
    .filter(Boolean) as MarketplaceListing[];
}

export async function insertRlsListing(listing: MarketplaceListing): Promise<boolean> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return false;

  const { error } = await supabase.from('listings').upsert(
    {
      id: listing.id,
      owner_id: user.id,
      title: listing.title,
      category_id: listing.categoryId,
      subcategory: listing.subcategory,
      entity_type: listing.entityType,
      price: listing.price,
      price_unit: listing.priceUnit,
      status: listing.status,
      payload: listing,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  return !error;
}

export async function updateRlsListing(
  id: string,
  updates: Partial<MarketplaceListing>,
  fullUpdatedListing?: MarketplaceListing
): Promise<boolean> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return false;

  const updateRow: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.title !== undefined) updateRow.title = updates.title;
  if (updates.categoryId !== undefined) updateRow.category_id = updates.categoryId;
  if (updates.subcategory !== undefined) updateRow.subcategory = updates.subcategory;
  if (updates.entityType !== undefined) updateRow.entity_type = updates.entityType;
  if (updates.price !== undefined) updateRow.price = updates.price;
  if (updates.priceUnit !== undefined) updateRow.price_unit = updates.priceUnit;
  if (updates.status !== undefined) updateRow.status = updates.status;
  if (fullUpdatedListing) updateRow.payload = fullUpdatedListing;

  const { data, error } = await supabase
    .from('listings')
    .update(updateRow)
    .eq('id', id)
    // RLS decides whether this owner/admin may update the record. Requiring a
    // returned id prevents a zero-row RLS result from appearing successful.
    .select('id')
    .maybeSingle();

  return !error && data?.id === id;
}

export async function deleteRlsListing(id: string): Promise<boolean> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return false;

  const { data, error } = await supabase
    .from('listings')
    // Deactivate instead of deleting: bookings, reviews and audit history may
    // still reference this listing. RLS remains the owner/admin boundary.
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  return !error && data?.id === id;
}

export async function fetchRlsBookings(): Promise<Booking[] | null> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) return null;

  return data.map((row: any) => ({
    ...(row.payload || {}),
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    providerId: row.provider_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    scheduledDate: row.scheduled_date,
    timeSlot: row.scheduled_time,
    totalAmount: Number(row.amount ?? 0),
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : 'Just now',
  }));
}

export async function insertRlsBooking(booking: Booking): Promise<boolean> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return false;

  const { error } = await supabase.from('bookings').upsert(
    {
      id: booking.id,
      user_id: user.id,
      listing_id: booking.listingId,
      listing_title: booking.listingTitle,
      provider_id: booking.providerId,
      customer_name: booking.customerName,
      customer_phone: booking.customerPhone,
      scheduled_date: booking.scheduledDate,
      scheduled_time: booking.timeSlot,
      amount: booking.totalAmount,
      status: booking.status,
      payload: booking,
    },
    { onConflict: 'id' }
  );

  return !error;
}

export async function fetchRlsEnquiries(): Promise<Enquiry[] | null> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return null;

  const { data, error } = await supabase
    .from('enquiries')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) return null;

  return data.map((row: any) => ({
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    providerId: row.provider_id,
    customerId: row.user_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    message: row.message,
    status: row.status,
    timestamp: row.created_at ? new Date(row.created_at).toLocaleTimeString() : 'Just now',
  }));
}

export async function insertRlsEnquiry(enquiry: Enquiry): Promise<boolean> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return false;

  const { error } = await supabase.from('enquiries').upsert(
    {
      id: enquiry.id,
      user_id: user.id,
      listing_id: enquiry.listingId,
      listing_title: enquiry.listingTitle,
      provider_id: enquiry.providerId,
      customer_name: enquiry.customerName,
      customer_phone: enquiry.customerPhone,
      message: enquiry.message,
      status: enquiry.status,
    },
    { onConflict: 'id' }
  );

  return !error;
}

export async function fetchRlsReviews(): Promise<Review[] | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return null;

  return data.map((row: any) => ({
    ...(row.payload || {}),
    id: row.id,
    userId: row.user_id,
    listingId: row.listing_id,
    customerName: row.customer_name,
    customerAvatar:
      row.payload?.customerAvatar ||
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    rating: Number(row.rating ?? 5),
    comment: row.comment,
    date: row.created_at ? new Date(row.created_at).toLocaleDateString() : 'Just now',
    // The current schema has no server-owned verified-customer field. A value
    // inside user-writable payload JSON is not proof of a verified purchase.
    verifiedCustomer: false,
  }));
}

export async function insertRlsReview(review: Review): Promise<boolean> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return false;

  const { error } = await supabase.from('reviews').upsert(
    {
      id: review.id,
      user_id: user.id,
      listing_id: review.listingId,
      customer_name: review.customerName,
      rating: review.rating,
      comment: review.comment,
      payload: review,
    },
    { onConflict: 'id' }
  );

  return !error;
}

export async function fetchRlsTransactions(): Promise<PaymentTransaction[] | null> {
  // The current client-writable transactions table has no immutable server
  // settlement evidence. Do not surface its `success` status as payment proof.
  return null;
}

export async function insertRlsTransaction(_tx: PaymentTransaction): Promise<boolean> {
  // Financial records must be written by a trusted server/provider webhook.
  // The current RLS table allows authenticated users to submit their own rows.
  return false;
}

export async function fetchRlsFavorites(): Promise<string[] | null> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return null;

  const { data, error } = await supabase
    .from('user_favorites')
    .select('listing_id')
    .eq('user_id', user.id);

  if (error || !data) return null;
  return data.map((row: any) => String(row.listing_id));
}

export async function syncRlsFavorite(listingId: string, add: boolean): Promise<boolean> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return false;

  if (add) {
    const { error } = await supabase.from('user_favorites').upsert(
      {
        user_id: user.id,
        listing_id: listingId,
      },
      { onConflict: 'user_id,listing_id' }
    );
    return !error;
  } else {
    const { error } = await supabase
      .from('user_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('listing_id', listingId);
    return !error;
  }
}

export async function upsertRlsModuleConfig(
  moduleKey: string,
  configPayload: unknown
): Promise<boolean> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return false;

  const { error } = await supabase.from('user_module_configs').upsert(
    {
      user_id: user.id,
      module_key: moduleKey,
      config_payload: configPayload ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,module_key' }
  );

  return !error;
}

export async function fetchRlsModuleConfigs(): Promise<Record<string, unknown> | null> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) return null;

  const { data, error } = await supabase
    .from('user_module_configs')
    .select('module_key, config_payload')
    .eq('user_id', user.id);

  if (error || !data) return null;

  const map: Record<string, unknown> = {};
  for (const row of data) {
    if (row.module_key) {
      map[String(row.module_key)] = row.config_payload;
    }
  }
  return map;
}

/**
 * Syncs the authenticated user's session bookings, enquiries, favorites, custom listings,
 * and all modular system / admin configurations into Supabase under RLS (`auth.uid()`).
 */
export async function syncLocalAccountDataToSupabase(payload: {
  customListings: MarketplaceListing[];
  bookings: Booking[];
  enquiries: Enquiry[];
  favorites: string[];
  transactions: PaymentTransaction[];
}): Promise<{ syncedCount: number }> {
  const user = await requireAuthenticatedUser();
  if (!supabase || !user) {
    throw new Error('Please sign in first to sync data with your account.');
  }

  let syncedCount = 0;

  for (const item of payload.customListings) {
    const ok = await insertRlsListing(item);
    if (ok) syncedCount++;
  }
  for (const bk of payload.bookings) {
    const ok = await insertRlsBooking(bk);
    if (ok) syncedCount++;
  }
  for (const enq of payload.enquiries) {
    const ok = await insertRlsEnquiry(enq);
    if (ok) syncedCount++;
  }
  for (const favId of payload.favorites) {
    const ok = await syncRlsFavorite(favId, true);
    if (ok) syncedCount++;
  }
  // Deliberately do not migrate browser-supplied transactions into the ledger.

  // Also sync all active app module configurations stored in browser state
  const moduleKeysToSync = [
    'bos_modular_templates_v5',
    'bos_dynamic_admin_features_v1',
    'bos_universal_plug_and_play_elements_v1',
    'bos_live_page_editor_published_v1',
    'bos_admin_theme_settings_v1',
  ];
  for (const key of moduleKeysToSync) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ok = await upsertRlsModuleConfig(key, parsed);
        if (ok) syncedCount++;
      }
    } catch {
      // ignore invalid JSON
    }
  }

  return { syncedCount };
}

/**
 * Real-time subscription to RLS-enabled tables so UI stays in sync across tabs/devices.
 */
let rlsRealtimeChannelSequence = 0;

export function subscribeToRlsChanges(onRefresh: () => void): () => void {
  if (!supabase) return () => {};

  // A channel name is a realtime topic. Reusing one after subscribe() throws
  // "cannot add postgres_changes callbacks ... after subscribe()", which can
  // unmount the app when two components subscribe. Give every subscription its
  // own topic.
  rlsRealtimeChannelSequence += 1;
  const channel = supabase
    .channel(`bos-rls-realtime-sync-${rlsRealtimeChannelSequence}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => onRefresh())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => onRefresh())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'enquiries' }, () => onRefresh())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => onRefresh())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_module_configs' }, () => onRefresh())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seat_locks' }, () => onRefresh())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => onRefresh())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => onRefresh())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_config_versions' }, () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bos-live-page-config-refresh'));
      }
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ============================================================================
// GOOGLE-ONLY OAUTH SESSION & AUTHORITATIVE TOKEN HELPERS
// ============================================================================

export interface AuthoritativeGoogleUser {
  id: string;
  googleSub: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: 'active' | 'suspended' | 'blocked' | 'pending_verification';
  verified: boolean;
  city: string;
  avatarUrl?: string;
  joinedAt: string;
  lastLoginAt: string;
  totalBookings: number;
  totalListings: number;
  walletBalance: number;
  authProvider: 'google';
}

const SESSION_TOKEN_STORAGE_KEY = 'bos_session_token_v1';
const GOOGLE_AUTH_USER_STORAGE_KEY = 'bos_google_auth_user_v1';

export function getStoredAuthoritativeSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthoritativeSession(
  token: string | null,
  user: AuthoritativeGoogleUser | null
): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
    if (user) {
      localStorage.setItem(GOOGLE_AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(GOOGLE_AUTH_USER_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getStoredGoogleAuthUser(): AuthoritativeGoogleUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GOOGLE_AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthoritativeGoogleUser;
  } catch {
    return null;
  }
}

export function buildAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
  const token = getStoredAuthoritativeSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Initiates Google OAuth via Supabase (when configured) or via `/api/auth/google/authenticate`
 * and `/api/auth/google/url` popup flow. Enforces Google-only authentication, auto-registration
 * for new users, existing user sign-in, role-based routing, and account blocking checks.
 */
export async function authenticateWithGoogleServer(params: {
  accessToken?: string;
  email?: string;
  name?: string;
  googleSub?: string;
  avatarUrl?: string;
  phone?: string;
  city?: string;
  requestedRole?: UserRole;
  allowRoleChange?: boolean;
}): Promise<{
  ok: boolean;
  httpStatus: number;
  isNewUser?: boolean;
  user?: AuthoritativeGoogleUser;
  sessionToken?: string;
  redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
  error?: string;
  message?: string;
}> {
  if (!params.accessToken?.trim()) {
    return {
      ok: false,
      httpStatus: 401,
      error: 'VERIFIED_GOOGLE_SESSION_REQUIRED',
      message: 'Complete Google sign-in before requesting an application session.',
    };
  }
  try {
    const resp = await fetch('/api/auth/google/authenticate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken.trim()}`,
      },
      body: JSON.stringify({
        supabaseProjectId: SUPABASE_PROJECT_ID,
      }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok && data.user && data.sessionToken) {
      setStoredAuthoritativeSession(data.sessionToken, data.user);
    } else if (resp.status === 403 && data.error === 'ACCOUNT_BLOCKED') {
      setStoredAuthoritativeSession(null, null);
    }
    return {
      ok: resp.ok && Boolean(data.ok),
      httpStatus: resp.status,
      isNewUser: data.isNewUser,
      user: data.user,
      sessionToken: data.sessionToken,
      redirectTarget: data.redirectTarget,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 500,
      error: 'NETWORK_ERROR',
      message: err?.message || 'Google authentication failed.',
    };
  }
}

export async function fetchGoogleOAuthConfig(requestedRole: UserRole = 'customer'): Promise<{
  ok: boolean;
  url?: string;
  supabaseProjectId?: string;
  supabaseUrl?: string;
  supabaseAuthorizeUrl?: string;
  supabaseAuthCallbackUrl?: string;
  googleCloudConfigured?: boolean;
  supabaseConfigured?: boolean;
  callbackUrl?: string;
  devCallbackUrl?: string;
  sharedCallbackUrl?: string;
}> {
  try {
    const resp = await fetch(`/api/auth/google/url?role=${encodeURIComponent(requestedRole)}`);
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      url: data.url,
      supabaseProjectId: data.supabaseProjectId || SUPABASE_PROJECT_ID,
      supabaseUrl: data.supabaseUrl || SUPABASE_PROJECT_URL,
      supabaseAuthorizeUrl: data.supabaseAuthorizeUrl,
      supabaseAuthCallbackUrl: data.supabaseAuthCallbackUrl || SUPABASE_AUTH_CALLBACK_URL,
      googleCloudConfigured: Boolean(data.googleCloudConfigured),
      supabaseConfigured: isSupabaseConfigured || Boolean(data.supabaseConfigured),
      callbackUrl: data.callbackUrl,
      devCallbackUrl: data.devCallbackUrl,
      sharedCallbackUrl: data.sharedCallbackUrl,
    };
  } catch {
    return { ok: false };
  }
}

export async function signInWithSupabaseGoogleOAuth(requestedRole: UserRole = 'customer'): Promise<{
  ok: boolean;
  url?: string;
  supabaseAuthorizeUrl?: string;
  error?: string;
}> {
  const redirectTo = Capacitor.isNativePlatform()
    ? NATIVE_AUTH_REDIRECT_URL
    : `${window.location.origin}/auth/callback?role=${encodeURIComponent(requestedRole)}`;
  const directSupabaseAuthorizeUrl = `${SUPABASE_PROJECT_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
    redirectTo
  )}&access_type=offline&prompt=select_account`;

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });
    if (!error && data?.url) {
      return { ok: true, url: data.url, supabaseAuthorizeUrl: directSupabaseAuthorizeUrl };
    }
  }

  return {
    ok: false,
    supabaseAuthorizeUrl: directSupabaseAuthorizeUrl,
    error: 'Supabase publishable key not yet injected in frontend environment.',
  };
}

export async function verifyProtectedRouteAccess(
  routeTarget: 'marketplace' | 'provider_portal' | 'admin_console' | 'profile'
): Promise<{
  ok: boolean;
  allowed: boolean;
  httpStatus: number;
  role?: UserRole;
  redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
  error?: string;
  message?: string;
}> {
  try {
    const resp = await fetch(`/api/auth/protected/${encodeURIComponent(routeTarget)}`, {
      headers: buildAuthHeaders(),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      allowed: Boolean(data.allowed),
      httpStatus: resp.status,
      role: data.role,
      redirectTarget: data.redirectTarget,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      allowed: false,
      httpStatus: 500,
      error: 'NETWORK_ERROR',
      message: err?.message || 'Failed to verify protected route access.',
    };
  }
}

export async function fetchCurrentAuthSession(): Promise<{
  ok: boolean;
  authenticated: boolean;
  httpStatus: number;
  blocked?: boolean;
  user?: AuthoritativeGoogleUser;
  redirectTarget?: 'marketplace' | 'provider_portal' | 'admin_console';
  error?: string;
  message?: string;
}> {
  const token = getStoredAuthoritativeSessionToken();
  if (!token) {
    return { ok: true, authenticated: false, httpStatus: 401 };
  }
  try {
    const resp = await fetch('/api/auth/me', {
      headers: buildAuthHeaders(),
    });
    const data = await resp.json();
    if (resp.status === 403 && data.error === 'ACCOUNT_BLOCKED') {
      setStoredAuthoritativeSession(null, null);
      return {
        ok: false,
        authenticated: false,
        httpStatus: 403,
        blocked: true,
        error: data.error,
        message: data.message || 'Your account has been suspended or blocked by an administrator.',
      };
    }
    if (resp.ok && data.ok && data.user) {
      setStoredAuthoritativeSession(data.sessionToken || token, data.user);
      return {
        ok: true,
        authenticated: true,
        httpStatus: 200,
        user: data.user,
        redirectTarget: data.redirectTarget,
      };
    }
    return {
      ok: false,
      authenticated: false,
      httpStatus: resp.status,
      error: data.error,
      message: data.message,
    };
  } catch {
    return { ok: false, authenticated: false, httpStatus: 500 };
  }
}

export async function logoutAuthoritativeSession(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: buildAuthHeaders(),
    });
  } catch {
    // ignore network errors on logout
  }
  setStoredAuthoritativeSession(null, null);
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// SERVER-AUTHORITATIVE ADMIN USER MANAGEMENT, NOTIFICATIONS & MODULES
// ============================================================================

async function buildAdminAuthorityHeaders(): Promise<Record<string, string>> {
  const headers = buildAuthHeaders();
  const session = await getCurrentSupabaseSession();
  if (session?.access_token) headers['x-supabase-access-token'] = session.access_token;
  return headers;
}

export async function fetchServerAdminUsers(): Promise<AuthoritativeGoogleUser[] | null> {
  try {
    const resp = await fetch('/api/admin/users', {
      headers: await buildAdminAuthorityHeaders(),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return Array.isArray(data.users) ? data.users : null;
  } catch {
    return null;
  }
}

export async function createServerAdminUser(payload: {
  name: string;
  email: string;
  phone?: string;
  role?: UserRole;
  city?: string;
}): Promise<{ ok: boolean; user?: AuthoritativeGoogleUser; message?: string }> {
  try {
    const resp = await fetch('/api/admin/users', {
      method: 'POST',
      headers: await buildAdminAuthorityHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    return { ok: resp.ok && Boolean(data.ok), user: data.user, message: data.message };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Failed to create user.' };
  }
}

export async function updateServerAdminUserStatus(
  userId: string,
  status: 'active' | 'suspended' | 'blocked' | 'pending_verification',
  reason = `Admin Dashboard account status change to ${status}`,
): Promise<{ ok: boolean; user?: AuthoritativeGoogleUser; message?: string }> {
  try {
    const resp = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      headers: await buildAdminAuthorityHeaders(),
      body: JSON.stringify({ status, reason }),
    });
    const data = await resp.json();
    return { ok: resp.ok && Boolean(data.ok), user: data.user, message: data.message };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Failed to update user status.' };
  }
}

export async function updateServerAdminUserRole(
  userId: string,
  role: UserRole,
  reason = `Admin Dashboard role change to ${role}`,
): Promise<{ ok: boolean; user?: AuthoritativeGoogleUser; message?: string }> {
  try {
    const resp = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      headers: await buildAdminAuthorityHeaders(),
      body: JSON.stringify({ role, reason }),
    });
    const data = await resp.json();
    return { ok: resp.ok && Boolean(data.ok), user: data.user, message: data.message };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Failed to update user role.' };
  }
}

export async function updateServerAdminUserVerify(
  userId: string,
  verified?: boolean,
  reason = `Admin Dashboard verification change to ${verified === true}`,
): Promise<{ ok: boolean; user?: AuthoritativeGoogleUser; message?: string }> {
  try {
    const resp = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/verify`, {
      method: 'PATCH',
      headers: await buildAdminAuthorityHeaders(),
      body: JSON.stringify({ verified, reason }),
    });
    const data = await resp.json();
    return { ok: resp.ok && Boolean(data.ok), user: data.user, message: data.message };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Failed to verify user.' };
  }
}

export interface ServerNotificationRecord {
  id: string;
  userId: string | null;
  targetRole: UserRole | 'all';
  title: string;
  message: string;
  type: 'booking' | 'enquiry' | 'payment' | 'system' | 'security' | 'campaign';
  channel: 'push' | 'sms' | 'email' | 'whatsapp' | 'all_channels';
  read: boolean;
  readBy: string[];
  createdAt: string;
  createdBy: string;
}

export async function fetchServerNotifications(params?: {
  userId?: string;
  role?: UserRole;
}): Promise<{
  ok: boolean;
  notifications: ServerNotificationRecord[];
  campaigns: Array<{
    id: string;
    title: string;
    message: string;
    segment: string;
    channel: string;
    sentAt: string;
    recipientsCount: number;
    status: string;
  }>;
}> {
  try {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.role) qs.set('role', params.role);
    const resp = await fetch(`/api/notifications?${qs.toString()}`, {
      headers: buildAuthHeaders(),
    });
    if (!resp.ok) return { ok: false, notifications: [], campaigns: [] };
    const data = await resp.json();
    return {
      ok: Boolean(data.ok),
      notifications: Array.isArray(data.notifications) ? data.notifications : [],
      campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    };
  } catch {
    return { ok: false, notifications: [], campaigns: [] };
  }
}

export async function sendServerNotification(payload: {
  title: string;
  message: string;
  targetRole?: UserRole | 'all' | 'customers' | 'providers' | 'vip';
  targetUserId?: string | null;
  type?: 'booking' | 'enquiry' | 'payment' | 'system' | 'security' | 'campaign';
  channel?: 'push' | 'sms' | 'email' | 'whatsapp' | 'all_channels';
}): Promise<{
  ok: boolean;
  notification?: ServerNotificationRecord;
  campaign?: any;
  message?: string;
}> {
  try {
    const resp = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      notification: data.notification,
      campaign: data.campaign,
      message: data.message,
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Failed to send notification.' };
  }
}

export async function markServerNotificationRead(
  notificationId: string,
  userId?: string
): Promise<boolean> {
  try {
    const resp = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ notificationId, userId }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function clearServerNotifications(userId?: string): Promise<boolean> {
  try {
    const resp = await fetch('/api/notifications/clear', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ userId }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function syncServerProviderListing(
  action: 'create' | 'update' | 'delete',
  listingOrId: any,
  updates?: any
): Promise<{ ok: boolean; httpStatus: number; listing?: any; error?: string; message?: string }> {
  try {
    if (action === 'create') {
      const resp = await fetch('/api/provider/listings', {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify(listingOrId),
      });
      const data = await resp.json();
      return {
        ok: resp.ok && Boolean(data.ok),
        httpStatus: resp.status,
        listing: data.listing,
        error: data.error,
        message: data.message,
      };
    }
    if (action === 'update') {
      const resp = await fetch(`/api/provider/listings/${encodeURIComponent(String(listingOrId))}`, {
        method: 'PATCH',
        headers: buildAuthHeaders(),
        body: JSON.stringify(updates || {}),
      });
      const data = await resp.json();
      return {
        ok: resp.ok && Boolean(data.ok),
        httpStatus: resp.status,
        listing: data.listing,
        error: data.error,
        message: data.message,
      };
    }
    const resp = await fetch(`/api/provider/listings/${encodeURIComponent(String(listingOrId))}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      httpStatus: resp.status,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 500,
      message: err?.message || 'Provider listing operation failed.',
    };
  }
}

type ProviderListingsResponse = {
  ok: boolean;
  source?: string;
  error?: string;
  auditEventId?: string;
  listing?: Record<string, any>;
  listings?: Record<string, any>[];
  providers?: Array<{ id: string; fullName: string; email: string }>;
  registration?: Record<string, any> | null;
  registrations?: Record<string, any>[];
  profile?: { role: UserRole; accountStatus: string } | null;
};

async function requestProviderListings(
  url: string,
  method = 'GET',
  body?: unknown,
): Promise<{ ok: boolean; httpStatus: number; data: ProviderListingsResponse }> {
  try {
    const response = await fetch(url, {
      method,
      headers: buildAuthHeaders(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json() as ProviderListingsResponse;
    return { ok: response.ok && data.ok === true, httpStatus: response.status, data };
  } catch {
    return { ok: false, httpStatus: 0, data: { ok: false, error: 'NETWORK_ERROR' } };
  }
}

export async function fetchServerProviderListings(admin = false) {
  const response = await requestProviderListings(admin ? '/api/admin/provider/listings' : '/api/provider/listings');
  return {
    ...response,
    listings: (response.data.listings || []).map((row) => ({
      id: String(row.id || ''),
      owner_id: String(row.ownerUserId || ''),
      title: String(row.title || ''),
      category_id: String(row.categoryId || ''),
      subcategory: String(row.subcategory || ''),
      entity_type: String(row.entityType || 'listing'),
      price: Number(row.price || 0),
      price_unit: String(row.priceUnit || 'quote'),
      status: String(row.status || 'pending_approval'),
      payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
      provider_availability_status: row.providerAvailabilityStatus || 'not_reported',
      is_verified: row.isVerified === true,
      created_at: String(row.createdAt || ''),
      updated_at: String(row.updatedAt || ''),
      provider_name: String(row.providerName || ''),
    })),
    source: response.data.source,
    error: response.data.error,
  };
}

export async function fetchServerProviderListingOwners() {
  const response = await requestProviderListings('/api/admin/provider-listing-owners');
  return { ...response, providers: response.data.providers || [] };
}

export async function fetchOwnProviderRegistration() {
  const response = await requestProviderListings('/api/provider/registrations/me');
  return { ...response, registration: response.data.registration || null, profile: response.data.profile || null };
}

export async function submitServerProviderRegistration(body: {
  requestId: string;
  providerType: 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay';
  businessName: string;
  contactPhone: string;
  city: string;
  area: string;
  serviceArea?: string;
}) {
  const response = await requestProviderListings('/api/provider/registrations', 'POST', body);
  return { ...response, registration: response.data.registration || null };
}

export async function fetchAdminProviderRegistrations() {
  const response = await requestProviderListings('/api/admin/provider-registrations');
  return { ...response, registrations: response.data.registrations || [] };
}

export async function reviewServerProviderRegistration(
  registrationId: string,
  decision: 'approved' | 'rejected',
  reviewNote = '',
) {
  const response = await requestProviderListings(
    `/api/admin/provider-registrations/${encodeURIComponent(registrationId)}/review`,
    'PATCH',
    { decision, reviewNote },
  );
  return { ...response, registration: response.data.registration || null };
}

export async function reviewServerProviderListing(listingId: string, decision: 'active' | 'rejected') {
  const response = await requestProviderListings(
    `/api/admin/provider/listings/${encodeURIComponent(listingId)}/review`,
    'PATCH',
    { decision },
  );
  return { ...response, listing: response.data.listing };
}

export async function saveServerProviderListing(listingId: string | null, body: Record<string, unknown>) {
  const response = await requestProviderListings(
    listingId ? `/api/provider/listings/${encodeURIComponent(listingId)}` : '/api/provider/listings',
    listingId ? 'PATCH' : 'POST',
    body,
  );
  return { ...response, listing: response.data.listing };
}

export async function archiveServerProviderListing(listingId: string) {
  return requestProviderListings(`/api/provider/listings/${encodeURIComponent(listingId)}`, 'DELETE');
}

export async function fetchServerMarketplaceListings(): Promise<{
  source: string | null;
  listings: MarketplaceListing[];
}> {
  try {
    const response = await fetch('/api/marketplace/listings', { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data?.listings)) return { source: data?.source || null, listings: [] };
    const listings = data.listings
      .filter((row: any) => row?.status === 'active' && row?.id && row?.categoryId && row?.subcategory)
      .map((row: any) => {
        const attributes = row.attributes && typeof row.attributes === 'object' ? row.attributes : {};
        return {
          ...attributes,
          id: String(row.id),
          title: String(row.title || ''),
          description: typeof attributes.description === 'string' ? attributes.description : '',
          categoryId: String(row.categoryId),
          subcategory: String(row.subcategory),
          entityType: String(row.entityType || 'service'),
          price: Number(row.price || 0),
          priceUnit: String(row.priceUnit || 'quote'),
          currency: String(attributes.currency || '₹'),
          providerId: '',
          providerName: String(row.providerName || ''),
          providerPhone: '',
          providerEmail: '',
          providerRating: undefined,
          reviewCount: undefined,
          isVerified: row.isVerified === true,
          isFeatured: row.isFeatured === true,
          status: 'active',
          location: attributes.location && typeof attributes.location === 'object' ? attributes.location : {},
          images: Array.isArray(attributes.images)
            ? attributes.images.filter((url: unknown) =>
                typeof url === 'string'
                && (
                  /^https:\/\//i.test(url)
                  || (
                    /^storage:\/\/bos-public-media\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/i.test(url)
                    && !/(^|\/)\.\.?(\/|$)|\/\/|\\|[?#]/.test(url)
                  )
                ))
            : [],
          customFieldValues: attributes.customFieldValues && typeof attributes.customFieldValues === 'object' ? attributes.customFieldValues : {},
        } as MarketplaceListing;
      });
    return { source: String(data.source || ''), listings };
  } catch {
    return { source: null, listings: [] };
  }
}

export async function syncServerAdminModule(
  moduleKey: string,
  payload: unknown
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/admin/modules/${encodeURIComponent(moduleKey)}`, {
      method: 'PUT',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ payload }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// AUTHORITATIVE MULTI-USER ATOMIC TRANSACTIONS & SERVER VERIFICATION HELPERS
// Uses both Supabase PL/pgSQL RPCs (when cloud DB is connected) and Express
// server-authoritative endpoints (/api/*) so localStorage is strictly cache-only.
// ============================================================================

export function getOrCreateClientSessionId(): string {
  if (typeof window === 'undefined') return 'ssr-session';
  try {
    let sid = sessionStorage.getItem('bos_authoritative_session_id');
    if (!sid) {
      sid = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem('bos_authoritative_session_id', sid);
    }
    return sid;
  } catch {
    return `sess-${Date.now()}`;
  }
}

export async function fetchAuthoritativeSeatLocks(params: {
  listingId: string;
  dateIso: string;
  showtime: string;
}): Promise<{
  ok: boolean;
  lockedSeats: string[];
  bookedSeats: string[];
  heldSeats: Array<{ seatId: string; sessionId: string; expiresAt: number }>;
}> {
  try {
    const qs = new URLSearchParams({
      listingId: params.listingId,
      dateIso: params.dateIso,
      showtime: params.showtime,
    });
    const resp = await fetch(`/api/seats/locks?${qs.toString()}`, {
      headers: buildAuthHeaders(),
    });
    if (resp.ok) {
      const data = await resp.json();
      return {
        ok: true,
        lockedSeats: Array.isArray(data.lockedSeats) ? data.lockedSeats : ['C4', 'C5', 'E7'],
        bookedSeats: Array.isArray(data.bookedSeats) ? data.bookedSeats : ['C4', 'C5', 'E7'],
        heldSeats: Array.isArray(data.heldSeats) ? data.heldSeats : [],
      };
    }
  } catch {
    // fallback if network unreachable
  }
  return {
    ok: false,
    lockedSeats: ['C4', 'C5', 'E7'],
    bookedSeats: ['C4', 'C5', 'E7'],
    heldSeats: [],
  };
}

export async function holdAuthoritativeSeats(params: {
  listingId: string;
  dateIso: string;
  showtime: string;
  seats: string[];
  sessionId?: string;
}): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  conflictingSeats?: string[];
  lockToken?: string;
  expiresAt?: number;
  showStartUtcIso?: string;
  showStartIstLabel?: string;
  message?: string;
}> {
  const sessionId = params.sessionId || getOrCreateClientSessionId();

  // 1. If live Supabase is configured & authenticated, also invoke the PostgreSQL atomic RPC
  if (supabase) {
    try {
      await supabase.rpc('hold_movie_seats_atomic', {
        p_listing_id: params.listingId,
        p_show_date: params.dateIso,
        p_show_time: params.showtime,
        p_seats: params.seats,
        p_session_id: sessionId,
        p_ttl_seconds: 300,
      });
    } catch {
      // Continue to Express authoritative lock store
    }
  }

  try {
    const resp = await fetch('/api/seats/hold', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        listingId: params.listingId,
        dateIso: params.dateIso,
        showtime: params.showtime,
        seats: params.seats,
        sessionId,
      }),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      status: resp.status,
      error: data.error,
      conflictingSeats: data.conflictingSeats,
      lockToken: data.lockToken,
      expiresAt: data.expiresAt,
      showStartUtcIso: data.showStartUtcIso,
      showStartIstLabel: data.showStartIstLabel,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message || 'Failed to acquire atomic seat lock.',
    };
  }
}

export async function releaseAuthoritativeSeats(params: {
  listingId: string;
  dateIso: string;
  showtime: string;
  seats?: string[];
  sessionId?: string;
}): Promise<{ ok: boolean }> {
  const sessionId = params.sessionId || getOrCreateClientSessionId();
  try {
    const resp = await fetch('/api/seats/release', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        ...params,
        sessionId,
      }),
    });
    const data = await resp.json();
    return { ok: resp.ok && Boolean(data.ok) };
  } catch {
    return { ok: false };
  }
}

export async function createAuthoritativeBookingAtomic(params: {
  id?: string;
  idempotencyKey: string;
  listingId: string;
  listingTitle: string;
  providerId: string;
  customerUserId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  scheduledDate: string;
  checkInDate?: string;
  checkOutDate?: string;
  timeSlot: string;
  showtime?: string;
  screenId?: string;
  screenName?: string;
  seats?: string[];
  foodAddons?: Array<{ id: string; name: string; price: number; qty: number }>;
  baseAmount?: number;
  taxAmount?: number;
  discountAmount?: number;
  promoCode?: string;
  totalAmount: number;
  categoryId?: string;
  vertical?: string;
  paymentGateway?: 'direct_upi' | 'razorpay' | 'pay_later';
  paymentMode?: 'pay_later' | 'pay_qr' | 'pay_razorpay';
  requireVerifiedPayment?: boolean;
  paymentIntentId?: string;
  paymentUtr?: string;
  paymentVerificationToken?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  passCode?: string;
  notes?: string;
  sessionId?: string;
  exclusiveSlot?: boolean;
  isDemo?: boolean;
}): Promise<{
  ok: boolean;
  status: number;
  idempotentReplay?: boolean;
  error?: string;
  conflictingSeats?: string[];
  message?: string;
  booking?: {
    id: string;
    passCode: string;
    barcodeId?: string;
    qrSignature: string;
    qrPassToken: string;
    showStartUtcIso?: string;
    showStartIstLabel?: string;
    resentCount?: number;
    vertical?: string;
    paymentGateway?: string;
    paymentStatus: 'pay_later' | 'pending_verification' | 'verified' | 'refunded' | 'failed';
    status: string;
    expiresAtIso?: string;
  };
}> {
  const sessionId = params.sessionId || getOrCreateClientSessionId();

  try {
    const resp = await fetch('/api/bookings/atomic', {
      method: 'POST',
      headers: buildAuthHeaders({
        'x-idempotency-key': params.idempotencyKey,
      }),
      body: JSON.stringify({
        ...params,
        sessionId,
      }),
    });
    const data = await resp.json();

    // Booking creation is owned by the authenticated server endpoint. A
    // SECURITY DEFINER mirror RPC that accepts caller-supplied price, payment,
    // and QR fields must never be invoked directly from a browser session.

    return {
      ok: resp.ok && Boolean(data.ok),
      status: resp.status,
      idempotentReplay: data.idempotentReplay,
      error: data.error,
      conflictingSeats: data.conflictingSeats,
      message: data.message,
      booking: data.booking,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      error: 'NETWORK_ERROR',
      message: err?.message || 'Atomic booking request failed.',
    };
  }
}

export async function createServerPaymentIntent(params: {
  amount: number;
  merchantVpa: string;
  planOrListing: string;
  userId?: string;
  listingId?: string;
  categoryId?: string;
  vertical?: string;
  paymentGateway?: 'direct_upi' | 'razorpay';
  dateIso?: string;
  showtime?: string;
  purpose?: string;
}): Promise<{
  ok: boolean;
  httpStatus?: number;
  intentId?: string;
  amount?: number;
  merchantVpa?: string;
  vertical?: string;
  paymentGateway?: string;
  status?: string;
  error?: string;
  message?: string;
}> {
  try {
    const resp = await fetch('/api/payments/create-intent', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(params),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      httpStatus: resp.status,
      intentId: data.intentId,
      amount: data.amount,
      merchantVpa: data.merchantVpa,
      vertical: data.vertical,
      paymentGateway: data.paymentGateway,
      status: data.status,
      error: data.error,
      message: data.message,
    };
  } catch {
    return { ok: false };
  }
}

export async function verifyServerUpiPayment(params: {
  intentId: string;
  utrNumber: string;
  gatewaySignature?: string;
  amount?: number;
  merchantVpa?: string;
  listingId?: string;
  categoryId?: string;
  vertical?: string;
  dateIso?: string;
  showtime?: string;
  simulateBankWebhookSettlement?: boolean;
}): Promise<{
  ok: boolean;
  httpStatus: number;
  verified: boolean;
  status: 'verified' | 'pending_provider_reconciliation' | 'rejected';
  intentId?: string;
  utrNumber?: string;
  paymentVerificationToken?: string;
  error?: string;
  message?: string;
}> {
  try {
    let gatewaySignature = params.gatewaySignature;

    // Only obtain bank webhook settlement signature when explicitly requested via bank webhook verification
    if (params.simulateBankWebhookSettlement && !gatewaySignature) {
      const settleResp = await fetch('/api/payments/webhook-settle', {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          intentId: params.intentId,
          utrNumber: params.utrNumber,
          amount: params.amount,
          listingId: params.listingId,
          dateIso: params.dateIso,
          showtime: params.showtime,
        }),
      });
      if (settleResp.ok) {
        const settleData = await settleResp.json();
        gatewaySignature = settleData.gatewaySignature;
      } else {
        const errData = await settleResp.json().catch(() => ({}));
        return {
          ok: false,
          httpStatus: settleResp.status,
          verified: false,
          status: 'rejected',
          error: errData.error || 'SETTLEMENT_FAILED',
          message: errData.message || 'Bank settlement verification failed.',
        };
      }
    }

    const resp = await fetch('/api/payments/verify-upi', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        intentId: params.intentId,
        utrNumber: params.utrNumber,
        gatewaySignature,
        amount: params.amount,
        merchantVpa: params.merchantVpa,
        listingId: params.listingId,
        dateIso: params.dateIso,
        showtime: params.showtime,
      }),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      httpStatus: resp.status,
      verified: Boolean(data.verified),
      status: data.status || (data.verified ? 'verified' : 'pending_provider_reconciliation'),
      intentId: data.intentId,
      utrNumber: data.utrNumber,
      paymentVerificationToken: data.paymentVerificationToken,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 500,
      verified: false,
      status: 'rejected',
      message: err?.message || 'Payment verification failed.',
    };
  }
}

export async function verifyAuthoritativeQrPass(params: {
  passToken?: string;
  passCode?: string;
  barcodeId?: string;
  signature?: string;
  markCheckedIn?: boolean;
}): Promise<{
  ok: boolean;
  httpStatus: number;
  verified: boolean;
  alreadyCheckedIn?: boolean;
  barcodeId?: string;
  verificationMethod?: string;
  error?: string;
  message?: string;
  booking?: any;
}> {
  try {
    const resp = await fetch('/api/passes/verify', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(params),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      httpStatus: resp.status,
      verified: Boolean(data.verified),
      alreadyCheckedIn: data.alreadyCheckedIn,
      barcodeId: data.barcodeId,
      verificationMethod: data.verificationMethod,
      error: data.error,
      message: data.message,
      booking: data.booking,
    };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 500,
      verified: false,
      message: err?.message || 'Failed to verify QR pass.',
    };
  }
}

export interface ShowtimeScheduleEntry {
  showtime: string;
  dateIso: string;
  showStartUtcIso: string;
  showStartIstLabel: string;
  isPast: boolean;
  isCancelled: boolean;
  bookable: boolean;
  statusReason: string;
}

export interface AuthoritativeCinemaScreenConfig {
  id: string;
  cinemaListingId: string;
  cinemaTitle: string;
  area: string;
  screenName: string;
  format: string;
  soundSystem: string;
  totalSeats: number;
  tiers: Array<{
    name: string;
    rows: string[];
    price: number;
  }>;
  wheelchairSeats: string[];
  showtimes: string[];
  activeShowtimes?: string[];
  cancelledShowtimes?: string[];
  cancelledShows?: string[];
  showtimeSchedule?: ShowtimeScheduleEntry[];
  cancellationAllowed: boolean;
  cancellationCutoffMinutes: number;
  refundPercent: number;
  convenienceFeePerSeat: number;
  gstPercent: number;
  updatedAt: string;
}

/** A customer's own movie tickets. The server scopes them by session identity. */
export async function fetchMyMovieBookings(): Promise<{ ok: boolean; bookings: any[] }> {
  try {
    const resp = await fetch('/api/movies/my-bookings', { headers: buildAuthHeaders() });
    const data = await resp.json();
    return { ok: resp.ok && Boolean(data.ok), bookings: Array.isArray(data.bookings) ? data.bookings : [] };
  } catch {
    return { ok: false, bookings: [] };
  }
}

/** Admin-only movie bookings, refunds, support tickets and audit logs. */
export async function fetchMoviesBookingRecords(): Promise<{
  ok: boolean;
  bookings: any[];
  refunds: any[];
  supportTickets: any[];
  auditLogs: any[];
}> {
  try {
    const resp = await fetch('/api/admin/movies/records', { headers: buildAuthHeaders() });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      bookings: Array.isArray(data.bookings) ? data.bookings : [],
      refunds: Array.isArray(data.refunds) ? data.refunds : [],
      supportTickets: Array.isArray(data.supportTickets) ? data.supportTickets : [],
      auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [],
    };
  } catch {
    return { ok: false, bookings: [], refunds: [], supportTickets: [], auditLogs: [] };
  }
}

export async function fetchMoviesInventory(dateIso?: string): Promise<{
  ok: boolean;
  serverTimeUtcIso?: string;
  serverTimeIstLabel?: string;
  currentDateIsoIst?: string;
  realityAudit?: any;
  screens: AuthoritativeCinemaScreenConfig[];
  offers: Array<{ code: string; label: string; discountType: 'flat' | 'percent'; value: number; minAmount: number; maxDiscount: number }>;
  bookings: any[];
  refunds: any[];
  supportTickets: any[];
  auditLogs: any[];
}> {
  try {
    const qs = dateIso ? `?dateIso=${encodeURIComponent(dateIso)}` : '';
    const resp = await fetch(`/api/movies/inventory${qs}`, {
      headers: buildAuthHeaders(),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      serverTimeUtcIso: data.serverTimeUtcIso,
      serverTimeIstLabel: data.serverTimeIstLabel,
      currentDateIsoIst: data.currentDateIsoIst,
      realityAudit: data.realityAudit,
      screens: data.screens || [],
      offers: data.offers || [],
      bookings: data.bookings || [],
      refunds: data.refunds || [],
      supportTickets: data.supportTickets || [],
      auditLogs: data.auditLogs || [],
    };
  } catch {
    return {
      ok: false,
      screens: [],
      offers: [],
      bookings: [],
      refunds: [],
      supportTickets: [],
      auditLogs: [],
    };
  }
}

export async function fetchMoviesRealityAudit(): Promise<{
  ok: boolean;
  auditedAtUtc?: string;
  auditedAtIst?: string;
  timezone?: string;
  demoBookingsBlocked?: boolean;
  productionReadinessClaim?: string;
  subsystems?: Record<string, { status: string; classification: string; evidence: string }>;
}> {
  try {
    const resp = await fetch('/api/movies/reality-audit', {
      headers: buildAuthHeaders(),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      ...data,
    };
  } catch {
    return { ok: false };
  }
}

export async function downloadBosMovieTicketPdf(params: {
  bookingIdOrPassCode: string;
  qrSignature?: string;
  qrPassToken?: string;
  customerPhone?: string;
}): Promise<{ ok: boolean; status: number; filename?: string; message?: string }> {
  try {
    const qs = new URLSearchParams();
    const sig =
      params.qrSignature ||
      (params.qrPassToken && params.qrPassToken.includes('.')
        ? params.qrPassToken.split('.')[1]
        : undefined);
    if (sig) qs.set('sig', sig);
    if (params.customerPhone) qs.set('phone', params.customerPhone);
    const url = `/api/movies/bookings/${encodeURIComponent(params.bookingIdOrPassCode)}/ticket.pdf?${qs.toString()}`;
    const resp = await fetch(url, {
      headers: buildAuthHeaders(),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      return {
        ok: false,
        status: resp.status,
        message: errData.message || 'Failed to download PDF ticket.',
      };
    }
    const blob = await resp.blob();
    const filename = `BOS-Ticket-${params.bookingIdOrPassCode}.pdf`;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
    return { ok: true, status: 200, filename };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message || 'PDF download failed.',
    };
  }
}

export async function resendBosMovieTicket(params: {
  bookingIdOrPassCode: string;
  email?: string;
  phone?: string;
  qrSignature?: string;
}): Promise<{
  ok: boolean;
  status: number;
  passCode?: string;
  barcodeId?: string;
  resentCount?: number;
  resentAt?: string;
  pdfDownloadUrl?: string;
  message?: string;
}> {
  try {
    const qs = params.qrSignature ? `?sig=${encodeURIComponent(params.qrSignature)}` : '';
    const resp = await fetch(
      `/api/movies/bookings/${encodeURIComponent(params.bookingIdOrPassCode)}/resend${qs}`,
      {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          email: params.email,
          phone: params.phone,
        }),
      }
    );
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      status: resp.status,
      passCode: data.passCode,
      barcodeId: data.barcodeId,
      resentCount: data.resentCount,
      resentAt: data.resentAt,
      pdfDownloadUrl: data.pdfDownloadUrl,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message || 'Failed to resend movie ticket.',
    };
  }
}

export async function updateCinemaScreenConfig(
  payload: Partial<AuthoritativeCinemaScreenConfig> & { id: string }
): Promise<{
  ok: boolean;
  status: number;
  screen?: AuthoritativeCinemaScreenConfig;
  error?: string;
  message?: string;
  auditEventId?: string;
}> {
  try {
    const resp = await fetch('/api/movies/screens', {
      method: 'PUT',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      status: resp.status,
      screen: data.screen,
      error: data.error,
      message: data.message,
      auditEventId: data.auditEventId,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message || 'Failed to update cinema screen config.',
    };
  }
}

export async function cancelMovieBookingAtomic(params: {
  bookingIdOrPassCode: string;
  reason: string;
  customerPhone?: string;
  cancelledByRole?: 'customer' | 'provider' | 'admin';
  cancellationType?: 'customer_requested' | 'provider_cancelled' | 'provider_non_delivery';
  idempotencyKey?: string;
}): Promise<{
  ok: boolean;
  status: number;
  idempotentReplay?: boolean;
  booking?: any;
  refund?: any;
  quote?: CancellationQuoteResult;
  error?: string;
  message?: string;
}> {
  try {
    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers['x-idempotency-key'] = params.idempotencyKey;
    }
    const resp = await fetch(`/api/movies/bookings/${encodeURIComponent(params.bookingIdOrPassCode)}/cancel`, {
      method: 'POST',
      headers: buildAuthHeaders(headers),
      body: JSON.stringify({
        reason: params.reason,
        customerPhone: params.customerPhone,
        cancelledByRole: params.cancelledByRole || 'customer',
        cancellationType: params.cancellationType || 'customer_requested',
        idempotencyKey: params.idempotencyKey,
      }),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      status: resp.status,
      idempotentReplay: data.idempotentReplay,
      booking: data.booking,
      refund: data.refund,
      quote: data.quote,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message || 'Failed to cancel movie booking.',
    };
  }
}

export interface CancellationQuoteResult {
  bookingId: string;
  passCode?: string;
  vertical: 'pg_hostels' | 'classes' | 'services' | 'venues' | 'hotel_stay' | 'movies';
  listingId?: string;
  listingTitle?: string;
  originalAmount: number;
  hoursUntilStart: number;
  daysUntilStart: number;
  cancelledByRole: 'customer' | 'provider' | 'admin';
  cancellationType: 'customer_requested' | 'provider_cancelled' | 'provider_non_delivery';
  cancellationAllowed: boolean;
  refundPercent: number;
  refundAmount: number;
  cancellationFee: number;
  policyTier: string;
  policyLabel: string;
  policyExplanation: string;
  paymentGateway: 'direct_upi' | 'razorpay' | 'pay_later';
  refundMethod: 'razorpay_verified' | 'upi_manual_reconciled' | 'none';
  calculatedAtUtc: string;
}

export async function fetchBookingCancellationQuote(params: {
  bookingId?: string;
  vertical?: string;
  categoryId?: string;
  listingId?: string;
  listingTitle?: string;
  screenId?: string;
  originalAmount?: number;
  scheduledDate?: string;
  checkInDate?: string;
  timeSlot?: string;
  showtime?: string;
  hoursUntilStart?: number;
  cancelledByRole?: 'customer' | 'provider' | 'admin';
  cancellationType?: 'customer_requested' | 'provider_cancelled' | 'provider_non_delivery';
  paymentGateway?: 'direct_upi' | 'razorpay' | 'pay_later';
}): Promise<{
  ok: boolean;
  status: number;
  quote?: CancellationQuoteResult;
  error?: string;
  message?: string;
}> {
  try {
    const resp = await fetch('/api/bookings/cancellation-quote', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(params),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      status: resp.status,
      quote: data.quote,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message || 'Failed to compute cancellation quote.',
    };
  }
}

export async function cancelBookingWithPolicyAtomic(params: {
  bookingIdOrPassCode: string;
  reason: string;
  customerPhone?: string;
  cancelledByRole?: 'customer' | 'provider' | 'admin';
  cancellationType?: 'customer_requested' | 'provider_cancelled' | 'provider_non_delivery';
  idempotencyKey?: string;
  requireManualBankReconciliation?: boolean;
}): Promise<{
  ok: boolean;
  status: number;
  idempotentReplay?: boolean;
  booking?: any;
  refund?: any;
  quote?: CancellationQuoteResult;
  error?: string;
  message?: string;
}> {
  try {
    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers['x-idempotency-key'] = params.idempotencyKey;
    }
    const resp = await fetch(`/api/bookings/${encodeURIComponent(params.bookingIdOrPassCode)}/cancel`, {
      method: 'POST',
      headers: buildAuthHeaders(headers),
      body: JSON.stringify({
        reason: params.reason,
        customerPhone: params.customerPhone,
        cancelledByRole: params.cancelledByRole || 'customer',
        cancellationType: params.cancellationType || 'customer_requested',
        idempotencyKey: params.idempotencyKey,
        requireManualBankReconciliation: params.requireManualBankReconciliation,
      }),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      status: resp.status,
      idempotentReplay: data.idempotentReplay,
      booking: data.booking,
      refund: data.refund,
      quote: data.quote,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message || 'Failed to cancel booking.',
    };
  }
}

export async function createRazorpayOrderServer(params: {
  /** The booking this order settles. The server prices the order from it. */
  bookingId: string;
  amount: number;
  listingId?: string;
  listingTitle?: string;
  categoryId?: string;
  vertical?: string;
  userId?: string;
  dateIso?: string;
  showtime?: string;
  seats?: string[];
}): Promise<{
  ok: boolean;
  httpStatus: number;
  intentId?: string;
  razorpayOrderId?: string;
  amount?: number;
  amountInPaise?: number;
  currency?: string;
  keyId?: string;
  vertical?: string;
  error?: string;
  message?: string;
}> {
  try {
    const resp = await fetch('/api/payments/razorpay/create-order', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(params),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      httpStatus: resp.status,
      intentId: data.intentId,
      razorpayOrderId: data.razorpayOrderId,
      amount: data.amount,
      amountInPaise: data.amountInPaise || data.amountPaise || Math.round((data.amount || 0) * 100),
      currency: data.currency || 'INR',
      keyId: data.keyId || data.razorpayKeyId,
      vertical: data.vertical,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 500,
      message: err?.message || 'Failed to create Razorpay order.',
    };
  }
}

export async function verifyRazorpayPaymentServer(params: {
  intentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
}): Promise<{
  ok: boolean;
  httpStatus: number;
  verified: boolean;
  intentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentVerificationToken?: string;
  error?: string;
  message?: string;
}> {
  try {
    // The Razorpay Checkout signature is verified server-side. The browser can
    // never ask the server to mint one, and the provider webhook is never
    // called from the client.
    const razorpaySignature = params.razorpaySignature;

    const resp = await fetch('/api/payments/razorpay/verify', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        intentId: params.intentId,
        razorpay_order_id: params.razorpayOrderId,
        razorpay_payment_id: params.razorpayPaymentId,
        razorpay_signature: razorpaySignature,
      }),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      httpStatus: resp.status,
      verified: Boolean(data.verified),
      intentId: data.intentId,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      paymentVerificationToken: data.paymentVerificationToken,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 500,
      verified: false,
      message: err?.message || 'Razorpay verification failed.',
    };
  }
}

export interface RazorpayHistoryRecord {
  id: string;
  orderId: string;
  paymentId: string;
  amount: number;
  currency?: string;
  listingTitle?: string;
  listingId?: string;
  vertical?: string;
  status: string;
  verificationToken?: string;
  createdAt: string;
  date: string;
}

export async function fetchRazorpayPaymentHistory(userId?: string): Promise<{
  ok: boolean;
  transactions: RazorpayHistoryRecord[];
  error?: string;
}> {
  try {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const resp = await fetch(`/api/payments/razorpay/history${query}`, {
      headers: buildAuthHeaders(),
    });
    if (!resp.ok) {
      return { ok: false, transactions: [] };
    }
    const data = await resp.json();
    return {
      ok: true,
      transactions: Array.isArray(data.transactions) ? data.transactions : Array.isArray(data.orders) ? data.orders.map((order: any) => ({
        id: order.intentId || order.razorpayOrderId || '',
        orderId: order.razorpayOrderId || order.intentId || '',
        paymentId: '',
        amount: Number(order.amount || 0),
        currency: order.currency,
        listingTitle: order.purpose || order.intentId || 'Payment',
        listingId: order.listingId,
        status: order.status || 'pending',
        createdAt: order.createdAt || '',
        date: order.createdAt || '',
      })) : [],
    };
  } catch (err: any) {
    return { ok: false, transactions: [], error: err?.message };
  }
}

export async function checkRazorpayOrderStatusServer(orderOrIntentId: string): Promise<{
  ok: boolean;
  status: 'verified' | 'pending' | 'failed';
  found?: boolean;
  intentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  amount?: number;
  message?: string;
}> {
  try {
    const resp = await fetch(`/api/payments/razorpay/order-status/${encodeURIComponent(orderOrIntentId)}`, {
      method: 'GET',
      headers: buildAuthHeaders(),
    });
    if (!resp.ok) {
      return { ok: false, status: 'pending', message: 'Failed to fetch status' };
    }
    const data = await resp.json();
    return {
      ok: Boolean(data.ok),
      status: data.status || 'pending',
      found: data.found,
      intentId: data.intentId,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      amount: data.amount,
      message: data.message,
    };
  } catch (err: any) {
    return { ok: false, status: 'pending', message: err?.message || 'Error polling payment status' };
  }
}

export async function reconcileManualUpiRefundServer(params: {
  refundId: string;
  refundUtr: string;
  bankReconciliationSignature?: string;
  simulateBankReconciliationWebhook?: boolean;
}): Promise<{
  ok: boolean;
  status: number;
  refund?: any;
  error?: string;
  message?: string;
}> {
  try {
    const resp = await fetch(`/api/refunds/${encodeURIComponent(params.refundId)}/reconcile-manual`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(params),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      status: resp.status,
      refund: data.refund,
      error: data.error,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message || 'Manual refund reconciliation failed.',
    };
  }
}

export async function createMovieSupportTicket(params: {
  bookingId: string;
  passCode?: string;
  customerName: string;
  customerPhone: string;
  issueCategory: 'refund_status' | 'payment_deducted' | 'seat_issue' | 'qr_scan_help' | 'other';
  description: string;
}): Promise<{
  ok: boolean;
  ticket?: any;
  message?: string;
}> {
  try {
    const resp = await fetch('/api/movies/support', {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(params),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      ticket: data.ticket,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Failed to create support ticket.',
    };
  }
}

export async function resolveMovieSupportTicket(params: {
  ticketId: string;
  status: 'open' | 'in_progress' | 'resolved';
  resolutionNote: string;
}): Promise<{
  ok: boolean;
  status: number;
  ticket?: any;
  message?: string;
}> {
  try {
    const resp = await fetch(`/api/movies/support/${encodeURIComponent(params.ticketId)}`, {
      method: 'PATCH',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        status: params.status,
        resolutionNote: params.resolutionNote,
      }),
    });
    const data = await resp.json();
    return {
      ok: resp.ok && Boolean(data.ok),
      status: resp.status,
      ticket: data.ticket,
      message: data.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      message: err?.message || 'Failed to update support ticket.',
    };
  }
}

