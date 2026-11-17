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
  { label: 'Engineering & JEE', subtitle: 'JEE, coding and technical skills', image: img('photo-1531482615713-2afd69097998'), selection: { query: 'Engineering' } },
  { label: 'Degree & Undergraduate', subtitle: 'Build your academic foundation', image: img('photo-1523050854058-8df90110c9f1'), selection: { category: 'Academic' } },
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
    <section aria-label="Explore education categories" className="mb-4 rounded-3xl border border-[#ebe7ff] bg-white p-3 shadow-[0_12px_35px_rgba(76,29,149,0.08)] sm:p-4">
      <div className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-[#eef2ff] via-[#fdf2f8] to-[#ecfeff] px-4 py-5 sm:px-7 sm:py-6">
        <div className="relative z-10 max-w-2xl">
          <p className="text-center text-xl font-black tracking-tight text-[#172554] sm:text-3xl">Learn · Get admitted · Build your career</p>
          <p className="mt-1 text-center text-[11px] font-semibold text-[#475569] sm:text-sm">Schools, colleges, courses, skills, trainings & more — all in one place</p>
          <div className="mx-auto mt-3 flex max-w-xl items-center rounded-full border border-white/90 bg-white/90 p-1 shadow-sm">
            <SearchIcon />
            <span className="flex-1 px-2 text-[10px] font-semibold text-[#94a3b8] sm:text-xs">Search courses, colleges, exams, skills or trainers...</span>
            <span className="rounded-full bg-[#f97316] px-4 py-2 text-[10px] font-black text-white sm:text-xs">Search</span>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#c4b5fd]/35 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 h-28 w-28 rounded-full bg-[#fdba74]/30 blur-2xl" />
      </div>

      <div className="mb-4 grid gap-2.5 md:grid-cols-3">
        {PATHWAYS.map((pathway) => (
          <button key={pathway.label} type="button" onClick={() => onSelect(pathway.action)} className={`group relative min-h-[118px] overflow-hidden rounded-2xl border border-white bg-gradient-to-br ${pathway.tone} p-3 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200`}>
            <SafeImage src={pathway.image} alt={`${pathway.label} learning`} category="classes" className="absolute inset-y-0 right-0 h-full w-2/5 object-cover opacity-80 transition duration-500 group-hover:scale-105" sizes="240px" />
            <span className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/50 to-transparent" />
            <span className="relative z-10 block max-w-[68%]">
              <span className="block text-sm font-black text-[#172554]">{pathway.label}</span>
              <span className="mt-1 block text-[10px] font-semibold leading-tight text-[#475569]">{pathway.subtitle}</span>
              <span className="mt-3 inline-flex rounded-full bg-[#f97316] px-3 py-1 text-[10px] font-black text-white">Explore {pathway.label.split(' ')[0]} <span className="ml-1">→</span></span>
            </span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">Learn with confidence</p>
          <h2 className="mt-0.5 text-base font-black tracking-tight text-[#172554] sm:text-lg">Explore education categories</h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#64748b]">Find the right course, mentor or institute for your next step.</p>
        </div>
        <span className="rounded-full bg-[#f5f3ff] px-2.5 py-1 text-[9px] font-bold text-[#6d28d9]">Tap a card to filter</span>
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
              className={`group relative min-h-[132px] overflow-hidden rounded-2xl border-2 text-left shadow-sm transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 hover:-translate-y-1 hover:shadow-lg ${
                active ? 'border-[#7c3aed] ring-2 ring-violet-200' : 'border-white/80 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700'
              }`}
            >
              <SafeImage src={card.image} alt={`${card.label} courses`} category="classes" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" sizes="(max-width: 640px) 45vw, 220px" />
              <span className="absolute inset-0 bg-gradient-to-t from-[#172554]/95 via-[#172554]/35 to-[#172554]/5" aria-hidden="true" />
              <span className="absolute inset-x-2 bottom-2">
                <span className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-black leading-tight text-white drop-shadow sm:text-xs">{card.label}</span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${active ? 'bg-white text-[#6d28d9]' : 'bg-white/25 text-white backdrop-blur'}`} aria-hidden="true">
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

function SearchIcon() {
  return <span aria-hidden="true" className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f5f3ff] text-[#6d28d9]">⌕</span>;
}
