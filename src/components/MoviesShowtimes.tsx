import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, Film, Loader2, MapPin, Pencil, RotateCcw, Search, ShieldCheck, X } from 'lucide-react';
import { SectionStyleTabs } from './sectionStyle/SectionStyleTabs';
import { saveStylePreference } from '../lib/sectionStyleSettings';
import { StyleThreeList } from './sectionStyle/StyleThreeList';
import { useMarketplace } from '../context/MarketplaceContext';
import { LastUpdated } from './ui/LastUpdated';

interface ShowtimeScreen {
  id: string;
  screenId: string;
  cinemaListingId: string;
  cinemaTitle: string;
  movieTitle: string | null;
  movieId: string | null;
  showDate: string | null;
  screenName: string;
  city: string | null;
  state: string | null;
  area: string | null;
  pincode: string | null;
  showtimes: string[];
  format: string;
  soundSystem: string;
  isVisible: boolean;
  approvalStatus?: 'pending' | 'approved' | 'disabled';
  updatedAt: string;
  source: string | null;
}

interface MoviesShowtimesProps {
  selectedCity?: string;
  inline?: boolean;
  onClose?: () => void;
  style?: 'experience' | 'classic' | 'style3';
}

const ALL = 'All cities';

/**
 * Showtimes-only Movies directory.
 *
 * Movies -> theatres -> real showtimes filtered by city / area / PIN. There is
 * deliberately no seat selection, booking, payment, ticket or refund surface
 * here; the legacy booking engine stays in the codebase but is not rendered.
 */
