import SafeImage from '../SafeImage';

export interface ClassesCategorySelection {
  category?: string;
  query?: string;
}

interface ClassesCategoryRailProps {
  activeCategory: string;
  activeQuery: string;
  onSelect: (selection: ClassesCategorySelection) => void;
}

const img = (id: string, w = 480): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const CATEGORY_CARDS: Array<{
  label: string;
  image: string;
  selection: ClassesCategorySelection;
}> = [
  { label: 'Dance', image: img('photo-1547153760-18fc86324498'), selection: { query: 'Dance' } },
  { label: 'Education', image: img('photo-1503676260728-1c00da094a0b'), selection: { category: 'Academic' } },
  { label: 'Art', image: img('photo-1513364776144-60967b0f800f'), selection: { category: 'Arts & Music' } },
  { label: 'Swimming', image: img('photo-1530549387789-4c1017266635'), selection: { query: 'Swimming' } },
  { label: 'Sports', image: img('photo-1461896836934-ffe607ba8211'), selection: { category: 'Sports & Fitness' } },
  { label: 'IT & Software', image: img('photo-1517180102446-f3ece451e9d8'), selection: { category: 'Professional & IT' } },
  { label: 'Yoga', image: img('photo-1544367567-0f2fcb009e0b'), selection: { query: 'Yoga' } },
  { label: 'Languages', image: img('photo-1523240795612-9a054b0db644'), selection: { category: 'Languages' } },
];

export function ClassesCategoryRail({ activeCategory, activeQuery, onSelect }: ClassesCategoryRailProps) {
  return (
    <section aria-label="Explore classes by category" className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-[11px] font-black uppercase tracking-wide text-[#6d28d9]">Explore by category</h2>
        <span className="text-[9px] font-semibold text-slate-400">Tap a card to filter</span>
      </div>
      <div className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {CATEGORY_CARDS.map((card) => {
          const active = card.selection.category
            ? activeCategory === card.selection.category
            : Boolean(card.selection.query) && activeQuery.trim().toLowerCase() === card.selection.query!.toLowerCase();
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onSelect(card.selection)}
              aria-pressed={active}
              className={`group relative h-24 w-36 shrink-0 snap-start overflow-hidden rounded-2xl border-2 text-left shadow-sm transition ${
                active ? 'border-[#7c3aed] ring-2 ring-violet-200' : 'border-white/80 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700'
              }`}
            >
              <SafeImage src={card.image} alt={`${card.label} classes`} category="classes" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" sizes="144px" />
              <span className="absolute inset-0 bg-gradient-to-t from-[#1e1b4b]/90 via-[#1e1b4b]/20 to-transparent" aria-hidden="true" />
              <span className="absolute inset-x-2 bottom-1.5 flex items-center justify-between gap-1">
                <span className="truncate text-[11px] font-black text-white drop-shadow">{card.label}</span>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${active ? 'bg-white text-[#6d28d9]' : 'bg-white/25 text-white'}`} aria-hidden="true">
                  {active ? '✓' : '→'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
