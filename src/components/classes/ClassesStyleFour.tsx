import { ArrowRight, BookOpen, Briefcase, Check, ChevronRight, Search, Sparkles, Trophy } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { CourseListing } from '../../data/classesTimingsData';
import { CLASS_MAIN_SECTIONS, type ClassMainSectionId } from '../../data/classesTaxonomy';
import SafeImage from '../SafeImage';
import { AcademicStreamExplorer } from './AcademicStreamExplorer';
import { ClassesListingsStrip, ClassesSectionShelves } from './ClassesListingCarousel';
import { ClassesServiceCard } from './ClassesServiceCard';
import { SHELVES_BY_SECTION } from './classesShelfCatalog';

type AcademicSectionRequest = { short: string; key: number };

type Props = {
  courses: CourseListing[];
  academicCourses?: CourseListing[];
  query: string;
  onQuery: (value: string) => void;
  onCategory: (value: string) => void;
  onOpen: (course: CourseListing) => void;
  group?: 'All' | ClassMainSectionId | 'Academic' | 'Personal' | 'Professional';
  academicSectionRequest?: AcademicSectionRequest | null;
  onAcademicSection?: (section: string) => void;
};

/** Landing labels that stand for one Academic rail section. */
const ACADEMIC_SECTION_BY_LABEL: Record<string, string> = {
  'School Education': 'School', School: 'School', 'Nursery, LKG, UKG': 'School',
  'Classes 1 – 5': 'School', 'Classes 6 – 8': 'School', 'Classes 9 – 10': 'School',
  'Boards & Curriculum': 'School', 'Classes 11 – 12': 'Inter', 'Intermediate / +2': 'Inter',
  Intermediate: 'Inter', 'Degree & Undergraduate': 'Degree', Degree: 'Degree',
  'Engineering & Technology': 'Engineering', Engineering: 'Engineering',
  'Medical & Healthcare': 'Medical', Medical: 'Medical', 'Law Education': 'Law', Law: 'Law',
  'MBA & Management': 'MBA', MBA: 'MBA', Postgraduate: 'PG', 'Postgraduate Programmes': 'PG',
  'PhD & Research': 'PhD', 'Diploma & ITI': 'Diploma', 'Entrance Exams': 'Entrance',
  'Music & Performing Arts': 'Music', Dance: 'Dance', 'Arts & Craft': 'Arts & Craft',
  Languages: 'Languages', 'Yoga & Fitness': 'Yoga & Fitness', 'Personality Development': 'Personality',
  'IT & AI': 'IT & AI', 'Data & Cloud': 'Data & Cloud', 'Business & Finance': 'Business & Finance',
  'CA / CMA / CS': 'CA / CMA / CS', 'Government Exams': 'Government Exams', 'Digital Marketing': 'Digital Marketing',
};

const CATEGORY_ID_TO_RAIL: Record<string, string> = {
  'class-academic': 'School',
  'class-govtexams': 'Entrance',
  'class-software': 'IT & AI',
  'class-ai': 'IT & AI',
  'class-languages': 'Languages',
  'class-music': 'Music',
  'class-dance': 'Dance',
  'class-fitness': 'Yoga & Fitness',
  'class-arts': 'Arts & Craft',
  'class-business': 'Business & Finance',
  'class-professional': 'IT & AI',
  'class-life-skills': 'Personality',
};

const EXPLORER_SCOPE: Record<string, 'Academic' | 'Personal' | 'Professional' | 'Competitive'> = {
  'academic-education': 'Academic',
  Academic: 'Academic',
  'competitive-exams': 'Competitive',
  'professional-career': 'Professional',
  Professional: 'Professional',
  'personal-hobbies': 'Personal',
  Personal: 'Personal',
};

const SECTION_ID: Record<string, ClassMainSectionId> = {
  'academic-education': 'academic-education',
  Academic: 'academic-education',
  'competitive-exams': 'competitive-exams',
  'professional-career': 'professional-career',
  Professional: 'professional-career',
  'personal-hobbies': 'personal-hobbies',
  Personal: 'personal-hobbies',
};

