import { Atom, BadgeCheck, CalendarDays, ChevronDown, ChevronRight, GraduationCap, Globe, Languages, LayoutGrid, List, MoreHorizontal, Sigma, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CourseListing } from '../../data/classesTimingsData';
import SafeImage from '../SafeImage';
import { ClassesServiceCard } from './ClassesServiceCard';
import { ClassesListingsStrip, ClassesSectionShelves } from './ClassesListingCarousel';
import { shelvesForExplorer } from './classesShelfCatalog';
import { SchoolClassPicker } from './SchoolClassPicker';
import { AcademicTrackPicker } from './AcademicTrackPicker';
import {
  SCHOOL_SUBJECT_FILTERS,
  buildAcademicFilters,
  matchesAcademicFilters,
  matchesService,
  type AcademicFilterGroup,
} from './academicFilters';

type Props = {
  courses: CourseListing[];
  query?: string;
  onOpen: (course: CourseListing) => void;
  /** Landing cards ask for a specific rail section (e.g. a school card). */
  sectionRequest?: { short: string; key: number } | null;
  /** The landing "Admissions" shortcut opens School with the admissions sheet. */
  admissionRequest?: number;
  /** Which pathway this explorer shows: academic, personal or professional. */
  scope?: string;
  /** Four-section marketplace id; drives subcategory shelves. */
  sectionId?: string;
};

const img = (id: string, w = 500): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// Photo ids are the same Unsplash assets already used across the Classes module.
const P = {
  school: 'photo-1503676260728-1c00da094a0b',
  students: 'photo-1523240795612-9a054b0db644',
  degree: 'photo-1541339907198-e08756dedf3f',
  engineering: 'photo-1581091226825-a6a2a5aee158',
  medical: 'photo-1576091160399-112ba8d25d1d',
  law: 'photo-1589829545856-d10d557cf95f',
  business: 'photo-1556761175-b413da4baf72',
  postgrad: 'photo-1497366811353-6870744d04b2',
  research: 'photo-1532094349884-543bc11b234d',
  maths: 'photo-1509228468518-180dd4864904',
  exam: 'photo-1434030216411-0b793f4b4173',
  music: 'photo-1511379938547-c1f69419868d',
  dance: 'photo-1508807526345-15e9b5f4eaff',
  arts: 'photo-1508700115892-45ecd05ae2ad',
  language: 'photo-1546410531-bb4caa6b424d',
  yoga: 'photo-1544367567-0f2fcb009e0b',
  it: 'photo-1517694712202-14dd9538aa97',
  data: 'photo-1551288049-bebda4e38f71',
  finance: 'photo-1554224155-6726b3ff858f',
  marketing: 'photo-1533750349088-cd871a92f312',
  government: 'photo-1434030216411-0b793f4b4173',
} as const;

type AcademicSection = {
  /** Short label shown under the rail icon. */
  short: string;
  /** Full section name shown above the listings. */
  label: string;
  /** The programmes and exams this section stands for. */
  examples: string;
  image: string;
  /** Lowercase whole-word keywords matched against a listing's search text. */
  keywords: string[];
  /** Personal, professional and competitive sections leave this unset (academic). */
  group?: 'Personal' | 'Professional' | 'Competitive';
};

