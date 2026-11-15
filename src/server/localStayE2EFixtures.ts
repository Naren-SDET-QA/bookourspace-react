/** Guard and fixture definitions for explicitly local stay-browser testing. */
export function assertLocalStayE2EFixtureTarget(
  connectionString: string,
  environment: Record<string, string | undefined> = process.env,
): URL {
  if (environment.NODE_ENV === 'production' || environment.BOS_LOCAL_STAY_E2E_SEED !== 'true') {
    throw new Error('LOCAL_STAY_E2E_SEED_OPT_IN_REQUIRED');
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('LOCAL_STAY_E2E_DATABASE_URL_INVALID');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase());
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !loopback) {
    throw new Error('LOCAL_STAY_E2E_DATABASE_MUST_BE_LOOPBACK');
  }
  if (url.pathname !== '/bookourspace_dev' || url.port !== String(environment.BOS_DEV_DB_PORT || '55440')) {
    throw new Error('LOCAL_STAY_E2E_DATABASE_ID_MISMATCH');
  }
  return url;
}

export interface LocalStayE2EFixture {
  listingId: string;
  title: string;
  city: string;
  area: string;
  propertyType: 'hotel' | 'resort' | 'homestay';
  pricePaise: number;
  maxGuests: number;
  amenities: string[];
}

/** These are intentionally synthetic and must always carry an in-product test label. */
export const LOCAL_STAY_E2E_FIXTURES: readonly LocalStayE2EFixture[] = [
  {
    listingId: 'local-e2e-stay-goa',
    title: 'LOCAL TEST ONLY · Palm Courtyard Stay',
    city: 'Goa',
    area: 'Candolim',
    propertyType: 'hotel',
    pricePaise: 325000,
    maxGuests: 2,
    amenities: ['Wi-Fi', 'Air conditioning'],
  },
  {
    listingId: 'local-e2e-stay-hyderabad',
    title: 'LOCAL TEST ONLY · Lakeview Rooms',
    city: 'Hyderabad',
    area: 'Madhapur',
    propertyType: 'homestay',
    pricePaise: 245000,
    maxGuests: 3,
    amenities: ['Wi-Fi', 'Kitchen access'],
  },
  {
    listingId: 'local-e2e-stay-coorg',
    title: 'LOCAL TEST ONLY · Hilltop Cottage',
    city: 'Coorg',
    area: 'Madikeri',
    propertyType: 'resort',
    pricePaise: 410000,
    maxGuests: 4,
    amenities: ['Parking', 'Garden'],
  },
];

export const LOCAL_STAY_E2E_HOST_ID = 'a11a0000-1111-4111-8111-000000000001';
export const LOCAL_STAY_E2E_ADMIN_ID = 'a11a0000-1111-4111-8111-000000000005';
