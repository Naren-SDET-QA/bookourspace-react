import { useCallback, useEffect, useRef, useState } from 'react';
import { isGpsInaccurate, isValidCoordinate } from '../lib/deliveryTracking';
import type { TrackingPoint } from '../lib/deliveryTrackingClient';

export type DeviceLocationError = 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED' | 'INSECURE_CONTEXT' | 'INACCURATE';
export type DeviceLocationPermission = 'prompt' | 'granted' | 'denied' | 'unknown';

function mapError(error: GeolocationPositionError): DeviceLocationError {
  if (error.code === error.PERMISSION_DENIED) return 'PERMISSION_DENIED';
  if (error.code === error.POSITION_UNAVAILABLE) return 'POSITION_UNAVAILABLE';
  return 'TIMEOUT';
}

function readPoint(position: GeolocationPosition): TrackingPoint | null {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  if (!isValidCoordinate(latitude, longitude)) return null;
  const headingValue = heading == null ? Number.NaN : Number(heading);
  const speedValue = speed == null ? Number.NaN : Number(speed);
  return {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
    headingDegrees: Number.isFinite(headingValue) && headingValue >= 0 ? headingValue : null,
    speedMps: Number.isFinite(speedValue) && speedValue >= 0 ? speedValue : null,
    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
  };
}

/** First fix: Wi-Fi / cached location so desktop and indoor browsers can start. */
const QUICK_OPTIONS: PositionOptions = { enableHighAccuracy: false, maximumAge: 30_000, timeout: 12_000 };
/** Follow-up precise GPS. */
const PRECISE_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 25_000 };
const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 };

export function useDeviceLocation(enabled: boolean) {
  const [point, setPoint] = useState<TrackingPoint | null>(null);
  const [error, setError] = useState<DeviceLocationError | null>(null);
  const [watching, setWatching] = useState(false);
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  const [permission, setPermission] = useState<DeviceLocationPermission>('unknown');
  const [epoch, setEpoch] = useState(0);
  const watchId = useRef<number | null>(null);
  const pointRef = useRef<TrackingPoint | null>(null);
  const deniedRef = useRef(false);

  const stop = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    setWatching(false);
  }, []);

  const retry = useCallback(() => {
    deniedRef.current = false;
    setError(null);
    setEpoch((value) => value + 1);
  }, []);

  const applyPoint = useCallback((position: GeolocationPosition) => {
    const next = readPoint(position);
    if (!next) {
      if (!pointRef.current) setError('POSITION_UNAVAILABLE');
      return;
    }
    pointRef.current = next;
    setPoint(next);
    setError(isGpsInaccurate(next.accuracyMeters) ? 'INACCURATE' : null);
  }, []);

  const applyError = useCallback((positionError: GeolocationPositionError) => {
    const mapped = mapError(positionError);
    if (mapped === 'PERMISSION_DENIED') {
      deniedRef.current = true;
      setPermission('denied');
      setError('PERMISSION_DENIED');
      stop();
      return;
    }
    if (!pointRef.current) setError(mapped);
  }, [stop]);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (!status || cancelled) return;
      const state = status.state;
      setPermission(state);
      if (state === 'denied') {
        deniedRef.current = true;
        setError('PERMISSION_DENIED');
        stop();
      }
    };
    void navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
      if (cancelled) return;
      status = result;
      setPermission(result.state);
      if (result.state === 'denied') {
        deniedRef.current = true;
        setError('PERMISSION_DENIED');
      }
      result.addEventListener('change', onChange);
    }).catch(() => {
      if (!cancelled) setPermission('unknown');
    });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, [enabled, stop]);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('UNSUPPORTED');
      return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('INSECURE_CONTEXT');
      return;
    }
    if (deniedRef.current) {
      setError('PERMISSION_DENIED');
      return;
    }

    setError(null);
    const geo = navigator.geolocation;
    geo.getCurrentPosition(applyPoint, (quickError) => {
      if (mapError(quickError) === 'PERMISSION_DENIED') {
        applyError(quickError);
        return;
      }
      geo.getCurrentPosition(applyPoint, applyError, PRECISE_OPTIONS);
    }, QUICK_OPTIONS);

    watchId.current = geo.watchPosition(applyPoint, applyError, WATCH_OPTIONS);
    setWatching(true);
    return stop;
  }, [enabled, stop, applyPoint, applyError, epoch]);

  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      setBackgroundPaused(hidden);
      if (hidden) setWatching(false);
      else if (enabled && watchId.current !== null) setWatching(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);

  return { point, error, watching, backgroundPaused, permission, retry, stop };
}
