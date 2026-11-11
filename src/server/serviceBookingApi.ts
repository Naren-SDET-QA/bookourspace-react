import { logSafeError } from './safeLogging';
import type express from 'express';
import {
  ServiceBookingRepository,
  ServiceBookingRepositoryError,
  type ServiceBookingAction,
} from './serviceBookingRepository';
import {
  ProviderListingRepositoryError,
  type ProviderListingActor,
} from './providerListingRepository';

export interface ServiceBookingApiDependencies {
  repository: ServiceBookingRepository;
  verifySession: (request: express.Request) => ProviderListingActor | null;
}

function sendError(response: express.Response, error: unknown): void {
  if (error instanceof ProviderListingRepositoryError) {
    response.status(error.httpStatus).json({ ok: false, error: error.code });
    return;
  }
  logSafeError('service-bookings', 'repository', error);
  response.status(500).json({ ok: false, error: 'SERVICE_BOOKING_REPOSITORY_ERROR' });
}

function sessionOrReject(
  request: express.Request,
  response: express.Response,
  verifySession: ServiceBookingApiDependencies['verifySession'],
  allowedRoles: Array<ProviderListingActor['role']>,
): ProviderListingActor | null {
  const actor = verifySession(request);
  if (!actor) {
    response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    return null;
  }
  if (!allowedRoles.includes(actor.role)) {
    response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
    return null;
  }
  if (actor.authProvider !== 'google' || !actor.supabaseUserId) {
    response.status(403).json({
      ok: false,
      error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED',
      message: 'Sign in with Google to use service bookings backed by PostgreSQL.',
    });
    return null;
  }
  return actor;
}

const ACTIONS = new Set<ServiceBookingAction>(['accept', 'reject', 'start', 'complete', 'cancel', 'reschedule']);

export function registerServiceBookingApi(
  app: express.Express,
  dependencies: ServiceBookingApiDependencies,
): void {
  const { repository, verifySession } = dependencies;

  // Public configuration. Secrets are never returned; only whether the server
  // has a payment provider configured. A UPI QR/intent is an instruction, not
  // proof of payment — settlement still requires verified server evidence.
  app.get('/api/services/payment-config', (_request, response) => {
    const vpa = String(process.env.BOS_SERVICES_UPI_VPA || '').trim();
    const payeeName = String(process.env.BOS_SERVICES_UPI_NAME || 'BookOurSpace Services').trim();
    response.json({
      ok: true,
      payAfterService: true,
      upi: {
        enabled: /^[a-z0-9._-]{2,64}@[a-z]{2,32}$/i.test(vpa),
        vpa: /^[a-z0-9._-]{2,64}@[a-z]{2,32}$/i.test(vpa) ? vpa : null,
        payeeName,
      },
      razorpay: {
        configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      },
    });
  });

  app.post('/api/services/bookings', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['customer']);
    if (!actor) return;
    try {
      const result = await repository.createBooking(actor, request.body || {});
      response.status(result.idempotent ? 200 : 201).json({ ok: true, ...result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/services/bookings', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['customer', 'provider', 'admin']);
    if (!actor) return;
    try {
      response.json({ ok: true, bookings: await repository.listForActor(actor), source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/services/bookings/:id/actions', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['customer', 'provider', 'admin']);
    if (!actor) return;
    const action = String(request.body?.action || '') as ServiceBookingAction;
    if (!ACTIONS.has(action)) {
      response.status(400).json({ ok: false, error: 'INVALID_SERVICE_BOOKING_ACTION' });
      return;
    }
    try {
      const result = await repository.transition(actor, String(request.params.id || ''), action, request.body || {});
      response.json({ ok: true, ...result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/services/bookings/:id/confirm-delivery', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['provider', 'admin']);
    if (!actor) return;
    try {
      const booking = await repository.confirmDelivery(actor, String(request.params.id || ''));
      response.json({ ok: true, booking, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/services/bookings/:id/otp', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['customer']);
    if (!actor) return;
    try {
      const code = await repository.createDeliveryOtp(actor, String(request.params.id || ''));
      response.status(201).json({ ok: true, code, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/services/bookings/:id/verify-otp', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['provider', 'admin']);
    if (!actor) return;
    const code = String(request.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) {
      response.status(400).json({ ok: false, error: 'OTP_INVALID' });
      return;
    }
    try {
      const verified = await repository.verifyDeliveryOtp(actor, String(request.params.id || ''), code);
      response.json({ ok: true, verified, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/services/earnings', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['provider']);
    if (!actor) return;
    try {
      response.json({ ok: true, earnings: await repository.earnings(actor), source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/services/bookings/:id/payment-claim', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['provider']);
    if (!actor) return;
    try {
      const claim = await repository.recordPaymentClaim(actor, String(request.params.id || ''), request.body || {});
      response.status(201).json({ ok: true, claim, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/services/payment-claims', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['provider', 'admin']);
    if (!actor) return;
    try {
      response.json({ ok: true, claims: await repository.listPaymentClaims(actor), source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/services/payment-claims/:id/decision', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['admin']);
    if (!actor) return;
    const decision = String(request.body?.decision || '');
    if (decision !== 'approved' && decision !== 'rejected') {
      response.status(400).json({ ok: false, error: 'INVALID_CLAIM_DECISION' });
      return;
    }
    try {
      const result = await repository.decidePaymentClaim(
        actor,
        String(request.params.id || ''),
        decision,
        String(request.body?.reviewNote || ''),
      );
      response.json({ ok: true, ...result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/services/bookings/:id/review', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['customer']);
    if (!actor) return;
    try {
      const review = await repository.addReview(actor, String(request.params.id || ''), request.body || {});
      response.status(201).json({ ok: true, review, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/services/listings/:id/reviews', async (request, response) => {
    try {
      const reviews = await repository.listPublishedReviews(String(request.params.id || ''));
      response.json({ ok: true, reviews });
    } catch (error) {
      sendError(response, error);
    }
  });
}
