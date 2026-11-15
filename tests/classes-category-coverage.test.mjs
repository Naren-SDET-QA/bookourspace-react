import test from 'node:test';
import assert from 'node:assert/strict';
import { classCategories } from '../src/data/classesData.ts';

/**
 * The Classes module must cover every requested training category. Category
 * names are the discovery contract used by the admin-created category rail,
 * and each category must carry English/Telugu/Hindi subcategories.
 */

const REQUIRED_CATEGORIES = [
  'Academic',
  'Government Exams',
  'Software & IT',
  'AI & Emerging Tech',
  'Professional Skills',
  'Government Skills',
  'Corporate',
  'Life Skills',
  'Sports',
  'Yoga & Fitness',
  'Dance',
  'Music',
  'Arts',
  'Languages',
  'Driving',
];

/** Board and exam coverage is expressed as subcategories of the parent. */
const REQUIRED_SUBCATEGORY_GROUPS = [
  { category: 'Academic', terms: ['CBSE', 'ICSE', 'State syllabus', 'Home tuition'] },
  { category: 'Government Exams', terms: ['UPSC', 'APPSC', 'TSPSC', 'SSC', 'Banking'] },
  { category: 'Software & IT', terms: ['Python', 'Java', 'React', 'Cloud', 'Cybersecurity'] },
];

test('Classes categories cover every required training category', () => {
  const names = new Set(classCategories.map((category) => category.name));
  for (const name of REQUIRED_CATEGORIES) {
    assert.ok(names.has(name), `missing Classes category: ${name}`);
  }
});

test('Classes categories cover board and government exam subcategories', () => {
  for (const group of REQUIRED_SUBCATEGORY_GROUPS) {
    const category = classCategories.find((entry) => entry.name === group.category);
    assert.ok(category, `missing category ${group.category}`);
    const haystack = category.subcategories.map((sub) => sub.en).join(' | ');
    for (const term of group.terms) {
      assert.ok(haystack.includes(term), `${group.category} is missing subcategory term: ${term}`);
    }
  }
});

test('Classes categories have unique ids and localized subcategory labels', () => {
  const ids = classCategories.map((category) => category.id);
  assert.equal(new Set(ids).size, ids.length, 'category ids must be unique');

  for (const category of classCategories) {
    assert.ok(category.nameTe.trim(), `${category.id} needs a Telugu label`);
    assert.ok(category.nameHi.trim(), `${category.id} needs a Hindi label`);
    assert.ok(category.subcategories.length > 0, `${category.id} needs subcategory metadata`);
    for (const subcategory of category.subcategories) {
      assert.ok(subcategory.en.trim());
      assert.ok(subcategory.te.trim());
      assert.ok(subcategory.hi.trim());
    }
  }
});
