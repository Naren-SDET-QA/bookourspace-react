import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidCoordinate } from '../lib/deliveryTracking';
import type { TrackingPoint } from '../lib/deliveryTrackingClient';

export type DeviceLocationError = 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED' | 'INSECURE_CONTEXT';

function mapError(error: GeolocationPositionError): DeviceLocationError {
  if (error.code === error.PERMISSION_DENIED) return 'PERMISSION_DENIED';
  if (error.code === error.POSITION_UNAVAILABLE) return 'POSITION_UNAVAILABLE';
  return 'TIMEOUT';
}

export function useDeviceLocation(enabled: boolean) {
  const [point, setPoint] = useState<TrackingPoint | null>(null);
  const [error, setError] = useState<DeviceLocationError | null>(null);
  const [watching, setWatching] = useState(false);
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    setWatching(false);
  }, []);

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
    setError(null);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!isValidCoordinate(latitude, longitude)) {
          setError('POSITION_UNAVAILABLE');
          return;
        }
        setError(null);
        setPoint({
          latitude,
          longitude,
          accuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
          capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
        });
      },
      (positionError) => setError(mapError(positionError)),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    setWatching(true);
    return stop;
  }, [enabled, stop]);

  // Browsers throttle or suspend geolocation when the tab/app is backgrounded.
  // Surface that honestly instead of presenting a frozen point as live.
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

  return { point, error, watching, backgroundPaused, stop };
}
