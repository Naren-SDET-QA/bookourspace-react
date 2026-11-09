import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type express from 'express';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';
import {
  ProviderListingRepositoryError,
  type ProviderListingRepository,
} from './providerListingRepository';

/**
 * Platform API routes that the browser already calls but that had no server
 * implementation: marketplace feeds, cancellation quotes, refunds, Super Admin
 * governance, SMS and Razorpay.
 *
 * Design rules:
 * - Authorization is derived from the server-verified session only.
 * - External providers fail closed with an explicit 503 when unconfigured.
 * - No endpoint fabricates a settlement, refund or provider success.
 * - Marketplace output strips provider contact data.
 */

export interface PlatformApiDeps {
  verifySession: (req: express.Request) => any | null;
  loadStore: () => any;
  saveStore: (store: any) => boolean;
  signSession: (claims: any) => string;
  hmacSecret: string;
  findBlockedUser: (store: any, userId: string, email?: string) => any;
  env?: NodeJS.ProcessEnv;
  auditLog?: (entry: { actor: string; role: string; action: string; reason: string; details: string }) => void;
  providerListingRepository?: ProviderListingRepository | null;
  verifySuperAdmin?: (req: express.Request) => Promise<{ id: string; email: string } | null>;
  manageUserAccess?: (req: express.Request, targetUserId: string, action: 'promote' | 'demote' | 'suspend' | 'activate' | 'verify', reason: string) => Promise<any | null>;
}

const SENSITIVE_KEY = /(phone|whatsapp|email|contact|address|gstin|owneruserid|token|secret|verificationdocuments|verification_documents|documentreference|document_reference)/i;
const PRIVATE_STORAGE_REFERENCE = /(?:^storage:\/\/bos-private[^/]*\/|\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?bos-private[^/]*\/)/i;
const IMAGE_REFERENCE_KEY = /^(images?|photos?|photo|imageurl|coverimage|cover)$/i;

function containsPrivateStorageReference(value: unknown): boolean {
  if (typeof value === 'string') return PRIVATE_STORAGE_REFERENCE.test(value);
  if (Array.isArray(value)) return value.some(containsPrivateStorageReference);
  if (value && typeof value === 'object') return Object.values(value).some(containsPrivateStorageReference);
  return false;
}

function sanitize(value: any, depth = 0): any {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, depth + 1));
  const out: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (IMAGE_REFERENCE_KEY.test(key) && containsPrivateStorageReference(entry)) {
      if (Array.isArray(entry)) {
        out[key] = entry
          .filter((candidate) => !containsPrivateStorageReference(candidate))
          .map((candidate) => sanitize(candidate, depth + 1));
      }
      continue;
    }
    out[key] = sanitize(entry, depth + 1);
  }
  return out;
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function requireReason(res: express.Response, body: any): string | null {
  const reason = String(body?.reason || '').trim();
  if (reason.length < 5) {
    res.status(400).json({
      ok: false,
      error: 'AUDIT_REASON_REQUIRED',
      message: 'A mandatory audit reason of at least 5 characters is required.',
    });
    return null;
  }
  return reason;
}

