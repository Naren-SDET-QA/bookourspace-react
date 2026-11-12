import type { LiveEditFieldDefinition, LiveEditModule, LiveEditModuleSchema } from './types';

const PG_DETAIL_FIELDS: LiveEditFieldDefinition[] = [
  { key: 'genderPolicy', label: 'Gender policy', kind: 'text', maxLength: 120, placeholder: 'Men Only (working professionals)' },
  { key: 'roomTypesAvailable', label: 'Room / sharing types', kind: 'text', maxLength: 160, placeholder: 'Single AC, 2-sharing, 3-sharing' },
  { key: 'foodIncluded', label: 'Food / mess plan', kind: 'text', maxLength: 160, placeholder: '3 meals included' },
  { key: 'securityDeposit', label: 'Security deposit', kind: 'text', maxLength: 80, placeholder: '₹2,000 refundable' },
  { key: 'noticePeriod', label: 'Notice period', kind: 'text', maxLength: 80, placeholder: '15 days' },
  { key: 'gateClosingTime', label: 'Gate closing time', kind: 'text', maxLength: 80, placeholder: '11:30 PM' },
  { key: 'wifiSpeed', label: 'Wi-Fi', kind: 'text', maxLength: 80, placeholder: '200 Mbps fibre' },
  { key: 'housekeeping', label: 'Housekeeping', kind: 'text', maxLength: 120, placeholder: 'Daily room cleaning' },
  { key: 'attachedWashroom', label: 'Attached washroom', kind: 'text', maxLength: 120, placeholder: 'Geyser + attached bath' },
  { key: 'bedsAvailable', label: 'Beds available', kind: 'number', min: 0, max: 100000 },
  { key: 'totalCapacity', label: 'Total capacity', kind: 'number', min: 0, max: 100000 },
];

const CLASS_DETAIL_FIELDS: LiveEditFieldDefinition[] = [
  {
    key: 'modeLabel',
    label: 'Learning mode',
    kind: 'select',
    options: ['Offline (Classroom)', 'Live Online', 'Hybrid (Classroom + Online)', 'Recorded / Self-paced'],
  },
  { key: 'courseDuration', label: 'Course duration', kind: 'text', maxLength: 120, placeholder: '3 to 6 months' },
  { key: 'batchCapacity', label: 'Batch capacity', kind: 'number', min: 0, max: 100000 },
  { key: 'seatsRemaining', label: 'Seats remaining', kind: 'number', min: 0, max: 100000 },
  { key: 'timingHighlight', label: 'Batch timings', kind: 'text', maxLength: 160, placeholder: '7 AM, 9 AM, 7 PM' },
  { key: 'startDate', label: 'Next batch start', kind: 'text', maxLength: 80, placeholder: 'New batches every Monday' },
  { key: 'facultyTitle', label: 'Faculty', kind: 'text', maxLength: 200, placeholder: 'Certified trainers' },
  { key: 'ageGroup', label: 'Eligibility / age group', kind: 'text', maxLength: 120, placeholder: 'Graduates and career switchers' },
  { key: 'certification', label: 'Certification', kind: 'text', maxLength: 120, placeholder: 'Placement track certificate' },
  { key: 'runningBatchUrl', label: 'Batch schedule URL', kind: 'url', maxLength: 500, placeholder: 'https://' },
];

const VENUE_DETAIL_FIELDS: LiveEditFieldDefinition[] = [
  { key: 'capacity', label: 'Guest capacity', kind: 'number', min: 0, max: 1000000 },
  { key: 'venueType', label: 'Venue type', kind: 'text', maxLength: 120, placeholder: 'Indoor central AC hall' },
  { key: 'acType', label: 'Air conditioning', kind: 'text', maxLength: 120, placeholder: 'Central AC' },
  { key: 'parkingCapacity', label: 'Parking', kind: 'text', maxLength: 160, placeholder: '250 cars with valet' },
  { key: 'cateringPolicy', label: 'Catering policy', kind: 'text', maxLength: 200, placeholder: 'In-house and outside catering allowed' },
  { key: 'decorationPolicy', label: 'Decoration policy', kind: 'text', maxLength: 200, placeholder: 'Outside decorators allowed' },
  { key: 'operatingHours', label: 'Operating hours', kind: 'text', maxLength: 160, placeholder: '6 AM to 6 AM next day' },
  { key: 'cancellationPolicy', label: 'Cancellation policy', kind: 'text', maxLength: 200, placeholder: '100% refund 15 days before' },
  { key: 'soundLight', label: 'Sound & lighting', kind: 'text', maxLength: 200, placeholder: 'JBL line array + stage lights' },
];

