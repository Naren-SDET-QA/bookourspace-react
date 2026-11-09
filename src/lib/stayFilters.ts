/**
 * Canonical Stay filter model shared by the browser, the Express API and the
 * unit tests.
 *
 * The same keys are produced by `public.stay_amenity_key`,
 * `public.stay_language_key` and `public.stay_accessibility_key` in
 * migration 20261105170000, so a chip in the UI maps to a real indexed column
 * value rather than to a decorative string.
 */

export type StayPlaceType = 'entire_home' | 'private_room' | 'shared_room';
export type StayPriceBasis = 'nightly' | 'total';
export type StaySort = 'recommended' | 'price_asc' | 'price_desc' | 'rating';

export interface StayFilters {
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  placeTypes: StayPlaceType[];
  propertyTypes: string[];
  minPrice: string;
  maxPrice: string;
  priceBasis: StayPriceBasis;
  sort: StaySort;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  amenities: string[];
  accessibility: string[];
  languages: string[];
  instantBook: boolean;
  selfCheckIn: boolean;
  petsAllowed: boolean;
  guestFavourite: boolean;
  luxeVerified: boolean;
  includeUnavailable: boolean;
}

export const EMPTY_STAY_FILTERS: StayFilters = {
  destination: '',
  checkIn: '',
  checkOut: '',
  guests: 2,
  placeTypes: [],
  propertyTypes: [],
  minPrice: '',
  maxPrice: '',
  priceBasis: 'nightly',
  sort: 'recommended',
  bedrooms: 0,
  beds: 0,
  bathrooms: 0,
  amenities: [],
  accessibility: [],
  languages: [],
  instantBook: false,
  selfCheckIn: false,
  petsAllowed: false,
  guestFavourite: false,
  luxeVerified: false,
  includeUnavailable: false,
};

/* ------------------------------- vocabularies ------------------------------ */

export const PLACE_TYPE_OPTIONS: Array<{ id: StayPlaceType; label: string; description: string }> = [
  { id: 'entire_home', label: 'Entire home', description: 'You’ll have the whole place to yourself.' },
  { id: 'private_room', label: 'Room', description: 'Your own room, with shared common areas.' },
  { id: 'shared_room', label: 'Shared room', description: 'A room shared with other guests.' },
];

export const PROPERTY_TYPE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'house', label: 'House' },
  { id: 'flat', label: 'Flat' },
  { id: 'guest_house', label: 'Guest house' },
  { id: 'villa', label: 'Villa' },
  { id: 'apartment', label: 'Apartment' },
  { id: 'resort', label: 'Resort' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'lodge', label: 'Lodge' },
  { id: 'homestay', label: 'Homestay' },
  { id: 'temple_stay', label: 'Temple stay' },
];

/** "Recommended" amenities required by the product brief. */
export const RECOMMENDED_AMENITIES = ['kitchen', 'wifi', 'parking', 'pets', 'airconditioning', 'washer', 'private_bathroom'] as const;

export const AMENITY_OPTIONS: Array<{ id: string; label: string; group: 'recommended' | 'standard' | 'safety' }> = [
  { id: 'kitchen', label: 'Kitchen', group: 'recommended' },
  { id: 'wifi', label: 'Wi-Fi', group: 'recommended' },
  { id: 'parking', label: 'Free parking', group: 'recommended' },
  { id: 'pets', label: 'Pets allowed', group: 'recommended' },
  { id: 'airconditioning', label: 'Air conditioning', group: 'recommended' },
  { id: 'washer', label: 'Washing machine', group: 'recommended' },
  { id: 'private_bathroom', label: 'Private bathroom', group: 'recommended' },
  { id: 'dryer', label: 'Dryer', group: 'standard' },
  { id: 'heating', label: 'Heating', group: 'standard' },
  { id: 'hotwater', label: 'Hot water', group: 'standard' },
  { id: 'tv', label: 'TV', group: 'standard' },
  { id: 'pool', label: 'Pool', group: 'standard' },
  { id: 'gym', label: 'Gym', group: 'standard' },
  { id: 'breakfast', label: 'Breakfast', group: 'standard' },
  { id: 'housekeeping', label: 'Housekeeping', group: 'standard' },
  { id: 'balcony', label: 'Balcony', group: 'standard' },
  { id: 'garden', label: 'Garden', group: 'standard' },
  { id: 'beachaccess', label: 'Beach access', group: 'standard' },
  { id: 'fireplace', label: 'Fireplace', group: 'standard' },
  { id: 'elevator', label: 'Lift', group: 'standard' },
  { id: 'powerbackup', label: 'Power backup', group: 'standard' },
  { id: 'firstaid', label: 'First aid kit', group: 'safety' },
  { id: 'smokedetector', label: 'Smoke alarm', group: 'safety' },
  { id: 'securitycamera', label: 'Security camera', group: 'safety' },
];

