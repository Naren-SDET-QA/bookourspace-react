import assert from 'node:assert/strict';
import test from 'node:test';
import { instituteErrorMessage, validateInstituteForm } from '../src/lib/instituteValidation.ts';

test('institute forms reject blank and malformed values before submission', () => {
  assert.deepEqual(validateInstituteForm('course', { title: '', price: 'abc', priceUnit: '', modes: 'zoom' }), {
    title: 'Course title must be at least 2 characters.',
    price: 'Fee must be a non-negative number.',
    priceUnit: 'Fee unit must be at least 1 character.',
    modes: 'Use only online, offline or hybrid.',
  });
  assert.equal(validateInstituteForm('batch', { title: 'Morning', listingId: 'course', daysOfWeek: 'Mon', startTime: '18:00', endTime: '17:00', capacity: '0', waitlistCapacity: '-1' }).endTime, 'End time must be after start time.');
  assert.equal(validateInstituteForm('admission', { name: 'A', phone: '', email: '' }).contact, 'Enter a phone number or email address.');
});

test('institute server errors are shown as actionable messages', () => {
  assert.equal(instituteErrorMessage('COURSE_FEE_INVALID'), 'Course fee must be a non-negative number.');
  assert.equal(instituteErrorMessage('BATCH_SCHEDULE_CONFLICT_CLASSROOM'), 'This batch overlaps an existing class. Change the room, faculty, days or time.');
});
