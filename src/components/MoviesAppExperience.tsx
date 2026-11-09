import { useEffect, useMemo, useState } from 'react';
import SafeImage from './SafeImage';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Film,
  MapPin,
  Menu,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  MOVIE_AREAS,
  MOVIE_CITIES,
  MOVIE_LANGUAGES,
  buildDateChips,
  type MovieShow,
} from '../data/moviesAppData';

interface MoviesAppExperienceProps {
  /** Render inside the page flow rather than as a fixed overlay. */
  inline?: boolean;
  /** City selected in the common marketplace header. */
  selectedCity?: string;
}

const BLUE = '#2563eb';
const CARDS_KEY = 'bos_movies_cards_v1';

/** Only explicit owner-entered local cards are shown; there is no bundled showtime fallback. */
function loadCards(): MovieShow[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MovieShow[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* storage unavailable — show the honest empty state */
  }
  return [];
}

function persistCards(cards: MovieShow[]) {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  } catch {
    /* ignore quota/privacy errors */
  }
}

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg text-lg font-black text-white" style={{ backgroundColor: BLUE }}>
        B
      </span>
      <span className="text-[17px] font-extrabold tracking-tight text-[#1e3a8a]">BookOurSpace</span>
    </span>
  );
}

function LanguagePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold transition ${
        active ? 'border-transparent text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
      style={active ? { backgroundColor: BLUE } : undefined}
    >
      {label === 'All Movies' && <Film className="h-4 w-4" />}
      {label}
    </button>
  );
}

