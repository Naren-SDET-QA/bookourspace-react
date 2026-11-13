export interface PaymentSettlementEnvironment {
  NODE_ENV?: string;
  BOS_ALLOW_SIMULATED_PAYMENT_SETTLEMENT?: string;
}

export function isSimulatedPaymentSettlementAllowed(
  environment: PaymentSettlementEnvironment = {}
): boolean {
  return (
    environment.NODE_ENV !== 'production' &&
    environment.BOS_ALLOW_SIMULATED_PAYMENT_SETTLEMENT === 'true'
  );
}
