import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  createPgPaymentIntent,
  fetchPgCapabilities,
  fetchPgPaymentState,
  newIdempotencyKey,
  pgErrorMessage,
  type PgPaymentCapabilities,
  type PgPaymentState,
} from '../lib/pgBookingClient';
import { canOfferPgUpiPayment } from '../lib/pgPaymentReadiness';

function inr(paise: number): string {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * The four money states a customer can be in, stated plainly.
 * `unpaid` (pay at property), `pending` (the provider has not confirmed the
 * money yet), `verified` (the provider reconciled the payment) and `failed`
 * (the provider rejected it or the attempt expired).
 */
export function pgMoneyLabel(state: { paymentStatus?: string | null; paymentMode?: string | null } | null | undefined): { label: string; tone: string } {
  const status = state?.paymentStatus || 'pay_later';
  if (status === 'verified') return { label: 'Payment verified', tone: 'emerald' };
  if (status === 'refunded') return { label: 'Refunded', tone: 'sky' };
  if (status === 'pending_verification') return { label: 'Payment pending confirmation', tone: 'amber' };
  if (status === 'failed') return { label: 'Payment failed — not collected', tone: 'rose' };
  if (state?.paymentMode === 'pay_after_service') return { label: 'Pay at property', tone: 'slate' };
  return { label: 'Unpaid — pay at property', tone: 'slate' };
}

const TONE_CLASS: Record<string, string> = {
  emerald: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
  amber: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
  rose: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100',
  sky: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100',
  slate: 'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
};

export function PgMoneyBadge({ state }: { state: { paymentStatus?: string | null; paymentMode?: string | null } | null | undefined }) {
  const { label, tone } = pgMoneyLabel(state);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE_CLASS[tone] || TONE_CLASS.slate}`}>
      {tone === 'emerald' && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
      {tone === 'amber' && <Clock3 className="h-3 w-3" aria-hidden="true" />}
      {tone === 'rose' && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
}

interface PgPaymentSectionProps {
  bookingId: string;
  totalDuePaise: number;
  onChanged?: () => void;
  compact?: boolean;
}

/**
 * The money half of a PG reservation.
 *
 * It never claims that a payment succeeded on the strength of anything the
 * browser did. A scan, a screenshot or a client callback cannot mark a
 * reservation as paid: only the provider's signed reconciliation can, and
 * this component simply reflects whatever the server reports.
 */
export function PgPaymentSection({ bookingId, totalDuePaise, onChanged, compact }: PgPaymentSectionProps) {
  const [capabilities, setCapabilities] = useState<PgPaymentCapabilities | null>(null);
  const [state, setState] = useState<PgPaymentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);

  const load = useCallback(async () => {
    setError('');
    try {
      const next = await fetchPgPaymentState(bookingId);
      setState(next);
    } catch (cause) {
      setError(pgErrorMessage(cause));
    }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetchPgCapabilities().then(setCapabilities).catch(() => setCapabilities(null));
  }, []);

  const upiUri = state?.upiUri && state.paymentStatus === 'pending_verification' ? state.upiUri : null;
  // Online UPI is only offered when the server can actually reconcile the
  // payment. A configured merchant VPA alone is not enough.
  const canOpenOnline = canOfferPgUpiPayment(capabilities) && state?.paymentStatus !== 'verified' && state?.paymentStatus !== 'refunded';
  const canChoosePayAtProperty = state?.paymentStatus === 'pay_later' && state?.paymentMode !== 'pay_after_service';

  async function openUpi() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await createPgPaymentIntent(bookingId, 'upi', key);
      setNotice(`UPI request created for ${inr(result.amountPaise)}. Complete the payment in your UPI app, then refresh this panel.`);
      setKey(newIdempotencyKey());
      await load();
      onChanged?.();
    } catch (cause) {
      setError(pgErrorMessage(cause));
    } finally { setBusy(false); }
  }

  async function choosePayAtProperty() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await createPgPaymentIntent(bookingId, 'pay_after_service', key);
      setNotice(`Pay ${inr(result.amountPaise)} directly to the owner on the move-in day. BookOurSpace does not collect or verify this payment.`);
      setKey(newIdempotencyKey());
      await load();
      onChanged?.();
    } catch (cause) {
      setError(pgErrorMessage(cause));
    } finally { setBusy(false); }
  }

  const breakdown = useMemo(() => {
    if (!state) return null;
    return { rent: state.rentPaise, deposit: state.depositPaise, total: state.totalPaise || totalDuePaise };
  }, [state, totalDuePaise]);

  return (
    <div className="space-y-3" aria-label="Payment for this reservation">
      <div className="flex flex-wrap items-center gap-2">
        <PgMoneyBadge state={state} />
        {state?.paymentStatus === 'verified' && state.providerPaymentId && (
          <span className="text-[11px] text-slate-500">Provider reference {state.providerPaymentId}</span>
        )}
        {state?.paymentStatus === 'refunded' && Number(state.refundPaise || 0) > 0 && (
          <span className="text-[11px] text-slate-500">Refunded {inr(Number(state.refundPaise))}</span>
        )}
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">
          <RefreshCw className="h-3 w-3" aria-hidden="true" /> Refresh status
        </button>
      </div>

      {breakdown && (
        <dl className="grid gap-1 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
          <div className="flex justify-between"><dt className="text-slate-500">Rent (lease term)</dt><dd className="font-semibold">{inr(breakdown.rent)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Security deposit</dt><dd className="font-semibold">{inr(breakdown.deposit)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-sm dark:border-slate-700"><dt className="font-bold">Total</dt><dd className="font-black">{inr(breakdown.total)}</dd></div>
        </dl>
      )}

      {state?.paymentStatus === 'pending_verification' && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Waiting for the payment provider.</strong> This reservation is not marked paid until the provider reconciles the payment on the server. A scan or a screenshot is not proof of payment.
        </p>
      )}

      {capabilities?.upi && capabilities.settlementVerification !== 'signed_provider_event' && state?.paymentStatus === 'pay_later' && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Online UPI is unavailable until trusted server-side payment verification is configured. This reservation remains unpaid; you can pay the owner at the property.
        </p>
      )}

      {upiUri && (
        <div className="rounded-2xl border border-teal-200 p-4 text-center dark:border-teal-900">
          <p className="text-sm font-bold">Scan to pay {inr(state?.totalPaise || totalDuePaise)}</p>
          <p className="mt-1 text-[11px] text-slate-500">Pay to {capabilities?.merchantVpa || 'the BookOurSpace merchant UPI id'}.</p>
          <div className="mt-3 inline-block rounded-2xl bg-white p-3">
            <QRCodeSVG value={upiUri} size={168} aria-label="UPI payment QR code" />
          </div>
          <a href={upiUri} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800">
            <Smartphone className="h-4 w-4" aria-hidden="true" /> Open UPI app
          </a>
        </div>
      )}

      {state?.paymentStatus === 'verified' && (
        <p className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span><strong>Payment verified by the provider.</strong> The money was reconciled server-side against the amount PostgreSQL computed.</span>
        </p>
      )}

      {!compact && (canOpenOnline || canChoosePayAtProperty) && (
        <div className="flex flex-wrap gap-2">
          {canOpenOnline && (
            <button type="button" disabled={busy} onClick={() => void openUpi()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Wallet className="h-3.5 w-3.5" aria-hidden="true" />}
              Pay online with UPI
            </button>
          )}
          {canChoosePayAtProperty && (
            <button type="button" disabled={busy} onClick={() => void choosePayAtProperty()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 disabled:opacity-50">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Pay at the property
            </button>
          )}
        </div>
      )}

      {notice && <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-[11px] leading-5 text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-[11px] leading-5 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">{error}</p>}
    </div>
  );
}
