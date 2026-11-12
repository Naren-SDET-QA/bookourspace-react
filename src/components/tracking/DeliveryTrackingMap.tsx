import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TrackingPoint } from '../../lib/deliveryTrackingClient';

export function DeliveryTrackingMap({ point, stale = false, label = 'Live location' }: { point: TrackingPoint | null; stale?: boolean; label?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
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
    return () => {
      markerRef.current?.remove();
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
      markerRef.current = null;
      accuracyRef.current = null;
      return;
    }
    const latlng: L.LatLngExpression = [point.latitude, point.longitude];
    if (!markerRef.current) {
      markerRef.current = L.marker(latlng, {
        icon: L.divIcon({
          className: '',
          html: `<span style="display:flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:9999px;background:${stale ? '#64748b' : '#7c3aed'};border:3px solid white;box-shadow:0 4px 14px rgba(15,23,42,.35);color:white;font-size:14px">●</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
      markerRef.current.setIcon(L.divIcon({
        className: '',
        html: `<span style="display:flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:9999px;background:${stale ? '#64748b' : '#7c3aed'};border:3px solid white;box-shadow:0 4px 14px rgba(15,23,42,.35);color:white;font-size:14px">●</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }));
    }
    if (point.accuracyMeters && point.accuracyMeters > 0) {
      if (!accuracyRef.current) {
        accuracyRef.current = L.circle(latlng, { radius: point.accuracyMeters, color: '#7c3aed', fillColor: '#c4b5fd', fillOpacity: 0.2, weight: 1 }).addTo(map);
      } else {
        accuracyRef.current.setLatLng(latlng).setRadius(point.accuracyMeters);
      }
    }
    map.setView(latlng, Math.max(map.getZoom(), 15), { animate: true });
  }, [point, stale]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
      <div ref={containerRef} className="h-[240px] w-full" aria-label={label} />
      {!point && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/90 px-6 text-center text-[12px] font-semibold text-slate-600 dark:bg-slate-900/90 dark:text-slate-300">
          Waiting for the assigned helper&apos;s real device GPS…
        </div>
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