const SERVICE_DETAIL_FIELDS: LiveEditFieldDefinition[] = [
  { key: 'serviceWarranty', label: 'Service warranty', kind: 'text', maxLength: 120, placeholder: '60 days parts + labour' },
  { key: 'brandExpertise', label: 'Brands / expertise', kind: 'text', maxLength: 200, placeholder: 'Daikin, LG, Samsung, Voltas' },
  { key: 'visitCharge', label: 'Visit / inspection charge (₹)', kind: 'number', min: 0, max: 1000000 },
  { key: 'serviceArea', label: 'Service area', kind: 'text', maxLength: 200, placeholder: 'Madhapur, Gachibowli, Kondapur' },
  { key: 'responseTime', label: 'Response time', kind: 'text', maxLength: 120, placeholder: 'Within 60 minutes' },
];

const HOTEL_DETAIL_FIELDS: LiveEditFieldDefinition[] = [
  { key: 'roomCategories', label: 'Room categories', kind: 'text', maxLength: 200, placeholder: 'Deluxe AC, Executive Suite' },
  { key: 'checkInTime', label: 'Check-in time', kind: 'text', maxLength: 80, placeholder: '12:00 PM' },
  { key: 'checkOutTime', label: 'Check-out time', kind: 'text', maxLength: 80, placeholder: '11:00 AM' },
  { key: 'hourlySlots', label: 'Hourly slots', kind: 'text', maxLength: 120, placeholder: '3h / 6h / 12h' },
  { key: 'mealPlan', label: 'Meal plan', kind: 'text', maxLength: 160, placeholder: 'Breakfast included' },
  { key: 'totalRooms', label: 'Total rooms', kind: 'number', min: 0, max: 100000 },
  { key: 'coupleFriendly', label: 'Couple friendly', kind: 'boolean' },
  { key: 'cancellationPolicy', label: 'Cancellation policy', kind: 'text', maxLength: 200, placeholder: 'Free cancellation 24h before check-in' },
];

/**
 * Movie "listings" are cinema screens. The server refuses marketplace listing
 * writes for movie categories (`MOVIES_MODULE_DISPLAY_ONLY`); screen/showtime
 * operations have their own authorized endpoint, so the fields below map to
 * that contract only.
 */
const MOVIE_DETAIL_FIELDS: LiveEditFieldDefinition[] = [
  {
    key: 'format',
    label: 'Projection format',
    kind: 'text',
    required: true,
    maxLength: 80,
    placeholder: 'e.g. Barco 4K RGB Laser',
    help: 'Free text, because existing cinema screens use projector-specific labels.',
  },
  { key: 'soundSystem', label: 'Sound system', kind: 'text', maxLength: 80, placeholder: 'Dolby Atmos 7.1' },
  {
    key: 'showtimes',
    label: 'Showtimes (24h HH:MM, comma separated)',
    kind: 'time-list',
    required: true,
    placeholder: '10:30, 14:00, 18:15, 21:45',
    help: 'At least one showtime is required; times are validated before saving.',
  },
  {
    key: 'tierPricing',
    label: 'Seat tiers (one per line: Name = ₹price)',
    kind: 'tier-pricing',
    required: true,
    placeholder: 'Gold = 350\nExecutive = 250\nBalcony = 180',
    help: 'Required: saving an empty list would remove every seat price tier.',
  },
  { key: 'cancellationCutoffMinutes', label: 'Cancellation cutoff (minutes)', kind: 'number', min: 0, max: 1440 },
  { key: 'refundPercent', label: 'Refund percent', kind: 'number', min: 0, max: 100 },
  { key: 'fnbDeliveryEnabled', label: 'F&B delivery to seat', kind: 'boolean' },
  { key: 'wheelchairSeats', label: 'Wheelchair seat codes', kind: 'text', maxLength: 200, placeholder: 'A1, A2' },
];

