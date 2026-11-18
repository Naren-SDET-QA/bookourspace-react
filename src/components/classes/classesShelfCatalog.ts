/**
 * Airbnb-style subcategory shelves for the four Classes sections.
 * Real listings are matched from published fields only. Empty shelves are
 * filled with clearly labelled SAMPLE cards — never fake providers or ratings.
 */
import type { CourseListing } from '../../data/classesTimingsData';
import type { ClassMainSectionId } from '../../data/classesTaxonomy';
import { schoolClassMatch } from './academicFilters';

export type ShelfSample = {
  sample: true;
  id: string;
  title: string;
  image: string;
  location: string;
  mode: string;
};

export type ShelfCardItem = CourseListing | ShelfSample;

export function isShelfSample(item: ShelfCardItem): item is ShelfSample {
  return 'sample' in item && item.sample === true;
}

export type ClassesShelfDef = {
  id: string;
  section: ClassMainSectionId;
  /** Heading shown above the carousel. */
  title: string;
  /** Optional class constraint such as "Class 5". */
  classLabel?: string;
  /** Subject/exam/skill label used to filter explorer shelves. */
  subjectLabel: string;
  group?: 'school-5' | 'school-10' | 'intermediate';
  words: string[];
  images: string[];
};

const photo = (id: string): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=86`;

const IMG = {
  maths: 'photo-1509228468518-180dd4864904',
  classroom: 'photo-1503676260728-1c00da094a0b',
  chalkboard: 'photo-1427504494785-3a9ca7044f45',
  science: 'photo-1532094349884-543bc11b234d',
  lab: 'photo-1567427017947-013e8d0ba2c5',
  english: 'photo-14565130808-af98ffb81917',
  books: 'photo-1497633762265-9d179a990aa6',
  physics: 'photo-1636466497217-26a8cbeaf0aa',
  biology: 'photo-1530026405186-ed1f139313f8',
  students: 'photo-1523240795612-9a054b0db644',
  exam: 'photo-1434030216411-0b793f4b4173',
  library: 'photo-1524995997946-a1c2e315a42f',
  python: 'photo-1526379095098-d400fd0bf935',
  java: 'photo-1517694712202-14dd9538aa97',
  react: 'photo-1633356122544-f134324a6cee',
  ai: 'photo-1677442136019-21780ecad995',
  testing: 'photo-1516321318423-f06f85e504b3',
  data: 'photo-1551288049-bebda4e38f71',
  music: 'photo-1511379938547-c1f69419868d',
  vocal: 'photo-1511671782779-c97d3d27a1d4',
  guitar: 'photo-1510915361894-db8b60106cb1',
  dance: 'photo-1508807526345-15e9b5f4eaff',
  sports: 'photo-1579952363873-27f3bade9f55',
  swim: 'photo-1530549387789-4c1017266635',
  language: 'photo-1546410531-bb4caa6b424d',
  arts: 'photo-1513364776144-60967b0f800f',
  coding: 'photo-1498050108023-c5249f4df085',
  capitol: 'photo-1529101091764-c3526daf38fe',
} as const;

const listingText = (course: CourseListing): string =>
  [course.title, course.provider, course.description, course.duration, course.eligibility]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const hasWord = (course: CourseListing, words: string[]): boolean => {
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(^|[^a-z0-9])(?:${escaped.join('|')})(?![a-z0-9])`, 'i').test(listingText(course));
};

export function matchesShelf(course: CourseListing, shelf: ClassesShelfDef): boolean {
  if (shelf.classLabel && !schoolClassMatch(course, shelf.classLabel)) return false;
  return hasWord(course, shelf.words);
}

const SAMPLE_MIN = 6;

function sampleCards(shelf: ClassesShelfDef): ShelfSample[] {
  return Array.from({ length: SAMPLE_MIN }, (_, index) => ({
    sample: true as const,
    id: `sample-${shelf.id}-${index + 1}`,
    title: `Sample ${shelf.title} class ${index + 1}`,
    image: photo(shelf.images[index % shelf.images.length]),
    location: 'Sample location',
    mode: index % 2 === 0 ? 'Online sample' : 'Offline sample',
  }));
}

/**
 * Real matches from `courses`. Sample cards appear only when the broader
 * `inventory` has no published listing for this shelf — never to pad a
 * filtered-empty result set.
 */
export function fillShelf(
  courses: CourseListing[],
  shelf: ClassesShelfDef,
  inventory: CourseListing[] = courses,
): ShelfCardItem[] {
  const matched = courses.filter((course) => matchesShelf(course, shelf));
  const published = inventory.filter((course) => matchesShelf(course, shelf));
  if (published.length > 0) {
    if (matched.length === 0) return [];
    if (matched.length >= SAMPLE_MIN) return matched;
    return [...matched, ...sampleCards(shelf).slice(0, SAMPLE_MIN - matched.length)];
  }
  return sampleCards(shelf);
}

