import { classCategories, type ClassCategoryInfo } from './moduleCategories';

export type ClassMainSectionId =
  | 'academic-education'
  | 'competitive-exams'
  | 'professional-career'
  | 'personal-hobbies';

export interface ClassMainSection {
  id: ClassMainSectionId;
  label: string;
  shortLabel: string;
  description: string;
  categoryIds: string[];
  courseCategories: string[];
  tags: string[];
}

/**
 * The single customer-facing taxonomy. Existing category IDs remain the
 * source of truth for listings and providers; this layer only groups them.
 */
export const CLASS_MAIN_SECTIONS: ClassMainSection[] = [
  {
    id: 'academic-education',
    label: 'Academic Education',
    shortLabel: 'Academic',
    description: 'School, college, university and formal academic pathways.',
    categoryIds: ['class-academic'],
    courseCategories: ['Academic'],
    tags: ['school', 'intermediate', 'degree', 'engineering', 'medical', 'law', 'mba', 'pg', 'phd', 'diploma'],
  },
  {
    id: 'competitive-exams',
    label: 'Competitive Exams',
    shortLabel: 'Competitive Exams',
    description: 'Government recruitment, entrance and competitive examination preparation.',
    categoryIds: ['class-govtexams'],
    courseCategories: ['Competitive Exams'],
    tags: ['upsc', 'appsc', 'ssc', 'banking', 'railway', 'jee', 'neet', 'eamcet', 'mcc', 'mscs'],
  },
  {
    id: 'professional-career',
    label: 'Professional & Career Development',
    shortLabel: 'Professional',
    description: 'Technology, business, vocational, technical and job-ready skills.',
    categoryIds: [
      'class-software', 'class-ai', 'class-government-skills', 'class-professional',
      'class-vocational', 'class-online', 'class-business', 'class-corporate',
      'class-technical', 'class-healthcare', 'class-driving', 'class-agriculture',
      'class-community-skills',
    ],
    courseCategories: ['Professional & IT', 'IT & Software', 'Business', 'Corporate', 'Technical', 'Healthcare', 'Driving', 'Agriculture', 'Community Skills'],
    tags: ['programming', 'testing', 'data-science', 'ai', 'accounting', 'finance', 'job-ready', 'vocational'],
  },
  {
    id: 'personal-hobbies',
    label: 'Personal Development & Hobbies',
    shortLabel: 'Personal',
    description: 'Languages, communication, arts, music, fitness, sports and lifestyle learning.',
    categoryIds: ['class-languages', 'class-music', 'class-dance', 'class-fitness', 'class-kids', 'class-sports', 'class-arts', 'class-beauty', 'class-religious', 'class-special', 'class-life-skills'],
    courseCategories: ['Life Skills', 'Sports & Fitness', 'Arts & Music', 'Languages', 'Kids'],
    tags: ['languages', 'communication', 'music', 'dance', 'art', 'sports', 'fitness', 'creative', 'hobbies'],
  },
];

const SECTION_BY_CATEGORY_ID = new Map<string, ClassMainSectionId>(
  CLASS_MAIN_SECTIONS.flatMap((section) => section.categoryIds.map((id) => [id, section.id] as const)),
);
const SECTION_BY_COURSE_CATEGORY = new Map<string, ClassMainSectionId>(
  CLASS_MAIN_SECTIONS.flatMap((section) => section.courseCategories.map((category) => [category.toLowerCase(), section.id] as const)),
);

export function getClassMainSection(categoryId?: string, courseCategory?: string): ClassMainSectionId | null {
  return (categoryId && SECTION_BY_CATEGORY_ID.get(categoryId))
    || (courseCategory && SECTION_BY_COURSE_CATEGORY.get(courseCategory.toLowerCase()))
    || null;
}

export function getClassCategoryCatalog(): ClassCategoryInfo[] {
  return classCategories;
}

/** Supported future additions that have no persisted ID yet. */
export const CONFIGURABLE_ACADEMIC_PROGRAMS = [
  'EAMCET preparation',
  'Intermediate MCC',
  'Intermediate MSCS',
  'Other supported Intermediate groups',
] as const;
