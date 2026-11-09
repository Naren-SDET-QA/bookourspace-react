import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPTY_STAY_FILTERS,
  activeFilterChips,
  activeFilterCount,
  applyParams,
  clearStayFilters,
  loadPersistedFilters,
  persistFilters,
  removeFilterChip,
  stayAccessibilityKey,
  stayAmenityKey,
  stayLanguageKey,
  toSearchParams,
  validatePriceRange,
  validateStayDates,
  STAY_FILTER_STORAGE_KEY,
} from '../src/lib/stayFilters.ts';
import { istTodayIso, parseStaySearchQuery } from '../src/server/staySearchQuery.ts';

const TODAY = '2026-11-05';

test('amenity, language and accessibility keys match the SQL canonicalisation', () => {
  assert.equal(stayAmenityKey('Wi-Fi'), 'wifi');
  assert.equal(stayAmenityKey('wifi'), 'wifi');
  assert.equal(stayAmenityKey('Wireless Internet'), 'wifi');
  assert.equal(stayAmenityKey('Air conditioning'), 'airconditioning');
  assert.equal(stayAmenityKey('AC'), 'airconditioning');
  assert.equal(stayAmenityKey('Washing machine'), 'washer');
  assert.equal(stayAmenityKey('Free parking'), 'parking');
  assert.equal(stayAmenityKey('Private bathroom'), 'private_bathroom');
  assert.equal(stayAmenityKey('Some bespoke amenity'), 'somebespokeamenity');

  assert.equal(stayLanguageKey('English (IN)'), 'english');
  assert.equal(stayLanguageKey('EN'), 'english');
  assert.equal(stayLanguageKey('हिंदी'), '');
  assert.equal(stayLanguageKey('Kiswahili'), 'swahili');

  assert.equal(stayAccessibilityKey('Step-free entrance'), 'step_free_entrance');
  assert.equal(stayAccessibilityKey('Grab bars'), 'grab_bars');
  assert.equal(stayAccessibilityKey('ceiling hoist'), 'hoist');
});

test('search query parser accepts and normalises every supported filter', () => {
  const result = parseStaySearchQuery({
    destination: '  Hyderabad  ',
    checkIn: '2026-12-01',
    checkOut: '2026-12-05',
    guests: '3',
    placeTypes: 'entire_home,private_room',
    propertyTypes: 'villa,guesthouse',
    amenities: 'Wi-Fi,Kitchen',
    accessibility: 'grab_bars,step_free_entrance',
    languages: 'English,french',
    minPrice: '2000',
    maxPrice: '9000',
    priceBasis: 'total',
    bedrooms: '2',
    beds: '3',
    bathrooms: '1',
    instantBook: '1',
    selfCheckIn: 'true',
    petsAllowed: 'yes',
    guestFavourite: '1',
    luxeVerified: '1',
    includeUnavailable: '1',
    sort: 'price_asc',
    page: '2',
    pageSize: '12',
  }, TODAY);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const query = result.query;
  assert.equal(query.destination, 'Hyderabad');
  assert.equal(query.nights, 4);
  assert.equal(query.guests, 3);
  assert.deepEqual(query.placeTypes, ['entire_home', 'private_room']);
  assert.deepEqual(query.propertyTypes, ['guesthouse', 'villa']);
  assert.deepEqual(query.amenities, ['kitchen', 'wifi']);
  assert.deepEqual(query.accessibility, ['grab_bars', 'step_free_entrance']);
  assert.deepEqual(query.languages, ['english', 'french']);
  assert.equal(query.minPrice, 2000);
  assert.equal(query.maxPrice, 9000);
  assert.equal(query.priceBasis, 'total');
  assert.equal(query.bedrooms, 2);
  assert.equal(query.beds, 3);
  assert.equal(query.bathrooms, 1);
  assert.equal(query.instantBook, true);
  assert.equal(query.selfCheckIn, true);
  assert.equal(query.petsAllowed, true);
  assert.equal(query.guestFavourite, true);
  assert.equal(query.luxeVerified, true);
  assert.equal(query.includeUnavailable, true);
  assert.deepEqual(query.listingIds, []);
  assert.equal(query.sort, 'price_asc');
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 12);
});

