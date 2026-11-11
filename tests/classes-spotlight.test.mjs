import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Classes Style 3 renders spotlight live-batch cards', () => {
  const section = source('src/components/ClassesTimingsExperience.tsx');
  const cards = source('src/components/classes/ClassesSpotlightCards.tsx');
  assert.match(section, /<ClassesSpotlightCards/);
  assert.match(cards, /SPOTLIGHT · LIVE BATCHES/);
  assert.match(cards, /Student Success &amp; Placements/);
  assert.match(cards, /Current Running Batches/);
  assert.match(cards, /Free Demo/);
  assert.match(cards, /Book Seat/);
  assert.match(cards, /Add to Compare/);
  assert.match(cards, /Call Owner/);
  assert.match(cards, /BOS_CALL_HREF/);
  assert.match(cards, /onOpenFaculty/);
  assert.match(cards, /<FacultyProfileModal/);
  assert.doesNotMatch(cards, /View Calendar/);
});

test('spotlight cards read real course stats and never invent a calendar', () => {
  const data = source('src/data/classesTimingsData.ts');
  assert.match(data, /courseCode: 'FULL STACK WEB DEVELOPMENT'/);
  assert.match(data, /placedPercent: 94/);
  assert.match(data, /certifiedCount: 1420/);
  assert.match(data, /courseCode: 'PYTHON FOR DATA SCIENCE'/);
  assert.match(data, /placedPercent: 92/);
  assert.match(data, /certifiedCount: 980/);
  assert.match(data, /originalFee: 37499/);
  assert.match(data, /originalFee: 8124/);
});

test('spotlight comparisons and actions stay functional', () => {
  const cards = source('src/components/classes/ClassesSpotlightCards.tsx');
  assert.match(cards, /showCompare/);
  assert.match(cards, /Compare Courses/);
  assert.match(cards, /onEnroll/);
  assert.match(cards, /navigator\.share/);
  assert.match(cards, /toggleCourseFavorite/);
});
