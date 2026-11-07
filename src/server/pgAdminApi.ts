import crypto from 'node:crypto';
import type express from 'express';
import { PgPaymentError, type PgPaymentRepository } from './pgPaymentRepository';
import { logSafeError } from './safeLogging';

export interface PgAdminApiDependencies {
  repository?: PgPaymentRepository | null;
  verifySession: (request: express.Request) => any | null;
  env: NodeJS.ProcessEnv;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SQL_ERRORS: Record<string, number> = {
  AUTH_REQUIRED: 401,
  ACTIVE_PROFILE_REQUIRED: 403,
  ACTIVE_CUSTOMER_REQUIRED: 403,
  ADMIN_REQUIRED: 403,
  FORBIDDEN_ROLE: 403,
  PG_BOOKING_NOT_OWNED: 403,
  PG_BOOKING_NOT_FOUND: 404,
  PG_DISPUTE_NOT_FOUND: 404,
  PG_CLAIM_NOT_FOUND: 404,
  PG_CLAIM_NOT_PERMITTED: 403,
  PG_BOOKING_DISABLED: 409,
  PG_BOOKING_NOT_PAYABLE: 409,
  PG_BOOKING_ALREADY_PAID: 409,
  PG_AMOUNT_NOT_CONFIGURED: 409,
  PG_BOOKING_NOT_CANCELLABLE: 409,
  PG_CANCELLATION_CLOSED: 409,
  PG_PAYMENT_PENDING: 409,
  PG_BOOKING_NOT_CHECKABLE_IN: 409,
  PG_BOOKING_NOT_CHECKED_IN: 409,
  PG_CHECK_IN_NOT_OPEN: 409,
  PG_CHECK_OUT_NOT_OPEN: 409,
  PG_BOOKING_NOT_ADJUSTABLE: 409,
  PG_WAIVER_REQUIRES_UNPAID_BOOKING: 409,
  PG_CLAIM_NOT_ALLOWED: 409,
  PG_CLAIM_ALREADY_DECIDED: 409,
  PG_DISPUTE_ALREADY_OPEN: 409,
  PG_DISPUTE_ALREADY_RESOLVED: 409,
  PG_DISPUTE_NOT_REVIEWABLE: 409,
  REFUND_REQUIRES_VERIFIED_PAYMENT: 409,
  REFUND_NOT_EXPECTED: 409,
  REFUND_AMOUNT_MISMATCH: 409,
  REFUND_NOT_ALLOWED_ON_REJECTION: 400,
  PAYMENT_NOT_VERIFIED: 409,
  PAYMENT_INTENT_NOT_SETTLEABLE: 409,
  PAYMENT_INTENT_NOT_FOUND: 404,
  PAYMENT_AMOUNT_MISMATCH: 400,
  PAYMENT_INTENT_EXPIRED: 409,
  PAYMENT_BINDING_MISMATCH: 409,
  PAYMENT_PROVIDER_MISMATCH: 409,
  INVALID_PROVIDER_EVENT: 400,
  INVALID_PROVIDER_EVENT_TYPE: 400,
  INVALID_DISPUTE_CATEGORY: 400,
  INVALID_DISPUTE_REASON: 400,
  INVALID_DISPUTE_RESOLUTION: 400,
  INVALID_DISPUTE_NOTE: 400,
  INVALID_DISPUTE_AMOUNT: 400,
  INVALID_DISPUTE_ID: 400,
  INVALID_CLAIM_METHOD: 400,
  INVALID_CLAIM_REFERENCE: 400,
  INVALID_CLAIM_AMOUNT: 400,
  INVALID_CLAIM_DECISION: 400,
  INVALID_CLAIM_DECISION_NOTE: 400,
  INVALID_CLAIM_ID: 400,
  INVALID_WAIVER_AMOUNT: 400,
  INVALID_REFUND_AMOUNT: 400,
  INVALID_BOOKING_ID: 400,
  INVALID_BOOKING_ACTION: 400,
  INVALID_INVOICE_KIND: 400,
  NO_REFUND_TO_RECEIPT: 409,
  ADJUSTMENT_REASON_REQUIRED: 400,
  IDEMPOTENCY_CONFLICT: 409,
  PG_AUDIT_IMMUTABLE: 409,
  MERCHANT_VPA_NOT_CONFIGURED: 503,
  RAZORPAY_NOT_CONFIGURED: 503,
  RAZORPAY_WEBHOOK_NOT_CONFIGURED: 503,
  RAZORPAY_INTENT_NOT_FOUND: 404,
  INVALID_WEBHOOK_SIGNATURE: 401,
  PG_AMOUNT_LIMIT_EXCEEDED: 400,
};

function errorCode(error: unknown): string {
  const raw = String((error as any)?.message || '');
  const match = Object.keys(SQL_ERRORS).find((candidate) => raw.includes(candidate));
  if (match) return match;
  const code = String((error as any)?.code || '');
  if (code === '23505') return 'IDEMPOTENCY_CONFLICT';
  if (code === 'P0002') return 'PG_BOOKING_NOT_FOUND';
  if (code === '23P01' || code === 'P0001') return 'PG_INSUFFICIENT_BEDS';
  return '';
}

function sendError(response: express.Response, error: unknown) {
  if (error instanceof PgPaymentError) {
    response.status(error.status).json({ ok: false, error: error.code });
    return;
  }
  const code = errorCode(error);
  if (code) {
    response.status(SQL_ERRORS[code] ?? 409).json({ ok: false, error: code });
    return;
  }
  logSafeError('pg-admin', 'database operation', error);
  response.status(500).json({ ok: false, error: 'PG_ADMIN_OPERATION_FAILED' });
}

function actorOf(request: express.Request, verifySession: PgAdminApiDependencies['verifySession']) {
  const actor = verifySession(request);
  if (!actor || !actor.supabaseUserId || !UUID.test(String(actor.supabaseUserId))) return null;
  return actor;
}

/**
 * Administrator authority is decided on the server.
 *
 * `admin` may read everything and perform operational changes. Moving or
 * forgiving money additionally requires the `super_admin` scope, which the
 * server only issues to a verified Google administrator session.
 */
function requireSuperAdmin(response: express.Response, actor: any): boolean {
  if (actor?.scope !== 'super_admin') {
    response.status(403).json({
      ok: false,
      error: 'SUPER_ADMIN_SCOPE_REQUIRED',
      message: 'A super administrator session is required for money operations.',
    });
    return false;
  }
  return true;
}

function pgTaxPercent(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.BOS_PG_TAX_PERCENT);
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? Math.round(raw * 100) / 100 : 0;
}

