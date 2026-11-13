import { MarketplaceListing } from '../../types/marketplace';

export interface StayDetailItem {
  label: string;
  value?: string;
  emoji: string;
}

export interface StayDetailContent {
  stayType: string;
  guestSummary: string;
  roomSummary: string;
  checkIn: string;
  checkOut: string;
  cancellationPolicy: string;
  securityDeposit?: string;
  highlights: StayDetailItem[];
  amenities: StayDetailItem[];
  houseRules: string[];
  houseRulesPublished: boolean;
}

const fieldText = (listing: MarketplaceListing, ...keys: string[]) => {
  for (const key of keys) {
    const value = listing.customFieldValues?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
};

const containsAny = (value: string, terms: string[]) => terms.some((term) => value.includes(term));

const splitRules = (value: string) =>
  value
    .split(/\r?\n|;|•/)
    .map((rule) => rule.trim().replace(/^[-–—]+\s*/, ''))
    .filter(Boolean);

export function buildStayDetailContent(
  listing: MarketplaceListing,
  currentLang: 'en' | 'te' | 'hi' = 'en',
): StayDetailContent {
  const fields = listing.customFieldValues || {};
  const description = `${listing.description} ${Object.values(fields).join(' ')}`.toLowerCase();
  const isTelugu = currentLang === 'te';
  const stayType = fieldText(
    listing,
    isTelugu ? 'hotelCategoryBadgeTe' : 'hotelCategoryBadgeEn',
    'hotelCategoryBadgeEn',
  ) || listing.subcategory;
  const guestSummary = fieldText(
    listing,
    isTelugu ? 'guestCapacityTe' : 'guestCapacityEn',
    'guestCapacityEn',
  ) || (isTelugu ? 'అతిథుల సంఖ్య ప్రొవైడర్ ద్వారా నిర్ధారించబడుతుంది' : 'Guest capacity confirmed by provider');
  const roomSummary = fieldText(
    listing,
    isTelugu ? 'roomSpecLineTe' : 'roomSpecLineEn',
    'roomSpecLineEn',
    'roomCategory',
  ) || (isTelugu ? 'గది వివరాలు బుకింగ్ ముందు నిర్ధారించబడతాయి' : 'Room details confirmed before booking');
  const checkIn = fieldText(listing, 'checkInTime') || (isTelugu ? 'ప్రొవైడర్ షెడ్యూల్' : 'Provider schedule');
  const checkOut = fieldText(listing, 'checkOutTime') || (isTelugu ? 'ప్రొవైడర్ షెడ్యూల్' : 'Provider schedule');
  const houseRulesValue = fieldText(listing, isTelugu ? 'houseRulesTe' : 'houseRules', 'houseRulesEn');
  const cancellationPolicy = fieldText(
    listing,
    isTelugu ? 'cancellationPolicyTe' : 'cancellationPolicy',
    'cancellationPolicyEn',
  ) || (isTelugu ? 'రద్దు మరియు రీఫండ్ నిబంధనలు బుకింగ్ సమయంలో నిర్ధారించబడతాయి.' : 'Cancellation and refund terms are confirmed during booking.');

  const amenities: StayDetailItem[] = [];
  const addAmenity = (label: string, emoji: string, present: boolean, value?: string) => {
    if (present) amenities.push({ label, emoji, value });
  };

  addAmenity('Kitchen', '🍳', Boolean(fields.kitchen) || containsAny(description, ['kitchen', 'cooking']));
  addAmenity('Wi-Fi', '📶', Boolean(fields.wifiSpeed) || containsAny(description, ['wi-fi', 'wifi', 'internet']), fieldText(listing, 'wifiSpeed'));
  addAmenity('Dedicated workspace', '💻', Boolean(fields.dedicatedWorkspace) || containsAny(description, ['work', 'business', 'it professional']));
  addAmenity('Free parking', '🚗', Boolean(fields.parking || fields.parkingCapacity) || containsAny(description, ['parking', 'valet']));
  addAmenity('TV & entertainment', '📺', Boolean(fields.tv || fields.ott) || containsAny(description, ['smart tv', 'television', 'ott', 'entertainment']));
  addAmenity('Air conditioning', '❄️', Boolean(fields.ac || fields.airConditioning) || containsAny(description, [' ac ', 'air conditioning', 'air-conditioned']));
  addAmenity('Breakfast', '🥣', Boolean(fields.breakfastIncluded), fieldText(listing, 'breakfastIncluded'));
  addAmenity('Washing machine', '🧺', Boolean(fields.washingMachine) || containsAny(description, ['washing machine', 'laundry']));
  addAmenity('Housekeeping', '🧹', Boolean(fields.housekeeping) || containsAny(description, ['housekeeping', 'cleaning']));
  addAmenity('Pool / outdoor space', '🏊', Boolean(fields.pool) || containsAny(description, ['pool', 'garden', 'balcony', 'farmhouse']));
  addAmenity('Lift', '🛗', Boolean(fields.lift || fields.elevator) || containsAny(description, ['lift', 'elevator']));

  const highlights: StayDetailItem[] = [
    {
      label: isTelugu ? 'ప్రైమ్ లొకేషన్' : 'Prime location',
      value: `${listing.location.area}, ${listing.location.city}`,
      emoji: '📍',
    },
    {
      label: listing.isVerified ? (isTelugu ? 'వెరిఫైడ్ ప్రొవైడర్' : 'Verified provider') : (isTelugu ? 'ప్రొవైడర్ మేనేజ్డ్' : 'Provider-managed stay'),
      value: isTelugu ? 'బుకింగ్ మరియు ఇన్వెంటరీ సర్వర్ ద్వారా నిర్ధారించబడతాయి' : 'Availability and booking are validated server-side',
      emoji: '✅',
    },
    {
      label: isTelugu ? 'ఫ్లెక్సిబుల్ చెక్-ఇన్' : 'Flexible check-in',
      value: `${checkIn} → ${checkOut}`,
      emoji: '🕒',
    },
  ];

  return {
    stayType,
    guestSummary,
    roomSummary,
    checkIn,
    checkOut,
    cancellationPolicy,
    securityDeposit: fieldText(listing, isTelugu ? 'securityDepositTe' : 'securityDeposit', 'securityDepositEn') || undefined,
    highlights,
    amenities,
    houseRules: houseRulesValue ? splitRules(houseRulesValue) : [
      isTelugu
        ? 'హౌస్ రూల్స్ మరియు డిపాజిట్ విధానం బుకింగ్ ముందు ప్రొవైడర్ ద్వారా నిర్ధారించబడుతుంది.'
        : 'House rules and any deposit policy are confirmed by the provider before booking.',
    ],
    houseRulesPublished: Boolean(houseRulesValue),
  };
}
