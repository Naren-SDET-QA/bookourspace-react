import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, Navigation, RefreshCw, Star, X, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  fetchServiceBookings,
  reviewServiceBooking,
  serviceBookingErrorMessage,
  transitionServiceBooking,
  type ServiceBooking,
} from '../lib/servicesBookingClient';
import { DeliveryTrackingPanel } from './tracking/DeliveryTrackingPanel';
import {
  createServicePaymentIntent,
  fetchServicePaymentStatus,
  newServiceIdempotencyKey,
  serviceCommerceErrorMessage,
  type ServicePaymentIntent,
} from '../lib/serviceCommerceClient';

/**
 * Customer "My service bookings": live status, cancellation, payment and review.
 * Every state shown here comes from the server.
 */
export function ServiceCustomerBookings({ onClose }: { onClose: () => void }) {
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [intent, setIntent] = useState<ServicePaymentIntent | null>(null);
  const [intentStatus, setIntentStatus] = useState('');
  const [reviewDraft, setReviewDraft] = useState<Record<string, { rating: number; comment: string }>>({});
  const [trackingBookingId, setTrackingBookingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchServiceBookings();
      setBookings(result.bookings);
    } catch (caught) {
      setError(serviceBookingErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!intent?.intentId) return;
    let active = true;
    const poll = async () => {
      try {
        const status = await fetchServicePaymentStatus(intent.intentId);
        if (!active) return;
        setIntentStatus(status.status);
        if (status.status === 'verified') {
          setNotice('Payment verified by the provider. This booking is paid.');
          await load();
        }
      } catch { /* server stays authoritative */ }
    };
    const timer = window.setInterval(() => void poll(), 4000);
    void poll();
    return () => { active = false; window.clearInterval(timer); };
  }, [intent?.intentId, load]);

  const cancel = async (booking: ServiceBooking) => {
    setBusyId(booking.id);
    setError('');
    try {
      const result = await transitionServiceBooking(booking.id, 'cancel', { reason: 'Cancelled by customer' });
      setBookings((current) => current.map((row) => (row.id === booking.id ? result.booking : row)));
      setNotice(`Booking ${result.booking.bookingRef} cancelled. Any verified online payment is refunded by an administrator.`);
    } catch (caught) {
      setError(serviceBookingErrorMessage(caught));
    } finally {
      setBusyId('');
    }
  };

  const pay = async (booking: ServiceBooking) => {
    setBusyId(booking.id);
    setError('');
    try {
      const payment = await createServicePaymentIntent(booking.id, newServiceIdempotencyKey());
      setIntent(payment);
      setIntentStatus(payment.status);
    } catch (caught) {
      setError(serviceCommerceErrorMessage(caught));
    } finally {
      setBusyId('');
    }
  };

  const review = async (booking: ServiceBooking) => {
    const draft = reviewDraft[booking.id];
    if (!draft) return;
    setBusyId(booking.id);
    setError('');
    try {
      await reviewServiceBooking(booking.id, draft.rating, draft.comment);
      setNotice(`Thanks — your ${draft.rating}★ review for ${booking.bookingRef} was saved.`);
    } catch (caught) {
      setError(serviceBookingErrorMessage(caught));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="fixed inset-0 z-[74] overflow-y-auto bg-slate-50 dark:bg-slate-950" role="dialog" aria-modal="true" aria-labelledby="my-service-bookings-title">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm font-semibold dark:border-slate-700">
            <X className="h-4 w-4" aria-hidden="true" /> Close
          </button>
          <h1 id="my-service-bookings-title" className="text-lg font-black">My service bookings</h1>
          <button type="button" onClick={() => void load()} className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-bold dark:border-slate-700">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {error && <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">{error}</p>}
        {notice && <p role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{notice}</p>}

        {intent && intentStatus !== 'verified' && (
          <section className="rounded-2xl border border-violet-200 bg-white p-4 text-center dark:border-violet-900 dark:bg-slate-900">
            <p className="text-sm font-bold">Scan to pay ₹{intent.amount.toLocaleString('en-IN')}</p>
            <div className="mt-3 inline-block rounded-2xl bg-white p-3">
              <QRCodeSVG value={intent.upiUri} size={156} aria-label="UPI payment QR code" />
            </div>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Status: {intentStatus || intent.status}. Paid only after the provider confirms settlement.
            </p>
          </section>
        )}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your bookings…</p>
        ) : bookings.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">No service bookings yet.</p>
        ) : (
          bookings.map((booking) => (
            <article key={booking.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-black">{booking.listingTitle}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <CalendarClock className="h-3 w-3" aria-hidden="true" /> {booking.bookingRef} · {booking.scheduledDate} · {booking.timeSlot}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-900 dark:bg-violet-950 dark:text-violet-200">{booking.status.replace('_', ' ')}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${booking.paymentStatus === 'settled' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : booking.paymentStatus === 'refunded' ? 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {booking.paymentStatus === 'declared' ? 'payment under review' : booking.paymentStatus}
                  </span>
                </div>
              </div>

              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{booking.serviceAddress}</p>
              <p className="mt-1 text-xs font-semibold">₹{booking.amount.toLocaleString('en-IN')} · {booking.amountBasis}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {['accepted', 'in_progress'].includes(booking.status) && (
                  <button type="button" onClick={() => setTrackingBookingId(booking.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-700 px-4 text-xs font-bold text-white">
                    <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> Track live
                  </button>
                )}
                {['requested', 'accepted'].includes(booking.status) && (
                  <button type="button" disabled={busyId === booking.id} onClick={() => void cancel(booking)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-300 px-4 text-xs font-bold text-rose-700 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300">
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Cancel booking
                  </button>
                )}
                {['requested', 'accepted'].includes(booking.status) && booking.paymentStatus === 'due' && (
                  <button type="button" disabled={busyId === booking.id} onClick={() => void pay(booking)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-700 px-4 text-xs font-bold text-white disabled:opacity-60">
                    Pay now by UPI
                  </button>
                )}
              </div>

              {booking.status === 'completed' && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200"><Star className="h-3.5 w-3.5" aria-hidden="true" /> Rate this service</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Rating"
                      value={reviewDraft[booking.id]?.rating || 5}
                      onChange={(event) => setReviewDraft((current) => ({ ...current, [booking.id]: { rating: Number(event.target.value), comment: current[booking.id]?.comment || '' } }))}
                      className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-900"
                    >
                      {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} ★</option>)}
                    </select>
                    <input
                      aria-label="Review comment"
                      value={reviewDraft[booking.id]?.comment || ''}
                      onChange={(event) => setReviewDraft((current) => ({ ...current, [booking.id]: { rating: current[booking.id]?.rating || 5, comment: event.target.value } }))}
                      placeholder="What went well?"
                      className="min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button type="button" disabled={busyId === booking.id} onClick={() => void review(booking)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-700 px-4 text-xs font-bold text-white disabled:opacity-60">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Submit review
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </main>
      {trackingBookingId && <DeliveryTrackingPanel bookingId={trackingBookingId} onClose={() => setTrackingBookingId('')} />}
    </div>
  );
}