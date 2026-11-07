import React, { useState, useRef } from 'react';
import {
  ShieldCheck,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  Lock,
  Sparkles,
} from 'lucide-react';
import { createRazorpayOrderServer, verifyRazorpayPaymentServer } from '../lib/supabaseClient';
import { loadRazorpayScript } from '../utils/razorpayLoader';

export interface RazorpayPaymentResult {
  intentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  paymentVerificationToken?: string;
  amount: number;
  bookingId?: string;
  bookingSettlement?: boolean;
}

interface RazorpayPayNowButtonProps {
  /** Required: the server prices the order from this booking and rejects any other amount. */
  bookingId: string;
  amount: number;
  listingId?: string;
  listingTitle?: string;
  categoryId?: string;
  vertical?: string;
  dateIso?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  onVerificationStart?: () => Promise<boolean> | boolean;
  onPaymentSuccess: (result: RazorpayPaymentResult) => void;
  onPaymentFailure?: (error: string) => void;
  onModalDismissed?: (orderInfo: { intentId: string; razorpayOrderId: string }) => void;
  buttonText?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
}

export const RazorpayPayNowButton: React.FC<RazorpayPayNowButtonProps> = ({
  bookingId,
  amount,
  listingId,
  listingTitle,
  categoryId,
  vertical = 'hotel_stay',
  dateIso,
  customerName = 'BookOurSpace Customer',
  customerEmail = 'customer@bookourspace.in',
  customerPhone = '9848012345',
  onVerificationStart,
  onPaymentSuccess,
  onPaymentFailure,
  onModalDismissed,
  buttonText,
  className,
  disabled = false,
  size = 'md',
  showBadge = true,
}) => {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'ordering' | 'checkout' | 'confirming' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [serverAmount, setServerAmount] = useState<number | null>(null);
  const [pendingOrder, setPendingOrder] = useState<{
    intentId: string;
    razorpayOrderId: string;
    keyId: string;
    amountInPaise: number;
  } | null>(null);

  const keyId =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.NEXT_PUBLIC_RAZORPAY_KEY_ID || import.meta.env?.VITE_RAZORPAY_KEY_ID)) ||
    (typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env?.RAZORPAY_KEY_ID)) ||
    'rzp_test_TIVzop8X6CjVX9';

  const isSubmittingRef = useRef(false);

  const resetToIdle = () => {
    isSubmittingRef.current = false;
    setStatus('idle');
    setStatusMessage('');
    setShowCheckoutModal(false);
  };

  const handlePayNowClick = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Prevent double clicks synchronously and check current busy state
    if (disabled || isSubmittingRef.current || status === 'verifying' || status === 'ordering' || status === 'confirming') {
      return;
    }

    isSubmittingRef.current = true;
    setErrorMessage(null);

    // 1. Booking Verification Step - Instantaneous Feedback
    setStatus('verifying');
    setStatusMessage('Verifying booking availability...');

    try {
      if (onVerificationStart) {
        const canProceed = await onVerificationStart();
        if (canProceed === false) {
          resetToIdle();
          return;
        }
      }

      // Brief pause for smooth verification feedback
      await new Promise((r) => setTimeout(r, 200));

      // 2. Razorpay Order Creation via Server
      setStatus('ordering');
      setStatusMessage('Creating secure Razorpay order...');

      // Ensure vertical defaults to hotel_stay or movies if not specified to comply with backend policy
      let resolvedVertical = vertical;
      if (!resolvedVertical || (!['hotel_stay', 'movies'].includes(resolvedVertical))) {
        const titleLower = (listingTitle || '').toLowerCase();
        if (titleLower.includes('movie') || titleLower.includes('cinema')) {
          resolvedVertical = 'movies';
        } else {
          resolvedVertical = 'hotel_stay';
        }
      }

      const orderRes = await createRazorpayOrderServer({
        bookingId,
        amount,
        listingId,
        listingTitle,
        categoryId,
        vertical: resolvedVertical,
        dateIso: dateIso || new Date().toISOString().split('T')[0],
      });

      if (!orderRes.ok || !orderRes.intentId || !orderRes.razorpayOrderId) {
        throw new Error(orderRes.message || orderRes.error || 'Failed to create Razorpay order.');
      }

      const activeKey = orderRes.keyId || keyId;
      const orderPayload = {
        intentId: orderRes.intentId,
        razorpayOrderId: orderRes.razorpayOrderId,
        keyId: activeKey,
        amountInPaise: orderRes.amountInPaise || Math.round(amount * 100),
      };
      setPendingOrder(orderPayload);
      setServerAmount(typeof orderRes.amount === 'number' ? orderRes.amount : null);

      // 3. Open On-Screen Razorpay Checkout Modal
      setStatus('checkout');
      setStatusMessage('Razorpay order ready. Complete payment:');
      setShowCheckoutModal(true);
      isSubmittingRef.current = false;

      // 4. Also try loading standard Razorpay popup SDK if available
      void loadRazorpayScript().then((loaded) => {
        if (loaded && typeof window !== 'undefined' && window.Razorpay) {
          try {
            const rzp = new window.Razorpay({
              key: activeKey,
              amount: orderPayload.amountInPaise,
              currency: 'INR',
              name: 'BookOurSpace',
              description: listingTitle || 'Verified Booking Checkout',
              order_id: orderPayload.razorpayOrderId,
              prefill: {
                name: customerName,
                email: customerEmail,
                contact: customerPhone,
              },
              theme: {
                color: '#4A148C',
              },
              modal: {
                ondismiss: () => {
                  // User closed Razorpay popup; notify parent to start background polling if status remains pending
                  if (onModalDismissed) {
                    onModalDismissed({
                      intentId: orderPayload.intentId,
                      razorpayOrderId: orderPayload.razorpayOrderId,
                    });
                  }
                },
              },
              handler: async (resp: {
                razorpay_payment_id: string;
                razorpay_order_id: string;
                razorpay_signature?: string;
              }) => {
                await verifyAndComplete(
                  orderPayload.intentId,
                  resp.razorpay_order_id,
                  resp.razorpay_payment_id,
                  resp.razorpay_signature
                );
              },
            });

            rzp.on('payment.failed', (failResp: any) => {
              console.error('Razorpay popup payment failed:', failResp);
            });

            rzp.open();
          } catch (popupErr: any) {
            console.warn('Razorpay popup open prevented in iframe sandbox:', popupErr);
          }
        }
      });
    } catch (err: any) {
      console.error('Razorpay flow initiation error:', err);
      const errMsg = err?.message || 'Failed to initiate Razorpay checkout.';
      isSubmittingRef.current = false;
      setErrorMessage(errMsg);
      setStatus('error');
      if (onPaymentFailure) onPaymentFailure(errMsg);
    }
  };

  const verifyAndComplete = async (
    intentId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature?: string
  ) => {
    setStatus('confirming');
    setIsConfirming(true);
    setStatusMessage('Verifying payment on BookOurSpace server...');

    try {
      const verifyRes = await verifyRazorpayPaymentServer({
        intentId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });

      if (verifyRes.ok && verifyRes.verified) {
        setStatus('success');
        setIsConfirming(false);
        setStatusMessage('Payment verified successfully!');
        setShowCheckoutModal(false);
        isSubmittingRef.current = false;
        const settlement = verifyRes as typeof verifyRes & {
          bookingId?: string;
          bookingSettlement?: boolean;
        };
        onPaymentSuccess({
          intentId,
          razorpayOrderId,
          razorpayPaymentId,
          paymentVerificationToken: verifyRes.paymentVerificationToken,
          // The server's price, never the client's expectation.
          amount: serverAmount ?? amount,
          bookingId: settlement.bookingId || bookingId,
          bookingSettlement: settlement.bookingSettlement === true,
        });
      } else {
        throw new Error(verifyRes.message || 'Server-side payment verification failed.');
      }
    } catch (verErr: any) {
      const msg = verErr?.message || 'Payment verification failed.';
      setIsConfirming(false);
      isSubmittingRef.current = false;
      setErrorMessage(msg);
      setStatus('error');
      if (onPaymentFailure) onPaymentFailure(msg);
    }
  };

  const sizeClasses = {
    sm: 'px-3.5 py-2 text-xs font-bold',
    md: 'px-4 py-3 text-xs sm:text-sm font-black',
    lg: 'px-6 py-3.5 text-sm sm:text-base font-black',
  }[size];

  const isBusy = status === 'verifying' || status === 'ordering' || status === 'confirming';

  const defaultBtnClasses =
    className ||
    `w-full rounded-2xl bg-gradient-to-r from-[#4A148C] to-indigo-700 hover:from-purple-900 hover:to-indigo-800 text-white shadow-lg shadow-purple-950/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer ${sizeClasses}`;

  return (
    <div className="w-full flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled || isBusy}
        aria-busy={isBusy}
        aria-live="polite"
        data-testid="razorpay-pay-now-btn"
        onClick={handlePayNowClick}
        className={`${defaultBtnClasses} ${
          isBusy
            ? 'pointer-events-none select-none cursor-wait opacity-85 ring-2 ring-amber-400/60 shadow-inner brightness-95'
            : disabled
            ? 'opacity-50 cursor-not-allowed pointer-events-none'
            : ''
        }`}
      >
        {isBusy ? (
          <div className="flex items-center justify-center gap-2.5 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
            <span className="font-bold tracking-tight text-amber-100">{statusMessage || 'Processing Payment...'}</span>
          </div>
        ) : status === 'success' ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Payment Verified</span>
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 text-amber-300 shrink-0" />
            <span>{buttonText || `Pay Now ₹${amount.toLocaleString('en-IN')}`}</span>
          </>
        )}
      </button>

      {/* Trust & Credentials Badge */}
      {showBadge && (
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-1">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Razorpay Verified Gateway</span>
          </span>
          <span className="font-mono text-[9px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
            {keyId.slice(0, 12)}•••
          </span>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Fullscreen Dedicated Razorpay Checkout Modal Overlay */}
      {showCheckoutModal && pendingOrder && (
        <div 
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={resetToIdle}
        >
          <div 
            data-testid="razorpay-checkout-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-purple-200 dark:border-purple-800 overflow-hidden flex flex-col"
          >
            {/* Modal Header with Razorpay Branding */}
            <div className="bg-gradient-to-r from-[#4A148C] to-indigo-800 p-4 sm:p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
                  <CreditCard className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base flex items-center gap-1.5">
                    <span>Razorpay Secure Checkout</span>
                    <span className="text-[9px] bg-emerald-400/20 text-emerald-300 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border border-emerald-400/30">
                      Live Test
                    </span>
                  </h3>
                  <p className="text-[11px] text-purple-200 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-300" />
                    <span>256-Bit SSL · Server HMAC Verified</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetToIdle}
                className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
                aria-label="Close checkout"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 sm:p-6 space-y-4">
              {/* Order Details Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Booking / Service:</span>
                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                    {listingTitle || 'Verified Booking'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Razorpay Order ID:</span>
                  <span className="font-mono text-purple-700 dark:text-purple-300 font-bold text-[11px]">
                    {pendingOrder.razorpayOrderId}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Customer:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {customerName} ({customerPhone})
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="font-black text-sm text-slate-900 dark:text-white">Total Amount:</span>
                  <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">
                    ₹{amount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Status or Progress */}
              {isConfirming ? (
                <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-700 dark:text-purple-300 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-purple-900 dark:text-purple-200">Verifying Payment...</p>
                    <p className="text-purple-700 dark:text-purple-400 text-[11px]">
                      Validating server HMAC signature & issuing booking token.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-200">
                    <p className="font-bold">Complete the payment in Razorpay Checkout.</p>
                    <p className="mt-1">
                      This page never confirms a payment on its own. The booking is only marked paid
                      after the server verifies Razorpay&apos;s payment signature or a signed provider webhook.
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1 pt-1">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Instant confirmation & tax invoice</span>
                    </span>
                    <button
                      type="button"
                      onClick={resetToIdle}
                      className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 underline cursor-pointer"
                    >
                      Cancel & Return
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
