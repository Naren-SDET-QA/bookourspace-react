import type { MarketplaceListing } from '../types/marketplace';
import { initialPGListings } from './pgHostelData';

/**
 * Demo PG inventory used only when demo fixtures are enabled. The eight curated
 * PG listings above are extended with distinct locality/price variants so every
 * PG style (Style 1 grid, Style 2 PG Dekho, Style 3 list) can show at least ten
 * cards on its first page.
 */
const variantSeeds = [
  { area: 'Gachibowli', title: 'Demo PG — Gachibowli Finance District Stay', price: 9500, sharing: '1 sharing', category: 'pg-professionals' },
  { area: 'KPHB / Kukatpally', title: 'Demo PG — KPHB Metro Students Home', price: 6500, sharing: '2 sharing', category: 'pg-students' },
  { area: 'Ameerpet', title: 'Demo PG — Ameerpet Coaching Hub Residence', price: 7200, sharing: '2 sharing', category: 'pg-competitive-exams' },
  { area: 'Banjara Hills', title: 'Demo PG — Banjara Hills Premium Co-Living', price: 12500, sharing: '1 sharing', category: 'pg-coliving' },
  { area: 'Secunderabad', title: 'Demo PG — Secunderabad Women Safe Stay', price: 8000, sharing: '3 sharing', category: 'pg-women-safe' },
  { area: 'Miyapur', title: 'Demo PG — Miyapur Budget Comfort Stay', price: 5500, sharing: '3 sharing', category: 'pg-budget' },
  { area: 'Madhapur / Hitech City', title: 'Demo PG — Hitech City Service Apartments', price: 18000, sharing: '1 sharing', category: 'pg-service-apartments' },
] as const;

const variants: MarketplaceListing[] = variantSeeds.map((seed, index) => {
  const base = initialPGListings[index % initialPGListings.length];
  const beds = 2 + index;
  return {
    ...base,
    id: `pg-demo-${index + 1}`,
    title: seed.title,
    titleTe: seed.title,
    titleHi: seed.title,
    categoryId: seed.category,
    subcategory: seed.sharing,
    subcategoryTe: seed.sharing,
    price: seed.price,
    priceUnit: '/month',
    status: 'active',
    isVerified: true,
    isFeatured: index < 2,
    providerName: `Demo PG Partner ${index + 1}`,
    providerId: `demo-pg-provider-${index + 1}`,
    location: {
      ...base.location,
      city: 'Hyderabad',
      area: seed.area,
      distanceKm: Number((1.1 + index * 0.4).toFixed(1)),
    },
    customFieldValues: {
      ...base.customFieldValues,
      roomTypesAvailable: seed.sharing,
      sharingHighlight: seed.sharing,
      foodIncluded: 'Yes',
      acType: 'AC',
      attachedWashroom: 'Yes',
      bedsAvailable: beds,
      genderPolicy: index === 4 ? 'Girls only' : 'Boys and girls',
      occupantType: index === 2 ? 'Students' : 'Working professionals',
    },
  };
});

export const DEMO_PG_LISTINGS: MarketplaceListing[] = [...initialPGListings, ...variants];
