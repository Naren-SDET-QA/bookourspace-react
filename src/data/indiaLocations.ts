/**
 * Curated India location dataset (states → districts → cities/towns).
 * Seeded from Indian administrative divisions; coordinates are approximate
 * city-centre points used only for "nearest city" GPS fallback and maps.
 * This is a local, offline-safe dataset — no network or API key required.
 */

export type LocationType = 'city' | 'town' | 'village';

export interface IndiaCity {
  name: string;
  state: string;
  district: string;
  type: LocationType;
  lat: number;
  lng: number;
  popular?: boolean;
  aliases?: string[];
}

export interface IndiaDistrict {
  name: string;
  cities: IndiaCity[];
}

export interface IndiaState {
  name: string;
  code: string;
  districts: IndiaDistrict[];
}

const c = (name: string, district: string, state: string, lat: number, lng: number, opts: Partial<IndiaCity> = {}): IndiaCity => ({
  name,
  state,
  district,
  type: 'city',
  lat,
  lng,
  ...opts,
});

/* ------------------------------- Telangana ------------------------------- */
const TELANGANA: IndiaState = {
  name: 'Telangana',
  code: 'TG',
  districts: [
    { name: 'Hyderabad', cities: [
      c('Hyderabad', 'Hyderabad', 'Telangana', 17.385, 78.4867, { popular: true, aliases: ['Hyd', 'Bhagyanagar'] }),
      c('Secunderabad', 'Hyderabad', 'Telangana', 17.4399, 78.4983, { popular: true }),
      c('Charminar', 'Hyderabad', 'Telangana', 17.3616, 78.4747),
      c('Gachibowli', 'Hyderabad', 'Telangana', 17.4401, 78.3489, { type: 'town' }),
      c('Madhapur', 'Hyderabad', 'Telangana', 17.4483, 78.3915, { type: 'town' }),
      c('Hitech City', 'Hyderabad', 'Telangana', 17.4435, 78.3772, { type: 'town', aliases: ['HITEC City'] }),
      c('Kukatpally', 'Hyderabad', 'Telangana', 17.4948, 78.3996, { type: 'town' }),
    ] },
    { name: 'Rangareddy', cities: [
      c('Shamshabad', 'Rangareddy', 'Telangana', 17.2403, 78.4294, { type: 'town' }),
      c('Kothur', 'Rangareddy', 'Telangana', 17.1667, 78.3167, { type: 'town' }),
    ] },
    { name: 'Medchal-Malkajgiri', cities: [
      c('Kompally', 'Medchal-Malkajgiri', 'Telangana', 17.5388, 78.4856, { type: 'town' }),
      c('Medchal', 'Medchal-Malkajgiri', 'Telangana', 17.6296, 78.4813, { type: 'town' }),
    ] },
    { name: 'Sangareddy', cities: [c('Sangareddy', 'Sangareddy', 'Telangana', 17.6248, 78.0862)] },
    { name: 'Warangal', cities: [
      c('Warangal', 'Warangal', 'Telangana', 17.9689, 79.5941, { popular: true }),
      c('Hanamkonda', 'Warangal', 'Telangana', 18.0098, 79.5591),
    ] },
    { name: 'Karimnagar', cities: [c('Karimnagar', 'Karimnagar', 'Telangana', 18.4386, 79.1288)] },
    { name: 'Nizamabad', cities: [c('Nizamabad', 'Nizamabad', 'Telangana', 18.6725, 78.0941)] },
    { name: 'Khammam', cities: [c('Khammam', 'Khammam', 'Telangana', 17.2473, 80.1514)] },
    { name: 'Mahbubnagar', cities: [c('Mahbubnagar', 'Mahbubnagar', 'Telangana', 16.7488, 77.9854)] },
    { name: 'Nalgonda', cities: [c('Nalgonda', 'Nalgonda', 'Telangana', 17.0575, 79.2685)] },
    { name: 'Adilabad', cities: [c('Adilabad', 'Adilabad', 'Telangana', 19.6641, 78.532)] },
    { name: 'Ramagundam', cities: [c('Ramagundam', 'Peddapalli', 'Telangana', 18.7599, 79.474)] },
    { name: 'Kothagudem', cities: [c('Kothagudem', 'Bhadradri Kothagudem', 'Telangana', 17.5514, 80.6179)] },
    { name: 'Suryapet', cities: [c('Suryapet', 'Suryapet', 'Telangana', 17.1405, 79.6209)] },
  ],
};

