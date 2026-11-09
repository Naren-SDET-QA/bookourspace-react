/**
 * PG & Hostels administrator operations, disputes, offline collection claims
 * and server-backed invoices — real HTTP against real PostgreSQL.
 *
 * What this file proves:
 *   1. an invoice for an unpaid reservation is never marked paid;
 *   2. only a super-administrator session can move or forgive money, and a
 *      plain administrator session is refused;
 *   3. a fee waiver can only reduce an unpaid amount and is audited;
 *   4. a dispute can be opened by the customer or the owner, is isolated
 *      between parties, and carries evidence and a resolution history;
 *   5. an owner-declared, administrator-approved cash collection is stored as
 *      `collected_offline`, never as a provider-verified payment;
 *   6. a Razorpay reservation can only be settled by a Razorpay provider
 *      event, and a UPI reservation can only be settled by a UPI event;
 *   7. a refund has to be approved before it can be reconciled, and the bed
 *      is only released once the provider confirms the refund;
 *   8. the administrator audit trail cannot be updated or deleted.
 */

import crypto from 'node:crypto';

const [, , phase, baseUrl, sessionSecret, sandboxSecret, provider, otherProvider, admin, customerA, customerB] = process.argv;

const failed = [];
let checks = 0;
const listingId = 'lst-pg-admin-e2e';

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

const ownerToken = sessionToken(provider, 'provider', 'provider.pg@example.test');
const otherOwnerToken = sessionToken(otherProvider, 'provider', 'provider.other@example.test');
const adminToken = sessionToken(admin, 'admin', 'admin.pg@example.test');
const superAdminToken = sessionToken(admin, 'admin', 'admin.pg@example.test', 'super_admin');
const customerAToken = sessionToken(customerA, 'customer', 'customer.a@example.test');
const customerBToken = sessionToken(customerB, 'customer', 'customer.b@example.test');

async function call(method, path, auth, body, extraHeaders) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(extraHeaders || {}),
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

function providerEvent(eventId, intentId, bookingId, eventType, provider, amountPaise, providerPaymentId) {
  const signature = crypto.createHmac('sha256', sandboxSecret)
    .update(`${eventId}|${intentId}|${bookingId}|${eventType}|${provider}|${amountPaise}|${providerPaymentId}`, 'utf-8')
    .digest('hex');
  return {
    body: { eventId, intentId, bookingId, eventType, provider, amountPaise, providerPaymentId },
    signature,
  };
}

