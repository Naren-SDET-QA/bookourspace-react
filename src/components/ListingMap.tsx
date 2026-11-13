import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { ExternalLink, MapPin } from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import {
  HYDERABAD_DEFAULT_MAP_CENTER,
  resolveListingMapLocation,
} from '../features/maps/mapLocations';

interface ListingMapProps {
  listings: MarketplaceListing[];
  onSelectListing: (listing: MarketplaceListing) => void;
  label: string;
}

const createPopup = (listing: MarketplaceListing, approximate: boolean) => {
  const container = document.createElement('div');
  container.className = 'space-y-1 text-slate-900';
  const title = document.createElement('strong');
  title.textContent = listing.title;
  const location = document.createElement('div');
  location.textContent = `${listing.location.area}${approximate ? ' · approximate area' : ''}`;
  location.className = 'text-xs text-slate-600';
  const price = document.createElement('div');
  price.textContent = `₹${listing.price.toLocaleString('en-IN')} ${listing.priceUnit}`;
  price.className = 'text-xs font-bold text-slate-700';
  container.append(title, location, price);
  return container;
};

export const ListingMap: React.FC<ListingMapProps> = ({ listings, onSelectListing, label }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mappedListings = useMemo(
    () =>
      listings
        .map((listing) => ({ listing, position: resolveListingMapLocation(listing) }))
        .filter((item): item is { listing: MarketplaceListing; position: NonNullable<typeof item.position> } => Boolean(item.position)),
    [listings]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds([]);
    mappedListings.forEach(({ listing, position }) => {
      const latLng = L.latLng(position.lat, position.lng);
      bounds.extend(latLng);
      const marker = L.circleMarker(latLng, {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: '#FF385C',
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup(createPopup(listing, position.accuracy === 'approximate'));
      marker.on('click', () => onSelectListing(listing));
    });

    if (mappedListings.length === 1) {
      map.setView(bounds.getCenter(), 13);
    } else if (mappedListings.length > 1) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 });
    } else {
      map.setView([HYDERABAD_DEFAULT_MAP_CENTER.lat, HYDERABAD_DEFAULT_MAP_CENTER.lng], 11);
    }

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      map.remove();
    };
  }, [mappedListings, onSelectListing]);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-xs dark:border-slate-800">
        <span className="flex items-center gap-1.5 font-black text-slate-800 dark:text-slate-100"><MapPin className="h-3.5 w-3.5 text-[#FF385C]" /> {label}</span>
        <span className="text-[10px] font-bold text-slate-500">{mappedListings.length} mapped · locality pins may be approximate</span>
      </div>
      <div ref={containerRef} className="h-72 w-full" role="application" aria-label={`${label} interactive map`} />
      <div className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-2 text-[10px] text-slate-500 dark:bg-slate-800/70">
        <span>OpenStreetMap tiles load only while this map is visible.</span>
        <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-slate-600 underline dark:text-slate-300">Report map issue <ExternalLink className="h-3 w-3" /></a>
      </div>
    </div>
  );
};
