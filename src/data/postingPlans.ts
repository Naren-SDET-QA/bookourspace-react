import type { PostingPlan } from '../types/marketplace';

export const initialPostingPlans: PostingPlan[] = [
  {
    id: 'plan-basic',
    name: 'Starter Pay-Per-Post',
    price: 99,
    billingPeriod: 'one_time',
    listingLimit: 1,
    validityDays: 30,
    isFeaturedIncluded: false,
    priorityRank: 1,
    perks: [
      '1 Active Listing for 30 Days',
      'Direct Phone & WhatsApp enquiries',
      'Upload up to 5 photos',
      'Standard search ranking'
    ],
    isActive: true
  },
  {
    id: 'plan-pro',
    name: 'Pro Specialist Plan',
    price: 499,
    billingPeriod: 'monthly',
    listingLimit: 10,
    validityDays: 30,
    isFeaturedIncluded: true,
    priorityRank: 2,
    isPopular: true,
    perks: [
      '10 Active Listings across any category',
      '1 "Featured Pro" badge boost included',
      'Priority placement in search results',
      'Live customer chat & appointment scheduling',
      'Instant SMS & in-app alerts on inquiries'
    ],
    isActive: true
  },
  {
    id: 'plan-business',
    name: 'Business & Agency Hub',
    price: 1499,
    billingPeriod: 'monthly',
    listingLimit: 50,
    validityDays: 30,
    isFeaturedIncluded: true,
    priorityRank: 3,
    perks: [
      'Up to 50 active listings (Properties, Jobs, Vehicles)',
      '5 "Top-of-Category" sponsored boosts',
      'Official "Gold Verified Seller" badge',
      'Lead management CRM & CSV export',
      'Zero platform booking commission'
    ],
    isActive: true
  },
  {
    id: 'plan-enterprise',
    name: 'Enterprise Unlimited Annual',
    price: 9999,
    billingPeriod: 'yearly',
    listingLimit: 9999,
    validityDays: 365,
    isFeaturedIncluded: true,
    priorityRank: 4,
    perks: [
      'Unlimited listings all year round',
      'Permanent VIP featured banner rotation',
      'Dedicated Account Manager & phone onboarding',
      'Custom API & automated lead webhooks',
      'Priority Super Admin approval'
    ],
    isActive: true
  }
];

