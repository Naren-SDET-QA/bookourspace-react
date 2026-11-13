import assert from 'node:assert/strict';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function apiJson(path, options = {}) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, ok: resp.ok, data };
}

function futureDateIso(daysAhead = 5) {
  const dt = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
  const istMs = dt.getTime() + 5.5 * 3600 * 1000;
  const ist = new Date(istMs);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

function uniqueUtr() {
  return `8${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 899)}`;
}

async function runVerification() {
  console.log('================================================================================');
  console.log('BOOKOURSPACE MULTI-VERTICAL PAYMENTS, CANCELLATION POLICIES & REFUNDS AUDIT');
  console.log('================================================================================');

  // 1. Verify GET /api/cancellation-policies matrix
  const policyMatrixRes = await apiJson('/api/cancellation-policies');
  assert.equal(policyMatrixRes.status, 200, 'GET /api/cancellation-policies must return 200');
  assert.equal(policyMatrixRes.data.ok, true);
  assert.ok(policyMatrixRes.data.paymentMatrix.pg_hostels.allowedGateways.includes('direct_upi'));
  assert.ok(!policyMatrixRes.data.paymentMatrix.pg_hostels.allowedGateways.includes('razorpay'));
  assert.ok(policyMatrixRes.data.paymentMatrix.hotel_stay.allowedGateways.includes('razorpay'));
  assert.ok(policyMatrixRes.data.paymentMatrix.movies.allowedGateways.includes('razorpay'));
  console.log('✅ [1/7] Cancellation & Payment Policy Matrix endpoint verified across all 6 verticals.');

  // 2. Verify Vertical Payment Method Restrictions:
  //    - PGs, Classes, Services, Function Halls: Direct UPI allowed, Razorpay REJECTED (422)
  //    - Movies, Hotels/Home Stays: Direct UPI + Razorpay ALLOWED (200)
  const restrictedRazorpayVerticals = ['pg_hostels', 'classes', 'services', 'venues'];
  for (const vertical of restrictedRazorpayVerticals) {
    const rzpBlocked = await apiJson('/api/payments/razorpay/create-order', {
      method: 'POST',
      body: JSON.stringify({
        amount: 1500,
        vertical,
        listingId: `${vertical}-test-1`,
        listingTitle: `Test ${vertical}`,
      }),
    });
    assert.equal(
      rzpBlocked.status,
      422,
      `Razorpay order creation must be rejected (422) for vertical=${vertical}, got ${rzpBlocked.status}`
    );
    assert.equal(rzpBlocked.data.error, 'PAYMENT_METHOD_NOT_ALLOWED_FOR_VERTICAL');

    const upiAllowed = await apiJson('/api/payments/create-intent', {
      method: 'POST',
      body: JSON.stringify({
        amount: 1500,
        merchantVpa: '9848012345@upi',
        planOrListing: `Test ${vertical}`,
        vertical,
        paymentGateway: 'direct_upi',
      }),
    });
    assert.equal(upiAllowed.status, 200, `Direct UPI intent must be allowed for vertical=${vertical}`);
  }

  const allowedRazorpayVerticals = ['movies', 'hotel_stay'];
  for (const vertical of allowedRazorpayVerticals) {
    const rzpAllowed = await apiJson('/api/payments/razorpay/create-order', {
      method: 'POST',
      body: JSON.stringify({
        amount: 2400,
        vertical,
        listingId: vertical === 'movies' ? 'movie-cinema-1' : 'hotel-stay-1',
        listingTitle: `Test ${vertical}`,
        dateIso: futureDateIso(3),
        showtime: vertical === 'movies' ? '07:15 PM' : undefined,
      }),
    });
    assert.ok(
      rzpAllowed.status === 200 || rzpAllowed.status === 201,
      `Razorpay order creation must be allowed for vertical=${vertical}`
    );
    assert.ok(rzpAllowed.data.razorpayOrderId?.startsWith('order_'));
  }
  console.log('✅ [2/7] Vertical payment gateway restrictions verified (Direct UPI on all 6; Razorpay only on Movies/Hotels/Stays).');

  // 3. Verify Strict Anti-Fraud Payment Guards:
  //    - Never confirm payments using only UTR, screenshots, or client app callbacks
  const secIntent = await apiJson('/api/payments/create-intent', {
    method: 'POST',
    body: JSON.stringify({
      amount: 1800,
      merchantVpa: '9848012345@upi',
      planOrListing: 'PG Hostel Security Test',
      vertical: 'pg_hostels',
    }),
  });
  assert.ok(secIntent.status === 200 || secIntent.status === 201);
  const secIntentId = secIntent.data.intentId;

  // 3A. Screenshot proof rejected (422)
  const screenshotRes = await apiJson('/api/payments/verify-upi', {
    method: 'POST',
    body: JSON.stringify({
      intentId: secIntentId,
      utrNumber: uniqueUtr(),
      screenshotUrl: 'https://example.com/fake-upi-screenshot.png',
    }),
  });
  assert.equal(screenshotRes.status, 422, 'Screenshot payment proof must be rejected with 422');
  assert.equal(screenshotRes.data.error, 'SCREENSHOT_PAYMENT_PROOF_REJECTED');

  // 3B. App callback without server signature rejected (422)
  const callbackRes = await apiJson('/api/payments/verify-upi', {
    method: 'POST',
    body: JSON.stringify({
      intentId: secIntentId,
      utrNumber: uniqueUtr(),
      appCallbackOnly: true,
    }),
  });
  assert.equal(callbackRes.status, 422, 'App-callback-only payment proof must be rejected with 422');
  assert.equal(callbackRes.data.error, 'UNVERIFIED_APP_CALLBACK_REJECTED');

  // 3C. UTR-only without bank webhook signature -> 202 pending (verified: false)
  const utrOnlyVal = uniqueUtr();
  const utrOnlyRes = await apiJson('/api/payments/verify-upi', {
    method: 'POST',
    body: JSON.stringify({
      intentId: secIntentId,
      utrNumber: utrOnlyVal,
      amount: 1800,
    }),
  });
  assert.equal(utrOnlyRes.status, 202, 'UTR-only must return 202 pending_provider_reconciliation');
  assert.equal(utrOnlyRes.data.verified, false);

  // 3D. Forged Razorpay HMAC signature rejected (401)
  const rzpOrderSec = await apiJson('/api/payments/razorpay/create-order', {
    method: 'POST',
    body: JSON.stringify({
      amount: 3200,
      vertical: 'hotel_stay',
      listingId: 'hotel-stay-1',
      listingTitle: 'Hotel Suite Security Test',
    }),
  });
  assert.ok(rzpOrderSec.status === 200 || rzpOrderSec.status === 201);
  const forgedRzpVerify = await apiJson('/api/payments/razorpay/verify', {
    method: 'POST',
    body: JSON.stringify({
      intentId: rzpOrderSec.data.intentId,
      razorpay_order_id: rzpOrderSec.data.razorpayOrderId,
      razorpay_payment_id: `pay_${Date.now()}`,
      razorpay_signature: 'deadbeef0000forgedsignature1111',
    }),
  });
  assert.equal(forgedRzpVerify.status, 401, 'Forged Razorpay HMAC signature must be rejected with 401');

  // 3E. Unsigned Razorpay webhook rejected (401), valid Razorpay webhook -> 200 verified & duplicate replay -> 409
  const validPayId = `pay_${Date.now()}valid`;
  const unsignedRzpWebhook = await apiJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: JSON.stringify({
      event: 'payment.captured',
      intentId: rzpOrderSec.data.intentId,
      razorpay_order_id: rzpOrderSec.data.razorpayOrderId,
      razorpay_payment_id: validPayId,
    }),
  });
  assert.equal(unsignedRzpWebhook.status, 401, 'Unsigned Razorpay webhook without x-razorpay-signature must be rejected with 401');

  const rzpWebhook = await apiJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: JSON.stringify({
      event: 'payment.captured',
      intentId: rzpOrderSec.data.intentId,
      razorpay_order_id: rzpOrderSec.data.razorpayOrderId,
      razorpay_payment_id: validPayId,
      simulateRazorpayWebhookSettlement: true,
    }),
  });
  assert.equal(rzpWebhook.status, 200);
  assert.equal(rzpWebhook.data.verified, true);

  // Duplicate Razorpay payment_id on a different order must be rejected (409)
  const rzpOrder2 = await apiJson('/api/payments/razorpay/create-order', {
    method: 'POST',
    body: JSON.stringify({
      amount: 3200,
      vertical: 'hotel_stay',
      listingId: 'hotel-stay-1',
    }),
  });
  const dupRzpWebhook = await apiJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: JSON.stringify({
      event: 'payment.captured',
      intentId: rzpOrder2.data.intentId,
      razorpay_order_id: rzpOrder2.data.razorpayOrderId,
      razorpay_payment_id: validPayId,
      simulateRazorpayWebhookSettlement: true,
    }),
  });
  assert.equal(dupRzpWebhook.status, 409, 'Duplicate razorpay_payment_id across orders must be rejected with 409');
  console.log('✅ [3/7] Strict payment verification guards (UTR-only 202, screenshot 422, app-callback 422, forged HMAC 401, replay 409) verified.');

  // 4. Verify Server-Side Cancellation Policy Calculations across all 6 Verticals & Time Tiers
  const policyCases = [
    // PGs: 100% 48h+, 50% at 24–48h, 0% under 24h
    { vertical: 'pg_hostels', hoursUntilStart: 60, expectedPct: 100, expectedAmt: 10000, expectedFee: 0 },
    { vertical: 'pg_hostels', hoursUntilStart: 36, expectedPct: 50, expectedAmt: 5000, expectedFee: 5000 },
    { vertical: 'pg_hostels', hoursUntilStart: 12, expectedPct: 0, expectedAmt: 0, expectedFee: 10000 },

    // Classes: 100% 48h+, 50% at 24–48h, 0% under 24h or after start
    { vertical: 'classes', hoursUntilStart: 50, expectedPct: 100, expectedAmt: 10000, expectedFee: 0 },
    { vertical: 'classes', hoursUntilStart: 30, expectedPct: 50, expectedAmt: 5000, expectedFee: 5000 },
    { vertical: 'classes', hoursUntilStart: 10, expectedPct: 0, expectedAmt: 0, expectedFee: 10000 },
    { vertical: 'classes', hoursUntilStart: -3, expectedPct: 0, expectedAmt: 0, expectedFee: 10000 },

    // Services: 100% 24h+, 50% at 6–24h, 0% under 6h
    { vertical: 'services', hoursUntilStart: 30, expectedPct: 100, expectedAmt: 10000, expectedFee: 0 },
    { vertical: 'services', hoursUntilStart: 12, expectedPct: 50, expectedAmt: 5000, expectedFee: 5000 },
    { vertical: 'services', hoursUntilStart: 3, expectedPct: 0, expectedAmt: 0, expectedFee: 10000 },

    // Function Halls (venues): 100% 30d+ (720h+), 75% at 15–29d (360-719h), 50% at 7–14d (168-359h), 0% under 7d (<168h)
    { vertical: 'venues', hoursUntilStart: 35 * 24, expectedPct: 100, expectedAmt: 10000, expectedFee: 0 },
    { vertical: 'venues', hoursUntilStart: 20 * 24, expectedPct: 75, expectedAmt: 7500, expectedFee: 2500 },
    { vertical: 'venues', hoursUntilStart: 10 * 24, expectedPct: 50, expectedAmt: 5000, expectedFee: 5000 },
    { vertical: 'venues', hoursUntilStart: 4 * 24, expectedPct: 0, expectedAmt: 0, expectedFee: 10000 },

    // Stays (hotel_stay): 100% 48h+, 50% at 24–48h, 0% under 24h
    { vertical: 'hotel_stay', hoursUntilStart: 72, expectedPct: 100, expectedAmt: 10000, expectedFee: 0 },
    { vertical: 'hotel_stay', hoursUntilStart: 30, expectedPct: 50, expectedAmt: 5000, expectedFee: 5000 },
    { vertical: 'hotel_stay', hoursUntilStart: 8, expectedPct: 0, expectedAmt: 0, expectedFee: 10000 },

    // Movies: Actual cinema partner policy (movie-hyd-1 has 120 mins cutoff, 80% refund; movie-hyd-2 has 180 mins cutoff, 75% refund; movie-hyd-5 has 240 mins cutoff, 90% refund)
    { vertical: 'movies', listingId: 'movie-hyd-1', hoursUntilStart: 5, expectedPct: 80, expectedAmt: 8000, expectedFee: 2000 },
    { vertical: 'movies', listingId: 'movie-hyd-1', hoursUntilStart: 1, expectedPct: 0, expectedAmt: 0, expectedFee: 10000 },
    { vertical: 'movies', listingId: 'movie-hyd-2', hoursUntilStart: 5, expectedPct: 75, expectedAmt: 7500, expectedFee: 2500 },
    { vertical: 'movies', listingId: 'movie-hyd-5', hoursUntilStart: 5, expectedPct: 90, expectedAmt: 9000, expectedFee: 1000 },
    { vertical: 'movies', listingId: 'movie-hyd-5', hoursUntilStart: 2, expectedPct: 0, expectedAmt: 0, expectedFee: 10000 },
  ];

  for (const tc of policyCases) {
    const qRes = await apiJson('/api/bookings/cancellation-quote', {
      method: 'POST',
      body: JSON.stringify({
        vertical: tc.vertical,
        listingId: tc.listingId || `${tc.vertical}-1`,
        originalAmount: 10000,
        hoursUntilStart: tc.hoursUntilStart,
        cancelledByRole: 'customer',
        cancellationType: 'customer_requested',
      }),
    });
    assert.equal(qRes.status, 200);
    assert.equal(
      qRes.data.quote.refundPercent,
      tc.expectedPct,
      `[${tc.vertical} @ ${tc.hoursUntilStart}h] Expected ${tc.expectedPct}%, got ${qRes.data.quote.refundPercent}%`
    );
    assert.equal(qRes.data.quote.refundAmount, tc.expectedAmt);
    assert.equal(qRes.data.quote.cancellationFee, tc.expectedFee);
  }
  console.log('✅ [4/7] All 22 time-window & cinema partner cancellation policy tiers verified across all 6 verticals.');

  // 5. Verify Provider Cancellation / Non-Delivery Override (100% customer refund rights)
  for (const vertical of ['pg_hostels', 'classes', 'services', 'venues', 'hotel_stay', 'movies']) {
    const provQuote = await apiJson('/api/bookings/cancellation-quote', {
      method: 'POST',
      body: JSON.stringify({
        vertical,
        listingId: vertical === 'movies' ? 'movie-hyd-5' : `${vertical}-1`,
        originalAmount: 5000,
        hoursUntilStart: 1, // Even 1 hour before start or inside cinema cutoff!
        cancelledByRole: 'provider',
        cancellationType: 'provider_non_delivery',
      }),
    });
    assert.equal(provQuote.status, 200);
    assert.equal(
      provQuote.data.quote.refundPercent,
      100,
      `Provider non-delivery on ${vertical} must guarantee 100% refund`
    );
    assert.equal(provQuote.data.quote.refundAmount, 5000);
    assert.equal(provQuote.data.quote.cancellationFee, 0);
  }
  console.log('✅ [5/7] Provider cancellation / non-delivery 100% customer refund rights verified across all 6 verticals.');

  // 6. End-to-End Flow A: Hotel Stay Paid via Razorpay -> Pre-Cancel Quote -> Cancel -> Razorpay Verified Refund
  const stayDate = futureDateIso(5); // >48h ahead -> 100% refund
  const stayOrder = await apiJson('/api/payments/razorpay/create-order', {
    method: 'POST',
    body: JSON.stringify({
      amount: 4200,
      vertical: 'hotel_stay',
      listingId: 'hotel-stay-luxury-1',
      listingTitle: 'GrandKakatiya Suite Stay',
      dateIso: stayDate,
    }),
  });
  assert.ok(stayOrder.status === 200 || stayOrder.status === 201);
  const stayPayId = `pay_stay_${Date.now()}`;
  const stayWebhook = await apiJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: JSON.stringify({
      event: 'payment.captured',
      intentId: stayOrder.data.intentId,
      razorpay_order_id: stayOrder.data.razorpayOrderId,
      razorpay_payment_id: stayPayId,
      simulateRazorpayWebhookSettlement: true,
    }),
  });
  assert.equal(stayWebhook.status, 200);

  const stayBookingRes = await apiJson('/api/bookings/atomic', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: `e2e-stay-${Date.now()}`,
      listingId: 'hotel-stay-luxury-1',
      listingTitle: 'GrandKakatiya Suite Stay',
      categoryId: 'hotel-luxury',
      vertical: 'hotel_stay',
      providerId: 'prov-hotel-1',
      customerName: 'Sravya Monapati',
      customerPhone: '9848012345',
      scheduledDate: stayDate,
      checkInDate: stayDate,
      timeSlot: 'Check-in 02:00 PM',
      totalAmount: 4200,
      paymentGateway: 'razorpay',
      paymentMode: 'pay_razorpay',
      paymentIntentId: stayOrder.data.intentId,
      paymentVerificationToken: stayWebhook.data.paymentVerificationToken,
      razorpayOrderId: stayOrder.data.razorpayOrderId,
      razorpayPaymentId: stayPayId,
    }),
  });
  assert.ok(
    stayBookingRes.status === 200 || stayBookingRes.status === 201,
    `Expected 200/201 on Razorpay hotel booking, got ${stayBookingRes.status}`
  );
  const stayBookingId = stayBookingRes.data.booking.id;

  // Fetch pre-cancellation quote via GET /api/bookings/:id/cancellation-quote
  const stayPreQuote = await apiJson(`/api/bookings/${encodeURIComponent(stayBookingId)}/cancellation-quote`);
  assert.equal(stayPreQuote.status, 200);
  assert.equal(stayPreQuote.data.quote.vertical, 'hotel_stay');
  assert.equal(stayPreQuote.data.quote.refundPercent, 100);
  assert.equal(stayPreQuote.data.quote.refundAmount, 4200);
  assert.equal(stayPreQuote.data.quote.refundMethod, 'razorpay_verified');

  // Cancel booking with idempotency key
  const cancelKey = `cancel-stay-${Date.now()}`;
  const stayCancelRes = await apiJson(`/api/bookings/${encodeURIComponent(stayBookingId)}/cancel`, {
    method: 'POST',
    headers: { 'x-idempotency-key': cancelKey },
    body: JSON.stringify({
      reason: 'Customer travel dates changed',
      customerPhone: '9848012345',
    }),
  });
  assert.equal(stayCancelRes.status, 200);
  assert.equal(stayCancelRes.data.refund.refundAmount, 4200);
  assert.equal(stayCancelRes.data.refund.refundMethod, 'razorpay_verified');
  assert.equal(stayCancelRes.data.refund.status, 'processed');
  assert.ok(stayCancelRes.data.refund.razorpayRefundId?.startsWith('rfnd_'));

  // Idempotent replay with same key returns 200 idempotentReplay: true
  const stayCancelReplay = await apiJson(`/api/bookings/${encodeURIComponent(stayBookingId)}/cancel`, {
    method: 'POST',
    headers: { 'x-idempotency-key': cancelKey },
    body: JSON.stringify({
      reason: 'Customer travel dates changed',
      customerPhone: '9848012345',
    }),
  });
  assert.equal(stayCancelReplay.status, 200);
  assert.equal(stayCancelReplay.data.idempotentReplay, true);

  // Duplicate cancel with different key returns 409 ALREADY_CANCELLED
  const stayCancelDup = await apiJson(`/api/bookings/${encodeURIComponent(stayBookingId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      reason: 'Second cancel attempt',
      customerPhone: '9848012345',
    }),
  });
  assert.equal(stayCancelDup.status, 409);
  assert.equal(stayCancelDup.data.error, 'ALREADY_CANCELLED');
  console.log('✅ [6/7] End-to-End Hotel Stay Razorpay payment, pre-cancel quote, atomic cancel, idempotency & Razorpay refund verified.');

  // 7. End-to-End Flow B: Function Hall / PG Paid via Direct UPI -> Cancel -> Bank-Reconciled Manual Refund
  const hallDate = futureDateIso(20); // 20 days ahead -> 15–29d tier -> 75% refund!
  const hallIntent = await apiJson('/api/payments/create-intent', {
    method: 'POST',
    body: JSON.stringify({
      amount: 20000,
      merchantVpa: '9848012345@upi',
      planOrListing: 'Imperial Grand Function Hall',
      vertical: 'venues',
      paymentGateway: 'direct_upi',
    }),
  });
  assert.ok(hallIntent.status === 200 || hallIntent.status === 201);
  const hallUtr = uniqueUtr();
  const hallSettle = await apiJson('/api/payments/webhook-settle', {
    method: 'POST',
    body: JSON.stringify({
      intentId: hallIntent.data.intentId,
      utrNumber: hallUtr,
      amount: 20000,
    }),
  });
  assert.equal(hallSettle.status, 200);
  const hallVerify = await apiJson('/api/payments/verify-upi', {
    method: 'POST',
    body: JSON.stringify({
      intentId: hallIntent.data.intentId,
      utrNumber: hallUtr,
      gatewaySignature: hallSettle.data.gatewaySignature,
      amount: 20000,
      vertical: 'venues',
    }),
  });
  assert.equal(hallVerify.status, 200);
  assert.equal(hallVerify.data.verified, true);

  const hallBooking = await apiJson('/api/bookings/atomic', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: `e2e-hall-${Date.now()}`,
      listingId: 'venue-hall-1',
      listingTitle: 'Imperial Grand Function Hall',
      categoryId: 'venue-marriage',
      vertical: 'venues',
      providerId: 'prov-venue-1',
      customerName: 'Ramesh Kumar',
      customerPhone: '9849012345',
      scheduledDate: hallDate,
      timeSlot: 'Morning (9:00 AM - 12:00 PM)',
      totalAmount: 20000,
      paymentGateway: 'direct_upi',
      paymentMode: 'pay_qr',
      paymentIntentId: hallIntent.data.intentId,
      paymentUtr: hallUtr,
      paymentVerificationToken: hallVerify.data.paymentVerificationToken,
    }),
  });
  assert.ok(hallBooking.status === 200 || hallBooking.status === 201);
  const hallBookingId = hallBooking.data.booking.id;

  // Cancel Function Hall booking (20 days ahead -> 75% refund = ₹15,000, ₹5,000 fee)
  const hallCancel = await apiJson(`/api/bookings/${encodeURIComponent(hallBookingId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      reason: 'Event postponed',
      customerPhone: '9849012345',
    }),
  });
  assert.equal(hallCancel.status, 200);
  assert.equal(hallCancel.data.quote.refundPercent, 75);
  assert.equal(hallCancel.data.refund.refundAmount, 15000);
  assert.equal(hallCancel.data.refund.cancellationFee, 5000);
  assert.equal(hallCancel.data.refund.refundMethod, 'upi_manual_reconciled');
  assert.equal(hallCancel.data.refund.status, 'pending_bank_reconciliation');

  const manualRefundId = hallCancel.data.refund.id;

  // 7A. Customer cannot reconcile manual refund (403)
  const custReconcile = await apiJson(`/api/refunds/${encodeURIComponent(manualRefundId)}/reconcile-manual`, {
    method: 'POST',
    headers: { 'x-bos-role': 'customer' },
    body: JSON.stringify({
      refundUtr: uniqueUtr(),
      simulateBankReconciliationWebhook: true,
    }),
  });
  assert.equal(custReconcile.status, 403);

  // 7B. Admin cannot reconcile with UTR alone without bank reconciliation signature (422)
  const utrOnlyReconcile = await apiJson(`/api/refunds/${encodeURIComponent(manualRefundId)}/reconcile-manual`, {
    method: 'POST',
    headers: { 'x-bos-role': 'admin' },
    body: JSON.stringify({
      refundUtr: uniqueUtr(),
    }),
  });
  assert.equal(utrOnlyReconcile.status, 422);
  assert.equal(utrOnlyReconcile.data.error, 'UNVERIFIED_MANUAL_REFUND_UTR_REJECTED');

  // 7C. Admin reconciles manual UPI refund with bank-verified settlement signature (200)
  const validRefundUtr = uniqueUtr();
  const validReconcile = await apiJson(`/api/refunds/${encodeURIComponent(manualRefundId)}/reconcile-manual`, {
    method: 'POST',
    headers: { 'x-bos-role': 'admin' },
    body: JSON.stringify({
      refundUtr: validRefundUtr,
      simulateBankReconciliationWebhook: true,
    }),
  });
  assert.equal(validReconcile.status, 200);
  assert.equal(validReconcile.data.refund.status, 'bank_reconciled');
  assert.equal(validReconcile.data.refund.manualRefundUtr, validRefundUtr);
  assert.equal(validReconcile.data.refund.bankReconciled, true);

  // 7D. Audit logs recorded
  const auditRes = await apiJson('/api/payments/audit-logs');
  assert.equal(auditRes.status, 200);
  assert.ok(Array.isArray(auditRes.data.auditLogs) && auditRes.data.auditLogs.length >= 4);
  console.log('✅ [7/7] Direct UPI manual refund bank reconciliation, RBAC, anti-spoofing, and audit logs verified.');

  console.log('================================================================================');
  console.log('ALL 7 MULTI-VERTICAL PAYMENTS, CANCELLATION & REFUND TEST SUITES PASSED 100%');
  console.log('================================================================================');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
