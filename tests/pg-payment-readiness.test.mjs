import test from 'node:test';
import assert from 'node:assert/strict';
import { canOfferPgUpiPayment } from '../src/lib/pgPaymentReadiness.ts';

test('PG online UPI requires both merchant configuration and signed settlement verification', () => {
  assert.equal(canOfferPgUpiPayment(null), false);
  assert.equal(canOfferPgUpiPayment({ upi: false, settlementVerification: 'signed_provider_event' }), false);
  assert.equal(canOfferPgUpiPayment({ upi: true, settlementVerification: 'unavailable' }), false);
  assert.equal(canOfferPgUpiPayment({ upi: true, settlementVerification: 'signed_provider_event' }), true);
});
