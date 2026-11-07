import type { StayPaymentCapabilities } from './stayCheckoutClient';

export type StayPaymentState = 'unavailable' | 'pending' | 'processing' | 'failed' | 'verified';

const VERIFIED_SETTLEMENT_METHODS = new Set<StayPaymentCapabilities['settlementVerification']>([
  'signed_sandbox_psp',
  'signed_sandbox_or_razorpay',
  'razorpay_webhook',
  'razorpay_checkout_fetch',
]);

export function hasAuthoritativeOnlineSettlement(
  capabilities: StayPaymentCapabilities | null | undefined,
): boolean {
  return Boolean(
    capabilities?.ok === true &&
    capabilities.database === true &&
    capabilities.settlementVerification &&
    VERIFIED_SETTLEMENT_METHODS.has(capabilities.settlementVerification),
  );
}

export function isStayOnlineMethodAvailable(
  capabilities: StayPaymentCapabilities | null | undefined,
  method: 'upi' | 'razorpay',
): boolean {
  return hasAuthoritativeOnlineSettlement(capabilities) && capabilities?.[method] === true;
}

export function staySettlementMessage(
  capabilities: StayPaymentCapabilities | null | undefined,
): string {
  if (!hasAuthoritativeOnlineSettlement(capabilities)) {
    return 'Online payment is unavailable right now. Pay at Hotel remains available.';
  }
  if (capabilities?.settlementVerification === 'razorpay_checkout_fetch') {
    return capabilities.razorpayTestMode
      ? 'Razorpay Test Mode is available. The booking remains pending until the server verifies captured payment.'
      : 'Razorpay payment verification is available. The booking remains pending until the server confirms captured payment.';
  }
  if (capabilities?.settlementVerification === 'razorpay_webhook') {
    return 'Razorpay settlement is verified by the server. The booking remains pending until provider capture is confirmed.';
  }
  if (capabilities?.settlementVerification === 'signed_sandbox_or_razorpay') {
    return 'Razorpay with sandbox settlement verification is available. Payment remains pending until server confirmation.';
  }
  return 'Sandbox settlement verification is available. Payment remains pending until the server confirms settlement.';
}

export function stayPaymentStatusPresentation(
  status: string | null | undefined,
  options: { onlineAvailable: boolean; verificationInProgress?: boolean },
): { state: StayPaymentState; label: string; message: string } {
  if (!options.onlineAvailable) {
    return { state: 'unavailable', label: 'Unavailable', message: 'Online payment is unavailable. Pay at Hotel remains available.' };
  }
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'verified') {
    return { state: 'verified', label: 'Payment verified', message: 'The server confirmed settlement.' };
  }
  if (options.verificationInProgress || normalized === 'processing') {
    return { state: 'processing', label: 'Verifying payment', message: 'The server is checking provider settlement. The booking remains unpaid until verification completes.' };
  }
  if (normalized === 'failed' || normalized === 'expired' || normalized === 'refunded') {
    const message = normalized === 'expired'
      ? 'The payment window expired before settlement. The booking was not marked paid.'
      : normalized === 'refunded'
        ? 'The payment was refunded. The booking is not considered paid.'
        : 'The provider reported payment failure. The booking was not marked paid.';
    return { state: 'failed', label: normalized === 'expired' ? 'Expired' : normalized === 'refunded' ? 'Refunded' : 'Payment failed', message };
  }
  return { state: 'pending', label: 'Payment pending', message: 'Waiting for authoritative settlement confirmation. Do not pay twice.' };
}