export const ACADEMIC_SHELVES: ClassesShelfDef[] = [
  {
    id: 'class5-maths',
    section: 'academic-education',
    title: 'Class 5 · Maths',
    classLabel: 'Class 5',
    subjectLabel: 'Maths',
    group: 'school-5',
    words: ['maths', 'mathematics', 'math'],
    images: [IMG.maths, IMG.chalkboard, IMG.classroom],
  },
  {
    id: 'class5-science',
    section: 'academic-education',
    title: 'Class 5 · Science',
    classLabel: 'Class 5',
    subjectLabel: 'Science',
    group: 'school-5',
    words: ['science'],
    images: [IMG.science, IMG.lab, IMG.classroom],
  },
  {
    id: 'class5-english',
    section: 'academic-education',
    title: 'Class 5 · English',
    classLabel: 'Class 5',
    subjectLabel: 'English',
    group: 'school-5',
    words: ['english', 'grammar', 'literature'],
    images: [IMG.english, IMG.books, IMG.classroom],
  },
  {
    id: 'class10-maths',
    section: 'academic-education',
    title: 'Class 10 · Maths',
    classLabel: 'Class 10',
    subjectLabel: 'Maths',
    group: 'school-10',
    words: ['maths', 'mathematics', 'math'],
    images: [IMG.maths, IMG.chalkboard, IMG.students],
  },
  {
    id: 'class10-physics',
    section: 'academic-education',
    title: 'Class 10 · Physics',
    classLabel: 'Class 10',
    subjectLabel: 'Physics',
    group: 'school-10',
    words: ['physics'],
    images: [IMG.physics, IMG.lab, IMG.science],
  },
  {
    id: 'class10-biology',
    section: 'academic-education',
    title: 'Class 10 · Biology',
    classLabel: 'Class 10',
    subjectLabel: 'Biology',
    group: 'school-10',
    words: ['biology'],
    images: [IMG.biology, IMG.science, IMG.lab],
  },
  {
    id: 'inter-mpc',
    section: 'academic-education',
    title: 'Intermediate · MPC',
    subjectLabel: 'MPC',
    group: 'intermediate',
    words: ['mpc'],
    images: [IMG.maths, IMG.physics, IMG.students],
  },
  {
    id: 'inter-bipc',
    section: 'academic-education',
    title: 'Intermediate · BiPC',
    subjectLabel: 'BiPC',
    group: 'intermediate',
    words: ['bipc'],
    images: [IMG.biology, IMG.science, IMG.students],
  },
  {
    id: 'inter-mec',
    section: 'academic-education',
    title: 'Intermediate · MEC',
    subjectLabel: 'MEC',
    group: 'intermediate',
    words: ['mec'],
    images: [IMG.books, IMG.students, IMG.library],
  },
  {
    id: 'inter-cec',
    section: 'academic-education',
    title: 'Intermediate · CEC',
    subjectLabel: 'CEC',
    group: 'intermediate',
    words: ['cec'],
    images: [IMG.library, IMG.books, IMG.students],
  },
];

export const COMPETITIVE_SHELVES: ClassesShelfDef[] = [
  { id: 'upsc', section: 'competitive-exams', title: 'UPSC', subjectLabel: 'UPSC', words: ['upsc'], images: [IMG.exam, IMG.library, IMG.capitol] },
  { id: 'appsc', section: 'competitive-exams', title: 'APPSC', subjectLabel: 'APPSC', words: ['appsc'], images: [IMG.capitol, IMG.exam, IMG.library] },
  { id: 'neet', section: 'competitive-exams', title: 'NEET', subjectLabel: 'NEET', words: ['neet'], images: [IMG.biology, IMG.exam, IMG.science] },
  { id: 'jee', section: 'competitive-exams', title: 'JEE', subjectLabel: 'JEE', words: ['jee'], images: [IMG.physics, IMG.exam, IMG.maths] },
  { id: 'ssc', section: 'competitive-exams', title: 'SSC', subjectLabel: 'SSC', words: ['ssc'], images: [IMG.exam, IMG.books, IMG.library] },
  { id: 'banking', section: 'competitive-exams', title: 'Banking', subjectLabel: 'Banking', words: ['banking', 'ibps', 'sbi po'], images: [IMG.library, IMG.exam, IMG.capitol] },
];

