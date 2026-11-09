import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyLiveBatches, mapProviderCourse } from '../src/components/ClassesTimingsExperience.tsx';

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

test('live class starting price uses the cheapest active batch, not calendar order', () => {
  const course = mapProviderCourse({
    id: 'listing-class-price',
    title: 'Pricing test',
    categoryId: 'class-academic',
    subcategory: 'Academic',
    entityType: 'course',
    price: 5000,
    priceUnit: 'per course',
    providerName: 'Actual Tutor',
    status: 'active',
    isVerified: true,
    isFeatured: false,
    location: { city: 'Actual City', area: 'Actual Area' },
    images: [],
    customFieldValues: {},
  });
  const result = applyLiveBatches(course, [
    {
      id: 'batch-late', listingId: course.id, title: 'Late batch', deliveryMode: 'online',
      startDate: '2027-02-01', endDate: null, startTime: '18:00', endTime: '19:00',
      daysOfWeek: 'Mon', capacity: 10, waitlistCapacity: 0, confirmedCount: 0,
      waitlistCount: 0, seatsLeft: 10, waitlistLeft: 0, onlineFee: 5000, offlineFee: 0,
      feeUnit: 'course', timezone: 'Asia/Kolkata', durationLabel: '', area: 'Actual Area',
      facultyName: 'Trainer', facultyExperience: '', holidays: [], exams: [], status: 'active',
      reviewNote: null, createdAt: '', updatedAt: '',
    },
    {
      id: 'batch-cheap', listingId: course.id, title: 'Cheap batch', deliveryMode: 'online',
      startDate: '2027-03-01', endDate: null, startTime: '10:00', endTime: '11:00',
      daysOfWeek: 'Tue', capacity: 10, waitlistCapacity: 0, confirmedCount: 0,
      waitlistCount: 0, seatsLeft: 10, waitlistLeft: 0, onlineFee: 1800, offlineFee: 0,
      feeUnit: 'course', timezone: 'Asia/Kolkata', durationLabel: '', area: 'Actual Area',
      facultyName: 'Trainer', facultyExperience: '', holidays: [], exams: [], status: 'active',
      reviewNote: null, createdAt: '', updatedAt: '',
    },
  ]);

  assert.equal(result.fee, 1800);
  assert.equal(result.feePlans[0].amount, 1800);
});

test('hybrid batch offline fee uses the offline price, not the cheaper online price', () => {
  const course = mapProviderCourse({
    id: 'listing-class-hybrid-price',
    title: 'Hybrid pricing test',
    categoryId: 'class-academic',
    subcategory: 'Academic',
    entityType: 'course',
    price: 5000,
    priceUnit: 'per course',
    providerName: 'Actual Tutor',
    status: 'active',
    isVerified: true,
    isFeatured: false,
    location: { city: 'Actual City', area: 'Actual Area' },
    images: [],
    customFieldValues: {},
  });
  const result = applyLiveBatches(course, [{
    id: 'batch-hybrid', listingId: course.id, title: 'Hybrid batch', deliveryMode: 'hybrid',
    startDate: '2027-02-01', endDate: null, startTime: '18:00', endTime: '20:00',
    daysOfWeek: 'Mon', capacity: 10, waitlistCapacity: 0, confirmedCount: 0,
    waitlistCount: 0, seatsLeft: 10, waitlistLeft: 0, onlineFee: 1000, offlineFee: 2000,
    feeUnit: 'course', timezone: 'Asia/Kolkata', durationLabel: '', area: 'Actual Area',
    facultyName: 'Trainer', facultyExperience: '', holidays: [], exams: [], status: 'active',
    reviewNote: null, createdAt: '', updatedAt: '',
  }]);

  assert.equal(result.fee, 1000);
  assert.equal(result.feePlans.find((plan) => plan.mode === 'Offline')?.amount, 2000);
});
