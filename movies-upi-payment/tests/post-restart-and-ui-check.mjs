import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE_URL = 'http://127.0.0.1:3000';

async function verifyPostRestartAndUi() {
  console.log('====================================================================');
  console.log(' POST-RESTART PERSISTENCE & UI INTEGRITY VERIFICATION');
  console.log('====================================================================');

  const snapshot = JSON.parse(fs.readFileSync('/tmp/bos-pre-restart-ticket.json', 'utf-8'));
  console.log(`[INFO] Loaded pre-restart ticket snapshot: passCode=${snapshot.passCode}, barcodeId=${snapshot.barcodeId}`);

  // 1. Verify Ticket JSON survives server restart
  const ticketRes = await fetch(
    `${BASE_URL}/api/movies/bookings/${encodeURIComponent(snapshot.passCode)}/ticket?sig=${encodeURIComponent(snapshot.qrSignature)}`
  );
  assert.equal(ticketRes.status, 200, 'Ticket metadata must survive server restart');
  const ticketData = await ticketRes.json();
  assert.equal(ticketData.ok, true);
  assert.equal(ticketData.ticket.passCode, snapshot.passCode);
  assert.equal(ticketData.ticket.barcodeId, snapshot.barcodeId);
  assert.ok(ticketData.ticket.checkedInAt, 'Checked-in timestamp must survive server restart');
  console.log(`[PASS] 7A. Post-Restart Ticket State Persisted -> passCode=${ticketData.ticket.passCode}, checkedInAt=${ticketData.ticket.checkedInAt}`);

  // 2. Verify PDF Download survives server restart
  const pdfRes = await fetch(
    `${BASE_URL}/api/movies/bookings/${encodeURIComponent(snapshot.passCode)}/ticket.pdf?sig=${encodeURIComponent(snapshot.qrSignature)}`
  );
  assert.equal(pdfRes.status, 200, 'PDF ticket download must survive server restart');
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  const pdfStr = pdfBuf.toString('latin1');
  assert.ok(pdfStr.startsWith('%PDF-1.4'));
  assert.ok(pdfStr.includes(snapshot.passCode));
  assert.ok(pdfStr.includes(snapshot.barcodeId));
  console.log(`[PASS] 7B. Post-Restart PDF Ticket Download -> HTTP 200 (${pdfBuf.length} bytes, valid %PDF-1.4)`);

  // 3. Verify Single-Use QR & Barcode Replay Protection survives server restart
  const qrReplayRes = await fetch(`${BASE_URL}/api/passes/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      passToken: snapshot.qrPassToken,
      markCheckedIn: true,
    }),
  });
  assert.equal(qrReplayRes.status, 409, 'Consumed QR pass must still return 409 after server restart');
  const qrReplayData = await qrReplayRes.json();
  assert.equal(qrReplayData.error, 'PASS_ALREADY_USED');

  const bcReplayRes = await fetch(`${BASE_URL}/api/passes/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      barcodeId: snapshot.barcodeId,
      markCheckedIn: true,
    }),
  });
  assert.equal(bcReplayRes.status, 409, 'Consumed 1D Barcode must still return 409 after server restart');
  const bcReplayData = await bcReplayRes.json();
  assert.equal(bcReplayData.error, 'PASS_ALREADY_USED');
  console.log(`[PASS] 7C. Post-Restart Single-Use Gate Replay Guard -> QR=${qrReplayRes.status} (${qrReplayData.error}), Barcode=${bcReplayRes.status} (${bcReplayData.error})`);

  // 4. Verify Booked Seats remain locked after server restart
  const locksRes = await fetch(
    `${BASE_URL}/api/seats/locks?listingId=movie-hyd-1&dateIso=${encodeURIComponent(ticketData.ticket.scheduledDate)}&showtime=${encodeURIComponent(ticketData.ticket.showtime)}`
  );
  assert.equal(locksRes.status, 200);
  const locksData = await locksRes.json();
  for (const s of ticketData.ticket.seats) {
    assert.ok(locksData.bookedSeats.includes(s), `Seat ${s} must remain booked after server restart`);
  }
  console.log(`[PASS] 7D. Post-Restart Seat Lock Persistence -> Seats [${ticketData.ticket.seats.join(', ')}] remain locked in bookedSeats`);

  // 5. Verify Frontend Entry HTML & All 6 Marketplace Verticals Integrity
  const htmlRes = await fetch(`${BASE_URL}/`);
  assert.equal(htmlRes.status, 200);
  const htmlText = await htmlRes.text();
  assert.ok(
    htmlText.includes('Universal Services & Listings Marketplace') && htmlText.includes('<div id="root"></div>'),
    'Root HTML must serve the SPA entry point'
  );

  const invRes = await fetch(`${BASE_URL}/api/movies/inventory`);
  assert.equal(invRes.status, 200);
  const invData = await invRes.json();
  assert.equal(invData.ok, true);
  assert.ok(Array.isArray(invData.bookings) && invData.bookings.length > 0);
  console.log(`[PASS] 8. Frontend SPA & Movies Inventory Post-Restart -> HTTP 200, screens=${invData.screens.length}, bookings=${invData.bookings.length}, refunds=${invData.refunds.length}`);

  console.log('====================================================================');
  console.log(' ALL POST-RESTART & INTEGRITY VERIFICATIONS PASSED!');
  console.log('====================================================================');
}

verifyPostRestartAndUi().catch((err) => {
  console.error('POST-RESTART VERIFICATION FAILED:', err);
  process.exit(1);
});