/* --------------------------- Andhra Pradesh --------------------------- */
const ANDHRA_PRADESH: IndiaState = {
  name: 'Andhra Pradesh',
  code: 'AP',
  districts: [
    { name: 'Visakhapatnam', cities: [
      c('Visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', 17.6868, 83.2185, { popular: true, aliases: ['Vizag'] }),
      c('Gajuwaka', 'Visakhapatnam', 'Andhra Pradesh', 17.689, 83.209, { type: 'town' }),
      c('Madhurawada', 'Visakhapatnam', 'Andhra Pradesh', 17.821, 83.344, { type: 'town' }),
    ] },
    { name: 'Anakapalli', cities: [c('Anakapalli', 'Anakapalli', 'Andhra Pradesh', 17.6913, 83.0039, { type: 'town' })] },
    { name: 'Krishna', cities: [
      c('Vijayawada', 'NTR', 'Andhra Pradesh', 16.5062, 80.648, { popular: true }),
      c('Machilipatnam', 'Krishna', 'Andhra Pradesh', 16.1875, 81.1389),
    ] },
    { name: 'Guntur', cities: [
      c('Guntur', 'Guntur', 'Andhra Pradesh', 16.3067, 80.4365, { popular: true }),
      c('Tenali', 'Guntur', 'Andhra Pradesh', 16.243, 80.64),
    ] },
    { name: 'Tirupati', cities: [c('Tirupati', 'Tirupati', 'Andhra Pradesh', 13.6288, 79.4192, { popular: true, aliases: ['Tirumala'] })] },
    { name: 'Kurnool', cities: [c('Kurnool', 'Kurnool', 'Andhra Pradesh', 15.8281, 78.0373)] },
    { name: 'East Godavari', cities: [
      c('Rajahmundry', 'East Godavari', 'Andhra Pradesh', 17.0005, 81.804, { aliases: ['Rajamahendravaram'] }),
      c('Kakinada', 'Kakinada', 'Andhra Pradesh', 16.9891, 82.2475),
    ] },
    { name: 'Nellore', cities: [c('Nellore', 'Nellore', 'Andhra Pradesh', 14.4426, 79.9865)] },
    { name: 'Anantapur', cities: [c('Anantapur', 'Anantapur', 'Andhra Pradesh', 14.6819, 77.6006)] },
    { name: 'YSR Kadapa', cities: [c('Kadapa', 'YSR Kadapa', 'Andhra Pradesh', 14.4674, 78.8241)] },
    { name: 'Chittoor', cities: [c('Chittoor', 'Chittoor', 'Andhra Pradesh', 13.2172, 79.1003)] },
    { name: 'West Godavari', cities: [c('Bhimavaram', 'West Godavari', 'Andhra Pradesh', 16.5449, 81.5212)] },
    { name: 'Eluru', cities: [c('Eluru', 'Eluru', 'Andhra Pradesh', 16.7107, 81.0952)] },
    { name: 'Ongole', cities: [c('Ongole', 'Prakasam', 'Andhra Pradesh', 15.5057, 80.0499)] },
  ],
};