export const ACCESSIBILITY_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'step_free_entrance', label: 'Step-free entrance' },
  { id: 'accessible_parking', label: 'Accessible parking' },
  { id: 'wide_entrance', label: 'Wider entrances' },
  { id: 'accessible_bedroom', label: 'Step-free bedroom access' },
  { id: 'accessible_bathroom', label: 'Step-free bathroom access' },
  { id: 'grab_bars', label: 'Grab bars' },
  { id: 'shower_chair', label: 'Shower chair' },
  { id: 'hoist', label: 'Hoist' },
  { id: 'elevator', label: 'Elevator' },
];

export const LANGUAGE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'english', label: 'English' },
  { id: 'hindi', label: 'Hindi' },
  { id: 'telugu', label: 'Telugu' },
  { id: 'tamil', label: 'Tamil' },
  { id: 'kannada', label: 'Kannada' },
  { id: 'malayalam', label: 'Malayalam' },
  { id: 'marathi', label: 'Marathi' },
  { id: 'bengali', label: 'Bengali' },
  { id: 'gujarati', label: 'Gujarati' },
  { id: 'punjabi', label: 'Punjabi' },
  { id: 'urdu', label: 'Urdu' },
  { id: 'french', label: 'French' },
  { id: 'swahili', label: 'Swahili' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'german', label: 'German' },
  { id: 'arabic', label: 'Arabic' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'chinese', label: 'Chinese' },
];

/* ------------------------------ canonical keys ----------------------------- */

