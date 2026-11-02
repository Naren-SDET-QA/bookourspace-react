export type StayPaymentStatus =
  | 'pay_later'
  | 'pending_verification'
  | 'verified'
  | 'refunded'
  | 'failed';

export interface StayCancellationInput {
  totalAmount: number;
  checkInAt: string;
  now?: string;
  cancellationAllowed: boolean;
  cancellationCutoffMinutes: number;
  refundPercent: number;
  paymentStatus: StayPaymentStatus;
}

export interface StayCancellationResult {
  allowed: boolean;
  refundAmount: number;
  refundPercent: number;
  refundStatus: 'none' | 'initiated';
  reason?: string;
}

export function evaluateStayCancellation(input: StayCancellationInput): StayCancellationResult {
  const checkInMs = Date.parse(input.checkInAt);
  const nowMs = Date.parse(input.now || new Date().toISOString());
  const refundPercent = Math.min(100, Math.max(0, Math.round(input.refundPercent)));
  const totalAmount = Math.max(0, Number(input.totalAmount) || 0);

  if (!input.cancellationAllowed) {
    return {
      allowed: false,
      refundAmount: 0,
      refundPercent,
      refundStatus: 'none',
      reason: 'The provider does not allow cancellation for this stay.',
    };
  }

  if (!Number.isFinite(checkInMs) || !Number.isFinite(nowMs)) {
    return {
      allowed: false,
      refundAmount: 0,
      refundPercent,
      refundStatus: 'none',
      reason: 'The stay check-in time could not be validated.',
    };
  }

  const minutesUntilCheckIn = (checkInMs - nowMs) / 60000;
  if (minutesUntilCheckIn < Math.max(0, input.cancellationCutoffMinutes)) {
    return {
      allowed: false,
      refundAmount: 0,
      refundPercent,
      refundStatus: 'none',
      reason: 'The cancellation cutoff has passed for this stay.',
    };
  }

  if (input.paymentStatus !== 'verified') {
    return {
      allowed: true,
      refundAmount: 0,
      refundPercent,
      refundStatus: 'none',
      reason:
        input.paymentStatus === 'pay_later'
          ? 'No refund is due because payment was not collected online.'
          : 'Payment is not reconciled, so no refund is initiated yet.',
    };
  }

  return {
    allowed: true,
    refundAmount: Math.round((totalAmount * refundPercent) / 100),
    refundPercent,
    refundStatus: 'initiated',
  };
}
