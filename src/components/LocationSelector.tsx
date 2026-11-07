import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  MapPin, Search, LocateFixed, X, ChevronRight, ChevronLeft, Clock,
  Building2, Map, Check, WifiOff, Navigation, Landmark,
} from 'lucide-react';
import {
  INDIAN_STATES,
  POPULAR_CITIES,
  searchLocations,
  nearestCity,
  labelOf,
  locationKey,
  type IndiaCity,
} from '../data/indiaLocations';
import { getNativePosition } from '../lib/nativeLocation';
import type { NativeLocationDiagnostic } from '../lib/nativeLocationPermission';

export interface SelectedLocation {
  city: string;
  area?: string;
  label?: string;
  lat?: number;
  lng?: number;
}

interface LocationSelectorProps {
  open: boolean;
  onClose: () => void;
  selected?: SelectedLocation | null;
  onSelect: (loc: SelectedLocation) => void;
}

const RECENT_KEY = 'bos_recent_locations';
const SELECTED_KEY = 'bos_selected_location';

export function loadPersistedLocation(): SelectedLocation | null {
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SelectedLocation;
    return parsed && typeof parsed.city === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function persistLocation(loc: SelectedLocation) {
  try {
    localStorage.setItem(SELECTED_KEY, JSON.stringify(loc));
  } catch {
    /* storage unavailable — ignore */
  }
}

function loadRecent(): SelectedLocation[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function pushRecent(loc: SelectedLocation) {
  try {
    const key = `${loc.city}|${loc.area ?? ''}`.toLowerCase();
    const next = [loc, ...loadRecent().filter((r) => `${r.city}|${r.area ?? ''}`.toLowerCase() !== key)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function LocationSelector({ open, onClose, selected, onSelect }: LocationSelectorProps) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'home' | 'districts' | 'cities'>('home');
  const [activeState, setActiveState] = useState<string | null>(null);
  const [activeDistrict, setActiveDistrict] = useState<string | null>(null);
  const [gps, setGps] = useState<'idle' | 'locating' | 'denied' | 'unsupported' | 'error'>('idle');
  const [recent, setRecent] = useState<SelectedLocation[]>([]);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setView('home');
    setActiveState(null);
    setActiveDistrict(null);
    setGps('idle');
    setRecent(loadRecent());
    setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [open, onClose]);

  const results = useMemo(() => (query.trim() ? searchLocations(query, 40) : []), [query]);

  const stateObj = useMemo(() => INDIAN_STATES.find((s) => s.name === activeState) ?? null, [activeState]);
  const districtObj = useMemo(
    () => stateObj?.districts.find((d) => d.name === activeDistrict) ?? null,
    [stateObj, activeDistrict]
  );

  const choose = (loc: IndiaCity, area?: string) => {
    const payload: SelectedLocation = {
      city: loc.name,
      area: area ?? loc.name,
      label: labelOf(loc),
      lat: loc.lat,
      lng: loc.lng,
    };
    pushRecent(payload);
    onSelect(payload);
    onClose();
  };

  const chooseRecent = (r: SelectedLocation) => {
    pushRecent(r);
    onSelect(r);
    onClose();
  };

  const detect = async () => {
    if (Capacitor.isNativePlatform()) {
      setGps('locating');
      const detectionStartedAt = Date.now();
      const onDiagnostic = (event: NativeLocationDiagnostic) => {
        // Only stage, duration and native error code are emitted. Coordinates,
        // city and plugin message are never logged in any build.
        console.info('[native-location]', JSON.stringify(event));
      };
      try {
        const position = await getNativePosition(
          (options) => Geolocation.getCurrentPosition(options),
          () => Geolocation.requestPermissions({ permissions: ['coarseLocation'] }),
          () => Geolocation.checkPermissions(),
          onDiagnostic,
        );
        const { latitude, longitude } = position.coords;
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
          throw new Error('LOCATION_INVALID_COORDINATES');
        }
        setGps('idle');
        choose(nearestCity(latitude, longitude));
      } catch (error) {
        const errorCode = typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: unknown }).code
          : undefined;
        const safeCode = typeof errorCode === 'string' || typeof errorCode === 'number' ? String(errorCode) : undefined;
        console.info('[native-location]', JSON.stringify({
          stage: 'position-read', outcome: 'error', durationMs: Date.now() - detectionStartedAt, ...(safeCode ? { errorCode: safeCode } : {}),
        }));
        const message = error instanceof Error ? error.message : '';
        setGps(safeCode === 'OS-PLUG-GLOC-0003' || message === 'LOCATION_PERMISSION_DENIED' ? 'denied' : 'error');
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGps('unsupported'); return; }
    setGps('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const near = nearestCity(pos.coords.latitude, pos.coords.longitude);
        setGps('idle');
        choose(near);
      },
      (err) => {
        setGps(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 0 }
    );
  };

  if (!open) return null;

  const isSelected = (city: string, area?: string) =>
    selected?.city?.toLowerCase() === city.toLowerCase() &&
    (area ? (selected?.area ?? '').toLowerCase() === area.toLowerCase() : true);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Select your location"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[88vh] sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#5B21B6] to-[#7C3AED] px-5 pb-4 pt-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-purple-200">BookOurSpace</p>
              <h2 className="mt-0.5 text-[18px] font-black leading-tight">Select your location</h2>
              <p className="mt-0.5 text-[11px] text-purple-100">Choose city, town or village — applies to all modules.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close location selector"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-purple-500/20">
            <Search className="h-4 w-4 shrink-0 text-[#7C3AED]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city, district or village…"
              aria-label="Search city, district or village"
              className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="rounded-full p-0.5 text-slate-400 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {offline && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[10.5px] font-semibold text-amber-700">
              <WifiOff className="h-3 w-3" /> Offline — saved and built-in locations still work.
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {/* Search results */}
          {query.trim() ? (
            <div>
              {results.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <MapPin className="mx-auto h-6 w-6 text-[#7C3AED]" />
                  <p className="mt-2 text-[13px] font-bold text-slate-800">No location found for “{query.trim()}”</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Try a nearby city or browse by state below.</p>
                  <button type="button" onClick={() => setQuery('')} className="mt-3 rounded-full bg-[#7C3AED] px-4 py-1.5 text-[11.5px] font-bold text-white">
                    Browse states
                  </button>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {results.map((loc) => (
                    <li key={`${locationKey(loc)}`}>
                      <button
                        type="button"
                        onClick={() => choose(loc)}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-purple-50"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-[#7C3AED]">
                          <MapPin className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-slate-900">{loc.name}</span>
                          <span className="block truncate text-[10.5px] text-slate-500">{loc.district}, {loc.state}</span>
                        </span>
                        {isSelected(loc.name) && <Check className="h-4 w-4 shrink-0 text-emerald-500" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : view === 'home' ? (
            <div className="space-y-5">
              {/* GPS */}
              <button
                type="button"
                onClick={detect}
                disabled={gps === 'locating'}
                className="flex w-full items-center gap-3 rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-white px-3.5 py-3 text-left transition hover:border-[#7C3AED] hover:shadow-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B21B6] to-[#7C3AED] text-white">
                  <LocateFixed className={`h-4 w-4 ${gps === 'locating' ? 'animate-spin' : ''}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-slate-900">
                    {gps === 'locating' ? 'Detecting your location…' : 'Use my current location'}
                  </span>
                  <span className="block text-[10.5px] text-slate-500">
                    {gps === 'denied'
                      ? 'Location permission denied — pick a city below.'
                      : gps === 'unsupported'
                      ? 'GPS not supported on this device — pick a city below.'
                      : gps === 'error'
                      ? 'Could not get your location — pick a city below.'
                      : 'Uses GPS to find the nearest city.'}
                  </span>
                </span>
                <Navigation className="h-4 w-4 shrink-0 text-[#7C3AED]" />
              </button>
              {gps === 'denied' && (
                <p className="-mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-rose-600">
                  Allow location in device Settings to retry. You can always pick a city manually.
                </p>
              )}

              {/* Popular */}
              <div>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Popular cities</h3>
                <div className="grid grid-cols-4 gap-2">
                  {POPULAR_CITIES.map((loc) => (
                    <button
                      key={locationKey(loc)}
                      type="button"
                      onClick={() => choose(loc)}
                      className={`flex flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-2.5 transition ${
                        isSelected(loc.name) ? 'border-[#7C3AED] bg-purple-50' : 'border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/50'
                      }`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-[#7C3AED]">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <span className="w-full truncate text-center text-[10px] font-bold text-slate-700">{loc.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent */}
              {recent.length > 0 && (
                <div>
                  <h3 className="mb-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <Clock className="h-3 w-3" /> Recent
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((r, i) => (
                      <button
                        key={`${r.city}-${r.area ?? ''}-${i}`}
                        type="button"
                        onClick={() => chooseRecent(r)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-purple-300 hover:text-[#7C3AED]"
                      >
                        <MapPin className="h-3 w-3 text-[#7C3AED]" />
                        {r.city}{r.area && r.area !== r.city ? ` · ${r.area}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Browse by state */}
              <div>
                <h3 className="mb-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <Map className="h-3 w-3" /> Browse by state
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {INDIAN_STATES.map((s) => (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => { setActiveState(s.name); setActiveDistrict(null); setView('districts'); }}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-purple-300 hover:bg-purple-50/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-bold text-slate-800">{s.name}</span>
                        <span className="block text-[9.5px] text-slate-400">{s.districts.length} districts</span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : view === 'districts' && stateObj ? (
            <div>
              <button type="button" onClick={() => { setView('home'); setActiveState(null); }} className="mb-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-[#7C3AED]">
                <ChevronLeft className="h-3.5 w-3.5" /> All states
              </button>
              <h3 className="mb-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <Landmark className="h-3 w-3" /> {stateObj.name} · districts
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {stateObj.districts.map((d) => (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => { setActiveDistrict(d.name); setView('cities'); }}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-purple-300 hover:bg-purple-50/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-bold text-slate-800">{d.name}</span>
                      <span className="block text-[9.5px] text-slate-400">{d.cities.length} places</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          ) : view === 'cities' && stateObj && districtObj ? (
            <div>
              <button type="button" onClick={() => { setView('districts'); setActiveDistrict(null); }} className="mb-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-[#7C3AED]">
                <ChevronLeft className="h-3.5 w-3.5" /> {stateObj.name} districts
              </button>
              <h3 className="mb-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <MapPin className="h-3 w-3" /> {districtObj.name}
              </h3>
              <ul className="space-y-0.5">
                {districtObj.cities.map((loc) => (
                  <li key={locationKey(loc)}>
                    <button
                      type="button"
                      onClick={() => choose(loc)}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-purple-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-[#7C3AED]">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-slate-900">{loc.name}</span>
                        <span className="block truncate text-[10.5px] text-slate-500">{loc.type} · {loc.state}</span>
                      </span>
                      {isSelected(loc.name) && <Check className="h-4 w-4 shrink-0 text-emerald-500" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-4 py-2.5">
          <p className="text-center text-[10px] text-slate-400">
            {selected?.label ? `Current: ${selected.label}` : 'Verified Indian locations · works offline'}
          </p>
        </div>
      </div>
    </div>
  );
}