/* ------------------------------ Karnataka ------------------------------ */
const KARNATAKA: IndiaState = {
  name: 'Karnataka',
  code: 'KA',
  districts: [
    { name: 'Bengaluru Urban', cities: [
      c('Bengaluru', 'Bengaluru Urban', 'Karnataka', 12.9716, 77.5946, { popular: true, aliases: ['Bangalore', 'BLR'] }),
      c('Koramangala', 'Bengaluru Urban', 'Karnataka', 12.9352, 77.6245, { type: 'town' }),
      c('Indiranagar', 'Bengaluru Urban', 'Karnataka', 12.9784, 77.6408, { type: 'town' }),
      c('Whitefield', 'Bengaluru Urban', 'Karnataka', 12.9698, 77.75, { type: 'town' }),
      c('HSR Layout', 'Bengaluru Urban', 'Karnataka', 12.9121, 77.6446, { type: 'town' }),
      c('Jayanagar', 'Bengaluru Urban', 'Karnataka', 12.9308, 77.5838, { type: 'town' }),
      c('Electronic City', 'Bengaluru Urban', 'Karnataka', 12.8399, 77.677, { type: 'town' }),
    ] },
    { name: 'Mysuru', cities: [c('Mysuru', 'Mysuru', 'Karnataka', 12.2958, 76.6394, { popular: true, aliases: ['Mysore'] })] },
    { name: 'Dakshina Kannada', cities: [
      c('Mangaluru', 'Dakshina Kannada', 'Karnataka', 12.9141, 74.856, { popular: true, aliases: ['Mangalore'] }),
      c('Ullal', 'Dakshina Kannada', 'Karnataka', 12.8, 74.85, { type: 'town' }),
    ] },
    { name: 'Dharwad', cities: [
      c('Hubballi', 'Dharwad', 'Karnataka', 15.3647, 75.124, { aliases: ['Hubli'] }),
      c('Dharwad', 'Dharwad', 'Karnataka', 15.4589, 75.0078),
    ] },
    { name: 'Belagavi', cities: [c('Belagavi', 'Belagavi', 'Karnataka', 15.8497, 74.4977, { aliases: ['Belgaum'] })] },
    { name: 'Kalaburagi', cities: [c('Kalaburagi', 'Kalaburagi', 'Karnataka', 17.3297, 76.8343, { aliases: ['Gulbarga'] })] },
    { name: 'Ballari', cities: [c('Ballari', 'Ballari', 'Karnataka', 15.1394, 76.9214, { aliases: ['Bellary'] })] },
    { name: 'Vijayapura', cities: [c('Vijayapura', 'Vijayapura', 'Karnataka', 16.8302, 75.71, { aliases: ['Bijapur'] })] },
    { name: 'Shivamogga', cities: [c('Shivamogga', 'Shivamogga', 'Karnataka', 13.9299, 75.5681, { aliases: ['Shimoga'] })] },
    { name: 'Tumakuru', cities: [c('Tumakuru', 'Tumakuru', 'Karnataka', 13.3379, 77.1173, { aliases: ['Tumkur'] })] },
    { name: 'Davanagere', cities: [c('Davanagere', 'Davanagere', 'Karnataka', 14.4644, 75.9218)] },
    { name: 'Udupi', cities: [c('Udupi', 'Udupi', 'Karnataka', 13.3409, 74.7421)] },
    { name: 'Hassan', cities: [c('Hassan', 'Hassan', 'Karnataka', 13.0068, 76.0996)] },
    { name: 'Raichur', cities: [c('Raichur', 'Raichur', 'Karnataka', 16.2076, 77.3463)] },
  ],
};

