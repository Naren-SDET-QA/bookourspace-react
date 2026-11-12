import { logSafeError } from './safeLogging';
import type express from 'express';
import {
  ProviderListingRepository,
  ProviderListingRepositoryError,
  type ProviderListingActor,
} from './providerListingRepository';
import { hasVerifiedSupabaseIdentity, type VerifiedAuthProvider } from './authIdentity';

export interface ProviderListingsApiDependencies {
  repository: ProviderListingRepository;
  verifySession: (request: express.Request) => ProviderListingActor | null;
}

function sendError(response: express.Response, error: unknown): void {
  if (error instanceof ProviderListingRepositoryError) {
    response.status(error.httpStatus).json({ ok: false, error: error.code });
    return;
  }
  // Connection strings and SQL values are never logged; only the database
  // error code and message are, so a 500 is diagnosable in operations.
  logSafeError('provider-listings', 'repository', error);
  response.status(500).json({ ok: false, error: 'LISTING_REPOSITORY_ERROR' });
}

function actorOrReject(
  request: express.Request,
  response: express.Response,
  verifySession: ProviderListingsApiDependencies['verifySession'],
): ProviderListingActor | null {
  const actor = verifySession(request);
  if (!actor) {
    response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    return null;
  }
  if (!['provider', 'admin'].includes(actor.role)) {
    response.status(403).json({ ok: false, error: 'FORBIDDEN_PROVIDER_ROLE_REQUIRED' });
    return null;
  }
  if (!actor.supabaseUserId) {
    response.status(403).json({
      ok: false,
      error: 'POSTGRES_IDENTITY_UNMAPPED',
      message: 'This session has no verified Supabase Auth UUID. Sign in again before managing database listings.',
    });
    return null;
  }
  return actor;
}

function googleActorOrReject(
  request: express.Request,
  response: express.Response,
  verifySession: ProviderListingsApiDependencies['verifySession'],
): ProviderListingActor | null {
  const actor = verifySession(request);
  if (!actor) {
    response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    return null;
  }
  if (!hasVerifiedSupabaseIdentity(actor)) {
    response.status(403).json({ ok: false, error: 'VERIFIED_SUPABASE_IDENTITY_REQUIRED' });
    return null;
  }
  return actor;
}

function normalizeListingBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    ownerId: body.ownerId ?? body.owner_id,
    categoryId: body.categoryId ?? body.category_id,
    entityType: body.entityType ?? body.entity_type,
    priceUnit: body.priceUnit ?? body.price_unit,
    requestId: body.requestId ?? body.idempotencyKey,
    providerAvailabilityStatus: body.providerAvailabilityStatus ?? body.provider_availability_status,
  };
}

