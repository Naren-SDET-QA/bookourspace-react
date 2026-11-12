import type express from 'express';
import { PgBookingError, PgBookingRepository } from './pgBookingRepository';
import { safeErrorCode } from './safeLogging';
import { hasVerifiedSupabaseIdentity, type VerifiedAuthProvider } from './authIdentity';

export interface PgBookingsApiDependencies {
  repository?: PgBookingRepository | null;
  verifySession: (request: express.Request) => any | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendError(response: express.Response, error: unknown) {
  if (error instanceof PgBookingError) {
    response.status(error.status).json({ ok: false, error: error.code });
    return;
  }
  const code = String((error as any)?.message || '');
  const known: Record<string, [number, string]> = {
    AUTH_REQUIRED: [401, 'AUTH_REQUIRED'],
    ACTIVE_PROFILE_REQUIRED: [403, 'ACTIVE_PROFILE_REQUIRED'],
    ACTIVE_CUSTOMER_REQUIRED: [403, 'ACTIVE_CUSTOMER_REQUIRED'],
    PROVIDER_ROLE_REQUIRED: [403, 'PROVIDER_ROLE_REQUIRED'],
    LISTING_NOT_OWNED: [403, 'LISTING_NOT_OWNED'],
    ROOM_TYPE_NOT_OWNED: [403, 'ROOM_TYPE_NOT_OWNED'],
    PG_BOOKING_DISABLED: [409, 'PG_BOOKING_DISABLED'],
    ACTIVE_PG_LISTING_REQUIRED: [409, 'ACTIVE_PG_LISTING_REQUIRED'],
    REVIEWABLE_PG_LISTING_REQUIRED: [409, 'REVIEWABLE_PG_LISTING_REQUIRED'],
    PG_LISTING_NOT_AVAILABLE: [404, 'PG_LISTING_NOT_AVAILABLE'],
    PG_INVENTORY_NOT_CONFIGURED: [409, 'PG_INVENTORY_NOT_CONFIGURED'],
    PG_INSUFFICIENT_BEDS: [409, 'PG_INSUFFICIENT_BEDS'],
    OCCUPANCY_LIMIT_EXCEEDED: [400, 'OCCUPANCY_LIMIT_EXCEEDED'],
    IDEMPOTENCY_CONFLICT: [409, 'IDEMPOTENCY_CONFLICT'],
    PG_INVENTORY_BEDS_RESERVED: [409, 'PG_INVENTORY_BEDS_RESERVED'],
    INVALID_PG_INVENTORY: [400, 'INVALID_PG_INVENTORY'],
    INVALID_BED_COUNT: [400, 'INVALID_BED_COUNT'],
    PG_BOOKING_NOT_FOUND: [404, 'PG_BOOKING_NOT_FOUND'],
    PG_BOOKING_NOT_OWNED: [403, 'PG_BOOKING_NOT_OWNED'],
    PG_BOOKING_NOT_CANCELLABLE: [409, 'PG_BOOKING_NOT_CANCELLABLE'],
    PG_CANCELLATION_CLOSED: [409, 'PG_CANCELLATION_CLOSED'],
    INVALID_PG_BLOCK: [400, 'INVALID_PG_BLOCK'],
    OWNED_PG_BED_REQUIRED: [403, 'OWNED_PG_BED_REQUIRED'],
    PG_BED_ALREADY_RESERVED: [409, 'PG_BED_ALREADY_RESERVED'],
    PG_BLOCK_OVERLAP: [409, 'PG_BLOCK_OVERLAP'],
    OWNED_PG_BLOCK_REQUIRED: [403, 'OWNED_PG_BLOCK_REQUIRED'],
    INVALID_BLOCK_ID: [400, 'INVALID_BLOCK_ID'],
  };
  const match = Object.keys(known).find((candidate) => code.includes(candidate));
  if (match) {
    response.status(known[match][0]).json({ ok: false, error: known[match][1] });
    return;
  }
  if ((error as any)?.code === 'P0001' || (error as any)?.code === '23P01') {
    response.status(409).json({ ok: false, error: 'PG_INSUFFICIENT_BEDS' });
    return;
  }
  if ((error as any)?.code === '23505') {
    response.status(409).json({ ok: false, error: 'IDEMPOTENCY_CONFLICT' });
    return;
  }
  if (process.env.NODE_ENV === 'test') {
    console.error('[pg-bookings] local test failure', safeErrorCode(error));
  } else {
    console.error('[pg-bookings] database operation failed', String((error as any)?.code || 'NO_CODE'));
  }
  response.status(500).json({ ok: false, error: 'PG_BOOKING_OPERATION_FAILED' });
}

function actorOf(request: express.Request, verifySession: PgBookingsApiDependencies['verifySession']) {
  const actor = verifySession(request);
  if (!actor || !actor.supabaseUserId || !UUID.test(String(actor.supabaseUserId))) return null;
  const businessId = String(request.header('x-business-id') || '').trim();
  return businessId ? { ...actor, businessId } : actor;
}

export function registerPgBookingsApi(app: express.Express, dependencies: PgBookingsApiDependencies): void {
  const repository = dependencies.repository;
  const unavailable = (_request: express.Request, response: express.Response) =>
    response.status(503).json({ ok: false, error: 'PG_BOOKINGS_POSTGRES_UNAVAILABLE' });

  app.get('/api/pg/listings/:listingId/inventory', async (request, response) => {
    if (!repository) return unavailable(request, response);
    try {
      const actor = actorOf(request, dependencies.verifySession);
      const inventory = await repository.inventory(String(request.params.listingId || ''), request.query.moveIn, request.query.months, actor);
      response.json({ ok: true, ...inventory, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.put('/api/provider/pg/listings/:listingId/inventory', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (!['provider', 'admin'].includes(actor.role)) return response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
    try {
      const inventory = await repository.upsertInventory(actor, String(request.params.listingId || ''), request.body || {});
      response.json({ ok: true, inventory, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/provider/pg/listings/:listingId/blocks', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (!['provider', 'admin'].includes(actor.role)) return response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
    try {
      const blocks = await repository.listBlocks(actor, String(request.params.listingId || ''));
      response.json({ ok: true, blocks, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/provider/pg/listings/:listingId/blocks', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (!['provider', 'admin'].includes(actor.role)) return response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
    try {
      const block = await repository.createBlock(actor, String(request.params.listingId || ''), request.body || {});
      response.status(201).json({ ok: true, block, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.delete('/api/provider/pg/listings/:listingId/blocks/:blockId', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (!['provider', 'admin'].includes(actor.role)) return response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
    try {
      const result = await repository.removeBlock(actor, String(request.params.listingId || ''), String(request.params.blockId || ''));
      response.json({ ok: true, ...result, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/pg/bookings', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (!hasVerifiedSupabaseIdentity(actor)) return response.status(403).json({ ok: false, error: 'VERIFIED_SUPABASE_IDENTITY_REQUIRED' });
    if (actor.role !== 'customer') return response.status(403).json({ ok: false, error: 'CUSTOMER_ROLE_REQUIRED' });
    try {
      const booking = await repository.createBooking(actor, request.body || {});
      response.status(booking.replayed ? 200 : 201).json({ ok: true, booking, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/pg/bookings', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    try {
      response.json({ ok: true, bookings: await repository.listBookings(actor), source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  // The cancellation route lives in registerPgPaymentsApi: it owns the
  // refund quote contract (409 with the quote instead of a 200 with a failure
  // body) and it also serves providers and administrators. Registering a
  // second handler for the same method and path here would be shadowed by
  // whichever module is mounted first, so it is deliberately not repeated.
}