const photo = (id: string, width = 900) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=86`;

/** Unique education photography. One Unsplash id is never reused in CATEGORY_ART. */
const P = {
  classroomKids: 'photo-1503676260728-1c00da094a0b',
  schoolBuilding: 'photo-1580582932707-520aed937b7b',
  classroomChalk: 'photo-1427504494785-3a9ca7044f45',
  teacherKids: 'photo-1509062522246-3755977927d7',
  campusGrad: 'photo-1562774053-701939374585',
  campusStudents: 'photo-1523240795612-9a054b0db644',
  graduationHats: 'photo-1541339907198-e08756dedf3f',
  lectureHall: 'photo-1524178232363-1fb2b075b655',
  teaching: 'photo-1577896851231-70ef18881754',
  studying: 'photo-1513258496099-48168024aec0',
  examWriting: 'photo-1434030216411-0b793f4b4173',
  library: 'photo-1524995997946-a1c2e315a42f',
  libraryStacks: 'photo-1481627834876-b7833e8f5570',
  books: 'photo-1497633762265-9d179a990aa6',
  maths: 'photo-1509228468518-180dd4864904',
  science: 'photo-1532094349884-543bc11b234d',
  collab: 'photo-1522202176988-66273c2fd55f',
  meeting: 'photo-1517245386807-bb43f82c33c4',
  office: 'photo-1556761175-b413da4baf72',
  officeInterior: 'photo-1497366811353-6870744d04b2',
  business: 'photo-1454165804606-c3d57bc86b40',
  workshopTeam: 'photo-1552664730-d307ca884978',
  codingLaptop: 'photo-1517694712202-14dd9538aa97',
  codingDesk: 'photo-1498050108023-c5249f4df085',
  codingWorkshop: 'photo-1531482615713-2afd69097998',
  programming: 'photo-1555949963-aa79dcee981c',
  laptopWork: 'photo-1486312338219-ce68d2c6f44d',
  data: 'photo-1551288049-bebda4e38f71',
  medical: 'photo-1576091160399-112ba8d25d1d',
  law: 'photo-1589829545856-d10d557cf95f',
  music: 'photo-1511379938547-c1f69419868d',
  guitar: 'photo-1510915361894-db8b60106cb1',
  dance: 'photo-1508807526345-15e9b5f4eaff',
  yoga: 'photo-1544367567-0f2fcb009e0b',
  gym: 'photo-1571019614242-c5c5dee9f50b',
  language: 'photo-1546410531-bb4caa6b424d',
  kidsToys: 'photo-1503454537195-1dcabb73ffb9',
  sports: 'photo-1579952363873-27f3bade9f55',
  painting: 'photo-1513364776144-60967b0f800f',
  violin: 'photo-1508700115892-45ecd05ae2ad',
  photography: 'photo-1452587925148-ce544e77e70d',
  workshop: 'photo-1504328345606-18bbc8c9d7d1',
  online: 'photo-1516321318423-f06f85e504b3',
  beauty: 'photo-1522335789203-aabd1fc54bc9',
  religious: 'photo-1507692049790-de58290a4334',
  technical: 'photo-1581091226825-a6a2a5aee158',
  driving: 'photo-1449965408869-eaa3f722e40d',
  agriculture: 'photo-1464226184884-fa280b87c399',
  community: 'photo-1529156069898-49953e39b3ac',
  finance: 'photo-1554224155-6726b3ff858f',
  marketing: 'photo-1533750349088-cd871a92f312',
  capitol: 'photo-1529101091764-c3526daf38fe',
  factory: 'photo-1581092160562-40aa08e78837',
  yogaOutdoor: 'photo-1506126613408-eca07ce68773',
  writingLaptop: 'photo-1488190211105-8b0e65b80b4e',
  cafeStudy: 'photo-1432888498266-38ffec3eaf0a',
  classroomMaths: 'photo-1596495577886-d920f1fb7238',
  classroomKids2: 'photo-1588072432836-e10032774350',
  teacherStudent: 'photo-1544717297-fa95b6ee9643',
  studentsGroup: 'photo-1517486808906-6ca8b3f04846',
  lectureHall2: 'photo-1523580494863-6f3031224c94',
  fitnessStudio: 'photo-1518611012118-696072aa579a',
  teamWork: 'photo-1522071820081-009f0129c71c',
  presenting: 'photo-1551836022-d5d88e9218df',
  volunteers: 'photo-1488521787991-ed7bbaae773c',
  speaker: 'photo-1475721027785-f74eccf877e2',
  conference: 'photo-1505373877841-8d25f7d46678',
  onlineClass: 'photo-1588702547919-26089e690ecc',
  kidsCoding: 'photo-1606092195730-5d7b9af1efc5',
  plants: 'photo-1416879595882-3373a0480b5b',
} as const;

const CHIP_POOL: string[] = [
  P.classroomKids, P.classroomChalk, P.teacherKids, P.classroomKids2, P.classroomMaths,
  P.examWriting, P.studying, P.writingLaptop, P.cafeStudy, P.library, P.libraryStacks, P.books,
  P.codingLaptop, P.codingDesk, P.codingWorkshop, P.programming, P.laptopWork, P.data, P.onlineClass,
  P.meeting, P.office, P.officeInterior, P.business, P.workshopTeam, P.collab, P.teamWork, P.presenting,
  P.language, P.books, P.cafeStudy, P.writingLaptop, P.music, P.guitar, P.dance, P.painting, P.violin, P.photography,
  P.yoga, P.yogaOutdoor, P.gym, P.fitnessStudio, P.kidsToys, P.kidsCoding, P.sports, P.workshop, P.factory, P.technical, P.online,
  P.beauty, P.religious, P.medical, P.law, P.driving, P.agriculture, P.plants, P.community, P.volunteers,
  P.finance, P.marketing, P.capitol, P.science, P.maths, P.lectureHall, P.lectureHall2, P.teaching,
  P.campusGrad, P.campusStudents, P.graduationHats, P.schoolBuilding, P.teacherStudent, P.studentsGroup,
  P.speaker, P.conference,
];

const CATEGORY_ART: Record<string, string> = {
  'class-academic': photo(P.classroomKids, 480),
  'class-govtexams': photo(P.examWriting, 480),
  'class-software': photo(P.codingLaptop, 480),
  'class-ai': photo(P.data, 480),
  'class-government-skills': photo(P.workshopTeam, 480),
  'class-languages': photo(P.language, 480),
  'class-music': photo(P.music, 480),
  'class-dance': photo(P.dance, 480),
  'class-fitness': photo(P.yoga, 480),
  'class-kids': photo(P.kidsToys, 480),
  'class-sports': photo(P.sports, 480),
  'class-professional': photo(P.office, 480),
  'class-arts': photo(P.painting, 480),
  'class-vocational': photo(P.workshop, 480),
  'class-online': photo(P.online, 480),
  'class-beauty': photo(P.beauty, 480),
  'class-religious': photo(P.religious, 480),
  'class-special': photo(P.teacherKids, 480),
  'class-life-skills': photo(P.collab, 480),
  'class-business': photo(P.business, 480),
  'class-corporate': photo(P.officeInterior, 480),
  'class-technical': photo(P.technical, 480),
  'class-healthcare': photo(P.medical, 480),
  'class-driving': photo(P.driving, 480),
  'class-agriculture': photo(P.agriculture, 480),
  'class-community-skills': photo(P.community, 480),
};

const sectionCards = [
  {
    section: CLASS_MAIN_SECTIONS[0],
    bullets: ['Nursery to Class 12', 'Intermediate and Degree', 'Engineering, Medical and Law', 'MBA, PG, PhD and Diploma'],
    image: P.schoolBuilding,
    icon: <BookOpen className="h-6 w-6" />,
  },
  {
    section: CLASS_MAIN_SECTIONS[1],
    bullets: ['UPSC, APPSC and SSC', 'Banking and Railway', 'JEE, NEET and EAMCET', 'Government recruitment exams'],
    image: P.library,
    icon: <Trophy className="h-6 w-6" />,
  },
  {
    section: CLASS_MAIN_SECTIONS[2],
    bullets: ['IT, Programming and AI', 'Testing, Cloud and Data', 'Business and Finance', 'Job-ready and vocational skills'],
    image: P.codingWorkshop,
    icon: <Briefcase className="h-6 w-6" />,
  },
  {
    section: CLASS_MAIN_SECTIONS[3],
    bullets: ['Languages and Communication', 'Music, Dance and Arts', 'Sports, Yoga and Fitness', 'Creative and lifestyle learning'],
    image: P.yogaOutdoor,
    icon: <Sparkles className="h-6 w-6" />,
  },
];

const schoolCards = [
  ['Nursery, LKG, UKG', 'Early Learning', P.kidsToys],
  ['Classes 1 – 5', 'Primary Education', P.classroomKids2],
  ['Classes 6 – 8', 'Upper Primary', P.classroomChalk],
  ['Classes 9 – 10', 'Board Preparation', P.classroomMaths],
  ['Classes 11 – 12', 'Intermediate / +2', P.lectureHall],
  ['Boards & Curriculum', 'CBSE, ICSE, State, IB', P.books],
] as const;

const SHORTCUTS: Array<{ label: string; icon: string; value: string }> = [
  { label: 'All Courses', icon: '🎓', value: 'All' },
  { label: 'Find Institutes', icon: '🏫', value: 'Institute' },
  { label: 'Admissions', icon: '🗓️', value: 'Admission' },
  { label: 'Exams & Notifications', icon: '📋', value: 'Exam' },
  { label: 'Certifications', icon: '🛡️', value: 'Certification' },
  { label: 'Online & Offline', icon: '▶', value: 'Online' },
  { label: 'Near Me', icon: '📍', value: 'Near' },
  { label: 'Saved', icon: '♡', value: 'Saved' },
];

const SORTS = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'Popularity', value: 'popularity' },
  { label: 'Price — Low to High', value: 'fee-asc' },
  { label: 'Price — High to Low', value: 'fee-desc' },
] as const;

function FeatureCard({
  item,
  onCategory,
}: {
  item: (typeof sectionCards)[number];
  onCategory: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCategory(item.section.id)}
      className="group overflow-hidden rounded-[2px] border border-[#e0e0e0] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2874f0]"
    >
      <span className="relative block h-[132px] overflow-hidden bg-[#f1f3f6] sm:h-[156px]">
        <SafeImage
          src={photo(item.image, 720)}
          alt=""
          category="classes"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          sizes="(max-width: 640px) 100vw, 25vw"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-[#172337]/80 via-[#172337]/10 to-transparent" />
        <span className="absolute bottom-2 left-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#ffe500] text-[#2874f0] shadow-sm">
          {item.icon}
        </span>
      </span>
      <span className="block p-3 sm:p-4">
        <h3 className="text-[16px] font-bold leading-tight text-[#212121] sm:text-[18px]">{item.section.label}</h3>
        <p className="mt-1 text-[12px] font-medium leading-snug text-[#878787]">{item.section.description}</p>
        <ul className="mt-3 space-y-1 text-[11px] font-medium text-[#212121]">
          {item.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#388e3c]" aria-hidden />
              {bullet}
            </li>
          ))}
        </ul>
        <span className="mt-3 inline-flex items-center gap-1 rounded-[2px] bg-[#2874f0] px-3 py-1.5 text-[11px] font-bold text-white">
          Explore <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </span>
    </button>
  );
}

function ListingTile({ course, onOpen }: { course: CourseListing; onOpen: (course: CourseListing) => void }) {
  return <ClassesServiceCard course={course} onOpen={onOpen} layout="tile" />;
}

function ResultRow({ course, onOpen }: { course: CourseListing; onOpen: (course: CourseListing) => void }) {
  return <ClassesServiceCard course={course} onOpen={onOpen} layout="row" />;
}

function MarketplaceShelves({
  courses,
  onOpen,
  onCategory,
}: {
  courses: CourseListing[];
  onOpen: (course: CourseListing) => void;
  onCategory: (value: string) => void;
}) {
  return (
    <div className="mt-4 space-y-8 sm:space-y-10">
      {CLASS_MAIN_SECTIONS.map((section) => (
        <section key={section.id} className="rounded-2xl bg-white px-3 py-4 sm:px-5 sm:py-5">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[20px] font-semibold tracking-tight text-[#222] sm:text-[22px]">{section.label}</h2>
              <p className="mt-0.5 text-[13px] text-[#6a6a6a]">{section.description}</p>
            </div>
            <button
              type="button"
              onClick={() => onCategory(section.id)}
              aria-label={`View all ${section.label}`}
              className="shrink-0 text-[13px] font-semibold text-[#222] underline decoration-[#ddd] underline-offset-4"
            >
              View all
            </button>
          </div>
          <ClassesSectionShelves
            shelves={SHELVES_BY_SECTION[section.id]}
            courses={courses}
            onOpen={onOpen}
            onViewAll={() => onCategory(section.id)}
          />
        </section>
      ))}
    </div>
  );
}

export function ClassesStyleFour({
  courses,
  academicCourses,
  query,
  onQuery,
  onCategory,
  onOpen,
  group,
  academicSectionRequest,
  onAcademicSection,
}: Props) {
  const [admissionRequest, setAdmissionRequest] = useState(0);
  const [sort, setSort] = useState<(typeof SORTS)[number]['value']>('relevance');
  const openAdmissions = () => {
    onCategory('academic-education');
    setAdmissionRequest(Date.now());
  };
  const pathway = group && group !== 'All' ? group : null;
  const explorerScope = pathway ? EXPLORER_SCOPE[pathway] ?? 'Academic' : 'Academic';
  const explorerCourses = explorerScope === 'Academic' ? (academicCourses ?? courses) : courses;

  const sortedResults = useMemo(() => {
    const list = [...courses];
    if (sort === 'popularity') list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else if (sort === 'fee-asc') list.sort((a, b) => a.fee - b.fee);
    else if (sort === 'fee-desc') list.sort((a, b) => b.fee - a.fee);
    return list;
  }, [courses, sort]);

  const searching = query.trim().length > 0;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
  };

  return (
    <div className="bos-classes-fk min-h-screen bg-[#f1f3f6] text-[#212121]">
      <h1 id="classes-title" className="sr-only">Classes &amp; Training</h1>
      <div className="sticky top-0 z-20 border-b border-[#e0e0e0] bg-white">
        <form onSubmit={submitSearch} className="mx-auto flex max-w-[1440px] items-stretch px-3 py-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-[2px] border border-[#e0e0e0] bg-white">
            <Search className="my-auto ml-3 h-5 w-5 shrink-0 text-[#878787]" aria-hidden />
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              aria-label="Search courses"
              placeholder="Search courses, colleges, exams, skills or trainers..."
              className="min-w-0 flex-1 px-3 py-2.5 text-[13px] text-[#212121] outline-none placeholder:text-[#878787] sm:py-3 sm:text-[14px]"
            />
            <button type="submit" className="bg-[#ffe500] px-4 text-[13px] font-bold text-[#212121] sm:px-6">
              Search
            </button>
          </div>
        </form>
      </div>

      <main className="mx-auto max-w-[1440px] px-2 pb-10 sm:px-4">
        {pathway ? (
          <div className="mt-3 overflow-hidden rounded-[2px] bg-white shadow-[0_1px_2px_rgba(0,0,0,.1)]">
            <div className="flex items-center justify-between gap-2 border-b border-[#f0f0f0] bg-white px-3 py-2">
              <button
                type="button"
                onClick={() => onCategory('All')}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2874f0]"
              >
                ← All courses
              </button>
              <span className="text-[11px] font-medium text-[#878787]">
                {CLASS_MAIN_SECTIONS.find((section) => section.id === pathway)?.label ?? String(pathway)}
              </span>
            </div>
            <AcademicStreamExplorer
              courses={explorerCourses}
              query={query}
              onOpen={onOpen}
              sectionRequest={academicSectionRequest}
              admissionRequest={admissionRequest}
              scope={explorerScope}
              sectionId={pathway ? SECTION_ID[pathway] : undefined}
            />
          </div>
        ) : (
          <>
            <nav aria-label="Main class categories" className="mt-3 overflow-x-auto rounded-[2px] bg-white px-2 py-3 shadow-[0_1px_2px_rgba(0,0,0,.1)]">
              <div className="flex min-w-max justify-around gap-2 sm:min-w-0 sm:justify-evenly">
                {sectionCards.map((item) => (
                  <button
                    key={item.section.id}
                    type="button"
                    onClick={() => onCategory(item.section.id)}
                    className="flex w-[88px] flex-col items-center gap-1 px-1 text-center sm:w-auto sm:min-w-[120px]"
                  >
                    <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-[#f1f3f6] sm:h-16 sm:w-16">
                      <SafeImage src={photo(item.image, 160)} alt="" category="classes" className="h-full w-full object-cover" sizes="64px" />
                    </span>
                    <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-[#212121] sm:text-[13px]">
                      {item.section.label}
                    </span>
                  </button>
                ))}
              </div>
            </nav>

            <div className="mt-3 overflow-hidden rounded-[2px] bg-white shadow-[0_1px_2px_rgba(0,0,0,.1)]">
              <div className="grid grid-cols-4 sm:grid-cols-8">
                {SHORTCUTS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (item.value === 'Admission') openAdmissions();
                      else onCategory(item.value);
                    }}
                    className="flex flex-col items-center gap-1 border-r border-[#f0f0f0] px-1 py-3 text-center last:border-0 hover:bg-[#f9f9f9]"
                  >
                    <span className="text-xl" aria-hidden="true">{item.icon}</span>
                    <span className="text-[10px] font-semibold leading-tight text-[#212121] sm:text-[11px]">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="mt-3 overflow-hidden rounded-2xl bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,.1)]">
              <p className="px-3 py-2 text-[13px] font-bold text-[#212121]">Academic pathways</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['School Education', 'School'],
                  ['Intermediate / +2', 'Intermediate'],
                  ['Degree & Undergraduate', 'Degree'],
                  ['Engineering & Technology', 'Engineering'],
                  ['Medical & Healthcare', 'Medical'],
                  ['Law Education', 'Law'],
                  ['MBA & Management', 'MBA'],
                  ['Postgraduate', 'Postgraduate'],
                  ['PhD & Research', 'PhD'],
                  ['Diploma & ITI', 'Diploma'],
                  ['Entrance Exams', 'Entrance'],
                ].map(([label, value]) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => {
                      const section = ACADEMIC_SECTION_BY_LABEL[label];
                      if (section && onAcademicSection) onAcademicSection(section);
                      else onCategory(value);
                    }}
                    className="flex items-center justify-between rounded-[2px] px-3 py-2.5 text-left text-[13px] font-medium text-[#212121] hover:bg-[#f5f7fa]"
                  >
                    <span>{label}</span>
                    <ChevronRight className="h-4 w-4 text-[#878787]" aria-hidden />
                  </button>
                ))}
              </div>
            </aside>

            {searching ? (
              <section className="mt-3 overflow-hidden rounded-2xl bg-white px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,.1)] sm:px-5">
                <div className="mb-3 flex flex-wrap items-center gap-1 text-[13px]">
                  <span className="mr-2 font-semibold text-[#212121]">{sortedResults.length} results</span>
                  {SORTS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSort(option.value)}
                      aria-pressed={sort === option.value}
                      className={`px-2 py-1 ${sort === option.value ? 'border-b-2 border-[#2874f0] font-bold text-[#2874f0]' : 'text-[#212121]'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {sortedResults.length === 0 ? (
                  <p className="px-4 py-10 text-center text-[13px] text-[#878787]">No courses match this search.</p>
                ) : (
                  <ClassesListingsStrip title="Search results" courses={sortedResults} onOpen={onOpen} />
                )}
              </section>
            ) : (
              <MarketplaceShelves courses={courses} onOpen={onOpen} onCategory={onCategory} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

type Style1Card = {
  label: string;
  subtitle: string;
  image: string;
  section: string;
};

const style1Cards: Style1Card[] = [
  { label: 'Nursery - Class 10', subtitle: 'Nursery through Class 10 image cards', image: P.classroomKids, section: 'School' },
  { label: 'MPC, BiPC, MEC, CEC', subtitle: 'Intermediate streams with subject combinations', image: P.campusStudents, section: 'Inter' },
  { label: 'B.A., B.Sc, B.Com', subtitle: 'Undergraduate programmes across streams', image: P.campusGrad, section: 'Degree' },
  { label: 'B.Tech, Polytechnic', subtitle: 'Engineering and technology programmes', image: P.technical, section: 'Engineering' },
  { label: 'MBBS, BDS, BAMS', subtitle: 'Medical and healthcare programmes', image: P.medical, section: 'Medical' },
  { label: 'LLB, LLM', subtitle: 'Law degrees and specialisations', image: P.law, section: 'Law' },
  { label: 'MBA, PGDM', subtitle: 'Business and management programmes', image: P.meeting, section: 'MBA' },
  { label: 'M.A., M.Sc, M.Com', subtitle: 'Postgraduate programmes', image: P.graduationHats, section: 'PG' },
  { label: 'PhD, Research', subtitle: 'Doctoral and research programmes', image: P.science, section: 'PhD' },
  { label: 'Diploma, Polytechnic', subtitle: 'Diploma and vocational programmes', image: P.workshop, section: 'Diploma' },
  { label: 'NEET, JEE, CAT', subtitle: 'Entrance examination preparation', image: P.studying, section: 'Entrance' },
  { label: 'Music, Dance, Arts', subtitle: 'Creative and performing arts programmes', image: P.music, section: 'Music' },
  { label: 'English, Hindi, French', subtitle: 'Language learning programmes', image: P.language, section: 'Languages' },
  { label: 'Yoga, Fitness, Zumba', subtitle: 'Wellness and fitness programmes', image: P.gym, section: 'Yoga & Fitness' },
  { label: 'Programming, AI, Cloud', subtitle: 'Technology and AI training', image: P.codingDesk, section: 'IT & AI' },
  { label: 'Accounting, Taxation, Banking', subtitle: 'Business and finance programmes', image: P.finance, section: 'Business & Finance' },
  { label: 'UPSC, SSC, Banking', subtitle: 'Government job examination preparation', image: P.capitol, section: 'Government Exams' },
  { label: 'SEO, Social Media, Google Ads', subtitle: 'Digital marketing specialisations', image: P.marketing, section: 'Digital Marketing' },
];

export function Style1Cards({ onSectionSelect }: { onSectionSelect?: (section: string) => void }) {
  return (
    <section className="mt-3 rounded-[2px] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,.1)] sm:p-4">
      <h2 className="mb-3 text-[16px] font-medium text-[#212121] sm:text-[18px]">Popular programmes</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {style1Cards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => onSectionSelect?.(card.section)}
            className="overflow-hidden rounded-[2px] border border-[#f0f0f0] bg-white text-left transition hover:shadow-sm"
          >
            <SafeImage
              src={photo(card.image, 400)}
              alt={card.label}
              category="classes"
              className="h-24 w-full object-cover"
              sizes="180px"
            />
            <span className="block truncate px-2 pt-2 text-[12px] font-bold text-[#212121]" title={card.label}>
              {card.label}
            </span>
            <p className="line-clamp-1 px-2 pb-2 text-[10px] text-[#878787]">{card.subtitle}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