export function MoviesShowtimes({ selectedCity = 'All Cities', inline = false, onClose, style = 'experience' }: MoviesShowtimesProps) {
  const [activeStyle, setActiveStyle] = useState<'experience' | 'classic' | 'style3'>(style);
  useEffect(() => { setActiveStyle(style); }, [style]);
  const changeStyle = (value: 1 | 2 | 3) => {
    const next = value === 1 ? 'experience' : value === 2 ? 'classic' : 'style3';
    saveStylePreference('movies', next);
    setActiveStyle(next);
    window.location.hash = `movies/style${value}`;
  };
  const { authUser } = useMarketplace();
  const canManage = authUser?.role === 'admin' || authUser?.role === 'provider';
  const [screens, setScreens] = useState<ShowtimeScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedInMs, setLoadedInMs] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [city, setCity] = useState(selectedCity && selectedCity !== 'All Cities' ? selectedCity : ALL);
  const [state, setState] = useState('All states');
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const [pin, setPin] = useState('');
  const [movie, setMovie] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShowtimeScreen | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const started = performance.now();
    setLoading(true);
    setError('');
    try {
      const token = window.localStorage.getItem('bos_session_token_v1');
      const response = await fetch(`/api/movies/showtimes${canManage ? '?includeHidden=1' : ''}`, {
        headers: token ? { 'x-bos-session-token': token } : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(data?.message || 'Showtimes could not be loaded.');
        setScreens([]);
        return;
      }
      setScreens(Array.isArray(data.screens) ? data.screens : []);
      setLastUpdated(typeof data.lastUpdated === 'string' ? data.lastUpdated : null);
    } catch {
      setError('Showtimes could not be loaded.');
    } finally {
      setLoading(false);
      setLoadedInMs(Math.round(performance.now() - started));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  useEffect(() => {
    if (selectedCity && selectedCity !== 'All Cities') setCity(selectedCity);
  }, [selectedCity]);

  const cities = useMemo(() => {
    const values = Array.from(new Set(screens.map((screen) => screen.city).filter(Boolean) as string[])).sort();
    return [ALL, ...values];
  }, [screens]);

  const filtered = useMemo(() => {
    const areaNeedle = area.trim().toLowerCase();
    const pinNeedle = pin.trim();
    return screens.filter((screen) => {
      if (!screen.isVisible && !canManage) return false;
      const needle = query.trim().toLowerCase();
      if (needle && !`${screen.movieTitle || ''} ${screen.cinemaTitle || ''} ${screen.screenName || ''}`.toLowerCase().includes(needle)) return false;
      if (state !== 'All states' && screen.state !== state) return false;
      if (city !== ALL && (screen.city || '').toLowerCase() !== city.toLowerCase()) return false;
      if (areaNeedle && !`${screen.area || ''}`.toLowerCase().includes(areaNeedle)) return false;
      if (pinNeedle && !`${screen.pincode || ''}`.startsWith(pinNeedle)) return false;
      return true;
    });
  }, [screens, query, state, city, area, pin, canManage]);

  const movies = useMemo(() => {
    const groups = new Map<string, ShowtimeScreen[]>();
    for (const screen of filtered) {
      const title = screen.movieTitle || 'Movie not assigned';
      const list = groups.get(title) || [];
      list.push(screen);
      groups.set(title, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const selectedMovieScreens = movie ? (movies.find(([title]) => title === movie)?.[1] || []) : [];
  const theatres = useMemo(() => {
    const map = new Map<string, { cinema: string; area: string; city: string; pin: string; screens: ShowtimeScreen[] }>();
    for (const screen of selectedMovieScreens) {
      const key = screen.cinemaTitle;
      const entry = map.get(key) || {
        cinema: screen.cinemaTitle,
        area: screen.area || '',
        city: screen.city || '',
        pin: screen.pincode || '',
        screens: [],
      };
      entry.screens.push(screen);
      map.set(key, entry);
    }
    return Array.from(map.values());
  }, [selectedMovieScreens]);

  const approve = async (screen: ShowtimeScreen, status: 'approved' | 'disabled') => {
    setSaving(true); setError('');
    try {
      const token = window.localStorage.getItem('bos_session_token_v1');
      const response = await fetch(`/api/admin/movies/theatres/${encodeURIComponent(screen.id)}/approval`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-bos-session-token': token } : {}) },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) { setError(data?.message || 'The theatre visibility was not updated.'); return; }
      setScreens((current) => current.map((row) => row.id === data.screen.id ? data.screen : row));
    } catch { setError('The theatre visibility was not updated.'); }
    finally { setSaving(false); }
  };

  const save = async (form: ShowtimeScreen, values: { showtimes: string; movieTitle: string; showDate: string; state: string; city: string; area: string; pincode: string; isVisible: boolean }) => {
    setSaving(true);
    setError('');
    try {
      const times = values.showtimes.split(',').map((time) => time.trim()).filter(Boolean);
      const token = window.localStorage.getItem('bos_session_token_v1');
      const response = await fetch(`/api/movies/showtimes/${encodeURIComponent(form.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-bos-session-token': token } : {}) },
        body: JSON.stringify({
          movieTitle: values.movieTitle,
          showDate: values.showDate,
          city: values.city,
          state: values.state,
          area: values.area,
          pincode: values.pincode,
          showtimes: times,
          isVisible: values.isVisible,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(data?.message || 'The showtimes were not saved.');
        return;
      }
      setScreens((current) => current.map((screen) => (screen.id === data.screen.id ? data.screen : screen)));
      setEditing(null);
    } catch {
      setError('The showtimes were not saved.');
    } finally {
      setSaving(false);
    }
  };

  const shellClass = inline
    ? 'w-full bg-[#f7f8fc]'
    : 'fixed inset-0 z-[71] overflow-y-auto bg-[#f7f8fc]';

  return (
    <div className={shellClass} role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : true} aria-label="Movies and showtimes">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2.5 sm:px-5">
          {!inline && onClose && (
            <button type="button" onClick={onClose} aria-label="Back to all sections" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white"><Film className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-black text-slate-900 sm:text-lg">Movies & showtimes</h1>
            <p className="text-[10.5px] text-slate-500">Movies → nearby theatres → real timings. No online booking for Movies.</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[11px] font-bold text-slate-700" aria-label="Refresh showtimes">
            <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      <SectionStyleTabs
        active={activeStyle === 'experience' ? 1 : activeStyle === 'classic' ? 2 : 3}
        onChange={changeStyle}
        label="Movies display style"
        className="border-b border-slate-200 bg-white"
      />

      <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-3" aria-label="Location filters">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-44 flex-[1.2] text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Search movie or theatre
              <span className="mt-1 flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Movie or theatre" className="w-full bg-transparent text-sm font-semibold outline-none" />
              </span>
            </label>
            <label className="min-w-40 flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              State
              <select value={state} onChange={(event) => setState(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900">
                <option value="All states">All states</option>
                <option value="Andhra Pradesh">Andhra Pradesh</option>
                <option value="Telangana">Telangana</option>
                <option value="Karnataka">Karnataka</option>
              </select>
            </label>
            <label className="min-w-40 flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              City
              <select value={city} onChange={(event) => setCity(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900">
                {cities.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="min-w-36 flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Area
              <span className="mt-1 flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input value={area} onChange={(event) => setArea(event.target.value)} placeholder="e.g. Gachibowli" className="w-full bg-transparent text-sm font-semibold outline-none" />
              </span>
            </label>
            <label className="min-w-32 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              PIN code
              <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="500032" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" />
            </label>
            {(area || pin || city !== ALL) && (
              <button type="button" onClick={() => { setCity(ALL); setArea(''); setPin(''); setQuery(''); }} className="h-10 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-600">Reset</button>
            )}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-500">
            <ShieldCheck className="h-3 w-3 text-emerald-600" />
            Showtimes are updated by theatres/admins and authorized daily sync. No seats, tickets, payments or refunds.
            <span className="ml-auto font-semibold">
              {lastUpdated ? <LastUpdated at={lastUpdated} /> : 'Last updated: no verified showtimes yet'}
              {loadedInMs !== null ? ` · ${loadedInMs} ms` : ''}
            </span>
          </p>
        </section>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>}

        {activeStyle === 'classic' ? (
          <section aria-label="Movies classic grid" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {movies.map(([title, list]) => (
              <button
                key={title}
                type="button"
                onClick={() => { setMovie(title); setActiveStyle('experience'); }}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-500 hover:shadow-sm"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Film className="h-4 w-4" /></span>
                <span className="mt-2 block text-sm font-black text-slate-900">{title}</span>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{list.length} theatre{list.length === 1 ? '' : 's'} · {list.reduce((sum, screen) => sum + screen.showtimes.length, 0)} showtimes</span>
              </button>
            ))}
            {movies.length === 0 && <p className="col-span-full rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No showtimes for this location yet.</p>}
          </section>
        ) : activeStyle === 'style3' ? (
          <StyleThreeList
            label="Movies style 3 list"
            items={filtered.map((screen) => ({
              id: screen.id,
              title: screen.movieTitle || 'Movie not assigned',
              subtitle: [screen.cinemaTitle, screen.screenName].filter(Boolean).join(' · '),
              meta: [[screen.area, screen.city].filter(Boolean).join(', '), screen.showDate, screen.showtimes.join(', ')].filter(Boolean).join(' · '),
              badge: screen.format || (screen.isVisible ? undefined : 'Hidden'),
              onClick: () => { if (screen.movieTitle) { setMovie(screen.movieTitle); setActiveStyle('experience'); } },
            }))}
            emptyLabel="No showtimes for this location yet."
          />
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading real showtimes…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <Film className="mx-auto h-8 w-8 text-blue-600" />
            <p className="mt-2 text-sm font-bold text-slate-900">No showtimes for this location yet</p>
            <p className="mt-1 text-xs text-slate-500">Theatres and admins can add a real movie title, theatre, date and timings. No placeholder showtimes are shown.</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-500">{lastUpdated ? <LastUpdated at={lastUpdated} /> : 'Last updated: no verified showtimes yet'}</p>
          </div>
        ) : movie === null ? (
          <section aria-label="Movies">
            <h2 className="mb-2 text-sm font-black text-slate-900">Movies near you <span className="text-xs font-semibold text-slate-500">({movies.length})</span></h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {movies.map(([title, list]) => (
                <button key={title} type="button" onClick={() => setMovie(title)} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-400 hover:shadow-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-slate-900">{title}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">{new Set(list.map((screen) => screen.cinemaTitle)).size} theatres · {list.reduce((count, screen) => count + screen.showtimes.length, 0)} shows</span>
                  </span>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">Showtimes →</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section aria-label="Theatres and showtimes">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setMovie(null)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600">← All movies</button>
              <h2 className="text-sm font-black text-slate-900">{movie}</h2>
              <span className="text-[11px] text-slate-500">{theatres.length} theatres</span>
            </div>
            <div className="space-y-2">
              {theatres.map((theatre) => (
                <article key={theatre.cinema} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{theatre.cinema}</h3>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{[theatre.area, theatre.city, theatre.pin].filter(Boolean).join(', ') || 'Location not set'}</span>
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-1">
                        {authUser?.role === 'admin' && <>
                          <button type="button" onClick={() => void approve(theatre.screens[0], 'approved')} className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">Approve</button>
                          <button type="button" onClick={() => void approve(theatre.screens[0], 'disabled')} className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-700">Disable</button>
                        </>}
                        <button type="button" onClick={() => setEditing(theatre.screens[0])} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10.5px] font-bold text-slate-700"><Pencil className="h-3 w-3" /> Manage</button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {theatre.screens.map((screen) => (
                      <div key={screen.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
                        <span className="min-w-0 flex-1 text-[11px] font-semibold text-slate-700">{screen.screenName}<span className="block text-[10px] font-normal text-slate-500">{screen.showDate || 'Date missing'} · {screen.format} · {screen.soundSystem}{!screen.isVisible ? ' · HIDDEN' : ''}</span></span>
                        <span className="flex flex-wrap gap-1">
                          {screen.showtimes.map((time) => (
                            <span key={time} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-800"><Clock className="mr-0.5 inline h-3 w-3 text-blue-600" />{time}</span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      {editing && canManage && (
        <EditShowtimeDialog
          screen={editing}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={(values) => void save(editing, values)}
        />
      )}
    </div>
  );
}

function EditShowtimeDialog({
  screen,
  saving,
  onClose,
  onSave,
}: {
  screen: ShowtimeScreen;
  saving: boolean;
  onClose: () => void;
  onSave: (values: { showtimes: string; movieTitle: string; showDate: string; state: string; city: string; area: string; pincode: string; isVisible: boolean }) => void;
}) {
  const [showtimes, setShowtimes] = useState(screen.showtimes.join(', '));
  const [showDate, setShowDate] = useState(screen.showDate || new Date().toISOString().slice(0, 10));
  const [movieTitle, setMovieTitle] = useState(screen.movieTitle || '');
  const [state, setState] = useState(screen.state || '');
  const [city, setCity] = useState(screen.city || '');
  const [area, setArea] = useState(screen.area || '');
  const [pincode, setPincode] = useState(screen.pincode || '');
  const [isVisible, setIsVisible] = useState(screen.isVisible);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Manage showtimes">
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">Manage showtimes</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-slate-200 p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">{screen.cinemaTitle} · {screen.screenName}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-[10px] font-bold uppercase text-slate-500">Movie title (required)<input value={movieTitle} onChange={(event) => setMovieTitle(event.target.value)} required className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-semibold" /></label>
          <label className="text-[10px] font-bold uppercase text-slate-500">Show date (required)<input type="date" value={showDate} onChange={(event) => setShowDate(event.target.value)} required className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-semibold" /></label>
          <label className="text-[10px] font-bold uppercase text-slate-500">State<select value={state} onChange={(event) => setState(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-semibold"><option value="">Select state</option><option value="Andhra Pradesh">Andhra Pradesh</option><option value="Telangana">Telangana</option><option value="Karnataka">Karnataka</option></select></label>
          <label className="text-[10px] font-bold uppercase text-slate-500">City<input value={city} onChange={(event) => setCity(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-semibold" /></label>
          <label className="text-[10px] font-bold uppercase text-slate-500">Area<input value={area} onChange={(event) => setArea(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-semibold" /></label>
          <label className="text-[10px] font-bold uppercase text-slate-500">PIN code<input value={pincode} onChange={(event) => setPincode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-semibold" /></label>
        </div>
        <label className="mt-2 block text-[10px] font-bold uppercase text-slate-500">Showtimes (comma separated, 12-hour)<input value={showtimes} onChange={(event) => setShowtimes(event.target.value)} placeholder="10:30 AM, 01:45 PM" className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-semibold" /></label>
        <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={isVisible} onChange={(event) => setIsVisible(event.target.checked)} /> Visible to customers</label>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold">Cancel</button>
          <button type="button" disabled={saving || !movieTitle.trim() || !showDate || !showtimes.trim()} onClick={() => onSave({ showtimes, movieTitle, showDate, state, city, area, pincode, isVisible })} className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save showtimes'}</button>
        </div>
      </div>
    </div>
  );
}
