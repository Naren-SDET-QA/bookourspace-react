import crypto from 'node:crypto';

/**
 * HTTP-level assertions for the stay checkout / UPI settlement / refund slice.
 * The database and server lifecycle are owned by run_stay_payment_e2e.sh, which
 * also restarts the server between phase 1 and phase 2.
 *
 * Usage:
 *   node tests/stay-payment.e2e.mjs phase1 <baseUrl> <sessionSecret> <sandboxSecret> <A> <B> <ADMIN>
 *   node tests/stay-payment.e2e.mjs phase2 <baseUrl> <sessionSecret> <sandboxSecret> <A> <B> <ADMIN>
 */

const [, , phase, baseUrl, secret, sandboxSecret, A, B, ADMIN] = process.argv;

const LISTING = 'lst-stay-1';
const ROOM = '11111111-0000-4000-8000-000000000001';
const BASE_PAISE = 250_000; // ₹2,500 per night, seeded in run_stay_payment_e2e.sh
let QUOTED_TOTAL_PAISE = BASE_PAISE * 2;

const failures = [];
let checks = 0;

function check(name, condition, detail) {
  checks += 1;
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function sign(claims) {
  const payload = Buffer.from(
    JSON.stringify({ ...claims, issuedAt: Date.now(), expiresAt: Date.now() + 3_600_000 }),
    'utf8',
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', `${secret}:SESSION_TOKEN_V2`).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

const tokenA = sign({
  userId: 'USR-CUST-A', supabaseUserId: A, email: 'customer.a@example.test',
  name: 'Customer A', role: 'customer', authProvider: 'google',
});
const tokenB = sign({
  userId: 'USR-CUST-B', supabaseUserId: B, email: 'customer.b@example.test',
  name: 'Customer B', role: 'customer', authProvider: 'google',
});
const tokenAdmin = sign({
  userId: 'USR-ADMIN', supabaseUserId: ADMIN, email: 'admin@example.test',
  name: 'Admin', role: 'admin', authProvider: 'google',
});

async function call(path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json };
}

function providerEvent({ eventId, intentId, eventType, amountPaise, providerPaymentId }) {
  const signature = crypto
    .createHmac('sha256', sandboxSecret)
    .update(`${eventId}|${intentId}|${eventType}|${amountPaise}|${providerPaymentId}`)
    .digest('hex');
  return call('/api/payments/sandbox/psp-webhook', {
    method: 'POST',
    headers: { 'x-bos-signature': signature },
    body: { eventId, intentId, eventType, amountPaise, providerPaymentId },
  });
}

const quotePath = (dates) => {
  const [checkIn, checkOut] = dates;
  return `/api/stays/${LISTING}/quote?roomTypeId=${ROOM}&checkIn=${checkIn}&checkOut=${checkOut}&units=1`;
};

const DATES_MAIN = ['2027-06-01', '2027-06-03'];
const DATES_PAY_LATER = ['2027-08-10', '2027-08-12'];
const DATES_CONCURRENT = ['2027-09-01', '2027-09-03'];
const DATES_RAZORPAY = ['2027-10-01', '2027-10-03'];
const RAZORPAY_WEBHOOK_SECRET = 'rzp_test_stay_e2e_webhook';
const RAZORPAY_KEY_SECRET = 'rzp_test_stay_e2e_secret';

const checkoutBody = (dates, paymentMode, idempotencyKey) => ({
  listingId: LISTING,
  roomTypeId: ROOM,
  checkIn: dates[0],
  checkOut: dates[1],
  units: 1,
  paymentMode,
  guestName: 'Test Guest',
  guestPhone: '9876543210',
  idempotencyKey,
});

async function phase1() {
  console.log('--- quote is server computed ---');
  const quote = await call(quotePath(DATES_MAIN));
  check('public quote returns 200', quote.status === 200, `status ${quote.status}`);
  check('quote runs on the database', quote.body?.serverComputed === true);
  QUOTED_TOTAL_PAISE = Number(quote.body?.totalPaise);
  check('quote subtotal = nights × database base price', quote.body?.subtotalPaise === BASE_PAISE * 2, String(quote.body?.subtotalPaise));
  check('quote total includes database-computed fees', Number.isSafeInteger(QUOTED_TOTAL_PAISE) && QUOTED_TOTAL_PAISE >= BASE_PAISE * 2,
    JSON.stringify({ totalPaise: quote.body?.totalPaise, cleaningFeePaise: quote.body?.cleaningFeePaise, serviceFeePaise: quote.body?.serviceFeePaise, taxesPaise: quote.body?.taxesPaise }));
  check('quote reports real availability', quote.body?.availableUnits === 2, String(quote.body?.availableUnits));

  const badQuote = await call(`/api/stays/${LISTING}/quote?roomTypeId=not-a-uuid&checkIn=2027-06-01&checkOut=2027-06-03`);
  check('malformed room type is rejected', badQuote.status === 400, `status ${badQuote.status}`);

  console.log('--- checkout authorization ---');
  const unauth = await call('/api/stays/checkout', { method: 'POST', body: checkoutBody(DATES_MAIN, 'upi', 'unauth-key-0001') });
  check('signed-out checkout is rejected', unauth.status === 401, `status ${unauth.status}`);

  const providerDenied = await call('/api/stays/checkout', { method: 'POST', token: tokenA, body: checkoutBody(DATES_MAIN, 'upi', 'short') });
  check('short idempotency key is rejected', providerDenied.status === 400, `status ${providerDenied.status}`);

  console.log('--- UPI checkout + idempotency ---');
  const keyA = `e2e-main-${Date.now()}`;
  const created = await call('/api/stays/checkout', { method: 'POST', token: tokenA, body: checkoutBody(DATES_MAIN, 'upi', keyA) });
  check('checkout creates a reservation', created.status === 201, `status ${created.status} ${created.body?.message || ''}`);
  check('amount comes from the database quote', created.body?.amountPaise === QUOTED_TOTAL_PAISE, String(created.body?.amountPaise));
  check('a UPI intent URI is issued', String(created.body?.upiUri || '').startsWith('upi://pay?'), String(created.body?.upiUri || '').slice(0, 24));
  check('booking starts unpaid', created.body?.status === 'pending_verification', String(created.body?.status));

  const replay = await call('/api/stays/checkout', { method: 'POST', token: tokenA, body: checkoutBody(DATES_MAIN, 'upi', keyA) });
  check('idempotent replay returns the same booking', replay.status === 200 && replay.body?.bookingId === created.body?.bookingId,
    `${replay.status} ${replay.body?.bookingId} vs ${created.body?.bookingId}`);
  check('replay is flagged', replay.body?.replayed === true);

  const secondRoom = await call('/api/stays/checkout', { method: 'POST', token: tokenB, body: checkoutBody(DATES_MAIN, 'upi', `e2e-b-${Date.now()}`) });
  check('the second physical room is sold to another guest', secondRoom.status === 201, `status ${secondRoom.status} ${secondRoom.body?.message || ''}`);

  const exhausted = await call('/api/stays/checkout', { method: 'POST', token: tokenA, body: checkoutBody(DATES_MAIN, 'upi', `e2e-c-${Date.now()}`) });
  check('a third overlapping reservation is refused', exhausted.status === 409, `status ${exhausted.status}`);

  console.log('--- payment intent isolation ---');
  const intentA = created.body?.intentId;
  const foreignRead = await call(`/api/payments/intents/${intentA}`, { token: tokenB });
  check('another customer cannot read the intent', foreignRead.status === 404, `status ${foreignRead.status}`);
  const ownerRead = await call(`/api/payments/intents/${intentA}`, { token: tokenA });
  check('owner reads their intent', ownerRead.status === 200 && ownerRead.body?.paid === false);

  console.log('--- settlement must be a signed provider event ---');
  const unsigned = await call('/api/payments/sandbox/psp-webhook', {
    method: 'POST',
    body: { eventId: `evt-unsigned-${Date.now()}`, intentId: intentA, eventType: 'payment.captured', amountPaise: QUOTED_TOTAL_PAISE, providerPaymentId: 'pay_unsigned' },
  });
  check('unsigned settlement is rejected', unsigned.status === 401, `status ${unsigned.status}`);

  const wrongAmount = await providerEvent({
    eventId: `evt-amount-${Date.now()}`, intentId: intentA, eventType: 'payment.captured',
    amountPaise: 1, providerPaymentId: 'pay_wrong_amount',
  });
  check('amount mismatch is rejected', wrongAmount.status === 400, `status ${wrongAmount.status}`);

  const stillUnpaid = await call(`/api/payments/intents/${intentA}`, { token: tokenA });
  check('failed events do not settle the intent', stillUnpaid.body?.status === 'pending', String(stillUnpaid.body?.status));

  const eventId = `evt-paid-${Date.now()}`;
  const settled = await providerEvent({
    eventId, intentId: intentA, eventType: 'payment.captured',
    amountPaise: QUOTED_TOTAL_PAISE, providerPaymentId: 'pay_e2e_ok',
  });
  check('signed provider event settles', settled.status === 200 && settled.body?.verified === true, `status ${settled.status} ${settled.body?.message || ''}`);
  check('settlement confirms the booking payment', settled.body?.bookingPaymentStatus === 'verified', String(settled.body?.bookingPaymentStatus));

  const settledAgain = await providerEvent({
    eventId, intentId: intentA, eventType: 'payment.captured',
    amountPaise: QUOTED_TOTAL_PAISE, providerPaymentId: 'pay_e2e_ok',
  });
  check('replayed provider event is idempotent', settledAgain.status === 200 && settledAgain.body?.replayed === true, JSON.stringify(settledAgain.body));

  const paidIntent = await call(`/api/payments/intents/${intentA}`, { token: tokenA });
  check('intent reads as verified', paidIntent.body?.status === 'verified' && paidIntent.body?.paid === true, JSON.stringify(paidIntent.body));

  console.log('--- pay after service ---');
  const payLater = await call('/api/stays/checkout', {
    method: 'POST', token: tokenA, body: checkoutBody(DATES_PAY_LATER, 'pay_after_service', `e2e-later-${Date.now()}`),
  });
  check('pay-after-service reserves a room', payLater.status === 201, `status ${payLater.status} ${payLater.body?.message || ''}`);
  check('pay-after-service is recorded unpaid', payLater.body?.status === 'pay_later', String(payLater.body?.status));
  check('pay-after-service issues no payment URI', payLater.body?.upiUri === null, String(payLater.body?.upiUri));

  const afterPayLater = await call(quotePath(DATES_PAY_LATER));
  check('reserved inventory is no longer offered', afterPayLater.body?.availableUnits === 1, String(afterPayLater.body?.availableUnits));

  console.log('--- Razorpay Checkout + signed webhook ---');
  const capabilities = await call('/api/payments/capabilities');
  check('capabilities report Razorpay when keys are present', capabilities.body?.razorpay === true, JSON.stringify(capabilities.body));
  check('pay at property remains available', capabilities.body?.payAfterService === true);

  const rzpKey = `e2e-rzp-${Date.now()}`;
  const rzpCheckout = await call('/api/stays/checkout', {
    method: 'POST', token: tokenA, body: checkoutBody(DATES_RAZORPAY, 'razorpay', rzpKey),
  });
  check('razorpay checkout holds a room', rzpCheckout.status === 201, `status ${rzpCheckout.status} ${rzpCheckout.body?.message || ''}`);
  check('razorpay checkout returns a sandbox order id', String(rzpCheckout.body?.razorpayOrderId || '').startsWith('order_sandbox_'), String(rzpCheckout.body?.razorpayOrderId || ''));
  check('razorpay checkout stays unpaid until capture', rzpCheckout.body?.status === 'pending_verification', String(rzpCheckout.body?.status));

  const unsignedRzp = await fetch(`${baseUrl}/api/stays/payments/razorpay/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'payment.captured' }),
  });
  check('unsigned Razorpay webhook is rejected', unsignedRzp.status === 401, `status ${unsignedRzp.status}`);

  const paymentId = `pay_sandbox_${Date.now()}`;
  const rzpPayload = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: rzpCheckout.body?.razorpayOrderId,
          amount: QUOTED_TOTAL_PAISE,
          status: 'captured',
        },
      },
    },
  });
  const rzpSig = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(rzpPayload).digest('hex');
  const rzpCapture = await fetch(`${baseUrl}/api/stays/payments/razorpay/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': rzpSig },
    body: rzpPayload,
  });
  const rzpCaptureBody = await rzpCapture.json().catch(() => ({}));
  check('signed Razorpay capture settles the stay', rzpCapture.status === 200 && rzpCaptureBody.status === 'verified', `${rzpCapture.status} ${JSON.stringify(rzpCaptureBody)}`);

  const replayRzp = await fetch(`${baseUrl}/api/stays/payments/razorpay/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': rzpSig },
    body: rzpPayload,
  });
  const replayRzpBody = await replayRzp.json().catch(() => ({}));
  check('replayed Razorpay capture is idempotent', replayRzp.status === 200 && replayRzpBody.replayed === true, JSON.stringify(replayRzpBody));

  const verifySig = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${rzpCheckout.body?.razorpayOrderId}|${paymentId}`).digest('hex');
  const verifyReplay = await call('/api/stays/payments/razorpay/verify', {
    method: 'POST',
    token: tokenA,
    body: {
      intentId: rzpCheckout.body?.intentId,
      razorpayOrderId: rzpCheckout.body?.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: verifySig,
    },
  });
  check('checkout verify after webhook is an idempotent verified read', verifyReplay.status === 200 && verifyReplay.body?.replayed === true, JSON.stringify(verifyReplay.body));

  console.log('--- refund authorization and execution ---');
  const refundUnauth = await call(`/api/payments/intents/${intentA}/refund`, { method: 'POST' });
  check('signed-out refund is rejected', refundUnauth.status === 401, `status ${refundUnauth.status}`);
  const refundCustomer = await call(`/api/payments/intents/${intentA}/refund`, { method: 'POST', token: tokenA });
  check('customer cannot refund themselves', refundCustomer.status === 403, `status ${refundCustomer.status}`);

  const refundAdmin = await call(`/api/payments/intents/${intentA}/refund`, { method: 'POST', token: tokenAdmin });
  check('admin refund is executed in sandbox', refundAdmin.status === 200 && refundAdmin.body?.status === 'refunded', `status ${refundAdmin.status} ${refundAdmin.body?.message || ''}`);
  check('full refund before 48h', refundAdmin.body?.refundPaise === QUOTED_TOTAL_PAISE, String(refundAdmin.body?.refundPaise));

  const releasedQuote = await call(quotePath(DATES_MAIN));
  check('refund frees only the refunded room', releasedQuote.body?.availableUnits === 1, String(releasedQuote.body?.availableUnits));

  const refundReplay = await call(`/api/payments/intents/${intentA}/refund`, { method: 'POST', token: tokenAdmin });
  check('second refund is refused', refundReplay.status === 409, `status ${refundReplay.status}`);

  console.log('--- concurrency: three guests, two rooms, same dates ---');
  const attempts = await Promise.all([
    call('/api/stays/checkout', { method: 'POST', token: tokenA, body: checkoutBody(DATES_CONCURRENT, 'pay_after_service', `e2e-c1-${Date.now()}`) }),
    call('/api/stays/checkout', { method: 'POST', token: tokenB, body: checkoutBody(DATES_CONCURRENT, 'pay_after_service', `e2e-c2-${Date.now()}`) }),
    call('/api/stays/checkout', { method: 'POST', token: tokenA, body: checkoutBody(DATES_CONCURRENT, 'pay_after_service', `e2e-c3-${Date.now()}`) }),
  ]);
  const successes = attempts.filter((attempt) => attempt.status === 201).length;
  const conflicts = attempts.filter((attempt) => attempt.status === 409).length;
  const statuses = attempts.map((a) => a.status).join(',');
  check('at least one concurrent hold succeeds', successes >= 1, `successes=${successes} statuses=${statuses}`);
  check('never more than two rooms are sold', successes <= 2, `successes=${successes} statuses=${statuses}`);
  check('every other concurrent request is a clean conflict', successes + conflicts === 3, `statuses=${statuses}`);
}

async function phase2() {
  console.log('--- data survives a server restart ---');
  const bookings = await call('/api/stays/bookings', { token: tokenA });
  check('bookings read from PostgreSQL after restart', bookings.status === 200 && Array.isArray(bookings.body?.bookings),
    `status=${bookings.status} error=${bookings.body?.error || ''} message=${bookings.body?.message || ''}`);
  const rows = bookings.body?.bookings || [];
  check('the refunded stay is listed', rows.some((row) => row.bookingId?.startsWith('stay-')), `rows=${rows.length}`);
  check('pay-after-service stay is listed', rows.some((row) => row.status === 'confirmed'), JSON.stringify(rows.map((r) => r.status)));

  const quote = await call(quotePath(DATES_PAY_LATER));
  check('inventory state persisted', quote.body?.availableUnits === 1, String(quote.body?.availableUnits));

  const bookingsB = await call('/api/stays/bookings', { token: tokenB });
  check('customer B sees only their own bookings', (bookingsB.body?.bookings || []).every((row) => row.bookingId !== rows[0]?.bookingId),
    `${(bookingsB.body?.bookings || []).length} rows`);
}

(phase === 'phase2' ? phase2() : phase1())
  .then(() => {
    console.log(`\n${checks - failures.length}/${checks} checks passed`);
    if (failures.length) {
      console.log(`FAILED: ${failures.join(', ')}`);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('E2E crashed:', error);
    process.exit(1);
  });
