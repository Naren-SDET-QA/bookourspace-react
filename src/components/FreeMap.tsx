import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
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
}: {
  points: MapPoint[];
  center?: [number, number];
  zoom?: number;
  className?: string;
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
    const icon = L.divIcon({
      className: '',
      html: '<div style="width:26px;height:26px;border-radius:50%;background:#fd701e;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);"></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    points.forEach((p) => {
      L.marker([p.lat, p.lng], { icon }).addTo(layer).bindPopup(p.label || 'Location');
    });
    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], zoom);
    }
  }, [points, zoom]);

  return <div ref={containerRef} className={className ?? 'h-56 w-full rounded-xl'} />;
}
