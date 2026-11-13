import { MarketplaceListing } from '../../types/marketplace';

export interface ListingMapLocation {
  lat: number;
  lng: number;
  accuracy: 'exact' | 'approximate';
}

const HYDERABAD_LOCALITY_CENTRES: ReadonlyArray<{ match: string; lat: number; lng: number }> = [
  { match: 'madhapur', lat: 17.4483, lng: 78.3915 },
  { match: 'hitech city', lat: 17.4474, lng: 78.3762 },
  { match: 'gachibowli', lat: 17.4401, lng: 78.3489 },
  { match: 'kukatpally', lat: 17.4933, lng: 78.3996 },
  { match: 'kphb', lat: 17.4928, lng: 78.3938 },
  { match: 'banjara hills', lat: 17.4156, lng: 78.4347 },
  { match: 'jubilee hills', lat: 17.4316, lng: 78.4075 },
  { match: 'kondapur', lat: 17.4681, lng: 78.3634 },
  { match: 'miyapur', lat: 17.4969, lng: 78.3727 },
  { match: 'begumpet', lat: 17.4435, lng: 78.4666 },
  { match: 'ameerpet', lat: 17.4375, lng: 78.4482 },
  { match: 'secunderabad', lat: 17.4399, lng: 78.4983 },
];

export function resolveListingMapLocation(listing: MarketplaceListing): ListingMapLocation | null {
  const { lat, lng } = listing.location;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat: Number(lat), lng: Number(lng), accuracy: 'exact' };
  }

  const locationText = `${listing.location.area} ${listing.location.city}`.toLocaleLowerCase('en-IN');
  const match = HYDERABAD_LOCALITY_CENTRES.find((centre) => locationText.includes(centre.match));
  return match ? { ...match, accuracy: 'approximate' } : null;
}

export const HYDERABAD_DEFAULT_MAP_CENTER = { lat: 17.385, lng: 78.4867 } as const;
