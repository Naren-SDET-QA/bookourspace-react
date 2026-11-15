import assert from 'node:assert/strict';

import {
  LIVE_EDIT_MODULES,
  LIVE_EDIT_MODULE_LABELS,
} from '../src/lib/liveEdit/types.ts';
import { LIVE_EDIT_MODULE_SCHEMAS } from '../src/lib/liveEdit/moduleSchemas.ts';
import {
  categoryMatchesModule,
  inferLiveEditModule,
} from '../src/lib/liveEdit/moduleInference.ts';
import {
  changedFieldPaths,
  isHttpsUrl,
  isIsoDateOnly,
  normalizeShowtimes,
  parseShowtimes,
  parseTierPricing,
  validateLiveEditDraft,
} from '../src/lib/liveEdit/validation.ts';
import {
  buildCinemaScreenUpdateInput,
  buildListingUpdateInput,
  draftFromListing,
  listingFromCinemaScreen,
  listingFromRow,
} from '../src/lib/liveEdit/mapping.ts';

let failures = 0;
function test(name, callback) {
  try {
    callback();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

const PROVIDER_CAPABILITIES = {
  scope: 'owned',
  canEditContent: true,
  canEditPricing: true,
  canEditImages: true,
  canEditFacilities: true,
  canEditCategories: true,
  canEditAvailability: true,
  canEditModerationAvailability: false,
  canEditVerification: false,
  canEditCinemaScreens: false,
  canChangePublicationStatus: false,
  readOnlyFields: [],
};

const PLATFORM_CAPABILITIES = {
  ...PROVIDER_CAPABILITIES,
  scope: 'platform',
  canEditModerationAvailability: true,
  canEditVerification: true,
  canEditCinemaScreens: true,
};

function pgDraft(overrides = {}) {
  return {
    title: 'Sri Sai Executive Men’s PG',
    description: 'AC PG for working professionals with three meals and fibre Wi-Fi.',
    categoryId: 'pg-professionals',
    subcategory: 'IT employee PG',
    price: '8500',
    priceUnit: '/month',
    images: ['https://images.example.com/pg-1.jpg'],
    facilities: ['Wi-Fi', 'Food included'],
    availability: { status: 'available', note: '2 beds free', nextAvailableFrom: '2026-12-01', unitsAvailable: '2' },
    details: {
      genderPolicy: 'Men Only',
      bedsAvailable: '2',
      totalCapacity: '45',
    },
    ...overrides,
  };
}

function movieDraft(overrides = {}) {
  return {
    title: 'Prasads Multiplex',
    description: '',
    categoryId: 'movies',
    subcategory: 'Screen 3',
    price: '',
    priceUnit: '/ticket',
    images: [],
    facilities: [],
    availability: { status: 'not_reported', note: '', nextAvailableFrom: '', unitsAvailable: '' },
    details: {
      format: 'IMAX 3D',
      soundSystem: 'Dolby Atmos 7.1',
      showtimes: '10:30, 14:00, 18:15',
      tierPricing: 'Gold = 350\nExecutive = 250',
      cancellationCutoffMinutes: '120',
      refundPercent: '50',
      fnbDeliveryEnabled: false,
      wheelchairSeats: 'A1, A2',
    },
    ...overrides,
  };
}

function pgRow(overrides = {}) {
  return {
    id: 'pg-301',
    owner_id: 'user-1',
    title: 'Sri Sai Executive Men’s PG',
    category_id: 'pg-professionals',
    subcategory: 'IT employee PG',
    entity_type: 'property',
    price: 8500,
    price_unit: '/month',
    status: 'active',
    provider_availability_status: 'available',
    is_verified: true,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
    provider_name: 'K. Venkat Rao',
    payload: {
      description: 'AC PG for IT professionals.',
      images: ['https://images.example.com/pg-301.jpg'],
      facilities: ['Wi-Fi', 'Food included'],
      location: { city: 'Hyderabad', area: 'Madhapur' },
      availability: { status: 'limited', note: '2 beds free', nextAvailableFrom: '2026-12-01', unitsAvailable: 2 },
      customFieldValues: { genderPolicy: 'Men Only', bedsAvailable: 2, totalCapacity: 45 },
      requestId: 'req-1',
    },
    ...overrides,
  };
}

console.log('Live Edit domain');

test('all six modules have a schema, label and identity', () => {
  assert.deepEqual([...LIVE_EDIT_MODULES], ['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies']);
  for (const module of LIVE_EDIT_MODULES) {
    assert.ok(LIVE_EDIT_MODULE_LABELS[module], `${module} label`);
    const schema = LIVE_EDIT_MODULE_SCHEMAS[module];
    assert.equal(schema.module, module);
    assert.ok(schema.detailFields.length >= 5, `${module} detail fields`);
    assert.ok(schema.categoryPrefixes.length >= 1, `${module} category prefixes`);
  }
});

test('movies is the only cinema-screen module and is explicitly blocked for catalogue copy', () => {
  const movie = LIVE_EDIT_MODULE_SCHEMAS.movies;
  assert.equal(movie.store, 'server_cinema_store');
  assert.equal(movie.supportsCinemaScreens, true);
  assert.equal(movie.supportsImages, false);
  assert.ok(movie.blockedFields.description);
  const others = LIVE_EDIT_MODULES.filter((module) => module !== 'movies');
  for (const module of others) {
    assert.equal(LIVE_EDIT_MODULE_SCHEMAS[module].store, 'supabase_listings');
    assert.equal(LIVE_EDIT_MODULE_SCHEMAS[module].supportsCinemaScreens, false);
  }
});

test('module inference is prefix-first and fails closed on ambiguous rows', () => {
  assert.equal(inferLiveEditModule({ categoryId: 'pg-luxury' }), 'pg_hostels');
  assert.equal(inferLiveEditModule({ categoryId: 'class-software' }), 'classes');
  assert.equal(inferLiveEditModule({ categoryId: 'venue-marriage' }), 'venues');
  assert.equal(inferLiveEditModule({ categoryId: 'cat-4' }), 'services');
  assert.equal(inferLiveEditModule({ categoryId: 'srv-salon' }), 'services');
  assert.equal(inferLiveEditModule({ categoryId: 'hotel-hourly' }), 'hotel_stay');
  assert.equal(inferLiveEditModule({ categoryId: 'movie-imax' }), 'movies');
  assert.equal(inferLiveEditModule({ categoryId: 'misc-1', entityType: 'property', title: 'Unknown' }), null);
  assert.equal(inferLiveEditModule({ categoryId: 'misc-1', payload: { module: 'classes' } }), 'classes');
  assert.equal(categoryMatchesModule('pg_hostels', 'pg-luxury'), true);
  assert.equal(categoryMatchesModule('pg_hostels', 'hotel-hourly'), false);
});

test('https and date guards reject unsafe values', () => {
  assert.equal(isHttpsUrl('https://images.example.com/a.jpg'), true);
  assert.equal(isHttpsUrl('http://images.example.com/a.jpg'), false);
  assert.equal(isHttpsUrl('javascript:alert(1)'), false);
  assert.equal(isHttpsUrl('https://user:pass@example.com/a.jpg'), false);
  assert.equal(isIsoDateOnly('2026-12-01'), true);
  assert.equal(isIsoDateOnly('2026-02-31'), false);
  assert.equal(isIsoDateOnly('01-12-2026'), false);
});

test('showtime and tier-pricing parsers normalise and report invalid entries', () => {
  const times = parseShowtimes('18:15, 10:30, 10:30, 25:00');
  assert.equal(times.ok, false);
  assert.deepEqual(times.times, ['18:15', '10:30']);
  assert.deepEqual(times.invalid, ['25:00']);
  assert.equal(normalizeShowtimes('18:15,10:30'), '18:15, 10:30');
  assert.deepEqual(parseShowtimes('10:30 AM, 1:45 PM, 10:30 am').times, ['10:30 AM', '01:45 PM']);
  const tiers = parseTierPricing('Gold = ₹350\nExecutive=250\nBroken line');
  assert.equal(tiers.ok, false);
  assert.deepEqual(tiers.tiers, [
    { name: 'Gold', price: 350 },
    { name: 'Executive', price: 250 },
  ]);
});

test('a valid PG draft passes and is sanitised', () => {
  const result = validateLiveEditDraft('pg_hostels', pgDraft({
    title: '  Sri Sai Executive Men’s PG  ',
    facilities: ['Wi-Fi', 'Wi-Fi', 'Food included'],
    images: [' https://images.example.com/pg-1.jpg '],
  }));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.draft.title, 'Sri Sai Executive Men’s PG');
  assert.deepEqual(result.draft.facilities, ['Wi-Fi', 'Food included']);
  assert.deepEqual(result.draft.images, ['https://images.example.com/pg-1.jpg']);
  assert.equal(result.draft.details.bedsAvailable, 2);
});

test('a PG draft can persist ready public Storage object references', () => {
  const result = validateLiveEditDraft('pg_hostels', pgDraft({
    images: ['storage://bos-public-media/887f5e06-e06d-4bee-a5a2-081f6cbd32ec/pg_hostels/provider_listing/asset/original.jpg'],
  }));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.draft.images[0].startsWith('storage://bos-public-media/'), true);
});

