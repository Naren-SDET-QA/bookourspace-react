import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, MapPin, ShieldCheck, X } from 'lucide-react';
import SafeImage from '../SafeImage';
import { useMarketplace } from '../../context/MarketplaceContext';
import { DEMO_BOOKABLE_CARDS, type DemoSectionKey } from './demoBookableData';

function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

interface DemoBookableCardProps {
  section: DemoSectionKey;
  className?: string;
}

/**
 * Exactly one demo card per module. Booking it creates a local, clearly marked
 * demo booking — no payment, no provider inventory and no production data.
 */
export function DemoBookableCard({ section, className = '' }: DemoBookableCardProps) {
  const card = DEMO_BOOKABLE_CARDS[section];
  const { createBooking, authUser } = useMarketplace();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState(authUser?.name || '');
  const [phone, setPhone] = useState(authUser?.phone || '');
  const [date, setDate] = useState(tomorrowIso());
  const [slot, setSlot] = useState(card.defaultSlot);
  const [guests, setGuests] = useState(section === 'movies' ? 2 : 1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setConfirmed(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const isValid = useMemo(() => name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10 && Boolean(date), [name, phone, date]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValid) {
      setError('Enter your name, a 10-digit phone number and a date.');
      return;
    }
    setError('');
    createBooking({
      listingId: `demo-${section}`,
      listingTitle: card.title,
      providerId: 'demo-provider',
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerAddress: 'Hyderabad (demo)',
      scheduledDate: date,
      timeSlot: slot,
      totalAmount: card.price,
      notes: `DEMO BOOKING — no payment taken. ${guests} guest${guests === 1 ? '' : 's'}.`,
    });
    setConfirmed(true);
  };

  const close = () => {
    setOpen(false);
    setConfirmed(false);
    setError('');
  };

  const Icon = card.icon;

  return (
    <>
      <article
        aria-label={`${card.sectionLabel} demo bookable card`}
        className={`group relative overflow-hidden rounded-2xl border border-indigo-200/80 bg-white shadow-sm dark:border-indigo-500/30 dark:bg-slate-900 ${className}`}
      >
        <div className="flex flex-col sm:flex-row">
          <div className="relative h-36 w-full shrink-0 overflow-hidden sm:h-auto sm:w-52">
            <SafeImage
              src={card.image}
              alt={card.title}
              category="general"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-950/85 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
              <ShieldCheck className="h-3 w-3" /> Demo · Bookable
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
              <Icon className="h-3.5 w-3.5" />
              {card.sectionLabel} · curated demo
            </div>
            <h3 className="text-sm font-black leading-snug text-slate-900 dark:text-white sm:text-base">{card.title}</h3>
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{card.subtitle}</p>
            <p className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3" /> {card.meta}
            </p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
              <div>
                <span className="text-lg font-black text-slate-900 dark:text-white">₹{card.price.toLocaleString('en-IN')}</span>
                <span className="ml-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{card.priceUnit}</span>
              </div>
              <button
                type="button"
                onClick={() => { setOpen(true); setConfirmed(false); }}
                className={`inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r ${card.accent} px-3.5 py-2 text-[11px] font-black text-white shadow-md transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500`}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Book demo
              </button>
            </div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Demo booking only · no payment taken
            </p>
          </div>
        </div>
      </article>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div role="dialog" aria-modal="true" aria-label={`Book ${card.title}`} className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">Demo booking · no payment</p>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{card.title}</h3>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">₹{card.price.toLocaleString('en-IN')} {card.priceUnit}</p>
              </div>
              <button type="button" onClick={close} aria-label="Close demo booking" className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            {confirmed ? (
              <div className="space-y-3 p-5 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                <h4 className="text-base font-black text-slate-900 dark:text-white">Demo booking confirmed</h4>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {card.title}<br />
                  {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {slot}
                </p>
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  Demo only — no payment was taken. It is saved in My Bookings so you can see the full booking flow.
                </p>
                <button type="button" onClick={close} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white dark:bg-white dark:text-slate-900">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3 p-4">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  Full name
                  <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                </label>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  Phone
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} required inputMode="tel" placeholder="98765 43210" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    {card.slotLabel}
                    <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </label>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    Time
                    <select value={slot} onChange={(event) => setSlot(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                      {['10:00 AM', '11:00 AM', '02:00 PM', '06:00 PM', '07:30 PM'].map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  Guests / tickets
                  <input type="number" min={1} max={10} value={guests} onChange={(event) => setGuests(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                </label>
                {error && <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
                <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  This is a demo card. No payment is collected and no provider is notified.
                </p>
                <button type="submit" className={`w-full rounded-xl bg-gradient-to-r ${card.accent} px-4 py-2.5 text-xs font-black text-white shadow-md`}>
                  Confirm demo booking
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
