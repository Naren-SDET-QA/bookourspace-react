import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CalendarDays, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { getStoredAuthoritativeSessionToken } from '../lib/supabaseClient';
import { venueToday, venueWallTimeCandidates } from '../lib/venueTime';

type BusyInterval = { startsAt: string; endsAt: string; kind: string };

interface VenueAvailabilityCalendarProps {
  listingId: string;
  timeZone?: string;
  refreshKey: number;
  /** Returns true when PostgreSQL accepted the block. */
  onBlockDates: (startsAt: string, endsAt: string, reason: string) => Promise<boolean>;
}

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
const monthLabel = (date: Date) =>
  date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

async function request(path: string) {
  const headers = new Headers();
  const token = getStoredAuthoritativeSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
}

export function VenueAvailabilityCalendar({ listingId, timeZone='Asia/Kolkata', refreshKey, onBlockDates }: VenueAvailabilityCalendarProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(()=>{const today=venueToday(timeZone);const [year,monthIndex]=today.split('-').map(Number);setMonth(new Date(year,monthIndex-1,1));},[timeZone]);

  const load = useCallback(async () => {
    if (!listingId) return;
    setLoading(true);
    setError('');
    try {
      const first=dateKey(month.getFullYear(),month.getMonth(),1);const nextMonth=month.getMonth()===11?dateKey(month.getFullYear()+1,0,1):dateKey(month.getFullYear(),month.getMonth()+1,1);
      const from=venueWallTimeCandidates({date:first,time:'00:00'},timeZone)[0]?.toISOString();const to=venueWallTimeCandidates({date:nextMonth,time:'00:00'},timeZone)[0]?.toISOString();
      if(!from||!to)throw new Error('VENUE_LOCAL_CALENDAR_BOUNDARY_UNAVAILABLE');
      const data = await request(
        `/api/venues/${encodeURIComponent(listingId)}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setBusy(Array.isArray(data.busy) ? data.busy : []);
    } catch (caught) {
      setBusy([]);
      setError(caught instanceof Error ? caught.message.replaceAll('_', ' ') : 'CALENDAR_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }, [listingId, month, timeZone]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const cells = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    return [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [month]);

  const dayState = (day: number) => {
    const key=dateKey(month.getFullYear(),month.getMonth(),day);const next=new Date(`${key}T00:00:00Z`);next.setUTCDate(next.getUTCDate()+1);
    const start=venueWallTimeCandidates({date:key,time:'00:00'},timeZone)[0]?.getTime()??NaN;
    const end=venueWallTimeCandidates({date:next.toISOString().slice(0,10),time:'00:00'},timeZone)[0]?.getTime()??NaN;
    const overlapping = busy.filter((interval) => {
      const busyStart = new Date(interval.startsAt).getTime();
      const busyEnd = new Date(interval.endsAt).getTime();
      return busyStart < end && busyEnd > start;
    });
    const blocked = overlapping.some((interval) => interval.kind === 'blocked');
    const reserved = overlapping.some((interval) => interval.kind !== 'blocked');
    return { blocked, reserved, overlapping };
  };

  const selectDay = (day: number) => {
    const key = dateKey(month.getFullYear(), month.getMonth(), day);
    setNotice('');
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(key);
      setRangeEnd(key);
      return;
    }
    if (key < rangeStart) {
      setRangeStart(key);
      setRangeEnd(key);
      return;
    }
    setRangeEnd(key);
  };

  const submitBlock = async () => {
    if (!rangeStart) return;
    const endDay=new Date(`${rangeEnd||rangeStart}T00:00:00Z`);endDay.setUTCDate(endDay.getUTCDate()+1);
    const start=venueWallTimeCandidates({date:rangeStart,time:'00:00'},timeZone)[0];
    const end=venueWallTimeCandidates({date:endDay.toISOString().slice(0,10),time:'00:00'},timeZone)[0];
    if (!start || !end || end <= start) {
      setError('SELECT A VALID BLOCK RANGE');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await onBlockDates(start.toISOString(), end.toISOString(), reason.trim());
      if (saved) {
        setNotice(`Blocked ${rangeStart}${rangeEnd && rangeEnd !== rangeStart ? ` to ${rangeEnd}` : ''}.`);
        setRangeStart('');
        setRangeEnd('');
        setReason('');
      }
    } finally {
      setSaving(false);
    }
  };

  const [todayYear,todayMonth,todayDay]=venueToday(timeZone).split('-').map(Number);
  const today = new Date(todayYear,todayMonth-1,todayDay);
  const isCurrentMonth = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth();
  const selectedLabel = rangeStart
    ? rangeEnd && rangeEnd !== rangeStart
      ? `${rangeStart} → ${rangeEnd}`
      : rangeStart
    : 'No dates selected';

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <CalendarDays size={16} className="text-violet-700" /> Availability calendar
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="rounded-lg border p-1.5 text-slate-600"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-36 text-center text-xs font-bold">{monthLabel(month)}</span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="rounded-lg border p-1.5 text-slate-600"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <p className="mt-1 text-[11px] text-slate-500">
        Reserved reservations and owner blocks come from PostgreSQL. Pick a start and end day to block the whole range.
      </p>
      {loading && (
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <LoaderCircle size={13} className="animate-spin" /> Loading availability…
        </p>
      )}
      {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (day === null) return <span key={`empty-${index}`} />;
          const state = dayState(day);
          const key = dateKey(month.getFullYear(), month.getMonth(), day);
          const selected = rangeStart !== '' && key >= rangeStart && key <= (rangeEnd || rangeStart);
          const isToday = isCurrentMonth && today.getDate() === day;
          const tone = selected
            ? 'border-violet-700 bg-violet-700 text-white'
            : state.blocked
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : state.reserved
                ? 'border-violet-200 bg-violet-50 text-violet-800'
                : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300';
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectDay(day)}
              aria-pressed={selected}
              aria-label={`${key}${state.blocked ? ' blocked' : state.reserved ? ' reserved' : ' available'}`}
              title={state.overlapping.map((interval) => `${interval.kind}: ${new Date(interval.startsAt).toLocaleString()} – ${new Date(interval.endsAt).toLocaleString()}`).join('\n') || 'Available'}
              className={`relative flex h-10 flex-col items-center justify-center rounded-lg border text-xs font-bold transition ${tone} ${isToday ? 'ring-2 ring-amber-300' : ''}`}
            >
              {day}
              {(state.blocked || state.reserved) && (
                <span className={`mt-0.5 h-1 w-1 rounded-full ${selected ? 'bg-white' : state.blocked ? 'bg-rose-500' : 'bg-violet-600'}`} />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-600" /> Reserved</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Blocked</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Available</span>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 p-2">
        <p className="text-[11px] font-bold text-slate-700">Selected: {selectedLabel}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="text-[10px] font-semibold text-slate-500">
            Block reason (optional)
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 200))}
              placeholder="Maintenance, private event…"
              className="mt-1 h-9 w-full rounded border bg-white px-2 text-xs"
            />
          </label>
          <button
            type="button"
            disabled={saving || !rangeStart || loading}
            onClick={() => void submitBlock()}
            className="self-end rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Block selected dates'}
          </button>
          <button
            type="button"
            disabled={saving || !rangeStart}
            onClick={() => { setRangeStart(''); setRangeEnd(''); setNotice(''); }}
            className="self-end rounded-lg border px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
        {notice && <p role="status" className="mt-2 text-[11px] font-semibold text-emerald-700">{notice}</p>}
        <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
          <Ban size={11} /> Blocks that overlap a live reservation are refused by the database.
        </p>
      </div>
    </div>
  );
}
