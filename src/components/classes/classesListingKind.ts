import type { CourseListing } from '../../data/classesTimingsData';
import { SCHOOL_SUBJECT_FILTERS } from './academicFilters';

export type ListingKind = 'admissions' | 'tuition' | 'training';

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
    course.startDate,
    course.level,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/** Admission wording on schedule labels like "Rolling admissions" is not an institution admissions listing. */
const admissionText = (course: CourseListing): string =>
  [course.title, course.provider, course.category, course.description, course.eligibility, course.level]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const hasWord = (course: CourseListing, words: string[]): boolean => {
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(^|[^a-z0-9])(?:${escaped.join('|')})(?![a-z0-9])`, 'i').test(listingText(course));
};

/** Academic admissions vs tuition vs skill training, from published pathway and wording. */
export function listingKind(course: CourseListing): ListingKind {
  // School/college admissions — not entrance-exam coaching, which stays tuition/training.
  if (new RegExp(`(^|[^a-z0-9])(?:admission|admissions|apply|application|enrol|enroll)(?![a-z0-9])`, 'i').test(admissionText(course))) {
    return 'admissions';
  }
  if (course.pathway === 'Academic') return 'tuition';
  return 'training';
}

/** One published listing of each kind, for the above-the-fold Classes showcase. */
export function pickKindShowcase(courses: CourseListing[]): CourseListing[] {
  const kinds: ListingKind[] = ['admissions', 'tuition', 'training'];
  const used = new Set<string>();
  const picked: CourseListing[] = [];
  for (const kind of kinds) {
    const found = courses.find((course) => listingKind(course) === kind && !used.has(course.id));
    if (found) {
      used.add(found.id);
      picked.push(found);
    }
  }
  return picked;
}

export const KIND_LABEL: Record<ListingKind, string> = {
  admissions: 'Admissions',
  tuition: 'Tuition & Classes',
  training: 'Training & Coaching',
};

const BOARDS: Array<{ label: string; words: string[] }> = [
  { label: 'CBSE', words: ['cbse'] },
  { label: 'ICSE', words: ['icse'] },
  { label: 'IB', words: ['ib', 'international baccalaureate'] },
  { label: 'Cambridge', words: ['cambridge'] },
  { label: 'NIOS', words: ['nios'] },
  { label: 'State board', words: ['state board', 'state syllabus', 'matric'] },
];

const INSTITUTION_TYPES: Array<{ label: string; words: string[] }> = [
  { label: 'University', words: ['university'] },
  { label: 'Junior college', words: ['junior college'] },
  { label: 'College', words: ['college'] },
  { label: 'School', words: ['school', 'nursery', 'lkg', 'ukg'] },
  { label: 'Academy', words: ['academy'] },
  { label: 'Institute', words: ['institute'] },
];

function firstMatch(course: CourseListing, options: Array<{ label: string; words: string[] }>): string | null {
  const found = options.find((option) => hasWord(course, option.words));
  return found?.label ?? null;
}

function offeredModes(course: CourseListing): string[] {
  const modes = (course.modeOptions?.length ? course.modeOptions : [course.mode])
    .map((mode) => String(mode).trim())
    .filter((mode) => mode && mode !== 'Not specified');
  return [...new Set(modes)];
}

export type ListingFacts = {
  kind: ListingKind;
  kindLabel: string;
  place: string | null;
  board: string | null;
  subjects: string[];
  institutionType: string | null;
  modeLabel: string | null;
  nextBatch: string | null;
  batchTiming: string | null;
  feeLabel: string | null;
  feeSuffix: string | null;
  rating: number | null;
  reviews: number | null;
  verified: boolean;
  admissionOpen: boolean;
  popular: boolean;
  certificate: string | null;
  level: string | null;
  duration: string | null;
  academicYear: string | null;
  tutorName: string | null;
  tutorPhoto: string | null;
  seatsLabel: string | null;
  originalFeeLabel: string | null;
  discountPercent: number | null;
  categoryBadge: string;
};

export function listingFacts(course: CourseListing): ListingFacts {
  const kind = listingKind(course);
  const place = [course.area, course.city].filter(Boolean).join(', ') || null;
  const homeTuition = /home/.test(listingText(course));
  const modes = offeredModes(course);
  const modeLabel = homeTuition
    ? ['Home tuition', ...modes.filter((mode) => !/home/i.test(mode))].join(' · ')
    : modes.join(' · ') || null;

  const unit = String(course.feeUnit || '').toLowerCase();
  const feeSuffix = course.free
    ? null
    : unit === 'month' || unit === 'monthly'
      ? '/ month'
      : unit === 'hour'
        ? '/ hour'
        : unit === 'session'
          ? '/ session'
          : unit === 'course'
            ? '/ course'
            : course.feeUnit
              ? ` / ${course.feeUnit}`
              : null;

  const start = course.startDate?.trim() || null;
  const yearMatch = `${course.startDate || ''} ${course.description || ''}`.match(
    /\b((?:AY\s*)?20\d{2}\s*[-–/]\s*20\d{2}|AY\s*20\d{2})\b/i,
  );

  const seatsLabel =
    typeof course.seats === 'number' && Number.isFinite(course.seats)
      ? course.seats === 0
        ? 'Waitlist'
        : `${course.seats} seats`
      : null;

  const rolling = /\brolling\b/i.test(start || '');
  const admissionOpen =
    kind === 'admissions' &&
    (course.liveCalendar === true ||
      rolling ||
      (typeof course.seats === 'number' && course.seats > 0) ||
      /\bopen\b/i.test(`${start || ''} ${course.description || ''}`));

  const subjects = SCHOOL_SUBJECT_FILTERS.filter((subject) => hasWord(course, subject.words)).map((subject) => subject.label);
  const hasDiscount =
    !course.free && typeof course.originalFee === 'number' && Number.isFinite(course.originalFee) && course.originalFee > course.fee;
  const categoryBadge = subjects[0] || String(course.category || '').trim() || KIND_LABEL[kind];

  return {
    kind,
    kindLabel: KIND_LABEL[kind],
    place,
    board: firstMatch(course, BOARDS),
    subjects,
    institutionType: firstMatch(course, INSTITUTION_TYPES),
    modeLabel,
    nextBatch: start,
    batchTiming: course.batches[0]?.label || null,
    feeLabel: course.free ? 'FREE' : Number.isFinite(course.fee) ? `\u20b9${Math.round(course.fee).toLocaleString('en-IN')}` : null,
    feeSuffix,
    rating: typeof course.rating === 'number' ? course.rating : null,
    reviews: typeof course.reviews === 'number' ? course.reviews : null,
    verified: course.verified === true,
    admissionOpen,
    popular: course.highEnrollment === true,
    certificate: course.certification?.trim() || null,
    level: course.level?.trim() || null,
    duration: course.duration?.trim() || null,
    academicYear: yearMatch ? yearMatch[1] : null,
    tutorName: course.faculty?.name?.trim() || null,
    tutorPhoto: course.faculty?.photo?.trim() || null,
    seatsLabel,
    originalFeeLabel: hasDiscount ? `\u20b9${Math.round(course.originalFee as number).toLocaleString('en-IN')}` : null,
    discountPercent: hasDiscount ? Math.round((1 - course.fee / (course.originalFee as number)) * 100) : null,
    categoryBadge,
  };
}