test('validation rejects bad title, price, category, image, facilities, availability and details', () => {
  const result = validateLiveEditDraft('pg_hostels', pgDraft({
    title: 'A',
    price: '-5',
    priceUnit: '',
    categoryId: 'hotel-hourly',
    images: ['http://insecure.example.com/a.jpg'],
    facilities: ['x'.repeat(61)],
    availability: { status: 'available', note: 'n'.repeat(301), nextAvailableFrom: '2026-02-31', unitsAvailable: '2.5' },
    details: { bedsAvailable: 'many', totalCapacity: '-1' },
  }));
  assert.equal(result.ok, false);
  for (const key of [
    'title',
    'price',
    'priceUnit',
    'categoryId',
    'images.0',
    'facilities.0',
    'availability.note',
    'availability.nextAvailableFrom',
    'availability.unitsAvailable',
    'details.bedsAvailable',
    'details.totalCapacity',
  ]) {
    assert.ok(result.errors[key], `expected an error for ${key}: ${JSON.stringify(result.errors)}`);
  }
});

test('price must be non-negative with at most two decimals', () => {
  assert.equal(validateLiveEditDraft('pg_hostels', pgDraft({ price: '0' })).ok, true);
  assert.equal(validateLiveEditDraft('pg_hostels', pgDraft({ price: '10.999' })).ok, false);
  assert.equal(validateLiveEditDraft('pg_hostels', pgDraft({ price: 'abc' })).ok, false);
  assert.equal(
    validateLiveEditDraft('pg_hostels', pgDraft({ price: '1000000001' })).errors.price,
    'Price is above the supported maximum.'
  );
});

