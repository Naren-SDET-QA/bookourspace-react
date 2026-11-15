export const MARKET_SECTION_IDS = [
  'pg_hostels',
  'classes',
  'venues',
  'services',
  'hotel_stay',
  'movies',
] as const;

export type MarketSectionId = (typeof MARKET_SECTION_IDS)[number];
export type MarketSectionVisibility = Record<MarketSectionId, boolean>;

export const DEFAULT_MARKET_SECTION_VISIBILITY: MarketSectionVisibility = {
  pg_hostels: true,
  classes: true,
  venues: true,
  services: true,
  hotel_stay: true,
  movies: true,
};

export function normalizeMarketSectionVisibility(value: unknown): MarketSectionVisibility {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    MARKET_SECTION_IDS.map((id) => [
      id,
      typeof source[id] === 'boolean' ? source[id] : DEFAULT_MARKET_SECTION_VISIBILITY[id],
    ])
  ) as MarketSectionVisibility;
}

export function isMarketSectionId(value: string): value is MarketSectionId {
  return (MARKET_SECTION_IDS as readonly string[]).includes(value);
}