test('unknown filter tokens are dropped instead of reaching SQL', () => {
  const result = parseStaySearchQuery({
    propertyTypes: 'villa,<script>,hotel;drop',
    placeTypes: 'entire_home,warehouse',
    accessibility: 'grab_bars,teleport',
    amenities: 'Wi--Fi,Kitchen',
    languages: 'English,!!',
  }, TODAY);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.query.propertyTypes, ['villa']);
  assert.deepEqual(result.query.placeTypes, ['entire_home']);
  assert.deepEqual(result.query.accessibility, ['grab_bars']);
  assert.deepEqual(result.query.amenities, ['kitchen', 'wifi']);
  assert.deepEqual(result.query.languages, ['english']);
});

test('listingIds hydrate wishlists without accepting hostile tokens', () => {
  const result = parseStaySearchQuery({
    listingIds: 'stay-villa-1, demo-ab-manali-tiny-19, <script>, too long '.padEnd(200, 'x'),
  }, TODAY);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.query.listingIds.includes('stay-villa-1'));
  assert.ok(result.query.listingIds.includes('demo-ab-manali-tiny-19'));
  assert.equal(result.query.listingIds.some((id) => id.includes('<')), false);
});

test('invalid dates, ranges, guests, prices, counts and paging are rejected', () => {
  const cases = [
    [{ checkIn: '2026-01-01', checkOut: '2026-01-03' }, 'CHECK_IN_IN_PAST'],
    [{ checkIn: '2026-12-05', checkOut: '2026-12-05' }, 'INVALID_DATE_ORDER'],
    [{ checkIn: '2026-12-01', checkOut: '2027-12-10' }, 'RANGE_TOO_LONG'],
    [{ checkIn: '2026-12-01' }, 'INVALID_DATES'],
    [{ guests: '0' }, 'INVALID_GUESTS'],
    [{ guests: '17' }, 'INVALID_GUESTS'],
    [{ minPrice: '9000', maxPrice: '1000' }, 'INVALID_PRICE_RANGE'],
    [{ maxPrice: '999999999' }, 'INVALID_MAX_PRICE'],
    [{ pageSize: '500' }, 'INVALID_PAGE_SIZE'],
    [{ bedrooms: '80' }, 'INVALID_ROOM_COUNT'],
    [{ page: '-1' }, 'INVALID_PAGE'],
  ];
  for (const [raw, code] of cases) {
    const result = parseStaySearchQuery(raw, TODAY);
    assert.equal(result.ok, false, `expected ${code}`);
    if (!result.ok) assert.equal(result.error, code);
  }
});

test('a default query has no filters and recommended sort', () => {
  const result = parseStaySearchQuery({}, TODAY);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.query.destination, '');
  assert.equal(result.query.checkIn, null);
  assert.equal(result.query.guests, null);
  assert.deepEqual(result.query.placeTypes, []);
  assert.equal(result.query.sort, 'recommended');
  assert.equal(result.query.page, 0);
  assert.equal(result.query.pageSize, 24);
});

test('URL round-trips filters and rejects a corrupt price range', () => {
  const filters = {
    ...EMPTY_STAY_FILTERS,
    destination: 'Goa',
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    guests: 4,
    placeTypes: ['entire_home'],
    propertyTypes: ['villa'],
    amenities: ['kitchen', 'wifi'],
    accessibility: ['grab_bars'],
    languages: ['french'],
    minPrice: '5000',
    maxPrice: '12000',
    priceBasis: 'total',
    bedrooms: 2,
    instantBook: true,
    guestFavourite: true,
    sort: 'rating',
  };
  const params = toSearchParams(filters);
  const restored = applyParams(params);
  assert.deepEqual(restored, filters);

  const corrupt = applyParams(new URLSearchParams('minPrice=9000&maxPrice=1000&amenities=Wi-Fi'));
  assert.equal(corrupt.minPrice, '');
  assert.equal(corrupt.maxPrice, '');
  assert.deepEqual(corrupt.amenities, ['wifi']);
});

