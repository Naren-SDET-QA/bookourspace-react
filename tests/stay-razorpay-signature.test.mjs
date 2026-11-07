import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  stayPaymentSandboxEnabled,
  stayRazorpayReady,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from '../src/server/stayRazorpay.ts';

test('Razorpay webhook signatures are verified over the raw body', () => {
  const secret = 'rzp_test_webhook_secret';
  const raw = Buffer.from('{"event":"payment.captured"}', 'utf8');
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifyRazorpayWebhookSignature(raw, signature, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(raw, '0'.repeat(signature.length), secret), false);
  assert.equal(verifyRazorpayWebhookSignature(Buffer.from('{"event":"other"}'), signature, secret), false);
});

test('Razorpay checkout signatures cover order id and payment id', () => {
  const secret = 'rzp_test_key_secret';
  const signature = createHmac('sha256', secret).update('order_1|pay_1').digest('hex');
  assert.equal(verifyRazorpayCheckoutSignature('order_1', 'pay_1', signature, secret), true);
  assert.equal(verifyRazorpayCheckoutSignature('order_2', 'pay_1', signature, secret), false);
});

test('production Stays Razorpay is offered only with keys plus webhook secret', () => {
  assert.equal(stayRazorpayReady({
    RAZORPAY_KEY_ID: 'rzp_live_x',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAY_WEBHOOK_SECRET: 'webhook-secret-16',
    NODE_ENV: 'production',
  }), true);
  assert.equal(stayRazorpayReady({
    RAZORPAY_KEY_ID: 'rzp_live_x',
    RAZORPAY_KEY_SECRET: 'secret',
    NODE_ENV: 'production',
  }), false);
  assert.equal(stayRazorpayReady({
    RAZORPAY_KEY_ID: 'rzp_test_example',
    RAZORPAY_KEY_SECRET: 'secret',
    NODE_ENV: 'production',
  }), true);
  assert.equal(stayPaymentSandboxEnabled({
    BOS_PAYMENT_SANDBOX: '1',
    BOS_PAYMENT_SANDBOX_SECRET: 'sandbox-secret-16',
    NODE_ENV: 'production',
  }), false);
});
