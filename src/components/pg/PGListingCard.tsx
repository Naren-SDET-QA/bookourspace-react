import { BedDouble, MapPin, ShieldCheck, Utensils, Wind } from 'lucide-react';
import SafeImage from '../SafeImage';
import type { PgCard } from '../../lib/sectionExperiences';

interface PGListingCardProps {
  card: PgCard;
  genderLabel: string;
  onOpen: (card: PgCard) => void;
}

function rupees(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/**
 * Large, demo-card-style PG listing. Real owner data and the real detail/booking
 * flow remain unchanged — only the card presentation is unified.
 */
export function PGListingCard({ card, genderLabel, onOpen }: PGListingCardProps) {
  const subtitle = [card.sharingText || card.subcategory, card.food, card.acText].filter(Boolean).join(' · ');
  const location = [card.locality, card.city].filter(Boolean).join(', ') || 'Location not provided';

  return (
    <article
      aria-label={`PG listing ${card.title}`}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-col sm:flex-row">
        <div className="relative h-52 w-full shrink-0 overflow-hidden sm:h-auto sm:w-60">
          <SafeImage
            category="pg"
            src={card.photo}
            alt={card.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {card.verified && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black text-violet-800 shadow-sm">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> VERIFIED
            </span>
          )}
          {card.bedsAvailable !== null && card.bedsAvailable > 0 && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-slate-950/85 px-2.5 py-1 text-[10px] font-black text-white">
              <BedDouble className="h-3 w-3" aria-hidden="true" /> {card.bedsAvailable} bed{card.bedsAvailable === 1 ? '' : 's'} available
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950">
              <BedDouble className="h-3 w-3" aria-hidden="true" />
            </span>
            PG &amp; Hostels · {genderLabel}
          </div>

          <h2 className="text-base font-black leading-snug text-slate-900 dark:text-white">{card.title}</h2>
          <p className="line-clamp-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{subtitle || 'Sharing and amenities as listed by the owner'}</p>
          <p className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            <MapPin className="h-3 w-3" aria-hidden="true" /> {location}
            {card.providerName ? <span className="text-slate-400"> · {card.providerName}</span> : <span className="text-slate-400"> · Owner listing</span>}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            {card.food && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><Utensils className="h-3 w-3" aria-hidden="true" /> {card.food}</span>}
            {card.acText && <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"><Wind className="h-3 w-3" aria-hidden="true" /> {card.acText}</span>}
            {card.attachedBath && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Bath: {card.attachedBath}</span>}
          </div>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
            <div>
              <span className="text-xl font-black text-slate-900 dark:text-white">{card.rentRupees !== null ? rupees(card.rentRupees) : 'Rent on request'}</span>
              {card.rentRupees !== null && <span className="ml-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{card.rentUnit}</span>}
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {card.deposit ? `Deposit ${card.deposit}` : 'Deposit as listed by owner'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpen(card)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-[11px] font-black text-white shadow-md transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              View &amp; book
            </button>
          </div>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Live details from the owner · no brokerage
          </p>
        </div>
      </div>
    </article>
  );
}