export const PROFESSIONAL_SHELVES: ClassesShelfDef[] = [
  { id: 'python', section: 'professional-career', title: 'Python', subjectLabel: 'Python', words: ['python'], images: [IMG.python, IMG.coding, IMG.data] },
  { id: 'java', section: 'professional-career', title: 'Java', subjectLabel: 'Java', words: ['java'], images: [IMG.java, IMG.coding, IMG.python] },
  { id: 'react', section: 'professional-career', title: 'React', subjectLabel: 'React', words: ['react'], images: [IMG.react, IMG.coding, IMG.java] },
  { id: 'ai', section: 'professional-career', title: 'AI', subjectLabel: 'AI', words: ['artificial intelligence', 'machine learning', 'generative ai'], images: [IMG.ai, IMG.data, IMG.coding] },
  { id: 'testing', section: 'professional-career', title: 'Testing', subjectLabel: 'Testing', words: ['testing', 'qa automation', 'selenium'], images: [IMG.testing, IMG.coding, IMG.java] },
  { id: 'data-science', section: 'professional-career', title: 'Data Science', subjectLabel: 'Data Science', words: ['data science', 'data scientist'], images: [IMG.data, IMG.python, IMG.ai] },
];

export const PERSONAL_SHELVES: ClassesShelfDef[] = [
  { id: 'music', section: 'personal-hobbies', title: 'Music', subjectLabel: 'Music', words: ['music', 'vocal', 'carnatic', 'singing', 'piano'], images: [IMG.music, IMG.vocal, IMG.guitar] },
  { id: 'guitar', section: 'personal-hobbies', title: 'Guitar', subjectLabel: 'Guitar', words: ['guitar'], images: [IMG.guitar, IMG.music, IMG.vocal] },
  { id: 'dance', section: 'personal-hobbies', title: 'Dance', subjectLabel: 'Dance', words: ['dance'], images: [IMG.dance, IMG.music, IMG.arts] },
  { id: 'sports', section: 'personal-hobbies', title: 'Sports', subjectLabel: 'Sports', words: ['sport', 'swimming', 'cricket', 'football', 'tennis', 'badminton'], images: [IMG.sports, IMG.swim, IMG.students] },
  { id: 'languages', section: 'personal-hobbies', title: 'Languages', subjectLabel: 'Languages', words: ['language', 'spoken english', 'hindi', 'french', 'spanish', 'german'], images: [IMG.language, IMG.english, IMG.books] },
  { id: 'arts', section: 'personal-hobbies', title: 'Arts', subjectLabel: 'Arts', words: ['drawing', 'painting', 'sketching', 'craft'], images: [IMG.arts, IMG.music, IMG.dance] },
];

export const SHELVES_BY_SECTION: Record<ClassMainSectionId, ClassesShelfDef[]> = {
  'academic-education': ACADEMIC_SHELVES,
  'competitive-exams': COMPETITIVE_SHELVES,
  'professional-career': PROFESSIONAL_SHELVES,
  'personal-hobbies': PERSONAL_SHELVES,
};

function subjectMatches(shelf: ClassesShelfDef, subject: string): boolean {
  if (shelf.subjectLabel === subject) return true;
  if (subject === 'Science' && (shelf.subjectLabel === 'Physics' || shelf.subjectLabel === 'Biology' || shelf.subjectLabel === 'Science')) {
    return true;
  }
  return false;
}

/** Shelves shown inside the explorer for the current rail, class and subject. */
export function shelvesForExplorer(options: {
  sectionId?: string | null;
  railShort: string;
  schoolClass: string | null;
  subject: string | null;
}): ClassesShelfDef[] | null {
  const { sectionId, railShort, schoolClass, subject } = options;
  if (sectionId === 'competitive-exams') return COMPETITIVE_SHELVES;
  if (sectionId === 'professional-career') return PROFESSIONAL_SHELVES;
  if (sectionId === 'personal-hobbies') return PERSONAL_SHELVES;

  if (railShort === 'Inter') {
    const shelves = ACADEMIC_SHELVES.filter((shelf) => shelf.group === 'intermediate');
    if (schoolClass) return shelves.filter((shelf) => shelf.subjectLabel.toLowerCase() === schoolClass.toLowerCase());
    return shelves;
  }

  if (railShort === 'School') {
    if (schoolClass === 'Class 5') {
      const shelves = ACADEMIC_SHELVES.filter((shelf) => shelf.group === 'school-5');
      return subject ? shelves.filter((shelf) => subjectMatches(shelf, subject)) : shelves;
    }
    if (schoolClass === 'Class 10') {
      const shelves = ACADEMIC_SHELVES.filter((shelf) => shelf.group === 'school-10');
      return subject ? shelves.filter((shelf) => subjectMatches(shelf, subject)) : shelves;
    }
    if (schoolClass) return null;
    return ACADEMIC_SHELVES.filter((shelf) => shelf.group === 'school-5' || shelf.group === 'school-10');
  }

  return null;
}
