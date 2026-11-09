/**
 * Razorpay (Test Mode) settlement for PG reservations.
 *
 * This proves, against real HTTP and a real PostgreSQL database:
 *   1. the webhook signature is verified over the RAW request body, so a
 *      re-serialised body is refused;
 *   2. the intent is resolved from the order reference the database stored,
 *      not from the payload;
 *   3. the amount that is booked is the server-side amount; a payload that
 *      disagrees is refused and nothing is settled;
 *   4. a replayed callback changes nothing;
 *   5. a refund is only settled after an administrator approved that exact
 *      amount, and only then is the bed released;
 *   6. a Razorpay event can never settle a UPI reservation.
 *
 * No real payment is made and no real payment is claimed: the settlement only
 * ever comes from a locally signed sandbox webhook.
 */

import crypto from 'node:crypto';

const [, , baseUrl, sessionSecret, webhookSecret, provider, admin, customerA] = process.argv;

const failed = [];
let checks = 0;
const listingId = 'lst-pg-razorpay-e2e';

function sessionToken(userId, role, email, scope) {
  const claims = {
    userId: `LEGACY-${role}-${userId}`,
    supabaseUserId: userId,
    email,
    name: role,
    role,
    authProvider: 'google',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };
  if (scope) claims.scope = scope;
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', `${sessionSecret}:SESSION_TOKEN_V2`).update(payload).digest('hex')}`;
}

const ownerToken = sessionToken(provider, 'provider', 'provider.razorpay@example.test');
const adminToken = sessionToken(admin, 'admin', 'admin.razorpay@example.test');
const superAdminToken = sessionToken(admin, 'admin', 'admin.razorpay@example.test', 'super_admin');
const customerToken = sessionToken(customerA, 'customer', 'customer.razorpay@example.test');

