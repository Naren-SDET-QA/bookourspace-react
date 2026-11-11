import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Classes Style 3 uses the course cards and its own course detail', () => {
  const section = source('src/components/ClassesTimingsExperience.tsx');
  assert.match(section, /import \{ ClassesStyleThreeCards \} from '\.\/classes\/ClassesStyleThreeCards'/);
  assert.match(section, /import \{ ClassesStyleThreeDetail \} from '\.\/classes\/ClassesStyleThreeDetail'/);
  assert.match(section, /activeStyle === 'style3' \? \(/);
  assert.match(section, /<ClassesStyleThreeCards courses=\{results\}/);
  assert.match(section, /<ClassesStyleThreeDetail/);
  assert.doesNotMatch(section, /<StyleThreeList[\s\S]*Classes style 3 list/);
});

test('Classes Style 1 and Style 2 keep the existing course detail and enrollment', () => {
  const section = source('src/components/ClassesTimingsExperience.tsx');
  assert.match(section, /<CourseDetail/);
  assert.match(section, /<ClassEnrollmentModal/);
  assert.match(section, /activeStyle !== 'style3'/);
  assert.match(section, /onEnroll=\{\(\) => \{/);
});

test('the Classes Style 3 detail keeps enrollment, contact, fees, batches and reviews', () => {
  const detail = source('src/components/classes/ClassesStyleThreeDetail.tsx');
  assert.match(detail, /onEnroll/);
  assert.match(detail, /Enroll Now/);
  assert.match(detail, /Call Institute/);
  assert.match(detail, /Contact Institute/);
  assert.match(detail, /Batches &amp; Timings/);
  assert.match(detail, /Fees &amp; Offers/);
  assert.match(detail, /Reviews/);
  assert.match(detail, /bos_course_reviews_v1/);
  assert.match(detail, /Course Overview/);
  assert.match(detail, /Faculty/);
  assert.match(detail, /Location/);
});


test('Classes Style 3 shows eye-catching category cards with real images', () => {
  const section = source('src/components/ClassesTimingsExperience.tsx');
  const rail = source('src/components/classes/ClassesCategoryRail.tsx');
  assert.match(section, /<ClassesCategoryRail/);
  assert.match(section, /activeStyle === 'style3'/);
  for (const label of ['Dance', 'Education', 'Art', 'Swimming', 'Sports', 'IT & Software', 'Yoga', 'Languages']) {
    assert.match(rail, new RegExp(`label: '${label.replace(/[&]/g, '\\&')}'`), label);
  }
  assert.match(rail, /categories\/ClassesCategoryRail|https:\/\/images\.unsplash\.com/);
  assert.match(rail, /onSelect\(card\.selection\)/);
});
