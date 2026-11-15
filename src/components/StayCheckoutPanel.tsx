import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { StayProperty } from '../lib/stayDiscoveryData';
import {
  cancelStayBooking,
  createStayCheckout,
  fetchMyStayBookings,
  fetchStayIntent,
  fetchStayPaymentCapabilities,
  fetchStayQuote,
  fetchStayAvailabilityForListing,
  type StayServerRoomType,
  formatPaise,
  newIdempotencyKey,
  type StayBookingRow,
  type StayCheckoutResult,
  type StayPaymentCapabilities,
  type StayQuote,
} from '../lib/stayCheckoutClient';

interface StayCheckoutPanelProps {
  property: StayProperty;
  checkIn: string;
  checkOut: string;
  guests: number;
  isAuthenticated: boolean;
}

type Phase = 'idle' | 'creating' | 'awaiting_payment' | 'paid' | 'reserved' | 'failed';

const TERMINAL_INTENT_STATES = new Set(['verified', 'failed', 'expired', 'refunded']);

function nightsLabel(nights: number): string {
  return `${nights} night${nights === 1 ? '' : 's'}`;
}

/**
 * Server-authoritative stay checkout.
 *
 * The panel never calculates a payable total: it renders the quote returned by
 * PostgreSQL. Payment only becomes "verified" after a signed provider callback
 * settles the intent server-side, so there is no client path that can fake a
 * successful payment.
 */