const AMENITY_SYNONYMS: Record<string, string> = {
  wifi: 'wifi',
  wirelessinternet: 'wifi',
  internet: 'wifi',
  highspeedinternet: 'wifi',
  broadband: 'wifi',
  ac: 'airconditioning',
  airconditioning: 'airconditioning',
  airconditioner: 'airconditioning',
  aircon: 'airconditioning',
  centralac: 'airconditioning',
  splitac: 'airconditioning',
  washer: 'washer',
  washingmachine: 'washer',
  laundry: 'washer',
  washerdryer: 'washer',
  dryer: 'dryer',
  clothesdryer: 'dryer',
  tumbledryer: 'dryer',
  parking: 'parking',
  freeparking: 'parking',
  parkingonpremises: 'parking',
  carport: 'parking',
  coveredparking: 'parking',
  privateparking: 'parking',
  parkingfree: 'parking',
  streetparking: 'parking',
  kitchen: 'kitchen',
  kitchenette: 'kitchen',
  cookingbasics: 'kitchen',
  fullkitchen: 'kitchen',
  sharedkitchen: 'kitchen',
  pool: 'pool',
  swimmingpool: 'pool',
  privatepool: 'pool',
  infinitypool: 'pool',
  poolaccess: 'pool',
  tv: 'tv',
  television: 'tv',
  smarttv: 'tv',
  cabletv: 'tv',
  hdtv: 'tv',
  heating: 'heating',
  heater: 'heating',
  roomheater: 'heating',
  centralheating: 'heating',
  pets: 'pets',
  petsallowed: 'pets',
  petfriendly: 'pets',
  petswelcome: 'pets',
  selfcheckin: 'selfcheckin',
  selfcheckinlockbox: 'selfcheckin',
  keypad: 'selfcheckin',
  smartlock: 'selfcheckin',
  lockbox: 'selfcheckin',
  gym: 'gym',
  fitnesscenter: 'gym',
  fitness: 'gym',
  exerciseequipment: 'gym',
  breakfast: 'breakfast',
  freebreakfast: 'breakfast',
  breakfastincluded: 'breakfast',
  continentalbreakfast: 'breakfast',
  housekeeping: 'housekeeping',
  dailyhousekeeping: 'housekeeping',
  cleaning: 'housekeeping',
  beachaccess: 'beachaccess',
  beach: 'beachaccess',
  beachfront: 'beachaccess',
  garden: 'garden',
  lawn: 'garden',
  backyard: 'garden',
  privategarden: 'garden',
  balcony: 'balcony',
  patio: 'balcony',
  deck: 'balcony',
  terrace: 'balcony',
  rooftop: 'balcony',
  fireplace: 'fireplace',
  woodstove: 'fireplace',
  bonfire: 'fireplace',
  firstaid: 'firstaid',
  firstaidkit: 'firstaid',
  smokedetector: 'smokedetector',
  smokealarm: 'smokedetector',
  cctv: 'securitycamera',
  securitycamera: 'securitycamera',
  cctvsecurity: 'securitycamera',
  elevator: 'elevator',
  lift: 'elevator',
  powerbackup: 'powerbackup',
  generator: 'powerbackup',
  backuppower: 'powerbackup',
  inverter: 'powerbackup',
  hotwater: 'hotwater',
  geyser: 'hotwater',
  waterheater: 'hotwater',
  privatebathroom: 'private_bathroom',
  ensuite: 'private_bathroom',
  attachedbathroom: 'private_bathroom',
};

const LANGUAGE_SYNONYMS: Record<string, string> = {
  en: 'english',
  english: 'english',
  englishin: 'english',
  englishindia: 'english',
  hi: 'hindi',
  hindi: 'hindi',
  fr: 'french',
  french: 'french',
  francais: 'french',
  kn: 'kannada',
  kannada: 'kannada',
  sw: 'swahili',
  swahili: 'swahili',
  kiswahili: 'swahili',
  ta: 'tamil',
  tamil: 'tamil',
  te: 'telugu',
  telugu: 'telugu',
  mr: 'marathi',
  marathi: 'marathi',
  bn: 'bengali',
  bengali: 'bengali',
  gu: 'gujarati',
  gujarati: 'gujarati',
  ml: 'malayalam',
  malayalam: 'malayalam',
  pa: 'punjabi',
  punjabi: 'punjabi',
  ur: 'urdu',
  urdu: 'urdu',
  es: 'spanish',
  spanish: 'spanish',
  espanol: 'spanish',
  de: 'german',
  german: 'german',
  deustch: 'german',
  ar: 'arabic',
  arabic: 'arabic',
  ja: 'japanese',
  japanese: 'japanese',
  zh: 'chinese',
  chinese: 'chinese',
  mandarin: 'chinese',
};

const ACCESSIBILITY_SYNONYMS: Record<string, string> = {
  stepfreeaccess: 'step_free_entrance',
  stepfree: 'step_free_entrance',
  stepfreeentrance: 'step_free_entrance',
  nosteps: 'step_free_entrance',
  accessibleparking: 'accessible_parking',
  accessibleparkingspace: 'accessible_parking',
  disabledparking: 'accessible_parking',
  wideentrance: 'wide_entrance',
  widerentrance: 'wide_entrance',
  wideentrances: 'wide_entrance',
  wideentry: 'wide_entrance',
  accessiblebedroom: 'accessible_bedroom',
  bedroomaccess: 'accessible_bedroom',
  stepfreebedroom: 'accessible_bedroom',
  accessiblebathroom: 'accessible_bathroom',
  bathroomaccess: 'accessible_bathroom',
  stepfreebathroom: 'accessible_bathroom',
  grabrails: 'grab_bars',
  grabbars: 'grab_bars',
  grabrail: 'grab_bars',
  showerchair: 'shower_chair',
  showerchairs: 'shower_chair',
  hoist: 'hoist',
  ceilinghoist: 'hoist',
  hoists: 'hoist',
  elevator: 'elevator',
  lift: 'elevator',
  accessibleelevator: 'elevator',
};

function normaliseToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function stayAmenityKey(value: string): string {
  const key = normaliseToken(value);
  if (!key) return '';
  return AMENITY_SYNONYMS[key] ?? key;
}

export function stayLanguageKey(value: string): string {
  const key = normaliseToken(value);
  if (!key) return '';
  return LANGUAGE_SYNONYMS[key] ?? key;
}

export function stayAccessibilityKey(value: string): string {
  const key = normaliseToken(value);
  if (!key) return '';
  return ACCESSIBILITY_SYNONYMS[key] ?? key;
}

/** Room amenities such as "Wi-Fi" from the SQL array match the same chip. */
export function amenityLabel(key: string): string {
  return AMENITY_OPTIONS.find((option) => option.id === key)?.label
    ?? key.replace(/_/g, ' ').replace(/^\w/, (character) => character.toUpperCase());
}

export function propertyTypeLabel(key: string): string {
  return PROPERTY_TYPE_OPTIONS.find((option) => option.id === key)?.label
    ?? key.replace(/_/g, ' ').replace(/^\w/, (character) => character.toUpperCase());
}

export function languageLabel(key: string): string {
  return LANGUAGE_OPTIONS.find((option) => option.id === key)?.label
    ?? key.replace(/^\w/, (character) => character.toUpperCase());
}

export function accessibilityLabel(key: string): string {
  return ACCESSIBILITY_OPTIONS.find((option) => option.id === key)?.label ?? key.replace(/_/g, ' ');
}

/* -------------------------------- validation ------------------------------- */

export function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86_400_000);
}

export function validateStayDates(filters: Pick<StayFilters, 'checkIn' | 'checkOut'>, today: string): string {
  if (!filters.checkIn && !filters.checkOut) return '';
  if (!filters.checkIn || !filters.checkOut) return 'Choose both a check-in and a check-out date.';
  if (filters.checkIn < today) return 'Check-in cannot be before today.';
  if (filters.checkOut <= filters.checkIn) return 'Check-out must be after check-in.';
  if (nightsBetween(filters.checkIn, filters.checkOut) > 365) return 'Stays can be searched for up to 365 nights.';
  return '';
}

export function validatePriceRange(filters: Pick<StayFilters, 'minPrice' | 'maxPrice'>): string {
  const min = filters.minPrice.trim() === '' ? null : Number(filters.minPrice);
  const max = filters.maxPrice.trim() === '' ? null : Number(filters.maxPrice);
  if (min !== null && (!Number.isSafeInteger(min) || min < 0)) return 'Enter a whole, non-negative minimum price.';
  if (max !== null && (!Number.isSafeInteger(max) || max < 0)) return 'Enter a whole, non-negative maximum price.';
  if (min !== null && max !== null && min > max) return 'The minimum price cannot exceed the maximum price.';
  return '';
}

/* ------------------------------- persistence ------------------------------- */

