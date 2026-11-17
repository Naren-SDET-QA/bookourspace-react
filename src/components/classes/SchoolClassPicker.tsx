import { BookOpen, FileText, GraduationCap, MapPin, Monitor, SlidersHorizontal, Users } from 'lucide-react';
import type { ComponentType } from 'react';
import SafeImage from '../SafeImage';
import { SCHOOL_CLASS_CARDS } from './academicFilters';

type Props = {
  /** Selected service (admissions, tuition, coaching), or null for every service. */
  filter: string | null;
  onFilter: (value: string | null) => void;
  /** Selected delivery mode filter, or null for every mode. */
  modeFilter: string | null;
  onModeFilter: (value: string | null) => void;
  /** Selected class, or null for every class. */
  selectedClass: string | null;
  onSelectClass: (value: string | null) => void;
};

const banner = (w = 520) =>
  `https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=${w}&q=80`;

type FilterTile = {
  label: string;
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  bg: string;
  fg: string;
};

/** Service tiles choose what the listing is; mode tiles narrow how it is delivered. */
const SERVICE_TILES: FilterTile[] = [
  { label: 'Admissions', icon: FileText, bg: '#fde8ea', fg: '#e0414c' },
  { label: 'Tuition', icon: BookOpen, bg: '#e3f0fe', fg: '#2f7fe0' },
  { label: 'Coaching', icon: Users, bg: '#efe6fd', fg: '#8b5cf6' },
];

const MODE_TILES: FilterTile[] = [
  { label: 'Online', icon: Monitor, bg: '#e2f6ec', fg: '#17a673' },
  { label: 'Offline', icon: MapPin, bg: '#fdf3e7', fg: '#e8912f' },
];

/**
 * School Education entry screen: the banner, the five school filters and the
 * Nursery-to-Class-12 picker. Nothing here navigates — every control narrows the
 * school listings shown directly underneath.
 */
export function SchoolClassPicker({ filter, onFilter, modeFilter, onModeFilter, selectedClass, onSelectClass }: Props) {
  return (
    <section aria-label="School education" className="mb-3 max-w-[560px] sm:mb-5">
      <div className="relative overflow-hidden rounded-2xl border border-[#f6e5da] bg-[linear-gradient(100deg,#fff6f1_0%,#fffdfa_58%,#f3fbf4_100%)] sm:rounded-[22px]">
        <div className="relative z-10 max-w-[66%] px-2.5 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-start gap-1.5 sm:gap-2.5">
            <span aria-hidden className="text-[20px] leading-none sm:text-[30px]">🎓</span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-black leading-tight tracking-tight text-[#1b2a4a] sm:text-[25px]">School Education</h2>
              <p className="mt-0.5 text-[9.5px] font-semibold text-[#6b7a90] sm:text-[13px]">Nursery to Class 12</p>
            </div>
          </div>
        </div>
        <SafeImage
          src={banner()}
          alt=""
          category="classes"
          className="absolute right-0 top-0 h-full w-[42%] object-cover"
          sizes="(max-width: 639px) 40vw, 300px"
        />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-[38%] w-[26%] bg-[linear-gradient(90deg,#fff8f4,rgba(255,248,244,0))]" />
      </div>

      <div className="mt-3 sm:mt-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-black tracking-tight text-[#1b2a4a] sm:text-[18px]">
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-[#2874f0] sm:h-5 sm:w-5" aria-hidden />
          School filters
        </h3>
        <div className="mt-1.5 grid grid-cols-3 gap-1 sm:mt-2 sm:gap-2">
          {SERVICE_TILES.map(({ label, icon: Icon, bg, fg }) => {
            const isActive = filter === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onFilter(isActive ? null : label)}
                aria-pressed={isActive}
                aria-label={`Filter by ${label}`}
                style={{ backgroundColor: bg }}
                className={`flex flex-col items-center gap-1 rounded-xl border px-0.5 py-1.5 transition sm:rounded-2xl sm:px-1 sm:py-2.5 ${isActive ? 'border-[#2874f0] ring-1 ring-[#2874f0]/30' : 'border-transparent hover:brightness-[.98]'}`}
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: fg }} />
                <span className="text-center text-[8px] font-bold leading-tight text-[#23324d] sm:text-[11px]">{label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1 sm:gap-2">
          {MODE_TILES.map(({ label, icon: Icon, bg, fg }) => {
            const isActive = modeFilter === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onModeFilter(isActive ? null : label)}
                aria-pressed={isActive}
                aria-label={`Filter by ${label} mode`}
                style={{ backgroundColor: bg }}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-1 py-1.5 transition sm:rounded-2xl sm:py-2 ${isActive ? 'border-[#2874f0] ring-1 ring-[#2874f0]/30' : 'border-transparent hover:brightness-[.98]'}`}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: fg }} aria-hidden />
                <span className="text-[8.5px] font-bold leading-tight text-[#23324d] sm:text-[11px]">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 sm:mt-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-black tracking-tight text-[#1b2a4a] sm:text-[18px]">
          <GraduationCap className="h-4 w-4 shrink-0 text-[#ef5a7a] sm:h-5 sm:w-5" aria-hidden />
          Choose Your Class
        </h3>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:mt-2 sm:gap-2.5 lg:grid-cols-3">
          {SCHOOL_CLASS_CARDS.map(({ label, subtitle, image }) => {
            const isActive = selectedClass === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onSelectClass(isActive ? null : label)}
                aria-pressed={isActive}
                aria-label={`Select ${label}`}
                className={`group overflow-hidden rounded-2xl border bg-white text-left shadow-[0_2px_10px_rgba(23,37,84,.06)] transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2874f0] ${
                  isActive ? 'border-[#2874f0] ring-2 ring-[#2874f0]/25' : 'border-[#e8ecf3]'
                }`}
              >
                <span className="block h-[74px] w-full overflow-hidden bg-[#f4f7fd] sm:h-[92px]">
                  <SafeImage
                    src={image}
                    alt=""
                    category="classes"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    sizes="(max-width: 639px) 45vw, 200px"
                  />
                </span>
                <span className="flex items-center gap-1.5 px-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-black leading-tight text-[#172554] sm:text-[13px]">{label}</span>
                    <span className="mt-0.5 block truncate text-[8.5px] font-semibold text-[#64748b] sm:text-[10px]">{subtitle}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${isActive ? 'bg-[#2874f0] text-white' : 'bg-[#eff4ff] text-[#2874f0]'}`}
                  >
                    →
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
