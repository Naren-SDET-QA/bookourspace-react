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
  subtitle: string;
  image: string;
  selection: ClassesCategorySelection;
}> = [
  { label: 'Medical & MBBS', subtitle: 'Entrance prep and clinical learning', image: img('photo-1576091160399-112ba8d25d1d'), selection: { query: 'Medical' } },
  { label: 'Law & LAWCET', subtitle: 'Law entrance and exam coaching', image: img('photo-1589829545856-d10d557cf95f'), selection: { query: 'Law' } },
  { label: 'MBA & Management', subtitle: 'Business, CAT and leadership', image: img('photo-1556761175-b413da4baf72'), selection: { query: 'Management' } },
  { label: 'Engineering & JEE', subtitle: 'JEE, coding and technical skills', image: img('photo-1581091226825-a6a2a5aee158'), selection: { query: 'Engineering' } },
  { label: 'Degree & Undergraduate', subtitle: 'Build your academic foundation', image: img('photo-1562774053-701939374585'), selection: { category: 'Academic' } },
  { label: 'Postgraduate', subtitle: 'Specialise and move ahead', image: img('photo-1523240795612-9a054b0db644'), selection: { query: 'Postgraduate' } },
  { label: 'PhD & Research', subtitle: 'Mentors, methods and discovery', image: img('photo-1532094349884-543bc11b234d'), selection: { query: 'Research' } },
  { label: 'School & Intermediate', subtitle: 'Confident learning for every grade', image: img('photo-1503676260728-1c00da094a0b'), selection: { query: 'School' } },
];

const PATHWAYS = [
  { label: 'Academic', subtitle: 'Formal education & admissions', image: img('photo-1509062522246-3755977927d7'), tone: 'from-[#fff1f2] via-[#fff7ed] to-[#fecdd3]', action: { query: 'Academic' } },
  { label: 'Personal Development', subtitle: 'Hobbies, lifestyle & self-growth', image: img('photo-1506126613408-eca07ce68773'), tone: 'from-[#ecfdf5] via-[#f0fdf4] to-[#bbf7d0]', action: { query: 'Yoga' } },
  { label: 'Professional Development', subtitle: 'Career, job & industry skills', image: img('photo-1556761175-b413da4baf72'), tone: 'from-[#eff6ff] via-[#f0f9ff] to-[#bae6fd]', action: { query: 'Professional' } },
];

export function ClassesCategoryRail({ activeCategory, activeQuery, onSelect }: ClassesCategoryRailProps) {
  return (
    <section aria-label="Explore education categories" className="mb-4 rounded-[2px] border border-[#e0e0e0] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,.1)] sm:p-4">
      <div className="mb-4 grid gap-2.5 md:grid-cols-3">
        {PATHWAYS.map((pathway) => (
          <button key={pathway.label} type="button" onClick={() => onSelect(pathway.action)} className="group relative min-h-[118px] overflow-hidden rounded-[2px] border border-[#e0e0e0] bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,.08)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2874f0]">
            <SafeImage src={pathway.image} alt={`${pathway.label} learning`} category="classes" className="absolute inset-y-0 right-0 h-full w-2/5 object-cover opacity-80 transition duration-500 group-hover:scale-105" sizes="240px" />
            <span className="absolute inset-0 bg-gradient-to-r from-white via-white/70 to-transparent" />
            <span className="relative z-10 block max-w-[68%]">
              <span className="block text-sm font-bold text-[#212121]">{pathway.label}</span>
              <span className="mt-1 block text-[10px] font-medium leading-tight text-[#878787]">{pathway.subtitle}</span>
              <span className="mt-3 inline-flex rounded-[2px] bg-[#2874f0] px-3 py-1 text-[10px] font-bold text-white">Explore {pathway.label.split(' ')[0]} <span className="ml-1">→</span></span>
            </span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#2874f0]">Learn with confidence</p>
          <h2 className="mt-0.5 text-base font-bold tracking-tight text-[#212121] sm:text-lg">Explore education categories</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#878787]">Find the right course, mentor or institute for your next step.</p>
        </div>
        <span className="rounded-[2px] bg-[#fff8e1] px-2.5 py-1 text-[9px] font-bold text-[#212121]">Tap a card to filter</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
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
              className={`group relative min-h-[132px] overflow-hidden rounded-[2px] border text-left shadow-sm transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2874f0] hover:-translate-y-0.5 hover:shadow-md ${
                active ? 'border-[#2874f0] ring-2 ring-[#2874f0]/30' : 'border-[#e0e0e0]'
              }`}
            >
              <SafeImage src={card.image} alt={`${card.label} courses`} category="classes" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" sizes="(max-width: 640px) 45vw, 220px" />
              <span className="absolute inset-0 bg-gradient-to-t from-[#172554]/95 via-[#172554]/35 to-[#172554]/5" aria-hidden="true" />
              <span className="absolute inset-x-2 bottom-2">
                <span className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-black leading-tight text-white drop-shadow sm:text-xs">{card.label}</span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${active ? 'bg-[#ffe500] text-[#2874f0]' : 'bg-white/25 text-white backdrop-blur'}`} aria-hidden="true">
                  {active ? '✓' : '→'}
                  </span>
                </span>
                <span className="mt-1 block line-clamp-2 text-[9px] font-semibold leading-tight text-white/85">{card.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
