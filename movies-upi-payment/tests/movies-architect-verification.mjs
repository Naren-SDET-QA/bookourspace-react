import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE_URL = 'http://127.0.0.1:3000';

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    const arrayBuffer = await resp.arrayBuffer();
    return {
      status: resp.status,
      ok: resp.ok,
      contentType,
      disposition: resp.headers.get('content-disposition') || '',
      buffer: Buffer.from(arrayBuffer),
    };
  }
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, ok: resp.ok, contentType, data };
}

async function runSuite() {
  const results = [];
  const record = (name, status, detail) => {
    results.push({ name, status, detail });
    console.log(`[${status}] ${name} -> ${detail}`);
  };

  console.log('====================================================================');
  console.log(' BOOKOURSPACE MOVIES · PRINCIPAL ARCHITECT VERIFICATION SUITE');
  console.log('====================================================================');

  // ---------------------------------------------------------------------------
  // 1. REALITY AUDIT & DEMO BOOKING BLOCK
  // ---------------------------------------------------------------------------
  const auditRes = await api('/api/movies/reality-audit');
  assert.equal(auditRes.status, 200, 'Reality audit endpoint must return 200');
  assert.equal(auditRes.data.ok, true);
  assert.equal(auditRes.data.demoBookingsBlocked, true, 'Demo bookings must be blocked');
  assert.ok(auditRes.data.timezone.startsWith('Asia/Kolkata'));
  assert.equal(auditRes.data.subsystems.seats.classification, 'REAL');
  assert.equal(auditRes.data.subsystems.inventory.classification, 'SEEDED');
  assert.equal(auditRes.data.subsystems.upi.classification, 'SIMULATED');
  record(
    '1A. Reality Audit Endpoint (/api/movies/reality-audit)',
    'PASS',
    `demoBookingsBlocked=${auditRes.data.demoBookingsBlocked}, tz=${auditRes.data.timezone}, seats=${auditRes.data.subsystems.seats.classification}, inventory=${auditRes.data.subsystems.inventory.classification}, upi=${auditRes.data.subsystems.upi.classification}`
  );

  // Attempt demo booking & pay_later movie booking -> must be rejected with 402
  const demoAttempt = await api('/api/bookings/atomic', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: `test-demo-${Date.now()}`,
      listingId: 'movie-hyd-1',
      listingTitle: 'Kalki 2898 AD',
      providerId: 'prov-mov-1',
      customerName: 'Demo Tester',
      customerPhone: '9848011111',
      scheduledDate: '2026-12-20',
      timeSlot: '07:55 PM',
      showtime: '07:55 PM',
      seats: ['D1', 'D2'],
      totalAmount: 500,
      paymentMode: 'pay_later',
      isDemo: true,
    }),
  });
  assert.equal(demoAttempt.status, 402, 'Demo / pay_later movie booking must be blocked with 402');
  record(
    '1B. Block Demo & Pay-Later Movie Bookings',
    'PASS',
    `HTTP ${demoAttempt.status} (${demoAttempt.data.error})`
  );

  // ---------------------------------------------------------------------------
  // 2. TIMEZONE (Asia/Kolkata UTC+05:30 vs UTC) & PAST / CANCELLED SHOW GUARDS
  // ---------------------------------------------------------------------------
  // Simulate server UTC time: 2026-11-15T19:30:00.000Z = 2026-11-16 01:00:00 IST
  const boundaryUtc = '2026-11-15T19:30:00.000Z';
  const invBoundary = await api('/api/movies/inventory?dateIso=2026-11-16', {
    headers: { 'x-bos-test-now-utc': boundaryUtc },
  });
  assert.equal(invBoundary.status, 200);
  assert.equal(
    invBoundary.data.currentDateIsoIst,
    '2026-11-16',
    'At 19:30 UTC on Nov 15, IST date must be 2026-11-16'
  );
  record(
    '2A. UTC vs IST Midnight Boundary Calculation',
    'PASS',
    `UTC=${boundaryUtc} -> currentDateIsoIst=${invBoundary.data.currentDateIsoIst} (${invBoundary.data.serverTimeIstLabel})`
  );

  // Simulate server UTC time: 2026-11-20T10:00:00.000Z = 2026-11-20 15:30:00 IST (03:30 PM IST)
  // On 2026-11-20, 10:30 AM and 01:45 PM are PAST in IST, while 04:50 PM, 07:55 PM, 10:55 PM are FUTURE.
  const midDayUtc = '2026-11-20T10:00:00.000Z';
  const invMidDay = await api('/api/movies/inventory?dateIso=2026-11-20', {
    headers: { 'x-bos-test-now-utc': midDayUtc },
  });
  const scrAmb = invMidDay.data.screens.find((s) => s.cinemaListingId === 'movie-hyd-1');
  const slot1030 = scrAmb.showtimeSchedule.find((s) => s.showtime === '10:30 AM');
  const slot0145 = scrAmb.showtimeSchedule.find((s) => s.showtime === '01:45 PM');
  const slot0450 = scrAmb.showtimeSchedule.find((s) => s.showtime === '04:50 PM');
  assert.equal(slot1030.isPast, true, '10:30 AM must be past at 15:30 IST');
  assert.equal(slot1030.bookable, false);
  assert.equal(slot0145.isPast, true, '01:45 PM must be past at 15:30 IST');
  assert.equal(slot0450.isPast, false, '04:50 PM must be bookable at 15:30 IST');
  assert.equal(slot0450.bookable, true);
  record(
    '2B. Search / Inventory Past Show Classification (IST)',
    'PASS',
    `At 15:30 IST: 10:30 AM isPast=${slot1030.isPast}, 01:45 PM isPast=${slot0145.isPast}, 04:50 PM bookable=${slot0450.bookable}`
  );

  // Past show rejected at Seat Locks, Seat Hold, Payment Intent, Verify UPI, and Atomic Booking
  const pastLocks = await api('/api/seats/locks?listingId=movie-hyd-1&dateIso=2026-11-20&showtime=10%3A30%20AM', {
    headers: { 'x-bos-test-now-utc': midDayUtc },
  });
  assert.equal(pastLocks.status, 422);
  assert.equal(pastLocks.data.error, 'PAST_SHOWTIME_REJECTED');

  const pastHold = await api('/api/seats/hold', {
    method: 'POST',
    headers: { 'x-bos-test-now-utc': midDayUtc },
    body: JSON.stringify({
      listingId: 'movie-hyd-1',
      dateIso: '2026-11-20',
      showtime: '01:45 PM',
      seats: ['D5', 'D6'],
      sessionId: 'sess-past-test',
    }),
  });
  assert.equal(pastHold.status, 422);
  assert.equal(pastHold.data.error, 'PAST_SHOWTIME_REJECTED');

  const pastIntent = await api('/api/payments/create-intent', {
    method: 'POST',
    headers: { 'x-bos-test-now-utc': midDayUtc },
    body: JSON.stringify({
      amount: 500,
      merchantVpa: 'bookourspace.movies@okaxis',
      planOrListing: 'Movie Ticket: Kalki',
      listingId: 'movie-hyd-1',
      dateIso: '2026-11-20',
      showtime: '01:45 PM',
    }),
  });
  assert.equal(pastIntent.status, 422);
  assert.equal(pastIntent.data.error, 'PAST_SHOWTIME_REJECTED');

  const pastVerifyUpi = await api('/api/payments/verify-upi', {
    method: 'POST',
    headers: { 'x-bos-test-now-utc': midDayUtc },
    body: JSON.stringify({
      utrNumber: '418273645192',
      amount: 500,
      listingId: 'movie-hyd-1',
      dateIso: '2026-11-20',
      showtime: '01:45 PM',
    }),
  });
  assert.equal(pastVerifyUpi.status, 422);

  const pastAtomic = await api('/api/bookings/atomic', {
    method: 'POST',
    headers: { 'x-bos-test-now-utc': midDayUtc },
    body: JSON.stringify({
      idempotencyKey: `past-atomic-${Date.now()}`,
      listingId: 'movie-hyd-1',
      listingTitle: 'Kalki 2898 AD',
      providerId: 'prov-mov-1',
      customerName: 'Past Tester',
      customerPhone: '9848012345',
      scheduledDate: '2026-11-20',
      timeSlot: '01:45 PM',
      showtime: '01:45 PM',
      seats: ['D5', 'D6'],
      totalAmount: 500,
      paymentMode: 'pay_qr',
      requireVerifiedPayment: true,
    }),
  });
  assert.equal(pastAtomic.status, 422);
  assert.equal(pastAtomic.data.error, 'PAST_SHOWTIME_REJECTED');
  record(
    '2C. Past Show Rejected Across All 5 Lifecycle Stages',
    'PASS',
    `locks=${pastLocks.status}, hold=${pastHold.status}, intent=${pastIntent.status}, verifyUpi=${pastVerifyUpi.status}, atomic=${pastAtomic.status}`
  );

  // Cancelled show rejection: authenticate as admin and mark '2026-12-18|04:50 PM' as cancelled on scr-amb-1
  const adminAuth = await api('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({
      userId: 'usr-admin-1',
      email: 'admin@bookourspace.com',
      name: 'BOS Principal Admin',
      role: 'admin',
      adminPasscode: 'bos-admin-2026-verified',
    }),
  });
  assert.equal(adminAuth.status, 200);
  const adminToken = adminAuth.data.sessionToken;

  const cancelShowUpdate = await api('/api/movies/screens', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      id: 'scr-amb-1',
      listingId: 'movie-hyd-1',
      cancelledShows: ['2026-12-18|04:50 PM'],
    }),
  });
  assert.equal(cancelShowUpdate.status, 200);

  const cancelledHold = await api('/api/seats/hold', {
    method: 'POST',
    body: JSON.stringify({
      listingId: 'movie-hyd-1',
      dateIso: '2026-12-18',
      showtime: '04:50 PM',
      seats: ['E1', 'E2'],
      sessionId: 'sess-cancel-show',
    }),
  });
  assert.equal(cancelledHold.status, 409);
  assert.equal(cancelledHold.data.error, 'SHOW_CANCELLED');
  record(
    '2D. Cancelled Show Rejected with 409 SHOW_CANCELLED',
    'PASS',
    `HTTP ${cancelledHold.status} (${cancelledHold.data.error})`
  );

  // ---------------------------------------------------------------------------
  // 3. CONCURRENT SEAT HOLDS (200 vs 409 SEAT_CONFLICT)
  // ---------------------------------------------------------------------------
  const runSuffix = String(Date.now()).slice(-4);
  const futureDate = '2026-12-22';
  const futureSlot = '07:55 PM';
  const sessionA = `sess-A-${Date.now()}`;
  const sessionB = `sess-B-${Date.now()}`;
  const seat1 = `F${runSuffix}A`;
  const seat2 = `F${runSuffix}B`;
  const seat3 = `F${runSuffix}C`;
  const testSeats = [seat1, seat2];

  const holdA = await api('/api/seats/hold', {
    method: 'POST',
    body: JSON.stringify({
      listingId: 'movie-hyd-1',
      dateIso: futureDate,
      showtime: futureSlot,
      seats: testSeats,
      sessionId: sessionA,
    }),
  });
  assert.equal(holdA.status, 200, 'Session A seat hold must succeed');
  assert.ok(holdA.data.lockToken);

  const holdB = await api('/api/seats/hold', {
    method: 'POST',
    body: JSON.stringify({
      listingId: 'movie-hyd-1',
      dateIso: futureDate,
      showtime: futureSlot,
      seats: [seat2, seat3],
      sessionId: sessionB,
    }),
  });
  assert.equal(holdB.status, 409, 'Session B overlapping seat hold must fail with 409');
  assert.equal(holdB.data.error, 'SEAT_CONFLICT');
  assert.deepEqual(holdB.data.conflictingSeats, [seat2]);
  record(
    '3. Concurrent Seat Hold Contention Guard',
    'PASS',
    `Session A HTTP ${holdA.status} (${holdA.data.lockToken}) vs Session B HTTP ${holdB.status} (conflict: ${holdB.data.conflictingSeats.join(',')})`
  );

  // ---------------------------------------------------------------------------
  // 4. PAYMENTS: FAKE UTR REJECTION, UNSETTLED UTR GUARD, WEBHOOK SETTLEMENT & IDEMPOTENCY
  // ---------------------------------------------------------------------------
  const intentRes = await api('/api/payments/create-intent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      amount: 646,
      merchantVpa: 'bookourspace.movies@okaxis',
      planOrListing: 'Kalki 2898 AD (F3, F4)',
      listingId: 'movie-hyd-1',
      dateIso: futureDate,
      showtime: futureSlot,
    }),
  });
  assert.equal(intentRes.status, 200);
  const intentId = intentRes.data.intentId;

  // 4A. Fake UTR patterns must be rejected with 400 FAKE_OR_INVALID_UTR_REJECTED
  for (const bogusUtr of ['111111111111', '123456789012', '000000000000', '999999999999']) {
    const fakeRes = await api('/api/payments/verify-upi', {
      method: 'POST',
      body: JSON.stringify({
        intentId,
        utrNumber: bogusUtr,
        amount: 646,
        listingId: 'movie-hyd-1',
        dateIso: futureDate,
        showtime: futureSlot,
      }),
    });
    assert.equal(fakeRes.status, 400, `Fake UTR ${bogusUtr} must be rejected with 400`);
    assert.equal(fakeRes.data.error, 'FAKE_OR_INVALID_UTR_REJECTED');
  }
  record(
    '4A. Fake / Repeating / Sequential UTR Rejection',
    'PASS',
    'Rejected 111111111111, 123456789012, 000000000000, 999999999999 with 400 FAKE_OR_INVALID_UTR_REJECTED'
  );

  // 4B. Forged webhook signature must be rejected with 401
  const validUtr1 = `4198${String(Date.now()).slice(-8)}`;
  const badWebhook = await api('/api/payments/webhook-settle', {
    method: 'POST',
    headers: { 'x-bos-webhook-secret': 'WRONG_SECRET' },
    body: JSON.stringify({
      intentId,
      utrNumber: validUtr1,
      amount: 646,
      status: 'SUCCESS',
    }),
  });
  assert.equal(badWebhook.status, 401);

  // 4C. Submitting a valid UTR WITHOUT bank webhook settlement returns 202 and blocks booking with 402
  const unsettledVerify = await api('/api/payments/verify-upi', {
    method: 'POST',
    body: JSON.stringify({
      intentId,
      utrNumber: validUtr1,
      amount: 646,
      listingId: 'movie-hyd-1',
      dateIso: futureDate,
      showtime: futureSlot,
    }),
  });
  assert.equal(unsettledVerify.status, 202, 'Unsettled UTR must return 202 pending_reconciliation');
  assert.equal(unsettledVerify.data.verified, false);
  assert.equal(unsettledVerify.data.paymentVerificationToken, undefined);

  const unsettledBooking = await api('/api/bookings/atomic', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: `unsettled-bk-${Date.now()}`,
      listingId: 'movie-hyd-1',
      listingTitle: 'Kalki 2898 AD',
      providerId: 'prov-mov-1',
      customerName: 'Rahul Sharma',
      customerPhone: '9848012345',
      scheduledDate: futureDate,
      timeSlot: `${futureSlot} · Seats: F3, F4`,
      showtime: futureSlot,
      seats: testSeats,
      totalAmount: 646,
      paymentMode: 'pay_qr',
      requireVerifiedPayment: true,
      paymentIntentId: intentId,
      paymentUtr: validUtr1,
      sessionId: sessionA,
    }),
  });
  assert.equal(unsettledBooking.status, 402, 'Booking without bank settlement token must fail with 402');
  assert.equal(unsettledBooking.data.error, 'PAYMENT_NOT_VERIFIED');
  record(
    '4B. Unsettled UTR Guard & Forged Webhook Rejection',
    'PASS',
    `Forged webhook=${badWebhook.status}, UTR-only verify=${unsettledVerify.status}, Unsettled booking=${unsettledBooking.status} (${unsettledBooking.data.error})`
  );

  // 4D. Bank Webhook Settlement + Cryptographic Token + Duplicate UTR Replay Guard + Atomic Booking Idempotency
  const settleRes = await api('/api/payments/webhook-settle', {
    method: 'POST',
    headers: { 'x-bos-webhook-secret': 'BOS_BANK_WEBHOOK_SECRET_2026' },
    body: JSON.stringify({
      intentId,
      utrNumber: validUtr1,
      amount: 646,
      status: 'SUCCESS',
    }),
  });
  assert.equal(settleRes.status, 200);

  const settledVerify = await api('/api/payments/verify-upi', {
    method: 'POST',
    body: JSON.stringify({
      intentId,
      utrNumber: validUtr1,
      amount: 646,
      gatewaySignature: settleRes.data.gatewaySignature,
      listingId: 'movie-hyd-1',
      dateIso: futureDate,
      showtime: futureSlot,
    }),
  });
  assert.equal(settledVerify.status, 200);
  assert.equal(settledVerify.data.verified, true);
  assert.ok(settledVerify.data.paymentVerificationToken);

  // Replaying the same UTR on another intent must fail with 409 DUPLICATE_UTR_REPLAY
  const intentRes2 = await api('/api/payments/create-intent', {
    method: 'POST',
    body: JSON.stringify({
      amount: 646,
      merchantVpa: 'bookourspace.movies@okaxis',
      planOrListing: 'Replay Test',
      listingId: 'movie-hyd-1',
      dateIso: futureDate,
      showtime: futureSlot,
    }),
  });
  const replayUtrRes = await api('/api/payments/verify-upi', {
    method: 'POST',
    body: JSON.stringify({
      intentId: intentRes2.data.intentId,
      utrNumber: validUtr1,
      amount: 646,
      listingId: 'movie-hyd-1',
      dateIso: futureDate,
      showtime: futureSlot,
    }),
  });
  assert.equal(replayUtrRes.status, 409, 'Reusing UTR across intents must return 409 DUPLICATE_UTR_REPLAY');

  // Confirm atomic booking with verified payment token
  const idempKey1 = `confirmed-bk-${Date.now()}`;
  const atomicRes1 = await api('/api/bookings/atomic', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      idempotencyKey: idempKey1,
      listingId: 'movie-hyd-1',
      listingTitle: 'Kalki 2898 AD (07:55 PM · Seats: F3, F4)',
      providerId: 'prov-mov-1',
      customerName: 'Rahul Sharma',
      customerPhone: '9848012345',
      customerAddress: 'Gachibowli, Hyderabad',
      scheduledDate: futureDate,
      timeSlot: `${futureSlot} · Seats: F3, F4`,
      showtime: futureSlot,
      screenId: 'scr-amb-1',
      screenName: 'Screen 1 · Barco Flagship Laser',
      seats: testSeats,
      baseAmount: 580,
      taxAmount: 66,
      discountAmount: 0,
      totalAmount: 646,
      paymentMode: 'pay_qr',
      requireVerifiedPayment: true,
      paymentIntentId: intentId,
      paymentUtr: validUtr1,
      paymentVerificationToken: settledVerify.data.paymentVerificationToken,
      sessionId: sessionA,
    }),
  });
  assert.equal(atomicRes1.status, 201);
  assert.equal(atomicRes1.data.ok, true);
  const confirmedBooking = atomicRes1.data.booking;
  assert.ok(confirmedBooking.passCode.startsWith('BOS-TKT-'));
  assert.ok(confirmedBooking.barcodeId.startsWith('BOS-MOV-'));
  assert.ok(confirmedBooking.showStartUtcIso.endsWith('Z'));
  assert.ok(confirmedBooking.showStartIstLabel.includes('IST'));

  // Replaying the same idempotencyKey must return idempotentReplay: true with same booking ID
  const atomicReplay = await api('/api/bookings/atomic', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      idempotencyKey: idempKey1,
      listingId: 'movie-hyd-1',
      listingTitle: 'Kalki 2898 AD (07:55 PM · Seats: F3, F4)',
      providerId: 'prov-mov-1',
      customerName: 'Rahul Sharma',
      customerPhone: '9848012345',
      scheduledDate: futureDate,
      timeSlot: `${futureSlot} · Seats: F3, F4`,
      showtime: futureSlot,
      seats: testSeats,
      totalAmount: 646,
      paymentMode: 'pay_qr',
      requireVerifiedPayment: true,
      paymentIntentId: intentId,
      paymentUtr: validUtr1,
      paymentVerificationToken: settledVerify.data.paymentVerificationToken,
      sessionId: sessionA,
    }),
  });
  assert.equal(atomicReplay.status, 200);
  assert.equal(atomicReplay.data.idempotentReplay, true);
  assert.equal(atomicReplay.data.booking.id, confirmedBooking.id);
  record(
    '4C. Bank-Settled Booking, UTC+IST Timestamps & Idempotency',
    'PASS',
    `passCode=${confirmedBooking.passCode}, barcodeId=${confirmedBooking.barcodeId}, UTC=${confirmedBooking.showStartUtcIso}, IST="${confirmedBooking.showStartIstLabel}", idempotentReplay=${atomicReplay.data.idempotentReplay}`
  );

  // ---------------------------------------------------------------------------
  // 5. BOS-BRANDED DOWNLOADABLE PDF TICKET & SECURE ACCESS CONTROL
  // ---------------------------------------------------------------------------
  // 5A. Unauthorized request without token/sig/phone must be blocked with 403
  const unauthPdf = await api(`/api/movies/bookings/${confirmedBooking.passCode}/ticket.pdf`);
  assert.equal(unauthPdf.status, 403, 'Unauthorized PDF download must return 403');

  // 5B. Authorized PDF download via cryptographic signature
  const pdfRes = await api(
    `/api/movies/bookings/${confirmedBooking.passCode}/ticket.pdf?sig=${confirmedBooking.qrSignature}`
  );
  assert.equal(pdfRes.status, 200);
  assert.ok(pdfRes.contentType.includes('application/pdf'));
  const pdfText = pdfRes.buffer.toString('latin1');
  assert.ok(pdfText.startsWith('%PDF-1.4'), 'PDF must start with %PDF-1.4 header');
  assert.ok(pdfText.trim().endsWith('%%EOF'), 'PDF must end with %%EOF trailer');
  assert.ok(pdfText.includes('BOOKOURSPACE'), 'PDF must include BOS branding');
  assert.ok(pdfText.includes(confirmedBooking.passCode), 'PDF must include Booking Pass ID');
  assert.ok(pdfText.includes(confirmedBooking.barcodeId), 'PDF must include 1D Barcode ID');
  assert.ok(pdfText.includes(confirmedBooking.cinemaConfirmationId), 'PDF must include Cinema Confirmation ID');
  assert.ok(pdfText.includes(testSeats.join(', ')), 'PDF must include confirmed seats');
  assert.ok(pdfText.includes(validUtr1), 'PDF must include payment UTR reference');
  assert.ok(pdfText.includes('INR 646'), 'PDF must include total paid amount');
  record(
    '5. BOS-Branded PDF Ticket Generation & Access Guard',
    'PASS',
    `Unauth=${unauthPdf.status}, Auth PDF=${pdfRes.status} (${pdfRes.buffer.length} bytes, valid %PDF-1.4 with BOS logo, QR, Code-128 barcode ${confirmedBooking.barcodeId}, Cinema Conf ${confirmedBooking.cinemaConfirmationId}, seats, taxes, UTR)`
  );

  // ---------------------------------------------------------------------------
  // 6. TICKET ACTIONS: RESEND, SINGLE-USE QR SCAN, SINGLE-USE BARCODE SCAN, CANCELLATION & REFUND
  // ---------------------------------------------------------------------------
  // 6A. Resend ticket
  const resendRes = await api(
    `/api/movies/bookings/${confirmedBooking.passCode}/resend?sig=${confirmedBooking.qrSignature}`,
    {
      method: 'POST',
      body: JSON.stringify({
        email: 'rahul.sharma@gmail.com',
        phone: '9848012345',
      }),
    }
  );
  assert.equal(resendRes.status, 200);
  assert.equal(resendRes.data.resentCount, 1);

  // 6B. Single-use QR Gate Validation (1st scan -> 200, 2nd scan -> 409 PASS_ALREADY_USED)
  const qrScan1 = await api('/api/passes/verify', {
    method: 'POST',
    body: JSON.stringify({
      passToken: confirmedBooking.qrPassToken,
      markCheckedIn: true,
    }),
  });
  assert.equal(qrScan1.status, 200);
  assert.equal(qrScan1.data.verified, true);

  const qrScan2 = await api('/api/passes/verify', {
    method: 'POST',
    body: JSON.stringify({
      passToken: confirmedBooking.qrPassToken,
      markCheckedIn: true,
    }),
  });
  assert.equal(qrScan2.status, 409, 'Second scan of used QR pass must return 409 PASS_ALREADY_USED');
  assert.equal(qrScan2.data.error, 'PASS_ALREADY_USED');

  // Attempting to cancel/refund a ticket that was ALREADY scanned at the gate must fail with 409 CANNOT_CANCEL_USED_TICKET
  const cancelUsedTicket = await api(`/api/movies/bookings/${confirmedBooking.passCode}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      reason: 'Attempt refund after gate entry',
      customerPhone: '9848012345',
    }),
  });
  assert.equal(cancelUsedTicket.status, 409, 'Cannot cancel or refund a ticket after gate check-in');
  assert.equal(cancelUsedTicket.data.error, 'CANNOT_CANCEL_USED_TICKET');

  record(
    '6A. Ticket Resend, Single-Use QR Replay & Post-Entry Refund Block',
    'PASS',
    `Resend count=${resendRes.data.resentCount}, 1st QR scan=${qrScan1.status}, 2nd QR scan=${qrScan2.status} (${qrScan2.data.error}), Cancel used ticket=${cancelUsedTicket.status} (${cancelUsedTicket.data.error})`
  );

  // 6C. Create a 2nd confirmed booking to test Single-Use 1D Barcode Scan AND a 3rd booking to test Cancellation & Refund
  async function createSettledMovieBooking(seats, sessionTag) {
    const sess = `sess-${sessionTag}-${Date.now()}`;
    await api('/api/seats/hold', {
      method: 'POST',
      body: JSON.stringify({
        listingId: 'movie-hyd-1',
        dateIso: futureDate,
        showtime: futureSlot,
        seats,
        sessionId: sess,
      }),
    });
    const intent = await api('/api/payments/create-intent', {
      method: 'POST',
      body: JSON.stringify({
        amount: 646,
        merchantVpa: 'bookourspace.movies@okaxis',
        planOrListing: `Kalki (${seats.join(',')})`,
        listingId: 'movie-hyd-1',
        dateIso: futureDate,
        showtime: futureSlot,
      }),
    });
    const utr = `42${Math.floor(1000000000 + Math.random() * 8999999999)}`;
    await api('/api/payments/webhook-settle', {
      method: 'POST',
      headers: { 'x-bos-webhook-secret': 'BOS_BANK_WEBHOOK_SECRET_2026' },
      body: JSON.stringify({
        intentId: intent.data.intentId,
        utrNumber: utr,
        amount: 646,
        status: 'SUCCESS',
      }),
    });
    const ver = await api('/api/payments/verify-upi', {
      method: 'POST',
      body: JSON.stringify({
        intentId: intent.data.intentId,
        utrNumber: utr,
        amount: 646,
        listingId: 'movie-hyd-1',
        dateIso: futureDate,
        showtime: futureSlot,
      }),
    });
    const bk = await api('/api/bookings/atomic', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        idempotencyKey: `bk-${sessionTag}-${Date.now()}`,
        listingId: 'movie-hyd-1',
        listingTitle: `Kalki 2898 AD (${seats.join(', ')})`,
        providerId: 'prov-mov-1',
        customerName: 'Rahul Sharma',
        customerPhone: '9848012345',
        scheduledDate: futureDate,
        timeSlot: `${futureSlot} · Seats: ${seats.join(', ')}`,
        showtime: futureSlot,
        seats,
        totalAmount: 646,
        paymentMode: 'pay_qr',
        requireVerifiedPayment: true,
        paymentIntentId: intent.data.intentId,
        paymentUtr: utr,
        paymentVerificationToken: ver.data.paymentVerificationToken,
        sessionId: sess,
      }),
    });
    assert.equal(bk.status, 201);
    return bk.data.booking;
  }

  const barcodeSeats = [`G${runSuffix}A`, `G${runSuffix}B`];
  const bookingForBarcode = await createSettledMovieBooking(barcodeSeats, 'barcode');
  const bcScan1 = await api('/api/passes/verify', {
    method: 'POST',
    body: JSON.stringify({
      barcodeId: bookingForBarcode.barcodeId,
      markCheckedIn: true,
    }),
  });
  assert.equal(bcScan1.status, 200);
  assert.equal(bcScan1.data.verified, true);

  const bcScan2 = await api('/api/passes/verify', {
    method: 'POST',
    body: JSON.stringify({
      barcodeId: bookingForBarcode.barcodeId,
      markCheckedIn: true,
    }),
  });
  assert.equal(bcScan2.status, 409, 'Second scan of 1D Barcode must return 409 PASS_ALREADY_USED');
  record(
    '6B. Single-Use 1D Barcode Gate Validation & Replay Guard',
    'PASS',
    `barcodeId=${bookingForBarcode.barcodeId}, 1st scan=${bcScan1.status}, 2nd scan=${bcScan2.status} (${bcScan2.data.error})`
  );

  // 6D. Cancellation, Refund Calculation, Duplicate Refund Guard, PDF/Gate Revocation & Atomic Seat Release
  const cancelSeats = [`H${runSuffix}A`, `H${runSuffix}B`];
  const bookingForCancel = await createSettledMovieBooking(cancelSeats, 'cancel');
  const cancelRes = await api(`/api/movies/bookings/${bookingForCancel.passCode}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      reason: 'Automated test cancellation & seat release',
      customerPhone: '9848012345',
    }),
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.data.booking.status, 'cancelled');
  assert.equal(cancelRes.data.booking.paymentStatus, 'refunded');
  assert.equal(cancelRes.data.refund.refundAmount, Math.round(646 * 0.8));

  // Duplicate refund attempt must fail with 409 ALREADY_CANCELLED
  const duplicateCancel = await api(`/api/movies/bookings/${bookingForCancel.passCode}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      reason: 'Duplicate cancellation attempt',
      customerPhone: '9848012345',
    }),
  });
  assert.equal(duplicateCancel.status, 409);
  assert.equal(duplicateCancel.data.error, 'ALREADY_CANCELLED');

  // Cancelled ticket PDF download must be blocked with 409
  const cancelledPdf = await api(
    `/api/movies/bookings/${bookingForCancel.passCode}/ticket.pdf?sig=${bookingForCancel.qrSignature}`
  );
  assert.equal(cancelledPdf.status, 409);

  // Cancelled ticket QR scan must be blocked with 403 BOOKING_CANCELLED
  const cancelledScan = await api('/api/passes/verify', {
    method: 'POST',
    body: JSON.stringify({ passToken: bookingForCancel.qrPassToken }),
  });
  assert.equal(cancelledScan.status, 403);
  assert.equal(cancelledScan.data.error, 'BOOKING_CANCELLED');

  // Released seats must now be immediately bookable/holdable by a new user session!
  const holdAfterCancel = await api('/api/seats/hold', {
    method: 'POST',
    body: JSON.stringify({
      listingId: 'movie-hyd-1',
      dateIso: futureDate,
      showtime: futureSlot,
      seats: cancelSeats,
      sessionId: `sess-rehold-${Date.now()}`,
    }),
  });
  assert.equal(holdAfterCancel.status, 200, 'Cancelled seats must be released back to live inventory');
  record(
    '6C. Cancellation, Duplicate Refund Guard, PDF/Gate Revocation & Seat Release',
    'PASS',
    `Refund=INR ${cancelRes.data.refund.refundAmount} (80%), Duplicate cancel=${duplicateCancel.status}, Cancelled PDF=${cancelledPdf.status}, Cancelled Gate Scan=${cancelledScan.status}, Re-hold=${holdAfterCancel.status}`
  );

  // ---------------------------------------------------------------------------
  // 7. GOOGLE OAUTH ROLE ISOLATION, POS SYNC & SIX-VERTICAL INTEGRITY
  // ---------------------------------------------------------------------------
  // 7A. Customer Google OAuth cannot self-escalate to admin
  const escalationAttempt = await api('/api/auth/google/authenticate', {
    method: 'POST',
    body: JSON.stringify({
      authProvider: 'google',
      email: 'regular.customer@gmail.com',
      name: 'Regular Customer',
      requestedRole: 'admin',
    }),
  });
  assert.equal(escalationAttempt.status, 403);
  assert.equal(escalationAttempt.data.error, 'ADMIN_ESCALATION_DENIED');

  const customerAuth = await api('/api/auth/google/authenticate', {
    method: 'POST',
    body: JSON.stringify({
      authProvider: 'google',
      email: 'regular.customer@gmail.com',
      name: 'Regular Customer',
    }),
  });
  assert.ok([200, 201].includes(customerAuth.status));
  assert.equal(customerAuth.data.user.role, 'customer');
  const customerToken = customerAuth.data.sessionToken;

  // Customer cannot mutate cinema screens or sync POS inventory
  const customerScreenMutate = await api('/api/movies/screens', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ id: 'scr-amb-1', listingId: 'movie-hyd-1', refundPercent: 100 }),
  });
  assert.equal(customerScreenMutate.status, 403);

  const customerPosSync = await api('/api/movies/inventory/sync-pos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ screens: [] }),
  });
  assert.equal(customerPosSync.status, 403);

  // Demo POS inventory sync is blocked with 422
  const demoPosSync = await api('/api/movies/inventory/sync-pos', {
    method: 'POST',
    headers: { 'x-bos-cinema-pos-key': 'BOS_CINEMA_POS_LIVE_KEY_2026' },
    body: JSON.stringify({ isDemo: true, screens: [] }),
  });
  assert.equal(demoPosSync.status, 422);
  assert.equal(demoPosSync.data.error, 'DEMO_INVENTORY_REJECTED');

  // Authorized POS inventory sync succeeds with 200
  const validPosSync = await api('/api/movies/inventory/sync-pos', {
    method: 'POST',
    headers: { 'x-bos-cinema-pos-key': 'BOS_CINEMA_POS_LIVE_KEY_2026' },
    body: JSON.stringify({
      posFeedSource: 'VISTA_POS_HYD_FEED',
      screens: [
        {
          id: 'scr-amb-1',
          listingId: 'movie-hyd-1',
          cinemaName: 'AMB Cinemas Gachibowli (Barco Flagship Laser)',
          screenName: 'Screen 1 · Barco Flagship Laser · Dolby Atmos',
        },
      ],
    }),
  });
  assert.equal(validPosSync.status, 200);
  assert.equal(validPosSync.data.syncedCount, 1);

  // Non-movie verticals (e.g. PG/Hostel or Venue) continue to support standard atomic bookings without regression
  const venueBooking = await api('/api/bookings/atomic', {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({
      idempotencyKey: `venue-bk-${Date.now()}`,
      listingId: 'venue-hyd-1',
      listingTitle: 'Royal Nizam Grand Convention Hall',
      providerId: 'prov-venue-1',
      customerName: 'Regular Customer',
      customerPhone: '9848011223',
      scheduledDate: '2026-12-28',
      timeSlot: `Morning Slot (${runSuffix})`,
      totalAmount: 45000,
      paymentMode: 'pay_later',
    }),
  });
  assert.equal(venueBooking.status, 201, 'Non-movie verticals must remain 100% functional without regression');
  record(
    '7. OAuth RBAC Isolation, Authorized POS Sync & 6-Vertical Preservation',
    'PASS',
    `Admin escalation=${escalationAttempt.status}, Customer POS Sync=${customerPosSync.status}, Demo POS=${demoPosSync.status}, Live POS Sync=${validPosSync.status}, Venue vertical booking=${venueBooking.status}`
  );

  // ---------------------------------------------------------------------------
  // 8. STRICT PRODUCTION MODE GATES (NO JSON FALLBACK / NO SIMULATED PAYMENT / NO FABRICATED POS)
  // ---------------------------------------------------------------------------
  const prodReadiness = await api('/api/movies/production-readiness');
  assert.equal(prodReadiness.status, 200);
  assert.equal(prodReadiness.data.ok, true);
  assert.ok(prodReadiness.data.gates.supabasePostgresAndRls.status);
  assert.ok(prodReadiness.data.gates.googleOAuthAndRbac.devCallbackUrl.includes('/auth/callback'));

  // In strict production mode, simulated payment webhook must be rejected with 503
  const strictSimulatedPayment = await api('/api/payments/webhook-settle', {
    method: 'POST',
    headers: {
      'x-bos-webhook-secret': 'BOS_BANK_WEBHOOK_SECRET_2026',
      'x-bos-strict-production': 'true',
    },
    body: JSON.stringify({
      intentId,
      utrNumber: `4299${String(Date.now()).slice(-8)}`,
      amount: 646,
      status: 'SUCCESS',
      simulated: true,
    }),
  });
  assert.equal(strictSimulatedPayment.status, 503);
  assert.equal(strictSimulatedPayment.data.error, 'SIMULATED_PAYMENT_BLOCKED_IN_PRODUCTION');

  // In strict production mode: if Supabase service-role is BLOCKED, seat hold must reject JSON fallback with 503; if VERIFIED, it succeeds with 200
  const strictHold = await api('/api/seats/hold', {
    method: 'POST',
    headers: { 'x-bos-strict-production': 'true' },
    body: JSON.stringify({
      listingId: 'movie-hyd-1',
      dateIso: futureDate,
      showtime: futureSlot,
      seats: [`J${runSuffix}A`],
      sessionId: `sess-strict-${Date.now()}`,
    }),
  });
  if (prodReadiness.data.gates.supabasePostgresAndRls.status === 'VERIFIED') {
    assert.equal(strictHold.status, 200);
  } else {
    assert.equal(strictHold.status, 503);
    assert.equal(strictHold.data.error, 'PRODUCTION_SUPABASE_REQUIRED');
  }

  // In strict production mode without a cryptographic Google OAuth token/client secret, unverified OAuth payload must be blocked with 503
  const strictOAuth = await api('/api/auth/google/authenticate', {
    method: 'POST',
    headers: { 'x-bos-strict-production': 'true' },
    body: JSON.stringify({
      authProvider: 'google',
      email: 'strict.prod@gmail.com',
      name: 'Strict Prod User',
    }),
  });
  assert.equal(strictOAuth.status, 503);
  assert.equal(strictOAuth.data.error, 'PRODUCTION_GOOGLE_OAUTH_REQUIRED');

  record(
    '8. Strict Production Mode Gates (Zero JSON Fallback / Zero Simulated Settlement / Zero Unverified OAuth)',
    'PASS',
    `readiness=${prodReadiness.status} (supabase=${prodReadiness.data.gates.supabasePostgresAndRls.status}), strictSimulatedWebhook=${strictSimulatedPayment.status} (${strictSimulatedPayment.data.error}), strictSeatHold=${strictHold.status}, strictOAuth=${strictOAuth.status} (${strictOAuth.data.error})`
  );

  // Write state snapshot for post-restart verification
  fs.writeFileSync(
    '/tmp/bos-pre-restart-ticket.json',
    JSON.stringify({
      passCode: confirmedBooking.passCode,
      qrPassToken: confirmedBooking.qrPassToken,
      qrSignature: confirmedBooking.qrSignature,
      barcodeId: confirmedBooking.barcodeId,
      cinemaConfirmationId: confirmedBooking.cinemaConfirmationId,
    })
  );

  console.log('====================================================================');
  console.log(` ALL ${results.length} API & ARCHITECTURAL TESTS PASSED!`);
  console.log('====================================================================');
}

runSuite().catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});
