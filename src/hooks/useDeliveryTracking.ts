import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDeliveryTracking,
  publishTrackingLocation,
  subscribeToDeliveryTracking,
  type DeliveryTrackingSnapshot,
  type TrackingPoint,
} from '../lib/deliveryTrackingClient';
import {
  TRACKING_STALE_AFTER_MS,
  isLocationStale,
  isTerminalDeliveryStatus,
  isLiveDeliveryStatus,
  nextTrackingPollDelay,
} from '../lib/deliveryTracking';
import { hasRealtimeTransport } from '../lib/deliveryTrackingClient';

export function useDeliveryTracking(bookingId: string | null) {
  const [snapshot, setSnapshot] = useState<DeliveryTrackingSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(bookingId));
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [visible, setVisible] = useState(() => (typeof document === 'undefined' ? true : document.visibilityState === 'visible'));

  const refresh = useCallback(async () => {
    if (!bookingId) return;
    try {
      const next = await fetchDeliveryTracking(bookingId);
      setSnapshot(next);
      setError('');
      setLastRefresh(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'TRACKING_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    const heartbeat = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      window.clearInterval(heartbeat);
    };
  }, [bookingId, refresh]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); void refresh(); };
    const onOffline = () => setOnline(false);
    const onVisibility = () => {
      const nextVisible = document.visibilityState === 'visible';
      setVisible(nextVisible);
      if (nextVisible) void refresh();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const trackingActive = Boolean(
    snapshot
      ? snapshot.trackingEnabled && !isTerminalDeliveryStatus(snapshot.status)
      : true,
  );

  // Realtime is the primary transport. This adaptive timer is the fallback and
  // a slow safety-net when Realtime is present; it stops entirely once tracking
  // is terminal or disabled.
  useEffect(() => {
    if (!bookingId || !trackingActive) return;
    let cancelled = false;
    let timer: number | undefined;
    const schedule = () => {
      if (cancelled) return;
      const delay = nextTrackingPollDelay({
        online,
        visible,
        status: snapshot?.status || 'requested',
        trackingEnabled: snapshot?.trackingEnabled !== false,
        hasLocation: Boolean(snapshot?.latestLocation),
        capturedAt: snapshot?.latestLocation?.capturedAt || null,
        realtime: hasRealtimeTransport,
      });
      if (delay === null) return;
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        await refresh();
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    bookingId,
    trackingActive,
    online,
    visible,
    snapshot?.status,
    snapshot?.trackingEnabled,
    snapshot?.latestLocation?.capturedAt,
    refresh,
  ]);

  // Realtime subscription is also dropped as soon as tracking is inactive.
  useEffect(() => {
    if (!bookingId || !trackingActive) return;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToDeliveryTracking(bookingId, () => { void refresh(); });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'REALTIME_UNAVAILABLE');
    }
    return () => { unsubscribe?.(); };
  }, [bookingId, trackingActive, refresh]);

  const stale = snapshot?.latestLocation ? isLocationStale(snapshot.latestLocation.capturedAt, now) : true;
  const live = Boolean(snapshot && isLiveDeliveryStatus(snapshot.status) && snapshot.trackingEnabled && !isTerminalDeliveryStatus(snapshot.status));
  return {
    snapshot,
    loading,
    error,
    stale,
    live,
    online,
    lastRefresh,
    staleAfterMs: TRACKING_STALE_AFTER_MS,
    refresh,
  };
}

/** Publishes a real device location at a bounded interval while sharing is on. */
export function useHelperLocationPublisher(bookingId: string | null, enabled: boolean, point: TrackingPoint | null, status: string | undefined) {
  const [publishedAt, setPublishedAt] = useState<number | null>(null);
  const [publishError, setPublishError] = useState('');
  const lastSent = useRef(0);

  useEffect(() => {
    if (!bookingId || !enabled || !point || !status || !isLiveDeliveryStatus(status as any)) return;
    const captured = new Date(point.capturedAt).getTime();
    if (!Number.isFinite(captured) || Date.now() - captured > 30_000) return;
    if (captured - lastSent.current < 10_000) return;
    lastSent.current = captured;
    void publishTrackingLocation(bookingId, point)
      .then(() => {
        setPublishedAt(Date.now());
        setPublishError('');
      })
      .catch((caught) => setPublishError(caught instanceof Error ? caught.message : 'LOCATION_PUBLISH_FAILED'));
  }, [bookingId, enabled, point, status]);

  return { publishedAt, publishError };
}
