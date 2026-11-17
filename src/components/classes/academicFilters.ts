/**
 * Per-category academic filters and sub-category cards.
 *
 * Every option carries its own matcher, so a filter can only be offered where
 * the listing data can answer it: School gets classes, boards and subjects,
 * Medical gets MBBS/BDS/NEET, Law gets LLB/CLAT, and so on. A selection is only
 * applied while its group is visible for the current category and service.
 */
import type { CourseListing } from '../../data/classesTimingsData';

export type AcademicFilterOption = { label: string; test: (course: CourseListing) => boolean };
export type AcademicFilterGroup = { key: string; title: string; options: AcademicFilterOption[] };

const listingText = (course: CourseListing): string =>
  [
    course.title,
    course.provider,
    course.category,
    course.description,
    course.duration,
    course.eligibility,
    course.area,
    course.city,
  ]
    .join(' ')
    .toLowerCase();

/** Whole-word match so "cec" never matches "pharmacy". */
const hasWord = (course: CourseListing, words: string[]): boolean => {
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(^|[^a-z0-9])(?:${escaped.join('|')})(?![a-z0-9])`, 'i').test(listingText(course));
};

/** A class tile ("Class 10") matches only listings that name that exact class. */
export const schoolClassMatch = (course: CourseListing, label: string): boolean =>
  hasWord(course, [label.toLowerCase()]);

const offeredModes = (course: CourseListing): string[] =>
  (course.modeOptions?.length ? course.modeOptions : [course.mode]).map((mode) => String(mode).toLowerCase());

const modeOption = (label: string): AcademicFilterOption => ({
  label,
  test: (course) => offeredModes(course).includes(label.toLowerCase()),
});

const FEE_OPTIONS: AcademicFilterOption[] = [
  { label: 'Under ₹5,000', test: (course) => course.fee < 5000 },
  { label: '₹5,000 – ₹10,000', test: (course) => course.fee >= 5000 && course.fee <= 10000 },
  { label: 'Above ₹10,000', test: (course) => course.fee > 10000 },
];

const RATING_OPTIONS: AcademicFilterOption[] = [
  { label: '4.0+', test: (course) => (course.rating ?? 0) >= 4 },
  { label: '4.5+', test: (course) => (course.rating ?? 0) >= 4.5 },
];

const BOARD_OPTIONS: AcademicFilterOption[] = [
  { label: 'CBSE', test: (course) => hasWord(course, ['cbse']) },
  { label: 'ICSE', test: (course) => hasWord(course, ['icse']) },
  { label: 'State board', test: (course) => hasWord(course, ['state board', 'state syllabus', 'matric']) },
];

/** School subjects, offered only for tuition and coaching. */
export const SCHOOL_SUBJECT_FILTERS: Array<{ label: string; words: string[] }> = [
  { label: 'Maths', words: ['maths', 'mathematics', 'math'] },
  { label: 'Science', words: ['science', 'physics', 'chemistry', 'biology'] },
  { label: 'English', words: ['english', 'grammar', 'literature'] },
  { label: 'Social', words: ['social', 'history', 'geography', 'civics', 'economics'] },
  { label: 'Hindi', words: ['hindi'] },
  { label: 'Computer', words: ['computer', 'coding', 'programming', 'python', 'java'] },
];

const subjectGroup = (): AcademicFilterGroup => ({
  key: 'subject',
  title: 'Subject',
  options: SCHOOL_SUBJECT_FILTERS.map(({ label, words }) => ({
    label,
    test: (course) => hasWord(course, words),
  })),
});

/** Photos reuse the Unsplash assets already used across the Classes module. */
const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=80`;

const ART = {
  maths: photo('photo-1509228468518-180dd4864904'),
  science: photo('photo-1532094349884-543bc11b234d'),
  students: photo('photo-1523240795612-9a054b0db644'),
  books: photo('photo-1497633762265-9d179a990aa6'),
  commerce: photo('photo-1454165804606-c3d57bc86b40'),
  accounts: photo('photo-1554224155-6726b3ff858f'),
  computer: photo('photo-1518770660439-4636190af475'),
  arts: photo('photo-1508700115892-45ecd05ae2ad'),
  vocational: photo('photo-1504328345606-18bbc8c9d7d1'),
  degree: photo('photo-1541339907198-e08756dedf3f'),
  engineering: photo('photo-1518770660439-4636190af475'),
  medical: photo('photo-1576091160399-112ba8d25d1d'),
  law: photo('photo-1589829545856-d10d557cf95f'),
  business: photo('photo-1556761175-b413da4baf72'),
  postgrad: photo('photo-1497366811353-6870744d04b2'),
  research: photo('photo-1532094349884-543bc11b234d'),
  exam: photo('photo-1434030216411-0b793f4b4173'),
  school: photo('photo-1503676260728-1c00da094a0b'),
  music: photo('photo-1511379938547-c1f69419868d'),
  dance: photo('photo-1508807526345-15e9b5f4eaff'),
  yoga: photo('photo-1544367567-0f2fcb009e0b'),
  language: photo('photo-1546410531-bb4caa6b424d'),
  photography: photo('photo-1452587925148-ce544e77e70d'),
  marketing: photo('photo-1533750349088-cd871a92f312'),
  government: photo('photo-1434030216411-0b793f4b4173'),
  it: photo('photo-1518770660439-4636190af475'),
  data: photo('photo-1551288049-bebda4e38f71'),
  finance: photo('photo-1554224155-6726b3ff858f'),
} as const;

export type SubcategoryCard = {
  label: string;
  subtitle: string;
  image: string;
  words: string[];
};

type Programme = {
  title: string;
  cards: SubcategoryCard[];
};

/** Nursery to Class 12 — the School entry screen uses the same cards. */
export const SCHOOL_CLASS_CARDS: SubcategoryCard[] = [
  { label: 'Nursery', subtitle: 'Early learning · Play group', image: ART.school, words: ['nursery'] },
  { label: 'LKG', subtitle: 'Lower kindergarten', image: ART.school, words: ['lkg'] },
  { label: 'UKG', subtitle: 'Upper kindergarten', image: ART.school, words: ['ukg'] },
  { label: 'Class 1', subtitle: 'Primary · All subjects', image: ART.books, words: ['class 1'] },
  { label: 'Class 2', subtitle: 'Primary · All subjects', image: ART.books, words: ['class 2'] },
  { label: 'Class 3', subtitle: 'Primary · All subjects', image: ART.books, words: ['class 3'] },
  { label: 'Class 4', subtitle: 'Primary · All subjects', image: ART.books, words: ['class 4'] },
  { label: 'Class 5', subtitle: 'Primary · All subjects', image: ART.books, words: ['class 5'] },
  { label: 'Class 6', subtitle: 'Upper primary', image: ART.science, words: ['class 6'] },
  { label: 'Class 7', subtitle: 'Upper primary', image: ART.science, words: ['class 7'] },
  { label: 'Class 8', subtitle: 'Upper primary', image: ART.science, words: ['class 8'] },
  { label: 'Class 9', subtitle: 'Board preparation', image: ART.maths, words: ['class 9'] },
  { label: 'Class 10', subtitle: 'Board preparation', image: ART.maths, words: ['class 10'] },
  { label: 'Class 11', subtitle: 'Intermediate · +2', image: ART.students, words: ['class 11'] },
  { label: 'Class 12', subtitle: 'Intermediate · +2', image: ART.students, words: ['class 12'] },
];

/** Sub-categories (streams, programmes, exams) offered by each category. */
const PROGRAMMES: Record<string, Programme> = {
  Inter: {
    title: 'Stream / Group',
    cards: [
      { label: 'MPC', subtitle: 'Maths · Physics · Chemistry', image: ART.maths, words: ['mpc'] },
      { label: 'BiPC', subtitle: 'Biology · Physics · Chemistry', image: ART.science, words: ['bipc'] },
      { label: 'MEC', subtitle: 'Maths · Economics · Commerce', image: ART.commerce, words: ['mec'] },
      { label: 'CEC', subtitle: 'Civics · Economics · Commerce', image: ART.accounts, words: ['cec'] },
      { label: 'HEC', subtitle: 'History · Economics · Civics', image: ART.books, words: ['hec'] },
      { label: 'MCC', subtitle: 'Maths · Commerce · Computer Science', image: ART.computer, words: ['mcc'] },
      { label: 'MSCS', subtitle: 'Maths · Statistics · Computer Science', image: ART.maths, words: ['mscs'] },
      { label: 'Commerce', subtitle: 'Accountancy · Business · Economics', image: ART.commerce, words: ['commerce'] },
      { label: 'Arts & Humanities', subtitle: 'History · Political Science · Sociology', image: ART.arts, words: ['arts', 'humanities'] },
      { label: 'Vocational', subtitle: 'Job-oriented · Practical Skills · Industry Readiness', image: ART.vocational, words: ['vocational'] },
    ],
  },
  Degree: {
    title: 'Programme',
    cards: [
      { label: 'B.A.', subtitle: 'Arts · Humanities · Social Science', image: ART.arts, words: ['b.a', 'ba'] },
      { label: 'B.Sc', subtitle: 'Science · Maths · Labs', image: ART.science, words: ['b.sc', 'bsc'] },
      { label: 'B.Com', subtitle: 'Commerce · Accountancy', image: ART.commerce, words: ['b.com', 'bcom'] },
      { label: 'BBA', subtitle: 'Business administration', image: ART.business, words: ['bba'] },
      { label: 'BCA', subtitle: 'Computer applications', image: ART.computer, words: ['bca'] },
      { label: 'B.Ed', subtitle: 'Teaching · Education', image: ART.books, words: ['b.ed', 'bed'] },
    ],
  },
  Engineering: {
    title: 'Programme',
    cards: [
      { label: 'B.Tech', subtitle: 'Engineering · Technology', image: ART.engineering, words: ['b.tech', 'btech'] },
      { label: 'Polytechnic', subtitle: 'Diploma engineering', image: ART.vocational, words: ['polytechnic'] },
      { label: 'Computer science', subtitle: 'Coding · Software', image: ART.computer, words: ['computer science', 'coding'] },
    ],
  },
  Medical: {
    title: 'Programme',
    cards: [
      { label: 'MBBS', subtitle: 'Medicine · Clinical practice', image: ART.medical, words: ['mbbs'] },
      { label: 'BDS', subtitle: 'Dental surgery', image: ART.medical, words: ['bds'] },
      { label: 'BAMS', subtitle: 'Ayurvedic medicine', image: ART.medical, words: ['bams'] },
      { label: 'BHMS', subtitle: 'Homeopathic medicine', image: ART.medical, words: ['bhms'] },
      { label: 'Nursing', subtitle: 'Patient care · Clinicals', image: ART.medical, words: ['nursing'] },
      { label: 'Pharmacy', subtitle: 'Pharmaceutical sciences', image: ART.science, words: ['pharmacy', 'b.pharm'] },
    ],
  },
  Law: {
    title: 'Programme',
    cards: [
      { label: 'LLB', subtitle: 'Law · Legal practice', image: ART.law, words: ['llb', 'l.l.b'] },
      { label: 'LLM', subtitle: 'Specialisation in law', image: ART.law, words: ['llm', 'l.l.m'] },
      { label: 'BA LLB', subtitle: 'Integrated law degree', image: ART.law, words: ['ba llb'] },
      { label: 'Judiciary', subtitle: 'Judicial services preparation', image: ART.law, words: ['judiciary'] },
    ],
  },
  MBA: {
    title: 'Programme',
    cards: [
      { label: 'MBA', subtitle: 'Business · Leadership', image: ART.business, words: ['mba'] },
      { label: 'BBA', subtitle: 'Business administration', image: ART.business, words: ['bba'] },
      { label: 'PGDM', subtitle: 'Management diploma', image: ART.business, words: ['pgdm'] },
      { label: 'Management', subtitle: 'General management', image: ART.business, words: ['management'] },
    ],
  },
  PG: {
    title: 'Programme',
    cards: [
      { label: 'M.A.', subtitle: 'Arts · Humanities', image: ART.arts, words: ['m.a', 'ma'] },
      { label: 'M.Sc', subtitle: 'Science · Research', image: ART.science, words: ['m.sc', 'msc'] },
      { label: 'M.Com', subtitle: 'Commerce · Finance', image: ART.commerce, words: ['m.com', 'mcom'] },
      { label: 'MCA', subtitle: 'Computer applications', image: ART.computer, words: ['mca'] },
      { label: 'M.Tech', subtitle: 'Engineering · Technology', image: ART.engineering, words: ['m.tech', 'mtech'] },
    ],
  },
  PhD: {
    title: 'Programme',
    cards: [
      { label: 'PhD', subtitle: 'Doctorate · Research', image: ART.research, words: ['phd', 'doctorate'] },
      { label: 'M.Phil', subtitle: 'Pre-doctoral research', image: ART.research, words: ['m.phil'] },
      { label: 'JRF', subtitle: 'Research fellowship', image: ART.research, words: ['jrf'] },
      { label: 'Research', subtitle: 'Thesis · Methodology', image: ART.books, words: ['research', 'thesis'] },
    ],
  },
  Diploma: {
    title: 'Programme',
    cards: [
      { label: 'Diploma', subtitle: 'Applied · Job-ready', image: ART.degree, words: ['diploma'] },
      { label: 'Polytechnic', subtitle: 'Technical diploma', image: ART.engineering, words: ['polytechnic'] },
      { label: 'ITI', subtitle: 'Trade training', image: ART.vocational, words: ['iti'] },
      { label: 'Vocational', subtitle: 'Practical skills', image: ART.vocational, words: ['vocational', 'apprentice'] },
    ],
  },
  Entrance: {
    title: 'Exam',
    cards: [
      { label: 'NEET', subtitle: 'Medical entrance', image: ART.medical, words: ['neet'] },
      { label: 'JEE', subtitle: 'Engineering entrance', image: ART.engineering, words: ['jee'] },
      { label: 'CAT', subtitle: 'Management entrance', image: ART.business, words: ['cat'] },
      { label: 'GATE', subtitle: 'Postgraduate engineering', image: ART.engineering, words: ['gate'] },
      { label: 'UGC NET', subtitle: 'Lectureship · Research', image: ART.books, words: ['ugc net', 'net'] },
      { label: 'UPSC', subtitle: 'Civil services', image: ART.exam, words: ['upsc', 'prelims'] },
      { label: 'EAPCET', subtitle: 'State engineering entrance', image: ART.exam, words: ['eapcet'] },
    ],
  },
  School: {
    title: 'Class',
    cards: SCHOOL_CLASS_CARDS,
  },
  Music: {
    title: 'Instrument or Style',
    cards: [
      { label: 'Guitar', subtitle: 'Strings · Beginner friendly', image: ART.music, words: ['guitar'] },
      { label: 'Singing', subtitle: 'Vocals · Classical and film', image: ART.music, words: ['singing', 'vocal'] },
      { label: 'Piano', subtitle: 'Keys · Theory and practice', image: ART.music, words: ['piano', 'keyboard'] },
      { label: 'Drums', subtitle: 'Percussion · Rhythm', image: ART.music, words: ['drums', 'percussion'] },
    ],
  },
  Dance: {
    title: 'Dance Style',
    cards: [
      { label: 'Classical', subtitle: 'Bharatanatyam · Kuchipudi', image: ART.dance, words: ['bharatanatyam', 'kuchipudi', 'classical dance'] },
      { label: 'Bollywood', subtitle: 'Film · Freestyle', image: ART.dance, words: ['bollywood', 'freestyle'] },
      { label: 'Western', subtitle: 'Hip-hop · Jazz', image: ART.dance, words: ['hip hop', 'hip-hop', 'jazz', 'western dance'] },
      { label: 'Kids Dance', subtitle: 'Fun · Basics', image: ART.dance, words: ['kids dance', 'dance for kids'] },
    ],
  },
  'Arts & Craft': {
    title: 'Creative Course',
    cards: [
      { label: 'Drawing & Painting', subtitle: 'Sketching · Colour theory', image: ART.arts, words: ['drawing', 'painting', 'sketching'] },
      { label: 'Craft', subtitle: 'Handmade · DIY', image: ART.arts, words: ['craft', 'handmade'] },
      { label: 'Photography', subtitle: 'Camera · Editing', image: ART.photography, words: ['photography', 'camera'] },
      { label: 'Design', subtitle: 'Graphic · Digital art', image: ART.arts, words: ['design', 'graphic'] },
    ],
  },
  Languages: {
    title: 'Language',
    cards: [
      { label: 'English', subtitle: 'Spoken · Grammar', image: ART.language, words: ['english'] },
      { label: 'Hindi', subtitle: 'Reading · Writing', image: ART.language, words: ['hindi'] },
      { label: 'French', subtitle: 'Beginner · A1', image: ART.language, words: ['french'] },
      { label: 'Spanish', subtitle: 'Conversation', image: ART.language, words: ['spanish'] },
      { label: 'German', subtitle: 'Beginner · A1', image: ART.language, words: ['german'] },
    ],
  },
  'Yoga & Fitness': {
    title: 'Programme',
    cards: [
      { label: 'Yoga', subtitle: 'Hatha · Ashtanga', image: ART.yoga, words: ['yoga'] },
      { label: 'Fitness', subtitle: 'Strength · Cardio', image: ART.yoga, words: ['fitness', 'gym', 'cardio'] },
      { label: 'Zumba', subtitle: 'Dance fitness', image: ART.dance, words: ['zumba', 'aerobics'] },
      { label: 'Meditation', subtitle: 'Breathwork · Calm', image: ART.yoga, words: ['meditation', 'breathwork'] },
    ],
  },
  Personality: {
    title: 'Skill',
    cards: [
      { label: 'Communication', subtitle: 'Speaking · Confidence', image: ART.students, words: ['communication', 'confidence'] },
      { label: 'Life Skills', subtitle: 'Habits · Time management', image: ART.students, words: ['life skills', 'time management'] },
      { label: 'Public Speaking', subtitle: 'Debate · Stage', image: ART.students, words: ['public speaking', 'debate'] },
      { label: 'Interview Prep', subtitle: 'Resume · Mock rounds', image: ART.business, words: ['interview', 'resume'] },
    ],
  },
  'IT & AI': {
    title: 'Technology',
    cards: [
      { label: 'Programming', subtitle: 'Python · Java', image: ART.it, words: ['python', 'java', 'programming'] },
      { label: 'Web Development', subtitle: 'HTML · React', image: ART.computer, words: ['web development', 'react', 'html'] },
      { label: 'AI & ML', subtitle: 'Models · Data', image: ART.data, words: ['ai', 'artificial intelligence', 'machine learning'] },
      { label: 'Cyber Security', subtitle: 'Networks · Defence', image: ART.it, words: ['cyber', 'security'] },
    ],
  },
  'Data & Cloud': {
    title: 'Specialisation',
    cards: [
      { label: 'Data Science', subtitle: 'Python · SQL', image: ART.data, words: ['data science', 'sql'] },
      { label: 'Cloud', subtitle: 'AWS · Azure', image: ART.data, words: ['cloud', 'aws', 'azure'] },
      { label: 'Analytics', subtitle: 'Excel · BI tools', image: ART.data, words: ['analytics', 'bi'] },
      { label: 'DevOps', subtitle: 'CI/CD · Containers', image: ART.it, words: ['devops', 'docker', 'kubernetes'] },
    ],
  },
  'Business & Finance': {
    title: 'Programme',
    cards: [
      { label: 'Accounting', subtitle: 'Tally · Bookkeeping', image: ART.finance, words: ['accounting', 'tally'] },
      { label: 'Taxation', subtitle: 'GST · Returns', image: ART.finance, words: ['taxation', 'gst', 'tax'] },
      { label: 'Banking', subtitle: 'Banking exams · Credit', image: ART.finance, words: ['banking', 'ibps', 'bank exam'] },
      { label: 'Investment', subtitle: 'Markets · Mutual funds', image: ART.finance, words: ['investment', 'mutual fund', 'stock'] },
    ],
  },
  'CA / CMA / CS': {
    title: 'Certification',
    cards: [
      { label: 'CA', subtitle: 'Foundation · Inter · Final', image: ART.finance, words: ['ca foundation', 'chartered accountant', 'ca inter'] },
      { label: 'CMA', subtitle: 'Cost accounting', image: ART.accounts, words: ['cma', 'cost accountant'] },
      { label: 'CS', subtitle: 'Company secretary', image: ART.books, words: ['company secretary', 'cs executive'] },
      { label: 'GST', subtitle: 'Returns · Compliance', image: ART.accounts, words: ['gst', 'compliance'] },
    ],
  },
  'Government Exams': {
    title: 'Exam',
    cards: [
      { label: 'UPSC', subtitle: 'Civil services', image: ART.government, words: ['upsc', 'civil services'] },
      { label: 'SSC', subtitle: 'Staff selection', image: ART.government, words: ['ssc'] },
      { label: 'Banking Exams', subtitle: 'IBPS · SBI PO', image: ART.finance, words: ['ibps', 'sbi po', 'bank exam'] },
      { label: 'Railway', subtitle: 'RRB · NTPC', image: ART.government, words: ['railway', 'rrb', 'ntpc'] },
      { label: 'State PSC', subtitle: 'Groups · APPSC · TSPSC', image: ART.government, words: ['appsc', 'tspsc', 'state psc', 'group'] },
    ],
  },
  'Digital Marketing': {
    title: 'Specialisation',
    cards: [
      { label: 'SEO', subtitle: 'Search · Content', image: ART.marketing, words: ['seo', 'search engine'] },
      { label: 'Social Media', subtitle: 'Instagram · Meta ads', image: ART.marketing, words: ['social media', 'instagram'] },
      { label: 'Google Ads', subtitle: 'PPC · Analytics', image: ART.marketing, words: ['google ads', 'ppc', 'adwords'] },
      { label: 'Content', subtitle: 'Copy · Video', image: ART.marketing, words: ['content', 'copywriting'] },
    ],
  },
};

/** Entrance exams for categories that are a programme *and* a way in. */
const ENTRANCE_EXAMS: Record<string, Array<[string, string[]]>> = {
  Engineering: [['JEE', ['jee']], ['EAPCET', ['eapcet']]],
  Medical: [['NEET', ['neet']]],
  Law: [['CLAT', ['clat']], ['LAWCET', ['lawcet']]],
  MBA: [['CAT', ['cat']]],
};

/** The sub-category cards (MPC, MBBS, LLB …) a category offers. */
export function subcategoryGroup(section: string): { title: string; labels: string[] } | null {
  const programme = PROGRAMMES[section];
  if (!programme) return null;
  return { title: programme.title, labels: programme.cards.map((card) => card.label) };
}

export function subcategoryCards(section: string): { title: string; cards: SubcategoryCard[] } | null {
  const programme = PROGRAMMES[section];
  if (!programme) return null;
  return { title: programme.title, cards: programme.cards };
}

const programmeGroup = (section: string): AcademicFilterGroup | null => {
  const programme = PROGRAMMES[section];
  if (!programme) return null;
  return {
    key: 'programme',
    title: programme.title,
    options: programme.cards.map(({ label, words }) => ({
      label,
      test: (course: CourseListing) => hasWord(course, words),
    })),
  };
};

const examGroup = (section: string): AcademicFilterGroup | null => {
  const exams = ENTRANCE_EXAMS[section];
  if (!exams) return null;
  return {
    key: 'exam',
    title: 'Entrance exam',
    options: exams.map(([label, words]) => ({
      label,
      test: (course: CourseListing) => hasWord(course, words),
    })),
  };
};

/** Areas come from the section's own listings, so no location is invented. */
const locationGroup = (listings: CourseListing[]): AcademicFilterGroup | null => {
  const areas = [...new Set(listings.map((course) => course.area).filter((area): area is string => Boolean(area?.trim())))].sort();
  if (areas.length < 2) return null;
  return {
    key: 'location',
    title: 'Location',
    options: areas.slice(0, 8).map((area) => ({
      label: area,
      test: (course) => course.area === area,
    })),
  };
};

/**
 * The groups offered for one category. `service` is only meaningful for School:
 * admissions never shows tuition subject filters.
 */
export function buildAcademicFilters(
  section: string,
  service: string | null,
  listings: CourseListing[],
): AcademicFilterGroup[] {
  const groups: AcademicFilterGroup[] = [];

  if (section === 'School') {
    if (service === 'Tuition' || service === 'Coaching') groups.push(subjectGroup());
  } else {
    const programme = programmeGroup(section);
    if (programme) groups.push(programme);
    const exam = examGroup(section);
    if (exam) groups.push(exam);
  }

  if (section === 'School' || section === 'Inter') {
    groups.push({ key: 'board', title: 'Board', options: BOARD_OPTIONS });
  }

  groups.push({
    key: 'mode',
    title: 'Mode',
    options: [modeOption('Online'), modeOption('Offline'), modeOption('Hybrid')],
  });
  groups.push({ key: 'fees', title: 'Fees', options: FEE_OPTIONS });
  groups.push({ key: 'rating', title: 'Rating', options: RATING_OPTIONS });

  const location = locationGroup(listings);
  if (location) groups.push(location);

  return groups;
}

/** A listing must satisfy every selected group; unknown keys never filter. */
export function matchesAcademicFilters(
  course: CourseListing,
  values: Record<string, string>,
  groups: AcademicFilterGroup[],
): boolean {
  return groups.every((group) => {
    const picked = values[group.key];
    if (!picked) return true;
    const option = group.options.find((candidate) => candidate.label === picked);
    return option ? option.test(course) : true;
  });
}

/** Service tiles read the listing's own published wording. */
export const SERVICE_TESTS: Record<string, (course: CourseListing) => boolean> = {
  Admissions: (course) => hasWord(course, ['admission', 'admissions', 'entrance', 'enrol', 'enroll', 'apply', 'application']),
  Tuition: (course) => hasWord(course, ['tuition', 'tutor', 'tutorial', 'coaching', 'class', 'classes', 'subject']),
  Coaching: (course) => hasWord(course, ['coaching', 'institute', 'academy', 'batch', 'crash course']),
};

export const matchesService = (course: CourseListing, service: string | null): boolean =>
  service ? (SERVICE_TESTS[service]?.(course) ?? true) : true;
