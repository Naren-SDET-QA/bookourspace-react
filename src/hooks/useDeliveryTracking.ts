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
} from '../lib/deliveryTracking';

export function useDeliveryTracking(bookingId: string | null) {
  const [snapshot, setSnapshot] = useState<DeliveryTrackingSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(bookingId));
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [now, setNow] = useState(Date.now());

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
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToDeliveryTracking(bookingId, () => { void refresh(); });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'REALTIME_UNAVAILABLE');
    }
    const heartbeat = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      unsubscribe?.();
      window.clearInterval(heartbeat);
    };
  }, [bookingId, refresh]);

  const stale = snapshot?.latestLocation ? isLocationStale(snapshot.latestLocation.capturedAt, now) : true;
  const live = Boolean(snapshot && isLiveDeliveryStatus(snapshot.status) && snapshot.trackingEnabled && !isTerminalDeliveryStatus(snapshot.status));
  return {
    snapshot,
    loading,
    error,
    stale,
    live,
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