test('movie drafts validate showtimes, tier pricing and policy numbers', () => {
  const valid = validateLiveEditDraft('movies', movieDraft());
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));
  assert.equal(valid.draft.details.showtimes, '10:30, 14:00, 18:15');
  assert.equal(valid.draft.details.tierPricing, 'Gold = 350\nExecutive = 250');

  const invalid = validateLiveEditDraft('movies', movieDraft({
    subcategory: '',
    details: {
      format: 'IMAX 3D',
      showtimes: '9am',
      tierPricing: 'Gold 350',
      refundPercent: '150',
      cancellationCutoffMinutes: '-1',
    },
  }));
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.subcategory);
  assert.ok(invalid.errors['details.showtimes']);
  assert.ok(invalid.errors['details.tierPricing']);
  assert.ok(invalid.errors['details.refundPercent']);
  assert.ok(invalid.errors['details.cancellationCutoffMinutes']);

  const emptyTiers = validateLiveEditDraft('movies', movieDraft({
    details: { ...movieDraft().details, tierPricing: '' },
  }));
  assert.equal(emptyTiers.ok, false);
  assert.ok(emptyTiers.errors['details.tierPricing'], 'an empty tier list would wipe seat prices');
});

test('listing rows are projected into module-aware Live Edit listings', () => {
  const listing = listingFromRow(pgRow());
  assert.equal(listing.module, 'pg_hostels');
  assert.equal(listing.source, 'supabase_listings');
  assert.equal(listing.title, 'Sri Sai Executive Men’s PG');
  assert.equal(listing.availability.status, 'limited');
  assert.equal(listing.availability.unitsAvailable, 2);
  assert.deepEqual(listing.facilities, ['Wi-Fi', 'Food included']);
  assert.equal(listing.details.bedsAvailable, 2);
  assert.equal(listing.ownerId, 'user-1');

  const unknown = listingFromRow({ id: 'x', category_id: 'misc', entity_type: 'property', title: 'Unknown' });
  assert.equal(unknown, null);
});

test('cinema screens are projected with showtimes, tiers and policy', () => {
  const listing = listingFromCinemaScreen({
    screenId: 'scr-1',
    cinemaListingId: 'movie-hyd-1',
    cinemaName: 'Prasads Multiplex',
    screenName: 'Screen 3',
    projectionFormat: 'IMAX 3D',
    soundFormat: 'Dolby Atmos',
    showtimes: ['10:30', '14:00'],
    cancellationCutoffMins: 120,
    refundPercent: 50,
    fnbDeliveryEnabled: true,
    wheelchairSeats: ['A1'],
    tiers: [
      { name: 'Gold', rows: ['A', 'B'], price: 350 },
      { name: 'Executive', rows: ['C'], price: 250 },
    ],
    updatedAt: '2026-10-02T00:00:00.000Z',
  });
  assert.equal(listing.module, 'movies');
  assert.equal(listing.source, 'server_cinema_store');
  assert.equal(listing.price, 250);
  assert.equal(listing.availability.status, 'available');
  assert.equal(listing.details.showtimes, '10:30, 14:00');
  assert.equal(listing.details.tierPricing, 'Gold = 350\nExecutive = 250');
  assert.equal(listing.details.refundPercent, 50);
});

