import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvedHashForSection,
  canonicalizeSectionHash,
  isClearedLocationCity,
  resolveSectionHashNavigation,
  sanitizeUiReturnHash,
} from '../src/lib/sectionRouteHash.ts';
import { sanitizeServicesReturnHash } from '../src/lib/sectionStyleSettings.ts';

test('secure tracking hashes keep the token case and do not open a marketplace section', () => {
  const token = 'Abcdefghijabcdefghijabcdefghijabcdefghijabcd';
  assert.deepEqual(resolveSectionHashNavigation(`#track/${token}`, ''), { action: 'track', token });
  assert.equal(canonicalizeSectionHash(`#track/${token}`), `#track/${token}`);
});

test('empty hash does not close an already-open section on effect re-run', () => {
  assert.equal(resolveSectionHashNavigation('', undefined).action, 'keep-open');
  assert.equal(resolveSectionHashNavigation('', '').action, 'keep-open');
  assert.equal(resolveSectionHashNavigation('services', 'services').action, 'open');
});

test('leaving a section hash closes curated screens', () => {
  assert.equal(resolveSectionHashNavigation('', 'services').action, 'close-sections');
  assert.equal(resolveSectionHashNavigation('', 'classes/style4').action, 'close-sections');
});

test('services hashes always open Triangle and ignore retired styles', () => {
  for (const hash of ['services', 'services/old', 'services/style1', 'services/noddyy', 'services/triangle']) {
    const decision = resolveSectionHashNavigation(hash, undefined);
    assert.equal(decision.action, 'open');
    assert.equal(decision.section, 'services');
    assert.equal(canonicalizeSectionHash(hash), '#services');
  }
});

test('classes Style 4 survives aliases; Style 3 stays on the training route', () => {
  assert.deepEqual(resolveSectionHashNavigation('classes/style4', ''), {
    action: 'open', section: 'classes', classesStyle: 'style4',
  });
  assert.deepEqual(resolveSectionHashNavigation('classes/style3', ''), {
    action: 'open', section: 'classes', classesStyle: 'style3',
  });
  assert.deepEqual(resolveSectionHashNavigation('classes', ''), {
    action: 'open', section: 'classes', classesStyle: undefined,
  });
  assert.deepEqual(resolveSectionHashNavigation('classes/old', ''), {
    action: 'open', section: 'classes', classesStyle: 'style4',
  });
  assert.equal(canonicalizeSectionHash('classes/style1'), '#classes/style4');
  assert.equal(canonicalizeSectionHash('classes'), '#classes');
  assert.equal(approvedHashForSection('classes', 'style4'), '#classes/style4');
  assert.equal(approvedHashForSection('services'), '#services');
});

test('OAuth return hashes cannot restore legacy Services or Classes layouts', () => {
  assert.equal(sanitizeUiReturnHash('#services/old'), '#services');
  assert.equal(sanitizeUiReturnHash('#services/style1'), '#services');
  assert.equal(sanitizeServicesReturnHash('#services/noddyy'), '#services');
  assert.equal(sanitizeServicesReturnHash('#classes/style4'), '#classes/style4');
  assert.equal(sanitizeServicesReturnHash('#classes/style3'), '#classes/style3');
  assert.equal(sanitizeServicesReturnHash('#classes/old'), '#classes/style4');
  assert.equal(sanitizeServicesReturnHash('#classes'), '#classes');
  assert.equal(sanitizeServicesReturnHash('#stays/old'), '#stays/old');
});

test('cleared location cities are detected without treating a real city as empty', () => {
  assert.equal(isClearedLocationCity('All Cities'), true);
  assert.equal(isClearedLocationCity('all'), true);
  assert.equal(isClearedLocationCity('Hyderabad'), false);
  assert.equal(isClearedLocationCity('Mumbai'), false);
});