const SECTIONS: AcademicSection[] = [
  {
    short: 'School',
    label: 'Nursery, School and Classes 1–12',
    examples: 'Nursery, LKG, UKG · CBSE / ICSE / State board · Classes 1–12 tuition',
    image: P.school,
    keywords: ['nursery', 'lkg', 'ukg', 'school', 'cbse', 'icse', 'state board', 'primary', 'secondary', 'matric', 'tuition', 'maths', 'mathematics'],
  },
  {
    short: 'Inter',
    label: 'Intermediate / +2',
    examples: 'MPC · BiPC · CEC · HEC · Junior college · Classes 11–12',
    image: P.students,
    keywords: ['intermediate', 'junior college', 'mpc', 'bipc', 'cec', 'hec', 'class 11', 'class 12'],
  },
  {
    short: 'Degree',
    label: 'Degree and Undergraduate',
    examples: 'B.A. · B.Sc · B.Com · BBA · BCA · B.Ed · UG admissions',
    image: P.degree,
    keywords: ['degree', 'undergraduate', 'bachelor', 'graduation', 'bsc', 'bcom', 'bba', 'bca', 'bed'],
  },
  {
    short: 'Engineering',
    label: 'Engineering and Technology',
    examples: 'B.Tech · EAPCET · JEE · Engineering college admissions · Coding classes',
    image: P.engineering,
    keywords: ['engineering', 'jee', 'btech', 'eapcet', 'polytechnic', 'computer science', 'coding'],
  },
  {
    short: 'Medical',
    label: 'Medical',
    examples: 'MBBS · BDS · BAMS · BHMS · Nursing · Pharmacy',
    image: P.medical,
    keywords: ['medical', 'mbbs', 'bds', 'bams', 'bhms', 'nursing', 'pharmacy', 'neet', 'paramedical', 'healthcare'],
  },
  {
    short: 'Law',
    label: 'Law',
    examples: 'LLB · LLM · BA LLB · AP LAWCET · TS LAWCET · CLAT · AILET',
    image: P.law,
    keywords: ['law', 'llb', 'llm', 'clat', 'ailet', 'lawcet', 'legal', 'judiciary'],
  },
  {
    short: 'MBA',
    label: 'MBA, BBA, PGDM and Management',
    examples: 'MBA · BBA · PGDM · CAT · Management admissions',
    image: P.business,
    keywords: ['mba', 'bba', 'pgdm', 'management', 'cat', 'admission'],
  },
  {
    short: 'PG',
    label: 'Postgraduate',
    examples: 'M.A. · M.Sc · M.Com · MCA · M.Tech · PG diploma',
    image: P.postgrad,
    keywords: ['postgraduate', 'post graduate', 'masters', 'msc', 'mcom', 'mca', 'mtech', 'pg diploma'],
  },
  {
    short: 'PhD',
    label: 'PhD and Research',
    examples: 'PhD · Doctorate · Research methodology · JRF',
    image: P.research,
    keywords: ['phd', 'doctorate', 'research', 'thesis', 'fellowship', 'jrf'],
  },
  {
    short: 'Diploma',
    label: 'Diploma, Polytechnic and ITI',
    examples: 'Diploma · Polytechnic · ITI trades · Vocational certificates',
    image: P.maths,
    keywords: ['diploma', 'polytechnic', 'iti', 'vocational', 'apprentice'],
  },
  {
    short: 'Entrance',
    label: 'Entrance examinations',
    examples: 'NEET · JEE · CAT · GATE · UGC NET · UPSC · EAPCET and others',
    image: P.exam,
    keywords: ['entrance', 'neet', 'jee', 'cat', 'gate', 'ugc net', 'upsc', 'eapcet', 'cet', 'prelims', 'exam'],
  },
  {
    short: 'Music',
    label: 'Music classes',
    examples: 'Guitar · Singing · Piano · Drums · Theory',
    image: P.music,
    keywords: ['music', 'guitar', 'singing', 'vocal', 'piano', 'keyboard', 'drums', 'percussion'],
    group: 'Personal',
  },
  {
    short: 'Dance',
    label: 'Dance',
    examples: 'Classical · Bollywood · Western · Kids dance',
    image: P.dance,
    keywords: ['dance', 'bharatanatyam', 'kuchipudi', 'bollywood', 'hip hop', 'salsa', 'ballet'],
    group: 'Personal',
  },
  {
    short: 'Arts & Craft',
    label: 'Arts and Craft',
    examples: 'Drawing · Painting · Craft · Photography · Design',
    image: P.arts,
    keywords: ['art', 'arts', 'drawing', 'painting', 'sketching', 'craft', 'photography', 'design'],
    group: 'Personal',
  },
  {
    short: 'Languages',
    label: 'Languages',
    examples: 'English · Hindi · French · Spanish · German',
    image: P.language,
    keywords: ['language', 'english', 'hindi', 'french', 'spanish', 'german', 'japanese', 'spoken'],
    group: 'Personal',
  },
  {
    short: 'Yoga & Fitness',
    label: 'Yoga and Fitness',
    examples: 'Yoga · Fitness · Zumba · Meditation · Wellness',
    image: P.yoga,
    keywords: ['yoga', 'fitness', 'gym', 'zumba', 'aerobics', 'meditation', 'wellness'],
    group: 'Personal',
  },
  {
    short: 'Personality',
    label: 'Personality and Life Skills',
    examples: 'Communication · Life skills · Public speaking · Interview prep',
    image: P.students,
    keywords: ['personality', 'life skills', 'communication', 'public speaking', 'confidence', 'soft skills'],
    group: 'Personal',
  },
  {
    short: 'IT & AI',
    label: 'IT, AI and Programming',
    examples: 'Python · Web development · AI and ML · Cyber security',
    image: P.it,
    keywords: ['python', 'java', 'programming', 'coding', 'web development', 'artificial intelligence', 'machine learning', 'cyber'],
    group: 'Professional',
  },
  {
    short: 'Data & Cloud',
    label: 'Data, Analytics and Cloud',
    examples: 'Data science · AWS · Azure · Analytics · DevOps',
    image: P.data,
    keywords: ['data science', 'cloud', 'aws', 'azure', 'analytics', 'devops', 'sql', 'big data'],
    group: 'Professional',
  },
  {
    short: 'Business & Finance',
    label: 'Business and Finance',
    examples: 'Accounting · Taxation · Banking · Investment',
    image: P.finance,
    keywords: ['finance', 'accounting', 'taxation', 'gst', 'tally', 'banking', 'investment', 'mutual fund'],
    group: 'Professional',
  },
  {
    short: 'CA / CMA / CS',
    label: 'CA, CMA and CS',
    examples: 'CA foundation · CMA · CS executive · GST compliance',
    image: P.finance,
    keywords: ['chartered accountant', 'ca foundation', 'ca inter', 'cma', 'cost accountant', 'company secretary', 'cs executive'],
    group: 'Professional',
  },
  {
    short: 'Government Exams',
    label: 'Government exams',
    examples: 'UPSC · SSC · Banking · Railway · State PSC',
    image: P.government,
    keywords: ['upsc', 'ssc', 'ibps', 'sbi po', 'railway', 'rrb', 'ntpc', 'appsc', 'tspsc', 'group', 'police'],
    group: 'Professional',
  },
  {
    short: 'Digital Marketing',
    label: 'Digital Marketing',
    examples: 'SEO · Social media · Google Ads · Content',
    image: P.marketing,
    keywords: ['digital marketing', 'seo', 'social media', 'google ads', 'ppc', 'content marketing', 'branding'],
    group: 'Professional',
  },
  {
    short: 'UPSC',
    label: 'UPSC',
    examples: 'Prelims · Mains · Interview',
    image: P.exam,
    keywords: ['upsc'],
    group: 'Competitive',
  },
  {
    short: 'APPSC',
    label: 'APPSC',
    examples: 'Group I · Group II · State services',
    image: P.exam,
    keywords: ['appsc'],
    group: 'Competitive',
  },
  {
    short: 'NEET',
    label: 'NEET',
    examples: 'NEET UG · Medical entrance',
    image: P.medical,
    keywords: ['neet'],
    group: 'Competitive',
  },
  {
    short: 'JEE',
    label: 'JEE',
    examples: 'JEE Main · JEE Advanced',
    image: P.engineering,
    keywords: ['jee'],
    group: 'Competitive',
  },
  {
    short: 'SSC',
    label: 'SSC',
    examples: 'CGL · CHSL · GD',
    image: P.exam,
    keywords: ['ssc'],
    group: 'Competitive',
  },
  {
    short: 'Banking',
    label: 'Banking',
    examples: 'IBPS · SBI PO · Clerical',
    image: P.finance,
    keywords: ['banking', 'ibps', 'sbi po'],
    group: 'Competitive',
  },
];