test('chips describe every active filter and removal resets only that value', () => {
  const filters = {
    ...EMPTY_STAY_FILTERS,
    destination: 'Goa',
    checkIn: '2026-12-01',
    checkOut: '2026-12-04',
    placeTypes: ['entire_home'],
    propertyTypes: ['villa'],
    amenities: ['kitchen', 'wifi'],
    accessibility: ['grab_bars'],
    languages: ['french'],
    minPrice: '5000',
    maxPrice: '12000',
    bedrooms: 2,
    bathrooms: 1,
    instantBook: true,
    guestFavourite: true,
  };
  const chips = activeFilterChips(filters);
  const ids = chips.map((chip) => chip.id);
  assert.ok(ids.includes('destination'));
  assert.ok(ids.includes('dates'));
  assert.ok(ids.includes('place:entire_home'));
  assert.ok(ids.includes('property:villa'));
  assert.ok(ids.includes('amenity:wifi'));
  assert.ok(ids.includes('access:grab_bars'));
  assert.ok(ids.includes('language:french'));
  assert.ok(ids.includes('price'));
  assert.ok(ids.includes('rooms'));
  assert.ok(ids.includes('instantBook'));
  assert.ok(ids.includes('guestFavourite'));

  const withoutWifi = removeFilterChip(filters, { id: 'amenity:wifi', group: 'amenity', label: 'Wi-Fi' });
  assert.deepEqual(withoutWifi.amenities, ['kitchen']);
  assert.equal(withoutWifi.destination, 'Goa');

  const withoutDates = removeFilterChip(filters, { id: 'dates', group: 'dates', label: 'dates' });
  assert.equal(withoutDates.checkIn, '');
  assert.equal(withoutDates.checkOut, '');

  const withoutRooms = removeFilterChip(filters, { id: 'rooms', group: 'rooms', label: 'rooms' });
  assert.equal(withoutRooms.bedrooms, 0);
  assert.equal(withoutRooms.bathrooms, 0);

  assert.equal(activeFilterCount(filters), 12);
  assert.equal(activeFilterCount(EMPTY_STAY_FILTERS), 0);
});

test('clear filters keeps only an explicit search context', () => {
  const cleared = clearStayFilters({ destination: 'Goa', checkIn: '2026-12-01', checkOut: '2026-12-03', guests: 3 });
  assert.equal(cleared.destination, 'Goa');
  assert.equal(cleared.guests, 3);
  assert.deepEqual(cleared.amenities, []);
  assert.deepEqual(cleared.propertyTypes, []);
  assert.equal(cleared.instantBook, false);
  assert.equal(cleared.sort, 'recommended');
  assert.deepEqual(clearStayFilters(), EMPTY_STAY_FILTERS);
});

test('persistence stores only serialisable filters and survives corrupt storage', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value); },
  };
  const filters = { ...EMPTY_STAY_FILTERS, destination: 'Coorg', amenities: ['wifi'], petsAllowed: true };
  persistFilters(storage, filters);
  assert.ok(store.get(STAY_FILTER_STORAGE_KEY).includes('destination=Coorg'));
  assert.deepEqual(loadPersistedFilters(storage), filters);

  store.set(STAY_FILTER_STORAGE_KEY, 'destination=%E0%A4%B9&minPrice=9000&maxPrice=1');
  const recovered = loadPersistedFilters(storage);
  assert.equal(recovered.minPrice, '');
  assert.equal(recovered.maxPrice, '');
  assert.equal(loadPersistedFilters(null).destination, '');
});

test('date and price validation messages are actionable', () => {
  assert.equal(validateStayDates({ checkIn: '', checkOut: '' }, TODAY), '');
  assert.match(validateStayDates({ checkIn: '2020-01-01', checkOut: '2020-01-03' }, TODAY), /before today/);
  assert.match(validateStayDates({ checkIn: '2026-12-05', checkOut: '2026-12-05' }, TODAY), /after check-in/);
  assert.match(validateStayDates({ checkIn: '2026-12-01', checkOut: '' }, TODAY), /both/);
  assert.match(validatePriceRange({ minPrice: '9000', maxPrice: '1000' }), /cannot exceed/);
  assert.equal(validatePriceRange({ minPrice: '', maxPrice: '' }), '');
});

test('the server resolves today in Asia/Kolkata, not the host timezone', () => {
  const value = istTodayIso(new Date('2026-11-05T19:30:00+05:30'));
  assert.equal(value, '2026-11-05');
  const afterMidnightUtc = istTodayIso(new Date('2026-11-05T19:30:00Z'));
  assert.equal(afterMidnightUtc, '2026-11-06');
});
