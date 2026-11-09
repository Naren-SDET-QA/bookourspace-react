import React, { useEffect, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, FileText, MapPin, QrCode, RefreshCw, Star, X } from 'lucide-react';
import {
  cancelStayBooking,
  fetchMyStayBookings,
  fetchStayBookingQr,
  formatPaise,
  selfCheckInStayBooking,
  selfCheckOutStayBooking,
  verifyStayRazorpayPayment,
  type StayBookingRow,
} from '../../lib/stayCheckoutClient';
import { buildAuthHeaders } from '../../lib/supabaseClient';
import { loadRazorpayScript } from '../../utils/razorpayLoader';
import { StayReceiptModal } from './StayReceiptModal';

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function stayPhase(booking: StayBookingRow): { label: string; tone: string } {
  const today = todayIso();
  if (booking.status === 'cancelled') return { label: 'Cancelled', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' };
  if (booking.status === 'pending_approval') return { label: 'Awaiting host', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' };
  if (booking.status === 'approved') return { label: 'Approved — payment due', tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' };
  if (booking.status === 'rejected') return { label: 'Declined by host', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' };
  if (booking.status === 'expired') return { label: 'Request expired', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
  if (booking.status === 'released') return { label: 'Released', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' };
  if (booking.checkOut && today >= booking.checkOut) return { label: 'Completed', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
  if (booking.checkIn && today >= booking.checkIn && (!booking.checkOut || today < booking.checkOut)) {
    return { label: 'Staying now', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' };
  }
  if (booking.checkIn === today) return { label: 'Check-in today', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' };
  return { label: 'Upcoming', tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' };
}

function formatDate(value: string): string {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function canCancel(booking: StayBookingRow): boolean {
  if (!['confirmed', 'pending_approval', 'approved'].includes(booking.status)) return false;
  if (!booking.checkIn) return true;
  return todayIso() <= booking.checkIn;
}

export function StayTripsPanel({
  open,
  isAuthenticated,
  onClose,
  onSignIn,
}: {
  open: boolean;
  isAuthenticated: boolean;
  onClose: () => void;
  onSignIn?: () => void;
}) {
  const [bookings, setBookings] = useState<StayBookingRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qrTokens, setQrTokens] = useState<Record<string, string>>({});
  const [qrBusy, setQrBusy] = useState<string | null>(null);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const payRazorpay = async (booking: StayBookingRow) => {
    if (!booking.paymentIntentId || !booking.razorpayOrderId || !booking.razorpayKeyId) {
      setError('Razorpay Checkout is not ready for this booking. Ask the host to re-approve.');
      return;
    }
    setPayBusy(booking.bookingId);
    setError('');
    const loaded = await loadRazorpayScript();
    if (!loaded || typeof window === 'undefined' || !window.Razorpay) {
      setPayBusy(null);
      setError('Razorpay Checkout could not be loaded. Keep this page open until the provider confirms settlement.');
      return;
    }
    try {
      const rzp = new window.Razorpay({
        key: booking.razorpayKeyId,
        amount: booking.totalPaise,
        currency: 'INR',
        name: 'BookOurSpace',
        description: booking.propertyName || 'Stay booking',
        order_id: booking.razorpayOrderId,
        theme: { color: '#f97316' },
        handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature?: string }) => {
          const verified = await verifyStayRazorpayPayment({
            intentId: booking.paymentIntentId as string,
            razorpayOrderId: resp.razorpay_order_id,
            razorpayPaymentId: resp.razorpay_payment_id,
            razorpaySignature: String(resp.razorpay_signature || ''),
          });
          setPayBusy(null);
          if (verified.ok && (verified as { verified?: boolean }).verified) {
            setNotice('Payment verified. Your stay is confirmed.');
            setPayFor(null);
            await load();
          } else {
            setError((verified as { message?: string }).message || 'The server could not verify that Razorpay payment.');
          }
        },
      });
      rzp.on?.('payment.failed', () => {
        setPayBusy(null);
        setError('Razorpay reported a failed payment. Nothing was marked as paid.');
      });
      rzp.open();
    } catch {
      setPayBusy(null);
      setError('Razorpay Checkout could not be opened. The room stays held until the payment window expires.');
    }
  };

  const load = async () => {
    if (!isAuthenticated) {
      setBookings([]);
      return;
    }
    setLoading(true);
    setError('');
    const result = await fetchMyStayBookings();
    setLoading(false);
    if (result.ok) setBookings((result as { bookings: StayBookingRow[] }).bookings);
    else {
      setBookings([]);
      setError((result as { message?: string }).message || 'Your trips could not be loaded.');
    }
  };

  useEffect(() => {
    if (!open) return;
    setNotice('');
    setConfirming(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAuthenticated]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const runBookingAction = async (bookingId: string, action: 'check-in' | 'check-out') => {
    setActionBusy(`${bookingId}:${action}`);
    setNotice('');
    const result = action === 'check-in'
      ? await selfCheckInStayBooking(bookingId)
      : await selfCheckOutStayBooking(bookingId);
    setActionBusy(null);
    if (!result.ok) {
      setNotice((result as { message?: string }).message || 'The booking could not be updated.');
      return;
    }
    setNotice(action === 'check-in' ? 'You are checked in. Have a good stay.' : 'Checkout complete. You can review this stay now.');
    await load();
  };

  const submitReview = async (bookingId: string) => {
    setReviewBusy(true);
    setNotice('');
    try {
      const response = await fetch(`/api/stays/bookings/${encodeURIComponent(bookingId)}/review`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        setNotice(body?.message || 'The review could not be saved.');
        return;
      }
      setReviewFor(null);
      setReviewRating(5);
      setReviewComment('');
      setNotice('Thank you. Your review is published.');
      await load();
    } catch {
      setNotice('The review could not be saved. Check your connection.');
    } finally {
      setReviewBusy(false);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    setCancelling(bookingId);
    setConfirming(null);
    const result = await cancelStayBooking(bookingId);
    setCancelling(null);
    if (!result.ok) {
      setNotice((result as { message?: string }).message || 'The cancellation could not be completed.');
      return;
    }
    const details = result as { refundPaise: number; refundPolicy: string; note?: string };
    setNotice(`Booking cancelled. Refund due: ${formatPaise(details.refundPaise)}. ${details.note || 'Settlement must be confirmed by the payment provider.'}`);
    await load();
  };

  if (!open) return null;

  const showBookingQr = async (bookingId: string) => {
    if (qrFor === bookingId) { setQrFor(null); return; }
    setQrBusy(bookingId);
    setError('');
    const result = await fetchStayBookingQr(bookingId);
    setQrBusy(null);
    if (!result.ok) { setError((result as { message?: string }).message || 'The booking QR could not be loaded.'); return; }
    setQrTokens((current) => ({ ...current, [bookingId]: result.token }));
    setQrFor(bookingId);
  };

  return (
    <div className="fixed inset-0 z-[105] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="stay-trips-heading" className="flex h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[80vh] sm:rounded-2xl dark:bg-slate-950">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#ebebeb] px-4 dark:border-slate-800">
          <h2 id="stay-trips-heading" className="text-base font-semibold">My stays</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => void load()} aria-label="Refresh bookings" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={onClose} aria-label="Close my stays" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!isAuthenticated && (
            <div className="rounded-2xl border border-[#ebebeb] p-6 text-center dark:border-slate-800">
              <CalendarDays className="mx-auto h-8 w-8 text-[#717171]" aria-hidden="true" />
              <p className="mt-3 text-base font-semibold">Sign in to see your stays</p>
              <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Bookings are tied to your verified account. Nothing is shown for a signed-out visitor.</p>
              {onSignIn && (
                <button type="button" onClick={onSignIn} className="mt-4 min-h-[44px] rounded-xl bg-[#222222] px-5 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
                  Sign in
                </button>
              )}
            </div>
          )}

          {notice && (
            <p role="status" className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}

          {isAuthenticated && loading && <p className="text-sm text-[#717171]" aria-busy="true">Loading your bookings…</p>}

          {isAuthenticated && !loading && bookings?.length === 0 && (
            <div className="rounded-2xl border border-[#ebebeb] p-8 text-center dark:border-slate-800">
              <CalendarDays className="mx-auto h-8 w-8 text-[#717171]" aria-hidden="true" />
              <p className="mt-3 text-base font-semibold">No stay bookings yet</p>
              <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">When you reserve a stay it appears here with its dates, payment status and cancellation options.</p>
            </div>
          )}

          <ul className="space-y-3">
            {bookings?.map((booking) => {
              const phase = stayPhase(booking);
              const unpaid = booking.paymentStatus === 'pay_later' || booking.paymentStatus === 'pending_verification';
              return (
                <li key={booking.bookingId} data-testid="stay-booking-row" className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">{booking.propertyName}</p>
                      <p className="text-sm text-[#717171] dark:text-slate-400">{booking.roomType} · {booking.checkIn ? formatDate(booking.checkIn) : '—'} → {booking.checkOut ? formatDate(booking.checkOut) : '—'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${phase.tone}`}>{phase.label}</span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div><dt className="text-[#717171] dark:text-slate-400">Booking</dt><dd className="truncate font-mono">{booking.bookingId}</dd></div>
                    <div><dt className="text-[#717171] dark:text-slate-400">Total</dt><dd className="font-semibold">{formatPaise(booking.totalPaise)}</dd></div>
                    <div><dt className="text-[#717171] dark:text-slate-400">Payment</dt><dd className="capitalize">{(booking.paymentStatus || 'unknown').replace(/_/g, ' ')}</dd></div>
                    <div><dt className="text-[#717171] dark:text-slate-400">Method</dt><dd className="capitalize">{(booking.paymentMode || '—').replace(/_/g, ' ')}</dd></div>
                    {booking.checkInTime && <div><dt className="text-[#717171] dark:text-slate-400">Check-in from</dt><dd>{booking.checkInTime}</dd></div>}
                    {booking.checkOutTime && <div><dt className="text-[#717171] dark:text-slate-400">Checkout by</dt><dd>{booking.checkOutTime}</dd></div>}
                  </dl>

                  {booking.propertyAddress && booking.status === 'confirmed' && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-[#717171] dark:text-slate-400">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {booking.propertyAddress}
                    </p>
                  )}

                  {booking.status === 'pending_approval' && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Waiting for the host. No payment has been taken.
                      {booking.requestExpiresAt ? ` The request expires ${new Date(booking.requestExpiresAt).toLocaleString('en-IN')}.` : ''}
                    </p>
                  )}
                  {booking.status === 'approved' && booking.paymentDue && (
                    <div className="mt-2 rounded-xl border border-indigo-200 p-3 dark:border-indigo-900">
                      <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">Host approved — complete payment to confirm</p>
                      <button type="button" onClick={() => setPayFor(payFor === booking.bookingId ? null : booking.bookingId)} className="mt-1.5 min-h-[34px] rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white">
                        {payFor === booking.bookingId ? 'Hide payment' : 'Pay now'}
                      </button>
                      {payFor === booking.bookingId && booking.paymentMode === 'razorpay' && (
                        <div className="mt-2 space-y-2">
                          <button
                            type="button"
                            onClick={() => void payRazorpay(booking)}
                            disabled={payBusy === booking.bookingId}
                            className="flex min-h-[40px] w-full items-center justify-center rounded-lg bg-[#f97316] px-3 text-xs font-bold text-white disabled:opacity-60"
                          >
                            {payBusy === booking.bookingId ? 'Opening Razorpay…' : 'Pay with Razorpay Checkout'}
                          </button>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">Settlement is confirmed only after the server verifies Razorpay. A browser callback alone does not mark this paid.</p>
                        </div>
                      )}
                      {payFor === booking.bookingId && booking.paymentMode !== 'razorpay' && (booking.qrImageUrl || booking.upiUri) && (
                        <div className="mt-2 space-y-2">
                          <div className="flex justify-center">
                            <div className="rounded-lg bg-white p-2">
                              {booking.qrImageUrl ? (
                                <img src={booking.qrImageUrl} alt="Verified UPI QR" width={150} height={150} className="h-[150px] w-[150px] object-contain" />
                              ) : (
                                <QRCodeSVG value={booking.upiUri as string} size={150} level="M" includeMargin />
                              )}
                            </div>
                          </div>
                          {booking.upiUri && (
                            <a href={booking.upiUri} className="flex min-h-[40px] items-center justify-center rounded-lg border border-indigo-300 text-xs font-bold text-indigo-800 dark:border-indigo-800 dark:text-indigo-200">Open UPI app</a>
                          )}
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">Payment is confirmed only after the provider reports settlement. Refresh after paying.</p>
                        </div>
                      )}
                      {payFor === booking.bookingId && booking.paymentMode !== 'razorpay' && !booking.qrImageUrl && !booking.upiUri && (
                        <p className="mt-1 text-[10px] text-slate-500">This payment link is no longer open. The host may need to re-approve.</p>
                      )}
                    </div>
                  )}
                  {unpaid && booking.status === 'confirmed' && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {booking.paymentMode === 'pay_after_service'
                        ? `No online payment was taken. Pay ${formatPaise(booking.totalPaise)} at the property.`
                        : 'Payment is awaiting verified settlement from the provider.'}
                    </p>
                  )}

                  {(booking.status === 'confirmed' || booking.status === 'checked_in' || booking.status === 'completed') && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void showBookingQr(booking.bookingId)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#222222] px-3 text-xs font-semibold dark:border-white">
                        {qrBusy === booking.bookingId ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <QrCode className="h-3.5 w-3.5" aria-hidden="true" />} {qrFor === booking.bookingId ? 'Hide QR' : 'Booking QR'}
                      </button>
                      <button type="button" onClick={() => setReceiptFor(booking.bookingId)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#222222] px-3 text-xs font-semibold dark:border-white">
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Receipt / PDF
                      </button>
                    </div>
                  )}
                  {qrFor === booking.bookingId && qrTokens[booking.bookingId] && (
                    <div data-testid="booking-qr" className="mt-2 inline-flex flex-col items-center rounded-xl border border-[#ebebeb] bg-white p-3 dark:border-slate-800">
                      <div className="h-[168px] w-[168px]">
                        <QRCodeCanvas value={qrTokens[booking.bookingId]} size={168} level="M" includeMargin bgColor="#ffffff" fgColor="#111111" />
                      </div>
                      <p className="mt-1 font-mono text-[10px]">{booking.bookingId}</p>
                      <p className="text-[10px] text-[#717171]">Square booking QR · host scans to verify &amp; check in.</p>
                    </div>
                  )}
                  {booking.canReview && reviewFor !== booking.bookingId && (
                    <button
                      type="button"
                      onClick={() => { setReviewFor(booking.bookingId); setReviewRating(5); setReviewComment(''); }}
                      className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#222222] px-3 text-xs font-semibold dark:border-white"
                    >
                      <Star className="h-3.5 w-3.5" aria-hidden="true" /> Write a review
                    </button>
                  )}
                  {booking.reviewed && (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> You reviewed this stay
                    </p>
                  )}
                  {reviewFor === booking.bookingId && (
                    <div className="mt-2 rounded-xl border border-[#ebebeb] p-3 dark:border-slate-800">
                      <p className="text-xs font-semibold">Rate your stay</p>
                      <div className="mt-1.5 flex items-center gap-1" role="radiogroup" aria-label="Star rating">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={reviewRating === value}
                            aria-label={`${value} star${value === 1 ? '' : 's'}`}
                            onClick={() => setReviewRating(value)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f7f7f7] dark:hover:bg-slate-800"
                          >
                            <Star className={`h-4 w-4 ${value <= reviewRating ? 'fill-[#f97316] text-[#f97316]' : 'text-[#b0b0b0]'}`} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={reviewComment}
                        onChange={(event) => setReviewComment(event.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="What should future guests know? (10–2000 characters)"
                        aria-label="Review comment"
                        className="mt-2 w-full rounded-lg border border-[#b0b0b0] p-2 text-xs outline-none dark:border-slate-600 dark:bg-slate-900"
                      />
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => void submitReview(booking.bookingId)} disabled={reviewBusy || reviewComment.trim().length < 10} className="min-h-[36px] rounded-lg bg-[#f97316] px-3 text-xs font-semibold text-white disabled:opacity-50">
                          {reviewBusy ? 'Publishing…' : 'Publish review'}
                        </button>
                        <button type="button" onClick={() => setReviewFor(null)} className="min-h-[36px] rounded-lg border border-[#dddddd] px-3 text-xs font-semibold dark:border-slate-700">Cancel</button>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1 text-[11px] text-[#717171] dark:text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      {booking.cancellationPolicy ? `${booking.cancellationPolicy.replace(/_/g, ' ')} cancellation` : 'Cancellation policy shown at booking'}
                    </p>
                    {booking.canSelfCheckIn && booking.checkIn <= todayIso() && (
                      <button type="button" onClick={() => void runBookingAction(booking.bookingId, 'check-in')} disabled={actionBusy === `${booking.bookingId}:check-in`} className="min-h-[36px] rounded-lg border border-emerald-600 px-3 text-xs font-semibold text-emerald-700 disabled:opacity-60 dark:text-emerald-300">
                        {actionBusy === `${booking.bookingId}:check-in` ? 'Checking in…' : 'Self check-in'}
                      </button>
                    )}
                    {booking.canSelfCheckOut && (
                      <button type="button" onClick={() => void runBookingAction(booking.bookingId, 'check-out')} disabled={actionBusy === `${booking.bookingId}:check-out`} className="min-h-[36px] rounded-lg border border-emerald-600 px-3 text-xs font-semibold text-emerald-700 disabled:opacity-60 dark:text-emerald-300">
                        {actionBusy === `${booking.bookingId}:check-out` ? 'Checking out…' : 'Self check-out'}
                      </button>
                    )}
                    {canCancel(booking) && (
                      confirming === booking.bookingId ? (
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-medium">Cancel this booking?</span>
                          <button type="button" onClick={() => void cancelBooking(booking.bookingId)} disabled={cancelling === booking.bookingId} className="min-h-[36px] rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white disabled:opacity-60">
                            {cancelling === booking.bookingId ? 'Cancelling…' : 'Yes, cancel'}
                          </button>
                          <button type="button" onClick={() => setConfirming(null)} className="min-h-[36px] rounded-lg border border-[#dddddd] px-3 text-xs font-semibold dark:border-slate-700">Keep</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirming(booking.bookingId)} className="min-h-[36px] rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-600 dark:border-rose-900 dark:text-rose-300">
                          {['pending_approval', 'approved'].includes(booking.status) ? 'Cancel request' : 'Cancel booking'}
                        </button>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {receiptFor && <StayReceiptModal bookingId={receiptFor} onClose={() => setReceiptFor(null)} />}
    </div>
  );
}
