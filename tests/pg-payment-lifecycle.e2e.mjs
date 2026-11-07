/**
 * PG & Hostels payment lifecycle — real HTTP against real PostgreSQL.
 *
 * Every assertion below talks to the running Express API with a signed
 * session token and to the signed sandbox provider callback. Nothing is
 * mocked: the booking rows, the payment intents, the provider events and the
 * inventory allocations all live in PostgreSQL.
 *
 * The money rules this file proves:
 *   1. the payable amount always comes from PostgreSQL, never from the client;
 *   2. an online payment becomes "verified" only after a provider-signed
 *      event, and a replayed event changes nothing;
 *   3. an unsigned or wrong-amount callback settles nothing;
 *   4. unpaid, pending, verified-paid and pay-at-property are distinct;
 *   5. a paid reservation keeps its bed until the refund is reconciled;
 *   6. a pending reservation keeps its bed until the provider resolves it;
 *   7. cross-customer and wrong-owner access is refused.
 */

import crypto from 'node:crypto';

const [, , phase, baseUrl, sessionSecret, sandboxSecret, provider, otherProvider, admin, customerA, customerB, customerC, s1Id] = process.argv;

const failed = [];
let checks = 0;
const listingId = 'lst-pg-pay-e2e';

function sessionToken(userId, role, email, scope) {
  const payload = Buffer.from(JSON.stringify({
    userId: `LEGACY-${role}-${userId}`,
    supabaseUserId: userId,
    email,
    name: role,
    role,
    authProvider: 'google',
    ...(scope ? { scope } : {}),
    providerId: role === 'provider' ? `provider-${userId}` : undefined,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', `${sessionSecret}:SESSION_TOKEN_V2`).update(payload).digest('hex')}`;
}

const ownerToken = sessionToken(provider, 'provider', 'provider.pg@example.test');
const otherOwnerToken = sessionToken(otherProvider, 'provider', 'provider.other@example.test');
const adminToken = sessionToken(admin, 'admin', 'admin.pg@example.test');
const superAdminToken = sessionToken(admin, 'admin', 'admin.pg@example.test', 'super_admin');
const customerAToken = sessionToken(customerA, 'customer', 'customer.a@example.test');
const customerBToken = sessionToken(customerB, 'customer', 'customer.b@example.test');
const customerCToken = sessionToken(customerC, 'customer', 'customer.c@example.test');

async function call(method, path, auth, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function check(name, ok, detail = '') {
  checks += 1;
  if (!ok) failed.push(name);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

function providerEvent(eventId, intentId, bookingId, eventType, amountPaise, providerPaymentId) {
  const provider = 'upi_sandbox';
  const signature = crypto.createHmac('sha256', sandboxSecret)
    .update(`${eventId}|${intentId}|${bookingId}|${eventType}|${provider}|${amountPaise}|${providerPaymentId}`, 'utf-8')
    .digest('hex');
  return { body: { eventId, intentId, bookingId, eventType, provider, amountPaise, providerPaymentId }, signature };
}

function dateIn(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function inventory(moveIn, months = 2, auth = null) {
  return call('GET', `/api/pg/listings/${listingId}/inventory?moveIn=${moveIn}&months=${months}`, auth);
}

async function createBooking(auth, { moveIn, months = 2, beds = 1, occupants = 1, key, roomTypeId }) {
  return call('POST', '/api/pg/bookings', auth, {
    listingId, roomTypeId: roomTypeId || globalThis.__roomTypeId, moveIn, months, beds, occupants, idempotencyKey: key,
  });
}

async function phase1() {
  console.log('PG payment phase 1 — inventory, obligations, settlement, refunds, isolation');

  // ---------------------------------------------------------------- inventory
  const created = await call('PUT', `/api/provider/pg/listings/${listingId}/inventory`, ownerToken, {
    roomName: 'Single sharing bed',
    monthlyRentRupees: 8000,
    securityDepositRupees: 16000,
    occupancyPerBed: 1,
    bedLabels: ['Bed 1', 'Bed 2'],
    amenities: ['Wi-Fi', 'Meals'],
  });
  check('owner creates real PostgreSQL bed inventory', created.status === 200 && Boolean(created.body?.inventory?.roomTypeId), JSON.stringify(created.body));
  globalThis.__roomTypeId = created.body?.inventory?.roomTypeId;
  check('another provider cannot rewrite this PG inventory',
    (await call('PUT', `/api/provider/pg/listings/${listingId}/inventory`, otherOwnerToken, {
      roomName: 'Hijack', monthlyRentRupees: 1, securityDepositRupees: 0, occupancyPerBed: 1, bedLabels: ['X'],
    })).status === 403);

  const moveIn = dateIn(3);
  const start = await inventory(moveIn);
  check('public inventory reports two live beds', start.status === 200 && start.body?.roomTypes?.[0]?.availableBeds === 2, JSON.stringify(start.body));
  check('public inventory never exposes physical bed labels', start.body?.roomTypes?.[0]?.beds?.length === 0);

  // ------------------------------------------------------ S1: pay-at-property
  const s1 = await createBooking(customerAToken, { moveIn, key: 'pg-pay-s1-request-0001' });
  check('customer reserves a bed and the record is unpaid (pay_later)',
    s1.status === 201 && s1.body?.booking?.status === 'confirmed' && s1.body?.booking?.paymentStatus === 'pay_later',
    JSON.stringify(s1.body));
  const s1Id = s1.body?.booking?.bookingId;
  check('server computed the amount (rent 2 months + deposit)',
    s1.body?.booking?.rentPaise === 1600000 && s1.body?.booking?.depositPaise === 1600000 && s1.body?.booking?.totalDuePaise === 3200000,
    JSON.stringify(s1.body?.booking));
  const s1Replay = await createBooking(customerAToken, { moveIn, key: 'pg-pay-s1-request-0001' });
  check('idempotent retry returns the same reservation', s1Replay.status === 200 && s1Replay.body?.booking?.bookingId === s1Id && s1Replay.body?.booking?.replayed === true);
  check('one bed is now unavailable',
    (await inventory(moveIn)).body?.roomTypes?.[0]?.availableBeds === 1);

  // ------------------------------------------------------------- S1: UPI pay
  const tampered = await call('POST', `/api/pg/bookings/${s1Id}/payment-intent`, customerAToken, {
    paymentMode: 'upi', idempotencyKey: 'pg-pay-s1-upi-0001', amountPaise: 1, totalPaise: 1, rentPaise: 1,
  });
  check('client-supplied amounts are ignored; the server price is used',
    tampered.status === 201 && tampered.body?.amountPaise === 3200000, JSON.stringify(tampered.body));
  check('UPI intent exposes a UPI deep link with the server amount',
    typeof tampered.body?.upiUri === 'string' && tampered.body.upiUri.startsWith('upi://pay?') && tampered.body.upiUri.includes('am=32000.00'),
    String(tampered.body?.upiUri));
  const intentId = tampered.body?.intentId;
  check('booking moves to pending_verification while the payment is unresolved',
    tampered.body?.bookingPaymentStatus === 'pending_verification' && tampered.body?.status === 'pending_verification');
  const intentReplay = await call('POST', `/api/pg/bookings/${s1Id}/payment-intent`, customerAToken, {
    paymentMode: 'upi', idempotencyKey: 'pg-pay-s1-upi-0001',
  });
  check('payment intent replay returns the same intent', intentReplay.status === 200 && intentReplay.body?.intentId === intentId && intentReplay.body?.replayed === true);
  const intentConflict = await call('POST', `/api/pg/bookings/${s1Id}/payment-intent`, customerAToken, {
    paymentMode: 'pay_after_service', idempotencyKey: 'pg-pay-s1-upi-0001',
  });
  check('the same idempotency key cannot be reused for a different obligation', intentConflict.status === 409, JSON.stringify(intentConflict.body));

  // ---------------------------------------------- only a trusted event settles
  const unsigned = await call('POST', '/api/pg/payments/provider-webhook', null, {
    eventId: 'evt-unsigned-1', intentId, bookingId: s1Id, provider: 'upi_sandbox', eventType: 'payment.captured', amountPaise: 3200000, providerPaymentId: 'pay_unsigned',
  }, { 'x-bos-signature': 'deadbeef' });
  check('an unsigned provider callback is refused', unsigned.status === 401 && unsigned.body?.error === 'INVALID_PROVIDER_SIGNATURE', JSON.stringify(unsigned.body));
  check('an unsigned callback leaves the booking unpaid',
    (await call('GET', `/api/pg/bookings/${s1Id}/payment`, customerAToken)).body?.paymentStatus === 'pending_verification');

  const wrongAmount = providerEvent('evt-wrong-amount-1', intentId, s1Id, 'payment.captured', 1, 'pay_wrong_amount');
  const wrong = await call('POST', '/api/pg/payments/provider-webhook', null, wrongAmount.body, { 'x-bos-signature': wrongAmount.signature });
  check('a correctly signed callback with the wrong amount is refused',
    wrong.status === 400 && String(wrong.body?.error || '').includes('PAYMENT_AMOUNT_MISMATCH'), JSON.stringify(wrong.body));
  check('the wrong-amount callback leaves the booking unpaid',
    (await call('GET', `/api/pg/bookings/${s1Id}/payment`, customerAToken)).body?.paymentStatus === 'pending_verification');

  const captured = providerEvent('evt-captured-1', intentId, s1Id, 'payment.captured', 3200000, 'pay_captured_1');
  const settled = await call('POST', '/api/pg/payments/provider-webhook', null, captured.body, { 'x-bos-signature': captured.signature });
  check('a signed provider capture verifies the payment', settled.status === 200 && settled.body?.verified === true && settled.body?.bookingPaymentStatus === 'verified', JSON.stringify(settled.body));
  const afterSettle = await call('GET', `/api/pg/bookings/${s1Id}/payment`, customerAToken);
  check('the booking is now verified paid and carries the provider reference',
    afterSettle.body?.paymentStatus === 'verified' && afterSettle.body?.paymentUtR === 'pay_captured_1' && afterSettle.body?.intentStatus === 'verified',
    JSON.stringify(afterSettle.body));

  const replayed = await call('POST', '/api/pg/payments/provider-webhook', null, captured.body, { 'x-bos-signature': captured.signature });
  check('a replayed provider event is idempotent', replayed.status === 200 && replayed.body?.replayed === true, JSON.stringify(replayed.body));
  check('a replayed event does not change the money state',
    (await call('GET', `/api/pg/bookings/${s1Id}/payment`, customerAToken)).body?.paymentStatus === 'verified');

  // ------------------------------------------- cancelling a paid reservation
  const cancelPaid = await call('POST', `/api/pg/bookings/${s1Id}/cancel`, customerAToken, {});
  check('cancelling a paid reservation requires a reconciled refund',
    cancelPaid.status === 409 && cancelPaid.body?.error === 'PG_REFUND_REQUIRED', JSON.stringify(cancelPaid.body));
  check('the refund quote is a full refund before the move-in day',
    cancelPaid.body?.refundPaise === 3200000 && cancelPaid.body?.refundPolicy === 'FULL_REFUND_48H', JSON.stringify(cancelPaid.body));
  check('the bed is NOT released while the money is unresolved',
    cancelPaid.body?.inventoryReleased === false && (await inventory(moveIn)).body?.roomTypes?.[0]?.availableBeds === 1);

  const customerRefund = await call('POST', `/api/admin/pg/bookings/${s1Id}/approve-refund`, customerAToken, {
    amountPaise: 3200000, reason: 'Disposable local refund authorization test',
  });
  check('a customer cannot approve a refund', customerRefund.status === 403, JSON.stringify(customerRefund.body));
  const approval = await call('POST', `/api/admin/pg/bookings/${s1Id}/approve-refund`, adminToken, {
    amountPaise: 3200000, reason: 'Disposable local refund authorization test',
  });
  check('ordinary Admin cannot approve a refund', approval.status === 403, JSON.stringify(approval.body));
  const superAdminApproval = await call('POST', `/api/admin/pg/bookings/${s1Id}/approve-refund`, superAdminToken, {
    amountPaise: 3200000, reason: 'Disposable local refund authorization test',
  });
  check('Super Admin approval records refund_pending without moving money',
    superAdminApproval.status === 200 && superAdminApproval.body?.booking?.paymentStatus === 'refund_pending'
      && superAdminApproval.body?.booking?.inventoryReleased === false, JSON.stringify(superAdminApproval.body));
  const refundEvent = providerEvent('evt-refund-1', intentId, s1Id, 'refund.succeeded', 3200000, 'rfnd_local_test_1');
  const adminRefund = await call('POST', '/api/pg/payments/provider-webhook', null, refundEvent.body,
    { 'x-bos-signature': refundEvent.signature });
  check('signed provider refund reconciliation releases the booking',
    adminRefund.status === 200 && adminRefund.body?.bookingPaymentStatus === 'refunded', JSON.stringify(adminRefund.body));
  const afterRefund = await call('GET', `/api/pg/bookings/${s1Id}/payment`, customerAToken);
  check('the refunded booking records the refunded amount',
    afterRefund.body?.paymentStatus === 'refunded' && Number(afterRefund.body?.refundPaise) === 3200000, JSON.stringify(afterRefund.body));
  check('the bed returns to the market after the refund',
    (await inventory(moveIn)).body?.roomTypes?.[0]?.availableBeds === 2);
  const replayRefund = await call('POST', '/api/pg/payments/provider-webhook', null, refundEvent.body,
    { 'x-bos-signature': refundEvent.signature });
  check('replayed provider refund event is idempotent',
    replayRefund.status === 200 && replayRefund.body?.replayed === true, JSON.stringify(replayRefund.body));

  // ----------------------------------------------- S2: pay at property choice
  const s2 = await createBooking(customerAToken, { moveIn, key: 'pg-pay-s2-request-0002' });
  const s2Id = s2.body?.booking?.bookingId;
  const atProperty = await call('POST', `/api/pg/bookings/${s2Id}/payment-intent`, customerAToken, {
    paymentMode: 'pay_after_service', idempotencyKey: 'pg-pay-s2-property-0002',
  });
  check('pay at property records an obligation and never an online payment',
    atProperty.status === 201 && atProperty.body?.intentId === null && atProperty.body?.upiUri === null && atProperty.body?.status === 'pay_later',
    JSON.stringify(atProperty.body));
  const s2State = await call('GET', `/api/pg/bookings/${s2Id}/payment`, customerAToken);
  check('pay-at-property is stored as a distinct obligation',
    s2State.body?.paymentMode === 'pay_after_service' && s2State.body?.paymentStatus === 'pay_later' && s2State.body?.obligation?.collectedOnline === false,
    JSON.stringify(s2State.body));
  const cancelAtProperty = await call('POST', `/api/pg/bookings/${s2Id}/cancel`, customerAToken, {});
  check('cancelling a pay-at-property reservation refunds nothing and releases the bed',
    cancelAtProperty.status === 200 && cancelAtProperty.body?.booking?.refundPaise === 0 && cancelAtProperty.body?.booking?.refundPolicy === 'NO_ONLINE_PAYMENT_TO_REFUND',
    JSON.stringify(cancelAtProperty.body));
  check('the bed is available again after the pay-at-property cancellation',
    (await inventory(moveIn)).body?.roomTypes?.[0]?.availableBeds === 2);

  // ------------------------------------------ S3: a pending payment is not free
  const s3 = await createBooking(customerBToken, { moveIn, key: 'pg-pay-s3-request-0003' });
  const s3Id = s3.body?.booking?.bookingId;
  const s3Intent = await call('POST', `/api/pg/bookings/${s3Id}/payment-intent`, customerBToken, {
    paymentMode: 'upi', idempotencyKey: 'pg-pay-s3-upi-0003',
  });
  const s3IntentId = s3Intent.body?.intentId;
  const cancelPending = await call('POST', `/api/pg/bookings/${s3Id}/cancel`, customerBToken, {});
  check('a reservation with an unresolved payment cannot be cancelled away',
    cancelPending.status === 409 && cancelPending.body?.error === 'PG_PAYMENT_PENDING', JSON.stringify(cancelPending.body));
  check('the bed stays held while the payment may still arrive',
    (await inventory(moveIn)).body?.roomTypes?.[0]?.availableBeds === 1);
  const failedEvent = providerEvent('evt-failed-1', s3IntentId, s3Id, 'payment.failed', 3200000, 'pay_failed_1');
  const failed = await call('POST', '/api/pg/payments/provider-webhook', null, failedEvent.body, { 'x-bos-signature': failedEvent.signature });
  check('a signed provider failure is recorded', failed.status === 200 && failed.body?.intentStatus === 'failed' && failed.body?.bookingPaymentStatus === 'failed', JSON.stringify(failed.body));
  check('a failed payment moves the booking to failed',
    (await call('GET', `/api/pg/bookings/${s3Id}/payment`, customerBToken)).body?.paymentStatus === 'failed');
  const failedBookingState = await call('GET', '/api/pg/bookings', customerBToken);
  const failedBooking = (failedBookingState.body?.bookings || []).find((booking) => booking.bookingId === s3Id);
  const cancelFailed = await call('POST', `/api/pg/bookings/${s3Id}/cancel`, customerBToken, {});
  check('a failed payment can be cancelled and releases the bed',
    cancelFailed.status === 200 && cancelFailed.body?.booking?.inventoryReleased === true,
    JSON.stringify({ cancellation: cancelFailed.body, failedBooking: failedBooking && { status: failedBooking.status, paymentStatus: failedBooking.paymentStatus } }));
  check('both beds are available again',
    (await inventory(moveIn)).body?.roomTypes?.[0]?.availableBeds === 2);

  // ------------------------------------------------------------- concurrency
  const raceAnchor = await createBooking(customerAToken, { moveIn, key: 'pg-pay-race-anchor-0004' });
  check('a bed is taken before the race', raceAnchor.status === 201 && (await inventory(moveIn)).body?.roomTypes?.[0]?.availableBeds === 1);
  const [raceB, raceC] = await Promise.all([
    createBooking(customerBToken, { moveIn, key: 'pg-pay-race-b-0005' }),
    createBooking(customerCToken, { moveIn, key: 'pg-pay-race-c-0006' }),
  ]);
  const raceWins = [raceB, raceC].filter((result) => result.status === 201).length;
  check('two customers racing for the last bed produce exactly one reservation',
    raceWins === 1 && [raceB, raceC].some((result) => result.status === 409), JSON.stringify([raceB.status, raceC.status]));
  check('no bed is oversold', (await inventory(moveIn)).body?.roomTypes?.[0]?.availableBeds === 0);
  for (const result of [raceAnchor, raceB, raceC]) {
    if (result.status === 201) await call('POST', `/api/pg/bookings/${result.body.booking.bookingId}/cancel`, result.body.booking.bookingId === raceAnchor.body?.booking?.bookingId ? customerAToken : (result === raceB ? customerBToken : customerCToken), {});
  }
  check('every cancelled reservation returns its bed', (await inventory(moveIn)).body?.roomTypes?.[0]?.availableBeds === 2);

  // ------------------------------------------------------------ authorization
  const foreignPayment = await call('GET', `/api/pg/bookings/${s1Id}/payment`, customerBToken);
  check('another customer cannot read the money state of a foreign reservation', foreignPayment.status === 403, JSON.stringify(foreignPayment.body));
  const foreignIntent = await call('POST', `/api/pg/bookings/${s1Id}/payment-intent`, customerBToken, {
    paymentMode: 'upi', idempotencyKey: 'pg-pay-foreign-intent-0007',
  });
  check('another customer cannot open a payment intent for a foreign reservation', foreignIntent.status === 403, JSON.stringify(foreignIntent.body));
  const foreignCancel = await call('POST', `/api/pg/bookings/${s1Id}/cancel`, customerBToken, {});
  check('another customer cannot cancel a foreign reservation', foreignCancel.status === 403, JSON.stringify(foreignCancel.body));
  const foreignCheckIn = await call('POST', `/api/provider/pg/bookings/${s1Id}/check_in`, otherOwnerToken, {});
  check('another provider cannot check a foreign reservation in', foreignCheckIn.status === 403, JSON.stringify(foreignCheckIn.body));
  const customerAdjust = await call('POST', `/api/admin/pg/bookings/${s1Id}/adjust`, customerAToken, { action: 'cancel', reason: 'not my booking' });
  check('a customer cannot perform an admin adjustment', customerAdjust.status === 403, JSON.stringify(customerAdjust.body));
  const foreignAudit = await call('GET', `/api/pg/bookings/${s1Id}/audit`, customerBToken);
  check('another customer cannot read the audit trail of a foreign reservation',
    foreignAudit.status === 200 && Array.isArray(foreignAudit.body?.events) && foreignAudit.body.events.length === 0, JSON.stringify(foreignAudit.body));
  const ownerAudit = await call('GET', `/api/pg/bookings/${s1Id}/audit`, customerAToken);
  check('the reservation party can read its own audit trail',
    ownerAudit.status === 200 && ownerAudit.body?.events?.length > 0, JSON.stringify(ownerAudit.body));

  // ------------------------------------------------ owner check-in / check-out
  const s4 = await createBooking(customerAToken, { moveIn: dateIn(5), months: 1, key: 'pg-pay-s4-checkin-0008' });
  const s4Id = s4.body?.booking?.bookingId;
  const earlyCheckIn = await call('POST', `/api/provider/pg/bookings/${s4Id}/check_in`, ownerToken, {});
  check('check-in before the move-in day is refused', earlyCheckIn.status === 409 && earlyCheckIn.body?.error === 'PG_CHECK_IN_NOT_OPEN', JSON.stringify(earlyCheckIn.body));
  const s5 = await createBooking(customerAToken, { moveIn: dateIn(0), months: 1, key: 'pg-pay-s5-checkin-0009' });
  const s5Id = s5.body?.booking?.bookingId;
  const customerCheckIn = await call('POST', `/api/provider/pg/bookings/${s5Id}/check_in`, customerAToken, {});
  check('a customer cannot check themselves in', customerCheckIn.status === 403, JSON.stringify(customerCheckIn.body));
  const ownerCheckIn = await call('POST', `/api/provider/pg/bookings/${s5Id}/check_in`, ownerToken, {});
  check('the listing owner can check a resident in on the move-in day',
    ownerCheckIn.status === 200 && ownerCheckIn.body?.booking?.status === 'checked_in', JSON.stringify(ownerCheckIn.body));
  const earlyCheckOut = await call('POST', `/api/provider/pg/bookings/${s5Id}/check_out`, ownerToken, {});
  check('check-out before the move-out day is refused', earlyCheckOut.status === 409 && earlyCheckOut.body?.error === 'PG_CHECK_OUT_NOT_OPEN', JSON.stringify(earlyCheckOut.body));
  const adminAdjust = await call('POST', `/api/admin/pg/bookings/${s4Id}/adjust`, adminToken, { action: 'cancel', reason: 'duplicate reservation' });
  check('an admin can force-cancel an unpaid reservation', adminAdjust.status === 200 && adminAdjust.body?.booking?.status === 'cancelled', JSON.stringify(adminAdjust.body));
  const adminAdjustNoReason = await call('POST', `/api/admin/pg/bookings/${s5Id}/adjust`, adminToken, { action: 'cancel' });
  check('an admin adjustment without a reason is refused', adminAdjustNoReason.status === 400 && adminAdjustNoReason.body?.error === 'ADJUSTMENT_REASON_REQUIRED', JSON.stringify(adminAdjustNoReason.body));

  const capabilities = await call('GET', '/api/pg/payment-capabilities', null);
  check('payment capabilities are reported honestly',
    capabilities.status === 200 && capabilities.body?.upi === true && capabilities.body?.sandbox === true && capabilities.body?.razorpay === false,
    JSON.stringify(capabilities.body));

  globalThis.__s1Id = s1Id;
  globalThis.__s5Id = s5Id;
}

async function phase2() {
  console.log('PG payment phase 2 — persistence after a server restart');
  const farWindow = dateIn(500);
  const farInventory = await inventory(farWindow, 2);
  const roomTypeId = farInventory.body?.roomTypes?.[0]?.roomTypeId;
  const state = await call('GET', `/api/pg/bookings/${s1Id}/payment`, customerAToken);
  check('the refunded money state survives a server restart',
    state.status === 200 && state.body?.paymentStatus === 'refunded' && Number(state.body?.refundPaise) === 3200000, JSON.stringify(state.body));
  const bookings = await call('GET', '/api/pg/bookings', customerAToken);
  check('the reservation list survives a server restart', bookings.status === 200 && bookings.body?.bookings?.length > 0, JSON.stringify(bookings.body));
  const audit = await call('GET', `/api/pg/bookings/${s1Id}/audit`, customerAToken);
  check('the audit trail survives a server restart', audit.status === 200 && audit.body?.events?.length > 0);
  check('inventory availability is persisted, not cached', farInventory.status === 200 && farInventory.body?.roomTypes?.[0]?.availableBeds === 2, JSON.stringify(farInventory.body));
  const afterRestart = await createBooking(customerCToken, { moveIn: farWindow, key: 'pg-pay-restart-0010', roomTypeId });
  check('a new reservation can still be created after the restart', afterRestart.status === 201, JSON.stringify(afterRestart.body));
  if (afterRestart.status === 201) {
    await call('POST', `/api/pg/bookings/${afterRestart.body.booking.bookingId}/cancel`, customerCToken, {});
  }
}

if (phase === 'phase1') await phase1();
else if (phase === 'phase2') await phase2();
else throw new Error('phase must be phase1 or phase2');

console.log(`PG payment ${phase}: ${checks - failed.length}/${checks} checks passed`);
if (failed.length) {
  console.error(`failed checks: ${failed.join(' | ')}`);
  process.exitCode = 1;
}
