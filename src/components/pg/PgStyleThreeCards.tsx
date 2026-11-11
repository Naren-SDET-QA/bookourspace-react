import { BedDouble, MapPin, Phone, ShieldCheck, Utensils, Wind } from 'lucide-react';
import SafeImage from '../SafeImage';
import { formatInr, pgGenderLabel, type PgCard } from '../../lib/sectionExperiences';

interface PgStyleThreeCardsProps {
  cards: PgCard[];
  onOpen: (card: PgCard) => void;
  onCall: (card: PgCard) => void;
}

/**
 * Compact two-up PG cards used by Style 3. Every value comes from the parsed
 * owner listing; no rating, discount, photo count or availability is invented.
 */
export function PgStyleThreeCards({ cards, onOpen, onCall }: PgStyleThreeCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
      {cards.map((card) => {
        const location = [card.locality, card.city].filter(Boolean).join(', ') || 'Location not provided';
        const price = card.rentRupees !== null ? formatInr(card.rentRupees) : 'Rent on request';
        return (
          <article
            key={card.id}
            aria-label={`PG listing ${card.title}`}
            className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
          >
            <button type="button" onClick={() => onOpen(card)} className="relative block aspect-[4/3] w-full overflow-hidden text-left">
              <SafeImage category="pg" src={card.photo} alt={card.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              {card.verified && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[8px] font-black text-emerald-700 shadow-sm">
                  <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" /> Verified
                </span>
              )}
              {card.bedsAvailable !== null && card.bedsAvailable > 0 && (
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[8px] font-black text-white">
                  <BedDouble className="h-2.5 w-2.5" aria-hidden="true" /> {card.bedsAvailable} bed{card.bedsAvailable === 1 ? '' : 's'}
                </span>
              )}
            </button>

            <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
              <h3 className="truncate text-[12px] font-black leading-tight text-slate-900 dark:text-white">{card.title}</h3>
              <p className="flex min-w-0 items-center gap-1 truncate text-[9px] font-medium text-slate-500 dark:text-slate-400">
                <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /> {location}
              </p>
              <p className="mt-0.5 flex items-baseline gap-1">
                <span className="text-base font-black text-slate-900 dark:text-white">{price}</span>
                {card.rentRupees !== null && <span className="text-[8px] font-bold text-slate-500">{card.rentUnit || '/month'}</span>}
              </p>
              <div className="flex flex-wrap gap-1">
                {card.sharingText && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[8px] font-black text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">{card.sharingText}</span>}
                {card.hasAc && <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[8px] font-black text-sky-700 dark:bg-sky-950/50 dark:text-sky-200"><Wind className="h-2 w-2" /> AC</span>}
                {card.food && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"><Utensils className="h-2 w-2" /> {card.food}</span>}
              </div>
              <div className="mt-auto grid grid-cols-2 gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => onOpen(card)}
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-violet-200 bg-white text-[10px] font-black text-violet-700 transition hover:bg-violet-50 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-200 dark:hover:bg-violet-950/40"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => onCall(card)}
                  className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-violet-700 text-[10px] font-black text-white transition hover:bg-violet-800"
                >
                  <Phone className="h-2.5 w-2.5" aria-hidden="true" /> Call
                </button>
              </div>
              <p className="text-[8px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                {pgGenderLabel(card.gender)} · No brokerage
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