export const STAY_FILTER_STORAGE_KEY = 'bos_stay_filters_v1';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function list(value: string | null): string[] {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

export function applyParams(params: URLSearchParams, base: StayFilters = EMPTY_STAY_FILTERS): StayFilters {
  const next: StayFilters = { ...base, placeTypes: [], propertyTypes: [], amenities: [], accessibility: [], languages: [] };
  if (params.has('destination')) next.destination = String(params.get('destination') || '').slice(0, 120);
  const checkIn = String(params.get('checkIn') || '');
  const checkOut = String(params.get('checkOut') || '');
  if (DATE.test(checkIn)) next.checkIn = checkIn;
  if (DATE.test(checkOut)) next.checkOut = checkOut;
  if (checkIn && checkOut && checkOut <= checkIn) next.checkOut = '';
  const guests = Number(params.get('guests'));
  if (Number.isInteger(guests) && guests >= 1 && guests <= 16) next.guests = guests;
  next.placeTypes = list(params.get('placeTypes')).filter((value): value is StayPlaceType =>
    PLACE_TYPE_OPTIONS.some((option) => option.id === value)
  );
  next.propertyTypes = list(params.get('propertyTypes')).filter((value) =>
    PROPERTY_TYPE_OPTIONS.some((option) => option.id === value)
  );
  next.amenities = [...new Set(list(params.get('amenities')).map(stayAmenityKey).filter(Boolean))];
  next.accessibility = [...new Set(list(params.get('accessibility')).map(stayAccessibilityKey).filter(Boolean))];
  next.languages = [...new Set(list(params.get('languages')).map(stayLanguageKey).filter(Boolean))];
  next.minPrice = /^\d{0,9}$/.test(String(params.get('minPrice') || '')) ? String(params.get('minPrice') || '') : '';
  next.maxPrice = /^\d{0,9}$/.test(String(params.get('maxPrice') || '')) ? String(params.get('maxPrice') || '') : '';
  next.priceBasis = params.get('priceBasis') === 'total' ? 'total' : 'nightly';
  const sortValue = String(params.get('sort') || '');
  next.sort = sortValue === 'price_asc' || sortValue === 'price_desc' || sortValue === 'rating' ? sortValue : 'recommended';
  next.bedrooms = clampInt(params.get('bedrooms'), 0, 20);
  next.beds = clampInt(params.get('beds'), 0, 20);
  next.bathrooms = clampInt(params.get('bathrooms'), 0, 20);
  next.instantBook = params.get('instantBook') === '1';
  next.selfCheckIn = params.get('selfCheckIn') === '1';
  next.petsAllowed = params.get('petsAllowed') === '1';
  next.guestFavourite = params.get('guestFavourite') === '1';
  next.luxeVerified = params.get('luxeVerified') === '1';
  next.includeUnavailable = params.get('includeUnavailable') === '1';
  const validation = validatePriceRange(next);
  if (validation) {
    // A corrupted range is dropped rather than poisoning the whole state.
    next.minPrice = '';
    next.maxPrice = '';
  }
  return next;
}

function clampInt(value: string | null, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 0;
  return Math.min(max, Math.max(min, parsed));
}

/** Only non-default values are written, so the URL stays readable. */
export function toSearchParams(filters: StayFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.destination.trim()) params.set('destination', filters.destination.trim());
  if (filters.checkIn) params.set('checkIn', filters.checkIn);
  if (filters.checkOut) params.set('checkOut', filters.checkOut);
  if (filters.guests !== 2) params.set('guests', String(filters.guests));
  if (filters.placeTypes.length) params.set('placeTypes', filters.placeTypes.join(','));
  if (filters.propertyTypes.length) params.set('propertyTypes', filters.propertyTypes.join(','));
  if (filters.amenities.length) params.set('amenities', filters.amenities.join(','));
  if (filters.accessibility.length) params.set('accessibility', filters.accessibility.join(','));
  if (filters.languages.length) params.set('languages', filters.languages.join(','));
  if (filters.minPrice.trim()) params.set('minPrice', filters.minPrice.trim());
  if (filters.maxPrice.trim()) params.set('maxPrice', filters.maxPrice.trim());
  if (filters.priceBasis === 'total') params.set('priceBasis', 'total');
  if (filters.sort !== 'recommended') params.set('sort', filters.sort);
  if (filters.bedrooms) params.set('bedrooms', String(filters.bedrooms));
  if (filters.beds) params.set('beds', String(filters.beds));
  if (filters.bathrooms) params.set('bathrooms', String(filters.bathrooms));
  if (filters.instantBook) params.set('instantBook', '1');
  if (filters.selfCheckIn) params.set('selfCheckIn', '1');
  if (filters.petsAllowed) params.set('petsAllowed', '1');
  if (filters.guestFavourite) params.set('guestFavourite', '1');
  if (filters.luxeVerified) params.set('luxeVerified', '1');
  if (filters.includeUnavailable) params.set('includeUnavailable', '1');
  return params;
}

