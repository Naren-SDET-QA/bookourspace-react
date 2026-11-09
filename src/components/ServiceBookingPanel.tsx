import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Loader2, MapPin, RefreshCw, ShieldCheck, Smartphone, X } from 'lucide-react';
import { CopyButton } from './ui/CopyButton';
import { FormStatus } from './ui/FormStatus';
import { QRCodeSVG } from 'qrcode.react';
import {
  createServiceBooking,
  fetchServicePaymentConfig,
  serviceBookingErrorMessage,
  type ServiceBooking,
  type ServicePaymentConfig,
} from '../lib/servicesBookingClient';
import {
  createServicePaymentIntent,
  fetchServiceAvailability,
  fetchServicePaymentStatus,
  fetchServiceProfile,
  newServiceIdempotencyKey,
  serviceCommerceErrorMessage,
  type ServiceAvailabilitySlot,
  type ServicePaymentIntent,
  type ServiceProviderProfile,
} from '../lib/serviceCommerceClient';

interface ServiceBookingPanelProps {
  listing: { id: string; title: string; providerName: string };
  onClose: () => void;
  onBooked?: (booking: ServiceBooking) => void;
}

function isoPlusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function newBookingKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0').slice(-12);
}

export function ServiceBookingPanel({ listing, onClose, onBooked }: ServiceBookingPanelProps) {
  const [config, setConfig] = useState<ServicePaymentConfig | null>(null);
  const [profile, setProfile] = useState<ServiceProviderProfile | null>(null);
  const [scheduledDate, setScheduledDate] = useState(isoPlusDays(1));
  const [slots, setSlots] = useState<ServiceAvailabilitySlot[]>([]);
  const [slotsBusy, setSlotsBusy] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [slotKey, setSlotKey] = useState('');
  const [serviceAddress, setServiceAddress] = useState('');
  const [addressNotes, setAddressNotes] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMode, setPaymentMode] = useState<'pay_after_service' | 'upi_intent'>('pay_after_service');
  const [idempotencyKey, setIdempotencyKey] = useState(newBookingKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<ServiceBooking | null>(null);
  const [intent, setIntent] = useState<ServicePaymentIntent | null>(null);
  const [intentStatus, setIntentStatus] = useState<string>('');


  useEffect(() => {
    let active = true;
    fetchServicePaymentConfig()
      .then((value) => { if (active) setConfig(value); })
      .catch(() => { if (active) setConfig(null); });
    fetchServiceProfile(listing.id)
      .then((value) => { if (active) setProfile(value.profile); })
      .catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, [listing.id]);

  const loadSlots = useCallback(async () => {
    setSlotsBusy(true);
    setSlotsError('');
    try {
      const result = await fetchServiceAvailability(listing.id, scheduledDate, scheduledDate);
      setSlots(result.slots);
      const firstFree = result.slots.find((slot) => !slot.isBooked);
      setSlotKey((current) =>
        result.slots.some((slot) => slot.slotKey === current && !slot.isBooked) ? current : firstFree?.slotKey || '',
      );
    } catch (caught) {
      setSlots([]);
      setSlotKey('');
      setSlotsError(serviceCommerceErrorMessage(caught));
    } finally {
      setSlotsBusy(false);
    }
  }, [listing.id, scheduledDate]);

  useEffect(() => { void loadSlots(); }, [loadSlots]);

  // Authoritative settlement polling. A QR scan alone never marks this paid.
  useEffect(() => {
    if (!intent?.intentId) return;
    let active = true;
    const poll = async () => {
      try {
        const status = await fetchServicePaymentStatus(intent.intentId);
        if (!active) return;
        setIntentStatus(status.status);
        if (status.status === 'verified') setIntentStatus('verified');
      } catch {
        // keep the last known state; the server remains the authority
      }
    };
    const timer = window.setInterval(() => void poll(), 4000);
    void poll();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [intent?.intentId]);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.slotKey === slotKey) || null,
    [slotKey, slots],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (!selectedSlot) throw Object.assign(new Error('slot'), { code: 'SERVICE_SLOT_UNAVAILABLE' });
      const result = await createServiceBooking({
        listingId: listing.id,
        scheduledDate,
        // The canonical start time is stored; the range stays a display label.
        timeSlot: selectedSlot.start,
        serviceAddress,
        addressNotes,
        customerPhone,
        notes,
        paymentMode,
        idempotencyKey,
      });
      setCreated(result.booking);
      onBooked?.(result.booking);

      if (paymentMode !== 'pay_after_service') {
        const payment = await createServicePaymentIntent(result.booking.id, newServiceIdempotencyKey());
        setIntent(payment);
        setIntentStatus(payment.status);
      }
    } catch (caught) {
      setError(
        (caught as { code?: string })?.code
          ? serviceCommerceErrorMessage(caught) !== 'The request could not be completed. Nothing was charged.'
            ? serviceCommerceErrorMessage(caught)
            : serviceBookingErrorMessage(caught)
          : serviceBookingErrorMessage(caught),
      );
      setIdempotencyKey(newBookingKey());
      await loadSlots();
    } finally {
      setSubmitting(false);
    }
  };

  const paid = intentStatus === 'verified';

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="service-booking-title">
      <div className="mx-auto my-4 w-full max-w-xl overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-violet-700 to-purple-600 p-5 text-white">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-100">Book a home service</p>
            <h2 id="service-booking-title" className="mt-1 text-lg font-black leading-snug sm:text-xl">{listing.title}</h2>
            <p className="mt-1 text-xs text-violet-100">Provider: {profile?.providerName || listing.providerName || 'Listed provider'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/20" aria-label="Close booking">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {created ? (
          <div className="space-y-4 p-5 sm:p-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-100">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Booking requested
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-900/80 dark:text-emerald-100/80">
                The provider still has to accept. BookOurSpace has not charged you.
              </p>
            </div>

            <dl className="grid gap-3 rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Reference</dt>
                <dd className="flex items-center gap-2 font-mono font-bold">
                  {created.bookingRef}
                  <CopyButton value={created.bookingRef} label="Copy" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">When</dt><dd className="font-semibold">{created.scheduledDate} · {created.timeSlot}{selectedSlot ? `–${selectedSlot.end}` : ''}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">Agreed amount</dt><dd className="font-bold">₹{created.amount.toLocaleString('en-IN')} <span className="text-[11px] font-normal text-slate-500">({created.amountBasis})</span></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">Payment</dt><dd className="font-semibold">{paid ? 'Paid · verified settlement' : intent ? 'Awaiting verified settlement' : 'Due after service'}</dd></div>
              <div className="flex items-start justify-between gap-3"><dt className="text-slate-500 dark:text-slate-400">Address</dt><dd className="max-w-[60%] text-right font-semibold">{created.serviceAddress}</dd></div>
            </dl>

            {intent && (
              <div className="rounded-2xl border border-violet-200 p-4 text-center dark:border-violet-900">
                {paid ? (
                  <p className="flex items-center justify-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Payment verified by the provider
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-bold">Scan to pay ₹{intent.amount.toLocaleString('en-IN')}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Server-issued reference {intent.intentId.slice(0, 12)}… · status: {intentStatus || intent.status}
                    </p>
                    <div className="mt-3 inline-block rounded-2xl bg-white p-3">
                      <QRCodeSVG value={intent.upiUri} size={168} aria-label="UPI payment QR code" />
                    </div>
                    <a href={intent.upiUri} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-violet-700 px-4 text-xs font-bold text-white hover:bg-violet-800">
                      <Smartphone className="h-4 w-4" aria-hidden="true" /> Open UPI app
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const status = await fetchServicePaymentStatus(intent.intentId);
                          setIntentStatus(status.status);
                        } catch { /* keep last known */ }
                      }}
                      className="mt-3 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 text-xs font-bold dark:border-slate-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Check payment status
                    </button>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      A scan or screenshot is not proof of payment. This page updates only when the provider confirms settlement.
                    </p>
                  </>
                )}
              </div>
            )}

            <button type="button" onClick={onClose} className="min-h-11 w-full rounded-2xl bg-violet-700 text-sm font-bold text-white hover:bg-violet-800">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                <span className="mb-1 flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" /> Service date</span>
                <input type="date" required min={isoPlusDays(0)} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                <span className="mb-1 block">Available time</span>
                <select
                  required
                  value={slotKey}
                  onChange={(event) => setSlotKey(event.target.value)}
                  aria-busy={slotsBusy}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                >
                  {slots.length === 0 && <option value="">{slotsBusy ? 'Checking availability…' : 'No slots available'}</option>}
                  {slots.map((slot) => (
                    <option key={slot.slotKey} value={slot.slotKey} disabled={slot.isBooked}>
                      {slot.label}{slot.isBooked ? ' — booked' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p aria-live="polite" className="min-h-4 text-[11px]">
              {slotsError && <span className="font-semibold text-rose-600 dark:text-rose-400">{slotsError}</span>}
              {!slotsError && profile && (
                <span className="text-slate-500 dark:text-slate-400">
                  {profile.scheduleConfigured
                    ? `Working hours ${profile.dayStart}–${profile.dayEnd}${profile.serviceAreas.length ? ` · serves ${profile.serviceAreas.join(', ')}` : ''}`
                    : `Default availability ${profile.dayStart}–${profile.dayEnd} until the provider publishes a schedule`}
                </span>
              )}
            </p>

            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              <span className="mb-1 flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" /> Service address</span>
              <textarea required rows={2} minLength={5} maxLength={500} value={serviceAddress} onChange={(event) => setServiceAddress(event.target.value)} placeholder="Flat / house, street, area, landmark" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
            </label>

            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              <span className="mb-1 block">Landmark / access notes (optional)</span>
              <input value={addressNotes} maxLength={500} onChange={(event) => setAddressNotes(event.target.value)} placeholder="Gate code, floor, parking" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
            </label>

            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              <span className="mb-1 block">Contact phone</span>
              <input type="tel" required value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="+91 98765 43210" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
            </label>

            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              <span className="mb-1 block">What needs doing? (optional)</span>
              <textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Describe the problem, appliance model, or scope" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
            </label>

            <fieldset className="rounded-2xl border border-violet-100 p-3 dark:border-violet-900">
              <legend className="px-1 text-xs font-bold text-slate-600 dark:text-slate-300">Payment</legend>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-xl p-2 hover:bg-violet-50 dark:hover:bg-violet-950/30">
                  <input type="radio" name="paymentMode" value="pay_after_service" checked={paymentMode === 'pay_after_service'} onChange={() => setPaymentMode('pay_after_service')} className="mt-0.5" />
                  <span><span className="block text-sm font-bold">Pay after service (cash or UPI)</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">The provider records collection; an administrator verifies it before it counts as settled.</span></span>
                </label>
                {config?.upi.enabled && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl p-2 hover:bg-violet-50 dark:hover:bg-violet-950/30">
                    <input type="radio" name="paymentMode" value="upi_intent" checked={paymentMode === 'upi_intent'} onChange={() => setPaymentMode('upi_intent')} className="mt-0.5" />
                    <span><span className="block text-sm font-bold">Pay now by UPI</span><span className="block text-[11px] text-slate-500 dark:text-slate-400">Server-issued QR to {config.upi.vpa}. Paid only after verified settlement.</span></span>
                  </label>
                )}
              </div>
            </fieldset>

            {error && <FormStatus tone="error">{error}</FormStatus>}

            <button type="submit" disabled={submitting || !selectedSlot} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-700 text-sm font-extrabold text-white shadow-lg shadow-violet-900/20 transition hover:bg-violet-800 disabled:opacity-60">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {submitting ? 'Requesting…' : 'Request booking'}
            </button>
            <p className="text-center text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              A booking request is not a confirmed job. The provider must accept it first.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
