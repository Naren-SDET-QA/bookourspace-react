import {
  BarChart3,
  BookOpen,
  Target,
  Calculator,
  Code2,
  GraduationCap,
  LayoutGrid,
  Microscope,
  Palette,
  ScrollText,
  Store,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';
import SafeImage from '../SafeImage';
import { subcategoryCards } from './academicFilters';

type Props = {
  /** Rail section short name, e.g. "Inter" or "Medical". */
  section: string;
  selected: string | null;
  onSelect: (value: string | null) => void;
  /** All / Admission / Tuition / Coaching strip shared by every category. */
  service: string | null;
  onService: (value: string | null) => void;
};

type IconProps = { className?: string; style?: CSSProperties };
const ICONS: Record<string, ComponentType<IconProps>> = {
  MPC: Calculator,
  BiPC: Microscope,
  MEC: TrendingUp,
  CEC: ScrollText,
  HEC: BookOpen,
  MCC: Code2,
  MSCS: BarChart3,
  Commerce: Store,
  'Arts & Humanities': Palette,
  Vocational: Wrench,
  'B.A.': Palette,
  'B.Sc': Microscope,
  'B.Com': Store,
  BBA: TrendingUp,
  BCA: Code2,
  'B.Ed': BookOpen,
  'B.Tech': Calculator,
  Polytechnic: Wrench,
  'Computer science': Code2,
  Pharmacy: Microscope,
  LLB: ScrollText,
  LLM: ScrollText,
  'BA LLB': ScrollText,
  Judiciary: ScrollText,
  MBA: TrendingUp,
  PGDM: TrendingUp,
  Management: TrendingUp,
  'M.A.': Palette,
  'M.Sc': Microscope,
  'M.Com': Store,
  MCA: Code2,
  'M.Tech': Calculator,
  PhD: BookOpen,
  'M.Phil': BookOpen,
  JRF: BookOpen,
  Research: BookOpen,
  Diploma: GraduationCap,
  ITI: Wrench,
  NEET: Microscope,
  JEE: Calculator,
  CAT: TrendingUp,
  GATE: Calculator,
  'UGC NET': BookOpen,
  UPSC: ScrollText,
  EAPCET: Calculator,
};

const TINTS = [
  { bg: '#eef0ff', fg: '#5b5bd6' },
  { bg: '#e8f7ee', fg: '#1f9d55' },
  { bg: '#fff2e5', fg: '#d97706' },
  { bg: '#fdeaf1', fg: '#db2777' },
  { bg: '#e8f4ff', fg: '#2563eb' },
];

const SERVICES: Array<{ label: string; value: string | null; icon: ComponentType<IconProps> }> = [
  { label: 'All', value: null, icon: LayoutGrid },
  { label: 'Admission', value: 'Admissions', icon: GraduationCap },
  { label: 'Tuition', value: 'Tuition', icon: BookOpen },
  { label: 'Coaching', value: 'Coaching', icon: Target },
];

/**
 * Sub-category cards for a category that is not School (MPC, B.Sc, MBBS, LLB…).
 * Selecting one opens the same class-style listing page School uses.
 */
export function AcademicTrackPicker({ section, selected, onSelect, service, onService }: Props) {
  const group = subcategoryCards(section);
  if (!group) return null;
  return (
    <section aria-label={`${section} sub-categories`} className="mb-3">
      <div className="flex flex-wrap gap-1.5">
        {SERVICES.map(({ label, value, icon: Icon }) => {
          const isActive = service === value;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onService(value)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition sm:text-[12px] ${
                isActive
                  ? 'border-[#6f3ff2] bg-[#5b21b6] text-white'
                  : 'border-[#e6e2ff] bg-white text-[#3f2a68] hover:bg-[#f7f4ff]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      <h3 className="mt-4 text-[16px] font-black tracking-tight text-[#172554] sm:text-[20px]">
        Choose Your {group.title}
      </h3>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {group.cards.map((card, index) => {
          const Icon = ICONS[card.label] ?? GraduationCap;
          const tint = TINTS[index % TINTS.length];
          const isActive = selected === card.label;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onSelect(isActive ? null : card.label)}
              aria-pressed={isActive}
              aria-label={`Select ${card.label}`}
              className={`group overflow-hidden rounded-2xl border bg-white text-left shadow-[0_2px_10px_rgba(23,37,84,.06)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f3ff2] ${
                isActive ? 'border-[#6f3ff2] ring-2 ring-[#6f3ff2]/30' : 'border-[#e8ecf3]'
              }`}
            >
              <span className="block h-[128px] w-full overflow-hidden bg-[#f4f7fd] sm:h-[120px]">
                <SafeImage
                  src={card.image}
                  alt=""
                  category="classes"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  sizes="(max-width: 639px) 92vw, 240px"
                />
              </span>
              <span className="flex items-center gap-2 px-2 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9" style={{ backgroundColor: tint.bg, color: tint.fg }}>
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-black leading-tight text-[#172554] sm:text-[14px]">{card.label}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[9px] font-semibold leading-tight text-[#64748b] sm:text-[11px]">{card.subtitle}</span>
                </span>
                <span
                  aria-hidden
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-black sm:h-7 sm:w-7 ${isActive ? 'bg-[#6f3ff2] text-white' : 'bg-[#f1f0ff] text-[#6f3ff2]'}`}
                >
                  →
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
