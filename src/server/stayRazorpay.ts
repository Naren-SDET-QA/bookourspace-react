import crypto from 'crypto';

/**
 * Razorpay helpers for Hotels & Stays.
 *
 * Production settlement never trusts a browser callback. Orders and UPI QR
 * codes are created against the PostgreSQL quote; capture/refund is applied
 * only after a raw-body webhook signature or a server-side payment fetch.
 */

export class StayRazorpayError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message || code);
  }
}

export function stayPaymentSandboxEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.BOS_PAYMENT_SANDBOX === '1'
    && env.NODE_ENV !== 'production'
    && String(env.BOS_PAYMENT_SANDBOX_SECRET || '').trim().length >= 16;
}

export function stayRazorpayKeysConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(String(env.RAZORPAY_KEY_ID || '').trim() && String(env.RAZORPAY_KEY_SECRET || '').trim());
}

export function stayRazorpayWebhookConfigured(env: NodeJS.ProcessEnv): boolean {
  return String(env.RAZORPAY_WEBHOOK_SECRET || '').trim().length >= 16;
}

export function stayRazorpayIsTestKey(env: NodeJS.ProcessEnv): boolean {
  return String(env.RAZORPAY_KEY_ID || '').trim().startsWith('rzp_test_');
}

/** Checkout and verified UPI are offered only when they can be reconciled. */
export function stayRazorpayReady(env: NodeJS.ProcessEnv): boolean {
  if (!stayRazorpayKeysConfigured(env)) return false;
  // Test keys settle via checkout HMAC plus a server-side payment fetch.
  // Live keys still require a webhook secret so production capture is not
  // browser-callback-only.
  if (stayRazorpayIsTestKey(env)) return true;
  return stayPaymentSandboxEnabled(env) || stayRazorpayWebhookConfigured(env);
}

function authHeader(env: NodeJS.ProcessEnv): string {
  const keyId = String(env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || '').trim();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

function safeEqual(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'utf-8'), Buffer.from(expected, 'utf-8'));
  } catch {
    return false;
  }
}

export function verifyRazorpayWebhookSignature(
  rawBody: Buffer,
  signature: string,
  webhookSecret: string,
): boolean {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqual(String(signature || ''), expected);
}

export function verifyRazorpayCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(signature, expected);
}

export async function createStayRazorpayOrder(
  env: NodeJS.ProcessEnv,
  amountPaise: number,
  receipt: string,
): Promise<{ orderId: string; sandbox: boolean }> {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new StayRazorpayError('INVALID_ORDER_AMOUNT', 400);
  }
  if (!stayRazorpayKeysConfigured(env) && !stayPaymentSandboxEnabled(env)) {
    throw new StayRazorpayError('RAZORPAY_NOT_CONFIGURED', 503);
  }
  if (stayPaymentSandboxEnabled(env)) {
    return { orderId: `order_sandbox_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`, sandbox: true };
  }
  let response: Response;
  try {
    response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: authHeader(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: receipt.slice(0, 40),
        payment_capture: 1,
      }),
    });
  } catch {
    throw new StayRazorpayError('RAZORPAY_UNREACHABLE', 502);
  }
  if (!response.ok) throw new StayRazorpayError('RAZORPAY_ORDER_FAILED', 502);
  const payload = await response.json().catch(() => ({}));
  const orderId = String(payload?.id || '').trim();
  if (!orderId) throw new StayRazorpayError('RAZORPAY_ORDER_FAILED', 502);
  return { orderId, sandbox: false };
}

