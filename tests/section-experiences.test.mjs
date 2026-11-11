import assert from 'node:assert/strict';

import {
  filterPgListings,
  filterServiceListings,
  formatInr,
  isPgListing,
  isServiceListing,
  matchesPgSharing,
  pageCount,
  paginate,
  parsePgListing,
  parseServiceListing,
  pgGenderLabel,
  pgGenderOf,
  resolveSectionState,
  serviceCategoryCounts,
  SECTION_PAGE_SIZE,
} from '../src/lib/sectionExperiences.ts';

function test(name, callback) {
  try {
    callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

function pgListing(overrides = {}) {
  return {
    id: 'pg-301',
    title: 'Sri Sai Balaji Executive Luxury Men’s PG',
    description: 'AC PG for IT professionals with three meals.',
    categoryId: 'pg-professionals',
    subcategory: 'IT employee PG',
    entityType: 'property',
    price: 8500,
    priceUnit: '/month',
    currency: '₹',
    location: { city: 'Hyderabad', area: 'Madhapur / Hitech City' },
    images: ['https://images.example.com/pg-301-a.jpg', 'https://images.example.com/pg-301-b.jpg'],
    providerId: 'prov-pg301',
    providerName: 'K. Venkat Rao',
    providerRating: 4.8,
    reviewCount: 168,
    isVerified: true,
    status: 'active',
    customFieldValues: {
      genderPolicy: 'Men Only (Working IT Professionals & Graduates)',
      roomTypesAvailable: 'Single Room, 2-Sharing & 3-Sharing AC',
      foodIncluded: 'Yes - 3 Times Unlimited Food',
      securityDeposit: '₹2,000 Refundable Security Deposit',
      attachedWashroom: 'Yes - Every Room Has Geyser',
      wifiSpeed: '200 Mbps',
      noticePeriod: '15 Days Advance Notice',
      gateClosingTime: '11:30 PM',
      bedsAvailable: 4,
    },
    ...overrides,
  };
}

function serviceListing(overrides = {}) {
  return {
    id: 'srv-hyd-1',
    title: 'CoolTech Pro: AC Gas Refill & Fridge Repair',
    description: 'Multi-brand technicians at your doorstep.',
    categoryId: 'cat-4',
    subcategory: 'AC',
    entityType: 'service',
    price: 499,
    priceUnit: '/service',
    currency: '₹',
    location: { city: 'Hyderabad', area: 'Madhapur / Hitech City' },
    images: ['https://images.example.com/srv-1.jpg'],
    providerId: 'prov-srv-1',
    providerName: 'CoolTech Appliance Care',
    providerRating: 4.9,
    reviewCount: 312,
    isVerified: true,
    status: 'active',
    customFieldValues: { serviceWarranty: '60 Days', brandExpertise: 'Daikin, LG' },
    ...overrides,
  };
}

console.log('\nsectionExperiences');

test('routes listings to the right section', () => {
  assert.equal(isPgListing(pgListing()), true);
  assert.equal(isPgListing(serviceListing()), false);
  assert.equal(isServiceListing(serviceListing()), true);
  assert.equal(isServiceListing(pgListing()), false);
  assert.equal(isPgListing(pgListing({ categoryId: 'custom', customFieldValues: { sectionType: 'pg_hostels' } })), true);
});

test('gender policy is read from the listing, not guessed', () => {
  assert.equal(pgGenderOf(pgListing()), 'boys');
  assert.equal(pgGenderOf(pgListing({ customFieldValues: { genderPolicy: 'Women Only (Strict Verification)' } })), 'girls');
  assert.equal(pgGenderOf(pgListing({ categoryId: 'pg-coliving', customFieldValues: {} })), 'co-living');
  assert.equal(pgGenderOf(pgListing({ categoryId: 'pg-students', subcategory: 'Coaching students PG', customFieldValues: {} })), 'unspecified');
  assert.equal(pgGenderLabel('co-living'), 'Co-living');
});

test('sharing filters only match options the owner actually listed', () => {
  const text = 'Single Room, 2-Sharing & 3-Sharing AC';
  assert.equal(matchesPgSharing(text, 'all'), true);
  assert.equal(matchesPgSharing(text, 'single'), true);
  assert.equal(matchesPgSharing(text, '2'), true);
  assert.equal(matchesPgSharing(text, '3'), true);
  assert.equal(matchesPgSharing(text, '4'), false);
  assert.equal(matchesPgSharing('', '2'), false);
});

test('PG detail carries the common occupancy, charges, amenity and rule information', () => {
  const card = parsePgListing(pgListing({
    customFieldValues: {
      ...pgListing().customFieldValues,
      sharingHighlight: '2-Sharing AC: ₹8,500 | Single AC: ₹14,000',
      totalCapacity: 45,
      housekeeping: 'Daily Room & Bathroom Deep Cleaning',
      parking: 'Bike parking',
      powerBackup: '100% Generator Backup',
    },
    location: { city: 'Hyderabad', area: 'Madhapur / Hitech City', lat: 17.4485, lng: 78.3748 },
  }));
  assert.equal(card.availableFor, 'Men Only (Working IT Professionals & Graduates)');
  assert.equal(card.preferredTenant, 'Working IT Professionals & Graduates');
  assert.equal(card.noticePeriod, '15 Days Advance Notice');
  assert.equal(card.gateClosingTime, '11:30 PM');
  assert.equal(card.totalCapacity, 45);
  assert.equal(card.parking, 'Bike parking');
  assert.equal(card.roomCleaning, 'Daily Room & Bathroom Deep Cleaning');
  assert.equal(card.powerBackup, '100% Generator Backup');
  assert.equal(card.rating, 4.8);
  assert.equal(card.reviewCount, 168);
  assert.equal(card.lat, 17.4485);
  assert.equal(card.lng, 78.3748);
  assert.deepEqual(card.roomTypes, [
    { label: '2-Sharing AC', price: 8500, deposit: '₹2,000 Refundable Security Deposit' },
    { label: 'Single AC', price: 14000, deposit: '₹2,000 Refundable Security Deposit' },
  ]);
});

test('PG card keeps one photo for cards and the real gallery for details', () => {
  const card = parsePgListing(pgListing());
  assert.equal(card.photo, 'https://images.example.com/pg-301-a.jpg');
  const stored = parsePgListing(pgListing({
    images: [
      'storage://bos-public-media/owner/pg_hostels/provider_listing/asset/original.jpg',
      'https://images.example.com/pg-301-b.jpg',
    ],
  }));
  assert.equal(stored.photo, 'storage://bos-public-media/owner/pg_hostels/provider_listing/asset/original.jpg');
  assert.deepEqual(stored.photos, [
    'storage://bos-public-media/owner/pg_hostels/provider_listing/asset/original.jpg',
    'https://images.example.com/pg-301-b.jpg',
  ]);
  assert.equal(card.photoCount, 2);
  assert.equal(card.photos.length, 2);
  assert.equal(card.rentRupees, 8500);
  assert.equal(card.deposit, '₹2,000 Refundable Security Deposit');
  assert.equal(card.bedsAvailable, 4);
  assert.equal(card.verified, true);
  assert.equal(card.locality, 'Madhapur / Hitech City');
  assert.ok(card.facilities.some((row) => row.label === 'Food'));
  assert.ok(card.rules.some((row) => row.label === 'Notice period'));
});

test('missing PG fields stay null instead of being invented', () => {
  const card = parsePgListing(
    pgListing({ images: [], price: 0, customFieldValues: { genderPolicy: 'Men Only' } }),
  );
  assert.equal(card.photo, null);
  assert.equal(card.photoCount, 0);
  assert.equal(card.rentRupees, null);
  assert.equal(card.deposit, null);
  assert.equal(card.food, null);
  assert.equal(card.bedsAvailable, null);
  assert.deepEqual(card.facilities, []);
  assert.equal(formatInr(card.rentRupees), null);
});

test('PG filters combine gender, rent, food, bathroom and query', () => {
  const boys = parsePgListing(pgListing());
  const girls = parsePgListing(
    pgListing({
      id: 'pg-302',
      title: 'Sri Lakshmi Mahila PG',
      categoryId: 'pg-women-safe',
      price: 7500,
      location: { city: 'Hyderabad', area: 'Kukatpally / KPHB Colony' },
      customFieldValues: {
        genderPolicy: 'Women Only',
        roomTypesAvailable: '2 & 3-Sharing',
        foodIncluded: 'No',
        attachedWashroom: 'No',
      },
    }),
  );
  const cards = [boys, girls];
  const base = { query: '', gender: 'all', sharing: 'all', maxRent: null, foodOnly: false, attachedBathOnly: false };

  assert.equal(filterPgListings(cards, base).length, 2);
  assert.deepEqual(filterPgListings(cards, { ...base, gender: 'girls' }).map((card) => card.id), ['pg-302']);
  assert.deepEqual(filterPgListings(cards, { ...base, maxRent: 8000 }).map((card) => card.id), ['pg-302']);
  assert.deepEqual(filterPgListings(cards, { ...base, foodOnly: true }).map((card) => card.id), ['pg-301']);
  assert.deepEqual(filterPgListings(cards, { ...base, attachedBathOnly: true }).map((card) => card.id), ['pg-301']);
  assert.deepEqual(filterPgListings(cards, { ...base, query: 'madhapur' }).map((card) => card.id), ['pg-301']);
  assert.deepEqual(filterPgListings(cards, { ...base, query: 'kphb' }).map((card) => card.id), ['pg-302']);
  assert.deepEqual(filterPgListings(cards, { ...base, query: 'no-such-pg' }), []);
});

test('AC, bathroom, audience, hostel and multiple-sharing filters use listed facts only', () => {
  const acWorking = parsePgListing(
    pgListing({
      id: 'pg-ac',
      customFieldValues: {
        genderPolicy: 'Men Only',
        occupantType: 'Working professionals',
        acType: 'Split AC',
        roomTypesAvailable: '2 & 4-Sharing',
        attachedWashroom: 'Attached',
      },
    }),
  );
  const nonAcHostel = parsePgListing(
    pgListing({
      id: 'pg-hostel',
      categoryId: 'pg-hostel',
      subcategory: 'Boys Hostel',
      customFieldValues: {
        genderPolicy: 'Students Only',
        acType: 'Non-AC',
        roomTypesAvailable: '4-Sharing Dormitory',
        attachedWashroom: 'Common bathroom',
      },
    }),
  );
  const mixed = parsePgListing(
    pgListing({
      id: 'pg-mixed',
      customFieldValues: {
        genderPolicy: 'Working professionals & students',
        roomTypesAvailable: 'AC & Non-AC 3-Sharing',
        attachedWashroom: 'Attached & common bathrooms',
      },
    }),
  );
  const unknown = parsePgListing(pgListing({ id: 'pg-unknown', customFieldValues: {} }));
  const cards = [acWorking, nonAcHostel, mixed, unknown];
  const base = { query: '', gender: 'all', sharing: 'all', maxRent: null, foodOnly: false, attachedBathOnly: false };
  const ids = (filters) => filterPgListings(cards, { ...base, ...filters }).map((card) => card.id);

  assert.deepEqual(ids({ ac: 'ac' }), ['pg-ac', 'pg-mixed']);
  assert.deepEqual(ids({ ac: 'non-ac' }), ['pg-hostel', 'pg-mixed']);
  assert.deepEqual(ids({ bathroom: 'attached' }), ['pg-ac', 'pg-mixed']);
  assert.deepEqual(ids({ bathroom: 'common' }), ['pg-hostel', 'pg-mixed']);
  assert.deepEqual(ids({ occupant: 'student' }), ['pg-hostel', 'pg-mixed']);
  assert.deepEqual(ids({ occupant: 'working' }), ['pg-ac', 'pg-mixed']);
  assert.deepEqual(ids({ kind: 'hostel' }), ['pg-hostel']);
  assert.deepEqual(ids({ kind: 'pg' }), ['pg-ac', 'pg-mixed', 'pg-unknown']);
  assert.deepEqual(ids({ sharing: 'multiple' }), ['pg-ac', 'pg-hostel']);

  // Fields the owner did not list stay unknown instead of being inferred.
  assert.equal(unknown.occupant, null);
  assert.equal(unknown.bathroomKind, null);
  assert.equal(unknown.hasAc, false);
  assert.equal(unknown.hasNonAc, false);
  assert.deepEqual(filterPgListings([unknown], { ...base, ac: 'ac' }), []);
});

test('service price label respects listed price versus quote-only', () => {
  const priced = parseServiceListing(serviceListing());
  assert.equal(priced.priceLabel.includes('499'), true);
  assert.equal(priced.quoteOnly, false);
  assert.equal(priced.categoryName, 'Appliance Repair');

  const visit = parseServiceListing(serviceListing({ id: 'srv-2', price: 399, priceUnit: '/visit' }));
  assert.equal(visit.quoteOnly, false);

  const quote = parseServiceListing(serviceListing({ id: 'srv-3', price: 0, priceUnit: 'Negotiable' }));
  assert.equal(quote.quoteOnly, true);
  assert.equal(quote.priceLabel, 'Request a quote');
  assert.equal(quote.priceRupees, null);
});

test('service ratings only appear when reviews exist', () => {
  assert.equal(parseServiceListing(serviceListing()).rating, 4.9);
  assert.equal(parseServiceListing(serviceListing({ reviewCount: 0 })).rating, null);
});

test('service cards keep public Storage refs and unwrap {url} / imageUrl photos', () => {
  const storage = parseServiceListing(serviceListing({
    images: ['storage://bos-public-media/owner/services/cover.webp'],
  }));
  assert.equal(storage.photo, 'storage://bos-public-media/owner/services/cover.webp');
  const wrapped = parseServiceListing(serviceListing({
    images: [{ url: 'https://images.example.com/ac.jpg' }],
  }));
  assert.equal(wrapped.photo, 'https://images.example.com/ac.jpg');
  const cover = parseServiceListing(serviceListing({
    images: [],
    imageUrl: 'https://images.example.com/cover.jpg',
  }));
  assert.equal(cover.photo, 'https://images.example.com/cover.jpg');
});

test('service filters combine category, verification, quote and query', () => {
  const ac = parseServiceListing(serviceListing());
  const quote = parseServiceListing(
    serviceListing({ id: 'srv-9', title: 'Home Painting Estimate', categoryId: 'cat-6', price: 0, priceUnit: 'Negotiable', isVerified: false, location: { city: 'Hyderabad', area: 'Kondapur' } }),
  );
  const cards = [ac, quote];
  const base = { query: '', categoryId: 'all', verifiedOnly: false, maxPrice: null, quoteOnly: false };

  assert.equal(filterServiceListings(cards, base).length, 2);
  assert.deepEqual(filterServiceListings(cards, { ...base, categoryId: 'cat-6' }).map((card) => card.id), ['srv-9']);
  assert.deepEqual(filterServiceListings(cards, { ...base, verifiedOnly: true }).map((card) => card.id), ['srv-hyd-1']);
  assert.deepEqual(filterServiceListings(cards, { ...base, quoteOnly: true }).map((card) => card.id), ['srv-9']);
  assert.deepEqual(filterServiceListings(cards, { ...base, maxPrice: 500 }).map((card) => card.id), ['srv-hyd-1']);
  assert.deepEqual(filterServiceListings(cards, { ...base, query: 'kondapur' }).map((card) => card.id), ['srv-9']);
});

test('category counts come from the loaded listings', () => {
  const counts = serviceCategoryCounts([parseServiceListing(serviceListing())]);
  const appliance = counts.find((category) => category.id === 'cat-4');
  assert.equal(appliance.count, 1);
  assert.equal(counts.find((category) => category.id === 'cat-1').count, 0);
});

test('pagination clamps pages and slices deterministically', () => {
  const items = Array.from({ length: 23 }, (_, index) => index);
  assert.equal(pageCount(23), Math.ceil(23 / SECTION_PAGE_SIZE));
  assert.equal(pageCount(0), 0);
  assert.deepEqual(paginate(items, 0, 9), items.slice(0, 9));
  assert.deepEqual(paginate(items, 2, 9), items.slice(18, 23));
  assert.deepEqual(paginate(items, -5, 9), items.slice(0, 9));
  assert.deepEqual(paginate(items, 99, 9), []);
});

test('section states cover loading, error, empty and results', () => {
  assert.equal(resolveSectionState(true, false, 5), 'loading');
  assert.equal(resolveSectionState(false, true, 5), 'error');
  assert.equal(resolveSectionState(false, false, 0), 'empty');
  assert.equal(resolveSectionState(false, false, 5), 'results');
});

console.log(process.exitCode ? '\nFAILURES\n' : '\nall section tests passed\n');
