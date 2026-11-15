import crypto from 'node:crypto';

/**
 * Server-issued booking QR token.
 *
 * The QR contains only a signed, opaque booking reference — never guest name,
 * phone, email or address. The HMAC prevents a guest/client from forging a
 * booking or changing its dates. Check-in is still authorized by the database
 * and host ownership checks; reusing a token after check-in is rejected by the
 * booking state machine.
 */
export interface BookingQrPayload {
  v: 1;
  b: string;
  exp: number;
}

function qrSecret(env: NodeJS.ProcessEnv): string {
  const secret = String(env.BOS_BOOKING_QR_SECRET || env.BOS_SERVER_HMAC_SECRET || '').trim();
  if (secret.length < 16) throw new Error('BOOKING_QR_SECRET_NOT_CONFIGURED');
  return secret;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function sign(payload: string, env: NodeJS.ProcessEnv): string {
  return crypto.createHmac('sha256', qrSecret(env)).update(payload, 'utf-8').digest('base64url');
}

/** Issued for 30 days past checkout, so the receipt stays verifiable. */
export function issueBookingQr(bookingId: string, checkOut: string | null, env: NodeJS.ProcessEnv) {
  const checkOutMs = checkOut ? Date.parse(`${checkOut}T00:00:00Z`) : Date.now();
  const exp = Number.isFinite(checkOutMs) ? checkOutMs + 30 * 86_400_000 : Date.now() + 30 * 86_400_000;
  const payload: BookingQrPayload = { v: 1, b: bookingId, exp };
  const encoded = base64url(JSON.stringify(payload));
  return { token: `bos1.${encoded}.${sign(encoded, env)}`, expiresAt: new Date(exp).toISOString() };
}

export function verifyBookingQr(token: string, env: NodeJS.ProcessEnv): BookingQrPayload | null {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'bos1') return null;
  const [, encoded, provided] = parts;
  const expected = sign(encoded, env);
  if (provided.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as BookingQrPayload;
    if (payload?.v !== 1 || typeof payload.b !== 'string' || !payload.b || !Number.isFinite(payload.exp)) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