function safeEqual(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'utf-8'), Buffer.from(expected, 'utf-8'));
  } catch {
    return false;
  }
}

export function registerPgAdminApi(app: express.Express, dependencies: PgAdminApiDependencies): void {
  const repository = dependencies.repository;
  const env = dependencies.env;
  const unavailable = (_request: express.Request, response: express.Response) =>
    response.status(503).json({ ok: false, error: 'PG_ADMIN_POSTGRES_UNAVAILABLE' });

  // --------------------------------------------------------------- read side
  app.get('/api/admin/pg/bookings', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (actor.role !== 'admin') return response.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    try {
      const limit = Number(request.query.limit) || 100;
      response.json({ ok: true, ...(await repository.adminOverview(actor, limit)), source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  // The audit trail of one reservation is readable by its parties, so that a
  // customer or an owner can see what was recorded about their own money.
  // The path is deliberately distinct from the allocation audit in
  // registerPgPaymentsApi so that neither route shadows the other.
  app.get('/api/pg/bookings/:id/audit-trail', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    try {
      response.json({ ok: true, events: await repository.adminAudit(actor, String(request.params.id || '')), source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/admin/pg/audit', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (actor.role !== 'admin') return response.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    try {
      const bookingId = typeof request.query.bookingId === 'string' ? request.query.bookingId : undefined;
      const limit = Number(request.query.limit) || 100;
      response.json({ ok: true, events: await repository.adminAudit(actor, bookingId, limit), source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  // ------------------------------------------------------- money operations
  app.post('/api/admin/pg/bookings/:id/waive-fee', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (actor.role !== 'admin') return response.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    if (!requireSuperAdmin(response, actor)) return;
    const body = request.body || {};
    try {
      const result = await repository.waiveFee(
        actor,
        String(request.params.id || ''),
        Number(body.amountPaise),
        String(body.reason || ''),
      );
      response.json({ ok: true, booking: result, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/admin/pg/bookings/:id/approve-refund', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (actor.role !== 'admin') return response.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    if (!requireSuperAdmin(response, actor)) return;
    const body = request.body || {};
    try {
      const result = await repository.approveRefund(
        actor,
        String(request.params.id || ''),
        Number(body.amountPaise),
        String(body.reason || ''),
      );
      response.json({ ok: true, booking: result, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  // ---------------------------------------------------------------- disputes
  app.post('/api/pg/bookings/:id/disputes', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    const body = request.body || {};
    try {
      const result = await repository.openDispute(
        actor,
        String(request.params.id || ''),
        String(body.category || ''),
        String(body.reason || ''),
        body.evidence,
        body.amountInDisputePaise == null ? null : Number(body.amountInDisputePaise),
      );
      response.status(201).json({ ok: true, dispute: result, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/pg/bookings/:id/disputes', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    try {
      response.json({ ok: true, disputes: await repository.listDisputes(actor, String(request.params.id || '')), source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/admin/pg/disputes/:id/review', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (actor.role !== 'admin') return response.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    try {
      const result = await repository.reviewDispute(actor, String(request.params.id || ''), String(request.body?.note || ''));
      response.json({ ok: true, dispute: result, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/admin/pg/disputes/:id/resolve', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (actor.role !== 'admin') return response.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    const body = request.body || {};
    const refundPaise = body.refundPaise == null ? null : Number(body.refundPaise);
    if (refundPaise != null && refundPaise > 0 && !requireSuperAdmin(response, actor)) return;
    try {
      const result = await repository.resolveDispute(
        actor,
        String(request.params.id || ''),
        String(body.resolution || ''),
        refundPaise,
        Boolean(body.reject),
      );
      response.json({ ok: true, dispute: result, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  // ------------------------------------------------- offline collection claim
  app.post('/api/provider/pg/bookings/:id/payment-claim', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (!['provider', 'admin'].includes(actor.role)) {
      return response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
    }
    const body = request.body || {};
    try {
      const result = await repository.submitPaymentClaim(
        actor,
        String(request.params.id || ''),
        String(body.method || ''),
        String(body.reference || ''),
        String(body.note || ''),
        Number(body.amountPaise),
        body.evidence,
      );
      response.status(201).json({ ok: true, claim: result, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/pg/bookings/:id/claims', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    try {
      response.json({ ok: true, claims: await repository.listClaims(actor, String(request.params.id || '')), source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.post('/api/admin/pg/claims/:id/decision', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (actor.role !== 'admin') return response.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    if (!requireSuperAdmin(response, actor)) return;
    const body = request.body || {};
    try {
      const result = await repository.decidePaymentClaim(
        actor,
        String(request.params.id || ''),
        String(body.decision || ''),
        String(body.note || ''),
      );
      response.json({ ok: true, claim: result, source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  // ------------------------------------------------------- invoices/receipts
  app.get('/api/pg/bookings/:id/invoice', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    const kind = String(request.query.kind || 'booking_invoice');
    try {
      const invoice = await repository.issueInvoice(actor, String(request.params.id || ''), kind, pgTaxPercent(env));
      response.json({ ok: true, invoice, taxPercent: pgTaxPercent(env), source: 'postgres' });
    } catch (error) { sendError(response, error); }
  });

  app.get('/api/pg/bookings/:id/invoices', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    try {
      response.json({
        ok: true,
        invoices: await repository.listInvoices(actor, String(request.params.id || '')),
        taxPercent: pgTaxPercent(env),
        source: 'postgres',
      });
    } catch (error) { sendError(response, error); }
  });

  // ------------------------------------------------ Razorpay (Test Mode)
  // The signature is verified over the RAW request body, exactly like the
  // Razorpay gateway computes it. A re-serialised body therefore fails, and
  // the money state is only ever moved from the amount PostgreSQL computed.
  app.post('/api/pg/payments/razorpay/webhook', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const webhookSecret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
    if (!webhookSecret) {
      return response.status(503).json({
        ok: false,
        error: 'RAZORPAY_WEBHOOK_NOT_CONFIGURED',
        message: 'No Razorpay webhook secret is configured. Nothing was settled.',
      });
    }
    const rawBody = Buffer.isBuffer((request as any).rawBody)
      ? ((request as any).rawBody as Buffer)
      : Buffer.from(JSON.stringify(request.body ?? {}), 'utf-8');
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!safeEqual(String(request.headers['x-razorpay-signature'] || ''), expected)) {
      return response.status(401).json({
        ok: false,
        error: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'The Razorpay signature did not verify. Nothing was settled.',
      });
    }

    const body = request.body || {};
    const event = String(body.event || '').trim();
    const payload = body.payload || {};
    const entity = payload.payment?.entity || payload.refund?.entity || {};
    const orderId = String(entity.order_id || '').trim();
    const providerReference = String(entity.id || '').trim();
    // A refund event carries the refund id; the settlement has to find the
    // intent through the original payment reference.
    const lookupReference = event === 'refund.processed'
      ? String(entity.payment_id || '').trim()
      : providerReference;
    const amountPaise = Number(entity.amount);
    if (!event || !providerReference) {
      return response.status(400).json({ ok: false, error: 'INVALID_PROVIDER_EVENT' });
    }
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      return response.status(400).json({ ok: false, error: 'INVALID_PROVIDER_EVENT' });
    }

    // A stable event id makes a repeated callback an auditable replay.
    const eventId = `razorpay:${event}:${providerReference}`;
    const eventType = event === 'payment.captured'
      ? 'payment.captured'
      : event === 'payment.failed'
        ? 'payment.failed'
        : event === 'refund.processed'
          ? 'refund.succeeded'
          : '';

    if (!eventType) {
      return response.status(202).json({ ok: true, ignored: true, event });
    }

    try {
      const result = await repository.settleRazorpayEvent({
        eventId,
        orderId,
        eventType,
        providerReference: lookupReference,
        payloadAmountPaise: amountPaise,
        payloadHash: expected,
      });
      response.json({ ok: true, ...result, verified: eventType === 'payment.captured' });
    } catch (error) {
      sendError(response, error);
    }
  });

  // ------------------------------------------------ trusted provider events
  // The signature is the only thing that can move a PG reservation to paid.
  app.post('/api/pg/payments/provider-webhook', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const sandboxSecret = String(env.BOS_PAYMENT_SANDBOX_SECRET || '');
    const sandboxEnabled = String(env.BOS_PAYMENT_SANDBOX || '') === '1'
      && env.NODE_ENV !== 'production' && sandboxSecret.length >= 16;
    if (!sandboxEnabled) {
      return response.status(503).json({
        ok: false,
        error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        message: 'No trusted payment provider is configured. No settlement was recorded.',
      });
    }
    const body = request.body || {};
    const eventId = String(body.eventId || '').trim();
    const intentId = String(body.intentId || '').trim();
    const bookingId = String(body.bookingId || '').trim();
    const eventType = String(body.eventType || '').trim();
    const provider = String(body.provider || '').trim();
    const providerReference = String(body.providerPaymentId || '').trim();
    const amountPaise = Number(body.amountPaise);
    if (!eventId || !intentId || !bookingId || !provider || !providerReference) {
      return response.status(400).json({ ok: false, error: 'INVALID_PROVIDER_EVENT' });
    }
    if (!['payment.captured', 'payment.failed', 'refund.succeeded'].includes(eventType)) {
      return response.status(400).json({ ok: false, error: 'INVALID_PROVIDER_EVENT_TYPE' });
    }
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      return response.status(400).json({ ok: false, error: 'INVALID_PROVIDER_EVENT' });
    }
    const expected = crypto.createHmac('sha256', sandboxSecret)
      .update(`${eventId}|${intentId}|${bookingId}|${eventType}|${provider}|${amountPaise}|${providerReference}`, 'utf-8')
      .digest('hex');
    if (!safeEqual(String(request.headers['x-bos-signature'] || ''), expected)) {
      return response.status(401).json({
        ok: false,
        error: 'INVALID_PROVIDER_SIGNATURE',
        message: 'The provider signature did not verify. Nothing was settled.',
      });
    }
    try {
      const result = await repository.settleProviderEvent({
        eventId, intentId, bookingId, eventType, provider, providerReference, amountPaise, payloadHash: expected,
      });
      response.json({ ok: true, ...result, verified: eventType === 'payment.captured' });
    } catch (error) { sendError(response, error); }
  });
}