export function toApiQuery(filters: StayFilters): URLSearchParams {
  const params = toSearchParams(filters);
  if (filters.luxeVerified) params.set('luxeVerified', '1');
  return params;
}

export function loadPersistedFilters(storage?: Pick<Storage, 'getItem'> | null): StayFilters {
  try {
    const raw = storage?.getItem(STAY_FILTER_STORAGE_KEY);
    if (!raw) return { ...EMPTY_STAY_FILTERS };
    return applyParams(new URLSearchParams(raw));
  } catch {
    return { ...EMPTY_STAY_FILTERS };
  }
}

export function persistFilters(storage: Pick<Storage, 'setItem'> | null | undefined, filters: StayFilters): void {
  if (!storage) return;
  try {
    storage.setItem(STAY_FILTER_STORAGE_KEY, toSearchParams(filters).toString());
  } catch {
    /* private mode / quota — persistence is a convenience, never authority */
  }
}

/* ---------------------------------- chips --------------------------------- */

export type FilterGroup =
  | 'where'
  | 'dates'
  | 'guests'
  | 'placeType'
  | 'propertyType'
  | 'price'
  | 'rooms'
  | 'amenity'
  | 'accessibility'
  | 'language'
  | 'booking'
  | 'standout';

export interface FilterChip {
  id: string;
  group: FilterGroup;
  label: string;
}

export function activeFilterChips(filters: StayFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.destination.trim()) chips.push({ id: 'destination', group: 'where', label: filters.destination.trim() });
  if (filters.checkIn && filters.checkOut) {
    chips.push({ id: 'dates', group: 'dates', label: `${filters.checkIn} → ${filters.checkOut}` });
  }
  if (filters.guests !== 2) chips.push({ id: 'guests', group: 'guests', label: `${filters.guests} guests` });
  for (const place of filters.placeTypes) {
    chips.push({ id: `place:${place}`, group: 'placeType', label: PLACE_TYPE_OPTIONS.find((option) => option.id === place)?.label || place });
  }
  for (const property of filters.propertyTypes) {
    chips.push({ id: `property:${property}`, group: 'propertyType', label: propertyTypeLabel(property) });
  }
  if (filters.minPrice.trim() || filters.maxPrice.trim()) {
    const range = [filters.minPrice.trim() && `₹${filters.minPrice.trim()}`, filters.maxPrice.trim() && `₹${filters.maxPrice.trim()}`]
      .filter(Boolean)
      .join(' – ');
    chips.push({ id: 'price', group: 'price', label: `${range}${filters.priceBasis === 'total' ? ' total' : ' / night'}` });
  }
  const rooms = [
    filters.bedrooms ? `${filters.bedrooms}+ bedrooms` : '',
    filters.beds ? `${filters.beds}+ beds` : '',
    filters.bathrooms ? `${filters.bathrooms}+ bathrooms` : '',
  ].filter(Boolean);
  if (rooms.length) chips.push({ id: 'rooms', group: 'rooms', label: rooms.join(', ') });
  for (const amenity of filters.amenities) {
    chips.push({ id: `amenity:${amenity}`, group: 'amenity', label: amenityLabel(amenity) });
  }
  for (const key of filters.accessibility) {
    chips.push({ id: `access:${key}`, group: 'accessibility', label: accessibilityLabel(key) });
  }
  for (const key of filters.languages) {
    chips.push({ id: `language:${key}`, group: 'language', label: languageLabel(key) });
  }
  if (filters.instantBook) chips.push({ id: 'instantBook', group: 'booking', label: 'Instant Book' });
  if (filters.selfCheckIn) chips.push({ id: 'selfCheckIn', group: 'booking', label: 'Self check-in' });
  if (filters.petsAllowed) chips.push({ id: 'petsAllowed', group: 'booking', label: 'Pets allowed' });
  if (filters.guestFavourite) chips.push({ id: 'guestFavourite', group: 'standout', label: 'Guest favourite' });
  if (filters.luxeVerified) chips.push({ id: 'luxeVerified', group: 'standout', label: 'Luxe' });
  if (filters.includeUnavailable) chips.push({ id: 'includeUnavailable', group: 'dates', label: 'Including unavailable' });
  return chips;
}

