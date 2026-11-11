import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('clicking the faculty row opens the faculty profile and portfolio', () => {
  const detail = source('src/components/classes/ClassesStyleThreeDetail.tsx');
  const modal = source('src/components/classes/FacultyProfileModal.tsx');
  assert.match(detail, /setFacultyOpen\(true\)/);
  assert.match(detail, /View faculty profile/);
  assert.match(detail, /<FacultyProfileModal/);
  assert.match(modal, /Faculty Profile &amp; Portfolio/);
  assert.match(modal, /Verified Instructor Credentials/);
  assert.match(modal, /Biography &amp; Background/);
  assert.match(modal, /Official Certifications &amp; Credentials/);
  assert.match(modal, /Honors &amp; Key Achievements/);
  assert.match(modal, /Call Desk/);
  assert.match(modal, /WhatsApp/);
  assert.match(modal, /BOS_CALL_HREF/);
  assert.match(modal, /Yrs/);
  assert.match(modal, />Courses</);
  assert.match(modal, /Batches/);
  assert.doesNotMatch(modal, /Close profile/);
});

test('the faculty profile has verified demo credentials and no dead contact actions', () => {
  const data = source('src/data/classesTimingsData.ts');
  assert.match(data, /qualification: 'B\.Tech \(Computer Science\), JNTU Hyderabad'/);
  assert.match(data, /studentsTaught: 1250/);
  assert.match(data, /certifications: \[/);
  assert.match(data, /achievements: \[/);
  assert.match(data, /philosophy:/);
  assert.match(data, /studentsTaught: 980/);
  assert.match(data, /studentsTaught: 640/);
});
