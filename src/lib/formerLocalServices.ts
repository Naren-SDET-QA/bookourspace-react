import { servicesCategories } from '../data/servicesStayMoviesData';
import { listingImageSources } from './media/signedStorageUrl';

export const FORMER_LOCAL_SERVICE_CATEGORY_IDS = [
  'rural-dairy',
  'rural-farm-support',
  'rural-livestock',
] as const;

export type FormerLocalServiceCategoryId = (typeof FORMER_LOCAL_SERVICE_CATEGORY_IDS)[number];
export type ProviderAvailabilityStatus = 'not_reported' | 'available' | 'unavailable';

export interface FormerLocalServiceRow {
  id: string;
  title: string;
  category_id: string;
  subcategory: string;
  price: number | string | null;
  price_unit: string | null;
  status: string;
  payload: unknown;
  provider_availability_status: string | null;
  is_verified: boolean | null;
}

export interface FormerLocalServiceCard {
  id: string;
  title: string;
  categoryId: FormerLocalServiceCategoryId;
  categoryName: string;
  categoryEmoji: string;
  subcategory: string;
  city: string;
  area: string;
  price: number | null;
  priceUnit: string;
  description: string;
  providerName: string;
  image: string | null;
  availability: ProviderAvailabilityStatus;
  verified: boolean;
}

export interface FormerLocalServiceFilters {
  categoryId: FormerLocalServiceCategoryId | 'all';
  query: string;
  verifiedOnly: boolean;
  availableOnly: boolean;
  maxPrice: number | null;
}

export const formerLocalServiceCategories = servicesCategories.filter((category) =>
  FORMER_LOCAL_SERVICE_CATEGORY_IDS.includes(category.id as FormerLocalServiceCategoryId),
);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeImage(payload: Record<string, unknown>): string | null {
  return listingImageSources(payload)[0] ?? null;
}

export function parseFormerLocalServiceRow(row: FormerLocalServiceRow): FormerLocalServiceCard | null {
  if (
    row.status !== 'active' ||
    !FORMER_LOCAL_SERVICE_CATEGORY_IDS.includes(row.category_id as FormerLocalServiceCategoryId) ||
    !string(row.id) ||
    !string(row.title)
  ) return null;

  const category = formerLocalServiceCategories.find((item) => item.id === row.category_id);
  if (!category) return null;

  const payload = record(row.payload);
  const location = record(payload.location);
  const price = Number(row.price);
  const availability = row.provider_availability_status;

  return {
    id: row.id,
    title: row.title,
    categoryId: row.category_id as FormerLocalServiceCategoryId,
    categoryName: category.name,
    categoryEmoji: category.emoji,
    subcategory: row.subcategory,
    city: string(location.city),
    area: string(location.area),
    price: Number.isFinite(price) && price > 0 ? price : null,
    priceUnit: string(row.price_unit),
    description: string(payload.description),
    providerName: string(payload.providerName),
    image: safeImage(payload),
    availability: availability === 'available' || availability === 'unavailable'
      ? availability
      : 'not_reported',
    verified: row.is_verified === true,
  };
}

export function filterFormerLocalServices(
  cards: readonly FormerLocalServiceCard[],
  filters: FormerLocalServiceFilters,
): FormerLocalServiceCard[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return cards.filter((card) => {
    if (filters.categoryId !== 'all' && card.categoryId !== filters.categoryId) return false;
    if (filters.verifiedOnly && !card.verified) return false;
    if (filters.availableOnly && card.availability !== 'available') return false;
    if (filters.maxPrice !== null && (card.price === null || card.price > filters.maxPrice)) return false;
    if (!query) return true;
    return [card.title, card.providerName, card.categoryName, card.subcategory, card.city, card.area]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query);
  });
}
