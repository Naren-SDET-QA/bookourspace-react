import type { PgPaymentCapabilities } from './pgBookingClient';

/**
 * A configured merchant VPA is not enough to offer online UPI. The app must
 * have a server-side, signed settlement path so an order can be reconciled.
 */
export function canOfferPgUpiPayment(
  capabilities: Pick<PgPaymentCapabilities, 'upi' | 'settlementVerification'> | null | undefined,
): boolean {
  return capabilities?.upi === true && capabilities.settlementVerification === 'signed_provider_event';
}
