import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRazorpayPaymentSignature,
  isValidRazorpayPaymentSignature,
  isCapturedRazorpayPayment,
} from './razorpaySecurity';

test('validates a Razorpay checkout signature with timing-safe comparison', () => {
  const signature = createRazorpayPaymentSignature('order_test_123', 'pay_test_456', 'test-secret');

  assert.equal(
    isValidRazorpayPaymentSignature('order_test_123', 'pay_test_456', signature, 'test-secret'),
    true
  );
  assert.equal(
    isValidRazorpayPaymentSignature('order_test_123', 'pay_test_456', signature, 'wrong-secret'),
    false
  );
  assert.equal(
    isValidRazorpayPaymentSignature('order_test_123', 'pay_other', signature, 'test-secret'),
    false
  );
});

test('Razorpay verification requires captured funds for the exact order and amount', () => {
  const expected = { paymentId: 'pay_test_456', orderId: 'order_test_123', amountInPaise: 50000 };
  const payment = { id: expected.paymentId, order_id: expected.orderId, amount: 50000, currency: 'INR', status: 'captured' };
  assert.equal(isCapturedRazorpayPayment(payment, expected), true);
  assert.equal(isCapturedRazorpayPayment({ ...payment, status: 'authorized' }, expected), false);
  assert.equal(isCapturedRazorpayPayment({ ...payment, status: 'failed' }, expected), false);
  assert.equal(isCapturedRazorpayPayment({ ...payment, amount: 1 }, expected), false);
  assert.equal(isCapturedRazorpayPayment({ ...payment, currency: 'USD' }, expected), false);
  assert.equal(isCapturedRazorpayPayment({ ...payment, order_id: 'order_another' }, expected), false);
  assert.equal(isCapturedRazorpayPayment({ ...payment, id: 'pay_another' }, expected), false);
});
