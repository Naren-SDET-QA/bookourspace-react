import assert from 'node:assert/strict';
import test from 'node:test';
import { isSimulatedPaymentSettlementAllowed } from './paymentSecurity';

test('does not expose simulated payment settlement in production', () => {
  assert.equal(
    isSimulatedPaymentSettlementAllowed({
      NODE_ENV: 'production',
      BOS_ALLOW_SIMULATED_PAYMENT_SETTLEMENT: 'true',
    }),
    false
  );
});

test('requires an explicit non-production flag for simulated settlement', () => {
  assert.equal(
    isSimulatedPaymentSettlementAllowed({
      NODE_ENV: 'development',
      BOS_ALLOW_SIMULATED_PAYMENT_SETTLEMENT: 'false',
    }),
    false
  );
  assert.equal(
    isSimulatedPaymentSettlementAllowed({
      NODE_ENV: 'test',
      BOS_ALLOW_SIMULATED_PAYMENT_SETTLEMENT: 'true',
    }),
    true
  );
});
