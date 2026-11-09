import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
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
import { validateGuestDetails } from '../lib/stayGuestValidation';
import {
  cancelStayBooking,
  createStayCheckout,
  createStayRequest,
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
  type StayRequestResult,
  verifyStayRazorpayPayment,
} from '../lib/stayCheckoutClient';
import { loadRazorpayScript } from '../utils/razorpayLoader';
import { useMarketplace } from '../context/MarketplaceContext';
import { isStayOnlineMethodAvailable, stayPaymentStatusPresentation, staySettlementMessage } from '../lib/stayPaymentStatus';
import { patchStayCheckoutDraft, readStayCheckoutDraft } from '../lib/stayCheckoutDraft';

interface StayCheckoutPanelProps {
  property: StayProperty;
  checkIn: string;
  checkOut: string;
  guests: number;
  isAuthenticated: boolean;
  /** Opens the sign-in / registration modal from inside the booking panel. */
  onSignIn?: () => void;
  /** Server-published cancellation policy, shown next to the total. */
  cancellationPolicy?: string;
  /** Owner approval is required before payment or confirmation. */
  requestMode?: boolean;
  onBooked?: (bookingId: string, paymentState?: 'paid' | 'due') => void;
  onRequested?: (bookingId: string) => void;
  onViewTrips?: () => void;
  /** Checkout page layout: no nested card chrome and a shared quote callback. */
  pageLayout?: boolean;
  hideHeading?: boolean;
  onQuoteChange?: (quote: StayQuote | null) => void;
}