export function registerProviderListingsApi(
  app: express.Express,
  dependencies: ProviderListingsApiDependencies,
): void {
  const { repository, verifySession } = dependencies;

  app.get('/api/provider/registrations/me', async (request, response) => {
    const actor = googleActorOrReject(request, response, verifySession);
    if (!actor) return;
    try {
      const profile = await repository.provisionGoogleProfile(actor);
      const registration = await repository.ownProviderRegistration({ ...actor, role: profile.role });
      response.json({ ok: true, profile: { role: profile.role, accountStatus: profile.account_status }, registration, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/provider/registrations', async (request, response) => {
    const actor = googleActorOrReject(request, response, verifySession);
    if (!actor) return;
    try {
      const result = await repository.submitProviderRegistration(actor, request.body || {});
      response.status(result.idempotent ? 200 : 201).json({ ok: true, ...result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/provider-registrations', async (request, response) => {
    const actor = actorOrReject(request, response, verifySession);
    if (!actor) return;
    if (actor.role !== 'admin') {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_REQUIRED' });
      return;
    }
    try {
      response.json({ ok: true, registrations: await repository.listProviderRegistrations(actor), source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch('/api/admin/provider-registrations/:id/review', async (request, response) => {
    const actor = actorOrReject(request, response, verifySession);
    if (!actor) return;
    if (actor.role !== 'admin') {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_REQUIRED' });
      return;
    }
    const decision = String(request.body?.decision || '');
    if (decision !== 'approved' && decision !== 'rejected') {
      response.status(400).json({ ok: false, error: 'INVALID_REVIEW_DECISION' });
      return;
    }
    try {
      const result = await repository.reviewProviderRegistration(
        actor,
        String(request.params.id || ''),
        decision,
        String(request.body?.reviewNote || ''),
      );
      if (!result) {
        response.status(404).json({ ok: false, error: 'PROVIDER_REGISTRATION_NOT_FOUND' });
        return;
      }
      response.json({ ok: true, ...result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/provider/listings', async (request, response) => {
    const actor = actorOrReject(request, response, verifySession);
    if (!actor) return;
    try {
      response.json({ ok: true, listings: await repository.listForActor(actor), source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/provider/listings', async (request, response) => {
    const actor = actorOrReject(request, response, verifySession);
    if (!actor) return;
    if (actor.role !== 'admin') {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_REQUIRED' });
      return;
    }
    try {
      response.json({ ok: true, listings: await repository.listForActor(actor), source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/provider-listing-owners', async (request, response) => {
    const actor = actorOrReject(request, response, verifySession);
    if (!actor) return;
    if (actor.role !== 'admin') {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_REQUIRED' });
      return;
    }
    try {
      response.json({ ok: true, providers: await repository.listActiveProviders(actor), source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/provider/listings', async (request, response) => {
    const actor = actorOrReject(request, response, verifySession);
    if (!actor) return;
    try {
      const result = await repository.create(actor, normalizeListingBody(request.body || {}));
      response.status(result.created ? 201 : 200).json({
        ok: true,
        listing: result.listing,
        idempotent: result.idempotent === true,
        source: 'postgres',
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch('/api/provider/listings/:id', async (request, response) => {
    const actor = actorOrReject(request, response, verifySession);
    if (!actor) return;
    try {
      const result = await repository.update(actor, String(request.params.id || ''), normalizeListingBody(request.body || {}));
      if (!result) {
        response.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
        return;
      }
      response.json({
        ok: true,
        listing: result.listing,
        auditEventId: result.auditEventId,
        source: 'postgres',
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch('/api/admin/provider/listings/:id/review', async (request, response) => {
    const actor = actorOrReject(request, response, verifySession);
    if (!actor) return;
    if (actor.role !== 'admin') {
      response.status(403).json({ ok: false, error: 'FORBIDDEN_ADMIN_REQUIRED' });
      return;
    }
    const decision = String(request.body?.decision || '');
    if (decision !== 'active' && decision !== 'rejected') {
      response.status(400).json({ ok: false, error: 'INVALID_REVIEW_DECISION' });
      return;
    }
    try {
      const result = await repository.review(actor, String(request.params.id || ''), decision);
      if (!result) {
        response.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
        return;
      }
      // Review responses do not need a provider's private phone number. Keep
      // contact access on the separate consent/verification contact path.
      const { providerPhone: _providerPhone, ...reviewedListing } = result.listing;
      response.json({ ok: true, listing: reviewedListing, idempotent: result.idempotent, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.delete('/api/provider/listings/:id', async (request, response) => {
    const actor = actorOrReject(request, response, verifySession);
    if (!actor) return;
    try {
      const listingId = String(request.params.id || '');
      const result = await repository.deactivate(actor, listingId);
      if (!result) {
        response.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
        return;
      }
      response.json({
        ok: true,
        deletedId: listingId,
        deactivatedId: listingId,
        alreadyArchived: result.alreadyArchived,
        listing: result.listing,
        source: 'postgres',
      });
    } catch (error) {
      sendError(response, error);
    }
  });
}