export const LIVE_EDIT_MODULE_SCHEMAS: Record<LiveEditModule, LiveEditModuleSchema> = {
  pg_hostels: {
    module: 'pg_hostels',
    store: 'supabase_listings',
    categoryPrefixes: ['pg-'],
    priceUnits: ['/month', '/bed', '/day', '/week', '/property'],
    detailFields: PG_DETAIL_FIELDS,
    facilitySuggestions: ['Wi-Fi', 'Food included', 'AC', 'Power backup', 'Laundry', 'Housekeeping', 'CCTV', 'Parking', 'Gym', 'Attached bathroom'],
    descriptionMaxLength: 5000,
    imageLimit: 12,
    supportsImages: true,
    supportsFacilities: true,
    supportsCategories: true,
    supportsAvailability: true,
    supportsPricing: true,
    supportsCinemaScreens: false,
    blockedFields: {},
  },
  classes: {
    module: 'classes',
    store: 'supabase_listings',
    categoryPrefixes: ['class-'],
    priceUnits: ['/month', '/course', '/class', '/hour', '/session'],
    detailFields: CLASS_DETAIL_FIELDS,
    facilitySuggestions: ['Certification', 'Placement support', 'Demo class', 'Study material', 'Recorded lectures', 'Doubt sessions', 'Weekend batches', 'Online access'],
    descriptionMaxLength: 5000,
    imageLimit: 12,
    supportsImages: true,
    supportsFacilities: true,
    supportsCategories: true,
    supportsAvailability: true,
    supportsPricing: true,
    supportsCinemaScreens: false,
    blockedFields: {},
  },
  venues: {
    module: 'venues',
    store: 'supabase_listings',
    categoryPrefixes: ['venue-'],
    priceUnits: ['/day', '/event', '/hour', '/plate'],
    detailFields: VENUE_DETAIL_FIELDS,
    facilitySuggestions: ['AC hall', 'Valet parking', 'Power backup', 'Bridal room', 'In-house catering', 'Stage', 'Décor allowed', 'DJ allowed', 'Wheelchair access'],
    descriptionMaxLength: 5000,
    imageLimit: 16,
    supportsImages: true,
    supportsFacilities: true,
    supportsCategories: true,
    supportsAvailability: true,
    supportsPricing: true,
    supportsCinemaScreens: false,
    blockedFields: {},
  },
  services: {
    module: 'services',
    store: 'supabase_listings',
    categoryPrefixes: ['cat-', 'srv-'],
    priceUnits: ['/visit', '/service', '/hour', '/day', '/job'],
    detailFields: SERVICE_DETAIL_FIELDS,
    facilitySuggestions: ['Background verified', 'Same-day service', 'Warranty', 'Genuine spare parts', 'Cashless payment', 'Emergency support'],
    descriptionMaxLength: 5000,
    imageLimit: 12,
    supportsImages: true,
    supportsFacilities: true,
    supportsCategories: true,
    supportsAvailability: true,
    supportsPricing: true,
    supportsCinemaScreens: false,
    blockedFields: {},
  },
  hotel_stay: {
    module: 'hotel_stay',
    store: 'supabase_listings',
    categoryPrefixes: ['hotel-'],
    priceUnits: ['/night', '/hour', '/day', '/week'],
    detailFields: HOTEL_DETAIL_FIELDS,
    facilitySuggestions: ['Breakfast', 'Hourly stays', 'Couple friendly', 'Airport pickup', 'Parking', 'Gym', 'Pool', 'Room service', 'GST invoice'],
    descriptionMaxLength: 5000,
    imageLimit: 16,
    supportsImages: true,
    supportsFacilities: true,
    supportsCategories: true,
    supportsAvailability: true,
    supportsPricing: true,
    supportsCinemaScreens: false,
    blockedFields: {},
  },
  movies: {
    module: 'movies',
    store: 'server_cinema_store',
    categoryPrefixes: ['movie-'],
    priceUnits: ['/ticket'],
    detailFields: MOVIE_DETAIL_FIELDS,
    facilitySuggestions: [],
    descriptionMaxLength: 0,
    imageLimit: 0,
    supportsImages: false,
    supportsFacilities: false,
    supportsCategories: false,
    supportsAvailability: false,
    supportsPricing: false,
    supportsCinemaScreens: true,
    blockedFields: {
      description: 'Movie catalogue copy has no authorized persistence path in this build. The server refuses marketplace listing writes for movie categories (MOVIES_MODULE_DISPLAY_ONLY).',
      images: 'Movie poster/catalogue images are display-only data. No authorized write path exists for them.',
      categories: 'Movie catalogue categories are managed by the Movies module, not by Live Edit.',
      facilities: 'Cinema facility copy is not part of the authorized screen contract.',
    },
  },
};

export function liveEditModuleSchema(module: LiveEditModule): LiveEditModuleSchema {
  return LIVE_EDIT_MODULE_SCHEMAS[module];
}
