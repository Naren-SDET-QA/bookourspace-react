import { useState } from 'react';
import { Clock3, Copy, MapPin, Navigation, Phone, ShieldCheck, X } from 'lucide-react';
import { DeliveryTrackingMap } from './DeliveryTrackingMap';
import { useDeliveryTracking } from '../../hooks/useDeliveryTracking';
import { createDeliveryOtp, type TrackingPoint } from '../../lib/deliveryTrackingClient';
import { DELIVERY_TRACKING_CONFIG, isTerminalDeliveryStatus, trackingStatusLabel } from '../../lib/deliveryTracking';
import { BOS_CALL_HREF } from '../../lib/contactNumbers';

function ageLabel(capturedAt: string | undefined, now = Date.now()): string {
  if (!capturedAt) return 'waiting';
  const seconds = Math.max(0, Math.floor((now - new Date(capturedAt).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function DeliveryTrackingPanel({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { snapshot, loading, error, stale, live, refresh } = useDeliveryTracking(bookingId);
  const [otp, setOtp] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [copied, setCopied] = useState(false);
  const config = snapshot ? DELIVERY_TRACKING_CONFIG[snapshot.serviceKind] : null;
  const point: TrackingPoint | null = snapshot?.latestLocation || null;

  const generateOtp = async () => {
    setOtpBusy(true);
    setOtpError('');
    try {
      setOtp(await createDeliveryOtp(bookingId));
    } catch (caught) {
      setOtpError(caught instanceof Error ? caught.message : 'OTP_UNAVAILABLE');
    } finally {
      setOtpBusy(false);
    }
  };

  const copyOtp = async () => {
    if (!otp) return;
    try {
      await navigator.clipboard.writeText(otp);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setOtpError('Could not copy the OTP.');
    }
  };

  return (
    <div className="fixed inset-0 z-[135] overflow-y-auto bg-slate-950/55" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Live delivery tracking" className="mx-auto my-4 w-[calc(100%-1rem)] max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-950">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-[#6d28d9] dark:bg-violet-950/60 dark:text-violet-300">
            <Navigation className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-black text-[#1f1650] dark:text-white">{config?.label || 'Live tracking'}</h2>
            <p className="truncate text-[10px] font-semibold text-slate-500">{snapshot?.bookingRef || bookingId}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close live tracking" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-3 p-4">
          {loading && <p className="rounded-xl bg-slate-50 p-3 text-[12px] font-semibold text-slate-500 dark:bg-slate-900">Loading booking tracking…</p>}
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Tracking unavailable: {error}. No location is shown unless the assigned helper publishes real device GPS.
            </div>
          )}

          {snapshot && (
            <>
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#7c3aed]">Status</p>
                  <p className="mt-0.5 text-[15px] font-black text-[#1f1650] dark:text-white">{trackingStatusLabel(snapshot.status)}</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                    <Clock3 className="h-3 w-3" /> Last GPS {ageLabel(snapshot.latestLocation?.capturedAt)}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${live && !stale ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {isTerminalDeliveryStatus(snapshot.status) ? 'Stopped' : live && !stale ? 'Live' : 'Not live'}
                </span>
              </div>

              <DeliveryTrackingMap point={point} stale={stale} label="Helper live location" />

              {point && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=17/${point.latitude}/${point.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 text-[11px] font-black text-violet-800 dark:border-violet-800 dark:text-violet-200"
                >
                  <MapPin className="h-4 w-4" /> Open location in OpenStreetMap
                </a>
              )}

              {snapshot.serviceKind === 'medicine_delivery' && (
                <div className={`rounded-xl border p-3 text-[11px] font-semibold ${snapshot.prescriptionStatus === 'verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  Prescription: {snapshot.prescriptionStatus.replace('_', ' ')}. {snapshot.prescriptionStatus !== 'verified' ? 'The OTP cannot be generated until pharmacy verification completes.' : 'Pharmacy verification complete.'}
                </div>
              )}

              {snapshot.serviceKind === 'water_delivery' && snapshot.recurrenceRule !== 'none' && (
                <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] font-semibold text-sky-800">Recurring delivery: {snapshot.recurrenceRule}.</p>
              )}

              {live && !isTerminalDeliveryStatus(snapshot.status) && (
                <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <h3 className="flex items-center gap-1.5 text-[12px] font-black text-[#1f1650] dark:text-white"><ShieldCheck className="h-4 w-4 text-emerald-600" /> {config?.otpLabel || 'Delivery OTP'}</h3>
                  <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">Generate a single-use in-app OTP. Show it to the assigned helper only at handover. It expires in 10 minutes and can be used once.</p>
                  {otp ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-xl bg-[#f5f3ff] px-4 py-2 text-2xl font-black tracking-[0.2em] text-[#5b21b6] dark:bg-violet-950/40 dark:text-violet-200">{otp}</span>
                      <button type="button" onClick={() => void copyOtp()} className="inline-flex h-9 items-center gap-1 rounded-lg border border-violet-200 px-2 text-[10px] font-black text-violet-800 dark:border-violet-800 dark:text-violet-200"><Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => void generateOtp()} disabled={otpBusy || (snapshot.serviceKind === 'medicine_delivery' && snapshot.prescriptionStatus !== 'verified')} className="mt-2 h-10 w-full rounded-xl bg-[#5b21b6] text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                      {otpBusy ? 'Generating…' : 'Generate single-use OTP'}
                    </button>
                  )}
                  {otpError && <p role="alert" className="mt-2 text-[10px] font-semibold text-rose-600">{otpError}</p>}
                </section>
              )}

              {isTerminalDeliveryStatus(snapshot.status) && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">This booking is {snapshot.status}. Tracking and OTP generation are stopped.</p>
              )}

              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-500">
                <a href={BOS_CALL_HREF} className="inline-flex items-center gap-1 font-black text-emerald-700"><Phone className="h-3.5 w-3.5" /> Call support</a>
                <button type="button" onClick={() => void refresh()} className="font-black text-[#6d28d9]">Refresh status</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DeliveryTrackingPanel;
