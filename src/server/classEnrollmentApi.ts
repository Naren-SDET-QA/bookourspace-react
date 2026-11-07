import type express from 'express';
import {
  ClassEnrollmentError,
  ClassEnrollmentRepository,
} from './classEnrollmentRepository';
import type { ProviderListingActor } from './providerListingRepository';

export interface ClassEnrollmentApiDependencies {
  repository: ClassEnrollmentRepository;
  verifySession: (request: express.Request) => ProviderListingActor | null;
}

function sendError(response: express.Response, error: unknown): void {
  if (error instanceof ClassEnrollmentError) {
    response.status(error.httpStatus).json({ ok: false, error: error.code });
    return;
  }
  const errorCode = (error as any)?.code;
  const errorMessage = (error as any)?.message;
  console.error('[class-enrollments] repository failure', errorCode ?? 'NO_CODE', errorMessage ?? 'NO_MESSAGE');
  if (process.env.NODE_ENV === 'test' && error && typeof error === 'object') {
    const pgError = error as Record<string, unknown>;
    console.error('[class-enrollments] postgres context', JSON.stringify(Object.fromEntries(
      ['code', 'detail', 'hint', 'where', 'schema', 'table', 'constraint', 'routine', 'file', 'line']
        .filter((key) => pgError[key] !== undefined)
        .map((key) => [key, pgError[key]]),
    )));
  }
  if (process.env.NODE_ENV === 'test' && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  response.status(500).json({ ok: false, error: 'CLASS_ENROLLMENT_REPOSITORY_ERROR' });
}

function sessionOrReject(
  request: express.Request,
  response: express.Response,
  verifySession: ClassEnrollmentApiDependencies['verifySession'],
  roles: Array<ProviderListingActor['role']>,
): ProviderListingActor | null {
  const actor = verifySession(request);
  if (!actor) {
    response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
    return null;
  }
  if (!roles.includes(actor.role)) {
    response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
    return null;
  }
  if (!actor.supabaseUserId) {
    response.status(403).json({
      ok: false,
      error: 'POSTGRES_IDENTITY_UNMAPPED',
      message: 'This session has no verified Supabase Auth UUID. Sign in again before enrolling.',
    });
    return null;
  }
  return actor;
}

/**
 * Classes & Training enrollment API.
 *
 * Contract notes:
 * - discovery is public and reads only admin-approved batches of approved
 *   courses;
 * - the student sends a batch id, a delivery mode and a payment *intent*, never
 *   an amount, seat number or paid flag;
 * - online payment is refused until a server-verified provider settlement
 *   exists, so no endpoint can report a paid enrollment it cannot prove;
 * - cancellation returns a policy quote and never claims money moved.
 */
export function registerClassEnrollmentApi(
  app: express.Express,
  dependencies: ClassEnrollmentApiDependencies,
): void {
  const { repository, verifySession } = dependencies;

  // Public batch calendar + live seat availability for an approved course.
  app.get('/api/classes/listings/:listingId/batches', async (request, response) => {
    try {
      const batches = await repository.listPublicBatches(String(request.params.listingId || ''));
      response.setHeader('Cache-Control', 'public, max-age=15');
      response.json({ ok: true, batches, count: batches.length, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Student: transactional enrollment (capacity, duplicate, waitlist rules).
  app.post('/api/classes/enrollments', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['customer']);
    if (!actor) return;
    try {
      const result = await repository.enroll(actor, request.body || {});
      response.status(result.idempotent ? 200 : 201).json({
        ok: true,
        ...result,
        source: 'postgres',
        paymentNotice: result.enrollment.paymentStatus === 'obligation_recorded'
          ? 'Pay at the institute. This confirms a seat and records an obligation; no money was captured online.'
          : result.enrollment.paymentStatus === 'not_required'
            ? 'This batch is free. No payment is due.'
            : null,
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Student: My Classes / trainer: enrollment roster / admin: all enrollments.
  app.get('/api/classes/enrollments', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['customer', 'provider', 'admin']);
    if (!actor) return;
    try {
      const enrollments = await repository.listForActor(actor);
      response.setHeader('Cache-Control', 'private, no-store');
      response.json({ ok: true, enrollments, count: enrollments.length, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/provider/classes/enrollments', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['provider', 'admin']);
    if (!actor) return;
    try {
      response.setHeader('Cache-Control', 'private, no-store');
      response.json({
        ok: true,
        enrollments: await repository.listForActor(actor),
        source: 'postgres',
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/classes/enrollments', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['admin']);
    if (!actor) return;
    try {
      response.setHeader('Cache-Control', 'private, no-store');
      response.json({
        ok: true,
        enrollments: await repository.listForActor(actor),
        source: 'postgres',
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/classes/enrollments/:id/cancel', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['customer', 'provider', 'admin']);
    if (!actor) return;
    try {
      const result = await repository.cancel(
        actor,
        String(request.params.id || ''),
        String(request.body?.reason || ''),
      );
      response.json({ ok: true, ...result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Trainer/admin: own batches (or all batches for an admin) with availability.
  app.get('/api/provider/classes/batches', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['provider', 'admin']);
    if (!actor) return;
    try {
      response.setHeader('Cache-Control', 'private, no-store');
      response.json({
        ok: true,
        batches: await repository.listBatchesForActor(actor, String(request.query?.status || '') || undefined),
        source: 'postgres',
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/admin/classes/batches', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['admin']);
    if (!actor) return;
    try {
      response.setHeader('Cache-Control', 'private, no-store');
      response.json({
        ok: true,
        batches: await repository.listBatchesForActor(actor, String(request.query?.status || '') || undefined),
        source: 'postgres',
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Trainer: create a batch for an owned course. Always pending admin review.
  app.post('/api/provider/classes/listings/:listingId/batches', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['provider', 'admin']);
    if (!actor) return;
    try {
      const batch = await repository.createBatch(
        actor,
        String(request.params.listingId || ''),
        request.body || {},
      );
      response.status(201).json({
        ok: true,
        batch,
        source: 'postgres',
        reviewState: 'pending_approval',
        message: 'Batch submitted. It becomes publicly bookable only after an admin approves it.',
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.patch('/api/provider/classes/batches/:id', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['provider', 'admin']);
    if (!actor) return;
    try {
      const batch = await repository.setOwnBatchStatus(
        actor,
        String(request.params.id || ''),
        String(request.body?.status || ''),
      );
      response.json({ ok: true, batch, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Admin: publish or reject a batch with a mandatory audit reason.
  app.patch('/api/admin/classes/batches/:id/review', async (request, response) => {
    const actor = sessionOrReject(request, response, verifySession, ['admin']);
    if (!actor) return;
    const decision = String(request.body?.decision || '');
    if (decision !== 'active' && decision !== 'rejected') {
      response.status(400).json({ ok: false, error: 'INVALID_REVIEW_DECISION' });
      return;
    }
    const reason = String(request.body?.reason || '').trim();
    if (reason.length < 5) {
      response.status(400).json({
        ok: false,
        error: 'AUDIT_REASON_REQUIRED',
        message: 'A mandatory audit reason of at least 5 characters is required.',
      });
      return;
    }
    try {
      const result = await repository.reviewBatch(actor, String(request.params.id || ''), decision, reason);
      response.json({ ok: true, ...result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });
}
