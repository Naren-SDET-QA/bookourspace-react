import crypto from 'node:crypto';

export function isCapturedRazorpayPayment(
  payment: { id: string; order_id?: string; amount: number; currency: string; status: string },
  expected: { paymentId: string; orderId: string; amountInPaise: number },
): boolean {
  // Authorization alone does not prove that the merchant captured the funds.
  return payment.id === expected.paymentId &&
    payment.order_id === expected.orderId &&
    payment.amount === expected.amountInPaise &&
    payment.currency === 'INR' && payment.status === 'captured';
}

export const createRazorpayPaymentSignature = (
  orderId: string,
  paymentId: string,
  secret: string
): string =>
  crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

export const isValidRazorpayPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean => {
  const expected = createRazorpayPaymentSignature(orderId, paymentId, secret);
  if (!signature || signature.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
};
