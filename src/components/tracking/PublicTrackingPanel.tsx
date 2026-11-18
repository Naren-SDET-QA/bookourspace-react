import { useEffect, useState } from 'react';
import { Clock3, Navigation, X } from 'lucide-react';
import { DeliveryTrackingMap } from './DeliveryTrackingMap';
import { fetchPublicTracking, type DeliveryTrackingSnapshot, type TrackingPoint } from '../../lib/deliveryTrackingClient';
import {
  formatDistance,
  formatEta,
  isGpsInaccurate,
  isLocationStale,
  journeyStatusLabel,
  trackingStatusLabel,
} from '../../lib/deliveryTracking';
import { gpsShareState, gpsShareStateLabel } from '../../lib/gpsPolicy';

function ageLabel(capturedAt: string | undefined, now = Date.now()): string {
  if (!capturedAt) return 'waiting';
  const seconds = Math.max(0, Math.floor((now - new Date(capturedAt).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)} m ago`;
}

export function PublicTrackingPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<DeliveryTrackingSnapshot | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchPublicTracking(token);
        if (!cancelled) {
          setSnapshot(next);
          setError('');
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'TRACKING_LINK_NOT_FOUND');
      }
    };
    void load();
    const poll = window.setInterval(() => { void load(); }, 8_000);
    const tick = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [token]);

  const point: TrackingPoint | null = snapshot?.latestLocation || null;
  const stale = point ? isLocationStale(point.capturedAt, now) : true;
  const shareState = snapshot
    ? gpsShareState({
      trackingEnabled: snapshot.trackingEnabled,
      status: snapshot.status,
      hasLocation: Boolean(point),
      stale,
      trackingStartedAt: snapshot.trackingStartedAt,
      trackingStoppedAt: snapshot.trackingStoppedAt,
      capturedAt: point?.capturedAt,
    })
    : 'waiting';

  return (
    <div className="fixed inset-0 z-[136] overflow-y-auto bg-slate-950/55" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Live delivery tracking" className="mx-auto my-4 w-[calc(100%-1rem)] max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-950">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-[#6d28d9]">
            <Navigation className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-black text-[#1f1650] dark:text-white">{snapshot?.title || 'Live tracking'}</h2>
            <p className="truncate text-[10px] font-semibold text-slate-500">{snapshot?.bookingRef || 'Secure tracking link'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close live tracking" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-3 p-4">
          {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">{error}</p>}
          {snapshot && (
            <>
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#7c3aed]">Journey</p>
                  <p className="mt-0.5 text-[15px] font-black text-[#1f1650] dark:text-white">{journeyStatusLabel(snapshot.journeyStatus)}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">{trackingStatusLabel(snapshot.status)}</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                    <Clock3 className="h-3 w-3" /> Last GPS {ageLabel(snapshot.latestLocation?.capturedAt, now)}
                  </p>
                </div>
                <span data-gps-state={shareState} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-600">
                  {gpsShareStateLabel(shareState)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Distance</p>
                  <p className="mt-1 text-sm font-black text-[#1f1650] dark:text-white">{formatDistance(snapshot.distanceMeters)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">ETA</p>
                  <p className="mt-1 text-sm font-black text-[#1f1650] dark:text-white">{formatEta(snapshot.etaSeconds)}</p>
                </div>
              </div>
              {isGpsInaccurate(snapshot.lastAccuracyMeters) && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">GPS accuracy is low. The map may be slightly off until a better fix arrives.</p>
              )}
              {snapshot.liveMapEnabled ? (
                <DeliveryTrackingMap point={point} destination={snapshot.destination} stale={stale} label="Assigned person live location" />
              ) : (
                <p className="rounded-xl bg-slate-50 p-3 text-[11px] font-semibold text-slate-600">The live map is turned off for this service.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PublicTrackingPanel;