type Phase = 'idle' | 'creating' | 'awaiting_payment' | 'paid' | 'reserved' | 'requested' | 'failed';

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
  onSignIn,
  cancellationPolicy,
  requestMode = false,
  onBooked,
  onRequested,
  onViewTrips,
  pageLayout = false,
  hideHeading = false,
  onQuoteChange,
}) => {
  const { authUser } = useMarketplace();
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
  const draftOnLoad = readStayCheckoutDraft();
  const [roomTypeId, setRoomTypeId] = useState<string>(draftOnLoad?.roomTypeId || roomTypes[0]?.id || '');
  const [units, setUnits] = useState(draftOnLoad?.units && draftOnLoad.units >= 1 ? draftOnLoad.units : 1);
  const [quote, setQuote] = useState<StayQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [capabilities, setCapabilities] = useState<StayPaymentCapabilities | null>(null);
  const [mode, setMode] = useState<'upi' | 'pay_after_service' | 'razorpay'>(
    draftOnLoad?.paymentMode === 'upi' || draftOnLoad?.paymentMode === 'razorpay' || draftOnLoad?.paymentMode === 'pay_after_service'
      ? draftOnLoad.paymentMode
      : 'pay_after_service',
  );
  const userPickedMode = React.useRef(Boolean(draftOnLoad?.paymentMode));
  const [phase, setPhase] = useState<Phase>('idle');
  const [creating, setCreating] = useState(false);
  const [checkout, setCheckout] = useState<StayCheckoutResult | null>(null);
  const [intentStatus, setIntentStatus] = useState<string>('');
  const [verificationInProgress, setVerificationInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guestPhone, setGuestPhone] = useState(authUser?.phone || draftOnLoad?.guestPhone || '');
  const [guestName, setGuestName] = useState(authUser?.name || draftOnLoad?.guestName || '');
  const [guestEmail, setGuestEmail] = useState(authUser?.email || '');
  const [guestAddress, setGuestAddress] = useState(draftOnLoad?.guestAddress || '');
  const [guestTouched, setGuestTouched] = useState(false);
  const [showBookings, setShowBookings] = useState(false);
  const [bookings, setBookings] = useState<StayBookingRow[] | null>(null);
  const [bookingNotice, setBookingNotice] = useState<string | null>(null);

  const signedIn = Boolean(isAuthenticated || authUser);

  useEffect(() => {
    if (!authUser) return;
    setGuestName((current) => current || authUser.name || '');
    // Keep a typed email when the profile does not expose one; otherwise the
    // verified Google address is authoritative.
    setGuestEmail((current) => (authUser.email ? authUser.email : current || ''));
    setGuestPhone((current) => current || authUser.phone || '');
  }, [authUser?.id, authUser?.name, authUser?.email]);

  useEffect(() => {
    const draft = readStayCheckoutDraft();
    if (draft?.roomTypeId) setRoomTypeId((current) => current || draft.roomTypeId || '');
    if (draft?.units && draft.units >= 1) setUnits(draft.units);
    if (draft?.paymentMode === 'pay_after_service' || draft?.paymentMode === 'upi' || draft?.paymentMode === 'razorpay') {
      setMode(draft.paymentMode);
    }
  }, []);

  useEffect(() => {
    patchStayCheckoutDraft({
      stayStyle: pageLayout ? 'airbnb' : 'old',
      listingId: property.listingId,
      checkIn,
      checkOut,
      guests,
      guestName,
      guestPhone,
      guestAddress,
      roomTypeId,
      units,
      paymentMode: mode,
    });
  }, [pageLayout, property.listingId, checkIn, checkOut, guests, guestName, guestPhone, guestAddress, roomTypeId, units, mode]);

  useEffect(() => {
    onQuoteChange?.(quote);
  }, [quote, onQuoteChange]);

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

  // Pay at the property is always available; online UPI only when the server
  // actually has a receiving VPA and a verified settlement path.
  const upiAvailable = isStayOnlineMethodAvailable(capabilities, 'upi');
  const razorpayAvailable = isStayOnlineMethodAvailable(capabilities, 'razorpay');
  const onlineAvailable = upiAvailable || razorpayAvailable;
  const paymentStatusView = stayPaymentStatusPresentation(intentStatus, {
    onlineAvailable,
    verificationInProgress,
  });
  useEffect(() => {
    if (!capabilities) return;
    setMode((current) => {
      if (userPickedMode.current) {
        if (current === 'razorpay' && !razorpayAvailable) return upiAvailable ? 'upi' : 'pay_after_service';
        if (current === 'upi' && !upiAvailable) return razorpayAvailable ? 'razorpay' : 'pay_after_service';
        return current;
      }
      if (current === 'razorpay' && razorpayAvailable) return current;
      if (current === 'upi' && upiAvailable) return current;
      if (razorpayAvailable) return 'razorpay';
      if (upiAvailable) return 'upi';
      return 'pay_after_service';
    });
  }, [capabilities, razorpayAvailable, upiAvailable]);

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
        onBooked?.(checkout.bookingId, 'paid');
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
    if (!signedIn || !authUser) {
      patchStayCheckoutDraft({
        stayStyle: pageLayout ? 'airbnb' : 'old',
        listingId: property.listingId,
        checkIn,
        checkOut,
        guests,
        guestName,
        guestPhone,
        guestAddress,
        roomTypeId,
        units,
        paymentMode: mode,
      });
      if (onSignIn) {
        onSignIn();
        return;
      }
      setError('Continue with Google to reserve this stay. Booking details are kept on this page.');
      return;
    }
    const guest = validateGuestDetails(guestName, guestEmail, guestPhone);
    setGuestTouched(true);
    if (!guest.ok) {
      setError(guest.message);
      return;
    }
    if (mode === 'upi' && capabilities && !capabilities.upi) {
      setError('Verified UPI is not configured. Choose Razorpay Checkout or pay at the property.');
      return;
    }
    if (mode === 'razorpay' && capabilities && !capabilities.razorpay) {
      setError('Razorpay Checkout is not configured. Choose verified UPI or pay at the property.');
      return;
    }
    setCreating(true);
    if (requestMode) {
      const requested = await createStayRequest({
        listingId: property.listingId,
        roomTypeId,
        checkIn,
        checkOut,
        units,
        paymentMode: mode,
        guestName: guest.name,
        guestEmail: guest.email,
        guestPhone: guest.phone,
        guests,
        guestAddress: guestAddress.trim() || undefined,
        idempotencyKey: newIdempotencyKey('stay-request'),
        expiryHours: 24,
      });
      setCreating(false);
      if (!requested.ok) {
        setPhase('failed');
        setError((requested as { message?: string }).message || 'The request could not be sent. Nothing was charged.');
        return;
      }
      const created = requested as StayRequestResult;
      setCheckout({
        ok: true,
        bookingId: created.bookingId,
        intentId: '',
        paymentMode: created.paymentMode as 'upi' | 'pay_after_service' | 'razorpay',
        status: created.status,
        amountPaise: created.totalPaise,
        upiUri: null,
        expiresAt: created.expiresAt,
        checkIn: created.checkIn,
        checkOut: created.checkOut,
        nights: created.nights,
        units: created.units,
        roomType: created.roomType,
        replayed: created.replayed,
      });
      setPhase('requested');
      setBookingNotice('Request sent. The host has 30 minutes to approve or decline; no payment was taken.');
      onRequested?.(created.bookingId);
      return;
    }
    const result = await createStayCheckout({
      listingId: property.listingId,
      roomTypeId,
      checkIn,
      checkOut,
      units,
      paymentMode: mode,
      guestName: guestName.trim() || undefined,
      guestEmail: guestEmail.trim() || undefined,
      guestPhone: guestPhone.trim() || undefined,
      guests,
      guestAddress: guestAddress.trim() || undefined,
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
    if (created.fallbackFromUpi) {
      setNotice('UPI QR is not enabled for this merchant account, so the secure Razorpay Checkout opened instead. Choose UPI there to pay.');
    }
    if (created.paymentMode === 'pay_after_service') {
      setPhase('reserved');
      setBookingNotice('Room reserved. Payment is due at the property; no online payment was taken.');
      onBooked?.(created.bookingId, 'due');
    } else {
      setPhase('awaiting_payment');
      if (created.paymentMode === 'razorpay' && created.razorpayOrderId && created.razorpayKeyId) {
        void openRazorpayCheckout(created);
      }
    }
  };

  const openRazorpayCheckout = async (created: StayCheckoutResult) => {
    const loaded = await loadRazorpayScript();
    if (!loaded || typeof window === 'undefined' || !window.Razorpay) {
      setError('Razorpay Checkout could not be loaded. Keep this page open; the booking stays unpaid until the provider confirms settlement.');
      return;
    }
    try {
      const rzp = new window.Razorpay({
        key: created.razorpayKeyId,
        amount: created.amountPaise,
        currency: 'INR',
        name: 'BookOurSpace',
        description: created.listingTitle || 'Stay booking',
        order_id: created.razorpayOrderId,
        theme: { color: '#f97316' },
        handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature?: string }) => {
          setVerificationInProgress(true);
          setIntentStatus('processing');
          try {
            const verified = await verifyStayRazorpayPayment({
              intentId: created.intentId,
              razorpayOrderId: resp.razorpay_order_id,
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpaySignature: String(resp.razorpay_signature || ''),
            });
            if (verified.ok && (verified as { verified?: boolean }).verified === true) {
              setIntentStatus('verified');
              setPhase('paid');
              onBooked?.(created.bookingId, 'paid');
            } else {
              const serverStatus = (verified as { status?: string }).status;
              setIntentStatus(serverStatus || 'pending_verification');
              setError((verified as { message?: string }).message || 'The server has not confirmed settlement. This booking remains unpaid while verification is pending.');
            }
          } catch {
            setIntentStatus('pending_verification');
            setError('The server could not verify settlement yet. This booking remains unpaid while verification is pending.');
          } finally {
            setVerificationInProgress(false);
          }
        },
      });
      rzp.open();
    } catch {
      setError('Razorpay Checkout could not be opened. The room is held until the payment window expires.');
    }
  };

  const reset = () => {
    setPhase('idle');
    setNotice(null);
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
  const guestValidation = validateGuestDetails(guestName, guestEmail, guestPhone);

  const disabled = phase === 'creating' || phase === 'awaiting_payment';

  return (
    <section
      aria-labelledby="stay-checkout-heading"
      className={pageLayout
        ? 'space-y-4 rounded-none border-0 bg-transparent p-0 dark:bg-transparent'
        : 'mt-5 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20'}
    >
      {!hideHeading && (
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 id="stay-checkout-heading" className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
            <CalendarCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Reserve this stay
          </h3>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-600 dark:text-slate-400">
            Prices and availability are confirmed by the server for your dates.
            {requestMode ? ' This host reviews each request before a booking is confirmed.' : ''}
          </p>
        </div>
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      </div>
      )}

      {!signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/40" role="status">
          <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
            Continue with Google to confirm. Dates, room and guest details stay on this page. Nothing is reserved until you confirm.
          </p>
          {onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="min-h-[34px] shrink-0 rounded-lg bg-[#f97316] px-3 text-[11px] font-bold text-white transition hover:bg-[#ea580c]"
            >
              Continue with Google
            </button>
          )}
        </div>
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
                  <span>{formatPaise(quote.subtotalPaise ?? quote.basePricePaise * quote.nights * quote.units)}</span>
                </div>
                {Boolean(quote.cleaningFeePaise) && (
                  <div className="mt-1 flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Cleaning fee</span>
                    <span>{formatPaise(quote.cleaningFeePaise || 0)}</span>
                  </div>
                )}
                {Boolean(quote.serviceFeePaise) && (
                  <div className="mt-1 flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Service fee</span>
                    <span>{formatPaise(quote.serviceFeePaise || 0)}</span>
                  </div>
                )}
                {Boolean(quote.taxesPaise) && (
                  <div className="mt-1 flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Taxes ({quote.taxPercent}%)</span>
                    <span>{formatPaise(quote.taxesPaise || 0)}</span>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1 font-bold text-slate-900 dark:border-slate-700 dark:text-white">
                  <span>Total</span>
                  <span>{formatPaise(quote.totalPaise)}</span>
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
                  Every amount above is computed by the server. The payable total is never derived from a client value.
                </p>
                {cancellationPolicy && (
                  <p className="mt-1 text-[10px] font-medium text-slate-600 dark:text-slate-400">
                    Cancellation: {cancellationPolicy.replace(/_/g, ' ')} policy. Refund eligibility is calculated by the server at cancellation time.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => { userPickedMode.current = true; setMode('razorpay'); }}
              aria-pressed={mode === 'razorpay'}
              disabled={disabled || !razorpayAvailable}
              className={`flex min-h-[44px] items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                mode === 'razorpay'
                  ? 'border-emerald-600 bg-white ring-2 ring-emerald-500/20 dark:bg-slate-900'
                  : 'border-slate-200 bg-white hover:border-emerald-400 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 disabled:dark:bg-slate-900 disabled:dark:text-slate-400'
              }`}
            >
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <span>
                <span className="block text-[11px] font-black text-slate-900 dark:text-white">Razorpay Checkout {razorpayAvailable && capabilities?.razorpayTestMode ? <span className="font-semibold text-amber-700">(test)</span> : !razorpayAvailable ? <span className="font-semibold text-rose-600">(unavailable)</span> : null}</span>
                <span className="block text-[10px] leading-4 text-slate-500 dark:text-slate-400">{razorpayAvailable ? (capabilities?.razorpayTestMode ? 'Razorpay test mode. Cards, netbanking, wallets and UPI inside Razorpay. Confirmed only after the server fetches the captured payment.' : 'Cards, netbanking, wallets and UPI via Razorpay. Confirmed only after a signed webhook or payment fetch.') : 'Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server. Live keys also need RAZORPAY_WEBHOOK_SECRET.'}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { userPickedMode.current = true; setMode('upi'); }}
              aria-pressed={mode === 'upi'}
              disabled={disabled || !upiAvailable}
              className={`flex min-h-[44px] items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                mode === 'upi'
                  ? 'border-emerald-600 bg-white ring-2 ring-emerald-500/20 dark:bg-slate-900'
                  : 'border-slate-200 bg-white hover:border-emerald-400 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 disabled:dark:bg-slate-900 disabled:dark:text-slate-400'
              }`}
            >
              <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>
                <span className="block text-[11px] font-black text-slate-900 dark:text-white">Verified UPI {!upiAvailable && <span className="font-semibold text-rose-600">(unavailable)</span>}</span>
                <span className="block text-[10px] leading-4 text-slate-500 dark:text-slate-400">{upiAvailable ? 'Separate UPI QR or intent. Confirmed only after provider settlement, never from a screenshot or UTR.' : 'Verified UPI requires Razorpay UPI QR in production, or a sandbox VPA locally.'}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { userPickedMode.current = true; setMode('pay_after_service'); }}
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
                <span className="block text-[11px] font-black text-slate-900 dark:text-white">Pay at Hotel</span>
                <span className="block text-[10px] leading-4 text-slate-500 dark:text-slate-400">Reserve now, pay at the hotel. Recorded as unpaid until collected.</span>
              </span>
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">Guest name (full name) <span className="text-rose-600">Required</span></span>
              <input
                type="text"
                value={guestName}
                onChange={(event) => { setGuestName(event.target.value); setError(null); }}
                onBlur={() => setGuestTouched(true)}
                disabled={disabled}
                required
                aria-invalid={guestTouched && Boolean((!guestValidation.ok ? guestValidation.nameError : undefined))}
                autoComplete="name"
                placeholder="Full name for the booking"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              {guestTouched && (!guestValidation.ok ? guestValidation.nameError : undefined) && <span className="mt-1 block text-[10px] font-semibold text-rose-600">{(!guestValidation.ok ? guestValidation.nameError : undefined)}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">Guest email — Google account <span className="text-rose-600">Required</span></span>
              <input
                type="email"
                value={guestEmail}
                readOnly={Boolean(authUser?.email)}
                disabled={disabled}
                onChange={(event) => {
                  if (authUser?.email) return;
                  setGuestEmail(event.target.value);
                  setError(null);
                }}
                required
                aria-label="Guest email"
                aria-invalid={guestTouched && Boolean(!guestValidation.ok && guestValidation.emailError)}
                autoComplete="email"
                placeholder="Sign in with Google to continue"
                className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-2 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              {guestTouched && !guestValidation.ok && guestValidation.emailError && <span className="mt-1 block text-[10px] font-semibold text-rose-600">{guestValidation.emailError}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">Guest phone — mobile <span className="text-rose-600">Required</span></span>
              <input
                type="tel"
                inputMode="tel"
                value={guestPhone}
                onChange={(event) => { setGuestPhone(event.target.value); setError(null); }}
                onBlur={() => setGuestTouched(true)}
                disabled={disabled}
                required
                maxLength={17}
                autoComplete="tel"
                placeholder="10-digit mobile number"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              {guestTouched && (!guestValidation.ok ? guestValidation.phoneError : undefined) && <span className="mt-1 block text-[10px] font-semibold text-rose-600">{(!guestValidation.ok ? guestValidation.phoneError : undefined)}</span>}
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">Address <span className="font-semibold normal-case text-slate-500">Optional</span></span>
            <textarea
              value={guestAddress}
              onChange={(event) => setGuestAddress(event.target.value.slice(0, 250))}
              disabled={disabled}
              autoComplete="street-address"
              maxLength={250}
              rows={2}
              placeholder="Skip if you do not want to provide an address"
              className="w-full resize-y rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">Address proof is not requested. Never upload identity documents here.</span>
          </label>

          {phase === 'idle' || phase === 'failed' ? (
            <div className="sticky bottom-0 z-10 -mx-1 mt-1 border-t border-[#ebebeb] bg-white/95 px-1 pb-2 pt-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
              <button
                type="button"
                id="stay-booking-submit"
                onClick={() => {
                  if (!signedIn) {
                    patchStayCheckoutDraft({
                      stayStyle: pageLayout ? 'airbnb' : 'old',
                      listingId: property.listingId,
                      checkIn,
                      checkOut,
                      guests,
                      guestName,
                      guestPhone,
                      guestAddress,
                      roomTypeId,
                      units,
                      paymentMode: mode,
                    });
                    onSignIn?.();
                    return;
                  }
                  void startCheckout();
                }}
                disabled={signedIn ? (!quote || quote.availableUnits < quote.units || creating) : !onSignIn}
                aria-busy={creating}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#f97316] px-4 text-sm font-bold text-white transition hover:bg-[#ea580c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarCheck className="h-4 w-4" aria-hidden="true" />}
                {!signedIn
                  ? 'Continue with Google'
                  : requestMode
                    ? 'Request to book'
                    : mode === 'razorpay' ? 'Reserve and pay with Razorpay'
                      : mode === 'upi' ? 'Reserve and get UPI QR' : 'Confirm Reservation'}
              </button>
            </div>
          ) : null}

          {error && (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-amber-50 p-2 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {notice}
            </p>
          )}

          {phase === 'awaiting_payment' && checkout?.paymentMode === 'razorpay' && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-900 dark:text-white">Complete Razorpay payment {formatPaise(checkout.amountPaise)}</span>
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {paymentStatusView.state === 'processing' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Clock3 className="h-3 w-3" aria-hidden="true" />} {paymentStatusView.label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void openRazorpayCheckout(checkout)}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-[#f97316] text-xs font-bold text-white"
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" /> Open Razorpay Checkout
              </button>
              <p className="text-center text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                {paymentStatusView.message} Closing the Razorpay window does not confirm payment. This stay is paid only after server verification.
              </p>
            </div>
          )}

          {phase === 'awaiting_payment' && checkout?.paymentMode === 'upi' && (checkout.upiUri || checkout.qrImageUrl) && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              {capabilities?.upiSandbox && (
                <p role="note" className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] font-semibold leading-4 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  Local UPI demo: this QR pays the configured VPA and settlement is simulated by the sandbox. Do not send real money here.
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-900 dark:text-white">Scan to pay {formatPaise(checkout.amountPaise)}</span>
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Clock3 className="h-3 w-3" aria-hidden="true" /> Awaiting bank
                </span>
              </div>
              <div className="flex justify-center">
                <div className="rounded-xl border-2 border-slate-900 bg-white p-2">
                  {checkout.qrImageUrl ? (
                    <img src={checkout.qrImageUrl} alt="Verified UPI QR" width={168} height={168} className="h-[168px] w-[168px] object-contain" />
                  ) : (
                    <QRCodeSVG value={checkout.upiUri || ''} size={168} level="M" includeMargin />
                  )}
                </div>
              </div>
              {checkout.upiUri && (
              <a
                href={checkout.upiUri}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 dark:border-slate-600 dark:text-slate-100"
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" /> Open UPI app
              </a>
              )}
              <p aria-live="polite" className="text-center text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                {paymentStatusView.message} · Payment reference {checkout.intentId.slice(0, 12)}…
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

          {phase === 'requested' && checkout && (
            <div className="space-y-1.5 rounded-xl border border-amber-300 bg-white p-3 dark:border-amber-800 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-800 dark:text-amber-300">
                <Clock3 className="h-4 w-4" aria-hidden="true" /> Request sent to the host
              </div>
              <p className="text-[10px] leading-4 text-slate-600 dark:text-slate-400">
                Booking <span className="font-mono font-bold">{checkout.bookingId}</span> · {formatPaise(checkout.amountPaise)} due only if approved.
                {checkout.expiresAt ? ` Expires ${new Date(checkout.expiresAt).toLocaleString('en-IN')}.` : ' The host has 30 minutes to respond.'}
              </p>
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">No payment was taken. Track the decision in My stays.</p>
              {onViewTrips && <button type="button" onClick={onViewTrips} className="text-[10px] font-bold text-amber-800 underline dark:text-amber-300">Open My stays</button>}
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
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={reset} className="text-[10px] font-bold text-emerald-700 underline dark:text-emerald-300">
                  Book another room
                </button>
                {onViewTrips && (
                  <button type="button" onClick={onViewTrips} className="text-[10px] font-bold text-slate-700 underline dark:text-slate-300">
                    View my trips
                  </button>
                )}
              </div>
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
              <div key={row.bookingId} data-testid="stay-booking-row" className="flex flex-wrap items-center justify-between gap-1 rounded-lg bg-white/80 p-2 text-[10px] dark:bg-slate-900">
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

      <p className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400" aria-live="polite">
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
        {staySettlementMessage(capabilities)}
      </p>
    </section>
  );
};

export default StayCheckoutPanel;