function MovieCard({
  movie,
  ownerMode,
  onEdit,
}: {
  movie: MovieShow;
  ownerMode: boolean;
  onEdit: (movie: MovieShow) => void;
}) {
  return (
    <article className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <div className="relative w-[100px] shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-[110px]">
        <SafeImage
          src={movie.poster}
          alt={movie.title}
          className="h-full w-full object-cover"
          style={{ aspectRatio: '2 / 3' }}
          category="movies"
          sizes="110px"
        />
        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
          {movie.certificate}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-[18px] font-extrabold leading-tight text-[#0f172a]">{movie.title}</h3>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#fef3c7] px-1.5 py-1 text-[11px] font-extrabold text-[#b45309]">
            <Star className="h-3 w-3 fill-[#f59e0b] text-[#f59e0b]" />
            {movie.rating.toFixed(1)}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {movie.languages.map((lang) => (
            <span key={lang} className="rounded-md bg-[#e0edff] px-2 py-0.5 text-[10.5px] font-bold text-[#1d4ed8]">
              {lang}
            </span>
          ))}
          {movie.formats.map((fmt) => (
            <span key={fmt} className="rounded-md bg-[#ede9fe] px-2 py-0.5 text-[10.5px] font-bold text-[#6d28d9]">
              {fmt}
            </span>
          ))}
        </div>

        <p className="mt-2 flex items-center gap-1 text-[11.5px] font-semibold text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#1d4ed8]" />
          <span className="truncate">
            {movie.cinema} · {movie.area}, {movie.city}
          </span>
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Showtimes">
          {movie.showtimes.map((time) => (
            <span key={time} className="rounded-lg bg-[#eef2ff] px-2.5 py-1 text-[11.5px] font-bold text-[#3730a3]">
              {time}
            </span>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            <Clock className="h-3 w-3" /> {movie.duration} · {movie.genre}
          </span>
          {ownerMode && (
            <button
              type="button"
              onClick={() => onEdit(movie)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

interface CardFormState {
  id?: string;
  title: string;
  cinema: string;
  area: string;
  city: string;
  languages: string;
  formats: string;
  rating: string;
  showtimes: string;
  poster: string;
  genre: string;
  duration: string;
  certificate: string;
}

function emptyForm(city: string): CardFormState {
  return {
    title: '',
    cinema: '',
    area: (MOVIE_AREAS[city] ?? [''])[1] ?? '',
    city,
    languages: 'Telugu',
    formats: '2D',
    rating: '8.0',
    showtimes: '10:00 AM, 01:15 PM, 04:30 PM, 07:45 PM',
    poster: '',
    genre: 'Action',
    duration: '2h 30m',
    certificate: 'UA',
  };
}

function OwnerCardEditor({
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  initial: CardFormState;
  onSave: (form: CardFormState) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CardFormState>(initial);
  const set = <K extends keyof CardFormState>(key: K, value: CardFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const valid = form.title.trim() && form.cinema.trim() && form.showtimes.trim();

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Post or edit a cinema card">
      <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Theatre owner</p>
            <h3 className="mt-0.5 text-lg font-black text-[#0f172a]">{form.id ? 'Edit card' : 'Post a card'}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Movie name" value={form.title} onChange={(v) => set('title', v)} placeholder="e.g. Pushpa 2" />
          <Field label="Theatre / cinema name" value={form.cinema} onChange={(v) => set('cinema', v)} placeholder="e.g. PVR Orion Mall" />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">City</span>
              <select
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-[#2563eb]"
              >
                {MOVIE_CITIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <Field label="Area / locality" value={form.area} onChange={(v) => set('area', v)} placeholder="e.g. Koramangala" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Languages (comma)" value={form.languages} onChange={(v) => set('languages', v)} placeholder="Telugu, Hindi" />
            <Field label="Formats (comma)" value={form.formats} onChange={(v) => set('formats', v)} placeholder="2D, IMAX" />
          </div>
          <Field label="Showtimes (comma separated)" value={form.showtimes} onChange={(v) => set('showtimes', v)} placeholder="10:00 AM, 01:15 PM" />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Rating" value={form.rating} onChange={(v) => set('rating', v)} placeholder="8.4" />
            <Field label="Duration" value={form.duration} onChange={(v) => set('duration', v)} placeholder="2h 30m" />
            <Field label="Certificate" value={form.certificate} onChange={(v) => set('certificate', v)} placeholder="UA" />
          </div>
          <Field label="Poster image URL (optional)" value={form.poster} onChange={(v) => set('poster', v)} placeholder="https://…" />
        </div>

        <div className="mt-5 flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-[13px] font-bold text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSave(form)}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: BLUE }}
          >
            <Check className="h-4 w-4" /> Save card
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">Cards are saved on this device. Booking & payments arrive in the next version.</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-[#2563eb]"
      />
    </label>
  );
}

export function MoviesAppExperience({ inline = false, selectedCity }: MoviesAppExperienceProps) {
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState<string>('All Movies');
  const [dateId, setDateId] = useState('d-0');
  const [city, setCity] = useState<string>(() => selectedCity?.trim() || 'Bengaluru');
  const [area, setArea] = useState<string>('All areas');
  const [cityOpen, setCityOpen] = useState(false);
  const [cards, setCards] = useState<MovieShow[]>(() => loadCards());
  const [ownerMode, setOwnerMode] = useState(false);
  const [editing, setEditing] = useState<CardFormState | null>(null);

  const dates = useMemo(() => buildDateChips(), []);
  const isAllCities = ['all', 'all cities', 'all locations'].includes(city.trim().toLowerCase());
  const areas = isAllCities ? ['All areas'] : MOVIE_AREAS[city] ?? ['All areas'];

  useEffect(() => {
    if (selectedCity?.trim()) {
      setCity(selectedCity.trim());
      setArea('All areas');
    }
  }, [selectedCity]);

  // Debounce search so typing does not re-filter on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(queryInput.trim().toLowerCase()), 220);
    return () => clearTimeout(timer);
  }, [queryInput]);

  const filtered = useMemo(() => {
    return cards.filter((movie) => {
      if (!isAllCities && movie.city.toLowerCase() !== city.toLowerCase()) return false;
      if (area !== 'All areas' && movie.area !== area) return false;
      if (language !== 'All Movies' && !movie.languages.includes(language)) return false;
      if (!query) return true;
      const haystack = `${movie.title} ${movie.cinema} ${movie.area} ${movie.city} ${movie.languages.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [cards, city, isAllCities, area, language, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, MovieShow[]>();
    for (const movie of filtered) {
      const list = map.get(movie.cinema) ?? [];
      list.push(movie);
      map.set(movie.cinema, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const saveCard = (form: CardFormState) => {
    const next: MovieShow = {
      id: form.id ?? `owner-${Date.now()}`,
      title: form.title.trim(),
      poster: form.poster.trim() || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=320&h=480&q=80',
      languages: form.languages.split(',').map((s) => s.trim()).filter(Boolean),
      formats: form.formats.split(',').map((s) => s.trim()).filter(Boolean),
      rating: Number(form.rating) || 0,
      cinema: form.cinema.trim(),
      area: form.area.trim(),
      city: form.city,
      showtimes: form.showtimes.split(',').map((s) => s.trim()).filter(Boolean),
      genre: form.genre || 'Drama',
      duration: form.duration || '2h 30m',
      certificate: form.certificate || 'UA',
    };
    setCards((prev) => {
      const exists = prev.some((card) => card.id === next.id);
      const updated = exists ? prev.map((card) => (card.id === next.id ? next : card)) : [next, ...prev];
      persistCards(updated);
      return updated;
    });
    setEditing(null);
  };

  const deleteCard = (id: string) => {
    setCards((prev) => {
      const updated = prev.filter((card) => card.id !== id);
      persistCards(updated);
      return updated;
    });
    setEditing(null);
  };

  const shell = inline
    ? 'w-full bg-[#f5f7fb] text-slate-900'
    : 'fixed inset-0 z-[71] flex flex-col overflow-y-auto bg-[#f5f7fb] text-slate-900';

  return (
    <div className={shell}>
      {/* App bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[560px] items-center gap-2 px-4 sm:max-w-4xl">
          <button type="button" aria-label="Open menu" className="rounded-full p-1.5 text-slate-700 hover:bg-slate-100">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <Logo />
          </div>
          <button
            type="button"
            onClick={() => setOwnerMode((v) => !v)}
            className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold transition ${
              ownerMode ? 'bg-[#1e3a8a] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title="Theatre owner mode"
          >
            Owner
          </button>
          <button type="button" aria-label="Search" className="rounded-full border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100">
            <Search className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Notifications" className="relative rounded-full border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[560px] px-4 pb-28 pt-3 sm:max-w-4xl">
        {/* Hero banner */}
        <section className="relative overflow-hidden rounded-2xl bg-[#0b1020]">
          <SafeImage
            src="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1000&q=80"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70"
            category="movies"
            priority
            sizes="(max-width: 560px) 100vw, 560px"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1e1b4b]/90 via-[#1e1b4b]/60 to-transparent" />
          <div className="relative flex min-h-[150px] flex-col justify-center p-5">
            <div className="mb-2 flex items-center gap-2 text-2xl" aria-hidden="true">
              <span>🎬</span>
              <span>🍿</span>
            </div>
            <h1 className="text-[26px] font-black leading-[1.05] text-white sm:text-3xl">
              Movies in
              <br />
              {city}
            </h1>
            <div className="relative mt-3">
              <button
                type="button"
                onClick={() => setCityOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-slate-800 shadow"
              >
                <MapPin className="h-3.5 w-3.5 text-[#1d4ed8]" />
                {city}
                <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition ${cityOpen ? 'rotate-180' : ''}`} />
              </button>
              {cityOpen && (
                <div className="absolute left-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  {(['All Cities', ...MOVIE_CITIES] as string[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCity(c);
                        setArea('All areas');
                        setCityOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-semibold ${
                        c === city ? 'bg-[#eef2ff] text-[#1d4ed8]' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {c}
                      {c === city && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Search — movie title, cinema or area */}
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search movie, cinema or area…"
            aria-label="Search movie, cinema or area"
            className="min-w-0 flex-1 bg-transparent py-3 text-[14px] font-medium outline-none placeholder:text-slate-400"
          />
          {queryInput && (
            <button type="button" onClick={() => setQueryInput('')} aria-label="Clear search" className="rounded-full p-1 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Area chips — location-aware */}
        <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-[#eef2ff] px-3 text-[11px] font-bold text-[#1d4ed8]">
            <MapPin className="h-3.5 w-3.5" /> Near
          </span>
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea(a)}
              className={`h-8 shrink-0 rounded-full border px-3 text-[11.5px] font-bold transition ${
                a === area ? 'border-transparent bg-[#1d4ed8] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        {/* Language pills */}
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {MOVIE_LANGUAGES.map((lang) => (
            <LanguagePill key={lang} label={lang} active={language === lang} onClick={() => setLanguage(lang)} />
          ))}
        </div>

        {/* Date chips */}
        <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="flex h-[62px] w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
            <CalendarDays className="h-5 w-5" />
          </span>
          {dates.map((chip) => {
            const active = chip.id === dateId;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setDateId(chip.id)}
                className={`flex h-[62px] min-w-[74px] shrink-0 flex-col items-center justify-center rounded-xl border px-3 leading-tight transition ${
                  active ? 'border-transparent text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
                style={active ? { backgroundColor: BLUE } : undefined}
              >
                <span className={`text-[12px] font-semibold ${active ? 'text-white/90' : 'text-slate-500'}`}>{chip.label}</span>
                <span className="text-[13px] font-extrabold">{chip.date}</span>
              </button>
            );
          })}
        </div>

        {/* Owner controls */}
        {ownerMode && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-dashed border-[#1d4ed8] bg-[#eef2ff] px-4 py-3">
            <div>
              <p className="text-[13px] font-bold text-[#1e3a8a]">Theatre owner mode</p>
              <p className="text-[11px] text-[#1e3a8a]/70">Post or edit cinema cards. Saved on this device.</p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(emptyForm(city))}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold text-white"
              style={{ backgroundColor: BLUE }}
            >
              <Plus className="h-4 w-4" /> Post card
            </button>
          </div>
        )}

        {/* Results */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
              {filtered.length} {filtered.length === 1 ? 'card' : 'cards'}
              {area !== 'All areas' ? ` near ${area}` : ` in ${city}`}
            </p>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              Booking opens next version
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <Film className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-600">No shows found</p>
              <p className="mt-1 text-[12px] text-slate-400">Try another movie, cinema, language or area.</p>
              <button
                type="button"
                onClick={() => {
                  setQueryInput('');
                  setLanguage('All Movies');
                  setArea('All areas');
                }}
                className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {grouped.map(([cinema, movies]) => (
                <div key={cinema} className="space-y-3">
                  {movies.map((movie) => (
                    <MovieCard key={movie.id} movie={movie} ownerMode={ownerMode} onEdit={(m) => setEditing({ ...m, languages: m.languages.join(', '), formats: m.formats.join(', '), rating: String(m.rating), showtimes: m.showtimes.join(', ') })} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] font-semibold text-slate-400">
          <Clock className="h-3.5 w-3.5" /> Cinema names & timings are indicative · no booking or payment yet
        </p>
      </div>

      {editing && (
        <OwnerCardEditor
          initial={editing}
          onSave={saveCard}
          onDelete={editing.id ? () => deleteCard(editing.id as string) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default MoviesAppExperience;