export function removeFilterChip(filters: StayFilters, chip: FilterChip): StayFilters {
  const next: StayFilters = { ...filters, placeTypes: [...filters.placeTypes], propertyTypes: [...filters.propertyTypes], amenities: [...filters.amenities], accessibility: [...filters.accessibility], languages: [...filters.languages] };
  if (chip.group === 'where') next.destination = '';
  if (chip.group === 'dates' && chip.id === 'dates') {
    next.checkIn = '';
    next.checkOut = '';
  }
  if (chip.group === 'guests') next.guests = 2;
  if (chip.group === 'placeType') {
    const value = chip.id.slice('place:'.length);
    next.placeTypes = next.placeTypes.filter((item) => item !== value);
  }
  if (chip.group === 'propertyType') {
    const value = chip.id.slice('property:'.length);
    next.propertyTypes = next.propertyTypes.filter((item) => item !== value);
  }
  if (chip.group === 'price') {
    next.minPrice = '';
    next.maxPrice = '';
  }
  if (chip.group === 'rooms') {
    next.bedrooms = 0;
    next.beds = 0;
    next.bathrooms = 0;
  }
  if (chip.group === 'amenity') {
    const value = chip.id.slice('amenity:'.length);
    next.amenities = next.amenities.filter((item) => item !== value);
  }
  if (chip.group === 'accessibility') {
    const value = chip.id.slice('access:'.length);
    next.accessibility = next.accessibility.filter((item) => item !== value);
  }
  if (chip.group === 'language') {
    const value = chip.id.slice('language:'.length);
    next.languages = next.languages.filter((item) => item !== value);
  }
  if (chip.id === 'instantBook') next.instantBook = false;
  if (chip.id === 'selfCheckIn') next.selfCheckIn = false;
  if (chip.id === 'petsAllowed') next.petsAllowed = false;
  if (chip.id === 'guestFavourite') next.guestFavourite = false;
  if (chip.id === 'luxeVerified') next.luxeVerified = false;
  if (chip.id === 'includeUnavailable') next.includeUnavailable = false;
  return next;
}

/** Grouped count, matching the "Filters (n)" badge rather than a chip count. */
export function activeFilterCount(filters: StayFilters): number {
  let count = 0;
  if (filters.destination.trim()) count += 1;
  if (filters.checkIn && filters.checkOut) count += 1;
  if (filters.guests !== 2) count += 1;
  if (filters.placeTypes.length) count += 1;
  if (filters.propertyTypes.length) count += 1;
  if (filters.minPrice.trim() || filters.maxPrice.trim()) count += 1;
  if (filters.bedrooms || filters.beds || filters.bathrooms) count += 1;
  count += filters.amenities.length;
  count += filters.accessibility.length;
  count += filters.languages.length;
  if (filters.instantBook) count += 1;
  if (filters.selfCheckIn) count += 1;
  if (filters.petsAllowed) count += 1;
  if (filters.guestFavourite) count += 1;
  if (filters.luxeVerified) count += 1;
  if (filters.includeUnavailable) count += 1;
  return count;
}

export function clearStayFilters(keep: Pick<StayFilters, 'destination' | 'checkIn' | 'checkOut' | 'guests'> | null = null): StayFilters {
  return {
    ...EMPTY_STAY_FILTERS,
    destination: keep?.destination ?? '',
    checkIn: keep?.checkIn ?? '',
    checkOut: keep?.checkOut ?? '',
    guests: keep?.guests ?? 2,
  };
}
