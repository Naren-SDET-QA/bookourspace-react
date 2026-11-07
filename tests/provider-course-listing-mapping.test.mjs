import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapProviderCourse } from '../src/components/ClassesTimingsExperience.tsx';

test('provider course cards map only approved PostgreSQL listing fields without invented ratings, dates, seats, distance, or images', () => {
  const course = mapProviderCourse({
    id: 'listing-class-1',
    title: 'Weekend Algebra',
    categoryId: 'class-academic',
    subcategory: 'Academic',
    entityType: 'course',
    price: 2400,
    priceUnit: 'per course',
    providerName: 'Actual Tutor',
    status: 'active',
    isVerified: false,
    isFeatured: false,
    location: { city: 'Actual City', area: 'Actual Area' },
    images: [],
    customFieldValues: {},
  });

  assert.equal(course.id, 'listing-class-1');
  assert.equal(course.title, 'Weekend Algebra');
  assert.equal(course.category, 'Academic');
  assert.equal(course.provider, 'Actual Tutor');
  assert.equal(course.fee, 2400);
  assert.equal(course.feeUnit, 'per course');
  assert.equal(course.city, 'Actual City');
  assert.equal(course.area, 'Actual Area');
  assert.equal(course.verified, false);
  assert.equal(course.demo, false);
  assert.equal(course.rating, undefined);
  assert.equal(course.reviews, undefined);
  assert.equal(course.seats, null);
  assert.equal(course.distanceKm, null);
  assert.equal(course.startDate, '');
  assert.equal(course.mode, 'Not specified');
  assert.equal(course.image, '');
});
