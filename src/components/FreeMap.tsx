import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  /** Optional map price pill, same journey as a listing-price marker. */
  price?: string;
}

/**
 * Free, key-less map using Leaflet + OpenStreetMap tiles.
 * No Google Maps/API key required.
 */
export function FreeMap({
  points,
  center,
  zoom = 13,
  className,
  onSelect,
  ariaLabel,
}: {
  points: MapPoint[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  /** Called with the index of the clicked marker, for an open-detail action. */
  onSelect?: (index: number) => void;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start: [number, number] =
      center ?? (points[0] ? [points[0].lat, points[0].lng] : [17.385, 78.4867]);
    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView(start, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    points.forEach((p, index) => {
      const icon = p.price
        ? L.divIcon({
            className: '',
            html: `<div style="background:#222;color:#fff;border-radius:999px;padding:6px 10px;font:700 12px/1 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.28);white-space:nowrap;">${p.price.replace(/[<>]/g, '')}</div>`,
            iconSize: [72, 28],
            iconAnchor: [36, 14],
          })
        : L.divIcon({
            className: '',
            html: '<div style="width:26px;height:26px;border-radius:50%;background:#fd701e;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);"></div>',
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });
      const marker = L.marker([p.lat, p.lng], { icon }).bindPopup(p.label || 'Location');
      if (onSelect) {
        marker.on('click', () => onSelect(index));
      }
      marker.addTo(layer);
    });
    const fit = () => {
      map.invalidateSize();
      if (points.length > 1) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
        map.fitBounds(bounds.pad(0.12), { maxZoom: 12, animate: false });
      } else if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], zoom, { animate: false });
      }
    };
    const frame = window.requestAnimationFrame(fit);
    const timer = window.setTimeout(fit, 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [points, zoom, onSelect]);

  return <div ref={containerRef} role="application" aria-label={ariaLabel ?? 'Stay locations map'} className={className ?? 'h-56 w-full rounded-xl'} />;
}