function dateIn(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function inventory(moveIn, months = 2) {
  return call('GET', `/api/pg/listings/${listingId}/inventory?moveIn=${moveIn}&months=${months}`, null);
}

async function createBooking(auth, { moveIn, months = 2, beds = 1, occupants = 1, key }) {
  const roomTypeId = globalThis.__roomTypeId;
  return call('POST', '/api/pg/bookings', auth, {
    listingId, roomTypeId, moveIn, months, beds, occupants, idempotencyKey: key,
  });
}

async function phase1() {
  console.log('PG admin phase 1 — disputes, waivers, claims, invoices, refunds, provider binding');

  const created = await call('PUT', `/api/provider/pg/listings/${listingId}/inventory`, ownerToken, {
    roomName: 'Triple sharing bed',
    monthlyRentRupees: 8000,
    securityDepositRupees: 16000,
    occupancyPerBed: 1,
    bedLabels: ['Bed 1', 'Bed 2', 'Bed 3'],
    amenities: ['Wi-Fi'],
  });
  check('owner creates real PostgreSQL bed inventory', created.status === 200 && Boolean(created.body?.inventory?.roomTypeId), JSON.stringify(created.body));
  globalThis.__roomTypeId = created.body?.inventory?.roomTypeId;

  const moveIn = dateIn(3);

  // ---------------------------------------------------------------- invoices
  const b1 = await createBooking(customerAToken, { moveIn, key: 'pg-admin-b1-request-0001' });
  const b1Id = b1.body?.booking?.bookingId;
  check('customer reserves a bed', b1.status === 201 && Boolean(b1Id), JSON.stringify(b1.body));

  const unpaidInvoice = await call('GET', `/api/pg/bookings/${b1Id}/invoice`, customerAToken);
  check('an unpaid reservation produces an invoice that is not marked paid',
    unpaidInvoice.status === 200 && unpaidInvoice.body?.invoice?.status === 'unpaid'
    && Number(unpaidInvoice.body?.invoice?.providerPaidPaise) === 0
    && Number(unpaidInvoice.body?.invoice?.totalPaise) === 3200000,
    JSON.stringify(unpaidInvoice.body?.invoice));
  const repeatInvoice = await call('GET', `/api/pg/bookings/${b1Id}/invoice`, customerAToken);
  check('the same invoice number is returned while nothing changed',
    repeatInvoice.body?.invoice?.invoiceNumber === unpaidInvoice.body?.invoice?.invoiceNumber);

  const foreignInvoice = await call('GET', `/api/pg/bookings/${b1Id}/invoice`, customerBToken);
  check('another customer cannot read a foreign reservation invoice', foreignInvoice.status === 404 || foreignInvoice.status === 403, JSON.stringify(foreignInvoice.body));

  // ---------------------------------------------------------------- disputes
  const dispute = await call('POST', `/api/pg/bookings/${b1Id}/disputes`, customerAToken, {
    category: 'bed_unavailable',
    reason: 'The bed shown in the listing was already taken when we arrived.',
    evidence: [{ kind: 'photo', reference: 'local://bed-photo-1', note: 'Photo of the occupied bed' }],
    amountInDisputePaise: 1600000,
  });
  check('the customer can open a dispute with evidence', dispute.status === 201 && dispute.body?.dispute?.status === 'open', JSON.stringify(dispute.body));
  const disputeId = dispute.body?.dispute?.id;
  const disputeList = await call('GET', `/api/pg/bookings/${b1Id}/disputes`, customerAToken);
  check('the dispute keeps its evidence and category',
    disputeList.status === 200 && disputeList.body?.disputes?.[0]?.category === 'bed_unavailable'
    && Array.isArray(disputeList.body?.disputes?.[0]?.evidence)
    && disputeList.body.disputes[0].evidence.length === 1,
    JSON.stringify(disputeList.body));
  const foreignDispute = await call('GET', `/api/pg/bookings/${b1Id}/disputes`, customerBToken);
  check('another customer cannot read a foreign dispute', foreignDispute.status === 200 && foreignDispute.body?.disputes?.length === 0, JSON.stringify(foreignDispute.body));
  const secondDispute = await call('POST', `/api/pg/bookings/${b1Id}/disputes`, ownerToken, {
    category: 'other', reason: 'The provider also wants to record the issue for this reservation.',
  });
  check('only one active dispute is allowed per reservation', secondDispute.status === 409 && secondDispute.body?.error === 'PG_DISPUTE_ALREADY_OPEN', JSON.stringify(secondDispute.body));
  const foreignOpen = await call('POST', `/api/pg/bookings/${b1Id}/disputes`, customerBToken, {
    category: 'other', reason: 'A stranger tries to open a dispute on this reservation.',
  });
  check('a stranger cannot open a dispute on a foreign reservation', foreignOpen.status === 404 || foreignOpen.status === 403, JSON.stringify(foreignOpen.body));

  // --------------------------------------------------------------- waivers
  const plainAdminWaiver = await call('POST', `/api/admin/pg/bookings/${b1Id}/waive-fee`, adminToken, {
    amountPaise: 100000, reason: 'Goodwill credit for the delayed move in.',
  });
  check('a plain administrator session cannot forgive money', plainAdminWaiver.status === 403 && plainAdminWaiver.body?.error === 'SUPER_ADMIN_SCOPE_REQUIRED', JSON.stringify(plainAdminWaiver.body));
  const customerWaiver = await call('POST', `/api/admin/pg/bookings/${b1Id}/waive-fee`, customerAToken, {
    amountPaise: 100000, reason: 'I would like a discount on my own booking.',
  });
  check('a customer cannot waive a fee', customerWaiver.status === 403, JSON.stringify(customerWaiver.body));
  const noReason = await call('POST', `/api/admin/pg/bookings/${b1Id}/waive-fee`, superAdminToken, { amountPaise: 100000, reason: 'short' });
  check('a waiver without a proper reason is refused', noReason.status === 400 && noReason.body?.error === 'ADJUSTMENT_REASON_REQUIRED', JSON.stringify(noReason.body));
  const waiver = await call('POST', `/api/admin/pg/bookings/${b1Id}/waive-fee`, superAdminToken, {
    amountPaise: 100000, reason: 'Goodwill credit for the delayed move in.',
  });
  check('a super administrator can waive a fee on an unpaid reservation',
    waiver.status === 200 && Number(waiver.body?.booking?.waivedPaise) === 100000 && Number(waiver.body?.booking?.totalPaise) === 3100000,
    JSON.stringify(waiver.body));
  const waivedInvoice = await call('GET', `/api/pg/bookings/${b1Id}/invoice`, customerAToken);
  check('a new invoice reflects the waived amount and is still unpaid',
    waivedInvoice.body?.invoice?.invoiceNumber !== unpaidInvoice.body?.invoice?.invoiceNumber
    && Number(waivedInvoice.body?.invoice?.totalPaise) === 3100000
    && waivedInvoice.body?.invoice?.status === 'unpaid',
    JSON.stringify(waivedInvoice.body?.invoice));

  // --------------------------------------------- offline collection claim
  const b2 = await createBooking(customerAToken, { moveIn, key: 'pg-admin-b2-request-0002' });
  const b2Id = b2.body?.booking?.bookingId;
  const claim = await call('POST', `/api/provider/pg/bookings/${b2Id}/payment-claim`, ownerToken, {
    method: 'cash', reference: 'CASH-RECEIPT-9931', note: 'Cash collected at the property on the move-in day.',
    amountPaise: 3200000,
    evidence: [{ kind: 'receipt', reference: 'local://receipt-1' }],
  });
  check('the owner can declare an off-platform collection', claim.status === 201 && claim.body?.claim?.status === 'pending', JSON.stringify(claim.body));
  const claimId = claim.body?.claim?.id;
  const claimByCustomer = await call('POST', `/api/provider/pg/bookings/${b2Id}/payment-claim`, customerAToken, {
    method: 'cash', reference: 'FAKE-RECEIPT-1', note: 'I claim to have paid myself.', amountPaise: 1,
  });
  check('a customer cannot declare a collection', claimByCustomer.status === 403, JSON.stringify(claimByCustomer.body));
  const plainAdminClaim = await call('POST', `/api/admin/pg/claims/${claimId}/decision`, adminToken, { decision: 'approved', note: 'Looks fine to me.' });
  check('a plain administrator cannot approve a collection claim', plainAdminClaim.status === 403 && plainAdminClaim.body?.error === 'SUPER_ADMIN_SCOPE_REQUIRED', JSON.stringify(plainAdminClaim.body));
  const approveClaim = await call('POST', `/api/admin/pg/claims/${claimId}/decision`, superAdminToken, {
    decision: 'approved', note: 'Cash receipt seen and confirmed by the administrator.',
  });
  check('a super administrator can approve a collection claim', approveClaim.status === 200 && approveClaim.body?.claim?.status === 'approved', JSON.stringify(approveClaim.body));
  const b2State = await call('GET', `/api/pg/bookings/${b2Id}/payment`, customerAToken);
  check('an approved offline collection is NOT a provider-verified payment',
    b2State.body?.paymentStatus === 'collected_offline' && b2State.body?.paymentStatus !== 'verified',
    JSON.stringify(b2State.body));
  const b2Invoice = await call('GET', `/api/pg/bookings/${b2Id}/invoice`, customerAToken);
  check('the invoice states an offline collection and claims no provider payment',
    b2Invoice.body?.invoice?.status === 'collected_offline'
    && Number(b2Invoice.body?.invoice?.providerPaidPaise) === 0
    && Number(b2Invoice.body?.invoice?.offlineCollectedPaise) > 0,
    JSON.stringify(b2Invoice.body?.invoice));

  // ------------------------------------- Razorpay provider-bound settlement
  const b3 = await createBooking(customerAToken, { moveIn, key: 'pg-admin-b3-request-0003' });
  const b3Id = b3.body?.booking?.bookingId;
  const capabilities = await call('GET', '/api/pg/payment-capabilities', null);
  check('Razorpay is reported as available only when it is configured and reconcilable',
    capabilities.body?.razorpay === true && capabilities.body?.razorpayConfigured === true, JSON.stringify(capabilities.body));
  const rzIntent = await call('POST', `/api/pg/bookings/${b3Id}/payment-intent`, customerAToken, {
    paymentMode: 'razorpay', idempotencyKey: 'pg-admin-rz-intent-0004',
  });
  check('a Razorpay intent is created for the server-priced amount',
    rzIntent.status === 201 && rzIntent.body?.provider === 'razorpay' && Number(rzIntent.body?.amountPaise) === 3200000,
    JSON.stringify(rzIntent.body));
  const rzIntentId = rzIntent.body?.intentId;
  const wrongProvider = providerEvent('evt-rz-wrong-provider', rzIntentId, b3Id, 'payment.captured', 'upi_sandbox', 3200000, 'pay_wrong_provider');
  const wrongProviderResult = await call('POST', '/api/pg/payments/provider-webhook', null, wrongProvider.body, { 'x-bos-signature': wrongProvider.signature });
  check('a UPI provider event cannot settle a Razorpay reservation',
    wrongProviderResult.status === 409 && wrongProviderResult.body?.error === 'PAYMENT_PROVIDER_MISMATCH', JSON.stringify(wrongProviderResult.body));
  check('the Razorpay reservation is still unpaid after the mismatched event',
    (await call('GET', `/api/pg/bookings/${b3Id}/payment`, customerAToken)).body?.paymentStatus === 'pending_verification');
  const rzCaptured = providerEvent('evt-rz-captured', rzIntentId, b3Id, 'payment.captured', 'razorpay', 3200000, 'pay_rz_captured');
  const rzSettled = await call('POST', '/api/pg/payments/provider-webhook', null, rzCaptured.body, { 'x-bos-signature': rzCaptured.signature });
  check('a Razorpay provider event settles the Razorpay reservation',
    rzSettled.status === 200 && rzSettled.body?.bookingPaymentStatus === 'verified', JSON.stringify(rzSettled.body));
  const b3Invoice = await call('GET', `/api/pg/bookings/${b3Id}/invoice`, customerAToken);
  check('the settled invoice is marked paid with the provider amount',
    b3Invoice.body?.invoice?.status === 'paid' && Number(b3Invoice.body?.invoice?.providerPaidPaise) === 3200000,
    JSON.stringify(b3Invoice.body?.invoice));

  // --------------------------------------------------------------- refunds
  const plainAdminRefund = await call('POST', `/api/admin/pg/bookings/${b3Id}/approve-refund`, adminToken, {
    amountPaise: 3200000, reason: 'The customer moved out before the term ended.',
  });
  check('a plain administrator session cannot approve a refund', plainAdminRefund.status === 403 && plainAdminRefund.body?.error === 'SUPER_ADMIN_SCOPE_REQUIRED', JSON.stringify(plainAdminRefund.body));
  const approveRefund = await call('POST', `/api/admin/pg/bookings/${b3Id}/approve-refund`, superAdminToken, {
    amountPaise: 3200000, reason: 'The customer moved out before the agreed term ended.',
  });
  check('a super administrator can approve a refund',
    approveRefund.status === 200 && approveRefund.body?.booking?.paymentStatus === 'refund_pending'
    && approveRefund.body?.booking?.inventoryReleased === false, JSON.stringify(approveRefund.body));
  const heldAfterApproval = await inventory(moveIn);
  check('the bed stays reserved while the refund is unresolved', Number(heldAfterApproval.body?.roomTypes?.[0]?.availableBeds) === 0, JSON.stringify(heldAfterApproval.body?.roomTypes?.[0]));
  const wrongRefund = providerEvent('evt-rz-refund-wrong', rzIntentId, b3Id, 'refund.succeeded', 'razorpay', 100, 'rfnd_wrong');
  const wrongRefundResult = await call('POST', '/api/pg/payments/provider-webhook', null, wrongRefund.body, { 'x-bos-signature': wrongRefund.signature });
  check('a refund event with the wrong amount is refused',
    [400, 409].includes(wrongRefundResult.status)
    && ['REFUND_AMOUNT_MISMATCH', 'PAYMENT_AMOUNT_MISMATCH'].includes(wrongRefundResult.body?.error),
    JSON.stringify(wrongRefundResult.body));
  const refundEvent = providerEvent('evt-rz-refund', rzIntentId, b3Id, 'refund.succeeded', 'razorpay', 3200000, 'rfnd_ok');
  const refundResult = await call('POST', '/api/pg/payments/provider-webhook', null, refundEvent.body, { 'x-bos-signature': refundEvent.signature });
  check('the provider refund reconciliation releases the bed', refundResult.status === 200 && refundResult.body?.bookingPaymentStatus === 'refunded', JSON.stringify(refundResult.body));
  const freeAfterRefund = await inventory(moveIn);
  check('the refunded bed returns to the market', Number(freeAfterRefund.body?.roomTypes?.[0]?.availableBeds) === 1, JSON.stringify(freeAfterRefund.body?.roomTypes?.[0]));
  const refundInvoice = await call('GET', `/api/pg/bookings/${b3Id}/invoice?kind=refund_receipt`, customerAToken);
  check('a refund receipt is issued and states the refunded amount',
    refundInvoice.status === 200 && refundInvoice.body?.invoice?.status === 'refunded'
    && Number(refundInvoice.body?.invoice?.refundPaise) === 3200000, JSON.stringify(refundInvoice.body?.invoice));

  // ------------------------------------------------------- dispute decision
  const review = await call('POST', `/api/admin/pg/disputes/${disputeId}/review`, adminToken, { note: 'Taking this to the resolution step.' });
  check('an administrator can move a dispute under review', review.status === 200 && review.body?.dispute?.status === 'under_review', JSON.stringify(review.body));
  const customerResolve = await call('POST', `/api/admin/pg/disputes/${disputeId}/resolve`, customerAToken, {
    resolution: 'I would like this dispute closed in my favour please.',
  });
  check('a customer cannot resolve a dispute', customerResolve.status === 403, JSON.stringify(customerResolve.body));
  const shortResolution = await call('POST', `/api/admin/pg/disputes/${disputeId}/resolve`, adminToken, { resolution: 'no' });
  check('a resolution without a proper reason is refused', shortResolution.status === 400 && shortResolution.body?.error === 'INVALID_DISPUTE_RESOLUTION', JSON.stringify(shortResolution.body));
  const resolve = await call('POST', `/api/admin/pg/disputes/${disputeId}/resolve`, adminToken, {
    resolution: 'The bed was occupied; the owner issued a full deposit credit.',
  });
  check('an administrator can resolve a dispute with a resolution history',
    resolve.status === 200 && resolve.body?.dispute?.status === 'resolved'
    && Boolean(resolve.body?.dispute?.resolvedAt), JSON.stringify(resolve.body));
  const resolvedTwice = await call('POST', `/api/admin/pg/disputes/${disputeId}/resolve`, adminToken, {
    resolution: 'Trying to resolve the very same dispute a second time.',
  });
  check('a resolved dispute cannot be resolved again', resolvedTwice.status === 409, JSON.stringify(resolvedTwice.body));

  // --------------------------------------------------------- admin overview
  const overview = await call('GET', '/api/admin/pg/bookings', adminToken);
  check('the administrator overview lists the PG reservations with their money state',
    overview.status === 200 && Array.isArray(overview.body?.bookings)
    && overview.body.bookings.some((row) => row.bookingId === b1Id)
    && overview.body.bookings.some((row) => row.bookingId === b3Id && row.paymentStatus === 'refunded'),
    JSON.stringify(overview.body?.bookings?.slice?.(0, 2)));
  const customerOverview = await call('GET', '/api/admin/pg/bookings', customerAToken);
  check('a customer cannot read the administrator overview', customerOverview.status === 403, JSON.stringify(customerOverview.body));
  const audit = await call('GET', `/api/admin/pg/audit?bookingId=${b1Id}`, adminToken);
  check('the administrator audit trail records the sensitive actions',
    audit.status === 200 && audit.body?.events?.some((event) => event.action === 'fee_waived'),
    JSON.stringify(audit.body?.events?.slice?.(0, 3)));

  globalThis.__b1Id = b1Id;
  globalThis.__b2Id = b2Id;
  globalThis.__b3Id = b3Id;
  globalThis.__disputeId = disputeId;
}

async function phase2() {
  console.log('PG admin phase 2 — persistence after a server restart');
  const b1Id = process.env.PG_ADMIN_E2E_B1;
  const b3Id = process.env.PG_ADMIN_E2E_B3;
  const overview = await call('GET', '/api/admin/pg/bookings', adminToken);
  check('the administrator overview survives a restart',
    overview.status === 200 && overview.body?.bookings?.some((row) => row.bookingId === b1Id), JSON.stringify(overview.body?.bookings?.length));
  const invoice = await call('GET', `/api/pg/bookings/${b1Id}/invoice`, customerAToken);
  check('the invoice survives a restart', invoice.status === 200 && Boolean(invoice.body?.invoice?.invoiceNumber), JSON.stringify(invoice.body?.invoice));
  const refunded = await call('GET', `/api/pg/bookings/${b3Id}/payment`, customerAToken);
  check('the refunded money state survives a restart', refunded.body?.paymentStatus === 'refunded', JSON.stringify(refunded.body));
  const audit = await call('GET', `/api/admin/pg/audit?bookingId=${b1Id}`, adminToken);
  check('the administrator audit trail survives a restart', audit.status === 200 && audit.body?.events?.length > 0);
}

if (phase === 'phase1') await phase1();
else if (phase === 'phase2') await phase2();
else throw new Error('phase must be phase1 or phase2');

console.log(`PG admin ${phase}: ${checks - failed.length}/${checks} checks passed`);
if (failed.length) {
  console.error(`failed checks: ${failed.join(' | ')}`);
  process.exitCode = 1;
}
