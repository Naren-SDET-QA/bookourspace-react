import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, CalendarDays, CheckCircle2, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import type { StayProperty } from '../../lib/stayDiscoveryData';
import { fetchStayBookingReceipt, formatPaise, type StayQuote, type StayReceipt } from '../../lib/stayCheckoutClient';
import { StayCheckoutPanel } from '../StayCheckoutPanel';
import { StayReceiptModal } from './StayReceiptModal';

function formatDate(iso: string): string {
  if (!iso) return 'Add date';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/**
 * Airbnb-style "Confirm and pay" page. The actual reservation still goes
 * through StayCheckoutPanel's server-authoritative checkout calls.
 */
export function StayCheckoutPage({
  property,
  checkIn,
  checkOut,
  guests,
  isAuthenticated,
  requestMode,
  cancellationPolicy,
  onClose,
  onSignIn,
  onBooked,
  onRequested,
  onViewTrips,
}: {
  property: StayProperty;
  checkIn: string;
  checkOut: string;
  guests: number;
  isAuthenticated: boolean;
  requestMode: boolean;
  cancellationPolicy?: string;
  onClose: () => void;
  onSignIn?: () => void;
  onBooked?: (bookingId: string, paymentState?: 'paid' | 'due') => void;
  onRequested?: (bookingId: string) => void;
  onViewTrips?: () => void;
}) {
  const [quote, setQuote] = useState<StayQuote | null>(null);
  const [result, setResult] = useState<{ kind: 'reserved' | 'requested' | 'paid'; bookingId: string } | null>(() => {
    try {
      const raw = window.sessionStorage.getItem('bos_stay_booking_result_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      // A sessionStorage value is not a settlement proof. Paid is only set
      // after the server receipt confirms payment.
      return parsed ? { ...parsed, kind: parsed.kind === 'paid' ? 'reserved' : parsed.kind } : null;
    } catch { return null; }
  });
  const [receipt, setReceipt] = useState<StayReceipt | null>(null);
  const [qrToken, setQrToken] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const nights = quote?.nights || 0;
  const authEmail = (() => { try { const raw = window.localStorage.getItem('bos_session_token_v1'); if (!raw) return ''; const payload = JSON.parse(atob(raw.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); return String(payload?.email || ''); } catch { return ''; } })();
  const image = property.images?.[0];

  useEffect(() => {
    if (!result?.bookingId) return;
    let cancelled = false;
    void fetchStayBookingReceipt(result.bookingId).then((response) => {
      if (!cancelled && response.ok) {
        setReceipt(response.receipt);
        setQrToken(response.qrToken);
        setResult((current) => current ? { ...current, kind: response.receipt.paid ? 'paid' : current.kind === 'paid' ? 'reserved' : current.kind } : current);
      }
    });
    return () => { cancelled = true; };
  }, [result?.bookingId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (result) {
    const paid = result.kind === 'paid';
    const requested = result.kind === 'requested';
    const method = receipt?.paymentMode === 'pay_after_service' ? 'Pay at hotel' : receipt?.paymentMode === 'razorpay' ? 'Razorpay Checkout' : receipt?.paymentMode === 'upi' ? 'UPI / QR' : requestMode ? 'Request to book' : 'Pending';
    return (
      <div className="fixed inset-0 z-[130] overflow-y-auto bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-label="Booking result">
        <style>{`
          @keyframes bos-success-pop { 0% { transform: scale(.55); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
          @keyframes bos-confetti { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(72px) rotate(220deg); opacity: 0; } }
        `}</style>
        <header className="border-b border-[#ebebeb] dark:border-slate-800">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
            <button type="button" onClick={onClose} aria-label="Close booking result" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dddddd] dark:border-slate-700"><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
            <h1 className="text-lg font-semibold">{property.localTestFixture ? 'Local test reservation created' : paid ? 'Payment successful' : requested ? 'Request sent' : 'Booking confirmed'}</h1>
            <img src="/assets/brand/bos-logo-lockup.webp" srcSet="/assets/brand/bos-logo-lockup-560-5771e9b215e6.webp 560w, /assets/brand/bos-logo-lockup-1120-bea9629c0067.webp 1120w" sizes="160px" width="1560" height="320" decoding="async" alt="BookOurSpace" className="ml-auto h-8 w-auto max-w-40 object-contain object-right" />
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50/60 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
            <span className="pointer-events-none absolute left-1/4 top-1 h-2 w-2 rounded-full bg-orange-400" style={{ animation: 'bos-confetti 1.2s ease-out forwards' }} />
            <span className="pointer-events-none absolute left-1/2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-500" style={{ animation: 'bos-confetti 1.5s ease-out forwards' }} />
            <span className="pointer-events-none absolute left-2/3 top-1 h-2 w-2 rounded-full bg-violet-400" style={{ animation: 'bos-confetti 1.1s ease-out forwards' }} />
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" aria-hidden="true" style={{ animation: 'bos-success-pop .45s ease-out both' }} />
            <h2 className="mt-4 text-2xl font-semibold">
              {requested ? 'Request sent to the host' : paid ? 'Payment verified — booking confirmed' : 'BOOKING CONFIRMED — PAYMENT DUE'}
            </h2>
            <p className="mt-2 text-sm text-[#5b6b64] dark:text-slate-300">
              {requested
                ? 'No payment was taken. The host has 30 minutes to approve or decline.'
                : paid
                  ? 'The signed provider event confirmed settlement. Your stay is confirmed.'
                  : 'No online payment was taken. This is a booking confirmation, not a paid receipt. Pay the hotel on arrival or when the host collects.'}
            </p>
            <p className="mt-3 inline-block rounded-full bg-white/80 px-3 py-1 font-mono text-xs text-[#222222] dark:bg-slate-900 dark:text-slate-100">Booking ID {result.bookingId}</p>
          </div>

          <div className="mt-5 rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p><span className="text-[#717171] dark:text-slate-400">Hotel: </span>{receipt?.hotelName || property.name}</p>
              <p><span className="text-[#717171] dark:text-slate-400">Room: </span>{receipt?.roomType || 'Selected room'}</p>
              <p><span className="text-[#717171] dark:text-slate-400">Dates: </span>{formatDate(checkIn)} – {formatDate(checkOut)}</p>
              <p><span className="text-[#717171] dark:text-slate-400">Guests: </span>{guests} guest{guests === 1 ? '' : 's'}</p>
              <p><span className="text-[#717171] dark:text-slate-400">Guest name: </span>{receipt?.guestName || '—'}</p>
              <p className="break-all"><span className="text-[#717171] dark:text-slate-400">Email: </span>{receipt?.guestEmail || '—'}</p>
              <p><span className="text-[#717171] dark:text-slate-400">Mobile: </span>{receipt?.guestPhone || '—'}</p>
              <p><span className="text-[#717171] dark:text-slate-400">Amount: </span>{formatPaise(receipt?.totalPaise || quote?.totalPaise || 0)}</p>
              <p><span className="text-[#717171] dark:text-slate-400">Method: </span>{method}</p>
              <p className="sm:col-span-2"><span className="text-[#717171] dark:text-slate-400">Transaction reference: </span>{receipt?.paymentReference || (requested ? 'Not applicable' : 'Awaiting settlement')}</p>
              <p className="sm:col-span-2"><span className="text-[#717171] dark:text-slate-400">Payment status: </span>{receipt?.paymentStatus?.replace(/_/g, ' ') || (paid ? 'verified' : requested ? 'not due' : 'payment due')}</p>
              {receipt && <div className="sm:col-span-2 space-y-1 border-t border-[#ebebeb] pt-3 text-xs dark:border-slate-800">
                <p className="font-semibold">Price breakdown</p>
                <div className="flex justify-between"><span>Room charges ({receipt.nights} nights × {receipt.units} room)</span><span>{formatPaise(receipt.subtotalPaise)}</span></div>
                {receipt.cleaningFeePaise > 0 && <div className="flex justify-between"><span>Cleaning fee</span><span>{formatPaise(receipt.cleaningFeePaise)}</span></div>}
                {receipt.serviceFeePaise > 0 && <div className="flex justify-between"><span>Service fee</span><span>{formatPaise(receipt.serviceFeePaise)}</span></div>}
                {receipt.taxesPaise > 0 && <div className="flex justify-between"><span>Taxes ({receipt.taxPercent}%)</span><span>{formatPaise(receipt.taxesPaise)}</span></div>}
                {receipt.discountPaise > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatPaise(receipt.discountPaise)}</span></div>}
                <div className="flex justify-between border-t border-[#ebebeb] pt-1 font-semibold dark:border-slate-800"><span>Total</span><span>{formatPaise(receipt.totalPaise)}</span></div>
                <div className="flex justify-between"><span>Paid</span><span>{formatPaise(receipt.paidPaise)}</span></div>
                <div className="flex justify-between"><span>Balance due</span><span>{formatPaise(receipt.duePaise)}</span></div>
              </div>}
              {!requested && receipt && qrToken && <div className="sm:col-span-2 flex flex-col items-center gap-2 border-t border-[#ebebeb] pt-4 dark:border-slate-800" data-testid="stay-confirmation-qr">
                <QRCodeSVG value={qrToken} size={160} level="M" includeMargin />
                <p className="text-xs text-[#717171] dark:text-slate-400">Booking QR · show at check-in</p>
              </div>}
            </div>
          </div>

          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            {onViewTrips && <button type="button" onClick={onViewTrips} className="min-h-[46px] rounded-xl bg-[#f97316] px-5 text-sm font-semibold text-white">My stay bookings</button>}
            <button type="button" onClick={() => setReceiptOpen(true)} className="min-h-[46px] rounded-xl border border-[#222222] px-5 text-sm font-semibold dark:border-white">{paid ? 'Receipt / PDF' : 'Booking confirmation / PDF'}</button>
            <button type="button" onClick={onClose} className="min-h-[46px] rounded-xl border border-[#dddddd] px-5 text-sm font-semibold dark:border-slate-700">Done</button>
          </div>
          <p className="mt-3 text-center text-[11px] text-[#717171] dark:text-slate-400">Your booking QR is available in My Trips. The host scans it to verify and check you in.</p>
          <div className="mt-6 border-t border-[#ebebeb] pt-4 text-center dark:border-slate-800">
            <p className="text-sm font-semibold text-[#222222] dark:text-slate-100">BookOurSpace</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f97316]">FIND • BOOK • ENJOY</p>
            <p className="mt-1 text-[11px] text-[#717171] dark:text-slate-400">Find, book and enjoy verified spaces across India · support@bookourspace.in</p>
          </div>
        </main>
        {receiptOpen && <StayReceiptModal bookingId={result.bookingId} onClose={() => setReceiptOpen(false)} />}
      </div>
    );
  }

  // Preview inventory reaches this page only through a direct/defensive path:
  // the detail page already disables Reserve. Server checkout would answer 409
  // STAY_DEMO_NOT_BOOKABLE, so say it here instead of showing a dead form.
  if (property.demo && !property.demoBookable) {
    return (
      <div className="fixed inset-0 z-[130] overflow-y-auto bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-label="Confirm and pay">
        <header className="sticky top-0 z-10 border-b border-[#ebebeb] bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
            <button type="button" onClick={onClose} aria-label="Back to stay" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dddddd] hover:shadow-sm dark:border-slate-700">
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="text-lg font-semibold sm:text-xl">Confirm and pay</h1>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
          <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <h2 className="text-lg font-semibold">Sample listing — not bookable</h2>
            <p className="mt-2 text-sm leading-6">
              This is illustrative preview inventory. It cannot be reserved or paid for, and no payment method
              will be charged. Open a live local test stay to complete a booking.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={onClose} className="min-h-[46px] rounded-xl bg-[#f97316] px-5 text-sm font-semibold text-white">Back to stay</button>
            {onViewTrips && <button type="button" onClick={onViewTrips} className="min-h-[46px] rounded-xl border border-[#dddddd] px-5 text-sm font-semibold dark:border-slate-700">My stay bookings</button>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-white text-[#222222] dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-label="Confirm and pay">
      <header className="sticky top-0 z-10 border-b border-[#ebebeb] bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} aria-label="Back to stay" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dddddd] hover:shadow-sm dark:border-slate-700">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="text-lg font-semibold sm:text-xl">Confirm and pay</h1>
            {property.localTestFixture ? (
              <span className="ml-auto rounded-full bg-amber-200 px-3 py-1 text-[11px] font-bold text-amber-950">LOCAL E2E TEST</span>
            ) : (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Server-verified
              </span>
            )}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-10">
        <div className="space-y-4">
          {property.localTestFixture && (
            <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              LOCAL E2E TEST ONLY — this reservation uses disposable local data. Choose “Pay at hotel” to test booking; no payment is taken.
            </p>
          )}
          <section className={`rounded-2xl border p-4 ${isAuthenticated ? 'border-[#ebebeb] dark:border-slate-800' : 'border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'}`}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onSignIn}
                disabled={!onSignIn}
                className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                aria-label={isAuthenticated ? 'Manage your signed-in account' : 'Continue with Google'}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isAuthenticated ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>{isAuthenticated ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : '1'}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">{isAuthenticated ? '1. Your account' : '1. Continue with Google'}</h2>
                  <p className="text-xs text-[#717171] dark:text-slate-400">{isAuthenticated ? `Signed in as ${receipt?.guestEmail || authEmail || 'your verified account'}. Your booking is attached to this account.` : 'Continue with Google to attach this reservation. Dates, room and guest details stay on this page.'}</p>
                </div>
              </button>
              {onSignIn && (
                <button
                  type="button"
                  onClick={onSignIn}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${isAuthenticated ? 'border border-[#dddddd] text-[#222222] dark:border-slate-700 dark:text-slate-100' : 'bg-[#f97316] text-white'}`}
                >
                  {isAuthenticated ? 'Manage account' : 'Continue with Google'}
                </button>
              )}
            </div>
          </section>

          {quote && (
            <details open className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800 lg:hidden">
              <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold">
                <span>Price details</span>
                <span>{formatPaise(quote.totalPaise)}</span>
              </summary>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-[#717171] dark:text-slate-400">{formatPaise(quote.basePricePaise)} × {quote.nights} night{quote.nights === 1 ? '' : 's'}{quote.units > 1 ? ` × ${quote.units} rooms` : ''}</span>
                  <span>{formatPaise(quote.subtotalPaise ?? quote.basePricePaise * quote.nights * quote.units)}</span>
                </div>
                {Boolean(quote.cleaningFeePaise) && <div className="flex justify-between gap-3"><span className="text-[#717171] dark:text-slate-400">Cleaning fee</span><span>{formatPaise(quote.cleaningFeePaise || 0)}</span></div>}
                {Boolean(quote.serviceFeePaise) && <div className="flex justify-between gap-3"><span className="text-[#717171] dark:text-slate-400">Service fee</span><span>{formatPaise(quote.serviceFeePaise || 0)}</span></div>}
                {Boolean(quote.taxesPaise) && <div className="flex justify-between gap-3"><span className="text-[#717171] dark:text-slate-400">Taxes</span><span>{formatPaise(quote.taxesPaise || 0)}</span></div>}
                <div className="flex justify-between gap-3 border-t border-[#ebebeb] pt-2 font-bold dark:border-slate-800"><span>Total (INR)</span><span>{formatPaise(quote.totalPaise)}</span></div>
              </div>
              <p className="mt-2 text-[11px] text-[#717171] dark:text-slate-400">You won't be charged yet. The server confirms availability and the final total before a booking exists.</p>
            </details>
          )}

          <section className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#222222] text-xs font-bold text-white dark:bg-white dark:text-slate-900">2</span>
              <div>
                <h2 className="text-sm font-semibold">2. Payment method</h2>
                <p className="text-xs text-[#717171] dark:text-slate-400">Choose Razorpay Checkout, verified UPI, or reserve now and pay at the property.</p>
              </div>
            </div>
            <div className="mt-4 border-t border-[#ebebeb] pt-4 dark:border-slate-800">
              <StayCheckoutPanel
                property={property}
                checkIn={checkIn}
                checkOut={checkOut}
                guests={guests}
                isAuthenticated={isAuthenticated}
                onSignIn={onSignIn}
                cancellationPolicy={cancellationPolicy}
                requestMode={requestMode}
                pageLayout
                hideHeading
                onQuoteChange={setQuote}
                onBooked={(bookingId, paymentState) => {
                  const next = { kind: paymentState === 'paid' ? 'paid' as const : 'reserved' as const, bookingId };
                  setResult(next);
                  try { window.sessionStorage.setItem('bos_stay_booking_result_v1', JSON.stringify(next)); } catch { /* ignore */ }
                  onBooked?.(bookingId, paymentState);
                }}
                onRequested={(bookingId) => {
                  const next = { kind: 'requested' as const, bookingId };
                  setResult(next);
                  try { window.sessionStorage.setItem('bos_stay_booking_result_v1', JSON.stringify(next)); } catch { /* ignore */ }
                  onRequested?.(bookingId);
                }}
                onViewTrips={onViewTrips}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#222222] text-xs font-bold text-white dark:bg-white dark:text-slate-900">3</span>
              <div>
                <h2 className="text-sm font-semibold">3. Review your reservation</h2>
                <p className="text-xs text-[#717171] dark:text-slate-400">The server confirms availability and the final total before a booking exists.</p>
              </div>
            </div>
          </section>

          <p className="flex items-start gap-2 rounded-xl bg-[#f7f7f7] p-3 text-[11px] leading-5 text-[#717171] dark:bg-slate-900 dark:text-slate-300">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Card details are collected by Razorpay, not BookOurSpace. UPI and Razorpay stay unpaid until a signed provider webhook or a server-side payment fetch confirms capture. Pay-at-property bookings are recorded as unpaid until the host collects.
          </p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-[#ebebeb] p-4 shadow-sm dark:border-slate-800">
            <div className="flex gap-3">
              {image ? (
                <img src={image} alt={property.name} className="h-20 w-24 rounded-xl object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="h-20 w-24 rounded-xl bg-[#f2f0ee] dark:bg-slate-800" />
              )}
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold">{property.name}</p>
                <p className="mt-1 text-xs text-[#717171] dark:text-slate-400">{property.city || property.area}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3 border-t border-[#ebebeb] pt-4 text-sm dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">Dates</p>
                  <p className="mt-0.5 text-xs text-[#717171] dark:text-slate-400">{formatDate(checkIn)} – {formatDate(checkOut)}</p>
                  {nights > 0 && <p className="text-xs text-[#717171] dark:text-slate-400">{nights} night{nights === 1 ? '' : 's'}</p>}
                </div>
                <button type="button" onClick={onClose} className="rounded-lg border border-[#dddddd] px-3 py-1.5 text-xs font-semibold dark:border-slate-700">Change</button>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">Guests</p>
                  <p className="mt-0.5 text-xs text-[#717171] dark:text-slate-400">{guests} guest{guests === 1 ? '' : 's'}</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-lg border border-[#dddddd] px-3 py-1.5 text-xs font-semibold dark:border-slate-700">Change</button>
              </div>
            </div>

            {quote && (
              <div className="mt-4 space-y-1.5 border-t border-[#ebebeb] pt-4 text-xs dark:border-slate-800">
                <div className="flex justify-between"><span>{formatPaise(quote.basePricePaise)} × {quote.nights} night{quote.nights === 1 ? '' : 's'}</span><span>{formatPaise(quote.subtotalPaise ?? quote.basePricePaise * quote.nights * quote.units)}</span></div>
                {Boolean(quote.cleaningFeePaise) && <div className="flex justify-between"><span>Cleaning fee</span><span>{formatPaise(quote.cleaningFeePaise || 0)}</span></div>}
                {Boolean(quote.serviceFeePaise) && <div className="flex justify-between"><span>Service fee</span><span>{formatPaise(quote.serviceFeePaise || 0)}</span></div>}
                {Boolean(quote.taxesPaise) && <div className="flex justify-between"><span>Taxes</span><span>{formatPaise(quote.taxesPaise || 0)}</span></div>}
                <div className="flex justify-between border-t border-[#ebebeb] pt-2 text-sm font-bold dark:border-slate-800"><span>Total (INR)</span><span>{formatPaise(quote.totalPaise)}</span></div>
                <p className="pt-1 text-[10px] text-[#717171] dark:text-slate-400">You won't be charged yet · calculated by the server for {quote.units} room{quote.units === 1 ? '' : 's'}.</p>
              </div>
            )}

            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#717171] dark:text-slate-400"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Free cancellation is governed by the server policy.</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#717171] dark:text-slate-400"><Users className="h-3.5 w-3.5" aria-hidden="true" /> {guests} guest{guests === 1 ? '' : 's'} · {requestMode ? 'Host approval required' : 'Instant booking'}</p>
          </div>
        </aside>
      </main>
    </div>
  );
}