/** Whole-word, case-insensitive matcher for a section's keyword list. */
const sectionPattern = (keywords: string[]) =>
  new RegExp(`(^|[^a-z0-9])(?:${keywords.join('|')})(?![a-z0-9])`, 'i');

// Certification text is deliberately excluded: every course advertises a
// "completion certificate", which would make broad keywords such as Diploma
// match the entire catalogue.
const searchText = (course: CourseListing) =>
  [course.title, course.provider, course.category, course.description, course.duration, course.eligibility]
    .join(' ')
    .toLowerCase();

/** A class tile ("LKG", "Class 10") matches listings that name that class. */
const schoolClassMatch = (course: CourseListing, label: string) => {
  // Whole-label match so "Class 1" never picks up "Class 10", "Class 11" or "Class 12".
  const term = label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${term}(?![a-z0-9])`, 'i').test(searchText(course));
};

/** The five school filters used by the School Education entry screen. */
const SCHOOL_FILTERS = ['Admissions', 'Tuition', 'Coaching', 'Online', 'Offline'] as const;

type BrowseTile = { label: string; emoji: string };

/** Grouped browse tiles on a class page, in the style of a category screen. */
const SCHOOL_SUBJECTS: BrowseTile[] = [
  { label: 'Maths', emoji: '📐' },
  { label: 'Science', emoji: '🔬' },
  { label: 'English', emoji: '📖' },
  { label: 'Social', emoji: '🌏' },
  { label: 'Hindi', emoji: '🗣️' },
  { label: 'Computer', emoji: '💻' },
];

const SCHOOL_BOARDS: BrowseTile[] = [
  { label: 'CBSE', emoji: '🏫' },
  { label: 'ICSE', emoji: '🎓' },
  { label: 'State board', emoji: '📘' },
];

const SCHOOL_MODES: BrowseTile[] = [
  { label: 'Admissions', emoji: '📋' },
  { label: 'Tuition', emoji: '📚' },
  { label: 'Coaching', emoji: '👥' },
  { label: 'Online', emoji: '🖥️' },
  { label: 'Offline', emoji: '📍' },
];

const SCHOOL_SUBJECT_PILLS = ['All Subjects', 'Maths', 'Science', 'English', 'Languages', 'Social', 'Other'] as const;

const SCHOOL_SUBJECT_ICONS: Record<string, typeof Sigma> = {
  'All Subjects': LayoutGrid,
  Maths: Sigma,
  Science: Atom,
  English: BadgeCheck,
  Languages: Languages,
  Social: Globe,
  Other: MoreHorizontal,
};

/** Filter groups shown in the Filters panel; they reuse FILTER_OPTIONS. */
const SCHOOL_FILTER_GROUPS = ['Board', 'Mode', 'Fees', 'Rating'] as const;

const FILTER_OPTIONS: Record<string, string[]> = {
  Board: ['CBSE', 'ICSE', 'State board'],
  Mode: ['Online', 'Offline', 'Hybrid'],
  Fees: ['Under ₹5,000', '₹5,000 – ₹10,000', 'Above ₹10,000'],
  Rating: ['4.0+', '4.5+'],
  Sort: ['Fee: low to high', 'Fee: high to low'],
};

/**
 * Inline Filters control used by every academic listing page (and therefore by
 * admissions, tuition and coaching alike): one pill that expands a grouped
 * panel of chips, two columns from the sm breakpoint up.
 */
function SchoolFilters({
  open,
  onToggle,
  activeCount,
  groups,
  selected,
  onPick,
  onClear,
}: {
  open: boolean;
  onToggle: () => void;
  activeCount: number;
  groups: AcademicFilterGroup[];
  selected: (key: string) => string | null;
  onPick: (key: string, option: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition sm:text-[12px] ${open ? 'border-[#2874f0] bg-[#f7f3ff] text-[#2874f0]' : 'border-[#2874f0]/60 bg-white text-[#2874f0]'}`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        Filters
        {activeCount > 0 && (
          <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-[#2874f0] px-1 text-[9px] font-black leading-none text-white">{activeCount}</span>
        )}
      </button>

      {open && (
        <div role="group" aria-label="Filters" className="mt-2 rounded-2xl border border-[#e8ecf3] bg-white p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.key}>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a97ab]">{group.title}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.options.map((option) => {
                    const isSelected = selected(group.key) === option.label;
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => onPick(group.key, option.label)}
                        aria-pressed={isSelected}
                        className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition ${isSelected ? 'border-[#2874f0] bg-[#efe8ff] text-[#5b3fa8]' : 'border-[#dfe6ef] bg-white text-[#1f2937] hover:bg-[#f8fafc]'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start justify-between gap-2 border-t border-[#eef1f6] pt-2">
            <p className="text-[10px] leading-tight text-[#8a97ab]">
              Filters use each listing's own published details. Listings without that information stay out of the results instead of being guessed.
            </p>
            <button type="button" onClick={onClear} className="shrink-0 text-[11px] font-bold text-[#2874f0]">Clear all</button>
          </div>
        </div>
      )}
    </div>
  );
}

const ACADEMIC_SECTION_KEY = ['bos', 'academic', 'section', 'v1'].join('_');

function readSavedSectionIndex(): number {
  if (typeof window === 'undefined') return 0;
  const saved = Number(window.sessionStorage.getItem(ACADEMIC_SECTION_KEY));
  return Number.isInteger(saved) && saved >= 0 && saved < SECTIONS.length ? saved : 0;
}

function BrowseGroup({ title, tiles, active, onSelect }: { title: string; tiles: BrowseTile[]; active: string | null; onSelect: (value: string | null) => void }) {
  return (
    <section className="mt-3">
      <h3 className="text-[13px] font-extrabold tracking-tight text-[#0f1c3d] sm:text-[15px]">{title}</h3>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
        {tiles.map(({ label, emoji }) => {
          const isActive = active === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(isActive ? null : label)}
              aria-pressed={isActive}
              className="flex flex-col items-center gap-1 text-center"
            >
              <span
                aria-hidden
                className={`flex h-[46px] w-full max-w-[62px] items-center justify-center rounded-xl text-[20px] ring-1 transition ${isActive ? 'bg-[#eef4ff] ring-2 ring-[#2874f0]' : 'bg-[#f3f6fc] ring-[#e7eef8] hover:bg-[#eef3fb]'}`}
              >
                {emoji}
              </span>
              <span className={`line-clamp-2 text-[9.5px] font-bold leading-tight sm:text-[11px] ${isActive ? 'text-[#2874f0]' : 'text-[#23324d]'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AcademicStreamExplorer({ courses, query = '', onOpen, sectionRequest, admissionRequest, scope = 'Academic', sectionId }: Props) {
  const [activeIndex, setActiveIndex] = useState(readSavedSectionIndex);
  // Each pathway (academic, personal, professional) shows only its own categories.
  const sections = useMemo(() => {
    const scoped = SECTIONS.filter((section) => (section.group ?? 'Academic') === scope);
    // The centralized taxonomy uses stable section IDs, while this explorer
    // still stores its legacy rails as Academic/Personal/Professional groups.
    // Keep the explorer usable for the new Competitive and other IDs until
    // those legacy rails are migrated into the same configurable taxonomy.
    return scoped.length > 0 ? scoped : SECTIONS;
  }, [scope]);
  const safeIndex = Math.min(activeIndex, sections.length - 1);
  const active = sections[safeIndex];

  // Switching pathway starts at its first category instead of a foreign index.
  const scopeRef = useRef(scope);
  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    setActiveIndex(0);
  }, [scope]);

  // The rail filters the academic listing pool locally, so a section can never
  // bounce the learner out of the pathway or empty the grid through the parent
  // query while the section itself still has listings to show.
  const pool = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? courses.filter((course) => searchText(course).includes(term)) : courses;
  }, [courses, query]);

  const pattern = useMemo(() => sectionPattern(active.keywords), [active]);
  const matched = useMemo(
    () => pool.filter((course) => pattern.test(searchText(course))),
    [pool, pattern],
  );

  // Picking a class or a service opens a dedicated category page. Filters then
  // narrow it, and each category offers only the groups its data can answer.
  const [schoolClass, setSchoolClass] = useState<string | null>(null);
  const [schoolService, setSchoolService] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [schoolSort, setSchoolSort] = useState<string | null>(null);
  const [schoolLayout, setSchoolLayout] = useState<'list' | 'grid'>('grid');
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [schoolSheetOpen, setSchoolSheetOpen] = useState(false);
  const [sheetCollapsed, setSheetCollapsed] = useState<string[]>([]);
  const [sheetBodyOpen, setSheetBodyOpen] = useState(true);

  const groups = useMemo(
    () => buildAcademicFilters(active.short, schoolService, matched),
    [active.short, schoolService, matched],
  );
  // Only selections whose group is visible for this category/service apply or count.
  const activeFilters = Object.fromEntries(
    Object.entries(selectedFilters).filter(([key]) => groups.some((group) => group.key === key)),
  ) as Record<string, string>;
  const activeFilterCount = Object.keys(activeFilters).length;
  const currentFilterValue = (key: string) => activeFilters[key] ?? null;
  const setFilter = (key: string, value: string | null) =>
    setSelectedFilters((previous) => {
      const next = { ...previous };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  const toggleFilter = (key: string, option: string) =>
    setFilter(key, currentFilterValue(key) === option ? null : option);
  const clearFilters = () => setSelectedFilters({});
  const resetPage = () => {
    setSelectedFilters({});
    setSchoolClass(null);
    setSchoolService(null);
    setSchoolSort(null);
    setOpenFilter(null);
    setSchoolSheetOpen(false);
  };
  const closeSchoolPage = resetPage;
  const chooseService = (next: string | null) => {
    setSchoolService(next);
    // A service switch drops filters that belong to another service.
    setSelectedFilters((previous) => {
      if (next !== 'Admissions') return previous;
      const rest = { ...previous };
      delete rest.subject;
      return rest;
    });
  };
  // A chosen class or sub-category opens the same listing page in every category.
  const schoolPageOpen = Boolean(schoolClass) || (active.short === 'School' && Boolean(schoolService));

  // Jumping straight to admissions switches section, so the category reset
  // below must not immediately undo the request.
  const keepAdmissionRequest = useRef(false);
  useEffect(() => {
    if (!admissionRequest) return;
    // The category-reset effect also runs on mount; this request must outlive it.
    keepAdmissionRequest.current = true;
    const schoolIndex = sections.findIndex((section) => section.short === 'School');
    if (schoolIndex >= 0 && schoolIndex !== activeIndex) setActiveIndex(schoolIndex);
    setSelectedFilters({});
    setSchoolClass(null);
    setSchoolService('Admissions');
    setSchoolSheetOpen(true);
  }, [admissionRequest]);

  // A different category never inherits another category's filters.
  useEffect(() => {
    if (keepAdmissionRequest.current) {
      keepAdmissionRequest.current = false;
      return;
    }
    setSelectedFilters({});
    setSchoolClass(null);
    setSchoolService(null);
    setSchoolSort(null);
    setOpenFilter(null);
    setSchoolSheetOpen(false);
  }, [active.short]);

  const classBadge = schoolClass
    ? schoolClass.replace(/[^0-9]/g, '') || schoolClass.slice(0, 2).toUpperCase()
          : (schoolService ?? 'All').slice(0, 2).toUpperCase();

  /**
   * The listings this page shows. Class and service define the page; panel
   * groups narrow it. Zero matches stay zero: no unfiltered fallback.
   */
  const visibleListings = useMemo(() => {
    let list = matched.filter(
      (course) => (!schoolClass || schoolClassMatch(course, schoolClass)) && matchesService(course, schoolService),
    );
    list = list.filter((course) => matchesAcademicFilters(course, selectedFilters, groups));
    if (schoolSort === 'Fee: low to high') list = [...list].sort((a, b) => a.fee - b.fee);
    else if (schoolSort === 'Fee: high to low') list = [...list].sort((a, b) => b.fee - a.fee);
    else if (schoolSort === 'Popularity') list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return list;
  }, [matched, schoolClass, schoolService, selectedFilters, groups, schoolSort]);
  const schoolResults = schoolPageOpen ? visibleListings : [];

  const explorerShelves = useMemo(
    () =>
      shelvesForExplorer({
        sectionId,
        railShort: active.short,
        schoolClass,
        subject: activeFilters.subject ?? null,
      }),
    [sectionId, active.short, schoolClass, activeFilters.subject],
  );

  const sectionIsEmpty = matched.length === 0;

  // Keep the chosen section across module switches and remounts so the screen
  // comes back the way the learner left it instead of resetting to School.
  useEffect(() => {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(ACADEMIC_SECTION_KEY, String(activeIndex));
  }, [activeIndex]);

  // A landing card (for example "Classes 9 – 10") jumps straight to its section
  // instead of dropping the learner back on the pathway landing.
  useEffect(() => {
    if (!sectionRequest) return;
    const index = sections.findIndex((section) => section.short.toLowerCase() === sectionRequest.short.toLowerCase());
    if (index >= 0) setActiveIndex(index);
  }, [sectionRequest, sections]);

  return (
    <section className="overflow-hidden bg-white">
      <div className="flex min-h-[560px]">
        {/* The rail scrolls on its own so all sections stay reachable while the
            listings beside it remain visible. */}
        <aside aria-label="Academic categories" className="max-h-[70vh] w-[68px] shrink-0 self-start overflow-y-auto border-r border-[#e6ecf6] bg-[#f0f5fc] sm:w-[136px]">
          {sections.map((section, index) => {
            const isActive = index === safeIndex;
            return (
              <button
                key={section.label}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-pressed={isActive}
                className={`relative flex w-full flex-col items-center gap-1 border-b border-[#e3e9f4] px-0.5 py-2 text-center transition sm:gap-1.5 sm:px-1 sm:py-2.5 ${isActive ? 'bg-white' : 'hover:bg-white/70'}`}
              >
                {isActive && <span aria-hidden className="absolute left-0 top-3 h-[calc(100%-24px)] w-[3px] rounded-r bg-[#2874f0]" />}
                <span className={`h-8 w-8 overflow-hidden rounded-xl bg-white transition sm:h-11 sm:w-11 ${isActive ? 'ring-2 ring-[#2874f0]/30' : 'ring-1 ring-[#dbe5f3]'}`}>
                  <SafeImage src={img(section.image, 180)} alt="" category="classes" className="h-full w-full object-cover" sizes="44px" />
                </span>
                <span className={`text-[8.5px] font-bold leading-[1.15] sm:text-[10.5px] ${isActive ? 'text-[#2874f0]' : 'text-[#5b6b85]'}`}>{section.short}</span>
              </button>
            );
          })}
        </aside>

        <div className="min-w-0 flex-1">
          <div className="px-2.5 py-3 sm:px-5 sm:py-5">
            {active.short === 'School' && schoolSheetOpen ? (
              <div className="rounded-xl border border-[#e8ecf3] bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setSheetBodyOpen((open) => !open)} aria-expanded={sheetBodyOpen} aria-label={sheetBodyOpen ? 'Collapse filters' : 'Expand filters'} className="flex items-center gap-1 text-[13px] font-extrabold text-[#12244a]">
                    Filters
                    <ChevronDown className={`h-3.5 w-3.5 transition ${sheetBodyOpen ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={clearFilters} className="text-[11px] font-bold text-[#2874f0]">Clear All</button>
                    <button type="button" onClick={closeSchoolPage} aria-label="Close filters" className="text-[15px] font-bold leading-none text-[#12244a]">×</button>
                  </div>
                </div>

                {sheetBodyOpen && (
                <>
                {[
                  {
                    key: 'Service',
                    options: ['Admissions', 'Tuition', 'Coaching'],
                    selected: schoolService,
                    onPick: (option: string) => chooseService(schoolService === option ? null : option),
                  },
                  {
                    key: 'Class',
                    options: ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'],
                    selected: schoolClass,
                    onPick: (option: string) => setSchoolClass(schoolClass === option ? null : option),
                  },
                  {
                    key: 'Board',
                    options: [...FILTER_OPTIONS.Board],
                    selected: currentFilterValue('board'),
                    onPick: (option: string) => toggleFilter('board', option),
                  },
                ].map((group) => {
                  const collapsed = sheetCollapsed.includes(group.key);
                  return (
                    <div key={group.key} className="mt-2.5 border-t border-[#eef1f6] pt-2">
                      <button
                        type="button"
                        aria-expanded={!collapsed}
                        onClick={() => setSheetCollapsed((list) => (list.includes(group.key) ? list.filter((k) => k !== group.key) : [...list, group.key]))}
                        className="flex w-full items-center justify-between text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[#6b7a90]"
                      >
                        {group.key}
                        <ChevronDown className={`h-4 w-4 transition ${collapsed ? '' : 'rotate-180'}`} aria-hidden />
                      </button>
                      {!collapsed && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {group.options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => group.onPick(option)}
                              aria-pressed={group.selected === option}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${group.selected === option ? 'border-[#2874f0] bg-[#efe8ff] text-[#5b3fa8]' : 'border-[#d9dfe9] bg-white text-[#1f2937]'}`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                </>
                )}

                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={resetPage} className="flex-1 rounded-full border border-[#d9dfe9] bg-white py-2 text-[12px] font-bold text-[#12244a]">Reset</button>
                  <button type="button" onClick={() => setSchoolSheetOpen(false)} className="flex-[1.6] rounded-full bg-[#2874f0] py-2 text-[12px] font-bold text-white">Show Results ({schoolResults.length})</button>
                </div>
              </div>
            ) : schoolPageOpen ? (
              <div>
                <div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold text-[#7185a6] sm:text-[11px]">
                  <button type="button" onClick={closeSchoolPage} className="font-bold text-[#2874f0]">← {active.short}</button>
                  <ChevronRight className="h-3 w-3" aria-hidden />
                  <span className="font-bold text-[#12244a]">{schoolClass ?? schoolService ?? active.short}</span>
                  {schoolClass && schoolService && (
                    <>
                      <ChevronRight className="h-3 w-3" aria-hidden />
                      <span>{schoolService}</span>
                    </>
                  )}
                </div>

                <div className="relative mt-2 overflow-hidden rounded-[2px] border border-[#f0f0f0] bg-white px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[2px] bg-[#2874f0] text-[12px] font-black text-white">
                      {classBadge}
                    </span>
                    <div className="min-w-0 pr-8">
                      <h2 className="text-[15px] font-bold leading-tight text-[#212121] sm:text-[19px]">
                        {schoolClass ?? 'All classes'}{schoolService ? ` \u00b7 ${schoolService}` : ''}
                      </h2>
                      <p className="mt-0.5 text-[9.5px] font-semibold text-[#878787] sm:text-[11px]">
                        {active.short === 'School'
                          ? `CBSE · ICSE · State board${schoolService === 'Tuition' || schoolService === 'Coaching' ? ' · All subjects' : ''}`
                          : active.examples}
                      </p>
                    </div>
                  </div>
                  <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 text-[38px] leading-none">🎓</span>
                </div>

                {/* Every category's page offers the same service choice; only
                    School opens the admissions-style filter sheet. */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {['Admissions', 'Tuition', 'Coaching'].map((service) => {
                    const isActive = schoolService === service;
                    return (
                      <button
                        key={service}
                        type="button"
                        onClick={() => {
                          const next = isActive ? null : service;
                          chooseService(next);
                          setSchoolSheetOpen(active.short === 'School' && Boolean(next));
                        }}
                        aria-pressed={isActive}
                        className={`rounded-[2px] border px-3 py-1.5 text-[10px] font-bold transition sm:text-[11px] ${isActive ? 'border-[#2874f0] bg-[#2874f0] text-white' : 'border-[#e0e0e0] bg-white text-[#212121] hover:bg-[#f5f7fa]'}`}
                      >
                        {service}
                      </button>
                    );
                  })}
                </div>

                {/* Subjects belong to tuition and coaching; admissions never shows them. */}
                {(schoolService === 'Tuition' || schoolService === 'Coaching') && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFilter('subject', null)}
                      aria-pressed={!currentFilterValue('subject')}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[10px] font-bold transition sm:text-[11px] ${!currentFilterValue('subject') ? 'border-[#2874f0] bg-[#2874f0] text-white' : 'border-[#e0e0e0] bg-white text-[#212121] hover:bg-[#f5f7fa]'}`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> All subjects
                    </button>
                    {SCHOOL_SUBJECT_FILTERS.map(({ label }) => {
                      const isActive = currentFilterValue('subject') === label;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleFilter('subject', label)}
                          aria-pressed={isActive}
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[10px] font-bold transition sm:text-[11px] ${isActive ? 'border-[#2874f0] bg-[#2874f0] text-white' : 'border-[#e0e0e0] bg-white text-[#212121] hover:bg-[#f5f7fa]'}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <SchoolFilters
                  open={openFilter === 'All'}
                  onToggle={() => setOpenFilter(openFilter === 'All' ? null : 'All')}
                  activeCount={activeFilterCount}
                  groups={groups}
                  selected={currentFilterValue}
                  onPick={toggleFilter}
                  onClear={clearFilters}
                />

                <div className="mt-2.5 flex flex-wrap items-center gap-1 border-b border-[#f0f0f0] pb-2 text-[12px]">
                  {(['Relevance', 'Popularity', 'Fee: low to high', 'Fee: high to low'] as const).map((option) => {
                    const active = (option === 'Relevance' && !schoolSort) || schoolSort === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSchoolSort(option === 'Relevance' ? null : option)}
                        aria-pressed={active}
                        className={`px-2 py-1 ${active ? 'border-b-2 border-[#2874f0] font-bold text-[#2874f0]' : 'text-[#212121]'}`}
                      >
                        {option === 'Fee: low to high' ? 'Price — Low to High' : option === 'Fee: high to low' ? 'Price — High to Low' : option}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <p className="truncate text-[10.5px] font-semibold text-[#5b6b85]">
                    <span className="font-black text-[#12244a]">{schoolResults.length} {schoolResults.length === 1 ? 'result' : 'results'}</span> for {schoolClass ?? schoolService ?? 'all classes'}
                    {schoolClass && schoolService ? ` \u00b7 ${schoolService}` : ''}
                    {currentFilterValue('subject') ? ` \u00b7 ${currentFilterValue('subject')}` : ''}
                  </p>
                  <div className="flex shrink-0 rounded-[2px] border border-[#e6ecf6] p-0.5">
                    <button
                      type="button"
                      onClick={() => setSchoolLayout('grid')}
                      aria-pressed={schoolLayout === 'grid'}
                      aria-label="Grid view"
                      className={`rounded-md p-1 ${schoolLayout === 'grid' ? 'bg-[#2874f0] text-white' : 'text-[#8ca0c0]'}`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchoolLayout('list')}
                      aria-pressed={schoolLayout === 'list'}
                      aria-label="List view"
                      className={`rounded-md p-1 ${schoolLayout === 'list' ? 'bg-[#2874f0] text-white' : 'text-[#8ca0c0]'}`}
                    >
                      <List className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>

                {schoolLayout === 'list' && schoolResults.length > 0 ? (
                  <div className="mt-2 space-y-2.5">
                    {schoolResults.map((course) => (
                      <ClassesServiceCard key={course.id} course={course} onOpen={onOpen} layout="featured" />
                    ))}
                  </div>
                ) : explorerShelves && !(schoolResults.length === 0 && (activeFilterCount > 0 || Boolean(schoolService))) ? (
                  <div className="mt-3">
                    <ClassesSectionShelves
                      shelves={explorerShelves}
                      courses={schoolResults}
                      inventory={matched}
                      onOpen={onOpen}
                      titleMode={schoolClass === 'Class 5' || schoolClass === 'Class 10' ? 'subject' : 'full'}
                    />
                  </div>
                ) : schoolResults.length > 0 ? (
                  <div className="mt-3">
                    <ClassesListingsStrip
                      title={schoolClass ?? schoolService ?? active.short}
                      courses={schoolResults}
                      onOpen={onOpen}
                      showHeading={false}
                    />
                  </div>
                ) : (
                  <div>
                    <div className="mt-2.5 rounded-2xl border border-dashed border-[#dfe7f3] bg-[#fbfdff] px-3 py-5 text-center sm:px-4 sm:py-6">
                      <GraduationCap className="mx-auto h-6 w-6 text-[#2874f0]" aria-hidden />
                      <p className="mt-1.5 text-[12px] font-bold text-[#12244a]">No listings for this selection yet</p>
                      <p className="mx-auto mt-0.5 max-w-[34rem] text-[10.5px] leading-tight text-[#7185a6]">
                        {activeFilterCount > 0 || schoolService || schoolClass
                          ? 'No listing in this selection matches the filters you chose. Clear a filter to widen the results.'
                          : 'Approved batches appear here as soon as a provider publishes one.'}
                      </p>
                      {(activeFilterCount > 0 || schoolService || schoolClass) && (
                        <button
                          type="button"
                          onClick={resetPage}
                          className="mt-2 rounded-full border border-[#2874f0] px-3 py-1.5 text-[11px] font-bold text-[#2874f0]"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {active.short === 'School' && (
                  <SchoolClassPicker
                    filter={schoolService}
                    onFilter={(value) => {
                      chooseService(value);
                      setSchoolSheetOpen(Boolean(value));
                    }}
                    modeFilter={currentFilterValue('mode')}
                    onModeFilter={(value) => setFilter('mode', value)}
                    selectedClass={schoolClass}
                    onSelectClass={setSchoolClass}
                  />
                )}
                {active.short !== 'School' && (
                  <AcademicTrackPicker
                    section={active.short}
                    selected={schoolClass}
                    onSelect={setSchoolClass}
                    service={schoolService}
                    onService={chooseService}
                  />
                )}
                <SchoolFilters
                  open={openFilter === 'All'}
                  onToggle={() => setOpenFilter(openFilter === 'All' ? null : 'All')}
                  activeCount={activeFilterCount}
                  groups={groups}
                  selected={currentFilterValue}
                  onPick={toggleFilter}
                  onClear={clearFilters}
                />

                <h3 className="mt-2 flex items-center gap-1.5 text-[13px] font-extrabold tracking-tight text-[#0f1c3d] sm:gap-2 sm:text-[15.5px]">
                  <span className="rounded-lg bg-[#eef4ff] p-1.5"><CalendarDays className="h-4 w-4 text-[#2874f0]" /></span>
                  Listings in {active.short}
                  <span className="rounded-full bg-[#f2f6fc] px-2 py-0.5 text-[10px] font-bold text-[#7185a6]">{visibleListings.length}</span>
                </h3>

                {explorerShelves ? (
                  <div className="mt-2.5 sm:mt-3">
                    <ClassesSectionShelves shelves={explorerShelves} courses={pool} inventory={pool} onOpen={onOpen} />
                  </div>
                ) : visibleListings.length > 0 ? (
                  <div className="mt-2.5 sm:mt-3">
                    <ClassesListingsStrip title={`Listings in ${active.short}`} courses={visibleListings} onOpen={onOpen} showHeading={false} />
                  </div>
                ) : (
                  <div className="mt-2.5 rounded-2xl border border-dashed border-[#dfe7f3] bg-[#fbfdff] px-3 py-6 text-center sm:mt-3 sm:px-4 sm:py-7">
                    <GraduationCap className="mx-auto h-6 w-6 text-[#2874f0]" aria-hidden />
                    <p className="mt-1.5 text-[12px] font-bold text-[#12244a]">
                      {matched.length > 0 ? 'No listings match these filters' : `No listings in ${active.label} yet`}
                    </p>
                    <p className="mx-auto mt-0.5 max-w-[34rem] text-[10.5px] leading-tight text-[#7185a6]">
                      {matched.length > 0
                        ? 'Clear a selected filter to see every approved listing in this section.'
                        : query.trim()
                          ? 'Nothing in this section matches your search. Clear the search to see every approved academic listing.'
                          : `${active.label} tuition and admission batches appear here as soon as a provider publishes an admin-approved calendar.`}
                    </p>
                  </div>
                )}

                {sectionIsEmpty && pool.length > 0 && !explorerShelves && (
                  <section aria-label="Other academic listings" className="mt-6 border-t border-[#eef2f8] pt-4">
                    <ClassesListingsStrip title="Other academic listings" courses={pool} onOpen={onOpen} />
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