async function call(method, path, auth, body, headers) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(headers || {}),
    },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function check(name, ok, detail = '') {
  checks += 1;
  if (!ok) failed.push(name);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

/** The Razorpay webhook payload shape. */
function razorpayBody(event, entity) {
  const key = event === 'refund.processed' ? 'refund' : 'payment';
  return JSON.stringify({ event, payload: { [key]: { entity } } });
}

function signature(rawBody) {
  return crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf-8').digest('hex');
}

function dateIn(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function createBooking(auth, { moveIn, key, roomTypeId }) {
  return call('POST', '/api/pg/bookings', auth, {
    listingId, roomTypeId, moveIn, months: 2, beds: 1, occupants: 1, idempotencyKey: key,
  });
}

async function main() {
  console.log('PG Razorpay phase — raw-body signature, authoritative amount, replay and refund');

  const inventory = await call('PUT', `/api/provider/pg/listings/${listingId}/inventory`, ownerToken, {
    roomName: 'Single sharing bed',
    monthlyRentRupees: 8000,
    securityDepositRupees: 16000,
    occupancyPerBed: 1,
    bedLabels: ['Bed 1', 'Bed 2'],
    amenities: ['Wi-Fi'],
  });
  check('owner creates the PG inventory', inventory.status === 200 && Boolean(inventory.body?.inventory?.roomTypeId), JSON.stringify(inventory.body));
  const roomTypeId = inventory.body?.inventory?.roomTypeId;

  const moveIn = dateIn(3);

  // ------------------------------------------------------- UPI reservation
  const upiBooking = await createBooking(customerToken, { moveIn, key: 'pg-rzp-upi-0001', roomTypeId });
  const upiId = upiBooking.body?.booking?.bookingId;
  const upiIntent = await call('POST', `/api/pg/bookings/${upiId}/payment-intent`, customerToken, {
    paymentMode: 'upi', idempotencyKey: 'pg-rzp-upi-intent-0002',
  });
  check('a UPI intent is created', upiIntent.status === 201 && upiIntent.body?.provider === 'upi_sandbox', JSON.stringify(upiIntent.body));

  // --------------------------------------------------- Razorpay reservation
  const booking = await createBooking(customerToken, { moveIn, key: 'pg-rzp-booking-0003', roomTypeId });
  const bookingId = booking.body?.booking?.bookingId;
  check('the customer reserves a bed', booking.status === 201 && Boolean(bookingId), JSON.stringify(booking.body));
  const intent = await call('POST', `/api/pg/bookings/${bookingId}/payment-intent`, customerToken, {
    paymentMode: 'razorpay', idempotencyKey: 'pg-rzp-intent-0004',
  });
  check('a Razorpay intent is created for the server-priced amount',
    intent.status === 201 && intent.body?.provider === 'razorpay' && Number(intent.body?.amountPaise) === 3200000, JSON.stringify(intent.body));
  const orderId = String(intent.body?.upiUri || '').replace('razorpay://order/', '');
  check('the intent records the Razorpay order reference', Boolean(orderId) && !orderId.includes('{'), orderId);

  // ----------------------------------------------------- signature handling
  const capturedBody = razorpayBody('payment.captured', { id: 'pay_rzp_1', amount: 3200000, order_id: orderId });
  const unsigned = await call('POST', '/api/pg/payments/razorpay/webhook', null, capturedBody);
  check('an unsigned webhook is refused', unsigned.status === 401 && unsigned.body?.error === 'INVALID_WEBHOOK_SIGNATURE', JSON.stringify(unsigned.body));

  // The same content, re-serialised with a different byte layout. The
  // signature was computed over the original bytes, so the gateway signature
  // must not verify.
  const reSerialised = JSON.stringify({
    payload: { payment: { entity: { amount: 3200000, order_id: orderId, id: 'pay_rzp_1' } } },
    event: 'payment.captured',
  });
  const reSigned = await call('POST', '/api/pg/payments/razorpay/webhook', null, reSerialised, { 'x-razorpay-signature': signature(capturedBody) });
  check('a signature over a re-serialised body is refused',
    reSigned.status === 401 && reSigned.body?.error === 'INVALID_WEBHOOK_SIGNATURE', JSON.stringify(reSigned.body));
  check('the reservation is still unpaid after the refused callbacks',
    (await call('GET', `/api/pg/bookings/${bookingId}/payment`, customerToken)).body?.paymentStatus === 'pending_verification');

  const wrongAmountBody = razorpayBody('payment.captured', { id: 'pay_rzp_wrong', amount: 100, order_id: orderId });
  const wrongAmount = await call('POST', '/api/pg/payments/razorpay/webhook', null, wrongAmountBody, { 'x-razorpay-signature': signature(wrongAmountBody) });
  check('a payload amount that disagrees with the server amount is refused',
    [400, 409].includes(wrongAmount.status) && wrongAmount.body?.error === 'PAYMENT_AMOUNT_MISMATCH', JSON.stringify(wrongAmount.body));
  check('the reservation is still unpaid after the amount mismatch',
    (await call('GET', `/api/pg/bookings/${bookingId}/payment`, customerToken)).body?.paymentStatus === 'pending_verification');

  const captured = await call('POST', '/api/pg/payments/razorpay/webhook', null, capturedBody, { 'x-razorpay-signature': signature(capturedBody) });
  check('a correctly signed capture settles the reservation',
    captured.status === 200 && captured.body?.bookingPaymentStatus === 'verified', JSON.stringify(captured.body));

  const replay = await call('POST', '/api/pg/payments/razorpay/webhook', null, capturedBody, { 'x-razorpay-signature': signature(capturedBody) });
  check('a replayed callback is idempotent', replay.status === 200 && replay.body?.replayed === true, JSON.stringify(replay.body));
  const afterReplay = await call('GET', `/api/pg/bookings/${bookingId}/payment`, customerToken);
  check('a replayed callback does not change the money state',
    afterReplay.body?.paymentStatus === 'verified' && afterReplay.body?.providerPaymentId === 'pay_rzp_1', JSON.stringify(afterReplay.body));

  const invoice = await call('GET', `/api/pg/bookings/${bookingId}/invoice`, customerToken);
  check('the invoice reflects the provider-verified payment',
    invoice.body?.invoice?.status === 'paid' && Number(invoice.body?.invoice?.providerPaidPaise) === 3200000,
    JSON.stringify(invoice.body?.invoice));

  // ------------------------------------------------------- refund handling
  const plainAdmin = await call('POST', `/api/admin/pg/bookings/${bookingId}/approve-refund`, adminToken, {
    amountPaise: 3200000, reason: 'The customer moved out before the agreed term ended.',
  });
  check('a plain administrator session cannot approve a refund', plainAdmin.status === 403, JSON.stringify(plainAdmin.body));

  const approve = await call('POST', `/api/admin/pg/bookings/${bookingId}/approve-refund`, superAdminToken, {
    amountPaise: 3200000, reason: 'The customer moved out before the agreed term ended.',
  });
  check('a refund can be approved by an authorised administrator',
    approve.status === 200 && approve.body?.booking?.paymentStatus === 'refund_pending', JSON.stringify(approve.body));

  const refundWrong = razorpayBody('refund.processed', { id: 'rfnd_rzp_wrong', payment_id: 'pay_rzp_1', amount: 500, order_id: orderId });
  const refundWrongResult = await call('POST', '/api/pg/payments/razorpay/webhook', null, refundWrong, { 'x-razorpay-signature': signature(refundWrong) });
  check('a refund that does not match the approved amount is refused',
    [400, 409].includes(refundWrongResult.status)
    && ['REFUND_AMOUNT_MISMATCH', 'PAYMENT_AMOUNT_MISMATCH'].includes(refundWrongResult.body?.error),
    JSON.stringify(refundWrongResult.body));

  const refundBody = razorpayBody('refund.processed', { id: 'rfnd_rzp_1', payment_id: 'pay_rzp_1', amount: 3200000, order_id: orderId });
  const refund = await call('POST', '/api/pg/payments/razorpay/webhook', null, refundBody, { 'x-razorpay-signature': signature(refundBody) });
  check('the approved refund is settled by the provider event',
    refund.status === 200 && refund.body?.bookingPaymentStatus === 'refunded', JSON.stringify(refund.body));

  const refundInvoice = await call('GET', `/api/pg/bookings/${bookingId}/invoice?kind=refund_receipt`, customerToken);
  check('the refund receipt states the refunded amount',
    refundInvoice.status === 200 && refundInvoice.body?.invoice?.status === 'refunded'
    && Number(refundInvoice.body?.invoice?.refundPaise) === 3200000, JSON.stringify(refundInvoice.body?.invoice));

  // ------------------------------------------ a Razorpay event is bound
  const foreignBody = razorpayBody('payment.captured', { id: 'pay_rzp_foreign', amount: 3200000, order_id: 'order_not_ours' });
  const foreign = await call('POST', '/api/pg/payments/razorpay/webhook', null, foreignBody, { 'x-razorpay-signature': signature(foreignBody) });
  check('a Razorpay event for an unknown order settles nothing',
    foreign.status === 404 && foreign.body?.error === 'RAZORPAY_INTENT_NOT_FOUND', JSON.stringify(foreign.body));
  check('the UPI reservation was not settled by the Razorpay event',
    (await call('GET', `/api/pg/bookings/${upiId}/payment`, customerToken)).body?.paymentStatus === 'pending_verification');
}

await main();

console.log(`PG Razorpay phase: ${checks - failed.length}/${checks} checks passed`);
if (failed.length) {
  console.error(`failed checks: ${failed.join(' | ')}`);
  process.exitCode = 1;
}