test('listing update body preserves payload, never sends moderation fields for providers', () => {
  const listing = listingFromRow(pgRow());
  const draft = draftFromListing(listing);
  draft.title = 'Updated title';
  draft.price = '9000';
  draft.availability.status = 'sold_out';

  const body = buildListingUpdateInput(draft, listing, PROVIDER_CAPABILITIES);
  assert.equal(body.title, 'Updated title');
  assert.equal(body.price, 9000);
  assert.equal(body.expectedUpdatedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(body.status, undefined);
  assert.equal(body.isVerified, undefined);
  assert.equal(body.providerAvailabilityStatus, undefined);
  assert.deepEqual(body.payload.location, { city: 'Hyderabad', area: 'Madhapur' });
  assert.equal(body.payload.customFieldValues.genderPolicy, 'Men Only');
  assert.equal(body.payload.availability.status, 'sold_out');

  const adminBody = buildListingUpdateInput(draft, listing, PLATFORM_CAPABILITIES);
  assert.equal(adminBody.providerAvailabilityStatus, 'unavailable');
  assert.equal(adminBody.isVerified, undefined);

  // Clearing a supported detail writes an empty value instead of silently
  // keeping the previous payload value.
  const cleared = { ...draft, details: { ...draft.details, genderPolicy: '' } };
  const clearedBody = buildListingUpdateInput(cleared, listing, PROVIDER_CAPABILITIES);
  assert.equal(clearedBody.payload.customFieldValues.genderPolicy, '');
  // Unknown custom fields loaded from the server are preserved.
  assert.equal(clearedBody.payload.customFieldValues.totalCapacity, 45);

  const limited = { ...draft, availability: { ...draft.availability, status: 'limited' } };
  assert.equal(
    buildListingUpdateInput(limited, listing, PLATFORM_CAPABILITIES).providerAvailabilityStatus,
    'available'
  );
});

test('a movie draft has no spurious changes for unsupported sections', () => {
  const listing = listingFromCinemaScreen({
    screenId: 'scr-1',
    cinemaName: 'Prasads Multiplex',
    screenName: 'Screen 3',
    projectionFormat: 'IMAX 3D',
    showtimes: ['10:30', '14:00'],
    refundPercent: 50,
    tiers: [{ name: 'Gold', rows: ['A'], price: 350 }],
  });
  const draft = draftFromListing(listing);
  assert.equal(draft.price, '');
  assert.equal(draft.priceUnit, '');
  assert.deepEqual(draft.images, []);
  assert.equal(draft.availability.status, 'not_reported');
  const validated = validateLiveEditDraft('movies', draft);
  assert.equal(validated.ok, true, JSON.stringify(validated.errors));
  assert.deepEqual(changedFieldPaths(draft, validated.draft), []);
});

test('cinema screen update merges tier rows and normalises times', () => {
  const listing = listingFromCinemaScreen({
    screenId: 'scr-1',
    cinemaName: 'Prasads Multiplex',
    screenName: 'Screen 3',
    showtimes: ['10:30', '14:00'],
    tiers: [
      { name: 'Gold', rows: ['A', 'B'], price: 350 },
      { name: 'Executive', rows: ['C'], price: 250 },
    ],
  });
  const draft = draftFromListing(listing);
  draft.title = 'Prasads IMAX';
  draft.details.showtimes = '18:15, 10:30';
  draft.details.tierPricing = 'Gold = 400\nExecutive = 250';
  const body = buildCinemaScreenUpdateInput(draft, listing);
  assert.equal(body.cinemaName, 'Prasads IMAX');
  assert.deepEqual(body.showtimes, ['18:15', '10:30']);
  assert.deepEqual(body.tiers, [
    { name: 'Gold', rows: ['A', 'B'], price: 400 },
    { name: 'Executive', rows: ['C'], price: 250 },
  ]);
});

test('changed field paths cover content, media, availability and details', () => {
  const listing = listingFromRow(pgRow());
  const original = draftFromListing(listing);
  const next = {
    ...original,
    title: 'Renamed',
    images: [...original.images, 'https://images.example.com/pg-2.jpg'],
    availability: { ...original.availability, status: 'sold_out' },
    details: { ...original.details, genderPolicy: 'Women Only' },
  };
  const changed = changedFieldPaths(original, next);
  assert.ok(changed.includes('title'));
  assert.ok(changed.includes('images'));
  assert.ok(changed.includes('availability'));
  assert.ok(changed.includes('details.genderPolicy'));
});

console.log(failures === 0 ? '\nLive Edit domain checks passed' : `\n${failures} Live Edit domain check(s) failed`);