export const StayCheckoutPanel: React.FC<StayCheckoutPanelProps> = ({
  property,
  checkIn,
  checkOut,
  guests,
  isAuthenticated,
}) => {
  const propertyRoomTypes = property.roomTypes;
  // The discovery feed may not carry room types; the server does. Prefer real
  // property room types, then fall back to server availability.
  const [serverRoomTypes, setServerRoomTypes] = useState<StayServerRoomType[] | null>(null);
  const roomTypes = propertyRoomTypes.length > 0
    ? propertyRoomTypes
    : (serverRoomTypes ?? []).map((room) => ({
        id: room.roomTypeId,
        propertyId: property.id,
        name: room.name,
        maxAdults: room.maxAdults,
        maxChildren: 0,
        basePricePaise: room.basePricePaise,
        amenities: [] as string[],
      }));
  const [roomTypeId, setRoomTypeId] = useState<string>(roomTypes[0]?.id || '');
  const [units, setUnits] = useState(1);
  const [quote, setQuote] = useState<StayQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [capabilities, setCapabilities] = useState<StayPaymentCapabilities | null>(null);
  const [mode, setMode] = useState<'upi' | 'pay_after_service'>('upi');
  const [phase, setPhase] = useState<Phase>('idle');
  const [creating, setCreating] = useState(false);
  const [checkout, setCheckout] = useState<StayCheckoutResult | null>(null);
  const [intentStatus, setIntentStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [guestPhone, setGuestPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [showBookings, setShowBookings] = useState(false);
  const [bookings, setBookings] = useState<StayBookingRow[] | null>(null);
  const [bookingNotice, setBookingNotice] = useState<string | null>(null);

  const validDates = Boolean(checkIn && checkOut && checkOut > checkIn);

  useEffect(() => {
    if (roomTypes.length && !roomTypes.some((room) => room.id === roomTypeId)) {
      setRoomTypeId(roomTypes[0].id);
    }
  }, [roomTypeId, roomTypes]);

  useEffect(() => {
    let cancelled = false;
    void fetchStayPaymentCapabilities().then((result) => {
      if (cancelled) return;
      if (result.ok) setCapabilities(result as StayPaymentCapabilities);
      else setCapabilities(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (propertyRoomTypes.length > 0) return;
    if (!checkIn || !checkOut || checkOut <= checkIn) return;
    let cancelled = false;
    void fetchStayAvailabilityForListing(property.listingId, checkIn, checkOut).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        const rooms = (result as { roomTypes: StayServerRoomType[] }).roomTypes || [];
        setServerRoomTypes(rooms);
        setRoomTypeId((current) => {
          if (current && rooms.some((room) => room.roomTypeId === current)) return current;
          const available = rooms.find((room) => room.availableUnits > 0) || rooms[0];
          return available?.roomTypeId || '';
        });
      } else {
        setServerRoomTypes([]);
      }
    });
    return () => { cancelled = true; };
  }, [checkIn, checkOut, property.listingId, propertyRoomTypes.length]);

  const loadQuote = useCallback(async () => {
    if (!roomTypeId || !validDates) {
      setQuote(null);
      return;
    }
    setQuoteBusy(true);
    setQuoteError(null);
    const result = await fetchStayQuote({
      listingId: property.listingId,
      roomTypeId,
      checkIn,
      checkOut,
      units,
    });
    setQuoteBusy(false);
    if (result.ok) setQuote(result as StayQuote);
    else {
      setQuote(null);
      setQuoteError((result as { message?: string }).message || 'A price could not be confirmed for these dates.');
    }
  }, [checkIn, checkOut, property.listingId, roomTypeId, units, validDates]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  // Poll the server for the authoritative intent status while a UPI payment is open.
  useEffect(() => {
    if (phase !== 'awaiting_payment' || !checkout?.intentId) return;
    let active = true;
    const poll = async () => {
      const result = await fetchStayIntent(checkout.intentId);
      if (!active || !result.ok) return;
      const status = (result as { status: string }).status;
      setIntentStatus(status);
      if (status === 'verified') {
        setPhase('paid');
        setBookingNotice('Payment verified by the provider. Your stay is confirmed.');
      } else if (TERMINAL_INTENT_STATES.has(status)) {
        setPhase('failed');
        setError(
          status === 'failed'
            ? 'The provider reported this payment as failed. No booking was confirmed.'
            : status === 'expired'
            ? 'The payment window expired before settlement. Nothing was charged and the room was released.'
            : 'This payment was refunded. The reservation is no longer active.',
        );
      }
    };
    const timer = window.setInterval(() => void poll(), 4000);
    void poll();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [checkout?.intentId, phase]);

  const startCheckout = async () => {
    setError(null);
    setBookingNotice(null);
    if (!quote || !roomTypeId) {
      setError('Choose a room type and dates before booking.');
      return;
    }
    if (!isAuthenticated) {
      setError('Sign in with a verified account to reserve this stay.');
      return;
    }
    if (mode === 'upi' && capabilities && !capabilities.upi) {
      setError('The receiving UPI ID is not configured, so online payment is unavailable. Choose pay after service or contact the owner.');
      return;
    }
    setCreating(true);
    const result = await createStayCheckout({
      listingId: property.listingId,
      roomTypeId,
      checkIn,
      checkOut,
      units,
      paymentMode: mode,
      guestName: guestName.trim() || undefined,
      guestPhone: guestPhone.trim() || undefined,
      idempotencyKey: newIdempotencyKey('stay'),
    });
    setCreating(false);
    if (!result.ok) {
      setPhase('failed');
      setError((result as { message?: string }).message || 'The reservation could not be created. Nothing was charged.');
      return;
    }
    const created = result as StayCheckoutResult;
    setCheckout(created);
    setIntentStatus(created.status);
    if (created.paymentMode === 'pay_after_service') {
      setPhase('reserved');
      setBookingNotice('Room reserved. Payment is due at the property; no online payment was taken.');
    } else {
      setPhase('awaiting_payment');
    }
  };

  const reset = () => {
    setPhase('idle');
    setCheckout(null);
    setIntentStatus('');
    setError(null);
    setBookingNotice(null);
  };

  const loadBookings = async () => {
    setShowBookings(true);
    setBookings(null);
    const result = await fetchMyStayBookings();
    if (result.ok) setBookings((result as { bookings: StayBookingRow[] }).bookings);
    else {
      setBookings([]);
      setBookingNotice((result as { message?: string }).message || 'Your bookings could not be loaded.');
    }
  };

  const cancelBooking = async (bookingId: string) => {
    setBookingNotice('Requesting cancellation…');
    const result = await cancelStayBooking(bookingId);
    if (!result.ok) {
      setBookingNotice((result as { message?: string }).message || 'The cancellation could not be completed.');
      return;
    }
    const details = result as { refundPaise: number; refundPolicy: string; note?: string };
    setBookingNotice(
      `${details.refundPolicy}. Refund due: ${formatPaise(details.refundPaise)}. ${details.note || 'Settlement is confirmed by the payment provider.'}`,
    );
    await loadBookings();
  };

  const selectedRoom = useMemo(
    () => roomTypes.find((room) => room.id === roomTypeId) || null,
    [roomTypeId, roomTypes],
  );

  const disabled = phase === 'creating' || phase === 'awaiting_payment';

  return (
    <section
      aria-labelledby="stay-checkout-heading"
      className="mt-5 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 id="stay-checkout-heading" className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
            <CalendarCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Reserve this stay
          </h3>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-600 dark:text-slate-400">
            Prices and availability are confirmed by the server for your dates.
          </p>
        </div>
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      </div>

      {!isAuthenticated && (
        <p className="rounded-lg bg-white/80 p-2 text-[11px] font-medium text-amber-800 dark:bg-slate-900 dark:text-amber-300" role="status">
          Sign in with a verified account to reserve. Nothing is reserved while signed out.
        </p>
      )}

      {roomTypes.length === 0 ? (
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          {propertyRoomTypes.length === 0 && serverRoomTypes === null
            ? 'Checking live room availability with the server…'
            : 'The owner has not published room inventory, so online booking is unavailable for this stay.'}
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">Room type</span>
              <select
                value={roomTypeId}
                onChange={(event) => setRoomTypeId(event.target.value)}
                disabled={disabled}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                {roomTypes.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} · {formatPaise(room.basePricePaise)}/night
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">Rooms</span>
              <select
                value={units}
                onChange={(event) => setUnits(Number(event.target.value))}
                disabled={disabled}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                {[1, 2, 3].map((count) => (
                  <option key={count} value={count}>{count} room{count === 1 ? '' : 's'}</option>
                ))}
              </select>
            </label>
          </div>

          <div aria-live="polite" className="min-h-[20px] text-[11px]">
            {!validDates && <span className="text-slate-600 dark:text-slate-400">Pick check-in and check-out dates to see the total.</span>}
            {quoteBusy && <span className="text-slate-600 dark:text-slate-400" aria-busy="true">Checking price and availability…</span>}
            {quoteError && <span className="text-rose-600 dark:text-rose-400">{quoteError}</span>}
            {quote && !quoteBusy && (
              <div className="rounded-lg bg-white/80 p-2.5 dark:bg-slate-900">
                <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                  <span>{formatPaise(quote.basePricePaise)} × {nightsLabel(quote.nights)} × {quote.units} room{quote.units === 1 ? '' : 's'}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{formatPaise(quote.totalPaise)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <BedDouble className="h-3 w-3" aria-hidden="true" />
                    {quote.availableUnits} room{quote.availableUnits === 1 ? '' : 's'} free
                  </span>
                  {quote.availableUnits < quote.units && (
                    <span className="font-semibold text-rose-600 dark:text-rose-400">Not enough rooms for these dates</span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  Total computed on the server. Any property taxes are settled with the stay.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('upi')}
              aria-pressed={mode === 'upi'}
              disabled={disabled}
              className={`flex min-h-[44px] items-start gap-2 rounded-xl border p-2.5 text-left transition disabled:opacity-60 ${
                mode === 'upi'
                  ? 'border-emerald-600 bg-white ring-2 ring-emerald-500/20 dark:bg-slate-900'
                  : 'border-slate-200 bg-white/70 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900/50'
              }`}
            >
              <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>
                <span className="block text-[11px] font-black text-slate-900 dark:text-white">Pay now with UPI</span>
                <span className="block text-[10px] leading-4 text-slate-500 dark:text-slate-400">Scan a server-generated QR. Confirmed only after bank settlement.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('pay_after_service')}
              aria-pressed={mode === 'pay_after_service'}
              disabled={disabled}
              className={`flex min-h-[44px] items-start gap-2 rounded-xl border p-2.5 text-left transition disabled:opacity-60 ${
                mode === 'pay_after_service'
                  ? 'border-emerald-600 bg-white ring-2 ring-emerald-500/20 dark:bg-slate-900'
                  : 'border-slate-200 bg-white/70 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900/50'
              }`}
            >
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>
                <span className="block text-[11px] font-black text-slate-900 dark:text-white">Pay after service</span>
                <span className="block text-[10px] leading-4 text-slate-500 dark:text-slate-400">Reserve now, pay the property. Recorded as unpaid.</span>
              </span>
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">Guest name</span>
              <input
                type="text"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                disabled={disabled}
                autoComplete="name"
                placeholder="Name for the booking"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">Guest phone</span>
              <input
                type="tel"
                inputMode="tel"
                value={guestPhone}
                onChange={(event) => setGuestPhone(event.target.value)}
                disabled={disabled}
                autoComplete="tel"
                placeholder="+91…"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          {phase === 'idle' || phase === 'failed' ? (
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={!isAuthenticated || !quote || quote.availableUnits < quote.units || creating}
              aria-busy={creating}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#f97316] px-4 text-sm font-bold text-white transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarCheck className="h-4 w-4" aria-hidden="true" />}
              {mode === 'upi' ? 'Reserve and get UPI QR' : 'Reserve with pay after service'}
            </button>
          ) : null}

          {error && (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {phase === 'awaiting_payment' && checkout?.upiUri && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-900 dark:text-white">Scan to pay {formatPaise(checkout.amountPaise)}</span>
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Clock3 className="h-3 w-3" aria-hidden="true" /> Awaiting bank
                </span>
              </div>
              <div className="flex justify-center">
                <div className="rounded-xl border-2 border-slate-900 bg-white p-2">
                  <QRCodeSVG value={checkout.upiUri} size={168} level="M" includeMargin />
                </div>
              </div>
              <a
                href={checkout.upiUri}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 dark:border-slate-600 dark:text-slate-100"
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" /> Open UPI app
              </a>
              <p aria-live="polite" className="text-center text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                {intentStatus === 'pending'
                  ? 'Waiting for the provider to confirm settlement. This page updates automatically; do not pay twice.'
                  : `Payment reference ${checkout.intentId.slice(0, 12)}… · status: ${intentStatus || 'pending'}`}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const result = await fetchStayIntent(checkout.intentId);
                    if (result.ok) setIntentStatus((result as { status: string }).status);
                  }}
                  className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-[11px] font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Check status
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
                </button>
              </div>
            </div>
          )}

          {(phase === 'paid' || phase === 'reserved') && checkout && (
            <div className="space-y-1.5 rounded-xl border border-emerald-300 bg-white p-3 dark:border-emerald-800 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {phase === 'paid' ? 'Payment verified — stay confirmed' : 'Room reserved — payment due at the property'}
              </div>
              <p className="text-[10px] leading-4 text-slate-600 dark:text-slate-400">
                Booking <span className="font-mono font-bold">{checkout.bookingId}</span> · {formatPaise(checkout.amountPaise)} ·{' '}
                {checkout.nights ? nightsLabel(checkout.nights) : `${checkout.checkIn} → ${checkout.checkOut}`}
              </p>
              {phase === 'reserved' && (
                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  No online payment was taken. Pay {formatPaise(checkout.amountPaise)} at the property.
                </p>
              )}
              <button type="button" onClick={reset} className="text-[10px] font-bold text-emerald-700 underline dark:text-emerald-300">
                Book another room
              </button>
            </div>
          )}
        </>
      )}

      <div className="border-t border-emerald-200/70 pt-2 dark:border-emerald-900/60">
        <button
          type="button"
          onClick={() => (showBookings ? setShowBookings(false) : void loadBookings())}
          aria-expanded={showBookings}
          className="flex min-h-[36px] w-full items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300"
        >
          <span>My stay bookings</span>
          <ChevronDown className={`h-3.5 w-3.5 transition ${showBookings ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {showBookings && (
          <div className="space-y-1.5 pb-1" aria-live="polite">
            {bookingNotice && <p className="rounded-lg bg-white/80 p-2 text-[10px] text-slate-700 dark:bg-slate-900 dark:text-slate-300">{bookingNotice}</p>}
            {bookings === null && <p className="text-[10px] text-slate-500" aria-busy="true">Loading your bookings…</p>}
            {bookings?.length === 0 && <p className="text-[10px] text-slate-500 dark:text-slate-400">No stay bookings for this account yet.</p>}
            {bookings?.map((row) => (
              <div key={row.bookingId} className="flex flex-wrap items-center justify-between gap-1 rounded-lg bg-white/80 p-2 text-[10px] dark:bg-slate-900">
                <span className="min-w-0">
                  <span className="block truncate font-bold text-slate-900 dark:text-white">{row.propertyName} · {row.roomType}</span>
                  <span className="block text-slate-500 dark:text-slate-400">{row.checkIn} → {row.checkOut} · {formatPaise(row.totalPaise)} · {row.status}</span>
                </span>
                {row.status === 'confirmed' && (
                  <button
                    type="button"
                    onClick={() => void cancelBooking(row.bookingId)}
                    className="rounded-md border border-rose-300 px-2 py-1 font-bold text-rose-600 dark:border-rose-800 dark:text-rose-300"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {capabilities && (
        <p className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          {capabilities.settlementVerification === 'signed_sandbox_psp'
            ? 'Sandbox payment provider: settlements require a signed server callback.'
            : 'Online settlement verification is unavailable in this environment.'}
        </p>
      )}
    </section>
  );
};

export default StayCheckoutPanel;