function hoursUntil(dateIso: string, timeSlot: string): number | null {
  const date = String(dateIso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(timeSlot || '').trim());
  let hours = 0;
  let minutes = 0;
  if (match) {
    hours = Number(match[1]);
    minutes = Number(match[2]);
    const meridiem = (match[3] || '').toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    if (!meridiem && hours > 23) hours = 0;
  }
  const start = Date.parse(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+05:30`);
  if (Number.isNaN(start)) return null;
  return (start - Date.now()) / 3_600_000;
}

export function registerPlatformApi(app: express.Express, deps: PlatformApiDeps): void {
  const env = deps.env || process.env;
  const razorpayKeyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const razorpayKeySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  const razorpayWebhookSecret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const razorpayConfigured = Boolean(razorpayKeyId && razorpayKeySecret);
  /** Session + optional role check. Returns claims or writes the error response. */
  const authorize = (
    req: express.Request,
    res: express.Response,
    roles: Array<'customer' | 'provider' | 'admin'>,
    options: { requireSuperAdmin?: boolean; allowStoreUnavailable?: boolean } = {}
  ): any | null => {
    const claims = deps.verifySession(req);
    if (!claims) {
      res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED_SESSION',
        message: 'A verified server session is required.',
      });
      return null;
    }
    let blocked: any = null;
    try {
      const store = deps.loadStore();
      blocked = deps.findBlockedUser(store, claims.userId, claims.email);
    } catch (error) {
      // Database-authoritative routes may continue without the legacy JSON
      // mirror; their own SQL checks decide authorization. Every other route
      // keeps the fail-closed behaviour.
      if (!options.allowStoreUnavailable) throw error;
    }
    if (blocked) {
      res.status(403).json({ ok: false, error: 'ACCOUNT_BLOCKED', accountStatus: blocked.accountStatus });
      return null;
    }
    if (!roles.includes(claims.role)) {
      res.status(403).json({
        ok: false,
        error: 'FORBIDDEN_ROLE',
        role: claims.role,
        message: `Role "${claims.role}" cannot perform this action.`,
      });
      return null;
    }
    if (options.requireSuperAdmin && (claims as any).scope !== 'super_admin') {
      res.status(403).json({
        ok: false,
        error: 'SUPER_ADMIN_SCOPE_REQUIRED',
        message: 'This operation requires a Super Admin session scope.',
      });
      return null;
    }
    return claims;
  };

  const record = (claims: any, action: string, reason: string, details: string) => {
    try {
      deps.auditLog?.({ actor: claims?.email || claims?.userId || 'unknown', role: claims?.role || 'unknown', action, reason, details });
    } catch {
      /* audit logging must never break the response */
    }
  };

  // Re-check Super Admin authority against the current Supabase profile on
  // every privileged request. A previously signed scope token alone cannot
  // survive a demotion, suspension, or Super Admin revocation.
  app.use('/api/super-admin', async (req, res, next) => {
    const claims = deps.verifySession(req);
    if (!claims) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (claims.role !== 'admin' || claims.scope !== 'super_admin') {
      res.status(403).json({ ok: false, error: 'SUPER_ADMIN_SCOPE_REQUIRED' });
      return;
    }
    const identity = await deps.verifySuperAdmin?.(req);
    if (!identity || claims.supabaseUserId?.toLowerCase() !== identity.id.toLowerCase()) {
      res.status(403).json({ ok: false, error: 'SUPER_ADMIN_DATABASE_AUTHORITY_REQUIRED' });
      return;
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // Marketplace feeds (public, contact-free)
  // ---------------------------------------------------------------------------
  const readPublicListingFilters = (query: any) => {
    const text = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined;
    const amount = (value: unknown) => {
      const parsed = Number(value);
      return typeof value === 'string' && value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0
        ? parsed
        : undefined;
    };
    return {
      categoryId: text(query?.categoryId),
      subcategory: text(query?.subcategory),
      query: text(query?.q ?? query?.query),
      minPrice: amount(query?.minPrice),
      maxPrice: amount(query?.maxPrice),
    };
  };

  const publicListingView = (listing: any) => ({
    id: listing.id,
    title: listing.title,
    categoryId: listing.categoryId,
    subcategory: listing.subcategory,
    entityType: listing.entityType,
    price: listing.price,
    priceUnit: listing.priceUnit,
    providerName: listing.providerName,
    status: listing.status,
    isFeatured: listing.isFeatured,
    isVerified: listing.isVerified,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    attributes: sanitize(listing.payload),
  });

  // Public, read-only module flags. The table itself is publicly readable
  // (RLS: "Module flags are publicly readable"), so this adds no exposure; it
  // lets the browser resolve module access without a Supabase client.
  app.get('/api/modules', async (_req, res) => {
    const connectionString = String(env.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (connectionString) {
      try {
        assertPostgresConnectionTarget(connectionString, env);
      } catch (error: any) {
        res.status(503).json({ ok: false, error: 'MODULE_FLAGS_UNAVAILABLE', message: error?.message || 'The PostgreSQL target is not valid for this environment.' });
        return;
      }
    }
    if (!connectionString) {
      res.status(503).json({ ok: false, error: 'MODULE_FLAGS_UNAVAILABLE', message: 'Module flags require the PostgreSQL repository.' });
      return;
    }
    try {
      const result = await getSharedPostgresPool(connectionString, env).query(
        `select module_key, is_enabled, allow_contact_owner, allow_online_booking,
                requires_owner_approval, booking_approved_at
           from public.platform_module_flags
          order by module_key`,
      );
      res.json({ ok: true, modules: result.rows });
    } catch (error: any) {
      res.status(503).json({ ok: false, error: 'MODULE_FLAGS_UNAVAILABLE', message: error?.message || 'Module flags could not be read.' });
    }
  });

  app.get('/api/marketplace/listings', async (req, res) => {
    if (deps.providerListingRepository) {
      try {
        const listings = (await deps.providerListingRepository.listPublic(readPublicListingFilters(req.query))).map((listing) => ({
          id: listing.id,
          title: listing.title,
          categoryId: listing.categoryId,
          subcategory: listing.subcategory,
          entityType: listing.entityType,
          price: listing.price,
          priceUnit: listing.priceUnit,
          providerName: listing.providerName,
          status: listing.status,
          isFeatured: listing.isFeatured,
          isVerified: listing.isVerified,
          createdAt: listing.createdAt,
          updatedAt: listing.updatedAt,
          attributes: sanitize(listing.payload),
        }));
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.json({ ok: true, listings, count: listings.length, source: 'postgresql', generatedAt: new Date().toISOString() });
      } catch {
        res.status(503).json({ ok: false, error: 'LISTING_REPOSITORY_UNAVAILABLE' });
      }
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ ok: false, error: 'LISTING_REPOSITORY_UNAVAILABLE' });
      return;
    }
    const store = deps.loadStore();
    const listings = Object.values(store.providerListings || {})
      .filter((listing: any) => listing && listing.status === 'active')
      .map((listing: any) => ({
        id: listing.id,
        title: listing.title,
        categoryId: listing.categoryId,
        subcategory: listing.subcategory,
        price: listing.price,
        providerName: listing.providerName,
        status: listing.status,
        isFeatured: Boolean(listing.isFeatured),
        isVerified: Boolean(listing.isVerified),
        updatedAt: listing.updatedAt,
        attributes: sanitize(listing.payload || {}),
      }));

    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({
      ok: true,
      listings,
      count: listings.length,
      source: 'authoritative-store',
      generatedAt: new Date().toISOString(),
    });
  });

  // Public listing details. Only approved/active listings are addressable, and
  // provider contact data is never part of the projection.
  app.get('/api/marketplace/listings/:id', async (req, res) => {
    const listingId = String(req.params.id || '').trim();
    if (!listingId) {
      res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
      return;
    }
    if (deps.providerListingRepository) {
      try {
        const listing = await deps.providerListingRepository.findPublicById(listingId);
        if (!listing) {
          res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
          return;
        }
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.json({ ok: true, listing: publicListingView(listing), source: 'postgresql' });
      } catch {
        res.status(503).json({ ok: false, error: 'LISTING_REPOSITORY_UNAVAILABLE' });
      }
      return;
    }
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ ok: false, error: 'LISTING_REPOSITORY_UNAVAILABLE' });
      return;
    }
    const store = deps.loadStore();
    const listing = Object.values(store.providerListings || {}).find(
      (entry: any) => entry && entry.id === listingId && entry.status === 'active'
    ) as any;
    if (!listing) {
      res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ ok: true, listing: sanitize(listing), source: 'authoritative-store' });
  });

  app.get('/api/marketplace/categories', async (_req, res) => {
    if (deps.providerListingRepository) {
      try {
        const categories = await deps.providerListingRepository.categoriesPublic();
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.json({ ok: true, categories, count: categories.length, source: 'postgresql' });
      } catch {
        res.status(503).json({ ok: false, error: 'LISTING_REPOSITORY_UNAVAILABLE' });
      }
      return;
    }
    const store = deps.loadStore();
    const counts = new Map<string, { id: string; count: number; subcategories: Set<string> }>();
    for (const listing of Object.values(store.providerListings || {}) as any[]) {
      if (!listing || listing.status !== 'active') continue;
      const id = String(listing.categoryId || '').trim();
      if (!id) continue;
      const entry = counts.get(id) || { id, count: 0, subcategories: new Set<string>() };
      entry.count += 1;
      if (listing.subcategory) entry.subcategories.add(String(listing.subcategory));
      counts.set(id, entry);
    }
    const categories = [...counts.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => ({ id: entry.id, label: entry.id, count: entry.count, subcategories: [...entry.subcategories].sort() }));
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ ok: true, categories, count: categories.length });
  });

  // ---------------------------------------------------------------------------
  // Cancellation quote (read-only; never mutates the booking)
  // ---------------------------------------------------------------------------
  app.post('/api/bookings/cancellation-quote', (req, res) => {
    const claims = authorize(req, res, ['customer', 'provider', 'admin']);
    if (!claims) return;

    const bookingId = String(req.body?.bookingId || '').trim();
    if (!bookingId) {
      res.status(400).json({ ok: false, error: 'BOOKING_ID_REQUIRED' });
      return;
    }

    const store = deps.loadStore();
    const booking = (store.bookings || []).find((entry: any) => entry.id === bookingId);
    if (!booking) {
      res.status(404).json({ ok: false, error: 'BOOKING_NOT_FOUND' });
      return;
    }
    const ownsBooking =
      booking.customerUserId === claims.userId ||
      booking.providerId === claims.providerId ||
      claims.role === 'admin';
    if (!ownsBooking) {
      res.status(403).json({ ok: false, error: 'BOOKING_NOT_OWNED_BY_SESSION' });
      return;
    }
    if (booking.status !== 'confirmed') {
      res.status(409).json({
        ok: false,
        error: 'BOOKING_NOT_CANCELLABLE',
        status: booking.status,
        message: `A ${booking.status} booking has no cancellation quote.`,
      });
      return;
    }

    const hours = hoursUntil(booking.scheduledDate, booking.timeSlot);
    let refundPercent = 50;
    let policy = 'LATE_CANCELLATION_50_PERCENT';
    if (hours !== null) {
      if (hours >= 48) {
        refundPercent = 100;
        policy = 'FREE_CANCELLATION_48H';
      } else if (hours >= 24) {
        refundPercent = 75;
        policy = 'STANDARD_CANCELLATION_24H';
      } else if (hours <= 0) {
        refundPercent = 0;
        policy = 'CANCELLATION_WINDOW_CLOSED';
      }
    }

    const paid = booking.paymentStatus === 'verified';
    const total = Number(booking.totalAmount) || 0;
    const refundableBase = paid ? total : 0;
    const refundAmount = Math.round((refundableBase * refundPercent) / 100);

    res.json({
      ok: true,
      quote: {
        bookingId: booking.id,
        policy,
        hoursUntilStart: hours === null ? null : Math.round(hours * 100) / 100,
        paymentStatus: booking.paymentStatus,
        totalAmount: total,
        refundPercent,
        refundAmount,
        cancellationFee: refundableBase - refundAmount,
        requiresManualReconciliation: paid && refundAmount > 0,
        note: paid
          ? 'Refund is subject to provider reconciliation; no money has moved.'
          : 'Booking is pay-later; cancelling releases the reservation without a refund.',
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Manual refund reconciliation (admin only; refuses without a provider)
  // ---------------------------------------------------------------------------
  app.post('/api/refunds/:refundId/reconcile-manual', (req, res) => {
    const claims = authorize(req, res, ['admin']);
    if (!claims) return;
    const reason = requireReason(res, req.body);
    if (!reason) return;

    const refundId = String(req.params.refundId || '').trim();
    if (!refundId) {
      res.status(400).json({ ok: false, error: 'REFUND_ID_REQUIRED' });
      return;
    }
    record(claims, 'refund.reconcile_manual.attempted', reason, refundId);

    res.status(503).json({
      ok: false,
      error: 'REFUND_PROVIDER_NOT_CONFIGURED',
      message:
        'Manual refund reconciliation requires a configured payment provider and an immutable refund ledger. No refund was recorded.',
    });
  });

  // ---------------------------------------------------------------------------
  // Super Admin session + governance
  // ---------------------------------------------------------------------------
  app.post('/api/auth/super-admin/session', async (req, res) => {
    const identity = await deps.verifySuperAdmin?.(req);
    if (!identity) {
      res.status(403).json({ ok: false, error: 'SUPER_ADMIN_DATABASE_AUTHORITY_REQUIRED' });
      return;
    }
    const existing = deps.verifySession(req);
    // PostgreSQL is authoritative. The legacy JSON user record is not required
    // in production and must not decide whether a verified Super Admin can
    // obtain the scoped session.
    if (!existing || existing.supabaseUserId?.toLowerCase() !== identity.id.toLowerCase()) {
      res.status(403).json({ ok: false, error: 'ACTIVE_GOOGLE_ADMIN_SESSION_REQUIRED' });
      return;
    }
    const token = deps.signSession({ ...existing, role: 'admin', scope: 'super_admin' });
    res.json({ ok: true, sessionToken: token, role: 'admin', scope: 'super_admin', issuedAt: Date.now() });
  });

  app.get('/api/super-admin/overview', (req, res) => {
    const claims = authorize(req, res, ['admin']);
    if (!claims) return;
    const store = deps.loadStore();
    const users = store.users || [];
    const listings = Object.values(store.providerListings || {}) as any[];
    const bookings = store.bookings || [];
    const intents = Object.values(store.paymentIntents || {}) as any[];
    const seatLocks = Object.values(store.seatLocks || {}) as any[];
    const bookingLockCount = Object.keys(store.bookingLocks || {}).length;
    const now = Date.now();
    const activeLocks = seatLocks.filter((lock: any) => Number(lock?.expiresAt || 0) > now).length;

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      stats: {
        users: {
          total: users.length,
          active: users.filter((user: any) => user.accountStatus === 'active').length,
          providers: users.filter((user: any) => user.role === 'provider').length,
          admins: users.filter((user: any) => user.role === 'admin').length,
        },
        listings: {
          total: listings.length,
          active: listings.filter((listing: any) => listing.status === 'active').length,
          pending: listings.filter((listing: any) => listing.status === 'pending_approval').length,
          archived: listings.filter((listing: any) => listing.status === 'expired').length,
        },
        bookings: {
          total: bookings.length,
          confirmed: bookings.filter((booking: any) => booking.status === 'confirmed').length,
          cancelled: bookings.filter((booking: any) => booking.status === 'cancelled').length,
          completed: bookings.filter((booking: any) => booking.status === 'completed').length,
          grossAmount: bookings.reduce((sum: number, booking: any) => sum + (Number(booking.totalAmount) || 0), 0),
        },
        locks: { seatLocks: activeLocks, bookingLocks: bookingLockCount },
        payments: {
          intents: intents.length,
          verified: intents.filter((intent: any) => intent.status === 'verified' || intent.paymentStatus === 'verified').length,
        },
        auditLogs: { total: 0, chainValid: true },
      },
      auditIntegrity: {
        chainValid: true,
        genesisRootHash: 'GENESIS',
        latestChainHash: 'NO_AUDIT_RECORDS',
        message: 'No cryptographic audit records are present in this store.',
      },
    });
  });

  app.post('/api/super-admin/users/action', async (req, res) => {
    const claims = authorize(req, res, ['admin'], { requireSuperAdmin: true, allowStoreUnavailable: true });
    if (!claims) return;
    const reason = requireReason(res, req.body);
    if (!reason) return;

    const userId = String(req.body?.userId || '').trim();
    const action = String(req.body?.action || '').trim();
    const isAuthUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);

    // The JSON store is an optional browser compatibility mirror. Production
    // has no such store, so a missing or unreadable mirror must not prevent the
    // authoritative PostgreSQL transaction.
    let store: any = null;
    let user: any = null;
    try {
      store = deps.loadStore();
      user = (store.users || []).find((entry: any) => entry.id === userId || entry.supabaseUserId === userId);
    } catch {
      store = null;
      user = null;
    }
    if (!user && !isAuthUuid) {
      res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
      return;
    }
    const normalizedAction = action === 'verify_kyc' ? 'verify' : action;
    if (!['suspend', 'activate', 'verify', 'promote', 'demote'].includes(normalizedAction)) {
      res.status(400).json({ ok: false, error: 'UNSUPPORTED_USER_ACTION', action });
      return;
    }

    const legacyUserId = String(user?.id || '');
    const targetSupabaseId = String(user?.supabaseUserId || (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(legacyUserId) ? legacyUserId : userId));
    const dbResult = await deps.manageUserAccess?.(req, targetSupabaseId, normalizedAction as any, reason);
    if (!dbResult) {
      res.status(503).json({ ok: false, error: 'AUTHORITATIVE_USER_MANAGEMENT_UNAVAILABLE', message: 'No user change was accepted because the authoritative Supabase operation failed.' });
      return;
    }
    // Mirror the committed database result only when a store was available.
    // A mirror write failure must never turn a committed role change into an
    // error response that invites the operator to retry it.
    if (store && user) {
      user.role = dbResult.role;
      user.accountStatus = dbResult.account_status;
      user.verified = dbResult.verified;
      user.supabaseUserId = dbResult.id;
      if (normalizedAction === 'verify') user.kycDocument = String(req.body?.kycDocument || 'Super Admin manual verification');
      try {
        deps.saveStore(store);
      } catch {
        /* the database change is already committed; the mirror is best-effort */
      }
    }

    record(claims, `user.${normalizedAction}`, reason, `${userId}; previous_role=${dbResult.previous_role || 'recorded in Supabase audit'}; new_role=${dbResult.role}`);
    res.json({ ok: true, message: `User ${userId} updated (${normalizedAction}).`, user: sanitize(user || dbResult), source: 'supabase' });
  });

  app.post('/api/super-admin/listings/action', async (req, res) => {
    const claims = authorize(req, res, ['admin']);
    if (!claims) return;
    const reason = requireReason(res, req.body);
    if (!reason) return;

    const listingId = String(req.body?.listingId || '').trim();
    const action = String(req.body?.action || '').trim();

    // A single PostgreSQL source: when the repository is configured, admin
    // approval/archival never touches the JSON compatibility store.
    if (deps.providerListingRepository) {
      const nextStatus =
        action === 'force_approve' ? 'active' : action === 'archive' ? 'archived' : null;
      if (!nextStatus && action !== 'edit_pricing') {
        res.status(400).json({ ok: false, error: 'UNSUPPORTED_LISTING_ACTION', action });
        return;
      }
      const price = action === 'edit_pricing' ? Number(req.body?.patchData?.price) : undefined;
      try {
        const listing = await deps.providerListingRepository.setStatusForAdmin(
          {
            userId: String(claims.userId || ''),
            supabaseUserId: claims.supabaseUserId,
            email: claims.email,
            name: claims.name,
            phone: claims.phone,
            role: claims.role,
            providerId: claims.providerId,
          },
          listingId,
          nextStatus,
          { price },
        );
        record(claims, `listing.${action}`, reason, listingId);
        res.json({
          ok: true,
          message: `Listing ${listingId} updated (${action}).`,
          listing: sanitize(listing),
          source: 'postgres',
        });
      } catch (error) {
        if (error instanceof ProviderListingRepositoryError) {
          res.status(error.httpStatus).json({ ok: false, error: error.code });
          return;
        }
        res.status(503).json({ ok: false, error: 'LISTING_REPOSITORY_UNAVAILABLE' });
      }
      return;
    }

    const store = deps.loadStore();
    const listing = store.providerListings?.[listingId];
    if (!listing) {
      res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
      return;
    }
    if (action === 'edit_pricing') {
      const price = Number(req.body?.patchData?.price);
      if (!Number.isFinite(price) || price <= 0) {
        res.status(400).json({ ok: false, error: 'INVALID_PRICE' });
        return;
      }
      listing.price = price;
    } else if (action === 'force_approve') listing.status = 'active';
    else if (action === 'archive') listing.status = 'expired';
    else {
      res.status(400).json({ ok: false, error: 'UNSUPPORTED_LISTING_ACTION', action });
      return;
    }
    listing.updatedAt = new Date().toISOString();
    if (!deps.saveStore(store)) {
      res.status(500).json({ ok: false, error: 'STORE_WRITE_FAILED' });
      return;
    }
    record(claims, `listing.${action}`, reason, listingId);
    res.json({ ok: true, message: `Listing ${listingId} updated (${action}).`, listing: sanitize(listing) });
  });

  app.post('/api/super-admin/bookings/action', (req, res) => {
    const claims = authorize(req, res, ['admin']);
    if (!claims) return;
    const reason = requireReason(res, req.body);
    if (!reason) return;

    const bookingId = String(req.body?.bookingId || '').trim();
    const action = String(req.body?.action || '').trim();
    const store = deps.loadStore();
    const booking = (store.bookings || []).find((entry: any) => entry.id === bookingId);
    if (!booking) {
      res.status(404).json({ ok: false, error: 'BOOKING_NOT_FOUND' });
      return;
    }

    if (action === 'reschedule') {
      const nextDate = String(req.body?.rescheduledDate || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
        res.status(400).json({ ok: false, error: 'INVALID_RESCHEDULE_DATE' });
        return;
      }
      booking.scheduledDate = nextDate;
    } else if (action === 'cancel_with_waiver' || action === 'cancel') {
      if (booking.status === 'cancelled') {
        res.status(409).json({ ok: false, error: 'BOOKING_ALREADY_CANCELLED' });
        return;
      }
      if (booking.paymentStatus === 'verified' && Number(booking.totalAmount) > 0) {
        res.status(503).json({
          ok: false,
          error: 'REFUND_PROVIDER_NOT_CONFIGURED',
          message: 'Paid bookings cannot be cancelled administratively until a refund provider is configured.',
        });
        return;
      }
      booking.status = 'cancelled';
      booking.cancelledAt = new Date().toISOString();
      booking.cancellationReason = reason;
    } else if (action === 'override_lock') {
      let released = 0;
      for (const [key, lock] of Object.entries(store.seatLocks || {})) {
        if ((lock as any)?.bookingId === bookingId) {
          delete (store.seatLocks as any)[key];
          released += 1;
        }
      }
      for (const [key, lock] of Object.entries(store.bookingLocks || {})) {
        if ((lock as any)?.bookingId === bookingId) {
          delete (store.bookingLocks as any)[key];
          released += 1;
        }
      }
      if (!deps.saveStore(store)) {
        res.status(500).json({ ok: false, error: 'STORE_WRITE_FAILED' });
        return;
      }
      record(claims, 'booking.override_lock', reason, bookingId);
      res.json({ ok: true, message: `Released ${released} lock(s) for ${bookingId}.`, released });
      return;
    } else {
      res.status(400).json({ ok: false, error: 'UNSUPPORTED_BOOKING_ACTION', action });
      return;
    }

    if (!deps.saveStore(store)) {
      res.status(500).json({ ok: false, error: 'STORE_WRITE_FAILED' });
      return;
    }
    record(claims, `booking.${action}`, reason, bookingId);
    res.json({ ok: true, message: `Booking ${bookingId} updated (${action}).`, booking: sanitize(booking) });
  });

  app.post('/api/super-admin/payments/action', (req, res) => {
    const claims = authorize(req, res, ['admin']);
    if (!claims) return;
    const reason = requireReason(res, req.body);
    if (!reason) return;
    record(claims, 'payment.action.attempted', reason, String(req.body?.action || ''));
    res.status(503).json({
      ok: false,
      error: 'MANUAL_SETTLEMENT_REQUIRES_PROVIDER_EVIDENCE',
      message:
        'Manual payment approval and direct refunds are disabled. A settlement requires provider-verified evidence and an immutable ledger; nothing was changed.',
    });
  });

  app.post('/api/super-admin/retention/execute', (req, res) => {
    const claims = authorize(req, res, ['admin'], { requireSuperAdmin: true });
    if (!claims) return;
    const reason = requireReason(res, req.body);
    if (!reason) return;

    const scope = String(req.body?.scope || '').trim();
    const mode = String(req.body?.mode || 'archive').trim();
    if (mode === 'purge' && !['stale_locks', 'expired_intents'].includes(scope)) {
      res.status(403).json({
        ok: false,
        error: 'AUDIT_LOG_TAMPERING_PROHIBITED',
        message: 'Financial ledgers and audit history cannot be purged.',
      });
      return;
    }
    if (scope === 'stale_locks') {
      const store = deps.loadStore();
      const now = Date.now();
      let removed = 0;
      for (const [key, lock] of Object.entries(store.seatLocks || {})) {
        if (Number((lock as any)?.expiresAt || 0) < now) {
          delete (store.seatLocks as any)[key];
          removed += 1;
        }
      }
      if (!deps.saveStore(store)) {
        res.status(500).json({ ok: false, error: 'STORE_WRITE_FAILED' });
        return;
      }
      record(claims, 'retention.stale_locks', reason, `removed=${removed}`);
      res.json({ ok: true, message: `Removed ${removed} expired seat lock(s).`, removed });
      return;
    }
    res.status(501).json({
      ok: false,
      error: 'RETENTION_SCOPE_NOT_IMPLEMENTED',
      scope,
      message: 'This retention scope has no safe implementation; nothing was archived or deleted.',
    });
  });

  app.post('/api/super-admin/database/dry-run-migration', (req, res) => {
    const claims = authorize(req, res, ['admin'], { requireSuperAdmin: true });
    if (!claims) return;
    const reason = requireReason(res, req.body);
    if (!reason) return;

    const migrationDir = path.join(process.cwd(), 'supabase', 'migrations');
    let migrations: string[] = [];
    try {
      migrations = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();
    } catch {
      migrations = [];
    }
    record(claims, 'database.dry_run', reason, `${migrations.length} migrations`);
    res.json({
      ok: true,
      mode: 'dry_run',
      executed: false,
      migrations,
      message: `Read ${migrations.length} migration file(s). No DDL was executed.`,
    });
  });

  app.post('/api/super-admin/database/backup-snapshot', (req, res) => {
    const claims = authorize(req, res, ['admin'], { requireSuperAdmin: true });
    if (!claims) return;
    const reason = requireReason(res, req.body);
    if (!reason) return;

    const snapshotId = `bos-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
      const targetDir = path.join(process.cwd(), 'backups');
      fs.mkdirSync(targetDir, { recursive: true });
      const payload = JSON.stringify(deps.loadStore(), null, 2);
      const target = path.join(targetDir, `${snapshotId}.json`);
      fs.writeFileSync(target, payload, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      record(claims, 'database.backup', reason, snapshotId);
      res.json({
        ok: true,
        snapshotId,
        file: path.relative(process.cwd(), target),
        bytes: Buffer.byteLength(payload),
        message: 'Store snapshot written. This is a JSON compatibility store snapshot, not a PostgreSQL dump.',
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: 'SNAPSHOT_FAILED', message: err?.message || 'Snapshot failed.' });
    }
  });

  app.post('/api/super-admin/database/rollback-snapshot', (req, res) => {
    const claims = authorize(req, res, ['admin'], { requireSuperAdmin: true });
    if (!claims) return;
    const reason = requireReason(res, req.body);
    if (!reason) return;
    record(claims, 'database.rollback.refused', reason, 'no approved rollback procedure');
    res.status(501).json({
      ok: false,
      error: 'ROLLBACK_REQUIRES_APPROVED_PROCEDURE',
      message: 'Automated rollback is not implemented. No data was restored or deleted.',
    });
  });

  app.get('/api/super-admin/audit-logs/verify', (req, res) => {
    const claims = authorize(req, res, ['admin']);
    if (!claims) return;
    res.json({
      ok: true,
      chainValid: true,
      total: 0,
      genesisRootHash: 'GENESIS',
      latestChainHash: 'NO_AUDIT_RECORDS',
      message: 'No cryptographic audit records are present; nothing to verify.',
    });
  });

  // ---------------------------------------------------------------------------
  // Messaging (no provider configured → explicit 503, never a fake send)
  // ---------------------------------------------------------------------------
  app.post('/api/sms/send', (req, res) => {
    const claims = authorize(req, res, ['admin']);
    if (!claims) return;
    res.status(503).json({
      ok: false,
      error: 'SMS_PROVIDER_NOT_CONFIGURED',
      message: 'No SMS provider is configured. No message was sent.',
    });
  });

  // ---------------------------------------------------------------------------
  // Razorpay (test-mode only; fail closed without credentials)
  // ---------------------------------------------------------------------------
  const razorpayAuthHeader = () =>
    `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`;

  app.post('/api/payments/razorpay/create-order', async (req, res) => {
    const claims = authorize(req, res, ['customer', 'admin']);
    if (!claims) return;

    // Every order is bound to one server-known booking. A client-supplied
    // amount can never become the payable amount, so a forged price is refused
    // before any network call.
    const bookingId = String(req.body?.bookingId || '').trim();
    if (!bookingId) {
      res.status(400).json({
        ok: false,
        error: 'BOOKING_ID_REQUIRED',
        message: 'A bookingId is required: Razorpay orders are bound to a server-priced booking.',
      });
      return;
    }
    const store = deps.loadStore();
    const booking = (store.bookings || []).find((entry: any) => entry.id === bookingId);
    if (!booking) {
      res.status(404).json({ ok: false, error: 'BOOKING_NOT_FOUND', message: 'No booking matches that id.' });
      return;
    }
    if (claims.role !== 'admin' && String(booking.customerUserId || '') !== String(claims.userId)) {
      res.status(403).json({
        ok: false,
        error: 'BOOKING_NOT_OWNED_BY_SESSION',
        message: 'This booking belongs to another customer.',
      });
      return;
    }
    if (['verified', 'refunded'].includes(String(booking.paymentStatus || ''))) {
      res.status(409).json({
        ok: false,
        error: 'BOOKING_ALREADY_SETTLED',
        message: `This booking is already ${booking.paymentStatus}.`,
      });
      return;
    }
    const serverAmount = Number(booking.totalAmount);
    if (!Number.isFinite(serverAmount) || serverAmount <= 0 || serverAmount > 500000) {
      res.status(409).json({
        ok: false,
        error: 'BOOKING_AMOUNT_NOT_PAYABLE',
        message: 'The booking has no server-payable amount.',
      });
      return;
    }
    const requestedAmount = req.body?.amount === undefined ? serverAmount : Number(req.body.amount);
    if (!Number.isFinite(requestedAmount) || Math.round(requestedAmount * 100) !== Math.round(serverAmount * 100)) {
      res.status(400).json({
        ok: false,
        error: 'PAYMENT_AMOUNT_MISMATCH',
        message: 'The requested amount does not match the server-priced booking. No order was created.',
        serverAmount,
      });
      return;
    }
    if (!razorpayConfigured) {
      res.status(503).json({
        ok: false,
        error: 'RAZORPAY_NOT_CONFIGURED',
        message: 'Razorpay credentials are not configured. No order was created.',
      });
      return;
    }
    const amount = serverAmount;
    const amountInPaise = Math.round(amount * 100);
    try {
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: razorpayAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `bos_${Date.now()}`,
          notes: { listingId: String(req.body?.listingId || ''), userId: String(claims.userId) },
        }),
      });
      const data: any = await response.json();
      if (!response.ok || !data?.id) {
        res.status(502).json({
          ok: false,
          error: 'RAZORPAY_ORDER_FAILED',
          message: 'Razorpay rejected the order request. No order was created.',
        });
        return;
      }
      const intentId = `INT-${crypto.randomUUID()}`;
      store.paymentIntents = store.paymentIntents || {};
      store.paymentIntents[intentId] = {
        id: intentId,
        userId: claims.userId,
        bookingId,
        listingId: String(booking.listingId || ''),
        providerId: String(booking.providerId || ''),
        purpose: 'booking',
        vertical: String(req.body?.vertical || booking.vertical || ''),
        amount,
        amountInPaise,
        currency: 'INR',
        razorpayOrderId: data.id,
        status: 'created',
        provider: 'razorpay',
        createdAt: new Date().toISOString(),
      };
      if (!deps.saveStore(store)) {
        res.status(500).json({ ok: false, error: 'STORE_WRITE_FAILED' });
        return;
      }
      res.json({
        ok: true,
        intentId,
        razorpayOrderId: data.id,
        amount,
        amountInPaise,
        currency: 'INR',
        keyId: razorpayKeyId,
      });
    } catch {
      res.status(502).json({ ok: false, error: 'RAZORPAY_UNREACHABLE', message: 'Razorpay could not be reached.' });
    }
  });

  app.post('/api/payments/razorpay/verify', (req, res) => {
    const claims = authorize(req, res, ['customer', 'admin']);
    if (!claims) return;
    if (!razorpayConfigured) {
      res.status(503).json({ ok: false, error: 'RAZORPAY_NOT_CONFIGURED' });
      return;
    }
    const { intentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
    if (!intentId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({ ok: false, error: 'MISSING_SIGNATURE_FIELDS' });
      return;
    }
    const expected = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    if (!safeEqual(String(razorpaySignature), expected)) {
      res.status(400).json({ ok: false, error: 'INVALID_RAZORPAY_SIGNATURE' });
      return;
    }
    const store = deps.loadStore();
    const intent = store.paymentIntents?.[String(intentId)];
    if (!intent) {
      res.status(404).json({ ok: false, error: 'INTENT_NOT_FOUND' });
      return;
    }
    if (intent.userId !== claims.userId && claims.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'INTENT_NOT_OWNED_BY_SESSION' });
      return;
    }
    if (intent.razorpayOrderId !== razorpayOrderId) {
      res.status(409).json({ ok: false, error: 'ORDER_INTENT_MISMATCH' });
      return;
    }
    const computeToken = () => crypto
      .createHmac('sha256', `${deps.hmacSecret}:RAZORPAY_VERIFIED`)
      .update(`${intentId}|${razorpayPaymentId}|${intent.amount}`)
      .digest('hex');
    // A provider payment id may settle exactly one intent. Replays of the same
    // intent/payment pair return the stored token; a second intent is refused.
    store.usedRazorpayPaymentIds = store.usedRazorpayPaymentIds || {};
    const claimedBy = store.usedRazorpayPaymentIds[String(razorpayPaymentId)];
    if (claimedBy && claimedBy !== String(intentId)) {
      res.status(409).json({
        ok: false,
        error: 'DUPLICATE_RAZORPAY_PAYMENT_REPLAY',
        message: 'That provider payment already settled a different order.',
      });
      return;
    }
    if (intent.status === 'verified') {
      if (intent.razorpayPaymentId !== razorpayPaymentId) {
        res.status(409).json({ ok: false, error: 'PAYMENT_INTENT_ALREADY_SETTLED' });
        return;
      }
      res.json({
        ok: true,
        replayed: true,
        verified: true,
        intentId,
        bookingId: intent.bookingId || null,
        bookingSettlement: Boolean(intent.bookingId),
        razorpayOrderId,
        razorpayPaymentId,
        paymentVerificationToken: intent.paymentVerificationToken || computeToken(),
      });
      return;
    }
    const boundBooking = (store.bookings || []).find((entry: any) => entry.id === intent.bookingId);
    if (!intent.bookingId || !boundBooking) {
      res.status(409).json({
        ok: false,
        error: 'INTENT_NOT_BOUND_TO_BOOKING',
        message: 'This intent is not bound to a booking, so it cannot settle one.',
      });
      return;
    }
    if (Math.round(Number(boundBooking.totalAmount) * 100) !== Math.round(Number(intent.amount) * 100)) {
      res.status(409).json({ ok: false, error: 'BOOKING_AMOUNT_MISMATCH', message: 'The intent amount no longer matches the booking.' });
      return;
    }
    if (['verified', 'refunded'].includes(String(boundBooking.paymentStatus || ''))) {
      res.status(409).json({
        ok: false,
        error: 'BOOKING_ALREADY_SETTLED',
        message: `This booking is already ${boundBooking.paymentStatus}.`,
      });
      return;
    }
    intent.status = 'verified';
    intent.razorpayPaymentId = razorpayPaymentId;
    intent.settlementSource = 'trusted_provider_webhook';
    intent.verifiedAt = new Date().toISOString();
    intent.settledAt = intent.verifiedAt;
    intent.paymentVerificationToken = computeToken();
    store.usedRazorpayPaymentIds[String(razorpayPaymentId)] = String(intentId);
    boundBooking.paymentStatus = 'verified';
    boundBooking.paymentGateway = 'razorpay';
    boundBooking.paymentReference = razorpayPaymentId;
    boundBooking.paidAt = intent.settledAt;
    if (!deps.saveStore(store)) {
      res.status(500).json({ ok: false, error: 'STORE_WRITE_FAILED' });
      return;
    }
    res.json({
      ok: true,
      verified: true,
      intentId,
      razorpayOrderId,
      razorpayPaymentId,
      paymentVerificationToken: intent.paymentVerificationToken,
      bookingSettlement: true,
      bookingId: boundBooking.id,
      note: 'Booking-bound intent verified against a provider signature; the booking that owns it is marked paid.',
    });
  });

  /**
   * Razorpay webhook.
   *
   * Razorpay signs the **raw** request body. Re-serialising req.body (JSON.stringify)
   * changes key order and whitespace and produced false signature failures, so the
   * signature is verified against the exact bytes captured by express.json().
   *
   * The handler settles only the **order-level payment intent this server created**.
   * It never mints a signature for a caller, never marks a booking paid, and every
   * event id is recorded once so duplicate callbacks are idempotent.
   */
  app.post('/api/payments/razorpay/webhook', (req, res) => {
    if (!razorpayWebhookSecret) {
      res.status(503).json({
        ok: false,
        error: 'RAZORPAY_WEBHOOK_NOT_CONFIGURED',
        message: 'No webhook secret is configured. The event was not processed.',
      });
      return;
    }
    const signature = String(req.headers['x-razorpay-signature'] || '').trim();
    if (!signature) {
      res.status(401).json({ ok: false, error: 'MISSING_WEBHOOK_SIGNATURE' });
      return;
    }
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!Buffer.isBuffer(raw) || raw.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'RAW_BODY_UNAVAILABLE',
        message: 'The raw request body was not captured, so the signature cannot be verified. The event was not processed.',
      });
      return;
    }
    const expected = crypto.createHmac('sha256', razorpayWebhookSecret).update(raw).digest('hex');
    if (!safeEqual(signature, expected)) {
      res.status(401).json({ ok: false, error: 'INVALID_WEBHOOK_SIGNATURE' });
      return;
    }

    const event = req.body || {};
    const eventType = String(event.event || '').trim();
    const eventId = String(req.headers['x-razorpay-event-id'] || event.id || '').trim();
    if (!eventId) {
      // Without a provider event id a retried callback cannot be de-duplicated.
      res.status(400).json({
        ok: false,
        error: 'PROVIDER_EVENT_ID_REQUIRED',
        message: 'The provider event id is required for idempotent processing. Nothing was changed.',
      });
      return;
    }

    const store = deps.loadStore();
    store.razorpayWebhookEvents = store.razorpayWebhookEvents || {};
    if (store.razorpayWebhookEvents[eventId]) {
      res.json({
        ok: true,
        replayed: true,
        eventId,
        eventType: store.razorpayWebhookEvents[eventId].eventType || eventType,
        intentId: store.razorpayWebhookEvents[eventId].intentId || null,
        status: store.razorpayWebhookEvents[eventId].status || null,
        bookingSettlement: false,
      });
      return;
    }

    const intents = Object.values(store.paymentIntents || {}) as any[];
    const paymentEntity = event?.payload?.payment?.entity;
    const refundEntity = event?.payload?.refund?.entity;
    const paymentOrderId = String(paymentEntity?.order_id || '').trim();
    const paymentId = String(paymentEntity?.id || '').trim();
    const refundPaymentId = String(refundEntity?.payment_id || '').trim();

    if (eventType === 'payment.captured' || eventType === 'payment.failed' || eventType === 'payment.authorized') {
      const intent = paymentOrderId ? intents.find((entry) => entry.razorpayOrderId === paymentOrderId) : undefined;
      if (!intent) {
        res.status(404).json({
          ok: false,
          error: 'RAZORPAY_ORDER_NOT_FOUND',
          message: 'No server-created payment intent matches that order. Nothing was changed.',
        });
        return;
      }
      const amountPaise = Number(paymentEntity?.amount);
      const expectedPaise = Math.round(Number(intent.amount || 0) * 100);
      if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise !== expectedPaise) {
        res.status(400).json({
          ok: false,
          error: 'PAYMENT_AMOUNT_MISMATCH',
          message: 'The provider amount does not match the server-created intent. Nothing was changed.',
        });
        return;
      }
      if (eventType === 'payment.captured') {
        if (intent.status === 'verified' && intent.razorpayPaymentId !== paymentId) {
          res.status(409).json({
            ok: false,
            error: 'PAYMENT_INTENT_ALREADY_SETTLED',
            message: 'This intent already settled against a different provider payment.',
          });
          return;
        }
        store.usedRazorpayPaymentIds = store.usedRazorpayPaymentIds || {};
        if (paymentId && store.usedRazorpayPaymentIds[paymentId] && store.usedRazorpayPaymentIds[paymentId] !== intent.id) {
          res.status(409).json({
            ok: false,
            error: 'DUPLICATE_RAZORPAY_PAYMENT_REPLAY',
            message: 'This provider payment already settled a different intent.',
          });
          return;
        }
        const boundBooking = (store.bookings || []).find((entry: any) => entry.id === intent.bookingId);
        if (!intent.bookingId || !boundBooking) {
          res.status(409).json({
            ok: false,
            error: 'INTENT_NOT_BOUND_TO_BOOKING',
            message: 'This intent is not bound to a booking, so the capture cannot settle one.',
          });
          return;
        }
        if (Math.round(Number(boundBooking.totalAmount) * 100) !== amountPaise) {
          res.status(400).json({
            ok: false,
            error: 'PAYMENT_AMOUNT_MISMATCH',
            message: 'The captured amount does not match the booking total. Nothing was settled.',
          });
          return;
        }
        if (
          ['verified', 'refunded'].includes(String(boundBooking.paymentStatus || '')) &&
          String(boundBooking.paymentReference || '') !== paymentId
        ) {
          res.status(409).json({
            ok: false,
            error: 'CROSS_BOOKING_SETTLEMENT',
            message: 'This booking already settled against a different provider payment.',
          });
          return;
        }
        intent.status = 'verified';
        intent.razorpayPaymentId = paymentId || intent.razorpayPaymentId;
        intent.settlementSource = 'trusted_provider_webhook';
        intent.settledAt = intent.settledAt || new Date().toISOString();
        intent.verifiedAt = intent.verifiedAt || intent.settledAt;
        store.usedRazorpayPaymentIds = store.usedRazorpayPaymentIds || {};
        if (paymentId) store.usedRazorpayPaymentIds[paymentId] = intent.id;
        boundBooking.paymentStatus = 'verified';
        boundBooking.paymentGateway = 'razorpay';
        boundBooking.paymentReference = paymentId;
        boundBooking.paidAt = intent.settledAt;
      } else if (eventType === 'payment.failed') {
        // A verified capture is never downgraded by a late failure callback.
        if (intent.status !== 'verified' && intent.status !== 'refunded') intent.status = 'failed';
      }
      store.razorpayWebhookEvents[eventId] = {
        eventType,
        intentId: intent.id,
        status: intent.status,
        receivedAt: new Date().toISOString(),
      };
      if (!deps.saveStore(store)) {
        res.status(500).json({ ok: false, error: 'STORE_WRITE_FAILED' });
        return;
      }
      res.json({
        ok: true,
        replayed: false,
        eventId,
        eventType,
        intentId: intent.id,
        bookingId: intent.bookingId || null,
        status: intent.status,
        bookingSettlement: Boolean(intent.bookingId),
        note: intent.bookingId
          ? 'The booking bound to this intent is marked paid only by a signed provider event.'
          : 'Order-level intent only; it is not bound to a booking.',
      });
      return;
    }

    if (eventType === 'refund.processed' || eventType === 'refund.succeeded') {
      const intent = refundPaymentId
        ? intents.find((entry) => entry.razorpayPaymentId === refundPaymentId)
        : undefined;
      if (!intent) {
        res.status(404).json({
          ok: false,
          error: 'RAZORPAY_PAYMENT_NOT_FOUND',
          message: 'No settled intent matches that provider payment. Nothing was changed.',
        });
        return;
      }
      if (intent.status !== 'verified' && intent.status !== 'refunded') {
        res.status(409).json({
          ok: false,
          error: 'PAYMENT_NOT_VERIFIED',
          message: 'Only a verified payment can be refunded.',
        });
        return;
      }
      const refundPaise = Number(refundEntity?.amount);
      const paidPaise = Math.round(Number(intent.amount || 0) * 100);
      if (!Number.isInteger(refundPaise) || refundPaise <= 0 || refundPaise > paidPaise) {
        res.status(400).json({
          ok: false,
          error: 'REFUND_EXCEEDS_PAYMENT',
          message: 'The refund amount is not valid for this payment. Nothing was changed.',
        });
        return;
      }
      const refundBooking = (store.bookings || []).find((entry: any) => entry.id === intent.bookingId);
      if (!intent.bookingId || !refundBooking) {
        res.status(409).json({
          ok: false,
          error: 'INTENT_NOT_BOUND_TO_BOOKING',
          message: 'This intent is not bound to a booking, so no booking refund can be recorded.',
        });
        return;
      }
      intent.status = 'refunded';
      intent.refundPaise = refundPaise;
      intent.refundedAt = intent.refundedAt || new Date().toISOString();
      refundBooking.paymentStatus = 'refunded';
      refundBooking.refundPaise = refundPaise;
      refundBooking.refundedAt = intent.refundedAt;
      store.razorpayWebhookEvents[eventId] = {
        eventType,
        intentId: intent.id,
        status: intent.status,
        receivedAt: new Date().toISOString(),
      };
      if (!deps.saveStore(store)) {
        res.status(500).json({ ok: false, error: 'STORE_WRITE_FAILED' });
        return;
      }
      res.json({
        ok: true,
        replayed: false,
        eventId,
        eventType,
        intentId: intent.id,
        status: 'refunded',
        refundPaise,
        bookingSettlement: false,
      });
      return;
    }

    // Authenticated but unsupported event type: record nothing, claim nothing.
    res.status(202).json({
      ok: true,
      ignored: true,
      eventId,
      eventType,
      message: 'The event signature verified but the event type does not move money. Nothing was changed.',
    });
  });

  app.get('/api/payments/razorpay/order-status/:orderId', (req, res) => {
    const claims = authorize(req, res, ['customer', 'admin']);
    if (!claims) return;
    const orderId = String(req.params.orderId || '').trim();
    const store = deps.loadStore();
    const intent = (Object.values(store.paymentIntents || {}) as any[]).find(
      (entry: any) => entry.razorpayOrderId === orderId || entry.id === orderId
    );
    if (!intent) {
      res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND' });
      return;
    }
    if (intent.userId !== claims.userId && claims.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'ORDER_NOT_OWNED_BY_SESSION' });
      return;
    }
    res.json({
      ok: true,
      order: {
        intentId: intent.id,
        razorpayOrderId: intent.razorpayOrderId,
        status: intent.status,
        amount: intent.amount,
        currency: intent.currency,
        createdAt: intent.createdAt,
        verifiedAt: intent.verifiedAt || null,
      },
    });
  });

  app.get('/api/payments/razorpay/history', (req, res) => {
    const claims = authorize(req, res, ['customer', 'admin']);
    if (!claims) return;
    const store = deps.loadStore();
    const orders = (Object.values(store.paymentIntents || {}) as any[])
      .filter((entry: any) => entry.provider === 'razorpay' && (claims.role === 'admin' || entry.userId === claims.userId))
      .map((entry: any) => ({
        intentId: entry.id,
        razorpayOrderId: entry.razorpayOrderId,
        status: entry.status,
        amount: entry.amount,
        currency: entry.currency,
        createdAt: entry.createdAt,
        verifiedAt: entry.verifiedAt || null,
      }))
      .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ ok: true, orders, count: orders.length });
  });

  // Generic provider webhook: refuse rather than silently accepting money events.
  app.post('/api/payments/webhook', (req, res) => {
    if (!razorpayWebhookSecret) {
      res.status(503).json({
        ok: false,
        error: 'PAYMENT_WEBHOOK_NOT_CONFIGURED',
        message: 'No payment webhook secret is configured. The event was not processed.',
      });
      return;
    }
    res.status(401).json({ ok: false, error: 'UNSIGNED_PAYMENT_WEBHOOK_REJECTED' });
  });
}
