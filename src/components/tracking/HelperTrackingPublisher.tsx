import { useState } from 'react';
import { CheckCircle2, MapPin, Navigation, ShieldCheck, X } from 'lucide-react';
import { DeliveryTrackingMap } from './DeliveryTrackingMap';
import { useDeliveryTracking, useHelperLocationPublisher } from '../../hooks/useDeliveryTracking';
import { useDeviceLocation } from '../../hooks/useDeviceLocation';
import { verifyDeliveryOtp } from '../../lib/deliveryTrackingClient';
import { DELIVERY_TRACKING_CONFIG, isTerminalDeliveryStatus, isLiveDeliveryStatus, normalizeOtp, trackingStatusLabel } from '../../lib/deliveryTracking';

export function HelperTrackingPublisher({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { snapshot, error } = useDeliveryTracking(bookingId);
  const [sharing, setSharing] = useState(false);
  const { point, error: gpsError, watching, backgroundPaused } = useDeviceLocation(sharing);
  const { publishedAt, publishError } = useHelperLocationPublisher(bookingId, sharing, point, snapshot?.status);
  const [otp, setOtp] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const config = snapshot ? DELIVERY_TRACKING_CONFIG[snapshot.serviceKind] : null;
  const live = Boolean(snapshot && isLiveDeliveryStatus(snapshot.status) && snapshot.trackingEnabled && !isTerminalDeliveryStatus(snapshot.status));

  const verify = async () => {
    const normalized = normalizeOtp(otp);
    if (!normalized) {
      setOtpMessage('Enter the 6-digit OTP shown by the customer.');
      return;
    }
    setOtpBusy(true);
    setOtpMessage('');
    try {
      const ok = await verifyDeliveryOtp(bookingId, normalized);
      setOtpMessage(ok ? 'OTP verified once. Handover recorded.' : 'OTP did not match. Ask the customer to check it.');
      if (ok) setOtp('');
    } catch (caught) {
      setOtpMessage(caught instanceof Error ? caught.message : 'OTP verification failed.');
    } finally {
      setOtpBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[136] overflow-y-auto bg-slate-950/55" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Helper live location sharing" className="mx-auto my-4 w-[calc(100%-1rem)] max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-950">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"><Navigation className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-black text-[#1f1650] dark:text-white">{config?.label || 'Delivery'} tracking</h2>
            <p className="truncate text-[10px] font-semibold text-slate-500">{snapshot?.bookingRef || bookingId}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close helper tracking" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-3 p-4">
          {error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">{error}</p>}
          {snapshot && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Booking status</p>
                  <p className="text-[14px] font-black text-[#1f1650] dark:text-white">{trackingStatusLabel(snapshot.status)}</p>
                </div>
                <span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-violet-700">{live ? 'Tracking allowed' : 'Tracking stopped'}</span>
              </div>

              {!live ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  GPS sharing is available only while this booking is accepted or in progress. It stops automatically when the booking completes or is cancelled.
                </p>
              ) : (
                <>
                  <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                    <h3 className="flex items-center gap-1.5 text-[12px] font-black text-[#1f1650] dark:text-white"><MapPin className="h-4 w-4 text-violet-600" /> Real device GPS</h3>
                    <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">Your browser will ask for location permission. BookOurSpace never invents a location. Keep this screen open while travelling.</p>
                    <button type="button" onClick={() => setSharing((value) => !value)} className={`mt-2 h-10 w-full rounded-xl text-[11px] font-black text-white ${sharing ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                      {sharing ? 'Stop sharing location' : 'Share live location'}
                    </button>
                    {gpsError && <p className="mt-2 text-[10px] font-semibold text-rose-600">GPS: {gpsError === 'PERMISSION_DENIED' ? 'Permission denied. Allow location access in the browser settings.' : gpsError}</p>}
                    {backgroundPaused && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[10px] font-semibold text-amber-800">This browser paused GPS while the tab is in the background. Reopen the screen to resume live updates.</p>}
                    {publishError && <p className="mt-2 text-[10px] font-semibold text-rose-600">Publish failed: {publishError}</p>}
                    {watching && !gpsError && <p className="mt-2 text-[10px] font-semibold text-emerald-700">Watching device GPS…{publishedAt ? ' last update sent' : ' waiting for first fix'}</p>}
                  </section>
                  <DeliveryTrackingMap point={point} stale={false} label="Your live location" />
                </>
              )}

              <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <h3 className="flex items-center gap-1.5 text-[12px] font-black text-[#1f1650] dark:text-white"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Verify customer OTP</h3>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">Ask the customer for the 6-digit in-app {config?.otpLabel || 'delivery OTP'} at handover. It is single-use and expires in 10 minutes.</p>
                <div className="mt-2 flex gap-2">
                  <input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" maxLength={6} placeholder="000000" aria-label="Customer delivery OTP" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-center text-lg font-black tracking-[0.2em] outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900" />
                  <button type="button" onClick={() => void verify()} disabled={otpBusy} className="rounded-xl bg-[#5b21b6] px-4 text-[11px] font-black text-white disabled:opacity-50">{otpBusy ? 'Checking…' : 'Verify'}</button>
                </div>
                {otpMessage && <p className={`mt-2 flex items-center gap-1 text-[10px] font-semibold ${otpMessage.startsWith('OTP verified') ? 'text-emerald-700' : 'text-rose-600'}`}><CheckCircle2 className="h-3 w-3" /> {otpMessage}</p>}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default HelperTrackingPublisher;
