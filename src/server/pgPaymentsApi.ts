import crypto from 'crypto';
import type express from 'express';
import { PgPaymentError, type PgPaymentRepository } from './pgPaymentRepository';

export interface PgPaymentsApiDependencies {
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
  PG_LISTING_NOT_AVAILABLE: 404,
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
  PG_INSUFFICIENT_BEDS: 409,
  PG_INVENTORY_NOT_CONFIGURED: 409,
  PG_BOOKING_DISABLED: 409,
  MERCHANT_VPA_NOT_CONFIGURED: 503,
  INVALID_PAYMENT_MODE: 400,
  INVALID_BOOKING_ACTION: 400,
  INVALID_BOOKING_ID: 400,
  INVALID_MOVE_IN_DATE: 400,
  INVALID_PG_BOOKING: 400,
  INVALID_LEASE_MONTHS: 400,
  INVALID_PG_INVENTORY: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  MISSING_IDEMPOTENCY_KEY: 400,
  ADJUSTMENT_REASON_REQUIRED: 400,
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
  console.error('[pg-payments] database operation failed', JSON.stringify({ code: (error as any)?.code, message: String((error as any)?.message || '').slice(0, 400), detail: (error as any)?.detail, where: (error as any)?.where, routine: (error as any)?.routine }));
  response.status(500).json({ ok: false, error: 'PG_PAYMENT_OPERATION_FAILED' });
}

function actorOf(request: express.Request, verifySession: PgPaymentsApiDependencies['verifySession']) {
  const actor = verifySession(request);
  if (!actor || !actor.supabaseUserId || !UUID.test(String(actor.supabaseUserId))) return null;
  return actor;
}

function merchantVpa(env: NodeJS.ProcessEnv): string {
  const configured = String(env.BOS_UPI_MERCHANT_VPA || '').trim();
  if (configured) return configured;
  // No default payee address: without a configured VPA the UPI method stays
  // disabled instead of pointing customers at an address nobody controls.
  return '';
}

function sandboxEnabled(env: NodeJS.ProcessEnv): boolean {
  return String(env.BOS_PAYMENT_SANDBOX || '') === '1'
    && env.NODE_ENV !== 'production'
    && String(env.BOS_PAYMENT_SANDBOX_SECRET || '').length >= 16;
}

function razorpayConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(String(env.RAZORPAY_KEY_ID || '').trim() && String(env.RAZORPAY_KEY_SECRET || '').trim());
}

/**
 * Creates the Razorpay (Test Mode) order for a PG reservation.
 *
 * With real credentials this calls the Razorpay test gateway. In the local
 * sandbox no external request is made: a clearly-labelled sandbox order
 * reference is minted instead, and the money can still only be marked paid by
 * a signed provider event.
 */
async function createRazorpayOrder(
  env: NodeJS.ProcessEnv,
  amountPaise: number,
  receipt: string,
): Promise<{ orderId: string; sandbox: boolean }> {
  if (!razorpayConfigured(env)) {
    throw new PgPaymentError('RAZORPAY_NOT_CONFIGURED', 503);
  }
  if (sandboxEnabled(env)) {
    return { orderId: `order_sandbox_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`, sandbox: true };
  }
  const keyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  const authorization = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  let response: Response;
  try {
    response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, payment_capture: 1 }),
    });
  } catch {
    throw new PgPaymentError('RAZORPAY_UNREACHABLE', 502);
  }
  if (!response.ok) {
    throw new PgPaymentError('RAZORPAY_ORDER_FAILED', 502);
  }
  const payload = await response.json().catch(() => ({}));
  const orderId = String(payload?.id || '').trim();
  if (!orderId) throw new PgPaymentError('RAZORPAY_ORDER_FAILED', 502);
  return { orderId, sandbox: false };
}