/* --------------------------- Other states --------------------------- */
const OTHER_STATES: IndiaState[] = [
  { name: 'Maharashtra', code: 'MH', districts: [
    { name: 'Mumbai Suburban', cities: [c('Mumbai', 'Mumbai Suburban', 'Maharashtra', 19.076, 72.8777, { popular: true, aliases: ['Bombay'] })] },
    { name: 'Pune', cities: [c('Pune', 'Pune', 'Maharashtra', 18.5204, 73.8567, { popular: true })] },
    { name: 'Nagpur', cities: [c('Nagpur', 'Nagpur', 'Maharashtra', 21.1458, 79.0882)] },
    { name: 'Nashik', cities: [c('Nashik', 'Nashik', 'Maharashtra', 19.9975, 73.7898)] },
    { name: 'Thane', cities: [c('Thane', 'Thane', 'Maharashtra', 19.2183, 72.9781)] },
  ] },
  { name: 'Delhi', code: 'DL', districts: [
    { name: 'New Delhi', cities: [c('New Delhi', 'New Delhi', 'Delhi', 28.6139, 77.209, { popular: true, aliases: ['Delhi', 'NCR'] })] },
    { name: 'South Delhi', cities: [c('Saket', 'South Delhi', 'Delhi', 28.5245, 77.2066, { type: 'town' })] },
  ] },
  { name: 'Tamil Nadu', code: 'TN', districts: [
    { name: 'Chennai', cities: [c('Chennai', 'Chennai', 'Tamil Nadu', 13.0827, 80.2707, { popular: true, aliases: ['Madras'] })] },
    { name: 'Coimbatore', cities: [c('Coimbatore', 'Coimbatore', 'Tamil Nadu', 11.0168, 76.9558)] },
    { name: 'Madurai', cities: [c('Madurai', 'Madurai', 'Tamil Nadu', 9.9252, 78.1198)] },
  ] },
  { name: 'West Bengal', code: 'WB', districts: [
    { name: 'Kolkata', cities: [c('Kolkata', 'Kolkata', 'West Bengal', 22.5726, 88.3639, { popular: true, aliases: ['Calcutta'] })] },
  ] },
  { name: 'Gujarat', code: 'GJ', districts: [
    { name: 'Ahmedabad', cities: [c('Ahmedabad', 'Ahmedabad', 'Gujarat', 23.0225, 72.5714)] },
    { name: 'Surat', cities: [c('Surat', 'Surat', 'Gujarat', 21.1702, 72.8311)] },
    { name: 'Vadodara', cities: [c('Vadodara', 'Vadodara', 'Gujarat', 22.3072, 73.1812)] },
  ] },
  { name: 'Rajasthan', code: 'RJ', districts: [
    { name: 'Jaipur', cities: [c('Jaipur', 'Jaipur', 'Rajasthan', 26.9124, 75.7873, { popular: true })] },
    { name: 'Jodhpur', cities: [c('Jodhpur', 'Jodhpur', 'Rajasthan', 26.2389, 73.0243)] },
    { name: 'Udaipur', cities: [c('Udaipur', 'Udaipur', 'Rajasthan', 24.5854, 73.7125)] },
  ] },
  { name: 'Uttar Pradesh', code: 'UP', districts: [
    { name: 'Lucknow', cities: [c('Lucknow', 'Lucknow', 'Uttar Pradesh', 26.8467, 80.9462)] },
    { name: 'Kanpur', cities: [c('Kanpur', 'Kanpur', 'Uttar Pradesh', 26.4499, 80.3319)] },
    { name: 'Gautam Buddha Nagar', cities: [c('Noida', 'Gautam Buddha Nagar', 'Uttar Pradesh', 28.5355, 77.391, { popular: true })] },
    { name: 'Varanasi', cities: [c('Varanasi', 'Varanasi', 'Uttar Pradesh', 25.3176, 82.9739)] },
    { name: 'Agra', cities: [c('Agra', 'Agra', 'Uttar Pradesh', 27.1767, 78.0081)] },
  ] },
  { name: 'Kerala', code: 'KL', districts: [
    { name: 'Ernakulam', cities: [c('Kochi', 'Ernakulam', 'Kerala', 9.9312, 76.2673, { popular: true, aliases: ['Cochin'] })] },
    { name: 'Thiruvananthapuram', cities: [c('Thiruvananthapuram', 'Thiruvananthapuram', 'Kerala', 8.5241, 76.9366, { aliases: ['Trivandrum'] })] },
    { name: 'Kozhikode', cities: [c('Kozhikode', 'Kozhikode', 'Kerala', 11.2588, 75.7804, { aliases: ['Calicut'] })] },
  ] },
  { name: 'Punjab', code: 'PB', districts: [
    { name: 'Chandigarh', cities: [c('Chandigarh', 'Chandigarh', 'Punjab', 30.7333, 76.7794)] },
    { name: 'Ludhiana', cities: [c('Ludhiana', 'Ludhiana', 'Punjab', 30.901, 75.8573)] },
    { name: 'Amritsar', cities: [c('Amritsar', 'Amritsar', 'Punjab', 31.634, 74.8723)] },
  ] },
  { name: 'Haryana', code: 'HR', districts: [
    { name: 'Gurugram', cities: [c('Gurugram', 'Gurugram', 'Haryana', 28.4595, 77.0266, { popular: true, aliases: ['Gurgaon'] })] },
    { name: 'Faridabad', cities: [c('Faridabad', 'Faridabad', 'Haryana', 28.4089, 77.3178)] },
  ] },
];

