import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { localDateInputValue } from '../../lib/stayFilters';

export interface StaySearchValue {
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  petsAllowed: boolean;
}

function GuestStepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-[#717171] dark:text-slate-400">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b0b0b0] text-lg disabled:opacity-30 dark:border-slate-600"
        >
          −
        </button>
        <span className="w-5 text-center text-sm font-semibold" aria-live="polite">{value}</span>
        <button
          type="button"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`Increase ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b0b0b0] text-lg disabled:opacity-30 dark:border-slate-600"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function StaySearchBar({
  onSearch,
  busy,
  initial,
}: {
  onSearch: (value: StaySearchValue) => void;
  busy: boolean;
  initial: StaySearchValue;
}) {
  const today = useMemo(() => localDateInputValue(), []);
  const [where, setWhere] = useState(initial.destination);
  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut);
  const [adults, setAdults] = useState(Math.max(1, initial.guests));
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [pets, setPets] = useState(initial.petsAllowed);
  const [whoOpen, setWhoOpen] = useState(false);
  const whoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWhere(initial.destination);
    setCheckIn(initial.checkIn);
    setCheckOut(initial.checkOut);
    setAdults(Math.max(1, initial.guests));
    setPets(initial.petsAllowed);
  }, [initial.destination, initial.checkIn, initial.checkOut, initial.guests, initial.petsAllowed]);

  useEffect(() => {
    if (!whoOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (whoRef.current && !whoRef.current.contains(event.target as Node)) setWhoOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [whoOpen]);

  const guestCount = adults + children;
  const whoLabel = [
    `${guestCount} guest${guestCount === 1 ? '' : 's'}`,
    infants ? `${infants} infant${infants === 1 ? '' : 's'}` : '',
    pets ? 'pets' : '',
  ].filter(Boolean).join(', ');

  const submit = () => {
    onSearch({
      destination: where.trim(),
      checkIn,
      checkOut,
      guests: Math.max(1, guestCount),
      petsAllowed: pets,
    });
    setWhoOpen(false);
  };

  return (
    <form
      role="search"
      aria-label="Search stays by destination, dates and guests"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="grid w-full grid-cols-2 gap-0 overflow-visible rounded-2xl border border-[#dddddd] bg-white shadow-sm transition hover:shadow-md sm:h-16 sm:grid-cols-[minmax(0,1fr)_100px_100px_112px_44px] sm:items-center sm:rounded-full dark:border-slate-700 dark:bg-slate-900"
    >
      <label className="col-span-2 flex min-w-0 cursor-pointer flex-col justify-center px-4 py-2.5 sm:col-auto sm:h-full sm:flex-1 sm:rounded-l-full sm:px-6 sm:py-0 sm:hover:bg-[#f7f7f7] dark:sm:hover:bg-slate-800">
        <span className="block text-[11px] font-bold text-[#222222] dark:text-slate-100">Where</span>
        <input
          value={where}
          onChange={(event) => setWhere(event.target.value)}
          placeholder="Search destinations"
          autoComplete="address-level2"
          aria-label="Destination"
          className="h-5 w-full bg-transparent text-sm text-[#222222] outline-none placeholder:text-[#717171] dark:text-slate-100 dark:placeholder:text-slate-400"
        />
      </label>
      <span className="hidden h-8 w-px shrink-0 bg-[#dddddd] dark:bg-slate-700" aria-hidden="true" />
      <label className="min-w-0 cursor-pointer border-t border-[#ebebeb] px-4 py-2.5 sm:flex sm:h-full sm:flex-col sm:justify-center sm:border-t-0 sm:px-4 sm:py-0 sm:hover:bg-[#f7f7f7] dark:border-slate-800 dark:sm:hover:bg-slate-800">
        <span className="block text-[11px] font-bold text-[#222222] dark:text-slate-100">Check in</span>
        <input
          type="date"
          value={checkIn}
          min={today}
          onChange={(event) => {
            const next = event.target.value;
            setCheckIn(next);
            if (next && (!checkOut || checkOut <= next)) {
              const nextDay = new Date(`${next}T00:00:00`);
              nextDay.setDate(nextDay.getDate() + 1);
              setCheckOut(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`);
            }
          }}
          aria-label="Check-in date"
          className="w-full bg-transparent text-sm text-[#222222] outline-none dark:text-slate-200"
        />
      </label>
      <span className="hidden h-8 w-px shrink-0 bg-[#dddddd] dark:bg-slate-700" aria-hidden="true" />
      <label className="min-w-0 cursor-pointer border-t border-l border-[#ebebeb] px-4 py-2.5 sm:flex sm:h-full sm:flex-col sm:justify-center sm:border-t-0 sm:border-l-0 sm:px-4 sm:py-0 sm:hover:bg-[#f7f7f7] dark:border-slate-800 dark:sm:hover:bg-slate-800">
        <span className="block text-[11px] font-bold text-[#222222] dark:text-slate-100">Check out</span>
        <input
          type="date"
          value={checkOut}
          min={checkIn || today}
          onChange={(event) => setCheckOut(event.target.value)}
          aria-label="Check-out date"
          className="w-full bg-transparent text-sm text-[#222222] outline-none dark:text-slate-200"
        />
      </label>
      <span className="hidden h-8 w-px shrink-0 bg-[#dddddd] dark:bg-slate-700" aria-hidden="true" />
      <div ref={whoRef} className="relative col-span-1 min-w-0 border-t border-[#ebebeb] px-4 py-2.5 sm:h-full sm:border-t-0 sm:px-4 sm:py-0 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setWhoOpen((open) => !open)}
          aria-expanded={whoOpen}
          aria-haspopup="dialog"
          aria-label={`Guests, currently ${whoLabel}`}
          className="flex h-full w-full flex-col justify-center text-left"
        >
          <span className="block text-[11px] font-bold text-[#222222] dark:text-slate-100">Who</span>
          <span className="truncate text-sm text-[#222222] dark:text-slate-200">{whoLabel}</span>
        </button>
        {whoOpen && (
          <div className="absolute right-0 z-40 mt-3 w-[min(92vw,340px)] rounded-3xl border border-[#ebebeb] bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-label="Guests">
            <GuestStepper label="Adults" hint="Ages 13+" value={adults} min={1} max={16} onChange={setAdults} />
            <GuestStepper label="Children" hint="Ages 2–12" value={children} min={0} max={8} onChange={setChildren} />
            <GuestStepper label="Infants" hint="Under 2 — not counted as guests" value={infants} min={0} max={5} onChange={setInfants} />
            <div className="flex items-center justify-between border-t border-[#ebebeb] pt-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-semibold">Pets</p>
                <p className="text-xs text-[#717171] dark:text-slate-400">Filters stays that allow pets</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Pets"
                aria-checked={pets}
                onClick={() => setPets((value) => !value)}
                className={`relative h-6 w-11 rounded-full transition ${pets ? 'bg-[#222222] dark:bg-white' : 'bg-[#b0b0b0]'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all dark:bg-slate-900 ${pets ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="col-span-1 m-2 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f97316] px-3 text-sm font-semibold text-white transition hover:bg-[#ea580c] disabled:opacity-60 sm:h-12 sm:w-12 sm:rounded-full sm:px-0"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span className="sm:hidden">Search</span>
        <span className="sr-only">Search</span>
      </button>
    </form>
  );
}