export async function createStayRazorpayUpiQr(
  env: NodeJS.ProcessEnv,
  amountPaise: number,
  description: string,
  merchantVpa: string,
  merchantName: string,
  intentHint: string,
): Promise<{ qrId: string; upiUri: string | null; imageUrl: string | null; sandbox: boolean }> {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new StayRazorpayError('INVALID_ORDER_AMOUNT', 400);
  }
  if (stayPaymentSandboxEnabled(env)) {
    const qrId = `qr_sandbox_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
    const upiUri = merchantVpa.includes('@')
      ? `upi://pay?pa=${encodeURIComponent(merchantVpa)}&pn=${encodeURIComponent(merchantName || 'BookOurSpace')}&am=${(amountPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(description.slice(0, 50))}&tr=${encodeURIComponent(intentHint)}`
      : null;
    return { qrId, upiUri, imageUrl: null, sandbox: true };
  }
  if (!stayRazorpayKeysConfigured(env)) {
    throw new StayRazorpayError('RAZORPAY_NOT_CONFIGURED', 503);
  }
  const closeBy = Math.floor(Date.now() / 1000) + 30 * 60;
  let response: Response;
  try {
    response = await fetch('https://api.razorpay.com/v1/payments/qr_codes', {
      method: 'POST',
      headers: { Authorization: authHeader(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'upi_qr',
        name: (merchantName || 'BookOurSpace').slice(0, 40),
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: amountPaise,
        description: description.slice(0, 80),
        close_by: closeBy,
        notes: { module: 'stays', hint: intentHint.slice(0, 40) },
      }),
    });
  } catch {
    throw new StayRazorpayError('RAZORPAY_UNREACHABLE', 502);
  }
  if (!response.ok) throw new StayRazorpayError('RAZORPAY_UPI_QR_FAILED', 502);
  const payload = await response.json().catch(() => ({}));
  const qrId = String(payload?.id || '').trim();
  if (!qrId) throw new StayRazorpayError('RAZORPAY_UPI_QR_FAILED', 502);
  const imageUrl = String(payload?.image_url || '').trim() || null;
  return { qrId, upiUri: null, imageUrl, sandbox: false };
}

export async function fetchStayRazorpayPayment(
  env: NodeJS.ProcessEnv,
  paymentId: string,
): Promise<{ id: string; status: string; amount: number; orderId: string; method: string }> {
  if (stayPaymentSandboxEnabled(env) && paymentId.startsWith('pay_sandbox_')) {
    return { id: paymentId, status: 'captured', amount: 0, orderId: '', method: 'sandbox' };
  }
  if (!stayRazorpayKeysConfigured(env)) {
    throw new StayRazorpayError('RAZORPAY_NOT_CONFIGURED', 503);
  }
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: authHeader(env) },
    });
  } catch {
    throw new StayRazorpayError('RAZORPAY_UNREACHABLE', 502);
  }
  if (!response.ok) throw new StayRazorpayError('RAZORPAY_PAYMENT_LOOKUP_FAILED', 502);
  const payload = await response.json().catch(() => ({}));
  return {
    id: String(payload?.id || '').trim(),
    status: String(payload?.status || '').trim(),
    amount: Number(payload?.amount),
    orderId: String(payload?.order_id || '').trim(),
    method: String(payload?.method || '').trim(),
  };
}

export async function refundStayRazorpayPayment(
  env: NodeJS.ProcessEnv,
  paymentId: string,
  amountPaise: number,
): Promise<{ refundId: string; sandbox: boolean }> {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new StayRazorpayError('INVALID_REFUND_AMOUNT', 400);
  }
  if (stayPaymentSandboxEnabled(env)) {
    return { refundId: `rfnd_sandbox_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`, sandbox: true };
  }
  if (!stayRazorpayKeysConfigured(env)) {
    throw new StayRazorpayError('RAZORPAY_NOT_CONFIGURED', 503);
  }
  let response: Response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      headers: { Authorization: authHeader(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise }),
    });
  } catch {
    throw new StayRazorpayError('RAZORPAY_UNREACHABLE', 502);
  }
  if (!response.ok) throw new StayRazorpayError('RAZORPAY_REFUND_FAILED', 502);
  const payload = await response.json().catch(() => ({}));
  const refundId = String(payload?.id || '').trim();
  if (!refundId) throw new StayRazorpayError('RAZORPAY_REFUND_FAILED', 502);
  return { refundId, sandbox: false };
}