export const INDIAN_STATES: IndiaState[] = [TELANGANA, ANDHRA_PRADESH, KARNATAKA, ...OTHER_STATES];

export const ALL_CITIES: IndiaCity[] = INDIAN_STATES.flatMap((s) => s.districts.flatMap((d) => d.cities));

export const POPULAR_CITIES: IndiaCity[] = [
  'Hyderabad', 'Bengaluru', 'Visakhapatnam', 'Vijayawada', 'Mumbai', 'Pune', 'Chennai', 'Delhi',
]
  .map((n) => ALL_CITIES.find((ci) => ci.name === n))
  .filter((ci): ci is IndiaCity => Boolean(ci));

/** First-3 PIN digits (India Post sorting district) → real city. Used for instant 6-digit PIN. */
export const INDIA_PIN_PREFIXES: Array<{ prefix: string; name: string; district: string; state: string }> = [
  { prefix: '110', name: 'New Delhi', district: 'New Delhi', state: 'Delhi' },
  { prefix: '122', name: 'Gurugram', district: 'Gurugram', state: 'Haryana' },
  { prefix: '121', name: 'Faridabad', district: 'Faridabad', state: 'Haryana' },
  { prefix: '201', name: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh' },
  { prefix: '226', name: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh' },
  { prefix: '208', name: 'Kanpur', district: 'Kanpur', state: 'Uttar Pradesh' },
  { prefix: '221', name: 'Varanasi', district: 'Varanasi', state: 'Uttar Pradesh' },
  { prefix: '282', name: 'Agra', district: 'Agra', state: 'Uttar Pradesh' },
  { prefix: '380', name: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat' },
  { prefix: '395', name: 'Surat', district: 'Surat', state: 'Gujarat' },
  { prefix: '390', name: 'Vadodara', district: 'Vadodara', state: 'Gujarat' },
  { prefix: '400', name: 'Mumbai', district: 'Mumbai Suburban', state: 'Maharashtra' },
  { prefix: '411', name: 'Pune', district: 'Pune', state: 'Maharashtra' },
  { prefix: '440', name: 'Nagpur', district: 'Nagpur', state: 'Maharashtra' },
  { prefix: '422', name: 'Nashik', district: 'Nashik', state: 'Maharashtra' },
  { prefix: '500', name: 'Hyderabad', district: 'Hyderabad', state: 'Telangana' },
  { prefix: '530', name: 'Visakhapatnam', district: 'Visakhapatnam', state: 'Andhra Pradesh' },
  { prefix: '520', name: 'Vijayawada', district: 'NTR', state: 'Andhra Pradesh' },
  { prefix: '522', name: 'Guntur', district: 'Guntur', state: 'Andhra Pradesh' },
  { prefix: '517', name: 'Tirupati', district: 'Tirupati', state: 'Andhra Pradesh' },
  { prefix: '560', name: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka' },
  { prefix: '570', name: 'Mysuru', district: 'Mysuru', state: 'Karnataka' },
  { prefix: '575', name: 'Mangaluru', district: 'Dakshina Kannada', state: 'Karnataka' },
  { prefix: '580', name: 'Hubballi', district: 'Dharwad', state: 'Karnataka' },
  { prefix: '600', name: 'Chennai', district: 'Chennai', state: 'Tamil Nadu' },
  { prefix: '641', name: 'Coimbatore', district: 'Coimbatore', state: 'Tamil Nadu' },
  { prefix: '625', name: 'Madurai', district: 'Madurai', state: 'Tamil Nadu' },
  { prefix: '682', name: 'Kochi', district: 'Ernakulam', state: 'Kerala' },
  { prefix: '695', name: 'Thiruvananthapuram', district: 'Thiruvananthapuram', state: 'Kerala' },
  { prefix: '673', name: 'Kozhikode', district: 'Kozhikode', state: 'Kerala' },
  { prefix: '700', name: 'Kolkata', district: 'Kolkata', state: 'West Bengal' },
  { prefix: '302', name: 'Jaipur', district: 'Jaipur', state: 'Rajasthan' },
  { prefix: '342', name: 'Jodhpur', district: 'Jodhpur', state: 'Rajasthan' },
  { prefix: '313', name: 'Udaipur', district: 'Udaipur', state: 'Rajasthan' },
  { prefix: '141', name: 'Ludhiana', district: 'Ludhiana', state: 'Punjab' },
  { prefix: '143', name: 'Amritsar', district: 'Amritsar', state: 'Punjab' },
  { prefix: '160', name: 'Chandigarh', district: 'Chandigarh', state: 'Punjab' },
];

export const INDIA_PIN_PATTERN = /^[1-9][0-9]{5}$/;

export function isIndiaPin(value: string): boolean {
  return INDIA_PIN_PATTERN.test(value.trim());
}

export function cityForPin(value: string): IndiaCity | null {
  const pin = value.trim();
  if (!isIndiaPin(pin)) return null;
  const prefix = INDIA_PIN_PREFIXES.find((row) => pin.startsWith(row.prefix));
  if (!prefix) return null;
  return ALL_CITIES.find((city) => city.name === prefix.name && city.state === prefix.state)
    ?? ALL_CITIES.find((city) => city.name === prefix.name)
    ?? null;
}

/** Deduplicate by name+state+district so duplicate city names stay distinguishable. */
export function locationKey(loc: { name: string; state: string; district: string }): string {
  return `${loc.name}|${loc.state}|${loc.district}`.toLowerCase();
}

function foldLocationQuery(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u0c00-\u0c7f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function searchLocations(query: string, limit = 10): IndiaCity[] {
  const raw = query.trim();
  const cap = Math.min(Math.max(limit, 1), 10);
  if (!raw) return ALL_CITIES.filter((city) => city.popular).slice(0, cap);
  const pinCity = cityForPin(raw);
  if (pinCity) return [pinCity];
  const q = foldLocationQuery(raw);
  if (!q) return [];
  const scored = ALL_CITIES.map((loc) => {
    const name = loc.name.toLowerCase();
    const aliases = (loc.aliases ?? []).map((alias) => alias.toLowerCase());
    if (name === q || aliases.includes(q)) return { loc, score: 0 };
    if (name.startsWith(q) || aliases.some((alias) => alias.startsWith(q))) return { loc, score: 1 };
    const hay = `${name} ${loc.district.toLowerCase()} ${loc.state.toLowerCase()} ${aliases.join(' ')}`;
    if (hay.includes(q)) return { loc, score: name.includes(q) ? 2 : 3 };
    return null;
  }).filter((x): x is { loc: IndiaCity; score: number } => Boolean(x));
  return scored.sort((a, b) => a.score - b.score || a.loc.name.localeCompare(b.loc.name)).slice(0, cap).map((s) => s.loc);
}

export function nearestCity(lat: number, lng: number): IndiaCity {
  let best = ALL_CITIES[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const loc of ALL_CITIES) {
    const d = (loc.lat - lat) ** 2 + (loc.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = loc; }
  }
  return best;
}

export function labelOf(loc: { name: string; district: string; state: string }): string {
  return loc.name === loc.district ? `${loc.name}, ${loc.state}` : `${loc.name}, ${loc.district}, ${loc.state}`;
}

export function findState(name: string): IndiaState | undefined {
  return INDIAN_STATES.find((s) => s.name.toLowerCase() === name.toLowerCase());
}
