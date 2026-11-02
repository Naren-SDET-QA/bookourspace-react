import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
let serverProcess: ChildProcess | undefined;
let tempDirectory = '';

const jsonRequest = async (baseUrl: string, pathname: string, init: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return { response, data: (await response.json()) as any };
};

const waitForServer = async (baseUrl: string) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.status === 401 || response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the integration server.');
};

after(async () => {
  serverProcess?.kill();
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
});

test('stays server enforces payment, availability, idempotency, cancellation and refund initiation', async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'bookourspace-stays-'));
  const port = 3310 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;
  const tsxCli = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  serverProcess = spawn(process.execPath, [tsxCli, 'server.ts'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BOS_ALLOW_SIMULATED_PAYMENT_SETTLEMENT: 'true',
      BOS_AUTH_STORE_FILE_PATH: path.join(tempDirectory, 'authoritative-store.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout?.resume();
  serverProcess.stderr?.resume();

  await waitForServer(baseUrl);

  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const auth = await jsonRequest(baseUrl, '/api/auth/google/authenticate', {
    method: 'POST',
    body: JSON.stringify({
      email: `stays-integration-${unique}@example.com`,
      googleSub: `stays-integration-${unique}`,
      name: 'Stays Integration Customer',
      phone: '9000000001',
      authProvider: 'google',
      requestedRole: 'customer',
    }),
  });
  assert.equal(auth.response.status, 201);
  const authHeaders = { Authorization: `Bearer ${auth.data.sessionToken}` };

  const intent = await jsonRequest(baseUrl, '/api/payments/create-intent', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      amount: 5000,
      merchantVpa: 'bookourspace@okhdfcbank',
      planOrListing: 'Integration Stay',
    }),
  });
  assert.equal(intent.response.status, 200);

  const utr = `UTR${unique}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 18).padEnd(12, '0');
  const pendingPayment = await jsonRequest(baseUrl, '/api/payments/verify-upi', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ intentId: intent.data.intentId, utrNumber: utr, amount: 5000 }),
  });
  assert.equal(pendingPayment.response.status, 202);
  assert.equal(pendingPayment.data.verified, false);

  const rejectedBooking = await jsonRequest(baseUrl, '/api/bookings/atomic', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      idempotencyKey: `rejected-${unique}`,
      listingId: 'hotel-integration-1',
      listingTitle: 'Integration Stay',
      providerId: 'provider-integration',
      customerName: 'Stays Integration Customer',
      customerPhone: '9000000001',
      scheduledDate: '2099-01-10',
      checkInDate: '2099-01-10',
      checkOutDate: '2099-01-12',
      timeSlot: '12:00 PM',
      totalAmount: 5000,
      paymentMode: 'pay_qr',
      paymentIntentId: intent.data.intentId,
      requireVerifiedPayment: true,
    }),
  });
  assert.equal(rejectedBooking.response.status, 402);
  assert.equal(rejectedBooking.data.error, 'PAYMENT_NOT_VERIFIED');

  const settleUtr = `SETTLE${unique}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 18).padEnd(12, '0');
  const settled = await jsonRequest(baseUrl, '/api/payments/webhook-settle', {
    method: 'POST',
    body: JSON.stringify({ intentId: intent.data.intentId, utrNumber: settleUtr, amount: 5000 }),
  });
  assert.equal(settled.response.status, 200);

  const verifiedPayment = await jsonRequest(baseUrl, '/api/payments/verify-upi', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      intentId: intent.data.intentId,
      utrNumber: settleUtr,
      gatewaySignature: settled.data.gatewaySignature,
      amount: 5000,
    }),
  });
  assert.equal(verifiedPayment.response.status, 200);
  assert.equal(verifiedPayment.data.verified, true);

  const bookingPayload = {
    idempotencyKey: `booking-${unique}`,
    listingId: 'hotel-integration-1',
    listingTitle: 'Integration Stay',
    providerId: 'provider-integration',
    customerName: 'Stays Integration Customer',
    customerPhone: '9000000001',
    scheduledDate: '2099-01-10',
    checkInDate: '2099-01-10',
    checkOutDate: '2099-01-12',
    timeSlot: '12:00 PM',
    totalAmount: 5000,
    paymentMode: 'pay_qr',
    paymentIntentId: intent.data.intentId,
    paymentVerificationToken: verifiedPayment.data.paymentVerificationToken,
    requireVerifiedPayment: true,
  };
  const booking = await jsonRequest(baseUrl, '/api/bookings/atomic', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(bookingPayload),
  });
  assert.equal(booking.response.status, 201);
  assert.equal(booking.data.booking.paymentStatus, 'verified');

  const replay = await jsonRequest(baseUrl, '/api/bookings/atomic', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(bookingPayload),
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.data.idempotentReplay, true);

  const conflict = await jsonRequest(baseUrl, '/api/bookings/atomic', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      ...bookingPayload,
      idempotencyKey: `conflict-${unique}`,
      paymentMode: 'pay_later',
      paymentIntentId: undefined,
      paymentVerificationToken: undefined,
      requireVerifiedPayment: false,
    }),
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.data.error, 'SLOT_ALREADY_BOOKED');

  const cancelled = await jsonRequest(
    baseUrl,
    `/api/bookings/${encodeURIComponent(booking.data.booking.id)}/cancel`,
    {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ reason: 'Integration cancellation' }),
    }
  );
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.data.booking.status, 'cancelled');
  assert.equal(cancelled.data.booking.refundStatus, 'initiated');
  assert.equal(cancelled.data.booking.paymentStatus, 'verified');
  assert.equal(cancelled.data.refund.refundAmount, 4000);

  const duplicateCancellation = await jsonRequest(
    baseUrl,
    `/api/bookings/${encodeURIComponent(booking.data.booking.id)}/cancel`,
    { method: 'POST', headers: authHeaders, body: JSON.stringify({ reason: 'Retry' }) }
  );
  assert.equal(duplicateCancellation.response.status, 409);
  assert.equal(duplicateCancellation.data.error, 'ALREADY_CANCELLED');
});
