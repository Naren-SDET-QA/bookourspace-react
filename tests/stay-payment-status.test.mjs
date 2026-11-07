import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  hasAuthoritativeOnlineSettlement,
  isStayOnlineMethodAvailable,
  stayPaymentStatusPresentation,
  staySettlementMessage,
} from '../src/lib/stayPaymentStatus.ts';

const capability = (overrides = {}) => ({
  ok: true,
  database: true,
  upi: false,
  razorpay: true,
  razorpayTestMode: true,
  payAfterService: true,
  sandbox: false,
  merchantVpa: null,
  settlementVerification: 'razorpay_checkout_fetch',
  ...overrides,
});

test('recognizes server-authorized Razorpay checkout fetch in Test Mode', () => {
  const response = capability();
  assert.equal(hasAuthoritativeOnlineSettlement(response), true);
  assert.equal(isStayOnlineMethodAvailable(response, 'razorpay'), true);
  assert.match(staySettlementMessage(response), /Test Mode is available/);
  assert.match(staySettlementMessage(response), /server verifies captured payment/);
});

test('rejects absent, failed, unavailable, and database-unready capabilities', () => {
  assert.equal(hasAuthoritativeOnlineSettlement(null), false);
  assert.equal(isStayOnlineMethodAvailable(capability({ ok: false }), 'razorpay'), false);
  assert.equal(isStayOnlineMethodAvailable(capability({ database: false }), 'razorpay'), false);
  assert.equal(isStayOnlineMethodAvailable(capability({ settlementVerification: 'unavailable' }), 'razorpay'), false);
  assert.equal(isStayOnlineMethodAvailable(capability({ razorpay: false }), 'razorpay'), false);
  assert.equal(isStayOnlineMethodAvailable(capability({ upi: true }), 'upi'), true);
  assert.match(staySettlementMessage(null), /Pay at Hotel remains available/);
});

test('maps pending, including pending_verification, to unpaid pending state', () => {
  for (const status of ['created', 'pending', 'pending_verification', '', undefined]) {
    const view = stayPaymentStatusPresentation(status, { onlineAvailable: true });
    assert.equal(view.state, 'pending', String(status));
    assert.match(view.message, /remains pending|Waiting for authoritative settlement/);
  }
});

test('maps active server verification to processing without claiming success', () => {
  for (const options of [
    { onlineAvailable: true, verificationInProgress: true },
    { onlineAvailable: true },
  ]) {
    const view = stayPaymentStatusPresentation(options.verificationInProgress ? 'pending' : 'processing', options);
    assert.equal(view.state, 'processing');
    assert.match(view.message, /remains unpaid/);
  }
});

test('maps failed, expired and refunded to distinct non-success state', () => {
  for (const status of ['failed', 'expired', 'refunded']) {
    const view = stayPaymentStatusPresentation(status, { onlineAvailable: true });
    assert.equal(view.state, 'failed', status);
    assert.notEqual(view.state, 'verified');
    assert.match(view.message, /not marked paid|not considered paid/);
  }
});

test('only authoritative verified status presents payment success', () => {
  const verified = stayPaymentStatusPresentation('verified', { onlineAvailable: true });
  assert.deepEqual(verified, {
    state: 'verified', label: 'Payment verified', message: 'The server confirmed settlement.',
  });
  assert.equal(stayPaymentStatusPresentation('verified', { onlineAvailable: false }).state, 'unavailable');
});

test('Pay at Hotel remains a separate option and success requires server verification', async () => {
  const component = await readFile(new URL('../src/components/StayCheckoutPanel.tsx', import.meta.url), 'utf8');
  assert.match(component, /onClick=\{\(\) => \{ userPickedMode\.current = true; setMode\('pay_after_service'\); \}\}[\s\S]{0,250}disabled=\{disabled\}/);
  assert.match(component, /Continue with Google/);
  assert.match(component, /Confirm Reservation/);
  assert.match(component, /verified\.ok && \(verified as \{ verified\?: boolean \}\)\.verified === true/);
  assert.match(component, /const status = \(result as \{ status: string \}\)\.status;[\s\S]{0,120}if \(status === 'verified'\)/);
});