export function registerPgPaymentsApi(app: express.Express, dependencies: PgPaymentsApiDependencies): void {
  const repository = dependencies.repository;
  const env = dependencies.env;
  const unavailable = (_request: express.Request, response: express.Response) =>
    response.status(503).json({ ok: false, error: 'PG_PAYMENTS_POSTGRES_UNAVAILABLE' });

  // What can actually be collected right now? Nothing is claimed that the
  // server cannot really execute.
  app.get('/api/pg/payment-capabilities', (_request, response) => {
    const vpa = merchantVpa(env);
    const sandbox = sandboxEnabled(env);
    const razorpay = razorpayConfigured(env);
    response.json({
      ok: true,
      database: Boolean(repository),
      upi: Boolean(vpa),
      payAfterService: true,
      sandbox,
      settlementVerification: sandbox ? 'signed_provider_event' : 'unavailable',
      // Razorpay is offered only when it is both configured and able to be
      // reconciled. Without a signed settlement path it stays disabled.
      razorpay: razorpay && sandbox,
      razorpayConfigured: razorpay,
    });
  });

  app.post('/api/pg/bookings/:id/payment-intent', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (actor.role !== 'customer') return response.status(403).json({ ok: false, error: 'CUSTOMER_ROLE_REQUIRED' });
    const body = request.body || {};
    const idempotencyKey = String(body.idempotencyKey || request.get('x-idempotency-key') || '').trim();
    const paymentMode = String(body.paymentMode || 'upi').trim();
    try {
      let providerReference = '';
      if (paymentMode === 'razorpay') {
        if (!razorpayConfigured(env)) {
          return response.status(503).json({ ok: false, error: 'RAZORPAY_NOT_CONFIGURED' });
        }
        // The order amount is read from the reservation in PostgreSQL. The
        // browser never supplies it.
        const serverAmountPaise = await repository.bookingTotalPaise(actor, String(request.params.id || ''));
        const order = await createRazorpayOrder(env, serverAmountPaise, `pg_${Date.now()}`);
        providerReference = order.orderId;
      }
      const result = await repository.createPaymentIntent(actor, String(request.params.id || ''), {
        paymentMode,
        idempotencyKey,
        merchantVpa: merchantVpa(env),
        merchantName: String(env.BOS_UPI_MERCHANT_NAME || 'BookOurSpace'),
        providerReference,
      });
      response.status(result.replayed ? 200 : 201).json({ ok: true, ...result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/pg/bookings/:id/payment', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    try {
      await repository.sweepExpiredIntents();
      response.json({ ok: true, ...(await repository.paymentState(actor, String(request.params.id || ''))), source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get('/api/pg/bookings/:id/audit', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    try {
      const events = await repository.auditTrail(actor, String(request.params.id || ''));
      response.json({ ok: true, events, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/pg/bookings/:id/cancel', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (!['customer', 'provider', 'admin'].includes(actor.role)) {
      return response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
    }
    try {
      const result = await repository.cancelBooking(actor, String(request.params.id || ''));
      if (result && result.ok === false) {
        response.status(409).json({ ok: false, ...result, source: 'postgres' });
        return;
      }
      response.json({ ok: true, booking: result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/provider/pg/bookings/:id/:action', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (!['provider', 'admin'].includes(actor.role)) {
      return response.status(403).json({ ok: false, error: 'FORBIDDEN_ROLE' });
    }
    try {
      const result = await repository.ownerAction(actor, String(request.params.id || ''), String(request.params.action || ''));
      response.json({ ok: true, booking: result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post('/api/admin/pg/bookings/:id/adjust', async (request, response) => {
    if (!repository) return unavailable(request, response);
    const actor = actorOf(request, dependencies.verifySession);
    if (!actor) return response.status(401).json({ ok: false, error: 'VERIFIED_GOOGLE_IDENTITY_REQUIRED' });
    if (actor.role !== 'admin') return response.status(403).json({ ok: false, error: 'ADMIN_REQUIRED' });
    const body = request.body || {};
    try {
      const result = await repository.adminAdjust(
        actor,
        String(request.params.id || ''),
        String(body.action || ''),
        String(body.reason || ''),
      );
      if (result && result.ok === false) {
        response.status(409).json({ ok: false, ...result, source: 'postgres' });
        return;
      }
      response.json({ ok: true, booking: result, source: 'postgres' });
    } catch (error) {
      sendError(response, error);
    }
  });
}
