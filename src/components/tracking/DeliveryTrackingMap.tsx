import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TrackingPoint } from '../../lib/deliveryTrackingClient';

function helperIcon(stale: boolean) {
  return L.divIcon({
    className: '',
    html: `<span style="display:flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:9999px;background:${stale ? '#64748b' : '#7c3aed'};border:3px solid white;box-shadow:0 4px 14px rgba(15,23,42,.35);color:white;font-size:14px">●</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const destinationIcon = L.divIcon({
  className: '',
  html: '<span style="display:flex;width:26px;height:26px;align-items:center;justify-content:center;border-radius:8px;background:#059669;border:3px solid white;box-shadow:0 4px 14px rgba(15,23,42,.35);color:white;font-size:11px;font-weight:800">D</span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

export function DeliveryTrackingMap({
  point,
  destination = null,
  stale = false,
  label = 'Live location',
  className = '',
  waitingMessage = 'Waiting for the assigned person\'s real device GPS…',
}: {
  point: TrackingPoint | null;
  destination?: { latitude: number; longitude: number } | null;
  stale?: boolean;
  label?: string;
  className?: string;
  waitingMessage?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const destinationRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    }).setView([20.5937, 78.9629], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      markerRef.current?.remove();
      destinationRef.current?.remove();
      lineRef.current?.remove();
      accuracyRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!point) {
      markerRef.current?.remove();
      accuracyRef.current?.remove();
      lineRef.current?.remove();
      markerRef.current = null;
      accuracyRef.current = null;
      lineRef.current = null;
    } else {
      const latlng: L.LatLngExpression = [point.latitude, point.longitude];
      if (!markerRef.current) {
        markerRef.current = L.marker(latlng, { icon: helperIcon(stale) }).addTo(map);
      } else {
        markerRef.current.setLatLng(latlng);
        markerRef.current.setIcon(helperIcon(stale));
      }
      if (point.accuracyMeters && point.accuracyMeters > 0) {
        if (!accuracyRef.current) {
          accuracyRef.current = L.circle(latlng, { radius: point.accuracyMeters, color: '#7c3aed', fillColor: '#c4b5fd', fillOpacity: 0.2, weight: 1 }).addTo(map);
        } else {
          accuracyRef.current.setLatLng(latlng).setRadius(point.accuracyMeters);
        }
      }
    }

    if (destination && Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude)) {
      const destLatLng: L.LatLngExpression = [destination.latitude, destination.longitude];
      if (!destinationRef.current) {
        destinationRef.current = L.marker(destLatLng, { icon: destinationIcon }).addTo(map);
      } else {
        destinationRef.current.setLatLng(destLatLng);
      }
      if (point) {
        const linePoints: L.LatLngExpression[] = [[point.latitude, point.longitude], destLatLng];
        if (!lineRef.current) {
          lineRef.current = L.polyline(linePoints, { color: '#7c3aed', weight: 3, dashArray: '6 8', opacity: 0.8 }).addTo(map);
        } else {
          lineRef.current.setLatLngs(linePoints);
        }
        map.fitBounds(L.latLngBounds(linePoints), { padding: [28, 28], maxZoom: 16, animate: true });
      } else {
        map.setView(destLatLng, Math.max(map.getZoom(), 14), { animate: true });
      }
    } else if (point) {
      destinationRef.current?.remove();
      destinationRef.current = null;
      lineRef.current?.remove();
      lineRef.current = null;
      map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 15), { animate: true });
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [point?.latitude, point?.longitude, point?.capturedAt, point?.accuracyMeters, destination?.latitude, destination?.longitude, stale]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900 ${className}`}
      data-provider-lat={point ? String(point.latitude) : ''}
      data-provider-lng={point ? String(point.longitude) : ''}
      data-customer-lat={destination ? String(destination.latitude) : ''}
      data-customer-lng={destination ? String(destination.longitude) : ''}
      data-captured-at={point?.capturedAt || ''}
    >
      <div ref={containerRef} className="h-full min-h-[224px] w-full" aria-label={label} />
      {!point && !destination && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/90 px-6 text-center text-[12px] font-semibold text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
          {waitingMessage}
        </div>
      )}
      {!point && destination && (
        <span className="pointer-events-none absolute left-2 right-2 top-2 z-[400] rounded-lg bg-white/95 px-2 py-1 text-center text-[10px] font-semibold text-slate-600 shadow">
          {waitingMessage}
        </span>
      )}
      {point && stale && (
        <span className="absolute left-2 top-2 rounded-full bg-slate-900/85 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white">
          Location stale
        </span>
      )}
    </div>
  );
}

export default DeliveryTrackingMap;
